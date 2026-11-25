'use client';

import { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { ProspektaMark } from './ProspektaLogo';

const QUICK_PROMPTS = [
  'Scan bisnis baru di radius area aktif',
  'Filter ke tabel prospek yang belum punya website',
  'Analisis mendalam & buat proposal untuk prospek teratas',
  'Buat website preview untuk prospek tanpa website',
];

const MUTATING_TOOLS = new Set([
  'scan_area_prospects',
  'analyze_prospect',
  'update_prospect_status',
  'update_prospect_contact',
  'generate_proposal_pdf',
  'generate_website_preview',
  'send_email_outreach',
]);

export default function AiAssistantPanel({
  activeAnchor,
  radiusKm,
  onOpenAiSettings,
  onDataChanged,
  onUiAction,
  refreshKey = 0,
  isOpen = false,
  onToggleOpen,
}) {
  const [status, setStatus] = useState({ loading: true, configured: false, provider: null, providerName: null, model: null, modelLabel: '', savedProviders: [] });
  const [selectedProvider, setSelectedProvider] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [liveStatus, setLiveStatus] = useState('');
  const [wide, setWide] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const endRef = useRef(null);

  const loadAiStatus = async () => {
    try {
      const res = await fetch('/api/ai-chat');
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus({ loading: false, ...data });
        setSelectedProvider(data.provider || '');
      } else {
        setStatus((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    loadAiStatus();
  }, [refreshKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveStatus, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onToggleOpen?.(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onToggleOpen]);

  const handleProviderSwitch = (nextProvider) => {
    setSelectedProvider(nextProvider);
  };

  const currentProviderObj = (status.savedProviders || []).find((p) => p.provider === selectedProvider) || null;

  const sendPrompt = async (promptText) => {
    const clean = String(promptText || '').trim();
    if (!clean || sending) return;

    const userMsg = { id: `u_${Date.now()}`, role: 'user', content: clean };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);
    setLiveStatus('Menghubungkan ke Prospekta AI...');

    let refreshed = false;

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
        },
        body: JSON.stringify({
          provider: selectedProvider || undefined,
          model: 'auto',
          messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
          context: {
            activeAnchor: activeAnchor ? { id: activeAnchor.id, name: activeAnchor.name, city: activeAnchor.city } : null,
            radiusKm: radiusKm || 2,
          },
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        setMessages((prev) => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: 'assistant',
            content: data.message || data.error || 'Gagal memproses permintaan AI.',
            requiresApiKey: Boolean(data.requiresApiKey),
            isError: true,
          },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const streamedTools = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt;
          try { evt = JSON.parse(line); } catch { continue; }

          if (evt.type === 'status') {
            setLiveStatus(evt.text || '');
          } else if (evt.type === 'tool') {
            streamedTools.push({ name: evt.tool, summary: evt.summary, output: evt.output });
            if (evt.output?.uiAction) {
              onUiAction?.(evt.output.uiAction);
            }
            if (MUTATING_TOOLS.has(evt.tool) && !refreshed) {
              refreshed = true;
              onDataChanged?.();
            }
          } else if (evt.type === 'done') {
            setMessages((prev) => [
              ...prev,
              {
                id: `a_${Date.now()}`,
                role: 'assistant',
                content: evt.reply || '',
                providerName: evt.providerName,
                model: evt.model,
                toolCalls: evt.toolCalls?.length ? evt.toolCalls : streamedTools,
              },
            ]);
          } else if (evt.type === 'error') {
            setMessages((prev) => [
              ...prev,
              {
                id: `a_${Date.now()}`,
                role: 'assistant',
                content: evt.error || 'Gagal menghubungi AI.',
                isError: true,
              },
            ]);
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', content: err.message || 'Koneksi terputus.', isError: true },
      ]);
    } finally {
      setSending(false);
      setLiveStatus('');
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="prospekta-ai-launcher"
        onClick={() => onToggleOpen?.(true)}
        aria-label="Buka Prospekta AI Assistant"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          minHeight: '44px',
          borderRadius: '9999px',
          border: '1px solid var(--border-focus)',
          background: 'var(--bg-card)',
          color: 'var(--text-main)',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.22)',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '0.84rem',
        }}
      >
        <ProspektaMark size={22} />
        <span>AI Assistant</span>
        <span
          aria-hidden="true"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: status.configured ? '#10b981' : '#d97706',
          }}
        />
      </button>
    );
  }

  return (
    <aside
      aria-label="Prospekta AI Assistant"
      className="prospekta-ai-drawer"
      style={{
        width: wide ? 'min(680px, calc(100vw - 24px))' : 'min(440px, calc(100vw - 24px))',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)',
        color: 'var(--text-main)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '14px',
        boxShadow: '0 20px 50px rgba(2, 6, 23, 0.35)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'var(--bg-app)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <ProspektaMark size={28} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Prospekta AI Assistant</span>
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: status.configured ? 'var(--success-text)' : 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.configured ? '#10b981' : '#d97706' }} />
              {status.configured ? (
                <span>
                  {currentProviderObj?.name || status.providerName} &bull; {status.model ? `${status.model} (Otomatis)` : (currentProviderObj?.modelLabel || 'Model Terbaru')}
                </span>
              ) : (
                <span>API Key belum terhubung</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenAiSettings}
            style={{ minHeight: '36px', fontSize: '0.74rem', padding: '0 10px' }}
          >
            API Key
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setWide((v) => !v)}
            title={wide ? 'Perkecil panel' : 'Perluas panel'}
            aria-label={wide ? 'Perkecil panel' : 'Perluas panel'}
            style={{ minHeight: '36px', minWidth: '36px', padding: '0 8px', fontSize: '0.78rem' }}
          >
            {wide ? '◱' : '⛶'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onToggleOpen?.(false)}
            aria-label="Tutup panel AI"
            style={{ minHeight: '36px', minWidth: '36px', padding: '0 8px' }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Active Provider/Model + Area Context Bar */}
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
        <span>
          Area: <strong style={{ color: 'var(--text-main)' }}>{activeAnchor?.name || 'Semua Area'}</strong> ({radiusKm || 2} km)
        </span>
        {status.configured && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {status.savedProviders?.length > 1 && (
              <select
                aria-label="Pilih provider aktif"
                value={selectedProvider}
                onChange={(e) => handleProviderSwitch(e.target.value)}
                style={{ background: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.74rem', minHeight: '36px' }}
              >
                {status.savedProviders.map((sp) => (
                  <option key={sp.provider} value={sp.provider}>{sp.name} (Latest)</option>
                ))}
              </select>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.74rem', textDecoration: 'underline', padding: '4px 6px', minHeight: '36px' }}
              >
                Reset Chat
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chat Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {!status.loading && !status.configured && messages.length === 0 && (
          <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px', fontSize: '0.82rem', lineHeight: 1.55 }}>
            <strong style={{ display: 'block', marginBottom: '6px', fontSize: '0.88rem' }}>Hubungkan API Key AI Anda (BYOK)</strong>
            <p style={{ margin: '0 0 12px', color: 'var(--text-muted)' }}>
              Masukkan API Key Gemini, OpenAI, atau Claude langsung di akun Prospekta untuk mencari prospek, membuat draf proposal PDF, dan membangun website preview tanpa pengaturan komputer lokal.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onOpenAiSettings}
              style={{ minHeight: '38px' }}
            >
              Atur API Key Sekarang
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Perintah Cepat:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendPrompt(q)}
                  disabled={sending}
                  style={{
                    textAlign: 'left',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-app)',
                    color: 'var(--text-main)',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    minHeight: '38px',
                  }}
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const previewUrls = (msg.toolCalls || [])
            .map((t) => t.output?.previewUrl)
            .filter(Boolean);
          const proposalTool = (msg.toolCalls || []).find((t) => t.name === 'generate_proposal_pdf' && t.output?.contentMarkdown);
          const topProspect = (msg.toolCalls || []).find((t) => t.output?.placeId || t.output?.overture_id);
          const actionablePlaceId = topProspect?.output?.placeId || topProspect?.output?.overture_id || null;
          const actionablePlaceName = topProspect?.output?.placeName || topProspect?.output?.name || topProspect?.output?.companyName || '';

          return (
            <div
              key={msg.id}
              style={{
                alignSelf: isUser ? 'flex-end' : 'stretch',
                maxWidth: isUser ? '86%' : '100%',
                background: isUser ? 'var(--primary)' : (msg.isError ? 'var(--danger-bg)' : 'var(--bg-app)'),
                color: isUser ? '#ffffff' : (msg.isError ? 'var(--danger-text)' : 'var(--text-main)'),
                border: isUser ? 'none' : `1px solid ${msg.isError ? 'var(--danger-border)' : 'var(--border-subtle)'}`,
                padding: '10px 12px',
                borderRadius: '10px',
                fontSize: '0.825rem',
                lineHeight: 1.55,
              }}
            >
              {!isUser && msg.toolCalls?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {msg.toolCalls.map((tc, idx) => (
                    <span
                      key={`${tc.name}_${idx}`}
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {tc.summary}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>

              {msg.requiresApiKey && (
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={onOpenAiSettings}
                    style={{ minHeight: '36px' }}
                  >
                    Hubungkan API Key
                  </button>
                </div>
              )}

              {(previewUrls.length > 0 || proposalTool || actionablePlaceId) && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                  {actionablePlaceId && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onUiAction?.({ type: 'open_place_by_id', placeId: actionablePlaceId, name: actionablePlaceName })}
                      style={{ minHeight: '36px', fontSize: '0.74rem' }}
                    >
                      Buka Detail {actionablePlaceName || 'Prospek'}
                    </button>
                  )}
                  {previewUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ minHeight: '36px', fontSize: '0.74rem', textDecoration: 'none' }}
                    >
                      Buka Preview {url}
                    </a>
                  ))}
                  {proposalTool && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        const ok = await copyToClipboard(proposalTool.output.contentMarkdown);
                        if (ok) {
                          setCopiedId(msg.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }
                      }}
                      style={{ minHeight: '36px', fontSize: '0.74rem' }}
                    >
                      {copiedId === msg.id ? 'Proposal Tersalin' : 'Salin Draf Proposal'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {sending && (
          <div role="status" style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
            <span>{liveStatus || 'Sedang memproses...'}</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendPrompt(input);
        }}
        style={{ padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-app)', display: 'flex', gap: '8px', alignItems: 'center' }}
      >
        <input
          type="text"
          className="text-input"
          aria-label="Tulis instruksi untuk AI Assistant"
          placeholder="Tanya tentang prospek area ini, buat proposal, atau website..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          style={{ flex: 1, minHeight: '40px' }}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={sending || !input.trim()}
          style={{ minHeight: '40px', padding: '0 14px', flexShrink: 0 }}
        >
          {sending ? 'Proses...' : 'Kirim'}
        </button>
      </form>
    </aside>
  );
}
