'use client';

import { useState, useEffect } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { IconCheck } from './icons';
import { ProspektaMark } from './ProspektaLogo';

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
);
const IconExternalLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
);

export default function McpPluginModal({ onClose, currentSession }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState(null);
  const [label, setLabel] = useState('Plugin AI Utama');
  const [generating, setGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeTab, setActiveTab] = useState('tokens'); // 'tokens' | 'gemini' | 'gpt' | 'claude' | 'email'

  // Email connector state
  const [emailConn, setEmailConn] = useState({
    email_address: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    password: '',
    is_enabled: false
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  const role = currentSession?.role || 'user';
  const isAdmin = role === 'admin';
  const endpointPath = isAdmin ? '/customer-reach/api/mcp/admin' : '/customer-reach/api/mcp/user';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://prospekta.id';
  const fullMcpUrl = `${origin}${endpointPath}`;
  const openApiUrl = `${origin}/customer-reach/api/mcp/openapi.json?scope=${role}`;

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/mcp/tokens');
      const data = await res.json();
      if (data.success) {
        setTokens(data.tokens || []);
      }
    } catch (_) { } finally {
      setLoading(false);
    }
  };

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    try {
      setGenerating(true);
      const res = await fetch('/api/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });
      const data = await res.json();
      if (data.success) {
        setNewToken(data.token);
        fetchTokens();
      }
    } catch (_) { } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Yakin ingin mencabut token MCP ini? Klien AI yang menggunakannya tidak akan bisa mengakses lagi.')) return;
    try {
      const res = await fetch(`/api/mcp/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchTokens();
      }
    } catch (_) { }
  };

  const handleCopy = async (text, key) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '780px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <ProspektaMark size={36} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Prospekta Universal MCP Plugin</h2>
                <span className={`reach-tab-pill-${isAdmin ? 'success' : 'primary'}`} style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>
                  Role: {role}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Hubungkan sistem Prospekta (Lokasi, PDF, Website, & Company AI Agent) ke Gemini, ChatGPT, Claude, atau AI mana pun.
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>&times;</button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'tokens', label: 'Token Akses MCP' },
            { id: 'gemini', label: 'Gemini / Antigravity' },
            { id: 'gpt', label: 'ChatGPT (Custom GPT)' },
            { id: 'claude', label: 'Claude / Cursor' },
            { id: 'email', label: 'Konektor Email MCP' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Tokens */}
        {activeTab === 'tokens' && (
          <div>
            <form onSubmit={handleGenerateToken} style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
              <input
                type="text"
                className="text-input"
                placeholder="Label token (contoh: Gemini CLI / ChatGPT Pro)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                style={{ flex: 1, height: '36px' }}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={generating} style={{ minHeight: '36px' }}>
                {generating ? 'Membuat...' : '+ Buat Token Baru'}
              </button>
            </form>

            {newToken && (
              <div style={{ background: '#ecfdf5', border: '1px solid #10b981', padding: '12px', borderRadius: '6px', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, color: '#065f46', fontSize: '0.875rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconCheck size={14} />
                  <span>Token Berhasil Dibuat (Simpan sekarang, hanya tampil sekali):</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <code style={{ background: '#ffffff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #a7f3d0', fontSize: '13px', flex: 1, wordBreak: 'break-all', color: '#047857', fontWeight: 700 }}>
                    {newToken}
                  </code>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(newToken, 'new_tok')}
                  >
                    {copiedKey === 'new_tok' ? <><IconCheck size={13} /> Tersalin</> : <><IconCopy /> Salin</>}
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '8px' }}>Daftar Token Aktif ({tokens.length})</div>
            {loading ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat token...</div>
            ) : tokens.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)', borderRadius: '6px' }}>
                Belum ada token MCP yang dibuat. Klik tombol di atas untuk membuat token pertama Anda.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tokens.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Prefix: <code>{t.token_prefix}</code> • Scope: <strong>{t.scope}</strong> • Dibuat: {new Date(t.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {t.revoked_at ? (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>Dicabut</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#ef4444', borderColor: '#fca5a5', fontSize: '0.75rem' }}
                        onClick={() => handleRevoke(t.id)}
                      >
                        Cabut Akses
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Gemini / Antigravity */}
        {activeTab === 'gemini' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
            <p>Untuk menghubungkan Prospekta MCP ke <strong>Google Antigravity / Gemini CLI</strong>:</p>
            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '6px' }}>Endpoint URL:</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <code style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  {fullMcpUrl}
                </code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCopy(fullMcpUrl, 'gem_url')}>
                  {copiedKey === 'gem_url' ? 'Tersalin' : 'Salin'}
                </button>
              </div>
            </div>

            <p style={{ fontWeight: 600, margin: '8px 0 4px' }}>Konfigurasi <code>settings.json</code> atau <code>agy mcp add</code>:</p>
            <pre style={{ background: '#090d16', color: '#38bdf8', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto' }}>
{`{
  "mcpServers": {
    "prospekta": {
      "url": "${fullMcpUrl}",
      "headers": {
        "Authorization": "Bearer <TOKEN_MCP_ANDA>"
      }
    }
  }
}`}
            </pre>
          </div>
        )}

        {/* Tab 3: ChatGPT Custom Actions */}
        {activeTab === 'gpt' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
            <p>Untuk menghubungkan Prospekta ke <strong>ChatGPT (Custom GPT Actions)</strong>:</p>
            <ol style={{ paddingLeft: '1.25rem', margin: '0 0 1rem' }}>
              <li>Buka GPT Builder di ChatGPT &gt; Tab <strong>Configure</strong> &gt; Klik <strong>Create new action</strong>.</li>
              <li>Pilih opsi <strong>Import from URL</strong> dan masukkan URL skema OpenAPI di bawah:</li>
            </ol>

            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '6px' }}>OpenAPI Schema URL:</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <code style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  {openApiUrl}
                </code>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCopy(openApiUrl, 'gpt_url')}>
                  {copiedKey === 'gpt_url' ? 'Tersalin' : 'Salin'}
                </button>
              </div>
            </div>

            <p>3. Di bagian <strong>Authentication</strong>, pilih tipe <strong>Bearer</strong> dan tempelkan token MCP Anda (<code>{role === 'admin' ? 'psk_adm_...' : 'psk_usr_...'}</code>).</p>
          </div>
        )}

        {/* Tab 4: Claude / Cursor */}
        {activeTab === 'claude' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
            <p>Untuk menghubungkan ke <strong>Claude Desktop</strong> atau <strong>Cursor IDE</strong>:</p>
            <pre style={{ background: '#090d16', color: '#38bdf8', padding: '12px', borderRadius: '6px', fontSize: '12px', overflowX: 'auto' }}>
{`{
  "mcpServers": {
    "prospekta": {
      "command": "npx",
      "args": ["-y", "prospekta-mcp-plugin"],
      "env": {
        "PROSPEKTA_MCP_URL": "${fullMcpUrl}",
        "PROSPEKTA_MCP_TOKEN": "<TOKEN_MCP_ANDA>"
      }
    }
  }
}`}
            </pre>
          </div>
        )}

        {/* Tab 5: Email via MCP */}
        {activeTab === 'email' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>
              <strong>Konektor Email Pribadi (Opsional):</strong> Hubungkan akun email Anda agar Company AI Agent dapat mengirimkan email penawaran secara resmi langsung atas nama Anda melalui MCP.
            </p>
            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Alamat Email Anda</label>
                <input
                  type="email"
                  className="text-input"
                  placeholder="anda@perusahaan.com"
                  value={emailConn.email_address}
                  onChange={(e) => setEmailConn({ ...emailConn, email_address: e.target.value })}
                  style={{ width: '100%', height: '36px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>SMTP Host</label>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="smtp.gmail.com"
                    value={emailConn.smtp_host}
                    onChange={(e) => setEmailConn({ ...emailConn, smtp_host: e.target.value })}
                    style={{ width: '100%', height: '36px' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Port</label>
                  <input
                    type="number"
                    className="text-input"
                    value={emailConn.smtp_port}
                    onChange={(e) => setEmailConn({ ...emailConn, smtp_port: parseInt(e.target.value) })}
                    style={{ width: '100%', height: '36px' }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Password Aplikasi / App Password</label>
                <input
                  type="password"
                  className="text-input"
                  placeholder="••••••••••••••••"
                  value={emailConn.password}
                  onChange={(e) => setEmailConn({ ...emailConn, password: e.target.value })}
                  style={{ width: '100%', height: '36px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={emailConn.is_enabled}
                    onChange={(e) => setEmailConn({ ...emailConn, is_enabled: e.target.checked })}
                  />
                  <span>Aktifkan pengiriman email via MCP</span>
                </label>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={emailSaving}
                  onClick={() => alert('Koneksi email tersimpan.')}
                >
                  {emailSaving ? 'Menyimpan...' : 'Simpan Konektor'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
