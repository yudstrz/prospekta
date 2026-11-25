import crypto from 'node:crypto';
import { db, dbWrite, invalidateCache } from './db.js';
import { haversineDistance, generateTiles, geocodeAddress } from './geo.js';
import { normalizePhone } from './phone.js';
import { mapCategoryToBidang } from './categories.js';
import { fetchOverturePlaces } from './overture.js';

/**
 * Mesin scan & discovery area bersama (dipakai oleh /api/scan dan AI Assistant tools).
 */
export async function executeAreaScan({
  anchorName = '',
  locationQuery = '',
  radiusKm: requestedRadius = 2,
  tenantId = null,
  userId = null,
  isAdmin = false,
}) {
  const effectiveTid = tenantId || (isAdmin ? 'tnt_master' : null);
  let anchor = null;

  // 1. Cari anchor eksisting sesuai nama dalam batas akses user/tenant
  const cleanName = String(anchorName || '').trim();
  if (cleanName) {
    const scopeSql = isAdmin
      ? `(tenant_id IS NULL OR tenant_id = 'tnt_master' OR owner_user_id = ?)`
      : (tenantId && tenantId !== 'tnt_master'
        ? `(tenant_id = ? OR owner_user_id = ?)`
        : `owner_user_id = ?`);
    const scopeArgs = isAdmin
      ? [userId || '']
      : (tenantId && tenantId !== 'tnt_master' ? [tenantId, userId || ''] : [userId || '']);

    const exact = await dbWrite.execute({
      sql: `SELECT * FROM anchors WHERE (name = ? OR id = ?) AND (${scopeSql}) LIMIT 1;`,
      args: [cleanName, cleanName, ...scopeArgs],
    });
    anchor = exact.rows?.[0] || null;

    if (!anchor) {
      const fuzzy = await dbWrite.execute({
        sql: `SELECT * FROM anchors WHERE LOWER(name) LIKE LOWER(?) AND (${scopeSql}) LIMIT 1;`,
        args: [`%${cleanName}%`, ...scopeArgs],
      });
      anchor = fuzzy.rows?.[0] || null;
    }
  }

  // 2. Jika belum ketemu & ada locationQuery (atau anchorName baru), geocode dan buat anchor terisolasi
  let createdAnchor = false;
  const queryToGeocode = String(locationQuery || '').trim() || (!anchor && cleanName ? cleanName : '');
  if (!anchor && queryToGeocode) {
    const geo = await geocodeAddress(queryToGeocode).catch(() => null);
    if (geo && !Number.isNaN(geo.lat) && !Number.isNaN(geo.lng)) {
      const parts = String(geo.display || queryToGeocode).split(',').map((s) => s.trim()).filter(Boolean);
      const newName = cleanName || parts[0] || queryToGeocode.slice(0, 48);
      const city = parts.slice(1, 3).join(', ') || 'Indonesia';
      const newId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();

      await dbWrite.execute({
        sql: `INSERT INTO anchors (id, name, address, city, lat, lng, radius_default_km, tenant_id, owner_user_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO NOTHING;`,
        args: [
          newId,
          newName,
          geo.display || queryToGeocode,
          city,
          geo.lat,
          geo.lng,
          Math.min(Math.max(Number(requestedRadius) || 2, 1), 10),
          effectiveTid,
          userId || null,
          nowIso,
        ],
      });

      anchor = {
        id: newId,
        name: newName,
        address: geo.display || queryToGeocode,
        city,
        lat: geo.lat,
        lng: geo.lng,
        radius_default_km: Number(requestedRadius) || 2,
      };
      createdAnchor = true;
      invalidateCache();
    }
  }

  // 3. Fallback anchor aktif milik tenant/user bila nama tidak diisi
  if (!anchor) {
    const fb = tenantId && !isAdmin
      ? await dbWrite.execute({ sql: 'SELECT * FROM anchors WHERE tenant_id = ? OR owner_user_id = ? LIMIT 1;', args: [tenantId, userId || ''] })
      : await dbWrite.execute({ sql: "SELECT * FROM anchors WHERE tenant_id IS NULL OR tenant_id = 'tnt_master' LIMIT 1;" });
    anchor = fb.rows?.[0] || null;
  }

  if (!anchor) {
    throw new Error('Titik lokasi/anchor belum ditemukan. Sertakan nama daerah atau buat titik lokasi terlebih dahulu.');
  }

  const isSg = (anchor.city || '').toLowerCase().includes('singapore') || (anchor.name || '').toLowerCase().includes('singapore') || anchor.id === 'prospekta_sg';
  const maxScanRadius = isSg && isAdmin ? 20 : 10;
  const radiusKm = Math.min(Math.max(parseFloat(requestedRadius || anchor.radius_default_km || 2), 0.5), maxScanRadius);
  const centerLat = Number(anchor.lat);
  const centerLng = Number(anchor.lng);

  const { totalTiles, bounds } = generateTiles(centerLat, centerLng, radiusKm, 4);
  const scanId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await dbWrite.execute({
    sql: `INSERT INTO scans (id, anchor, radius_km, tiles_total, tiles_done, status, created_at, tenant_id, owner_user_id)
          VALUES (?, ?, ?, ?, 0, 'running', ?, ?, ?);`,
    args: [scanId, anchor.name, radiusKm, totalTiles, nowIso, effectiveTid || 'tnt_master', userId || null],
  }).catch(() => {});

  try {
    const countBeforeRes = await db.execute('SELECT COUNT(*) as count FROM places;');
    const countBefore = Number(countBeforeRes.rows?.[0]?.count || 0);

    let places = await fetchOverturePlaces(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat, radiusKm);

    if (!places || places.length === 0) {
      const dbFallback = await db.execute({
        sql: 'SELECT * FROM places WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 50;',
        args: [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng],
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
        confidence: Number(r.confidence || 0.85),
      }));
    }

    const totalDiscovered = places.length;
    const existingRes = await db.execute({
      sql: 'SELECT overture_id, phone, website, address FROM places WHERE anchor = ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?;',
      args: [anchor.name, bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng],
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
        p.email ? 'overture' : null,
        'pending',
        p.confidence || 0,
        'overture',
        nowIso,
        'new',
        tenantId || null,
        userId || null,
      ]);
    }

    const CHUNK_SIZE = 80;
    const singleTuple = `(${Array(20).fill('?').join(', ')})`;
    let totalSaved = 0;

    for (let i = 0; i < rowsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToUpsert.slice(i, i + CHUNK_SIZE);
      const valuesClause = Array(chunk.length).fill(singleTuple).join(', ');
      await dbWrite.execute({
        sql: `
          INSERT INTO places (
            overture_id, anchor, name, category_raw, bidang_usaha, address,
            lat, lng, distance_m, phone, website, email, email_source,
            enrich_status, confidence, source, scraped_at, reach_status, tenant_id, owner_user_id
          ) VALUES ${valuesClause}
          ON CONFLICT(overture_id) DO UPDATE SET
            anchor = CASE WHEN excluded.distance_m < places.distance_m THEN excluded.anchor ELSE places.anchor END,
            distance_m = CASE WHEN excluded.distance_m < places.distance_m THEN excluded.distance_m ELSE places.distance_m END,
            phone = COALESCE(places.phone, excluded.phone),
            website = COALESCE(places.website, excluded.website),
            email = COALESCE(places.email, excluded.email),
            address = COALESCE(places.address, excluded.address),
            tenant_id = COALESCE(places.tenant_id, excluded.tenant_id),
            owner_user_id = COALESCE(places.owner_user_id, excluded.owner_user_id);
        `,
        args: chunk.flat(),
      });
      totalSaved += chunk.length;
    }

    await dbWrite.execute({
      sql: 'UPDATE scans SET tiles_done = ?, status = ? WHERE id = ?;',
      args: [totalTiles, 'done', scanId],
    }).catch(() => {});

    const [countAfterRes, anchorCountRes] = await Promise.all([
      db.execute('SELECT COUNT(*) as count FROM places;'),
      db.execute({ sql: 'SELECT COUNT(*) as count FROM places WHERE anchor = ?;', args: [anchor.name] }),
    ]);
    const countAfter = Number(countAfterRes.rows?.[0]?.count || 0);
    const totalInAnchor = Number(anchorCountRes.rows?.[0]?.count || 0);
    const newPlacesAdded = Math.max(0, countAfter - countBefore);
    const duplicatesPrevented = Math.max(0, totalSaved - newPlacesAdded);

    await dbWrite.execute({
      sql: `INSERT INTO sync_history (id, source, target, total_scanned, new_places_added, duplicates_prevented, total_places_now, status, details, created_at)
            VALUES (?, 'manual_scan', ?, ?, ?, ?, ?, 'success', ?, ?);`,
      args: [
        `sync_${Date.now()}`,
        anchor.name,
        totalSaved,
        newPlacesAdded,
        duplicatesPrevented,
        countAfter,
        `Pemindaian titik ${anchor.name} radius ${radiusKm} km selesai. +${newPlacesAdded} tempat baru, ${duplicatesPrevented} duplikat dicegah.`,
        new Date().toISOString(),
      ],
    }).catch(() => {});

    invalidateCache();

    return {
      success: true,
      scanId,
      anchorId: anchor.id,
      anchor: anchor.name,
      city: anchor.city,
      createdAnchor,
      radiusKm,
      tilesTotal: totalTiles,
      totalDiscovered,
      totalSaved,
      newPlacesAdded,
      duplicatesPrevented,
      totalPlacesNow: countAfter,
      totalInAnchor,
    };
  } catch (err) {
    await dbWrite.execute({
      sql: "UPDATE scans SET status = 'failed' WHERE id = ?;",
      args: [scanId],
    }).catch(() => {});
    throw err;
  }
}
