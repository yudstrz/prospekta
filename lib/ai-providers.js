import { GoogleGenAI } from '@google/genai';
import {
  getToolsForSession,
  toGeminiFunctionDeclarations,
  toOpenAiTools,
  toClaudeTools,
  executeAiTool,
  getToolStatusLabel,
} from './ai-tools.js';
import { AI_PROVIDERS, resolveModelForProvider } from './ai-keys.js';
import { getCompanyProfile } from './company-agent.js';
import { getSettings } from './tenant.js';
import { recordTokenUsage } from './tokens.js';
import { sanitizeAiErrorMessage } from './ai-crypto.js';

const MAX_TOOL_ROUNDS = 5;

async function buildSystemInstruction(session, uiContext = {}) {
  const [profile, tenantSettings] = await Promise.all([
    getCompanyProfile().catch(() => null),
    session?.tid ? getSettings(session.tid).catch(() => null) : Promise.resolve(null),
  ]);

  const companyName = tenantSettings?.company_name || profile?.companyName || 'Prospekta';
  const offering = tenantSettings?.company_offering || profile?.knowledgeMarkdown || '';
  const areaLine = uiContext?.activeAnchor?.name
    ? `Area terpilih di dashboard saat ini: "${uiContext.activeAnchor.name}" (Radius: ${uiContext.radiusKm || 2} km).`
    : 'Belum ada area spesifik yang dipilih di dashboard.';

  return [
    `Anda adalah Prospekta AI Operator untuk akun ${companyName} (${session.email || session.uid}, peran: ${(session.role || 'user').toUpperCase()}).`,
    offering ? `Layanan & Knowledge Base Akun:\n${offering}` : '',
    areaLine,
    `Kemampuan Operasional Nyata (WAJIB digunakan alih-alih sekadar menjawab teori):`,
    `- Scan area & buat titik lokasi baru: panggil scan_area_prospects bila user meminta memindai/mencari bisnis baru di peta.`,
    `- Cari, analisis, & filter prospek: panggil search_prospects dan apply_dashboard_filter (untuk menampilkan hasil di peta & tabel UI dashboard), open_prospect_modal (untuk membuka kartu detail prospek di layar), atau analyze_prospect (untuk crawl & riset 3 pilar).`,
    `- Kelola CRM & outreach: update_prospect_status, update_prospect_contact, add_prospect_note, generate_proposal_pdf, generate_website_preview, create_email_draft, dan send_email_outreach.`,
    `Aturan Ketat:`,
    `1. Selalu gunakan tool nyata di atas sebelum menjawab data bisnis. Jangan pernah mengarang perusahaan, nomor telepon, email, atau URL.`,
    `2. Saat membuat proposal PDF, website preview, atau menganalisis prospek teratas tanpa placeId, cari dulu kandidatnya lewat search_prospects.`,
    `3. Jangan pernah meminta atau menebak API key maupun ID akun user lain; seluruh aksi otomatis terisolasi ke akun yang login.`,
    `4. Jawab dalam Bahasa Indonesia secara ringkas, faktual, dan sertakan ringkasan aksi yang baru saja dieksekusi di sistem.`,
  ].filter(Boolean).join('\n\n');
}

function summarizeToolResult(toolName, result) {
  if (!result || result.error) return result?.error || 'Gagal';
  if (toolName === 'scan_area_prospects') return `Scan ${result.anchor} (${result.radiusKm} km): +${result.newPlacesAdded} bisnis baru`;
  if (toolName === 'search_prospects') return `${result.count || 0} prospek ditemukan (${result.areaUsed || '-'})`;
  if (toolName === 'apply_dashboard_filter') return 'Filter diterapkan ke peta & tabel';
  if (toolName === 'open_prospect_modal') return `Membuka detail: ${result.name}`;
  if (toolName === 'analyze_prospect') return `Analisis AI selesai: ${result.name}`;
  if (toolName === 'update_prospect_status') return `Status -> ${result.status}`;
  if (toolName === 'update_prospect_contact') return `Kontak diperbarui: ${result.name}`;
  if (toolName === 'add_prospect_note') return `Catatan disimpan: ${result.name}`;
  if (toolName === 'generate_proposal_pdf') return `Proposal dibuat: ${result.placeName || result.title}`;
  if (toolName === 'generate_website_preview') return `Preview website: ${result.previewUrl}`;
  if (toolName === 'create_email_draft') return `Draf email: ${result.companyName}`;
  if (toolName === 'get_prospect_detail') return `Detail: ${result.name}`;
  if (toolName === 'send_email_outreach') return `Terkirim ke ${result.to}`;
  if (typeof result.count === 'number') return `${result.count} item ditemukan`;
  return 'Selesai';
}

function normalizeHistory(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.trim() }));
}

async function runGemini({ apiKey, model, systemInstruction, history, tools, execTool, onProgress }) {
  const ai = new GoogleGenAI({ apiKey });
  const contents = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const functionDeclarations = toGeminiFunctionDeclarations(tools);
  const executedTools = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        tools: [{ functionDeclarations }],
      },
    });

    if (response?.usageMetadata) {
      recordTokenUsage({
        provider: 'gemini',
        model,
        operation: 'ai_chat',
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
      }).catch(() => {});
    }

    const calls = response?.functionCalls || [];
    if (calls.length === 0) {
      return { reply: response?.text || 'Tidak ada respons dari Gemini.', toolCalls: executedTools };
    }

    const modelContent = response?.candidates?.[0]?.content || {
      role: 'model',
      parts: calls.map((fc) => ({ functionCall: fc })),
    };
    contents.push(modelContent);

    const responseParts = [];
    for (const fc of calls) {
      onProgress?.({ type: 'status', text: getToolStatusLabel(fc.name), tool: fc.name });
      let output;
      try {
        output = await execTool(fc.name, fc.args || {});
      } catch (err) {
        output = { error: err.message };
      }
      const summary = summarizeToolResult(fc.name, output);
      executedTools.push({ name: fc.name, args: fc.args || {}, summary, output });
      onProgress?.({ type: 'tool', tool: fc.name, summary, output });
      responseParts.push({
        functionResponse: {
          name: fc.name,
          ...(fc.id ? { id: fc.id } : {}),
          response: { result: output },
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return { reply: 'Batas eksekusi tool tercapai. Silakan persempit instruksi Anda.', toolCalls: executedTools };
}

async function runOpenAi({ apiKey, model, systemInstruction, history, tools, execTool, onProgress }) {
  const apiMessages = [
    { role: 'system', content: systemInstruction },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const openAiTools = toOpenAiTools(tools);
  const executedTools = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        tools: openAiTools,
        tool_choice: 'auto',
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(sanitizeAiErrorMessage(data?.error?.message || `OpenAI HTTP ${res.status}`));
    }

    if (data?.usage) {
      recordTokenUsage({
        provider: 'openai',
        model,
        operation: 'ai_chat',
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      }).catch(() => {});
    }

    const msg = data.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls || [];
    if (toolCalls.length === 0) {
      return { reply: msg?.content || 'Tidak ada respons dari OpenAI.', toolCalls: executedTools };
    }

    apiMessages.push(msg);
    for (const tc of toolCalls) {
      const toolName = tc.function?.name;
      let parsedArgs = {};
      try { parsedArgs = JSON.parse(tc.function?.arguments || '{}'); } catch (_) {}

      onProgress?.({ type: 'status', text: getToolStatusLabel(toolName), tool: toolName });
      let output;
      try {
        output = await execTool(toolName, parsedArgs);
      } catch (err) {
        output = { error: err.message };
      }
      const summary = summarizeToolResult(toolName, output);
      executedTools.push({ name: toolName, args: parsedArgs, summary, output });
      onProgress?.({ type: 'tool', tool: toolName, summary, output });

      apiMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(output),
      });
    }
  }

  return { reply: 'Batas eksekusi tool tercapai. Silakan persempit instruksi Anda.', toolCalls: executedTools };
}

async function runClaude({ apiKey, model, systemInstruction, history, tools, execTool, onProgress }) {
  const claudeMessages = history.map((m) => ({ role: m.role, content: m.content }));
  const claudeTools = toClaudeTools(tools);
  const executedTools = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemInstruction,
        messages: claudeMessages,
        tools: claudeTools,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(sanitizeAiErrorMessage(data?.error?.message || `Claude HTTP ${res.status}`));
    }

    const blocks = Array.isArray(data.content) ? data.content : [];
    const toolUses = blocks.filter((b) => b.type === 'tool_use');

    if (toolUses.length === 0 || data.stop_reason !== 'tool_use') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { reply: text || 'Tidak ada respons dari Claude.', toolCalls: executedTools };
    }

    claudeMessages.push({ role: 'assistant', content: blocks });
    const toolResultBlocks = [];
    for (const tu of toolUses) {
      onProgress?.({ type: 'status', text: getToolStatusLabel(tu.name), tool: tu.name });
      let output;
      try {
        output = await execTool(tu.name, tu.input || {});
      } catch (err) {
        output = { error: err.message };
      }
      const summary = summarizeToolResult(tu.name, output);
      executedTools.push({ name: tu.name, args: tu.input || {}, summary, output });
      onProgress?.({ type: 'tool', tool: tu.name, summary, output });

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(output),
      });
    }
    claudeMessages.push({ role: 'user', content: toolResultBlocks });
  }

  return { reply: 'Batas eksekusi tool tercapai. Silakan persempit instruksi Anda.', toolCalls: executedTools };
}

const PROVIDER_RUNNERS = {
  gemini: runGemini,
  openai: runOpenAi,
  claude: runClaude,
};

/**
 * Titik masuk terpadu multi-provider BYOK chat dengan function calling terisolasi per user.
 */
export async function runAiChatLoop({
  session,
  provider,
  apiKey,
  requestedModel,
  messages,
  uiContext = {},
  onProgress = null,
}) {
  const runner = PROVIDER_RUNNERS[provider];
  if (!runner) {
    throw Object.assign(new Error('Provider AI tidak didukung.'), { status: 400 });
  }

  const model = resolveModelForProvider(provider, requestedModel);
  const providerMeta = AI_PROVIDERS[provider];
  const history = normalizeHistory(messages);
  if (history.length === 0) {
    throw Object.assign(new Error('Pesan percakapan tidak boleh kosong.'), { status: 400 });
  }

  onProgress?.({ type: 'status', text: `Memproses dengan ${providerMeta.name} (${model})...` });
  const systemInstruction = await buildSystemInstruction(session, uiContext);
  const tools = getToolsForSession(session);
  const execTool = (toolName, args) => executeAiTool(toolName, args, session, uiContext);

  try {
    const result = await runner({ apiKey, model, systemInstruction, history, tools, execTool, onProgress });
    return {
      provider,
      providerName: providerMeta.name,
      model,
      ...result,
    };
  } catch (err) {
    throw Object.assign(new Error(sanitizeAiErrorMessage(err?.message || 'Gagal menghubungi penyedia AI.')), {
      status: err?.status || 502,
    });
  }
}
