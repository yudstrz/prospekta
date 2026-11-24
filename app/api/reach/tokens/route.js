import { NextResponse } from 'next/server';
import { getTokenSummary, countOpenAiTokens } from '@/lib/tokens';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getTokenSummary();
    return NextResponse.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching token summary:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = body?.text || '';
    if (typeof text !== 'string' || text.length > 500000) {
      return NextResponse.json({ success: false, error: 'Panjang teks melebihi batas (maksimal 500.000 karakter).' }, { status: 400 });
    }
    const model = body?.model || 'gpt-4o-mini';

    const tokenCount = countOpenAiTokens(text, model);
    return NextResponse.json({
      success: true,
      text_length: text.length,
      model,
      token_count: tokenCount,
      estimated_gemini_tokens: Math.round(tokenCount * 0.95)
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
