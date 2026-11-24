import { dbWrite } from '../lib/db.js';

async function migrate() {
  console.log('Running comprehensive schema fix on dbWrite...');

  const safeAlter = async (table, col, def) => {
    try {
      await dbWrite.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
      console.log(`+ Added ${table}.${col}`);
    } catch (e) {
      if (e.message?.includes('duplicate column') || e.message?.includes('already exists')) {
        console.log(`- ${table}.${col} already exists`);
      } else {
        console.warn(`! Warning adding ${table}.${col}:`, e.message);
      }
    }
  };

  // 1. Fix usage_counters
  await safeAlter('usage_counters', 'date', 'TEXT');
  await safeAlter('usage_counters', 'type', 'TEXT');

  // 2. Fix analyses
  await safeAlter('analyses', 'crawled_pages', 'TEXT');
  await safeAlter('analyses', 'search_intelligence', 'TEXT');
  await safeAlter('analyses', 'google_place', 'TEXT');
  await safeAlter('analyses', 'key_people', 'TEXT');

  // 3. Fix prebuilt_websites
  await safeAlter('prebuilt_websites', 'id', 'TEXT');
  await safeAlter('prebuilt_websites', 'category', 'TEXT');
  await safeAlter('prebuilt_websites', 'phone', 'TEXT');
  await safeAlter('prebuilt_websites', 'email', 'TEXT');
  await safeAlter('prebuilt_websites', 'google_rating', 'REAL DEFAULT 0');
  await safeAlter('prebuilt_websites', 'reviews_count', 'INTEGER DEFAULT 0');
  await safeAlter('prebuilt_websites', 'google_reviews_json', 'TEXT');
  await safeAlter('prebuilt_websites', 'services_json', 'TEXT');

  // 4. Fix sg_outreach_logs
  await safeAlter('sg_outreach_logs', 'method', 'TEXT DEFAULT "email"');
  await safeAlter('sg_outreach_logs', 'preview_url', 'TEXT');
  await safeAlter('sg_outreach_logs', 'proposal_angle', 'TEXT');
  await safeAlter('sg_outreach_logs', 'notes', 'TEXT');

  // 5. Fix token_usage_logs
  await safeAlter('token_usage_logs', 'provider', 'TEXT');
  await safeAlter('token_usage_logs', 'operation', 'TEXT');

  // 6. Fix proposals
  await safeAlter('proposals', 'slug', 'TEXT');

  // 7. Create use_cases table & seed
  await dbWrite.execute(`
    CREATE TABLE IF NOT EXISTS use_cases (
      id TEXT PRIMARY KEY,
      vertical TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      template TEXT NOT NULL
    );
  `);
  console.log('+ Table use_cases ready');

  const defaultUseCases = [
    {
      id: 'uc_health_booking',
      vertical: 'Healthcare / Klinik',
      title: 'Agent Booking dan Reminder Janji Temu Pasien',
      description: 'Asisten AI otomatis via WhatsApp/Web untuk penjadwalan konsultasi dokter, konfirmasi kehadiran, dan reminder otomatis guna menurunkan no-show rate pasien.',
      template: 'Penerapan agen percakapan berbasis AI yang terhubung dengan kalender klinik dan WhatsApp Business API untuk memproses booking 24/7 tanpa antre.'
    },
    {
      id: 'uc_health_triage',
      vertical: 'Healthcare / Klinik',
      title: 'FAQ dan Triase Awal Pasien (Non-Diagnostik)',
      description: 'Menjawab pertanyaan operasional klinik (jadwal dokter, asuransi rekanan, estimasi biaya) serta triase informasi awal sebelum bertemu tenaga medis.',
      template: 'Sistem tanya-jawab cerdas berbasis panduan operasional klinik yang memandu pasien ke dokter spesialis yang tepat dengan cepat.'
    },
    {
      id: 'uc_health_claim',
      vertical: 'Healthcare / Klinik',
      title: 'Ekstraksi Dokumen Asuransi dan Klaim',
      description: 'Ekstraksi OCR berbasis vision/LLM untuk memproses formulir klaim asuransi kesehatan, kwitansi lab, dan rujukan dengan akurasi tinggi.',
      template: 'Alur otomasi pemindaian dokumen medis yang mengekstrak data terstruktur ke sistem manajemen klinik (CMS/EHR).'
    },
    {
      id: 'uc_trading_docs',
      vertical: 'Trading / Export-Import',
      title: 'Ekstraksi Invoice, Packing List, dan Bill of Lading',
      description: 'Pengolahan otomatis dokumen pengapalan ekspor-impor multi-format guna memvalidasi kuantitas, harga, dan nomor kontainer dalam hitungan detik.',
      template: 'Ekstraksi cerdas dokumen logistik dan perdagangan internasional yang membandingkan Packing List dengan Commercial Invoice secara otomatis.'
    },
    {
      id: 'uc_trading_hscode',
      vertical: 'Trading / Export-Import',
      title: 'Validasi Dokumen dan Bantuan Klasifikasi HS Code',
      description: 'Rekomendasi HS Code berdasarkan deskripsi komoditas perdagangan serta audit kelengkapan perizinan bea cukai.',
      template: 'Mesin klasifikasi AI yang memetakan deskripsi barang dagang ke daftar Harmonized System (HS) Code resmi untuk meminimalkan risiko kepabeanan.'
    },
    {
      id: 'uc_trading_quotation',
      vertical: 'Trading / Export-Import',
      title: 'Agent Quotation dan Follow-up Buyer/Supplier',
      description: 'Menyusun draft penawaran harga (RFQ/Quotation) cepat serta otomasi tindak lanjut status pengiriman atau penawaran.',
      template: 'Drafting asisten cerdas untuk tim sales perdagangan yang merangkum inquiry buyer dan menyusun draf respons profesional.'
    },
    {
      id: 'uc_general_leads',
      vertical: 'Umum / Bisnis Digital',
      title: 'Otomasi Follow-up Lead dan Sales Inquiry',
      description: 'Respons kilat untuk calon prospek yang masuk lewat website atau direktori bisnis guna meningkatkan konversi meeting awal.',
      template: 'Agen penjawab inquiry masuk yang melakukan kualifikasi kebutuhan awal dan mengarahkan ke tautan booking jadwal meeting konsultasi.'
    },
    {
      id: 'uc_general_ops',
      vertical: 'Umum / Bisnis Digital',
      title: 'Dashboard Intelijen Operasional dan Customer Service',
      description: 'Konsolidasi riwayat interaksi pelanggan dan pelaporan status transaksi operasional harian.',
      template: 'Panel dasbor terpadu untuk monitoring kinerja layanan pelanggan dan ringkasan insight percakapan.'
    }
  ];

  for (const uc of defaultUseCases) {
    await dbWrite.execute({
      sql: `INSERT INTO use_cases (id, vertical, title, description, template)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              vertical=excluded.vertical,
              title=excluded.title,
              description=excluded.description,
              template=excluded.template;`,
      args: [uc.id, uc.vertical, uc.title, uc.description, uc.template]
    });
  }
  console.log('+ Seeded default use_cases');

  // 8. Create sg_bounced_emails table
  await dbWrite.execute(`
    CREATE TABLE IF NOT EXISTS sg_bounced_emails (
      id TEXT PRIMARY KEY,
      recipient_email TEXT UNIQUE NOT NULL,
      company_name TEXT,
      place_id TEXT,
      subject TEXT,
      bounce_reason TEXT,
      detected_at TEXT NOT NULL,
      source TEXT
    );
  `);
  await dbWrite.execute(`CREATE INDEX IF NOT EXISTS idx_bounced_email ON sg_bounced_emails(recipient_email);`);
  console.log('+ Table sg_bounced_emails ready');

  console.log('Schema migration completed successfully!');
}

migrate().catch(console.error);
