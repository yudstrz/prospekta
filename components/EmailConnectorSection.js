'use client';

import { useState, useEffect } from 'react';

function buildInitialState(settings) {
  const s = settings || {};
  const mcpConnected = Boolean(s.gmail_mcp_connected && s.gmail_mcp_account);
  const mode = s.email_provider_mode === 'gmail_mcp'
    ? 'gmail_mcp'
    : (s.email_provider_mode === 'smtp' ? 'smtp' : 'gmail_mcp');
  return {
    mode,
    mcpEmail: mcpConnected ? s.gmail_mcp_account : '',
    mcpAccount: mcpConnected ? s.gmail_mcp_account : '',
    mcpConnected,
    testTo: '',
    smtp_host: s.smtp_host || 'smtp.gmail.com',
    smtp_port: Number(s.smtp_port) || 587,
    smtp_user: s.smtp_user || '',
    smtp_from: s.smtp_from || s.smtp_user || '',
    smtp_pass: '',
    smtp_pass_set: Boolean(s.smtp_pass_set),
  };
}

/**
 * Panel konfigurasi dua jalur pengiriman email (Konektor Cepat & Server SMTP Mandiri).
 * Aman dipakai mandiri maupun di dalam modal yang sudah memiliki parent <form>.
 */
export default function EmailConnectorSection({
  tenantId = null,
  initialSettings = null,
  onSettingsChange = null,
  showSmtpSaveButton = true,
  showSmtpFromField = false,
  showSmtpRevokeButton = false,
  onRevokeSmtpPass = null,
  idPrefix = 'email-conn',
}) {
  const [conn, setConn] = useState(() => buildInitialState(initialSettings));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showGmailGuide, setShowGmailGuide] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (initialSettings) {
      setConn(buildInitialState(initialSettings));
    }
  }, [
    initialSettings?.email_provider_mode,
    initialSettings?.gmail_mcp_connected,
    initialSettings?.gmail_mcp_account,
    initialSettings?.smtp_host,
    initialSettings?.smtp_port,
    initialSettings?.smtp_user,
    initialSettings?.smtp_from,
    initialSettings?.smtp_pass_set,
  ]);

  const settingsUrl = tenantId ? `/api/settings?tenant_id=${encodeURIComponent(tenantId)}` : '/api/settings';

  const applyServerSettings = (nextSettings, fieldSync = null) => {
    if (nextSettings) {
      setConn(buildInitialState(nextSettings));
    }
    onSettingsChange?.(nextSettings || null, fieldSync);
  };

  const runAction = async (action, extra = {}) => {
    const isTest = action === 'test_mcp' || action === 'test_smtp';
    if (isTest) setTesting(true);
    else setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(settingsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Operasi konektor email gagal.');
      }
      if (data.settings) applyServerSettings(data.settings);
      setFeedback({ ok: true, text: data.message || 'Berhasil.' });
    } catch (err) {
      setFeedback({ ok: false, text: err.message });
    } finally {
      if (isTest) setTesting(false);
      else setSaving(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const userEmail = (conn.smtp_user || conn.smtp_from || '').trim();
      const fromValue = (conn.smtp_from || userEmail).trim();
      const payload = {
        email_provider_mode: 'smtp',
        smtp_host: conn.smtp_host.trim(),
        smtp_port: Number(conn.smtp_port) || 587,
        smtp_user: userEmail,
        smtp_from: fromValue,
      };
      if (conn.smtp_pass.trim()) {
        payload.smtp_pass = conn.smtp_pass.trim();
      }
      const res = await fetch(settingsUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan SMTP.');
      }
      applyServerSettings(data.settings);
      setFeedback({ ok: true, text: 'Pengaturan konektor SMTP berhasil disimpan dan diaktifkan.' });
    } catch (err) {
      setFeedback({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const updateSmtpField = (key, value) => {
    setConn((prev) => ({ ...prev, [key]: value }));
    onSettingsChange?.(null, { [key]: value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.875rem', color: 'var(--text-main)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
        {[
          {
            id: 'gmail_mcp',
            title: '1. Konektor Cepat (Email)',
            badge: conn.mcpConnected ? 'Terhubung' : 'Praktis',
            badgeColor: conn.mcpConnected ? 'var(--success-text)' : 'var(--accent-text)',
            desc: 'Ketik alamat email Anda saja. Langsung terhubung tanpa App Password; balasan masuk ke email Anda.',
          },
          {
            id: 'smtp',
            title: '2. Server SMTP Mandiri',
            badge: !conn.mcpConnected && conn.smtp_pass_set ? 'Aktif' : 'Manual',
            badgeColor: !conn.mcpConnected && conn.smtp_pass_set ? 'var(--success-text)' : 'var(--text-muted)',
            desc: 'Pakai SMTP Host & App Password akun Anda sendiri agar header From asli memakai email Anda.',
          },
        ].map((opt) => {
          const selected = conn.mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setConn((prev) => ({ ...prev, mode: opt.id }));
                setFeedback(null);
                onSettingsChange?.(null, { email_provider_mode: opt.id });
              }}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: selected ? '2px solid var(--border-focus)' : '1px solid var(--border-subtle)',
                background: selected ? 'var(--accent-light)' : 'var(--bg-app)',
                color: 'var(--text-main)',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minHeight: '44px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', width: '100%' }}>
                <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>{opt.title}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: opt.badgeColor }}>{opt.badge}</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{opt.desc}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          role="status"
          style={{
            background: feedback.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: `1px solid ${feedback.ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
            color: feedback.ok ? 'var(--success-text)' : 'var(--danger-text)',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '0.8125rem',
          }}
        >
          {feedback.text}
        </div>
      )}

      {conn.mode === 'gmail_mcp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            {conn.mcpConnected && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--success-text)', wordBreak: 'break-all' }}>
                    Terhubung: {conn.mcpAccount}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={saving}
                  onClick={() => runAction('disconnect_mcp')}
                  style={{ minHeight: '36px', color: 'var(--danger-text)' }}
                >
                  Putus Koneksi
                </button>
              </div>
            )}

            <label htmlFor={`${idPrefix}-quick-email`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
              Alamat Email Anda (Identitas Pengirim &amp; Balasan / Reply-To)
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                id={`${idPrefix}-quick-email`}
                type="email"
                className="text-input"
                placeholder="mis. yourname@gmail.com"
                value={conn.mcpEmail}
                onChange={(e) => setConn((prev) => ({ ...prev, mcpEmail: e.target.value }))}
                style={{ flex: '1 1 240px', minHeight: '40px' }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !conn.mcpEmail.trim()}
                onClick={() => runAction('connect_mcp', { email: conn.mcpEmail })}
                style={{ minHeight: '40px' }}
              >
                {saving ? 'Menghubungkan...' : (conn.mcpConnected ? 'Perbarui Email' : 'Hubungkan Email')}
              </button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Email dikirim via relay Prospekta dengan tampilan nama &amp; header <strong>Reply-To</strong> memakai <strong>{conn.mcpEmail.trim() || 'email Anda'}</strong>, sehingga balasan penerima masuk ke inbox tersebut.
            </p>
          </div>

          {conn.mcpConnected && (
            <div style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <label htmlFor={`${idPrefix}-quick-test-to`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                Uji Kirim Email ke Penerima Tujuan (To)
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  id={`${idPrefix}-quick-test-to`}
                  type="email"
                  className="text-input"
                  placeholder="mis. penerima@perusahaan.com"
                  value={conn.testTo}
                  onChange={(e) => setConn((prev) => ({ ...prev, testTo: e.target.value }))}
                  style={{ flex: '1 1 240px', minHeight: '40px' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={testing || !conn.testTo.trim()}
                  onClick={() => runAction('test_mcp', { target_email: conn.testTo })}
                  style={{ minHeight: '40px' }}
                >
                  {testing ? 'Mengirim...' : 'Kirim Email Uji Coba'}
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                Pengirim / Reply-To: <strong>{conn.mcpAccount}</strong> | Penerima: <strong>{conn.testTo.trim() || 'isi email penerima'}</strong>
              </p>
            </div>
          )}
        </div>
      )}

      {conn.mode === 'smtp' && (
        <div style={{ background: 'var(--bg-app)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 180px' }}>
              <label htmlFor={`${idPrefix}-smtp-host`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>SMTP Host</label>
              <input
                id={`${idPrefix}-smtp-host`}
                type="text"
                className="text-input"
                placeholder="smtp.gmail.com"
                value={conn.smtp_host}
                onChange={(e) => updateSmtpField('smtp_host', e.target.value)}
                style={{ width: '100%', minHeight: '40px' }}
              />
            </div>
            <div style={{ flex: '1 1 90px' }}>
              <label htmlFor={`${idPrefix}-smtp-port`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Port</label>
              <input
                id={`${idPrefix}-smtp-port`}
                type="number"
                className="text-input"
                value={conn.smtp_port}
                onChange={(e) => updateSmtpField('smtp_port', parseInt(e.target.value, 10) || 587)}
                style={{ width: '100%', minHeight: '40px' }}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${idPrefix}-smtp-user`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
              Alamat Email Pengirim (SMTP User)
            </label>
            <input
              id={`${idPrefix}-smtp-user`}
              type="email"
              className="text-input"
              placeholder="mis. timsales@perusahaan.com atau yourname@gmail.com"
              value={conn.smtp_user}
              onChange={(e) => updateSmtpField('smtp_user', e.target.value)}
              style={{ width: '100%', minHeight: '40px' }}
            />
          </div>

          {showSmtpFromField && (
            <div>
              <label htmlFor={`${idPrefix}-smtp-from`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                Tampilan Nama Pengirim di Kotak Masuk (From Header)
              </label>
              <input
                id={`${idPrefix}-smtp-from`}
                type="text"
                className="text-input"
                placeholder="Nama Bisnis <email@domain.com>"
                value={conn.smtp_from}
                onChange={(e) => updateSmtpField('smtp_from', e.target.value)}
                style={{ width: '100%', minHeight: '40px' }}
              />
            </div>
          )}

          <div>
            <label htmlFor={`${idPrefix}-smtp-pass`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
              App Password {conn.smtp_pass_set && <span style={{ color: 'var(--success-text)', fontWeight: 500 }}>(Sudah tersimpan, kosongkan jika tidak diubah)</span>}
            </label>
            <input
              id={`${idPrefix}-smtp-pass`}
              type="password"
              className="text-input"
              placeholder={conn.smtp_pass_set ? 'Kosongkan untuk tetap pakai password lama' : 'Masukkan App Password 16 karakter'}
              value={conn.smtp_pass}
              onChange={(e) => updateSmtpField('smtp_pass', e.target.value)}
              style={{ width: '100%', minHeight: '40px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Terenkripsi AES-256-GCM (port 587 TLS atau 465 SSL).
              </span>
              <button
                type="button"
                onClick={() => setShowGmailGuide((v) => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', minHeight: '36px', padding: '0 4px' }}
              >
                {showGmailGuide ? 'Tutup Panduan Gmail' : 'Panduan App Password Gmail'}
              </button>
            </div>

            {showGmailGuide && (
              <ol style={{ margin: '6px 0 0 18px', padding: '8px 10px', background: 'var(--accent-light)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '0.74rem', lineHeight: 1.55, color: 'var(--text-main)' }}>
                <li>Buka Akun Google &gt; menu <strong>Keamanan (Security)</strong> dan aktifkan <strong>Verifikasi 2 Langkah</strong>.</li>
                <li>Buka menu <strong>Sandi Aplikasi (App Passwords)</strong>, buat nama aplikasi (mis. Prospekta), lalu tempel 16 karakter ke kolom di atas.</li>
              </ol>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
            {showSmtpRevokeButton && conn.smtp_pass_set && onRevokeSmtpPass && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={saving || testing}
                onClick={onRevokeSmtpPass}
                style={{ minHeight: '38px', color: 'var(--danger-text)' }}
              >
                Cabut Sandi
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={testing || !conn.smtp_host.trim() || !conn.smtp_user.trim()}
              onClick={() => runAction('test_smtp', {
                smtp_host: conn.smtp_host.trim(),
                smtp_port: Number(conn.smtp_port) || 587,
                smtp_user: conn.smtp_user.trim(),
                smtp_from: (conn.smtp_from || conn.smtp_user).trim(),
                ...(conn.smtp_pass.trim() ? { smtp_pass: conn.smtp_pass.trim() } : {}),
              })}
              style={{ minHeight: '38px' }}
            >
              {testing ? 'Menguji...' : 'Tes Koneksi SMTP'}
            </button>
            {showSmtpSaveButton && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saving || !conn.smtp_host.trim() || !conn.smtp_user.trim()}
                onClick={handleSaveSmtp}
                style={{ minHeight: '38px' }}
              >
                {saving ? 'Menyimpan...' : 'Simpan Konektor SMTP'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
