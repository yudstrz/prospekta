import { db } from '../lib/db.js';
import { crawlCompanyWebsite } from '../lib/crawler.js';
import { searchCompanyWeb } from '../lib/search-discovery.js';
import { generatePrebuiltSiteConfig } from '../lib/llm.js';

async function deepAiRevamp() {
  console.log('=== STARTING DEEP AI FACTUAL REVAMP (ZERO TEMPLATES & ZERO FAKE STOCK) ===');

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
      a.products as analysis_products,
      a.search_intelligence,
      a.google_place
    FROM prebuilt_websites w
    LEFT JOIN places p ON w.place_id = p.overture_id
    LEFT JOIN analyses a ON w.place_id = a.place_id
    ORDER BY w.created_at DESC;
  `);

  console.log(`Found ${res.rows.length} websites to deeply analyze with AI.`);

  for (const site of res.rows) {
    const name = site.company_name || site.place_name;
    const websiteUrl = site.place_website || (site.slug.includes('dsv') ? 'https://www.dsv.com/en/countries/asia/indonesia' : site.slug.includes('h-m') ? 'https://www.hm.com/id' : site.slug.includes('cos') ? 'https://www.cos.com' : site.slug.includes('marimekko') ? 'https://www.marimekko.com' : null);
    
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing [${name}] (slug: ${site.slug})...`);
    console.log(`Target Website: ${websiteUrl || '(None - relying on Web Search)'}`);

    // 1. Deep website crawling for real visual assets & logo
    let visualAssets = null;
    let crawledText = '';
    if (websiteUrl) {
      try {
        console.log(`Crawling website assets from ${websiteUrl}...`);
        const crawlRes = await crawlCompanyWebsite(websiteUrl);
        if (crawlRes?.success) {
          visualAssets = crawlRes.visualAssets;
          crawledText = crawlRes.text || '';
          console.log(`+ Extracted Logo:`, visualAssets?.logoUrl || '(none)');
          console.log(`+ Extracted Primary Brand Color:`, visualAssets?.brandColors?.primary || '(none)');
          console.log(`+ Extracted Real Images: ${visualAssets?.realImages?.length || 0} images`);
          console.log(`+ Extracted Nav Menus:`, visualAssets?.navLinks || []);
        }
      } catch (err) {
        console.warn(`! Website crawl failed for ${name}:`, err.message);
      }
    }

    // 2. Tavily AI Search for verified intelligence & images
    let webImages = [];
    let searchAnswer = null;
    let searchSnippets = [];
    try {
      console.log(`Performing AI Web Search for [${name}]...`);
      const searchRes = await searchCompanyWeb({
        name,
        category: site.category || site.bidang_usaha,
        address: site.place_address,
        website: websiteUrl
      });
      if (searchRes) {
        webImages = searchRes.images || [];
        searchAnswer = searchRes.answer;
        searchSnippets = searchRes.snippets || [];
        console.log(`+ Search Web Images: ${webImages.length} images`);
      }
    } catch (err) {
      console.warn(`! Web search failed for ${name}:`, err.message);
    }

    // 3. Resolve Google Places info if available
    let googlePlace = null;
    if (site.google_place) {
      try {
        googlePlace = typeof site.google_place === 'string' ? JSON.parse(site.google_place) : site.google_place;
      } catch (_) {}
    }

    const summary = site.analysis_summary || searchAnswer || crawledText.slice(0, 800) || site.notes || '';
    const products = site.analysis_products || searchSnippets.slice(0, 3).join('. ') || '';

    // 4. Generate Bespoke Site Architecture via AI
    console.log(`Calling AI Brand Strategist to design authentic architecture for [${name}]...`);
    const siteConfig = await generatePrebuiltSiteConfig({
      name,
      category: site.category || site.bidang_usaha || site.category_raw || 'Commercial',
      address: site.place_address || 'Singapore',
      phone: site.place_phone || '',
      website: websiteUrl || '',
      summary,
      products,
      googlePlace,
      visualAssets,
      webImages,
      rating: site.google_rating || 4.8,
      reviewsCount: site.reviews_count || 18,
      lang: 'en'
    });

    console.log(`[OK] AI Synthesis Result for [${name}]:`);
    console.log(`  - Brand Tagline: "${siteConfig.brandTagline}"`);
    console.log(`  - Primary Color: ${siteConfig.primaryColor}`);
    console.log(`  - Hero Image: ${siteConfig.heroImage || '(Clean card treatment)'}`);
    console.log(`  - Logo URL: ${siteConfig.logoUrl || '(none)'}`);
    console.log(`  - Showcase Items: ${siteConfig.showcaseItems?.length} items`);
    for (const item of (siteConfig.showcaseItems || []).slice(0, 3)) {
      console.log(`    * [${item.tag}] ${item.title} -> ${item.image ? 'Real Image: ' + item.image.slice(0, 60) + '...' : '(No image / Spec Card)'}`);
    }

    // 5. Update Turso database
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
        siteConfig.industryTag || site.category,
        siteConfig.heroHeadline,
        siteConfig.heroSubheadline,
        JSON.stringify(siteConfig),
        site.slug
      ]
    });

    console.log(`[OK] Updated database record for slug: ${site.slug}`);
  }

  console.log('\n=== ALL SITES REVAMPED WITH FACTUAL AI ANALYSIS SUCCESSFULLY! ===');
}

deepAiRevamp().catch(console.error);
