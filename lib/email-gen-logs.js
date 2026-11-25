import { dbWrite } from './db';

let tableReady = null;

/**
 * Pastikan tabel riwayat generasi email per prospek & tenant tersedia idempoten.
 */
async function ensureEmailGenLogsTable() {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    await dbWrite.execute(`
      CREATE TABLE IF NOT EXISTS email_generation_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT,
        place_id TEXT NOT NULL,
        company_name TEXT,
        lang TEXT NOT NULL DEFAULT 'en',
        provider TEXT,
        subject TEXT,
        body TEXT,
        created_at TEXT NOT NULL
      );
    `).catch(() => {});
    await dbWrite.execute(`
      CREATE INDEX IF NOT EXISTS idx_email_gen_tenant_place
      ON email_generation_logs (tenant_id, place_id, created_at DESC);
    `).catch(() => {});
  })().catch(() => { tableReady = null; });
  return tableReady;
}

/**
 * Ambil statistik generasi email untuk prospek & ringkasan terbaru akun tenant.
 */
export async function getEmailGenerationStats({ tenantId, placeId }) {
  const tid = tenantId || 'tnt_master';
  await ensureEmailGenLogsTable();
  const todayPrefix = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  const [placeRes, tenantCountRes, todayRes, recentRes] = await Promise.all([
    placeId
      ? dbWrite.execute({
          sql: `SELECT id, lang, provider, subject, body, created_at FROM email_generation_logs WHERE tenant_id = ? AND place_id = ? ORDER BY created_at DESC LIMIT 10;`,
          args: [tid, placeId],
        }).catch(() => ({ rows: [] }))
      : Promise.resolve({ rows: [] }),
    dbWrite.execute({
      sql: `SELECT COUNT(*) AS total FROM email_generation_logs WHERE tenant_id = ?;`,
      args: [tid],
    }).catch(() => ({ rows: [{ total: 0 }] })),
    dbWrite.execute({
      sql: `SELECT COUNT(*) AS total FROM email_generation_logs WHERE tenant_id = ? AND created_at >= ?;`,
      args: [tid, `${todayPrefix}T00:00:00`],
    }).catch(() => ({ rows: [{ total: 0 }] })),
    dbWrite.execute({
      sql: `SELECT id, place_id, company_name, lang, provider, subject, created_at FROM email_generation_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 6;`,
      args: [tid],
    }).catch(() => ({ rows: [] })),
  ]);

  const placeRows = placeRes.rows || [];
  let placeCount = placeRows.length;
  if (placeId && placeCount === 10) {
    const exact = await dbWrite.execute({
      sql: `SELECT COUNT(*) AS total FROM email_generation_logs WHERE tenant_id = ? AND place_id = ?;`,
      args: [tid, placeId],
    }).catch(() => null);
    placeCount = Number(exact?.rows?.[0]?.total || placeCount);
  }

  return {
    placeCount,
    totalTenantCount: Number(tenantCountRes.rows?.[0]?.total || 0),
    todayTenantCount: Number(todayRes.rows?.[0]?.total || 0),
    lastGeneratedAt: placeRows[0]?.created_at || null,
    latestEmail: placeRows[0]
      ? {
          subject: placeRows[0].subject || '',
          body: placeRows[0].body || '',
          lang: placeRows[0].lang || 'en',
          provider: placeRows[0].provider || 'synthesis',
          created_at: placeRows[0].created_at,
        }
      : null,
    placeHistory: placeRows.slice(0, 5),
    recentLogs: recentRes.rows || [],
  };
}

/**
 * Catat 1 aktivitas generate/regenerate email dan kembalikan statistik terbaru.
 */
export async function recordEmailGeneration({ tenantId, userId = null, placeId, companyName = '', lang = 'en', provider = 'synthesis', subject = '', body = '' }) {
  const tid = tenantId || 'tnt_master';
  await ensureEmailGenLogsTable();
  const id = `eml_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();

  await dbWrite.execute({
    sql: `INSERT INTO email_generation_logs (id, tenant_id, user_id, place_id, company_name, lang, provider, subject, body, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    args: [id, tid, userId, placeId, companyName, lang === 'id' ? 'id' : 'en', provider, subject, body, nowIso],
  }).catch(() => {});

  return getEmailGenerationStats({ tenantId: tid, placeId });
}
