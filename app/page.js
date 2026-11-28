'use client';

import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import dynamic from 'next/dynamic';
import StatsSection from '@/components/StatsSection';
import LanguageToggle from '@/components/LanguageToggle';
import { useI18n } from '@/lib/i18n';
import { getPhoneType, getWhatsAppUrl } from '@/lib/phone';
import { copyToClipboard } from '@/lib/clipboard';

// Dynamically split modals to minimize initial bundle size
const ScanModal = dynamic(() => import('@/components/Modals').then((m) => m.ScanModal), { ssr: false });
const EnrichModal = dynamic(() => import('@/components/Modals').then((m) => m.EnrichModal), { ssr: false });
const ExportModal = dynamic(() => import('@/components/Modals').then((m) => m.ExportModal), { ssr: false });
const ImportModal = dynamic(() => import('@/components/Modals').then((m) => m.ImportModal), { ssr: false });
const CategoryRulesModal = dynamic(() => import('@/components/Modals').then((m) => m.CategoryRulesModal), { ssr: false });
const SyncNotificationModal = dynamic(() => import('@/components/Modals').then((m) => m.SyncNotificationModal), { ssr: false });
const GoogleSheetSyncModal = dynamic(() => import('@/components/Modals').then((m) => m.GoogleSheetSyncModal), { ssr: false });
const AddLeadModal = dynamic(() => import('@/components/Modals').then((m) => m.AddLeadModal), { ssr: false });
const LogoutModal = dynamic(() => import('@/components/Modals').then((m) => m.LogoutModal), { ssr: false });

import { ProspektaMark } from '@/components/ProspektaLogo';

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
);

const IconAlertTriangle = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);

const IconMapPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);

// Dynamically import MapView to avoid Leaflet SSR window errors
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="map-card">
      <div className="card-header">
        <span>Peta Radius dan Sebaran Tempat</span>
      </div>
      <div className="map-container state-container">
      </div>
    </div>
  )
});

const ReachModal = dynamic(() => import('@/components/ReachModal'), {
  ssr: false
});

const PrebuiltSitesModal = dynamic(() => import('@/components/PrebuiltSitesModal'), {
  ssr: false
});

const McpPluginModal = dynamic(() => import('@/components/McpPluginModal'), {
  ssr: false
});

const AiAssistantPanel = dynamic(() => import('@/components/AiAssistantPanel'), {
  ssr: false
});

const NotificationsModal = dynamic(() => import('@/components/NotificationsModal'), {
  ssr: false
});

const QuickClientModal = dynamic(() => import('@/components/QuickClientModal'), {
  ssr: false
});

const TenantSettingsModal = dynamic(() => import('@/components/TenantSettingsModal'), {
  ssr: false
});

const CompanyCrawlerModal = dynamic(() => import('@/components/CompanyCrawlerModal'), {
  ssr: false
});

const DEFAULT_ANCHORS = [
  {
    id: 'prospekta_jkt',
    name: 'Prospekta Jakarta Hub',
    address: 'Prestige Centre, 71 Bukit Batok Crescent, Singapore 658071',
    city: 'Singapore',
    lat: 1.3385,
    lng: 103.7559,
    radius_default_km: 5
  },
  {
    id: 'ai_hub',
    name: 'Prospekta AI Hub',
    address: 'Graha Pengharapan lt. 2, Jl. Denpasar Raya No.2',
    city: 'Jakarta Selatan',
    lat: -6.2215,
    lng: 106.827,
    radius_default_km: 2
  },
  {
    id: 'academy_jakarta',
    name: 'Prospekta',
    address: 'Pakuwon Tower 26J, Jl Raya Kasablanka 88',
    city: 'Jakarta Selatan',
    lat: -6.2219,
    lng: 106.8429,
    radius_default_km: 2
  },
  {
    id: 'academy_surabaya',
    name: 'Prospekta Surabaya',
    address: 'Ciputra World VieLoft 1220, Jl Mayjend Sungkono 89',
    city: 'Surabaya',
    lat: -7.293,
    lng: 112.7198,
    radius_default_km: 2
  }
];

const getEffectiveIcpScore = (p) => {
  if (!p) return 25;
  if (p.icp_score && Number(p.icp_score) > 0) return Number(p.icp_score);
  const hasEmail = Boolean(p.email);
  const hasPic = Boolean(p.pic_name);
  const hasPhone = Boolean(p.phone || p.whatsapp);
  const cat = (p.category_raw || p.bidang_usaha || '').toLowerCase();
  const isPriority = /clinic|medis|doctor|dent|hospital|law|consult|corporate|company|financial|industrial|engineering|pt|logistik/.test(cat);
  const isOutdated = !p.website || p.website_condition === 'outdated' || p.website_condition === 'none';
  return (hasEmail ? 30 : 0) + (hasPic ? 25 : 0) + (hasPhone ? 10 : 0) + (isPriority ? 25 : 15) + (isOutdated ? 20 : 10);
};

export default function DashboardPage() {
  const { lang, t, tx } = useI18n();
  const locale = lang === 'id' ? 'id-ID' : 'en-US';
  const [anchors, setAnchors] = useState([]);
  const [activeAnchorId, setActiveAnchorId] = useState('');
  const [radiusKm, setRadiusKm] = useState(2);
  const [places, setPlaces] = useState([]);
  const [mapPlaces, setMapPlaces] = useState([]);
  const [liveStats, setLiveStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Prospekta Outreach & Research State
  const [selectedReachPlace, setSelectedReachPlace] = useState(null);
  const [isPendingReach, startTransition] = useTransition();
  const [quota, setQuota] = useState(null);
  const [reachStatus, setReachStatus] = useState('all');
  const [webmailCategory, setWebmailCategory] = useState('sales');
  const [webmailInitialUid, setWebmailInitialUid] = useState(null);
  const [webmailInitialMsg, setWebmailInitialMsg] = useState(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [hasUnreadHotLeads, setHasUnreadHotLeads] = useState(false);

  // Polling unread replies count untuk Bell Badge (dioptimalkan hemat kuota Turso & baterai)
  const fetchUnreadNotifications = useCallback(async () => {
    // Matikan polling sepenuhnya jika tab browser diminimize / tidak aktif
    if (typeof document !== 'undefined' && document.hidden) return;

    try {
      const res = await fetch('/api/reach/notifications?limit=25');
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        let readSet = new Set();
        try {
          const saved = localStorage.getItem('prospekta_read_notification_uids_v1');
          if (saved) readSet = new Set(JSON.parse(saved));
        } catch (_) {}
        const unreadItems = data.notifications.filter((r) => !readSet.has(r.uid));
        setUnreadNotificationsCount(unreadItems.length);
        setHasUnreadHotLeads(unreadItems.some((r) => r.isHighIntent));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchUnreadNotifications();
    // Interval hemat: 3 menit (180 detik) hemat CPU dan ter-cache di Edge CDN
    const timer = setInterval(fetchUnreadNotifications, 180000);

    // Saat tab kembali dibuka oleh user, langsung perbarui notifikasi secara responsif
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchUnreadNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUnreadNotifications]);

  const handleOpenReach = (place) => {
    startTransition(() => {
      setSelectedReachPlace(place);
    });
  };

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input agar tidak membebani database setiap ketikan huruf
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 280);
    return () => clearTimeout(handler);
  }, [search]);
  const [bidangUsaha, setBidangUsaha] = useState('all');
  const [enrichStatus, setEnrichStatus] = useState('all');
  const [hasPhone, setHasPhone] = useState(false);
  const [noPhone, setNoPhone] = useState(false);
  const [hasWebsite, setHasWebsite] = useState(false);
  const [noWebsite, setNoWebsite] = useState(false);
  const [websiteCondition, setWebsiteCondition] = useState('all');
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPic, setHasPic] = useState(false);
  const [hasLinkedin, setHasLinkedin] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(null);
  const [hasPrebuiltSiteFilter, setHasPrebuiltSiteFilter] = useState(false);
  const [hasSentOutreachFilter, setHasSentOutreachFilter] = useState(false);
  const [sortBy, setSortBy] = useState('distance_m');
  const [order, setOrder] = useState('ASC');
  const [page, setPage] = useState(1);
  const [tableLayout, setTableLayout] = useState('compact');
  const limit = 25;

  // Outreach KPI SOP State (25 email per hari)
  const [onlyPersonalLeads, setOnlyPersonalLeads] = useState(false);
  const [tsvCopied, setTsvCopied] = useState(false);

  // Copy current places table to TSV format for Google Sheets / Excel (Aligned with Step 5 SOP Tracker)
  const handleCopyTsv = useCallback(() => {
    if (!places || places.length === 0) return;
    const headers = [
      'Nama Perusahaan',
      'Nama & Jabatan DM',
      'Verified Email',
      'Website Status (None / Outdated / Modern)',
      'Offer Angle (Digital / Agentic AI)',
      'Status Pengiriman (Sent / Pending)',
      'Follow-up Status (No Reply / Replied / Meeting Booked)',
      'Problem Analysis',
      'Nomor Telepon',
      'Website',
      'Social Media (Instagram)',
      'Alamat'
    ];
    const rows = places.map((p) => {
      const dm = p.pic_name ? `${p.pic_name}${p.pic_title ? ` (${p.pic_title})` : ''}` : '';
      const webStatus = p.website_condition && p.website_condition !== 'unverified'
        ? (p.website_condition === 'modern' ? 'Modern' : p.website_condition === 'outdated' ? 'Outdated' : 'None')
        : (p.website ? 'Modern' : 'None');
      const angle = p.offer_angle === 'agentic_ai' ? 'Agentic AI' : 'Digital';
      const sentStatus = (p.reach_status && p.reach_status !== 'new' && p.reach_status !== 'analyzed') ? 'Sent' : 'Pending';
      const followUp = p.reach_status === 'meeting' ? 'Meeting Booked' : p.reach_status === 'replied' ? 'Replied' : 'No Reply';

      return [
        p.name || '',
        dm,
        p.email || '',
        webStatus,
        angle,
        sentStatus,
        followUp,
        p.problem_analysis || p.notes || '',
        p.phone || p.whatsapp || '',
        p.website || '',
        p.social_media || '',
        p.address || ''
      ].map((val) => (val || '').toString().replace(/\t/g, ' ').replace(/\n/g, ' '));
    });

    const tsvContent = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    copyToClipboard(tsvContent).then((copied) => {
      if (copied) {
        setTsvCopied(true);
        setTimeout(() => setTsvCopied(false), 3000);
      }
    });
  }, [places]);

  // Download CSV Lead Aktif (Native CSV export)
  const handleDownloadCsv = useCallback(() => {
    if (!places || places.length === 0) return;
    const headers = ['Nama Perusahaan', 'Kategori', 'Email', 'Telepon', 'Website', 'Status', 'Alamat'];
    const csvRows = [
      headers.join(','),
      ...places.map((p) =>
        [
          `"${(p.name || '').replace(/"/g, '""')}"`,
          `"${(p.bidang_usaha || p.category_raw || '').replace(/"/g, '""')}"`,
          `"${(p.email || '').replace(/"/g, '""')}"`,
          `"${(p.phone || '').replace(/"/g, '""')}"`,
          `"${(p.website || '').replace(/"/g, '""')}"`,
          `"${(p.reach_status || 'new').replace(/"/g, '""')}"`,
          `"${(p.address || '').replace(/"/g, '""')}"`
        ].join(',')
      )
    ].join('\r\n');

    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `leads-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [places]);


  const [bidangOptions, setBidangOptions] = useState([]);

  // Modals state
  const [activeModal, setActiveModal] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [tenantSettings, setTenantSettings] = useState(null);
  const [isCrawlerOpen, setIsCrawlerOpen] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [aiKeysRefreshKey, setAiKeysRefreshKey] = useState(0);
  const [isProfileSummaryExpanded, setIsProfileSummaryExpanded] = useState(true);
  const [theme, setTheme] = useState('light');
  const [showMap, setShowMap] = useState(true);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [, startUiTransition] = useTransition();

  const handleToggleMap = () => {
    startUiTransition(() => {
      setShowMap((v) => !v);
    });
  };

  const handleToggleMoreFilters = () => {
    startUiTransition(() => {
      setShowMoreFilters((v) => !v);
    });
  };

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('prospekta_theme');
      if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        setShowMap(false);
      }
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const actionParam = params.get('action');
        if (actionParam === 'prebuilt_sites') {
          setActiveModal('prebuilt_sites');
        }
      }
    } catch (_) {}
  }, []);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('prospekta_theme', next);
    } catch (_) {}
  };

  // Custom Point Picking Mode State
  const [isPickingMode, setIsPickingMode] = useState(false);
  const [customCandidate, setCustomCandidate] = useState(null);
  const [isSavingCustomPoint, setIsSavingCustomPoint] = useState(false);
  const [customStatusMsg, setCustomStatusMsg] = useState(null);

  // Geo Autocomplete & Reverse Geocoding State
  const [geoSearchQuery, setGeoSearchQuery] = useState('');
  const [geoSearchResults, setGeoSearchResults] = useState([]);
  const [isSearchingGeo, setIsSearchingGeo] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [geoSearchOpen, setGeoSearchOpen] = useState(false);
  const reverseGeocodeRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const hasInitRadiusRef = useRef(false);

  // Derive active anchor safely
  const activeAnchor = anchors.find((a) => a.id === activeAnchorId) || anchors[0] || null;
  const isSuperadmin = Boolean(currentSession?.isSuperadmin);

  const isSingaporeAnchor = Boolean(
    activeAnchor?.city?.toLowerCase()?.includes('singapore') ||
    activeAnchor?.name?.toLowerCase()?.includes('sg') ||
    activeAnchor?.name?.toLowerCase()?.includes('singapore')
  );
  // Indonesia/custom anchors mendukung hingga 10 km (1, 2, 5, 10); Singapore hingga 20 km.
  const maxScrapedRadius = isSingaporeAnchor ? 20 : Math.max(Number(activeAnchor?.radius_default_km) || 10, 10);

  // Auto-clamp radiusKm jika melebihi batas maksimal anchor terpilih
  useEffect(() => {
    if (!activeAnchor) return;
    const isSg = Boolean(
      activeAnchor?.city?.toLowerCase()?.includes('singapore') ||
      activeAnchor?.name?.toLowerCase()?.includes('sg') ||
      activeAnchor?.name?.toLowerCase()?.includes('singapore')
    );
    const maxR = isSg ? 20 : Math.max(Number(activeAnchor?.radius_default_km) || 10, 10);
    if (radiusKm > maxR) {
      setRadiusKm(maxR);
    }
  }, [activeAnchor, radiusKm]);

  // Fetch Daily Free Tier Quota
  const fetchQuota = async () => {
    try {
      const res = await fetch('/api/reach/quota');
      const data = await res.json();
      if (data.success) {
        setQuota(data);
      }
    } catch (err) {
      console.error('Failed to load quota:', err);
    }
  };

  // Google Sheet Master Sync State
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetSyncResult, setSheetSyncResult] = useState(null);

  const handleSyncGoogleSheet = async () => {
    setIsSyncingSheet(true);
    setSheetSyncResult(null);
    try {
      const res = await fetch('/api/sync/sheet', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal sinkronisasi');
      }
      setSheetSyncResult(`Berhasil memperbarui ${data.totalProcessed || data.updated} data prospek dari Google Sheet Master!`);
      setTimeout(() => setSheetSyncResult(null), 7000);
      handleRefresh();
    } catch (err) {
      alert(`Sinkronisasi Google Sheet gagal: ${err.message}`);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // 1. Fetch Anchors (Auto-select client office for new signups)
  const fetchAnchors = async () => {
    try {
      const res = await fetch('/api/anchors');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success && data.anchors?.length > 0) {
        setAnchors(data.anchors);
        setActiveAnchorId((curr) => {
          if (data.anchors.some((a) => a.id === curr)) return curr;
          return data.anchors[0].id;
        });
        if (!hasInitRadiusRef.current) {
          hasInitRadiusRef.current = true;
          setRadiusKm(Number(data.anchors[0].radius_default_km) || 2);
        }
      } else if (currentSession?.isSuperadmin) {
        setAnchors(DEFAULT_ANCHORS);
        setActiveAnchorId(DEFAULT_ANCHORS[0].id);
        setRadiusKm(DEFAULT_ANCHORS[0].radius_default_km || 2);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load anchors:', err);
      setLoading(false);
    }
  };

  // 2. Fetch Category options
  const fetchCategoryOptions = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.success && data.bidangOptions) {
        setBidangOptions(data.bidangOptions);
      }
    } catch (err) {
      console.error('Failed to load category options:', err);
    }
  };

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data && data.success && data.settings) {
        setTenantSettings(data.settings);
      }
    } catch (_) {}
  }, []);

  // Initial load
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => {
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d && d.success && d.session) {
          setCurrentSession(d.session);
        }
      })
      .catch(() => {});
    fetchAnchors();
    fetchCategoryOptions();
    fetchQuota();
    fetchSettings();
  }, [fetchSettings]);

  // 3. Fetch Places for Table with cleanup and stable dependencies
  useEffect(() => {
    if (!activeAnchor?.name) {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      anchor: activeAnchor.name,
      max_distance: (radiusKm * 1000).toString(),
      limit: limit.toString(),
      offset: ((page - 1) * limit).toString(),
      sort_by: sortBy,
      order
    });

    if (debouncedSearch) params.append('search', debouncedSearch);
    if (bidangUsaha !== 'all') params.append('bidang_usaha', bidangUsaha);
    if (enrichStatus !== 'all') params.append('enrich_status', enrichStatus);
    if (reachStatus !== 'all') params.append('reach_status', reachStatus);
    if (hasPhone) params.append('has_phone', 'true');
    if (noPhone) params.append('no_phone', 'true');
    if (hasWebsite) params.append('has_website', 'true');
    if (noWebsite) params.append('no_website', 'true');
    if (websiteCondition !== 'all') params.append('website_condition', websiteCondition);
    if (hasEmail) params.append('has_email', 'true');
    if (hasPic) params.append('has_pic', 'true');
    if (hasLinkedin) params.append('has_linkedin', 'true');
    if (hasPrebuiltSiteFilter) params.append('has_prebuilt_site', 'true');
    if (hasSentOutreachFilter) params.append('has_sent_outreach', 'true');
    if (onlyPersonalLeads) params.append('is_personal_lead', 'true');
    if (refreshCounter > 0) params.append('fresh', '1');

    fetch(`/api/places?${params.toString()}`, refreshCounter > 0 ? { cache: 'no-store' } : undefined)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success) {
          setPlaces(data.places || []);
          setTotalCount(data.total || 0);
          if (data.stats) {
            setLiveStats(data.stats);
          }
        } else {
          setError(data.error || 'Gagal memuat data tempat.');
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeAnchor?.name,
    radiusKm,
    page,
    limit,
    sortBy,
    order,
    debouncedSearch,
    bidangUsaha,
    enrichStatus,
    reachStatus,
    hasPhone,
    noPhone,
    hasWebsite,
    noWebsite,
    websiteCondition,
    hasEmail,
    hasPic,
    hasLinkedin,
    hasPrebuiltSiteFilter,
    hasSentOutreachFilter,
    onlyPersonalLeads,
    refreshCounter
  ]);

  // 4. Fetch Map Places only when map is visible (high-density point cloud for canvas rendering)
  useEffect(() => {
    if (!activeAnchor?.name || (!showMap && !isPickingMode)) return;

    let isMounted = true;
    const mapParams = new URLSearchParams({
      anchor: activeAnchor.name,
      max_distance: (radiusKm * 1000).toString(),
      map_points: 'true',
      map_limit: '1000'
    });

    if (debouncedSearch) mapParams.append('search', debouncedSearch);
    if (bidangUsaha !== 'all') mapParams.append('bidang_usaha', bidangUsaha);
    if (enrichStatus !== 'all') mapParams.append('enrich_status', enrichStatus);
    if (reachStatus !== 'all') mapParams.append('reach_status', reachStatus);
    if (hasPhone) mapParams.append('has_phone', 'true');
    if (noPhone) mapParams.append('no_phone', 'true');
    if (hasWebsite) mapParams.append('has_website', 'true');
    if (noWebsite) mapParams.append('no_website', 'true');
    if (hasEmail) mapParams.append('has_email', 'true');
    if (hasPic) mapParams.append('has_pic', 'true');
    if (hasLinkedin) mapParams.append('has_linkedin', 'true');
    if (refreshCounter > 0) mapParams.append('fresh', '1');

    fetch(`/api/places?${mapParams.toString()}`, refreshCounter > 0 ? { cache: 'no-store' } : undefined)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success) {
          setMapPlaces(data.places || []);
        }
      })
      .catch((err) => {
        console.error('Failed to load map points:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [
    activeAnchor?.name,
    showMap,
    isPickingMode,
    radiusKm,
    debouncedSearch,
    bidangUsaha,
    enrichStatus,
    reachStatus,
    hasPhone,
    noPhone,
    hasWebsite,
    hasEmail,
    hasPic,
    hasLinkedin,
    refreshCounter
  ]);

  // Stats for the active anchor and selected radius
  const activeStats = {
    total: liveStats?.total ?? (activeAnchor?.total_places ? Number(activeAnchor.total_places) : totalCount),
    with_phone: liveStats?.with_phone ?? (activeAnchor?.with_phone ? Number(activeAnchor.with_phone) : 0),
    with_website: liveStats?.with_website ?? (activeAnchor?.with_website ? Number(activeAnchor.with_website) : 0),
    with_email: liveStats?.with_email ?? (activeAnchor?.with_email ? Number(activeAnchor.with_email) : 0),
    analyzed_count: liveStats?.analyzed_count ?? 0,
    proposal_count: liveStats?.proposal_count ?? 0,
    sent_count: liveStats?.sent_count ?? 0,
    prebuilt_count: liveStats?.prebuilt_count ?? 0,
    global_sent_count: liveStats?.global_sent_count ?? liveStats?.sent_count ?? 0,
    global_prebuilt_count: liveStats?.global_prebuilt_count ?? liveStats?.prebuilt_count ?? 0,
    today_sent_count: liveStats?.today_sent_count ?? 0,
    today_prebuilt_count: liveStats?.today_prebuilt_count ?? 0,
    followed_up_count: liveStats?.followed_up_count ?? 0,
    unreplied_count: liveStats?.unreplied_count ?? 0,
    replied_count: liveStats?.replied_count ?? 0,
    lost_count: liveStats?.lost_count ?? 0,
    global_ooo_count: liveStats?.global_ooo_count ?? 0,
    deliverability_score: liveStats?.deliverability_score ?? 0,
    pcpl: liveStats?.pcpl ?? 0
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  const handleRefresh = () => {
    fetchAnchors();
    fetchCategoryOptions();
    fetchQuota();
    fetchSettings();
    setRefreshCounter((c) => c + 1);
  };

  // Reverse Geocoding: Automatically detect address and city when user clicks or drags marker
  const performReverseGeocode = async (lat, lng) => {
    if (reverseGeocodeRef.current) {
      reverseGeocodeRef.current.abort();
    }
    const controller = new AbortController();
    reverseGeocodeRef.current = controller;

    setIsReverseGeocoding(true);
    setCustomStatusMsg('Mendeteksi nama lokasi & wilayah...');

    try {
      const res = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`, {
        signal: controller.signal
      });
      const data = await res.json();
      if (data.success && data.place) {
        setCustomCandidate((prev) => ({
          ...prev,
          lat,
          lng,
          name: prev?.id ? prev.name : (data.place.name || prev?.name || 'Titik Terpilih'),
          city: data.place.city || prev?.city || 'Kota',
          address: data.place.address || ''
        }));
        setCustomStatusMsg(`Lokasi terdeteksi: ${data.place.name} (${data.place.city}). Sesuaikan detail atau simpan.`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Reverse geocoding error:', err.message);
        setCustomStatusMsg(`Pin terpilih di koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)}).`);
      }
    } finally {
      setIsReverseGeocoding(false);
    }
  };

  // Location Search Handler with debounce
  const handleGeoSearchChange = (query) => {
    setGeoSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query || query.trim().length < 2) {
      setGeoSearchResults([]);
      setGeoSearchOpen(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingGeo(true);
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (data.success && data.results) {
          setGeoSearchResults(data.results);
          setGeoSearchOpen(data.results.length > 0);
        }
      } catch (err) {
        console.warn('Geo search failed:', err.message);
      } finally {
        setIsSearchingGeo(false);
      }
    }, 350);
  };

  const handleSelectGeoResult = (item) => {
    setCustomCandidate((prev) => ({
      ...prev,
      lat: item.lat,
      lng: item.lng,
      name: prev?.id ? prev.name : item.name,
      city: item.city,
      address: item.address,
      radiusKm: prev?.radiusKm || 2
    }));
    setGeoSearchQuery(item.name);
    setGeoSearchOpen(false);
    setCustomStatusMsg(`Lokasi terpilih: ${item.name} (${item.city}). Siap disimpan.`);
  };

  // Toggle Create / Edit Location Picking Mode on the Map
  const handleTogglePickingMode = () => {
    if (isPickingMode) {
      setIsPickingMode(false);
      setCustomCandidate(null);
      setCustomStatusMsg(null);
      setGeoSearchQuery('');
      setGeoSearchResults([]);
      setGeoSearchOpen(false);
    } else {
      setIsPickingMode(true);
      const baseLat = activeAnchor ? Number(activeAnchor.lat) : -6.2256;
      const baseLng = activeAnchor ? Number(activeAnchor.lng) : 106.8041;
      const customCount = anchors.filter((a) => a.id.startsWith('custom_')).length + 1;
      setCustomCandidate({
        lat: baseLat,
        lng: baseLng,
        name: `Titik Kustom ${customCount}`,
        city: activeAnchor?.city || 'Jakarta',
        address: '',
        radiusKm: 2
      });
      setCustomStatusMsg('Ketik nama lokasi di bawah, klik sembarang titik di peta, atau geser pin.');
      performReverseGeocode(baseLat, baseLng);
    }
  };

  const handleStartEditAnchor = (anchorToEdit) => {
    if (!anchorToEdit) return;
    setActiveAnchorId(anchorToEdit.id);
    setRadiusKm(Number(anchorToEdit.radius_default_km) || 2);
    setIsPickingMode(true);
    setGeoSearchQuery('');
    setGeoSearchResults([]);
    setGeoSearchOpen(false);
    setCustomCandidate({
      id: anchorToEdit.id,
      originalName: anchorToEdit.name,
      lat: Number(anchorToEdit.lat) || -6.2256,
      lng: Number(anchorToEdit.lng) || 106.8041,
      name: anchorToEdit.name || '',
      city: anchorToEdit.city || '',
      address: anchorToEdit.address || '',
      radiusKm: Number(anchorToEdit.radius_default_km) || 2
    });
    setCustomStatusMsg(`Mengedit "${anchorToEdit.name}". Ubah form di bawah atau geser pin oranye di peta.`);
  };

  const handleMapClick = ({ lat, lng }) => {
    setCustomCandidate((prev) => ({
      ...prev,
      lat,
      lng
    }));
    performReverseGeocode(lat, lng);
  };

  const handleCandidateDragEnd = ({ lat, lng }) => {
    setCustomCandidate((prev) => ({
      ...prev,
      lat,
      lng
    }));
    performReverseGeocode(lat, lng);
  };

  const handleSaveAndScanCustomPoint = async (shouldScan = true) => {
    if (!customCandidate || !customCandidate.name.trim()) {
      alert('Mohon isi nama lokasi kantor terlebih dahulu.');
      return;
    }

    const isEdit = Boolean(customCandidate.id);
    setIsSavingCustomPoint(true);
    setCustomStatusMsg(isEdit ? 'Menyimpan perubahan lokasi kantor...' : 'Menyimpan titik lokasi ke sistem...');

    try {
      // 1. Create or Update Anchor in DB
      const saveRes = await fetch('/api/anchors', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: customCandidate.id } : {}),
          name: customCandidate.name.trim(),
          address: (customCandidate.address || '').trim() || `Koordinat (${Number(customCandidate.lat).toFixed(4)}, ${Number(customCandidate.lng).toFixed(4)})`,
          city: (customCandidate.city || '').trim() || 'Kustom',
          lat: customCandidate.lat,
          lng: customCandidate.lng,
          radius_default_km: customCandidate.radiusKm || 2
        })
      });

      const saveData = await saveRes.json();
      if (!saveData.success) {
        throw new Error(saveData.error || 'Gagal menyimpan lokasi.');
      }

      const savedAnchor = saveData.anchor;

      // 2. Refresh anchors and switch to saved anchor
      await fetchAnchors();
      setActiveAnchorId(savedAnchor.id);
      setRadiusKm(Number(savedAnchor.radius_default_km) || 2);
      setPage(1);

      // 3. Scan Places if requested
      if (shouldScan) {
        setCustomStatusMsg(`Sedang memindai tempat bisnis dalam radius ${savedAnchor.radius_default_km} km...`);
        const scanRes = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anchor: savedAnchor.name,
            radius_km: Number(savedAnchor.radius_default_km) || 2
          })
        });
        const scanData = await scanRes.json();
        if (!scanData.success) {
          throw new Error(scanData.error || 'Pemindaian lokasi gagal.');
        }
        alert(`Pemindaian selesai: ${scanData.totalDiscovered} tempat ditemukan (${scanData.totalSaved} tempat baru disimpan).`);
      }

      // 4. Exit picking mode and refresh dashboard
      setIsPickingMode(false);
      setCustomCandidate(null);
      setCustomStatusMsg(null);
      handleRefresh();
    } catch (err) {
      console.error('Office location save/scan error:', err);
      alert(`Terjadi kesalahan: ${err.message}`);
      setCustomStatusMsg(`Gagal: ${err.message}`);
    } finally {
      setIsSavingCustomPoint(false);
    }
  };

  const handleDeleteAnchor = async (anchorToDelete) => {
    if (anchors.length <= 1) {
      alert('Minimal harus ada 1 lokasi kantor aktif. Edit lokasi ini atau tambah lokasi baru sebelum menghapus.');
      return;
    }

    const confirmed = window.confirm(
      `Hapus lokasi "${anchorToDelete.name}" beserta seluruh data tempat dan riwayat pemindaiannya?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/anchors?id=${encodeURIComponent(anchorToDelete.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal menghapus lokasi.');
      }

      if (customCandidate?.id === anchorToDelete.id) {
        setIsPickingMode(false);
        setCustomCandidate(null);
        setCustomStatusMsg(null);
      }

      // If active anchor was deleted, switch to another remaining anchor
      if (activeAnchorId === anchorToDelete.id) {
        const fallback = anchors.find((a) => a.id !== anchorToDelete.id) || (currentSession?.isSuperadmin ? DEFAULT_ANCHORS[0] : null);
        if (fallback) {
          setActiveAnchorId(fallback.id);
          setRadiusKm(Number(fallback.radius_default_km) || 2);
        }
        setPage(1);
      }

      await fetchAnchors();
      handleRefresh();
    } catch (err) {
      console.error('Delete anchor error:', err);
      alert(`Gagal menghapus lokasi: ${err.message}`);
    }
  };

  return (
    <div className="container">
      {/* Modern Minimalist App Header */}
      <header className="prospekta-header">
        <div className="prospekta-header-inner">
          {/* Brand & RBAC Role Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ProspektaMark size={32} />
              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.025em' }}>
                Prospekta
              </span>
            </div>

            {/* RBAC Role Pill */}
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: '9999px',
                backgroundColor: currentSession?.isSuperadmin ? 'rgba(34, 197, 94, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                color: currentSession?.isSuperadmin ? '#16a34a' : '#0284c7',
                border: currentSession?.isSuperadmin ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(14, 165, 233, 0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: currentSession?.isSuperadmin ? '#16a34a' : '#0284c7' }} />
              <span>{currentSession?.isSuperadmin ? 'Admin' : (currentSession?.company_name || 'User Workspace')}</span>
            </span>

            {/* Sync Status Badge */}
            <button
              type="button"
              onClick={() => setActiveModal('sync_history')}
              className="sync-status-pill desktop-only-flex"
              title={tx('View sync history & AI limits', 'Lihat riwayat sinkronisasi & limit AI')}
              style={{ margin: 0 }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
              <span>Auto-sync</span>
              {quota && (
                <span style={{ opacity: 0.8 }}>
                  ({quota.counters?.llm || 0}/{quota.counters?.llmLimit || 50} AI)
                </span>
              )}
            </button>
          </div>

          {/* 4 Core Pillars Segment Navigation (Desktop) */}
          <nav className="prospekta-nav-segments desktop-only-flex" aria-label="Navigasi 4 Pilar Prospekta">
            <button
              type="button"
              className="prospekta-nav-item is-active"
              title={tx('Geospatial mapping and prospect radar', 'Pemetaan wilayah & radar prospek')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{tx('Locations & Radar', 'Lokasi & Radar')}</span>
            </button>

            <button
              type="button"
              className="prospekta-nav-item"
              onClick={() => {
                const el = document.getElementById('places-table-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              title={tx('Generate & export PDF proposals', 'Generate & ekspor proposal PDF')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              <span>{tx('PDF Proposals', 'Proposal PDF')}</span>
            </button>

            <button
              type="button"
              className="prospekta-nav-item"
              onClick={() => setActiveModal('prebuilt_sites')}
              title={tx('Directory of instant preview websites', 'Direktori website preview siap kirim')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span>{tx('Prebuilt Sites', 'Website')}</span>
            </button>

            <button
              type="button"
              className="prospekta-nav-item"
              onClick={() => setIsAiPanelOpen((v) => !v)}
              title={tx('Open Prospekta In-App AI Assistant', 'Buka Asisten AI Prospekta')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>{tx('AI Assistant', 'Asisten AI')}</span>
            </button>

            <button
              type="button"
              className="prospekta-nav-item"
              onClick={() => setActiveModal('mcp_plugin')}
              title={tx('AI API Key (BYOK) & Email Connector Settings', 'Pengaturan API Key AI (BYOK) & Konektor Email')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>{tx('AI Settings', 'Integrasi AI')}</span>
            </button>
          </nav>

          {/* Quick Mobile / Right Action Tray */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-icon-only"
              onClick={() => setActiveModal('mcp_plugin')}
              title="Pengaturan Integrasi AI (API Key)"
              aria-label="Integrasi AI"
              style={{ padding: '0.4rem', minHeight: '38px', minWidth: '38px' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-icon-only"
              onClick={() => setActiveModal('tenant_settings')}
              title={tx('Account & Integration Settings', 'Pengaturan Akun & Integrasi')}
              aria-label={tx('Account & Integration Settings', 'Pengaturan Akun & Integrasi')}
              style={{ padding: '0.4rem', minHeight: '38px', minWidth: '38px' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-icon-only theme-toggle-btn"
              onClick={handleToggleTheme}
              title={theme === 'dark' ? tx('Switch to Light Mode', 'Beralih ke Mode Terang') : tx('Switch to Dark Mode', 'Beralih ke Mode Gelap')}
              aria-label={theme === 'dark' ? tx('Switch to Light Mode', 'Beralih ke Mode Terang') : tx('Switch to Dark Mode', 'Beralih ke Mode Gelap')}
              style={{ padding: '0.4rem', minHeight: '38px', minWidth: '38px' }}
            >
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>

            <LanguageToggle isDark={theme === 'dark'} />

            <button
              type="button"
              className="btn btn-secondary btn-icon-only"
              onClick={() => setActiveModal('logout')}
              title={t('logout_btn')}
              aria-label={t('logout_btn')}
              style={{ padding: '0.4rem', minHeight: '38px', minWidth: '38px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Profil Bisnis & Basis Pengetahuan AI */}
      <section
        className="company-profile-summary-card"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '0.875rem 1.25rem',
          marginBottom: '1rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: isProfileSummaryExpanded ? '0.75rem' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '240px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {tx('AI Knowledge Base & Business Profile', 'Basis Pengetahuan AI & Profil Usaha')}
                </h2>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    color: 'var(--primary)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                  }}
                >
                  {tenantSettings?.company_name || currentSession?.company_name || 'Prospekta'}
                </span>
                {tenantSettings?.crawl_scope && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(22, 163, 74, 0.08)',
                      color: '#16a34a',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                    }}
                  >
                    Crawl: {tenantSettings.crawl_scope}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {tx('Context referenced by AI for drafting proposals, audits, and AI Assistant responses.', 'Acuan konteks yang dibaca AI untuk merancang proposal, audit web, dan respons AI Assistant.')}
              </p>
            </div>
          </div>

          <div className="company-profile-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsCrawlerOpen(true)}
              style={{
                fontSize: '0.75rem',
                minHeight: '36px',
                padding: '0 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                color: 'var(--primary)',
                fontWeight: 600,
              }}
              title="Buka perayap multi-domain untuk mengekstrak atau memperbarui profil website"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span>{tx('Crawler Website', 'Perayap Website')}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveModal('tenant_settings')}
              style={{ fontSize: '0.75rem', minHeight: '36px', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>{tx('Edit Profile', 'Edit Profil')}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setIsProfileSummaryExpanded(!isProfileSummaryExpanded)}
              style={{ fontSize: '0.75rem', minHeight: '36px', padding: '0 10px' }}
              title={isProfileSummaryExpanded ? 'Sembunyikan detail' : 'Tampilkan detail'}
            >
              {isProfileSummaryExpanded ? tx('Collapse', 'Ringkas') : tx('Details', 'Rinci')}
            </button>
          </div>
        </div>

        {isProfileSummaryExpanded && (() => {
          let parsedPdfs = [];
          try {
            const p = tenantSettings?.company_pdfs ? JSON.parse(tenantSettings.company_pdfs) : [];
            if (Array.isArray(p)) parsedPdfs = p;
          } catch (_) {}

          const renderFormattedOffering = (rawText) => {
            const raw = String(rawText || '').trim();
            if (!raw) return null;
            const hasNewlines = raw.includes('\n');
            const normalized = hasNewlines
              ? raw
              : raw
                  .replace(/(Layanan dan fokus solusi:|Portofolio[^:]*:|Kontak[^:]*:|Ringkasan Penawaran:)/gi, '\n\n$1\n')
                  .replace(/\.\s+(?=[A-Z])/g, '.\n\n');
            const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);

            const blocks = [];
            let currentList = null;
            lines.forEach((line) => {
              const bulletMatch = line.match(/^[-*\u2022]\s+(.*)$/);
              const numMatch = line.match(/^(\d+)[.)]\s+(.*)$/);
              if (bulletMatch) {
                if (!currentList || currentList.type !== 'ul') {
                  currentList = { type: 'ul', items: [] };
                  blocks.push(currentList);
                }
                currentList.items.push(bulletMatch[1]);
              } else if (numMatch) {
                if (!currentList || currentList.type !== 'ol') {
                  currentList = { type: 'ol', items: [] };
                  blocks.push(currentList);
                }
                currentList.items.push(numMatch[2]);
              } else {
                currentList = null;
                blocks.push({ type: line.endsWith(':') && line.length < 60 ? 'heading' : 'p', text: line });
              }
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--text-main)' }}>
                {blocks.map((b, idx) => {
                  if (b.type === 'ul') {
                    return (
                      <ul key={idx} style={{ margin: '2px 0', paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {b.items.map((it, i) => <li key={i}>{it}</li>)}
                      </ul>
                    );
                  }
                  if (b.type === 'ol') {
                    return (
                      <ol key={idx} style={{ margin: '2px 0', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {b.items.map((it, i) => <li key={i}>{it}</li>)}
                      </ol>
                    );
                  }
                  if (b.type === 'heading') {
                    return <div key={idx} style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: idx > 0 ? '4px' : 0 }}>{b.text}</div>;
                  }
                  return <p key={idx} style={{ margin: 0, color: 'var(--text-main)' }}>{b.text}</p>;
                })}
              </div>
            );
          };

          return (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                gap: '0.75rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.8125rem',
              }}
            >
              {/* Kolom Kiri: Produk & Solusi Utama Terstruktur */}
              <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.875rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                    <span>{tx('Core Product / Offering:', 'Produk & Solusi Utama:')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal('tenant_settings')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: '0.72rem', cursor: 'pointer', padding: '0 4px', fontWeight: 600 }}
                  >
                    {tx('Edit Text', 'Ubah Teks')}
                  </button>
                </div>
                <div style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                  {tenantSettings?.company_offering
                    ? renderFormattedOffering(tenantSettings.company_offering)
                    : (
                      <div style={{ color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.78rem' }}>
                        {tx('Not configured yet. AI will use general templates until offering details are provided.', 'Belum diisi. Klik "Edit Profil" atau "Perayap Website" agar AI dapat menuliskan proposal yang akurat.')}
                      </div>
                    )}
                </div>
              </div>

              {/* Kolom Kanan: Target, Website & Dokumen PDF */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span>{tx('Target Decision Makers:', 'Target Pengambil Keputusan:')}</span>
                  </div>
                  <div style={{ color: tenantSettings?.target_audience ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.78rem', marginBottom: '6px' }}>
                    {tenantSettings?.target_audience
                      ? tenantSettings.target_audience
                      : tx('Default: Business Owners, Managing Directors, Operations Heads.', 'Bawaan: Pemilik Usaha, Direktur Operasional, Manajer HRD / IT.')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span>Bahasa:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)', textTransform: 'capitalize' }}>
                      {tenantSettings?.email_language || 'Otomatis (ID/EN)'}
                    </span>
                    <span>&bull;</span>
                    <span>Radius Bawaan:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      {tenantSettings?.default_radius_km || 2} km
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '0.75rem' }}>
                  {/* Websites */}
                  <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        <span>{tx('Websites & Domains', 'Website & Domain')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCrawlerOpen(true)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: '0.7rem', cursor: 'pointer', minHeight: '30px', padding: '0 4px', fontWeight: 600 }}
                      >
                        + Kelola
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '72px', overflowY: 'auto' }}>
                      {(() => {
                        let parsed = [];
                        try {
                          parsed = tenantSettings?.company_urls ? JSON.parse(tenantSettings.company_urls) : [];
                        } catch (_) {}
                        if (!Array.isArray(parsed) || parsed.length === 0) {
                          return (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              <a href="https://prospekta.id" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-text)' }}>https://prospekta.id</a>
                            </div>
                          );
                        }
                        return parsed.map((item) => (
                          <div key={item.id || item.url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '0.72rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                            <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                              {item.url}
                            </a>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Company PDFs */}
                  <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>{tx('PDF Knowledge', 'Dokumen PDF')} ({parsedPdfs.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveModal('tenant_settings')}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-text)', fontSize: '0.7rem', cursor: 'pointer', minHeight: '30px', padding: '0 4px', fontWeight: 600 }}
                      >
                        + Tambah PDF
                      </button>
                    </div>
                    {parsedPdfs.length === 0 ? (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {tx('No company PDFs yet. Upload in Profile Settings.', 'Belum ada PDF. Unggah brosur/profil di Edit Profil.')}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '72px', overflowY: 'auto' }}>
                        {parsedPdfs.map((doc) => (
                          <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontSize: '0.72rem' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title || doc.name}</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>{doc.pages || 1} hal</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* Control Panel: Anchors, Radius & Map Toggle */}
      <section className="prospekta-control-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.875rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: 'min(100%, 320px)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', flexShrink: 0 }}>
            <IconMapPin />
            <span>{tx('Office Location:', 'Lokasi Kantor:')}</span>
          </div>

          <div className="prospekta-anchor-scroll" role="tablist" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {anchors.map((a) => (
              <div
                key={a.id}
                className={`tab-chip ${activeAnchorId === a.id ? 'active' : ''}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeAnchorId === a.id}
                  className="tab-chip-main"
                  onClick={() => {
                    setActiveAnchorId(a.id);
                    setRadiusKm(Number(a.radius_default_km) || 2);
                    setPage(1);
                  }}
                >
                  {a.name} ({a.city})
                </button>
                <button
                  type="button"
                  className="btn-tab-action"
                  title={tx('Edit location', 'Edit lokasi')}
                  onClick={() => handleStartEditAnchor(a)}
                  aria-label={`${tx('Edit location', 'Edit lokasi')} ${a.name}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="btn-tab-action btn-tab-delete"
                  disabled={anchors.length <= 1}
                  title={anchors.length <= 1
                    ? tx('At least 1 active location is required', 'Minimal harus ada 1 lokasi kantor aktif')
                    : tx('Delete location', 'Hapus lokasi ini')}
                  onClick={() => handleDeleteAnchor(a)}
                  aria-label={`${tx('Delete location', 'Hapus lokasi')} ${a.name}`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleTogglePickingMode}
              style={{
                minHeight: '36px',
                padding: '0 12px',
                fontSize: '0.8125rem',
                borderStyle: 'dashed',
                color: isPickingMode ? 'var(--primary)' : 'var(--text-main)',
                borderColor: isPickingMode ? 'var(--primary)' : 'var(--border-subtle)',
                whiteSpace: 'nowrap'
              }}
              title={tx('Add new office location on map', 'Tambah lokasi kantor baru di peta')}
            >
              {isPickingMode ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              )}
              <span>{isPickingMode ? tx('Cancel', 'Batal') : tx('Add Location', 'Tambah Lokasi')}</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {tx('Radius:', 'Radius:')}
            </span>
          </div>

          <div className="radius-pills" style={{ display: 'flex', gap: '4px' }}>
            {(isSingaporeAnchor
              ? [1, 2, 5, 10, 15, 20]
              : [1, 2, 5, 10].filter((r) => r <= maxScrapedRadius)
            ).map((r) => (
              <button
                key={r}
                type="button"
                className={`pill-btn ${radiusKm === r ? 'active' : ''}`}
                onClick={() => {
                  setRadiusKm(r);
                  setPage(1);
                }}
                title={tx(`Filter within ${r} km`, `Filter dalam radius ${r} km`)}
                style={{ minHeight: '36px', minWidth: '44px', padding: '0 8px', fontSize: '0.8125rem' }}
              >
                {r} km
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActiveModal('scan')}
            disabled={!activeAnchor}
            style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title={tx('Scan businesses around selected location', 'Pindai prospek bisnis di sekitar titik terpilih')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="3"/></svg>
            <span>{tx('Scan Area', 'Pindai Area')}</span>
          </button>

          <button
            type="button"
            className={`btn ${showMap ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={handleToggleMap}
            style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            title={tx('Show or hide the interactive map', 'Tampilkan atau sembunyikan peta interaktif')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
            <span>{showMap ? tx('Sembunyikan Peta', 'Sembunyikan Peta') : tx('Tampilkan Peta', 'Tampilkan Peta')}</span>
          </button>
        </div>
      </section>

      {/* Real Statistics Cards */}
      <StatsSection
        stats={activeStats}
        activeFilters={{
          hasWebsite,
          noWebsite,
          hasPhone,
          noPhone,
          reachStatus,
          hasSentOutreachFilter,
          hasPrebuiltSiteFilter,
          isAnyFilterActive: !!(
            search ||
            bidangUsaha !== 'all' ||
            reachStatus !== 'all' ||
            hasPhone ||
            noPhone ||
            hasWebsite ||
            noWebsite ||
            hasEmail ||
            hasPic ||
            hasLinkedin ||
            hasPrebuiltSiteFilter ||
            hasSentOutreachFilter ||
            onlyPersonalLeads
          )
        }}
        onOpenPrebuiltSites={() => setActiveModal('prebuilt_sites')}
        onOpenMcpModal={() => setActiveModal('mcp_plugin')}
        onFilterReplied={() => {
          setReachStatus((prev) => (prev === 'replied' ? 'all' : 'replied'));
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onFilterWebsite={() => {
          setHasWebsite((prev) => !prev);
          setNoWebsite(false);
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onFilterNoWebsite={() => {
          setNoWebsite((prev) => !prev);
          setHasWebsite(false);
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onFilterPhone={() => {
          setHasPhone((prev) => !prev);
          setNoPhone(false);
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onFilterNoPhone={() => {
          setNoPhone((prev) => !prev);
          setHasPhone(false);
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onFilterSentOutreach={() => {
          setHasSentOutreachFilter((prev) => !prev);
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onFilterPrebuiltSites={() => {
          setHasPrebuiltSiteFilter((prev) => !prev);
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onFilterStatus={(status) => {
          setReachStatus((prev) => (prev === status ? 'all' : status));
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
        onResetFilters={() => {
          setSearch('');
          setBidangUsaha('all');
          setReachStatus('all');
          setEnrichStatus('all');
          setHasPhone(false);
          setNoPhone(false);
          setHasWebsite(false);
          setNoWebsite(false);
          setHasEmail(false);
          setHasPic(false);
          setHasLinkedin(false);
          setHasPrebuiltSiteFilter(false);
          setHasSentOutreachFilter(false);
          setOnlyPersonalLeads(false);
          setPage(1);
          const tableEl = document.getElementById('places-table-section');
          if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* Custom Point Setup Panel (shown when user enters picking mode) */}
      {isPickingMode && (
        <section className="custom-point-card" style={{ marginBottom: '1.5rem' }}>
          {/* Card Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-flex', color: '#ea580c' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                </span>
                <strong style={{ fontSize: '1.0625rem', color: '#ea580c' }}>
                  {customCandidate?.id
                    ? tx(`Edit Office Location: ${customCandidate.originalName || customCandidate.name}`, `Edit Lokasi Kantor: ${customCandidate.originalName || customCandidate.name}`)
                    : tx('Create New Office Location & Scan Radius', 'Mode Buat Lokasi Baru & Pindai Radius')}
                </strong>
                {isReverseGeocoding && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.6875rem', color: '#ea580c', background: '#fff7ed', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fdba74' }}>
                    <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                    Mendeteksi...
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.8125rem', color: isReverseGeocoding ? '#ea580c' : 'var(--text-muted)', marginTop: '0.25rem' }}>
                {customStatusMsg || 'Ketik nama lokasi di bawah, klik lokasi mana saja pada peta, atau geser pin.'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTogglePickingMode}
              style={{ minHeight: '36px', padding: '0.25rem 0.75rem' }}
            >
              Tutup
            </button>
          </div>

          {customCandidate && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Row 1: Fast Location Search & Autocomplete */}
              <div style={{ position: 'relative' }}>
                <label className="control-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                  <span style={{ fontWeight: 700, color: '#ea580c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <IconSearch />
                    <span>Cari Lokasi, Gedung, atau Alamat Cepat:</span>
                  </span>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                    OpenStreetMap Geocoding
                  </span>
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ width: '100%', paddingLeft: '0.75rem', paddingRight: isSearchingGeo ? '2.5rem' : '1rem', borderColor: '#fdba74' }}
                    placeholder="Ketik lokasi sasaran (contoh: Marina Bay, Orchard, SCBD, Senayan, Tunjungan Plaza)..."
                    value={geoSearchQuery}
                    onChange={(e) => handleGeoSearchChange(e.target.value)}
                    onFocus={() => {
                      if (geoSearchResults.length > 0) setGeoSearchOpen(true);
                    }}
                    disabled={isSavingCustomPoint}
                  />
                  {isSearchingGeo && (
                    <span style={{ position: 'absolute', right: '0.75rem', display: 'flex' }}>
                      <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    </span>
                  )}
                </div>

                {/* Autocomplete Dropdown List */}
                {geoSearchOpen && geoSearchResults.length > 0 && (
                  <div className="geo-search-dropdown">
                    {geoSearchResults.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectGeoResult(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-subtle)',
                          fontSize: '0.8125rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-card-subtle)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <span style={{ color: '#ea580c', marginTop: '2px', display: 'inline-flex' }}>
                          <IconMapPin />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.name}</div>
                          <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.address}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Row 2: Coordinate & Address Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label className="control-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Nama Titik / Kantor:
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    style={{ width: '100%' }}
                    placeholder="Contoh: Kawasan SCBD, Headquarters Jakarta"
                    value={customCandidate.name}
                    onChange={(e) => setCustomCandidate({ ...customCandidate, name: e.target.value })}
                    disabled={isSavingCustomPoint}
                  />
                </div>

                <div>
                  <label className="control-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Kota / Daerah:
                  </label>
                  <input
                    type="text"
                    className="input-text"
                    style={{ width: '100%' }}
                    placeholder="Contoh: Jakarta Pusat, Surabaya"
                    value={customCandidate.city}
                    onChange={(e) => setCustomCandidate({ ...customCandidate, city: e.target.value })}
                    disabled={isSavingCustomPoint}
                  />
                </div>

                <div>
                  <label className="control-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Latitude:
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    className="input-text"
                    style={{ width: '100%' }}
                    value={customCandidate.lat}
                    onChange={(e) => setCustomCandidate({ ...customCandidate, lat: parseFloat(e.target.value) || 0 })}
                    disabled={isSavingCustomPoint}
                  />
                </div>

                <div>
                  <label className="control-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                    Longitude:
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    className="input-text"
                    style={{ width: '100%' }}
                    value={customCandidate.lng}
                    onChange={(e) => setCustomCandidate({ ...customCandidate, lng: parseFloat(e.target.value) || 0 })}
                    disabled={isSavingCustomPoint}
                  />
                </div>
              </div>

              <div>
                <label className="control-label" style={{ display: 'block', marginBottom: '0.25rem' }}>
                  Alamat Lengkap:
                </label>
                <input
                  type="text"
                  className="input-text"
                  style={{ width: '100%' }}
                  placeholder="Contoh: Jl. Jend. Sudirman Kav. 52-53, Senayan"
                  value={customCandidate.address || ''}
                  onChange={(e) => setCustomCandidate({ ...customCandidate, address: e.target.value })}
                  disabled={isSavingCustomPoint}
                />
              </div>

              {/* Row 3: Radius Selector & Center Info Pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <label className="control-label" style={{ display: 'block', marginBottom: '0.375rem' }}>
                    Radius Default Lokasi:
                  </label>
                  <div className="radius-pills">
                    {(isSuperadmin && ((customCandidate.city || '').toLowerCase().includes('singapore') || (customCandidate.name || '').toLowerCase().includes('singapore'))
                      ? [1, 2, 5, 10, 15, 20]
                      : [1, 2, 5, 10]
                    ).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`pill-btn ${customCandidate.radiusKm === r ? 'active' : ''}`}
                        onClick={() => setCustomCandidate({ ...customCandidate, radiusKm: r })}
                        disabled={isSavingCustomPoint}
                        title={`Radius ${r} km`}
                        style={{ minHeight: '36px', minWidth: '44px' }}
                      >
                        {r} km
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', padding: '0.375rem 0.625rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#ea580c', display: 'inline-flex' }}><IconMapPin /></span>
                  <span><strong>{tx('Active Point:', 'Titik Aktif:')}</strong> {customCandidate.name} ({Number(customCandidate.lat).toFixed(4)}, {Number(customCandidate.lng).toFixed(4)}) • <strong>{tx('Radius:', 'Radius:')}</strong> {customCandidate.radiusKm || 2} km</span>
                </div>
              </div>

              {/* Row 4: Action Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {tx('Tip: Click any point on the map or drag the orange pin to reposition the center.', 'Tip: Klik sembarang titik di peta atau geser pin oranye untuk memindahkan pusat area.')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleTogglePickingMode}
                    disabled={isSavingCustomPoint}
                  >
                    {tx('Cancel', 'Batal')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSaveAndScanCustomPoint(false)}
                    disabled={isSavingCustomPoint || !customCandidate.name.trim()}
                  >
                    {customCandidate.id
                      ? tx('Save Changes', 'Simpan Perubahan')
                      : tx('Save Without Scanning', 'Simpan Saja Tanpa Pindai')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleSaveAndScanCustomPoint(true)}
                    disabled={isSavingCustomPoint || !customCandidate.name.trim()}
                    style={{ backgroundColor: '#ea580c', borderColor: '#ea580c' }}
                  >
                    {isSavingCustomPoint ? (
                      <>
                        <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                        <span>{tx('Processing...', 'Memproses...')}</span>
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
                        <span>
                          {customCandidate.id
                            ? tx('Save & Re-scan Radius', 'Simpan & Pindai Ulang')
                            : tx('Save & Scan Radius Now', 'Simpan & Pindai Radius Sekarang')}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Map Overview (Collapsible on Mobile/Desktop) */}
      {(showMap || isPickingMode) && (
        <section style={{ marginBottom: '1.25rem' }}>
          <MapView 
            anchor={activeAnchor} 
            radiusKm={radiusKm} 
            places={mapPlaces} 
            totalCount={liveStats?.total || totalCount}
            isPickingMode={isPickingMode}
            onMapClick={handleMapClick}
            customCandidate={customCandidate}
            onCandidateDragEnd={handleCandidateDragEnd}
          />
        </section>
      )}

      {/* Prospekta Modern Filter & Action Command Bar */}
      <section className="prospekta-filter-strip">
        <div className="prospekta-filter-row">
          <div className="prospekta-search-wrap">
            <span className="prospekta-search-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="text"
              placeholder={tx('Search prospect name, address, or category...', 'Cari nama prospek, alamat, atau kategori...')}
              className="prospekta-search-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Cari Prospek"
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(1); }}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Hapus pencarian"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          <select
            className="select-input"
            value={bidangUsaha}
            onChange={(e) => {
              setBidangUsaha(e.target.value);
              setPage(1);
            }}
            style={{ minHeight: '42px', minWidth: '160px', flex: '0 1 auto', fontSize: '0.84rem' }}
            aria-label="Kategori Usaha"
          >
            <option value="all">{t('all_categories')}</option>
            {bidangOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <select
            className="select-input"
            value={websiteCondition}
            onChange={(e) => {
              setWebsiteCondition(e.target.value);
              setPage(1);
            }}
            aria-label="Filter Kondisi Website"
            style={{ minHeight: '42px', minWidth: '150px', flex: '0 1 auto', fontSize: '0.84rem', fontWeight: websiteCondition !== 'all' ? 600 : 400 }}
          >
            <option value="all">{lang === 'en' ? 'All Web Conditions' : 'Semua Kondisi Web'}</option>
            <option value="none">{lang === 'en' ? 'No Website' : 'Tanpa Website'}</option>
            <option value="outdated">{lang === 'en' ? 'Outdated Website' : 'Website Usang'}</option>
            <option value="modern">{lang === 'en' ? 'Modern Website' : 'Website Modern'}</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setActiveModal('add_lead')}
              style={{ minHeight: '42px', padding: '0 1rem', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 600 }}
              title={tx('Add new prospect directly to database', 'Tambah prospek baru langsung ke database aplikasi')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>{tx('Add Prospect', 'Input Prospek')}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActiveModal('export')}
              style={{ minHeight: '42px', padding: '0 0.875rem', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
              title={tx('Export data to CSV / JSON / Sheets', 'Ekspor data prospek ke format CSV / JSON')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>{tx('Export', 'Ekspor')}</span>
            </button>
          </div>
        </div>

        {/* Interactive Filter Chips Row (Touch-Friendly >= 44px on Mobile, Zero Emoji) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            className={`prospekta-chip ${hasWebsite ? 'is-active' : ''}`}
            onClick={() => {
              setHasWebsite(!hasWebsite);
              if (!hasWebsite) setNoWebsite(false);
              setPage(1);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>{tx('Has Website', 'Ada Website')}</span>
          </button>

          <button
            type="button"
            className={`prospekta-chip ${noWebsite ? 'is-active' : ''}`}
            onClick={() => {
              setNoWebsite(!noWebsite);
              if (!noWebsite) setHasWebsite(false);
              setPage(1);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>{tx('Needs Website', 'Butuh Website')}</span>
          </button>

          <button
            type="button"
            className={`prospekta-chip ${hasPrebuiltSiteFilter ? 'is-active' : ''}`}
            onClick={() => {
              setHasPrebuiltSiteFilter(!hasPrebuiltSiteFilter);
              setPage(1);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
            <span>{tx('Has Prebuilt', 'Ada Prebuilt Web')}</span>
          </button>

          <button
            type="button"
            className={`prospekta-chip ${hasPhone ? 'is-active' : ''}`}
            onClick={() => {
              setHasPhone(!hasPhone);
              if (!hasPhone) setNoPhone(false);
              setPage(1);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <span>{tx('Has Phone', 'Ada Telepon')}</span>
          </button>

          <button
            type="button"
            className={`prospekta-chip ${hasSentOutreachFilter ? 'is-active' : ''}`}
            onClick={() => {
              setHasSentOutreachFilter(!hasSentOutreachFilter);
              setPage(1);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>{tx('Has Proposal', 'Ada Proposal')}</span>
          </button>

          <button
            type="button"
            className="prospekta-chip"
            onClick={() => setActiveModal('mcp_plugin')}
            style={{ borderColor: 'var(--border-focus)', color: 'var(--accent-text)', fontWeight: 600 }}
            title={tx('Manage AI API Key (BYOK) & Email Connector', 'Kelola API Key AI (BYOK) & Konektor Email')}
          >
            <span>{tx('AI Key & Email', 'Integrasi AI & Email')}</span>
          </button>

          <button
            type="button"
            className="prospekta-chip"
            onClick={handleToggleMoreFilters}
            style={{ color: showMoreFilters ? 'var(--primary)' : 'var(--text-muted)' }}
          >
            <span>{showMoreFilters ? tx('Fewer Filters', 'Filter Ringkas') : tx('More Filters', 'Filter Lanjutan')}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: showMoreFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {showMoreFilters && (
            <>
              <button
                type="button"
                className={`prospekta-chip ${hasPic ? 'is-active' : ''}`}
                onClick={() => {
                  setHasPic(!hasPic);
                  setPage(1);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>{tx('Has Decision Maker', 'Ada PIC / Lead')}</span>
              </button>

              <button
                type="button"
                className={`prospekta-chip ${hasLinkedin ? 'is-active' : ''}`}
                onClick={() => {
                  setHasLinkedin(!hasLinkedin);
                  setPage(1);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                <span>{tx('Has LinkedIn', 'Ada LinkedIn')}</span>
              </button>

              <button
                type="button"
                className={`prospekta-chip ${onlyPersonalLeads ? 'is-active' : ''}`}
                onClick={() => {
                  setOnlyPersonalLeads(!onlyPersonalLeads);
                  setPage(1);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>{tx('Verified Leads', 'Lead Terverifikasi')}</span>
              </button>

              <button
                type="button"
                className={`prospekta-chip ${noPhone ? 'is-active' : ''}`}
                onClick={() => {
                  setNoPhone(!noPhone);
                  if (!noPhone) setHasPhone(false);
                  setPage(1);
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>
                <span>{tx('No Phone', 'Tanpa Telepon')}</span>
              </button>
            </>
          )}

          {(search || bidangUsaha !== 'all' || websiteCondition !== 'all' || hasWebsite || noWebsite || hasPhone || noPhone || hasPrebuiltSiteFilter || hasSentOutreachFilter || hasPic || hasLinkedin || onlyPersonalLeads) && (
            <button
              type="button"
              className="prospekta-chip"
              onClick={() => {
                setSearch('');
                setBidangUsaha('all');
                setWebsiteCondition('all');
                setHasWebsite(false);
                setNoWebsite(false);
                setHasPhone(false);
                setNoPhone(false);
                setHasPrebuiltSiteFilter(false);
                setHasSentOutreachFilter(false);
                setHasPic(false);
                setHasLinkedin(false);
                setOnlyPersonalLeads(false);
                setPage(1);
              }}
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              <span>{tx('Reset Filters', 'Reset Filter')}</span>
            </button>
          )}
        </div>

        {sheetSyncResult && (
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--success-text)',
            backgroundColor: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <IconCheck />
            <span>{sheetSyncResult}</span>
          </div>
        )}
      </section>

      {/* Places Data Table */}
      <section id="places-table-section" className="table-card">
        {/* Table Top Toolbar: Status Tabs & Table Actions (ALWAYS VISIBLE) */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
          {/* Quick Status Tabs (Pipeline Funnel Filter) */}
          <div
            className="pipeline-funnel-scroll"
            style={{
              display: 'flex',
              gap: '0.625rem',
              overflowX: 'auto',
              paddingBottom: '0.75rem',
              marginBottom: '0.875rem',
              borderBottom: '1px solid var(--border-subtle)',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none'
            }}
          >
            {[
              { key: 'all', label: t('tab_all_status') },
              { key: 'new', label: t('tab_new') },
              { key: 'analyzed', label: t('tab_analyzed') },
              { key: 'proposal_draft', label: t('tab_proposal') },
              { key: 'sent', label: t('tab_sent') },
              { key: 'replied', label: t('tab_replied') },
              { key: 'meeting', label: t('tab_meeting') },
              { key: 'won', label: t('tab_won') }
            ].map((tab) => {
              const isActive = reachStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setReachStatus(tab.key);
                    setPage(1);
                  }}
                  style={{
                    padding: '0.4375rem 0.875rem',
                    fontSize: '0.8125rem',
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? 'var(--primary)' : 'var(--bg-card)',
                    color: isActive ? '#ffffff' : 'var(--text-main)',
                    border: isActive ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease',
                    flexShrink: 0,
                    minHeight: '36px'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Table Header: Menampilkan X tempat & Tombol Salin TSV & Format Tampilan */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {lang === 'en' ? (
                <>Showing <strong>{places.length}</strong> businesses on this page {totalCount > 0 && `(of ${totalCount.toLocaleString(locale)} total)`}</>
              ) : (
                <>Menampilkan <strong>{places.length}</strong> bisnis di halaman ini {totalCount > 0 && `(dari total ${totalCount.toLocaleString(locale)})`}</>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleCopyTsv}
                disabled={places.length === 0}
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  minHeight: '36px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: tsvCopied ? 'var(--success-bg)' : 'var(--bg-card)',
                  color: tsvCopied ? 'var(--success-text)' : 'inherit',
                  borderColor: tsvCopied ? 'var(--success-border)' : 'var(--border-subtle)'
                }}
                title={lang === 'en' ? 'Copy all rows on this page in TSV format to paste directly into Google Sheets or Excel' : 'Salin semua baris di halaman ini ke format TSV untuk dipaste langsung di Google Sheets atau Excel'}
              >
                {tsvCopied ? (
                  <>
                    <IconCheck /> {lang === 'en' ? 'Copied for Sheets (Ctrl+V)' : 'Tersalin untuk Sheets (Ctrl+V)'}
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    {lang === 'en' ? 'Copy for Sheets' : 'Salin untuk Sheets'}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={places.length === 0}
                className="btn btn-secondary btn-sm"
                style={{
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  minHeight: '36px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-card)'
                }}
                title={lang === 'en' ? 'Download prospect data on this page to .csv file' : 'Unduh data prospek di halaman ini ke file .csv'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>{lang === 'en' ? 'Download CSV' : 'Unduh CSV'}</span>
              </button>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {lang === 'en' ? 'Sort:' : 'Urutkan:'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (sortBy === 'icp_score') {
                      setOrder(order === 'DESC' ? 'ASC' : 'DESC');
                    } else {
                      setSortBy('icp_score');
                      setOrder('DESC');
                    }
                  }}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: sortBy === 'icp_score' ? 700 : 500,
                    background: sortBy === 'icp_score' ? 'var(--primary)' : 'var(--bg-card)',
                    color: sortBy === 'icp_score' ? '#ffffff' : 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    minHeight: '34px'
                  }}
                  title={lang === 'en' ? 'Sort by AI Lead Score (Highest conversion potential first)' : 'Urutkan berdasarkan Skor AI Lead (Peluang konversi tertinggi)'}
                >
                  {lang === 'en' ? 'ICP Score' : 'Skor ICP'} {sortBy === 'icp_score' ? (order === 'DESC' ? ' (Desc)' : ' (Asc)') : ''}
                </button>
              </div>

              <div className="desktop-only-flex" style={{ alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>{lang === 'en' ? 'Columns:' : 'Kolom:'}</span>
                <div style={{ display: 'inline-flex', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setTableLayout('compact')}
                    style={{
                      padding: '4px 10px',
                      minHeight: '32px',
                      fontSize: '0.75rem',
                      fontWeight: tableLayout === 'compact' ? 600 : 400,
                      background: tableLayout === 'compact' ? 'var(--primary)' : 'transparent',
                      color: tableLayout === 'compact' ? '#ffffff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {lang === 'en' ? 'Compact' : 'Ringkas'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableLayout('split')}
                    style={{
                      padding: '4px 10px',
                      minHeight: '32px',
                      fontSize: '0.75rem',
                      fontWeight: tableLayout === 'split' ? 600 : 400,
                      background: tableLayout === 'split' ? 'var(--primary)' : 'transparent',
                      color: tableLayout === 'split' ? '#ffffff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {lang === 'en' ? 'Separated' : 'Terpisah'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section: Loading, Error, Empty State, or Table */}
        {loading ? (
          <div className="state-container" style={{ padding: '3.5rem 1.5rem' }}>
            <div className="spinner" />
            <div className="state-title">Memuat Data Prospek...</div>
            <div className="state-desc">Menyiapkan dan memfilter daftar perusahaan di area terpilih.</div>
          </div>
        ) : error ? (
          <div className="state-container" style={{ padding: '3rem 1.5rem' }}>
            <div className="state-title" style={{ color: 'var(--danger-text)' }}>Terjadi Kesalahan</div>
            <div className="state-desc">{error}</div>
            <button type="button" className="btn btn-secondary" onClick={handleRefresh}>
              Coba Lagi
            </button>
          </div>
        ) : places.length === 0 ? (
          <div className="state-container" style={{ padding: '3.5rem 1.5rem' }}>
            <div className="state-title">{lang === 'en' ? 'No Businesses Found' : 'Belum Ada Tempat Ditemukan'}</div>
            <div className="state-desc" style={{ maxWidth: '480px', margin: '0.5rem auto 1.25rem' }}>
              {reachStatus !== 'all'
                ? (lang === 'en'
                    ? `No prospect data found with status "${
                        [
                          { key: 'new', label: t('tab_new') },
                          { key: 'analyzed', label: t('tab_analyzed') },
                          { key: 'proposal_draft', label: t('tab_proposal') },
                          { key: 'sent', label: t('tab_sent') },
                          { key: 'replied', label: t('tab_replied') },
                          { key: 'meeting', label: t('tab_meeting') },
                          { key: 'won', label: t('tab_won') }
                        ].find((s) => s.key === reachStatus)?.label || reachStatus
                      }". Please select another status above or click below:`
                    : `Tidak ada data prospek dengan status "${
                        [
                          { key: 'new', label: 'Baru' },
                          { key: 'analyzed', label: 'Dianalisis' },
                          { key: 'proposal_draft', label: 'Draft Proposal' },
                          { key: 'sent', label: 'Terkirim' },
                          { key: 'replied', label: 'Dibalas' },
                          { key: 'meeting', label: 'Jadwal Meeting' },
                          { key: 'won', label: 'Kemitraan (Won)' }
                        ].find((s) => s.key === reachStatus)?.label || reachStatus
                      }". Silakan klik status lain di atas atau gunakan tombol di bawah:`)
                : search || bidangUsaha !== 'all' || hasPhone || hasWebsite || hasEmail
                ? (lang === 'en' ? 'No businesses match the current filter criteria.' : 'Tidak ada tempat yang cocok dengan kriteria filter aktif saat ini.')
                : (lang === 'en' ? 'No business records saved for this anchor yet. Click Scan Radius to acquire leads.' : 'Belum ada data tempat yang tersimpan untuk titik kantor ini. Klik tombol Tarik Data Bisnis untuk memulai.')}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {reachStatus !== 'all' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setReachStatus('all');
                    setPage(1);
                  }}
                  style={{ minHeight: '38px', padding: '0.5rem 1.25rem' }}
                >
                  {lang === 'en' ? 'Show All Statuses' : 'Tampilkan Semua Status'}
                </button>
              )}
              {(search || bidangUsaha !== 'all' || reachStatus !== 'all' || hasPhone || noPhone || hasWebsite || noWebsite || hasEmail || hasPic || hasLinkedin || hasPrebuiltSiteFilter || hasSentOutreachFilter || onlyPersonalLeads) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearch('');
                    setBidangUsaha('all');
                    setReachStatus('all');
                    setEnrichStatus('all');
                    setHasPhone(false);
                    setNoPhone(false);
                    setHasWebsite(false);
                    setNoWebsite(false);
                    setHasEmail(false);
                    setHasPic(false);
                    setHasLinkedin(false);
                    setHasPrebuiltSiteFilter(false);
                    setHasSentOutreachFilter(false);
                    setOnlyPersonalLeads(false);
                    setPage(1);
                  }}
                  style={{ minHeight: '38px', padding: '0.5rem 1.25rem' }}
                >
                  {lang === 'en' ? 'Reset All Filters' : 'Reset Semua Filter'}
                </button>
              )}
              {!(search || bidangUsaha !== 'all' || reachStatus !== 'all' || hasPhone || hasWebsite || hasEmail) && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveModal('scan')}
                  style={{ minHeight: '38px', padding: '0.5rem 1.25rem' }}
                >
                  {lang === 'en' ? 'Start Scanning Now' : 'Mulai Pindai Sekarang'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrapper desktop-table-view">
              <table>
                <thead>
                  <tr>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (sortBy === 'name') setOrder(order === 'ASC' ? 'DESC' : 'ASC');
                        else { setSortBy('name'); setOrder('ASC'); }
                      }}
                    >
                      {lang === 'en' ? 'Company Name' : 'Nama Perusahaan'} {sortBy === 'name' ? (order === 'ASC' ? ' (Asc)' : ' (Desc)') : ''}
                    </th>
                    <th
                      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                      onClick={() => {
                        if (sortBy === 'icp_score') setOrder(order === 'DESC' ? 'ASC' : 'DESC');
                        else { setSortBy('icp_score'); setOrder('DESC'); }
                      }}
                      title={lang === 'en' ? 'Click to sort by AI Lead ICP Score (0-100)' : 'Klik untuk mengurutkan berdasarkan Skor ICP AI (0-100)'}
                    >
                      {lang === 'en' ? 'ICP Score' : 'Skor ICP'} {sortBy === 'icp_score' ? (order === 'DESC' ? ' (Desc)' : ' (Asc)') : ''}
                    </th>
                    <th>{lang === 'en' ? 'Category' : 'Bidang Usaha'}</th>
                    <th
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (sortBy === 'distance_m') setOrder(order === 'ASC' ? 'DESC' : 'ASC');
                        else { setSortBy('distance_m'); setOrder('ASC'); }
                      }}
                    >
                      {lang === 'en' ? 'Distance' : 'Jarak'} {sortBy === 'distance_m' ? (order === 'ASC' ? ' (Asc)' : ' (Desc)') : ''}
                    </th>
                    {tableLayout === 'compact' ? (
                      <th>{lang === 'en' ? 'Contact' : 'Kontak'}</th>
                    ) : (
                      <>
                        <th>{lang === 'en' ? 'Phone' : 'Telepon'}</th>
                        <th>{lang === 'en' ? 'Email' : 'Email'}</th>
                        <th>Website &amp; LinkedIn</th>
                      </>
                    )}
                    <th>{lang === 'en' ? 'Outreach Status' : 'Status Outreach'}</th>
                    <th style={{ textAlign: 'center' }}>{lang === 'en' ? 'Outreach Action' : 'Aksi Penjangkauan'}</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((place) => {
                    return (
                      <tr key={place.overture_id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenReach(place)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontFamily: 'inherit'
                              }}
                              title="Klik untuk membuka panel riset & analisis"
                            >
                              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9375rem', color: 'var(--primary)', textDecoration: 'underline', textUnderlineOffset: '3px', lineHeight: 1.35 }}>
                                {place.name}
                              </span>
                            </button>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
                              {place.is_target_industry === 1 && (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: '0.6875rem',
                                    padding: '2px 7px',
                                    backgroundColor: 'rgba(16,185,129,0.12)',
                                    color: '#059669',
                                    border: '1px solid rgba(16,185,129,0.25)',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title={lang === 'en' ? 'Matches your selected target business sector' : 'Sesuai dengan bidang usaha target yang dipilih kantor Anda'}
                                >
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669', display: 'inline-block' }} />
                                  <span>{lang === 'en' ? 'Target Sector' : 'Target Utama'}</span>
                                </span>
                              )}
                              {place.is_personal_lead === 1 && (
                                <span className="badge badge-success" style={{ fontSize: '0.6875rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  Verified B2B Lead
                                </span>
                              )}
                              {(() => {
                                const score = getEffectiveIcpScore(place);
                                return (
                                  <span
                                    className={`badge ${score >= 70 ? 'badge-done' : score >= 45 ? 'badge-anchor' : 'badge-pending'}`}
                                    style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                                    title={`Skor Kelayakan Prospek: ${score}/100`}
                                  >
                                    ICP {score}
                                  </span>
                                );
                              })()}
                              {place.has_prebuilt_site === 1 && place.prebuilt_slug && (
                                <a
                                  href={`/p/${place.prebuilt_slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 600,
                                    color: 'var(--success-text)',
                                    backgroundColor: 'var(--success-bg)',
                                    border: '1px solid var(--success-border)',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    textDecoration: 'none'
                                  }}
                                  title="Lihat preview website prebuilt yang sudah di-generate untuk prospek ini"
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                  <span>Preview Web</span>
                                </a>
                              )}
                            </div>

                            {place.pic_name && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <span>PIC: {place.pic_name}{place.pic_title ? ` (${place.pic_title})` : ''}</span>
                              </div>
                            )}
                            {place.address && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45, maxWidth: '380px' }}>
                                {place.address}
                              </div>
                            )}
                            {place.problem_analysis && (
                              <div
                                style={{
                                  fontSize: '0.71875rem',
                                  color: 'var(--success-text)',
                                  backgroundColor: 'var(--success-bg)',
                                  border: '1px solid var(--success-border)',
                                  padding: '4px 8px',
                                  borderRadius: '5px',
                                  display: 'inline-block',
                                  maxWidth: '360px',
                                  lineHeight: 1.4
                                }}
                                title={place.problem_analysis}
                              >
                                <strong>Audit Sheet:</strong> {place.problem_analysis.length > 75 ? place.problem_analysis.slice(0, 75) + '...' : place.problem_analysis}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {(() => {
                            const score = getEffectiveIcpScore(place);
                            return (
                              <span
                                className={`badge ${score >= 70 ? 'badge-done' : score >= 45 ? 'badge-anchor' : 'badge-pending'}`}
                                style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px' }}
                                title={`Skor Kelayakan Prospek: ${score}/100\n• Alamat Email: ${place.email ? '+30' : '0'}\n• Nama PIC: ${place.pic_name ? '+25' : '0'}\n• Bidang Usaha: ${score >= 45 ? '+25' : '+15'}\n• Status Web: ${place.website ? '+10' : '+20'}`}
                              >
                                {score}
                              </span>
                            );
                          })()}
                        </td>
                        <td>
                          <span className="badge badge-anchor">
                            {place.bidang_usaha || 'Umum'}
                          </span>
                          {place.category_raw && (
                            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.35 }}>
                              {place.category_raw}
                            </div>
                          )}
                        </td>
                        <td>
                          <strong style={{ fontSize: '0.8125rem' }}>{place.distance_m} m</strong>
                        </td>
                        {tableLayout === 'compact' ? (
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4375rem', fontSize: '0.8125rem', lineHeight: 1.4 }}>
                              {place.phone && (() => {
                                const pInfo = getPhoneType(place.phone, lang);
                                const waUrl = pInfo.hasWhatsApp ? getWhatsAppUrl(place.phone, place.name, '', lang) : null;
                                return (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                    <a href={`tel:${place.phone}`} style={{ color: 'var(--success-text)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title={pInfo.label || (lang === 'en' ? "Phone" : "Telepon")}>
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                      {place.phone}
                                    </a>
                                    {pInfo.isLandline && <span style={{ fontSize: '0.625rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--bg-card-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>Fixed</span>}
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await copyToClipboard(place.phone);
                                        setCopiedPhone(place.phone);
                                        setTimeout(() => setCopiedPhone(null), 1800);
                                      }}
                                      title={lang === 'en' ? "Copy phone number" : "Salin nomor telepon"}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '1px 3px',
                                        cursor: 'pointer',
                                        color: copiedPhone === place.phone ? '#10b981' : 'var(--text-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center'
                                      }}
                                    >
                                      {copiedPhone === place.phone ? (
                                        <span style={{ fontSize: '0.625rem', color: '#10b981', fontWeight: 700 }}>{lang === 'en' ? 'Copied' : 'Tersalin'}</span>
                                      ) : (
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                      )}
                                    </button>
                                    {waUrl && (
                                      <a
                                        href={waUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title={lang === 'en' ? `Direct WhatsApp chat to ${place.name}` : `Chat WhatsApp langsung ke ${place.name}`}
                                        style={{
                                          fontSize: '0.625rem',
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                          background: '#dcfce7',
                                          color: '#15803d',
                                          border: '1px solid #bbf7d0',
                                          fontWeight: 800,
                                          textDecoration: 'none',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                          lineHeight: 1.2
                                        }}
                                      >
                                        <span>WA</span>
                                      </a>
                                    )}
                                  </div>
                                );
                              })()}
                              {place.phone_secondary && place.phone_secondary !== place.phone && (() => {
                                const p2Info = getPhoneType(place.phone_secondary, lang);
                                const wa2Url = p2Info.hasWhatsApp ? getWhatsAppUrl(place.phone_secondary, place.name, '', lang) : null;
                                return (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                    <a href={`tel:${place.phone_secondary}`} style={{ color: 'var(--success-text)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '0.625rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)' }}>Tel 2</span>
                                      {place.phone_secondary}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await copyToClipboard(place.phone_secondary);
                                        setCopiedPhone(place.phone_secondary);
                                        setTimeout(() => setCopiedPhone(null), 1800);
                                      }}
                                      title={lang === 'en' ? "Copy secondary phone number" : "Salin nomor telepon kedua"}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '1px 3px',
                                        cursor: 'pointer',
                                        color: copiedPhone === place.phone_secondary ? '#10b981' : 'var(--text-muted)',
                                        display: 'inline-flex',
                                        alignItems: 'center'
                                      }}
                                    >
                                      {copiedPhone === place.phone_secondary ? (
                                        <span style={{ fontSize: '0.625rem', color: '#10b981', fontWeight: 700 }}>{lang === 'en' ? 'Copied' : 'Tersalin'}</span>
                                      ) : (
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                      )}
                                    </button>
                                    {wa2Url && (
                                      <a
                                        href={wa2Url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        title={lang === 'en' ? `Direct WhatsApp chat to secondary phone ${place.name}` : `Chat WhatsApp ke nomor kedua ${place.name}`}
                                        style={{
                                          fontSize: '0.625rem',
                                          padding: '1px 5px',
                                          borderRadius: '3px',
                                          background: '#dcfce7',
                                          color: '#15803d',
                                          border: '1px solid #bbf7d0',
                                          fontWeight: 800,
                                          textDecoration: 'none',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px',
                                          lineHeight: 1.2
                                        }}
                                      >
                                        <span>WA</span>
                                      </a>
                                    )}
                                  </div>
                                );
                              })()}
                              {place.whatsapp && place.whatsapp !== place.phone && place.whatsapp !== place.phone_secondary && (() => {
                                const waInfo = getPhoneType(place.whatsapp);
                                if (waInfo.isLandline) return null;
                                return (
                                  <a href={`https://wa.me/${place.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--success-text)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontSize: '0.625rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)' }}>WA</span>
                                    {place.whatsapp}
                                  </a>
                                );
                              })()}
                              {place.email && (
                                <a href={`mailto:${place.email}`} style={{ color: 'var(--primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                  {place.email}
                                </a>
                              )}
                              {place.pic_linkedin_url && (
                                <a
                                  href={place.pic_linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
                                  LinkedIn PIC
                                </a>
                              )}
                              {place.linkedin_url && !place.pic_linkedin_url && (
                                <a
                                  href={place.linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
                                  LinkedIn
                                </a>
                              )}
                              {place.website ? (
                                <a
                                  href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="table-link"
                                  style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                  {place.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 24)}
                                </a>
                              ) : null}
                              {place.social_media && (
                                <a
                                  href={place.social_media.startsWith('http') ? place.social_media : `https://${place.social_media}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--text-main)', textDecoration: 'none', fontWeight: 600, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                  title="Buka Instagram Resmi"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                                  Instagram
                                </a>
                              )}
                              {!place.website && !place.phone && !place.email && !place.linkedin_url && !place.social_media && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Belum ada kontak</span>
                              )}
                            </div>
                          </td>
                        ) : (
                          <>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {place.phone ? (() => {
                                  const pInfo = getPhoneType(place.phone, lang);
                                  const waUrl = pInfo.hasWhatsApp ? getWhatsAppUrl(place.phone, place.name, '', lang) : null;
                                  return (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                      <a href={`tel:${place.phone}`} style={{ color: 'var(--success-text)', textDecoration: 'none', fontWeight: 600, fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={pInfo.label || (lang === 'en' ? "Primary Phone" : "Telepon Utama")}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                        {place.phone}
                                      </a>
                                      {pInfo.isLandline && <span style={{ fontSize: '0.625rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--bg-card-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>Fixed</span>}
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          await copyToClipboard(place.phone);
                                          setCopiedPhone(place.phone);
                                          setTimeout(() => setCopiedPhone(null), 1800);
                                        }}
                                        title={lang === 'en' ? "Copy phone number" : "Salin nomor telepon"}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          padding: '1px 3px',
                                          cursor: 'pointer',
                                          color: copiedPhone === place.phone ? '#10b981' : 'var(--text-muted)',
                                          display: 'inline-flex',
                                          alignItems: 'center'
                                        }}
                                      >
                                        {copiedPhone === place.phone ? (
                                          <span style={{ fontSize: '0.625rem', color: '#10b981', fontWeight: 700 }}>{lang === 'en' ? 'Copied' : 'Tersalin'}</span>
                                        ) : (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        )}
                                      </button>
                                      {waUrl && (
                                        <a
                                          href={waUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          title={lang === 'en' ? `Direct WhatsApp chat to ${place.name}` : `Chat WhatsApp langsung ke ${place.name}`}
                                          style={{
                                            fontSize: '0.625rem',
                                            padding: '1px 5px',
                                            borderRadius: '3px',
                                            background: '#dcfce7',
                                            color: '#15803d',
                                            border: '1px solid #bbf7d0',
                                            fontWeight: 800,
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px',
                                            lineHeight: 1.2
                                          }}
                                        >
                                          <span>WA</span>
                                        </a>
                                      )}
                                    </div>
                                  );
                                })() : null}
                                {place.phone_secondary && place.phone_secondary !== place.phone && (() => {
                                  const p2Info = getPhoneType(place.phone_secondary, lang);
                                  const wa2Url = p2Info.hasWhatsApp ? getWhatsAppUrl(place.phone_secondary, place.name, '', lang) : null;
                                  return (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                      <a href={`tel:${place.phone_secondary}`} style={{ color: 'var(--success-text)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={lang === 'en' ? "Secondary Phone" : "Telepon Tambahan"}>
                                        <span style={{ fontSize: '0.625rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)' }}>Tel 2</span>
                                        {place.phone_secondary}
                                      </a>
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          await copyToClipboard(place.phone_secondary);
                                          setCopiedPhone(place.phone_secondary);
                                          setTimeout(() => setCopiedPhone(null), 1800);
                                        }}
                                        title={lang === 'en' ? "Copy secondary phone number" : "Salin nomor telepon kedua"}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          padding: '1px 3px',
                                          cursor: 'pointer',
                                          color: copiedPhone === place.phone_secondary ? '#10b981' : 'var(--text-muted)',
                                          display: 'inline-flex',
                                          alignItems: 'center'
                                        }}
                                      >
                                        {copiedPhone === place.phone_secondary ? (
                                          <span style={{ fontSize: '0.625rem', color: '#10b981', fontWeight: 700 }}>{lang === 'en' ? 'Copied' : 'Tersalin'}</span>
                                        ) : (
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        )}
                                      </button>
                                      {wa2Url && (
                                        <a
                                          href={wa2Url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          title={lang === 'en' ? `Direct WhatsApp chat to secondary phone ${place.name}` : `Chat WhatsApp ke nomor kedua ${place.name}`}
                                          style={{
                                            fontSize: '0.625rem',
                                            padding: '1px 5px',
                                            borderRadius: '3px',
                                            background: '#dcfce7',
                                            color: '#15803d',
                                            border: '1px solid #bbf7d0',
                                            fontWeight: 800,
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '2px',
                                            lineHeight: 1.2
                                          }}
                                        >
                                          <span>WA</span>
                                        </a>
                                      )}
                                    </div>
                                  );
                                })()}
                                {place.whatsapp && place.whatsapp !== place.phone && place.whatsapp !== place.phone_secondary && (() => {
                                  const waInfo = getPhoneType(place.whatsapp, lang);
                                  if (waInfo.isLandline) return null;
                                  const waDirectUrl = getWhatsAppUrl(place.whatsapp, place.name, '', lang);
                                  return (
                                    <a href={waDirectUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--success-text)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }} title={lang === 'en' ? `Direct WhatsApp chat to ${place.name}` : `Chat WhatsApp langsung ke ${place.name}`}>
                                      <span style={{ fontSize: '0.625rem', padding: '1px 4px', borderRadius: '3px', background: 'var(--success-bg)', color: 'var(--success-text)', border: '1px solid var(--success-border)' }}>WA</span>
                                      {place.whatsapp}
                                    </a>
                                  );
                                })()}
                                {!place.phone && !place.phone_secondary && !place.whatsapp && (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </div>
                            </td>
                            <td>
                              {place.email ? (
                                <a href={`mailto:${place.email}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                  {place.email}
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>-</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem' }}>
                                {place.website && (
                                  <a
                                    href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="table-link"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                    {place.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 22)}
                                  </a>
                                )}
                                {place.pic_linkedin_url && (
                                  <a
                                    href={place.pic_linkedin_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
                                    LinkedIn PIC
                                  </a>
                                )}
                                {place.linkedin_url && (
                                  <a
                                    href={place.linkedin_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
                                    LinkedIn Perusahaan
                                  </a>
                                )}
                                {!place.website && !place.linkedin_url && !place.pic_linkedin_url && (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                            <span className={`badge ${
                              place.reach_status === 'won' || place.reach_status === 'replied'
                                ? 'badge-done'
                                : place.reach_status === 'sent'
                                ? 'badge-anchor'
                                : place.reach_status === 'analyzed' || place.reach_status === 'proposal_draft'
                                ? 'badge-accent'
                                : 'badge-pending'
                            }`}>
                              {place.reach_status === 'analyzed'
                                ? 'Dianalisis'
                                : place.reach_status === 'proposal_draft'
                                ? 'Draft Proposal'
                                : place.reach_status === 'sent'
                                ? `Terkirim${place.outreach_count > 1 ? ` (${place.outreach_count}x)` : ''}`
                                : place.reach_status === 'replied'
                                ? 'Dibalas'
                                : place.reach_status === 'meeting'
                                ? 'Jadwal Meeting'
                                : place.reach_status === 'won'
                                ? 'Kemitraan (Won)'
                                : place.reach_status === 'lost'
                                ? 'Belum Sesuai'
                                : 'Baru'}
                            </span>
                            {place.last_outreach_at && (
                              <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                                {new Date(place.last_outreach_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                          {place.reach_status === 'sent' && (() => {
                            const rawDate = place.last_outreach_at || place.lead_verified_at;
                            const outreachDate = rawDate ? new Date(rawDate).getTime() : 0;
                            const daysDiff = outreachDate > 0 ? (Date.now() - outreachDate) / (1000 * 60 * 60 * 24) : 0;
                            if (daysDiff >= 3) {
                              return (
                                <div style={{ marginTop: '4px' }}>
                                  <span
                                    className="badge"
                                    style={{
                                      backgroundColor: 'var(--warning-bg)',
                                      color: 'var(--warning-text)',
                                      border: '1px solid var(--warning-border)',
                                      fontSize: '0.625rem',
                                      padding: '2px 6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      fontWeight: 600
                                    }}
                                    title={`Email telah terkirim ${Math.floor(daysDiff)} hari lalu dan belum ada respons.`}
                                  >
                                    <IconAlertTriangle />
                                    <span>Follow-up ({Math.floor(daysDiff)}h)</span>
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-open-reach"
                            onClick={() => handleOpenReach(place)}
                            aria-label={`Buka Riset dan Buat Proposal untuk ${place.name}`}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            Riset & Proposal
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Prospect Cards (Reflowed <= 768px) */}
            <div className="mobile-places-cards">
              {places.map((place) => {
                const statusLabel =
                  place.reach_status === 'analyzed'
                    ? 'Dianalisis'
                    : place.reach_status === 'proposal_draft'
                    ? 'Draft Proposal'
                    : place.reach_status === 'sent'
                    ? `Terkirim${place.outreach_count > 1 ? ` (${place.outreach_count}x)` : ''}`
                    : place.reach_status === 'replied'
                    ? 'Dibalas'
                    : place.reach_status === 'meeting'
                    ? 'Jadwal Meeting'
                    : place.reach_status === 'won'
                    ? 'Kemitraan (Won)'
                    : place.reach_status === 'lost'
                    ? 'Belum Sesuai'
                    : 'Baru';

                const statusBadgeClass =
                  place.reach_status === 'won' || place.reach_status === 'replied'
                    ? 'badge-done'
                    : place.reach_status === 'sent'
                    ? 'badge-anchor'
                    : place.reach_status === 'analyzed' || place.reach_status === 'proposal_draft'
                    ? 'badge-accent'
                    : 'badge-pending';

                return (
                  <article key={`mob-${place.overture_id}`} className="place-mobile-card">
                    <div className="place-mobile-card-top">
                      <button
                        type="button"
                        onClick={() => handleOpenReach(place)}
                        className="place-mobile-title-btn"
                      >
                        {place.name}
                      </button>
                      <span className={`badge ${statusBadgeClass}`} style={{ flexShrink: 0 }}>
                        {statusLabel}
                      </span>
                    </div>

                    <div className="place-mobile-meta">
                      {place.is_target_industry === 1 && (
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.6875rem',
                            padding: '2px 7px',
                            backgroundColor: 'rgba(16,185,129,0.12)',
                            color: '#059669',
                            border: '1px solid rgba(16,185,129,0.25)',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669', display: 'inline-block' }} />
                          <span>Target Utama</span>
                        </span>
                      )}
                      {place.is_personal_lead === 1 && (
                        <span className="badge badge-success" style={{ fontSize: '0.6875rem' }}>
                          Verified B2B Lead
                        </span>
                      )}
                      {(() => {
                        const score = getEffectiveIcpScore(place);
                        return (
                          <span
                            className={`badge ${score >= 70 ? 'badge-done' : score >= 45 ? 'badge-anchor' : 'badge-pending'}`}
                            style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                            title={`Skor Kelayakan Prospek: ${score}/100`}
                          >
                            ICP {score}
                          </span>
                        );
                      })()}
                      <span className="badge badge-anchor">{place.bidang_usaha || 'Umum'}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        {place.distance_m} m
                      </span>
                      {place.has_prebuilt_site === 1 && place.prebuilt_slug && (
                        <a
                          href={`/p/${place.prebuilt_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="badge badge-done"
                          style={{ textDecoration: 'none' }}
                        >
                          Preview Web
                        </a>
                      )}
                    </div>

                    {place.address && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {place.address}
                      </div>
                    )}

                    {(place.email || place.phone || place.website || place.pic_name) && (
                      <div className="place-mobile-contacts">
                        {place.pic_name && (
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            PIC: {place.pic_name}{place.pic_title ? ` (${place.pic_title})` : ''}
                          </div>
                        )}
                        {place.email && (
                          <a href={`mailto:${place.email}`} style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', wordBreak: 'break-all' }}>
                            {place.email}
                          </a>
                        )}
                        {place.phone && (
                          <a href={`tel:${place.phone}`} style={{ fontSize: '0.75rem', color: 'var(--success-text)', fontWeight: 600, textDecoration: 'none' }}>
                            {place.phone}
                          </a>
                        )}
                        {place.website && (
                          <a
                            href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', wordBreak: 'break-all' }}
                          >
                            {place.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 32)}
                          </a>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn-open-reach"
                      onClick={() => handleOpenReach(place)}
                      style={{ width: '100%', justifyContent: 'center', minHeight: '44px' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      <span>Riset & Proposal</span>
                    </button>
                  </article>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="pagination">
              <div>
                Menampilkan {places.length} dari {totalCount.toLocaleString('id-ID')} tempat (Halaman {page} dari {totalPages})
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ minHeight: '40px', padding: '0.375rem 0.875rem' }}
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  style={{ minHeight: '40px', padding: '0.375rem 0.875rem' }}
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Prospekta Research & Proposal Modal */}
      {selectedReachPlace && (
        <ReachModal
          place={selectedReachPlace}
          currentSession={currentSession}
          onClose={() => {
            setSelectedReachPlace(null);
            fetchQuota();
            handleRefresh();
          }}
          onUpdatePlace={(updatedPlace) => {
            setPlaces((prev) =>
              prev.map((p) => (p.overture_id === updatedPlace.overture_id ? updatedPlace : p))
            );
            fetchQuota();
            handleRefresh();
          }}
        />
      )}

      {/* Legacy Atlas Modals */}
      {activeModal === 'scan' && (
        <ScanModal
          anchors={anchors}
          activeAnchor={activeAnchor}
          initialRadius={radiusKm}
          onClose={() => setActiveModal(null)}
          onScanComplete={(scanData) => {
            if (scanData?.anchor) {
              const matched = anchors.find((a) => a.name === scanData.anchor);
              if (matched) setActiveAnchorId(matched.id);
            }
            if (scanData?.radiusKm) {
              hasInitRadiusRef.current = true;
              setRadiusKm(Number(scanData.radiusKm));
            }
            setPage(1);
            handleRefresh();
          }}
        />
      )}

      {activeModal === 'enrich' && (
        <EnrichModal
          activeAnchor={activeAnchor}
          onClose={() => setActiveModal(null)}
          onEnrichComplete={handleRefresh}
        />
      )}

      {activeModal === 'export' && (
        <ExportModal
          anchors={anchors}
          activeAnchor={activeAnchor}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'import' && (
        <ImportModal
          onClose={() => setActiveModal(null)}
          onImportComplete={handleRefresh}
        />
      )}

      {activeModal === 'categories' && (
        <CategoryRulesModal
          onClose={() => setActiveModal(null)}
          onRulesChanged={handleRefresh}
        />
      )}

      {activeModal === 'sync_history' && (
        <SyncNotificationModal
          onClose={() => setActiveModal(null)}
          onSelectAnchor={(anchorId) => {
            if (anchorId) {
              setActiveAnchorId(anchorId);
              setPage(1);
            }
            setActiveModal(null);
          }}
        />
      )}

      {activeModal === 'sheet_sync' && (
        <GoogleSheetSyncModal
          onClose={() => setActiveModal(null)}
          onSyncSuccess={() => {
            handleRefresh();
          }}
        />
      )}

      {activeModal === 'add_lead' && (
        <AddLeadModal
          currentSession={currentSession}
          activeAnchor={activeAnchor}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            handleRefresh();
          }}
        />
      )}

      {activeModal === 'prebuilt_sites' && (
        <PrebuiltSitesModal
          onClose={() => setActiveModal(null)}
          onOpenPlace={(place) => handleOpenReach(place)}
          initialTotal={activeStats.global_prebuilt_count}
        />
      )}

      {activeModal === 'mcp_plugin' && (
        <McpPluginModal
          currentSession={currentSession}
          onKeysChanged={() => setAiKeysRefreshKey((k) => k + 1)}
          onClose={() => setActiveModal(null)}
        />
      )}

      <AiAssistantPanel
        activeAnchor={activeAnchor}
        radiusKm={radiusKm}
        refreshKey={aiKeysRefreshKey}
        isOpen={isAiPanelOpen}
        onToggleOpen={setIsAiPanelOpen}
        onOpenAiSettings={() => setActiveModal('mcp_plugin')}
        onDataChanged={handleRefresh}
        onUiAction={async (action) => {
          if (!action) return;
          if (action.type === 'select_anchor') {
            await fetchAnchors();
            if (action.anchorId) setActiveAnchorId(action.anchorId);
            if (action.radiusKm) {
              hasInitRadiusRef.current = true;
              setRadiusKm(Number(action.radiusKm));
            }
            setPage(1);
            handleRefresh();
          } else if (action.type === 'apply_filter') {
            const f = action.filters || {};
            if (f.resetFilters) {
              setSearch('');
              setBidangUsaha('all');
              setReachStatus('all');
              setNoWebsite(false);
              setHasWebsite(false);
              setHasPhone(false);
              setHasEmail(false);
            }
            if (f.anchorName) {
              const matched = anchors.find((a) => a.name.toLowerCase().includes(String(f.anchorName).toLowerCase()));
              if (matched) setActiveAnchorId(matched.id);
            }
            if (f.radiusKm) {
              hasInitRadiusRef.current = true;
              setRadiusKm(Number(f.radiusKm));
            }
            if (f.searchQuery !== undefined) setSearch(String(f.searchQuery || ''));
            if (f.reachStatus) setReachStatus(f.reachStatus);
            if (typeof f.noWebsite === 'boolean') {
              setNoWebsite(f.noWebsite);
              if (f.noWebsite) setHasWebsite(false);
            }
            if (typeof f.hasWebsite === 'boolean') {
              setHasWebsite(f.hasWebsite);
              if (f.hasWebsite) setNoWebsite(false);
            }
            if (typeof f.hasPhone === 'boolean') setHasPhone(f.hasPhone);
            if (typeof f.hasEmail === 'boolean') setHasEmail(f.hasEmail);
            setPage(1);
            const tableEl = document.getElementById('places-table-section');
            if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
          } else if (action.type === 'open_place' && action.place) {
            handleOpenReach(action.place);
          } else if (action.type === 'open_place_by_id' && action.placeId) {
            const local = places.find((p) => p.overture_id === action.placeId) || mapPlaces.find((p) => p.overture_id === action.placeId);
            if (local) {
              handleOpenReach(local);
            } else {
              try {
                const res = await fetch(`/api/reach/contact?placeId=${encodeURIComponent(action.placeId)}`);
                const d = await res.json();
                if (d.success && d.place) handleOpenReach(d.place);
              } catch (_) {}
            }
          }
        }}
      />

      {activeModal === 'token_usage' && (
        <TokenUsageModal
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'quick_client' && (
        <QuickClientModal
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            fetchAnchors();
          }}
        />
      )}

      {activeModal === 'tenant_settings' && (
        <TenantSettingsModal
          companyName={currentSession?.company_name}
          tenantId={currentSession?.tid}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            fetchAnchors();
            handleRefresh();
          }}
        />
      )}

      {isCrawlerOpen && (
        <CompanyCrawlerModal
          isOpen={isCrawlerOpen}
          onClose={() => setIsCrawlerOpen(false)}
          onApplyToProfile={(summary, updatedUrls) => {
            setTenantSettings((prev) => ({
              ...prev,
              company_offering: prev?.company_offering ? `${prev.company_offering}\n\n${summary}` : summary,
              company_urls: updatedUrls ? JSON.stringify(updatedUrls) : prev?.company_urls,
            }));
            fetchSettings();
          }}
          onSaveUrls={(updatedUrls) => {
            setTenantSettings((prev) => ({
              ...prev,
              company_urls: JSON.stringify(updatedUrls),
            }));
            fetchSettings();
          }}
          defaultUrl={currentSession?.tid ? (tenantSettings?.company_website || '') : 'https://prospekta.id'}
          initialUrls={(() => {
            try {
              return tenantSettings?.company_urls ? JSON.parse(tenantSettings.company_urls) : null;
            } catch {
              return null;
            }
          })()}
          initialScope={tenantSettings?.crawl_scope || 'subdomain'}
          initialAllowedDomains={tenantSettings?.crawl_domains || ''}
          tenantId={currentSession?.tid}
        />
      )}

      {activeModal === 'logout' && (
        <LogoutModal
          onClose={() => setActiveModal(null)}
          onConfirm={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
          }}
        />
      )}

      {/* Prospekta Mobile Bottom Thumb Navigation (12 UI/UX Rules: >= 44px tap targets) */}
      <nav className="prospekta-mobile-bottom-bar" aria-label="Mobile Navigation">
        <button
          type="button"
          className="prospekta-mobile-tab-btn"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <span>{tx('Location', 'Lokasi')}</span>
        </button>

        <button
          type="button"
          className={`prospekta-mobile-tab-btn ${showMap ? 'is-active' : ''}`}
          onClick={handleToggleMap}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
          </svg>
          <span>{tx('Map', 'Peta')}</span>
        </button>

        <button
          type="button"
          className="prospekta-mobile-tab-btn"
          onClick={() => {
            setReachStatus('proposal_draft');
            setPage(1);
            const tableEl = document.getElementById('places-table-section');
            if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>{tx('Proposal', 'Proposal')}</span>
        </button>

        <button
          type="button"
          className={`prospekta-mobile-tab-btn ${isAiPanelOpen ? 'is-active' : ''}`}
          onClick={() => setIsAiPanelOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>{tx('AI Chat', 'Asisten AI')}</span>
        </button>

        <button
          type="button"
          className="prospekta-mobile-tab-btn"
          onClick={() => setActiveModal('tenant_settings')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>{tx('Settings', 'Akun')}</span>
        </button>
      </nav>
    </div>
  );
}
