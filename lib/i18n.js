'use client';

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext, startTransition } from 'react';

export const DICTIONARY = {
  en: {
    // Auth & Login
    login_title: 'Sign In',
    login_subtitle: 'Enter your email and password to access the dashboard.',
    login_pwd_label: 'Password',
    login_pwd_placeholder: 'Enter your password...',
    login_show_pwd: 'Show password',
    login_hide_pwd: 'Hide password',
    login_remember_me: 'Remember me',
    login_btn_submit: 'Sign In',
    login_btn_loading: 'Signing in...',
    login_err_empty: 'Please enter your password.',
    login_err_invalid: 'Incorrect email or password. Please try again.',
    login_err_network: 'Connection error. Please check your internet connection.',
    theme_light: 'Light Mode',
    theme_dark: 'Dark Mode',
    lang_name_en: 'English',
    lang_name_id: 'Indonesia',
    lang_toggle_title: 'Switch language / Ubah bahasa',

    // Header & Actions
    telegram_channel: 'Telegram Channel',
    telegram_channel_sub: 'Lead alerts & quota reports',
    webmail_btn: 'Webmail',
    send_batch_btn: 'Send Batch (10 Emails)',
    sending_batch: 'Sending Batch...',
    sent_outreach_btn: 'Sent Outreach',
    prebuilt_sites_btn: 'Prebuilt Sites',
    auto_outreach_btn: 'Auto-Outreach',
    data_tools_btn: 'Data & Tools',
    logout_btn: 'Sign Out',
    scan_radius: 'Scan Radius (Acquire Leads)',
    export_data: 'Export Data (CSV / JSON)',
    import_data: 'Import CSV Data',
    category_rules: 'Category Classification Rules',
    token_monitoring: 'AI Token Monitoring',
    sync_history: 'Data Sync History',
    auto_sync_pill: 'Auto-sync 00:00 WIB',
    calendly_schedule: 'Google Calendar Meeting Schedule',

    // Stats Section
    stat_today_activity: "Today's Activity",
    stat_quota_filled: 'Quota Completed',
    stat_live_24h: 'Live 24h',
    stat_emails_sent: 'Emails Sent',
    stat_sites_built: 'Websites Built',
    stat_target_daily: 'Target 100/day',
    stat_prospect_responses: 'Prospect Responses',
    stat_hot_leads: 'Hot Leads',
    stat_inbox: 'Inbox',
    stat_prospects_replied: 'Prospects Replied',
    stat_response_rate: 'Response Rate',
    stat_filtered_rejections: 'rejections filtered',
    stat_auto_reply_active: 'Auto-reply filter active',
    stat_open_webmail: 'Open Webmail',
    stat_total_sent: 'Total Emails Sent',
    stat_cumulative_sg: 'Cumulative SG',
    stat_sub_sent: 'Executive outreach via SMTP',
    stat_in_active_radius: 'in active radius',
    stat_view_log: 'View Log',
    stat_total_prebuilt: 'Total Prebuilt Sites',
    stat_live_showcase: 'Live Showcase',
    stat_sub_prebuilt: 'Interactive ready-to-use sites',
    stat_web_directory: 'Web Directory',
    stat_total_radius_biz: 'Total Radius Businesses',
    stat_active_area: 'Active Area',
    stat_sub_radius: 'Mapped businesses in radius',
    stat_source_gmaps: 'Google Maps Singapore database',
    stat_have_website: 'Website Status',
    stat_sub_website: 'Companies with active domain',
    stat_ready_ai: 'Ready for AI audit & prebuilt',
    stat_with_website: 'With Website',
    stat_without_website: 'No Website',
    stat_have_contact: 'Contact & Phone',
    stat_sub_contact: 'Official phone or email verified',
    stat_supports_outreach: 'Supports WhatsApp & Cold Email',
    stat_with_phone: 'With Phone',
    stat_without_phone: 'No Phone',
    stat_pipeline_followup: 'Pipeline & Follow-Up',
    stat_queue: 'Queue',
    stat_followup_due: 'Follow-Up (>3 days)',
    stat_followed_up: 'Followed Up',
    stat_in_analysis: 'in AI research & proposal draft',
    stat_active_filter: 'Active',
    stat_view_in_table: 'View in Table',
    stat_open_auto_outreach: 'Auto Outreach',
    stat_open_queue: 'Open Queue',
    stat_filter_no_website: 'Filter No Web',
    stat_filter_with_phone: 'Filter With Phone',
    stat_reset_filters: 'Reset Filters',

    // Table Filter Tabs
    tab_all_status: 'All Statuses',
    tab_new: 'New',
    tab_analyzed: 'Analyzed',
    tab_proposal: 'Draft Proposal',
    tab_sent: 'Sent',
    tab_replied: 'Replied',
    tab_meeting: 'Meeting Booked',
    tab_won: 'Partnership (Won)',
    search_placeholder: 'Search company name, category, address, or PIC...',
    all_categories: 'All Categories',
    all_enrich_statuses: 'All Enrich Statuses',
    filter_has_phone: 'Has Phone',
    filter_no_phone: 'No Phone',
    filter_has_wa: 'Has WhatsApp',
    filter_has_email: 'Has Email',
    filter_has_website: 'Has Website',
    filter_no_website: 'No Website',
    filter_has_pic: 'Has PIC',
    filter_has_linkedin: 'Has LinkedIn',
    filter_has_prebuilt: 'Has Prebuilt Site',
    filter_has_sent: 'Already Sent Outreach',

    // Table Columns & Actions
    col_company: 'Company & Location',
    col_contact: 'Contact & Channels',
    col_pic: 'Verified PIC',
    col_status: 'Outreach Status',
    col_actions: 'Actions',
    btn_audit_outreach: 'Audit & Outreach',
    btn_view_site: 'View Site',
    badge_done: 'Done',
    badge_new: 'New',

    // Webmail
    webmail_inbox: 'Inbox',
    webmail_sent: 'Sent',
    webmail_search_placeholder: 'Search subject, sender, or recipient...',
    webmail_tab_all: 'All Messages',
    webmail_tab_sales: 'Prospects & Replies',
    webmail_tab_outreach: 'Sent Outreach',
    webmail_tab_auto: 'Auto-Reply & Bounces',
    webmail_tab_internal: 'Internal & Operations',
    webmail_compose_new: 'Compose Email',
    webmail_open_full: 'Open Full Webmail',
    webmail_close: 'Close',
    webmail_select_prompt: 'Select an email from the list to view its complete content',
    webmail_smart_reply: 'AI Smart Reply',
    webmail_manual_reply: 'Reply Manually',
    webmail_loading_msg: 'Fetching live emails from',
  },
  id: {
    // Auth & Login
    login_title: 'Masuk ke Akun',
    login_subtitle: 'Masukkan email dan password untuk mengakses dashboard.',
    login_pwd_label: 'Password',
    login_pwd_placeholder: 'Masukkan password Anda...',
    login_show_pwd: 'Lihat password',
    login_hide_pwd: 'Sembunyikan password',
    login_remember_me: 'Ingat saya',
    login_btn_submit: 'Masuk',
    login_btn_loading: 'Memproses...',
    login_err_empty: 'Silakan masukkan password Anda.',
    login_err_invalid: 'Email atau password tidak sesuai. Silakan coba lagi.',
    login_err_network: 'Gagal terhubung ke server. Periksa koneksi internet Anda.',
    theme_light: 'Mode Terang',
    theme_dark: 'Mode Gelap',
    lang_name_en: 'English',
    lang_name_id: 'Indonesia',
    lang_toggle_title: 'Ubah bahasa / Switch language',

    // Header & Actions
    telegram_channel: 'Channel Telegram',
    telegram_channel_sub: 'Alert respon prospek & kuota',
    webmail_btn: 'Webmail',
    send_batch_btn: 'Kirim Batch (10 Email)',
    sending_batch: 'Mengirim Batch...',
    sent_outreach_btn: 'Email Terkirim',
    prebuilt_sites_btn: 'Website Prebuilt',
    auto_outreach_btn: 'Auto-Outreach',
    data_tools_btn: 'Data & Alat',
    logout_btn: 'Keluar',
    scan_radius: 'Tarik Data Bisnis (Scan Radius)',
    export_data: 'Ekspor Data (CSV / JSON)',
    import_data: 'Impor Data CSV',
    category_rules: 'Aturan Kategori Usaha',
    token_monitoring: 'Monitoring Token AI',
    sync_history: 'Riwayat Sinkronisasi Data',
    auto_sync_pill: 'Auto-sync 00:00 WIB',
    calendly_schedule: 'Jadwal Meeting Google Calendar',

    // Stats Section
    stat_today_activity: 'Aktivitas Hari Ini',
    stat_quota_filled: 'Kuota Terpenuhi',
    stat_live_24h: 'Live 24 Jam',
    stat_emails_sent: 'Email Terkirim',
    stat_sites_built: 'Web Dibuat',
    stat_target_daily: 'Target 100/hari',
    stat_prospect_responses: 'Respon Prospek',
    stat_hot_leads: 'Hot Lead',
    stat_inbox: 'Kotak Masuk',
    stat_prospects_replied: 'Prospek Membalas',
    stat_response_rate: 'Response Rate',
    stat_filtered_rejections: 'penolakan difilter',
    stat_auto_reply_active: 'Filter auto-reply aktif',
    stat_open_webmail: 'Buka Webmail',
    stat_total_sent: 'Total Email Terkirim',
    stat_cumulative_sg: 'Kumulatif SG',
    stat_sub_sent: 'Email penawaran eksekutif via SMTP',
    stat_in_active_radius: 'di radius aktif',
    stat_view_log: 'Lihat Log',
    stat_total_prebuilt: 'Total Web Prebuilt',
    stat_live_showcase: 'Live Showcase',
    stat_sub_prebuilt: 'Website interaktif siap pakai',
    stat_web_directory: 'Direktori Web',
    stat_total_radius_biz: 'Total Bisnis Radius',
    stat_active_area: 'Area Aktif',
    stat_sub_radius: 'Bisnis terpetakan di area radius',
    stat_source_gmaps: 'Basis data Google Maps Singapura',
    stat_have_website: 'Status Website',
    stat_sub_website: 'Perusahaan memiliki domain aktif',
    stat_ready_ai: 'Siap diaudit AI & penawaran prebuilt',
    stat_with_website: 'Ada Website',
    stat_without_website: 'Tanpa Website',
    stat_have_contact: 'Kontak & Telepon',
    stat_sub_contact: 'Telepon atau email resmi terdata',
    stat_supports_outreach: 'Mendukung WhatsApp & Cold Email',
    stat_with_phone: 'Ada Telepon',
    stat_without_phone: 'Tanpa Telepon',
    stat_pipeline_followup: 'Pipeline & Follow-Up',
    stat_queue: 'Antrean',
    stat_followup_due: 'Follow-Up (>3 hari)',
    stat_followed_up: 'Sudah Follow-Up',
    stat_in_analysis: 'dalam riset AI & draf proposal',
    stat_active_filter: 'Aktif',
    stat_view_in_table: 'Lihat di Tabel',
    stat_open_auto_outreach: 'Bot Outreach',
    stat_open_queue: 'Buka Antrean',
    stat_filter_no_website: 'Filter Tanpa Web',
    stat_filter_with_phone: 'Filter Ada Kontak',
    stat_reset_filters: 'Reset Filter',

    // Table Filter Tabs
    tab_all_status: 'Semua Status',
    tab_new: 'Baru',
    tab_analyzed: 'Dianalisis',
    tab_proposal: 'Draft Proposal',
    tab_sent: 'Terkirim',
    tab_replied: 'Dibalas',
    tab_meeting: 'Jadwal Meeting',
    tab_won: 'Kemitraan (Won)',
    search_placeholder: 'Cari nama tempat, kategori, alamat, atau PIC...',
    all_categories: 'Semua Bidang Usaha',
    all_enrich_statuses: 'Semua Status Pengayaan',
    filter_has_phone: 'Ada Telepon',
    filter_no_phone: 'Tanpa Telepon',
    filter_has_wa: 'Ada WhatsApp',
    filter_has_email: 'Ada Email',
    filter_has_website: 'Ada Website',
    filter_no_website: 'Tanpa Website',
    filter_has_pic: 'Ada PIC',
    filter_has_linkedin: 'Ada LinkedIn',
    filter_has_prebuilt: 'Ada Website Prebuilt',
    filter_has_sent: 'Sudah Pernah Di-outreach',

    // Table Columns & Actions
    col_company: 'Nama Tempat & Perusahaan',
    col_contact: 'Kontak & Kanal',
    col_pic: 'PIC Terverifikasi',
    col_status: 'Status Outreach',
    col_actions: 'Aksi',
    btn_audit_outreach: 'Audit & Outreach',
    btn_view_site: 'Lihat Web',
    badge_done: 'Selesai',
    badge_new: 'Baru',

    // Webmail
    webmail_inbox: 'Inbox (Kotak Masuk)',
    webmail_sent: 'Sent (Email Terkirim)',
    webmail_search_placeholder: 'Cari subjek, pengirim, atau penerima...',
    webmail_tab_all: 'Semua Pesan',
    webmail_tab_sales: 'Prospek & Respon',
    webmail_tab_outreach: 'Outreach Terkirim',
    webmail_tab_auto: 'Respon Otomatis & Gagal',
    webmail_tab_internal: 'Internal & Operasional',
    webmail_compose_new: 'Tulis Email Baru',
    webmail_open_full: 'Buka Webmail Penuh',
    webmail_close: 'Tutup',
    webmail_select_prompt: 'Pilih salah satu email di daftar untuk membaca isi lengkapnya',
    webmail_smart_reply: 'AI Smart Reply (Otomatis)',
    webmail_manual_reply: 'Balas Manual',
    webmail_loading_msg: 'Menarik email live dari',
  }
};

export const DEFAULT_LANGUAGE = 'en';

export function getStoredLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const saved = localStorage.getItem('prospekta_lang');
    return saved === 'id' || saved === 'en' ? saved : DEFAULT_LANGUAGE;
  } catch (_) {
    return DEFAULT_LANGUAGE;
  }
}

export function setStoredLanguage(lang) {
  if (typeof window === 'undefined') return;
  const target = lang === 'id' ? 'id' : 'en';
  try {
    localStorage.setItem('prospekta_lang', target);
    window.dispatchEvent(new CustomEvent('prospekta_lang_change', { detail: target }));
  } catch (_) {}
}

export function t(key, lang = 'en') {
  const activeLang = lang === 'id' ? 'id' : 'en';
  const dict = DICTIONARY[activeLang] || DICTIONARY.en;
  return dict[key] || DICTIONARY.en[key] || key;
}

// Inline pair for one-off strings: tx('Save', 'Simpan'). Keys in DICTIONARY stay for shared labels.
export function tx(en, id, lang = DEFAULT_LANGUAGE) {
  return lang === 'id' ? id : en;
}

const LanguageContext = createContext({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t: (k) => t(k, DEFAULT_LANGUAGE),
  tx: (en) => en,
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    setLangState(getStoredLanguage());

    const handleLangChange = (e) => {
      if (e.detail) setLangState(e.detail);
    };

    window.addEventListener('prospekta_lang_change', handleLangChange);
    window.addEventListener('storage', (e) => {
      if (e.key === 'prospekta_lang' && (e.newValue === 'en' || e.newValue === 'id')) {
        setLangState(e.newValue);
      }
    });

    return () => {
      window.removeEventListener('prospekta_lang_change', handleLangChange);
    };
  }, []);

  const setLang = useCallback((nextLang) => {
    const valid = nextLang === 'id' ? 'id' : 'en';
    setLangState((prev) => {
      if (prev === valid) return prev;
      startTransition(() => {
        setStoredLanguage(valid);
      });
      return valid;
    });
  }, []);

  const translate = useCallback((key) => t(key, lang), [lang]);
  const pick = useCallback((en, id) => tx(en, id, lang), [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const contextValue = useMemo(() => ({
    lang,
    setLang,
    t: translate,
    tx: pick
  }), [lang, setLang, translate, pick]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx || !ctx.setLang) {
    // Fallback standalone hook if used outside provider
    const [lang, setLang] = useState(DEFAULT_LANGUAGE);
    useEffect(() => {
      setLang(getStoredLanguage());
      const onLang = (e) => e.detail && setLang(e.detail);
      window.addEventListener('prospekta_lang_change', onLang);
      return () => window.removeEventListener('prospekta_lang_change', onLang);
    }, []);
    return {
      lang,
      setLang: (l) => {
        setLang(l);
        setStoredLanguage(l);
      },
      t: (k) => t(k, lang),
      tx: (en, id) => tx(en, id, lang),
    };
  }
  return ctx;
}
