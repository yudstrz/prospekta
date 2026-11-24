import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import dns from 'node:dns/promises';

export interface PageResult {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
}

export interface CrawlResponse {
  results: PageResult[];
  queue: string[];
  visited: string[];
  done: boolean;
  error?: string;
}

const MAX_PAGE_BYTES = 2 * 1024 * 1024; // Maksimal 2 MB per halaman
const FETCH_TIMEOUT_MS = 5000; // Timeout 5 detik per URL
const BATCH_TIME_BUDGET_MS = 7500; // Berhenti sebelum 8 detik untuk kepatuhan batas serverless
const USER_AGENT = 'Mozilla/5.0 (compatible; ProspektaCrawler/1.0; +https://prospekta.id)';

// Daftar ekstensi non-HTML yang harus diabaikan
const NON_HTML_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|bmp|tiff|zip|tar|gz|7z|rar|css|js|mjs|map|mp4|webm|ogv|mp3|wav|ogg|avi|mov|wmv|flv|woff|woff2|ttf|eot|otf|xml|json|csv|xlsx?|docx?|pptx?)$/i;

// Parameter pelacak yang harus dibersihkan
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'ref', 'source', '_hsenc', '_hsmi', 'mc_cid', 'mc_eid'
];

/**
 * Validasi dan proteksi Server-Side Request Forgery (SSRF)
 */
export function isPrivateIp(ip: string): boolean {
  const clean = ip.trim().toLowerCase();
  if (clean === 'localhost' || clean === '127.0.0.1' || clean === '::1' || clean === '0.0.0.0') {
    return true;
  }
  // IPv4 Private ranges
  if (/^10\./.test(clean)) return true;
  if (/^127\./.test(clean)) return true;
  if (/^169\.254\./.test(clean)) return true; // Link-local / Cloud Metadata
  if (/^192\.168\./.test(clean)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;

  // IPv6 Private & Local ranges
  if (/^fe80:/i.test(clean)) return true;
  if (/^fc00:/i.test(clean)) return true;
  if (/^fd[0-9a-f]{2}:/i.test(clean)) return true;

  return false;
}

export async function validateSafeUrl(rawUrl: string): Promise<{ ok: boolean; error?: string; url?: URL }> {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Protokol URL tidak didukung. Hanya http dan https yang diizinkan.' };
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.lan') ||
      host === 'metadata.google.internal' ||
      isPrivateIp(host)
    ) {
      return { ok: false, error: 'Alamat host lokal atau privat dilarang demi keamanan (SSRF).' };
    }

    // Resolusi DNS untuk mencegah serangan DNS rebinding
    try {
      const addresses = await dns.lookup(host, { all: true });
      for (const item of addresses) {
        if (isPrivateIp(item.address)) {
          return { ok: false, error: `Host mengarah ke IP privat (${item.address}) yang dilarang.` };
        }
      }
    } catch {
      return { ok: false, error: 'Host tidak dapat ditemukan melalui pencarian DNS.' };
    }

    return { ok: true, url: parsed };
  } catch {
    return { ok: false, error: 'Format URL tidak valid.' };
  }
}

/**
 * Normalisasi URL: lowercase host, bersihkan fragment, trailing slash, dan parameter tracking
 */
export function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const u = new URL(rawUrl, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

    u.hostname = u.hostname.toLowerCase();
    u.hash = '';

    for (const p of TRACKING_PARAMS) {
      u.searchParams.delete(p);
    }

    let clean = u.toString();
    if (u.pathname !== '/' && clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return null;
  }
}

export type CrawlDomainScope = 'exact' | 'subdomain' | 'custom';

/**
 * Pemeriksaan fleksibel cakupan domain:
 * - 'exact': domain persis (misal: example.com dan www.example.com)
 * - 'subdomain': domain persis + seluruh subdomain (*.example.com seperti bootcamp.example.com)
 * - 'custom': domain persis + seluruh subdomain + daftar sibling domain yang diizinkan (misal example.org, example.id)
 */
export function isAllowedCrawlDomain(
  targetUrl: string,
  rootUrl: string,
  scope: CrawlDomainScope = 'subdomain',
  allowedDomains: string[] = []
): boolean {
  try {
    const tHost = new URL(targetUrl).hostname.toLowerCase().replace(/^www\./, '');
    const rHost = new URL(rootUrl).hostname.toLowerCase().replace(/^www\./, '');

    // 1. Exact host match
    if (tHost === rHost) return true;

    // 2. Subdomain check (misal: bootcamp.example.com vs example.com)
    if (scope === 'subdomain' || scope === 'custom') {
      if (tHost.endsWith('.' + rHost)) return true;
    }

    // 3. Sibling domain list check (misal: example.org dalam hosting yang sama)
    if (allowedDomains && allowedDomains.length > 0) {
      for (const d of allowedDomains) {
        const clean = d.trim().toLowerCase().replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '').replace(/^\*\./, '');
        if (!clean) continue;
        if (tHost === clean) return true;
        if (scope !== 'exact' && tHost.endsWith('.' + clean)) return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Pemeriksaan domain yang sama (backward-compatible)
 */
export function isSameDomain(targetUrl: string, rootUrl: string): boolean {
  return isAllowedCrawlDomain(targetUrl, rootUrl, 'exact');
}

export function isHtmlPath(urlStr: string): boolean {
  try {
    const pathname = new URL(urlStr).pathname.toLowerCase();
    return !NON_HTML_EXTENSIONS.test(pathname);
  } catch {
    return false;
  }
}

/**
 * Mengambil teks HTML dengan batasan timeout 5 detik dan ukuran maksimal 2 MB
 */
export async function fetchHtmlWithLimit(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!res.ok) return null;

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return null;
    }

    const contentLength = Number(res.headers.get('content-length'));
    if (contentLength && contentLength > MAX_PAGE_BYTES) {
      return null;
    }

    if (!res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PAGE_BYTES) {
        reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ekstraksi konten halaman: title, meta description, teks utama, dan link internal
 */
export function extractPageContent(
  html: string,
  currentUrl: string,
  startUrl: string,
  scope: CrawlDomainScope = 'subdomain',
  allowedDomains: string[] = []
): PageResult {
  const $ = cheerio.load(html);

  // Buang elemen non-konten
  $('script, style, noscript, nav, footer, aside, iframe, svg, form, header, [role="navigation"], [role="banner"]').remove();

  const title = (
    $('title').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('h1').first().text().trim() ||
    'Halaman Tanpa Judul'
  );

  const description = (
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    ''
  );

  let container = $('main, article, [role="main"]').first();
  if (!container.length) {
    container = $('body');
  }

  const rawText = container.text();
  const text = rawText.replace(/\s+/g, ' ').trim();

  // Ekstrak link internal yang valid sesuai cakupan domain
  const foundLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const normalized = normalizeUrl(href, currentUrl);
    if (!normalized) return;
    if (isAllowedCrawlDomain(normalized, startUrl, scope, allowedDomains) && isHtmlPath(normalized)) {
      foundLinks.push(normalized);
    }
  });

  return {
    url: currentUrl,
    title,
    description,
    text,
    links: Array.from(new Set(foundLinks)),
  };
}

/**
 * Pemuatan robots.txt dan pencarian URL sitemap
 */
export async function loadRobotsRules(startUrl: string): Promise<{
  parser: any | null;
  sitemaps: string[];
}> {
  try {
    const origin = new URL(startUrl).origin;
    const robotsUrl = `${origin}/robots.txt`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);

    if (res.ok) {
      const robotsText = await res.text().catch(() => '');
      const parser = robotsParser(robotsUrl, robotsText);
      const sitemaps = parser.getSitemaps() || [];
      return { parser, sitemaps };
    }
  } catch {
    // Abaikan jika robots.txt tidak tersedia
  }

  return { parser: null, sitemaps: [] };
}

/**
 * Pemuatan sitemap.xml untuk mengisi antrean awal jika tersedia
 */
export async function fetchSitemapUrls(
  sitemapUrl: string,
  startUrl: string,
  scope: CrawlDomainScope = 'subdomain',
  allowedDomains: string[] = []
): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(sitemapUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);

    if (!res.ok) return [];

    const xml = await res.text().catch(() => '');
    const $ = cheerio.load(xml, { xmlMode: true });
    const urls: string[] = [];

    // Jika berupa sitemap index, ambil child sitemap pertama
    const childSitemaps: string[] = [];
    $('sitemap loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) childSitemaps.push(loc);
    });

    if (childSitemaps.length > 0) {
      for (const child of childSitemaps.slice(0, 3)) {
        const subUrls = await fetchSitemapUrls(child, startUrl, scope, allowedDomains);
        urls.push(...subUrls);
      }
      return Array.from(new Set(urls));
    }

    $('url loc').each((_, el) => {
      const loc = $(el).text().trim();
      const normalized = normalizeUrl(loc);
      if (normalized && isAllowedCrawlDomain(normalized, startUrl, scope, allowedDomains) && isHtmlPath(normalized)) {
        urls.push(normalized);
      }
    });

    return Array.from(new Set(urls));
  } catch {
    return [];
  }
}
