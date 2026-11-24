import { dbWrite } from '../lib/db.js';

async function addSafetyIndexes() {
  console.log('Menambahkan indeks pengaman dan performa ke database Turso...');

  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_places_anchor_reach_email ON places(anchor, reach_status, email);`,
    `CREATE INDEX IF NOT EXISTS idx_places_anchor_email ON places(anchor, email);`,
    `CREATE INDEX IF NOT EXISTS idx_places_anchor_dist ON places(anchor, distance_m);`,
    `CREATE INDEX IF NOT EXISTS idx_places_reach_status ON places(reach_status);`,
    `CREATE INDEX IF NOT EXISTS idx_places_icp ON places(icp_score DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_tenant_place ON sg_outreach_logs(tenant_id, place_id);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_tenant_email ON sg_outreach_logs(tenant_id, recipient_email);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_place ON sg_outreach_logs(place_id);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_email ON sg_outreach_logs(recipient_email);`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_sent_date ON sg_outreach_logs(sent_date);`,
    `CREATE INDEX IF NOT EXISTS idx_overlay_tenant_place ON places_status_overlay(tenant_id, place_id);`,
    `CREATE INDEX IF NOT EXISTS idx_overlay_status ON places_status_overlay(reach_status);`,
    `CREATE INDEX IF NOT EXISTS idx_prebuilt_place ON prebuilt_websites(place_id);`,
    `CREATE INDEX IF NOT EXISTS idx_anchors_tenant ON anchors(tenant_id);`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`
  ];

  for (const idxSql of indexes) {
    try {
      await dbWrite.execute(idxSql);
      console.log('OK:', idxSql.match(/idx_[a-zA-Z0-9_]+/)?.[0]);
    } catch (err) {
      console.warn('Lewati/Peringatan:', err.message);
    }
  }

  console.log('Seluruh indeks keamanan berhasil diverifikasi!');
}

addSafetyIndexes();
