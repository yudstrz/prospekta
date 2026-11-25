import { NextResponse } from 'next/server';
import { sessionFromRequest } from '@/lib/auth';
import { executeAreaScan } from '@/lib/scanner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const session = await sessionFromRequest(request);
    const result = await executeAreaScan({
      anchorName: body.anchor || '',
      locationQuery: body.location_query || '',
      radiusKm: body.radius_km || 2,
      tenantId: session?.tid || null,
      userId: session?.uid || null,
      isAdmin: session?.role === 'admin',
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
