import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { fetchOverturePlaces } from '@/lib/overture';
import { haversineDistance } from '@/lib/geo';

export const dynamic = 'force-dynamic';

function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyCronAuth(request) {
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET is strictly required
  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      return { authorized: false, reason: 'CRON_SECRET environment variable is not configured on server' };
    }
    // In local development, allow execution if secret is not yet set
    return { authorized: true };
  }

  const authHeader = request.headers.get('authorization') || '';
  const xCronSecret = request.headers.get('x-cron-secret') || '';
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret') || searchParams.get('key') || '';

  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

  if (
    safeCompare(bearerToken, cronSecret) ||
    safeCompare(xCronSecret, cronSecret) ||
    safeCompare(querySecret, cronSecret)
  ) {
    return { authorized: true };
  }

  return { authorized: false, reason: 'Invalid or missing cron secret' };
}

async function handleCronExecution(request) {
  const startTime = Date.now();
  const auth = verifyCronAuth(request);

  if (!auth.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: auth.reason || 'Unauthorized'
      },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const triggerScrape = searchParams.get('trigger_scrape') === 'true' || searchParams.get('scrape') === '1';
  const targetArea = searchParams.get('target') || 'all';

  const results = {
    timestamp: new Date().toISOString(),
    status: 'ok',
    tasks: {}
  };

  // 1. Turso Database Keep-Alive & Health Check
  try {
    const t0 = Date.now();
    const [placesRes, leadsRes, outreachRes, anchorsRes] = await Promise.all([
      db.execute('SELECT COUNT(*) as count FROM places;').catch(() => ({ rows: [{ count: 0 }] })),
      db.execute('SELECT COUNT(*) as count FROM places WHERE is_personal_lead = 1;').catch(() => ({ rows: [{ count: 0 }] })),
      db.execute('SELECT COUNT(*) as count FROM sg_outreach_logs;').catch(() => ({ rows: [{ count: 0 }] })),
      db.execute('SELECT COUNT(*) as count FROM anchors;').catch(() => ({ rows: [{ count: 0 }] }))
    ]);

    const latencyMs = Date.now() - t0;
    results.tasks.databaseHealth = {
      status: 'healthy',
      latencyMs,
      stats: {
        totalPlaces: Number(placesRes.rows?.[0]?.count || 0),
        personalLeads: Number(leadsRes.rows?.[0]?.count || 0),
        outreachLogs: Number(outreachRes.rows?.[0]?.count || 0),
        anchors: Number(anchorsRes.rows?.[0]?.count || 0)
      }
    };
  } catch (dbErr) {
    results.tasks.databaseHealth = {
      status: 'error',
      error: dbErr.message
    };
  }

  // 2. Maintenance: Prune old usage counters (> 30 days old)
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pruneRes = await db.execute({
      sql: 'DELETE FROM usage_counters WHERE date < ?;',
      args: [thirtyDaysAgo]
    });
    results.tasks.pruneCounters = {
      status: 'pruned',
      rowsAffected: pruneRes.rowsAffected || 0,
      cutoffDate: thirtyDaysAgo
    };

    // Prune sync_history agar hanya menyimpan 100 log terbaru (menjaga storage Turso Free Tier)
    await db.execute(`
      DELETE FROM sync_history 
      WHERE id NOT IN (
        SELECT id FROM sync_history ORDER BY created_at DESC LIMIT 100
      );
    `).catch(() => {});
  } catch (pruneErr) {
    results.tasks.pruneCounters = {
      status: 'skipped',
      error: pruneErr.message
    };
  }

  // 3. Inbox sync disabled (email features removed)
  results.tasks.inboxSync = { status: 'disabled' };

  // 4. Latest sync status
  try {
    const latestSyncRes = await db.execute(`
      SELECT target, new_places_added, duplicates_prevented, total_places_now, status, created_at
      FROM sync_history
      ORDER BY created_at DESC
      LIMIT 1;
    `);
    results.tasks.latestSync = latestSyncRes.rows?.[0] || null;
  } catch (syncErr) {
    results.tasks.latestSync = { error: syncErr.message };
  }

  // 3. Optional: Trigger GitHub Actions Overture Scrape & Sync Workflow
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_PAT;
  const rawRepo = process.env.GITHUB_REPO || 'yudstrz/prospekta';
  const githubRepo = rawRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');

  if (triggerScrape) {
    if (!githubToken || !githubRepo) {
      results.tasks.githubScrapeTrigger = {
        status: 'skipped',
        reason: 'GITHUB_TOKEN and GITHUB_REPO are required in environment variables to trigger GitHub Actions.'
      };
    } else {
      try {
        const ghResponse = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `Bearer ${githubToken}`,
            'User-Agent': 'Prospekta-Cron'
          },
          body: JSON.stringify({
            event_type: 'scrape_sync',
            client_payload: {
              target: targetArea,
              source: 'api_cron_endpoint',
              timestamp: results.timestamp
            }
          })
        });

        if (ghResponse.ok || ghResponse.status === 204) {
          results.tasks.githubScrapeTrigger = {
            status: 'dispatched',
            repo: githubRepo,
            target: targetArea
          };
        } else {
          const errText = await ghResponse.text();
          results.tasks.githubScrapeTrigger = {
            status: 'error',
            statusCode: ghResponse.status,
            details: errText
          };
        }
      } catch (ghErr) {
        results.tasks.githubScrapeTrigger = {
          status: 'error',
          error: ghErr.message
        };
      }
    }
  }

  // 5. Tenant Auto-Discovery Radar Sync (Scraping Data Bisnis Baru per Workspace Klien)
  try {
    const { rows: tenants } = await db.execute(`
      SELECT t.id, t.company_name, t.latitude, t.longitude, ts.default_radius_km, COALESCE(ts.feat_auto_discovery, 0) as feat_auto_discovery
      FROM tenants t
      LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
      WHERE t.status = 'active' OR t.status = 'trial'
    `);

    let totalDiscovered = 0;
    const tenantSummaries = [];

    for (const t of (tenants || [])) {
      if (Number(t.feat_auto_discovery) === 0 || !t.latitude || !t.longitude) {
        continue;
      }
      const lat = Number(t.latitude);
      const lng = Number(t.longitude);
      const radKm = Math.min(Number(t.default_radius_km) || 2, 5);
      const delta = radKm / 111.32;
      const places = await fetchOverturePlaces(lng - delta, lat - delta, lng + delta, lat + delta);
      if (Array.isArray(places) && places.length > 0) {
        const now = new Date().toISOString();
        const inserts = places.slice(0, 25).map((p) => {
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
              t.company_name,
              p.name,
              p.category || 'commercial',
              'Bisnis & Layanan Komersial',
              p.address || `${t.company_name} Area`,
              p.lat,
              p.lng,
              dist,
              p.confidence || 0.85,
              now,
              baselineIcp
            ]
          };
        });
        await db.batch(inserts);
        totalDiscovered += places.length;
        tenantSummaries.push({ tenant: t.company_name, count: places.length });
      }
    }
    results.tasks.tenantRadarSync = {
      status: 'completed',
      totalDiscovered,
      tenantsProcessed: tenantSummaries
    };
  } catch (radarErr) {
    results.tasks.tenantRadarSync = {
      status: 'error',
      error: radarErr.message
    };
  }

  results.durationMs = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    ...results
  });
}

export async function GET(request) {
  return handleCronExecution(request);
}

export async function POST(request) {
  return handleCronExecution(request);
}
