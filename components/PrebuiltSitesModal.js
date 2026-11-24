'use client';

import React, { useState, useEffect, useRef } from 'react';
import { copyToClipboard } from '@/lib/clipboard';
import { IconCheck } from './icons';
import { useI18n } from '@/lib/i18n';

export default function PrebuiltSitesModal({ onClose, onOpenPlace = null, initialTotal = 0 }) {
  const { lang, tx } = useI18n();
  const numLocale = lang === 'id' ? 'id-ID' : 'en-US';
  const [sites, setSites] = useState([]);
  const [total, setTotal] = useState(initialTotal || 0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [copiedKey, setCopiedKey] = useState(null);

  // Desktop horizontal drag-to-scroll & navigation ref
  const tableWrapperRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  const handleMouseDown = (e) => {
    if (e.target.closest('button, a, input, select')) return;
    if (!tableWrapperRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - tableWrapperRef.current.offsetLeft);
    setScrollLeftState(tableWrapperRef.current.scrollLeft);
  };

  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e) => {
    if (!isDragging || !tableWrapperRef.current) return;
    e.preventDefault();
    const x = e.pageX - tableWrapperRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    tableWrapperRef.current.scrollLeft = scrollLeftState - walk;
  };

  const scrollTable = (direction) => {
    if (!tableWrapperRef.current) return;
    const offset = direction === 'left' ? -300 : 300;
    tableWrapperRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const fetchSites = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: targetPage.toString(),
        limit: '25',
        _t: Date.now().toString()
      });
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/reach/prebuilt-site?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || tx('Failed to load website directory', 'Gagal memuat direktori website'));
      }

      setSites(data.sites || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(data.page || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites(1);
  }, [selectedStatus]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchSites(1);
  };

  const handleCopy = async (key, text) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

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

  const isBackdropClickRef = useRef(false);

  const handleBackdropMouseDown = (e) => {
    isBackdropClickRef.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e) => {
    if (isBackdropClickRef.current && e.target === e.currentTarget) {
      onClose();
    }
    isBackdropClickRef.current = false;
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-content directory-modal-content"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="directory-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
            <span style={{ display: 'inline-flex', color: '#059669', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 className="modal-title" style={{ fontSize: '1.0625rem', margin: 0, lineHeight: 1.3 }}>
                {tx('Generated Prebuilt Website Directory', 'Direktori Website Prebuilt yang Sudah Digenerate')}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx('Live previews of modern landing pages ready for digital and agentic AI outreach', 'Daftar live preview landing page modern siap pakai untuk penawaran solusi digital & agentic AI')}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ minHeight: '40px', minWidth: '40px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            aria-label={tx('Close modal', 'Tutup modal')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Status Metrics Bar */}
        <div className="directory-metrics-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {tx('Total Prebuilt Websites:', 'Total Website Prebuilt:')}
            </span>
            <span
              className="badge"
              style={{
                fontSize: '0.8125rem',
                padding: '0.25rem 0.625rem',
                fontWeight: 700,
                backgroundColor: '#ecfdf5',
                color: '#047857',
                border: '1px solid #a7f3d0'
              }}
            >
              {loading && total === 0 ? tx('Loading...', 'Memuat...') : `${total.toLocaleString(numLocale)} ${tx('Live Websites', 'Website Live')}`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Scroll Navigation Arrows for Desktop */}
            <div className="desktop-only-flex" style={{ alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => scrollTable('left')}
                style={{ padding: '4px 8px', minHeight: '34px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                title={tx('Scroll table left', 'Geser tabel ke kiri')}
                aria-label={tx('Scroll table left', 'Geser tabel ke kiri')}
              >
                <span>&larr;</span>
                <span>{tx('Left', 'Kiri')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => scrollTable('right')}
                style={{ padding: '4px 8px', minHeight: '34px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                title={tx('Scroll table right', 'Geser tabel ke kanan')}
                aria-label={tx('Scroll table right', 'Geser tabel ke kanan')}
              >
                <span>{tx('Right', 'Kanan')}</span>
                <span>&rarr;</span>
              </button>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fetchSites(page)}
              disabled={loading}
              style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', minHeight: '34px' }}
            >
              {loading ? tx('Loading...', 'Memuat...') : tx('Refresh', 'Segarkan')}
            </button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="directory-filter-bar">
          <form onSubmit={handleSearchSubmit} className="directory-filter-form">
            <div className="directory-search-wrap">
              <span className="directory-search-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input
                type="text"
                className="input-text filter-field"
                placeholder={tx('Search business name, category, or slug...', 'Cari nama bisnis, kategori, atau slug url...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', fontSize: '0.8125rem', height: '38px', paddingLeft: '34px' }}
              />
            </div>

            <div className="directory-filter-selects">
              <select
                className="select-input filter-field"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{ fontSize: '0.8125rem', height: '38px', minWidth: '190px', width: 'auto' }}
              >
                <option value="all">{tx('All Outreach Statuses', 'Semua Status Outreach')}</option>
                <option value="draft">{tx('Draft (Not Sent)', 'Draft (Belum Dikirim)')}</option>
                <option value="sent">{tx('Sent (Email Delivered)', 'Sent (Sudah Dikirim Email)')}</option>
              </select>
            </div>

            <div className="directory-filter-actions">
              <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8125rem', minHeight: '38px', padding: '0 1rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>{tx('Search', 'Cari')}</span>
              </button>
              {(search || selectedStatus !== 'all') && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearch('');
                    setSelectedStatus('all');
                    fetchSites(1);
                  }}
                  style={{ fontSize: '0.8125rem', minHeight: '38px' }}
                >
                  {tx('Reset', 'Reset')}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Content Body */}
        <div className="directory-modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{tx('Loading prebuilt website directory...', 'Memuat direktori website prebuilt...')}</div>
            </div>
          ) : error ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--danger-text)' }}>
              <div>{tx('An error occurred:', 'Terjadi kesalahan:')} {error}</div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fetchSites(1)} style={{ marginTop: '0.5rem', minHeight: '40px' }}>
                {tx('Try Again', 'Coba Lagi')}
              </button>
            </div>
          ) : sites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                {tx('No Prebuilt Websites Yet', 'Belum Ada Website Prebuilt')}
              </div>
              <div style={{ fontSize: '0.8125rem', maxWidth: '420px', margin: '0 auto' }}>
                {search || selectedStatus !== 'all'
                  ? tx('No websites match the selected filters.', 'Tidak ada website yang cocok dengan filter pencarian.')
                  : tx('No prebuilt websites generated yet. Open any prospect and click "Generate Website" to create an instant preview.', 'Belum ada website prebuilt yang digenerate. Buka modal riset prospek mana saja dan klik "Generate Website" untuk membuat preview instan.')}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Table View (>= 769px) */}
              <div
                ref={tableWrapperRef}
                className="desktop-table-view table-wrapper"
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  cursor: isDragging ? 'grabbing' : 'default',
                  userSelect: isDragging ? 'none' : 'auto'
                }}
              >
                <table style={{ margin: 0, width: '100%', minWidth: '900px' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.625rem 0.75rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>Perusahaan / Bisnis</th>
                      <th style={{ padding: '0.625rem 0.75rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>Tautan Preview Live</th>
                      <th style={{ padding: '0.625rem 0.75rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>Status Outreach</th>
                      <th style={{ padding: '0.625rem 0.75rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>Tanggal Dibuat</th>
                      <th style={{ textAlign: 'center', padding: '0.625rem 0.75rem', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((site) => {
                      const isSent = site.status === 'sent' || site.place_reach_status === 'sent' || Number(site.place_outreach_count) > 0;
                      return (
                        <tr key={site.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.875rem' }}>
                              {site.company_name || site.place_name}
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', borderRadius: '4px', padding: '1px 6px', fontSize: '0.6875rem', fontWeight: 600, marginTop: '4px' }}>
                              {site.category || site.place_bidang_usaha || 'Bisnis Komersial'}
                            </div>
                            {site.place_address && (
                              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '3px', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{site.place_address}</span>
                              </div>
                            )}
                          </td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <a
                                href={`/p/${site.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: '#059669',
                                  fontWeight: 700,
                                  fontSize: '0.8125rem',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Buka preview live di tab baru"
                              >
                                <span>/p/{site.slug}</span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                              </a>

                              <button
                                type="button"
                                onClick={() => handleCopy(`site_${site.id}`, typeof window !== 'undefined' ? `${window.location.origin}/customer-reach/p/${site.slug}` : site.url)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: 0,
                                  color: copiedKey === `site_${site.id}` ? '#059669' : 'var(--text-muted)'
                                }}
                                title="Salin tautan preview lengkap"
                              >
                                {copiedKey === `site_${site.id}` ? (
                                  <span style={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 600 }}>Tersalin!</span>
                                ) : (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                )}
                              </button>
                            </div>

                            {site.hero_headline && (
                              <div style={{ fontSize: '0.71875rem', color: '#475569', marginTop: '4px', maxWidth: '340px', lineHeight: 1.4, fontWeight: 500 }}>
                                &ldquo;{site.hero_headline}&rdquo;
                              </div>
                            )}
                          </td>

                          <td>
                            <div>
                              <span
                                className={`badge ${isSent ? 'badge-anchor' : 'badge-pending'}`}
                                style={{ fontSize: '0.6875rem', fontWeight: 600 }}
                              >
                                {isSent ? `Terkirim Email (${site.place_outreach_count || 1}x)` : 'Draft (Belum Kirim)'}
                              </span>
                            </div>
                            {site.sent_at || site.place_last_outreach_at ? (
                              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Terkirim: {new Date(site.sent_at || site.place_last_outreach_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </div>
                            ) : null}
                          </td>

                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(site.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </td>

                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <a
                                href={`/p/${site.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '0.71875rem', padding: '3px 8px', minHeight: '28px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                              >
                                <span>Lihat Web</span>
                              </a>
                              {onOpenPlace && site.place_id && (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => {
                                    onOpenPlace({
                                      overture_id: site.place_id,
                                      name: site.company_name || site.place_name,
                                      email: site.place_email,
                                      phone: site.place_phone,
                                      bidang_usaha: site.category || site.place_bidang_usaha
                                    });
                                    onClose();
                                  }}
                                  style={{ fontSize: '0.71875rem', padding: '3px 8px', minHeight: '28px' }}
                                  title="Buka panel riset & penjangkauan prospek"
                                >
                                  Buka Riset
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View (< 769px) - Reflow & Touch First */}
              <div className="mobile-cards-view">
                {sites.map((site) => {
                  const isSent = site.status === 'sent' || site.place_reach_status === 'sent' || Number(site.place_outreach_count) > 0;
                  return (
                    <div key={`m_${site.id}`} className="directory-card">
                      <div className="directory-card-header">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9375rem', lineHeight: 1.3 }}>
                            {site.company_name || site.place_name}
                          </div>
                          <div className="directory-card-badge-row" style={{ marginTop: '4px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', borderRadius: '4px', padding: '2px 6px', fontSize: '0.6875rem', fontWeight: 600 }}>
                              {site.category || site.place_bidang_usaha || 'Bisnis Komersial'}
                            </span>
                            {site.place_address && (
                              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                <span>{site.place_address}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <span
                          className={`badge ${isSent ? 'badge-anchor' : 'badge-pending'}`}
                          style={{ fontSize: '0.6875rem', fontWeight: 600, flexShrink: 0 }}
                        >
                          {isSent ? `Terkirim (${site.place_outreach_count || 1}x)` : 'Draft'}
                        </span>
                      </div>

                      {/* Live Preview Box */}
                      <div className="directory-card-info-box">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <a
                            href={`/p/${site.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#059669',
                              fontWeight: 700,
                              fontSize: '0.8125rem',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              wordBreak: 'break-all'
                            }}
                          >
                            <span>/p/{site.slug}</span>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </a>

                          <button
                            type="button"
                            onClick={() => handleCopy(`m_site_${site.id}`, typeof window !== 'undefined' ? `${window.location.origin}/customer-reach/p/${site.slug}` : site.url)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.6875rem', padding: '3px 8px', minHeight: '32px', flexShrink: 0 }}
                          >
                            {copiedKey === `m_site_${site.id}` ? (
                              <span style={{ color: '#059669', fontWeight: 700 }}>Tersalin!</span>
                            ) : (
                              <span>Salin URL</span>
                            )}
                          </button>
                        </div>

                        {site.hero_headline && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4, fontStyle: 'italic' }}>
                            &ldquo;{site.hero_headline}&rdquo;
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                        <div>
                          Dibuat: {new Date(site.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="directory-card-actions">
                        <a
                          href={`/p/${site.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ textDecoration: 'none' }}
                        >
                          Lihat Web
                        </a>
                        {onOpenPlace && site.place_id && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              onOpenPlace({
                                overture_id: site.place_id,
                                name: site.company_name || site.place_name,
                                email: site.place_email,
                                phone: site.place_phone,
                                bidang_usaha: site.category || site.place_bidang_usaha
                              });
                              onClose();
                            }}
                          >
                            Buka Riset
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="directory-modal-footer">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {loading && total === 0
              ? 'Memuat data direktori...'
              : `Halaman ${page} dari ${totalPages} (Total ${total.toLocaleString('id-ID')} website)`}
          </div>

          <div className="footer-btns">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1 || loading}
              onClick={() => fetchSites(page - 1)}
              style={{ fontSize: '0.75rem' }}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages || loading}
              onClick={() => fetchSites(page + 1)}
              style={{ fontSize: '0.75rem' }}
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
