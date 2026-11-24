'use client';

import { useEffect, useRef, memo } from 'react';
import L from 'leaflet';
import { useI18n } from '@/lib/i18n';

function MapView({
  anchor,
  radiusKm,
  places = [],
  totalCount = 0,
  isPickingMode = false,
  onMapClick,
  customCandidate = null,
  onCandidateDragEnd
}) {
  const { lang, tx } = useI18n();
  const numLocale = lang === 'id' ? 'id-ID' : 'en-US';
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const circleRef = useRef(null);

  const isPickingModeRef = useRef(isPickingMode);
  const onMapClickRef = useRef(onMapClick);
  const onCandidateDragEndRef = useRef(onCandidateDragEnd);

  useEffect(() => {
    isPickingModeRef.current = isPickingMode;
    onMapClickRef.current = onMapClick;
    onCandidateDragEndRef.current = onCandidateDragEnd;
  }, [isPickingMode, onMapClick, onCandidateDragEnd]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Initialize map
      const initialLat = anchor ? Number(anchor.lat) : -6.2215;
      const initialLng = anchor ? Number(anchor.lng) : 106.8270;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 13,
        zoomControl: true,
        preferCanvas: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Overture Maps Foundation',
        maxZoom: 19
      }).addTo(map);

      // Listen to map clicks for picking custom point
      map.on('click', (e) => {
        if (isPickingModeRef.current && onMapClickRef.current) {
          onMapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    if (mapContainerRef.current) {
      mapContainerRef.current.style.cursor = isPickingMode ? 'crosshair' : '';
    }

    // Clear previous markers & circle
    layerGroup.clearLayers();
    if (circleRef.current) {
      map.removeLayer(circleRef.current);
    }

    if (anchor && anchor.lat && anchor.lng) {
      const anchorLat = Number(anchor.lat);
      const anchorLng = Number(anchor.lng);

      // Pan to anchor with appropriate zoom based on radius (if not currently picking candidate)
      if (!customCandidate?.lat) {
        const zoomLevel = radiusKm <= 2 ? 14 : radiusKm <= 5 ? 13 : radiusKm <= 10 ? 12 : 11;
        map.setView([anchorLat, anchorLng], zoomLevel);
      }

      // Draw anchor marker (Center Office)
      const anchorIcon = L.divIcon({
        className: 'custom-anchor-pin',
        html: `<div style="background-color: #0f172a; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(15,23,42,0.35); z-index: 1000;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const anchorMarker = L.marker([anchorLat, anchorLng], { icon: anchorIcon, zIndexOffset: 1000 })
        .bindPopup(`<strong>${anchor.name}</strong><br/>${anchor.address || ''}<br/><span style="color: #64748b; font-size: 11px;">${tx('Radius center', 'Pusat Radius')} (${radiusKm} km)</span>`);
      layerGroup.addLayer(anchorMarker);

      // Draw radius circle
      const radiusMeters = (radiusKm || 2) * 1000;
      circleRef.current = L.circle([anchorLat, anchorLng], {
        radius: radiusMeters,
        color: '#2563eb',
        weight: 1.5,
        dashArray: '5, 5',
        fillColor: '#3b82f6',
        fillOpacity: 0.07
      }).addTo(map);
    }

    // High performance HTML5 Canvas renderer for thousands of pins
    const canvasRenderer = L.canvas({ padding: 0.5 });

    places.forEach((p) => {
      if (!p.lat || !p.lng) return;

      const hasPhone = Boolean(p.phone && p.phone.trim());
      const isPipelineActive = Boolean(p.reach_status && p.reach_status !== 'new');
      const markerColor = isPipelineActive ? '#7c3aed' : hasPhone ? '#059669' : '#64748b';

      const circleMarker = L.circleMarker([Number(p.lat), Number(p.lng)], {
        renderer: canvasRenderer,
        radius: isPipelineActive ? 5.5 : hasPhone ? 4.5 : 3.5,
        fillColor: markerColor,
        color: '#ffffff',
        weight: 1,
        opacity: 0.9,
        fillOpacity: isPipelineActive ? 0.95 : hasPhone ? 0.85 : 0.65
      });

      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 180px;">
          <strong style="color: #0f172a; font-size: 14px;">${p.name}</strong><br/>
          <div style="display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap;">
            <span style="display: inline-block; padding: 2px 7px; background-color: #f1f5f9; color: #475569; font-size: 11px; border-radius: 4px; font-weight: 500;">
              ${p.bidang_usaha || p.category_raw || tx('General', 'Umum')}
            </span>
            ${p.reach_status && p.reach_status !== 'new' ? `
              <span style="display: inline-block; padding: 2px 7px; background-color: #ede9fe; color: #6d28d9; font-size: 11px; border-radius: 4px; font-weight: 600;">
                Pipeline: ${p.reach_status}
              </span>` : ''}
          </div>
          ${p.address ? `<div style="margin-top: 4px; font-size: 11px; color: #334155;">${p.address}</div>` : ''}
          <div style="margin-top: 6px; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 5px;">
            ${p.phone ? `<div style="margin-bottom: 2px;"><span style="color: #64748b; font-size: 11px;">${tx('Phone:', 'Telepon:')}</span> <a href="tel:${p.phone}" style="color: #0284c7; text-decoration: none; font-weight: 600;">${p.phone}</a></div>` : `<div style="color: #94a3b8; font-size: 11px;">${tx('No phone yet', 'Belum ada telepon')}</div>`}
            ${p.website ? `<div style="margin-bottom: 2px;"><span style="color: #64748b; font-size: 11px;">Web:</span> <a href="${p.website}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: underline;">${p.website.replace(/^https?:\/\/(www\.)?/, '').slice(0, 30)}</a></div>` : ''}
            ${p.email ? `<div><span style="color: #64748b; font-size: 11px;">Email:</span> <a href="mailto:${p.email}" style="color: #0284c7; text-decoration: none;">${p.email}</a></div>` : ''}
          </div>
          <div style="margin-top: 5px; color: #64748b; font-size: 11px;">
            ${tx('Distance:', 'Jarak:')} <strong>${p.distance_m ? `${Math.round(p.distance_m)} m` : '-'}</strong>
          </div>
        </div>
      `;

      circleMarker.bindPopup(popupHtml);
      layerGroup.addLayer(circleMarker);
    });

    // If a custom point candidate exists (user is picking or adjusting a new point), draw its pin and preview circle
    if (customCandidate && customCandidate.lat && customCandidate.lng) {
      const cLat = Number(customCandidate.lat);
      const cLng = Number(customCandidate.lng);
      const cRadius = Number(customCandidate.radiusKm || radiusKm || 2);

      const customIcon = L.divIcon({
        className: 'custom-pin-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: grab;">
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(234, 88, 12, 0.3); animation: customPulse 1.8s infinite;"></div>
            <div style="background: linear-gradient(135deg, #f97316, #ea580c); color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.5); z-index: 1001;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const candidateMarker = L.marker([cLat, cLng], {
        icon: customIcon,
        draggable: true,
        zIndexOffset: 2000
      });

      candidateMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 170px;">
          <strong style="color: #ea580c; font-size: 13px;">${customCandidate.name || tx('New Point (Preview)', 'Titik Baru (Preview)')}</strong><br/>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">
            Lat: ${cLat.toFixed(5)}<br/>Lng: ${cLng.toFixed(5)}
          </div>
          <div style="font-size: 11px; color: #0284c7; margin-top: 4px; font-weight: 600;">
            ${tx('Drag this pin to move the center point', 'Geser pin ini untuk memindahkan titik pusat')}
          </div>
        </div>
      `);

      candidateMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        if (onCandidateDragEndRef.current) {
          onCandidateDragEndRef.current({ lat: pos.lat, lng: pos.lng });
        }
      });

      layerGroup.addLayer(candidateMarker);

      // Draw custom radius circle preview
      L.circle([cLat, cLng], {
        radius: cRadius * 1000,
        color: '#ea580c',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#f97316',
        fillOpacity: 0.12
      }).addTo(layerGroup);

      // Smoothly pan to the candidate location
      map.panTo([cLat, cLng]);
    }

  }, [
    anchor,
    radiusKm,
    places,
    isPickingMode,
    customCandidate?.lat,
    customCandidate?.lng,
    customCandidate?.radiusKm,
    customCandidate?.name
  ]);

  return (
    <div className="map-card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{tx('Business Map', 'Peta Sebaran Entitas Bisnis')}</span>
          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', backgroundColor: 'var(--accent-light)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
            Radius {radiusKm} km
          </span>
          {isPickingMode && (
            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', backgroundColor: '#fff7ed', color: '#ea580c', border: '1px solid #fdba74', borderRadius: 'var(--radius-sm)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ea580c', display: 'inline-block' }}></span>
              {tx('New point mode on (click the map)', 'Mode Titik Baru Aktif (Klik Peta)')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8125rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#059669', display: 'inline-block' }}></span>
            {tx('Has phone', 'Ada Telepon')}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#64748b', display: 'inline-block' }}></span>
            {tx('No phone', 'Tanpa Telepon')}
          </span>
          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
            {totalCount > 0 ? (
              <>
                {totalCount.toLocaleString(numLocale)} {tx('businesses', 'entitas bisnis')}
                {places.length > 0 && places.length < totalCount && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '4px' }}>
                    {tx(`(showing ${places.length.toLocaleString(numLocale)} points)`, `(ditampilkan ${places.length.toLocaleString(numLocale)} titik)`)}
                  </span>
                )}
              </>
            ) : (
              `${places.length.toLocaleString(numLocale)} ${tx('businesses', 'entitas bisnis')}`
            )}
          </span>
        </div>
      </div>
      <div ref={mapContainerRef} className="map-container" style={{ minHeight: '440px', width: '100%' }} />
    </div>
  );
}

export default memo(MapView);
