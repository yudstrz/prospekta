import { randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { dbWrite } from './db.js';
import { encryptApiKey, decryptApiKey, sanitizeAiErrorMessage } from './ai-crypto.js';
import {
  normalizeProvider,
  getAiConfig,
  getAgnesEnvConfig,
  getModel,
  getFallbackModel,
  resolveRuntimeModel,
  resolveClaudeAutoModel,
  pickBestGeminiModel,
  pickBestOpenAiModel,
  executeWithModelFallback,
} from './ai-config';

export { normalizeProvider, getModel, getFallbackModel, resolveRuntimeModel };

export function hasAgnesPlatformEngine() {
  return getAgnesEnvConfig().configured;
}

const envCfg = getAiConfig();

export const AI_PROVIDERS = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'auto',
    modelLabel: 'Otomatis Model Terbaru (Flash Latest)',
    fallbackModel: envCfg.providers.gemini.fallbackModel,
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
    fallbackModel: envCfg.providers.openai.fallbackModel,
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
    fallbackModel: envCfg.providers.claude.fallbackModel,
    models: [],
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    guide: 'Buka Anthropic Console -> Settings -> API Keys -> Create Key -> salin key berawalan sk-ant-.',
  },
};

/**
 * Secara otomatis mendeteksi model terbaru yang aktif (cache 24 jam di ai-config.ts).
 */
export async function resolveLatestModel(provider, apiKey = null, forceRefresh = false, role = 'user') {
  return resolveRuntimeModel({
    provider,
    role,
    apiKey,
    requestedModel: 'auto',
    forceRefresh,
  });
}

export async function resolveModelForProvider(provider, requestedModel = 'auto', apiKey = null, role = 'user') {
  const norm = normalizeProvider(provider);
  if (!norm) return null;
  return resolveRuntimeModel({
    provider: norm,
    role,
    apiKey,
    requestedModel: requestedModel || 'auto',
  });
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
export async function testProviderConnection(provider, rawKey, role = 'user') {
  const norm = normalizeProvider(provider);
  const apiKey = String(rawKey || '').trim();
  if (!norm) throw Object.assign(new Error('Provider AI tidak valid.'), { status: 400 });
  if (apiKey.length < 12) throw Object.assign(new Error('Format API Key terlalu pendek.'), { status: 400 });

  if (norm === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const listedFlash = [];
      try {
        const pager = await ai.models.list({ config: { pageSize: 60 } });
        for await (const m of pager) {
          const id = String(m.name || '').replace(/^models\//, '').trim();
          if (id && /flash/i.test(id) && !listedFlash.includes(id)) listedFlash.push(id);
          if (listedFlash.length >= 25) break;
        }
      } catch (_) {}

      const primaryModel = listedFlash.length > 0
        ? pickBestGeminiModel(listedFlash)
        : await resolveRuntimeModel({ provider: 'gemini', role, apiKey, requestedModel: 'auto', forceRefresh: true });
      const extraCandidates = listedFlash
        .filter((id) => /^gemini-(?:[3-9]|flash-latest)/i.test(id) && id !== primaryModel)
        .slice(0, 3);

      const exec = await executeWithModelFallback({
        provider: 'gemini',
        role,
        primaryModel,
        extraCandidates: [...extraCandidates, 'gemini-flash-latest'],
        operation: 'key_validation',
        run: async (model) => {
          const resp = await ai.models.generateContent({
            model,
            contents: 'Balas dengan satu kata: OK',
            config: { maxOutputTokens: 8 },
          });
          return { result: resp, actualModel: resp?.modelVersion || model };
        },
      });
      return { ok: true, model: exec.actualModel || exec.usedModel };
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

  // Claude (Anthropic): cek endpoint /v1/models via line filter, fallback ke env fallback via /v1/messages jika perlu
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=50', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const model = await resolveClaudeAutoModel({ apiKey, forceRefresh: true });
      return { ok: true, model };
    }

    if (res.status === 404) {
      const fallbackModel = getFallbackModel('claude');
      const msgRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: fallbackModel,
          max_tokens: 4,
          messages: [{ role: 'user', content: 'OK' }],
        }),
        signal: AbortSignal.timeout(12000),
      });
      const msgData = await msgRes.json().catch(() => ({}));
      if (msgRes.ok) return { ok: true, model: msgData?.model || fallbackModel };
      throw new Error(msgData?.error?.message || `HTTP ${msgRes.status}`);
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `HTTP ${res.status}`);
  } catch (err) {
    throw Object.assign(
      new Error(`Validasi Claude gagal: ${sanitizeAiErrorMessage(err?.message || 'Gagal memvalidasi key Claude.')}`),
      { status: 400 }
    );
  }
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
 * Mengaktifkan provider pilihan user ('agnes' untuk platform .env, atau BYOK tersimpan milik user_id).
 */
export async function setActiveUserAiProvider({ userId, provider }) {
  const norm = normalizeProvider(provider);
  if (!userId) throw Object.assign(new Error('Sesi pengguna tidak valid.'), { status: 401 });
  if (!norm) throw Object.assign(new Error('Provider AI tidak valid.'), { status: 400 });

  await ensureAiKeysSchema();
  const nowIso = new Date().toISOString();

  if (norm === 'agnes') {
    if (!hasAgnesPlatformEngine()) {
      throw Object.assign(new Error('Mesin platform Agnes AI belum dikonfigurasi pada environment server.'), { status: 400 });
    }
    await dbWrite.execute({
      sql: `UPDATE user_ai_keys SET is_active = 0, updated_at = ? WHERE user_id = ?;`,
      args: [nowIso, userId],
    });
    return listUserAiKeys(userId);
  }

  const check = await dbWrite.execute({
    sql: `SELECT id FROM user_ai_keys WHERE user_id = ? AND provider = ? LIMIT 1;`,
    args: [userId, norm],
  });
  if (!check.rows?.[0]) {
    throw Object.assign(new Error(`API Key untuk ${AI_PROVIDERS[norm].name} belum disimpan.`), { status: 404 });
  }

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
