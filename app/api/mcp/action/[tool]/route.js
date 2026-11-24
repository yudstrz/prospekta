import { NextResponse } from 'next/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { executeMcpTool } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const { tool } = await params;
    const context = await authenticateMcpRequest(request, 'user');
    const body = await request.json().catch(() => ({}));

    const result = await executeMcpTool(tool, body, context);
    return NextResponse.json({ success: true, tool, result });
  } catch (err) {
    const status = err.statusCode || (err.status ? err.status : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
