'use client';

import React, { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import LocationPicker from './LocationPicker';

export default function QuickClientModal({ onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('create'); // 'create' | 'list'
  const [formData, setFormData] = useState({
    company_name: '',
    address: '',
    pic_email: '',
    latitude: '',
    longitude: '',
  });

  const [showManualCoords, setShowManualCoords] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);

  // Keyboard navigation for modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch clients list when tab switched
  useEffect(() => {
    if (activeTab === 'list') {
      fetchClients();
    }
  }, [activeTab]);

  const fetchClients = async () => {
    setLoadingClients(true);
    try {
      const res = await fetch('/api/admin/clients');
      const data = await res.json();
      if (data.success) {
        setClients(data.clients || []);
      }
    } catch (_) {
      // Ignored
    } finally {
      setLoadingClients(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.company_name.trim()) {
      setError('Nama perusahaan wajib diisi.');
      return;
    }
    if (!formData.address.trim()) {
      setError('Alamat kantor wajib diisi untuk titik pusat peta.');
      return;
    }
    if (!formData.pic_email.trim() || !formData.pic_email.includes('@')) {
      setError('Email PIC harus berupa alamat email yang valid.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        company_name: formData.company_name.trim(),
        address: formData.address.trim(),
        pic_email: formData.pic_email.trim().toLowerCase(),
      };
      if (formData.latitude && formData.longitude) {
        payload.latitude = parseFloat(formData.latitude);
        payload.longitude = parseFloat(formData.longitude);
      }

      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal membuat workspace klien.');
      }

      setResult(data.data);
      if (onSuccess) onSuccess(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!result?.credentials) return;
    const { email, temporary_password, login_url } = result.credentials;
    const text = [
      `Kredensial Akses Workspace Prospekta`,
      `Perusahaan: ${result.company_name}`,
      `URL Login: ${login_url}`,
      `Email: ${email}`,
      `Password Sementara: ${temporary_password}`,
      `\nCatatan: Silakan login dan lengkapi profil di menu Pengaturan.`,
    ].join('\n');

    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleResetForm = () => {
    setFormData({
      company_name: '',
      address: '',
      pic_email: '',
      latitude: '',
      longitude: '',
    });
    setResult(null);
    setError(null);
  };

  const isBackdropClickRef = useRef(false);

  const handleMouseDown = (e) => {
    isBackdropClickRef.current = e.target === e.currentTarget;
  };

  const handleMouseUp = (e) => {
    if (isBackdropClickRef.current && e.target === e.currentTarget) {
      onClose();
    }
    isBackdropClickRef.current = false;
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-content"
        style={{ maxWidth: '640px', width: '96%', maxHeight: '90vh', overflowY: 'auto' }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0, fontSize: '1.15rem' }}>
                Onboarding Klien Cepat (Quick Client)
              </h2>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Daftarkan perusahaan prospek baru & generate akun siap pakai seketika.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ minHeight: '36px', padding: '0.25rem 0.625rem' }}
            aria-label="Tutup"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', padding: '0.5rem 1.25rem 0' }}>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            style={{
              padding: '0.5rem 0.875rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'create' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'create' ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: activeTab === 'create' ? 600 : 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            + Buat Klien Baru
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            style={{
              padding: '0.5rem 0.875rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'list' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'list' ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: activeTab === 'list' ? 600 : 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Daftar Klien Aktif
          </button>
        </div>

        <div className="modal-body" style={{ padding: '1.25rem' }}>
          {activeTab === 'create' ? (
            result ? (
              /* Success Credential Card */
              <div>
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    border: '1px solid rgba(22, 163, 74, 0.3)',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: '2px' }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div>
                    <strong style={{ color: '#16a34a', display: 'block', marginBottom: '2px' }}>
                      Workspace Klien Berhasil Dibuat!
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Titik pusat peta kantor telah dikunci ke alamat yang diinput. Klien dapat langsung masuk via URL login berikut.
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                      NAMA PERUSAHAAN / WORKSPACE
                    </span>
                    <strong style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>{result.company_name}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                      KOORDINAT KANTOR
                    </span>
                    <span style={{ color: 'var(--text-main)' }}>
                      {result.office_coordinates?.lat?.toFixed(5)}, {result.office_coordinates?.lng?.toFixed(5)}
                    </span>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--border-subtle)', margin: '4px 0' }} />

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                      EMAIL LOGIN
                    </span>
                    <strong style={{ color: '#2563eb' }}>{result.credentials?.email}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                      PASSWORD SEMENTARA
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        backgroundColor: 'rgba(37, 99, 235, 0.15)',
                        color: 'var(--text-main)',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        letterSpacing: '1px',
                      }}
                    >
                      {result.credentials?.temporary_password}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', fontFamily: 'inherit' }}>
                      LOGIN URL
                    </span>
                    <a
                      href={result.credentials?.login_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb', wordBreak: 'break-all' }}
                    >
                      {result.credentials?.login_url}
                    </a>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleResetForm}
                  >
                    + Buat Klien Lain
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCopyCredentials}
                    style={{ minHeight: '40px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copied ? (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        <span>Tersalin ke Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        <span>Salin Semua Kredensial</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Create Client Form */
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {error && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#ef4444',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Nama Perusahaan / Workspace <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Maju Bersama Bandung"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    disabled={loading}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>

                <LocationPicker
                  id="qc-address"
                  label="Alamat Kantor Pusat"
                  value={formData.address}
                  onChange={(val) => setFormData((prev) => ({ ...prev, address: val }))}
                  latitude={formData.latitude}
                  longitude={formData.longitude}
                  onCoordsChange={(coords) => setFormData((prev) => ({ ...prev, latitude: String(coords.lat), longitude: String(coords.lng) }))}
                  required
                  disabled={loading}
                  isDark={true}
                  placeholder="Ketik alamat, nama gedung (OSM), atau tempel link Google Maps / koordinat"
                />

                {/* Optional Manual Lat/Lng toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowManualCoords(!showManualCoords)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#2563eb',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{showManualCoords ? 'Sembunyikan koordinat manual' : '+ Atur koordinat manual (opsional)'}</span>
                  </button>

                  {showManualCoords && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                      <input
                        type="number"
                        step="any"
                        placeholder="Latitude (cth: -6.902)"
                        value={formData.latitude}
                        onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        style={{
                          height: '38px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.8rem',
                        }}
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="Longitude (cth: 107.618)"
                        value={formData.longitude}
                        onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        style={{
                          height: '38px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.8rem',
                        }}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Email Login PIC Klien <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Contoh: direktur@majubersama.co.id"
                    value={formData.pic_email}
                    onChange={(e) => setFormData({ ...formData, pic_email: e.target.value })}
                    disabled={loading}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      fontSize: '0.875rem',
                    }}
                  />
                  <span style={{ display: 'block', marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Password acak sementara akan di-generate otomatis untuk kredensial awal.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ minHeight: '40px', minWidth: '160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {loading ? (
                      <span>Memproses Provisioning...</span>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                        <span>Generate Akun Klien</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )
          ) : (
            /* Clients List Tab */
            <div>
              {loadingClients ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Memuat data klien...
                </div>
              ) : clients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Belum ada klien kustom yang terdaftar. Gunakan tab "Buat Klien Baru" untuk memulai.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {clients.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-app)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                          {c.company_name}
                        </strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>
                          PIC: {c.pic_email || '-'} • Alamat: {c.address}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#2563eb' }}>
                          Titik: ({c.latitude?.toFixed(4)}, {c.longitude?.toFixed(4)})
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: c.status === 'active' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                          color: c.status === 'active' ? '#16a34a' : '#ca8a04',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {c.status || 'trial'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
