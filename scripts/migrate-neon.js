/**
 * Neon PostgreSQL Migration & Schema Setup for Prospekta
 * Run with: node --env-file=.env.local scripts/migrate-neon.js
 */
import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString || !connectionString.startsWith('postgres')) {
  console.error('DATABASE_URL belum di-set di .env.local dengan connection string PostgreSQL Neon.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Menginisialisasi skema tabel Prospekta (RBAC & Universal MCP) di Neon PostgreSQL...');
    await client.query('BEGIN');

    // 1. users (RBAC 2 Peran: admin & user)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. mcp_tokens (Token MCP terisolasi per akun & role)
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Default MCP Plugin',
        token_hash TEXT UNIQUE NOT NULL,
        token_prefix TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('admin', 'user')),
        expires_at TIMESTAMPTZ,
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 3. agent_profiles (Knowledge base & konfigurasi Company AI Agent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_profiles (
        id TEXT PRIMARY KEY DEFAULT 'company_default',
        company_name TEXT NOT NULL DEFAULT 'Prospekta',
        system_prompt TEXT NOT NULL,
        knowledge_markdown TEXT NOT NULL DEFAULT '',
        model_id TEXT NOT NULL DEFAULT 'gemini-2.0-flash-lite',
        temperature DOUBLE PRECISION NOT NULL DEFAULT 0.2,
        updated_by TEXT REFERENCES users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Insert default agent profile if not exists
    await client.query(`
      INSERT INTO agent_profiles (id, company_name, system_prompt, knowledge_markdown, model_id)
      VALUES (
        'company_default',
        'Prospekta',
        'Anda adalah AI Agent resmi untuk Prospekta. Tugas Anda membantu operasional bisnis dalam penelusuran lokasi, analisis potensi digital, penyusunan draf proposal kemitraan, dan perancangan website profesional.',
        '# Profil Perusahaan Prospekta\nProspekta adalah platform otomasi intelijen bisnis terintegrasi yang berfokus pada 4 pilar: Manajemen Akun & Hak Akses, Penelusuran Lokasi & Audit Bisnis, Pembuatan Dokumen Proposal & PDF Resmi, serta Perancangan Prototype Website Interaktif.',
        'gemini-2.0-flash-lite'
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // 4. user_mcp_email_connectors (Koneksi email via MCP opsional)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_mcp_email_connectors (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('smtp', 'gmail_oauth')),
        email_address TEXT NOT NULL,
        smtp_host TEXT,
        smtp_port INTEGER DEFAULT 587,
        credentials_enc TEXT NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 5. pdf_documents (Arsip proposal & dokumen PDF)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pdf_documents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        place_id TEXT,
        title TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        public_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 6. mcp_audit_logs (Audit log eksekusi tool MCP)
    await client.query(`
      CREATE TABLE IF NOT EXISTS mcp_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        role TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 7. places (Lokasi & Prospek Bisnis)
    await client.query(`
      CREATE TABLE IF NOT EXISTS places (
        overture_id TEXT PRIMARY KEY,
        anchor TEXT NOT NULL,
        name TEXT NOT NULL,
        category_raw TEXT,
        bidang_usaha TEXT,
        address TEXT,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        distance_m INTEGER NOT NULL,
        phone TEXT,
        website TEXT,
        email TEXT,
        email_source TEXT,
        enrich_status TEXT DEFAULT 'pending',
        confidence DOUBLE PRECISION DEFAULT 0,
        source TEXT DEFAULT 'overture',
        scraped_at TEXT NOT NULL,
        whatsapp TEXT,
        contact_name TEXT,
        contact_role TEXT,
        icp_score INTEGER DEFAULT 25,
        website_condition TEXT DEFAULT 'unknown',
        reach_status TEXT DEFAULT 'new',
        outreach_count INTEGER DEFAULT 0,
        last_outreach_at TEXT,
        tenant_id TEXT,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 8. scans (Riwayat scanning lokasi)
    await client.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        anchor TEXT NOT NULL,
        radius_km DOUBLE PRECISION NOT NULL,
        tiles_total INTEGER NOT NULL DEFAULT 1,
        tiles_done INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        created_at TEXT NOT NULL,
        tenant_id TEXT,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 9. anchors (Titik koordinat penelusuran lokasi)
    await client.query(`
      CREATE TABLE IF NOT EXISTS anchors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        radius_default_km DOUBLE PRECISION NOT NULL DEFAULT 2,
        tenant_id TEXT,
        created_at TEXT,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 10. category_rules
    await client.query(`
      CREATE TABLE IF NOT EXISTS category_rules (
        id SERIAL PRIMARY KEY,
        category_key TEXT UNIQUE NOT NULL,
        bidang_usaha TEXT NOT NULL
      );
    `);

    // 11. analyses
    await client.query(`
      CREATE TABLE IF NOT EXISTS analyses (
        place_id TEXT PRIMARY KEY,
        summary TEXT,
        products TEXT,
        pain_points TEXT,
        proposal_angle TEXT,
        recommended_features TEXT,
        email_draft TEXT,
        created_at TEXT NOT NULL,
        tenant_id TEXT,
        google_place TEXT
      );
    `);

    // 12. prebuilt_websites (Prototype website interaktif /p/[slug])
    await client.query(`
      CREATE TABLE IF NOT EXISTS prebuilt_websites (
        id SERIAL PRIMARY KEY,
        place_id TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        industry TEXT,
        phone TEXT,
        email TEXT,
        google_rating DOUBLE PRECISION DEFAULT 4.8,
        reviews_count INTEGER DEFAULT 14,
        google_reviews_json TEXT,
        services_json TEXT,
        hero_headline TEXT,
        hero_subheadline TEXT,
        screenshot_url TEXT,
        status TEXT DEFAULT 'draft',
        views_count INTEGER DEFAULT 0,
        last_viewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // 13. rate_limits
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        hits INTEGER DEFAULT 1,
        reset_at BIGINT NOT NULL
      );
    `);

    await client.query('COMMIT');
    console.log('✓ Seluruh skema tabel Prospekta (RBAC & Universal MCP) di Neon berhasil dibuat!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Gagal migrasi skema:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
