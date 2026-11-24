import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const res = await db.execute({
      sql: `SELECT type, count FROM usage_counters WHERE date = ?;`,
      args: [today]
    });

    let llmCount = 0;
    let crawlCount = 0;

    for (const row of res.rows || []) {
      if (row.type === 'llm') llmCount = Number(row.count || 0);
      if (row.type === 'crawl') crawlCount = Number(row.count || 0);
    }

    return NextResponse.json({
      success: true,
      date: today,
      counters: {
        llm: llmCount,
        crawl: crawlCount,
        llmLimit: 100,
        crawlLimit: 100
      }
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
