import { NextResponse } from 'next/server';
import { db, cachedExecute, invalidateCache } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';
import { ensureTenantSchema } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const fail = (error, status = 500) => NextResponse.json({ success: false, error }, { status });

export async function GET(request) {
  try {
    await ensureTenantSchema();
    const tid = (await sessionFromRequest(request))?.tid || null;
    // Admin internal hanya melihat titik default Prospekta; klien hanya titik miliknya.
    let rows = [];
    const anchorsRes = await cachedExecute({
      sql: `SELECT id, name, address, city, lat, lng, radius_default_km
            FROM anchors
            WHERE tenant_id IS ?
            ORDER BY
              CASE WHEN id IN ('prospekta_jkt', 'ai_hub', 'academy_jakarta', 'academy_surabaya', 'prospekta_sg') THEN 0 ELSE 1 END,
              id ASC;`,
      args: [tid],
    }, 30000);

    rows = anchorsRes?.rows || [];

    // Auto-heal: jika klien belum punya anchor di database tetapi punya profil alamat di tabel tenants, buatkan otomatis
    if (tid && rows.length === 0) {
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
    const tid = (await sessionFromRequest(request))?.tid || null;
    const body = await request.json().catch(() => ({}));
    const name = (body.name || '').trim();
    const city = (body.city || 'Kustom').trim();
    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.lng);
    const isSg = city.toLowerCase().includes('singapore') || name.toLowerCase().includes('singapore');
    const maxRadius = isSg && !tid ? 20 : 2;
    const radiusKm = Math.min(Math.max(parseFloat(body.radius_default_km || 2), 0.5), maxRadius);
    const address = (body.address || `Koordinat (${lat.toFixed(4)}, ${lng.toFixed(4)})`).trim();

    if (!name) return fail('Nama titik wajib diisi.', 400);
    if (isNaN(lat) || lat < -90 || lat > 90) return fail('Latitude tidak valid (-90 sampai 90).', 400);
    if (isNaN(lng) || lng < -180 || lng > 180) return fail('Longitude tidak valid (-180 sampai 180).', 400);

    // places/scans terikat ke nama anchor, jadi nama klien tidak boleh bentrok dengan anchor lain.
    if (tid) {
      const dup = await db.execute({ sql: 'SELECT 1 FROM anchors WHERE name = ? LIMIT 1;', args: [name] });
      if (dup.rows?.length) return fail('Nama titik sudah dipakai. Gunakan nama lain.', 409);
    }

    const id = `custom_${Date.now()}`;
    await db.execute({
      sql: `INSERT INTO anchors (id, name, address, city, lat, lng, radius_default_km, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [id, name, address, city, lat, lng, radiusKm, tid],
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
    const tid = (await sessionFromRequest(request))?.tid || null;
    const id = new URL(request.url).searchParams.get('id');

    if (!id || !id.startsWith('custom_')) {
      return fail('Hanya titik kustom yang dapat dihapus. Titik kantor default dilindungi.', 400);
    }

    const checkRes = await db.execute({
      sql: 'SELECT name FROM anchors WHERE id = ? AND tenant_id IS ? LIMIT 1;',
      args: [id, tid],
    });
    if (!checkRes.rows?.length) return fail('Titik tidak ditemukan.', 404);

    const anchorName = checkRes.rows[0].name;
    await db.batch([
      { sql: 'DELETE FROM anchors WHERE id = ?;', args: [id] },
      { sql: 'DELETE FROM places WHERE anchor = ?;', args: [anchorName] },
      { sql: 'DELETE FROM scans WHERE anchor = ?;', args: [anchorName] },
    ]);
    invalidateCache();

    return NextResponse.json({ success: true, message: `Titik "${anchorName}" dan data terkait berhasil dihapus.` });
  } catch (error) {
    console.error('Error deleting anchor:', error);
    return fail(error.message);
  }
}
