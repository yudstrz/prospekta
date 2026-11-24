import { NextResponse } from 'next/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { handleMcpRpc } from '@/lib/mcp/server';
import { ADMIN_TOOLS } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const context = await authenticateMcpRequest(request, 'admin');
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: Request body bukan JSON yang valid.' }
      }, { status: 400 });
    }

    const rpcResponse = await handleMcpRpc(body, context, '/api/mcp/admin');
    if (rpcResponse === null) {
      return new Response(null, { status: 204 });
    }

    return NextResponse.json(rpcResponse);
  } catch (err) {
    const status = err.statusCode || (err.status ? err.status : 403);
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32003, message: err.message }
    }, { status });
  }
}

export async function GET(request) {
  try {
    const context = await authenticateMcpRequest(request, 'admin');
    return NextResponse.json({
      status: 'active',
      server: 'prospekta-admin-mcp',
      role: 'admin',
      admin: { id: context.userId, email: context.email },
      toolsCount: ADMIN_TOOLS.length,
      tools: ADMIN_TOOLS.map(t => ({ name: t.name, description: t.description }))
    });
  } catch (err) {
    return NextResponse.json({ status: 'forbidden', error: err.message }, { status: err.statusCode || 403 });
  }
}
