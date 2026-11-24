import { db, dbWrite, invalidateCache } from './db.js';
import { crawlCompanyWebsite, inferPersonFromEmail } from './crawler.js';
import { analyzeCompanyContent } from './llm.js';
import { fetchGooglePlaceDetails } from './google-places.js';
import { searchCompanyWeb, performDeepWebResearch } from './search-discovery.js';
import { lookupApolloPerson } from './apollo.js';

/**
 * Execute comprehensive company intelligence research (GMaps + Web Search + Crawl + LLM Needs Analysis)
 * Persists findings into `analyses` and updates `places` table.
 * 
 * @param {Object} options
 * @param {string} options.placeId - The overture_id of the company in places table
 * @param {string} [options.manualText] - Optional manual text provided by user
 * @param {string} [options.websiteUrl] - Optional explicit website URL override
 * @param {string} [options.lang] - 'en' for Singapore/international outreach, 'id' for domestic
 * @returns {Promise<Object>}
 */
export async function performCompanyIntelligence({ placeId, manualText, websiteUrl, lang = 'en', tenantId = null }) {
  if (!placeId) {
    return { success: false, error: 'Parameter placeId diperlukan.' };
  }

  // 1. Fetch place details
  const placeRes = await db.execute({
    sql: `SELECT overture_id, name, category_raw, bidang_usaha, address, lat, lng, website, phone, email, whatsapp, linkedin_url, anchor, problem_analysis, notes, sg_notes, pic_name, pic_title FROM places WHERE overture_id = ?;`,
    args: [placeId]
  });

  const place = placeRes.rows?.[0];
  if (!place) {
    return { success: false, error: 'Perusahaan tidak ditemukan dalam database.' };
  }

  // 2. Fetch use cases from DB (graceful fallback)
  const ucRes = await db.execute(`SELECT id, vertical, title, description FROM use_cases;`).catch(() => ({ rows: [] }));
  const useCases = ucRes.rows || [];

  const today = new Date().toISOString().slice(0, 10);
  let extractedText = (manualText || '').trim();
  let sourceUrl = websiteUrl || place.website || '';
  let signals = {};

  // 3. Stage 1 Fan-Out: Execute Google Maps, Serverless Deep Web Research, Crawl, and Apollo IN PARALLEL
  const [googlePlace, searchRes, preCrawlRes, apolloRes] = await Promise.all([
    fetchGooglePlaceDetails({
      name: place.name,
      address: place.address || '',
      lat: place.lat,
      lng: place.lng
    }),
    !extractedText ? performDeepWebResearch({
      name: place.name,
      category: place.bidang_usaha || place.category_raw,
      address: place.address || '',
      phone: place.phone || '',
      anchor: place.anchor || '',
      website: sourceUrl || undefined
    }) : Promise.resolve({ website: null, answer: null, snippets: [], sourcesCited: [], socials: {}, candidateEmails: [], candidatePhones: [], source: 'none' }),
    (!extractedText && sourceUrl) ? crawlCompanyWebsite(sourceUrl, { fastMode: true, maxSubpages: 4 }).catch(() => null) : Promise.resolve(null),
    (process.env.APOLLO_API_KEY && (sourceUrl || place.name)) ? lookupApolloPerson({ companyName: place.name, domain: sourceUrl }).catch(() => null) : Promise.resolve(null)
  ]);

  // Auto-discover website if not already present
  if (!sourceUrl) {
    sourceUrl = googlePlace?.website || searchRes?.website || '';
  }

  const searchSnippets = searchRes?.snippets || [];
  const searchAnswer = searchRes?.answer || null;
  const searchSocials = searchRes?.socials || {};

  if (searchSocials.linkedin && !signals.linkedinUrl) {
    signals.linkedinUrl = searchSocials.linkedin;
  }
  if (searchRes?.candidateEmails?.length > 0 && (!signals.emails || signals.emails.length === 0)) {
    signals.emails = searchRes.candidateEmails;
    signals.primaryEmail = searchRes.candidateEmails[0];
  }
  if (searchRes?.candidatePhones?.length > 0 && (!signals.phones || signals.phones.length === 0)) {
    signals.phones = searchRes.candidatePhones;
    signals.primaryPhone = searchRes.candidatePhones[0];
  }

  // 4. Process Crawl Results
  let crawledPages = [];
  let visualAssets = null;
  let crawlResult = preCrawlRes;

  // Jika belum sempat di-crawl karena URL baru ditemukan dari hasil deep search:
  if (!crawlResult && !extractedText && sourceUrl) {
    crawlResult = await crawlCompanyWebsite(sourceUrl, { fastMode: true, maxSubpages: 4 }).catch(() => null);
  }

  if (crawlResult && crawlResult.success && crawlResult.text) {
    extractedText = crawlResult.text;
    signals = { ...crawlResult.signals, ...signals };
    visualAssets = crawlResult.visualAssets || null;
    if (searchSocials.linkedin && !signals.linkedinUrl) {
      signals.linkedinUrl = searchSocials.linkedin;
    }
    if (searchRes?.candidateEmails?.length > 0) {
      signals.emails = [...new Set([...(signals.emails || []), ...searchRes.candidateEmails])];
      signals.primaryEmail = signals.primaryEmail || searchRes.candidateEmails[0];
    }
    if (searchRes?.candidatePhones?.length > 0) {
      signals.phones = [...new Set([...(signals.phones || []), ...searchRes.candidatePhones])];
      signals.primaryPhone = signals.primaryPhone || searchRes.candidatePhones[0];
    }
    sourceUrl = crawlResult.url || sourceUrl;
    crawledPages = crawlResult.crawledPages || [];

    // Increment crawl counter
    await db.execute({
      sql: `
        INSERT INTO usage_counters (id, date, type, count)
        VALUES (?, ?, 'crawl', 1)
        ON CONFLICT(id) DO UPDATE SET count = count + 1;
      `,
      args: [`crawl_${today}`, today]
    }).catch(() => {});
  }

  // 5. Enrich Crawled Website Text with Multi-Angle Deep Web Intelligence
  if (extractedText && (searchAnswer || searchSnippets.length > 0 || searchSocials.linkedin)) {
    const externalAdditions = [
      '\n--- DEEP WEB RESEARCH & VERIFIED PUBLIC INTELLIGENCE (Tavily Multi-Angle) ---',
      searchAnswer ? `Executive Overview:\n${searchAnswer}` : null,
      searchSnippets.length > 0 ? `Multi-Angle Investigation Snippets:\n${searchSnippets.slice(0, 8).join('\n')}` : null,
      searchSocials.linkedin ? `LinkedIn Profile: ${searchSocials.linkedin}` : null,
    ].filter(Boolean).join('\n');

    extractedText = `${extractedText.slice(0, 16000)}\n${externalAdditions}`;
  }

  // 6. Synthesize from Web Search, Maps & Entity data if no raw website text
  if (!extractedText) {
    const gMapsReviews = (googlePlace?.reviews || [])
      .map((r) => `[Rating ${r.rating}/5] "${r.text}" (${r.author})`)
      .join('\n');

    extractedText = [
      `Company Name: ${place.name}`,
      `Industry / Category: ${place.bidang_usaha || place.category_raw || 'Commercial B2B Services'}`,
      `Physical Location: ${place.address || 'Operating location'} (Coordinates: ${place.lat}, ${place.lng})`,
      `Telephone / Contact: ${place.phone || googlePlace?.phone || (searchRes?.candidatePhones && searchRes.candidatePhones[0]) || 'Listed locally'}`,
      searchAnswer ? `\nVerified Web Intelligence Summary:\n${searchAnswer}` : null,
      searchSnippets.length > 0 ? `\nPublic Directory & Search Snippets:\n${searchSnippets.join('\n')}` : null,
      searchSocials.linkedin ? `Corporate LinkedIn: ${searchSocials.linkedin}` : null,
      googlePlace?.business_status ? `Google Operational Status: ${googlePlace.business_status}` : null,
      googlePlace?.rating ? `Google Maps Rating: ${googlePlace.rating} / 5.0 (${googlePlace.user_ratings_total} reviews)` : null,
      gMapsReviews ? `\nGoogle Maps Reviews:\n${gMapsReviews}` : null,
      `Operational Note: Active commercial enterprise. High potential for automated customer inquiry workflows, digitized client intake, and structured operations.`
    ].filter(Boolean).join('\n').trim();
  }

  // 7. Run AI Content Analysis with structured prompt (supporting English for Singapore market)
  const analysisOutput = await analyzeCompanyContent({
    name: place.name,
    category: place.bidang_usaha || place.category_raw,
    website: sourceUrl,
    text: extractedText,
    useCases,
    googlePlace,
    lang,
    tenantId
  });

  // Increment LLM counter
  await db.execute({
    sql: `
      INSERT INTO usage_counters (id, date, type, count)
      VALUES (?, ?, 'llm', 1)
      ON CONFLICT(id) DO UPDATE SET count = count + 1;
    `,
    args: [`llm_${today}`, today]
  }).catch(() => {});

  // 8. Query Apollo.io for Verified B2B Decision Maker
  let apolloPerson = apolloRes?.person || null;
  if (!apolloPerson && process.env.APOLLO_API_KEY && (sourceUrl || place.name)) {
    try {
      const res = await lookupApolloPerson({ companyName: place.name, domain: sourceUrl });
      if (res?.success && res.person) {
        apolloPerson = res.person;
      }
    } catch (err) {
      console.warn('Apollo lookup in intelligence:', err.message);
    }
  }

  // 9. Aggregate all key people discovered across Apollo, LLM, Crawler, and Inferred Emails
  const keyPeopleMap = new Map();
  const normalizeRole = (rc, title = '') => {
    if (/director|ceo|founder|president|managing|owner|principal/i.test(title) || rc === 'executive') return 'decision_maker';
    return 'operations_lead';
  };
  const addPerson = (person, defaultCategory = 'management') => {
    if (!person || !person.name || person.name.trim().length < 3) return;
    const cleanName = person.name.trim();
    const normKey = cleanName.toLowerCase();
    if (/division|department|solutions|services|pte|ltd|inc|group|center|centre|office|company|testimonial|milestone|award|serving|years/i.test(cleanName)) return;

    if (!keyPeopleMap.has(normKey)) {
      keyPeopleMap.set(normKey, {
        name: cleanName,
        title: person.title || 'Executive / Management',
        email: person.email || null,
        phone: person.phone || null,
        role_category: normalizeRole(person.role_category || defaultCategory, person.title || ''),
        source: person.source || 'website'
      });
    } else {
      const existing = keyPeopleMap.get(normKey);
      if (!existing.email && person.email) existing.email = person.email;
      if (!existing.phone && person.phone) existing.phone = person.phone;
      if (person.title && (!existing.title || existing.title.includes('Kontak'))) existing.title = person.title;
      if (person.role_category) existing.role_category = person.role_category;
    }
  };

  if (apolloPerson) {
    addPerson({ ...apolloPerson, source: 'apollo_api' }, 'executive');
  }
  if (Array.isArray(analysisOutput.key_people)) {
    analysisOutput.key_people.forEach((p) => addPerson({ ...p, source: 'llm_analysis' }, p.role_category || 'management'));
  }
  if (Array.isArray(signals.picCandidates)) {
    signals.picCandidates.forEach((p) => addPerson({ ...p, source: 'crawler' }, p.role_category || 'management'));
  }
  const emailToInfer = place.email || signals.primaryEmail || (signals.emails && signals.emails[0]);
  if (emailToInfer) {
    const inferred = inferPersonFromEmail(emailToInfer);
    if (inferred) addPerson({ ...inferred, source: 'email_inference' }, 'branch');
  }
  if (Array.isArray(signals.emailsDetailed)) {
    signals.emailsDetailed.forEach((e) => {
      const inf = inferPersonFromEmail(e.email);
      if (inf) addPerson({ ...inf, source: 'email_inference' }, 'branch');
    });
  }

  const allKeyPeople = Array.from(keyPeopleMap.values());
  const allKeyPeopleJson = allKeyPeople.length > 0 ? JSON.stringify(allKeyPeople) : null;

  const bestKeyPerson = allKeyPeople.find((p) => /director|ceo|founder|president|managing/i.test(p.title || '')) ||
                        allKeyPeople.find((p) => p.email && p.email === emailToInfer) ||
                        allKeyPeople[0] || null;

  const discoveredPic = apolloPerson?.name || (place.pic_name?.trim() ? place.pic_name : bestKeyPerson?.name) || analysisOutput.pic_name || null;
  const discoveredPicTitle = apolloPerson?.title || (place.pic_name?.trim() ? place.pic_title : bestKeyPerson?.title) || analysisOutput.pic_title || null;
  const primaryPhone = apolloPerson?.phone || signals.primaryPhone || (signals.phones && signals.phones[0]) || googlePlace?.phone || analysisOutput.whatsapp || null;
  const secondaryPhone = signals.secondaryPhone || analysisOutput.secondary_phone || null;
  const discoveredWa = signals.whatsapp || analysisOutput.whatsapp || null;
  const allPhonesJson = signals.phonesDetailed && signals.phonesDetailed.length > 0 ? JSON.stringify(signals.phonesDetailed) : null;

  const primaryEmail = apolloPerson?.email || bestKeyPerson?.email || signals.primaryEmail || (signals.emails && signals.emails[0]) || null;
  const allEmailsJson = signals.emailsDetailed && signals.emailsDetailed.length > 0 ? JSON.stringify(signals.emailsDetailed) : null;

  const companyLi = signals.linkedinUrl || apolloPerson?.linkedin_url || analysisOutput.linkedin_url || null;
  const picLi = signals.picLinkedinUrl || analysisOutput.pic_linkedin_url || null;
  const discoveredWebsite = googlePlace?.website || (sourceUrl.startsWith('http') ? sourceUrl : null);

  // 10. Store in analyses table
  const analysisId = `an_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();
  const searchIntelligence = (searchAnswer || searchSnippets.length > 0 || searchRes?.images?.length > 0 || visualAssets || searchRes?.sourcesCited?.length > 0) ? {
    answer: searchAnswer,
    snippets: searchSnippets,
    sources_cited: searchRes?.sourcesCited || [],
    operational_bottlenecks: analysisOutput.operational_bottlenecks || analysisOutput.observed_bottleneck || null,
    socials: searchSocials,
    images: searchRes?.images || [],
    visualAssets: visualAssets || null,
    source: searchRes?.source || 'serverless_deep_research'
  } : null;

  await db.execute({
    sql: `
      INSERT INTO analyses (
        id, place_id, version, summary, products, needs, use_cases, unknowns, source_url, raw_text, crawled_pages, search_intelligence, google_place, key_people, created_by, created_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AI Intelijen', ?)
      ON CONFLICT(place_id) DO UPDATE SET
        summary = excluded.summary,
        products = excluded.products,
        needs = excluded.needs,
        use_cases = excluded.use_cases,
        unknowns = excluded.unknowns,
        source_url = excluded.source_url,
        raw_text = excluded.raw_text,
        crawled_pages = excluded.crawled_pages,
        search_intelligence = excluded.search_intelligence,
        google_place = excluded.google_place,
        key_people = excluded.key_people,
        created_at = excluded.created_at;
    `,
    args: [
      analysisId,
      placeId,
      analysisOutput.summary || '',
      analysisOutput.products || '',
      JSON.stringify(analysisOutput.needs || []),
      JSON.stringify(analysisOutput.use_cases || []),
      JSON.stringify(analysisOutput.unknowns || []),
      sourceUrl,
      extractedText.slice(0, 20000),
      JSON.stringify(crawledPages),
      searchIntelligence ? JSON.stringify(searchIntelligence) : null,
      googlePlace ? JSON.stringify(googlePlace) : null,
      allKeyPeopleJson,
      nowIso
    ]
  });

  // 11. Update place reach_status to 'analyzed', and persist discovered contact signals & bottlenecks
  await db.execute({
    sql: `
      UPDATE places SET 
        reach_status = CASE WHEN reach_status = 'new' OR reach_status IS NULL THEN 'analyzed' ELSE reach_status END,
        pic_name = COALESCE(NULLIF(places.pic_name, ''), ?),
        pic_title = COALESCE(NULLIF(places.pic_title, ''), ?),
        key_people = COALESCE(?, places.key_people),
        phone = COALESCE(NULLIF(places.phone, ''), ?),
        phone_secondary = COALESCE(NULLIF(places.phone_secondary, ''), ?),
        whatsapp = COALESCE(NULLIF(places.whatsapp, ''), ?),
        all_phones = COALESCE(?, places.all_phones),
        email = COALESCE(NULLIF(places.email, ''), ?),
        all_emails = COALESCE(?, places.all_emails),
        website = COALESCE(NULLIF(places.website, ''), ?),
        linkedin_url = COALESCE(NULLIF(places.linkedin_url, ''), ?),
        pic_linkedin_url = COALESCE(NULLIF(places.pic_linkedin_url, ''), ?),
        budget_capacity = COALESCE(NULLIF(places.budget_capacity, ''), ?),
        budget_notes = COALESCE(NULLIF(places.budget_notes, ''), ?),
        website_condition = COALESCE(NULLIF(places.website_condition, ''), ?),
        social_condition = COALESCE(NULLIF(places.social_condition, ''), ?),
        offer_angle = COALESCE(NULLIF(places.offer_angle, ''), ?),
        notes = COALESCE(NULLIF(places.notes, ''), ?),
        sg_notes = COALESCE(NULLIF(places.sg_notes, ''), ?)
      WHERE overture_id = ?;
    `,
    args: [
      discoveredPic,
      discoveredPicTitle,
      allKeyPeopleJson,
      primaryPhone,
      secondaryPhone,
      discoveredWa,
      allPhonesJson,
      primaryEmail,
      allEmailsJson,
      discoveredWebsite,
      companyLi,
      picLi,
      analysisOutput.budget_capacity || 'medium',
      analysisOutput.budget_notes || null,
      analysisOutput.website_condition || (sourceUrl ? 'outdated' : 'none'),
      analysisOutput.social_condition || 'inactive',
      analysisOutput.offer_angle || 'digital_structure',
      analysisOutput.observed_bottleneck || null,
      analysisOutput.observed_bottleneck || null,
      placeId
    ]
  });

  // Recalculate icp_score for this place in master places table
  await dbWrite.execute({
    sql: `UPDATE places SET icp_score = (
      CASE WHEN email IS NOT NULL AND email != '' AND email LIKE '%@%' THEN 30 ELSE 0 END +
      CASE WHEN pic_name IS NOT NULL AND pic_name != '' THEN 25 ELSE 0 END +
      CASE WHEN LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%clinic%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%engineering%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%logistics%'
            OR LOWER(COALESCE(category_raw, '') || ' ' || COALESCE(bidang_usaha, '')) LIKE '%trading%'
           THEN 25 ELSE 0 END +
      CASE WHEN website_condition IN ('none', 'outdated') THEN 20 ELSE 0 END
    ) WHERE overture_id = ?;`,
    args: [placeId]
  });

  const scoreRes = await dbWrite.execute({
    sql: `SELECT icp_score FROM places WHERE overture_id = ? LIMIT 1;`,
    args: [placeId]
  });
  const updatedIcpScore = scoreRes.rows?.[0]?.icp_score ?? 0;

  invalidateCache();

  return {
    success: true,
    icp_score: updatedIcpScore,
    discoveredWebsite,
    discoveredPic,
    discoveredPicTitle,
    discoveredPhone: primaryPhone,
    discoveredEmail: primaryEmail,
    discoveredLinkedin: companyLi,
    key_people: allKeyPeople,
    googlePlace,
    searchRes,
    analysis: {
      id: analysisId,
      place_id: placeId,
      ...analysisOutput,
      key_people: allKeyPeople,
      source_url: sourceUrl,
      crawled_pages: crawledPages,
      website: discoveredWebsite,
      linkedin_url: companyLi,
      search_intelligence: searchIntelligence,
      google_place: googlePlace,
      created_at: nowIso
    }
  };
}
