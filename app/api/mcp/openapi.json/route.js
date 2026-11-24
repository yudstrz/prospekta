import { NextResponse } from 'next/server';
import { USER_TOOLS, ADMIN_TOOLS } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';

/**
 * Menghasilkan spesifikasi OpenAPI 3.1 dinamis agar tools Prospekta
 * dapat diimpor secara instan ke ChatGPT Custom Actions / GPT Builder.
 */
export async function GET(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}/customer-reach`;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') === 'admin' ? 'admin' : 'user';
  const tools = scope === 'admin' ? ADMIN_TOOLS : USER_TOOLS;

  const paths = {};

  for (const tool of tools) {
    const pathName = `/api/mcp/action/${tool.name}`;
    paths[pathName] = {
      post: {
        operationId: tool.name,
        summary: tool.description,
        description: `${tool.description} (Scope: ${scope.toUpperCase()})`,
        requestBody: {
          required: Boolean(tool.inputSchema?.required?.length),
          content: {
            'application/json': {
              schema: tool.inputSchema || { type: 'object' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Eksekusi tool berhasil',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    result: { type: 'object' }
                  }
                }
              }
            }
          },
          '401': { description: 'Token tidak valid' },
          '403': { description: 'Akses ditolak' }
        },
        security: [{ BearerAuth: [] }]
      }
    };
  }

  const openApiDoc = {
    openapi: '3.1.0',
    info: {
      title: `Prospekta ${scope === 'admin' ? 'Admin' : 'User'} Actions API`,
      description: `REST Action bridge untuk menghubungkan ekosistem ChatGPT / OpenAI Actions ke sistem intelijen Prospekta (Lokasi, PDF, Website, dan AI Agent).`,
      version: '1.0.0'
    },
    servers: [
      {
        url: baseUrl,
        description: 'Prospekta Core Server'
      }
    ],
    paths,
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'psk_token',
          description: `Masukkan Token MCP Prospekta Anda (${scope === 'admin' ? 'psk_adm_...' : 'psk_usr_...'}).`
        }
      }
    }
  };

  return NextResponse.json(openApiDoc);
}
