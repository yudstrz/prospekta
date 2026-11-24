import { NextResponse } from 'next/server';
import {
  validateSafeUrl,
  normalizeUrl,
  isAllowedCrawlDomain,
  CrawlDomainScope,
  isHtmlPath,
  fetchHtmlWithLimit,
  extractPageContent,
  loadRobotsRules,
  fetchSitemapUrls,
  PageResult,
  CrawlResponse
} from '@/lib/serverless-crawler';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const BATCH_SIZE_LIMIT = 10;
const TIME_BUDGET_MS = 7500;
const CONCURRENCY = 5;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
    const seedUrlsRaw: string[] = Array.isArray(body.seedUrls) && body.seedUrls.length > 0
      ? body.seedUrls.filter((u: any) => typeof u === 'string' && u.trim().length > 0)
      : (rawUrl ? [rawUrl] : []);

    if (seedUrlsRaw.length === 0) {
      return NextResponse.json<CrawlResponse>(
        { results: [], queue: [], visited: [], done: true, error: 'Parameter url atau seedUrls wajib diisi.' },
        { status: 400 }
      );
    }

    const primaryRawUrl = seedUrlsRaw[0];

    // 1. Validasi URL utama dan proteksi SSRF
    const validation = await validateSafeUrl(primaryRawUrl);
    if (!validation.ok || !validation.url) {
      return NextResponse.json<CrawlResponse>(
        { results: [], queue: [], visited: [], done: true, error: validation.error || 'URL utama tidak aman atau tidak valid.' },
        { status: 400 }
      );
    }

    const startUrl = normalizeUrl(primaryRawUrl) || primaryRawUrl;
    const maxPages = Math.min(Math.max(Number(body.maxPages || 100), 1), 500);
    const scope: CrawlDomainScope = (body.scope === 'exact' || body.scope === 'custom') ? body.scope : 'subdomain';

    // Kumpulkan daftar domain yang diizinkan (gabungan dari body dan host seed URLs)
    const allowedDomainsSet = new Set<string>();
    if (Array.isArray(body.allowedDomains)) {
      for (const d of body.allowedDomains) {
        if (typeof d === 'string' && d.trim()) allowedDomainsSet.add(d.trim().toLowerCase());
      }
    } else if (typeof body.allowedDomains === 'string' && body.allowedDomains.trim()) {
      body.allowedDomains.split(',').forEach((d: string) => {
        if (d.trim()) allowedDomainsSet.add(d.trim().toLowerCase());
      });
    }

    // Tambahkan domain setiap seed URL ke allowedDomains
    for (const sUrl of seedUrlsRaw) {
      try {
        const host = new URL(sUrl).hostname.toLowerCase().replace(/^www\./, '');
        allowedDomainsSet.add(host);
      } catch {}
    }
    const allowedDomains = Array.from(allowedDomainsSet);

    let queue: string[] = Array.isArray(body.queue) ? [...body.queue] : [];
    let visited: string[] = Array.isArray(body.visited) ? [...body.visited] : [];
    const visitedSet = new Set<string>(visited);
    const queueSet = new Set<string>(queue);

    // 2. Inisialisasi awal jika antrean dan riwayat kunjungan masih kosong
    if (visited.length === 0 && queue.length === 0) {
      // Masukkan semua seed URL yang lolos validasi ke antrean awal
      for (const seed of seedUrlsRaw) {
        const check = await validateSafeUrl(seed);
        if (check.ok) {
          const norm = normalizeUrl(seed);
          if (norm && !queueSet.has(norm)) {
            queue.push(norm);
            queueSet.add(norm);
          }
        }
      }

      // Muat sitemap dari domain utama
      const { sitemaps } = await loadRobotsRules(startUrl);
      let sitemapTargets = [...sitemaps];
      if (sitemapTargets.length === 0) {
        sitemapTargets.push(`${new URL(startUrl).origin}/sitemap.xml`);
      }

      for (const smUrl of sitemapTargets.slice(0, 2)) {
        const found = await fetchSitemapUrls(smUrl, startUrl, scope, allowedDomains);
        if (found.length > 0) {
          for (const u of found) {
            if (!queueSet.has(u) && !visitedSet.has(u) && isAllowedCrawlDomain(u, startUrl, scope, allowedDomains)) {
              queue.push(u);
              queueSet.add(u);
            }
          }
          break;
        }
      }

      if (queue.length === 0) {
        queue.push(startUrl);
        queueSet.add(startUrl);
      }
    }

    // 3. Muat robots.txt untuk rute domain awal
    const { parser: robots } = await loadRobotsRules(startUrl);

    const results: PageResult[] = [];
    let processedInThisBatch = 0;

    // 4. Batch crawling loop dengan pembatasan waktu (time-budgeted)
    while (
      queue.length > 0 &&
      visited.length < maxPages &&
      processedInThisBatch < BATCH_SIZE_LIMIT &&
      (Date.now() - startTime) < TIME_BUDGET_MS
    ) {
      const currentChunk: string[] = [];
      while (
        queue.length > 0 &&
        currentChunk.length < CONCURRENCY &&
        (visited.length + currentChunk.length) < maxPages &&
        (processedInThisBatch + currentChunk.length) < BATCH_SIZE_LIMIT
      ) {
        const nextUrl = queue.shift();
        if (nextUrl && !visitedSet.has(nextUrl)) {
          currentChunk.push(nextUrl);
          visitedSet.add(nextUrl);
          visited.push(nextUrl);
        }
      }

      if (currentChunk.length === 0) break;

      // Filter kepatuhan robots.txt sebelum melakukan fetch
      const urlsToFetch = currentChunk.filter((targetUrl) => {
        if (!robots) return true;
        try {
          const robotsHost = new URL(startUrl).hostname.toLowerCase();
          const targetParsed = new URL(targetUrl);
          targetParsed.hostname = robotsHost;
          const normalizedTarget = targetParsed.toString();

          const allowedCustom = robots.isAllowed(normalizedTarget, 'ProspektaCrawler');
          const allowedWildcard = robots.isAllowed(normalizedTarget, '*');
          return allowedCustom !== false && allowedWildcard !== false;
        } catch {
          return true;
        }
      });

      // Fetch paralel dengan Promise.allSettled
      const fetchTasks = urlsToFetch.map(async (targetUrl) => {
        const html = await fetchHtmlWithLimit(targetUrl);
        if (!html) return null;
        return extractPageContent(html, targetUrl, startUrl, scope, allowedDomains);
      });

      const settled = await Promise.allSettled(fetchTasks);

      for (const res of settled) {
        processedInThisBatch++;
        if (res.status === 'fulfilled' && res.value) {
          const pageData = res.value;
          results.push(pageData);

          // Masukkan link baru yang ditemukan ke dalam antrean jika berada dalam domain yang diizinkan
          for (const link of pageData.links) {
            if (
              !visitedSet.has(link) &&
              !queueSet.has(link) &&
              isAllowedCrawlDomain(link, startUrl, scope, allowedDomains) &&
              isHtmlPath(link)
            ) {
              queue.push(link);
              queueSet.add(link);
            }
          }
        }
      }
    }

    const done = queue.length === 0 || visited.length >= maxPages;

    return NextResponse.json<CrawlResponse>({
      results,
      queue,
      visited,
      done,
    });
  } catch (err: any) {
    return NextResponse.json<CrawlResponse>(
      {
        results: [],
        queue: [],
        visited: [],
        done: true,
        error: `Gagal memproses perayapan: ${err.message || 'Kesalahan internal server.'}`
      },
      { status: 500 }
    );
  }
}
