import { dbWrite } from '../lib/db.js';
import { consumeTenantQuota } from '../lib/tenant.js';

async function main() {
  console.log('Recreating usage_counters on dbWrite...');
  await dbWrite.execute('DROP TABLE IF EXISTS usage_counters;');
  await dbWrite.execute(`
    CREATE TABLE usage_counters (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      tenant_id TEXT,
      metric TEXT,
      date_str TEXT,
      updated_at TEXT
    );
  `);
  await dbWrite.execute('CREATE INDEX IF NOT EXISTS idx_usage_counters_date ON usage_counters(date);');
  await dbWrite.execute('CREATE INDEX IF NOT EXISTS idx_usage_counters_tenant ON usage_counters(tenant_id);');
  console.log('Table usage_counters recreated with correct schema!');

  // Test quota consumption
  const res = await consumeTenantQuota('tnt_02ba61c7', 'ai');
  console.log('TEST CONSUME TENANT QUOTA SUCCESS:', res);

  // Check row in usage_counters
  const check = await dbWrite.execute("SELECT * FROM usage_counters WHERE tenant_id = 'tnt_02ba61c7';");
  console.log('ROW IN USAGE COUNTERS:', check.rows);
}

main().catch(console.error);
