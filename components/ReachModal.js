'use client';

import { useState, useEffect } from 'react';
const BUDGET_OPTIONS = [
  { value: 'low', label: 'Rendah / Terbatas' },
  { value: 'medium', label: 'Menengah (Standar)' },
  { value: 'high', label: 'Tinggi (Enterprise)' }
];
const WEBSITE_OPTIONS = [
  { value: 'none', label: 'Belum Ada Website' },
  { value: 'outdated', label: 'Perlu Penyegaran' },
  { value: 'modern', label: 'Modern & Aktif' }
];
const SOCIAL_OPTIONS = [
  { value: 'inactive', label: 'Medsos Tidak Aktif' },
  { value: 'active', label: 'Medsos Aktif' }
];
const OFFER_ANGLES = [
  { value: 'digital_structure', label: 'Website & Digital Structure' },
  { value: 'agentic_ai', label: 'AI Agent & Automation' }
];
const SG_PICS = [];
const buildSgExecutiveEmail = ({
  companyName = '',
  dmName = '',
  location = '',
  lang = 'id',
  senderName = 'Tim Bisnis',
  senderCompany = 'Prospekta',
  companyOffering = '',
  previewUrl = '',
  includePreviewLink = false,
  customCta = '',
  manualSubjectTemplate = '',
  manualBodyTemplate = '',
} = {}) => {
  const greeting = dmName
    ? (lang === 'en' ? `Hi ${dmName},` : `Halo ${dmName},`)
    : (lang === 'en' ? `Hi ${companyName || 'Team'},` : `Halo tim ${companyName || ''},`);
  const offer = companyOffering
    ? companyOffering.split('\n')[0].replace(/^Layanan[^:]*:\s*/i, '').slice(0, 120)
    : (lang === 'en' ? 'modern client intake and web showcase solutions' : 'penataan website dan alur komunikasi digital');
  const previewLine = includePreviewLink && previewUrl
    ? (lang === 'en' ? `\nInteractive preview for ${companyName}: ${previewUrl}` : `\nContoh konsep awal untuk ${companyName}: ${previewUrl}`)
    : '';
  const ctaLine = customCta || (lang === 'en' ? 'Would you be open to a quick 10-minute look this week?' : 'Bolehkah kami kirim ringkasan singkatnya minggu ini?');
  const subject = manualSubjectTemplate
    ? manualSubjectTemplate.replace(/\{\{company\}\}/gi, companyName)
    : (lang === 'en' ? `Quick note for ${companyName || 'your team'}` : `Singkat untuk tim ${companyName || 'Anda'}`);
  const body = manualBodyTemplate
    ? manualBodyTemplate.replace(/\{\{company\}\}/gi, companyName)
    : (lang === 'en'
        ? `${greeting}\n\nI'm ${senderName} from ${senderCompany}${location ? ` (${location})` : ''}. We help businesses in your sector with ${offer}.${previewLine}\n\n${ctaLine}\n\nBest regards,\n${senderName}`
        : `${greeting}\n\nSaya ${senderName} dari ${senderCompany}${location ? ` (${location})` : ''}. Kami membantu bisnis sejenis dalam ${offer}.${previewLine}\n\n${ctaLine}\n\nTerima kasih,\n${senderName}`);
  return { subject, body, angle: 'digital_structure' };
};
const buildLinkedInMessages = ({ companyName = '', dmName = '', location = '', lang = 'id', senderName = 'Tim Bisnis', senderCompany = 'Prospekta' } = {}) => {
  const first = dmName ? dmName.split(' ')[0] : '';
  const stage1 = lang === 'en'
    ? `Hi${first ? ' ' + first : ''}, nice seeing what ${companyName || 'your team'} is building${location ? ' in ' + location : ''}. Would love to connect here.`
    : `Halo${first ? ' ' + first : ''}, salam kenal dari ${senderName} (${senderCompany}). Senang melihat perkembangan ${companyName || 'bisnis Anda'}. Boleh terhubung di sini?`;
  const stage2 = lang === 'en'
    ? `Thanks for connecting${first ? ', ' + first : ''}. Happy to share a concise concept note for ${companyName || 'your team'} if helpful.`
    : `Terima kasih sudah terhubung${first ? ', ' + first : ''}. Jika berkenan, saya bisa bagikan catatan ringkas yang relevan untuk ${companyName || 'tim Anda'}.`;
  return { stage1, stage2, connectionMessage: stage1, followUpMessage: stage2 };
};
const getAdvancedDorkScenarios = (place = {}, isTargetIndonesia = false) => {
  const name = String(place?.name || '').trim() || 'Perusahaan';
  const region = isTargetIndonesia ? 'Indonesia' : (place?.city || 'Singapore');
  return [
    {
      id: 'dm_linkedin',
      title: 'LinkedIn Pimpinan / Decision Maker',
      desc: 'Cari Founder, CEO, atau Director di LinkedIn.',
      query: `site:linkedin.com/in "${name}" "${region}" CEO OR Founder OR Director`,
    },
    {
      id: 'mgr_linkedin',
      title: 'LinkedIn Manager / Head',
      desc: 'Cari Manajer operasional, HR, atau marketing terkait.',
      query: `site:linkedin.com/in "${name}" "${region}" Manager OR Head`,
    },
    {
      id: 'contact_email',
      title: 'Halaman Kontak & Email Publik',
      desc: 'Cari halaman kontak resmi atau email bisnis.',
      query: `"${name}" "${region}" email OR contact OR hubungi`,
    },
  ];
};
const suggestPicCluster = () => '';
const resolveOutreachStrategy = (place = {}) => ({
  strategy: place?.website ? 'modernize' : 'digital_structure',
  angle: place?.website ? 'agentic_ai' : 'digital_structure',
});
import ProposalViewer from './ProposalViewer';
import { getPhoneType, getWhatsAppUrl } from '@/lib/phone';
import { copyToClipboard } from '@/lib/clipboard';
import { IconCheck, IconAlertTriangle, IconEdit } from './icons';
import { useI18n } from '@/lib/i18n';

// Definisi status pipeline outreach
const PIPELINE_STATUSES = [
  { value: 'new', label: 'Baru (New)', color: '#64748b' },
  { value: 'analyzed', label: 'Dianalisis', color: '#2563eb' },
  { value: 'proposal_draft', label: 'Draft Proposal', color: '#7c3aed' },
  { value: 'sent', label: 'Terkirim', color: '#0891b2' },
  { value: 'replied', label: 'Dibalas', color: '#d97706' },
  { value: 'meeting', label: 'Jadwal Meeting', color: '#059669' },
  { value: 'won', label: 'Kemitraan Terjalin (Won)', color: '#16a34a' },
  { value: 'lost', label: 'Belum Sesuai (Lost)', color: '#dc2626' }
];

// Komponen ikon SVG inline minimalis
const IconSparkles = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
);
const IconUser = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);
const IconExternalLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
);
const IconCopy = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
);
const IconCalendar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
);
const IconSend = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
);
const IconPhone = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
);
const IconGlobe = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
);
const IconMapPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
);
const IconLinkedIn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
);
const IconDownload = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);
const IconFileText = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
);
const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
);
const IconEye = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
);
const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
);
const IconChevronUp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>
);

export default function ReachModal({ place: initialPlace, onClose, onUpdatePlace, currentSession }) {
  const { lang, tx } = useI18n();
  const [place, setPlace] = useState(initialPlace);
  const [pipelineStatus, setPipelineStatus] = useState(initialPlace.reach_status || 'new');
  const [statusLoading, setStatusLoading] = useState(false);
  const [tenantSettings, setTenantSettings] = useState(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((d) => {
        if (d.success && d.settings) setTenantSettings(d.settings);
      })
      .catch(() => {});
  }, []);

  // Unified PIC & 3-Pillar Audit Form
  const [sgForm, setSgForm] = useState({
    picName: initialPlace.assigned_pic || '',
    dmName: initialPlace.pic_name || '',
    dmTitle: initialPlace.pic_title || 'Managing Director',
    verifiedEmail: initialPlace.email || '',
    phone: initialPlace.phone || initialPlace.whatsapp || '',
    budgetCapacity: initialPlace.budget_capacity || 'medium',
    budgetNotes: initialPlace.budget_notes || '',
    websiteCondition: initialPlace.website_condition && initialPlace.website_condition !== 'unverified'
      ? initialPlace.website_condition
      : (initialPlace.website ? 'outdated' : 'none'),
    socialCondition: initialPlace.social_condition || 'inactive',
    offerAngle: initialPlace.offer_angle || resolveOutreachStrategy(initialPlace).angle,
    observedBottleneck: initialPlace.problem_analysis || initialPlace.notes || initialPlace.sg_notes || ''
  });
  const [sgSaving, setSgSaving] = useState(false);
  const [sgStatusMsg, setSgStatusMsg] = useState(null);
  const [includeCalendly, setIncludeCalendly] = useState(false);
  const [includePreviewLink, setIncludePreviewLink] = useState(false);
  const [skeletonPattern, setSkeletonPattern] = useState(0);

  const [showDorkMenu, setShowDorkMenu] = useState(false);

  // Outreach & Quota State
  const [sgOutreachLogging, setSgOutreachLogging] = useState(false);
  const [sgOutreachMsg, setSgOutreachMsg] = useState(null);
  const [sgCopyEmailSuccess, setSgCopyEmailSuccess] = useState(false);
  const [copyLiSuccess, setCopyLiSuccess] = useState(false);
  const [linkedInStage, setLinkedInStage] = useState('stage1'); // 'stage1' (connect) or 'stage2' (after connect)

  // Bilingual state ('en' for Singapore/Global, 'id' for Indonesia)
  const isTargetIndonesia = Boolean(
    initialPlace?.anchor?.includes('Jakarta') ||
    initialPlace?.anchor?.includes('Surabaya') ||
    initialPlace?.anchor?.includes('AI Hub') ||
    (initialPlace?.address && (initialPlace.address.toLowerCase().includes('jakarta') || initialPlace.address.toLowerCase().includes('surabaya') || initialPlace.address.toLowerCase().includes('indonesia'))) ||
    (initialPlace?.phone && (initialPlace.phone.startsWith('+62') || initialPlace.phone.startsWith('08') || initialPlace.phone.startsWith('021') || initialPlace.phone.startsWith('031'))) ||
    (initialPlace?.website && (initialPlace.website.includes('.co.id') || initialPlace.website.includes('.id')))
  );
  // Bilingual state: defaults to 'en' (executive standard), user can toggle 'id' anytime
  const [outreachLang, setOutreachLang] = useState('en');

  // Browser MCP (Audit & Visual Screenshot) State
  const [browserAuditLoading, setBrowserAuditLoading] = useState(false);
  const [browserAuditResult, setBrowserAuditResult] = useState(
    initialPlace?.screenshot_url ? { screenshotUrl: initialPlace.screenshot_url } : null
  );
  const [browserAuditError, setBrowserAuditError] = useState(null);

  // Prospect Same-Domain Crawler State
  const [crawlerLoading, setCrawlerLoading] = useState(false);
  const [crawlerPages, setCrawlerPages] = useState([]);
  const [crawlerSummary, setCrawlerSummary] = useState(null);
  const [crawlerError, setCrawlerError] = useState(null);

  // Analysis State
  const [analysis, setAnalysis] = useState(null);
  const [analysisChecking, setAnalysisChecking] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [manualText, setManualText] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Cold Email Mode State ('template' | 'ai')
  const [emailMode, setEmailMode] = useState('template');
  const [aiEmail, setAiEmail] = useState(null);
  const [aiEmailLoading, setAiEmailLoading] = useState(false);
  const [aiEmailError, setAiEmailError] = useState(null);
  const [emailGenStats, setEmailGenStats] = useState(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [showGenHistory, setShowGenHistory] = useState(false);

  // Research Notes State
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [authorName, setAuthorName] = useState(currentSession?.isSuperadmin ? 'Tim Prospekta' : (currentSession?.company_name || 'Tim Kami'));
  const [addingNote, setAddingNote] = useState(false);

  // Proposal & Google Calendar Accordion State
  const [proposalAccordionOpen, setProposalAccordionOpen] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState(null);
  const [proposalContent, setProposalContent] = useState('');
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Prebuilt Dynamic Website Preview State
  const [prebuiltSite, setPrebuiltSite] = useState(null);
  const [prebuiltUrl, setPrebuiltUrl] = useState('');
  const [prebuiltLoading, setPrebuiltLoading] = useState(false);
  const [prebuiltError, setPrebuiltError] = useState(null);
  const [copyPrebuiltSuccess, setCopyPrebuiltSuccess] = useState(false);

  // Outreach deduplication tracking state
  const [existingLogs, setExistingLogs] = useState([]);
  const [allowFollowup, setAllowFollowup] = useState(false);


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

  // Sync place when initialPlace updates
  useEffect(() => {
    setPlace(initialPlace);
    setPipelineStatus(initialPlace.reach_status || 'new');
    setSgForm({
      picName: initialPlace.assigned_pic || '',
      dmName: initialPlace.pic_name || '',
      dmTitle: initialPlace.pic_title || 'Managing Director',
      verifiedEmail: initialPlace.email || '',
      phone: initialPlace.phone || initialPlace.whatsapp || '',
      budgetCapacity: initialPlace.budget_capacity || 'medium',
      budgetNotes: initialPlace.budget_notes || '',
      websiteCondition: initialPlace.website_condition && initialPlace.website_condition !== 'unverified'
        ? initialPlace.website_condition
        : (initialPlace.website ? 'outdated' : 'none'),
      socialCondition: initialPlace.social_condition || 'inactive',
      offerAngle: initialPlace.offer_angle || resolveOutreachStrategy(initialPlace).angle,
      observedBottleneck: initialPlace.problem_analysis || initialPlace.notes || initialPlace.sg_notes || ''
    });
    setSgStatusMsg(null);
    setSgOutreachMsg(null);
  }, [initialPlace]);

  // Load existing analysis, notes, proposal, prebuilt site, and outreach logs on mount
  useEffect(() => {
    if (!place?.overture_id) return;

    setAiEmail(null);
    setAiEmailError(null);
    setAnalysisChecking(true);
    fetch(`/api/reach/analyze?placeId=${place.overture_id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.analysis) {
          setAnalysis(data.analysis);
        } else {
          setAnalysis(null);
        }
      })
      .catch((err) => console.error('Failed to load analysis:', err))
      .finally(() => setAnalysisChecking(false));

    setNotesLoading(true);
    fetch(`/api/reach/notes?placeId=${place.overture_id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.notes) {
          setNotes(data.notes);
        }
      })
      .catch((err) => console.error('Failed to load notes:', err))
      .finally(() => setNotesLoading(false));

    setEmailGenStats(null);
    setShowGenHistory(false);
    fetch(`/api/reach/proposal?placeId=${place.overture_id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.proposal) {
          setProposal(data.proposal);
          setProposalContent(data.proposal.content || '');
        }
        if (data.emailGenStats) {
          setEmailGenStats(data.emailGenStats);
          if (data.emailGenStats.latestEmail?.subject && data.emailGenStats.latestEmail?.body) {
            setAiEmail(data.emailGenStats.latestEmail);
            setEmailMode('ai');
            if (data.emailGenStats.latestEmail.lang) {
              setOutreachLang(data.emailGenStats.latestEmail.lang === 'id' ? 'id' : 'en');
            }
          }
        }
      })
      .catch((err) => console.error('Failed to load proposal:', err));

    // Ambil data prebuilt site jika sudah ada
    setPrebuiltSite(null);
    setPrebuiltUrl('');
    setPrebuiltError(null);
    fetch(`/api/reach/prebuilt-site?placeId=${place.overture_id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.site) {
          setPrebuiltSite(data.site);
          setPrebuiltUrl(data.url || '');
        }
      })
      .catch((err) => console.error('Failed to load prebuilt site:', err));

    // Ambil riwayat log pengiriman outreach (cek deduplikasi)
    setExistingLogs([]);
    setAllowFollowup(false);
    fetch(`/api/reach/workflow?placeId=${place.overture_id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.logs) {
          setExistingLogs(data.logs);
        }
      })
      .catch((err) => console.error('Failed to load outreach logs:', err));
  }, [place?.overture_id]);

  // Generate Prebuilt Dynamic Website Preview
  const handleGeneratePrebuiltSite = async (forceRegenerate = false) => {
    setPrebuiltLoading(true);
    setPrebuiltError(null);
    try {
      const res = await fetch('/api/reach/prebuilt-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.overture_id,
          lang: outreachLang,
          force: Boolean(forceRegenerate === true)
        })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal membuat website preview');
      }
      setPrebuiltSite(data.site);
      setPrebuiltUrl(data.previewUrl || '');

      // Perbarui status pipeline prospek di UI
      const updated = {
        ...place,
        has_prebuilt_site: 1,
        prebuilt_slug: data.slug,
        reach_status: (!place.reach_status || place.reach_status === 'new') ? 'proposal_draft' : place.reach_status
      };
      setPlace(updated);
      if (!place.reach_status || place.reach_status === 'new') {
        setPipelineStatus('proposal_draft');
      }
      if (onUpdatePlace) onUpdatePlace(updated);
    } catch (err) {
      setPrebuiltError(err.message);
    } finally {
      setPrebuiltLoading(false);
    }
  };


  // Handle pipeline status change
  const handleStatusChange = async (newStatus) => {
    setStatusLoading(true);
    try {
      const res = await fetch('/api/reach/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: place.overture_id, status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        setPipelineStatus(newStatus);
        const updated = { ...place, reach_status: newStatus };
        setPlace(updated);
        if (onUpdatePlace) onUpdatePlace(updated);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setStatusLoading(false);
    }
  };

  // Trigger company analysis
  const handleRunAnalysis = async (useManual = false) => {
    setAnalysisRunning(true);
    setAnalysisError(null);

    try {
      const res = await fetch('/api/reach/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.overture_id,
          websiteUrl: place.website,
          manualText: useManual ? manualText : undefined
        })
      });

      const data = await res.json();
      if (!data.success) {
        if (data.canFallbackManual) {
          setShowManualInput(true);
        }
        throw new Error(data.error || 'Analisis gagal dijalankan.');
      }

      setAnalysis(data.analysis);
      setPipelineStatus('analyzed');

      if (data.analysis) {
        const a = data.analysis;
        setSgForm((prev) => ({
          ...prev,
          dmName: prev.dmName || a.pic_name || '',
          phone: prev.phone || a.whatsapp || '',
          budgetCapacity: prev.budgetCapacity !== 'unverified' ? prev.budgetCapacity : (a.budget_capacity || 'medium'),
          budgetNotes: prev.budgetNotes || a.budget_notes || '',
          websiteCondition: prev.websiteCondition !== 'outdated' ? prev.websiteCondition : (a.website_condition || 'outdated'),
          socialCondition: prev.socialCondition !== 'inactive' ? prev.socialCondition : (a.social_condition || 'inactive'),
          offerAngle: prev.offerAngle || a.offer_angle || 'digital_structure',
          observedBottleneck: prev.observedBottleneck || a.observed_bottleneck || ''
        }));

        const discoveredWeb = a.website || data.discoveredWebsite || (a.source_url?.startsWith('http') ? a.source_url : null);
        const discoveredPicName = a.pic_name || data.discoveredPic || null;
        const discoveredPhoneNum = a.whatsapp || data.discoveredPhone || null;
        const discoveredEmailAddr = data.discoveredEmail || null;
        const discoveredLi = a.linkedin_url || data.discoveredLinkedin || null;

        const updatedPlace = {
          ...place,
          reach_status: 'analyzed',
          key_people: data.key_people || a.key_people || place.key_people,
          pic_name: place.pic_name || discoveredPicName,
          phone: place.phone || discoveredPhoneNum,
          email: place.email || discoveredEmailAddr,
          website: place.website || discoveredWeb,
          linkedin_url: place.linkedin_url || discoveredLi,
          icp_score: data.icp_score !== undefined ? data.icp_score : place.icp_score,
          budget_capacity: place.budget_capacity || a.budget_capacity || 'medium',
          budget_notes: place.budget_notes || a.budget_notes || null,
          website_condition: place.website_condition || a.website_condition || (discoveredWeb ? 'outdated' : 'none'),
          social_condition: place.social_condition || a.social_condition || 'inactive',
          offer_angle: place.offer_angle || a.offer_angle || (discoveredWeb ? 'agentic_ai' : 'digital_structure'),
          notes: place.notes || a.observed_bottleneck || null,
          sg_notes: place.notes || a.observed_bottleneck || null
        };
        setPlace(updatedPlace);
        if (onUpdatePlace) onUpdatePlace(updatedPlace);
      }
    } catch (err) {
      setAnalysisError(err.message);
    } finally {
      setAnalysisRunning(false);
    }
  };

  // Browser MCP: Jalankan visual screenshot & technical audit
  const handleRunBrowserAudit = async () => {
    if (!place?.website) {
      alert(tx('Prospect has no website URL to audit.', 'Prospek ini tidak memiliki alamat website untuk diaudit.'));
      return;
    }
    setBrowserAuditLoading(true);
    setBrowserAuditError(null);
    try {
      const res = await fetch('/api/reach/browser-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: place.overture_id, url: place.website })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Audit visual via Browser MCP gagal.');
      setBrowserAuditResult(data);
      const updatedPlace = {
        ...place,
        screenshot_url: data.screenshotUrl,
        problem_analysis: place.problem_analysis || data.audit?.recommendedSolution
      };
      setPlace(updatedPlace);
      if (onUpdatePlace) onUpdatePlace(updatedPlace);
      if (data.audit?.recommendedSolution && !sgForm.observedBottleneck) {
        setSgForm((prev) => ({ ...prev, observedBottleneck: data.audit.recommendedSolution }));
      }
    } catch (err) {
      setBrowserAuditError(err.message);
    } finally {
      setBrowserAuditLoading(false);
    }
  };

  // Same-Domain Crawler: Merayapi sub-halaman klien (layanan, produk, tentang) untuk personalisasi mendalam
  const handleRunProspectCrawler = async () => {
    if (!place?.website) {
      alert(tx('Prospect has no website URL to crawl.', 'Prospek ini tidak memiliki alamat website untuk dirayapi.'));
      return;
    }
    setCrawlerLoading(true);
    setCrawlerError(null);
    setCrawlerPages([]);
    setCrawlerSummary(null);

    try {
      let target = place.website.trim();
      if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

      // Fast batch crawl maksimal 6 halaman
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: target,
          maxPages: 6,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Perayapan website prospek gagal.');

      const pages = Array.isArray(data.results) ? data.results : [];
      setCrawlerPages(pages);

      if (pages.length === 0) {
        setCrawlerSummary('Website tidak mengembalikan halaman HTML yang dapat dianalisis.');
        return;
      }

      // Ekstrak nama layanan dan topik dari judul sub-halaman
      const subpageTitles = pages
        .map((p) => (p.title || '').replace(/\s*[-|]\s*.*$/, '').trim())
        .filter((t) => t && t.length > 2 && !/home|beranda|welcome/i.test(t));
      const uniqueServices = Array.from(new Set(subpageTitles)).slice(0, 4);

      const serviceText = uniqueServices.length > 0
        ? `Layanan terdeteksi: ${uniqueServices.join(', ')}.`
        : 'Halaman profil bisnis terdeteksi.';

      const detectedAnalysis = `${serviceText} Celah peluang: Tawarkan integrasi otomasi AI customer service dan sistem penjadwalan online 24 jam.`;
      setCrawlerSummary(detectedAnalysis);

      // Otomatis masukkan ke formulir analisis masalah
      setSgForm((prev) => ({
        ...prev,
        observedBottleneck: prev.observedBottleneck
          ? `${prev.observedBottleneck} | ${detectedAnalysis}`
          : detectedAnalysis,
      }));

      // Simpan langsung ke database places
      if (place.overture_id) {
        await fetch('/api/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            overture_id: place.overture_id,
            name: place.name,
            anchor: place.anchor,
            problem_analysis: detectedAnalysis,
          }),
        }).catch(() => {});
      }

      const updatedPlace = {
        ...place,
        problem_analysis: detectedAnalysis,
      };
      setPlace(updatedPlace);
      if (onUpdatePlace) onUpdatePlace(updatedPlace);
    } catch (err) {
      setCrawlerError(err.message);
    } finally {
      setCrawlerLoading(false);
    }
  };

  // Generate personalized cold email based on research intelligence
  const handleGenerateAiEmail = async (overrideLang, customOptions = {}) => {
    if (!place?.overture_id) return;
    const langToUse = overrideLang || outreachLang;
    const isRegen = Boolean(customOptions.regenerate || aiEmail || (emailGenStats?.placeCount || 0) > 0);
    const nextVariation = (emailGenStats?.placeCount || 0) + 1;
    setAiEmailLoading(true);
    setAiEmailError(null);

    const targetLoc = place.city || (
      place.anchor?.includes('SG') || place.anchor?.includes('Prestige') || place.address?.includes('Singapore') || place.phone?.startsWith('+65')
        ? 'Singapore'
        : (place.anchor?.includes('Surabaya') || /surabaya|jawa timur/i.test(place.address || '')
            ? 'Surabaya'
            : (place.anchor?.includes('Jakarta') || place.anchor?.includes('Denpasar') || isTargetIndonesia ? 'Jakarta' : 'Singapore'))
    );

    try {
      const res = await fetch('/api/reach/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai_email',
          placeId: place.overture_id,
          analysisId: analysis?.id,
          lang: langToUse,
          regenerate: isRegen,
          variationIndex: nextVariation,
          dmName: customOptions.dmName !== undefined ? customOptions.dmName : (sgForm.dmName || place.pic_name),
          dmTitle: customOptions.dmTitle !== undefined ? customOptions.dmTitle : (sgForm.dmTitle || place.pic_title),
          websiteCondition: customOptions.websiteCondition || sgForm.websiteCondition,
          offerAngle: customOptions.offerAngle || sgForm.offerAngle,
          location: customOptions.location || targetLoc
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal merumuskan email AI.');
      }
      setAiEmail({ ...(data.email || {}), lang: langToUse });
      setEmailMode('ai');
      if (data.emailGenStats) {
        setEmailGenStats(data.emailGenStats);
      }
    } catch (err) {
      console.warn('AI email generation error:', err);
      setAiEmailError(err.message);
    } finally {
      setAiEmailLoading(false);
    }
  };

  // Select discovered key person as active PIC
  const handleSelectKeyPerson = async (person) => {
    if (!person || !person.name) return;
    const newName = person.name.trim();
    const newTitle = (person.title || '').trim();
    const newEmail = (person.email || place.email || '').trim();
    const newPhone = (person.phone || place.phone || '').trim();

    setSgForm((prev) => ({
      ...prev,
      dmName: newName,
      dmTitle: newTitle || prev.dmTitle,
      verifiedEmail: newEmail || prev.verifiedEmail,
      phone: newPhone || prev.phone
    }));

    setSgStatusMsg({
      type: 'success',
      text: `PIC aktif diset ke ${newName} (${newTitle || 'Pimpinan Terpilih'}). Klik "Verifikasi & Simpan Lead" untuk menyimpan permanen.`
    });
  };

  // Handle saving verification and lead data
  const handleVerifySgLead = async (e) => {
    if (e) e.preventDefault();
    setSgSaving(true);
    setSgStatusMsg(null);
    try {
      const res = await fetch('/api/reach/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_lead',
          placeId: place.overture_id,
          picName: sgForm.picName,
          dmName: sgForm.dmName,
          dmTitle: sgForm.dmTitle,
          verifiedEmail: sgForm.verifiedEmail,
          phone: sgForm.phone,
          budgetCapacity: sgForm.budgetCapacity,
          budgetNotes: sgForm.budgetNotes,
          websiteCondition: sgForm.websiteCondition,
          socialCondition: sgForm.socialCondition,
          offerAngle: sgForm.offerAngle,
          notes: sgForm.observedBottleneck
        })
      });
      const data = await res.json();
      if (data.success) {
        const updated = {
          ...place,
          is_personal_lead: 1,
          contact_verified: 1,
          assigned_pic: sgForm.picName,
          pic_name: sgForm.dmName,
          pic_title: sgForm.dmTitle,
          email: sgForm.verifiedEmail,
          phone: sgForm.phone || place.phone,
          budget_capacity: sgForm.budgetCapacity,
          budget_notes: sgForm.budgetNotes,
          website_condition: sgForm.websiteCondition,
          social_condition: sgForm.socialCondition,
          offer_angle: sgForm.offerAngle,
          notes: sgForm.observedBottleneck,
          sg_notes: sgForm.observedBottleneck,
          reach_status: place.reach_status === 'new' ? 'analyzed' : place.reach_status
        };
        setPlace(updated);
        if (onUpdatePlace) onUpdatePlace(updated);
        setSgStatusMsg({ type: 'success', text: data.message });
      } else {
        setSgStatusMsg({ type: 'error', text: data.error || 'Verifikasi gagal disimpan.' });
      }
    } catch (err) {
      setSgStatusMsg({ type: 'error', text: `Terjadi kesalahan: ${err.message}` });
    } finally {
      setSgSaving(false);
    }
  };

  // Handle logging outreach (25 emails/day target) with deduplication check
  const handleLogSgOutreach = async (emailSubject, emailBody, actionType = 'gmail') => {
    setSgOutreachLogging(true);
    setSgOutreachMsg(null);
    try {
      const res = await fetch('/api/reach/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_outreach',
          placeId: place.overture_id,
          picName: sgForm.picName || place.assigned_pic || '',
          recipientEmail: sgForm.verifiedEmail || place.email || '',
          recipientName: sgForm.dmName || place.pic_name || 'Management',
          offerAngle: sgForm.offerAngle || 'agentic_ai',
          subject: emailSubject || '',
          bodyText: emailBody || '',
          allowFollowup: allowFollowup
        })
      });
      const data = await res.json();
      if (data.success) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const updated = {
          ...place,
          reach_status: 'sent',
          last_outreach_at: todayStr,
          outreach_count: (place.outreach_count || 0) + 1,
          lead_verified_at: new Date().toISOString()
        };
        setPlace(updated);
        setPipelineStatus('sent');
        if (onUpdatePlace) onUpdatePlace(updated);

        setExistingLogs(prev => [
          {
            id: data.logId,
            sent_date: todayStr,
            recipient_email: sgForm.verifiedEmail || place.email,
            pic_name: isInternalProspektaAdmin ? 'Prospekta AI Team' : (currentSession?.company_name ? `${currentSession.company_name} AI Team` : 'Tim Outreach'),
            subject: emailSubject
          },
          ...prev
        ]);

        setSgOutreachMsg({
          type: 'success',
          text: data.message || 'Log outreach berhasil dicatat dan status prospek diubah ke Terkirim.'
        });

        try {
          const copied = await copyToClipboard(`${emailSubject}\n\n${emailBody}`);
          if (copied) {
            setSgCopyEmailSuccess(true);
            setTimeout(() => setSgCopyEmailSuccess(false), 3000);
          }
        } catch (copyErr) {
          console.warn('Non-blocking copy notice:', copyErr);
        }

        const targetEmail = sgForm.verifiedEmail || place.email;
        if (targetEmail) {
          if (actionType === 'gmail' || actionType === true) {
            const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            window.open(gmailUrl, '_blank');
          } else if (actionType === 'mailto') {
            window.location.href = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
          }
        }
      } else if (data.alreadySent) {
        setSgOutreachMsg({
          type: 'warning',
          text: data.error || 'Email outreach sudah pernah dikirim sebelumnya.'
        });
        if (data.lastLog) {
          setExistingLogs(prev => prev.some(l => l.id === data.lastLog.id) ? prev : [data.lastLog, ...prev]);
        }
      } else {
        setSgOutreachMsg({ type: 'error', text: data.error || 'Gagal mencatat pengiriman.' });
      }
    } catch (err) {
      setSgOutreachMsg({ type: 'error', text: `Gagal mencatat outreach: ${err.message}` });
    } finally {
      setSgOutreachLogging(false);
    }
  };

  // Add human research note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setAddingNote(true);
    try {
      const res = await fetch('/api/reach/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.overture_id,
          content: newNote.trim(),
          author: authorName.trim() || (isInternalProspektaAdmin ? 'Tim Prospekta' : (currentSession?.company_name || 'Tim Kami'))
        })
      });
      const data = await res.json();
      if (data.success && data.note) {
        setNotes([data.note, ...notes]);
        setNewNote('');
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setAddingNote(false);
    }
  };

  // Generate proposal draft
  const handleGenerateProposal = async (selectedLang) => {
    setProposalLoading(true);
    setProposalError(null);
    const langToUse = (typeof selectedLang === 'string' && (selectedLang === 'en' || selectedLang === 'id'))
      ? selectedLang
      : outreachLang;

    try {
      const res = await fetch('/api/reach/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.overture_id,
          analysisId: analysis?.id,
          lang: langToUse
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal menyusun proposal.');
      }

      setProposal(data.proposal);
      setProposalContent(data.proposal.content || '');
      setPipelineStatus('proposal_draft');
      if (onUpdatePlace) {
        onUpdatePlace({ ...place, reach_status: 'proposal_draft' });
      }
    } catch (err) {
      setProposalError(err.message);
    } finally {
      setProposalLoading(false);
    }
  };

  // Save edited proposal
  const handleSaveProposal = async () => {
    if (!proposal?.id) return;
    setSavingProposal(true);
    try {
      const res = await fetch('/api/reach/proposal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: proposal.id,
          content: proposalContent,
          status: 'reviewed'
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsEditingProposal(false);
        setProposal({ ...proposal, content: proposalContent, status: 'reviewed' });
      }
    } catch (err) {
      console.error('Failed to save proposal:', err);
    } finally {
      setSavingProposal(false);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const copied = await copyToClipboard(proposalContent);
      if (copied) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 3000);
      }
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleDownloadMarkdown = () => {
    const blob = new Blob([proposalContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Proposal_${place.name.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadDoc = () => {
    const formattedBody = proposalContent
      .replace(/^# (.*$)/gim, '<h1 style="color: #0f172a; font-size: 18pt; border-bottom: 2px solid #2563eb; padding-bottom: 6px;">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 style="color: #1e40af; font-size: 13pt; margin-top: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 style="color: #1e293b; font-size: 11pt; margin-top: 12px;">$1</h3>')
      .replace(/^-\s*\*\*(.*?):\*\*\s*(.*)$/gim, '<p style="margin: 4px 0 4px 16px;"><strong>$1:</strong> $2</p>')
      .replace(/^-\s+(.*)$/gim, '<p style="margin: 4px 0 4px 16px;">• $1</p>')
      .replace(/^\> (.*$)/gim, '<div style="background-color: #eff6ff; border-left: 3px solid #2563eb; padding: 8px 12px; margin: 10px 0; font-style: italic;">$1</div>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" style="color: #2563eb;">$1</a>')
      .replace(/\n\n/gim, '<br/>')
      .replace(/\n/gim, '<br/>');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Proposal ${place.name}</title>
        <style>
          body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #1e293b; padding: 20px; }
        </style>
      </head>
      <body>
        ${formattedBody}
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Proposal_${place.name.replace(/[^a-zA-Z0-9]/g, '_')}.doc`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Discovered Key People parsing
  let keyPeopleList = [];
  const rawKp = place.key_people || analysis?.key_people;
  if (rawKp) {
    if (typeof rawKp === 'string') {
      try { keyPeopleList = JSON.parse(rawKp); } catch { keyPeopleList = []; }
    } else if (Array.isArray(rawKp)) {
      keyPeopleList = rawKp;
    }
  }

  const cleanTargetLoc = place.city || (
    place.anchor?.includes('SG') || place.anchor?.includes('Prestige') || place.address?.includes('Singapore') || place.phone?.startsWith('+65')
      ? 'Singapore'
      : (place.anchor?.includes('Surabaya') || /surabaya|jawa timur/i.test(place.address || '')
          ? 'Surabaya'
          : (place.anchor?.includes('Jakarta') || place.anchor?.includes('Denpasar') || isTargetIndonesia ? 'Jakarta' : 'Singapore'))
  );

  // Dynamic Workspace Sender & Personalization (Strict White-Labeling)
  const isInternalProspektaAdmin = Boolean(currentSession?.isSuperadmin && !currentSession?.tid);
  const isClient = !isInternalProspektaAdmin;
  const senderCompany = currentSession?.company_name || tenantSettings?.company_name || 'Tim Bisnis';
  const senderEmail = tenantSettings?.smtp_from || tenantSettings?.smtp_user || currentSession?.email || 'sales@perusahaan.com';
  const senderName = tenantSettings?.smtp_from ? tenantSettings.smtp_from.replace(/<.*>/, '').trim() : (currentSession?.company_name || 'Tim Penjualan');
  const senderLocation = currentSession?.address || '';
  const companyOffering = tenantSettings?.company_offering || '';
  const customCta = tenantSettings?.custom_cta || '';
  const manualSubjectTemplate = tenantSettings?.email_template_subject || '';
  const manualBodyTemplate = tenantSettings?.email_template_body || '';

  // Build Executive Email & LinkedIn message
  const sgEmail = buildSgExecutiveEmail({
    companyName: place.name,
    industry: place.bidang_usaha || place.category_raw,
    dmName: sgForm.dmName || place.pic_name,
    dmTitle: sgForm.dmTitle || place.pic_title,
    websiteCondition: sgForm.websiteCondition,
    offerAngle: sgForm.offerAngle,
    observedBottleneck: sgForm.observedBottleneck,
    previewUrl: prebuiltUrl,
    includePreviewLink,
    location: cleanTargetLoc,
    lang: outreachLang,
    address: place.address || '',
    anchor: place.anchor || '',
    website: place.website || '',
    picName: place.assigned_pic || '',
    skeletonPattern,
    senderName,
    senderEmail,
    senderCompany,
    senderLocation,
    isClient,
    companyOffering,
    customCta,
    manualSubjectTemplate,
    manualBodyTemplate
  });

  const rawCustomCalendarUrl = (tenantSettings?.calendly_url || '').trim();
  const isCalendarConnected = Boolean(rawCustomCalendarUrl && rawCustomCalendarUrl !== 'https://calendar.google.com' && rawCustomCalendarUrl !== 'https://calendar.app.google/');
  const calendlyUrl = isCalendarConnected ? rawCustomCalendarUrl : (process.env.NEXT_PUBLIC_CALENDAR_URL || 'https://calendar.google.com');
  const googleCalendarEventUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Meeting: ${place.name}`)}&details=${encodeURIComponent(`Diskusi solusi untuk ${place.name}${place.address ? ` (${place.address})` : ''}`)}${(sgForm.verifiedEmail || place.email) ? `&add=${encodeURIComponent(sgForm.verifiedEmail || place.email)}` : ''}`;
  const activeEmailSubject = (emailMode === 'ai' && aiEmail?.subject) ? aiEmail.subject : sgEmail.subject;
  const calendlySuffix = includeCalendly
    ? (outreachLang === 'en'
        ? `\n\nP.S. You can also pick a convenient 15-minute slot directly on our calendar: ${calendlyUrl}`
        : `\n\nP.S. Anda juga dapat langsung memilih jadwal diskusi 15 menit via kalender kami: ${calendlyUrl}`)
    : '';
  const previewSuffix = (emailMode === 'ai' && includePreviewLink && prebuiltUrl)
    ? (outreachLang === 'en'
        ? `\n\nInteractive preview link for ${place.name}: ${prebuiltUrl}`
        : `\n\nTautan contoh website preview untuk ${place.name}: ${prebuiltUrl}`)
    : '';
  const baseEmailBody = (emailMode === 'ai' && aiEmail?.body) ? aiEmail.body : sgEmail.body;
  const activeEmailBody = `${baseEmailBody}${previewSuffix}${calendlySuffix}`;

  useEffect(() => {
    setDraftSubject(activeEmailSubject || '');
    setDraftBody(activeEmailBody || '');
  }, [activeEmailSubject, activeEmailBody]);

  const cleanInd = (place.bidang_usaha || place.category_raw || (outreachLang === 'id' ? 'industri Anda' : 'your industry')).replace(/_/g, ' ');
  const dmFirstName = (sgForm.dmName || place.pic_name || '').trim().split(' ')[0];

  const linkedInMessages = buildLinkedInMessages({
    companyName: place.name,
    dmName: sgForm.dmName || place.pic_name,
    dmTitle: sgForm.dmTitle || place.pic_title,
    industry: place.bidang_usaha || place.category_raw,
    offerAngle: sgForm.offerAngle,
    location: cleanTargetLoc,
    calendlyUrl,
    lang: outreachLang,
    senderCompany,
    senderName,
    isClient,
    companyOffering
  });

  const activeLinkedInMessage = linkedInStage === 'stage1' ? linkedInMessages.stage1 : linkedInMessages.stage2;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-content reach-modal-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Header: Nama Perusahaan, Status Outreach & Tombol Tutup */}
        <div className="modal-header reach-modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
              <h2 className="modal-title" style={{ margin: 0 }}>
                {place.name}
              </h2>
              <span className="badge badge-info">
                {place.bidang_usaha || place.category_raw || tx('General', 'Umum')}
              </span>
              {place.icp_score > 0 && (
                <span
                  className={`badge ${place.icp_score >= 70 ? 'badge-done' : place.icp_score >= 45 ? 'badge-anchor' : 'badge-pending'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 700 }}
                  title={`ICP Fit Score: ${place.icp_score}/100\n• Email MX: ${place.email ? '+30' : '0'}\n• Verified PIC: ${place.pic_name ? '+25' : '0'}\n• Priority Sector: +25\n• Missing/Outdated Web: +20`}
                >
                  ICP {place.icp_score}/100
                </span>
              )}
              {Boolean(place.is_personal_lead) ? (
                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <IconCheck size={13} /> {tx('Verified Lead', 'Lead Terverifikasi')}
                </span>
              ) : (
                <span className="badge badge-warning">{tx('SOP Queue', 'Antrean SOP')}</span>
              )}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {place.address || tx('No address recorded', 'Alamat belum tercatat')} {place.distance_m ? `(${tx('Distance:', 'Jarak:')} ${place.distance_m} m)` : ''}
            </div>
          </div>

          <div className="reach-modal-header-actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</span>
              <select
                className="select-input"
                value={pipelineStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={statusLoading}
                style={{ minHeight: '34px', fontSize: '0.75rem', padding: '4px 8px' }}
                aria-label={tx('Change outreach status', 'Ubah status outreach')}
              >
                {PIPELINE_STATUSES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {lang === 'id' ? st.label : (
                      st.value === 'new' ? 'New' :
                      st.value === 'analyzed' ? 'Analyzed' :
                      st.value === 'proposal_draft' ? 'Proposal Draft' :
                      st.value === 'sent' ? 'Sent' :
                      st.value === 'replied' ? 'Replied' :
                      st.value === 'meeting' ? 'Meeting Scheduled' :
                      st.value === 'won' ? 'Partnership Closed (Won)' :
                      st.value === 'lost' ? 'Not a Fit (Lost)' : st.label
                    )}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ minHeight: '34px', padding: '0.25rem 0.5rem', display: 'inline-flex', alignItems: 'center' }}
              aria-label={tx('Close modal', 'Tutup modal')}
            >
              <IconClose />
            </button>
          </div>
        </div>

        {/* Modal Body: Unified 2-Column Modern Minimalist Workstation */}
        <div className="modal-body reach-modal-body" style={{ margin: 0, paddingBottom: '1rem' }}>
          {/* Sub-Header: SOP Prospek Metadata & Link Cepat Eksternal */}
          <div className="reach-sub-header">
            <div className="reach-sub-header-left">
              <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-main)' }}>
                {tx('Prospect SOP', 'SOP Prospek')}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {place.is_personal_lead
                  ? `Verified B2B Lead (${tx('Sender', 'Pengirim')}: ${isInternalProspektaAdmin ? 'admin@prospekta.id' : senderEmail})`
                  : tx(
                      'Verify 3 pillars and official email before sending outreach',
                      'Verifikasi 3 pilar dan email resmi sebelum mengirim outreach'
                    )}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {place.website ? (
                <a
                  href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                  target="_blank"
                  rel="noreferrer"
                  className="reach-chip-link"
                  title={tx('Open Official Website', 'Buka Website Resmi')}
                >
                  <IconGlobe /> Web <IconExternalLink />
                </a>
              ) : (
                <span className="reach-chip-link" style={{ opacity: 0.6, cursor: 'default' }}>{tx('No Website', 'Tanpa Web')}</span>
              )}
              {place.social_media ? (
                <a
                  href={place.social_media.startsWith('http') ? place.social_media : `https://${place.social_media}`}
                  target="_blank"
                  rel="noreferrer"
                  className="reach-chip-link"
                  title={tx('Open Official Social / Instagram', 'Buka Media Sosial / Instagram Resmi')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                  Instagram <IconExternalLink />
                </a>
              ) : null}
              {place.phone && (() => {
                const pInfo = getPhoneType(place.phone);
                const waLink = getWhatsAppUrl(place.phone, place.name);
                return (
                  <>
                    <a href={`tel:${place.phone}`} className="reach-chip-link" title={pInfo.label || tx('Call Phone', 'Hubungi Telepon')}>
                      <IconPhone /> {place.phone} {pInfo.isLandline && <span style={{ fontSize: '0.625rem', opacity: 0.8 }}>(Landline)</span>}
                    </a>
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="reach-chip-link"
                        style={{
                          backgroundColor: 'var(--success-bg)',
                          borderColor: 'var(--success-border)',
                          color: 'var(--success-text)',
                          fontWeight: 600,
                        }}
                        title={tx('Send quick WhatsApp message', 'Kirim pesan sapaan cepat ke WhatsApp prospek')}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                        WhatsApp WA.me <IconExternalLink />
                      </a>
                    )}
                  </>
                );
              })()}
              <a
                href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${place.name} ${isTargetIndonesia ? 'Indonesia' : (place.city || 'Singapore')} CEO OR Director OR Founder OR Manager`)}`}
                target="_blank"
                rel="noreferrer"
                className="reach-chip-link"
                title={tx('Search Decision Maker LinkedIn', 'Cari Profil LinkedIn Pimpinan')}
              >
                <IconLinkedIn /> LinkedIn <IconExternalLink />
              </a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + (place.address || ''))}`}
                target="_blank"
                rel="noreferrer"
                className="reach-chip-link"
                title={tx('Open in Google Maps', 'Buka di Google Maps')}
              >
                <IconMapPin /> Maps <IconExternalLink />
              </a>
            </div>
          </div>

          <div className="reach-workstation-grid">
            
            {/* ================= KOLOM KIRI: Audit, PIC & Intelijen Riset ================= */}
            <div className="reach-column">
              
              {/* Card 1: Audit 3 Pilar & Profil PIC */}
              <div className="reach-form-card">
                <div className="reach-card-header">
                  <div className="reach-card-title">
                    <IconUser />
                    <span>{tx('3-Pillar Audit & PIC Profile', 'Audit 3 Pilar & Profil PIC')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Advanced Google Dorking Multi-Scenario Split Button */}
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      {(() => {
                        const dorkScenarios = getAdvancedDorkScenarios(place, isTargetIndonesia);
                        return (
                          <>
                            <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                              <a
                                href={`https://www.google.com/search?q=${encodeURIComponent(dorkScenarios[0]?.query || place.name || '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-secondary btn-sm"
                                style={{
                                  minHeight: '34px',
                                  padding: '0.375rem 0.75rem',
                                  fontSize: '0.8125rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  textDecoration: 'none',
                                  borderRight: 'none',
                                  borderTopRightRadius: 0,
                                  borderBottomRightRadius: 0
                                }}
                                title={tx('Search Decision Maker LinkedIn profile via Google', 'Cari profil LinkedIn Decision Maker utama di Google (Query Presisi Tinggi)')}
                              >
                                <IconSearch /> {tx('Search DM on Google', 'Cari DM di Google')}
                              </a>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowDorkMenu(!showDorkMenu)}
                                style={{
                                  minHeight: '34px',
                                  padding: '0.375rem 0.5rem',
                                  fontSize: '0.8125rem',
                                  borderTopLeftRadius: 0,
                                  borderBottomLeftRadius: 0,
                                  cursor: 'pointer'
                                }}
                                title={tx('Select Other Dorking Scenarios', 'Pilih Skenario Dorking Lainnya')}
                              >
                                <IconChevronDown />
                              </button>
                            </div>

                            {showDorkMenu && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  right: 0,
                                  zIndex: 50,
                                  marginTop: '6px',
                                  width: '320px',
                                  backgroundColor: 'var(--bg-card, #ffffff)',
                                  border: '1px solid var(--border-color, #e2e8f0)',
                                  borderRadius: 'var(--radius-sm)',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                                  padding: '6px 0',
                                  textAlign: 'left'
                                }}
                              >
                                <div style={{ padding: '6px 12px 8px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
                                  {tx('Advanced Google Dorking Scenarios', 'Skenario Google Dorking Tingkat Lanjut')}
                                </div>
                                {dorkScenarios.map((sc) => (
                                  <a
                                    key={sc.id}
                                    href={`https://www.google.com/search?q=${encodeURIComponent(sc.query)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => setShowDorkMenu(false)}
                                    style={{
                                      display: 'block',
                                      padding: '8px 12px',
                                      textDecoration: 'none',
                                      color: 'var(--text-main)',
                                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                                      transition: 'background-color 0.15s ease'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-main, #f8fafc)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                  >
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{sc.title}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>{sc.desc}</div>
                                  </a>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleVerifySgLead} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  {/* Group 1: Klaster Industri & Penugasan */}
                  {/* Group 2: Profil Pengambil Keputusan (PIC) */}
                  <div className="reach-form-group">
                    <div className="reach-group-header">
                      <span className="reach-group-title">
                        <IconUser /> {tx('Decision Maker Profile (PIC)', 'Profil Pengambil Keputusan (PIC)')}
                      </span>
                      <span className="reach-group-caption">{tx('Target C-Level / Director', 'Target C-Level / Director')}</span>
                    </div>

                    {/* Nama & Jabatan */}
                    <div className="reach-field-grid-2">
                      <div>
                        <label className="reach-field-label">
                          <span>{tx('Decision Maker Name', 'Nama Decision Maker')}</span>
                          <span className="subtle-note">{tx('Optional', 'Opsional')}</span>
                        </label>
                        <input
                          type="text"
                          className="text-input"
                          placeholder={tx('e.g. David Chen (or Dr. Adrian)', 'cth. David Chen (atau Dr. Adrian)')}
                          value={sgForm.dmName}
                          onChange={(e) => setSgForm({ ...sgForm, dmName: e.target.value })}
                        />
                        {!sgForm.dmName && (
                          <div style={{ fontSize: '0.6875rem', color: '#b45309', backgroundColor: '#fef3c7', padding: '3px 6px', borderRadius: '4px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <IconAlertTriangle size={12} />
                            <span>{tx('DM name is empty. Check LinkedIn above to avoid spam filters.', 'Nama DM kosong. Cek LinkedIn di atas untuk nama pimpinan agar email tidak masuk spam.')}</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="reach-field-label">
                          <span>{tx('Executive Title', 'Jabatan Eksekutif')}</span>
                          <span className="subtle-note">C-Level / Dir</span>
                        </label>
                        <input
                          type="text"
                          className="text-input"
                          placeholder={tx('e.g. Managing Director', 'cth. Managing Director')}
                          value={sgForm.dmTitle}
                          onChange={(e) => setSgForm({ ...sgForm, dmTitle: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Email Resmi & Nomor Kontak */}
                    <div className="reach-field-grid-2">
                      <div>
                        <label className="reach-field-label">
                          <span>{tx('Official Work Email', 'Email Kerja Resmi')}</span>
                          <span className="req-badge">{tx('Required', 'Wajib')}</span>
                        </label>
                        <input
                          type="email"
                          className="text-input"
                          placeholder="contact@company.com"
                          value={sgForm.verifiedEmail}
                          onChange={(e) => setSgForm({ ...sgForm, verifiedEmail: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="reach-field-label">
                          <span>{tx('Contact / WhatsApp Number', 'Nomor Kontak / WA')}</span>
                          <span className="subtle-note">
                            {sgForm.phone && (() => {
                              const pInfo = getPhoneType(sgForm.phone);
                              return pInfo.isLandline ? 'Landline' : pInfo.isMobile ? 'Mobile / WhatsApp' : '+62 / +65';
                            })()}
                          </span>
                        </label>
                        <input
                          type="text"
                          className="text-input"
                          placeholder="+62... / +65..."
                          value={sgForm.phone}
                          onChange={(e) => setSgForm({ ...sgForm, phone: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Discovered Key People Chips (Jika ada dari crawler) */}
                    {keyPeopleList && keyPeopleList.length > 0 && (
                      <div className="reach-key-people-strip">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          <span>{tx(`Discovered Leaders (${keyPeopleList.length}):`, `Pimpinan Terdeteksi Web (${keyPeopleList.length}):`)}</span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{tx('Click to populate PIC form', 'Klik untuk mengisi formulir PIC')}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {keyPeopleList.slice(0, 3).map((person, idx) => {
                            const isDecisionMaker = person.role_category === 'decision_maker' || /director|ceo|founder|president|managing|owner|principal/i.test(person.title || '');
                            return (
                              <div key={idx} className="reach-person-item">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <strong style={{ fontSize: '0.8125rem', color: 'var(--text-main)' }}>{person.name}</strong>
                                    <span
                                      className={`badge ${isDecisionMaker ? 'badge-done' : 'badge-anchor'}`}
                                      style={{ fontSize: '0.625rem', padding: '1px 6px' }}
                                    >
                                      {isDecisionMaker ? tx('Decision Maker (Email)', 'Decision Maker (Email)') : tx('Operations (LinkedIn)', 'Operasional (LinkedIn)')}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {person.title || tx('Management', 'Manajemen')} {person.email ? `• ${person.email}` : ''}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => handleSelectKeyPerson(person)}
                                >
                                  {tx('Select PIC', 'Pilih PIC')}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Group 3: Validasi 3 Pilar Prospek */}
                  <div className="reach-form-group">
                    <div className="reach-group-header">
                      <span className="reach-group-title">
                        <IconSparkles /> {tx('3-Pillar Prospect Validation', 'Validasi 3 Pilar Prospek')}
                      </span>
                      <span className="reach-group-caption">{tx('Standard Outreach Formula', 'Formula Standar Outreach')}</span>
                    </div>

                    {/* Pilar 1: Kemampuan Budget */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label className="reach-field-label">
                        <span>{tx('Pillar 1: Client Budget Capacity', 'Pilar 1: Kapasitas Budget Klien')}</span>
                        <span className="subtle-note">{tx('Business Size & Location', 'Ukuran & Lokasi Bisnis')}</span>
                      </label>
                      <select
                        className="select-input"
                        value={sgForm.budgetCapacity}
                        onChange={(e) => setSgForm({ ...sgForm, budgetCapacity: e.target.value })}
                      >
                        {BUDGET_OPTIONS.map((b) => (
                          <option key={b.value} value={b.value}>
                            {lang === 'id' ? b.label : (
                              b.value === 'high' ? 'High (Strong Budget, Established Office & Clients)' :
                              b.value === 'medium' ? 'Medium (Standard Operating Business / Active SME)' :
                              'Unverified'
                            )}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="text-input"
                        placeholder={tx('Budget evidence notes (e.g. 45 employees on LinkedIn, CBD office)', 'Catatan bukti budget (cth. 45 karyawan di LinkedIn, gedung kantor di pusat bisnis)')}
                        value={sgForm.budgetNotes}
                        onChange={(e) => setSgForm({ ...sgForm, budgetNotes: e.target.value })}
                      />
                    </div>

                    {/* Pilar 2: Kondisi Website */}
                    <div>
                      <label className="reach-field-label">
                        <span>{tx('Pillar 2: Official Website Condition', 'Pilar 2: Kondisi Website Resmi')}</span>
                        <span className="subtle-note">{tx('Auto Detected', 'Deteksi Otomatis')}</span>
                      </label>
                      <select
                        className="select-input"
                        value={sgForm.websiteCondition}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newAngle = (val === 'none' || val === 'outdated') ? 'digital_structure' : 'agentic_ai';
                          setSgForm((prev) => ({
                            ...prev,
                            websiteCondition: val,
                            offerAngle: newAngle
                          }));
                          if (emailMode === 'ai' && analysis) {
                            handleGenerateAiEmail(outreachLang, { websiteCondition: val, offerAngle: newAngle });
                          }
                        }}
                      >
                        {WEBSITE_OPTIONS.map((w) => (
                          <option key={w.value} value={w.value}>
                            {lang === 'id' ? w.label : (
                              w.value === 'none' ? 'Scenario A: No Website Yet (Focus: Modern Presence & SG Credibility)' :
                              w.value === 'outdated' ? 'Scenario B: Outdated / Slow / Non-Mobile Website (Revamp Proof & Leads)' :
                              'Scenario C: Modern / High-Quality Website (Pivot 100% to Agentic AI)'
                            )}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Pilar 3: Media Sosial & Sudut Solusi */}
                    <div className="reach-field-grid-2">
                      <div>
                        <label className="reach-field-label">
                          <span>{tx('Pillar 3: Social Media', 'Pilar 3: Media Sosial')}</span>
                          <span className="subtle-note">{tx('Public Profile', 'Profil Publik')}</span>
                        </label>
                        <select
                          className="select-input"
                          value={sgForm.socialCondition}
                          onChange={(e) => setSgForm({ ...sgForm, socialCondition: e.target.value })}
                        >
                          {SOCIAL_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {lang === 'id' ? s.label : (
                                s.value === 'inactive' ? 'Inactive Social Media' :
                                s.value === 'messy' ? 'Messy / Irregular Posts' :
                                'Active & Well-Maintained'
                              )}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="reach-field-label">
                          <span>{isInternalProspektaAdmin ? tx('Prospekta Solution Angle', 'Sudut Solusi Prospekta') : tx('Solution Angle', 'Sudut Solusi Ditawarkan')}</span>
                          <span className="subtle-note">{tx('Recommendation', 'Rekomendasi')}</span>
                        </label>
                        <select
                          className="select-input"
                          value={sgForm.offerAngle}
                          onChange={(e) => {
                            const newAngle = e.target.value;
                            setSgForm((prev) => ({ ...prev, offerAngle: newAngle }));
                            if (emailMode === 'ai' && analysis) {
                              handleGenerateAiEmail(outreachLang, { offerAngle: newAngle });
                            }
                          }}
                        >
                          {OFFER_ANGLES.map((a) => (
                            <option key={a.value} value={a.value}>
                              {lang === 'id' ? a.label : (
                                a.value === 'digital_structure'
                                  ? 'Segment 1: Entry-Level Website (Digital Structure & Local Trust)'
                                  : 'Segment 2: AI Automation & Digital Growth (Healthcare / Clinics)'
                              )}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Tombol Simpan Verifikasi Lead */}
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={sgSaving || !sgForm.verifiedEmail.trim()}
                    style={{ minHeight: '44px', fontSize: '0.875rem', fontWeight: 600, width: '100%', justifyContent: 'center' }}
                  >
                    {sgSaving ? (
                      tx('Saving...', 'Menyimpan...')
                    ) : place.is_personal_lead ? (
                      <>
                        <IconCheck size={13} /> {tx('Update Verification & Lead Data', 'Perbarui Verifikasi & Data Lead')}
                      </>
                    ) : (
                      <>
                        <IconCheck size={13} /> {tx('Verify & Add to Personal Lead List', 'Verifikasi & Masukkan ke Personal Lead List')}
                      </>
                    )}
                  </button>

                  {sgStatusMsg && (
                    <div className={`alert alert-${sgStatusMsg.type === 'success' ? 'success' : 'danger'}`} style={{ fontSize: '0.8125rem', padding: '0.625rem 0.875rem', margin: 0 }}>
                      {sgStatusMsg.text}
                    </div>
                  )}
                </form>
              </div>

              {/* Card 2: Intelijen Riset & Bukti Web */}
              <div className="reach-form-card">
                <div className="reach-card-header">
                  <div className="reach-card-title">
                    <IconSearch />
                    <span>{tx('Research Intelligence & Needs Discovery', 'Intelijen Riset & Temuan Kebutuhan')}</span>
                    <span style={{ fontSize: '0.625rem', background: 'rgba(37, 99, 235, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: '4px' }}>
                      Deep Research
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {place?.website && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleRunBrowserAudit}
                        disabled={browserAuditLoading}
                        style={{ fontSize: '0.6875rem', padding: '2px 8px', minHeight: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: '#38bdf8', color: '#0284c7' }}
                        title="Jalankan Browser MCP untuk mengambil screenshot visual asli & audit teknis"
                      >
                        {browserAuditLoading ? (
                          <>
                            <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                            <span>Memeriksa...</span>
                          </>
                        ) : (
                          <span>Audit Visual Website</span>
                        )}
                      </button>
                    )}
                    {place?.website && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleRunProspectCrawler}
                        disabled={crawlerLoading || browserAuditLoading}
                        style={{
                          fontSize: '0.6875rem',
                          padding: '2px 8px',
                          minHeight: '28px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          borderColor: '#10b981',
                          color: '#059669',
                          backgroundColor: '#f0fdf4',
                          fontWeight: 600,
                        }}
                        title="Rayapi sub-halaman website calon klien (layanan, produk, tentang) untuk personalisasi email &amp; analisis kebutuhan"
                      >
                        {crawlerLoading ? (
                          <>
                            <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                            <span>Merayapi Sub-Halaman...</span>
                          </>
                        ) : (
                          <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            <span>Crawl Sub-Halaman Klien</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleRunAnalysis(false)}
                      disabled={analysisRunning || analysisChecking}
                      style={{ fontSize: '0.6875rem', padding: '2px 8px', minHeight: '28px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      {analysisRunning ? (
                        <>
                          <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} />
                          <span>{tx('Analyzing...', 'Menganalisis...')}</span>
                        </>
                      ) : (
                        <>
                          <IconRefresh /> <span>{analysis ? tx('Re-analyze', 'Analisis Ulang') : tx('Run Analysis', 'Jalankan Analisis')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Browser MCP Error */}
                {browserAuditError && (
                  <div className="alert alert-danger" style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem', margin: '0 0 0.75rem' }}>
                    <strong>Pemeriksaan Website:</strong> {browserAuditError}
                  </div>
                )}

                {/* Browser MCP Visual Audit & Screenshot Panel */}
                {(browserAuditResult || place?.screenshot_url) && (
                  <div style={{
                    margin: '0 0 0.75rem',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    background: 'var(--bg-card-subtle)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          Tampilan Visual Website (Browser MCP)
                        </span>
                        {browserAuditResult?.audit?.score !== undefined && (
                          <span style={{
                            fontSize: '0.625rem',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            background: browserAuditResult.audit.score >= 70 ? '#dcfce7' : '#fee2e2',
                            color: browserAuditResult.audit.score >= 70 ? '#15803d' : '#991b1b'
                          }}>
                            Skor Web: {browserAuditResult.audit.score}/100
                          </span>
                        )}
                      </div>
                      {place?.website && (
                        <a
                          href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.6875rem', color: '#0284c7', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                        >
                          <span>Buka Asli</span>
                        </a>
                      )}
                    </div>

                    {/* Screenshot Image Container */}
                    <div style={{
                      position: 'relative',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      border: '1px solid var(--border-subtle)',
                      maxHeight: '180px',
                      backgroundColor: '#0f172a'
                    }}>
                      <img
                        src={browserAuditResult?.screenshotUrl || place?.screenshot_url || (place?.website ? `https://image.thum.io/get/width/1280/crop/800/noanimate/${encodeURIComponent(place.website)}` : '')}
                        alt={`Tangkapan layar ${place?.name || 'Website'}`}
                        style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>

                    {/* Audit Findings Pill Tags */}
                    {browserAuditResult?.audit && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.6875rem' }}>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: browserAuditResult.audit.isHttps ? '#dcfce7' : '#fee2e2', color: browserAuditResult.audit.isHttps ? '#15803d' : '#991b1b' }}>
                          {browserAuditResult.audit.isHttps ? 'SSL Aktif' : 'Belum SSL'}
                        </span>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: browserAuditResult.audit.hasWhatsAppWidget ? '#dcfce7' : '#fef3c7', color: browserAuditResult.audit.hasWhatsAppWidget ? '#15803d' : '#92400e' }}>
                          {browserAuditResult.audit.hasWhatsAppWidget ? 'Widget WhatsApp Tersedia' : 'Belum Ada Widget WhatsApp'}
                        </span>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: browserAuditResult.audit.hasBookingSystem ? '#dcfce7' : '#fef3c7', color: browserAuditResult.audit.hasBookingSystem ? '#15803d' : '#92400e' }}>
                          {browserAuditResult.audit.hasBookingSystem ? 'Sistem Booking Tersedia' : 'Belum Ada Sistem Booking'}
                        </span>
                        {browserAuditResult.audit.responseTimeMs > 0 && (
                          <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>
                            {(browserAuditResult.audit.responseTimeMs / 1000).toFixed(2)} dtk
                          </span>
                        )}
                      </div>
                    )}

                    {/* Recommended Solution Insertion */}
                    {browserAuditResult?.audit?.recommendedSolution && (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span>{browserAuditResult.audit.recommendedSolution}</span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSgForm(prev => ({ ...prev, observedBottleneck: browserAuditResult.audit.recommendedSolution }));
                            alert(tx('Solution copied to outreach form!', 'Solusi disalin ke form analisis masalah!'));
                          }}
                          style={{ fontSize: '0.625rem', padding: '2px 6px', minHeight: '22px', whiteSpace: 'nowrap' }}
                        >
                          Gunakan Solusi
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Prospect Crawler Error */}
                {crawlerError && (
                  <div className="alert alert-danger" style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem', margin: '0 0 0.75rem' }}>
                    <strong>Perayapan Sub-Halaman:</strong> {crawlerError}
                  </div>
                )}

                {/* Hasil Perayapan Sub-Halaman Website Klien */}
                {(crawlerPages.length > 0 || crawlerSummary) && (
                  <div style={{
                    margin: '0 0 0.75rem',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: 'rgba(240, 253, 244, 0.7)',
                    fontSize: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ color: '#065f46', fontSize: '0.78rem' }}>
                          Hasil Perayapan Sub-Halaman ({crawlerPages.length} Halaman Terindeks)
                        </strong>
                        <span style={{ fontSize: '0.625rem', padding: '1px 6px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                          Otomasi Aktif
                        </span>
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: '#047857', fontWeight: 600 }}>
                        Tersambung ke Draf AI
                      </span>
                    </div>

                    {crawlerSummary && (
                      <div style={{ color: '#166534', marginTop: '4px', marginBottom: '6px', lineHeight: 1.45 }}>
                        {crawlerSummary}
                      </div>
                    )}

                    {crawlerPages.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                        {crawlerPages.map((p, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: '0.6875rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #a7f3d0',
                              color: '#047857',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={p.url}
                          >
                            {p.title ? p.title.slice(0, 32) : (p.url.replace(/^https?:\/\/[^/]+/, '') || '/')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* State 1: Memeriksa riwayat analisis yang sudah ada di database */}
                {analysisChecking && (
                  <div className="state-container" style={{ padding: '1.25rem 1rem' }}>
                    <div className="spinner" style={{ width: '22px', height: '22px' }} />
                    <div className="state-desc" style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                      {tx('Loading company research history...', 'Memuat riwayat riset perusahaan...')}
                    </div>
                  </div>
                )}

                {/* State 2: Sedang crawling & AI LLM analysis berlangsung */}
                {!analysisChecking && analysisRunning && (
                  <div className="state-container" style={{ padding: '1.5rem 1rem' }}>
                    <div className="spinner" />
                    <div className="state-title" style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>{tx('Analyzing Company...', 'Menganalisis Perusahaan...')}</div>
                    <div className="state-desc" style={{ fontSize: '0.75rem' }}>
                      {tx('Reading website, Google Maps, and mapping AI use cases...', 'Membaca website, Google Maps, dan memetakan use case AI...')}
                    </div>
                  </div>
                )}

                {/* State 3: Tampilkan pesan error jika analisis gagal */}
                {!analysisChecking && !analysisRunning && analysisError && (
                  <div className="alert alert-danger" style={{ fontSize: '0.8125rem', padding: '0.75rem', margin: '0 0 0.75rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{tx('Analysis Execution Failed', 'Gagal Menjalankan Analisis')}</div>
                    <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem', opacity: 0.9 }}>{analysisError}</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleRunAnalysis(false)}
                        style={{ fontSize: '0.75rem', minHeight: '30px' }}
                      >
                        {tx('Try Again', 'Coba Lagi')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowManualInput(!showManualInput)}
                        style={{ fontSize: '0.75rem', minHeight: '30px' }}
                      >
                        {showManualInput ? tx('Close Manual Input', 'Tutup Input Manual') : tx('Manual Input', 'Input Manual')}
                      </button>
                    </div>
                  </div>
                )}

                {/* State 4: Belum ada analisis */}
                {!analysisChecking && !analysisRunning && !analysis && (
                  <div className="state-container" style={{ padding: '1.5rem 1rem' }}>
                    <div className="state-title" style={{ fontSize: '0.875rem' }}>{tx('No Web Analysis Yet', 'Belum Ada Analisis Web')}</div>
                    <p className="state-desc" style={{ fontSize: '0.75rem', margin: '0.25rem 0 0.75rem' }}>
                      {tx(
                        'Run automated analysis to extract operational summary and relevant use cases.',
                        'Jalankan analisis otomatis untuk mengekstrak ringkasan operasional dan use case relevan.'
                      )}
                    </p>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleRunAnalysis(false)}
                        style={{ minHeight: '34px', fontSize: '0.75rem' }}
                      >
                        <IconSearch /> {tx('Run Needs Analysis', 'Jalankan Analisis Kebutuhan')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowManualInput(!showManualInput)}
                        style={{ minHeight: '34px', fontSize: '0.75rem' }}
                      >
                        <IconEdit size={13} /> {showManualInput ? tx('Close Input', 'Tutup Input') : tx('Manual Input', 'Input Manual')}
                      </button>
                    </div>
                    {showManualInput && (
                      <div style={{ marginTop: '0.75rem', textAlign: 'left' }}>
                        <textarea
                          className="textarea-input"
                          rows={3}
                          placeholder={tx('Paste company profile or website text here...', 'Tempel profil perusahaan atau teks website di sini...')}
                          value={manualText}
                          onChange={(e) => setManualText(e.target.value)}
                          style={{ width: '100%', fontSize: '0.75rem', marginBottom: '0.375rem' }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={!manualText.trim()}
                          onClick={() => handleRunAnalysis(true)}
                          style={{ minHeight: '32px', fontSize: '0.75rem' }}
                        >
                          {tx('Analyze Text', 'Analisis Teks')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* State 5: Analisis sudah ada */}
                {!analysisChecking && !analysisRunning && analysis && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <span>
                        {tx('Analyzed:', 'Dianalisis:')} {new Date(analysis.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US')}
                      </span>
                      {analysis.source_url && (
                        <a
                          href={analysis.source_url.startsWith('http') ? analysis.source_url : `https://${analysis.source_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent-text)', textDecoration: 'underline', fontWeight: 600 }}
                        >
                          {analysis.source_url}
                        </a>
                      )}
                    </div>

                    {/* Ringkasan Bisnis */}
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.375rem' }}>
                        {tx('Operational Summary:', 'Ringkasan Operasional:')}
                      </div>
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-line' }}>
                        {analysis.summary}
                      </p>
                      {analysis.products && (
                        <div style={{ marginTop: '0.625rem', padding: '0.5rem 0.75rem', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-subtle)', fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                          <strong>{tx('Detected Products / Services:', 'Layanan & Aktivitas Terdeteksi:')}</strong>{' '}
                          <span style={{ color: 'var(--text-muted)' }}>{analysis.products}</span>
                        </div>
                      )}
                    </div>

                    {/* Needs with Evidence - Verified Facts + Proof URL */}
                    {Array.isArray(analysis.needs) && analysis.needs.filter(item => item.type === 'fakta' || !item.type).length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                          {tx('Verified Operational Facts:', 'Temuan Fakta & Bukti Sumber:')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                          {analysis.needs.filter(item => item.type === 'fakta' || !item.type).slice(0, 5).map((item, idx) => {
                            const proofUrl = (item.url && /^https?:\/\//i.test(item.url))
                              ? item.url
                              : (analysis.source_url && /^https?:\/\//i.test(analysis.source_url)
                                ? analysis.source_url
                                : (analysis.google_place?.maps_url || `https://www.google.com/search?q=${encodeURIComponent(`${place.name} ${place.address || ''}`.trim())}`));
                            return (
                              <div key={idx} className="evidence-item">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span className="tag-pill tag-fact">
                                      {tx('FACT', 'FAKTA')}
                                    </span>
                                    <strong style={{ fontSize: '0.875rem', color: 'var(--text-main)' }}>
                                      {item.need}
                                    </strong>
                                  </div>
                                  <a
                                    href={proofUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: '0.7rem',
                                      color: 'var(--accent-text)',
                                      fontWeight: 600,
                                      textDecoration: 'underline',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      flexShrink: 0,
                                    }}
                                  >
                                    <span>{tx('Verify Link', 'Cek Bukti')}</span>
                                    <IconExternalLink />
                                  </a>
                                </div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '4px' }}>
                                  {tx('Evidence:', 'Bukti:')} {item.evidence}
                                </div>
                                {item.quote && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '4px', borderLeft: '2px solid var(--border-default)', paddingLeft: '8px', lineHeight: 1.45 }}>
                                    &ldquo;{item.quote}&rdquo;
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Verified Web Citations & Sources (Always show human-clickable verification links) */}
                    {(() => {
                      const rawSources = Array.isArray(analysis.search_intelligence?.sources_cited)
                        ? analysis.search_intelligence.sources_cited
                        : [];
                      const seen = new Set();
                      const citations = [];
                      const pushCit = (url, title) => {
                        if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url) || seen.has(url)) return;
                        seen.add(url);
                        citations.push({ url, title: title || url });
                      };
                      rawSources.forEach((s) => pushCit(s?.url, s?.title));
                      if (analysis.source_url) pushCit(analysis.source_url, `Website: ${place.name}`);
                      if (analysis.google_place?.maps_url) pushCit(analysis.google_place.maps_url, `Google Maps: ${place.name}`);
                      if (Array.isArray(analysis.crawled_pages)) {
                        analysis.crawled_pages.slice(0, 4).forEach((p) => pushCit(p?.url, p?.title || p?.url));
                      }
                      pushCit(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address || ''}`.trim())}`, `Peta Lokasi: ${place.name}`);
                      pushCit(`https://www.google.com/search?q=${encodeURIComponent(`"${place.name}" ${place.address || ''}`.trim())}`, `Pencarian Google: ${place.name}`);

                      return (
                        <div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            <span>{tx('Verified Sources & Citations for Human Check:', 'Tautan Bukti & Rujukan Verifikasi Manual:')}</span>
                            <span style={{ fontSize: '0.625rem', background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                              {citations.length}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {citations.map((src, i) => (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '0.6875rem',
                                  padding: '4px 9px',
                                  background: 'var(--bg-card-subtle)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: '6px',
                                  color: 'var(--text-main)',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  maxWidth: '240px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                                title={`${src.title}\n${src.url}`}
                              >
                                <span style={{ color: 'var(--accent-text)', marginRight: '3px', fontWeight: 600 }}>[Cek]</span> {src.title || src.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Google Maps Real Data Badge */}
                    {analysis.google_place && analysis.google_place.rating && (
                      <div style={{ fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{tx('Google Maps Rating:', 'Rating Google Maps:')}</span>
                        <strong style={{ color: '#b45309' }}>{analysis.google_place.rating} / 5.0 ({analysis.google_place.user_ratings_total || 0} {tx('reviews', 'ulasan')})</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card 3: Catatan Riset Tim */}
              <div className="reach-form-card">
                <div className="reach-card-header">
                  <div className="reach-card-title">
                    <IconFileText />
                    <span>{tx('Team Research Notes', 'Catatan Riset Tim')}</span>
                  </div>
                  <span className="reach-tab-pill">{notes.length} {tx('notes', 'catatan')}</span>
                </div>

                <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <textarea
                    className="textarea-input"
                    rows={2}
                    placeholder={tx('Type research notes or call results...', 'Ketik catatan riset atau hasil telepon...')}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    style={{ minHeight: '64px', fontSize: '0.8125rem', padding: '0.625rem 0.75rem' }}
                    required
                  />
                  <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="text-input"
                      placeholder={tx('Author Name', 'Nama Penulis')}
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      style={{ flex: 1, minHeight: '36px', fontSize: '0.8125rem' }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={addingNote || !newNote.trim()}
                      style={{ minHeight: '36px', fontSize: '0.8125rem', padding: '0 1rem' }}
                    >
                      {addingNote ? tx('Saving...', 'Simpan...') : tx('Save Note', 'Simpan Catatan')}
                    </button>
                  </div>
                </form>

                {notes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {notes.map((note) => (
                      <div key={note.id} className="note-card" style={{ padding: '0.625rem 0.875rem', margin: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-app)' }}>
                        <div className="note-header" style={{ marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
                          <strong style={{ fontSize: '0.8125rem', color: 'var(--text-main)' }}>{note.author}</strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(note.created_at).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US')}
                          </span>
                        </div>
                        <p className="note-body" style={{ fontSize: '0.8125rem', margin: 0, color: 'var(--text-main)', lineHeight: 1.45 }}>{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ================= KOLOM KANAN: Email Outreach, Website Preview & Proposal ================= */}
            <div className="reach-column">

              {/* Card 2.5: Generator Email Outreach (EN / ID, Regenerate & Counter Riwayat) */}
              <div className="reach-form-card">
                <div className="reach-card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                  <div className="reach-card-title">
                    <IconMail />
                    <span>{tx('Email Outreach Generator (EN / ID)', 'Generator Email Penawaran (EN / ID)')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', borderRadius: '6px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setOutreachLang('en');
                          if (emailMode === 'ai') handleGenerateAiEmail('en', { regenerate: true });
                        }}
                        style={{
                          minHeight: '34px',
                          padding: '0 10px',
                          fontSize: '0.75rem',
                          fontWeight: outreachLang === 'en' ? 700 : 500,
                          border: 'none',
                          backgroundColor: outreachLang === 'en' ? 'var(--primary)' : 'var(--bg-app)',
                          color: outreachLang === 'en' ? '#ffffff' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        EN (English)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOutreachLang('id');
                          if (emailMode === 'ai') handleGenerateAiEmail('id', { regenerate: true });
                        }}
                        style={{
                          minHeight: '34px',
                          padding: '0 10px',
                          fontSize: '0.75rem',
                          fontWeight: outreachLang === 'id' ? 700 : 500,
                          border: 'none',
                          borderLeft: '1px solid var(--border-subtle)',
                          backgroundColor: outreachLang === 'id' ? 'var(--primary)' : 'var(--bg-app)',
                          color: outreachLang === 'id' ? '#ffffff' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        ID (Indonesia)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Telemetry Counter & Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-app)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.72rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: 'var(--text-muted)' }}>
                      <span>
                        Prospek ini: <strong style={{ color: 'var(--text-main)' }}>{emailGenStats?.placeCount || 0}x</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Hari ini: <strong style={{ color: 'var(--text-main)' }}>{emailGenStats?.todayTenantCount || 0}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Total dibuat: <strong style={{ color: 'var(--text-main)' }}>{emailGenStats?.totalTenantCount || 0}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Terakhir:{' '}
                        <strong style={{ color: 'var(--text-main)' }}>
                          {emailGenStats?.lastGeneratedAt
                            ? new Date(emailGenStats.lastGeneratedAt).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Belum ada'}
                        </strong>
                      </span>
                    </div>

                    {(emailGenStats?.recentLogs?.length > 0 || emailGenStats?.placeHistory?.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setShowGenHistory(!showGenHistory)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-text)',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 4px',
                        }}
                      >
                        {showGenHistory ? 'Tutup Riwayat' : `Riwayat (${emailGenStats?.recentLogs?.length || 0})`}
                      </button>
                    )}
                  </div>

                  {showGenHistory && (
                    <div
                      style={{
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-app)',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        maxHeight: '160px',
                        overflowY: 'auto',
                      }}
                    >
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Aktivitas Generate Email Terakhir (Akun Ini):
                      </div>
                      {(emailGenStats?.placeHistory?.length > 0 ? emailGenStats.placeHistory : emailGenStats?.recentLogs || []).map((log) => (
                        <div
                          key={log.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            fontSize: '0.72rem',
                            paddingBottom: '4px',
                            borderBottom: '1px dashed var(--border-subtle)',
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontWeight: 700, color: 'var(--accent-text)', textTransform: 'uppercase', marginRight: '6px' }}>
                              [{(log.lang || 'en').toUpperCase()}]
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {log.company_name || place.name}:
                            </span>{' '}
                            <span style={{ color: 'var(--text-muted)' }}>{log.subject}</span>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {new Date(log.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          {log.body && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-xs"
                              onClick={() => {
                                setAiEmail({ subject: log.subject, body: log.body, lang: log.lang });
                                setEmailMode('ai');
                                setOutreachLang(log.lang === 'id' ? 'id' : 'en');
                              }}
                              style={{ minHeight: '30px', fontSize: '0.7rem' }}
                            >
                              Muat
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mode Switcher + Generate / Regenerate Button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${emailMode === 'template' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setEmailMode('template')}
                        style={{ minHeight: '36px', fontSize: '0.75rem' }}
                      >
                        Template Cepat
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${emailMode === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                          setEmailMode('ai');
                          if (!aiEmail) handleGenerateAiEmail(outreachLang);
                        }}
                        style={{ minHeight: '36px', fontSize: '0.75rem' }}
                      >
                        Draf AI Personal
                      </button>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={aiEmailLoading}
                      onClick={() => handleGenerateAiEmail(outreachLang, { regenerate: true })}
                      style={{ minHeight: '38px', fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <IconRefresh />
                      <span>
                        {aiEmailLoading
                          ? `Menyusun (${outreachLang.toUpperCase()})...`
                          : ((emailGenStats?.placeCount || 0) > 0 || aiEmail)
                            ? `Generate Ulang (${outreachLang.toUpperCase()})`
                            : `Generate Email AI (${outreachLang.toUpperCase()})`}
                      </span>
                    </button>
                  </div>

                  {aiEmailError && (
                    <div className="alert alert-danger" style={{ margin: 0, fontSize: '0.75rem', padding: '6px 10px' }}>
                      {aiEmailError}
                    </div>
                  )}

                  {/* Subject & Body Inputs */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Subjek Email ({outreachLang.toUpperCase()})
                    </label>
                    <input
                      type="text"
                      className="text-input"
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      style={{ width: '100%', fontSize: '0.8125rem' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Isi Email ({emailMode === 'ai' ? 'AI Custom' : 'Template Anti-Slop'})
                      </label>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {draftBody ? draftBody.trim().split(/\s+/).filter(Boolean).length : 0} kata
                      </span>
                    </div>
                    <textarea
                      className="textarea-input"
                      rows={6}
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      style={{ width: '100%', fontSize: '0.8rem', lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Link Attachments */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={includeCalendly}
                        onChange={(e) => setIncludeCalendly(e.target.checked)}
                      />
                      <span>Sertakan link Google Calendar</span>
                    </label>
                    {prebuiltUrl && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={includePreviewLink}
                          onChange={(e) => setIncludePreviewLink(e.target.checked)}
                        />
                        <span>Sertakan link Website Preview</span>
                      </label>
                    )}
                    {existingLogs.length > 0 && (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-main)' }}>
                        <input
                          type="checkbox"
                          checked={allowFollowup}
                          onChange={(e) => setAllowFollowup(e.target.checked)}
                        />
                        <span>Izinkan follow-up ({existingLogs.length}x terkirim)</span>
                      </label>
                    )}
                  </div>

                  {/* Send / Copy Footer Buttons */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        const copied = await copyToClipboard(`${draftSubject}\n\n${draftBody}`);
                        if (copied) {
                          setSgCopyEmailSuccess(true);
                          setTimeout(() => setSgCopyEmailSuccess(false), 2500);
                        }
                      }}
                      style={{ minHeight: '38px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      {sgCopyEmailSuccess ? <><IconCheck size={13} /> Tersalin</> : <><IconCopy /> Salin Email</>}
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={sgOutreachLogging || !draftSubject.trim() || !draftBody.trim()}
                      onClick={() => handleLogSgOutreach(draftSubject, draftBody, 'gmail')}
                      style={{ minHeight: '38px', fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px', flex: 1, justifyContent: 'center' }}
                    >
                      <IconSend />
                      <span>{sgOutreachLogging ? 'Mencatat...' : 'Buka Gmail & Catat Terkirim'}</span>
                    </button>
                  </div>

                  {sgOutreachMsg && (
                    <div
                      className={`alert alert-${sgOutreachMsg.type === 'success' ? 'success' : sgOutreachMsg.type === 'warning' ? 'warning' : 'danger'}`}
                      style={{ margin: 0, fontSize: '0.75rem', padding: '6px 10px' }}
                    >
                      {sgOutreachMsg.text}
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Prebuilt Website Instant Preview */}
              <div className="reach-form-card" style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                <div className="reach-card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <div className="reach-card-title">
                    <IconGlobe />
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{tx('Prebuilt Website Preview', 'Prebuilt Website Preview')}</span>
                    {prebuiltUrl && (
                      <span className="reach-tab-pill-success" style={{ fontSize: '11px' }}>
                        {tx('Preview Ready', 'Preview Siap')} ({prebuiltSite?.slug || tx('active', 'aktif')})
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {!prebuiltUrl ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={prebuiltLoading}
                        onClick={() => handleGeneratePrebuiltSite(false)}
                        style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
                      >
                        {prebuiltLoading ? tx('Building Website...', 'Menyusun Website...') : tx('Generate Website Preview', 'Generate Website Preview')}
                      </button>
                    ) : (
                      <>
                        <a
                          href={prebuiltUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-primary btn-sm"
                          style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0.25rem 0.625rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          {tx('Open Preview', 'Buka Preview')} <IconExternalLink />
                        </a>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
                          onClick={async () => {
                            const copied = await copyToClipboard(prebuiltUrl);
                            if (copied) {
                              setCopyPrebuiltSuccess(true);
                              setTimeout(() => setCopyPrebuiltSuccess(false), 2500);
                            }
                          }}
                        >
                          {copyPrebuiltSuccess ? <><IconCheck size={13} /> {tx('Link Copied', 'Link Tersalin')}</> : <><IconCopy /> {tx('Copy Link', 'Salin Link')}</>}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={prebuiltLoading}
                          onClick={() => handleGeneratePrebuiltSite(true)}
                          style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
                          title="Buat ulang tampilan website preview terbaru"
                        >
                          <IconRefresh /> {prebuiltLoading ? 'Memperbarui...' : 'Ulang'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  {prebuiltUrl ? (
                    <div>
                      <p style={{ margin: '0 0 8px' }}>
                        {tx(
                          `A dedicated dynamic link for ${place.name} is active. You can preview it live or attach it via "Sertakan link Website Preview" above:`,
                          `Tautan halaman demo khusus untuk ${place.name} sudah aktif. Klik "Buka Preview" atau centang "Sertakan link Website Preview" di card email:`
                        )}
                      </p>
                      <div style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-subtle)', padding: '8px 10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent-text)', wordBreak: 'break-all' }}>
                        {prebuiltUrl}
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0 }}>
                      {tx(
                        `Create a tailored landing page preview for ${place.name} with verified location details, services, and booking call-to-action.`,
                        `Sistem membuatkan halaman demo khusus untuk ${place.name} lengkap dengan detail lokasi, layanan utama, serta tombol penjadwalan.`
                      )}
                    </p>
                  )}
                  {prebuiltError && (
                    <div className="alert alert-danger" style={{ marginTop: '8px', fontSize: '12px', padding: '6px 10px' }}>
                      {prebuiltError}
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Proposal Formal & Calendly (Collapsible Accordion) */}
              <div className="reach-accordion">
                <button
                  type="button"
                  className="reach-accordion-toggle"
                  onClick={() => setProposalAccordionOpen(!proposalAccordionOpen)}
                  aria-expanded={proposalAccordionOpen}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <IconFileText />
                    <span>{tx('Formal Proposal & Google Calendar', 'Proposal Formal Kemitraan & Google Calendar')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {proposal ? (
                      <span className="reach-tab-pill-success">{tx('Draft Ready', 'Draf Siap')}</span>
                    ) : (
                      <span className="reach-tab-pill">{tx('Optional', 'Opsional')}</span>
                    )}
                    {proposalAccordionOpen ? <IconChevronUp /> : <IconChevronDown />}
                  </div>
                </button>

                {proposalAccordionOpen && (
                  <div className="reach-accordion-content">
                    {/* Google Calendar Quick Buttons (Connected Schedule or Direct Redirect) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '8px', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <IconCalendar />
                          <span>{tx('Google Calendar Scheduling', 'Penjadwalan Google Calendar')}</span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              padding: '1px 7px',
                              borderRadius: '9999px',
                              backgroundColor: isCalendarConnected ? 'var(--success-bg)' : 'var(--bg-card)',
                              color: isCalendarConnected ? 'var(--success-text)' : 'var(--text-muted)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            {isCalendarConnected ? tx('Connected', 'Terhubung') : tx('Direct Redirect', 'Mode Redirect')}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {isCalendarConnected
                            ? tx('Your custom Google Calendar booking schedule link is connected.', 'Link jadwal booking Google Calendar Anda terhubung.')
                            : tx('Not connected to a custom schedule yet; buttons below open Google Calendar directly.', 'Belum dihubungkan ke jadwal kustom; tombol di bawah langsung membuka Google Calendar.')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <a
                          href={googleCalendarEventUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-primary btn-sm"
                          style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                        >
                          <IconCalendar /> {tx('Create Event in Google Calendar', 'Buat Jadwal di Google Calendar')} <IconExternalLink />
                        </a>
                        <a
                          href={isCalendarConnected ? calendlyUrl : 'https://calendar.google.com'}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-sm"
                          style={{ minHeight: '36px', fontSize: '0.75rem', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                        >
                          {isCalendarConnected ? tx('Connected Booking Link', 'Link Booking Terhubung') : tx('Open Google Calendar', 'Buka Google Calendar')} <IconExternalLink />
                        </a>
                      </div>
                    </div>

                    {/* Proposal Draft Section */}
                    {!proposal && !proposalLoading && (
                      <div className="state-container" style={{ padding: '1.5rem 1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                        <div className="state-title" style={{ fontSize: '0.875rem' }}>{tx('No Proposal Created Yet', 'Proposal Belum Dibuat')}</div>
                        <p className="state-desc" style={{ fontSize: '0.75rem', margin: '0.25rem auto 0.75rem', maxWidth: '420px' }}>
                          {tx(
                            'Draft a formal partnership proposal if the prospective client requests one:',
                            'Susun draf proposal kemitraan resmi jika calon klien meminta proposal formal:'
                          )}
                        </p>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={!analysis}
                            onClick={() => handleGenerateProposal('en')}
                            style={{ minHeight: '34px', fontSize: '0.75rem' }}
                          >
                            <IconFileText /> {tx('Draft Proposal (EN)', 'Susun Proposal (EN)')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!analysis}
                            onClick={() => handleGenerateProposal('id')}
                            style={{ minHeight: '34px', fontSize: '0.75rem' }}
                          >
                            <IconFileText /> {tx('Draft Proposal (ID)', 'Susun Proposal (ID)')}
                          </button>
                        </div>
                        {!analysis && (
                          <div style={{ color: 'var(--warning-text)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                            {tx(
                              'Run web analysis first so the proposal can be generated with research data.',
                              'Jalankan analisis web terlebih dahulu agar proposal otomatis terisi.'
                            )}
                          </div>
                        )}
                        {proposalError && (
                          <div className="alert alert-danger" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                            {proposalError}
                          </div>
                        )}
                      </div>
                    )}

                    {proposalLoading && (
                      <div className="state-container" style={{ padding: '2rem 1rem' }}>
                        <div className="spinner" />
                        <div className="state-title" style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>{tx('Drafting Proposal...', 'Menyusun Draf Proposal...')}</div>
                      </div>
                    )}

                    {proposal && !proposalLoading && (
                      <div style={{ background: 'var(--bg-card)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '6px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', minHeight: '32px' }}
                              onClick={() => handleGenerateProposal('en')}
                              disabled={proposalLoading}
                            >
                              EN
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', minHeight: '32px' }}
                              onClick={() => handleGenerateProposal('id')}
                              disabled={proposalLoading}
                            >
                              ID
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setIsEditingProposal(!isEditingProposal)}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', minHeight: '32px' }}
                            >
                              {isEditingProposal ? <><IconEye /> Pratinjau</> : <><IconEdit size={13} /> Edit</>}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={handleCopyToClipboard}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', minHeight: '32px' }}
                            >
                              {copySuccess ? <><IconCheck size={13} /> Tersalin</> : <><IconCopy /> Salin</>}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={handleDownloadDoc}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', minHeight: '32px' }}
                            >
                              <IconDownload /> .doc
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={handleDownloadMarkdown}
                              style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', minHeight: '32px' }}
                            >
                              <IconDownload /> .md
                            </button>
                          </div>
                        </div>

                        {isEditingProposal ? (
                          <div>
                            <textarea
                              className="textarea-input"
                              rows={12}
                              value={proposalContent}
                              onChange={(e) => setProposalContent(e.target.value)}
                              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.5 }}
                            />
                            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => {
                                  setProposalContent(proposal.content);
                                  setIsEditingProposal(false);
                                }}
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={savingProposal}
                                onClick={handleSaveProposal}
                              >
                                {savingProposal ? 'Menyimpan...' : 'Simpan'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="proposal-preview-box">
                            <ProposalViewer content={proposalContent} companyName={place.name} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
