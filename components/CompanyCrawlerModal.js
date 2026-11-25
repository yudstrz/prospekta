'use client';

import React, { useState, useRef, useEffect } from 'react';

export default function CompanyCrawlerModal({
  isOpen,
  onClose,
  onApplyToProfile,
  defaultUrl = '',
  initialUrls = null,
  initialScope = 'subdomain',
  initialAllowedDomains = '',
  tenantId = null,
  onSaveUrls = null,
}) {
  // 1. URLs State with CRUD
  const [urlList, setUrlList] = useState(() => {
    if (Array.isArray(initialUrls) && initialUrls.length > 0) {
      return initialUrls;
    }
    const cleanDefault = (defaultUrl || '').trim();
    if (cleanDefault) {
      return [
        { id: 'url_1', label: 'Website Utama', url: cleanDefault, selected: true }
      ];
    }
    if (tenantId) {
      return [];
    }
    return [
      { id: 'url_1', label: 'Website Utama', url: 'https://prospekta.id', selected: true },
      { id: 'url_2', label: 'Katalog Kursus & Program', url: 'https://prospekta.id/solutions', selected: true },
      { id: 'url_3', label: 'Prospekta Global', url: 'https://prospekta.id', selected: false },
    ];
  });

  // URL Form State (Add / Edit)
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editUrl, setEditUrl] = useState('');

  // 2. Domain Scope & Safety Settings
  const [crawlScope, setCrawlScope] = useState(initialScope || 'subdomain'); // 'exact' | 'subdomain' | 'custom'
  const [customDomains, setCustomDomains] = useState(() => {
    if (initialAllowedDomains) return initialAllowedDomains;
    return tenantId ? '' : 'prospekta.id';
  });
  const [maxPages, setMaxPages] = useState(25);

  // 3. Execution & Results State
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [resultsPage, setResultsPage] = useState(1);
  const [urlFilter, setUrlFilter] = useState('');
  const [queueCount, setQueueCount] = useState(0);
  const [visitedCount, setVisitedCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState('Siap memindai.');
  const [errorMsg, setErrorMsg] = useState(null);

  const stopSignalRef = useRef(false);
  const isBackdropClickRef = useRef(false);

  // Sync initial URLs when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (Array.isArray(initialUrls) && initialUrls.length > 0) {
      setUrlList(initialUrls);
    } else if (defaultUrl && urlList.length === 0) {
      setUrlList([{ id: 'url_1', label: 'Website Utama', url: defaultUrl, selected: true }]);
    }
  }, [isOpen, initialUrls, defaultUrl]);

  // Sync initial domain scope
  useEffect(() => {
    if (initialScope) setCrawlScope(initialScope);
    if (initialAllowedDomains) setCustomDomains(initialAllowedDomains);
  }, [initialScope, initialAllowedDomains]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropMouseDown = (e) => {
    isBackdropClickRef.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e) => {
    if (isBackdropClickRef.current && e.target === e.currentTarget) {
      onClose();
    }
    isBackdropClickRef.current = false;
  };

  // CRUD Operations on URL List
  const handleToggleSelect = (id) => {
    setUrlList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSelectAll = (select) => {
    setUrlList((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleAddUrl = (e) => {
    e?.preventDefault();
    let clean = (newUrl || '').trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }

    try {
      new URL(clean);
    } catch {
      setErrorMsg('Format URL tidak valid. Gunakan format https://domain-anda.com');
      return;
    }

    const newItem = {
      id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: (newLabel || '').trim() || new URL(clean).hostname,
      url: clean,
      selected: true,
    };

    setUrlList((prev) => [...prev, newItem]);
    setNewUrl('');
    setNewLabel('');
    setShowAddForm(false);
    setErrorMsg(null);
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditUrl(item.url);
  };

  const handleSaveEdit = (id) => {
    let clean = (editUrl || '').trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }

    try {
      new URL(clean);
    } catch {
      setErrorMsg('Format URL tidak valid.');
      return;
    }

    setUrlList((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, label: (editLabel || '').trim() || new URL(clean).hostname, url: clean }
          : item
      )
    );
    setEditingId(null);
    setEditLabel('');
    setEditUrl('');
    setErrorMsg(null);
  };

  const handleDeleteUrl = (id) => {
    setUrlList((prev) => prev.filter((item) => item.id !== id));
  };

  // Start Crawl across selected URLs
  const handleStart = async (e) => {
    e?.preventDefault();
    const activeTargets = urlList.filter((item) => item.selected);
    if (activeTargets.length === 0) {
      setErrorMsg('Silakan pilih minimal 1 URL untuk dirayapi.');
      return;
    }

    const seedUrls = activeTargets.map((item) => item.url.trim());
    const primaryUrl = seedUrls[0];

    setIsRunning(true);
    setResults([]);
    setQueueCount(0);
    setVisitedCount(0);
    setErrorMsg(null);
    setStatusMsg('Memuat robots.txt dan struktur tautan...');
    stopSignalRef.current = false;

    let queue = [];
    let visited = [];
    let accumulated = [];
    let done = false;

    const allowedDomainList = customDomains
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    try {
      while (!done && !stopSignalRef.current) {
        setStatusMsg(
          `Memproses batch... (${visited.length} halaman terproses, antrean: ${queue.length})`
        );

        const res = await fetch('/api/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: primaryUrl,
            seedUrls,
            scope: crawlScope,
            allowedDomains: allowedDomainList,
            queue,
            visited,
            maxPages: Number(maxPages) || 25,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Gagal memproses perayapan website.');
        }

        if (Array.isArray(data.results) && data.results.length > 0) {
          accumulated = [...accumulated, ...data.results];
          setResults(accumulated);
        }

        queue = Array.isArray(data.queue) ? data.queue : [];
        visited = Array.isArray(data.visited) ? data.visited : [];

        setQueueCount(queue.length);
        setVisitedCount(visited.length);

        if (data.done || visited.length >= maxPages || queue.length === 0) {
          done = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      if (stopSignalRef.current) {
        setStatusMsg(`Perayapan dihentikan. Ditemukan ${accumulated.length} halaman.`);
      } else {
        setStatusMsg(`Perayapan selesai. Berhasil mengumpulkan ${accumulated.length} halaman.`);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat merayapi website.');
      setStatusMsg('Perayapan terhenti.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    stopSignalRef.current = true;
    setStatusMsg('Menghentikan perayapan...');
  };

  const handleApplyToOffering = async () => {
    if (results.length === 0) return;

    const cleanBullets = [];
    results.forEach((p) => {
      const cleanTitle = (p.title || '').replace(/\s*[-|]\s*.*$/, '').replace(/\s+/g, ' ').trim();
      if (cleanTitle && cleanTitle.length > 3 && !cleanBullets.includes(cleanTitle)) {
        cleanBullets.push(cleanTitle);
      }
    });

    const descPoints = [];
    results.forEach((p) => {
      const d = (p.description || '').replace(/\s+/g, ' ').trim();
      if (d && d.length > 25 && !descPoints.some((existing) => existing.includes(d.slice(0, 40)))) {
        descPoints.push(d);
      }
    });

    const parts = [];
    if (cleanBullets.length > 0) {
      parts.push(`Layanan & Fokus Solusi:\n${cleanBullets.slice(0, 7).map((item) => `- ${item}`).join('\n')}`);
    }
    if (descPoints.length > 0) {
      parts.push(`Ringkasan Penawaran:\n${descPoints.slice(0, 3).map((d, i) => `${i + 1}. ${d}`).join('\n')}`);
    }
    const compiledText = parts.join('\n\n') || 'Profil layanan perusahaan hasil ekstraksi website.';

    // Callback ke parent
    if (onApplyToProfile) {
      onApplyToProfile(compiledText.trim(), urlList);
    }

    // Callback onSaveUrls jika disediakan
    if (onSaveUrls) {
      onSaveUrls(urlList);
    }

    // Auto-persist ke settings API jika tenantId tersedia
    try {
      const payload = {
        company_urls: JSON.stringify(urlList),
        crawl_domains: customDomains,
        crawl_scope: crawlScope,
        company_offering: compiledText.trim(),
      };
      const endpoint = tenantId ? `/api/settings?tenant_id=${encodeURIComponent(tenantId)}` : '/api/settings';
      await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {}

    onClose();
  };

  const downloadMarkdown = () => {
    if (results.length === 0) return;
    const selectedHosts = urlList
      .filter((u) => u.selected)
      .map((u) => {
        try {
          return new URL(u.url).hostname;
        } catch {
          return u.url;
        }
      })
      .join(', ');

    let md = `# Basis Pengetahuan Perusahaan dari Website\n\n`;
    md += `- Sumber URL: ${selectedHosts}\n`;
    md += `- Cakupan Domain: ${crawlScope}\n`;
    md += `- Tanggal Ekstraksi: ${new Date().toLocaleString('id-ID')}\n`;
    md += `- Total Halaman: ${results.length}\n\n`;
    md += `## Ringkasan Struktur & Halaman\n\n`;

    results.forEach((p, idx) => {
      md += `${idx + 1}. [${p.title || p.url}](#hal-${idx + 1})\n`;
    });

    md += `\n---\n\n`;

    results.forEach((p, idx) => {
      md += `### <a id="hal-${idx + 1}"></a>${idx + 1}. ${p.title || 'Halaman Tanpa Judul'}\n\n`;
      md += `- URL: ${p.url}\n`;
      if (p.description) md += `- Deskripsi: ${p.description}\n`;
      md += `- Tautan Internal Terdeteksi: ${p.links?.length || 0}\n\n`;
      md += `#### Konten Teks:\n\n${p.text || 'Tidak ada teks yang dapat diekstrak.'}\n\n`;
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `basis_pengetahuan_website_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const downloadJson = () => {
    if (results.length === 0) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `basis_pengetahuan_website_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="crawler-modal-content"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '88dvh',
          backgroundColor: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border-subtle, #e2e8f0)',
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-card, #ffffff)',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
              Perayapan Multi-URL &amp; Domain Perusahaan
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
              Ekstrak teks dan intelijen layanan dari satu atau beberapa domain website perusahaan untuk basis AI.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              color: 'var(--text-muted, #64748b)',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            Tutup
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', overflowX: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', boxSizing: 'border-box' }}>

          {/* Section 1: Daftar Target URL (CRUD) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Daftar Tautan Website Sasaran ({urlList.length})
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  ({urlList.filter((u) => u.selected).length} dipilih untuk dirayapi)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  disabled={isRunning}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '0.72rem',
                    color: '#0284c7',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    textDecoration: 'underline',
                  }}
                >
                  Pilih Semua
                </button>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  disabled={isRunning}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                >
                  Batal Pilih
                </button>
                <span style={{ color: 'var(--border-subtle)' }}>|</span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(!showAddForm)}
                  disabled={isRunning}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.72rem', height: '24px', padding: '0 8px' }}
                >
                  {showAddForm ? 'Tutup Form' : '+ Tambah URL'}
                </button>
              </div>
            </div>

            {/* Form Tambah URL Baru */}
            {showAddForm && (
              <form
                onSubmit={handleAddUrl}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-card-subtle, #f8fafc)',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: '6px',
                  marginBottom: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Label (contoh: Katalog Kursus, Landing Asia)"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    style={{
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '5px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      fontSize: '0.8rem',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="URL (contoh: https://domainanda.com atau https://domainanda.com/layanan)"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    style={{
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '5px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      fontSize: '0.8rem',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.72rem', height: '28px' }}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.72rem', height: '28px' }}
                  >
                    Simpan Tautan
                  </button>
                </div>
              </form>
            )}

            {/* List Tautan Terdaftar */}
            <div
              style={{
                border: '1px solid var(--border-subtle, #e2e8f0)',
                borderRadius: '6px',
                maxHeight: '160px',
                overflowY: 'auto',
                backgroundColor: 'var(--bg-app, #ffffff)',
              }}
            >
              {urlList.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Belum ada URL terdaftar. Klik "+ Tambah URL" untuk menambahkan website perusahaan Anda.
                </div>
              ) : (
                urlList.map((item) => {
                  const isEditing = editingId === item.id;
                  let host = '';
                  try {
                    host = new URL(item.url).hostname;
                  } catch (_) {}

                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        backgroundColor: item.selected ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            style={{
                              width: '120px',
                              height: '30px',
                              padding: '0 8px',
                              fontSize: '0.75rem',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                            }}
                          />
                          <input
                            type="text"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            style={{
                              flex: 1,
                              height: '30px',
                              padding: '0 8px',
                              fontSize: '0.75rem',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '4px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            className="btn btn-primary btn-sm"
                            style={{ height: '30px', fontSize: '0.72rem', padding: '0 8px' }}
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="btn btn-secondary btn-sm"
                            style={{ height: '30px', fontSize: '0.72rem', padding: '0 8px' }}
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => handleToggleSelect(item.id)}
                              disabled={isRunning}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-main)' }}>
                                  {item.label}
                                </span>
                                {host && (
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--bg-card-subtle, #f1f5f9)',
                                      color: 'var(--text-muted)',
                                      border: '1px solid var(--border-subtle)',
                                    }}
                                  >
                                    {host}
                                  </span>
                                )}
                              </div>
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#0284c7',
                                  textDecoration: 'none',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  display: 'block',
                                }}
                              >
                                {item.url}
                              </a>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              disabled={isRunning}
                              style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '0.72rem',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px 6px',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUrl(item.id)}
                              disabled={isRunning}
                              style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '0.72rem',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '2px 6px',
                              }}
                            >
                              Hapus
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 2: Preferensi Jangkauan Domain (Multi-Domain Scope) */}
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-card-subtle, #f8fafc)',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Preferensi Batasan Domain (Crawl Scope)
              </span>
              <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 600 }}>
                Proteksi SSRF &amp; Web Eksternal Aktif
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: '5px',
                  border: `1px solid ${crawlScope === 'subdomain' ? '#38bdf8' : 'var(--border-subtle)'}`,
                  backgroundColor: crawlScope === 'subdomain' ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="crawlScope"
                  value="subdomain"
                  checked={crawlScope === 'subdomain'}
                  onChange={() => setCrawlScope('subdomain')}
                  disabled={isRunning}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Subdomain (*.domain.com)</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Mencakup app.prospekta.id, dll.
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: '5px',
                  border: `1px solid ${crawlScope === 'custom' ? '#38bdf8' : 'var(--border-subtle)'}`,
                  backgroundColor: crawlScope === 'custom' ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="crawlScope"
                  value="custom"
                  checked={crawlScope === 'custom'}
                  onChange={() => setCrawlScope('custom')}
                  disabled={isRunning}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Multi-Domain / Sibling</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Cakup prospekta.id &amp; hosting terdaftar.
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  borderRadius: '5px',
                  border: `1px solid ${crawlScope === 'exact' ? '#38bdf8' : 'var(--border-subtle)'}`,
                  backgroundColor: crawlScope === 'exact' ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="crawlScope"
                  value="exact"
                  checked={crawlScope === 'exact'}
                  onChange={() => setCrawlScope('exact')}
                  disabled={isRunning}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Ketat (Strict Same Host)</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Hanya domain persis URL utama.
                  </div>
                </div>
              </label>
            </div>

            {/* Input Extra Domain jika Multi-Domain dipilih */}
            {crawlScope === 'custom' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, marginBottom: '2px' }}>
                  Daftar Domain Saudara yang Diizinkan (pisahkan dengan koma):
                </label>
                <input
                  type="text"
                  placeholder="prospekta.id, client.com"
                  value={customDomains}
                  onChange={(e) => setCustomDomains(e.target.value)}
                  disabled={isRunning}
                  style={{
                    width: '100%',
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-app)',
                    color: 'var(--text-main)',
                    fontSize: '0.78rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </div>

          {/* Section 3: Pengaturan Batas & Tombol Eksekusi */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="crawler-max-pages" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                Maksimal Halaman:
              </label>
              <input
                id="crawler-max-pages"
                name="maxPages"
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(e) => setMaxPages(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={isRunning}
                style={{
                  width: '80px',
                  height: '34px',
                  padding: '0 8px',
                  borderRadius: '5px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-main)',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isRunning ? (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={urlList.filter((u) => u.selected).length === 0}
                  className="btn btn-primary"
                  style={{ height: '36px', padding: '0 16px', fontSize: '0.8125rem', fontWeight: 600 }}
                >
                  Mulai Perayapan ({urlList.filter((u) => u.selected).length} URL)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '6px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                  }}
                >
                  Hentikan Perayapan
                </button>
              )}
            </div>
          </div>

          {/* Status Message */}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Status: {statusMsg}
          </div>

          {errorMsg && (
            <div style={{ padding: '0.625rem 0.875rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', color: '#ef4444', fontSize: '0.78rem' }}>
              <strong>Kendala:</strong> {errorMsg}
            </div>
          )}

          {/* Metrics summary */}
          {(isRunning || results.length > 0) && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-card-subtle, #f8fafc)', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '6px', fontSize: '0.75rem' }}>
              <div><strong>Halaman Terkumpul:</strong> {results.length} / {maxPages}</div>
              <div>&bull;</div>
              <div><strong>Antrean Rute:</strong> {queueCount}</div>
              <div>&bull;</div>
              <div><strong>Dikunjungi:</strong> {visitedCount}</div>
            </div>
          )}

          {/* Results preview with filter & pagination */}
          {results.length > 0 && (() => {
            const RESULTS_PER_PAGE = 5;
            const query = urlFilter.trim().toLowerCase();
            const filtered = query
              ? results.filter((r) => (r.url || '').toLowerCase().includes(query) || (r.title || '').toLowerCase().includes(query))
              : results;
            const totalPages = Math.max(1, Math.ceil(filtered.length / RESULTS_PER_PAGE));
            const currentPage = Math.min(resultsPage, totalPages);
            const startIdx = (currentPage - 1) * RESULTS_PER_PAGE;
            const pageItems = filtered.slice(startIdx, startIdx + RESULTS_PER_PAGE);

            return (
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-app)' }}>
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Daftar URL Berhasil Dirayapi ({filtered.length}{query ? ` dari ${results.length}` : ''})
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Menampilkan {filtered.length === 0 ? 0 : startIdx + 1}-{Math.min(startIdx + RESULTS_PER_PAGE, filtered.length)} dari {filtered.length} halaman (Hal. {currentPage}/{totalPages})
                    </div>
                  </div>
                  <input
                    type="search"
                    value={urlFilter}
                    onChange={(e) => { setUrlFilter(e.target.value); setResultsPage(1); }}
                    placeholder="Filter URL atau judul..."
                    aria-label="Filter daftar URL hasil crawling"
                    style={{
                      minHeight: '34px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-app)',
                      color: 'var(--text-main)',
                      minWidth: '190px',
                    }}
                  />
                </div>

                <div>
                  {pageItems.length === 0 ? (
                    <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Tidak ada URL yang cocok dengan pencarian &ldquo;{urlFilter}&rdquo;.
                    </div>
                  ) : (
                    pageItems.map((r, i) => {
                      const itemNum = startIdx + i + 1;
                      let host = '';
                      try { host = new URL(r.url).hostname; } catch (_) {}
                      return (
                        <div key={`${r.url}_${itemNum}`} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {itemNum}. {r.title || 'Halaman Tanpa Judul'}
                            </span>
                            {host && (
                              <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                                {host}
                              </span>
                            )}
                          </div>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent-text)', fontSize: '0.72rem', wordBreak: 'break-all', textDecoration: 'underline' }}
                          >
                            {r.url}
                          </a>
                          {r.description && (
                            <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.description}</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {totalPages > 1 && (
                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-card-subtle)', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={currentPage <= 1}
                      onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
                      style={{ minHeight: '36px', fontSize: '0.75rem' }}
                    >
                      &laquo; Sebelumnya
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                        .map((p, idx, arr) => (
                          <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {idx > 0 && arr[idx - 1] !== p - 1 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0 2px' }}>...</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setResultsPage(p)}
                              style={{
                                minHeight: '34px',
                                minWidth: '34px',
                                padding: '0 8px',
                                fontSize: '0.75rem',
                                fontWeight: p === currentPage ? 700 : 500,
                                borderRadius: '6px',
                                border: p === currentPage ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                                backgroundColor: p === currentPage ? 'var(--primary)' : 'var(--bg-app)',
                                color: p === currentPage ? '#ffffff' : 'var(--text-main)',
                                cursor: 'pointer',
                              }}
                            >
                              {p}
                            </button>
                          </span>
                        ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setResultsPage((p) => Math.min(totalPages, p + 1))}
                      style={{ minHeight: '36px', fontSize: '0.75rem' }}
                    >
                      Berikutnya &raquo;
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.875rem 1.25rem',
            paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom, 16px))',
            borderTop: '1px solid var(--border-subtle, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-card, #ffffff)',
            flexWrap: 'wrap',
            gap: '8px',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            {results.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={downloadMarkdown}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  Unduh Markdown
                </button>
                <button
                  type="button"
                  onClick={downloadJson}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  Unduh JSON
                </button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {results.length > 0 && onApplyToProfile && (
              <button
                type="button"
                onClick={handleApplyToOffering}
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.75rem' }}
                title="Salin ringkasan layanan ke profil perusahaan & simpan tautan ke profil"
              >
                Terapkan ke Profil Perusahaan
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
