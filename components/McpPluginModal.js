'use client';

import { useState, useEffect } from 'react';
import { IconCheck } from './icons';
import { ProspektaMark } from './ProspektaLogo';

const DEFAULT_PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'auto',
    modelLabel: 'Otomatis Model Terbaru (Flash Latest)',
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/apikey',
    guide: 'Buka Google AI Studio -> Create API Key -> pilih project Google Cloud -> salin API key berawalan AIza.',
  },
  {
    id: 'openai',
    name: 'OpenAI ChatGPT',
    defaultModel: 'auto',
    modelLabel: 'Otomatis Model Terbaru (GPT Latest)',
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    guide: 'Buka OpenAI Platform -> API Keys -> Create new secret key -> salin secret key berawalan sk-.',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    defaultModel: 'auto',
    modelLabel: 'Otomatis Model Terbaru (Claude Latest)',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    guide: 'Buka Anthropic Console -> Settings -> API Keys -> Create Key -> salin key berawalan sk-ant-.',
  },
];

export default function McpPluginModal({ onClose, currentSession, onKeysChanged, initialTab = 'ai_keys' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  // BYOK AI Keys state
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS);
  const [savedKeys, setSavedKeys] = useState([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showRawKey, setShowRawKey] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMsg, setKeyMsg] = useState(null);

  // Email Connector state
  const [emailConn, setEmailConn] = useState({
    mode: 'gmail_mcp',
    mcpEmail: '',
    mcpAccount: '',
    mcpConnected: false,
    testTo: '',
    email_address: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    password: '',
    passwordSet: false,
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  const role = currentSession?.role || 'user';
  const isAdmin = role === 'admin';
  const providerMeta = providers.find((p) => p.id === selectedProvider) || DEFAULT_PROVIDERS[0];

  useEffect(() => {
    fetchAiKeys();
    fetchEmailSettings();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const applyEmailSettings = (s) => {
    if (!s) return;
    const isConnected = Boolean(s.gmail_mcp_connected && s.gmail_mcp_account);
    setEmailConn((prev) => ({
      ...prev,
      mode: s.email_provider_mode === 'gmail_mcp'
        ? 'gmail_mcp'
        : (s.email_provider_mode === 'smtp' ? 'smtp' : prev.mode),
      mcpEmail: isConnected ? s.gmail_mcp_account : '',
      mcpAccount: isConnected ? s.gmail_mcp_account : '',
      mcpConnected: isConnected,
      email_address: s.smtp_from || s.smtp_user || '',
      smtp_host: s.smtp_host || 'smtp.gmail.com',
      smtp_port: Number(s.smtp_port) || 587,
      password: '',
      passwordSet: Boolean(s.smtp_pass_set),
    }));
  };

  const fetchAiKeys = async () => {
    try {
      setKeysLoading(true);
      const res = await fetch('/api/ai-settings');
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.providers) && data.providers.length > 0) {
          setProviders(data.providers);
        }
        setSavedKeys(data.keys || []);
        if (data.activeProvider) {
          setSelectedProvider(data.activeProvider);
        }
      }
    } catch (_) {
    } finally {
      setKeysLoading(false);
    }
  };

  const fetchEmailSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.settings) {
        applyEmailSettings(data.settings);
      }
    } catch (_) {}
  };

  const handleSaveAiKey = async (e) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setKeyBusy(true);
    setKeyMsg(null);
    try {
      const res = await fetch('/api/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: apiKeyInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menguji atau menyimpan API Key.');
      }
      setSavedKeys(data.keys || []);
      setApiKeyInput('');
      setShowRawKey(false);
      setKeyMsg({ ok: true, text: data.message });
      onKeysChanged?.();
    } catch (err) {
      setKeyMsg({ ok: false, text: err.message });
    } finally {
      setKeyBusy(false);
    }
  };

  const handleActivateProvider = async (provider) => {
    setKeyBusy(true);
    setKeyMsg(null);
    try {
      const res = await fetch('/api/ai-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal mengganti provider aktif.');
      setSavedKeys(data.keys || []);
      setSelectedProvider(provider);
      setKeyMsg({ ok: true, text: data.message });
      onKeysChanged?.();
    } catch (err) {
      setKeyMsg({ ok: false, text: err.message });
    } finally {
      setKeyBusy(false);
    }
  };

  const handleDeleteKey = async (provider) => {
    const label = providers.find((p) => p.id === provider)?.name || provider;
    if (!confirm(`Hapus API Key ${label} dari akun Anda?`)) return;
    setKeyBusy(true);
    setKeyMsg(null);
    try {
      const res = await fetch(`/api/ai-settings?provider=${encodeURIComponent(provider)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menghapus API Key.');
      setSavedKeys(data.keys || []);
      setKeyMsg({ ok: true, text: data.message });
      onKeysChanged?.();
    } catch (err) {
      setKeyMsg({ ok: false, text: err.message });
    } finally {
      setKeyBusy(false);
    }
  };

  const handleSaveEmailConnector = async (e) => {
    e.preventDefault();
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      const payload = {
        email_provider_mode: 'smtp',
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
      applyEmailSettings(data.settings);
      setEmailMsg({ ok: true, text: 'Pengaturan konektor SMTP berhasil disimpan dan diaktifkan.' });
    } catch (err) {
      setEmailMsg({ ok: false, text: err.message });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleMcpEmailAction = async (action, extra = {}) => {
    const isTest = action === 'test_mcp' || action === 'test_smtp';
    if (isTest) setEmailTesting(true);
    else setEmailSaving(true);
    setEmailMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Operasi konektor email gagal.');
      }
      if (data.settings) applyEmailSettings(data.settings);
      setEmailMsg({ ok: true, text: data.message || 'Berhasil.' });
    } catch (err) {
      setEmailMsg({ ok: false, text: err.message });
    } finally {
      if (isTest) setEmailTesting(false);
      else setEmailSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-settings-modal-title"
      onClick={onClose}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '720px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header" style={{ alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
            <ProspektaMark size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 id="ai-settings-modal-title" className="modal-title" style={{ margin: 0, fontSize: '1.12rem' }}>
                  Pengaturan Integrasi AI (API Key)
                </h2>
                <span className={`reach-tab-pill-${isAdmin ? 'success' : 'primary'}`} style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}>
                  {currentSession?.email || role}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Hubungkan API Key Gemini, OpenAI, atau Claude langsung di akun Anda (enkripsi AES-256-GCM, tanpa konfigurasi file lokal).
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

        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'ai_keys', label: 'Kunci API AI (BYOK)' },
            { id: 'email', label: 'Konektor Email' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem', minHeight: '38px' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'ai_keys' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.875rem', color: 'var(--text-main)' }}>
            {keyMsg && (
              <div role="status" style={{ background: keyMsg.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', border: `1px solid ${keyMsg.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`, color: keyMsg.ok ? '#10b981' : '#ef4444', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8125rem' }}>
                {keyMsg.text}
              </div>
            )}

            <form
              onSubmit={handleSaveAiKey}
              style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div>
                <label htmlFor="ai-provider-select" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px' }}>
                  Pilih Penyedia AI
                </label>
                <select
                  id="ai-provider-select"
                  className="select-input"
                  value={selectedProvider}
                  onChange={(e) => {
                    setSelectedProvider(e.target.value);
                    setApiKeyInput('');
                    setKeyMsg(null);
                  }}
                  style={{ minHeight: '40px' }}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.modelLabel || 'Otomatis Model Terbaru'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ai-api-key-input" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '5px' }}>
                  API Key {providerMeta.name}
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    id="ai-api-key-input"
                    type={showRawKey ? 'text' : 'password'}
                    className="text-input"
                    autoComplete="off"
                    placeholder={`Masukkan API Key ${providerMeta.name} (${providerMeta.placeholder})`}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    style={{ flex: '1 1 260px', minHeight: '40px' }}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowRawKey((v) => !v)}
                    style={{ minHeight: '40px' }}
                  >
                    {showRawKey ? 'Tutup' : 'Lihat'}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={keyBusy || !apiKeyInput.trim()}
                    style={{ minHeight: '40px' }}
                  >
                    {keyBusy ? 'Menguji & Menyimpan...' : 'Test & Simpan Key'}
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Panduan Mendapatkan API Key (Semua Penyedia AI):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '8px' }}>
                  {providers.map((p) => {
                    const isCurrent = p.id === selectedProvider;
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: '9px 10px',
                          borderRadius: '8px',
                          border: isCurrent ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                          background: isCurrent ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-app)',
                          fontSize: '0.74rem',
                          lineHeight: 1.45,
                          color: 'var(--text-muted)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <strong style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>{p.name}</strong>
                          <code style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{p.placeholder}</code>
                        </div>
                        <p style={{ margin: '0 0 6px' }}>{p.guide}</p>
                        <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                          Buka Konsol Key &rarr;
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700 }}>
                  Kunci API Tersimpan ({savedKeys.length})
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Terisolasi khusus akun Anda
                </span>
              </div>

              {keysLoading ? (
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Memuat status kunci AI...</p>
              ) : savedKeys.length === 0 ? (
                <div style={{ padding: '14px', borderRadius: '8px', border: '1px dashed var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.8125rem', textAlign: 'center' }}>
                  Belum ada API Key yang tersimpan. Simpan minimal 1 key di atas untuk mengaktifkan Prospekta AI Assistant.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedKeys.map((item) => {
                    const meta = providers.find((p) => p.id === item.provider);
                    return (
                      <div
                        key={item.id || item.provider}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '10px',
                          flexWrap: 'wrap',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: item.is_active ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                          background: item.is_active ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-app)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.85rem' }}>{meta?.name || item.provider}</strong>
                            <code style={{ fontSize: '0.78rem', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                              {item.masked_key}
                            </code>
                            {item.is_active ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>
                                <IconCheck size={12} /> Terhubung &amp; Aktif
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tersimpan</span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Mode: {meta?.modelLabel || 'Otomatis Model Terbaru'}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          {!item.is_active && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={keyBusy}
                              onClick={() => handleActivateProvider(item.provider)}
                              style={{ minHeight: '36px' }}
                            >
                              Aktifkan
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={keyBusy}
                            onClick={() => handleDeleteKey(item.provider)}
                            style={{ minHeight: '36px', color: '#ef4444' }}
                          >
                            Hapus Key
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'email' && (
          <div style={{ fontSize: '0.875rem', lineHeight: 1.55, color: 'var(--text-main)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '12px' }}>
              {[
                {
                  id: 'gmail_mcp',
                  title: '1. Konektor Cepat (Email)',
                  badge: emailConn.mcpConnected ? 'Terhubung' : 'Praktis',
                  badgeColor: emailConn.mcpConnected ? '#10b981' : 'var(--primary)',
                  desc: 'Ketik alamat email Anda saja. Langsung terhubung tanpa App Password; balasan masuk ke email Anda.',
                },
                {
                  id: 'smtp',
                  title: '2. Server SMTP Mandiri',
                  badge: !emailConn.mcpConnected && emailConn.passwordSet ? 'Aktif' : 'Manual',
                  badgeColor: !emailConn.mcpConnected && emailConn.passwordSet ? '#10b981' : 'var(--text-muted)',
                  desc: 'Pakai SMTP Host & App Password akun Anda sendiri agar header From asli memakai email Anda.',
                },
              ].map((opt) => {
                const selected = emailConn.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setEmailConn((prev) => ({ ...prev, mode: opt.id }));
                      setEmailMsg(null);
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: selected ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                      background: selected ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-app)',
                      color: 'var(--text-main)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      minHeight: '44px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>{opt.title}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: opt.badgeColor }}>{opt.badge}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>

            {emailMsg && (
              <div role="status" style={{ background: emailMsg.ok ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', border: `1px solid ${emailMsg.ok ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`, color: emailMsg.ok ? '#10b981' : '#ef4444', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8125rem', marginBottom: '12px' }}>
                {emailMsg.text}
              </div>
            )}

            {emailConn.mode === 'gmail_mcp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleMcpEmailAction('connect_mcp', { email: emailConn.mcpEmail });
                  }}
                  style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
                >
                  {emailConn.mcpConnected && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, wordBreak: 'break-all' }}>
                          Terhubung: {emailConn.mcpAccount}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={emailSaving}
                        onClick={() => handleMcpEmailAction('disconnect_mcp')}
                        style={{ minHeight: '36px', color: '#ef4444' }}
                      >
                        Putus Koneksi
                      </button>
                    </div>
                  )}

                  <label htmlFor="mcp-quick-email" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                    Alamat Email Anda (Identitas Pengirim &amp; Balasan / Reply-To)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      id="mcp-quick-email"
                      type="email"
                      className="text-input"
                      placeholder="mis. yourname@gmail.com"
                      value={emailConn.mcpEmail}
                      onChange={(e) => setEmailConn({ ...emailConn, mcpEmail: e.target.value })}
                      style={{ flex: '1 1 240px', minHeight: '38px' }}
                      required
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={emailSaving || !emailConn.mcpEmail.trim()}
                      style={{ minHeight: '38px' }}
                    >
                      {emailSaving ? 'Menghubungkan...' : (emailConn.mcpConnected ? 'Perbarui Email' : 'Hubungkan Email')}
                    </button>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Email dikirim via relay Prospekta dengan tampilan nama &amp; header <strong>Reply-To</strong> memakai <strong>{emailConn.mcpEmail.trim() || 'email Anda'}</strong>, sehingga balasan penerima masuk ke inbox tersebut.
                  </p>
                </form>

                {emailConn.mcpConnected && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleMcpEmailAction('test_mcp', { target_email: emailConn.testTo });
                    }}
                    style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
                  >
                    <label htmlFor="mcp-quick-test-to" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      Uji Kirim Email ke Penerima Tujuan (To)
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        id="mcp-quick-test-to"
                        type="email"
                        className="text-input"
                        placeholder="mis. penerima@perusahaan.com"
                        value={emailConn.testTo}
                        onChange={(e) => setEmailConn({ ...emailConn, testTo: e.target.value })}
                        style={{ flex: '1 1 240px', minHeight: '38px' }}
                        required
                      />
                      <button
                        type="submit"
                        className="btn btn-secondary btn-sm"
                        disabled={emailTesting || !emailConn.testTo.trim()}
                        style={{ minHeight: '38px' }}
                      >
                        {emailTesting ? 'Mengirim...' : 'Kirim Email Uji Coba'}
                      </button>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                      Pengirim / Reply-To: <strong>{emailConn.mcpAccount}</strong> &rarr; Penerima: <strong>{emailConn.testTo.trim() || 'isi email penerima'}</strong>
                    </p>
                  </form>
                )}
              </div>
            )}

            {emailConn.mode === 'smtp' && (
              <form onSubmit={handleSaveEmailConnector} style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label htmlFor="mcp-smtp-email" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Alamat Email Pengirim (SMTP User / From)</label>
                  <input
                    id="mcp-smtp-email"
                    type="email"
                    className="text-input"
                    placeholder="anda@perusahaan.com atau anda@gmail.com"
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
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Untuk Gmail gunakan Sandi Aplikasi 16 karakter (port 587 TLS atau 465 SSL).
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={emailTesting || !emailConn.smtp_host.trim() || !emailConn.email_address.trim()}
                    onClick={() => handleMcpEmailAction('test_smtp', {
                      smtp_host: emailConn.smtp_host.trim(),
                      smtp_port: Number(emailConn.smtp_port) || 587,
                      smtp_user: emailConn.email_address.trim(),
                      smtp_from: emailConn.email_address.trim(),
                      ...(emailConn.password.trim() ? { smtp_pass: emailConn.password.trim() } : {}),
                    })}
                    style={{ minHeight: '38px' }}
                  >
                    {emailTesting ? 'Menguji...' : 'Tes Koneksi SMTP'}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={emailSaving}
                    style={{ minHeight: '38px' }}
                  >
                    {emailSaving ? 'Menyimpan...' : 'Simpan Konektor SMTP'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
