import { USER_TOOLS, ADMIN_TOOLS, executeMcpTool } from './tools.js';
import { db } from '../db.js';

export async function handleMcpRpc(requestBody, context, endpointPath) {
  const { userId, role } = context;
  const isAdmin = role === 'admin';
  const availableTools = isAdmin ? ADMIN_TOOLS : USER_TOOLS;

  const { id, method, params } = requestBody || {};

  if (!method) {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid Request: Field "method" wajib ada.' }
    };
  }

  // 1. Initialize
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: false }
        },
        serverInfo: {
          name: `prospekta-${role}-mcp`,
          version: '1.0.0',
          role
        }
      }
    };
  }

  // 2. Notifications initialized
  if (method === 'notifications/initialized') {
    return null; // No response needed for notification
  }

  // 3. Ping
  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  // 4. tools/list
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: availableTools
      }
    };
  }

  // 5. tools/call
  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    const startTime = Date.now();

    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Invalid params: Field "name" tool wajib diisi.' }
      };
    }

    // Periksa apakah tool ada dalam daftar yang diizinkan untuk peran ini
    const isAllowed = availableTools.some(t => t.name === toolName);
    if (!isAllowed) {
      // Catat audit log ditolak
      db.execute({
        sql: `INSERT INTO mcp_audit_logs (user_id, role, endpoint, tool_name, status, duration_ms) VALUES (?, ?, ?, ?, 'denied', ?);`,
        args: [userId || null, role, endpointPath, toolName, Date.now() - startTime]
      }).catch(() => {});

      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32003,
          message: `Akses ditolak: Tool "${toolName}" tidak diizinkan untuk peran ${role}.`
        }
      };
    }

    try {
      const output = await executeMcpTool(toolName, toolArgs, context);
      const durationMs = Date.now() - startTime;

      // Catat audit log sukses
      db.execute({
        sql: `INSERT INTO mcp_audit_logs (user_id, role, endpoint, tool_name, status, duration_ms) VALUES (?, ?, ?, ?, 'ok', ?);`,
        args: [userId || null, role, endpointPath, toolName, durationMs]
      }).catch(() => {});

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof output === 'string' ? output : JSON.stringify(output, null, 2)
            }
          ],
          isError: false
        }
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;

      // Catat audit log error
      db.execute({
        sql: `INSERT INTO mcp_audit_logs (user_id, role, endpoint, tool_name, status, duration_ms) VALUES (?, ?, ?, ?, 'error', ?);`,
        args: [userId || null, role, endpointPath, toolName, durationMs]
      }).catch(() => {});

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error saat mengeksekusi tool "${toolName}": ${err.message}`
            }
          ],
          isError: true
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method "${method}" tidak didukung oleh Prospekta MCP server.` }
  };
}
