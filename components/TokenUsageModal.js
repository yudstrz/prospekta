'use client';

import React, { useState, useEffect } from 'react';

export default function TokenUsageModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live Token Calculator State
  const [calcText, setCalcText] = useState('');
  const [calcResult, setCalcResult] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const fetchTokenSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reach/tokens');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Gagal memuat data token');
      setData(json.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenSummary();

    // Close on Escape key (R-32 accessibility)
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCalculateTokens = async (e) => {
    e.preventDefault();
    if (!calcText.trim()) return;
    setIsCalculating(true);
    try {
      const res = await fetch('/api/reach/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: calcText })
      });
      const resJson = await res.json();
      if (resJson.success) {
        setCalcResult(resJson);
      }
    } catch (err) {
      console.warn('Calc error:', err);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8fafc'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                <path d="M12 18V6" />
              </svg>
            </span>
            <div>
              <h2 id="token-modal-title" style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
                Monitoring Penggunaan Token AI
              </h2>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                Penghitungan resmi dengan library tiktoken (OpenAI) dan metrik Google Gemini
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela"
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '0.375rem',
              borderRadius: '6px'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#64748b' }}>
              Memuat data penghitungan token resmi...
            </div>
          )}

          {error && (
            <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.875rem' }}>
              Gagal memuat token: {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Grand Total Highlights */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem'
                }}
              >
                <div
                  style={{
                    padding: '1.125rem',
                    borderRadius: '10px',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total Token Terpakai
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e3a8a', marginTop: '0.25rem' }}>
                    {(data.total_tokens || 0).toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#3b82f6', marginTop: '0.25rem' }}>
                    Dari {data.total_calls || 0} kali eksekusi AI resmi
                  </div>
                </div>

                <div
                  style={{
                    padding: '1.125rem',
                    borderRadius: '10px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0'
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Estimasi Biaya API
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#14532d', marginTop: '0.25rem' }}>
                    ${(data.total_cost_usd || 0).toFixed(4)} <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>USD</span>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#16a34a', marginTop: '0.25rem' }}>
                    Tarif resmi OpenAI & Google Cloud
                  </div>
                </div>
              </div>

              {/* Provider Breakdown Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {/* OpenAI Card */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', backgroundColor: '#ffffff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.625rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                      <strong style={{ fontSize: '0.9375rem', color: '#0f172a' }}>OpenAI (gpt-4o-mini)</strong>
                    </div>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 6px', backgroundColor: '#f1f5f9', color: '#475569', borderRadius: '4px' }}>
                      Primary
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                      <span>Input / Prompt:</span>
                      <strong style={{ color: '#0f172a' }}>{(data.openai?.prompt_tokens || 0).toLocaleString('id-ID')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                      <span>Output / Completion:</span>
                      <strong style={{ color: '#0f172a' }}>{(data.openai?.completion_tokens || 0).toLocaleString('id-ID')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', borderTop: '1px dashed #e2e8f0', paddingTop: '0.375rem', marginTop: '0.25rem' }}>
                      <span style={{ fontWeight: 600 }}>Total OpenAI:</span>
                      <strong style={{ color: '#2563eb' }}>{(data.openai?.total_tokens || 0).toLocaleString('id-ID')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                      <span>Estimasi Pengeluaran:</span>
                      <strong style={{ color: '#16a34a' }}>${(data.openai?.cost_usd || 0).toFixed(4)} USD</strong>
                    </div>
                  </div>
                </div>

                {/* Gemini Card */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', backgroundColor: '#ffffff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.625rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
                      <strong style={{ fontSize: '0.9375rem', color: '#0f172a' }}>Google Gemini</strong>
                    </div>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 6px', backgroundColor: '#f1f5f9', color: '#475569', borderRadius: '4px' }}>
                      Fallback
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                      <span>Input / Prompt:</span>
                      <strong style={{ color: '#0f172a' }}>{(data.gemini?.prompt_tokens || 0).toLocaleString('id-ID')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                      <span>Output / Completion:</span>
                      <strong style={{ color: '#0f172a' }}>{(data.gemini?.completion_tokens || 0).toLocaleString('id-ID')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', borderTop: '1px dashed #e2e8f0', paddingTop: '0.375rem', marginTop: '0.25rem' }}>
                      <span style={{ fontWeight: 600 }}>Total Gemini:</span>
                      <strong style={{ color: '#4f46e5' }}>{(data.gemini?.total_tokens || 0).toLocaleString('id-ID')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                      <span>Estimasi Pengeluaran:</span>
                      <strong style={{ color: '#16a34a' }}>${(data.gemini?.cost_usd || 0).toFixed(4)} USD</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Official Tiktoken Live Calculator */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', backgroundColor: '#f8fafc' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.375rem' }}>
                  Kalkulator Token Langsung (Official OpenAI Tiktoken)
                </div>
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8125rem', color: '#64748b' }}>
                  Tempel teks prompt atau draf untuk menghitung token secara akurat sebelum dikirim ke AI.
                </p>
                <form onSubmit={handleCalculateTokens} style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  <textarea
                    rows={3}
                    value={calcText}
                    onChange={(e) => setCalcText(e.target.value)}
                    placeholder="Ketik atau tempel teks di sini..."
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="submit"
                      disabled={isCalculating || !calcText.trim()}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: calcText.trim() ? 'pointer' : 'not-allowed',
                        opacity: calcText.trim() ? 1 : 0.6
                      }}
                    >
                      {isCalculating ? 'Menghitung...' : 'Hitung Token Resmi'}
                    </button>
                    {calcResult && (
                      <div style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                        Hasil: <strong style={{ color: '#2563eb' }}>{calcResult.token_count} token</strong> (OpenAI tiktoken)
                      </div>
                    )}
                  </div>
                </form>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc'
          }}
        >
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Data tersimpan aman di sistem cloud terenkripsi
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
