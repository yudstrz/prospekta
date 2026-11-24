import { db, dbWrite } from './db.js';
import { encodingForModel } from 'js-tiktoken';

// Official Pricing per 1M tokens (USD)
const PRICING = {
  'openai': {
    'gpt-4o-mini': { promptPerMillion: 0.150, completionPerMillion: 0.600 },
    'gpt-4o': { promptPerMillion: 2.500, completionPerMillion: 10.000 },
    default: { promptPerMillion: 0.150, completionPerMillion: 0.600 }
  },
  'gemini': {
    'gemini-2.5-flash': { promptPerMillion: 0.075, completionPerMillion: 0.300 },
    'gemini-1.5-flash': { promptPerMillion: 0.075, completionPerMillion: 0.300 },
    default: { promptPerMillion: 0.075, completionPerMillion: 0.300 }
  }
};

let tableInitialized = false;

/**
 * Pastikan tabel token_usage_logs tersedia di database
 */
export async function ensureTokenTable() {
  if (tableInitialized) return;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS token_usage_logs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        operation TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Migrasi defensif jika kolom estimated_cost_usd belum ada pada tabel lama
    await db.execute(`ALTER TABLE token_usage_logs ADD COLUMN estimated_cost_usd REAL NOT NULL DEFAULT 0;`).catch(() => {});
    await db.execute(`ALTER TABLE token_usage_logs ADD COLUMN module TEXT DEFAULT 'llm';`).catch(() => {});
    tableInitialized = true;
  } catch (err) {
    console.warn('[Tokens] Warning ensuring token_usage_logs table:', err.message);
  }
}

/**
 * Hitung estimasi biaya dalam USD berdasarkan provider, model, dan token
 */
export function calculateTokenCost(provider, model, promptTokens, completionTokens) {
  const providerPricing = PRICING[provider] || PRICING.openai;
  const rates = providerPricing[model] || providerPricing.default;
  const promptCost = (promptTokens / 1_000_000) * rates.promptPerMillion;
  const completionCost = (completionTokens / 1_000_000) * rates.completionPerMillion;
  return Number((promptCost + completionCost).toFixed(6));
}

let cachedEncoder = null;
function getEncoder() {
  if (!cachedEncoder) {
    try {
      cachedEncoder = encodingForModel('gpt-4o-mini');
    } catch (_) {
      cachedEncoder = null;
    }
  }
  return cachedEncoder;
}

/**
 * Hitung jumlah token secara akurat menggunakan library resmi tiktoken (OpenAI)
 */
export function countOpenAiTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch (_) {
      return Math.ceil(text.length / 4);
    }
  }
  return Math.ceil(text.length / 4);
}

/**
 * Catat transaksi token ke database Turso
 */
export async function recordTokenUsage({
  provider = 'openai',
  model = 'gpt-4o-mini',
  operation = 'general_llm',
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0
}) {
  await ensureTokenTable();
  const actualTotal = totalTokens || (promptTokens + completionTokens);
  const costUsd = calculateTokenCost(provider, model, promptTokens, completionTokens);
  const id = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    await dbWrite.execute({
      sql: `
        INSERT INTO token_usage_logs (
          id, module, provider, model, operation, prompt_tokens,
          completion_tokens, total_tokens, estimated_cost_usd, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
      `,
      args: [id, operation || 'llm', provider, model, operation, promptTokens, completionTokens, actualTotal, costUsd]
    });
    // Invalidate summary cache on new transaction
    tokenSummaryCache = null;
  } catch (err) {
    console.warn('[Tokens] Failed to log token usage:', err.message);
  }
  return { id, promptTokens, completionTokens, totalTokens: actualTotal, costUsd };
}

let tokenSummaryCache = null;
let tokenSummaryTimestamp = 0;

/**
 * Ambil rekap total pemakaian token dan estimasi biaya (OpenAI & Gemini)
 */
export async function getTokenSummary() {
  const now = Date.now();
  if (tokenSummaryCache && now - tokenSummaryTimestamp < 45000) {
    return tokenSummaryCache;
  }

  await ensureTokenTable();

  // 1. Ambil agregasi dari token_usage_logs
  const aggRes = await db.execute(`
    SELECT 
      provider,
      COUNT(*) as call_count,
      SUM(prompt_tokens) as total_prompt,
      SUM(completion_tokens) as total_completion,
      SUM(total_tokens) as total_tokens,
      SUM(estimated_cost_usd) as total_cost
    FROM token_usage_logs
    GROUP BY provider;
  `);

  let openai = { call_count: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 };
  let gemini = { call_count: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0 };

  for (const row of aggRes.rows) {
    const prov = (row.provider || '').toLowerCase();
    const data = {
      call_count: Number(row.call_count || 0),
      prompt_tokens: Number(row.total_prompt || 0),
      completion_tokens: Number(row.total_completion || 0),
      total_tokens: Number(row.total_tokens || 0),
      cost_usd: Number(Number(row.total_cost || 0).toFixed(4))
    };
    if (prov === 'gemini') gemini = data;
    else openai = data;
  }

  // 2. Jika log token masih baru/sedikit, sertakan kalkulasi historis data prebuilt & analisis
  if (openai.call_count === 0 && gemini.call_count === 0) {
    try {
      const pbRes = await db.execute('SELECT services_json FROM prebuilt_websites;');
      let pbTokens = 0;
      for (const r of pbRes.rows) {
        if (r.services_json) pbTokens += countOpenAiTokens(r.services_json);
      }
      const anRes = await db.execute('SELECT problem_analysis FROM places WHERE problem_analysis IS NOT NULL;');
      let anTokens = 0;
      for (const r of anRes.rows) {
        if (r.problem_analysis) anTokens += countOpenAiTokens(r.problem_analysis);
      }

      const estimatedCalls = pbRes.rows.length + anRes.rows.length;
      const compTokens = pbTokens + anTokens;
      // Rasio rata-rata prompt adalah ~2.2x completion untuk context bisnis
      const promptTokens = Math.round(compTokens * 2.2);
      const totalTokens = promptTokens + compTokens;
      const cost = calculateTokenCost('openai', 'gpt-4o-mini', promptTokens, compTokens);

      openai = {
        call_count: estimatedCalls,
        prompt_tokens: promptTokens,
        completion_tokens: compTokens,
        total_tokens: totalTokens,
        cost_usd: cost
      };
    } catch (_) {}
  }

  const grandTotalTokens = openai.total_tokens + gemini.total_tokens;
  const grandTotalCost = Number((openai.cost_usd + gemini.cost_usd).toFixed(4));
  const totalCalls = openai.call_count + gemini.call_count;

  // 3. Ambil 10 log transaksi terbaru
  const recentLogsRes = await db.execute(`
    SELECT id, provider, model, operation, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at
    FROM token_usage_logs
    ORDER BY created_at DESC
    LIMIT 10;
  `);

  const result = {
    total_tokens: grandTotalTokens,
    total_cost_usd: grandTotalCost,
    total_calls: totalCalls,
    openai,
    gemini,
    recent_logs: recentLogsRes.rows || []
  };

  tokenSummaryCache = result;
  tokenSummaryTimestamp = Date.now();

  return result;
}
