import { db } from './db.js';

let cachedKnowledge = null;
let lastKnowledgeFetch = 0;
const KNOWLEDGE_CACHE_TTL = 60000; // 1 menit

/**
 * Mengambil knowledge base dan profil Company AI Agent dari database.
 */
export async function getCompanyProfile() {
  const now = Date.now();
  if (cachedKnowledge && (now - lastKnowledgeFetch) < KNOWLEDGE_CACHE_TTL) {
    return cachedKnowledge;
  }

  try {
    const res = await db.execute(`
      SELECT company_name, system_prompt, knowledge_markdown, model_id, temperature
      FROM agent_profiles
      WHERE id = 'company_default'
      LIMIT 1;
    `);
    const row = res.rows?.[0];
    if (row) {
      cachedKnowledge = {
        companyName: row.company_name || 'Prospekta',
        systemPrompt: row.system_prompt || '',
        knowledgeMarkdown: row.knowledge_markdown || '',
        modelId: row.model_id || 'gemini-2.0-flash-lite',
        temperature: Number(row.temperature) || 0.2
      };
      lastKnowledgeFetch = now;
      return cachedKnowledge;
    }
  } catch (_) { }

  // Fallback default
  return {
    companyName: 'Prospekta',
    systemPrompt: 'Anda adalah Company AI Agent resmi untuk Prospekta. Bantu pengguna dalam analisis bisnis, penyusunan proposal kemitraan (PDF), dan perancangan website profesional secara ringkas, faktual, dan solutif.',
    knowledgeMarkdown: '# Knowledge Base Prospekta\nProspekta mengkhususkan diri pada 4 pilar solusi: Manajemen Akun RBAC, Audit Lokasi & Direktori Bisnis, Proposal Kemitraan PDF, dan Prototype Website Interaktif.',
    modelId: process.env.AGENT_MODEL_ID || 'gemini-2.0-flash-lite',
    temperature: 0.2
  };
}

/**
 * Memperbarui profil dan knowledge base Company AI Agent (Khusus Admin).
 */
export async function updateCompanyProfile({ companyName, systemPrompt, knowledgeMarkdown, modelId, temperature, userId }) {
  const nowIso = new Date().toISOString();
  await db.execute({
    sql: `
      UPDATE agent_profiles
      SET company_name = COALESCE(?, company_name),
          system_prompt = COALESCE(?, system_prompt),
          knowledge_markdown = COALESCE(?, knowledge_markdown),
          model_id = COALESCE(?, model_id),
          temperature = COALESCE(?, temperature),
          updated_by = ?,
          updated_at = ?
      WHERE id = 'company_default';
    `,
    args: [
      companyName || null,
      systemPrompt || null,
      knowledgeMarkdown || null,
      modelId || null,
      temperature !== undefined ? Number(temperature) : null,
      userId || null,
      nowIso
    ]
  });

  cachedKnowledge = null;
  lastKnowledgeFetch = 0;
  return getCompanyProfile();
}

/**
 * Memanggil model Flash tier terendah/unlimited dari Agnes API (atau fallback Gemini/OpenAI).
 */
export async function askCompanyAgent({
  prompt,
  contextData = '',
  role = 'user',
  systemOverride = '',
  temperature = 0.2,
  timeoutMs = 30000
}) {
  const profile = await getCompanyProfile();
  const apiKey = process.env.AGENT_API_KEY || process.env.FLASH_MODEL_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const baseUrl = process.env.AGENT_API_BASE_URL || 'https://api.openai.com/v1';
  const modelId = process.env.AGENT_MODEL_ID || profile.modelId || 'gemini-2.0-flash-lite';

  const systemInstructions = [
    systemOverride || profile.systemPrompt,
    `\n\n--- COMPANY KNOWLEDGE BASE ---\n${profile.knowledgeMarkdown}`,
    `\n--- CALLER CONTEXT ---\nPeran pengguna saat ini: ${role.toUpperCase()}`,
    `\n--- ATURAN KOMUNIKASI (ANTISLOP) ---\n1. Bersikap solutif, ringkas, dan to-the-point.\n2. Hindari kata klise AI seperti 'unlock', 'delve', 'elevate', 'revolutionary'.\n3. Jangan menyimpulkan data fiktif jika tidak ada dalam konteks.`
  ].join('\n');

  const safeContext = contextData ? `\n\n<untrusted_content>\n${contextData.slice(0, 15000)}\n</untrusted_content>` : '';
  const fullUserMessage = `${prompt}${safeContext}`;

  // 1. Coba panggil via endpoint OpenAI-compatible (Agnes API / OpenAI)
  if (apiKey && apiKey.startsWith('sk-')) {
    try {
      const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstructions },
            { role: 'user', content: fullUserMessage }
          ],
          temperature: temperature ?? profile.temperature ?? 0.2
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (resp.ok) {
        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) return reply;
      }
    } catch (err) {
      console.warn('[Company Agent] Agnes/OpenAI call failed, trying fallback:', err.message);
    }
  }

  // 2. Fallback ke Gemini API jika GEMINI_API_KEY tersedia
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstructions }] },
            contents: [{ parts: [{ text: fullUserMessage }] }],
            generationConfig: { temperature: temperature ?? 0.2 }
          }),
          signal: AbortSignal.timeout(timeoutMs)
        }
      );
      if (resp.ok) {
        const gData = await resp.json();
        const text = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      }
    } catch (_) { }
  }

  // 3. Fallback deterministik bebas AI jika tidak ada koneksi
  return `[${profile.companyName} AI Agent]\nBerdasarkan data operasional perusahaan:\n${prompt}\n(Koneksi LLM eksternal sedang offline, draf disusun secara aturan deterministik).`;
}
