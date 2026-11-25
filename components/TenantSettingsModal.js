'use client';

import React, { useState, useEffect, useRef } from 'react';
import CompanyCrawlerModal from './CompanyCrawlerModal';
import EmailConnectorSection from './EmailConnectorSection';

const INDUSTRY_PRESETS = [
  { id: 'all', label: 'Semua Bidang Usaha', desc: 'Jangkauan luas seluruh tempat usaha komersial', keywords: 'all' },
  { id: 'health', label: 'Kesehatan & Medis', desc: 'Klinik, Dokter, Gigi, RS, Apotek, Terapi', keywords: 'clinic,hospital,health,medis,dokter,apotek,gigi,dentist,terapi,care' },
  { id: 'corporate', label: 'Perkantoran & Jasa', desc: 'PT, Konsultan, Hukum, Notaris, Agensi Jasa', keywords: 'office,corporate,pt,konsultan,agency,legal,notaris,akuntan,law,advisory' },
  { id: 'tech', label: 'Teknologi & Digital', desc: 'Software, IT, Startup, Web Developer', keywords: 'tech,software,startup,it,developer,digital,komputer,siber' },
  { id: 'fnb', label: 'Kuliner & F&B', desc: 'Restoran, Kafe, Katering, Bakery, Kedai', keywords: 'fnb,restaurant,cafe,kuliner,katering,bakery,resto,food,kopi,dapur' },
  { id: 'logistics', label: 'Logistik & Ekspedisi', desc: 'Kargo, Ekspor-Impor, Gudang, Transportasi', keywords: 'logistik,ekspor,impor,shipping,cargo,freight,warehouse,gudang,trans' },
  { id: 'retail', label: 'Retail & Toko', desc: 'Swalayan, Grosir, Distributor, Toko Retail', keywords: 'retail,store,shop,swalayan,distributor,grosir,dagang,mart,pasar' },
  { id: 'construction', label: 'Konstruksi & Teknik', desc: 'Kontraktor, Pabrik, Bengkel, Mesin, Arsitek', keywords: 'konstruksi,teknik,engineering,kontraktor,pabrik,bengkel,arsitek,industri' },
  { id: 'education', label: 'Pendidikan & Kursus', desc: 'Sekolah, Bimbel, Pelatihan Kerja, Akademi', keywords: 'sekolah,kursus,bimbel,training,edukasi,akademi,les,college' },
  { id: 'hospitality', label: 'Pariwisata & Hotel', desc: 'Hotel, Villa, Travel, Biro Wisata, Event', keywords: 'hotel,villa,resort,travel,wisata,event,organizer,penginapan' },
  { id: 'finance', label: 'Keuangan & Asuransi', desc: 'BPR, Koperasi, Asuransi, Agen Keuangan', keywords: 'keuangan,finansial,asuransi,koperasi,bank,finance,leasing' },
];

export default function TenantSettingsModal({ tenantId, onClose, companyName, onSuccess = null }) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'targeting' | 'modules' | 'email' | 'telegram' | 'team'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [showAdvancedTg, setShowAdvancedTg] = useState(false);
  const [showByok, setShowByok] = useState(false);
  const [linkingTg, setLinkingTg] = useState(false);
  const [isCrawlerOpen, setIsCrawlerOpen] = useState(false);

  // Team state
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', password: '', role: 'client_sales' });
  const [addingMember, setAddingMember] = useState(false);
  const [memberMsg, setMemberMsg] = useState(null);

  const [settings, setSettings] = useState({
    company_name: '',
    email_provider_mode: 'smtp',
    gmail_mcp_account: '',
    gmail_mcp_connected: 0,
    company_offering: '',
    target_audience: '',
    target_categories: 'all',
    default_radius_km: 2,
    email_language: 'auto',
    feat_auto_outreach: 0,
    feat_prebuilt_site: 0,
    feat_ai_proposal: 0,
    feat_auto_followup: 0,
    feat_telegram_alerts: 0,
    feat_auto_discovery: 0,
    custom_ai_prompt: '',
    custom_cta: '',
    email_template_subject: '',
    email_template_body: '',
    company_urls: '[]',
    crawl_domains: '',
    crawl_scope: 'subdomain',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    smtp_user: '',
    smtp_from: '',
    smtp_pass: '',
    smtp_pass_set: false,
    telegram_bot_token: '',
    telegram_bot_token_set: false,
    telegram_chat_id: '',
    llm_key: '',
    llm_key_set: false,
    calendly_url: '',
    daily_quota: 20,
    usage: null,
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load existing settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const url = tenantId ? `/api/settings?tenant_id=${encodeURIComponent(tenantId)}` : '/api/settings';
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Server merespons status ${res.status}.`);
        }
        const data = await res.json().catch(() => {
          throw new Error('Respons server bukan format JSON yang valid.');
        });
        if (!data.success) {
          throw new Error(data.error || 'Gagal memuat pengaturan.');
        }
        if (data.settings) {
          setSettings((prev) => ({
            ...prev,
            ...data.settings,
            company_name: data.settings.company_name || prev.company_name || '',
            email_provider_mode: data.settings.email_provider_mode || 'smtp',
            gmail_mcp_account: data.settings.gmail_mcp_account || '',
            gmail_mcp_connected: Number(data.settings.gmail_mcp_connected || 0),
            smtp_port: data.settings.smtp_port || 465,
            daily_quota: data.settings.daily_quota || 20,
            default_radius_km: data.settings.default_radius_km || 2,
            target_categories: data.settings.target_categories || 'all',
            email_language: data.settings.email_language || 'auto',
            custom_ai_prompt: data.settings.custom_ai_prompt || '',
            custom_cta: data.settings.custom_cta || '',
            email_template_subject: data.settings.email_template_subject || '',
            email_template_body: data.settings.email_template_body || '',
            feat_auto_outreach: data.settings.feat_auto_outreach !== undefined ? Number(data.settings.feat_auto_outreach) : 0,
            feat_prebuilt_site: data.settings.feat_prebuilt_site !== undefined ? Number(data.settings.feat_prebuilt_site) : 0,
            feat_ai_proposal: data.settings.feat_ai_proposal !== undefined ? Number(data.settings.feat_ai_proposal) : 0,
            feat_auto_followup: data.settings.feat_auto_followup !== undefined ? Number(data.settings.feat_auto_followup) : 0,
            feat_telegram_alerts: data.settings.feat_telegram_alerts !== undefined ? Number(data.settings.feat_telegram_alerts) : 0,
            feat_auto_discovery: data.settings.feat_auto_discovery !== undefined ? Number(data.settings.feat_auto_discovery) : 0,
          }));
        }
      } catch (err) {
        setStatusMsg({ type: 'error', text: 'Gagal memuat pengaturan: ' + err.message });
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [tenantId]);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const url = tenantId ? `/api/tenant/members?tenant_id=${encodeURIComponent(tenantId)}` : '/api/tenant/members';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
      }
    } catch (_) {
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'team') {
      fetchMembers();
    }
  }, [activeTab, tenantId]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMember.email || !newMember.password) return;
    setAddingMember(true);
    setMemberMsg(null);
    try {
      const url = tenantId ? `/api/tenant/members?tenant_id=${encodeURIComponent(tenantId)}` : '/api/tenant/members';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menambahkan anggota.');
      setMemberMsg({ type: 'success', text: `Anggota ${newMember.email} berhasil ditambahkan.` });
      setNewMember({ email: '', password: '', role: 'client_sales' });
      fetchMembers();
    } catch (err) {
      setMemberMsg({ type: 'error', text: err.message });
    } finally {
      setAddingMember(false);
    }
  };

  const handleDeleteMember = async (userId, userEmail) => {
    if (!confirm(`Hapus anggota ${userEmail}?`)) return;
    try {
      const url = tenantId
        ? `/api/tenant/members?user_id=${encodeURIComponent(userId)}&tenant_id=${encodeURIComponent(tenantId)}`
        : `/api/tenant/members?user_id=${encodeURIComponent(userId)}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menghapus anggota.');
      fetchMembers();
    } catch (err) {
      alert('Gagal menghapus anggota: ' + err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      const payload = { ...settings };
      delete payload.usage;
      if (!payload.smtp_pass) delete payload.smtp_pass;
      if (!payload.telegram_bot_token) delete payload.telegram_bot_token;
      if (!payload.llm_key) delete payload.llm_key;

      payload.daily_quota = parseInt(payload.daily_quota, 10) || 20;
      payload.default_radius_km = parseInt(payload.default_radius_km, 10) || 2;
      payload.smtp_port = parseInt(payload.smtp_port, 10) || 465;

      const url = tenantId ? `/api/settings?tenant_id=${encodeURIComponent(tenantId)}` : '/api/settings';
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gagal menyimpan pengaturan.');
      }

      setStatusMsg({ type: 'success', text: 'Pengaturan dan kendali modul berhasil disimpan.' });
      setSettings((prev) => ({
        ...prev,
        ...data.settings,
        smtp_pass: '',
        telegram_bot_token: '',
        llm_key: '',
      }));
      if (onSuccess) onSuccess(data.settings);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleLinkTelegram = async () => {
    setLinkingTg(true);
    setStatusMsg(null);
    try {
      const url = tenantId ? `/api/telegram/link?tenant_id=${encodeURIComponent(tenantId)}` : '/api/telegram/link';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success || !data.deepLink) {
        throw new Error(data.error || 'Gagal membuat tautan Telegram.');
      }
      window.open(data.deepLink, '_blank', 'noopener,noreferrer');
      setStatusMsg({
        type: 'success',
        text: `Buka bot @${data.botUsername} di tab baru lalu tekan "Start" untuk menautkan workspace ini secara otomatis.`,
      });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setLinkingTg(false);
    }
  };

  const handleRevokeSecret = async (field, label) => {
    if (!confirm(`Hapus ${label} yang tersimpan?`)) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const url = tenantId ? `/api/settings?tenant_id=${encodeURIComponent(tenantId)}` : '/api/settings';
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`clear_${field}`]: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Gagal menghapus kredensial.');
      setSettings((prev) => ({ ...prev, ...data.settings, [field]: '' }));
      setStatusMsg({ type: 'success', text: `${label} berhasil dicabut.` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key] === 1 ? 0 : 1,
    }));
  };

  const navTabStyle = (tabKey) => ({
    padding: '0.55rem 0.85rem',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === tabKey ? '2px solid #2563eb' : '2px solid transparent',
    color: activeTab === tabKey ? 'var(--text-main)' : 'var(--text-muted)',
    fontWeight: activeTab === tabKey ? 600 : 500,
    fontSize: '0.85rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

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
    <>
      <div
        className="modal-overlay"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="modal-content tenant-settings-modal-content"
          style={{ maxWidth: '720px', width: '100%', maxHeight: '88dvh', padding: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflowX: 'hidden' }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
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
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', wordBreak: 'break-word' }}>
                  Pengaturan Akun &amp; Fitur
                </h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', wordBreak: 'break-word' }}>
                  {companyName ? `Perusahaan: ${companyName}` : 'Atur profil bisnis, jangkauan pencarian klien, dan otomasi kerja tim Anda.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ minHeight: '36px', padding: '0.25rem 0.625rem', flexShrink: 0 }}
              aria-label="Tutup"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Tab Navigation */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              borderBottom: '1px solid var(--border-subtle)',
              padding: '0.5rem 1.25rem 0',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              flexShrink: 0,
              boxSizing: 'border-box',
              width: '100%',
            }}
          >
            <button type="button" onClick={() => setActiveTab('profile')} style={navTabStyle('profile')}>
              Profil Bisnis &amp; Produk
            </button>
            <button type="button" onClick={() => setActiveTab('targeting')} style={navTabStyle('targeting')}>
              Jarak &amp; Target Wilayah
            </button>
            <button type="button" onClick={() => setActiveTab('modules')} style={navTabStyle('modules')}>
              Fitur &amp; Otomasi
            </button>
            <button type="button" onClick={() => setActiveTab('email')} style={navTabStyle('email')}>
              Email Pengirim
            </button>
            <button type="button" onClick={() => setActiveTab('telegram')} style={navTabStyle('telegram')}>
              Jadwal &amp; Notifikasi
            </button>
            <button type="button" onClick={() => setActiveTab('team')} style={navTabStyle('team')}>
              Anggota Tim
            </button>
          </div>

          <div className="modal-body" style={{ padding: '1.25rem', overflowY: 'auto', overflowX: 'hidden', flex: 1, boxSizing: 'border-box', width: '100%' }}>
            {statusMsg && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  backgroundColor: statusMsg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                  color: statusMsg.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
                  border: `1px solid ${statusMsg.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`,
                  fontSize: '0.875rem',
                }}
              >
                {statusMsg.text}
              </div>
            )}

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Memuat data pengaturan...
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* TAB 1: Profil Bisnis & Produk */}
                {activeTab === 'profile' && (
                  <>
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'rgba(37,99,235,0.06)',
                        border: '1px solid rgba(37,99,235,0.2)',
                        borderRadius: '8px',
                        fontSize: '0.8125rem',
                        color: 'var(--text-main)',
                        lineHeight: 1.5,
                        marginBottom: '4px',
                      }}
                    >
                      <strong>Panduan Profil Bisnis:</strong> Ceritakan apa yang perusahaan Anda jual dengan bahasa sederhana. Informasi ini akan menjadi bahan acuan utama bagi AI untuk menuliskan email penawaran dan proposal yang sangat relevan ke calon klien.
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '4px' }}>
                        Nama Perusahaan / Bisnis Anda
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: PT Solusi Cerdas atau Prospekta Hub"
                        value={settings.company_name || ''}
                        onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Nama ini digunakan sebagai identitas pengirim dan nama bisnis Anda di email penawaran &amp; proposal.
                      </span>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.825rem', fontWeight: 600 }}>
                          Apa Produk atau Layanan Utama yang Anda Tawarkan?
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCrawlerOpen(true)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            fontSize: '0.72rem',
                            padding: '4px 10px',
                            minHeight: '36px',
                            color: 'var(--accent-text)',
                            borderColor: 'var(--border-focus)',
                            backgroundColor: 'var(--accent-light)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600,
                          }}
                          title="Perayap website untuk mengekstrak layanan & produk perusahaan otomatis"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                          <span>Crawl Website Perusahaan</span>
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        placeholder="Contoh: Kami menyediakan sistem kasir pintar (POS), rekam medis digital, dan aplikasi reservasi pasien otomatis untuk klinik & apotek."
                        value={settings.company_offering || ''}
                        onChange={(e) => setSettings({ ...settings, company_offering: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          lineHeight: 1.5,
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Jelaskan solusi yang Anda berikan. AI akan menyisipkan penawaran ini secara halus di paragraf email.
                      </span>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label style={{ fontSize: '0.825rem', fontWeight: 600 }}>
                          Tautan Website &amp; Domain Perusahaan Terdaftar
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCrawlerOpen(true)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem', minHeight: '36px', padding: '0 10px', color: 'var(--accent-text)' }}
                        >
                          + Kelola &amp; Ekstrak URL
                        </button>
                      </div>

                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                          alignItems: 'center',
                          minHeight: '38px',
                        }}
                      >
                        {(() => {
                          let parsed = [];
                          try {
                            parsed = settings.company_urls ? JSON.parse(settings.company_urls) : [];
                          } catch (_) { }

                          if (!Array.isArray(parsed) || parsed.length === 0) {
                            return (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Belum ada tautan terdaftar. Klik tombol "+ Kelola &amp; Ekstrak URL" untuk menambahkan website resmi atau domain pendukung (misal prospekta.id).
                              </span>
                            );
                          }

                          return parsed.map((item) => (
                            <span
                              key={item.id || item.url}
                              style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                color: '#0284c7',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>{item.label}:</span>
                              <span style={{ color: 'var(--text-main)' }}>{item.url}</span>
                            </span>
                          ));
                        })()}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Cakupan Domain: {settings.crawl_scope || 'subdomain'} {settings.crawl_domains ? `| Domain Saudara: ${settings.crawl_domains}` : ''}
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '4px' }}>
                        Siapa Target Penerima / Pengambil Keputusan yang Ingin Dihubungi?
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Pemilik Usaha (Owner), Direktur Operasional, Manajer HRD, Dokter Kepala"
                        value={settings.target_audience || ''}
                        onChange={(e) => setSettings({ ...settings, target_audience: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Jabatan calon klien yang paling relevan untuk diajak berdiskusi kerja sama.
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '4px' }}>
                        Pilihan Bahasa untuk Email Penawaran
                      </label>
                      <select
                        value={settings.email_language || 'auto'}
                        onChange={(e) => setSettings({ ...settings, email_language: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                        }}
                      >
                        <option value="auto">Otomatis Pintar (Bahasa Indonesia untuk bisnis lokal, Inggris untuk perusahaan asing/SG)</option>
                        <option value="id">Selalu Bahasa Indonesia</option>
                        <option value="en">Selalu Bahasa Inggris (English)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '4px' }}>
                        Ajakan Bertindak di Akhir Email (Call to Action / Penutup)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Balas 'Boleh' jika Anda ingin kami kirimkan materi demo ringkas 2 menit"
                        value={settings.custom_cta || ''}
                        onChange={(e) => setSettings({ ...settings, custom_cta: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Kalimat ramah di akhir email yang memudahkan calon klien merespons tanpa merasa terbebani.
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '4px' }}>
                        Gaya Bahasa &amp; Catatan Khusus untuk AI (Opsional)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Contoh: Gunakan bahasa yang santai tapi sopan, batasi email maksimal 70 kata, jangan sebutkan harga sebelum klien bertanya."
                        value={settings.custom_ai_prompt || ''}
                        onChange={(e) => setSettings({ ...settings, custom_ai_prompt: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          lineHeight: 1.5,
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Panduan tambahan agar gaya tulisan email AI sesuai dengan kepribadian atau standar komunikasi tim Anda.
                      </span>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '6px' }}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>
                          Punya Naskah Email Sendiri? (Gunakan Naskah Manual - Opsional)
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Jika tim Anda sudah memiliki naskah email andalan, masukkan di bawah ini. Sistem akan menggunakan naskah Anda dan otomatis mengganti nama perusahaan calon klien.
                          <br />Variabel otomatis: <code>&#123;&#123;company_name&#125;&#125;</code> (nama klien), <code>&#123;&#123;city&#125;&#125;</code> (kota), <code>&#123;&#123;my_company&#125;&#125;</code> (nama perusahaan Anda).
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Judul / Subjek email, contoh: Pertanyaan singkat seputar {{company_name}}"
                          value={settings.email_template_subject || ''}
                          onChange={(e) => setSettings({ ...settings, email_template_subject: e.target.value })}
                          style={{
                            width: '100%',
                            height: '38px',
                            padding: '0 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)',
                            backgroundColor: 'var(--bg-app)',
                            color: 'var(--text-main)',
                            fontSize: '0.85rem',
                            boxSizing: 'border-box',
                          }}
                        />
                        <textarea
                          rows={4}
                          placeholder="Halo Tim {{company_name}},&#10;&#10;Saya memperhatikan perkembangan bisnis Anda di {{city}}...&#10;&#10;Salam hangat,&#10;{{my_company}}"
                          value={settings.email_template_body || ''}
                          onChange={(e) => setSettings({ ...settings, email_template_body: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)',
                            backgroundColor: 'var(--bg-app)',
                            color: 'var(--text-main)',
                            fontSize: '0.85rem',
                            lineHeight: 1.5,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 2: Jarak & Target Wilayah */}
                {activeTab === 'targeting' && (
                  <>
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'rgba(37,99,235,0.06)',
                        border: '1px solid rgba(37,99,235,0.2)',
                        borderRadius: '8px',
                        fontSize: '0.8125rem',
                        color: 'var(--text-main)',
                        lineHeight: 1.5,
                        marginBottom: '4px',
                      }}
                    >
                      <strong>Panduan Jarak &amp; Wilayah:</strong> Peta dan radar akan memetakan tempat usaha di sekitar kantor Anda. Anda bisa mempersempit jarak agar tim sales mudah berkunjung langsung, atau memperluasnya untuk menjangkau lebih banyak calon klien.
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '6px' }}>
                        Jarak Jangkauan Pencarian dari Kantor Anda
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {[
                          { r: 1, label: '1 km', hint: 'Area Terdekat' },
                          { r: 2, label: '2 km', hint: 'Radius Standar' },
                          { r: 5, label: '5 km', hint: 'Jangkauan Luas' },
                          { r: 10, label: '10 km', hint: 'Jangkauan Maksimal' },
                        ].map((item) => (
                          <button
                            key={item.r}
                            type="button"
                            onClick={() => setSettings({ ...settings, default_radius_km: item.r })}
                            style={{
                              padding: '10px 8px',
                              borderRadius: '6px',
                              border: settings.default_radius_km === item.r ? '2px solid #2563eb' : '1px solid var(--border-subtle)',
                              backgroundColor: settings.default_radius_km === item.r ? 'rgba(37,99,235,0.1)' : 'var(--bg-app)',
                              color: settings.default_radius_km === item.r ? '#2563eb' : 'var(--text-main)',
                              fontWeight: settings.default_radius_km === item.r ? 700 : 500,
                              cursor: 'pointer',
                              textAlign: 'center',
                            }}
                          >
                            <div style={{ fontSize: '0.95rem' }}>{item.label}</div>
                            <div style={{ fontSize: '0.6875rem', color: settings.default_radius_km === item.r ? '#2563eb' : 'var(--text-muted)', marginTop: '2px' }}>
                              {item.hint}
                            </div>
                          </button>
                        ))}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                        Jarak dihitung melingkar dari titik koordinat kantor Anda.
                      </span>
                    </div>

                    {/* Pilihan Bidang Usaha Target (Multi-Sektor & Kata Kunci Kustom) */}
                    <div style={{ marginTop: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                          Bidang Usaha Calon Klien yang Ingin Disasar (Multi-Pilihan)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setSettings({ ...settings, target_categories: 'all' });
                          }}
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--accent-text)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            minHeight: '36px',
                            padding: '2px 4px',
                            textDecoration: 'underline',
                            fontWeight: 600,
                          }}
                        >
                          Pilih Semua Sektor (Jangkauan Luas)
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px' }}>
                        {INDUSTRY_PRESETS.map((ind) => {
                          const isAll = ind.id === 'all';
                          const currentVal = settings.target_categories || 'all';
                          const isAllActive = currentVal === 'all' || !currentVal;

                          let isSelected = false;
                          if (isAll) {
                            isSelected = isAllActive;
                          } else {
                            if (isAllActive) {
                              isSelected = false;
                            } else {
                              const firstKeyword = ind.keywords.split(',')[0];
                              isSelected = currentVal.includes(firstKeyword);
                            }
                          }

                          return (
                            <button
                              key={ind.id}
                              type="button"
                              onClick={() => {
                                if (isAll) {
                                  setSettings({ ...settings, target_categories: 'all' });
                                } else {
                                  const currentKeywords = isAllActive
                                    ? []
                                    : currentVal.split(',').map((s) => s.trim()).filter(Boolean);
                                  const indKeywords = ind.keywords.split(',').map((s) => s.trim());
                                  const firstKey = indKeywords[0];

                                  let newKeywords = [];
                                  if (currentKeywords.includes(firstKey)) {
                                    // Hapus preset ini dari daftar pilihan
                                    newKeywords = currentKeywords.filter((k) => !indKeywords.includes(k));
                                  } else {
                                    // Tambahkan preset ini ke daftar pilihan
                                    newKeywords = [...currentKeywords, ...indKeywords];
                                  }

                                  if (newKeywords.length === 0) {
                                    setSettings({ ...settings, target_categories: 'all' });
                                  } else {
                                    setSettings({ ...settings, target_categories: newKeywords.join(',') });
                                  }
                                }
                              }}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                textAlign: 'left',
                                border: `1.5px solid ${isSelected ? '#2563eb' : 'var(--border-subtle)'}`,
                                backgroundColor: isSelected ? 'rgba(37,99,235,0.08)' : 'var(--bg-app)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: isSelected ? '#2563eb' : 'var(--border-subtle)',
                                    display: 'inline-block',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: isSelected ? '#2563eb' : 'var(--text-main)' }}>
                                  {ind.label}
                                </span>
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                                {ind.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Input Kata Kunci Kustom / Niche Tambahan */}
                      <div style={{ marginTop: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-main)' }}>
                          Kata Kunci Kustom / Niche Spesifik Produk Anda (Opsional)
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: dokter gigi, klinik kecantikan, salon, bengkel mobil, petshop, wedding..."
                          value={(() => {
                            const val = settings.target_categories || '';
                            if (val === 'all') return '';
                            const allPresetKeys = INDUSTRY_PRESETS.flatMap((p) => p.keywords.split(',').map((k) => k.trim()));
                            const customWords = val.split(',').map((s) => s.trim()).filter((k) => k && !allPresetKeys.includes(k));
                            return customWords.join(', ');
                          })()}
                          onChange={(e) => {
                            const inputVal = e.target.value;
                            const currentVal = settings.target_categories || 'all';
                            const allPresetKeys = INDUSTRY_PRESETS.flatMap((p) => p.keywords.split(',').map((k) => k.trim()));
                            const activePresetKeys = currentVal === 'all'
                              ? []
                              : currentVal.split(',').map((s) => s.trim()).filter((k) => allPresetKeys.includes(k));

                            const newCustomKeys = inputVal.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
                            const combined = [...activePresetKeys, ...newCustomKeys];

                            if (combined.length === 0) {
                              setSettings({ ...settings, target_categories: 'all' });
                            } else {
                              setSettings({ ...settings, target_categories: combined.join(',') });
                            }
                          }}
                          style={{
                            width: '100%',
                            height: '40px',
                            padding: '0 12px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-subtle)',
                            backgroundColor: 'var(--bg-app)',
                            color: 'var(--text-main)',
                            fontSize: '0.825rem',
                          }}
                        />
                        <span style={{ fontSize: '0.71875rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                          Ketik kata kunci unik produk Anda. Calon klien yang mengandung kata kunci ini akan langsung diprioritaskan.
                        </span>
                      </div>

                      {/* Kartu Informasi Dampak ke Skor ICP */}
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(16,185,129,0.08)',
                          border: '1px solid rgba(16,185,129,0.25)',
                          fontSize: '0.78rem',
                          color: 'var(--text-main)',
                          lineHeight: 1.5,
                        }}
                      >
                        <strong>Pengaruh ke Skor Kelayakan (ICP):</strong> Calon klien yang sesuai dengan bidang usaha atau kata kunci target yang Anda pilih di atas otomatis mendapatkan tambahan <strong>+25 Poin Kelayakan</strong> dan label <span style={{ padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(16,185,129,0.2)', color: '#059669', fontWeight: 600 }}>Target Utama</span>, sehingga langsung naik ke urutan teratas pada daftar prospek Anda.
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 3: Fitur & Otomasi */}
                {activeTab === 'modules' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div
                      style={{
                        padding: '0.875rem 1rem',
                        backgroundColor: 'rgba(37,99,235,0.06)',
                        border: '1px solid rgba(37,99,235,0.2)',
                        borderRadius: '8px',
                        fontSize: '0.8125rem',
                        color: 'var(--text-main)',
                        lineHeight: 1.55,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: '4px', color: '#2563eb' }}>
                        Status Fitur &amp; Kendali Otomasi
                      </div>
                      <div>
                        Secara default, akun baru diatur dalam mode penjelajahan ringan (fokus memasukkan alamat kantor dan melihat calon klien di sekitar). Seluruh otomasi di bawah ini dinonaktifkan dari awal. Anda bebas mengaktifkan saklar fitur kapan saja sesuai kebutuhan tim Anda.
                      </div>
                    </div>

                    {[
                      {
                        key: 'feat_auto_outreach',
                        title: 'Pengiriman Email Penawaran Otomatis',
                        desc: 'Sistem secara otomatis mengirimkan email perkenalan ke calon klien baru di sekitar Anda secara bertahap pada jam kerja kantor.',
                        benefit: 'Hemat waktu: Anda tidak perlu mengirim email satu per satu secara manual.',
                      },
                      {
                        key: 'feat_prebuilt_site',
                        title: 'Pembuatan Halaman Demo Otomatis',
                        desc: 'Otomatis membuat contoh halaman website siap pakai atas nama calon klien yang dipersonalisasi.',
                        benefit: 'Meningkatkan respon: Calon klien terkesan karena melihat contoh nyata untuk bisnis mereka.',
                      },
                      {
                        key: 'feat_ai_proposal',
                        title: 'Penyusun Proposal & Analisis Bisnis AI',
                        desc: 'AI secara otomatis memeriksa website calon klien dan menyusun draf proposal kerja sama profesional siap kirim.',
                        benefit: 'Mempercepat closing: Draf proposal lengkap siap dipresentasikan dalam 1 klik.',
                      },
                      {
                        key: 'feat_auto_followup',
                        title: 'Pengingat Otomatis (Follow-up 3 Hari)',
                        desc: 'Mengirimkan 1 kali email tindak lanjut yang sopan jika calon klien belum membalas email pertama setelah 3 hari kerja.',
                        benefit: 'Anti-lupa: Terbukti meningkatkan angka balasan hingga 2x lipat dibanding hanya 1x kirim.',
                      },
                      {
                        key: 'feat_auto_discovery',
                        title: 'Pencari Bisnis Baru Otomatis (Radar Sekitar Kantor)',
                        desc: 'Sistem otomatis memindai area sekitar kantor Anda setiap malam untuk mencari tempat usaha baru yang baru buka agar database Anda selalu bertambah.',
                        benefit: 'Sumber prospek tiada henti: Database bertambah sendiri tanpa harus cari manual di Google Maps.',
                      },
                      {
                        key: 'feat_telegram_alerts',
                        title: 'Pemberitahuan Instan ke Telegram HP',
                        desc: 'Dapatkan pesan instan langsung di aplikasi Telegram HP Anda begitu ada calon klien yang membalas email atau saat target harian selesai.',
                        benefit: 'Respon secepat kilat: Anda bisa langsung merespons calon pembeli detik itu juga.',
                      },
                    ].map((m) => {
                      const isActive = settings[m.key] === 1;
                      return (
                        <div
                          key={m.key}
                          onClick={() => toggleFeature(m.key)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            borderRadius: '8px',
                            border: `1px solid ${isActive ? 'rgba(37,99,235,0.4)' : 'var(--border-subtle)'}`,
                            backgroundColor: isActive ? 'rgba(37,99,235,0.04)' : 'var(--bg-app)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ flex: 1, paddingRight: '16px' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{m.title}</span>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: isActive ? 'var(--success-bg)' : 'var(--bg-card-subtle)',
                                  color: isActive ? 'var(--success-text)' : 'var(--text-muted)',
                                  fontWeight: 700,
                                }}
                              >
                                {isActive ? 'AKTIF' : 'NONAKTIF'}
                              </span>
                            </div>
                            <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                              {m.desc}
                            </p>
                            <div style={{ fontSize: '0.71875rem', color: 'var(--accent-text)', marginTop: '3px', fontWeight: 500 }}>
                              <strong>Keuntungan:</strong> {m.benefit}
                            </div>
                          </div>

                          {/* Native Accessible Switch Toggle */}
                          <div
                            role="switch"
                            aria-checked={isActive}
                            style={{
                              width: '44px',
                              height: '24px',
                              borderRadius: '12px',
                              backgroundColor: isActive ? '#10b981' : '#334155',
                              position: 'relative',
                              transition: 'background-color 0.2s',
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                backgroundColor: '#ffffff',
                                position: 'absolute',
                                top: '3px',
                                left: isActive ? '23px' : '3px',
                                transition: 'left 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* TAB 4: Email Pengirim */}
                {activeTab === 'email' && (
                  <EmailConnectorSection
                    tenantId={tenantId}
                    initialSettings={settings}
                    showSmtpFromField={true}
                    showSmtpRevokeButton={true}
                    onRevokeSmtpPass={() => handleRevokeSecret('smtp_pass', 'Password SMTP')}
                    onSettingsChange={(nextSettings, fieldSync) => {
                      if (nextSettings) {
                        setSettings((prev) => ({
                          ...prev,
                          ...nextSettings,
                          smtp_pass: '',
                          telegram_bot_token: '',
                          llm_key: '',
                        }));
                      } else if (fieldSync) {
                        setSettings((prev) => ({ ...prev, ...fieldSync }));
                      }
                    }}
                    idPrefix="tenant-email"
                  />
                )}

                {/* TAB 5: Telegram, Kuota & BYOK */}
                {activeTab === 'telegram' && (
                  <>
                    {/* Ringkasan Kuota Paket Bulanan (Managed Pool SaaS) */}
                    {settings.usage && (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            Kuota Bulanan Platform ({settings.usage.month})
                          </span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(37,99,235,0.14)',
                              color: '#3b82f6',
                            }}
                          >
                            Paket {settings.usage.plan}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Kredit AI {settings.llm_key_set ? '(BYOK Aktif)' : ''}</span>
                              <strong style={{ color: 'var(--text-main)' }}>
                                {settings.llm_key_set ? 'Unlimited' : `${settings.usage.ai_used} / ${settings.usage.ai_limit}`}
                              </strong>
                            </div>
                            <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--border-subtle)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  height: '100%',
                                  width: settings.llm_key_set
                                    ? '100%'
                                    : `${Math.min(100, Math.round((settings.usage.ai_used / Math.max(1, settings.usage.ai_limit)) * 100))}%`,
                                  backgroundColor: settings.llm_key_set ? '#10b981' : '#2563eb',
                                }}
                              />
                            </div>
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Riset &amp; Enrich Kontak</span>
                              <strong style={{ color: 'var(--text-main)' }}>
                                {settings.usage.enrich_used} / {settings.usage.enrich_limit}
                              </strong>
                            </div>
                            <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--border-subtle)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  height: '100%',
                                  width: `${Math.min(100, Math.round((settings.usage.enrich_used / Math.max(1, settings.usage.enrich_limit)) * 100))}%`,
                                  backgroundColor: '#10b981',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Seluruh infrastruktur database, pencarian web, dan AI sudah dikelola otomatis oleh platform tanpa perlu mengatur API key sendiri.
                        </span>
                      </div>
                    )}

                    {/* Koneksi Telegram 1-Klik via Bot Resmi */}
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: `1px solid ${settings.telegram_chat_id ? 'rgba(16,185,129,0.4)' : 'var(--border-subtle)'}`,
                        backgroundColor: settings.telegram_chat_id ? 'rgba(16,185,129,0.05)' : 'var(--bg-app)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            Notifikasi Bot Telegram Resmi
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {settings.telegram_chat_id
                              ? `Terhubung ke Chat ID: ${settings.telegram_chat_id}`
                              : 'Hubungkan dalam 1 klik tanpa perlu membuat bot di @BotFather.'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleLinkTelegram}
                          disabled={linkingTg}
                          className="btn btn-primary"
                          style={{ height: '36px', fontSize: '0.8rem', padding: '0 14px' }}
                        >
                          {linkingTg ? 'Menyiapkan tautan...' : settings.telegram_chat_id ? 'Hubungkan Ulang' : 'Hubungkan Telegram (1 Klik)'}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAdvancedTg(!showAdvancedTg)}
                        style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', minHeight: '36px', padding: 0 }}
                      >
                        {showAdvancedTg ? '▾ Sembunyikan pengaturan bot manual' : '▸ Atur Chat ID / Bot Kustom manual (opsional)'}
                      </button>

                      {showAdvancedTg && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                              Telegram Chat ID / Group ID
                            </label>
                            <input
                              type="text"
                              placeholder="-100123456789 atau 987654321"
                              value={settings.telegram_chat_id || ''}
                              onChange={(e) => setSettings({ ...settings, telegram_chat_id: e.target.value })}
                              style={{
                                width: '100%',
                                height: '38px',
                                padding: '0 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-subtle)',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--text-main)',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box',
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                              Bot Token Pribadi (Opsional, kosongkan untuk memakai bot resmi)
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="password"
                                placeholder={settings.telegram_bot_token_set ? '•••••••••••• (Tersimpan aman)' : 'Opsional: 123456:ABC...'}
                                value={settings.telegram_bot_token || ''}
                                onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                                style={{
                                  flex: 1,
                                  height: '38px',
                                  padding: '0 12px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-subtle)',
                                  backgroundColor: 'var(--bg-card)',
                                  color: 'var(--text-main)',
                                  fontSize: '0.85rem',
                                  boxSizing: 'border-box',
                                }}
                              />
                              {settings.telegram_bot_token_set && (
                                <button
                                  type="button"
                                  onClick={() => handleRevokeSecret('telegram_bot_token', 'Bot Token Kustom')}
                                  style={{ height: '38px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--danger-border)', background: 'none', color: 'var(--danger-text)', fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                  Hapus
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '4px' }}>
                        Link Jadwal Konsultasi / Meeting Online (Google Calendar / Google Meet)
                      </label>
                      <input
                        type="url"
                        placeholder="https://calendar.google.com/..."
                        value={settings.calendly_url || ''}
                        onChange={(e) => setSettings({ ...settings, calendly_url: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Tautan ini otomatis disisipkan di proposal dan akhir email penawaran sehingga calon klien yang berminat bisa langsung klik untuk memilih jam diskusi.
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '4px' }}>
                        Batas Maksimal Pengiriman Email per Hari (Kuota Harian)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={settings.daily_quota || 20}
                        onChange={(e) => setSettings({ ...settings, daily_quota: e.target.value })}
                        style={{
                          width: '100%',
                          height: '40px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--bg-app)',
                          color: 'var(--text-main)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                        Berapa banyak calon klien baru yang ingin dihubungi per hari kerja. Disarankan 20 - 50 email per hari agar akun email Anda aman dan tidak dicurigai sebagai spam.
                      </span>
                    </div>
                  </>
                )}

                {/* TAB 6: Anggota Tim */}
                {activeTab === 'team' && (
                  <div>
                    {memberMsg && (
                      <div
                        style={{
                          padding: '0.6rem 0.8rem',
                          borderRadius: '6px',
                          marginBottom: '10px',
                          backgroundColor: memberMsg.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                          border: `1px solid ${memberMsg.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`,
                          color: memberMsg.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
                          fontSize: '0.8rem',
                        }}
                      >
                        {memberMsg.text}
                      </div>
                    )}

                    <div
                      style={{
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '16px',
                        backgroundColor: 'var(--bg-app)',
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                        + Tambah Anggota Tim Baru
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                        <input
                          type="email"
                          placeholder="email@tim.com"
                          value={newMember.email}
                          onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                          style={{ height: '36px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontSize: '0.8rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          value={newMember.password}
                          onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                          style={{ height: '36px', padding: '0 10px', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontSize: '0.8rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                        />
                        <select
                          value={newMember.role}
                          onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                          style={{ height: '36px', padding: '0 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)', fontSize: '0.8rem', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                        >
                          <option value="client_sales">Sales Staff</option>
                          <option value="client_admin">Admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleAddMember}
                          disabled={addingMember}
                          className="btn btn-primary"
                          style={{ height: '36px', fontSize: '0.8rem', padding: '0 8px' }}
                        >
                          {addingMember ? 'Menambah...' : 'Tambah'}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Daftar Anggota Aktif ({members.length})</span>
                      {loadingMembers ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Memuat anggota tim...</div>
                      ) : members.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Belum ada anggota tim lain.</div>
                      ) : (
                        members.map((m) => (
                          <div
                            key={m.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 12px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-subtle)',
                              backgroundColor: 'var(--bg-app)',
                            }}
                          >
                            <div>
                              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600 }}>{m.email}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Ditambahkan: {new Date(m.created_at).toLocaleDateString('id-ID')}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  backgroundColor: m.role === 'client_admin' ? 'var(--accent-light)' : 'var(--bg-card-subtle)',
                                  color: m.role === 'client_admin' ? 'var(--accent-text)' : 'var(--text-muted)',
                                  fontWeight: 600,
                                }}
                              >
                                {m.role === 'client_admin' ? 'Admin' : 'Sales Staff'}
                              </span>
                              {m.role !== 'client_admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMember(m.id, m.email)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--danger-text)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    minHeight: '36px',
                                    padding: '2px 8px',
                                  }}
                                >
                                  Hapus
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end',
                  marginTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '12px',
                  paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 20px))',
                  flexShrink: 0,
                  boxSizing: 'border-box'
                }}>
                  <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving} style={{ minHeight: '40px', minWidth: '80px' }}>
                    Tutup
                  </button>
                  {activeTab !== 'team' && (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={saving}
                      style={{ minHeight: '40px', minWidth: '140px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      {saving ? (
                        <span>Menyimpan...</span>
                      ) : (
                        <>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                          <span>Simpan Pengaturan</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Modal Crawler Website Perusahaan - Standalone sibling modal */}
      <CompanyCrawlerModal
        isOpen={isCrawlerOpen}
        onClose={() => setIsCrawlerOpen(false)}
        onApplyToProfile={(summary, updatedUrls) => {
          setSettings((prev) => ({
            ...prev,
            company_offering: prev.company_offering ? `${prev.company_offering}\n\n${summary}` : summary,
            company_urls: updatedUrls ? JSON.stringify(updatedUrls) : prev.company_urls,
          }));
        }}
        onSaveUrls={(updatedUrls) => {
          setSettings((prev) => ({
            ...prev,
            company_urls: JSON.stringify(updatedUrls),
          }));
        }}
        defaultUrl={tenantId ? (settings.company_website || '') : 'https://prospekta.id'}
        initialUrls={(() => {
          try {
            return settings.company_urls ? JSON.parse(settings.company_urls) : null;
          } catch {
            return null;
          }
        })()}
        initialScope={settings.crawl_scope || 'subdomain'}
        initialAllowedDomains={settings.crawl_domains || ''}
        tenantId={tenantId}
      />
    </>
  );
}
