'use client';

import React, { useState, useEffect, useCallback, useTransition, memo } from 'react';
import { useI18n } from '@/lib/i18n';

function LanguageToggle({ className = '', style = {}, isDark = true }) {
  const { lang, setLang, t } = useI18n();
  const [activeLang, setActiveLang] = useState(lang);
  const [, startTransition] = useTransition();

  // Sync if language changes externally
  useEffect(() => {
    setActiveLang(lang);
  }, [lang]);

  const handleSelect = useCallback((targetLang) => {
    if (targetLang === activeLang) return;

    // 1. Instant local visual update: 0ms lag, paints in current frame
    setActiveLang(targetLang);

    // 2. Defer heavy application translation to next animation frame via transition
    requestAnimationFrame(() => {
      startTransition(() => {
        setLang(targetLang);
      });
    });
  }, [activeLang, setLang]);

  return (
    <div
      className={`lang-toggle-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px',
        borderRadius: '999px',
        backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(226, 232, 240, 0.8)',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(203, 213, 225, 0.9)',
        boxShadow: isDark ? '0 2px 6px rgba(0, 0, 0, 0.25)' : '0 1px 4px rgba(0, 0, 0, 0.05)',
        userSelect: 'none',
        ...style
      }}
      role="group"
      aria-label={t('lang_toggle_title')}
      title={t('lang_toggle_title')}
    >
      <button
        type="button"
        onClick={() => handleSelect('en')}
        aria-pressed={activeLang === 'en'}
        style={{
          border: 'none',
          outline: 'none',
          cursor: 'pointer',
          minHeight: '36px',
          minWidth: '38px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 12px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          transition: 'all 0.18s ease',
          backgroundColor: activeLang === 'en'
            ? '#0284c7'
            : 'transparent',
          color: activeLang === 'en'
            ? '#ffffff'
            : (isDark ? '#94a3b8' : '#64748b'),
          boxShadow: activeLang === 'en'
            ? '0 1px 4px rgba(2, 132, 199, 0.4)'
            : 'none',
          lineHeight: 1.3
        }}
      >
        EN
      </button>

      <button
        type="button"
        onClick={() => handleSelect('id')}
        aria-pressed={activeLang === 'id'}
        style={{
          border: 'none',
          outline: 'none',
          cursor: 'pointer',
          minHeight: '36px',
          minWidth: '38px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 12px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          transition: 'all 0.18s ease',
          backgroundColor: activeLang === 'id'
            ? '#0284c7'
            : 'transparent',
          color: activeLang === 'id'
            ? '#ffffff'
            : (isDark ? '#94a3b8' : '#64748b'),
          boxShadow: activeLang === 'id'
            ? '0 1px 4px rgba(2, 132, 199, 0.4)'
            : 'none',
          lineHeight: 1.3
        }}
      >
        ID
      </button>
    </div>
  );
}

export default memo(LanguageToggle);
