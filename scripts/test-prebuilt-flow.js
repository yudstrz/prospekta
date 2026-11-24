import { db } from '../lib/db.js';

async function testPrebuilt() {
  console.log('[INFO] Memeriksa database untuk kandidat bisnis...');

  // Cari 1 bisnis lokal di database
  const res = await db.execute(`SELECT overture_id, name, address, phone FROM places LIMIT 1;`);
  const place = res.rows?.[0];

  if (!place) {
    console.log('[ERROR] Tidak ada bisnis di database.');
    return;
  }

  console.log(`Bisnis: ${place.name} (${place.overture_id})`);

  // Simulasi endpoint generate prebuilt site
  const slug = `test_${Math.random().toString(36).substring(2, 8)}`;
  const siteId = `site_test_${Date.now()}`;
  const nowIso = new Date().toISOString();

  await db.execute({
    sql: `
      INSERT INTO prebuilt_websites (
        id, place_id, slug, company_name, phone, hero_headline, hero_subheadline, services_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?);
    `,
    args: [
      siteId,
      place.overture_id,
      slug,
      place.name,
      place.phone || '',
      `Solusi Layanan Prima untuk Pelanggan ${place.name}`,
      `Standar mutu tinggi, pengerjaan cepat dan transparan untuk seluruh pelanggan.`,
      JSON.stringify([
        { title: 'Konsultasi & Pemeriksaan', description: 'Analisa kebutuhan langsung dengan estimasi terbuka.' }
      ]),
      nowIso
    ]
  });

  console.log(`[SUCCESS] Prebuilt website berhasil disimpan ke database Turso!`);
  console.log(`Slug: ${slug}`);
  console.log(`Live Link: http://localhost:3000/p/${slug}`);

  // Verifikasi query balik
  const check = await db.execute({
    sql: `SELECT * FROM prebuilt_websites WHERE slug = ?;`,
    args: [slug]
  });

  if (check.rows?.length > 0) {
    console.log(`[VERIFIED] Terverifikasi! Baris data berhasil dibaca dari tabel prebuilt_websites.`);
  }

  // Bersihkan data dummy
  await db.execute({
    sql: `DELETE FROM prebuilt_websites WHERE id = ?;`,
    args: [siteId]
  });
  console.log(`[CLEANUP] Data uji coba dibersihkan dengan sukses.`);
}

testPrebuilt();
