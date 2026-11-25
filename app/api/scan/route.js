import { NextResponse } from 'next/server';
import { db, invalidateCache } from '@/lib/db';
import { haversineDistance, generateTiles } from '@/lib/geo';
import { normalizePhone } from '@/lib/phone';
import { mapCategoryToBidang } from '@/lib/categories';
import { fetchOverturePlaces } from '@/lib/overture';
import { sessionFromRequest } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const anchorName = (body.anchor || '').trim();
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;

    // 1. Get anchor coordinates
    let anchorRes = await db.execute({
      sql: 'SELECT * FROM anchors WHERE name = ? OR id = ? LIMIT 1;',
      args: [anchorName || 'Prospekta AI Hub', anchorName || 'Prospekta AI Hub']
    });

    // Fallback cerdas: Jika anchor tidak ditemukan berdasarkan nama (misal fallback 'Kantor'), ambil anchor aktif milik tenant
    if (!anchorRes.rows || anchorRes.rows.length === 0) {
      if (tid) {
        anchorRes = await db.execute({
          sql: 'SELECT * FROM anchors WHERE tenant_id = ? LIMIT 1;',
          args: [tid]
        });
      }
      if (!anchorRes.rows || anchorRes.rows.length === 0) {
        anchorRes = await db.execute('SELECT * FROM anchors LIMIT 1;');
      }
    }

    let anchor = anchorRes?.rows?.[0];
    if (!anchor) {
      anchor = {
        id: 'prospekta_jakarta',
        name: anchorName || 'Prospekta',
        address: 'Pakuwon Tower 26J, Jl Raya Kasablanka 88',
        city: 'Jakarta Selatan',
        lat: -6.2219,
        lng: 106.8429,
        radius_default_km: 2
      };
    }
    const isSg = (anchor.city || '').toLowerCase().includes('singapore') || (anchor.name || '').toLowerCase().includes('singapore') || anchor.id === 'prospekta_sg';
    const maxScanRadius = isSg ? 20 : 10;
    const radiusKm = Math.min(Math.max(parseFloat(body.radius_km || 2), 0.5), maxScanRadius);
    const centerLat = Number(anchor.lat);
    const centerLng = Number(anchor.lng);

    // 2. Generate bounds
    const { totalTiles, bounds } = generateTiles(centerLat, centerLng, radiusKm, 4);

    let scanId = null;
    // 3. Create scan log in DB
    scanId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const effectiveTid = tid || 'tnt_master';
    await db.execute({
      sql: `
        INSERT INTO scans (id, anchor, radius_km, tiles_total, tiles_done, status, created_at, tenant_id)
        VALUES (?, ?, ?, ?, 0, 'running', ?, ?);
      `,
      args: [scanId, anchor.name, radiusKm, totalTiles, nowIso, effectiveTid]
    });

    const countBeforeRes = await db.execute('SELECT COUNT(*) as count FROM places;');
    const countBefore = Number(countBeforeRes.rows?.[0]?.count || 0);

    let totalDiscovered = 0;
    let totalSaved = 0;

    // 4. Fetch places (Overture / ArcGIS POI + Photon OSM + Google Places)
    let places = await fetchOverturePlaces(
      bounds.minLng,
      bounds.minLat,
      bounds.maxLng,
      bounds.maxLat,
      radiusKm
    );

    // Fallback DB lokal jika semua sumber eksternal gagal
    if (!places || places.length === 0) {
      const dbFallback = await db.execute({
        sql: 'SELECT * FROM places WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 50;',
        args: [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng]
      });
      places = (dbFallback.rows || []).map((r) => ({
        id: `${r.overture_id || 'db'}_${anchor.name.replace(/\s+/g, '_').slice(0, 8)}`,
        name: r.name,
        category: r.category_raw || r.bidang_usaha,
        address: r.address,
        lat: Number(r.lat),
        lng: Number(r.lng),
        phone: r.phone,
        website: r.website,
        email: r.email,
        confidence: Number(r.confidence || 0.85)
      }));
    }

    totalDiscovered = places.length;

    const existingRes = await db.execute({
      sql: 'SELECT overture_id, phone, website, address FROM places WHERE anchor = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?;',
      args: [anchor.name, bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng]
    });
    const existingMap = new Map((existingRes.rows || []).map((r) => [r.overture_id, r]));

    const rowsToUpsert = [];
    const seenIds = new Set();

    for (const p of places) {
      if (!p.lat || !p.lng || !p.name || seenIds.has(p.id)) continue;

      const dist = haversineDistance(centerLat, centerLng, p.lat, p.lng);
      if (dist > radiusKm * 1000) continue;

      const prev = existingMap.get(p.id);
      const normPhone = normalizePhone(p.phone);
      const hasNewData = prev && ((!prev.phone && normPhone) || (!prev.website && p.website) || (!prev.address && p.address));
      if (prev && !hasNewData) continue;

      seenIds.add(p.id);
      const bidang = await mapCategoryToBidang(p.category);
      const emailSource = p.email ? 'overture' : null;
      rowsToUpsert.push([
        p.id,
        anchor.name,
        p.name,
        p.category || null,
        bidang,
        p.address || null,
        p.lat,
        p.lng,
        dist,
        normPhone,
        p.website || null,
        p.email || null,
        emailSource,
        'pending',
        p.confidence || 0,
        'overture',
        nowIso,
        'new',
        tid || null
      ]);
    }

    // Bulk multi-row UPSERT (80 baris per 1 query SQL agar cepat di Neon PostgreSQL maupun SQLite)
    const CHUNK_SIZE = 80;
    const colCount = 19;
    const singleTuple = `(${Array(colCount).fill('?').join(', ')})`;

    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE);
      const valuesClause = Array(chunk.length).fill(singleTuple).join(', ');
      const args = chunk.flat();

      await db.execute({
        sql: `
          INSERT INTO places (
            overture_id, anchor, name, category_raw, bidang_usaha, address,
            lat, lng, distance_m, phone, website, email, email_source,
            enrich_status, confidence, source, scraped_at, reach_status, tenant_id
          ) VALUES ${valuesClause}
          ON CONFLICT(overture_id) DO UPDATE SET
            anchor = CASE WHEN excluded.distance_m < places.distance_m THEN excluded.anchor ELSE places.anchor END,
            distance_m = CASE WHEN excluded.distance_m < places.distance_m THEN excluded.distance_m ELSE places.distance_m END,
            phone = COALESCE(places.phone, excluded.phone),
            website = COALESCE(places.website, excluded.website),
            email = COALESCE(places.email, excluded.email),
            address = COALESCE(places.address, excluded.address),
            tenant_id = COALESCE(places.tenant_id, excluded.tenant_id);
        `,
        args
      });
      totalSaved += chunk.length;
    }

    // 5. Mark scan as done
    await db.execute({
      sql: 'UPDATE scans SET tiles_done = ?, status = ? WHERE id = ?;',
      args: [totalTiles, 'done', scanId]
    });

    const countAfterRes = await db.execute('SELECT COUNT(*) as count FROM places;');
    const countAfter = Number(countAfterRes.rows?.[0]?.count || 0);
    const newPlacesAdded = Math.max(0, countAfter - countBefore);
    const duplicatesPrevented = Math.max(0, totalSaved - newPlacesAdded);

    const syncLogId = `sync_${Date.now()}`;
    await db.execute({
      sql: `
        INSERT INTO sync_history (
          id, source, target, total_scanned, new_places_added, 
          duplicates_prevented, total_places_now, status, details, created_at
        ) VALUES (?, 'manual_scan', ?, ?, ?, ?, ?, 'success', ?, ?);
      `,
      args: [
        syncLogId,
        anchor.name,
        totalSaved,
        newPlacesAdded,
        duplicatesPrevented,
        countAfter,
        `Pemindaian titik ${anchor.name} radius ${radiusKm} km selesai. +${newPlacesAdded} tempat baru, ${duplicatesPrevented} duplikat dicegah.`,
        new Date().toISOString()
      ]
    });

    invalidateCache();

    return NextResponse.json({
      success: true,
      scanId,
      anchor: anchor.name,
      radiusKm,
      tilesTotal: totalTiles,
      totalDiscovered,
      totalSaved,
      newPlacesAdded,
      duplicatesPrevented,
      totalPlacesNow: countAfter
    });
  } catch (error) {
    console.error('Scan error:', error);
    if (typeof scanId !== 'undefined' && scanId) {
      try {
        await db.execute({
          sql: "UPDATE scans SET status = 'failed' WHERE id = ?;",
          args: [scanId]
        });
      } catch (_) {}
    }
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
