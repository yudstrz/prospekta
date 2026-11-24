'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useI18n } from '@/lib/i18n';

const READ_STORAGE_KEY = 'prospekta_read_notification_uids_v1';
let globalNotificationsCache = null;

const IconFlame = ({ width = 13, height = 13, color = 'currentColor' }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const IconMail = ({ width = 13, height = 13, color = 'currentColor' }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const IconBell = ({ width = 13, height = 13, color = 'currentColor' }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const IconLayers = ({ width = 13, height = 13, color = 'currentColor' }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IconClock = ({ width = 13, height = 13, color = 'currentColor' }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconShare = ({ width = 13, height = 13, color = 'currentColor' }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

export default function NotificationsModal({
  onClose,
  onOpenWebmail,
  onOpenReach,
  onUpdateUnreadCount,
}) {
  const { lang, tx } = useI18n();

  const [loading, setLoading] = useState(!globalNotificationsCache);
  const [error, setError] = useState(null);
  const [replies, setReplies] = useState(globalNotificationsCache || []);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'hot_lead' | 'follow_up_later' | 'redirect_contact' | 'sales_reply' | 'unread'
  const [page, setPage] = useState(1);
  const itemsPerPage = 5;

  // Desktop horizontal drag-to-scroll & wheel state
  const tablistRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  // Set UID yang sudah dibaca (disimpan di localStorage)
  const [readUids, setReadUids] = useState(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem(READ_STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (_) {
      return new Set();
    }
  });

  const saveReadUids = useCallback((newSet) => {
    setReadUids(newSet);
    try {
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(newSet)));
    } catch (_) {}
  }, []);

  const markAsRead = useCallback((uid) => {
    if (!uid) return;
    setReadUids((prev) => {
      if (prev.has(uid)) return prev;
      const next = new Set(prev);
      next.add(uid);
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch (_) {}
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    const allUids = replies.map((r) => r.uid).filter(Boolean);
    const next = new Set([...Array.from(readUids), ...allUids]);
    saveReadUids(next);
  }, [replies, readUids, saveReadUids]);

  // Fetch data notifikasi dari API
  const fetchNotifications = useCallback(async (isRefresh = false) => {
    if (!globalNotificationsCache || isRefresh) {
      setLoading(true);
    }
    setError(null);
    try {
      const url = `/api/reach/notifications?limit=50&refresh=${isRefresh ? 'true' : 'false'}&_t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Gagal memuat daftar notifikasi.');
      }
      const items = Array.isArray(data.notifications) ? data.notifications : [];
      globalNotificationsCache = items;
      setReplies(items);
    } catch (err) {
      if (!globalNotificationsCache) {
        setError(err.message || 'Gagal terhubung ke layanan notifikasi.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications(false);
  }, [fetchNotifications]);

  // Sinkronisasi unread count ke parent dashboard
  useEffect(() => {
    const unreadTotal = replies.filter((r) => !readUids.has(r.uid)).length;
    if (onUpdateUnreadCount) {
      onUpdateUnreadCount(unreadTotal);
    }
  }, [replies, readUids, onUpdateUnreadCount]);

  // Keyboard shortcut: Escape untuk tutup modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Kunci scroll halaman utama saat modal terbuka
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Filter balasan berdasarkan tab yang dipilih
  const filteredReplies = useMemo(() => {
    switch (activeTab) {
      case 'hot_lead':
        return replies.filter((r) => r.isHighIntent);
      case 'follow_up_later':
        return replies.filter((r) => r.isFollowUpLater);
      case 'redirect_contact':
        return replies.filter((r) => r.isRedirect);
      case 'sales_reply':
        return replies.filter((r) => !r.isHighIntent && !r.isFollowUpLater && !r.isRedirect);
      case 'unread':
        return replies.filter((r) => !readUids.has(r.uid));
      default:
        return replies;
    }
  }, [replies, activeTab, readUids]);

  // Reset page ke 1 jika tab diganti
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  // Hitung jumlah untuk masing-masing tab
  const counts = useMemo(() => {
    const total = replies.length;
    const hot = replies.filter((r) => r.isHighIntent).length;
    const followUp = replies.filter((r) => r.isFollowUpLater).length;
    const redirect = replies.filter((r) => r.isRedirect).length;
    const general = replies.filter(
      (r) => !r.isHighIntent && !r.isFollowUpLater && !r.isRedirect
    ).length;
    const unread = replies.filter((r) => !readUids.has(r.uid)).length;
    return { total, hot, followUp, redirect, general, unread };
  }, [replies, readUids]);

  // Paginasi rapi
  const totalItems = filteredReplies.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const paginatedReplies = filteredReplies.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleOpenEmail = (reply) => {
    markAsRead(reply.uid);
    if (onOpenWebmail) {
      onOpenWebmail(reply.uid, reply.category, reply);
    } else {
      onClose();
    }
  };

  const handleOpenLead = (reply) => {
    markAsRead(reply.uid);
    if (onOpenReach && reply.placeId) {
      onOpenReach({
        overture_id: reply.placeId,
        name: reply.companyName,
        email: reply.partyEmail,
        phone: reply.phone,
      });
      onClose();
    }
  };

  // Drag & Wheel scrolling for tabs on desktop
  const handleMouseDown = (e) => {
    if (!tablistRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - tablistRef.current.offsetLeft);
    setScrollLeftState(tablistRef.current.scrollLeft);
  };

  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e) => {
    if (!isDragging || !tablistRef.current) return;
    e.preventDefault();
    const x = e.pageX - tablistRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    tablistRef.current.scrollLeft = scrollLeftState - walk;
  };

  const handleWheel = (e) => {
    if (tablistRef.current && e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  const scrollTabs = (direction) => {
    if (!tablistRef.current) return;
    const offset = direction === 'left' ? -180 : 180;
    tablistRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const tabItems = [
    {
      id: 'all',
      label: tx('All Replies', 'Semua Respon'),
      count: counts.total,
      icon: <IconLayers width={13} height={13} color="currentColor" />,
      color: '#0284c7',
      badgeBg: '#0284c7',
      badgeText: '#ffffff',
    },
    {
      id: 'hot_lead',
      label: tx('Hot Leads', 'Hot Leads'),
      count: counts.hot,
      icon: <IconFlame width={13} height={13} color="#ea580c" />,
      color: '#ea580c',
      badgeBg: '#ea580c',
      badgeText: '#ffffff',
    },
    {
      id: 'follow_up_later',
      label: tx('Follow Up', 'Tindak Lanjut'),
      count: counts.followUp,
      icon: <IconClock width={13} height={13} color="#d97706" />,
      color: '#d97706',
      badgeBg: '#d97706',
      badgeText: '#ffffff',
    },
    {
      id: 'redirect_contact',
      label: tx('Redirected', 'Pengalihan'),
      count: counts.redirect,
      icon: <IconShare width={13} height={13} color="#0284c7" />,
      color: '#0284c7',
      badgeBg: '#0284c7',
      badgeText: '#ffffff',
    },
    {
      id: 'sales_reply',
      label: tx('Prospect Replies', 'Respon Umum'),
      count: counts.general,
      icon: <IconMail width={13} height={13} color="#16a34a" />,
      color: '#16a34a',
      badgeBg: '#16a34a',
      badgeText: '#ffffff',
    },
    ...(counts.unread > 0
      ? [
          {
            id: 'unread',
            label: tx('Unread', 'Belum Dibaca'),
            count: counts.unread,
            icon: <IconBell width={13} height={13} color="#4f46e5" />,
            color: '#4f46e5',
            badgeBg: '#4f46e5',
            badgeText: '#ffffff',
          },
        ]
      : []),
  ];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        className="modal-content notifications-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-card)',
          color: 'var(--text-main)',
          borderRadius: '14px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header Modal */}
        <div
          className="notifications-modal-header"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            backgroundColor: 'var(--bg-card-subtle)',
          }}
        >
          <div className="notifications-modal-header-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(14, 165, 233, 0.15)',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div>
                <h2
                  id="notif-modal-title"
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--text-main)',
                    lineHeight: 1.3,
                  }}
                >
                  {tx('Prospect Reply Notifications', 'Notifikasi Respon Prospek')}
                </h2>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    lineHeight: 1.3,
                  }}
                >
                  {tx(
                    'Inbound prospect replies and notifications',
                    'Notifikasi balasan dan aktivitas prospek'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={tx('Close notification center', 'Tutup pusat notifikasi')}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="notifications-modal-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => fetchNotifications(true)}
              disabled={loading}
              title={tx('Refresh inbox notifications', 'Segarkan notifikasi dari Webmail')}
              aria-label={tx('Refresh notifications', 'Segarkan notifikasi')}
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-main)',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '36px',
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
                aria-hidden="true"
              >
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span>{loading ? tx('Syncing...', 'Sinkron...') : tx('Refresh', 'Segarkan')}</span>
            </button>

            {counts.unread > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                title={tx('Mark all replies as read', 'Tandai semua respon sebagai sudah dibaca')}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '36px',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{tx('Mark all read', 'Tandai Semua Dibaca')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Filters with Smooth Drag & Scroll Bar for Desktop */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-card-subtle)',
            borderBottom: '1px solid var(--border-color)',
            padding: '6px 12px',
            gap: '6px',
          }}
        >
          {/* Scroll Left Button (Desktop Assist) */}
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            aria-label={tx('Scroll tabs left', 'Geser tab ke kiri')}
            title={tx('Scroll tabs left', 'Geser tab ke kiri')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              width: '24px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div
            ref={tablistRef}
            role="tablist"
            className="notifications-tablist"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 2px',
              overflowX: 'auto',
              flex: 1,
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            {tabItems.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 500,
                    border: isActive ? `1px solid ${tab.color}` : '1px solid transparent',
                    backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                    color: isActive ? tab.color : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                    minHeight: '34px',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.08)' : 'none',
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      backgroundColor: isActive ? tab.badgeBg : 'var(--bg-app)',
                      color: isActive ? tab.badgeText : 'var(--text-muted)',
                      border: isActive ? 'none' : '1px solid var(--border-subtle)',
                      fontWeight: 700,
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Scroll Right Button (Desktop Assist) */}
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            aria-label={tx('Scroll tabs right', 'Geser tab ke kanan')}
            title={tx('Scroll tabs right', 'Geser tab ke kanan')}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              width: '24px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Daftar Notifikasi */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          {loading && replies.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: '28px',
                  height: '28px',
                  border: '3px solid rgba(2, 132, 199, 0.2)',
                  borderTopColor: '#0284c7',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: '12px',
                }}
              />
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
                {tx('Connecting to Webmail mailbox & checking prospect replies...', 'Menghubungkan ke Webmail & memeriksa balasan prospek...')}
              </p>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '32px 24px',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card-subtle)',
                border: '1px solid var(--danger-border, #fecaca)',
                color: 'var(--danger-text, #b91c1c)',
                textAlign: 'center',
                margin: '12px 0',
              }}
            >
              <div style={{ display: 'inline-flex', padding: '10px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', marginBottom: '12px' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                {tx('Unable to Load Notifications', 'Gagal Memuat Notifikasi Balasan')}
              </p>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                {error === 'Failed to fetch' || (typeof error === 'string' && error.toLowerCase().includes('failed to fetch'))
                  ? tx('Network connection interrupted or Webmail service temporarily unreachable. Please retry.', 'Koneksi jaringan terputus atau layanan Webmail sedang sibuk. Silakan coba kembali.')
                  : error}
              </p>
              <button
                type="button"
                onClick={() => fetchNotifications(true)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                <span>{tx('Retry Connection', 'Coba Hubungkan Kembali')}</span>
              </button>
            </div>
          ) : filteredReplies.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-card-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  color: 'var(--text-muted)',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h3
                style={{
                  margin: '0 0 4px',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                }}
              >
                {activeTab === 'unread'
                  ? tx('All caught up!', 'Semua balasan sudah dibaca!')
                  : tx('No replies found in this category', 'Belum ada respon prospek di kategori ini')}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                {activeTab === 'unread'
                  ? tx('No unread messages remaining.', 'Tidak ada pesan prospek baru yang belum dibaca.')
                  : tx('Replies from prospects will appear here automatically when they respond.', 'Balasan dari prospek akan otomatis tercatat di sini saat mereka merespon email outreach.')}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {paginatedReplies.map((reply) => {
                const isRead = readUids.has(reply.uid);
                const hasRealSnippet = reply.preview && reply.preview.trim() !== '' && reply.preview !== reply.subject;

                return (
                  <div
                    key={reply.id || reply.uid}
                    style={{
                      borderRadius: '10px',
                      border: isRead
                        ? '1px solid var(--border-subtle)'
                        : '1px solid rgba(14, 165, 233, 0.55)',
                      backgroundColor: isRead
                        ? 'var(--bg-card)'
                        : 'var(--bg-card-subtle)',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      transition: 'border-color 0.15s ease, background-color 0.15s ease',
                      position: 'relative',
                      boxShadow: isRead ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    {/* Header Kartu: Perusahaan, Badge Intent, Waktu */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {!isRead && (
                          <span
                            title={tx('Unread reply', 'Respon baru belum dibaca')}
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: '#0284c7',
                              display: 'inline-block',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <h4
                          style={{
                            margin: 0,
                            fontSize: '15px',
                            fontWeight: 700,
                            color: 'var(--text-main)',
                          }}
                        >
                          {reply.companyName}
                        </h4>

                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: reply.isHighIntent
                              ? 'rgba(234, 88, 12, 0.12)'
                              : reply.isFollowUpLater
                              ? 'rgba(217, 119, 6, 0.12)'
                              : reply.isRedirect
                              ? 'rgba(2, 132, 199, 0.12)'
                              : 'rgba(22, 163, 74, 0.12)',
                            color: reply.isHighIntent
                              ? '#ea580c'
                              : reply.isFollowUpLater
                              ? '#d97706'
                              : reply.isRedirect
                              ? '#0284c7'
                              : '#16a34a',
                            border: `1px solid ${
                              reply.isHighIntent
                                ? 'rgba(234, 88, 12, 0.3)'
                                : reply.isFollowUpLater
                                ? 'rgba(217, 119, 6, 0.3)'
                                : reply.isRedirect
                                ? 'rgba(2, 132, 199, 0.3)'
                                : 'rgba(22, 163, 74, 0.3)'
                            }`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {reply.isHighIntent ? (
                            <IconFlame width={11} height={11} color="#ea580c" />
                          ) : reply.isFollowUpLater ? (
                            <IconClock width={11} height={11} color="#d97706" />
                          ) : reply.isRedirect ? (
                            <IconShare width={11} height={11} color="#0284c7" />
                          ) : (
                            <IconMail width={11} height={11} color="#16a34a" />
                          )}
                          <span>
                            {reply.isHighIntent
                              ? (lang === 'en' ? 'Hot Lead (Interested)' : 'Hot Lead (Tertarik Aktif)')
                              : reply.isFollowUpLater
                              ? (lang === 'en' ? 'Follow Up Later' : 'Tindak Lanjut Nanti')
                              : reply.isRedirect
                              ? (lang === 'en' ? 'Contact Redirect' : 'Pengalihan Kontak')
                              : (lang === 'en' ? 'Prospect Reply' : 'Respon Prospek')}
                          </span>
                        </span>

                        {reply.phone && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(16, 185, 129, 0.12)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            WA: {reply.phone}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}
                      >
                        {reply.formattedDate || reply.date}
                      </div>
                    </div>

                    {/* Metadata Pengirim & Subjek */}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px', color: 'var(--text-main)' }}>
                        {reply.subject}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {tx('From:', 'Dari:')} <span style={{ fontFamily: 'monospace' }}>{reply.partyEmail}</span>
                      </div>
                    </div>

                    {/* Cuplikan Balasan Prospek Asli */}
                    {hasRealSnippet ? (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-app)',
                          border: '1px solid var(--border-subtle)',
                          borderLeft: reply.isHighIntent
                            ? '3px solid #ea580c'
                            : reply.isFollowUpLater
                            ? '3px solid #d97706'
                            : reply.isRedirect
                            ? '3px solid #0284c7'
                            : '3px solid #16a34a',
                          fontSize: '13px',
                          lineHeight: 1.5,
                          color: 'var(--text-main)',
                          fontStyle: 'normal',
                          wordBreak: 'break-word',
                        }}
                      >
                        &ldquo;{reply.preview}&rdquo;
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-app)',
                          border: '1px dashed var(--border-subtle)',
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          fontStyle: 'italic',
                        }}
                      >
                        {tx('Click "Open in Webmail" to view full message thread.', 'Klik "Buka di Webmail" untuk membaca isi percakapan pesan lengkap.')}
                      </div>
                    )}

                    {/* Aksi Cepat */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        marginTop: '2px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenEmail(reply)}
                        title={tx('Open this email in Webmail to reply', 'Buka email ini di Webmail untuk membalas')}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          minHeight: '34px',
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                        </svg>
                        <span>{tx('Open in Webmail', 'Buka di Webmail')}</span>
                      </button>

                      {reply.placeId && (
                        <button
                          type="button"
                          onClick={() => handleOpenLead(reply)}
                          title={tx('Open lead details and outreach dossier', 'Buka profil lead dan riwayat outreach')}
                          style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--bg-card)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-subtle)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            minHeight: '34px',
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                          </svg>
                          <span>{tx('Open Lead Dossier', 'Buka Detail Lead')}</span>
                        </button>
                      )}

                      {reply.phone && (
                        <a
                          href={`https://wa.me/${reply.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markAsRead(reply.uid)}
                          title={tx('Chat prospect on WhatsApp', 'Hubungi prospek via WhatsApp')}
                          style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(34, 197, 94, 0.12)',
                            color: '#16a34a',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            minHeight: '34px',
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                          </svg>
                          <span>{tx('Chat WhatsApp', 'Chat WhatsApp')}</span>
                        </a>
                      )}

                      {reply.previewUrl && (
                        <a
                          href={reply.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={tx('View prebuilt website demo for this lead', 'Buka preview live website prebuilt prospek ini')}
                          style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(99, 102, 241, 0.12)',
                            color: '#6366f1',
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            fontSize: '12px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            minHeight: '34px',
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          <span>{tx('Live Demo', 'Lihat Demo')}</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Modal: Komponen Paginasi */}
        {totalItems > 0 && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-card-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
              {tx(
                `Showing ${startIndex + 1} - ${Math.min(startIndex + itemsPerPage, totalItems)} of ${totalItems} responses`,
                `Menampilkan ${startIndex + 1} - ${Math.min(startIndex + itemsPerPage, totalItems)} dari ${totalItems} respon`
              )}
            </div>

            <div
              role="navigation"
              aria-label={tx('Notifications pagination', 'Paginasi notifikasi')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <button
                type="button"
                onClick={() => handlePageChange(safePage - 1)}
                disabled={safePage <= 1}
                aria-label={tx('Previous page', 'Halaman sebelumnya')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-card)',
                  color: safePage <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  minHeight: '32px',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>{tx('Prev', 'Sebelumnya')}</span>
              </button>

              {/* Nomor Halaman */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePageChange(p)}
                  aria-current={p === safePage ? 'page' : undefined}
                  style={{
                    minWidth: '32px',
                    height: '32px',
                    padding: '0 8px',
                    borderRadius: '6px',
                    border: p === safePage ? '1px solid #0284c7' : '1px solid var(--border-subtle)',
                    backgroundColor: p === safePage ? '#0284c7' : 'var(--bg-card)',
                    color: p === safePage ? '#ffffff' : 'var(--text-main)',
                    fontSize: '12px',
                    fontWeight: p === safePage ? 700 : 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {p}
                </button>
              ))}

              <button
                type="button"
                onClick={() => handlePageChange(safePage + 1)}
                disabled={safePage >= totalPages}
                aria-label={tx('Next page', 'Halaman berikutnya')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-card)',
                  color: safePage >= totalPages ? 'var(--text-muted)' : 'var(--text-main)',
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  minHeight: '32px',
                }}
              >
                <span>{tx('Next', 'Berikutnya')}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
