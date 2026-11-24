import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const res = await db.execute(`SELECT * FROM use_cases ORDER BY vertical ASC, title ASC;`);
    return NextResponse.json({ success: true, useCases: res.rows || [] });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
