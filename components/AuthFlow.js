'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import LocationPicker from './LocationPicker';

export function flowHead(mode, lang) {
  const tx = (en, id) => (lang === 'en' ? en : id);
  return {
    signup: [tx('Create Account', 'Daftar Akun Baru'), tx('Lengkapi informasi perusahaan Anda.', 'Lengkapi informasi perusahaan Anda.')],
    verify: [tx('Verify Email', 'Verifikasi Email'), tx('Masukkan 6 digit kode dari email Anda.', 'Masukkan 6 digit kode dari email Anda.')],
    forgot: [tx('Reset Password', 'Lupa Password'), tx('Masukkan email akun Anda untuk menerima kode reset.', 'Masukkan email akun Anda untuk menerima kode reset.')],
    reset: [tx('New Password', 'Password Baru'), tx('Masukkan kode dari email dan password baru.', 'Masukkan kode dari email dan password baru.')],
  }[mode];
}

function Field({ id, title, st, style, ...rest }) {
  return (
    <div>
      <label htmlFor={id} style={st.label}>{title}</label>
      <input id={id} style={style || st.input} {...rest} />
    </div>
  );
}

export default function AuthFlow({ mode, setMode, email, setEmail, isDark, onDone }) {
  const { lang } = useI18n();
  const tx = (en, id) => (lang === 'en' ? en : id);
  const [form, setForm] = useState({ company_name: '', address: '', latitude: null, longitude: null, password: '', code: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    setError('');
    if (mode === 'verify' || mode === 'reset') setCooldown(60);
  }, [mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const post = async (action, body) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || tx('Request failed.', 'Permintaan gagal.'));
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'signup') {
      if (await post('signup', { ...form, email })) setMode('verify');
    } else if (mode === 'verify') {
      if (await post('verify', { email, code: form.code })) {
        const from = new URLSearchParams(window.location.search).get('from') || '/';
        const target = from.startsWith('/') && !from.startsWith('//') ? from : '/';
        window.location.assign(target);
      }
    } else if (mode === 'forgot') {
      if (await post('forgot', { email })) setMode('reset');
    } else if (mode === 'reset') {
      if (await post('reset', { email, code: form.code, password: form.password })) {
        setForm((f) => ({ ...f, password: '', code: '' }));
        onDone(tx('Password updated. Please sign in.', 'Password diperbarui. Silakan masuk.'));
      }
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    if (await post(mode === 'verify' ? 'resend' : 'forgot', { email })) setCooldown(60);
  };

  const label = { display: 'block', fontSize: '12.5px', fontWeight: 600, color: isDark ? '#e2e8f0' : '#334155', marginBottom: '8px' };
  const input = {
    width: '100%', height: '46px', padding: '0 14px', boxSizing: 'border-box', fontSize: '14px', outline: 'none', borderRadius: '8px',
    backgroundColor: isDark ? '#0a0f1d' : '#f8fafc', border: isDark ? '1px solid #334155' : '1px solid #cbd5e1', color: isDark ? '#ffffff' : '#0f172a',
  };
  const link = { background: 'none', border: 'none', padding: '8px 4px', minHeight: '36px', color: '#0284c7', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' };

  const fp = { st: { label, input }, disabled: busy };

  const pwdType = showPwd ? 'text' : 'password';
  const needEmail = mode !== 'verify';

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && (
        <div role="alert" style={{ backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2', border: isDark ? '1px solid rgba(239,68,68,0.35)' : '1px solid #fecaca', color: isDark ? '#fca5a5' : '#b91c1c', padding: '11px 14px', borderRadius: '8px', fontSize: '12.5px', lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      {mode === 'signup' && (
        <>
          <Field {...fp} id="su-company" title={tx('Company name', 'Nama perusahaan')} value={form.company_name} onChange={set('company_name')} required autoFocus />
          <LocationPicker
            id="su-address"
            label={tx('Office address', 'Alamat kantor')}
            value={form.address}
            onChange={(val) => setForm((f) => ({ ...f, address: val }))}
            latitude={form.latitude}
            longitude={form.longitude}
            onCoordsChange={(coords) => setForm((f) => ({ ...f, latitude: coords.lat, longitude: coords.lng }))}
            isDark={isDark}
            required
            disabled={busy}
          />
        </>
      )}

      {needEmail && <Field {...fp} id="af-email" title="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode !== 'signup'} />}
      {mode === 'verify' && (
        <p style={{ margin: 0, fontSize: '13px', color: isDark ? '#cbd5e1' : '#475569' }}>
          {tx('Code sent to', 'Kode dikirim ke')} <strong>{email}</strong>
        </p>
      )}

      {(mode === 'verify' || mode === 'reset') && (
        <Field {...fp} id="af-code" title={tx('Verification code', 'Kode verifikasi')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" placeholder="123456" value={form.code} onChange={set('code')} required autoFocus={mode === 'verify'} style={{ ...input, letterSpacing: '6px', fontWeight: 700, fontSize: '18px' }} />
      )}

      {(mode === 'signup' || mode === 'reset') && (
        <Field {...fp} id="af-pwd" title={mode === 'reset' ? tx('New password', 'Password baru') : 'Password'} type={pwdType} autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} placeholder={tx('At least 8 characters', 'Minimal 8 karakter')} required />
      )}
      {(mode === 'signup' || mode === 'reset') && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12.5px', color: isDark ? '#cbd5e1' : '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPwd} onChange={(e) => setShowPwd(e.target.checked)} style={{ accentColor: '#0284c7' }} />
          {tx('Show password', 'Tampilkan password')}
        </label>
      )}

      <button type="submit" disabled={busy} style={{ width: '100%', height: '44px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13.5px', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.75 : 1 }}>
        {busy ? tx('Please wait…', 'Mohon tunggu…') : { signup: tx('Sign Up', 'Daftar'), verify: tx('Verify & Continue', 'Verifikasi & Lanjut'), forgot: tx('Send Reset Code', 'Kirim Kode Reset'), reset: tx('Save Password', 'Simpan Password') }[mode]}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        {(mode === 'verify' || mode === 'reset') ? (
          <button type="button" style={{ ...link, opacity: cooldown > 0 ? 0.6 : 1 }} onClick={resend} disabled={cooldown > 0 || busy}>
            {cooldown > 0 ? tx(`Resend code in ${cooldown}s`, `Kirim ulang kode (${cooldown}d)`) : tx('Resend code', 'Kirim ulang kode')}
          </button>
        ) : <span />}
        <button type="button" style={link} onClick={() => setMode('login')}>{tx('Back to sign in', 'Kembali ke halaman masuk')}</button>
      </div>
    </form>
  );
}
