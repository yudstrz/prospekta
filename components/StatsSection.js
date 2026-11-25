'use client';

import { memo } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Modern Minimalist Stats Section for Prospekta
 * Reflects the 4 Core Pillars: Lokasi, Website, PDF Proposal, and Universal MCP
 * Complies with 12 UI/UX rules: WCAG AA contrast, touch targets >= 44px, responsive grid.
 */
function StatsSection({
  stats = {},
  activeFilters = {},
  onOpenPrebuiltSites = null,
  onOpenMcpModal = null,
  onFilterWebsite = null,
  onFilterNoWebsite = null,
  onFilterPhone = null,
  onFilterNoPhone = null,
  onFilterPrebuiltSites = null,
  onResetFilters = null
}) {
  const { lang, t } = useI18n();
  const tx = (en, id) => (lang === 'en' ? en : id);

  const total = stats.total || 0;
  const withPhone = stats.with_phone || 0;
  const withWebsite = stats.with_website || 0;
  const withoutWebsite = Math.max(0, total - withWebsite);
  const withoutPhone = Math.max(0, total - withPhone);
  const proposalCount = stats.proposal_count || stats.analyzed_count || 0;
  const prebuiltCount = stats.prebuilt_count || 0;

  const hasWebsiteActive = !!activeFilters.hasWebsite;
  const noWebsiteActive = !!activeFilters.noWebsite;
  const hasPhoneActive = !!activeFilters.hasPhone;
  const noPhoneActive = !!activeFilters.noPhone;
  const hasPrebuiltActive = !!activeFilters.hasPrebuiltSiteFilter;
  const isAnyFilterActive = !!activeFilters.isAnyFilterActive;

  return (
    <section className="stats-wrapper" aria-label="Ringkasan Metrik Prospekta">
      {/* Filter Reset Banner if any filter active */}
      {isAnyFilterActive && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            border: '1px solid rgba(37, 99, 235, 0.25)',
            borderRadius: '8px',
            marginBottom: '12px',
            fontSize: '12.5px',
            color: 'var(--text-main)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#0284c7' }} />
            <span>{tx('Filtering active on prospect catalog', 'Filter kriteria sedang diterapkan')}</span>
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="btn btn-secondary btn-sm"
            style={{
              padding: '4px 12px',
              minHeight: '32px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#ef4444',
              borderColor: 'rgba(239, 68, 68, 0.3)',
            }}
          >
            {tx('Reset Filters', 'Reset Semua Filter')}
          </button>
        </div>
      )}

      <div
        className="prospekta-stats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
          gap: '14px',
        }}
      >
        {/* 1. Radar Lokasi: Total Prospek */}
        <div
          className="stat-card"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {tx('Geospatial Radius', 'Radar Wilayah & Lokasi')}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  color: '#0284c7',
                }}
              >
                {tx('Active Scan', 'Aktif')}
              </span>
            </div>

            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {total.toLocaleString()}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {tx('Prospects mapped in office radius', 'Tempat bisnis terpetakan di radius')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={onFilterPhone}
              className={`pill-btn ${hasPhoneActive ? 'active' : ''}`}
              style={{ flex: 1, minHeight: '36px', fontSize: '11.5px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
              title={tx('Filter places with phone', 'Filter yang ada telepon')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>{withPhone} {tx('Verified', 'Kontak')}</span>
            </button>
            <button
              type="button"
              onClick={onFilterNoPhone}
              className={`pill-btn ${noPhoneActive ? 'active' : ''}`}
              style={{ flex: 1, minHeight: '36px', fontSize: '11.5px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
              title={tx('Filter places without phone', 'Filter tanpa telepon')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              <span>{withoutPhone} {tx('No Phone', 'Tanpa Telp')}</span>
            </button>
          </div>
        </div>

        {/* 2. Kondisi Website */}
        <div
          className="stat-card"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {tx('Website Presence', 'Status Website Prospek')}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(34, 197, 94, 0.12)',
                  color: '#16a34a',
                }}
              >
                {total > 0 ? `${Math.round((withWebsite / total) * 100)}% Online` : '0%'}
              </span>
            </div>

            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {withWebsite.toLocaleString()}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {tx('Prospects with established websites', 'Prospek dengan website aktif')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={onFilterWebsite}
              className={`pill-btn ${hasWebsiteActive ? 'active' : ''}`}
              style={{ flex: 1, minHeight: '36px', fontSize: '11.5px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
              title={tx('Filter online businesses', 'Filter bisnis ber-website')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span>{withWebsite} {tx('Have Web', 'Ada Web')}</span>
            </button>
            <button
              type="button"
              onClick={onFilterNoWebsite}
              className={`pill-btn ${noWebsiteActive ? 'active' : ''}`}
              style={{ flex: 1, minHeight: '36px', fontSize: '11.5px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
              title={tx('Filter offline businesses', 'Filter bisnis belum ber-website')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>{withoutWebsite} {tx('Need Web', 'Butuh Web')}</span>
            </button>
          </div>
        </div>

        {/* 3. Dokumen Proposal & Analisis PDF */}
        <div
          className="stat-card"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {tx('PDF Proposals & Audits', 'Dokumen & Proposal PDF')}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(99, 102, 241, 0.12)',
                  color: '#6366f1',
                }}
              >
                Ready
              </span>
            </div>

            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {proposalCount.toLocaleString()}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {tx('Proposals, solution drafts, & PDF audits generated', 'Proposal, audit & draf solusi terbit')}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', minHeight: '36px' }}>
            <div
              style={{
                flex: 1,
                fontSize: '11.5px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>{tx('Ready for 1-click download', 'Siap unduh per prospek')}</span>
            </div>
          </div>
        </div>

        {/* 4. Prebuilt Website & MCP Plugin */}
        <div
          className="stat-card"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {tx('Prebuilt Sites & AI', 'Website & Integrasi AI')}
              </span>
              <button
                type="button"
                onClick={onOpenMcpModal}
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(168, 85, 247, 0.12)',
                  color: '#a855f7',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={tx('Manage BYOK AI API Key & Email Settings', 'Kelola API Key AI & Konektor Email')}
              >
                <span>Integrasi AI</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </button>
            </div>

            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {prebuiltCount.toLocaleString()}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {tx('Live preview sites & concierge deployed', 'Website preview live (/p/[slug])')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={onFilterPrebuiltSites || onOpenPrebuiltSites}
              className={`pill-btn ${hasPrebuiltActive ? 'active' : ''}`}
              style={{ flex: 1, minHeight: '36px', fontSize: '11.5px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              title={tx('View all prebuilt websites directory', 'Lihat direktori website preview')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span>{tx('Prebuilt Directory', 'Direktori Situs')}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(StatsSection);
