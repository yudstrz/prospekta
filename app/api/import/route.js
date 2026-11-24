import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { haversineDistance } from '@/lib/geo';
import { normalizePhone } from '@/lib/phone';
import { mapCategoryToBidang } from '@/lib/categories';
import { sessionFromRequest, isSuperadmin } from '@/lib/auth';
import crypto from 'crypto';

function sanitizeCell(val) {
  if (typeof val !== 'string') return val;
  let s = val.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  // Formula Injection Defense
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return s;
}

function parseCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const parseRow = (line) => {
    const result = [];
    let insideQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        result.push(sanitizeCell(current));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(sanitizeCell(current));
    return result;
  };

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  const rows = [];
  const maxRows = Math.min(lines.length, 2001); // Batas maksimal 2000 baris per batch

  for (let i = 1; i < maxRows; i++) {
    const values = parseRow(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }
  }

  return rows;
}

export async function POST(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!isSuperadmin(session)) {
      return NextResponse.json({ success: false, error: 'Hanya Superadmin yang berwenang mengimpor data prospek.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const csvContent = body.csv_content;

    if (!csvContent || typeof csvContent !== 'string') {
      return NextResponse.json({ success: false, error: 'Konten CSV tidak ditemukan atau format tidak valid.' }, { status: 400 });
    }

    // Batasi ukuran maksimal 5 MB untuk mencegah serangan Memory Exhaustion / DoS
    if (csvContent.length > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Ukuran file CSV melebihi batas maksimal (5 MB).' }, { status: 400 });
    }

    // Validasi tipe teks (tolak binary file / executable upload bypass)
    if (/[\x00-\x08\x0E-\x1F]/.test(csvContent.slice(0, 512))) {
      return NextResponse.json({ success: false, error: 'File ditolak: terdeteksi file non-teks atau biner berbahaya.' }, { status: 400 });
    }

    const rows = parseCsv(csvContent);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'CSV kosong atau format tidak valid.' }, { status: 400 });
    }

    // Load anchors for distance matching
    const anchorsRes = await db.execute('SELECT * FROM anchors;');
    const anchors = anchorsRes.rows || [];

    let importedCount = 0;
    let skippedCount = 0;
    const nowIso = new Date().toISOString();

    for (const row of rows) {
      // Column name fallbacks
      const name = row.name || row.title || row.company || row.business_name;
      if (!name) {
        skippedCount++;
        continue;
      }

      const address = row.address || row.full_address || row.street || null;
      const phone = normalizePhone(row.phone || row.telephone || row.contact);
      const website = row.website || row.url || null;
      const email = row.email || null;
      const rawCategory = row.category || row.type || row.categories || 'Office';

      const lat = parseFloat(row.lat || row.latitude || 0);
      const lng = parseFloat(row.lng || row.lon || row.longitude || 0);

      // Find nearest anchor
      let nearestAnchor = anchors[0] || { name: 'Prospekta AI Hub' };
      let minDistance = 99999999;

      if (lat && lng) {
        for (const a of anchors) {
          const d = haversineDistance(Number(a.lat), Number(a.lng), lat, lng);
          if (d < minDistance) {
            minDistance = d;
            nearestAnchor = a;
          }
        }
      } else {
        minDistance = 0;
      }

      // Check deduplication (same phone, same website, or same name within 50m)
      const existingCheck = await db.execute({
        sql: `
          SELECT overture_id, distance_m 
          FROM places 
          WHERE (name = ? AND ABS(lat - ?) < 0.0005 AND ABS(lng - ?) < 0.0005)
             OR (phone IS NOT NULL AND phone = ?)
             OR (website IS NOT NULL AND website = ?)
          LIMIT 1;
        `,
        args: [name, lat, lng, phone || 'NONE', website || 'NONE']
      });

      if (existingCheck.rows.length > 0) {
        skippedCount++;
        continue;
      }

      const overtureId = `gmaps_${crypto.randomUUID().slice(0, 12)}`;
      const bidangUsaha = await mapCategoryToBidang(rawCategory);

      await db.execute({
        sql: `
          INSERT INTO places (
            overture_id, anchor, name, category_raw, bidang_usaha, address,
            lat, lng, distance_m, phone, website, email, email_source,
            enrich_status, confidence, source, scraped_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1.0, 'gmaps_import', ?);
        `,
        args: [
          overtureId,
          nearestAnchor.name,
          name,
          rawCategory,
          bidangUsaha,
          address,
          lat,
          lng,
          minDistance,
          phone,
          website,
          email,
          email ? 'gmaps_import' : null,
          email ? 'done' : 'pending',
          nowIso
        ]
      });

      importedCount++;
    }

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      importedCount,
      skippedCount
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
