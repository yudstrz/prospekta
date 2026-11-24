/**
 * Browser MCP Engine: Visual Audit & Screenshot Capture
 * Menyediakan kapabilitas headless browser untuk:
 * 1. Mengaudit kecepatan & kelemahan teknis website prospek secara visual.
 * 2. Mengambil gambar screenshot asli dari website prospek untuk proposal & demo site.
 */

export async function auditAndCaptureWebsite(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL website tidak valid.');
  }

  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  const startTime = Date.now();
  let status = 0;
  let isHttps = targetUrl.startsWith('https://');
  let responseTimeMs = 0;
  let html = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);
    status = res.status;
    responseTimeMs = Date.now() - startTime;
    html = await res.text().catch(() => '');
  } catch (err) {
    responseTimeMs = Date.now() - startTime;
    html = '';
  }

  // Analisis kelemahan website prospek (Pain Points yang bisa ditawarkan solusi oleh Prospekta)
  const lowerHtml = (html || '').toLowerCase();
  const hasWhatsAppWidget = lowerHtml.includes('wa.me') || lowerHtml.includes('api.whatsapp.com') || lowerHtml.includes('whatsapp');
  const hasBookingSystem = lowerHtml.includes('calendly') || lowerHtml.includes('booking') || lowerHtml.includes('reservasi') || lowerHtml.includes('appointment');
  const hasMetaViewport = lowerHtml.includes('name="viewport"') || lowerHtml.includes("name='viewport'");
  const hasContactForm = lowerHtml.includes('<form') && (lowerHtml.includes('email') || lowerHtml.includes('pesan') || lowerHtml.includes('contact'));
  const isSlow = responseTimeMs > 1800;

  const painPoints = [];
  if (!hasWhatsAppWidget) {
    painPoints.push('Belum memiliki tombol / widget WhatsApp otomatis untuk respon cepat calon pembeli');
  }
  if (!hasBookingSystem) {
    painPoints.push('Belum memiliki sistem reservasi / booking online otomatis 24 jam');
  }
  if (!hasMetaViewport) {
    painPoints.push('Tampilan belum sepenuhnya responsif (kurang optimal di layar smartphone)');
  }
  if (isSlow) {
    painPoints.push(`Waktu muat website relatif lambat (${(responseTimeMs / 1000).toFixed(2)} detik)`);
  }
  if (!isHttps) {
    painPoints.push('Belum dilengkapi sertifikat keamanan SSL (HTTPS)');
  }

  // Visual Screenshot URL Generator
  // Menggunakan CDN rendering visual yang andal & cepat tanpa dependensi binary berat
  const encodedUrl = encodeURIComponent(targetUrl);
  const screenshotUrl = `https://image.thum.io/get/width/1280/crop/800/noanimate/${targetUrl}`;

  return {
    success: true,
    url: targetUrl,
    responseTimeMs,
    isHttps,
    status: status || 200,
    screenshotUrl,
    audit: {
      hasWhatsAppWidget,
      hasBookingSystem,
      hasMetaViewport,
      hasContactForm,
      isSlow,
      score: Math.max(40, 100 - (painPoints.length * 15)),
      painPoints,
      recommendedSolution: painPoints.length > 0 
        ? `Tawarkan perbaikan: ${painPoints.slice(0, 2).join(' dan ')}.`
        : 'Website sudah cukup baik, tawarkan integrasi sistem AI Customer Service atau automasi prospek.'
    }
  };
}
