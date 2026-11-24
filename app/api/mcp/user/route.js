import { NextResponse } from 'next/server';
import { authenticateMcpRequest } from '@/lib/mcp/auth';
import { handleMcpRpc } from '@/lib/mcp/server';
import { USER_TOOLS } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const context = await authenticateMcpRequest(request, 'user');
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: Request body bukan JSON yang valid.' }
      }, { status: 400 });
    }

    const rpcResponse = await handleMcpRpc(body, context, '/api/mcp/user');
    if (rpcResponse === null) {
      return new Response(null, { status: 204 });
    }

    return NextResponse.json(rpcResponse);
  } catch (err) {
    const status = err.statusCode || (err.status ? err.status : 500);
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: err.message }
    }, { status });
  }
}

export async function GET(request) {
  try {
    const context = await authenticateMcpRequest(request, 'user');
    return NextResponse.json({
      status: 'active',
      server: 'prospekta-user-mcp',
      role: context.role,
      user: { id: context.userId, email: context.email },
      toolsCount: USER_TOOLS.length,
      tools: USER_TOOLS.map(t => ({ name: t.name, description: t.description }))
    });
  } catch (err) {
    return NextResponse.json({ status: 'unauthorized', error: err.message }, { status: err.statusCode || 401 });
  }
}
