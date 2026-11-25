import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import {
  AI_PROVIDERS,
  normalizeProvider,
  hasAgnesPlatformEngine,
  getModel,
  testProviderConnection,
  listUserAiKeys,
  saveUserAiKey,
  setActiveUserAiProvider,
  deleteUserAiKey,
} from '@/lib/ai-keys';

export const dynamic = 'force-dynamic';

function buildSettingsPayload(keys, resolvedLatestModel = null, role = 'user') {
  const active = keys.find((k) => k.is_active) || null;
  const activeMeta = active ? AI_PROVIDERS[active.provider] : null;
  const agnesAvailable = hasAgnesPlatformEngine();
  const agnesModel = getModel('agnes', role);
  const activeIsAgnes = !active && agnesAvailable;

  return {
    providers: Object.values(AI_PROVIDERS),
    keys,
    agnesAvailable,
    agnesModel,
    activeSource: active ? 'byok' : (agnesAvailable ? 'agnes' : null),
    activeProvider: active?.provider || (agnesAvailable ? 'agnes' : null),
    activeProviderName: activeMeta?.name || (activeIsAgnes ? 'Agnes AI (Bawaan Platform .env)' : null),
    activeModel: active ? (resolvedLatestModel || activeMeta?.modelLabel || null) : (activeIsAgnes ? agnesModel : null),
    maskedKey: active?.masked_key || (activeIsAgnes ? 'ENV Platform' : null),
  };
}

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const keys = await listUserAiKeys(session.uid);
    return NextResponse.json({ success: true, ...buildSettingsPayload(keys, null, session.role) });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const provider = normalizeProvider(body.provider);
    if (!provider) {
      return NextResponse.json({ success: false, error: 'Pilih provider AI: gemini, openai, atau claude.' }, { status: 400 });
    }

    const apiKey = String(body.apiKey || body.api_key || '').trim();
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'API Key wajib diisi.' }, { status: 400 });
    }

    const testRes = await testProviderConnection(provider, apiKey, session?.role);
    if (body.testOnly) {
      return NextResponse.json({
        success: true,
        verified: true,
        provider,
        testedModel: testRes.model,
        message: `Koneksi ke ${AI_PROVIDERS[provider].name} berhasil diverifikasi.`,
      });
    }

    const keys = await saveUserAiKey({
      userId: session.uid,
      provider,
      apiKey,
    });

    return NextResponse.json({
      success: true,
      message: `API Key ${AI_PROVIDERS[provider].name} tervalidasi (model terbaru: ${testRes.model}), terenkripsi AES-256-GCM, dan diaktifkan.`,
      ...buildSettingsPayload(keys, testRes.model),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memvalidasi atau menyimpan API Key.' },
      { status: err.status || 400 }
    );
  }
}

export async function PATCH(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const norm = normalizeProvider(body.provider);
    const keys = await setActiveUserAiProvider({
      userId: session.uid,
      provider: body.provider,
    });
    const activeName = norm === 'agnes'
      ? 'Agnes AI (Bawaan Platform .env)'
      : (AI_PROVIDERS[norm]?.name || body.provider);
    return NextResponse.json({
      success: true,
      message: `Provider aktif diubah ke ${activeName}.`,
      ...buildSettingsPayload(keys, null, session.role),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 400 });
  }
}

export async function DELETE(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const provider = searchParams.get('provider') || body.provider;

    const keys = await deleteUserAiKey({
      userId: session.uid,
      provider,
    });

    return NextResponse.json({
      success: true,
      message: `API Key ${AI_PROVIDERS[normalizeProvider(provider)]?.name || provider} berhasil dihapus.`,
      ...buildSettingsPayload(keys),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status || 400 });
  }
}
