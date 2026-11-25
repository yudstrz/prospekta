import { randomUUID, createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { dbWrite } from './db.js';
import { encryptApiKey, decryptApiKey, sanitizeAiErrorMessage } from './ai-crypto.js';

export const AI_PROVIDERS = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'auto',
    modelLabel: 'Otomatis Model Terbaru (Flash Latest)',
    fallbackModel: 'gemini-2.5-flash',
    models: [],
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/apikey',
    guide: 'Buka Google AI Studio -> Create API Key -> pilih project Google Cloud -> salin key berawalan AIza.',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI ChatGPT',
    defaultModel: 'auto',
    modelLabel: 'Otomatis Model Terbaru (GPT Latest)',
    fallbackModel: 'gpt-4o-mini',
    models: [],
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    guide: 'Buka OpenAI Platform -> API Keys -> Create new secret key -> salin key berawalan sk-.',
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    defaultModel: 'auto',
    modelLabel: 'Otomatis Model Terbaru (Claude Latest)',
    fallbackModel: 'claude-3-5-sonnet-latest',
    models: [],
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    guide: 'Buka Anthropic Console -> Settings -> API Keys -> Create Key -> salin key berawalan sk-ant-.',
  },
};

export function normalizeProvider(provider) {
  const p = String(provider || '').trim().toLowerCase();
  return AI_PROVIDERS[p] ? p : null;
}

const MODEL_CACHE = new Map();
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;

function pickBestGeminiModel(names = []) {
  const cleaned = names.map((n) => String(n || '').replace(/^models\//, ''));
  const numericFlash = cleaned
    .map((id) => {
      const m = id.match(/^gemini-(\d+(?:\.\d+)?)-flash$/);
      return m ? { id, ver: parseFloat(m[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.ver - a.ver);
  if (numericFlash.length > 0) return numericFlash[0].id;
  if (cleaned.includes('gemini-flash-latest')) return 'gemini-flash-latest';
  return AI_PROVIDERS.gemini.fallbackModel;
}

function pickBestOpenAiModel(models = []) {
  const ids = (Array.isArray(models) ? models : []).map((m) => m?.id || m).filter(Boolean);
  const scored = ids
    .map((id) => {
      if (id === 'gpt-4o' || id === 'gpt-4o-mini') return { id, ver: 4.05, mini: id.endsWith('-mini') ? 1 : 0 };
      const m = id.match(/^gpt-(\d+(?:\.\d+)?)(-mini)?$/);
      if (!m) return null;
      return { id, ver: parseFloat(m[1]), mini: m[2] ? 1 : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => (b.ver !== a.ver ? b.ver - a.ver : a.mini - b.mini));
  return scored[0]?.id || AI_PROVIDERS.openai.fallbackModel;
}

function pickBestClaudeModel(models = []) {
  const ids = (Array.isArray(models) ? models : []).map((m) => m?.id || m).filter(Boolean);
  const sonnet = ids.find((id) => /claude.*sonnet/i.test(id));
  if (sonnet) return sonnet;
  const anyClaude = ids.find((id) => /^claude-/i.test(id));
  return anyClaude || AI_PROVIDERS.claude.fallbackModel;
}

/**
 * Secara otomatis mendeteksi model terbaru yang aktif untuk API Key pengguna (di-cache 1 jam).
 */
export async function resolveLatestModel(provider, apiKey = null, forceRefresh = false) {
  const norm = normalizeProvider(provider);
  if (!norm) return null;
  const fallback = AI_PROVIDERS[norm].fallbackModel;
  if (!apiKey) return fallback;

  const cacheKey = createHash('sha256').update(`${norm}:${apiKey}`).digest('hex');
  const cached = MODEL_CACHE.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < MODEL_CACHE_TTL_MS) {
    return cached.model;
  }

  let picked = fallback;
  try {
    if (norm === 'gemini') {
      const ai = new GoogleGenAI({ apiKey });
      const pager = await ai.models.list({ config: { pageSize: 60 } });
      const names = [];
      for await (const m of pager) {
        if (m.name) names.push(m.name);
        if (names.length >= 60) break;
      }
      picked = pickBestGeminiModel(names);
    } else if (norm === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        picked = pickBestOpenAiModel(d?.data);
      }
    } else if (norm === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=20', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        picked = pickBestClaudeModel(d?.data);
      }
    }
  } catch (_) {}

  MODEL_CACHE.set(cacheKey, { model: picked, ts: Date.now() });
  return picked;
}

export async function resolveModelForProvider(provider, requestedModel = 'auto', apiKey = null) {
  const norm = normalizeProvider(provider);
  if (!norm) return null;
  const clean = String(requestedModel || '').trim();
  if (clean && clean !== 'auto') return clean;
  return resolveLatestModel(norm, apiKey);
}

let aiSchemaReady;
export async function ensureAiKeysSchema() {
  if (!aiSchemaReady) {
    aiSchemaReady = (async () => {
      try {
        await dbWrite.execute('SELECT 1 FROM user_ai_keys LIMIT 1;');
        return;
      } catch (_) {}

      await dbWrite.batch([
        `CREATE TABLE IF NOT EXISTS user_ai_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          encrypted_api_key TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          masked_key TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, provider)
        );`,
        `CREATE INDEX IF NOT EXISTS idx_user_ai_keys_user_active ON user_ai_keys(user_id, is_active);`,
      ], 'write');
    })().catch((err) => {
      aiSchemaReady = null;
      throw err;
    });
  }
  return aiSchemaReady;
}

/**
 * Menguji validitas API Key secara ringan tanpa mengembalikan atau mencatat API Key.
 */
export async function testProviderConnection(provider, rawKey) {
  const norm = normalizeProvider(provider);
  const apiKey = String(rawKey || '').trim();
  if (!norm) throw Object.assign(new Error('Provider AI tidak valid.'), { status: 400 });
  if (apiKey.length < 12) throw Object.assign(new Error('Format API Key terlalu pendek.'), { status: 400 });

  if (norm === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey });
      let targetModel = await resolveLatestModel('gemini', apiKey, true);
      try {
        await ai.models.generateContent({
          model: targetModel,
          contents: 'Balas dengan satu kata: OK',
          config: { maxOutputTokens: 4, temperature: 0 },
        });
      } catch (innerErr) {
        if (targetModel !== AI_PROVIDERS.gemini.fallbackModel) {
          targetModel = AI_PROVIDERS.gemini.fallbackModel;
          await ai.models.generateContent({
            model: targetModel,
            contents: 'Balas dengan satu kata: OK',
            config: { maxOutputTokens: 4, temperature: 0 },
          });
        } else {
          throw innerErr;
        }
      }
      return { ok: true, model: targetModel };
    } catch (err) {
      const msg = sanitizeAiErrorMessage(err?.message || '');
      throw Object.assign(new Error(`Validasi Gemini gagal: ${msg}`), { status: 400 });
    }
  }

  if (norm === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = sanitizeAiErrorMessage(errData?.error?.message || `HTTP ${res.status}`);
      throw Object.assign(new Error(`Validasi OpenAI gagal: ${msg}`), { status: 400 });
    }
    const d = await res.json().catch(() => ({}));
    return { ok: true, model: pickBestOpenAiModel(d?.data) };
  }

  // Claude (Anthropic): cek endpoint /v1/models (gratis), fallback ke /v1/messages ringan jika perlu
  const res = await fetch('https://api.anthropic.com/v1/models?limit=20', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (res.ok) {
    const d = await res.json().catch(() => ({}));
    return { ok: true, model: pickBestClaudeModel(d?.data) };
  }

  if (res.status === 404) {
    const msgRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'OK' }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (msgRes.ok) return { ok: true, model: 'claude-3-5-haiku-latest' };
    const errData = await msgRes.json().catch(() => ({}));
    throw Object.assign(
      new Error(`Validasi Claude gagal: ${sanitizeAiErrorMessage(errData?.error?.message || `HTTP ${msgRes.status}`)}`),
      { status: 400 }
    );
  }

  const errData = await res.json().catch(() => ({}));
  throw Object.assign(
    new Error(`Validasi Claude gagal: ${sanitizeAiErrorMessage(errData?.error?.message || `HTTP ${res.status}`)}`),
    { status: 400 }
  );
}

/**
 * Mengembalikan daftar provider tersimpan untuk user tertentu (tanpa rahasia / ciphertext).
 */
export async function listUserAiKeys(userId) {
  if (!userId) return [];
  await ensureAiKeysSchema();
  const res = await dbWrite.execute({
    sql: `SELECT id, provider, masked_key, is_active, created_at, updated_at
          FROM user_ai_keys
          WHERE user_id = ?
          ORDER BY is_active DESC, updated_at DESC;`,
    args: [userId],
  });
  return (res.rows || []).map((row) => ({
    id: row.id,
    provider: row.provider,
    masked_key: row.masked_key,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Menyimpan / memperbarui API key terenkripsi untuk user_id tertentu dan mengaktifkannya.
 */
export async function saveUserAiKey({ userId, provider, apiKey }) {
  const norm = normalizeProvider(provider);
  if (!userId) throw Object.assign(new Error('Sesi pengguna tidak valid.'), { status: 401 });
  if (!norm) throw Object.assign(new Error('Provider AI tidak valid.'), { status: 400 });

  await ensureAiKeysSchema();
  const aad = `${userId}:${norm}`;
  const { encrypted_api_key, iv, auth_tag, masked_key } = encryptApiKey(apiKey, aad);
  const nowIso = new Date().toISOString();
  const id = `aik_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  await dbWrite.batch([
    {
      sql: `UPDATE user_ai_keys SET is_active = 0, updated_at = ? WHERE user_id = ? AND provider != ?;`,
      args: [nowIso, userId, norm],
    },
    {
      sql: `INSERT INTO user_ai_keys (
              id, user_id, provider, encrypted_api_key, iv, auth_tag, masked_key, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
              encrypted_api_key = excluded.encrypted_api_key,
              iv = excluded.iv,
              auth_tag = excluded.auth_tag,
              masked_key = excluded.masked_key,
              is_active = 1,
              updated_at = excluded.updated_at;`,
      args: [id, userId, norm, encrypted_api_key, iv, auth_tag, masked_key, nowIso, nowIso],
    },
  ], 'write');

  return listUserAiKeys(userId);
}

/**
 * Mengaktifkan provider yang sudah tersimpan milik user_id tanpa mengubah key.
 */
export async function setActiveUserAiProvider({ userId, provider }) {
  const norm = normalizeProvider(provider);
  if (!userId) throw Object.assign(new Error('Sesi pengguna tidak valid.'), { status: 401 });
  if (!norm) throw Object.assign(new Error('Provider AI tidak valid.'), { status: 400 });

  await ensureAiKeysSchema();
  const check = await dbWrite.execute({
    sql: `SELECT id FROM user_ai_keys WHERE user_id = ? AND provider = ? LIMIT 1;`,
    args: [userId, norm],
  });
  if (!check.rows?.[0]) {
    throw Object.assign(new Error(`API Key untuk ${AI_PROVIDERS[norm].name} belum disimpan.`), { status: 404 });
  }

  const nowIso = new Date().toISOString();
  await dbWrite.batch([
    { sql: `UPDATE user_ai_keys SET is_active = 0, updated_at = ? WHERE user_id = ?;`, args: [nowIso, userId] },
    { sql: `UPDATE user_ai_keys SET is_active = 1, updated_at = ? WHERE user_id = ? AND provider = ?;`, args: [nowIso, userId, norm] },
  ], 'write');

  return listUserAiKeys(userId);
}

/**
 * Menghapus API Key milik user_id untuk provider tertentu dan menjaga fallback aktif bila masih ada key lain.
 */
export async function deleteUserAiKey({ userId, provider }) {
  const norm = normalizeProvider(provider);
  if (!userId) throw Object.assign(new Error('Sesi pengguna tidak valid.'), { status: 401 });
  if (!norm) throw Object.assign(new Error('Provider AI tidak valid.'), { status: 400 });

  await ensureAiKeysSchema();
  await dbWrite.execute({
    sql: `DELETE FROM user_ai_keys WHERE user_id = ? AND provider = ?;`,
    args: [userId, norm],
  });

  const remaining = await listUserAiKeys(userId);
  if (remaining.length > 0 && !remaining.some((k) => k.is_active)) {
    await dbWrite.execute({
      sql: `UPDATE user_ai_keys SET is_active = 1, updated_at = ? WHERE user_id = ? AND provider = ?;`,
      args: [new Date().toISOString(), userId, remaining[0].provider],
    });
    return listUserAiKeys(userId);
  }
  return remaining;
}

/**
 * Mengambil & mendekripsi API Key aktif milik user di memori server saja.
 */
export async function getDecryptedActiveKey(userId, preferredProvider = null) {
  if (!userId) return null;
  await ensureAiKeysSchema();

  const pref = preferredProvider ? normalizeProvider(preferredProvider) : null;
  const sql = pref
    ? `SELECT provider, encrypted_api_key, iv, auth_tag, masked_key, is_active
       FROM user_ai_keys WHERE user_id = ? AND provider = ? LIMIT 1;`
    : `SELECT provider, encrypted_api_key, iv, auth_tag, masked_key, is_active
       FROM user_ai_keys WHERE user_id = ? ORDER BY is_active DESC, updated_at DESC LIMIT 1;`;

  const res = await dbWrite.execute({
    sql,
    args: pref ? [userId, pref] : [userId],
  });

  const row = res.rows?.[0];
  if (!row) return null;

  const aad = `${userId}:${row.provider}`;
  let apiKey;
  try {
    apiKey = decryptApiKey(row, aad);
  } catch {
    // Kompatibilitas bila ada baris lama tanpa AAD
    apiKey = decryptApiKey(row, null);
  }

  return {
    provider: row.provider,
    apiKey,
    maskedKey: row.masked_key,
    isActive: Number(row.is_active) === 1,
  };
}
