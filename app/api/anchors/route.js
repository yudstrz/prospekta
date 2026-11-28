import { NextResponse } from 'next/server';
import { db, cachedExecute, invalidateCache } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';
import { ensureTenantSchema } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const fail = (error, status = 500) => NextResponse.json({ success: false, error }, { status });

function getAnchorScope(session) {
  const tid = session?.tid || null;
  const isSuperAdmin = session?.role === 'admin' || !tid || tid === 'tnt_master';
  return {
    tid,
    isSuperAdmin,
    effectiveTid: isSuperAdmin ? 'tnt_master' : tid,
    whereClause: isSuperAdmin ? "(tenant_id = 'tnt_master' OR tenant_id IS NULL)" : 'tenant_id = ?',
    whereArgs: isSuperAdmin ? [] : [tid],
  };
}

function parseAnchorPayload(body, isSuperAdmin) {
  const name = String(body.name || '').trim();
  const city = String(body.city || 'Kustom').trim() || 'Kustom';
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);

  if (!name) return { error: 'Nama titik wajib diisi.' };
  if (Number.isNaN(lat) || lat < -90 || lat > 90) return { error: 'Latitude tidak valid (-90 sampai 90).' };
  if (Number.isNaN(lng) || lng < -180 || lng > 180) return { error: 'Longitude tidak valid (-180 sampai 180).' };

  const isSg = city.toLowerCase().includes('singapore') || name.toLowerCase().includes('singapore');
  const maxRadius = isSg && isSuperAdmin ? 20 : 10;
  const radiusKm = Math.min(Math.max(parseFloat(body.radius_default_km || 2) || 2, 0.5), maxRadius);
  const address = String(body.address || `Koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)})`).trim();

  return { name, city, lat, lng, radiusKm, address };
}

export async function GET(request) {
  try {
    await ensureTenantSchema();
    const session = await sessionFromRequest(request);
    if (!session) return fail('Unauthorized', 401);
    const { tid, isSuperAdmin, whereClause, whereArgs } = getAnchorScope(session);

    const sql = isSuperAdmin
      ? `SELECT id, name, address, city, lat, lng, radius_default_km
         FROM anchors
         WHERE ${whereClause}
         ORDER BY
           CASE WHEN id IN ('prospekta_jkt', 'ai_hub', 'academy_jakarta', 'academy_surabaya', 'prospekta_sg') THEN 0 ELSE 1 END,
           id ASC;`
      : `SELECT id, name, address, city, lat, lng, radius_default_km
         FROM anchors
         WHERE ${whereClause}
         ORDER BY id ASC;`;

    const anchorsRes = await cachedExecute({ sql, args: whereArgs }, 30000);
    let rows = anchorsRes?.rows || [];

    // Auto-heal: jika klien belum punya anchor di database tetapi punya profil alamat di tabel tenants, buatkan otomatis
    if (tid && !isSuperAdmin && rows.length === 0) {
      try {
        const tRes = await db.execute({
          sql: 'SELECT id, company_name, address, latitude, longitude FROM tenants WHERE id = ? LIMIT 1;',
          args: [tid]
        });
        const tRow = tRes.rows?.[0];
        if (tRow && tRow.latitude && tRow.longitude) {
          const autoId = `custom_${tid}`;
          const autoName = tRow.company_name || 'Kantor Utama';
          const autoAddr = tRow.address || 'Lokasi Kantor';
          const autoCity = (autoAddr.split(',').slice(-2)[0] || autoName || 'Kustom').trim();
          await db.execute({
            sql: `INSERT INTO anchors (id, name, address, city, lat, lng, radius_default_km, tenant_id)
                  VALUES (?, ?, ?, ?, ?, ?, 2, ?)
                  ON CONFLICT(id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng;`,
            args: [autoId, autoName, autoAddr, autoCity, tRow.latitude, tRow.longitude, tid]
          });
          invalidateCache();
          const fresh = await db.execute({
            sql: `SELECT id, name, address, city, lat, lng, radius_default_km FROM anchors WHERE tenant_id = ? ORDER BY id ASC;`,
            args: [tid]
          });
          rows = fresh.rows || [];
        }
      } catch (healErr) {
        console.warn('Auto-heal anchor warning:', healErr.message);
      }
    }

    return NextResponse.json(
      { success: true, anchors: rows },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error fetching anchors:', error);
    return fail(error.message);
  }
}

export async function POST(request) {
  try {
    await ensureTenantSchema();
    const session = await sessionFromRequest(request);
    if (!session) return fail('Unauthorized', 401);
    const { isSuperAdmin, effectiveTid, whereClause, whereArgs } = getAnchorScope(session);

    const body = await request.json().catch(() => ({}));
    const parsed = parseAnchorPayload(body, isSuperAdmin);
    if (parsed.error) return fail(parsed.error, 400);

    const dup = await db.execute({
      sql: `SELECT 1 FROM anchors WHERE LOWER(name) = LOWER(?) AND ${whereClause} LIMIT 1;`,
      args: [parsed.name, ...whereArgs],
    });
    if (dup.rows?.length) return fail('Nama titik sudah ada di akun ini. Gunakan nama lain.', 409);

    const id = `custom_${Date.now()}`;
    await db.execute({
      sql: `INSERT INTO anchors (id, name, address, city, lat, lng, radius_default_km, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [id, parsed.name, parsed.address, parsed.city, parsed.lat, parsed.lng, parsed.radiusKm, effectiveTid],
    });
    invalidateCache();

    return NextResponse.json({
      success: true,
      anchor: {
        id,
        name: parsed.name,
        address: parsed.address,
        city: parsed.city,
        lat: parsed.lat,
        lng: parsed.lng,
        radius_default_km: parsed.radiusKm,
      },
    });
  } catch (error) {
    console.error('Error creating anchor:', error);
    return fail(error.message);
  }
}

export async function PATCH(request) {
  try {
    await ensureTenantSchema();
    const session = await sessionFromRequest(request);
    if (!session) return fail('Unauthorized', 401);
    const { isSuperAdmin, whereClause, whereArgs } = getAnchorScope(session);

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || new URL(request.url).searchParams.get('id') || '').trim();
    if (!id) return fail('ID lokasi wajib disertakan.', 400);

    const existingRes = await db.execute({
      sql: `SELECT id, name FROM anchors WHERE id = ? AND ${whereClause} LIMIT 1;`,
      args: [id, ...whereArgs],
    });
    const existing = existingRes.rows?.[0];
    if (!existing) return fail('Lokasi kantor tidak ditemukan.', 404);

    const parsed = parseAnchorPayload(body, isSuperAdmin);
    if (parsed.error) return fail(parsed.error, 400);

    const dup = await db.execute({
      sql: `SELECT 1 FROM anchors WHERE LOWER(name) = LOWER(?) AND id != ? AND ${whereClause} LIMIT 1;`,
      args: [parsed.name, id, ...whereArgs],
    });
    if (dup.rows?.length) return fail('Nama lokasi sudah dipakai titik lain di akun ini.', 409);

    const stmts = [
      {
        sql: `UPDATE anchors SET name = ?, address = ?, city = ?, lat = ?, lng = ?, radius_default_km = ? WHERE id = ?;`,
        args: [parsed.name, parsed.address, parsed.city, parsed.lat, parsed.lng, parsed.radiusKm, id],
      },
    ];

    if (existing.name !== parsed.name) {
      stmts.push(
        {
          sql: `UPDATE places SET anchor = ? WHERE anchor = ? AND ${whereClause};`,
          args: [parsed.name, existing.name, ...whereArgs],
        },
        {
          sql: `UPDATE scans SET anchor = ? WHERE anchor = ? AND ${whereClause};`,
          args: [parsed.name, existing.name, ...whereArgs],
        }
      );
    }

    await db.batch(stmts);
    invalidateCache();

    return NextResponse.json({
      success: true,
      anchor: {
        id,
        name: parsed.name,
        address: parsed.address,
        city: parsed.city,
        lat: parsed.lat,
        lng: parsed.lng,
        radius_default_km: parsed.radiusKm,
      },
    });
  } catch (error) {
    console.error('Error updating anchor:', error);
    return fail(error.message);
  }
}

export const PUT = PATCH;

export async function DELETE(request) {
  try {
    await ensureTenantSchema();
    const session = await sessionFromRequest(request);
    if (!session) return fail('Unauthorized', 401);
    const { whereClause, whereArgs } = getAnchorScope(session);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return fail('ID lokasi wajib diisi.', 400);

    const checkRes = await db.execute({
      sql: `SELECT id, name FROM anchors WHERE id = ? AND ${whereClause} LIMIT 1;`,
      args: [id, ...whereArgs],
    });
    if (!checkRes.rows?.length) return fail('Titik tidak ditemukan.', 404);

    const countRes = await db.execute({
      sql: `SELECT COUNT(*) as count FROM anchors WHERE ${whereClause};`,
      args: whereArgs,
    });
    if (Number(countRes.rows?.[0]?.count || 0) <= 1) {
      return fail('Minimal harus ada 1 lokasi kantor aktif. Edit lokasi ini atau tambah lokasi baru sebelum menghapus.', 400);
    }

    const anchorName = checkRes.rows[0].name;
    await db.batch([
      { sql: 'DELETE FROM anchors WHERE id = ?;', args: [id] },
      { sql: `DELETE FROM places WHERE anchor = ? AND ${whereClause};`, args: [anchorName, ...whereArgs] },
      { sql: `DELETE FROM scans WHERE anchor = ? AND ${whereClause};`, args: [anchorName, ...whereArgs] },
    ]);
    invalidateCache();

    return NextResponse.json({ success: true, message: `Titik "${anchorName}" dan data terkait berhasil dihapus.` });
  } catch (error) {
    console.error('Error deleting anchor:', error);
    return fail(error.message);
  }
}
