import { NextResponse } from 'next/server';
import { auditAndCaptureWebsite } from '@/lib/mcp-browser';
import { dbWrite } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { placeId, url } = body;

    let targetUrl = url;
    if (!targetUrl && placeId) {
      const res = await dbWrite.execute({
        sql: 'SELECT website FROM places WHERE overture_id = ? LIMIT 1',
        args: [placeId],
      });
      targetUrl = res.rows?.[0]?.website;
    }

    if (!targetUrl) {
      return NextResponse.json(
        { success: false, error: 'Prospek ini tidak memiliki alamat website untuk diaudit.' },
        { status: 400 }
      );
    }

    const auditResult = await auditAndCaptureWebsite(targetUrl);

    // Simpan screenshot dan hasil audit ke database jika placeId diberikan
    if (placeId && auditResult.success) {
      const notesAddition = `[Browser MCP Audit]: Skor ${auditResult.audit.score}/100. ${auditResult.audit.recommendedSolution}`;
      await dbWrite.execute({
        sql: `UPDATE places SET 
                problem_analysis = COALESCE(problem_analysis, ?),
                notes = COALESCE(notes || ' | ', '') || ?,
                screenshot_url = ?
              WHERE overture_id = ?`,
        args: [auditResult.audit.recommendedSolution, notesAddition, auditResult.screenshotUrl, placeId],
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      ...auditResult,
    });
  } catch (err) {
    console.error('Browser MCP Audit error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal menjalankan audit website via Browser MCP.' },
      { status: 500 }
    );
  }
}
