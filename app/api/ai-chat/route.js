import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import { AI_PROVIDERS, getDecryptedActiveKey, listUserAiKeys, resolveLatestModel, resolveModelForProvider } from '@/lib/ai-keys';
import { runAiChatLoop } from '@/lib/ai-providers';
import { sanitizeAiErrorMessage } from '@/lib/ai-crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const keys = await listUserAiKeys(session.uid);
    const active = keys.find((k) => k.is_active) || keys[0] || null;
    const providerMeta = active ? AI_PROVIDERS[active.provider] : null;
    let resolvedModel = null;
    if (active) {
      const dec = await getDecryptedActiveKey(session.uid, active.provider).catch(() => null);
      if (dec?.apiKey) {
        resolvedModel = await resolveLatestModel(active.provider, dec.apiKey).catch(() => providerMeta?.fallbackModel || null);
      }
    }
    return NextResponse.json({
      success: true,
      configured: Boolean(active),
      provider: active?.provider || null,
      providerName: providerMeta?.name || null,
      model: resolvedModel,
      modelLabel: providerMeta?.modelLabel || 'Otomatis Model Terbaru',
      maskedKey: active?.masked_key || null,
      savedProviders: keys.map((k) => ({
        provider: k.provider,
        name: AI_PROVIDERS[k.provider]?.name || k.provider,
        modelLabel: AI_PROVIDERS[k.provider]?.modelLabel || 'Otomatis Terbaru',
        maskedKey: k.masked_key,
        isActive: k.is_active,
      })),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const keyRecord = await getDecryptedActiveKey(session.uid, body.provider || null);

    if (!keyRecord?.apiKey) {
      return NextResponse.json(
        {
          success: false,
          code: 'AI_KEY_REQUIRED',
          requiresApiKey: true,
          action: 'OPEN_AI_SETTINGS',
          message: 'Anda belum menyimpan API Key AI. Hubungkan API Key Gemini, OpenAI, atau Claude untuk menggunakan Prospekta AI Assistant.',
        },
        { status: 400 }
      );
    }

    const messages = Array.isArray(body.messages)
      ? body.messages
      : (body.message ? [{ role: 'user', content: String(body.message) }] : []);
    const uiContext = body.context || {};
    const requestedModel = await resolveModelForProvider(keyRecord.provider, body.model || 'auto', keyRecord.apiKey);
    const wantsStream = body.stream !== false && request.headers.get('accept')?.includes('application/x-ndjson');

    if (!wantsStream) {
      const result = await runAiChatLoop({
        session,
        provider: keyRecord.provider,
        apiKey: keyRecord.apiKey,
        requestedModel,
        messages,
        uiContext,
      });
      return NextResponse.json({ success: true, ...result });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (payload) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };
        try {
          const result = await runAiChatLoop({
            session,
            provider: keyRecord.provider,
            apiKey: keyRecord.apiKey,
            requestedModel,
            messages,
            uiContext,
            onProgress: (evt) => sendEvent(evt),
          });
          sendEvent({ type: 'done', success: true, ...result });
        } catch (err) {
          sendEvent({
            type: 'error',
            success: false,
            error: sanitizeAiErrorMessage(err?.message || 'Gagal memproses AI Assistant.'),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: sanitizeAiErrorMessage(err?.message || 'Kesalahan server.') },
      { status: err?.status || 500 }
    );
  }
}
