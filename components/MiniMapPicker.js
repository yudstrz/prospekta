'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export default function MiniMapPicker({ lat, lng, onSelect, height = '220px' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const defaultLat = -6.2088; // Jakarta default
  const defaultLng = 106.8456;

  const currentLat = typeof lat === 'number' && !isNaN(lat) ? lat : defaultLat;
  const currentLng = typeof lng === 'number' && !isNaN(lng) ? lng : defaultLng;
  const hasValidPoint = typeof lat === 'number' && !isNaN(lat);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [currentLat, currentLng],
      zoom: hasValidPoint ? 15 : 12,
      zoomControl: true,
      preferCanvas: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'picker-pin',
      html: `<div style="background-color: #0284c7; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); cursor: grab;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (hasValidPoint) {
      const marker = L.marker([currentLat, currentLng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        if (onSelectRef.current) {
          onSelectRef.current({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
        }
      });

      markerRef.current = marker;
    }

    map.on('click', (e) => {
      const newLat = Number(e.latlng.lat.toFixed(6));
      const newLng = Number(e.latlng.lng.toFixed(6));

      if (markerRef.current) {
        markerRef.current.setLatLng([newLat, newLng]);
      } else {
        const marker = L.marker([newLat, newLng], {
          icon: pinIcon,
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          if (onSelectRef.current) {
            onSelectRef.current({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
          }
        });

        markerRef.current = marker;
      }

      if (onSelectRef.current) {
        onSelectRef.current({ lat: newLat, lng: newLng });
      }
    });

    mapRef.current = map;

    // Invalidate size to ensure tiles render properly after container expands
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update marker & view when lat/lng props change from outside
  useEffect(() => {
    if (!mapRef.current) return;
    if (typeof lat !== 'number' || isNaN(lat) || typeof lng !== 'number' || isNaN(lng)) return;

    const map = mapRef.current;
    const pinIcon = L.divIcon({
      className: 'picker-pin',
      html: `<div style="background-color: #0284c7; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); cursor: grab;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        if (onSelectRef.current) {
          onSelectRef.current({ lat: Number(pos.lat.toFixed(6)), lng: Number(pos.lng.toFixed(6)) });
        }
      });

      markerRef.current = marker;
    }

    map.setView([lat, lng], 15, { animate: true });
  }, [lat, lng]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Browser Anda tidak mendukung geolokasi GPS.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const userLat = Number(pos.coords.latitude.toFixed(6));
        const userLng = Number(pos.coords.longitude.toFixed(6));
        if (onSelectRef.current) {
          onSelectRef.current({ lat: userLat, lng: userLng });
        }
      },
      () => {
        setGpsLoading(false);
        alert('Gagal mengambil lokasi GPS. Pastikan izin akses lokasi diizinkan di browser.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle, #334155)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating GPS and helper button */}
      <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 1000, display: 'flex', gap: '6px' }}>
        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={gpsLoading}
          style={{
            background: 'var(--bg-card, #0f172a)',
            color: 'var(--text-main, #ffffff)',
            border: '1px solid var(--border-subtle, #334155)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: gpsLoading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
          title="Gunakan titik GPS saya saat ini"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
          {gpsLoading ? 'Mencari...' : 'Lokasi Saya'}
        </button>
      </div>

      {/* Instruction hint at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: '6px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.82)',
          color: '#cbd5e1',
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '10.5px',
          pointerEvents: 'none',
          backdropFilter: 'blur(4px)',
          whiteSpace: 'nowrap',
        }}
      >
        Klik pada peta atau geser pin untuk menentukan lokasi kantor
      </div>
    </div>
  );
}
