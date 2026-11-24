'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import MiniMapPicker to prevent Leaflet SSR issues
const MiniMapPicker = dynamic(() => import('./MiniMapPicker'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '220px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-card, #0f172a)',
        color: 'var(--text-muted, #94a3b8)',
        fontSize: '12px',
        borderRadius: '8px',
        border: '1px solid var(--border-subtle, #334155)',
      }}
    >
      Memuat peta interaktif...
    </div>
  ),
});

const extractDirectCoords = (str) => {
  if (!str) return null;
  const trimmed = str.trim();

  // Raw coords: -6.9025, 107.6188 or -6.9025 107.6188
  const rawMatch = trimmed.match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (rawMatch) return { lat: parseFloat(rawMatch[1]), lng: parseFloat(rawMatch[2]) };

  // Google Maps @lat,lng
  const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

  // Google Maps q=lat,lng or query=lat,lng
  const qMatch = trimmed.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

  // Google Maps protobuf !3dlat!4dlng
  const protoMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (protoMatch) return { lat: parseFloat(protoMatch[1]), lng: parseFloat(protoMatch[2]) };

  return null;
};

const getApiUrl = (endpoint) => endpoint;

export default function LocationPicker({
  value = '',
  onChange,
  latitude,
  longitude,
  onCoordsChange,
  id = 'location-picker',
  label = 'Alamat Kantor Pusat',
  required = false,
  disabled = false,
  isDark = true,
  placeholder = 'Ketik alamat, nama gedung (OSM), atau tempel link Google Maps / koordinat',
}) {
  const [showMap, setShowMap] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [linkDetectedMsg, setLinkDetectedMsg] = useState(null);

  const searchTimerRef = useRef(null);
  const wrapperRef = useRef(null);

  const numLat = latitude ? parseFloat(latitude) : null;
  const numLng = longitude ? parseFloat(longitude) : null;
  const hasCoords = numLat !== null && numLng !== null && !isNaN(numLat) && !isNaN(numLng);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = async (val) => {
    if (onChange) onChange(val);
    setLinkDetectedMsg(null);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!val || val.trim().length === 0) {
      setSuggestions([]);
      setIsOpen(false);
      setHasSearched(false);
      setSearchQuery('');
      return;
    }

    const trimmed = val.trim();
    setSearchQuery(trimmed);

    // 1. Check for immediate direct coordinates or Google Maps link
    const directCoords = extractDirectCoords(trimmed);
    if (directCoords) {
      if (onCoordsChange) onCoordsChange(directCoords);
      setLinkDetectedMsg(`Koordinat terdeteksi (${directCoords.lat.toFixed(4)}, ${directCoords.lng.toFixed(4)})`);
      setSuggestions([]);
      setIsOpen(false);
      // Auto reverse-geocode to replace ugly URL with real address if it was a URL
      if (trimmed.startsWith('http')) {
        reverseGeocode(directCoords.lat, directCoords.lng);
      }
      return;
    }

    // 2. Check for shortened Google Maps link (maps.app.goo.gl or goo.gl)
    if (trimmed.startsWith('http') && (trimmed.includes('goo.gl') || trimmed.includes('maps.app.goo.gl'))) {
      setIsResolvingLink(true);
      setIsOpen(false);
      try {
        const res = await fetch(getApiUrl(`/api/geo/resolve-link?url=${encodeURIComponent(trimmed)}`));
        const data = await res.json();
        if (data.success && data.lat && data.lng) {
          if (onCoordsChange) onCoordsChange({ lat: data.lat, lng: data.lng });
          if (data.place?.address && onChange) {
            onChange(data.place.address);
          }
          setLinkDetectedMsg(`Lokasi Google Maps terdeteksi: ${data.place?.name || 'Titik Koordinat'}`);
        }
      } catch (_) {
        // Fallback silently
      } finally {
        setIsResolvingLink(false);
      }
      return;
    }

    // 3. Autocomplete search via Nominatim (OpenStreetMap)
    if (trimmed.length >= 2 && !trimmed.startsWith('http')) {
      setIsOpen(true);
      setIsSearching(true);
      setHasSearched(false);

      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(getApiUrl(`/api/geo/search?q=${encodeURIComponent(trimmed)}`));
          const data = await res.json();
          if (data.success && Array.isArray(data.results)) {
            setSuggestions(data.results);
          } else {
            setSuggestions([]);
          }
        } catch (_) {
          setSuggestions([]);
        } finally {
          setIsSearching(false);
          setHasSearched(true);
        }
      }, 300);
    } else {
      setSuggestions([]);
      setIsOpen(false);
      setIsSearching(false);
      setHasSearched(false);
    }
  };

  const handleSelectSuggestion = (item) => {
    const selectedAddress = item.displayName || item.address || item.name;
    if (onChange) {
      onChange(selectedAddress);
    }
    if (onCoordsChange && item.lat && item.lng) {
      onCoordsChange({ lat: item.lat, lng: item.lng });
    }
    setSuggestions([]);
    setIsOpen(false);
    setHasSearched(false);
    setLinkDetectedMsg(`Lokasi dipilih: ${item.name || item.city || 'Titik Lokasi'}`);
  };

  const handleMapSelect = async ({ lat, lng }) => {
    if (onCoordsChange) {
      onCoordsChange({ lat, lng });
    }
    setLinkDetectedMsg(`Titik di peta terpilih (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    await reverseGeocode(lat, lng);
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const res = await fetch(getApiUrl(`/api/geo/reverse?lat=${lat}&lng=${lng}`));
      const data = await res.json();
      if (data.success && data.place?.address && onChange) {
        onChange(data.place.address);
      }
    } catch (_) {}
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    fontSize: '13.5px',
    backgroundColor: isDark ? '#0a0f1d' : '#f8fafc',
    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
    color: isDark ? '#ffffff' : '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor={id} style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
            {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <button
            type="button"
            onClick={() => setShowMap(!showMap)}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px 6px',
              fontSize: '11.5px',
              fontWeight: 600,
              color: '#0284c7',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            {showMap ? 'Sembunyikan Peta' : 'Pilih di Peta'}
          </button>
        </div>
      )}

      {/* Main Address Input */}
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (searchQuery.length >= 2 && (suggestions.length > 0 || hasSearched)) {
              setIsOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          required={required}
          style={{
            ...inputStyle,
            paddingRight: (isSearching || isResolvingLink) ? '32px' : '12px',
          }}
        />

        {(isSearching || isResolvingLink) && (
          <div
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '11px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        )}

        {/* Autocomplete Suggestions Dropdown */}
        {isOpen && searchQuery.length >= 2 && !searchQuery.startsWith('http') && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1100,
              marginTop: '4px',
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
              borderRadius: '8px',
              boxShadow: isDark ? '0 10px 25px -5px rgba(0,0,0,0.6)' : '0 10px 25px -5px rgba(0,0,0,0.15)',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
          >
            {isSearching && (
              <div
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: '12px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>Mencari lokasi <strong>"{searchQuery}"</strong>...</span>
              </div>
            )}

            {!isSearching && suggestions.length > 0 && (
              <>
                <div
                  style={{
                    padding: '6px 12px 4px',
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                    color: isDark ? '#64748b' : '#94a3b8',
                    borderBottom: isDark ? '1px solid #1e293b' : '1px solid #f1f5f9',
                  }}
                >
                  Pilih Hasil Pencarian ({suggestions.length})
                </div>
                {suggestions.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    onClick={() => handleSelectSuggestion(item)}
                    style={{
                      padding: '9px 12px',
                      borderBottom: idx < suggestions.length - 1 ? (isDark ? '1px solid #1e293b' : '1px solid #f1f5f9') : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isDark ? '#1e293b' : '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ color: '#0284c7', marginTop: '2px', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#ffffff' : '#0f172a' }}>
                        {item.name}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: isDark ? '#94a3b8' : '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.address}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {!isSearching && hasSearched && suggestions.length === 0 && (
              <div style={{ padding: '14px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b', marginBottom: '4px' }}>
                  Lokasi tidak ditemukan
                </div>
                <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.4 }}>
                  Tidak ada hasil untuk "{searchQuery}". Periksa ejaan atau klik <strong>Pilih di Peta</strong> untuk menentukan titik langsung.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation & Active Coordinates Pill */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
        {linkDetectedMsg ? (
          <span style={{ fontSize: '11.5px', color: '#10b981', fontWeight: 500 }}>
            {linkDetectedMsg}
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: isDark ? '#64748b' : '#94a3b8' }}>
            Bisa paste link Google Maps, ketik nama gedung, atau pilih di peta.
          </span>
        )}

        {hasCoords && (
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
              color: isDark ? '#94a3b8' : '#475569',
            }}
          >
            {numLat.toFixed(4)}, {numLng.toFixed(4)}
          </span>
        )}
      </div>

      {/* Expandable Leaflet Interactive Map */}
      {showMap && (
        <div style={{ marginTop: '4px' }}>
          <MiniMapPicker
            lat={numLat}
            lng={numLng}
            onSelect={handleMapSelect}
            height="220px"
          />
        </div>
      )}
    </div>
  );
}
