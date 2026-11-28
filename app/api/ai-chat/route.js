import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import {
  AI_PROVIDERS,
  hasAgnesPlatformEngine,
  getModel,
  getDecryptedActiveKey,
  listUserAiKeys,
  resolveLatestModel,
  resolveModelForProvider,
} from '@/lib/ai-keys';
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
    const active = keys.find((k) => k.is_active) || null;
    const agnesAvailable = hasAgnesPlatformEngine();
    const providerMeta = active ? AI_PROVIDERS[active.provider] : null;

    let resolvedModel = null;
    if (active) {
      const dec = await getDecryptedActiveKey(session.uid, active.provider).catch(() => null);
      if (dec?.apiKey) {
        resolvedModel = await resolveLatestModel(active.provider, dec.apiKey, false, session?.role).catch(() => providerMeta?.fallbackModel || null);
      }
    } else if (agnesAvailable) {
      resolvedModel = getModel('agnes', session?.role);
    }

    const savedProviders = [
      ...(agnesAvailable
        ? [{
            provider: 'agnes',
            name: 'Agnes AI',
            modelLabel: getModel('agnes', session?.role),
            maskedKey: 'Bawaan Platform',
            isActive: !active,
            isPlatformDefault: true,
          }]
        : []),
      ...keys.map((k) => ({
        provider: k.provider,
        name: AI_PROVIDERS[k.provider]?.name || k.provider,
        modelLabel: AI_PROVIDERS[k.provider]?.modelLabel || 'Otomatis Terbaru',
        maskedKey: k.masked_key,
        isActive: k.is_active,
      })),
    ];

    return NextResponse.json({
      success: true,
      configured: Boolean(active || agnesAvailable),
      activeSource: active ? 'byok' : (agnesAvailable ? 'agnes' : null),
      provider: active?.provider || (agnesAvailable ? 'agnes' : null),
      providerName: providerMeta?.name || (agnesAvailable ? 'Agnes AI Platform' : null),
      model: resolvedModel,
      modelLabel: providerMeta?.modelLabel || (agnesAvailable ? 'Agnes Platform Flash' : 'Otomatis Model Terbaru'),
      maskedKey: active?.masked_key || (agnesAvailable ? 'Bawaan Platform' : null),
      savedProviders,
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
    const agnesAvailable = hasAgnesPlatformEngine();
    const wantsAgnes = String(body.provider || '').trim().toLowerCase() === 'agnes';
    const keyRecord = wantsAgnes
      ? null
      : await getDecryptedActiveKey(session.uid, body.provider || null);

    let effectiveProvider = null;
    let effectiveApiKey = null;

    if (wantsAgnes) {
      if (!agnesAvailable) {
        return NextResponse.json(
          { success: false, error: 'Agnes AI bawaan platform belum dikonfigurasi di environment server.' },
          { status: 400 }
        );
      }
      effectiveProvider = 'agnes';
    } else if (keyRecord?.apiKey && (body.provider || keyRecord.isActive)) {
      effectiveProvider = keyRecord.provider;
      effectiveApiKey = keyRecord.apiKey;
    } else if (agnesAvailable) {
      effectiveProvider = 'agnes';
    } else if (keyRecord?.apiKey) {
      effectiveProvider = keyRecord.provider;
      effectiveApiKey = keyRecord.apiKey;
    }

    if (!effectiveProvider) {
      return NextResponse.json(
        {
          success: false,
          code: 'AI_KEY_REQUIRED',
          requiresApiKey: true,
          action: 'OPEN_AI_SETTINGS',
          message: 'Belum ada mesin AI aktif. Gunakan Agnes AI bawaan atau simpan API Key Gemini, OpenAI, atau Claude di Pengaturan.',
        },
        { status: 400 }
      );
    }

    const messages = Array.isArray(body.messages)
      ? body.messages
      : (body.message ? [{ role: 'user', content: String(body.message) }] : []);
    const uiContext = body.context || {};
    const requestedModel = effectiveProvider === 'agnes'
      ? (body.model || 'auto')
      : await resolveModelForProvider(effectiveProvider, body.model || 'auto', effectiveApiKey, session?.role);
    const wantsStream = body.stream !== false && request.headers.get('accept')?.includes('application/x-ndjson');

    if (!wantsStream) {
      const result = await runAiChatLoop({
        session,
        provider: effectiveProvider,
        apiKey: effectiveApiKey,
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
            provider: effectiveProvider,
            apiKey: effectiveApiKey,
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
