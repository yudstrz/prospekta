import { NextResponse } from 'next/server';
import { db, cachedExecute, invalidateCache } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';
import { ensureTenantSchema } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const fail = (error, status = 500) => NextResponse.json({ success: false, error }, { status });

export async function GET(request) {
  try {
    await ensureTenantSchema();
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;
    const isSuperAdmin = session?.role === 'admin' || !tid || tid === 'tnt_master';

    let sql;
    let args;
    if (isSuperAdmin) {
      sql = `SELECT id, name, address, city, lat, lng, radius_default_km
             FROM anchors
             WHERE tenant_id = 'tnt_master' OR tenant_id IS NULL
             ORDER BY
               CASE WHEN id IN ('prospekta_jkt', 'ai_hub', 'academy_jakarta', 'academy_surabaya', 'prospekta_sg') THEN 0 ELSE 1 END,
               id ASC;`;
      args = [];
    } else {
      sql = `SELECT id, name, address, city, lat, lng, radius_default_km
             FROM anchors
             WHERE tenant_id = ?
             ORDER BY id ASC;`;
      args = [tid];
    }

    const anchorsRes = await cachedExecute({ sql, args }, 30000);
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
            sql: `SELECT id, name, address, city, lat, lng, radius_default_km FROM anchors WHERE tenant_id = ?;`,
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
    const tid = session?.tid || null;
    const isSuperAdmin = session?.role === 'admin' || !tid || tid === 'tnt_master';
    const body = await request.json().catch(() => ({}));
    const name = (body.name || '').trim();
    const city = (body.city || 'Kustom').trim();
    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.lng);
    const isSg = city.toLowerCase().includes('singapore') || name.toLowerCase().includes('singapore');
    const maxRadius = isSg && isSuperAdmin ? 20 : 10;
    const radiusKm = Math.min(Math.max(parseFloat(body.radius_default_km || 2), 0.5), maxRadius);
    const address = (body.address || `Koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)})`).trim();

    if (!name) return fail('Nama titik wajib diisi.', 400);
    if (isNaN(lat) || lat < -90 || lat > 90) return fail('Latitude tidak valid (-90 sampai 90).', 400);
    if (isNaN(lng) || lng < -180 || lng > 180) return fail('Longitude tidak valid (-180 sampai 180).', 400);

    // Cek duplikasi nama titik: hanya dilarang jika nama yang sama sudah ada di akun/tenant yang sama.
    // Akun berbeda DIPERBOLEHKAN menggunakan nama atau lokasi yang sama.
    const effectiveTid = tid || 'tnt_master';
    const dupSql = isSuperAdmin
      ? `SELECT 1 FROM anchors WHERE LOWER(name) = LOWER(?) AND (tenant_id = 'tnt_master' OR tenant_id IS NULL) LIMIT 1;`
      : `SELECT 1 FROM anchors WHERE LOWER(name) = LOWER(?) AND tenant_id = ? LIMIT 1;`;
    const dupArgs = isSuperAdmin ? [name] : [name, effectiveTid];
    const dup = await db.execute({ sql: dupSql, args: dupArgs });
    if (dup.rows?.length) return fail('Nama titik sudah ada di akun ini. Gunakan nama lain.', 409);

    const id = `custom_${Date.now()}`;
    await db.execute({
      sql: `INSERT INTO anchors (id, name, address, city, lat, lng, radius_default_km, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [id, name, address, city, lat, lng, radiusKm, effectiveTid],
    });
    invalidateCache();

    return NextResponse.json({
      success: true,
      anchor: { id, name, address, city, lat, lng, radius_default_km: radiusKm },
    });
  } catch (error) {
    console.error('Error creating anchor:', error);
    return fail(error.message);
  }
}

export async function DELETE(request) {
  try {
    await ensureTenantSchema();
    const session = await sessionFromRequest(request);
    const tid = session?.tid || null;
    const isSuperAdmin = session?.role === 'admin' || !tid || tid === 'tnt_master';
    const id = new URL(request.url).searchParams.get('id');

    if (!id || !id.startsWith('custom_')) {
      return fail('Hanya titik kustom yang dapat dihapus. Titik kantor default dilindungi.', 400);
    }

    const checkSql = isSuperAdmin
      ? `SELECT name FROM anchors WHERE id = ? AND (tenant_id = 'tnt_master' OR tenant_id IS NULL) LIMIT 1;`
      : `SELECT name FROM anchors WHERE id = ? AND tenant_id = ? LIMIT 1;`;
    const checkArgs = isSuperAdmin ? [id] : [id, tid];
    const checkRes = await db.execute({ sql: checkSql, args: checkArgs });
    if (!checkRes.rows?.length) return fail('Titik tidak ditemukan.', 404);

    const anchorName = checkRes.rows[0].name;
    const deletePlacesSql = isSuperAdmin
      ? `DELETE FROM places WHERE anchor = ? AND (tenant_id = 'tnt_master' OR tenant_id IS NULL);`
      : `DELETE FROM places WHERE anchor = ? AND tenant_id = ?;`;
    const deleteScansSql = isSuperAdmin
      ? `DELETE FROM scans WHERE anchor = ? AND (tenant_id = 'tnt_master' OR tenant_id IS NULL);`
      : `DELETE FROM scans WHERE anchor = ? AND tenant_id = ?;`;
    const deleteArgs = isSuperAdmin ? [anchorName] : [anchorName, tid];

    await db.batch([
      { sql: 'DELETE FROM anchors WHERE id = ?;', args: [id] },
      { sql: deletePlacesSql, args: deleteArgs },
      { sql: deleteScansSql, args: deleteArgs },
    ]);
    invalidateCache();

    return NextResponse.json({ success: true, message: `Titik "${anchorName}" dan data terkait berhasil dihapus.` });
  } catch (error) {
    console.error('Error deleting anchor:', error);
    return fail(error.message);
  }
}
