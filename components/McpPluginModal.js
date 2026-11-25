'use client';

import { useState, useEffect } from 'react';
import { IconCheck } from './icons';
import { ProspektaMark } from './ProspektaLogo';
import EmailConnectorSection from './EmailConnectorSection';

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
  const [activeEngine, setActiveEngine] = useState({
    activeSource: 'agnes',
    activeProvider: 'agnes',
    activeProviderName: 'Agnes AI (Bawaan Platform .env)',
    activeModel: 'gemini-flash-latest',
    agnesAvailable: true,
    agnesModel: 'gemini-flash-latest',
  });
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showRawKey, setShowRawKey] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMsg, setKeyMsg] = useState(null);
  const [emailSettings, setEmailSettings] = useState(null);

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
        setActiveEngine({
          activeSource: data.activeSource || null,
          activeProvider: data.activeProvider || null,
          activeProviderName: data.activeProviderName || null,
          activeModel: data.activeModel || null,
          agnesAvailable: Boolean(data.agnesAvailable),
          agnesModel: data.agnesModel || 'gemini-flash-latest',
        });
        if (data.activeProvider && data.activeProvider !== 'agnes') {
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
        setEmailSettings(data.settings);
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
      setActiveEngine((prev) => ({
        ...prev,
        activeSource: data.activeSource || 'byok',
        activeProvider: data.activeProvider || selectedProvider,
        activeProviderName: data.activeProviderName || prev.activeProviderName,
        activeModel: data.activeModel || prev.activeModel,
      }));
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
      setActiveEngine((prev) => ({
        ...prev,
        activeSource: data.activeSource || (provider === 'agnes' ? 'agnes' : 'byok'),
        activeProvider: data.activeProvider || provider,
        activeProviderName: data.activeProviderName || prev.activeProviderName,
        activeModel: data.activeModel || prev.activeModel,
      }));
      if (provider !== 'agnes') setSelectedProvider(provider);
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
      setActiveEngine((prev) => ({
        ...prev,
        activeSource: data.activeSource || prev.activeSource,
        activeProvider: data.activeProvider || null,
        activeProviderName: data.activeProviderName || null,
        activeModel: data.activeModel || null,
      }));
      setKeyMsg({ ok: true, text: data.message });
      onKeysChanged?.();
    } catch (err) {
      setKeyMsg({ ok: false, text: err.message });
    } finally {
      setKeyBusy(false);
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
                Pilih mesin AI bawaan platform (Agnes AI dari .env) atau gunakan API Key pribadi Anda (Gemini, OpenAI, atau Claude, terenkripsi AES-256-GCM).
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
            { id: 'ai_keys', label: 'Sumber AI & API Key' },
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
            {/* Pilihan Mode AI: Agnes Platform (.env) vs API Key Sendiri (BYOK) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: activeEngine.activeProvider === 'agnes' ? '1.5px solid var(--primary)' : '1px solid var(--border-subtle)',
                  background: activeEngine.activeProvider === 'agnes' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-app)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <strong style={{ fontSize: '0.85rem' }}>Agnes AI (Bawaan .env)</strong>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '9999px',
                        background: activeEngine.activeProvider === 'agnes' ? 'var(--success-bg)' : 'var(--bg-card)',
                        color: activeEngine.activeProvider === 'agnes' ? 'var(--success-text)' : 'var(--text-muted)',
                      }}
                    >
                      {activeEngine.activeProvider === 'agnes' ? 'Aktif' : (activeEngine.agnesAvailable ? 'Tersedia' : 'Belum Diatur')}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Gunakan AI bawaan platform Prospekta langsung tanpa memasukkan API Key pribadi.
                  </p>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${activeEngine.activeProvider === 'agnes' ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={keyBusy || !activeEngine.agnesAvailable || activeEngine.activeProvider === 'agnes'}
                  onClick={() => handleActivateProvider('agnes')}
                  style={{ minHeight: '36px', alignSelf: 'flex-start' }}
                >
                  {activeEngine.activeProvider === 'agnes' ? 'Sedang Digunakan' : 'Pakai Agnes AI (.env)'}
                </button>
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: activeEngine.activeSource === 'byok' ? '1.5px solid var(--primary)' : '1px solid var(--border-subtle)',
                  background: activeEngine.activeSource === 'byok' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-app)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <strong style={{ fontSize: '0.85rem' }}>API Key Sendiri (BYOK)</strong>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '9999px',
                        background: activeEngine.activeSource === 'byok' ? 'var(--success-bg)' : 'var(--bg-card)',
                        color: activeEngine.activeSource === 'byok' ? 'var(--success-text)' : 'var(--text-muted)',
                      }}
                    >
                      {activeEngine.activeSource === 'byok' ? `Aktif: ${activeEngine.activeProviderName}` : `${savedKeys.length} Tersimpan`}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Pakai kuota &amp; model Gemini, OpenAI, atau Claude dari akun API Anda sendiri.
                  </p>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {savedKeys.length > 0
                    ? 'Pilih tombol "Aktifkan" pada daftar key di bawah atau tambah key baru.'
                    : 'Masukkan API Key pada form di bawah ini untuk memakai BYOK.'}
                </span>
              </div>
            </div>

            {keyMsg && (
              <div
                role="status"
                style={{
                  background: keyMsg.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
                  border: `1px solid ${keyMsg.ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
                  color: keyMsg.ok ? 'var(--success-text)' : 'var(--danger-text)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                }}
              >
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
                      {p.name} ({p.modelLabel || 'Otomatis Model Terbaru'})
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
                        <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>
                          Buka Konsol Key
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
                  {activeEngine.agnesAvailable
                    ? 'Belum ada API Key pribadi tersimpan. Saat ini Anda memakai Agnes AI bawaan (.env), atau tambah API Key Anda sendiri di form atas.'
                    : 'Belum ada API Key yang tersimpan. Simpan minimal 1 key di atas untuk mengaktifkan Prospekta AI Assistant.'}
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
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--success-text)' }}>
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
                            style={{ minHeight: '36px', color: 'var(--danger-text)' }}
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
          <EmailConnectorSection
            initialSettings={emailSettings}
            onSettingsChange={(next) => {
              if (next) setEmailSettings(next);
            }}
            idPrefix="ai-hub-email"
          />
        )}
      </div>
    </div>
  );
}
