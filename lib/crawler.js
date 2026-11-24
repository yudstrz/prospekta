// Modul penelusuran web multi-halaman untuk riset profil bisnis dan kontak
import * as cheerio from 'cheerio';

const CRAWL_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Prospekta/2.0';
const TIMEOUT_MS = 8000;
const MAX_TOTAL_SUBPAGES = 12;
const MAX_TOTAL_TEXT_CHARS = 25000;

// Tracking query parameters to strip for canonicalization
const STRIP_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref', 'source', 'session_id', 'trk'
]);

/**
 * SSRF Guard: Validate that target URL is a safe public web address
 */
function isSafePublicUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();

    // Block loopback, link-local, cloud instance metadata, and private IP ranges
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === '0.0.0.0' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal' ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Fetch HTML with HTTPS-to-HTTP automatic fallback, timeout protection, and browser headers
 */
async function fetchWithFallback(url, timeoutMs = TIMEOUT_MS) {
  let target = url.trim();
  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    target = 'https://' + target;
  }

  if (!isSafePublicUrl(target)) {
    return null;
  }

  // 1. Attempt HTTPS
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(target, {
      signal: controller.signal,
      headers: {
        'User-Agent': CRAWL_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-SG,en;q=0.9,id;q=0.8,en-US;q=0.7',
        'Cache-Control': 'no-cache'
      },
      redirect: 'follow'
    });
    clearTimeout(timer);
    if (res.ok) {
      const cType = res.headers.get('content-type') || '';
      if (cType.includes('text/html') || cType.includes('application/xhtml+xml')) {
        return { html: await res.text(), effectiveUrl: res.url };
      }
    }
  } catch (err) {
    // If HTTPS failed and target began with https://, try HTTP fallback
    if (target.startsWith('https://')) {
      const httpTarget = target.replace(/^https:\/\//i, 'http://');
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(httpTarget, {
          signal: controller.signal,
          headers: {
            'User-Agent': CRAWL_USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          redirect: 'follow'
        });
        clearTimeout(timer);
        if (res.ok) {
          const cType = res.headers.get('content-type') || '';
          if (cType.includes('text/html') || cType.includes('application/xhtml+xml')) {
            return { html: await res.text(), effectiveUrl: res.url };
          }
        }
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Clean, canonicalize, and filter out URL traps, media assets, and legal pages
 */
function cleanAndCanonicalizeUrl(rawHref, baseUrl) {
  if (!rawHref) return null;
  const trimmed = rawHref.trim();
  if (
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('#') ||
    trimmed === '#'
  ) {
    return null;
  }

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(trimmed, baseUrl);

    // Domain check: allow same base host or subdomains of same root domain
    const baseHost = base.hostname.toLowerCase().replace(/^www\./, '');
    const resHost = resolved.hostname.toLowerCase().replace(/^www\./, '');
    const isSameDomain = resHost === baseHost || resHost.endsWith('.' + baseHost) || baseHost.endsWith('.' + resHost);
    if (!isSameDomain) return null;

    resolved.hash = '';

    // Strip tracking parameters
    const toDelete = [];
    for (const [k] of resolved.searchParams) {
      const lowerK = k.toLowerCase();
      if (STRIP_PARAMS.has(lowerK) || lowerK.startsWith('utm_')) {
        toDelete.push(k);
      }
    }
    toDelete.forEach((k) => resolved.searchParams.delete(k));

    // Filter out query traps: pagination, date archives, sorting
    const searchStr = resolved.search.toLowerCase();
    if (/page=|p=|filter=|sort=|orderby=|date=|month=|year=|replytocom=/i.test(searchStr)) {
      return null;
    }

    // Filter out static media assets & document files
    if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|rar|mp4|mp3|doc|docx|xls|xlsx|css|js|webp|ico|xml|json|map)$/i.test(resolved.pathname)) {
      return null;
    }

    // Filter out legal boilerplate & authentication traps
    const pathLower = resolved.pathname.toLowerCase();
    if (/(?:privacy-policy|terms-of-service|terms-and-conditions|cookie-policy|disclaimer|login|signin|register|signup|cart|checkout|wp-admin|wp-login|feed|rss)/i.test(pathLower)) {
      return null;
    }

    // Normalize trailing slash for directories vs files
    let cleanHref = resolved.href;
    if (cleanHref.endsWith('/') && resolved.pathname !== '/') {
      cleanHref = cleanHref.slice(0, -1);
    }
    return cleanHref;
  } catch (_) {
    return null;
  }
}

/**
 * Score relevance of a link based on its URL pathname and anchor text
 */
function scoreLinkRelevance(pathname, anchorText) {
  const combined = (pathname + ' ' + anchorText).toLowerCase();
  let score = 10;

  // Management & Leadership (Highest value for outreach PIC identification)
  if (/team|management|leadership|directors|board|founder|executive|key-people|our-people|our-team/i.test(combined)) {
    score += 90;
  }

  // Core Services, Solutions & Products (Critical for AI Use Case matching)
  if (/services|service|layanan|jasa|products|product|produk|solutions|solution|solusi|capabilities|what-we-do|offerings|technology|fleet|systems|divisions/i.test(combined)) {
    score += 85;
  }

  // Operational Workflows, Methodology, Client Portals & Industry Verticals
  if (/process|how-it-works|workflow|methodology|employers|job-seekers|candidates|industries|industry|faq|portal/i.test(combined)) {
    score += 82;
  }

  // Company Profile & About Us
  if (/about|tentang|profile|company|who-we-are|our-story|overview|history|corporate/i.test(combined)) {
    score += 80;
  }

  // Contact & Locations
  if (/contact|kontak|hubungi|reach|location|locations|office|enquiry|get-in-touch|find-us/i.test(combined)) {
    score += 75;
  }

  // Portfolio, Case Studies, Clients
  if (/portfolio|projects|project|clients|cases|case-studies|track-record|work|project_lists/i.test(combined)) {
    score += 70;
  }

  // Pricing / Career
  if (/pricing|rates|careers|karir/i.test(combined)) {
    score += 40;
  }

  return score;
}

/**
 * Cloudflare email deobfuscator (recovers emails protected by Cloudflare)
 */
function decodeCfEmail(cfemail) {
  if (!cfemail || typeof cfemail !== 'string') return null;
  try {
    let email = '';
    const r = parseInt(cfemail.substr(0, 2), 16);
    for (let n = 2; n < cfemail.length; n += 2) {
      email += String.fromCharCode(parseInt(cfemail.substr(n, 2), 16) ^ r);
    }
    return email.includes('@') ? email.trim().toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Normalizes phone numbers into canonical international format and classifies line type
 */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits || digits.length < 7) return null;

  // Singapore numbers (+65)
  if (digits.startsWith('65') && digits.length === 10) {
    const local = digits.slice(2);
    const prefix = local[0];
    const type = (prefix === '8' || prefix === '9') ? 'mobile' : (prefix === '3' || prefix === '6') ? 'landline' : 'other';
    return {
      formatted: `+65 ${local.slice(0, 4)} ${local.slice(4)}`,
      digits: digits,
      type,
      label: type === 'mobile' ? 'Mobile / WA' : type === 'landline' ? 'Kantor' : 'Telepon'
    };
  }

  // 8-digit SG local number without country code
  if (digits.length === 8 && /^[3689]/.test(digits)) {
    const prefix = digits[0];
    const type = (prefix === '8' || prefix === '9') ? 'mobile' : (prefix === '3' || prefix === '6') ? 'landline' : 'other';
    return {
      formatted: `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`,
      digits: `65${digits}`,
      type,
      label: type === 'mobile' ? 'Mobile / WA' : type === 'landline' ? 'Kantor' : 'Telepon'
    };
  }

  // Indonesia numbers (+62)
  if (digits.startsWith('62') && digits.length >= 10 && digits.length <= 13) {
    const isMobile = digits.startsWith('628');
    return {
      formatted: `+62 ${digits.slice(2)}`,
      digits: digits,
      type: isMobile ? 'mobile' : 'landline',
      label: isMobile ? 'Mobile / WA' : 'Kantor'
    };
  }
  if (digits.startsWith('08') && digits.length >= 10 && digits.length <= 13) {
    return {
      formatted: `+62 ${digits.slice(1)}`,
      digits: `62${digits.slice(1)}`,
      type: 'mobile',
      label: 'Mobile / WA'
    };
  }

  // Generic international numbers (E.164)
  return {
    formatted: `+${digits}`,
    digits: digits,
    type: 'other',
    label: 'Telepon'
  };
}

/**
 * Infer human name and role from a work email address (e.g. jeffreyong@hlf.com.sg -> Jeffrey Ong)
 */
export function inferPersonFromEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const username = email.split('@')[0].toLowerCase().trim();
  const genericPrefixes = new Set([
    'info', 'contact', 'admin', 'enquiries', 'enquiry', 'support', 'sales',
    'help', 'office', 'service', 'services', 'hello', 'mail', 'billing',
    'finance', 'marketing', 'career', 'careers', 'hr', 'inquiry', 'general',
    'custserv', 'customer', 'customercare', 'feedback', 'team', 'jobs'
  ]);
  if (genericPrefixes.has(username)) return null;

  // Pattern 1: first.last or first_last or first-last (e.g. john.doe, tan.wei.ming)
  if (username.includes('.') || username.includes('_') || username.includes('-')) {
    const parts = username.split(/[._-]/).filter((p) => p.length >= 2 && !/^\d+$/.test(p));
    if (parts.length >= 2) {
      const name = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
      return { name, title: 'PIC / Kontak Terverifikasi', email, role_category: 'branch' };
    }
  }

  // Pattern 2: common western/asian combined names (ordered longest first to prevent greedy substring mismatch)
  const commonSurnames = [
    'leong', 'chong', 'smith', 'brown', 'wilson', 'johnson', 'williams', 'taylor',
    'tan', 'lee', 'lim', 'ong', 'ng', 'wong', 'goh', 'teo', 'ho', 'tay', 'koh',
    'chan', 'chua', 'chia', 'yeo', 'sim', 'low', 'toh', 'ang', 'tang',
    'chen', 'wang', 'zhang', 'liu', 'yang', 'huang', 'zhao', 'wu', 'zhou', 'lin'
  ];
  for (const sur of commonSurnames) {
    if (username.length > sur.length + 2 && username.endsWith(sur)) {
      const first = username.slice(0, -sur.length);
      if (/^[a-z]+$/.test(first)) {
        const name = (first[0].toUpperCase() + first.slice(1)) + ' ' + (sur[0].toUpperCase() + sur.slice(1));
        return { name, title: 'PIC / Kontak Terverifikasi', email, role_category: 'branch' };
      }
    }
  }

  return null;
}

/**
 * Extract structured metadata, JSON-LD Schema.org data, and OpenGraph tags
 */
function extractStructuredSignals(html) {
  if (!html) return { structuredHeader: '', signals: { emails: [], phones: [], sameAs: [], picCandidates: [] } };
  const $ = cheerio.load(html);

  const metaTitle = $('title').first().text().replace(/\s+/g, ' ').trim();
  const metaDesc = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  ).replace(/\s+/g, ' ').trim();
  const ogSiteName = ($('meta[property="og:site_name"]').attr('content') || '').trim();

  const orgInfo = [];
  const signals = { emails: [], phones: [], sameAs: [], picCandidates: [] };

  // Parse JSON-LD Schema.org Organization / LocalBusiness / Person
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).text();
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'] || '';

        // Organization / LocalBusiness
        if (/Organization|LocalBusiness|Corporation|ProfessionalService|Company|Store|MedicalBusiness/i.test(type)) {
          if (item.name) orgInfo.push(`Nama Entitas: ${item.name}`);
          if (item.telephone) {
            signals.phones.push(item.telephone);
            orgInfo.push(`Telepon Resmi: ${item.telephone}`);
          }
          if (item.email) {
            signals.emails.push(item.email);
            orgInfo.push(`Email Resmi: ${item.email}`);
          }
          if (item.description) orgInfo.push(`Deskripsi Resmi: ${item.description}`);
          if (item.address) {
            const addr = typeof item.address === 'object'
              ? [item.address.streetAddress, item.address.addressLocality, item.address.postalCode, item.address.addressCountry].filter(Boolean).join(', ')
              : item.address;
            orgInfo.push(`Alamat Resmi: ${addr}`);
          }
          if (item.sameAs) {
            const sameList = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
            signals.sameAs.push(...sameList);
            orgInfo.push(`Tautan Resmi: ${sameList.join(', ')}`);
          }
          if (item.founder?.name) {
            orgInfo.push(`Founder: ${item.founder.name}`);
            signals.picCandidates.push({ name: item.founder.name, title: 'Founder' });
          }
        }

        // Schema.org Person
        if (/Person/i.test(type)) {
          if (item.name) {
            signals.picCandidates.push({
              name: item.name,
              title: item.jobTitle || item.description || 'Pimpinan'
            });
          }
        }
      }
    } catch (_) {}
  });

  let structuredHeader = '';
  if (metaTitle || metaDesc || orgInfo.length > 0) {
    structuredHeader = [
      '=== METADATA & DATA TERSTRUKTUR RESMI ===',
      metaTitle ? `Judul Situs: ${metaTitle}` : null,
      metaDesc ? `Deskripsi Meta: ${metaDesc}` : null,
      ogSiteName ? `Nama Brand: ${ogSiteName}` : null,
      ...orgInfo
    ].filter(Boolean).join('\n');
  }

  return { structuredHeader, signals };
}

/**
 * Extracts clean main text, preserving tab panels, accordions, modals, and footers
 */
function cleanPageText(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg, canvas').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

/**
 * Extracts public contact signals (emails, phones, WhatsApp, LinkedIn, PIC) with
 * fax rejection, Cloudflare deobfuscation, and canonical deduplication
 */
function extractSignals(html, cleanText = '') {
  if (!html) {
    return {
      hasWhatsApp: false,
      whatsapp: null,
      linkedinUrl: null,
      picLinkedinUrl: null,
      hasBooking: false,
      emails: [],
      emailsDetailed: [],
      phones: [],
      phonesDetailed: [],
      primaryPhone: null,
      secondaryPhone: null,
      picCandidates: []
    };
  }

  const $ = cheerio.load(html);
  const lower = html.toLowerCase();

  // 1. WhatsApp detection
  let whatsapp = null;
  const waMatch = html.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?([0-9+]+)/i);
  if (waMatch && waMatch[1]) {
    const rawWa = waMatch[1].replace(/[^0-9]/g, '');
    const normWa = normalizePhone(rawWa);
    if (normWa) whatsapp = normWa.formatted;
  }

  // 2. LinkedIn detection: company page vs PIC personal profile
  let linkedinUrl = null;
  let picLinkedinUrl = null;

  $('a[href*="linkedin.com"]').each((_, el) => {
    const href = ($(el).attr('href') || '').split('?')[0].trim();
    if (/linkedin\.com\/(?:company|school)\/[a-zA-Z0-9_\-\.%]+/i.test(href)) {
      if (!linkedinUrl) linkedinUrl = href;
    } else if (/linkedin\.com\/in\/[a-zA-Z0-9_\-\.%]+/i.test(href)) {
      if (!picLinkedinUrl) picLinkedinUrl = href;
    }
  });

  const hasWhatsApp = Boolean(whatsapp) || lower.includes('wa.me') || lower.includes('whatsapp') || lower.includes('api.whatsapp.com');
  const hasBooking = lower.includes('booking') || lower.includes('reservasi') || lower.includes('janji temu') || lower.includes('schedule') || lower.includes('appointment');

  // 3. Email extraction & Cloudflare deobfuscation
  const emailsMap = new Map();

  // Decode Cloudflare email protection
  $('[data-cfemail]').each((_, el) => {
    const cf = $(el).attr('data-cfemail');
    const decoded = decodeCfEmail(cf);
    if (decoded) {
      emailsMap.set(decoded, { email: decoded, type: 'general', label: 'Umum' });
    }
  });

  // Mailto links
  $('a[href^="mailto:"]').each((_, el) => {
    const raw = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    if (raw && raw.includes('@') && !raw.includes('example.com') && !raw.includes('sentry.io') && !raw.includes('wixpress.com')) {
      emailsMap.set(raw, { email: raw, type: 'general', label: 'Umum' });
    }
  });

  // Raw HTML text emails
  const textEmails = html.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  for (const m of textEmails) {
    const email = m[0].trim().toLowerCase();
    if (
      email &&
      !email.endsWith('.png') &&
      !email.endsWith('.jpg') &&
      !email.endsWith('.jpeg') &&
      !email.endsWith('.webp') &&
      !email.endsWith('.svg') &&
      !email.includes('example.com') &&
      !email.includes('sentry.io') &&
      !email.includes('wixpress.com') &&
      !email.includes('domain.com')
    ) {
      if (!emailsMap.has(email)) {
        emailsMap.set(email, { email, type: 'general', label: 'Umum' });
      }
    }
  }

  // Classify emails by department / role
  const emailsDetailed = Array.from(emailsMap.values()).map((item) => {
    const localPart = item.email.split('@')[0];
    if (/sales|commercial|bd|marketing|business|partnership|deal/i.test(localPart)) {
      return { ...item, type: 'sales', label: 'Sales / BD' };
    }
    if (/tech|technical|engineer|support|service|ops|rollingstock|afloat/i.test(localPart)) {
      return { ...item, type: 'technical', label: 'Operasional / Teknis' };
    }
    if (/info|enquiry|inquiry|contact|admin|office|hello|general/i.test(localPart)) {
      return { ...item, type: 'general', label: 'Umum / Inquiry' };
    }
    return { ...item, type: 'pic', label: 'PIC Personal' };
  });

  // Rank emails by outreach priority: PIC > Sales > Technical > General
  emailsDetailed.sort((a, b) => {
    const score = { pic: 4, sales: 3, technical: 2, general: 1 };
    return (score[b.type] || 0) - (score[a.type] || 0);
  });

  // 4. Phone extraction with FAX Filtering & Deduplication
  const phoneMap = new Map();

  // Scan tel: links
  $('a[href^="tel:"]').each((_, el) => {
    const raw = ($(el).attr('href') || '').replace(/^tel:/i, '').split('?')[0].trim();
    const parentText = $(el).parent().text().toLowerCase();
    const isFax = /fax|facsimile|f:|\bfx\b/i.test(parentText);
    if (!isFax) {
      const norm = normalizePhone(raw);
      if (norm && !phoneMap.has(norm.digits)) {
        phoneMap.set(norm.digits, norm);
      }
    }
  });

  // Scan text elements for SG & ID phone patterns, rejecting Fax
  $('p, td, li, div, span').each((_, el) => {
    if ($(el).children().length > 4) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;

    const matches = text.matchAll(/(?:\+?65[\s-]?[3689][0-9]{3}[\s-]?[0-9]{4})|(?:\+?62[\s-]?[8][0-9]{2,3}[\s-]?[0-9]{3,5}[\s-]?[0-9]{3,5})/gi);
    for (const m of matches) {
      const numStr = m[0].trim();
      const matchIdx = m.index;
      const preceding = text.slice(Math.max(0, matchIdx - 35), matchIdx).toLowerCase();
      const parentHtml = $(el).html() || '';

      const isFax = /fax|facsimile|f:|\bfx\b|fa-fax/i.test(preceding) || /fa-fax|class=["'][^"']*fax/i.test(parentHtml);
      if (!isFax) {
        const norm = normalizePhone(numStr);
        if (norm && !phoneMap.has(norm.digits)) {
          phoneMap.set(norm.digits, norm);
        }
      }
    }
  });

  const phonesDetailed = Array.from(phoneMap.values());
  // Sort phones: landline first, mobile second, other third
  phonesDetailed.sort((a, b) => {
    const score = { landline: 2, mobile: 1, other: 0 };
    return (score[b.type] || 0) - (score[a.type] || 0);
  });

  const primaryPhone = phonesDetailed[0]?.formatted || null;
  const secondaryPhone = (phonesDetailed.length > 1 && phonesDetailed[1]?.digits !== phonesDetailed[0]?.digits)
    ? phonesDetailed[1].formatted
    : null;

  // Auto-detect whatsapp from mobile number if not already detected
  if (!whatsapp) {
    const mob = phonesDetailed.find((p) => p.type === 'mobile');
    if (mob) whatsapp = mob.formatted;
  }

  // 5. PIC Candidates from HTML team structures & inferred email identities
  const picCandidates = [];
  const addedNames = new Set();

  // Deduce from discovered emails first
  emailsDetailed.forEach((e) => {
    const inferred = inferPersonFromEmail(e.email);
    if (inferred && !addedNames.has(inferred.name.toLowerCase())) {
      addedNames.add(inferred.name.toLowerCase());
      picCandidates.push(inferred);
    }
  });

  // Extract from HTML team/leadership structures
  $('h1, h2, h3, h4, h5, strong, b, .team-member, .person-name').each((_, el) => {
    const heading = $(el).text().replace(/\s+/g, ' ').trim();
    const isCorporateTerm = /division|department|solutions|services|pte|ltd|inc|group|center|centre|hub|office|products|project|client|rolling\s*stock|afloat|engineering|supply|procurement|testimonial|milestone|award|serving|years|anniversary/i.test(heading);
    if (!isCorporateTerm && heading.length > 3 && heading.length < 35 && !heading.includes('http') && !/services|about|contact|office|singapore|disclaimer|terms/i.test(heading)) {
      const nextSiblingText = $(el).next().text().trim() || $(el).parent().text().trim();
      const roleMatch = nextSiblingText.match(/(?:Managing Director|Executive Director|Director|CEO|Chief Executive Officer|Founder|Co-Founder|General Manager|Branch Manager|Principal|Partner|Head of [A-Za-z]+|HR Manager|President)/i);
      if (roleMatch && !addedNames.has(heading.toLowerCase())) {
        addedNames.add(heading.toLowerCase());
        const isExec = /director|ceo|founder|president/i.test(roleMatch[0]);
        const isHr = /hr|human resources|people/i.test(roleMatch[0]);
        picCandidates.push({
          name: heading,
          title: roleMatch[0],
          role_category: isExec ? 'executive' : isHr ? 'hr' : 'management'
        });
      }
    }
  });

  return {
    hasWhatsApp,
    whatsapp,
    linkedinUrl,
    picLinkedinUrl,
    hasBooking,
    emails: emailsDetailed.map((e) => e.email),
    emailsDetailed,
    phones: phonesDetailed.map((p) => p.formatted),
    phonesDetailed,
    primaryPhone,
    secondaryPhone,
    picCandidates: picCandidates.slice(0, 3)
  };
}

/**
 * Filter out monochrome / neutral colors (black, white, greys)
 * so we capture the true vivid brand hue (e.g. H&M Red #E50010, DSV Blue #002664)
 */
function isNeutralColor(hex) {
  if (!hex || !hex.startsWith('#')) return true;
  let clean = hex.slice(1);
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  if (clean.length !== 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Neutral if difference between RGB channels is small (< 22) or too extreme white/black
  return (max - min) < 22 || (r > 245 && g > 245 && b > 245) || (r < 18 && g < 18 && b < 18);
}

/**
 * Extract authentic visual assets: brand colors, logo SVG/image, real hero/product photos, nav links, and headings
 */
function extractVisualAssets(html, baseUrl) {
  const cleanWixUrl = (u) => {
    if (!u || typeof u !== 'string') return u;
    return u.replace(/\/v1\/(fill|crop|fit)\/.*$/, '');
  };

  const visual = {
    logoUrl: null,
    brandColors: {
      primary: null,
      secondary: null,
      accent: null,
      lightTint: null,
      candidates: []
    },
    realImages: [],
    navLinks: [],
    headings: []
  };

  if (!html) return visual;
  const $ = cheerio.load(html);

  // 1. Color Extraction with strict saturation filtering
  const colorFrequency = new Map();
  const addColor = (rawHex, weight = 1) => {
    if (!rawHex) return;
    const match = String(rawHex).trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i);
    if (!match) return;
    let hex = match[0].toUpperCase();
    if (hex.length === 4) {
      hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    if (isNeutralColor(hex)) return;
    colorFrequency.set(hex, (colorFrequency.get(hex) || 0) + weight);
  };

  // SVG fills in header/nav/logo elements (Gold standard: exact trademark brand color)
  $('header svg, nav svg, .logo svg, svg.logo, [class*="logo"] svg, [id*="logo"] svg').each((_, el) => {
    const fill = $(el).attr('fill') || $(el).find('[fill]').first().attr('fill');
    if (fill && fill.startsWith('#')) addColor(fill, 120);
  });

  // Meta theme-color & msapplication-TileColor
  const metaTheme = $('meta[name="theme-color"]').attr('content');
  if (metaTheme && metaTheme.startsWith('#')) addColor(metaTheme, 100);
  const msTile = $('meta[name="msapplication-TileColor"]').attr('content');
  if (msTile && msTile.startsWith('#')) addColor(msTile, 80);

  // CSS variables in <style>
  $('style').each((_, el) => {
    const css = $(el).text();
    const varMatches = css.matchAll(/--(?:primary|brand|theme|main|accent)(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/gi);
    for (const vm of varMatches) {
      addColor(vm[1], 70);
    }
  });

  // Header / nav background styles
  $('header, nav, .header, .navbar').each((_, el) => {
    const style = $(el).attr('style') || '';
    const bgMatch = style.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/i);
    if (bgMatch) addColor(bgMatch[1], 50);
  });

  // Hex colors occurring across document
  const allHexMatches = html.matchAll(/#([0-9a-fA-F]{6})\b/g);
  for (const m of allHexMatches) {
    addColor(m[0], 1);
  }

  const sortedColors = Array.from(colorFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  visual.brandColors.candidates = sortedColors.slice(0, 5);
  if (sortedColors.length > 0) {
    visual.brandColors.primary = sortedColors[0];
    visual.brandColors.secondary = sortedColors[1] || sortedColors[0];
    visual.brandColors.accent = sortedColors[2] || sortedColors[0];
    visual.brandColors.lightTint = `${sortedColors[0]}12`;
  }

  // 2. Real Brand Logo Discovery
  const logoCandidates = [];
  $('img[src*="logo" i], img[alt*="logo" i], header img, nav img, .logo img, [class*="brand"] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset');
    if (src && !src.includes('data:image') && !src.includes('loader') && !src.includes('pixel') && !src.includes('spacer')) {
      const cleanSrc = src.split(',')[0].trim().split(' ')[0];
      try {
        const fullHref = cleanWixUrl(new URL(cleanSrc, baseUrl).href);
        logoCandidates.push(fullHref);
      } catch (_) {}
    }
  });

  // Favicon links (svg / png / ico)
  $('link[rel*="icon"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.includes('data:image')) {
      try {
        logoCandidates.push(new URL(href, baseUrl).href);
      } catch (_) {}
    }
  });

  const ogImg = $('meta[property="og:image"]').attr('content');
  if (ogImg && !ogImg.includes('data:image')) {
    try {
      logoCandidates.push(new URL(ogImg, baseUrl).href);
    } catch (_) {}
  }

  visual.logoUrl = logoCandidates.find(u => /\.svg(\?|$)/i.test(u) && /logo|brand/i.test(u))
    || logoCandidates.find(u => /logo|brand/i.test(u))
    || logoCandidates.find(u => /\.svg(\?|$)/i.test(u))
    || logoCandidates[0]
    || null;

  // 3. Real Content Images Extraction
  const imageMap = new Map();
  $('img, picture source, [style*="background-image"]').each((_, el) => {
    let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('srcset');
    let alt = $(el).attr('alt') || $(el).attr('title') || '';

    const style = $(el).attr('style') || '';
    const bgMatch = style.match(/background-image\s*:\s*url\(['"]?([^'")]+)['"]?\)/i);
    if (!src && bgMatch) {
      src = bgMatch[1];
    }

    if (!src) return;
    if (src.includes('data:image') || src.includes('pixel') || src.includes('1x1') || src.includes('loader') || src.includes('spacer') || src.includes('placeholder')) {
      return;
    }

    const cleanSrc = src.split(',')[0].trim().split(' ')[0];
    try {
      const fullUrl = cleanWixUrl(new URL(cleanSrc, baseUrl).href);
      if (
        fullUrl.includes('facebook') || fullUrl.includes('twitter') || fullUrl.includes('instagram') ||
        fullUrl.includes('linkedin') || fullUrl.includes('youtube') || fullUrl.endsWith('.ico')
      ) {
        return;
      }

      if (!imageMap.has(fullUrl)) {
        imageMap.set(fullUrl, {
          src: fullUrl,
          alt: alt.replace(/\s+/g, ' ').trim()
        });
      }
    } catch (_) {}
  });

  visual.realImages = Array.from(imageMap.values()).slice(0, 15);

  // 4. Nav Links
  $('header nav a, nav a, .nav-menu a, header a').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && text.length > 2 && text.length < 30 && !visual.navLinks.includes(text) && !/login|sign in|cart/i.test(text)) {
      visual.navLinks.push(text);
    }
  });
  visual.navLinks = visual.navLinks.slice(0, 6);

  // 5. Headings
  $('h1, h2').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && text.length > 5 && text.length < 90 && !visual.headings.includes(text)) {
      visual.headings.push(text);
    }
  });
  visual.headings = visual.headings.slice(0, 8);

  return visual;
}

/**
 * Universal Multi-Hop Deep Crawler:
 * - Resilient HTTPS-to-HTTP fallback with redirect tracking
 * - Structured Schema.org JSON-LD and OpenGraph metadata extraction
 * - Comprehensive internal link discovery (anchors, buttons, mobile menus, drawers)
 * - XML Sitemap (/sitemap.xml) automated inspection if homepage links are sparse
 * - 2-Hop catalog discovery to reach sub-services and detailed product lists
 * - Concurrent subpage fetching with timeout guardrails
 * - De-duplicated contact & phone signals extraction
 * - Deep visual asset extraction: brand colors, official logo, authentic product & hero photography
 */
export async function crawlCompanyWebsite(url, options = {}) {
  if (!url) return { success: false, text: '', signals: {}, visualAssets: null, crawledPages: [], totalPages: 0 };

  const { fastMode = false, maxSubpages = MAX_TOTAL_SUBPAGES } = (typeof options === 'object' && options) ? options : {};
  const pageTimeout = fastMode ? 3500 : TIMEOUT_MS;

  const fetchRes = await fetchWithFallback(url, pageTimeout);
  if (!fetchRes) {
    return {
      success: false,
      error: 'Situs tidak dapat dijangkau via HTTPS maupun HTTP.',
      text: '',
      signals: {},
      visualAssets: null,
      crawledPages: [],
      totalPages: 0
    };
  }

  try {
    const { html: homeHtml, effectiveUrl } = fetchRes;
    const parsedBase = new URL(effectiveUrl);
    const origin = parsedBase.origin;

    const crawledUrls = new Set([effectiveUrl]);
    const homeText = cleanPageText(homeHtml);
    const { structuredHeader, signals: structSignals } = extractStructuredSignals(homeHtml);
    const homeSignals = extractSignals(homeHtml, homeText);
    const homeVisual = extractVisualAssets(homeHtml, effectiveUrl);

    // Multi-signal aggregate registries
    const aggregatePhones = new Map();
    const aggregateEmails = new Map();
    const aggregatePics = new Map();
    const aggregateImages = new Map(homeVisual.realImages.map((img) => [img.src, img]));
    let finalLogoUrl = homeVisual.logoUrl;
    let finalBrandColors = homeVisual.brandColors;
    const finalNavLinks = [...homeVisual.navLinks];
    const finalHeadings = [...homeVisual.headings];
    let aggregateWhatsapp = homeSignals.whatsapp || null;
    let aggregateCompanyLinkedin = homeSignals.linkedinUrl || null;
    let aggregatePicLinkedin = homeSignals.picLinkedinUrl || null;

    const mergeSignals = (sig) => {
      if (!sig) return;
      if (sig.phonesDetailed && sig.phonesDetailed.length > 0) {
        sig.phonesDetailed.forEach((p) => {
          if (!aggregatePhones.has(p.digits)) aggregatePhones.set(p.digits, p);
        });
      } else if (sig.phones) {
        sig.phones.forEach((raw) => {
          const norm = normalizePhone(raw);
          if (norm && !aggregatePhones.has(norm.digits)) aggregatePhones.set(norm.digits, norm);
        });
      }
      if (sig.emailsDetailed && sig.emailsDetailed.length > 0) {
        sig.emailsDetailed.forEach((e) => {
          if (!aggregateEmails.has(e.email)) aggregateEmails.set(e.email, e);
        });
      } else if (sig.emails) {
        sig.emails.forEach((raw) => {
          const em = String(raw).trim().toLowerCase();
          if (!aggregateEmails.has(em)) aggregateEmails.set(em, { email: em, type: 'general', label: 'Umum' });
        });
      }
      if (sig.picCandidates) {
        sig.picCandidates.forEach((pic) => {
          const key = (pic.name || '').trim().toLowerCase();
          if (key && !aggregatePics.has(key)) aggregatePics.set(key, pic);
        });
      }
      if (!aggregateWhatsapp && sig.whatsapp) aggregateWhatsapp = sig.whatsapp;
      if (!aggregateCompanyLinkedin && sig.linkedinUrl) aggregateCompanyLinkedin = sig.linkedinUrl;
      if (!aggregatePicLinkedin && sig.picLinkedinUrl) aggregatePicLinkedin = sig.picLinkedinUrl;
    };

    // Merge homepage and structured Schema signals
    mergeSignals(homeSignals);
    mergeSignals(structSignals);

    const pageSections = [];
    if (structuredHeader) pageSections.push(structuredHeader);
    pageSections.push(`=== HALAMAN UTAMA (${effectiveUrl}) ===\n${homeText}`);

    // Discovered Candidate URLs
    const candidateUrls = new Map();

    const scanLinksInHtml = (htmlContent, pageUrl) => {
      const $ = cheerio.load(htmlContent);
      $('a[href], button[data-href], button[data-url], [role="link"][data-href], area[href], [data-nav]').each((_, el) => {
        const rawHref = $(el).attr('href') || $(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-nav');
        const linkText = $(el).text().replace(/\s+/g, ' ').trim();
        const clean = cleanAndCanonicalizeUrl(rawHref, pageUrl);
        if (!clean) return;
        if (clean === origin || clean === origin + '/' || clean === effectiveUrl || crawledUrls.has(clean)) return;

        try {
          const u = new URL(clean);
          const score = scoreLinkRelevance(u.pathname, linkText);
          if (!candidateUrls.has(clean) || candidateUrls.get(clean).score < score) {
            candidateUrls.set(clean, { url: clean, title: linkText || u.pathname, score });
          }
        } catch (_) {}
      });
    };

    // 1. Scan links from homepage
    scanLinksInHtml(homeHtml, effectiveUrl);

    // 2. Sitemap Inspection: if sparse candidates found (< 3), probe /sitemap.xml
    if (candidateUrls.size < 3) {
      try {
        const sitemapRes = await fetchWithFallback(`${origin}/sitemap.xml`);
        if (sitemapRes && sitemapRes.html) {
          const matches = sitemapRes.html.matchAll(/<loc>([^<]+)<\/loc>/gi);
          for (const m of matches) {
            const locUrl = cleanAndCanonicalizeUrl(m[1], origin);
            if (locUrl && locUrl !== origin && locUrl !== effectiveUrl && !crawledUrls.has(locUrl)) {
              const u = new URL(locUrl);
              const score = scoreLinkRelevance(u.pathname, u.pathname);
              if (!candidateUrls.has(locUrl) || candidateUrls.get(locUrl).score < score) {
                candidateUrls.set(locUrl, { url: locUrl, title: u.pathname, score });
              }
            }
          }
        }
      } catch (_) {}
    }

    // 3. Proactive Path Probes: detect extension style (.html vs clean)
    const hasHtmlExtension = Array.from(candidateUrls.keys()).some((u) => u.endsWith('.html'));
    const fallbackPaths = hasHtmlExtension
      ? [
          '/services.html',
          '/about.html',
          '/contact.html',
          '/team.html',
          '/products.html',
          '/solutions.html',
          '/services',
          '/about',
          '/contact'
        ]
      : [
          '/services',
          '/about',
          '/about-us',
          '/contact',
          '/contact-us',
          '/team',
          '/products',
          '/solutions',
          '/portfolio',
          '/projects',
          '/services.html',
          '/contact.html',
          '/about.html'
        ];

    for (const path of fallbackPaths) {
      const probe = `${origin}${path}`;
      if (!candidateUrls.has(probe) && !crawledUrls.has(probe)) {
        const score = scoreLinkRelevance(path, path);
        candidateUrls.set(probe, { url: probe, title: path, score });
      }
    }

    // 4. Batch 1: Fetch Top-Ranked Candidates Concurrently
    const batch1Limit = fastMode ? Math.min(4, maxSubpages) : 8;
    const topCandidates = Array.from(candidateUrls.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, batch1Limit);

    const batch1Results = await Promise.allSettled(
      topCandidates.map(async (cand) => {
        const res = await fetchWithFallback(cand.url, pageTimeout);
        if (!res) return null;
        return {
          url: cand.url,
          title: cand.title,
          html: res.html,
          text: cleanPageText(res.html),
          effectiveUrl: res.effectiveUrl
        };
      })
    );

    const secondaryCandidates = new Map();

    for (const r of batch1Results) {
      if (r.status === 'fulfilled' && r.value && r.value.text && r.value.text.length > 50) {
        const { url: subUrl, title: subTitle, html: subHtml, text: subText, effectiveUrl: subEff } = r.value;
        crawledUrls.add(subUrl);
        crawledUrls.add(subEff);

        const subSig = extractSignals(subHtml, subText);
        mergeSignals(subSig);

        const subVisual = extractVisualAssets(subHtml, subEff);
        subVisual.realImages.forEach((img) => {
          if (!aggregateImages.has(img.src)) aggregateImages.set(img.src, img);
        });
        if (!finalLogoUrl && subVisual.logoUrl) finalLogoUrl = subVisual.logoUrl;
        if (!finalBrandColors.primary && subVisual.brandColors.primary) finalBrandColors = subVisual.brandColors;
        subVisual.navLinks.forEach((nl) => {
          if (!finalNavLinks.includes(nl) && finalNavLinks.length < 8) finalNavLinks.push(nl);
        });
        subVisual.headings.forEach((h) => {
          if (!finalHeadings.includes(h) && finalHeadings.length < 12) finalHeadings.push(h);
        });

        pageSections.push(`=== SUB-HALAMAN: ${subTitle} (${subEff}) ===\n${subText}`);

        // 2-Hop Discovery: Scan hub pages (/services, /solutions, /products) for child service pages
        if (/services|service|products|product|solutions/i.test(subEff)) {
          const $sub = cheerio.load(subHtml);
          $sub('a[href], button[data-href]').each((_, el) => {
            const raw = $sub(el).attr('href') || $sub(el).attr('data-href');
            const txt = $sub(el).text().replace(/\s+/g, ' ').trim();
            const clean = cleanAndCanonicalizeUrl(raw, subEff);
            if (clean && !crawledUrls.has(clean) && !candidateUrls.has(clean)) {
              const u = new URL(clean);
              const score = scoreLinkRelevance(u.pathname, txt);
              if (score >= 70) {
                secondaryCandidates.set(clean, { url: clean, title: txt || u.pathname, score });
              }
            }
          });
        }
      }
    }

    // 5. Batch 2: 2-Hop Expansion (crawl newly discovered sub-service & product pages)
    const remainingSlots = Math.min(maxSubpages, MAX_TOTAL_SUBPAGES) - crawledUrls.size;
    if (!fastMode && remainingSlots > 0 && secondaryCandidates.size > 0) {
      const hopCandidates = Array.from(secondaryCandidates.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, remainingSlots);

      const batch2Results = await Promise.allSettled(
        hopCandidates.map(async (cand) => {
          const res = await fetchWithFallback(cand.url);
          if (!res) return null;
          return {
            url: cand.url,
            title: cand.title,
            html: res.html,
            text: cleanPageText(res.html),
            effectiveUrl: res.effectiveUrl
          };
        })
      );

      for (const r of batch2Results) {
        if (r.status === 'fulfilled' && r.value && r.value.text && r.value.text.length > 50) {
          const { title: subTitle, html: subHtml, text: subText, effectiveUrl: subEff } = r.value;
          crawledUrls.add(subEff);

          const subSig = extractSignals(subHtml, subText);
          mergeSignals(subSig);

          const subVisual = extractVisualAssets(subHtml, subEff);
          subVisual.realImages.forEach((img) => {
            if (!aggregateImages.has(img.src)) aggregateImages.set(img.src, img);
          });
          if (!finalLogoUrl && subVisual.logoUrl) finalLogoUrl = subVisual.logoUrl;
          if (!finalBrandColors.primary && subVisual.brandColors.primary) finalBrandColors = subVisual.brandColors;
          subVisual.navLinks.forEach((nl) => {
            if (!finalNavLinks.includes(nl) && finalNavLinks.length < 8) finalNavLinks.push(nl);
          });
          subVisual.headings.forEach((h) => {
            if (!finalHeadings.includes(h) && finalHeadings.length < 12) finalHeadings.push(h);
          });

          pageSections.push(`=== SUB-HALAMAN SPESIFIK: ${subTitle} (${subEff}) ===\n${subText}`);
        }
      }
    }

    // Finalize phone sorting & deduplication
    const allPhones = Array.from(aggregatePhones.values());
    allPhones.sort((a, b) => {
      const score = { landline: 2, mobile: 1, other: 0 };
      return (score[b.type] || 0) - (score[a.type] || 0);
    });

    const primaryPhone = allPhones[0]?.formatted || null;
    const secondaryPhone = (allPhones.length > 1 && allPhones[1]?.digits !== allPhones[0]?.digits)
      ? allPhones[1].formatted
      : null;

    if (!aggregateWhatsapp) {
      const mob = allPhones.find((p) => p.type === 'mobile');
      if (mob) aggregateWhatsapp = mob.formatted;
    }

    // Finalize email sorting: PIC > Sales > Technical > General
    const allEmails = Array.from(aggregateEmails.values());
    allEmails.sort((a, b) => {
      const score = { pic: 4, sales: 3, technical: 2, general: 1 };
      return (score[b.type] || 0) - (score[a.type] || 0);
    });

    const finalSignals = {
      hasWhatsApp: Boolean(aggregateWhatsapp),
      whatsapp: aggregateWhatsapp,
      linkedinUrl: aggregateCompanyLinkedin,
      picLinkedinUrl: aggregatePicLinkedin,
      primaryPhone,
      secondaryPhone,
      phones: allPhones.map((p) => p.formatted),
      phonesDetailed: allPhones,
      emails: allEmails.map((e) => e.email),
      emailsDetailed: allEmails,
      primaryEmail: allEmails[0]?.email || null,
      picCandidates: Array.from(aggregatePics.values()).slice(0, 10)
    };

    const combinedText = pageSections.join('\n\n').slice(0, MAX_TOTAL_TEXT_CHARS);

    return {
      success: true,
      text: combinedText,
      signals: finalSignals,
      visualAssets: {
        logoUrl: finalLogoUrl,
        brandColors: finalBrandColors,
        realImages: Array.from(aggregateImages.values()).slice(0, 20),
        navLinks: finalNavLinks,
        headings: finalHeadings
      },
      crawledPages: Array.from(crawledUrls),
      totalPages: crawledUrls.size,
      url: effectiveUrl
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      text: '',
      signals: {},
      visualAssets: null,
      crawledPages: [],
      totalPages: 0
    };
  }
}
