'use client';

import { useState, useEffect } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { IconCheck } from './icons';
import { ProspektaMark } from './ProspektaLogo';

const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
);

export default function McpPluginModal({ onClose, currentSession }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState('');
  const [newToken, setNewToken] = useState(null);
  const [label, setLabel] = useState('Plugin AI Utama');
  const [generating, setGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeTab, setActiveTab] = useState('tokens');

  const [emailConn, setEmailConn] = useState({
    email_address: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    password: '',
    passwordSet: false,
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  const role = currentSession?.role || 'user';
  const isAdmin = role === 'admin';
  const endpointPath = isAdmin ? '/api/mcp/admin' : '/api/mcp/user';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://prospektas.vercel.app';
  const fullMcpUrl = `${origin}${endpointPath}`;
  const openApiUrl = `${origin}/api/mcp/openapi.json?scope=${role}`;

  useEffect(() => {
    fetchTokens();
    fetchEmailSettings();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fetchTokens = async () => {
    try {
      setLoading(true);
      setTokenError('');
      const res = await fetch('/api/mcp/tokens');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal memuat daftar token MCP.');
      }
      setTokens(data.tokens || []);
    } catch (err) {
      setTokenError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmailSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings;
        setEmailConn((prev) => ({
          ...prev,
          email_address: s.smtp_from || s.smtp_user || '',
          smtp_host: s.smtp_host || 'smtp.gmail.com',
          smtp_port: Number(s.smtp_port) || 587,
          passwordSet: Boolean(s.smtp_pass_set),
        }));
      }
    } catch (_) {}
  };

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    try {
      setGenerating(true);
      setTokenError('');
      const res = await fetch('/api/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal membuat token MCP baru.');
      }
      setNewToken(data.token);
      fetchTokens();
    } catch (err) {
      setTokenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Yakin ingin mencabut token MCP ini? Klien AI yang menggunakannya tidak akan bisa mengakses lagi.')) return;
    try {
      setTokenError('');
      const res = await fetch(`/api/mcp/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal mencabut token.');
      }
      fetchTokens();
    } catch (err) {
      setTokenError(err.message);
    }
  };

  const handleSaveEmailConnector = async (e) => {
    e.preventDefault();
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      const payload = {
        smtp_host: emailConn.smtp_host.trim(),
        smtp_port: Number(emailConn.smtp_port) || 587,
        smtp_user: emailConn.email_address.trim(),
        smtp_from: emailConn.email_address.trim(),
      };
      if (emailConn.password.trim()) {
        payload.smtp_pass = emailConn.password.trim();
      }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan SMTP.');
      }
      setEmailConn((prev) => ({ ...prev, password: '', passwordSet: Boolean(data.settings?.smtp_pass_set ?? prev.passwordSet) }));
      setEmailMsg({ ok: true, text: 'Pengaturan konektor email MCP berhasil disimpan.' });
    } catch (err) {
      setEmailMsg({ ok: false, text: err.message });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleCopy = async (text, key) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const codeBoxStyle = {
    flex: 1,
    padding: '8px 10px',
    background: 'var(--bg-card)',
    color: 'var(--text-main)',
    borderRadius: '6px',
    border: '1px solid var(--border-subtle)',
    fontSize: '0.8rem',
    wordBreak: 'break-all',
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mcp-plugin-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '760px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header" style={{ alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
            <ProspektaMark size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 id="mcp-plugin-modal-title" className="modal-title" style={{ margin: 0, fontSize: '1.15rem' }}>
                  Prospekta Universal MCP Hub
                </h2>
                <span className={`reach-tab-pill-${isAdmin ? 'success' : 'primary'}`} style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>
                  Role: {role}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Hubungkan data prospek, PDF proposal, website preview, &amp; AI Agent ke Gemini, ChatGPT, Claude, atau klien MCP lainnya.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            aria-label="Tutup modal"
            style={{ minHeight: '36px', minWidth: '36px', flexShrink: 0 }}
          >
            &times;
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'tokens', label: 'Token Akses MCP' },
            { id: 'gemini', label: 'Gemini / Antigravity' },
            { id: 'gpt', label: 'ChatGPT (Custom GPT)' },
            { id: 'claude', label: 'Claude / Cursor' },
            { id: 'email', label: 'Konektor Email MCP' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', minHeight: '36px' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'tokens' && (
          <div>
            {tokenError && (
              <div role="alert" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#ef4444', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                {tokenError}
              </div>
            )}

            <form onSubmit={handleGenerateToken} style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="text-input"
                aria-label="Label token MCP"
                placeholder="Label token (contoh: Gemini CLI / ChatGPT Pro)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                style={{ flex: '1 1 220px', minHeight: '38px' }}
                required
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={generating} style={{ minHeight: '38px' }}>
                {generating ? 'Membuat...' : '+ Buat Token Baru'}
              </button>
            </form>

            {newToken && (
              <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.35)', padding: '12px', borderRadius: '8px', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, color: '#10b981', fontSize: '0.875rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconCheck size={14} />
                  <span>Token Berhasil Dibuat (simpan sekarang, hanya tampil sekali):</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <code style={{ ...codeBoxStyle, fontWeight: 700 }}>
                    {newToken}
                  </code>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopy(newToken, 'new_tok')}
                    style={{ minHeight: '36px' }}
                  >
                    {copiedKey === 'new_tok' ? <><IconCheck size={13} /> Tersalin</> : <><IconCopy /> Salin</>}
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-main)' }}>
              Daftar Token Aktif ({tokens.length})
            </div>
            {loading ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Memuat token...</div>
            ) : tokens.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)', borderRadius: '8px', fontSize: '0.84rem' }}>
                Belum ada token MCP yang dibuat. Klik tombol di atas untuk membuat token pertama Anda.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tokens.map((tok) => (
                  <div key={tok.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-main)' }}>{tok.label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Prefix: <code>{tok.token_prefix}</code> &bull; Scope: <strong>{tok.scope}</strong> &bull; Dibuat: {new Date(tok.created_at).toLocaleDateString('id-ID')}
                      </div>
                    </div>
                    {tok.revoked_at ? (
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>Dicabut</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)', fontSize: '0.75rem', minHeight: '36px' }}
                        onClick={() => handleRevoke(tok.id)}
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

        {activeTab === 'gemini' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-main)' }}>
            <p style={{ marginTop: 0 }}>Untuk menghubungkan Prospekta MCP ke <strong>Google Antigravity / Gemini CLI</strong>:</p>
            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '6px' }}>Endpoint URL:</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={codeBoxStyle}>{fullMcpUrl}</code>
                <button type="button" className="btn btn-secondary btn-sm" style={{ minHeight: '36px' }} onClick={() => handleCopy(fullMcpUrl, 'gem_url')}>
                  {copiedKey === 'gem_url' ? 'Tersalin' : 'Salin'}
                </button>
              </div>
            </div>

            <p style={{ fontWeight: 600, margin: '8px 0 6px' }}>Konfigurasi <code>settings.json</code> atau <code>mcp_config.json</code>:</p>
            <pre style={{ background: '#090d16', color: '#38bdf8', padding: '12px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto', margin: 0 }}>
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

        {activeTab === 'gpt' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-main)' }}>
            <p style={{ marginTop: 0 }}>Untuk menghubungkan Prospekta ke <strong>ChatGPT (Custom GPT Actions)</strong>:</p>
            <ol style={{ paddingLeft: '1.25rem', margin: '0 0 1rem' }}>
              <li>Buka GPT Builder di ChatGPT &gt; Tab <strong>Configure</strong> &gt; Klik <strong>Create new action</strong>.</li>
              <li>Pilih opsi <strong>Import from URL</strong> dan masukkan URL skema OpenAPI di bawah:</li>
            </ol>

            <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '6px' }}>OpenAPI Schema URL:</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={codeBoxStyle}>{openApiUrl}</code>
                <button type="button" className="btn btn-secondary btn-sm" style={{ minHeight: '36px' }} onClick={() => handleCopy(openApiUrl, 'gpt_url')}>
                  {copiedKey === 'gpt_url' ? 'Tersalin' : 'Salin'}
                </button>
              </div>
            </div>

            <p style={{ marginBottom: 0 }}>3. Di bagian <strong>Authentication</strong>, pilih tipe <strong>Bearer</strong> dan tempelkan token MCP Anda (<code>{isAdmin ? 'psk_adm_...' : 'psk_usr_...'}</code>).</p>
          </div>
        )}

        {activeTab === 'claude' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-main)' }}>
            <p style={{ marginTop: 0 }}>Untuk menghubungkan ke <strong>Claude Desktop</strong> atau <strong>Cursor IDE</strong>:</p>
            <pre style={{ background: '#090d16', color: '#38bdf8', padding: '12px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto', margin: 0 }}>
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

        {activeTab === 'email' && (
          <form onSubmit={handleSaveEmailConnector} style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-main)' }}>
            <p style={{ margin: '0 0 10px' }}>
              <strong>Konektor Email Workspace:</strong> Simpan kredensial SMTP resmi agar AI Agent dan fitur outreach menggunakan pengirim Anda.
            </p>
            {emailMsg && (
              <div role="status" style={{ background: emailMsg.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', border: `1px solid ${emailMsg.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`, color: emailMsg.ok ? '#10b981' : '#ef4444', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8125rem', marginBottom: '10px' }}>
                {emailMsg.text}
              </div>
            )}
            <div style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ marginBottom: '10px' }}>
                <label htmlFor="mcp-smtp-email" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Alamat Email Pengirim (SMTP User / From)</label>
                <input
                  id="mcp-smtp-email"
                  type="email"
                  className="text-input"
                  placeholder="anda@perusahaan.com"
                  value={emailConn.email_address}
                  onChange={(e) => setEmailConn({ ...emailConn, email_address: e.target.value })}
                  style={{ width: '100%', minHeight: '38px' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 180px' }}>
                  <label htmlFor="mcp-smtp-host" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>SMTP Host</label>
                  <input
                    id="mcp-smtp-host"
                    type="text"
                    className="text-input"
                    placeholder="smtp.gmail.com"
                    value={emailConn.smtp_host}
                    onChange={(e) => setEmailConn({ ...emailConn, smtp_host: e.target.value })}
                    style={{ width: '100%', minHeight: '38px' }}
                    required
                  />
                </div>
                <div style={{ flex: '1 1 90px' }}>
                  <label htmlFor="mcp-smtp-port" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Port</label>
                  <input
                    id="mcp-smtp-port"
                    type="number"
                    className="text-input"
                    value={emailConn.smtp_port}
                    onChange={(e) => setEmailConn({ ...emailConn, smtp_port: parseInt(e.target.value, 10) || 587 })}
                    style={{ width: '100%', minHeight: '38px' }}
                    required
                  />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor="mcp-smtp-pass" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                  App Password {emailConn.passwordSet && <span style={{ color: '#10b981', fontWeight: 500 }}>(Sudah tersimpan &bull; kosongkan jika tidak diubah)</span>}
                </label>
                <input
                  id="mcp-smtp-pass"
                  type="password"
                  className="text-input"
                  placeholder={emailConn.passwordSet ? 'Kosongkan untuk tetap pakai password lama' : 'Masukkan App Password'}
                  value={emailConn.password}
                  onChange={(e) => setEmailConn({ ...emailConn, password: e.target.value })}
                  style={{ width: '100%', minHeight: '38px' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={emailSaving}
                  style={{ minHeight: '38px' }}
                >
                  {emailSaving ? 'Menyimpan...' : 'Simpan Konektor'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
