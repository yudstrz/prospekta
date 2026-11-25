import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

export type AiProvider = 'agnes' | 'gemini' | 'openai' | 'claude';
export type AiRole = 'admin' | 'user';
export type AiConfigMode = 'latest' | 'pinned';

export interface ProviderEnvConfig {
  id: AiProvider;
  displayName: string;
  latestDefault: string;
  pinnedDefault: string;
  adminModel?: string;
  userModel?: string;
  fallbackModel: string;
  rollingAlias: string;
  modelLine?: string;
}

export interface ModelUsageLog {
  provider: AiProvider;
  role: AiRole;
  mode: AiConfigMode;
  configuredModel: string;
  resolvedModel: string;
  actualModel: string;
  operation: string;
  fallbackUsed: boolean;
  durationMs?: number;
}

const CLAUDE_AUTO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam
const GENERAL_MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 jam
const RUNTIME_MODEL_CACHE = new Map<string, { model: string; ts: number }>();

const envStr = (key: string): string => (process.env[key] || '').trim();

export function normalizeProvider(provider?: string | null): AiProvider | null {
  const norm = String(provider || '').trim().toLowerCase();
  if (norm === 'agnes' || norm === 'gemini' || norm === 'openai' || norm === 'claude') return norm;
  return null;
}

export function normalizeAiRole(role?: string | null): AiRole {
  const norm = String(role || '').trim().toLowerCase();
  return norm === 'admin' || norm === 'superadmin' ? 'admin' : 'user';
}

export function getAiEnvironmentMode(): AiConfigMode {
  const explicit = envStr('AI_MODEL_MODE').toLowerCase();
  if (explicit === 'pinned' || explicit === 'latest') return explicit;
  const runtimeEnv = (envStr('VERCEL_ENV') || envStr('NODE_ENV')).toLowerCase();
  return runtimeEnv === 'production' ? 'pinned' : 'latest';
}

export function getAgnesEnvConfig() {
  const agentKey = envStr('AGENT_API_KEY') || envStr('FLASH_MODEL_API_KEY') || '';
  const agentBaseUrl = envStr('AGENT_API_BASE_URL') || '';
  const agentModel = envStr('AGENT_MODEL_ID') || envStr('GEMINI_MODEL') || 'gemini-flash-latest';
  const geminiKey = envStr('GEMINI_API_KEY') || '';
  const openaiKey = envStr('OPENAI_API_KEY') || '';
  const claudeKey = envStr('ANTHROPIC_API_KEY') || '';
  const configured = Boolean((agentKey && agentBaseUrl) || geminiKey || openaiKey || claudeKey);
  return { configured, agentKey, agentBaseUrl, agentModel, geminiKey, openaiKey, claudeKey };
}

export function getAiConfig(): {
  defaultProvider: AiProvider;
  mode: AiConfigMode;
  providers: Record<AiProvider, ProviderEnvConfig>;
} {
  const defaultProvider = normalizeProvider(envStr('AI_PROVIDER')) || 'agnes';
  const mode = getAiEnvironmentMode();

  return {
    defaultProvider,
    mode,
    providers: {
      agnes: {
        id: 'agnes',
        displayName: 'Agnes AI (Bawaan Platform)',
        latestDefault: envStr('AGENT_MODEL_ID') || envStr('GEMINI_MODEL') || 'gemini-flash-latest',
        pinnedDefault: envStr('AGENT_MODEL_ID') || envStr('GEMINI_MODEL_PINNED') || 'gemini-flash-latest',
        adminModel: envStr('AGENT_ADMIN_MODEL') || undefined,
        userModel: envStr('AGENT_USER_MODEL') || undefined,
        fallbackModel: envStr('GEMINI_FALLBACK_MODEL') || 'gemini-flash-latest',
        rollingAlias: 'gemini-flash-latest',
      },
      gemini: {
        id: 'gemini',
        displayName: 'Google Gemini',
        latestDefault: envStr('GEMINI_MODEL') || 'gemini-flash-latest',
        pinnedDefault: envStr('GEMINI_MODEL_PINNED') || envStr('GEMINI_MODEL') || 'gemini-flash-latest',
        adminModel: envStr('GEMINI_ADMIN_MODEL') || undefined,
        userModel: envStr('GEMINI_USER_MODEL') || undefined,
        fallbackModel: envStr('GEMINI_FALLBACK_MODEL') || 'gemini-flash-latest',
        rollingAlias: 'gemini-flash-latest',
      },
      openai: {
        id: 'openai',
        displayName: 'OpenAI ChatGPT',
        latestDefault: envStr('OPENAI_MODEL') || 'chat-latest',
        pinnedDefault: envStr('OPENAI_MODEL_PINNED') || envStr('OPENAI_MODEL') || 'gpt-4o-mini',
        adminModel: envStr('OPENAI_ADMIN_MODEL') || undefined,
        userModel: envStr('OPENAI_USER_MODEL') || undefined,
        fallbackModel: envStr('OPENAI_FALLBACK_MODEL') || 'gpt-4o-mini',
        rollingAlias: 'gpt-4o-mini',
      },
      claude: {
        id: 'claude',
        displayName: 'Anthropic Claude',
        latestDefault: envStr('CLAUDE_MODEL') || 'auto',
        pinnedDefault: envStr('CLAUDE_MODEL_PINNED') || envStr('CLAUDE_MODEL') || 'claude-sonnet-4-0',
        adminModel: envStr('CLAUDE_ADMIN_MODEL') || undefined,
        userModel: envStr('CLAUDE_USER_MODEL') || undefined,
        fallbackModel: envStr('CLAUDE_FALLBACK_MODEL') || 'claude-3-5-haiku-latest',
        rollingAlias: 'claude-sonnet-4-0',
        modelLine: (envStr('CLAUDE_MODEL_LINE') || 'sonnet').toLowerCase(),
      },
    },
  };
}

/**
 * Baca API key server dari environment variable saja (dilarang hardcode / dikirim ke client).
 */
export function getServerProviderKey(provider?: AiProvider | string | null): string | null {
  const norm = normalizeProvider(provider) || getAiConfig().defaultProvider;
  if (norm === 'agnes') {
    const ag = getAgnesEnvConfig();
    return (ag.agentBaseUrl ? ag.agentKey : '') || ag.geminiKey || ag.openaiKey || ag.claudeKey || null;
  }
  if (norm === 'gemini') return envStr('GEMINI_API_KEY') || null;
  if (norm === 'openai') return envStr('OPENAI_API_KEY') || null;
  if (norm === 'claude') return envStr('ANTHROPIC_API_KEY') || null;
  return null;
}

/**
 * Mengembalikan nama model yang aktif untuk provider & role tertentu berdasarkan env/mode.
 */
export function getModel(
  provider?: AiProvider | string | null,
  role?: AiRole | string | null
): string {
  const cfg = getAiConfig();
  const normProvider = normalizeProvider(provider) || cfg.defaultProvider;
  const normRole = normalizeAiRole(role);
  const pCfg = cfg.providers[normProvider];

  if (normRole === 'admin' && pCfg.adminModel) return pCfg.adminModel;
  if (normRole === 'user' && pCfg.userModel) return pCfg.userModel;

  return cfg.mode === 'pinned' ? pCfg.pinnedDefault : pCfg.latestDefault;
}

export function getFallbackModel(provider?: AiProvider | string | null): string {
  const cfg = getAiConfig();
  const norm = normalizeProvider(provider) || cfg.defaultProvider;
  return cfg.providers[norm].fallbackModel;
}

export function getFallbackCandidates(
  provider?: AiProvider | string | null,
  primaryModel?: string
): string[] {
  const cfg = getAiConfig();
  const norm = normalizeProvider(provider) || cfg.defaultProvider;
  const pCfg = cfg.providers[norm];
  const raw = [pCfg.fallbackModel, pCfg.rollingAlias];
  return Array.from(new Set(raw.filter((m) => m && m !== 'auto' && m !== 'chat-latest' && m !== primaryModel)));
}

function makeCacheKey(provider: AiProvider, line: string, apiKey: string): string {
  const keyDigest = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  return `${provider}:${line}:${keyDigest}`;
}

/**
 * Ambil model Claude terbaru via GET /v1/models, filter `line` (mis. "sonnet"), lalu cache 24 jam.
 */
export async function resolveClaudeAutoModel({
  apiKey,
  line,
  forceRefresh = false,
}: {
  apiKey: string;
  line?: string;
  forceRefresh?: boolean;
}): Promise<string> {
  const cfg = getAiConfig().providers.claude;
  const targetLine = (line || cfg.modelLine || 'sonnet').toLowerCase();
  const cacheKey = makeCacheKey('claude', targetLine, apiKey);
  const cached = RUNTIME_MODEL_CACHE.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < CLAUDE_AUTO_CACHE_TTL_MS) {
    return cached.model;
  }

  let picked = cfg.rollingAlias;
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=50', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const payload = (await res.json().catch(() => ({}))) as {
        data?: Array<{ id?: string; line?: string; display_name?: string; created_at?: string }>;
      };
      const rows = Array.isArray(payload.data) ? payload.data : [];
      const lineMatched = rows.filter((m) => {
        if (m.line && m.line.toLowerCase() === targetLine) return true;
        return `${m.id || ''} ${m.display_name || ''}`.toLowerCase().includes(targetLine);
      });
      const pool = lineMatched.length > 0 ? lineMatched : rows.filter((m) => /^claude-/i.test(m.id || ''));
      pool.sort((a, b) => Date.parse(b.created_at || '0') - Date.parse(a.created_at || '0'));
      if (pool[0]?.id) picked = pool[0].id;
    }
  } catch (_) {}

  RUNTIME_MODEL_CACHE.set(cacheKey, { model: picked, ts: Date.now() });
  return picked;
}

export function pickBestGeminiModel(names: string[] = []): string {
  const fallback = getAiConfig().providers.gemini.rollingAlias;
  const cleaned = names.map((n) => String(n || '').replace(/^models\//, '').trim()).filter(Boolean);

  // Prioritaskan versi numerik terbaru (mis. gemini-3.8-flash) di atas versi usang < 3.0
  const numericFlash = cleaned
    .map((id) => {
      const m = id.match(/^gemini-(\d+(?:\.\d+)?)-flash$/);
      return m ? { id, ver: parseFloat(m[1]) } : null;
    })
    .filter((item): item is { id: string; ver: number } => Boolean(item) && item!.ver >= 3.0)
    .sort((a, b) => b.ver - a.ver);

  if (numericFlash.length > 0) return numericFlash[0].id;
  if (cleaned.includes('gemini-flash-latest')) return 'gemini-flash-latest';

  const anyFlash = cleaned
    .map((id) => {
      const m = id.match(/^gemini-(\d+(?:\.\d+)?)-flash/);
      return m ? { id, ver: parseFloat(m[1]) } : null;
    })
    .filter((item): item is { id: string; ver: number } => Boolean(item) && item!.ver >= 2.5)
    .sort((a, b) => b.ver - a.ver);

  return anyFlash[0]?.id || fallback;
}

export function pickBestOpenAiModel(models: Array<{ id?: string } | string> = []): string {
  const fallback = getAiConfig().providers.openai.fallbackModel;
  const ids = (Array.isArray(models) ? models : []).map((m) => (typeof m === 'string' ? m : m?.id)).filter(Boolean) as string[];
  const scored = ids
    .map((id) => {
      if (id === 'gpt-4o' || id === 'gpt-4o-mini') return { id, ver: 4.05, mini: id.endsWith('-mini') ? 1 : 0 };
      const m = id.match(/^gpt-(\d+(?:\.\d+)?)(-mini)?$/);
      if (!m) return null;
      return { id, ver: parseFloat(m[1]), mini: m[2] ? 1 : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.ver !== a!.ver ? b!.ver - a!.ver : a!.mini - b!.mini));
  return scored[0]?.id || fallback;
}

/**
 * Resolusi runtime model: memakai `getModel(provider, role)` (env/pinned/latest),
 * dan jika bernilai `auto` / `chat-latest`, memanggil Models API dengan cache 24 jam.
 */
export async function resolveRuntimeModel({
  provider,
  role = 'user',
  apiKey = null,
  requestedModel = null,
  forceRefresh = false,
}: {
  provider: AiProvider | string;
  role?: AiRole | string | null;
  apiKey?: string | null;
  requestedModel?: string | null;
  forceRefresh?: boolean;
}): Promise<string> {
  const norm = normalizeProvider(provider) || getAiConfig().defaultProvider;
  const normRole = normalizeAiRole(role);
  const req = String(requestedModel || '').trim();
  const hasExplicitEnv = Boolean(
    envStr(`${norm.toUpperCase()}_${normRole.toUpperCase()}_MODEL`)
    || envStr(`${norm.toUpperCase()}_MODEL_PINNED`)
    || envStr(`${norm.toUpperCase()}_MODEL`)
  );
  const configured = req && req !== 'auto'
    ? req
    : (req === 'auto' && !hasExplicitEnv && apiKey ? 'auto' : getModel(norm, normRole));
  const key = apiKey || getServerProviderKey(norm);

  if (norm === 'claude' && configured === 'auto') {
    if (!key) return getAiConfig().providers.claude.rollingAlias;
    return resolveClaudeAutoModel({ apiKey: key, forceRefresh });
  }

  const isDynamicAlias = configured === 'auto' || (norm === 'openai' && configured === 'chat-latest');
  if (!isDynamicAlias) return configured;
  if (!key) return getAiConfig().providers[norm].rollingAlias;

  const cacheKey = makeCacheKey(norm, `runtime_${normRole}`, key);
  const cached = RUNTIME_MODEL_CACHE.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.ts < GENERAL_MODEL_CACHE_TTL_MS) {
    return cached.model;
  }

  let picked = getAiConfig().providers[norm].rollingAlias;
  try {
    if (norm === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: key });
      const pager = await ai.models.list({ config: { pageSize: 60 } });
      const names: string[] = [];
      for await (const m of pager) {
        if (m.name) names.push(m.name);
        if (names.length >= 60) break;
      }
      picked = pickBestGeminiModel(names);
    } else if (norm === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const d = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
        picked = pickBestOpenAiModel(d.data || []);
      }
    }
  } catch (_) {}

  RUNTIME_MODEL_CACHE.set(cacheKey, { model: picked, ts: Date.now() });
  return picked;
}

/**
 * Hilangkan parameter temperature pada model OpenAI generasi baru (gpt-5, o1, o3, o4)
 * yang hanya menerima nilai default (1).
 */
export function supportsCustomTemperature(provider: AiProvider | string, model: string): boolean {
  if (normalizeProvider(provider) !== 'openai') return true;
  return !/^(gpt-5|o1|o3|o4|computer-use)/i.test(String(model || '').trim());
}

export function buildOpenAiChatBody<T extends Record<string, unknown>>(
  baseBody: T,
  temperature?: number
): T & { temperature?: number } {
  const model = String(baseBody.model || '');
  if (temperature === undefined || !supportsCustomTemperature('openai', model)) {
    const clean = { ...baseBody };
    delete (clean as Record<string, unknown>).temperature;
    return clean;
  }
  return { ...baseBody, temperature };
}

/**
 * Panggil OpenAI /v1/chat/completions dengan proteksi otomatis bila model menolak `temperature`.
 */
export async function fetchOpenAiChatSafe({
  apiKey,
  body,
  timeoutMs = 45000,
  endpoint = 'https://api.openai.com/v1/chat/completions',
}: {
  apiKey: string;
  body: Record<string, unknown> & { model: string; temperature?: number };
  timeoutMs?: number;
  endpoint?: string;
}) {
  const send = async (payload: Record<string, unknown>) =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

  let safePayload = buildOpenAiChatBody(body, body.temperature);
  let res = await send(safePayload);

  if (!res.ok && res.status === 400 && 'temperature' in safePayload) {
    const cloned = res.clone();
    const errText = await cloned.text().catch(() => '');
    if (/temperature|default\s*\(1\)/i.test(errText)) {
      const stripped = { ...safePayload };
      delete stripped.temperature;
      res = await send(stripped);
    }
  }

  return res;
}

export function isRecoverableModelError(err: unknown): boolean {
  const anyErr = err as { status?: number; code?: number; message?: string };
  const status = Number(anyErr?.status || anyErr?.code || 0);
  if (status === 404 || status === 410 || status === 429 || status === 503) return true;
  const msg = String(anyErr?.message || err || '');
  return /404|NOT_FOUND|not found|no longer available|deprecated|decommissioned|does not exist|model_not_found|rate limit|quota|resource_exhausted|429/i.test(msg);
}

export function logResolvedModelUsage(entry: ModelUsageLog): void {
  console.info('[AI Model]', JSON.stringify({
    ts: new Date().toISOString(),
    provider: entry.provider,
    role: entry.role,
    mode: entry.mode,
    configured: entry.configuredModel,
    resolved: entry.resolvedModel,
    actual: entry.actualModel,
    operation: entry.operation,
    fallbackUsed: entry.fallbackUsed,
    ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
  }));
}

/**
 * Jalankan request AI dengan fallback otomatis ke model cadangan dari env jika model utama 404/deprecated/rate-limit,
 * dan catat model riil yang dipakai pada setiap request.
 */
export async function executeWithModelFallback<T>({
  provider,
  role = 'user',
  primaryModel,
  extraCandidates = [],
  operation = 'ai_request',
  run,
}: {
  provider: AiProvider | string;
  role?: AiRole | string | null;
  primaryModel: string;
  extraCandidates?: string[];
  operation?: string;
  run: (model: string) => Promise<{ result: T; actualModel?: string | null }>;
}): Promise<{ result: T; usedModel: string; actualModel: string; fallbackUsed: boolean }> {
  const cfg = getAiConfig();
  const normProvider = normalizeProvider(provider) || cfg.defaultProvider;
  const normRole = normalizeAiRole(role);
  const configuredModel = getModel(normProvider, normRole);
  const fallbacks = [...extraCandidates, ...getFallbackCandidates(normProvider, primaryModel)];
  const candidates = Array.from(new Set([primaryModel, ...fallbacks].filter(Boolean)));

  let lastErr: unknown = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const started = Date.now();
    try {
      const { result, actualModel } = await run(candidate);
      const resolvedActual = actualModel || candidate;
      const fallbackUsed = i > 0;
      if (fallbackUsed) {
        console.warn(`[AI Fallback] ${normProvider} primary="${primaryModel}" -> active="${resolvedActual}"`);
      }
      logResolvedModelUsage({
        provider: normProvider,
        role: normRole,
        mode: cfg.mode,
        configuredModel,
        resolvedModel: candidate,
        actualModel: resolvedActual,
        operation,
        fallbackUsed,
        durationMs: Date.now() - started,
      });
      return { result, usedModel: candidate, actualModel: resolvedActual, fallbackUsed };
    } catch (err) {
      lastErr = err;
      if (i < candidates.length - 1 && isRecoverableModelError(err)) {
        console.warn(`[AI Fallback] ${normProvider} candidate="${candidate}" gagal, mencoba cadangan berikutnya...`);
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error(`Semua kandidat model ${normProvider} gagal dijalankan.`);
}
