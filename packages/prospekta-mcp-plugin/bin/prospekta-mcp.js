#!/usr/bin/env node

/**
 * Prospekta Universal MCP Stdio-to-HTTP Bridge
 * Mengalirkan pesan JSON-RPC dari stdin ke Prospekta Core Server dan mengembalikan ke stdout.
 * Zero dependency - Memakai modul bawaan Node.js (readline & fetch).
 */

import readline from 'readline';

const MCP_URL = process.env.PROSPEKTA_MCP_URL || 'http://localhost:3000/customer-reach/api/mcp/user';
const MCP_TOKEN = process.env.PROSPEKTA_MCP_TOKEN || '';

if (!MCP_TOKEN) {
  process.stderr.write('[Prospekta MCP Bridge] Peringatan: PROSPEKTA_MCP_TOKEN belum diatur di environment.\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const jsonMsg = JSON.parse(trimmed);

    // Kirim JSON-RPC request ke endpoint Prospekta via HTTP POST
    const resp = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MCP_TOKEN}`,
        'User-Agent': 'Prospekta-MCP-Bridge/1.0.0'
      },
      body: JSON.stringify(jsonMsg)
    });

    if (resp.status === 204) {
      // Notification tanpa balasan
      return;
    }

    const result = await resp.json();
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: `Bridge error: ${err.message}`
      }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});
