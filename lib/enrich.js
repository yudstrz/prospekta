import { normalizePhone } from './phone.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORED_DOMAINS = ['sentry.io', 'wixpress.com', 'example.com', 'domain.com', 'schema.org'];
const IGNORED_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

/**
 * Polite fetch with timeout
 */
async function fetchWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ProspektaBot/1.0 (Polite enrichment crawler)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    });
    clearTimeout(id);
    if (!response.ok) return null;
    return await response.text();
  } catch (err) {
    clearTimeout(id);
    return null;
  }
}

/**
 * Extracts emails, phone numbers, WhatsApp, LinkedIn, and PIC cues from HTML text
 */
function extractContacts(html) {
  if (!html || typeof html !== 'string') return { emails: [], phones: [], whatsapp: null, linkedinUrl: null, picName: null };

  const emails = new Set();
  const phones = new Set();
  let whatsapp = null;
  let linkedinUrl = null;
  let picName = null;

  // 1. WhatsApp link detection
  const waMatch = html.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?([0-9+]+)/i);
  if (waMatch && waMatch[1]) {
    whatsapp = waMatch[1].replace(/[^0-9]/g, '');
  }

  // 2. LinkedIn company or profile link detection
  const liMatch = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_\-\.%]+/i);
  if (liMatch) {
    linkedinUrl = liMatch[0];
  }

  // 3. PIC / Leadership name cue
  const picMatch = html.match(/(?:Direktur Utama|Direktur|Managing Director|Founder & CEO|Founder|Owner|CEO|dr\.)[:\s-]+([A-Z][a-zA-Z\s.,]{3,35})/i);
  if (picMatch && picMatch[1]) {
    const rawPic = picMatch[1].trim();
    if (!rawPic.toLowerCase().includes('lorem') && !rawPic.toLowerCase().includes('menu') && rawPic.length > 3) {
      picName = rawPic;
    }
  }

  // 4. mailto: links
  const mailtoMatches = html.matchAll(/href=["']mailto:([^"'\s?]+)/gi);
  for (const m of mailtoMatches) {
    const email = m[1].trim().toLowerCase();
    if (isValidEmail(email)) emails.add(email);
  }

  // 5. tel: links
  const telMatches = html.matchAll(/href=["']tel:([^"'\s]+)/gi);
  for (const m of telMatches) {
    const norm = normalizePhone(m[1]);
    if (norm) {
      phones.add(norm);
      if (!whatsapp && (norm.startsWith('08') || norm.startsWith('628') || norm.startsWith('+628'))) {
        whatsapp = norm;
      }
    }
  }

  // 6. regex email matching in text
  const rawEmails = html.match(EMAIL_REGEX) || [];
  for (const raw of rawEmails) {
    const email = raw.trim().toLowerCase();
    if (isValidEmail(email)) emails.add(email);
  }

  // 7. Indonesian phone numbers in text (e.g. 021-xxxxxxx or 08xx-xxxx-xxxx)
  const phoneRegex = /(?:\+62|08|021|031)[\s-]?[0-9]{3,4}[\s-]?[0-9]{3,5}/g;
  const rawPhones = html.match(phoneRegex) || [];
  for (const raw of rawPhones) {
    const norm = normalizePhone(raw);
    if (norm && norm.length >= 9 && norm.length <= 15) {
      phones.add(norm);
      if (!whatsapp && (norm.startsWith('08') || norm.startsWith('628') || norm.startsWith('+628'))) {
        whatsapp = norm;
      }
    }
  }

  return {
    emails: Array.from(emails),
    phones: Array.from(phones),
    whatsapp,
    linkedinUrl,
    picName
  };
}

function isValidEmail(email) {
  if (!email || email.length > 80) return false;
  const lower = email.toLowerCase();
  for (const ign of IGNORED_DOMAINS) {
    if (lower.includes(ign)) return false;
  }
  for (const ext of IGNORED_EXTS) {
    if (lower.endsWith(ext)) return false;
  }
  return true;
}

/**
 * Enriches a website by checking homepage, /contact, and /about paths
 */
export async function enrichWebsite(websiteUrl) {
  if (!websiteUrl) return { status: 'failed', email: null, phone: null, whatsapp: null, linkedin_url: null, pic_name: null };

  let targetUrl = websiteUrl.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const parsed = new URL(targetUrl);
    const origin = parsed.origin;

    // Check homepage
    let html = await fetchWithTimeout(targetUrl, 6000);
    let contacts = extractContacts(html);

    // If missing info on homepage, try /contact, /kontak, /about
    const subpages = ['/contact', '/kontak', '/about', '/tentang-kami', '/team'];
    for (const sub of subpages) {
      if (contacts.emails.length > 0 && contacts.whatsapp && contacts.linkedinUrl && contacts.picName) {
        break; // All information found
      }
      const subHtml = await fetchWithTimeout(`${origin}${sub}`, 4000);
      if (subHtml) {
        const subContacts = extractContacts(subHtml);
        subContacts.emails.forEach(e => contacts.emails.push(e));
        subContacts.phones.forEach(p => contacts.phones.push(p));
        if (!contacts.whatsapp && subContacts.whatsapp) contacts.whatsapp = subContacts.whatsapp;
        if (!contacts.linkedinUrl && subContacts.linkedinUrl) contacts.linkedinUrl = subContacts.linkedinUrl;
        if (!contacts.picName && subContacts.picName) contacts.picName = subContacts.picName;
      }
    }

    const email = contacts.emails.length > 0 ? contacts.emails[0] : null;
    const phone = contacts.phones.length > 0 ? contacts.phones[0] : (contacts.whatsapp || null);

    return {
      status: 'done',
      email,
      phone,
      whatsapp: null,
      linkedin_url: contacts.linkedinUrl || null,
      pic_name: contacts.picName || null
    };
  } catch (err) {
    return {
      status: 'failed',
      email: null,
      phone: null,
      whatsapp: null,
      linkedin_url: null,
      pic_name: null,
      error: err.message
    };
  }
}
