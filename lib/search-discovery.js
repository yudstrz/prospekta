// Modul penelusuran informasi bisnis dan website via Tavily dan DuckDuckGo

import https from 'https';
import * as cheerio from 'cheerio';

const getEnv = (key) => process.env[key] || '';

/**
 * Fallback penelusuran DuckDuckGo gratis tanpa API key
 * Menggunakan DoH Cloudflare untuk mengatasi DNS injection ISP lokal (Telkomsel / Indihome)
 * @param {string} query
 * @returns {Promise<{ website: string|null, answer: string|null, snippets: string[], socials: object, candidateEmails: string[], candidatePhones: string[], source: string }|null>}
 */
async function searchDuckDuckGoWeb(query) {
  try {
    let ip = '20.43.161.105';
    try {
      const dnsRes = await fetch('https://cloudflare-dns.com/dns-query?name=html.duckduckgo.com&type=A', {
        headers: { 'Accept': 'application/dns-json' },
        signal: AbortSignal.timeout(2500)
      });
      if (dnsRes.ok) {
        const dnsData = await dnsRes.json();
        const resolved = dnsData.Answer?.find((a) => a.type === 1)?.data;
        if (resolved) ip = resolved;
      }
    } catch {
      // Gunakan IP default jika DoH gagal
    }

    const postData = `q=${encodeURIComponent(query)}`;
    const html = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: ip,
        port: 443,
        path: '/lite/',
        method: 'POST',
        headers: {
          'Host': 'lite.duckduckgo.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        },
        servername: 'lite.duckduckgo.com',
        timeout: 6000
      }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('DuckDuckGo request timeout'));
      });
      req.write(postData);
      req.end();
    });

    if (!html) return null;

    const $ = cheerio.load(html);
    const results = [];
    $('td.result-snippet').each((i, el) => {
      if (results.length >= 6) return false;
      const snippet = $(el).text().trim();
      const prevTr = $(el).closest('tr').prev();
      const titleLink = prevTr.find('a.result-link');
      const title = titleLink.text().trim();
      const rawUrl = titleLink.attr('href');
      if (title && snippet) {
        results.push({ title, snippet, rawUrl });
      }
    });

    if (results.length === 0) return null;

    const snippets = results.map((r) => `[${r.title}] ${r.snippet}`);

    const candidateUrl = results.find((r) => {
      const u = (r.rawUrl || '').toLowerCase();
      return (
        u &&
        !u.includes('facebook') &&
        !u.includes('instagram') &&
        !u.includes('linkedin') &&
        !u.includes('twitter') &&
        !u.includes('x.com') &&
        !u.includes('wikipedia') &&
        !u.includes('youtube')
      );
    })?.rawUrl || null;

    const fullUrl = candidateUrl ? (candidateUrl.startsWith('http') ? candidateUrl : `https://${candidateUrl}`) : null;

    const linkedinResult = results.find((r) => (r.rawUrl || '').toLowerCase().includes('linkedin.com'));
    const fbResult = results.find((r) => (r.rawUrl || '').toLowerCase().includes('facebook.com'));
    const igResult = results.find((r) => (r.rawUrl || '').toLowerCase().includes('instagram.com'));

    const combinedText = snippets.join(' ');
    const emailMatches = combinedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const candidateEmails = [...new Set(emailMatches)].filter((e) => {
      const lower = e.toLowerCase();
      return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.includes('sentry') && !lower.includes('example.com');
    });

    const phoneMatches = combinedText.match(/(?:\+62[\s-]?(?:21|31|8\d{1,2})|\+65[\s-]?[689]|0[238]\d{1,2})[\s-]?[0-9\s-]{6,12}/g) || [];
    const candidatePhones = [...new Set(phoneMatches.map((p) => p.trim()))];

    return {
      website: fullUrl,
      answer: snippets[0] || null,
      snippets,
      socials: {
        linkedin: linkedinResult?.rawUrl || null,
        facebook: fbResult?.rawUrl || null,
        instagram: igResult?.rawUrl || null
      },
      candidateEmails,
      candidatePhones,
      source: 'duckduckgo_search'
    };
  } catch (err) {
    console.warn('DuckDuckGo search warning:', err.message);
    return null;
  }
}

/**
 * Mencari informasi dan website calon klien di web secara otomatis
 * @param {string|object} queryOrParams
 * @returns {Promise<{ website: string|null, answer: string|null, snippets: string[], socials: object, candidateEmails: string[], candidatePhones: string[], source: string }>}
 */
export async function searchCompanyWeb(queryOrParams) {
  let query = '';
  if (typeof queryOrParams === 'string') {
    query = queryOrParams;
  } else if (queryOrParams && typeof queryOrParams === 'object') {
    const { name, category, address, phone, city, country, anchor } = queryOrParams;
    const parts = [name];
    if (category && category !== 'Umum') parts.push(category);
    if (address) parts.push(address.split(',')[0]);

    // Dynamic country and city detection (Jakarta, Surabaya, Indonesia vs Singapore)
    const contextStr = `${address || ''} ${city || ''} ${country || ''} ${anchor || ''} ${phone || ''}`.toLowerCase();
    if (city) {
      parts.push(city);
    } else if (contextStr.includes('jakarta') || contextStr.includes('dki') || contextStr.includes('pakuwon') || phone?.startsWith('+6221') || phone?.startsWith('021')) {
      parts.push('Jakarta Indonesia');
    } else if (contextStr.includes('surabaya') || contextStr.includes('sungkono') || contextStr.includes('ciputra') || phone?.startsWith('+6231') || phone?.startsWith('031')) {
      parts.push('Surabaya Indonesia');
    } else if (contextStr.includes('indonesia') || phone?.startsWith('+62') || phone?.startsWith('08')) {
      parts.push('Indonesia');
    } else {
      parts.push('Singapore');
    }

    if (phone) parts.push(phone);
    query = parts.filter(Boolean).join(' ');
  }

  if (!query || query.trim().length < 3) {
    return { website: null, answer: null, snippets: [], socials: {}, candidateEmails: [], candidatePhones: [], source: 'none' };
  }

  // 1. Primary & Fallback: Tavily AI Search API (Multi-Key with Automatic Failover)
  const tavilyKeys = [
    ...getEnv('TAVILY_API_KEY').split(','),
    ...getEnv('TAVILY_API_KEY_FALLBACK').split(','),
    ...getEnv('TAVILY_FALLBACK_API_KEY').split(',')
  ].map((k) => k.trim().replace(/^['"]+|['"]+$/g, '')).filter(Boolean);

  const uniqueTavilyKeys = [...new Set(tavilyKeys)];

  for (let i = 0; i < uniqueTavilyKeys.length; i++) {
    const key = uniqueTavilyKeys[i];
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query: query.trim(),
          search_depth: 'advanced',
          include_answer: true,
          include_images: true,
          max_results: 6
        }),
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        const snippets = results.map((r) => `[${r.title}] ${r.content}`).filter(Boolean);
        const images = (data.images || []).filter(Boolean);

        // Filter tautan website kandidat resmi (bukan direktori global / media sosial / wiki)
        const candidateUrl = results.find((r) => {
          if (!r.url) return false;
          const u = r.url.toLowerCase();
          return (
            !u.includes('facebook.com') &&
            !u.includes('instagram.com') &&
            !u.includes('linkedin.com') &&
            !u.includes('twitter.com') &&
            !u.includes('x.com') &&
            !u.includes('wikipedia.org') &&
            !u.includes('youtube.com') &&
            !u.includes('yellowpages') &&
            !u.includes('streetdirectory.com') &&
            !u.includes('tripadvisor')
          );
        })?.url || null;

        const linkedinResult = results.find((r) => r.url?.toLowerCase().includes('linkedin.com'));
        const fbResult = results.find((r) => r.url?.toLowerCase().includes('facebook.com'));
        const igResult = results.find((r) => r.url?.toLowerCase().includes('instagram.com'));

        const combinedText = [data.answer || '', ...snippets].join(' ');
        const emailMatches = combinedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const candidateEmails = [...new Set(emailMatches)].filter((e) => {
          const lower = e.toLowerCase();
          return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.includes('sentry') && !lower.includes('example.com') && !lower.includes('wixpress');
        });

        const phoneMatches = combinedText.match(/(?:\+62[\s-]?(?:21|31|8\d{1,2})|\+65[\s-]?[689]|0[238]\d{1,2})[\s-]?[0-9\s-]{6,12}/g) || [];
        const candidatePhones = [...new Set(phoneMatches.map((p) => p.trim()))];

        return {
          website: candidateUrl,
          answer: data.answer || null,
          snippets,
          images,
          socials: {
            linkedin: linkedinResult?.url || null,
            facebook: fbResult?.url || null,
            instagram: igResult?.url || null
          },
          candidateEmails,
          candidatePhones,
          source: 'tavily_search'
        };
      } else {
        const errText = await res.text().catch(() => '');
        console.warn(`[Tavily Search] Key #${i + 1} (${key.slice(0, 12)}...) returned HTTP ${res.status}: ${errText.slice(0, 100)}. Switching to fallback key if available...`);
      }
    } catch (err) {
      console.warn(`[Tavily Search] Key #${i + 1} (${key.slice(0, 12)}...) error: ${err.message}. Switching to fallback key if available...`);
    }
  }

  // 2. Fallback: DuckDuckGo Web Search (Gratis tanpa API key)
  const ddgRes = await searchDuckDuckGoWeb(query);
  if (ddgRes && (ddgRes.snippets.length > 0 || ddgRes.website)) {
    return ddgRes;
  }

  // 3. Fallback: Brave Search API jika kunci Brave tersedia
  const braveApiKey = getEnv('BRAVE_SEARCH_API_KEY');
  if (braveApiKey) {
    try {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': braveApiKey
        },
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        const results = data.web?.results || [];
        const snippets = results.map(r => `[${r.title}] ${r.description}`).filter(Boolean);
        const candidateUrl = results.find(r => r.url && !r.url.includes('wikipedia') && !r.url.includes('facebook') && !r.url.includes('instagram'))?.url || null;

        return {
          website: candidateUrl,
          answer: null,
          snippets,
          images: [],
          socials: {},
          candidateEmails: [],
          candidatePhones: [],
          source: 'brave_search'
        };
      }
    } catch (err) {
      console.warn('Brave Search warning:', err.message);
    }
  }

  return {
    website: null,
    answer: null,
    snippets: [],
    images: [],
    socials: {},
    candidateEmails: [],
    candidatePhones: [],
    source: 'none'
  };
}

/**
 * Helper internal untuk eksekusi pencarian Tavily dengan multi-key auto-failover
 */
async function executeSingleTavilySearch(query, maxResults = 5) {
  const tavilyKeys = [
    ...getEnv('TAVILY_API_KEY').split(','),
    ...getEnv('TAVILY_API_KEY_FALLBACK').split(','),
    ...getEnv('TAVILY_FALLBACK_API_KEY').split(',')
  ].map((k) => k.trim().replace(/^['"]+|['"]+$/g, '')).filter(Boolean);

  const uniqueTavilyKeys = [...new Set(tavilyKeys)];

  for (let i = 0; i < uniqueTavilyKeys.length; i++) {
    const key = uniqueTavilyKeys[i];
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          query: query.trim(),
          search_depth: 'advanced',
          include_answer: true,
          include_images: true,
          max_results: maxResults
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Serverless Deep Research Engine:
 * Menjalankan investigasi multi-sudut pandang (Multi-Angle Fan-Out) secara paralel (Promise.all).
 * Membedah layanan, decision maker, kendala operasional, dan sitasi rujukan dalam ~2 detik.
 * 
 * @param {Object} params
 * @param {string} params.name - Nama perusahaan
 * @param {string} [params.category] - Bidang usaha / kategori
 * @param {string} [params.address] - Alamat
 * @param {string} [params.phone] - Telepon
 * @param {string} [params.website] - Website yang sudah diketahui
 * @param {string} [params.anchor] - Anchor lokasi
 * @returns {Promise<Object>}
 */
export async function performDeepWebResearch({ name, category, address, phone, website, anchor }) {
  if (!name || name.trim().length < 2) {
    return { website: null, answer: null, snippets: [], sourcesCited: [], socials: {}, candidateEmails: [], candidatePhones: [], source: 'none' };
  }

  const cleanName = name.trim();
  const cleanCategory = (category && category !== 'Umum') ? category.trim() : '';

  // 1. Rumuskan 3 sudut investigasi paralel (Multi-Angle Research Angles)
  const qServices = `"${cleanName}" ${cleanCategory} services solutions clients Singapore`.trim();
  const qLeadership = `"${cleanName}" Singapore director CEO founder management executive`.trim();
  const qOperations = `"${cleanName}" Singapore reviews workflow technology complaints expansion`.trim();

  // 2. Eksekusi paralel seluruh sudut pandang (Fan-Out)
  const [dataServices, dataLeadership, dataOperations] = await Promise.all([
    executeSingleTavilySearch(qServices, 4),
    executeSingleTavilySearch(qLeadership, 4),
    executeSingleTavilySearch(qOperations, 4)
  ]);

  // Jika semua Tavily query gagal, gunakan fallback DuckDuckGo
  if (!dataServices && !dataLeadership && !dataOperations) {
    const fallbackRes = await searchDuckDuckGoWeb(`${cleanName} ${cleanCategory} Singapore`);
    if (fallbackRes) {
      return {
        ...fallbackRes,
        sourcesCited: (fallbackRes.snippets || []).map((s) => ({ title: cleanName, url: fallbackRes.website || '', snippet: s })),
        source: 'duckduckgo_deep_fallback'
      };
    }
  }

  // 3. Konsolidasi hasil pencarian dari ketiga sudut (Fan-In)
  const allResults = [
    ...(dataServices?.results || []),
    ...(dataLeadership?.results || []),
    ...(dataOperations?.results || [])
  ];

  const seenUrls = new Set();
  const sourcesCited = [];
  const snippets = [];
  const images = [];

  for (const item of allResults) {
    if (!item || !item.url) continue;
    const normUrl = item.url.trim().toLowerCase();
    if (!seenUrls.has(normUrl)) {
      seenUrls.add(normUrl);
      sourcesCited.push({
        title: item.title || cleanName,
        url: item.url,
        snippet: (item.content || '').slice(0, 240)
      });
      if (item.content) {
        snippets.push(`[${item.title || 'Source'}] ${item.content}`);
      }
    }
  }

  [dataServices?.images, dataLeadership?.images, dataOperations?.images].forEach((imgList) => {
    if (Array.isArray(imgList)) {
      imgList.forEach((img) => {
        if (img && !images.includes(img)) images.push(img);
      });
    }
  });

  // Tautkan kandidat website resmi
  const candidateUrl = allResults.find((r) => {
    if (!r.url) return false;
    const u = r.url.toLowerCase();
    return (
      !u.includes('facebook.com') &&
      !u.includes('instagram.com') &&
      !u.includes('linkedin.com') &&
      !u.includes('twitter.com') &&
      !u.includes('x.com') &&
      !u.includes('wikipedia.org') &&
      !u.includes('youtube.com') &&
      !u.includes('yellowpages') &&
      !u.includes('streetdirectory.com') &&
      !u.includes('tripadvisor')
    );
  })?.url || website || null;

  const linkedinResult = allResults.find((r) => r.url?.toLowerCase().includes('linkedin.com'));
  const fbResult = allResults.find((r) => r.url?.toLowerCase().includes('facebook.com'));
  const igResult = allResults.find((r) => r.url?.toLowerCase().includes('instagram.com'));

  // Ekstrak kontak email dan nomor telepon dari seluruh teks
  const combinedText = [
    dataServices?.answer || '',
    dataLeadership?.answer || '',
    dataOperations?.answer || '',
    ...snippets
  ].join(' ');

  const emailMatches = combinedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const candidateEmails = [...new Set(emailMatches)].filter((e) => {
    const lower = e.toLowerCase();
    return !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.includes('sentry') && !lower.includes('example.com') && !lower.includes('wixpress');
  });

  const phoneMatches = combinedText.match(/(?:\+62[\s-]?(?:21|31|8\d{1,2})|\+65[\s-]?[689]|0[238]\d{1,2})[\s-]?[0-9\s-]{6,12}/g) || [];
  const candidatePhones = [...new Set(phoneMatches.map((p) => p.trim()))];

  const primaryAnswer = dataServices?.answer || dataLeadership?.answer || dataOperations?.answer || null;

  return {
    website: candidateUrl,
    answer: primaryAnswer,
    snippets: snippets.slice(0, 16),
    sourcesCited: sourcesCited.slice(0, 8),
    images,
    socials: {
      linkedin: linkedinResult?.url || null,
      facebook: fbResult?.url || null,
      instagram: igResult?.url || null
    },
    candidateEmails,
    candidatePhones,
    source: 'serverless_deep_research'
  };
}
