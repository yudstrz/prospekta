'use client';

import React from 'react';
import { useI18n, tx } from '@/lib/i18n';

// Inline lightweight SVG icons for the proposal viewer
const IconDocument = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconShieldCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const IconInfo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconExternal = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

/**
 * Format inline text (strip markdown asterisks, render bold, links, and badges)
 */
function renderFormattedText(text) {
  if (!text) return null;

  // Render markdown links [label](url)
  const linkRegex = /\[(.*?)\]\((.*?)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const url = match[2];
    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'var(--primary)',
          fontWeight: 600,
          textDecoration: 'underline',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px'
        }}
      >
        {label} <IconExternal />
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // Next, parse **bold** and *italic* inside text segments
  return parts.map((part, pIdx) => {
    if (typeof part !== 'string') return part;

    // Split by **
    const boldTokens = part.split(/\*\*(.*?)\*\*/g);
    return boldTokens.map((tok, bIdx) => {
      if (bIdx % 2 === 1) {
        return <strong key={`b-${pIdx}-${bIdx}`} style={{ fontWeight: 700, color: 'var(--text-main)' }}>{tok}</strong>;
      }
      // Check for italic *
      const italicTokens = tok.split(/\*(.*?)\*/g);
      return italicTokens.map((it, iIdx) => {
        if (iIdx % 2 === 1) {
          return <em key={`em-${pIdx}-${bIdx}-${iIdx}`} style={{ color: 'var(--text-muted)' }}>{it}</em>;
        }
        return it;
      });
    });
  });
}

/**
 * Render value with appropriate status badges (UNVERIFIED, HIGH, MEDIUM, etc.)
 */
function renderValueWithBadges(valText, lang) {
  if (!valText) return '-';

  const cleanVal = valText.trim();
  const upper = cleanVal.toUpperCase();

  if (upper === 'UNVERIFIED' || upper.startsWith('UNVERIFIED')) {
    return (
      <span className="badge badge-warning" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
        {tx('Not Verified (UNVERIFIED)', 'Belum Diverifikasi (UNVERIFIED)', lang)}
      </span>
    );
  }

  if (upper === 'HIGH' || upper.startsWith('HIGH (')) {
    return (
      <span className="badge badge-success" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
        {tx('Strong Capacity (HIGH)', 'Kapasitas Kuat (HIGH)', lang)}
      </span>
    );
  }

  if (upper === 'MEDIUM' || upper.startsWith('MEDIUM (')) {
    return (
      <span className="badge badge-anchor" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
        {tx('Standard / Medium Capacity (MEDIUM)', 'Kapasitas Standar / Menengah (MEDIUM)', lang)}
      </span>
    );
  }

  return renderFormattedText(cleanVal);
}

/**
 * Main Executive Proposal Viewer Component
 */
export default function ProposalViewer({ content, companyName }) {
  const { lang, tx } = useI18n();
  if (!companyName) companyName = tx('Company', 'Perusahaan');
  if (!content) {
    return (
      <div className="state-container" style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p className="state-desc">{tx('No proposal content yet.', 'Belum ada konten proposal.')}</p>
      </div>
    );
  }

  // Parse markdown content line-by-line into structured semantic blocks
  const rawLines = content.split('\n');

  let title = tx(`Partnership Proposal: ${companyName}`, `Proposal Kemitraan: ${companyName}`);
  const metadata = [];
  const sections = [];
  let currentSection = null;
  let disclaimer = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    // 1. Title (# )
    if (line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').replace(/\*\*/g, '');
      continue;
    }

    // 2. Metadata lines in header (**Key:** Value) before the first section
    if (line.startsWith('**') && line.includes(':**') && sections.length === 0) {
      const match = line.match(/^\*\*(.*?):\*\*\s*(.*)$/);
      if (match) {
        metadata.push({
          key: match[1].replace(/\*\*/g, '').trim(),
          val: match[2].replace(/\*\*/g, '').trim()
        });
        continue;
      }
    }

    // 3. Section divider
    if (line === '---') {
      continue;
    }

    // 4. Main Section (## )
    if (line.startsWith('## ')) {
      const secTitle = line.replace(/^##\s+/, '').replace(/\*\*/g, '');
      currentSection = {
        title: secTitle,
        items: []
      };
      sections.push(currentSection);
      continue;
    }

    // 5. Disclaimer footer (*Dokumen ini...*)
    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
      disclaimer = line.replace(/^\*+|\*+$/g, '').trim();
      continue;
    }

    // Default container if line appears before any ##
    if (!currentSection) {
      currentSection = { title: tx('General Information', 'Informasi Umum'), items: [] };
      sections.push(currentSection);
    }

    // 6. Subsections (### )
    if (line.startsWith('### ')) {
      const subTitle = line.replace(/^###\s+/, '').replace(/\*\*/g, '');
      currentSection.items.push({
        type: 'subsection',
        title: subTitle
      });
      continue;
    }

    // 7. Key-Value bullet item (- **Key:** Value)
    const kvMatch = line.match(/^-\s*\*\*(.*?):\*\*\s*(.*)$/);
    if (kvMatch) {
      currentSection.items.push({
        type: 'kv',
        key: kvMatch[1].replace(/\*\*/g, '').trim(),
        val: kvMatch[2].trim()
      });
      continue;
    }

    // 8. Numbered phase step (1. **Phase 1: ...:** Description)
    const stepMatch = line.match(/^(\d+)\.\s*\*\*(.*?)\*\*(.*)$/);
    if (stepMatch) {
      const stepNum = stepMatch[1];
      const stepHeader = stepMatch[2].replace(/:$/, '').trim();
      const stepBody = stepMatch[3].replace(/^:\s*/, '').trim();
      currentSection.items.push({
        type: 'step',
        num: stepNum,
        title: stepHeader,
        body: stepBody
      });
      continue;
    }

    // 9. Callout / Notice (> ...)
    if (line.startsWith('>')) {
      const calloutText = line.replace(/^>\s*(\[!NOTE\])?/i, '').trim();
      currentSection.items.push({
        type: 'callout',
        text: calloutText
      });
      continue;
    }

    // 10. Standard bullet point (- ...)
    if (line.startsWith('- ')) {
      const bulletText = line.replace(/^-\s+/, '').trim();
      currentSection.items.push({
        type: 'bullet',
        text: bulletText
      });
      continue;
    }

    // 11. Regular Paragraph
    currentSection.items.push({
      type: 'paragraph',
      text: line
    });
  }

  return (
    <div className="proposal-doc-container">
      {/* Document Official Header */}
      <div className="proposal-doc-header">
        <div className="proposal-doc-title">
          <IconDocument />
          <span>{title}</span>
        </div>

        {metadata.length > 0 && (
          <div className="proposal-meta-grid">
            {metadata.map((m, idx) => (
              <div key={idx} className="proposal-meta-item">
                <span className="proposal-meta-label">{m.key}</span>
                <span className="proposal-meta-value">{renderValueWithBadges(m.val, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Structured Proposal Sections */}
      {sections.map((sec, sIdx) => {
        // Group consecutive KV items together inside a kv-list
        const renderedItems = [];
        let currentKvGroup = [];

        const flushKvGroup = () => {
          if (currentKvGroup.length > 0) {
            renderedItems.push(
              <div key={`kv-group-${renderedItems.length}`} className="proposal-kv-list">
                {currentKvGroup.map((kv, kIdx) => (
                  <div key={kIdx} className="proposal-kv-row">
                    <span className="proposal-kv-key">{kv.key}:</span>
                    <span className="proposal-kv-val">{renderValueWithBadges(kv.val, lang)}</span>
                  </div>
                ))}
              </div>
            );
            currentKvGroup = [];
          }
        };

        sec.items.forEach((item, itemIdx) => {
          if (item.type === 'kv') {
            currentKvGroup.push(item);
          } else {
            flushKvGroup();

            if (item.type === 'subsection') {
              renderedItems.push(
                <h4 key={`sub-${itemIdx}`} className="proposal-subsection-title">
                  {item.title}
                </h4>
              );
            } else if (item.type === 'step') {
              renderedItems.push(
                <div key={`step-${itemIdx}`} className="proposal-step-item">
                  <div className="proposal-step-num">{item.num}</div>
                  <div className="proposal-step-content">
                    <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '2px' }}>
                      {item.title}
                    </strong>
                    <div style={{ color: 'var(--text-muted)' }}>
                      {renderFormattedText(item.body)}
                    </div>
                  </div>
                </div>
              );
            } else if (item.type === 'callout') {
              renderedItems.push(
                <div key={`callout-${itemIdx}`} className="proposal-callout">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <IconInfo />
                    <div>{renderFormattedText(item.text)}</div>
                  </div>
                </div>
              );
            } else if (item.type === 'bullet') {
              renderedItems.push(
                <div key={`b-${itemIdx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8125rem', padding: '2px 0' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>•</span>
                  <div style={{ color: 'var(--text-main)', lineHeight: 1.5 }}>
                    {renderFormattedText(item.text)}
                  </div>
                </div>
              );
            } else if (item.type === 'paragraph') {
              renderedItems.push(
                <p key={`p-${itemIdx}`} style={{ margin: '0.25rem 0', fontSize: '0.8125rem', lineHeight: 1.6, color: 'var(--text-main)' }}>
                  {renderFormattedText(item.text)}
                </p>
              );
            }
          }
        });

        flushKvGroup();

        return (
          <section key={sIdx} className="proposal-section-card">
            <div className="proposal-section-header">
              <span className="proposal-section-badge">
                {String(sIdx + 1).padStart(2, '0')}
              </span>
              <h3 className="proposal-section-title">{sec.title}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {renderedItems}
            </div>
          </section>
        );
      })}

      {/* Official Audit Disclaimer */}
      {disclaimer && (
        <div className="proposal-footer-disclaimer">
          <IconShieldCheck />
          <span>{disclaimer}</span>
        </div>
      )}
    </div>
  );
}
