import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessionFromRequest, isSuperadmin } from '@/lib/auth';

export async function GET(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const anchor = searchParams.get('anchor');
    const bidangUsaha = searchParams.get('bidang_usaha');
    const enrichStatus = searchParams.get('enrich_status');
    const format = (searchParams.get('format') || 'csv').toLowerCase();

    const conditions = [];
    const args = [];

    // Data Isolation: Tenant hanya dapat mengekspor prospek pada wilayah/titik kantornya sendiri
    if (!isSuperadmin(session) && session.tid) {
      conditions.push('anchor IN (SELECT name FROM anchors WHERE tenant_id = ?)');
      args.push(session.tid);
    } else {
      if (anchor && anchor !== 'all') {
        conditions.push('anchor = ?');
        args.push(anchor);
      } else {
        conditions.push('(anchor IN (SELECT name FROM anchors WHERE tenant_id IS NULL) OR anchor NOT IN (SELECT name FROM anchors WHERE tenant_id IS NOT NULL))');
      }
    }

    if (bidangUsaha && bidangUsaha !== 'all') {
      conditions.push('bidang_usaha = ?');
      args.push(bidangUsaha);
    }

    if (enrichStatus && enrichStatus !== 'all') {
      conditions.push('enrich_status = ?');
      args.push(enrichStatus);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        overture_id,
        anchor,
        name,
        bidang_usaha,
        category_raw,
        phone,
        whatsapp,
        email,
        email_source,
        pic_name,
        linkedin_url,
        website,
        address,
        distance_m,
        confidence,
        enrich_status,
        COALESCE(reach_status, 'new') as reach_status,
        scraped_at
      FROM places
      ${whereClause}
      ORDER BY anchor ASC, distance_m ASC;
    `;

    const res = await db.execute({ sql, args });
    const rows = res.rows || [];

    const headers = [
      'ID Overture',
      'Titik Kantor',
      'Nama Perusahaan',
      'Bidang Usaha',
      'Kategori Asli',
      'Nomor Telepon',
      'Email',
      'Sumber Email',
      'Nama PIC',
      'LinkedIn',
      'Website',
      'Alamat',
      'Jarak (meter)',
      'Status Outreach',
      'Tingkat Keyakinan',
      'Status Enrich',
      'Waktu Diambil'
    ];

    if (format === 'csv' || format === 'xlsx') {
      // Create CSV format with UTF-8 BOM so Excel opens it with proper encoding
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        let str = String(val).replace(/"/g, '""');
        // OWASP Formula Injection Defense: neutralize formula prefixes
        if (/^[=+\-@\t\r]/.test(str)) {
          str = `'${str}`;
        }
        return `"${str}"`;
      };

      const csvRows = [headers.map(escapeCsv).join(',')];
      for (const r of rows) {
        csvRows.push([
          escapeCsv(r.overture_id),
          escapeCsv(r.anchor),
          escapeCsv(r.name),
          escapeCsv(r.bidang_usaha),
          escapeCsv(r.category_raw),
          escapeCsv(r.phone),
          escapeCsv(r.email),
          escapeCsv(r.email_source),
          escapeCsv(r.pic_name),
          escapeCsv(r.linkedin_url),
          escapeCsv(r.website),
          escapeCsv(r.address),
          escapeCsv(r.distance_m),
          escapeCsv(r.reach_status),
          escapeCsv(r.confidence ? Number(r.confidence).toFixed(2) : ''),
          escapeCsv(r.enrich_status),
          escapeCsv(r.scraped_at)
        ].join(','));
      }

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const filename = `prospects-${anchor ? anchor.replace(/\s+/g, '_').toLowerCase() : 'semua_titik'}-${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    // Default JSON
    return NextResponse.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
