import { db } from '../lib/db.js';
import { fallbackUniversalSiteConfig } from '../lib/llm.js';

async function revampAll() {
  console.log('Revamping all generated websites in Turso DB...');

  // 1. Delete test deduplication sites
  await db.execute(`DELETE FROM prebuilt_websites WHERE slug LIKE 'test-dedup-%';`);
  console.log('Deleted test dedup placeholder records.');

  // 2. Fetch all real prebuilt websites joined with places and analyses
  const res = await db.execute(`
    SELECT 
      w.id,
      w.slug,
      w.company_name,
      w.place_id,
      w.category,
      p.name as place_name,
      p.address as place_address,
      p.phone as place_phone,
      p.website as place_website,
      p.bidang_usaha,
      p.category_raw,
      p.notes,
      a.summary as analysis_summary,
      a.products as analysis_products
    FROM prebuilt_websites w
    LEFT JOIN places p ON w.place_id = p.overture_id
    LEFT JOIN analyses a ON w.place_id = a.place_id
    ORDER BY w.created_at DESC;
  `);

  console.log(`Found ${res.rows.length} real prebuilt websites to revamp:`);

  for (const site of res.rows) {
    const name = site.company_name || site.place_name;
    const cat = site.bidang_usaha || site.category_raw || site.category || 'Commercial';
    const loc = site.place_address || 'Singapore';

    const config = fallbackUniversalSiteConfig({
      name,
      cleanCat: cat,
      cleanLoc: loc,
      products: site.analysis_products || '',
      summary: site.analysis_summary || site.notes || '',
      lang: 'en'
    });

    // Update in database with clean category, headline, subheadline, and services_json
    await db.execute({
      sql: `
        UPDATE prebuilt_websites
        SET 
          category = ?,
          hero_headline = ?,
          hero_subheadline = ?,
          services_json = ?
        WHERE slug = ?;
      `,
      args: [
        config.industryTag || cat,
        config.heroHeadline,
        config.heroSubheadline,
        JSON.stringify(config),
        site.slug
      ]
    });

    console.log(`[OK] Revamped [${site.slug}] ${name}`);
    console.log(`   Color: ${config.primaryColor} | Tag: ${config.industryTag}`);
    console.log(`   Headline: "${config.heroHeadline}"`);
  }

  console.log('All prebuilt websites successfully revamped!');
}

revampAll().catch(console.error);
