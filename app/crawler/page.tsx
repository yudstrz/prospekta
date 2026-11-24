'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';

interface PageResult {
  url: string;
  title: string;
  description: string;
  text: string;
  links: string[];
}

export default function CrawlerPage() {
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<PageResult[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [visitedCount, setVisitedCount] = useState(0);
  const [currentUrl, setCurrentUrl] = useState('');
  const [statusText, setStatusText] = useState('Siap memulai.');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stopSignalRef = useRef(false);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
      setUrl(targetUrl);
    }

    setIsRunning(true);
    setResults([]);
    setQueueCount(0);
    setVisitedCount(0);
    setCurrentUrl(targetUrl);
    setErrorMsg(null);
    setStatusText('Menginisialisasi perayapan dan memuat robots.txt / sitemap...');
    stopSignalRef.current = false;

    let queue: string[] = [];
    let visited: string[] = [];
    let allResults: PageResult[] = [];
    let isDone = false;

    try {
      while (!isDone && !stopSignalRef.current) {
        setStatusText(`Memproses batch... (${visited.length} halaman terproses, sisa antrean: ${queue.length})`);

        const res = await fetch('/api/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: targetUrl,
            queue,
            visited,
            maxPages: Number(maxPages) || 50,
          }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          throw new Error(data.error || 'Terjadi kesalahan saat memproses perayapan.');
        }

        if (Array.isArray(data.results) && data.results.length > 0) {
          allResults = [...allResults, ...data.results];
          setResults(allResults);
        }

        queue = Array.isArray(data.queue) ? data.queue : [];
        visited = Array.isArray(data.visited) ? data.visited : [];

        setQueueCount(queue.length);
        setVisitedCount(visited.length);
        if (queue.length > 0) {
          setCurrentUrl(queue[0]);
        }

        if (data.done || visited.length >= maxPages || queue.length === 0) {
          isDone = true;
          break;
        }

        // Jeda singkat antar batch untuk efisiensi event loop peramban
        await new Promise((r) => setTimeout(r, 200));
      }

      if (stopSignalRef.current) {
        setStatusText(`Perayapan dihentikan oleh pengguna. Berhasil mengumpulkan ${allResults.length} halaman.`);
      } else {
        setStatusText(`Perayapan selesai. Berhasil mengumpulkan ${allResults.length} halaman.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menjalankan perayapan website.');
      setStatusText('Proses perayapan terhenti karena kendala koneksi.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    stopSignalRef.current = true;
    setStatusText('Menghentikan perayapan setelah batch aktif selesai...');
  };

  const downloadJson = () => {
    if (results.length === 0) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    const domain = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    a.download = `crawl_${domain}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const downloadMarkdown = () => {
    if (results.length === 0) return;
    let md = `# Laporan Hasil Perayapan Website: ${url}\n\n`;
    md += `- Tanggal Perayapan: ${new Date().toLocaleString('id-ID')}\n`;
    md += `- Total Halaman: ${results.length}\n\n`;
    md += `## Daftar Isi Halaman\n\n`;

    results.forEach((p, idx) => {
      md += `${idx + 1}. [${p.title || p.url}](#page-${idx + 1})\n`;
    });

    md += `\n---\n\n`;

    results.forEach((p, idx) => {
      md += `### <a id="page-${idx + 1}"></a>${idx + 1}. ${p.title || 'Halaman Tanpa Judul'}\n\n`;
      md += `- URL: ${p.url}\n`;
      if (p.description) {
        md += `- Deskripsi: ${p.description}\n`;
      }
      md += `- Jumlah Tautan Internal Ditemukan: ${p.links.length}\n\n`;
      md += `#### Konten Teks Halaman:\n\n${p.text || 'Tidak ada teks yang dapat diekstrak.'}\n\n`;
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    const domain = new URL(url).hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
    a.download = `crawl_${domain}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-app, #f8fafc)', color: 'var(--text-main, #0f172a)', padding: '2rem 1rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Perayap Website Domain Sama (Serverless Crawler)
            </h1>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>
              Mengekstrak teks, judul, meta deskripsi, dan tautan internal secara bertahap tanpa server persisten.
            </p>
          </div>
          <Link
            href="/"
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              padding: '0.5rem 0.875rem',
              borderRadius: '6px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              color: 'var(--text-main, #0f172a)',
              textDecoration: 'none',
            }}
          >
            Kembali ke Dashboard
          </Link>
        </div>

        {/* Form Card */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                  URL Awal Website
                </label>
                <input
                  type="text"
                  placeholder="https://perusahaan-anda.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isRunning}
                  required
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                  Maks. Halaman
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  disabled={isRunning}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {!isRunning ? (
                <button
                  type="submit"
                  disabled={!url.trim()}
                  style={{
                    height: '38px',
                    padding: '0 1.25rem',
                    borderRadius: '6px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: url.trim() ? 'pointer' : 'not-allowed',
                    opacity: url.trim() ? 1 : 0.6,
                  }}
                >
                  Mulai Perayapan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  style={{
                    height: '38px',
                    padding: '0 1.25rem',
                    borderRadius: '6px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  Hentikan Perayapan
                </button>
              )}

              {results.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={downloadMarkdown}
                    style={{
                      height: '38px',
                      padding: '0 1rem',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                    }}
                  >
                    Unduh Markdown
                  </button>
                  <button
                    type="button"
                    onClick={downloadJson}
                    style={{
                      height: '38px',
                      padding: '0 1rem',
                      borderRadius: '6px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                    }}
                  >
                    Unduh JSON
                  </button>
                </>
              )}

              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #64748b)', marginLeft: 'auto' }}>
                {statusText}
              </span>
            </div>
          </form>

          {errorMsg && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.8125rem' }}>
              <strong>Kendala:</strong> {errorMsg}
            </div>
          )}
        </div>

        {/* Progress & Metrics Bar */}
        {(isRunning || results.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Halaman Terkumpul</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0284c7', marginTop: '2px' }}>
                {results.length} / {maxPages}
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Sisa Antrean Link</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706', marginTop: '2px' }}>
                {queueCount}
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Dikunjungi</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>
                {visitedCount}
              </div>
            </div>
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', backgroundColor: '#f8fafc', fontWeight: 600, fontSize: '0.875rem' }}>
              Daftar Halaman Berhasil Ditemukan ({results.length})
            </div>
            <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
              {results.map((item, idx) => (
                <div key={idx} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.925rem', color: '#0f172a' }}>
                      {idx + 1}. {item.title || 'Halaman Tanpa Judul'}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {item.links.length} link internal
                    </span>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.75rem', color: '#0284c7', textDecoration: 'none', display: 'block', marginTop: '2px' }}
                  >
                    {item.url}
                  </a>

                  {item.description && (
                    <p style={{ margin: '0.375rem 0 0', fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                      {item.description}
                    </p>
                  )}

                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.text.slice(0, 220)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
