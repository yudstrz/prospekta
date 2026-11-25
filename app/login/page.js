'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import LanguageToggle from '@/components/LanguageToggle';
import AuthFlow, { flowHead } from '@/components/AuthFlow';
import { ProspektaMark } from '@/components/ProspektaLogo';

export default function LoginPage() {
  const router = useRouter();
  const { lang, t } = useI18n();
  const [theme, setTheme] = useState('light'); // Default Light Mode sesuai preferensi user
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState('login');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  // Inisialisasi tema & kredensial tersimpan saat pertama kali dimuat
  useEffect(() => {
    try {
      // 1. Cek preferensi tema (Default: light)
      const savedTheme = localStorage.getItem('prospekta_theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      } else {
        setTheme('light');
        document.documentElement.setAttribute('data-theme', 'light');
      }

      // 2. Preferensi "Ingat Saya"; bersihkan password lama yang pernah tersimpan
      const savedChoice = localStorage.getItem('prospekta_remember_choice');
      localStorage.removeItem('prospekta_remembered_pwd');
      if (savedChoice !== null) {
        setRememberMe(savedChoice === 'true');
      }
    } catch (_) {}
  }, []);

  // Handler toggle mode terang / mode gelap
  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('prospekta_theme', next);
      document.documentElement.setAttribute('data-theme', next);
    } catch (_) {}
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setError(t('login_err_empty'));
      triggerShake();
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        throw new Error(res.status === 404 ? 'Layanan otentikasi tidak ditemukan.' : 'Gagal memproses respon server.');
      }

      if (data.needsVerification) {
        await fetch('/api/auth/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => {});
        setLoading(false);
        setMode('verify');
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error || t('login_err_invalid'));
        triggerShake();
        setLoading(false);
        return;
      }

      // Password tidak pernah disimpan di browser; "Ingat Saya" hanya memperpanjang masa cookie.
      localStorage.removeItem('prospekta_remembered_pwd');
      localStorage.setItem('prospekta_remember_choice', String(rememberMe));

      // Alihkan ke URL tujuan atau root dashboard
      const params = new URLSearchParams(window.location.search);
      let target = params.get('from') || '/';
      if (target.startsWith('/customer-reach')) {
        target = target.replace(/^\/customer-reach/, '') || '/';
      }
      router.push(target);
      router.refresh();
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || !navigator.onLine) {
        setError(t('login_err_network'));
      } else {
        setError(msg || t('login_err_network'));
      }
      triggerShake();
      setLoading(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <>
      <style>{`
        @keyframes loginFadeIn {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes loginShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }

        @keyframes rotateSpinner {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .login-card {
          animation: loginFadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .login-card.is-shaking {
          animation: loginShake 0.28s ease-in-out;
        }

        .login-input:focus {
          border-color: #0284c7 !important;
          box-shadow: 0 0 0 3px ${isDark ? 'rgba(2, 132, 199, 0.25)' : 'rgba(2, 132, 199, 0.18)'} !important;
        }

        .login-btn:hover:not(:disabled) {
          background-color: #0369a1 !important;
        }

        .login-btn:active:not(:disabled) {
          transform: scale(0.985);
        }

        .theme-switch-btn {
          transition: all 0.18s ease;
        }

        .theme-switch-btn:hover {
          transform: translateY(-1px);
        }

        .theme-switch-btn:active {
          transform: translateY(0);
        }

        @media (max-width: 480px) {
          .login-container {
            padding: 16px !important;
          }
          .login-card {
            padding: 24px 20px !important;
            border-radius: 14px !important;
          }
          .login-title {
            font-size: 20px !important;
          }
          .theme-switch-btn span.theme-text {
            display: none !important;
          }
        }
      `}</style>

      {/* Floating Controls: Language Toggle & Theme Switcher */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <LanguageToggle isDark={isDark} />
        <button
          type="button"
          onClick={handleToggleTheme}
          className="theme-switch-btn"
          title={isDark ? (lang === 'en' ? 'Switch to Light Mode' : 'Beralih ke Mode Terang') : (lang === 'en' ? 'Switch to Dark Mode' : 'Beralih ke Mode Gelap')}
          aria-label={isDark ? t('theme_light') : t('theme_dark')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '999px',
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
            color: isDark ? '#f8fafc' : '#0f172a',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: isDark
              ? '0 4px 12px rgba(0, 0, 0, 0.4)'
              : '0 2px 8px rgba(0, 0, 0, 0.08)'
          }}
        >
          {isDark ? (
            <>
              {/* Sun Icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <span className="theme-text">{t('theme_light')}</span>
            </>
          ) : (
            <>
              {/* Moon Icon */}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              <span className="theme-text">{t('theme_dark')}</span>
            </>
          )}
        </button>
      </div>

      <div
        className="login-container"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#0a0f1d' : '#f1f5f9',
          color: isDark ? '#f8fafc' : '#0f172a',
          padding: '24px 16px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          boxSizing: 'border-box',
          overflowX: 'hidden',
          transition: 'background-color 0.2s ease, color 0.2s ease'
        }}
      >
        <div
          className={`login-card ${isShaking ? 'is-shaking' : ''}`}
          style={{
            width: '100%',
            maxWidth: '420px',
            backgroundColor: isDark ? '#111827' : '#ffffff',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '36px 32px',
            boxShadow: isDark
              ? '0 20px 45px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04)'
              : '0 12px 30px -8px rgba(0, 0, 0, 0.07), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
            boxSizing: 'border-box'
          }}
        >
          {/* Header & Identitas */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
              <ProspektaMark size={40} />
              <span style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.03em', color: isDark ? '#ffffff' : '#0f172a' }}>
                Prospekta
              </span>
            </div>

            <h1
              className="login-title"
              style={{
                fontSize: '20px',
                fontWeight: 700,
                margin: '0 0 6px',
                color: isDark ? '#ffffff' : '#0f172a',
                letterSpacing: '-0.02em',
                lineHeight: 1.25
              }}
            >
              {mode === 'login' ? t('login_title') : flowHead(mode, lang)[0]}
            </h1>
            <p
              style={{
                fontSize: '13px',
                color: isDark ? '#94a3b8' : '#64748b',
                margin: 0,
                lineHeight: 1.4
              }}
            >
              {mode === 'login' ? t('login_subtitle') : flowHead(mode, lang)[1]}
            </p>
          </div>

          {/* Alert Kesalahan */}
          {notice && mode === 'login' && (
            <div role="status" style={{ backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#f0fdf4', border: isDark ? '1px solid rgba(34,197,94,0.35)' : '1px solid #bbf7d0', color: isDark ? '#86efac' : '#15803d', padding: '11px 14px', borderRadius: '8px', fontSize: '12.5px', marginBottom: '20px' }}>{notice}</div>
          )}
          {mode === 'login' && error && (
            <div
              role="alert"
              style={{
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
                border: isDark ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid #fecaca',
                color: isDark ? '#fca5a5' : '#b91c1c',
                padding: '11px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                lineHeight: 1.45,
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '9px'
              }}
            >
              <svg style={{ flexShrink: 0, marginTop: '2px' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {mode !== 'login' ? (
            <AuthFlow mode={mode} setMode={setMode} email={email} setEmail={setEmail} isDark={isDark} onDone={(msg) => { setNotice(msg); setError(''); setMode('login'); }} />
          ) : (<>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label htmlFor="access-email" style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: isDark ? '#e2e8f0' : '#334155', marginBottom: '8px' }}>
                Email
              </label>
              <input
                id="access-email"
                className="login-input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%',
                  height: '46px',
                  padding: '0 14px',
                  backgroundColor: isDark ? '#0a0f1d' : '#f8fafc',
                  border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                  borderRadius: '8px',
                  color: isDark ? '#ffffff' : '#0f172a',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label
                htmlFor="access-pwd"
                style={{
                  display: 'block',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: isDark ? '#e2e8f0' : '#334155',
                  marginBottom: '8px'
                }}
              >
                {t('login_pwd_label')}
              </label>
              <div style={{ position: 'relative' }}>
                {/* Lock Icon */}
                <div
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: isDark ? '#64748b' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>

                <input
                  id="access-pwd"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login_pwd_placeholder')}
                  disabled={loading}
                  autoFocus
                  style={{
                    width: '100%',
                    height: '46px',
                    padding: '0 44px 0 42px',
                    backgroundColor: isDark ? '#0a0f1d' : '#f8fafc',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    borderRadius: '8px',
                    color: isDark ? '#ffffff' : '#0f172a',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.2s ease'
                  }}
                />

                {/* Show/Hide Toggle Button */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('login_hide_pwd') : t('login_show_pwd')}
                  title={showPassword ? t('login_hide_pwd') : t('login_show_pwd')}
                  style={{
                    position: 'absolute',
                    right: '4px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    color: isDark ? '#94a3b8' : '#64748b',
                    cursor: 'pointer',
                    minWidth: '40px',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    transition: 'color 0.15s ease'
                  }}
                >
                  {showPassword ? (
                    /* Ikon Mata Terbuka dengan Garis Coret (Sembunyikan Sandi) */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    /* Ikon Mata Standar Proporsional (Tampilkan Sandi) */
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-2px' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: isDark ? '#cbd5e1' : '#475569',
                  userSelect: 'none'
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    width: '16px',
                    height: '16px',
                    accentColor: '#0284c7',
                    cursor: 'pointer'
                  }}
                />
                <span>{t('login_remember_me')}</span>
              </label>

              <button
                type="button"
                onClick={() => { setError(''); setNotice(''); setMode('forgot'); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {lang === 'en' ? 'Forgot password?' : 'Lupa password?'}
              </button>
            </div>

            {/* Submit Action CTA */}
            <button
              type="submit"
              className="login-btn"
              disabled={loading}
              style={{
                width: '100%',
                height: '44px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '0.01em',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                marginTop: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'background-color 0.15s ease'
              }}
            >
              {loading ? (
                <>
                  <svg
                    style={{ animation: 'rotateSpinner 0.8s linear infinite' }}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <span>{t('login_btn_loading')}</span>
                </>
              ) : (
                <span>{t('login_btn_submit')}</span>
              )}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '18px', fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
            <span>{lang === 'en' ? "Don't have an account? " : 'Belum memiliki akun? '}</span>
            <button
              type="button"
              onClick={() => { setError(''); setNotice(''); setMode('signup'); }}
              style={{
                background: 'none',
                border: 'none',
                color: '#0284c7',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                fontSize: '13px'
              }}
            >
              {lang === 'en' ? 'Sign up' : 'Daftar'}
            </button>
          </div>
          </>)}
        </div>
      </div>
    </>
  );
}
