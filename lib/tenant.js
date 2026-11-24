import { scrypt, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { promisify } from 'node:util';
import { dbWrite } from './db.js';
import { geocodeAddress, haversineDistance } from './geo.js';
import { fetchOverturePlaces } from './overture.js';

const scryptAsync = promisify(scrypt);

export const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525]);

export const PLAN_LIMITS = {
  trial: { ai: 30, enrich: 50, daily_email: 20 },
  starter: { ai: 150, enrich: 200, daily_email: 30 },
  pro: { ai: 500, enrich: 500, daily_email: 50 },
  enterprise: { ai: 2000, enrich: 2000, daily_email: 100 },
};

let schemaReady;
export function ensureTenantSchema() {
  schemaReady ||= (async () => {
    // Fast-path: jika schema database sudah ada (cek tabel tenants), lewati seluruh eksekusi DDL migrasi
    try {
      const { rows } = await dbWrite.execute('SELECT 1 FROM tenants LIMIT 1');
      if (rows) return;
    } catch (_) {}

    await dbWrite.batch([
      `CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY, company_name TEXT NOT NULL, address TEXT,
        latitude REAL, longitude REAL, status TEXT NOT NULL DEFAULT 'trial', created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id), email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
        must_change_password INTEGER NOT NULL DEFAULT 1, email_verified INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS auth_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_auth_codes_email ON auth_codes(email, purpose)`,
      `CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
        smtp_host TEXT, smtp_port INTEGER, smtp_user TEXT, smtp_pass_enc TEXT, smtp_from TEXT,
        telegram_bot_token_enc TEXT, telegram_chat_id TEXT,
        calendly_url TEXT, llm_key_enc TEXT, daily_quota INTEGER NOT NULL DEFAULT 20)`,
      `CREATE TABLE IF NOT EXISTS anchors (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL,
        lat REAL NOT NULL, lng REAL NOT NULL, radius_default_km REAL NOT NULL DEFAULT 2,
        tenant_id TEXT, created_at TEXT, owner_user_id TEXT)`,
      `CREATE TABLE IF NOT EXISTS places (
        overture_id TEXT PRIMARY KEY, anchor TEXT NOT NULL, name TEXT NOT NULL, category_raw TEXT,
        bidang_usaha TEXT, address TEXT, lat REAL NOT NULL, lng REAL NOT NULL, distance_m INTEGER NOT NULL,
        phone TEXT, website TEXT, email TEXT, all_emails TEXT, email_source TEXT, enrich_status TEXT DEFAULT 'pending',
        confidence REAL DEFAULT 0, source TEXT DEFAULT 'overture', scraped_at TEXT NOT NULL,
        whatsapp TEXT, contact_name TEXT, contact_role TEXT, pic_name TEXT, pic_title TEXT, assigned_pic TEXT,
        is_personal_lead INTEGER DEFAULT 0, icp_score INTEGER DEFAULT 25,
        social_media TEXT, problem_analysis TEXT, sg_notes TEXT, offer_angle TEXT, budget_capacity TEXT,
        social_condition TEXT, lead_verified_at TEXT,
        website_condition TEXT DEFAULT 'unknown', reach_status TEXT DEFAULT 'new', outreach_count INTEGER DEFAULT 0,
        last_outreach_at TEXT, tenant_id TEXT, owner_user_id TEXT)`,
      `CREATE TABLE IF NOT EXISTS usage_counters (
        id TEXT PRIMARY KEY, date TEXT, type TEXT, count INTEGER DEFAULT 0, tenant_id TEXT)`,
      `CREATE TABLE IF NOT EXISTS analyses (
        id TEXT, place_id TEXT PRIMARY KEY, version INTEGER DEFAULT 1, summary TEXT, products TEXT,
        needs TEXT, use_cases TEXT, unknowns TEXT, source_url TEXT, raw_text TEXT,
        crawled_pages TEXT, search_intelligence TEXT, google_place TEXT, key_people TEXT,
        created_by TEXT, tenant_id TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS use_cases (
        id TEXT PRIMARY KEY, vertical TEXT, title TEXT, description TEXT)`,
      `CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY, place_id TEXT, title TEXT, executive_summary TEXT, solution TEXT,
        custom_offering TEXT, pdf_url TEXT, status TEXT DEFAULT 'draft', tenant_id TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS prebuilt_websites (
        id INTEGER PRIMARY KEY AUTOINCREMENT, place_id TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL, industry TEXT, phone TEXT, email TEXT, google_rating REAL DEFAULT 4.8,
        reviews_count INTEGER DEFAULT 14, hero_headline TEXT, hero_subheadline TEXT, status TEXT DEFAULT 'draft',
        views_count INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT, owner_user_id TEXT)`,
      `CREATE TABLE IF NOT EXISTS mcp_tokens (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, token_prefix TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT, last_used_at TEXT, revoked_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY, anchor TEXT NOT NULL, radius_km REAL NOT NULL,
        tiles_total INTEGER NOT NULL DEFAULT 1, tiles_done INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running', created_at TEXT NOT NULL, tenant_id TEXT, owner_user_id TEXT)`,
      `CREATE TABLE IF NOT EXISTS category_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT, category_key TEXT UNIQUE NOT NULL, bidang_usaha TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS agent_profiles (
        id TEXT PRIMARY KEY DEFAULT 'company_default', company_name TEXT NOT NULL DEFAULT 'Prospekta',
        system_prompt TEXT NOT NULL, knowledge_markdown TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT 'gemini-2.0-flash-lite',
        temperature REAL NOT NULL DEFAULT 0.2, updated_by TEXT, updated_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS pdf_documents (
        id TEXT PRIMARY KEY, user_id TEXT, place_id TEXT, title TEXT NOT NULL, storage_key TEXT,
        public_url TEXT, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS mcp_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, role TEXT NOT NULL, endpoint TEXT NOT NULL,
        tool_name TEXT NOT NULL, status TEXT NOT NULL, duration_ms INTEGER, created_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS places_status_overlay (
        place_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'new', notes TEXT,
        tenant_id TEXT, updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sg_outreach_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, place_id TEXT, email TEXT,
        status TEXT, tenant_id TEXT, sent_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS business_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, place_id TEXT NOT NULL, note TEXT NOT NULL,
        tenant_id TEXT, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sync_history (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, target TEXT NOT NULL,
        total_scanned INTEGER NOT NULL DEFAULT 0, new_places_added INTEGER NOT NULL DEFAULT 0,
        duplicates_prevented INTEGER NOT NULL DEFAULT 0, total_places_now INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'success', details TEXT, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS sg_bounced_emails (
        id TEXT PRIMARY KEY, recipient_email TEXT UNIQUE NOT NULL, company_name TEXT,
        place_id TEXT, subject TEXT, bounce_reason TEXT, detected_at TEXT NOT NULL, source TEXT)`
    ]);

    // Seed default anchors jika tabel anchors masih kosong
    try {
      const { rows } = await dbWrite.execute('SELECT COUNT(*) as count FROM anchors');
      const count = Number(rows?.[0]?.count || 0);
      if (count === 0) {
        await dbWrite.batch([
          {
            sql: `INSERT OR IGNORE INTO anchors (id, name, address, city, lat, lng, radius_default_km, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['prospekta_jkt', 'Headquarters Jakarta', 'Jl. Jend. Sudirman Kav. 52-53, Senayan', 'Jakarta', -6.2256, 106.8041, 2, '2026-01-01T00:00:00.000Z']
          },
          {
            sql: `INSERT OR IGNORE INTO anchors (id, name, address, city, lat, lng, radius_default_km, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['prospekta_sg', 'Singapore Central', '1 Raffles Place, One Raffles Place Tower 1', 'Singapore', 1.2840, 103.8510, 2, '2026-01-01T00:00:00.000Z']
          },
          {
            sql: `INSERT OR IGNORE INTO anchors (id, name, address, city, lat, lng, radius_default_km, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ['academy_surabaya', 'Hub Surabaya', 'Jl. Pemuda No. 33-37, Embong Kaliasin', 'Surabaya', -7.2657, 112.7483, 2, '2026-01-01T00:00:00.000Z']
          }
        ]);
      }
    } catch (_) {}
    const alterStmts = [
      'ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT "trial"',
      'ALTER TABLE tenants ADD COLUMN monthly_ai_limit INTEGER NOT NULL DEFAULT 30',
      'ALTER TABLE tenants ADD COLUMN monthly_enrich_limit INTEGER NOT NULL DEFAULT 50',
      'ALTER TABLE anchors ADD COLUMN tenant_id TEXT',
      'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1',
      'ALTER TABLE proposals ADD COLUMN tenant_id TEXT',
      'ALTER TABLE sg_outreach_logs ADD COLUMN tenant_id TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN tenant_id TEXT',
      'ALTER TABLE usage_counters ADD COLUMN tenant_id TEXT',
      'ALTER TABLE usage_counters ADD COLUMN date TEXT',
      'ALTER TABLE usage_counters ADD COLUMN type TEXT',
      'ALTER TABLE places ADD COLUMN all_emails TEXT',
      'ALTER TABLE places ADD COLUMN social_media TEXT',
      'ALTER TABLE places ADD COLUMN problem_analysis TEXT',
      'ALTER TABLE places ADD COLUMN sg_notes TEXT',
      'ALTER TABLE places ADD COLUMN pic_name TEXT',
      'ALTER TABLE places ADD COLUMN pic_title TEXT',
      'ALTER TABLE places ADD COLUMN assigned_pic TEXT',
      'ALTER TABLE places ADD COLUMN is_personal_lead INTEGER DEFAULT 0',
      'ALTER TABLE places ADD COLUMN offer_angle TEXT',
      'ALTER TABLE places ADD COLUMN budget_capacity TEXT',
      'ALTER TABLE places ADD COLUMN social_condition TEXT',
      'ALTER TABLE places ADD COLUMN lead_verified_at TEXT',
      'ALTER TABLE places ADD COLUMN contact_verified INTEGER DEFAULT 0',
      'ALTER TABLE places ADD COLUMN linkedin_url TEXT',
      'ALTER TABLE places ADD COLUMN pic_linkedin_url TEXT',
      'ALTER TABLE places ADD COLUMN notes TEXT',
      'ALTER TABLE places ADD COLUMN google_rating REAL DEFAULT 4.8',
      'ALTER TABLE places ADD COLUMN reviews_count INTEGER DEFAULT 14',
      'ALTER TABLE places ADD COLUMN has_prebuilt_site INTEGER DEFAULT 0',
      'ALTER TABLE places ADD COLUMN prebuilt_slug TEXT',
      'ALTER TABLE places ADD COLUMN prebuilt_created_at TEXT',
      'ALTER TABLE places ADD COLUMN last_outreach_at TEXT',
      'ALTER TABLE places ADD COLUMN outreach_count INTEGER DEFAULT 0',
      'ALTER TABLE prebuilt_websites ADD COLUMN category TEXT',
      'ALTER TABLE prebuilt_websites ADD COLUMN tenant_id TEXT',
      'ALTER TABLE prebuilt_websites ADD COLUMN google_reviews_json TEXT',
      'ALTER TABLE prebuilt_websites ADD COLUMN services_json TEXT',
      'ALTER TABLE places ADD COLUMN key_people TEXT',
      'ALTER TABLE places ADD COLUMN phone_secondary TEXT',
      'ALTER TABLE places ADD COLUMN all_phones TEXT',
      'ALTER TABLE places ADD COLUMN budget_notes TEXT',
      'ALTER TABLE analyses ADD COLUMN raw_text TEXT',
      'ALTER TABLE analyses ADD COLUMN search_intelligence TEXT',
      'ALTER TABLE analyses ADD COLUMN needs TEXT',
      'ALTER TABLE analyses ADD COLUMN id TEXT',
      'ALTER TABLE analyses ADD COLUMN version INTEGER DEFAULT 1',
      'ALTER TABLE analyses ADD COLUMN use_cases TEXT',
      'ALTER TABLE analyses ADD COLUMN unknowns TEXT',
      'ALTER TABLE analyses ADD COLUMN source_url TEXT',
      'ALTER TABLE analyses ADD COLUMN crawled_pages TEXT',
      'ALTER TABLE analyses ADD COLUMN key_people TEXT',
      'ALTER TABLE analyses ADD COLUMN created_by TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN reach_status TEXT DEFAULT "new"',
      'ALTER TABLE places_status_overlay ADD COLUMN has_prebuilt_site INTEGER DEFAULT 0',
      'ALTER TABLE places_status_overlay ADD COLUMN prebuilt_slug TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN prebuilt_created_at TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN assigned_pic TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN last_outreach_at TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN pic_name TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN pic_title TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN notes TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN sg_notes TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN is_personal_lead INTEGER DEFAULT 0',
      'ALTER TABLE places_status_overlay ADD COLUMN lead_verified_at TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN budget_capacity TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN budget_notes TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN website_condition TEXT DEFAULT "unknown"',
      'ALTER TABLE places_status_overlay ADD COLUMN social_condition TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN offer_angle TEXT',
      'ALTER TABLE places_status_overlay ADD COLUMN contact_verified INTEGER DEFAULT 0',
      'ALTER TABLE sg_outreach_logs ADD COLUMN sent_date TEXT',
      'ALTER TABLE sg_outreach_logs ADD COLUMN created_at TEXT',
      'ALTER TABLE sg_outreach_logs ADD COLUMN followup_count INTEGER DEFAULT 0',
      'ALTER TABLE proposals ADD COLUMN analysis_id TEXT',
      'ALTER TABLE proposals ADD COLUMN content TEXT',
      'ALTER TABLE token_usage_logs ADD COLUMN module TEXT DEFAULT "llm"',
      'ALTER TABLE proposals ADD COLUMN version INTEGER DEFAULT 1',
      'ALTER TABLE proposals ADD COLUMN updated_at TEXT',
      'ALTER TABLE business_notes ADD COLUMN tenant_id TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN company_offering TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN target_audience TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN target_categories TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN default_radius_km INTEGER DEFAULT 2',
      'ALTER TABLE tenant_settings ADD COLUMN email_language TEXT DEFAULT "auto"',
      'ALTER TABLE tenant_settings ADD COLUMN feat_auto_outreach INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tenant_settings ADD COLUMN feat_prebuilt_site INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tenant_settings ADD COLUMN feat_ai_proposal INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tenant_settings ADD COLUMN feat_auto_followup INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tenant_settings ADD COLUMN feat_telegram_alerts INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tenant_settings ADD COLUMN feat_auto_discovery INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tenant_settings ADD COLUMN custom_ai_prompt TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN custom_cta TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN email_template_subject TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN email_template_body TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN email_provider_mode TEXT NOT NULL DEFAULT "smtp"',
      'ALTER TABLE tenant_settings ADD COLUMN gmail_mcp_account TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN gmail_mcp_connected INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE tenant_settings ADD COLUMN company_urls TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN crawl_domains TEXT',
      'ALTER TABLE tenant_settings ADD COLUMN crawl_scope TEXT'
    ];
    for (let i = 0; i < alterStmts.length; i += 15) {
      await Promise.all(alterStmts.slice(i, i + 15).map((sql) => dbWrite.execute(sql).catch(() => {})));
    }
    await dbWrite.execute(`
      INSERT INTO tenants (id, company_name, status, created_at, plan, monthly_ai_limit, monthly_enrich_limit)
      VALUES ('tnt_master', 'Prospekta', 'active', '2026-01-01T00:00:00.000Z', 'enterprise', 99999, 99999)
      ON CONFLICT(id) DO NOTHING
    `).catch(() => {});
    // Auto-backfill skor ICP dipindahkan ke script manual agar tidak membebani query runtime
    await seedSuperadmin();
  })().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}

export async function seedSuperadmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@prospekta.id').trim().toLowerCase();
  const pw = (process.env.ADMIN_PASSWORD || 'prospepkta2026!').trim();
  if (!email || !pw) return;
  const hash = await hashPassword(pw);
  const now = new Date().toISOString();
  try {
    const { rows } = await dbWrite.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
    if (rows && rows.length > 0) {
      await dbWrite.execute({
        sql: 'UPDATE users SET password_hash = ?, role = ? WHERE email = ?',
        args: [hash, 'admin', email]
      });
      return;
    }
    await dbWrite.execute({
      sql: `INSERT INTO users (id, tenant_id, email, password_hash, role, must_change_password, email_verified, created_at)
            VALUES ('usr_admin', 'tnt_master', ?, ?, 'admin', 0, 1, ?)`,
      args: [email, hash, now],
    });
  } catch (_) { }
}

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [salt, key] = (stored || '').split(':');
  if (!salt || !key) return false;
  const derived = await scryptAsync(pw, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(derived, Buffer.from(key, 'hex'));
}

export function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function encKey() {
  const secret = process.env.SETTINGS_ENC_KEY;
  if (!secret || secret.length < 16) {
    throw Object.assign(new Error('SETTINGS_ENC_KEY belum dikonfigurasi di environment server (minimal 16 karakter).'), { status: 500 });
  }
  return createHash('sha256').update(secret).digest();
}

export function encrypt(plain) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob) {
  if (!blob) return null;
  try {
    const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = createDecipheriv('aes-256-gcm', encKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch (err) {
    console.warn('[tenant.decrypt] Gagal mendekripsi rahasia tenant:', err.message);
    return null;
  }
}

/** Cek apakah alamat IP berada di rentang privat/loopback/link-local (pencegahan SSRF). */
export function isPrivateIp(rawIp) {
  const ip = String(rawIp || '').trim().toLowerCase().replace(/^::ffff:/, '');
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] >= 224) return true;
    return false;
  }
  if (version === 6) {
    return ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
  }
  return true;
}

/** Validasi hostname SMTP agar tidak mengarah ke jaringan lokal atau metadata cloud. */
export async function assertSafeSmtpHost(rawHost) {
  const host = String(rawHost || '').trim().toLowerCase();
  if (!host) throw Object.assign(new Error('SMTP Host wajib diisi.'), { status: 400 });
  if (/[\s/@:]/.test(host) || host.length > 253) {
    throw Object.assign(new Error('Format SMTP Host tidak valid. Masukkan domain server saja (misal: smtp.gmail.com).'), { status: 400 });
  }
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa')
  ) {
    throw Object.assign(new Error('SMTP Host lokal atau internal tidak diizinkan.'), { status: 400 });
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw Object.assign(new Error('Alamat IP privat/internal tidak diizinkan sebagai SMTP Host.'), { status: 400 });
    }
    return host;
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
    throw Object.assign(new Error('Format domain SMTP Host tidak valid.'), { status: 400 });
  }
  try {
    const records = await lookup(host, { all: true });
    if (!records.length || records.some((r) => isPrivateIp(r.address))) {
      throw Object.assign(new Error('SMTP Host mengarah ke jaringan privat dan ditolak demi keamanan.'), { status: 400 });
    }
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error(`Domain SMTP Host "${host}" tidak dapat diresolusi DNS.`), { status: 400 });
  }
  return host;
}

export function validateCalendlyUrl(rawUrl) {
  const v = String(rawUrl || '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:') {
      throw Object.assign(new Error('Link jadwal meeting harus menggunakan protokol https://.'), { status: 400 });
    }
    return u.toString();
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error('Format link jadwal meeting tidak valid.'), { status: 400 });
  }
}

/** Token bertanda tangan HMAC (berlaku 15 menit) untuk tautan 1-klik Telegram resmi Prospekta. */
export function createTelegramLinkToken(tenantId) {
  if (!tenantId) throw new Error('tenantId wajib diisi.');
  const exp36 = Math.floor((Date.now() + 15 * 60 * 1000) / 1000).toString(36);
  const sig = createHmac('sha256', encKey())
    .update(`tg:${tenantId}:${exp36}`)
    .digest('base64url')
    .slice(0, 22);
  return `link_${tenantId}_${exp36}_${sig}`;
}

export function verifyTelegramLinkToken(token) {
  const m = String(token || '').trim().match(/^link_(tnt_[a-f0-9]+)_([a-z0-9]+)_([A-Za-z0-9_-]{22})$/);
  if (!m) return null;
  const [, tenantId, exp36, sig] = m;
  const expSec = parseInt(exp36, 36);
  if (!expSec || expSec * 1000 < Date.now()) return null;
  const expected = createHmac('sha256', encKey())
    .update(`tg:${tenantId}:${exp36}`)
    .digest('base64url')
    .slice(0, 22);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return tenantId;
}

const SECRET_FIELDS = { smtp_pass: 'smtp_pass_enc', telegram_bot_token: 'telegram_bot_token_enc', llm_key: 'llm_key_enc' };
const PLAIN_FIELDS = [
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'telegram_chat_id', 'calendly_url',
  'company_offering', 'target_audience', 'target_categories', 'default_radius_km', 'email_language',
  'feat_auto_outreach', 'feat_prebuilt_site', 'feat_ai_proposal', 'feat_auto_followup', 'feat_telegram_alerts', 'feat_auto_discovery',
  'custom_ai_prompt', 'custom_cta', 'email_template_subject', 'email_template_body',
  'daily_quota',
  'email_provider_mode', 'gmail_mcp_account', 'gmail_mcp_connected',
  'company_urls', 'crawl_domains', 'crawl_scope'
];

/** Setting terdekripsi untuk pemakaian server. */
export async function getSettings(tenantId) {
  if (!tenantId) return null;
  await ensureTenantSchema();
  const [sRes, tRes] = await Promise.all([
    dbWrite.execute({ sql: 'SELECT * FROM tenant_settings WHERE tenant_id = ?', args: [tenantId] }),
    dbWrite.execute({ sql: 'SELECT company_name FROM tenants WHERE id = ? LIMIT 1', args: [tenantId] }).catch(() => ({ rows: [] }))
  ]);
  const r = sRes.rows[0];
  if (!r) return null;
  return {
    ...Object.fromEntries(PLAIN_FIELDS.map((k) => [k, r[k]])),
    ...Object.fromEntries(Object.entries(SECRET_FIELDS).map(([k, col]) => [k, decrypt(r[col])])),
    company_name: tRes?.rows?.[0]?.company_name || (tenantId === 'tnt_master' ? 'Prospekta' : ''),
    default_radius_km: r.default_radius_km || 2,
    feat_auto_outreach: r.feat_auto_outreach !== undefined && r.feat_auto_outreach !== null ? Number(r.feat_auto_outreach) : 0,
    feat_prebuilt_site: r.feat_prebuilt_site !== undefined && r.feat_prebuilt_site !== null ? Number(r.feat_prebuilt_site) : 0,
    feat_ai_proposal: r.feat_ai_proposal !== undefined && r.feat_ai_proposal !== null ? Number(r.feat_ai_proposal) : 0,
    feat_auto_followup: r.feat_auto_followup !== undefined && r.feat_auto_followup !== null ? Number(r.feat_auto_followup) : 0,
    feat_telegram_alerts: r.feat_telegram_alerts !== undefined && r.feat_telegram_alerts !== null ? Number(r.feat_telegram_alerts) : 0,
    feat_auto_discovery: r.feat_auto_discovery !== undefined && r.feat_auto_discovery !== null ? Number(r.feat_auto_discovery) : 0,
    daily_quota: r.daily_quota || 20,
  };
}

/** Ringkasan kuota & paket bulanan untuk dashboard klien. */
export async function getTenantUsage(tenantId) {
  if (!tenantId) return null;
  await ensureTenantSchema();
  const monthKey = new Date().toISOString().slice(0, 7);
  const aiId = `quota_${tenantId}_ai_${monthKey}`;
  const enrichId = `quota_${tenantId}_enrich_${monthKey}`;
  const [tRes, uRes] = await Promise.all([
    dbWrite.execute({
      sql: 'SELECT plan, monthly_ai_limit, monthly_enrich_limit FROM tenants WHERE id = ?',
      args: [tenantId],
    }),
    dbWrite.execute({
      sql: 'SELECT id, count FROM usage_counters WHERE id IN (?, ?)',
      args: [aiId, enrichId],
    }),
  ]);
  const t = tRes.rows?.[0] || {};
  const plan = t.plan || 'trial';
  const defaults = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
  const counts = Object.fromEntries((uRes.rows || []).map((r) => [r.id, Number(r.count || 0)]));
  return {
    plan,
    month: monthKey,
    ai_used: counts[aiId] || 0,
    ai_limit: Number(t.monthly_ai_limit || defaults.ai),
    enrich_used: counts[enrichId] || 0,
    enrich_limit: Number(t.monthly_enrich_limit || defaults.enrich),
    max_daily_email: defaults.daily_email,
  };
}

/** Cek dan catat konsumsi kuota bulanan tenant (AI / Enrich) secara atomik tahan race condition. */
export async function consumeTenantQuota(tenantId, kind = 'ai') {
  if (!tenantId) return { allowed: true, unlimited: true };
  await ensureTenantSchema();

  if (kind === 'ai') {
    const s = await getSettings(tenantId);
    if (s?.llm_key) return { allowed: true, byok: true };
  }

  const usage = await getTenantUsage(tenantId);
  const used = kind === 'enrich' ? usage.enrich_used : usage.ai_used;
  const limit = kind === 'enrich' ? usage.enrich_limit : usage.ai_limit;

  const monthKey = usage.month;
  const counterId = `quota_${tenantId}_${kind}_${monthKey}`;

  // Atomic insert & conditional increment: mencegah race condition & double-spending
  await dbWrite.execute({
    sql: `INSERT INTO usage_counters (id, date, type, count, tenant_id) VALUES (?, ?, ?, 0, ?)
          ON CONFLICT(id) DO NOTHING`,
    args: [counterId, monthKey, `tenant_${kind}`, tenantId],
  });

  const updateRes = await dbWrite.execute({
    sql: `UPDATE usage_counters SET count = count + 1 WHERE id = ? AND count < ?`,
    args: [counterId, limit],
  });

  if (!updateRes.rowsAffected) {
    const label = kind === 'enrich' ? 'riset/enrich kontak' : 'generasi AI';
    const hint = kind === 'ai'
      ? ' Upgrade paket atau tambahkan API Key pribadi (BYOK) di menu Pengaturan.'
      : ' Upgrade paket langganan Anda untuk kuota lebih besar.';
    throw Object.assign(
      new Error(`Kuota bulanan ${label} paket ${usage.plan} telah tercapai (${limit}/${limit}).${hint}`),
      { status: 429 }
    );
  }

  return { allowed: true, used: used + 1, limit, plan: usage.plan };
}

/** Status aktif/nonaktif cronjob otomatis (bekerja untuk tenant maupun superadmin Prospekta). */
export async function getCronFlags(tenantId = null) {
  await ensureTenantSchema();
  if (tenantId) {
    const s = await getSettings(tenantId);
    return {
      feat_auto_outreach: s?.feat_auto_outreach === 1 ? 1 : 0,
      feat_auto_followup: s?.feat_auto_followup === 1 ? 1 : 0,
      smtp_configured: Boolean(s?.smtp_host && s?.smtp_pass && (s?.smtp_user || s?.smtp_from)),
    };
  }
  const { rows } = await dbWrite.execute({
    sql: `SELECT id, count FROM usage_counters WHERE id IN ('system_cron_auto_outreach', 'system_cron_auto_followup')`,
    args: [],
  });
  const map = Object.fromEntries((rows || []).map((r) => [r.id, Number(r.count)]));
  return {
    feat_auto_outreach: 'system_cron_auto_outreach' in map ? (map.system_cron_auto_outreach ? 1 : 0) : 1,
    feat_auto_followup: 'system_cron_auto_followup' in map ? (map.system_cron_auto_followup ? 1 : 0) : 1,
    smtp_configured: Boolean(process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD),
  };
}

export async function setCronFlags(tenantId = null, flags = {}) {
  await ensureTenantSchema();
  const patch = {};
  if ('feat_auto_outreach' in flags) patch.feat_auto_outreach = Number(flags.feat_auto_outreach) ? 1 : 0;
  if ('feat_auto_followup' in flags) patch.feat_auto_followup = Number(flags.feat_auto_followup) ? 1 : 0;
  if (!Object.keys(patch).length) return getCronFlags(tenantId);

  if (tenantId) {
    await saveSettings(tenantId, patch);
    return getCronFlags(tenantId);
  }

  const today = new Date().toISOString().slice(0, 10);
  const stmts = [];
  if ('feat_auto_outreach' in patch) {
    stmts.push({
      sql: `INSERT INTO usage_counters (id, date, type, count) VALUES ('system_cron_auto_outreach', ?, 'system_flag', ?)
            ON CONFLICT(id) DO UPDATE SET date = excluded.date, count = excluded.count`,
      args: [today, patch.feat_auto_outreach],
    });
  }
  if ('feat_auto_followup' in patch) {
    stmts.push({
      sql: `INSERT INTO usage_counters (id, date, type, count) VALUES ('system_cron_auto_followup', ?, 'system_flag', ?)
            ON CONFLICT(id) DO UPDATE SET date = excluded.date, count = excluded.count`,
      args: [today, patch.feat_auto_followup],
    });
  }
  if (stmts.length) await dbWrite.batch(stmts, 'write');
  return getCronFlags(null);
}

/** Versi aman untuk browser: rahasia hanya berupa flag "sudah diisi". */
export async function getPublicSettings(tenantId) {
  const [s, usage, tRes] = await Promise.all([
    getSettings(tenantId).then((v) => v || {}),
    getTenantUsage(tenantId),
    dbWrite.execute({ sql: 'SELECT company_name FROM tenants WHERE id = ? LIMIT 1', args: [tenantId] }).catch(() => ({ rows: [] })),
  ]);
  const out = {};
  for (const k of PLAIN_FIELDS) out[k] = s[k] ?? '';
  for (const k of Object.keys(SECRET_FIELDS)) out[`${k}_set`] = Boolean(s[k]);
  out.company_name = tRes?.rows?.[0]?.company_name || '';
  out.email_provider_mode = s.email_provider_mode || 'smtp';
  out.gmail_mcp_account = s.gmail_mcp_account || '';
  out.gmail_mcp_connected = Number(s.gmail_mcp_connected || 0);
  out.default_radius_km = s.default_radius_km || 2;
  out.feat_auto_outreach = s.feat_auto_outreach !== undefined && s.feat_auto_outreach !== null ? Number(s.feat_auto_outreach) : 0;
  out.feat_prebuilt_site = s.feat_prebuilt_site !== undefined && s.feat_prebuilt_site !== null ? Number(s.feat_prebuilt_site) : 0;
  out.feat_ai_proposal = s.feat_ai_proposal !== undefined && s.feat_ai_proposal !== null ? Number(s.feat_ai_proposal) : 0;
  out.feat_auto_followup = s.feat_auto_followup !== undefined && s.feat_auto_followup !== null ? Number(s.feat_auto_followup) : 0;
  out.feat_telegram_alerts = s.feat_telegram_alerts !== undefined && s.feat_telegram_alerts !== null ? Number(s.feat_telegram_alerts) : 0;
  out.feat_auto_discovery = s.feat_auto_discovery !== undefined && s.feat_auto_discovery !== null ? Number(s.feat_auto_discovery) : 0;
  out.daily_quota = s.daily_quota || 20;
  out.usage = usage;

  if (tenantId === 'tnt_master') {
    if (!out.company_name) out.company_name = 'Prospekta';
    if (!out.company_offering) out.company_offering = 'Program pelatihan industri (bootcamp), sertifikasi talenta digital, dan penyaluran kerja IT terintegrasi untuk universitas & perusahaan.';
    if (!out.target_audience) out.target_audience = 'Pimpinan Perusahaan (CEO / HRD / CTO), Dekan / Kaprodi Universitas, dan Manajer Bisnis';
    if (!out.company_urls) {
      out.company_urls = JSON.stringify([
        { id: 'url_1', label: 'Website Resmi Prospekta', url: 'https://prospekta.id', selected: true },
        { id: 'url_2', label: 'Katalog Solusi & Layanan', url: 'https://prospekta.id/solutions', selected: true },
        { id: 'url_3', label: 'Prospekta Hub', url: 'https://prospekta.id', selected: false }
      ]);
    }
    if (!out.crawl_domains) out.crawl_domains = 'prospekta.id';
    if (!out.crawl_scope) out.crawl_scope = 'subdomain';
    if (!out.email_provider_mode) out.email_provider_mode = 'smtp';
  }

  return out;
}

export async function saveSettings(tenantId, input) {
  await ensureTenantSchema();
  const clean = { ...input };

  if ('company_name' in clean && clean.company_name && typeof clean.company_name === 'string') {
    const trimmedCompany = clean.company_name.trim();
    if (trimmedCompany) {
      await dbWrite.execute({
        sql: 'UPDATE tenants SET company_name = ? WHERE id = ?',
        args: [trimmedCompany, tenantId],
      }).catch(() => {});
    }
  }

  if ('smtp_host' in clean && clean.smtp_host) {
    clean.smtp_host = await assertSafeSmtpHost(clean.smtp_host);
  }
  if ('smtp_port' in clean && clean.smtp_port !== '' && clean.smtp_port !== null) {
    const port = parseInt(clean.smtp_port, 10);
    if (!ALLOWED_SMTP_PORTS.has(port)) {
      throw Object.assign(new Error('Port SMTP tidak valid. Gunakan port 465, 587, 25, atau 2525.'), { status: 400 });
    }
    clean.smtp_port = port;
  }
  if ('calendly_url' in clean) {
    clean.calendly_url = validateCalendlyUrl(clean.calendly_url);
  }
  if ('daily_quota' in clean && clean.daily_quota !== '' && clean.daily_quota !== null) {
    const usage = await getTenantUsage(tenantId);
    const maxQuota = usage?.max_daily_email || 100;
    clean.daily_quota = Math.min(Math.max(parseInt(clean.daily_quota, 10) || 20, 1), maxQuota);
  }
  if ('default_radius_km' in clean && clean.default_radius_km !== '' && clean.default_radius_km !== null) {
    clean.default_radius_km = Math.min(Math.max(parseInt(clean.default_radius_km, 10) || 2, 1), 20);
  }

  const cols = [];
  const args = [];
  for (const k of PLAIN_FIELDS) {
    if (k in clean) {
      let val = clean[k] === '' ? null : clean[k];
      if (typeof val === 'string') {
        // Strip control characters dan script tags (OWASP Stored XSS defense)
        val = val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
      }
      cols.push(k);
      args.push(val);
    }
  }
  for (const [k, col] of Object.entries(SECRET_FIELDS)) {
    if (clean[`clear_${k}`]) {
      cols.push(col);
      args.push(null);
    } else if (clean[k]) {
      cols.push(col);
      args.push(encrypt(String(clean[k]).trim()));
    }
  }
  if (!cols.length) return;
  await dbWrite.execute({
    sql: `INSERT INTO tenant_settings (tenant_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})
          ON CONFLICT(tenant_id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(',')}`,
    args: [tenantId, ...args],
  });

  if ('default_radius_km' in clean && clean.default_radius_km) {
    const safeRadius = Math.min(Math.max(Number(clean.default_radius_km) || 2, 1), 20);
    await dbWrite.execute({
      sql: `UPDATE anchors SET radius_default_km = ? WHERE tenant_id = ?`,
      args: [safeRadius, tenantId]
    }).catch(() => {});
  }
}

/**
 * Membuat tenant + user + settings + anchor dalam satu batch.
 * Provisioning admin: password acak, langsung terverifikasi. Signup mandiri: password pilihan user, belum terverifikasi.
 */
export async function provisionTenant({ company_name, address, pic_email, latitude, longitude, password, verified = true }) {
  await ensureTenantSchema();
  const email = String(pic_email || '').trim().toLowerCase();
  const rawName = String(company_name || '').replace(/<[^>]*>/g, '').replace(/[\x00-\x1F]/g, '').trim();
  const rawAddr = String(address || '').replace(/<[^>]*>/g, '').replace(/[\x00-\x1F]/g, '').trim();
  if (!rawName || !rawAddr || !/^\S+@\S+\.\S+$/.test(email)) {
    throw Object.assign(new Error('Nama perusahaan, alamat, dan email valid wajib diisi.'), { status: 400 });
  }
  let lat = parseFloat(latitude);
  let lng = parseFloat(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    const hit = await geocodeAddress(rawAddr);
    if (!hit) throw Object.assign(new Error('Alamat tidak ditemukan. Perjelas alamat atau isi koordinat manual.'), { status: 422 });
    ({ lat, lng } = hit);
  }
  const exists = await dbWrite.execute({ sql: 'SELECT 1 FROM users WHERE email = ?', args: [email] });
  if (exists.rows.length) throw Object.assign(new Error('Email sudah terdaftar.'), { status: 409 });

  const dup = await dbWrite.execute({ sql: 'SELECT 1 FROM anchors WHERE name = ?', args: [rawName] });
  if (dup.rows.length) throw Object.assign(new Error('Nama perusahaan bentrok dengan titik yang sudah ada.'), { status: 409 });

  const tenantId = `tnt_${randomBytes(4).toString('hex')}`;
  const generated = !password;
  password ||= generatePassword();
  const now = new Date().toISOString();
  const name = rawName;
  await dbWrite.batch([
    { sql: 'INSERT INTO tenants (id, company_name, address, latitude, longitude, created_at) VALUES (?,?,?,?,?,?)', args: [tenantId, name, rawAddr, lat, lng, now] },
    { sql: 'INSERT INTO users (id, tenant_id, email, password_hash, role, must_change_password, email_verified, created_at) VALUES (?,?,?,?,?,?,?,?)', args: [`usr_${randomBytes(4).toString('hex')}`, tenantId, email, await hashPassword(password), 'user', generated ? 1 : 0, verified ? 1 : 0, now] },
    {
      sql: `INSERT INTO tenant_settings (
              tenant_id,
              feat_auto_outreach,
              feat_auto_followup,
              feat_auto_discovery,
              feat_prebuilt_site,
              feat_ai_proposal,
              feat_telegram_alerts
            ) VALUES (?, 0, 0, 0, 0, 0, 0)`,
      args: [tenantId]
    },
    { sql: 'INSERT INTO anchors (id, name, address, city, lat, lng, radius_default_km, tenant_id) VALUES (?,?,?,?,?,?,2,?)', args: [`custom_${tenantId}`, name, address.trim(), (address.split(',').slice(-2)[0] || name || 'City').trim(), lat, lng, tenantId] },
  ], 'write');

  // Auto-populate prospek bisnis di sekitar kantor baru agar peta langsung terisi
  try {
    const delta = 2.5 / 111.32;
    const initialPlaces = await fetchOverturePlaces(lng - delta, lat - delta, lng + delta, lat + delta);
    if (initialPlaces && initialPlaces.length > 0) {
      const initialInserts = initialPlaces.slice(0, 100).map((p) => {
        const dist = Math.round(haversineDistance(lat, lng, p.lat, p.lng));
        const cat = (p.category || 'commercial').toLowerCase();
        const isPriority = /clinic|medis|doctor|dent|hospital|law|consult|corporate|company|financial|industrial|engineering/.test(cat);
        const baselineIcp = (isPriority ? 25 : 15) + (p.phone ? 10 : 0) + (p.website ? 10 : 20);
        return {
          sql: `INSERT INTO places (overture_id, anchor, name, category_raw, bidang_usaha, address, lat, lng, distance_m, confidence, source, scraped_at, reach_status, icp_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'auto_discovery', ?, 'new', ?)
                ON CONFLICT(overture_id) DO NOTHING`,
          args: [
            p.id,
            name,
            p.name,
            p.category || 'commercial',
            'Bisnis & Layanan Komersial',
            p.address || `${name} Area`,
            p.lat,
            p.lng,
            dist,
            p.confidence || 0.85,
            now,
            baselineIcp
          ]
        };
      });
      await dbWrite.batch(initialInserts);
    }
  } catch (err) {
    console.warn('Initial auto-discovery warning:', err.message);
  }

  return { tenant_id: tenantId, company_name: name, office_coordinates: { lat, lng }, credentials: { email, temporary_password: password } };
}
