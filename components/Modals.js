'use client';

import React, { useState, useEffect, useRef, Fragment } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { IconCheck, IconAlertTriangle, IconEdit } from './icons';

const IconZap = ({ size = 13, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);

const IconInfo = ({ size = 14, style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
);

// Common wrapper that handles Escape key and backdrop clicks safely
function ModalWrapper({ title, onClose, maxWidth, children }) {
  const isBackdropClickRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

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
        style={maxWidth ? { maxWidth, width: '96%' } : undefined} 
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ minHeight: '36px', padding: '0.25rem 0.625rem', display: 'inline-flex', alignItems: 'center' }}
            aria-label="Tutup modal"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 1. Scan Modal
export function ScanModal({ anchors = [], activeAnchor, initialRadius = 2, onClose, onScanComplete }) {
  const anchorList = Array.isArray(anchors) ? anchors : [];
  const initialAnchor = activeAnchor?.name || anchorList[0]?.name || '';
  const [selectedAnchor, setSelectedAnchor] = useState(initialAnchor);
  const [radiusKm, setRadiusKm] = useState(() => {
    const str = String(initialRadius || 2);
    return ['1', '2', '5', '10', '15', '20'].includes(str) ? str : 'custom';
  });
  const [customRadius, setCustomRadius] = useState(() => {
    const str = String(initialRadius || '');
    return ['1', '2', '5', '10', '15', '20'].includes(str) ? '' : str;
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Sinkronisasi selectedAnchor jika activeAnchor atau daftar anchors diperbarui secara asinkron
  useEffect(() => {
    if (activeAnchor?.name) {
      setSelectedAnchor(activeAnchor.name);
    } else if (anchorList.length > 0 && (!selectedAnchor || !anchorList.some((a) => a.name === selectedAnchor))) {
      setSelectedAnchor(anchorList[0].name);
    }
  }, [activeAnchor, anchorList, selectedAnchor]);

  const isSg = selectedAnchor?.toLowerCase().includes('singapore') || selectedAnchor?.toLowerCase().includes('sg');
  const allowedRadii = isSg ? ['1', '2', '5', '10', '15', '20', 'custom'] : ['1', '2', '5', '10', 'custom'];

  useEffect(() => {
    if (!isSg && !['1', '2', '5', '10', 'custom'].includes(radiusKm)) {
      setRadiusKm('2');
    }
  }, [selectedAnchor, isSg, radiusKm]);

  const effectiveRadius = radiusKm === 'custom' ? parseFloat(customRadius || '2') : parseFloat(radiusKm);

  const handleStartScan = async () => {
    if (!selectedAnchor) {
      setError('Silakan pilih titik pusat kantor terlebih dahulu.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchor: selectedAnchor,
          radius_km: effectiveRadius
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Pemindaian gagal.');
      }
      setResult(data);
      if (onScanComplete) onScanComplete(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Tarik Data Bisnis Sekitar Kantor" onClose={onClose}>
      <div className="modal-body">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Pindai dan tarik data tempat bisnis resmi di sekitar lokasi kantor, lalu simpan ke database prospek.
        </p>

        <div style={{ padding: '0.625rem 0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px', color: 'var(--primary)' }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div><strong>Info Data:</strong> Sistem memuat direktori tempat bisnis resmi yang diperbarui secara berkala.</div>
        </div>

        <div>
          <label className="control-label" style={{ display: 'block', marginBottom: '0.375rem' }}>
            Titik Pusat Kantor:
          </label>
          <select
            className="select-input"
            style={{ width: '100%' }}
            value={selectedAnchor}
            onChange={(e) => setSelectedAnchor(e.target.value)}
            disabled={loading || anchorList.length === 0}
          >
            {anchorList.length === 0 ? (
              <option value="">(Belum ada titik kantor terdaftar)</option>
            ) : (
              anchorList.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name} ({a.city})
                </option>
              ))
            )}
          </select>
          {anchorList.length === 0 && (
            <p style={{ margin: '0.375rem 0 0 0', fontSize: '0.75rem', color: 'var(--danger-text)' }}>
              Belum ada lokasi kantor terdaftar di workspace ini. Tambahkan lokasi kantor melalui menu Pengaturan Profil terlebih dahulu.
            </p>
          )}
        </div>

        <div>
          <label className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <span>Radius Pemindaian:</span>
            {!isSg && (
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-card-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '9999px', padding: '0.0625rem 0.375rem' }}>
                Maks. 10 km
              </span>
            )}
          </label>
          <div className="radius-pills" style={{ marginBottom: '0.5rem' }}>
            {allowedRadii.map((r) => (
              <button
                key={r}
                type="button"
                className={`pill-btn ${radiusKm === r ? 'active' : ''}`}
                onClick={() => setRadiusKm(r)}
                disabled={loading}
              >
                {r === 'custom' ? 'Kustom' : `${r} km`}
              </button>
            ))}
          </div>

          {radiusKm === 'custom' && (
            <input
              type="number"
              min="1"
              max="20"
              step="0.5"
              placeholder="Masukkan radius (1 sampai 20 km)"
              className="input-text"
              style={{ width: '100%' }}
              value={customRadius}
              onChange={(e) => setCustomRadius(e.target.value)}
              disabled={loading}
            />
          )}
        </div>

        {loading && (
          <div className="state-container" style={{ padding: '1.5rem 0' }}>
            <div className="spinner" />
            <div className="state-title" style={{ fontSize: '0.9375rem' }}>
              Sedang Memindai Data Bisnis di Area Terpilih...
            </div>
            <div className="state-desc" style={{ fontSize: '0.8125rem' }}>
              Memfilter jarak radius melingkar dari titik kantor.
            </div>
          </div>
        )}

        {result && (
          <div style={{ padding: '0.875rem', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)' }}>
            <strong style={{ color: 'var(--success-text)' }}>Pemindaian Berhasil Selesai:</strong>
            <ul style={{ marginTop: '0.375rem', paddingLeft: '1.25rem', color: 'var(--success-text)', fontSize: '0.8125rem' }}>
              <li>Total tempat ditemukan di partisi: {result.totalDiscovered}</li>
              <li>Tempat baru disimpan ke database: {result.totalSaved}</li>
              {typeof result.totalInAnchor === 'number' && (
                <li>Total data tersimpan di titik ini: {result.totalInAnchor.toLocaleString()}</li>
              )}
              <li>Jumlah tile yang diproses: {result.tilesTotal}</li>
            </ul>
          </div>
        )}

        {error && (
          <div style={{ padding: '0.875rem', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger-text)' }}>
            <strong>Gagal:</strong> {error}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
          {result ? 'Selesai' : 'Batal'}
        </button>
        {!result && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStartScan}
            disabled={loading || !selectedAnchor || anchorList.length === 0}
          >
            {loading ? 'Menarik Data...' : 'Mulai Tarik Data Bisnis'}
          </button>
        )}
      </div>
    </ModalWrapper>
  );
}

// 2. Enrich Modal
export function EnrichModal({ activeAnchor, onClose, onEnrichComplete }) {
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleStartEnrich = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchor: activeAnchor?.name,
          limit: Number(limit)
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Enrichment gagal.');
      }
      setResult(data);
      if (onEnrichComplete) onEnrichComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Cari Email & Kontak Otomatis (Web Crawling)" onClose={onClose}>
      <div className="modal-body">
        <p style={{ color: 'var(--text-muted)' }}>
          Kunjungi website resmi tempat bisnis untuk menemukan alamat email dan nomor telepon perusahaan secara otomatis.
        </p>

        <div>
          <label className="control-label" style={{ display: 'block', marginBottom: '0.375rem' }}>
            Ukuran Batch per Panggilan:
          </label>
          <select
            className="select-input"
            style={{ width: '100%' }}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={loading}
          >
            <option value={5}>5 website (cepat, ~15 detik)</option>
            <option value={10}>10 website (disarankan, ~30 detik)</option>
            <option value={20}>20 website (~1 menit)</option>
          </select>
        </div>

        {loading && (
          <div className="state-container" style={{ padding: '1.5rem 0' }}>
            <div className="spinner" />
            <div className="state-title" style={{ fontSize: '0.9375rem' }}>
              Sedang Mencari Email & Nomor Kontak di Website...
            </div>
            <div className="state-desc" style={{ fontSize: '0.8125rem' }}>
              Memeriksa halaman beranda, /contact, dan /kontak dengan timeout sopan.
            </div>
          </div>
        )}

        {result && (
          <div style={{ padding: '0.875rem', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)' }}>
            <strong style={{ color: 'var(--success-text)' }}>Hasil Pencarian Kontak:</strong>
            <ul style={{ marginTop: '0.375rem', paddingLeft: '1.25rem', color: 'var(--success-text)', fontSize: '0.8125rem' }}>
              <li>Website yang dikunjungi: {result.processed}</li>
              <li>Kontak email & telp baru ditemukan: {result.enriched}</li>
            </ul>
          </div>
        )}

        {error && (
          <div style={{ padding: '0.875rem', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger-text)' }}>
            <strong>Gagal:</strong> {error}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
          {result ? 'Selesai' : 'Batal'}
        </button>
        <button type="button" className="btn btn-accent" onClick={handleStartEnrich} disabled={loading}>
          {loading ? 'Mencari...' : result ? 'Jalankan Batch Berikutnya' : 'Mulai Cari Kontak'}
        </button>
      </div>
    </ModalWrapper>
  );
}

// 3. Export Modal
export function ExportModal({ anchors, activeAnchor, onClose }) {
  const [selectedAnchor, setSelectedAnchor] = useState(activeAnchor?.name || 'all');
  const [format, setFormat] = useState('csv');

  const handleDownload = () => {
    const url = `/api/export?anchor=${encodeURIComponent(selectedAnchor)}&format=${format}`;
    window.open(url, '_blank');
    onClose();
  };

  return (
    <ModalWrapper title="Ekspor Data Bisnis" onClose={onClose}>
      <div className="modal-body">
        <p style={{ color: 'var(--text-muted)' }}>
          Unduh data tempat dan kontak dalam format Excel CSV dengan encoding UTF-8 lengkap.
        </p>

        <div>
          <label className="control-label" style={{ display: 'block', marginBottom: '0.375rem' }}>
            Pilih Kantor:
          </label>
          <select
            className="select-input"
            style={{ width: '100%' }}
            value={selectedAnchor}
            onChange={(e) => setSelectedAnchor(e.target.value)}
          >
            <option value="all">Semua Kantor ({anchors.map((a) => a.name).join(', ')})</option>
            {anchors.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="control-label" style={{ display: 'block', marginBottom: '0.375rem' }}>
            Format File:
          </label>
          <div className="radius-pills">
            <button
              type="button"
              className={`pill-btn ${format === 'csv' ? 'active' : ''}`}
              onClick={() => setFormat('csv')}
            >
              CSV (Excel Compatible UTF-8)
            </button>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Batal
        </button>
        <button type="button" className="btn btn-primary" onClick={handleDownload}>
          Unduh File
        </button>
      </div>
    </ModalWrapper>
  );
}

// 4. Import Modal (Google Maps / gosom CSV)
export function ImportModal({ onClose, onImportComplete }) {
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target?.result || '');
    };
    reader.readAsText(file);
  };

  const handleStartImport = async () => {
    if (!csvText.trim()) {
      setError('Masukkan atau unggah konten CSV terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_content: csvText })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Impor CSV gagal.');
      }
      setResult(data);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Impor Data Eksternal (Google Maps / CSV)" onClose={onClose}>
      <div className="modal-body">
        <p style={{ color: 'var(--text-muted)' }}>
          Impor hasil scraping lokal (seperti gosom Google Maps scraper). Data akan dideduplikasi otomatis berdasarkan nomor telepon, website, dan lokasi tempat.
        </p>

        <div>
          <label className="control-label" style={{ display: 'block', marginBottom: '0.375rem' }}>
            Pilih File CSV:
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            disabled={loading}
            style={{ fontSize: '0.875rem' }}
          />
        </div>

        <div>
          <label className="control-label" style={{ display: 'block', marginBottom: '0.375rem' }}>
            Atau Tempel Konten CSV di Sini:
          </label>
          <textarea
            className="textarea-input"
            placeholder="name,category,address,phone,website,lat,lng..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            disabled={loading}
          />
        </div>

        {result && (
          <div style={{ padding: '0.875rem', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-sm)' }}>
            <strong style={{ color: 'var(--success-text)' }}>Impor Berhasil:</strong>
            <ul style={{ marginTop: '0.375rem', paddingLeft: '1.25rem', color: 'var(--success-text)', fontSize: '0.8125rem' }}>
              <li>Total baris: {result.totalRows}</li>
              <li>Tempat baru disimpan: {result.importedCount}</li>
              <li>Dilewati karena duplikat: {result.skippedCount}</li>
            </ul>
          </div>
        )}

        {error && (
          <div style={{ padding: '0.875rem', backgroundColor: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 'var(--radius-sm)', color: 'var(--danger-text)' }}>
            <strong>Gagal:</strong> {error}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
          {result ? 'Selesai' : 'Batal'}
        </button>
        {!result && (
          <button type="button" className="btn btn-primary" onClick={handleStartImport} disabled={loading}>
            {loading ? 'Mengimpor...' : 'Mulai Impor'}
          </button>
        )}
      </div>
    </ModalWrapper>
  );
}

// 5. Category Rules Modal
export function CategoryRulesModal({ onClose, onRulesChanged }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newBidang, setNewBidang] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success) {
        setRules(data.rules || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAddRule = async (e) => {
    e.preventDefault();
    if (!newKey.trim() || !newBidang.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_key: newKey,
          bidang_usaha: newBidang
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewKey('');
        setNewBidang('');
        await fetchRules();
        if (onRulesChanged) onRulesChanged();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (id) => {
    try {
      await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
      await fetchRules();
      if (onRulesChanged) onRulesChanged();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <ModalWrapper title="Aturan Klasifikasi Bidang Usaha" onClose={onClose}>
      <div className="modal-body">
        <p style={{ color: 'var(--text-muted)' }}>
          Petakan kata kunci kategori mentah ke bidang usaha yang rapi untuk klasifikasi dan ekspor tim.
        </p>

        <form onSubmit={handleAddRule} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Kata Kunci Kategori (cth: software)"
            className="input-text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            disabled={saving}
          />
          <input
            type="text"
            placeholder="Bidang Usaha (cth: Teknologi Informasi)"
            className="input-text"
            value={newBidang}
            onChange={(e) => setNewBidang(e.target.value)}
            disabled={saving}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !newKey || !newBidang}>
            {saving ? 'Menyimpan...' : 'Tambah Aturan'}
          </button>
        </form>

        <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Memuat aturan...</div>
          ) : (
            <table style={{ width: '100%', fontSize: '0.8125rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Kata Kunci Kategori</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Bidang Usaha Hasil</th>
                  <th style={{ padding: '0.5rem 0.75rem', width: '50px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{r.category_key}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{r.bidang_usaha}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteRule(r.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '2px' }}
                        aria-label="Hapus aturan"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </ModalWrapper>
  );
}

// 6. Sync History & Data Notification Modal
export function SyncNotificationModal({ onClose, onSelectAnchor }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('points'); // 'points' | 'history'
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sync/history');
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        throw new Error(json.error || 'Gagal mengambil riwayat');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const latest = data?.latest;
  const anchorBreakdown = data?.anchorBreakdown || [];

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' WIB';
    } catch {
      return isoString;
    }
  };

  return (
    <ModalWrapper title="Riwayat Pembaruan & Notifikasi Data" onClose={onClose} maxWidth="860px">
      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
            <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Memuat log sinkronisasi dan rincian tiap titik kantor...</div>
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: '#991b1b', fontSize: '0.875rem' }}>
            {error}
          </div>
        ) : (
          <>
            {/* Kartu Ringkasan Terakhir */}
            <div style={{
              backgroundColor: 'var(--bg-card-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '1.125rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.875rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                  Hasil Pembaruan Terakhir (Jadwal 00:00 WIB)
                  <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--primary)', fontWeight: 600 }}>
                    Target: Seluruh Kantor ({anchorBreakdown.length || 4} Titik Lokasi)
                  </span>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {formatDate(latest?.created_at)}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.75rem 0.875rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Total Data Baru Masuk</div>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#047857', marginTop: '0.2rem', letterSpacing: '-0.02em' }}>
                    +{Number(latest?.new_places_added || 0).toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Tempat terverifikasi baru</div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.75rem 0.875rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Total Duplikat Dicegah</div>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.2rem', letterSpacing: '-0.02em' }}>
                    {Number(latest?.duplicates_prevented || 0).toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#10b981', fontWeight: 500, marginTop: '0.15rem' }}>Bebas duplikasi identik</div>
                </div>

                <div style={{ backgroundColor: 'var(--bg-card)', padding: '0.75rem 0.875rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Total Tempat di Sistem</div>
                  <div style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem', letterSpacing: '-0.02em' }}>
                    {Number(latest?.total_places_now || 0).toLocaleString('id-ID')}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Tersimpan di Cloud</div>
                </div>
              </div>
            </div>

            {/* Segmented Tab Navigasi */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('points')}
                  style={{
                    padding: '0.4rem 0.875rem',
                    fontSize: '0.8125rem',
                    fontWeight: activeTab === 'points' ? 700 : 500,
                    color: activeTab === 'points' ? 'var(--primary)' : 'var(--text-muted)',
                    backgroundColor: activeTab === 'points' ? 'var(--bg-card)' : 'transparent',
                    border: activeTab === 'points' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    boxShadow: activeTab === 'points' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>Rincian Tiap Titik Kantor</span>
                  <span style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: '9999px', backgroundColor: activeTab === 'points' ? 'var(--accent-light)' : 'var(--bg-card-subtle)', color: activeTab === 'points' ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {anchorBreakdown.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  style={{
                    padding: '0.4rem 0.875rem',
                    fontSize: '0.8125rem',
                    fontWeight: activeTab === 'history' ? 700 : 500,
                    color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-muted)',
                    backgroundColor: activeTab === 'history' ? 'var(--bg-card)' : 'transparent',
                    border: activeTab === 'history' ? '1px solid var(--border-subtle)' : '1px solid transparent',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    boxShadow: activeTab === 'history' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                  }}
                >
                  Catatan Riwayat Log Berkala
                </button>
              </div>

              <button
                type="button"
                onClick={fetchHistory}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                Muat Ulang Data
              </button>
            </div>

            {/* TAB 1: Rincian Pecahan Tiap Titik Lokasi Kantor */}
            {activeTab === 'points' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Pecahan penambahan data baru, duplikat yang dicegah, dan akumulasi tempat per radius di masing-masing titik kantor:
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '0.875rem' }}>
                  {anchorBreakdown.map((a) => (
                    <div
                      key={a.id || a.name}
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
                      }}
                    >
                      {/* Header Titik Kantor */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                              {a.name}
                            </span>
                            <span style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              padding: '1px 7px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--bg-card-subtle)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-muted)'
                            }}>
                              {a.city}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.address}>
                            {a.address || 'Alamat kantor terdaftar'}
                          </div>
                        </div>

                        {onSelectAnchor && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => onSelectAnchor(a.id)}
                            title={`Fokuskan peta ke ${a.name}`}
                            style={{ minHeight: '28px', fontSize: '0.7rem', padding: '0.2rem 0.5rem', whiteSpace: 'nowrap', fontWeight: 600 }}
                          >
                            Pilih Titik
                          </button>
                        )}
                      </div>

                      {/* 3 Metrik Utama Titik Ini */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.5rem',
                        backgroundColor: 'var(--bg-card-subtle)',
                        padding: '0.625rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Data Baru</div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#047857', marginTop: '0.15rem' }}>
                            +{Number(a.newPlacesAdded || 0).toLocaleString('id-ID')}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Duplikat Dicegah</div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary)', marginTop: '0.15rem' }}>
                            {Number(a.duplicatesPrevented || 0).toLocaleString('id-ID')}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Total Database</div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                            {Number(a.totalPlaces || 0).toLocaleString('id-ID')}
                          </div>
                        </div>
                      </div>

                      {/* Rincian per Radius untuk Titik Ini */}
                      <div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                          Sebaran Tempat di Titik Ini per Radius:
                        </div>
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                          {['1 km', '2 km', '5 km', '10 km', '15 km', '20 km'].map((rk) => (
                            <span
                              key={rk}
                              style={{
                                fontSize: '0.6875rem',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-card)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              <span style={{ color: 'var(--text-muted)' }}>{rk}:</span>
                              <strong style={{ fontWeight: 600 }}>{(a.radius?.[rk] || 0).toLocaleString('id-ID')}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: Catatan Riwayat Log Berkala */}
            {activeTab === 'history' && (
              <div>
                <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-card-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Waktu</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Target Lokasi</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Data Baru</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Duplikat Dicegah</th>
                        <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.history || []).map((h) => {
                        const isAll = h.target === 'all';
                        const isExpanded = expandedLogId === h.id;

                        return (
                          <Fragment key={h.id}>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {formatDate(h.created_at)}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span>{isAll ? 'Seluruh Kantor' : h.target}</span>
                                  {isAll && (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedLogId(isExpanded ? null : h.id)}
                                      style={{
                                        fontSize: '0.6875rem',
                                        color: 'var(--primary)',
                                        backgroundColor: 'var(--bg-card)',
                                        border: '1px solid var(--border-subtle)',
                                        borderRadius: '3px',
                                        padding: '1px 6px',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                      }}
                                    >
                                      {isExpanded ? 'Tutup Rincian' : 'Lihat 4 Titik ▾'}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: '#047857', fontWeight: 700 }}>
                                +{Number(h.new_places_added || 0).toLocaleString('id-ID')}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>
                                {Number(h.duplicates_prevented || 0).toLocaleString('id-ID')}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '3px',
                                  fontSize: '0.6875rem',
                                  backgroundColor: h.status === 'success' ? '#ecfdf5' : '#fef2f2',
                                  color: h.status === 'success' ? '#047857' : '#991b1b',
                                  fontWeight: 600
                                }}>
                                  {h.status === 'success' ? 'Berhasil' : 'Gagal'}
                                </span>
                              </td>
                            </tr>

                            {/* Accordion Row saat tombol Lihat 4 Titik ditekan */}
                            {isAll && isExpanded && (
                              <tr style={{ backgroundColor: 'var(--bg-card-subtle)' }}>
                                <td colSpan={5} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                                    Pecahan Penambahan per Titik Kantor pada Sesi Ini:
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.5rem' }}>
                                    {anchorBreakdown.map((ab) => (
                                      <div key={ab.name} style={{ backgroundColor: 'var(--bg-card)', padding: '0.5rem 0.625rem', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.75rem' }}>{ab.name}</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{ab.city}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 700 }}>+{Number(ab.newPlacesAdded || 0).toLocaleString('id-ID')} baru</div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{Number(ab.duplicatesPrevented || 0).toLocaleString('id-ID')} duplikat dicegah</div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Aturan: Tempat dengan ID bisnis, telepon, atau domain sama tidak akan pernah diduplikasi.
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </ModalWrapper>
  );
}

// 8. Google Sheet Master Sync Modal
export function GoogleSheetSyncModal({ onClose, onSyncSuccess }) {
  const [meta, setMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [activeTabId, setActiveTabId] = useState('danend');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingTarget, setSyncingTarget] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedTemplate, setCopiedTemplate] = useState(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [leadSuccessMsg, setLeadSuccessMsg] = useState(null);
  const [leadErrorMsg, setLeadErrorMsg] = useState(null);
  const [localAddedLeads, setLocalAddedLeads] = useState([]);

  // Sheets MCP 2-Way Sync State
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    phone: '',
    email: '',
    website: '',
    social_media: '',
    pic_name: '',
    pic_title: '',
    address: 'Singapore',
    problem_analysis: '',
    offer_angle: 'agentic_ai'
  });

  const fetchMeta = async () => {
    setLoadingMeta(true);
    try {
      const res = await fetch('/api/sync/sheet');
      const data = await res.json();
      if (data.success) {
        setMeta(data);
      }
    } catch (err) {
      console.error('Failed to load sheet metadata:', err);
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    fetchMeta();
  }, []);

  const handleSync = async (gidOrAll) => {
    setIsSyncing(true);
    setSyncingTarget(gidOrAll);
    setErrorMsg(null);
    setSyncResult(null);

    try {
      const res = await fetch('/api/sync/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gid: gidOrAll })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Sinkronisasi gagal');
      }
      setSyncResult(data);
      await fetchMeta();
      if (onSyncSuccess) onSyncSuccess(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsSyncing(false);
      setSyncingTarget(null);
    }
  };

  const handleExportTwoWay = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    setSyncResult(null);
    setExportResult(null);
    try {
      const res = await fetch('/api/sync/sheet', { method: 'PUT' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Gagal sinkronisasi dua arah.');
      setExportResult(data);
      setTimeout(() => setExportResult(null), 8000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const tabs = meta?.tabs || [
    {
      id: 'danend',
      name: "Danend's",
      gid: '548410938',
      pic: 'Danendra',
      industry: 'Bakery / Patisserie (F&B)',
      status: 'Ready / Active',
      leadCount: 25,
      distinctColumn: 'Problem Analysis & Social Media (Instagram)',
      description: '25 prospek bakery & patisserie di Singapura dengan analisis masalah operasional & akun media sosial.'
    },
    {
      id: 'lyndsey',
      name: 'Lyndsey',
      gid: '2106350285',
      pic: 'Lyndsey',
      industry: 'Auto Body Shop / Detailing',
      status: 'Ready / Active',
      leadCount: 25,
      distinctColumn: 'what they need',
      description: '25 prospek bengkel & salon mobil di Toh Guan / Jurong dengan analisis kebutuhan web & Instagram.'
    },
    {
      id: 'cami',
      name: "Cami's (Clinic & Health)",
      gid: 'clinic_health',
      pic: 'Cami',
      industry: 'Healthcare & Medical Clinic',
      status: 'Ready / Active',
      leadCount: 'Input Langsung',
      distinctColumn: 'Patient Flow, Booking & WhatsApp AI',
      description: 'Prospek sektor klinik dokter, estetika, dental & wellness di Singapura.'
    },
    {
      id: 'sheet4',
      name: 'Sheet4 (Copywriting)',
      gid: '943060339',
      pic: 'Semua PIC',
      industry: 'Email Pitch Templates',
      status: 'Template Referensi',
      leadCount: 3,
      distinctColumn: 'Version A (No Web), B (Outdated), C (Modern)',
      description: 'Template naskah proposal teruji untuk prospek.'
    },
    {
      id: 'scraping',
      name: 'Scraping (Master Dump)',
      gid: '0',
      pic: 'Database Master',
      industry: 'Multi-Industry Singapore',
      status: 'Master Pool',
      leadCount: 13619,
      distinctColumn: 'Master Scrape Prospekta',
      description: 'Kumpulan data tempat bisnis prospek terverifikasi.'
    }
  ];

  const currentTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const sheetBaseUrl = 'https://docs.google.com/spreadsheets/d/1VEY08yrBBTI4grA0fgHHxnh3nNKuXgIeCPMg7SJ9yvk/edit?pli=1#gid=';

  const copyEmailText = async (key, text) => {
    const copied = await copyToClipboard(text);
    if (copied) {
      setCopiedTemplate(key);
      setTimeout(() => setCopiedTemplate(null), 2500);
    }
  };

  const templates = [
    {
      key: 'version_a',
      title: 'Version A: Belum Memiliki Website (No Website)',
      target: 'Bisnis yang terdaftar di direktori lokal namun belum memiliki tautan website resmi',
      subject: '[Nama Usaha] on Google',
      body: `Hi [Nama Pemilik/DM],

I searched “car servicing / bakery [area]” and found [Nama Usaha]’s Google listing, but there’s no website behind it. Customers who want prices or a slot have to call, or they move on to the next competitor.

We are Prospekta, an AI intelligence and digital solutions provider. We build modern, high-converting digital structures for local businesses: your services, quote and booking requests sent straight to your WhatsApp, and fast on any phone.

I’ve prepared what a modern page for [Nama Usaha] could look like. Want me to send it over?

If this is not relevant to your current priorities, simply reply "not interested" and I will ensure you receive no further correspondence.

Warm regards,

Tim Prospekta
Managing Director | Prospekta
Prestige Centre, 71 Bukit Batok Crescent, Singapore 658071
Direct: +65 8123 4567 | admin@prospekta.id
prospekta.id`
    },
    {
      key: 'version_b',
      title: 'Version B: Website Ketinggalan Zaman (Outdated Website)',
      target: 'Bisnis yang websitenya lambat, belum responsive di mobile, atau tanpa formulir booking',
      subject: 'Quick question regarding [Nama Usaha]’s website',
      body: `Hi [Nama Pemilik/DM],

I opened [website] on my phone. [Sebutkan 1 isu spesifik: no direct booking / hard to find pricing / slow to load]. Most Singapore customers check a business on mobile before booking, so that’s where deals are won or lost.

We are Prospekta, an AI intelligence and digital solutions provider. We rebuild clean, high-converting websites for local SME workshops & services with automated booking flows.

I’ve prepared a quick layout concept tailored for [Nama Usaha]. Would you like me to share it?

If this is not relevant to your current priorities, simply reply "not interested" and I will ensure you receive no further correspondence.

Warm regards,

Tim Prospekta
Managing Director | Prospekta
Prestige Centre, 71 Bukit Batok Crescent, Singapore 658071
Direct: +65 8123 4567 | admin@prospekta.id
prospekta.id`
    },
    {
      key: 'version_c',
      title: 'Version C: Website Sudah Modern (Tawaran Agentic AI)',
      target: 'Bisnis modern yang butuh otomatisasi operasional, customer assistant 24/7, atau bot CS',
      subject: 'AI Operations & Customer Workflow for [Nama Usaha]',
      body: `Hi [Nama Pemilik/DM],

Noticed [Nama Usaha] has an active digital presence. As order volume and inquiries scale across WhatsApp and email, repetitive inquiry answering can bottleneck operations.

We are Prospekta, an AI intelligence and digital solutions provider. We provide automated 24/7 WhatsApp concierges that qualify client requests and deliver quote-ready summaries to your team.

Would you be open to a 60-second preview showing how it works for [Nama Usaha]?

If this is not relevant to your current priorities, simply reply "not interested" and I will ensure you receive no further correspondence.

Warm regards,

Tim Prospekta
Managing Director | Prospekta
Prestige Centre, 71 Bukit Batok Crescent, Singapore 658071
Direct: +65 8123 4567 | admin@prospekta.id
prospekta.id`
    },
    {
      key: 'version_d',
      title: 'Version D: Healthcare & Medical Clinics (Sektor Dokter & Klinik)',
      target: 'Klinik spesialis, dental, GP, estetika, & wellness yang ingin mengurangi no-show dan antrean registrasi',
      subject: 'Streamlining patient scheduling & inquiries for [Nama Klinik]',
      body: `Hi [Nama Dokter/Clinic Manager],

I came across [Nama Klinik] while looking into established medical & aesthetic practices in Singapore.

Many clinic managers and doctors we speak with mention that front-desk staff spend 3-4 hours daily answering repetitive WhatsApp inquiries, manually rescheduling slots, and dealing with patient no-shows.

We are Prospekta, an AI intelligence and digital solutions provider. We deploy medical-grade Agentic AI assistants for local clinics: 24/7 automated WhatsApp booking, doctor consultation scheduling, insurance pre-check info, and instant appointment reminders with zero staff burden.

Would you be open to a 60-second preview to see how this can save your clinic 15+ hours weekly?

If this is not relevant to your current priorities, simply reply "not interested" and I will ensure you receive no further correspondence.

Warm regards,

Tim Prospekta
Managing Director | Prospekta
Prestige Centre, 71 Bukit Batok Crescent, Singapore 658071
Direct: +65 8123 4567 | admin@prospekta.id
prospekta.id`
    }
  ];

  const handleSaveLead = async (e) => {
    e.preventDefault();
    if (!newLeadForm.name.trim()) {
      setLeadErrorMsg('Nama perusahaan/klinik wajib diisi.');
      return;
    }
    setSavingLead(true);
    setLeadErrorMsg(null);
    setLeadSuccessMsg(null);

    const targetPic = currentTab.pic === 'Semua PIC' || currentTab.pic === 'Database Master' ? 'Danendra' : currentTab.pic;
    const targetIndustry = currentTab.industry || 'Bisnis Komersial';

    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newLeadForm,
          assigned_pic: targetPic,
          bidang_usaha: targetIndustry,
          anchor: 'Prospekta Jakarta Hub',
          is_personal_lead: 1
        })
      });
      const data = await res.json();
      if (data.success) {
        setLeadSuccessMsg(data.message || `Prospek "${newLeadForm.name}" berhasil disimpan.`);
        setLocalAddedLeads(prev => [
          {
            name: newLeadForm.name,
            phone: newLeadForm.phone,
            email: newLeadForm.email,
            social_media: newLeadForm.social_media,
            problem_analysis: newLeadForm.problem_analysis || 'Input langsung via aplikasi Prospekta',
            assigned_pic: targetPic
          },
          ...prev
        ]);
        setNewLeadForm({
          name: '',
          phone: '',
          email: '',
          website: '',
          social_media: '',
          pic_name: '',
          pic_title: '',
          address: 'Singapore',
          problem_analysis: '',
          offer_angle: currentTab.id === 'cami' ? 'agentic_ai' : 'digital_structure'
        });
        if (onSyncSuccess) onSyncSuccess(data);
        setTimeout(() => setLeadSuccessMsg(null), 4000);
      } else {
        setLeadErrorMsg(data.error || 'Gagal menyimpan prospek.');
      }
    } catch (err) {
      setLeadErrorMsg(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setSavingLead(false);
    }
  };

  return (
    <ModalWrapper title="Integrasi Google Spreadsheet Master Outreach" onClose={onClose} maxWidth="960px">
      <div className="modal-body" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '1rem 1.25rem' }}>
        
        {/* Safe Mode Badge & Header Description */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: '#15803d',
                backgroundColor: '#dcfce7',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Read-Only Safe Sync
              </span>
              <strong style={{ fontSize: '0.875rem', color: '#166534' }}>
                Aman 100%: Tidak Mengubah atau Merusak Data di Sheet
              </strong>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '2px' }}>
              Aplikasi hanya mengambil (GET/read) data baris prospek dari tab Google Sheet tim dan menyinkronkannya ke database Prospekta.
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportTwoWay}
              disabled={isExporting}
              style={{
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                backgroundColor: '#ffffff',
                borderColor: '#38bdf8',
                color: '#0284c7',
                fontWeight: 600
              }}
              title="Kirim status outreach & catatan analisis terbaru prospek ke Google Spreadsheet tim sales"
            >
              {isExporting ? (
                <>
                  <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  <span>Sinkronisasi Dua Arah...</span>
                </>
              ) : (
                <span>Sinkronkan Dua Arah (Sheets MCP)</span>
              )}
            </button>

            <a
              href={meta?.masterSheetUrl || 'https://docs.google.com/spreadsheets/d/1VEY08yrBBTI4grA0fgHHxnh3nNKuXgIeCPMg7SJ9yvk/edit?pli=1&gid=548410938#gid=548410938'}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                textDecoration: 'none',
                backgroundColor: '#ffffff',
                borderColor: '#86efac',
                color: '#166534',
                fontWeight: 600
              }}
            >
              <span>Buka Google Sheet Asli</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>

        {/* Global KPI Summary Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ padding: '0.625rem 0.875rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Target Outreach Harian Prospekta</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--primary)' }}>25 Email / PIC / Hari</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Total Tim: 75 email terkirim / hari</div>
          </div>
          <div style={{ padding: '0.625rem 0.875rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Prospek Tersinkron di Aplikasi</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#047857' }}>
              {meta ? `${meta.syncedLeadsCount} Prospek Terkualifikasi` : (loadingMeta ? 'Memuat...' : '45 Prospek Terkualifikasi')}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Termasuk analisis problem & kontak</div>
          </div>
          <div style={{ padding: '0.625rem 0.875rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Akun Pengirim Resmi</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>admin@prospekta.id</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Target Response Rate: 8% – 12%</div>
          </div>
        </div>

        {/* Sheets MCP 2-Way Sync Feedback Message */}
        {exportResult && (
          <div style={{
            padding: '0.625rem 0.875rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 'var(--radius-sm)',
            color: '#166534',
            fontSize: '0.8125rem',
            fontWeight: 600,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>{exportResult.message}</span>
            <a
              href={exportResult.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#15803d', textDecoration: 'underline', marginLeft: 'auto', fontSize: '0.75rem' }}
            >
              Lihat di Google Sheets
            </a>
          </div>
        )}

        {/* Sync Feedback Message */}
        {syncResult && (
          <div style={{
            padding: '0.625rem 0.875rem',
            backgroundColor: '#ecfdf5',
            border: '1px solid #6ee7b7',
            borderRadius: 'var(--radius-sm)',
            color: '#065f46',
            fontSize: '0.8125rem',
            fontWeight: 600,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>{syncResult.message} ({syncResult.updated} data diperbarui, {syncResult.inserted} prospek baru masuk)</span>
          </div>
        )}

        {errorMsg && (
          <div style={{
            padding: '0.625rem 0.875rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 'var(--radius-sm)',
            color: '#991b1b',
            fontSize: '0.8125rem',
            marginBottom: '1rem'
          }}>
            Terjadi kendala saat sinkronisasi: {errorMsg}
          </div>
        )}

        {/* 4 Tabs Selector Cards */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Pilih Sheet / Tab untuk Diperiksa & Disinkronkan:</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '0.625rem'
          }}>
            {tabs.map((tab) => {
              const isSelected = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                    backgroundColor: isSelected ? 'var(--bg-card)' : 'var(--bg-card-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 2px 4px rgba(37,99,235,0.1)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                      {tab.name}
                    </span>
                    <span style={{
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      padding: '1px 6px',
                      borderRadius: '8px',
                      backgroundColor: tab.id === 'sheet4' ? '#f3e8ff' : '#e0f2fe',
                      color: tab.id === 'sheet4' ? '#6b21a8' : '#0369a1'
                    }}>
                      {tab.pic}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {tab.industry}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.6875rem' }}>
                    <span style={{ fontWeight: 600, color: '#047857' }}>
                      {typeof tab.leadCount === 'number' ? `${tab.leadCount} Baris` : tab.leadCount}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>GID: {tab.gid}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Tab Detail Box */}
        <div style={{
          padding: '1rem',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  Tab: {currentTab.name}
                </h3>
                <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#334155', fontWeight: 600 }}>
                  GID: {currentTab.gid}
                </span>
                <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#ecfdf5', color: '#047857', fontWeight: 600 }}>
                  PIC: {currentTab.pic}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {currentTab.description}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                href={`${sheetBaseUrl}${currentTab.gid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                title="Buka Spreadsheet Asli di Tab Baru"
              >
                <span>Buka Tab Ini di Sheets</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>

              {currentTab.id !== 'scraping' && currentTab.id !== 'sheet4' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setIsAddingLead(!isAddingLead)}
                  style={{
                    fontSize: '0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: isAddingLead ? '#475569' : '#059669',
                    borderColor: isAddingLead ? '#475569' : '#059669',
                    fontWeight: 600
                  }}
                  title="Ketik data prospek baru langsung ke database tanpa perlu ke spreadsheet"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>{isAddingLead ? 'Tutup Form Input' : 'Input Prospek Langsung'}</span>
                </button>
              )}

              {(currentTab.id === 'danend' || currentTab.id === 'lyndsey') && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleSync(currentTab.gid)}
                  disabled={isSyncing}
                  style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  {isSyncing && syncingTarget === currentTab.gid ? (
                    <>
                      <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                      <span>Menyinkronkan {currentTab.name}...</span>
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                      <span>Sinkronkan Tab Ini</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Form Input Prospek Langsung */}
          {isAddingLead && (
            <form onSubmit={handleSaveLead} style={{
              backgroundColor: 'var(--bg-card-subtle)',
              border: '2px dashed #10b981',
              borderRadius: 'var(--radius-sm)',
              padding: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.875rem', color: '#047857', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconEdit size={15} />
                  <span>Form Input Prospek Baru ke Tab {currentTab.name} (PIC: {currentTab.pic})</span>
                </strong>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  Data tersimpan langsung ke pipeline outreach
                </span>
              </div>

              {leadErrorMsg && (
                <div style={{ padding: '0.5rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#991b1b', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                  {leadErrorMsg}
                </div>
              )}

              {leadSuccessMsg && (
                <div style={{ padding: '0.5rem 0.75rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '4px', color: '#065f46', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconCheck size={14} />
                  <span>{leadSuccessMsg}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                    Nama Perusahaan / Klinik *
                  </label>
                  <input
                    type="text"
                    required
                    className="input-text"
                    placeholder="Contoh: Camden Aesthetic Clinic Pte Ltd"
                    value={newLeadForm.name}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', height: '32px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                    Nama & Jabatan DM (Owner / Manager / Doctor)
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Nama: Dr. Adrian"
                      value={newLeadForm.pic_name}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, pic_name: e.target.value })}
                      style={{ fontSize: '0.75rem', padding: '4px 8px', height: '32px', flex: 1 }}
                    />
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Jabatan: Director"
                      value={newLeadForm.pic_title}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, pic_title: e.target.value })}
                      style={{ fontSize: '0.75rem', padding: '4px 8px', height: '32px', flex: 1 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="+65 6789 1234 atau +65 9123 4567"
                    value={newLeadForm.phone}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', height: '32px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                    Email Terverifikasi
                  </label>
                  <input
                    type="email"
                    className="input-text"
                    placeholder="contact@klinik.sg atau info@bisnis.sg"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', height: '32px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                    Website Perusahaan
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="https://klinik.sg"
                    value={newLeadForm.website}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, website: e.target.value })}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', height: '32px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                    Media Sosial (Instagram / LinkedIn)
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="instagram.com/klinik_sg"
                    value={newLeadForm.social_media}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, social_media: e.target.value })}
                    style={{ fontSize: '0.75rem', padding: '4px 8px', height: '32px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                  Catatan Analisis Masalah (Problem Analysis / What They Need)
                </label>
                <textarea
                  className="textarea-input"
                  rows={2}
                  placeholder="Contoh: Butuh otomatisasi booking via WhatsApp 24/7 dan reminder pasien otomatis untuk kurangi no-show."
                  value={newLeadForm.problem_analysis}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, problem_analysis: e.target.value })}
                  style={{ width: '100%', fontSize: '0.75rem', padding: '6px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsAddingLead(false)}
                  style={{ fontSize: '0.75rem' }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingLead}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: '0.75rem', backgroundColor: '#059669', borderColor: '#059669', fontWeight: 600 }}
                >
                  {savingLead ? (
                    'Menyimpan...'
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <IconCheck size={13} />
                      <span>Simpan Prospek ke Pipeline</span>
                    </span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Conditional Content by Tab */}
          {currentTab.id === 'danend' && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <strong>Analisis Khusus Tab Danendra:</strong> Tab ini memiliki 18 kolom, dengan kolom khas <code>Social Media</code> (berisi link Instagram bakery/patisserie) dan kolom <code>Problem Analysis</code> (catatan detail audit operasional & website).
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                <table style={{ width: '100%', fontSize: '0.6875rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <tr>
                      <th style={{ padding: '6px 8px' }}>Nama Bisnis (F&B)</th>
                      <th style={{ padding: '6px 8px' }}>Nomor Telepon</th>
                      <th style={{ padding: '6px 8px' }}>Email Verifikasi</th>
                      <th style={{ padding: '6px 8px' }}>Instagram</th>
                      <th style={{ padding: '6px 8px' }}>Catatan Problem Analysis</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Annabella Patisserie</td>
                      <td style={{ padding: '6px 8px' }}>+6565918808</td>
                      <td style={{ padding: '6px 8px' }}>sales@abp.sg</td>
                      <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>instagram.com/annabellapatis...</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Automasi pemesanan & custom cake requests</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Haubis</td>
                      <td style={{ padding: '6px 8px' }}>+6562679795</td>
                      <td style={{ padding: '6px 8px' }}>haubis@singnet.com.sg</td>
                      <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>instagram.com/haubis_sg/</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Reaktivasi social media & build official website</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Winifred Kristé Cake</td>
                      <td style={{ padding: '6px 8px' }}>+6597957218</td>
                      <td style={{ padding: '6px 8px' }}>info@winifredkristecake.com</td>
                      <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>instagram.com/winifredkriste...</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Integrasi AI langsung ke website & custom orders</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentTab.id === 'lyndsey' && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <strong>Analisis Khusus Tab Lyndsey:</strong> Tab ini berisi 25 prospek Auto Body Shop di kawasan Toh Guan & Enterprise Hub. Memiliki kolom khas <code>what they need</code> (kebutuhan pembuatan website standalone, integrasi TikTok/Carousell ke website resmi).
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                <table style={{ width: '100%', fontSize: '0.6875rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <tr>
                      <th style={{ padding: '6px 8px' }}>Nama Workshop / Detailing</th>
                      <th style={{ padding: '6px 8px' }}>Nomor Telepon</th>
                      <th style={{ padding: '6px 8px' }}>Email Verifikasi</th>
                      <th style={{ padding: '6px 8px' }}>Status Web Saat Ini</th>
                      <th style={{ padding: '6px 8px' }}>what they need</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Kolorwerx Autoshop</td>
                      <td style={{ padding: '6px 8px' }}>+6584499440</td>
                      <td style={{ padding: '6px 8px' }}>chrislim3210@gmail.com</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Hanya TikTok profil</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--primary)' }}>make standalone website</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Colourkraze Spray Painting Specialist</td>
                      <td style={{ padding: '6px 8px' }}>+6588497974</td>
                      <td style={{ padding: '6px 8px' }}>spraystationpteltd@gmail.com</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Hanya Carousell profil</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--primary)' }}>make standalone website & instagram</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Rigour Paints</td>
                      <td style={{ padding: '6px 8px' }}>+6589381818</td>
                      <td style={{ padding: '6px 8px' }}>ringus@billionpaints.com</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>rigourpaints.com (basic)</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--primary)' }}>polish instagram page & make standalone website</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentTab.id === 'cami' && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <strong>Analisis Khusus Tab Cami (Healthcare & Medical Clinic):</strong> Sektor klinik dokter umum, klinik gigi (dental), spesialis, dan klinik estetika di Singapura. Memiliki fokus pada pemangkasan beban registrasi staf front-desk dan otomatisasi jadwal konsultasi pasien 24/7 melalui WhatsApp AI.
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                <table style={{ width: '100%', fontSize: '0.6875rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <tr>
                      <th style={{ padding: '6px 8px' }}>Nama Klinik / Praktik Dokter</th>
                      <th style={{ padding: '6px 8px' }}>Nomor Telepon</th>
                      <th style={{ padding: '6px 8px' }}>Email Verifikasi</th>
                      <th style={{ padding: '6px 8px' }}>Website & Profil</th>
                      <th style={{ padding: '6px 8px' }}>Catatan Problem Analysis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {localAddedLeads.filter(l => l.assigned_pic === 'Cami').map((lead, idx) => (
                      <tr key={`local-cami-${idx}`} style={{ backgroundColor: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#047857' }}>
                          {lead.name} <span style={{ fontSize: '0.625rem', padding: '1px 4px', background: '#dcfce7', borderRadius: '3px' }}>Baru Masuk</span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>{lead.phone || '-'}</td>
                        <td style={{ padding: '6px 8px' }}>{lead.email || '-'}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>{lead.social_media || '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#047857' }}>{lead.problem_analysis}</td>
                      </tr>
                    ))}
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Camden Medical Practice</td>
                      <td style={{ padding: '6px 8px' }}>+6568873232</td>
                      <td style={{ padding: '6px 8px' }}>enquiry@camdenmedical.sg</td>
                      <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>camdenmedical.sg</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Otomatisasi reminder konsultasi & booking antrean dokter via WhatsApp</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Novena Specialist Aesthetic Centre</td>
                      <td style={{ padding: '6px 8px' }}>+6563972007</td>
                      <td style={{ padding: '6px 8px' }}>care@novenaesthetic.com</td>
                      <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>novenaesthetic.com</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>AI pre-qualification & penanganan tanya jawab prosedur perawatan 24/7</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>Bukit Batok Dental Surgery</td>
                      <td style={{ padding: '6px 8px' }}>+6565691234</td>
                      <td style={{ padding: '6px 8px' }}>appointments@bbdental.sg</td>
                      <td style={{ padding: '6px 8px', color: 'var(--primary)' }}>bbdental.sg</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Solusi no-show prevention & konfirmasi kedatangan pasien otomatis</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentTab.id === 'sheet4' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <strong>Analisis Sheet4 (Master Email Outreach Copywriting):</strong> Dibuat khusus dengan 3 template cold outreach yang telah dioptimasi untuk pasar SME Singapura. Dikirim langsung melalui akun resmi <code>admin@prospekta.id</code>.
              </div>

              {templates.map((tpl) => (
                <div key={tpl.key} style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-card-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                    <div>
                      <strong style={{ fontSize: '0.8125rem', color: 'var(--text-main)' }}>{tpl.title}</strong>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{tpl.target}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyEmailText(tpl.key, `Subject: ${tpl.subject}\n\n${tpl.body}`)}
                      style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                    >
                      {copiedTemplate === tpl.key ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 600 }}>
                          <IconCheck size={12} />
                          <span>Tersalin</span>
                        </span>
                      ) : (
                        'Salin Naskah'
                      )}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '4px' }}>
                    Subject: {tpl.subject}
                  </div>
                  <pre style={{
                    fontSize: '0.6875rem',
                    backgroundColor: 'var(--bg-card)',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    margin: 0,
                    color: 'var(--text-main)'
                  }}>
                    {tpl.body}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {currentTab.id === 'scraping' && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                <strong>Analisis Tab Scraping:</strong> Berisi 13.619 baris data mentah tempat bisnis di sekitar wilayah Prospekta Hub (radius 5-10km). Mencakup beragam sektor (accounting, legal, clinic, contractor, interior, dll) yang siap dipilah untuk PIC berikutnya.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.75rem' }}>
                <div style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Total Tempat</div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>13.619 Baris</div>
                </div>
                <div style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Format Kolom</div>
                  <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-main)' }}>17 Kolom Standar Scraper</div>
                </div>
                <div style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Rekomendasi Tindakan</div>
                  <div style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--primary)' }}>Filter & Pindahkan 25 baris/hari</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Action Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg-card-subtle)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Sinkronisasi Serentak Tab Outreach Aktif
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
              Mengambil seluruh pembaruan dari Tab Danend's (Bakery) dan Tab Lyndsey (Auto Body) sekaligus.
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSync('all')}
            disabled={isSyncing}
            style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {isSyncing && syncingTarget === 'all' ? (
              <>
                <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span>Menyinkronkan Seluruh Tab Aktif...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                <span>Sinkronkan Seluruh PIC Aktif (Danend + Lyndsey)</span>
              </>
            )}
          </button>
        </div>

      </div>

      <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Terhubung ke Google Spreadsheet ID: <code>1VEY08yrBBTI4grA0fgHHxnh3nNKuXgIeCPMg7SJ9yvk</code>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </ModalWrapper>
  );
}

// 9. Add Lead Modal (Dedicated Direct Entry Form Modal)
export function AddLeadModal({ onClose, onSuccess, defaultIndustry = 'Private Healthcare & Specialist Clinics', currentSession, activeAnchor }) {
  const isSuperadmin = Boolean(currentSession?.isSuperadmin);
  const defaultSender = isSuperadmin
    ? 'Prospekta AI Team (admin@prospekta.id)'
    : (currentSession?.company_name && currentSession?.email
        ? `${currentSession.company_name} (${currentSession.email})`
        : (currentSession?.email || currentSession?.company_name || 'Tim Penjualan'));
  const [formData, setFormData] = useState({
    name: '',
    bidang_usaha: defaultIndustry,
    assigned_pic: defaultSender,
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    social_media: '',
    pic_name: '',
    pic_title: '',
    address: activeAnchor?.address || activeAnchor?.city || 'Indonesia',
    problem_analysis: '',
    offer_angle: defaultIndustry.toLowerCase().includes('clinic') || defaultIndustry.toLowerCase().includes('health') ? 'agentic_ai' : 'digital_structure',
    budget_capacity: 'medium'
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Nama perusahaan / klinik wajib diisi.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          anchor: activeAnchor?.name || (isSuperadmin ? 'Prospekta Jakarta Hub' : 'Kantor'),
          is_personal_lead: 1
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || 'Prospek berhasil ditambahkan.');
        setTimeout(() => {
          if (onSuccess) onSuccess(data);
          onClose();
        }, 1100);
      } else {
        setError(data.error || 'Gagal menyimpan prospek.');
      }
    } catch (err) {
      setError(err.message || 'Gagal menghubungi server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalWrapper title="Tambah Prospek Bisnis Baru (Direct Entry)" onClose={onClose} maxWidth="720px">
      <form onSubmit={handleSubmit}>
        <div className="modal-body" style={{ maxHeight: '78vh', overflowY: 'auto', padding: '1.25rem' }}>
          
          <div style={{
            padding: '0.625rem 0.875rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 'var(--radius-sm)',
            color: '#166534',
            fontSize: '0.8125rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <IconInfo size={16} style={{ flexShrink: 0, color: '#16a34a' }} />
            <span>Data yang Anda masukkan di sini langsung tersimpan ke database lokal & terhubung ke engine pembuatan email otomatis.</span>
          </div>

          {error && (
            <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#991b1b', fontSize: '0.8125rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          {successMsg && (
            <div style={{ padding: '0.625rem 0.875rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '4px', color: '#065f46', fontSize: '0.8125rem', marginBottom: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconCheck size={14} />
              <span>{successMsg}</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Nama Perusahaan / Klinik *
              </label>
              <input
                type="text"
                required
                className="input-text"
                placeholder="Misal: Camden Aesthetics atau Le Matin Patisserie"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Pengirim &amp; Tim Outreach
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="Misal: Prospekta (admin@prospekta.id)"
                value={formData.assigned_pic}
                onChange={(e) => setFormData({ ...formData, assigned_pic: e.target.value })}
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                Identitas dan email pengirim penawaran. Anda bisa mengubahnya bebas untuk pengujian atau tim yang berbeda.
              </span>
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Nama PIC / DM Prospek
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="Misal: Dr. Adrian atau Chef Julien"
                value={formData.pic_name}
                onChange={(e) => setFormData({ ...formData, pic_name: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Jabatan DM
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="Misal: Medical Director / Owner / Founder"
                value={formData.pic_title}
                onChange={(e) => setFormData({ ...formData, pic_title: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Nomor Telepon / WhatsApp
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="+65 6789 1234 atau +65 9123 4567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value, whatsapp: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Email Verifikasi
              </label>
              <input
                type="email"
                className="input-text"
                placeholder="contact@perusahaan.sg"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Website Perusahaan
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="https://perusahaan.sg"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Media Sosial (Instagram / LinkedIn)
              </label>
              <input
                type="text"
                className="input-text"
                placeholder="instagram.com/akun_sg atau linkedin.com/company/..."
                value={formData.social_media}
                onChange={(e) => setFormData({ ...formData, social_media: e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
              Catatan Masalah & Analisis Kebutuhan (Problem Analysis / What They Need)
            </label>
            <textarea
              className="textarea-input"
              rows={3}
              placeholder="Contoh: Belum memiliki booking online terintegrasi, pelanggan harus telepon atau DM manual. Butuh solusi automasi WhatsApp 24/7 dan formulir website modern."
              value={formData.problem_analysis}
              onChange={(e) => setFormData({ ...formData, problem_analysis: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Sudut Penawaran (Offer Angle)
              </label>
              <select
                className="select-input"
                value={formData.offer_angle}
                onChange={(e) => setFormData({ ...formData, offer_angle: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="digital_structure">Angle 1: Web Build / Modernization (Digital Presence)</option>
                <option value="agentic_ai">Angle 2: Agentic AI Solutions (Operational Efficiency)</option>
              </select>
            </div>

            <div>
              <label className="control-label" style={{ display: 'block', marginBottom: '4px' }}>
                Kapasitas Anggaran Klien
              </label>
              <select
                className="select-input"
                value={formData.budget_capacity}
                onChange={(e) => setFormData({ ...formData, budget_capacity: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="high">High (Kantor & Tim Mapan)</option>
                <option value="medium">Medium (SME Operasional Standar)</option>
                <option value="unverified">Belum Diverifikasi</option>
              </select>
            </div>
          </div>

        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary" style={{ backgroundColor: '#059669', borderColor: '#059669', fontWeight: 600 }}>
            {saving ? (
              'Menyimpan ke Database...'
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <IconCheck size={14} />
                <span>Simpan Prospek ke Pipeline</span>
              </span>
            )}
          </button>
        </div>
      </form>
    </ModalWrapper>
  );
}

// 9b. BatchAssignModal (Deprecated - Unified Single Pipeline)
export function BatchAssignModal({ onClose }) {
  if (onClose) onClose();
  return null;
}

// 10. Logout Confirmation Modal
export function LogoutModal({ onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } catch (_) {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper title="Konfirmasi Keluar Portal" onClose={onClose} maxWidth="420px">
      <div style={{ padding: '0.5rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444',
            flexShrink: 0
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-main)' }}>
              Akhiri Sesi Portal?
            </h3>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Sesi terenkripsi Anda akan ditutup. Anda perlu memasukkan kata sandi lagi untuk mengakses dashboard.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="btn btn-sm"
            style={{
              backgroundColor: '#ef4444',
              borderColor: '#ef4444',
              color: '#ffffff',
              fontWeight: 600
            }}
          >
            {loading ? 'Mengeluarkan...' : 'Ya, Keluar'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}



