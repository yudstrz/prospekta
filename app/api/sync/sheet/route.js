import { NextResponse } from 'next/server';
import { db, invalidateCache } from '@/lib/db';
import { sessionFromRequest } from '@/lib/auth';

const SHEET_ID = '1VEY08yrBBTI4grA0fgHHxnh3nNKuXgIeCPMg7SJ9yvk';
const BASE_EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

export const SHEET_TABS_METADATA = [
  {
    id: 'danend',
    name: "Danend's",
    gid: '548410938',
    pic: 'Danendra',
    industry: 'Bakery / Patisserie (F&B)',
    status: 'Ready / Active',
    leadCount: 25,
    distinctColumn: 'Problem Analysis & Social Media (Instagram)',
    description: '25 prospek bakery & patisserie di Singapura dengan analisis masalah operasional & akun media sosial.'
  },
  {
    id: 'lyndsey',
    name: 'Lyndsey',
    gid: '2106350285',
    pic: 'Lyndsey',
    industry: 'Auto Body Shop / Detailing',
    status: 'Ready / Active',
    leadCount: 25,
    distinctColumn: 'what they need',
    description: '25 prospek bengkel & salon mobil di Toh Guan / Jurong dengan analisis kebutuhan web & Instagram.'
  },
  {
    id: 'cami',
    name: "Cami's (Clinic & Health)",
    gid: 'clinic_health',
    pic: 'Cami',
    industry: 'Healthcare & Medical Clinic',
    status: 'Ready / Active',
    leadCount: 'Input Langsung',
    distinctColumn: 'Patient Flow, Booking & WhatsApp AI',
    description: 'Prospek sektor klinik dokter, estetika, dental & wellness di Singapura.'
  },
  {
    id: 'sheet4',
    name: 'Sheet4 (Copywriting)',
    gid: '943060339',
    pic: 'Semua PIC',
    industry: 'Email Pitch Templates',
    status: 'Template Referensi',
    leadCount: 3,
    distinctColumn: 'Version A (No Web), B (Outdated), C (Modern)',
    description: 'Template naskah outreach teruji untuk prospek.'
  },
  {
    id: 'scraping',
    name: 'Scraping (Master Dump)',
    gid: '0',
    pic: 'Database Master',
    industry: 'Multi-Industry Singapore',
    status: 'Master Pool',
    leadCount: 13619,
    distinctColumn: 'Master Scrape Prospekta',
    description: 'Kumpulan data tempat bisnis prospek terverifikasi.'
  }
];

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      if (currentRow.some(f => f.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function extractEmails(text) {
  if (!text) return { primary: null, all: [] };
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (!matches || matches.length === 0) return { primary: null, all: [] };
  return { primary: matches[0], all: Array.from(new Set(matches)) };
}

async function processTabCSV(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return { updated: 0, inserted: 0 };

  const headers = rows[0].map(h => h.trim());
  let updatedCount = 0;
  let insertedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const data = {};
    headers.forEach((h, idx) => {
      data[h] = row[idx] ? row[idx].trim() : '';
    });

    const overtureId = data['ID Overture'];
    const name = data['Nama Perusahaan'];
    const anchor = data['Titik Kantor Prospekta'] || 'Prospekta Jakarta Hub';
    if (!name || name === '-') continue;

    const emailInfo = extractEmails(data['Email']);
    const primaryEmail = emailInfo.primary || (data['Email'] && data['Email'] !== '-' ? data['Email'] : null);
    const allEmails = emailInfo.all.length > 0 ? JSON.stringify(emailInfo.all) : null;
    const phone = data['Nomor Telepon'] && data['Nomor Telepon'] !== '-' ? data['Nomor Telepon'] : null;
    const website = data['Website'] && data['Website'] !== '-' ? data['Website'] : null;
    
    // Social media / LinkedIn support
    const rawSocial = data['Social Media'] || data['LinkedIn'] || null;
    const socialMedia = rawSocial && rawSocial !== '-' ? rawSocial : null;

    // Problem analysis / what they need support
    const rawAnalysis = data['Problem Analysis'] || data['what they need'] || null;
    const problemAnalysis = rawAnalysis && rawAnalysis !== '-' ? rawAnalysis : null;

    const picName = data['Nama PIC'] && data['Nama PIC'] !== '-' ? data['Nama PIC'] : null;
    const reachStatus = data['Status Outreach'] || 'new';
    const bidangUsaha = data['Bidang Usaha'] || (data['Kategori Asli'] ? `Umum / ${data['Kategori Asli']}` : 'Bisnis Komersial');
    const address = data['Alamat'] && data['Alamat'] !== '-' ? data['Alamat'] : null;
    const distM = parseInt(data['Jarak (meter)']) || 0;

    // Check existing place by overture_id or (name + anchor)
    const existing = await db.execute({
      sql: `SELECT overture_id, name FROM places WHERE overture_id = ? OR (name = ? AND anchor = ?) LIMIT 1;`,
      args: [overtureId, name, anchor]
    });

    if (existing.rows.length > 0) {
      const matchId = existing.rows[0].overture_id;
      await db.execute({
        sql: `
          UPDATE places SET
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            all_emails = COALESCE(?, all_emails),
            website = COALESCE(?, website),
            social_media = COALESCE(?, social_media),
            problem_analysis = COALESCE(?, problem_analysis),
            sg_notes = COALESCE(?, sg_notes),
            pic_name = COALESCE(?, pic_name),
            address = COALESCE(?, address)
          WHERE overture_id = ?;
        `,
        args: [
          phone,
          primaryEmail,
          allEmails,
          website,
          socialMedia,
          problemAnalysis,
          problemAnalysis,
          picName,
          address,
          matchId
        ]
      });
      updatedCount++;
    } else {
      await db.execute({
        sql: `
          INSERT INTO places (
            overture_id, anchor, name, category_raw, bidang_usaha,
            address, distance_m, phone, website, email,
            all_emails, social_media, problem_analysis, sg_notes, pic_name,
            reach_status, enrich_status, confidence, source, scraped_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        args: [
          overtureId,
          anchor,
          name,
          data['Kategori Asli'] || 'commercial',
          bidangUsaha,
          address,
          distM,
          phone,
          website,
          primaryEmail,
          allEmails,
          socialMedia,
          problemAnalysis,
          problemAnalysis,
          picName,
          reachStatus,
          data['Status Enrich'] || 'pending',
          parseFloat(data['Tingkat Keyakinan']) || 0.8,
          'google_sheets_master',
          new Date().toISOString()
        ]
      });
      insertedCount++;
    }
  }

  return { updated: updatedCount, inserted: insertedCount };
}

export async function GET() {
  try {
    const checkRes = await db.execute(`
      SELECT COUNT(*) as sheet_lead_count, MAX(scraped_at) as last_sync
      FROM places
      WHERE source = 'google_sheets_master' OR problem_analysis IS NOT NULL;
    `);

    const count = checkRes?.rows?.[0]?.sheet_lead_count || 0;
    const lastSync = checkRes?.rows?.[0]?.last_sync || null;

    return NextResponse.json({
      success: true,
      masterSheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?pli=1&gid=548410938#gid=548410938`,
      sheetId: SHEET_ID,
      syncedLeadsCount: count,
      lastSync,
      tabs: SHEET_TABS_METADATA
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    let customUrl = null;
    let gid = '548410938'; // Default Danend's
    let targetTabs = ['548410938'];

    try {
      const body = await request.json();
      if (body?.sheetUrl) customUrl = body.sheetUrl;
      if (body?.gid) gid = String(body.gid);
    } catch (_) {}

    if (customUrl) {
      targetTabs = [customUrl];
    } else if (gid === 'all' || gid === 'both') {
      // Sync both Danend's & Lyndsey's active outreach tabs
      targetTabs = [
        `${BASE_EXPORT_URL}&gid=548410938`,
        `${BASE_EXPORT_URL}&gid=2106350285`
      ];
    } else {
      targetTabs = [`${BASE_EXPORT_URL}&gid=${gid}`];
    }

    let totalUpdated = 0;
    let totalInserted = 0;

    for (const url of targetTabs) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Prospekta/1.0 (GoogleSheetSync)'
        }
      });

      if (!res.ok) {
        throw new Error(`Gagal mengunduh spreadsheet: ${res.status} ${res.statusText}`);
      }

      const csvText = await res.text();
      const { updated, inserted } = await processTabCSV(csvText);
      totalUpdated += updated;
      totalInserted += inserted;
    }

    invalidateCache();

    return NextResponse.json({
      success: true,
      message: `Berhasil menyinkronkan data Google Sheet: ${totalUpdated} diperbarui, ${totalInserted} baru ditambahkan.`,
      updated: totalUpdated,
      inserted: totalInserted,
      totalProcessed: totalUpdated + totalInserted,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sheet sync error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Gagal sinkronisasi Google Sheet.' },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const session = await sessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { dbWrite } = await import('@/lib/db');
    const { rows } = await dbWrite.execute({
      sql: `SELECT overture_id, name, category_raw as category, address, phone, email, website, reach_status, problem_analysis, COALESCE(last_outreach_at, scraped_at) as last_updated
            FROM places
            WHERE (reach_status IS NOT NULL AND reach_status != 'new')
            ORDER BY COALESCE(last_outreach_at, scraped_at) DESC LIMIT 100;`,
      args: [],
    });

    const exportData = (rows || []).map((r) => ({
      ID: r.overture_id,
      Nama: r.name,
      Kategori: r.category,
      Status: r.reach_status || 'contacted',
      Email: r.email,
      Telepon: r.phone,
      Website: r.website,
      Analisis_Kebutuhan: r.problem_analysis || '',
      Terakhir_Diperbarui: r.last_updated,
    }));

    return NextResponse.json({
      success: true,
      message: `Berhasil menyiapkan ${exportData.length} baris prospek terupdate untuk sinkronisasi dua arah ke Google Sheets.`,
      syncedRows: exportData.length,
      data: exportData,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Bi-directional Sheet sync error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
