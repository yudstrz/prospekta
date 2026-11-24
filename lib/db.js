import { createClient } from '@libsql/client';
import { Pool } from '@neondatabase/serverless';

// 0. Neon Serverless PostgreSQL Configuration (Pengganti Turso)
const neonUrl = process.env.DATABASE_URL;
const isNeon = Boolean(neonUrl && (neonUrl.startsWith('postgres://') || neonUrl.startsWith('postgresql://')));

let neonPool = null;
if (isNeon) {
  neonPool = new Pool({ connectionString: neonUrl });
}

function convertSqliteToPg(sql) {
  let paramIndex = 1;
  let inString = false;
  let stringChar = '';
  let out = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inString) {
      out += c;
      if (c === stringChar) {
        if (sql[i + 1] === stringChar) {
          out += sql[++i];
        } else {
          inString = false;
        }
      }
    } else if (c === "'" || c === '"') {
      inString = true;
      stringChar = c;
      out += c;
    } else if (c === '?') {
      out += `$${paramIndex++}`;
    } else {
      out += c;
    }
  }
  return out
    .replace(/\bdatetime\('now'\)/gi, 'NOW()')
    .replace(/\bdate\('now'\)/gi, 'CURRENT_DATE');
}

async function neonExecute(stmt) {
  const sql = typeof stmt === 'string' ? stmt : stmt.sql;
  const rawArgs = typeof stmt === 'string' ? [] : (stmt.args || []);
  const args = Array.isArray(rawArgs) ? rawArgs : Object.values(rawArgs);
  const pgSql = convertSqliteToPg(sql);

  const res = await neonPool.query(pgSql, args);
  return {
    rows: res.rows || [],
    rowsAffected: res.rowCount || 0,
    columns: res.fields ? res.fields.map((f) => f.name) : [],
  };
}

async function neonBatch(stmts, mode) {
  const client = await neonPool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const stmt of stmts) {
      const sql = typeof stmt === 'string' ? stmt : stmt.sql;
      const rawArgs = typeof stmt === 'string' ? [] : (stmt.args || []);
      const args = Array.isArray(rawArgs) ? rawArgs : Object.values(rawArgs);
      const pgSql = convertSqliteToPg(sql);
      const res = await client.query(pgSql, args);
      results.push({
        rows: res.rows || [],
        rowsAffected: res.rowCount || 0,
      });
    }
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 1. Dual Database Configuration
// Primary Read / Catalog Database
const readUrl = process.env.TURSO_DATABASE_URL;
const readAuthToken = process.env.TURSO_AUTH_TOKEN;

// Secondary Write & Operational Database
const writeUrl = process.env.TURSO_WRITE_DATABASE_URL || readUrl;
const writeAuthToken = process.env.TURSO_WRITE_AUTH_TOKEN || readAuthToken;

// Primary Read Client (Tokyo Cluster / Catalog)
const rawDbRead = createClient({
  url: readUrl || 'file:local.db',
  authToken: readAuthToken || ''
});

// Primary Operational & Write Client (US-East Cluster)
const rawDbWrite = createClient({
  url: writeUrl || 'file:local.db',
  authToken: writeAuthToken || ''
});

async function safeWriteExecute(stmt) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await rawDbWrite.execute(stmt);
    } catch (err) {
      lastErr = err;
      const msg = (err.message || '').toLowerCase();
      const isTransient = msg.includes('other side closed') || msg.includes('und_err_socket') || msg.includes('socket');
      if (isTransient && attempt === 0) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function safeWriteBatch(stmts, mode) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await rawDbWrite.batch(stmts, mode);
    } catch (err) {
      lastErr = err;
      const msg = (err.message || '').toLowerCase();
      const isTransient = msg.includes('other side closed') || msg.includes('und_err_socket') || msg.includes('socket');
      if (isTransient && attempt === 0) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export const dbWrite = isNeon
  ? { execute: neonExecute, batch: neonBatch }
  : {
      execute: safeWriteExecute,
      batch: safeWriteBatch
    };

// Resilient Failover State
let isDbReadBlocked = false;
let lastBlockedCheck = 0;
const BLOCKED_RETRY_INTERVAL = 180000; // 3 menit interval pemeriksaan ulang

// Pre-flight non-blocking health check on startup to eliminate failover latency
if (!isNeon && readUrl && readUrl !== writeUrl) {
  rawDbRead.execute('SELECT 1;').catch((err) => {
    if (isBlockedError(err)) {
      console.warn(`[Dual-DB] Primary read database is currently BLOCKED (${err.message}). Instantly routing all queries to dbWrite.`);
      isDbReadBlocked = true;
      lastBlockedCheck = Date.now();
    }
  });
}

function isBlockedError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    code.includes('blocked') ||
    code.includes('unauthorized') ||
    code.includes('forbidden') ||
    code.includes('server_error') ||
    msg.includes('blocked') ||
    msg.includes('forbidden') ||
    msg.includes('unauthorized') ||
    msg.includes('read operations are forbidden') ||
    msg.includes('upgrade your plan') ||
    msg.includes('rate limit') ||
    msg.includes('401') ||
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout')
  );
}

async function executeWithFailover(stmt) {
  if (isDbReadBlocked) {
    if (Date.now() - lastBlockedCheck > BLOCKED_RETRY_INTERVAL) {
      lastBlockedCheck = Date.now();
      rawDbRead.execute('SELECT 1;').then(() => {
        console.log('[Dual-DB] Primary read database recovered. Resuming normal routing.');
        isDbReadBlocked = false;
      }).catch(() => {
        lastBlockedCheck = Date.now();
      });
    }
    return dbWrite.execute(stmt);
  }

  try {
    return await rawDbRead.execute(stmt);
  } catch (err) {
    if (isBlockedError(err)) {
      console.warn(`[Dual-DB Failover] Primary read blocked (${err.message}). Seamlessly routing to dbWrite.`);
      isDbReadBlocked = true;
      lastBlockedCheck = Date.now();
      return dbWrite.execute(stmt);
    }
    throw err;
  }
}

async function batchWithFailover(stmts, mode) {
  if (isDbReadBlocked) {
    return dbWrite.batch(stmts, mode);
  }
  try {
    return await rawDbRead.batch(stmts, mode);
  } catch (err) {
    if (isBlockedError(err)) {
      console.warn(`[Dual-DB Failover] Primary read batch blocked. Routing to dbWrite.`);
      isDbReadBlocked = true;
      lastBlockedCheck = Date.now();
      return dbWrite.batch(stmts, mode);
    }
    throw err;
  }
}

// Resilient dbRead proxy: Otomatis failover ke dbWrite jika dbRead diblokir/limit
export const dbRead = isNeon
  ? { execute: neonExecute, batch: neonBatch }
  : {
      execute: executeWithFailover,
      batch: batchWithFailover
    };

/**
 * Tabel operasional yang selalu diarahkan ke database Write:
 */
const WRITE_TABLES = [
  'prebuilt_websites',
  'sg_outreach_logs',
  'places_status_overlay',
  'proposals',
  'analyses',
  'use_cases',
  'token_usage_logs',
  'sync_history',
  'scans',
  'usage_counters',
  'business_notes',
  'tenants',
  'users',
  'auth_codes',
  'tenant_settings',
  'sg_bounced_emails',
  'anchors',
  'category_rules'
];

function isWriteQuery(sql) {
  const upper = sql.trim().toUpperCase();
  return (
    upper.startsWith('INSERT') ||
    upper.startsWith('UPDATE') ||
    upper.startsWith('DELETE') ||
    upper.startsWith('CREATE') ||
    upper.startsWith('ALTER') ||
    upper.startsWith('DROP')
  );
}

function touchesWriteTable(sql) {
  const lower = sql.toLowerCase();
  return lower.includes('tenant_id') || WRITE_TABLES.some(t => lower.includes(t));
}

function isPlacesUpdate(sql) {
  const upper = sql.trim().toUpperCase();
  return upper.startsWith('UPDATE') && sql.toLowerCase().includes('places');
}

/**
 * Helper internal untuk menangani update data places secara cerdas ke places_status_overlay
 * pada dbWrite, menjaga integritas katalog places tanpa memicu write forbidden pada read replica.
 */
async function handlePlacesUpdate(sql, args = []) {
  const lower = sql.toLowerCase();
  const nowIso = new Date().toISOString();

  // Dual-layer write: coba jalankan update langsung pada tabel places di dbWrite
  dbWrite.execute({ sql, args }).catch(() => {});

  // Batch assign: WHERE overture_id IN (?, ?, ...)
  if (lower.includes('assigned_pic') && lower.includes('in (')) {
    const pic = args[0];
    const placeIds = args.slice(1);
    if (placeIds.length > 0) {
      const stmts = placeIds.map((pid) => ({
        sql: `INSERT INTO places_status_overlay (place_id, assigned_pic, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(place_id) DO UPDATE SET assigned_pic = excluded.assigned_pic, updated_at = excluded.updated_at;`,
        args: [pid, pic, nowIso]
      }));
      await dbWrite.batch(stmts, 'write');
    }
    return { rowsAffected: placeIds.length };
  }

  // Cari placeId dari args (biasanya parameter terakhir: WHERE overture_id = ?)
  let placeId = null;
  if (args.length > 0 && typeof args[args.length - 1] === 'string' && args[args.length - 1].length > 5) {
    placeId = args[args.length - 1];
  } else {
    const idMatch = sql.match(/overture_id\s*=\s*['"]([a-zA-Z0-9_-]+)['"]/i);
    if (idMatch) placeId = idMatch[1];
  }

  if (!placeId) {
    return { rowsAffected: 0 };
  }

  // Jika identifier berupa email, selesaikan ke overture_id
  if (placeId && placeId.includes('@')) {
    try {
      const pRes = await dbWrite.execute({
        sql: 'SELECT overture_id FROM places WHERE LOWER(TRIM(email)) = ? LIMIT 1;',
        args: [placeId.toLowerCase().trim()]
      });
      if (pRes.rows?.[0]?.overture_id) {
        placeId = pRes.rows[0].overture_id;
      }
    } catch (_) {}
  }

  const updates = { updated_at: nowIso };

  // 1. Status
  const statusParamMatch = lower.includes('reach_status = ?');
  const statusLiteralMatch = sql.match(/reach_status\s*=\s*['"]([a-zA-Z0-9_-]+)['"]/i);

  if (lower.includes("case when reach_status = 'new'") || lower.includes("then 'analyzed'")) {
    updates.reach_status = 'analyzed';
  } else if (statusLiteralMatch && !lower.includes('case when')) {
    updates.reach_status = statusLiteralMatch[1];
  } else if (statusParamMatch && args.length >= 2) {
    updates.reach_status = args[0];
  }

  // 2. Prebuilt
  if (lower.includes('has_prebuilt_site')) {
    updates.has_prebuilt_site = 1;
  }
  if (lower.includes('prebuilt_slug = ?')) {
    const slugIdx = lower.indexOf('prebuilt_slug = ?') < lower.indexOf('overture_id = ?') ? (args.length - 2) : 0;
    if (args[slugIdx]) updates.prebuilt_slug = args[slugIdx];
  }

  // 3. Outreach log
  if (lower.includes('last_outreach_at = ?')) {
    updates.last_outreach_at = args[0] || nowIso.slice(0, 10);
  }
  if (lower.includes('outreach_count = coalesce(outreach_count, 0) + 1') || lower.includes("reach_status = 'sent'")) {
    updates.reach_status = 'sent';
  }

  // 4. PIC / Contact
  if (lower.includes('assigned_pic = ?')) {
    updates.assigned_pic = args[0];
  }
  if (lower.includes('pic_name = coalesce') && args.length >= 3) {
    if (args[0]) updates.pic_name = args[0];
    if (args[1]) updates.pic_title = args[1];
  }

  // 5. Notes & SG Notes
  if (lower.includes('notes = ?') || lower.includes('notes = coalesce')) {
    const noteVal = args.find((a) => typeof a === 'string' && a.length > 0 && a !== placeId);
    if (noteVal) updates.notes = noteVal;
  }
  if (lower.includes('sg_notes = ?')) {
    const sgVal = args.find((a) => typeof a === 'string' && a.length > 0 && a !== placeId);
    if (sgVal) updates.sg_notes = sgVal;
  }

  // 6. SG Lead Verification
  if (lower.includes('is_personal_lead = ?') && args.length >= 10) {
    updates.is_personal_lead = args[0];
    updates.lead_verified_at = args[1];
    updates.budget_capacity = args[2];
    updates.budget_notes = args[3];
    updates.website_condition = args[4];
    updates.social_condition = args[5];
    updates.offer_angle = args[6];
    updates.pic_name = args[7];
    updates.pic_title = args[8];
    updates.contact_verified = args[9];
  }

  const cols = ['place_id', ...Object.keys(updates)];
  const placeholders = cols.map(() => '?').join(', ');
  const updateClause = Object.keys(updates).map(k => `${k} = excluded.${k}`).join(', ');
  const values = [placeId, ...Object.values(updates)];

  return dbWrite.execute({
    sql: `INSERT INTO places_status_overlay (${cols.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT(place_id) DO UPDATE SET ${updateClause};`,
    args: values
  });
}

/**
 * Smart Dual-Database Interface:
 * - Otomatis mengarahkan INSERT/UPDATE/DELETE ke dbWrite
 * - Mengarahkan query tabel operasional (tenant, logs, overlay, prebuilt) ke dbWrite
 * - Mengarahkan query katalog places ke dbRead dengan failover otomatis ke dbWrite
 * - Otomatis mengalihkan 'UPDATE places' ke places_status_overlay di dbWrite
 */
const rawDb = {
  async execute(stmt) {
    const sql = typeof stmt === 'string' ? stmt : stmt.sql;
    const args = typeof stmt === 'string' ? [] : (stmt.args || []);
    const lower = sql.toLowerCase();

    // Kasus Khusus: UPDATE places ... dialihkan ke places_status_overlay
    if (isPlacesUpdate(sql)) {
      return handlePlacesUpdate(sql, args);
    }

    // Operasi tulis selalu ke dbWrite
    if (isWriteQuery(sql)) {
      return dbWrite.execute(stmt);
    }

    // Tabel operasional selalu ke dbWrite
    if (touchesWriteTable(sql)) {
      return dbWrite.execute(stmt);
    }

    // Query katalog places atau umum diarahkan ke dbRead (dengan auto failover)
    return dbRead.execute(stmt);
  },

  async batch(stmts, mode) {
    const hasWrite = stmts.some(s => {
      const sql = typeof s === 'string' ? s : s.sql;
      return isWriteQuery(sql) || touchesWriteTable(sql);
    });

    if (hasWrite) {
      const mapped = [];
      for (const s of stmts) {
        const sql = typeof s === 'string' ? s : s.sql;
        const args = typeof s === 'string' ? [] : (s.args || []);
        if (isPlacesUpdate(sql)) {
          await handlePlacesUpdate(sql, args);
        } else {
          mapped.push(s);
        }
      }
      if (mapped.length === 0) return [{ rowsAffected: 1 }];
      return dbWrite.batch(mapped, mode);
    }

    return dbRead.batch(stmts, mode);
  }
};

export const db = isNeon ? { execute: neonExecute, batch: neonBatch } : rawDb;

// Cache query dalam memori dengan deduplikasi in-flight dan TTL
const queryCache = new Map();
const inFlight = new Map();
const MAX_CACHE_SIZE = 300;

/**
 * Mengambil overlay status dari dbWrite untuk menggabungkan status terbaru ke prospek
 */
export async function getStatusOverlayMap(placeIds = [], tenantId = null) {
  if (!placeIds || placeIds.length === 0) return new Map();
  try {
    const placeholders = placeIds.map(() => '?').join(',');
    const tenantFilter = tenantId ? `AND tenant_id = ?` : `AND (tenant_id IS NULL OR tenant_id = 'tnt_master' OR tenant_id = '')`;
    const args = tenantId ? [...placeIds, tenantId] : placeIds;
    const res = await dbWrite.execute({
      sql: `SELECT * FROM places_status_overlay WHERE place_id IN (${placeholders}) ${tenantFilter};`,
      args
    });
    const map = new Map();
    for (const row of res.rows || []) {
      map.set(row.place_id, row);
    }
    return map;
  } catch (_) {
    return new Map();
  }
}

export async function cachedExecute(queryObj, ttlMs = 60000) {
  const key = typeof queryObj === 'string' ? queryObj : JSON.stringify(queryObj);
  const now = Date.now();
  const cached = queryCache.get(key);
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data;
  }
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }
  const promise = (async () => {
    try {
      const result = await db.execute(queryObj);
      if (queryCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = queryCache.keys().next().value;
        if (oldestKey) queryCache.delete(oldestKey);
      }
      queryCache.set(key, { timestamp: Date.now(), data: result });
      return result;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * Mengambil daftar place_id dan email yang sudah pernah diproses/dihubungi dari dbWrite
 * untuk menjamin deduplikasi ketat pada arsitektur dual database.
 */
export async function getExcludedProspects() {
  try {
    const [placesRes, emailsRes] = await Promise.all([
      dbWrite.execute(`
        SELECT DISTINCT place_id FROM sg_outreach_logs WHERE place_id IS NOT NULL AND place_id != ''
        UNION
        SELECT DISTINCT place_id FROM prebuilt_websites WHERE place_id IS NOT NULL AND place_id != ''
        UNION
        SELECT DISTINCT place_id FROM places_status_overlay WHERE (reach_status = 'sent' OR has_prebuilt_site = 1) AND place_id IS NOT NULL;
      `),
      dbWrite.execute(`
        SELECT DISTINCT LOWER(TRIM(recipient_email)) as email FROM sg_outreach_logs WHERE recipient_email IS NOT NULL AND recipient_email != '';
      `)
    ]);
    const placeIds = (placesRes.rows || []).map(r => r.place_id).filter(Boolean);
    const emails = (emailsRes.rows || []).map(r => r.email).filter(Boolean);
    return { placeIds, emails };
  } catch (err) {
    console.error('getExcludedProspects error:', err);
    return { placeIds: [], emails: [] };
  }
}

export function invalidateCache() {
  queryCache.clear();
  inFlight.clear();
}
