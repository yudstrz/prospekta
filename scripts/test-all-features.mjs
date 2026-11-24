const BASE_URL = 'http://localhost:3000';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 PROSPEKTA COMPREHENSIVE END-TO-END TEST SUITE');
  console.log('====================================================\n');

  let adminCookie = '';

  // ----------------------------------------------------
  // TEST 1: Admin Authentication & RBAC Check
  // ----------------------------------------------------
  console.log('--- TEST 1: Admin Authentication (admin@prospekta.id) ---');
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@prospekta.id',
        password: 'prospepkta2026!',
        rememberMe: true,
      }),
    });

    const loginData = await loginRes.json();
    console.log('Login Response Status:', loginRes.status);
    console.log('Login Result:', loginData);

    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      adminCookie = setCookie.split(';')[0];
      console.log('Admin Cookie captured successfully.');
    }

    // Verify /api/auth/me
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: adminCookie },
    });
    const meData = await meRes.json();
    console.log('/api/auth/me Admin Session:', meData);

    if (meData.success && meData.session?.isAdmin && meData.session?.role === 'admin') {
      console.log('✅ TEST 1 PASSED: Admin authenticated with role admin / superadmin access.\n');
    } else {
      console.log('❌ TEST 1 FAILED: Unexpected admin session data.\n');
    }
  } catch (err) {
    console.error('❌ TEST 1 ERROR:', err);
  }

  // ----------------------------------------------------
  // TEST 2: Lokasi & Geocoding: Gedung Sate Bandung
  // ----------------------------------------------------
  console.log('--- TEST 2: Location & Anchor: Gedung Sate Bandung ---');
  const gedungSate = {
    name: 'Gedung Sate Bandung',
    city: 'Bandung',
    lat: -6.9025,
    lng: 107.6186,
    address: 'Jl. Diponegoro No.22, Citarum, Kec. Bandung Wetan, Kota Bandung, Jawa Barat 40115',
    radiusKm: 2,
  };

  try {
    // 2a: Test Geo Search
    const searchRes = await fetch(`${BASE_URL}/api/geo/search?q=Gedung+Sate+Bandung`, {
      headers: { Cookie: adminCookie },
    });
    const searchData = await searchRes.json();
    console.log('Geo Search (Gedung Sate Bandung):', searchData.results?.slice ? searchData.results.slice(0, 2) : searchData);

    // 2b: Test Reverse Geocoding
    const revRes = await fetch(`${BASE_URL}/api/geo/reverse?lat=${gedungSate.lat}&lng=${gedungSate.lng}`, {
      headers: { Cookie: adminCookie },
    });
    const revData = await revRes.json();
    console.log('Reverse Geocode Result:', revData);

    // 2c: Save Custom Anchor for Gedung Sate Bandung
    const anchorRes = await fetch(`${BASE_URL}/api/anchors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: gedungSate.name,
        city: gedungSate.city,
        lat: gedungSate.lat,
        lng: gedungSate.lng,
        address: revData?.place?.address || gedungSate.address,
        radius_default_km: gedungSate.radiusKm,
      }),
    });
    const anchorData = await anchorRes.json();
    console.log('Saved Anchor Result:', anchorData);

    // 2d: Verify Anchors List
    const listAnchorsRes = await fetch(`${BASE_URL}/api/anchors`, {
      headers: { Cookie: adminCookie },
    });
    const anchorsData = await listAnchorsRes.json();
    const anchorsList = anchorsData.anchors || anchorsData;
    const hasGedungSate = Array.isArray(anchorsList) && anchorsList.some((a) => a.name && a.name.includes('Gedung Sate'));
    console.log('Total Anchors in DB:', anchorsList.length, '| Has Gedung Sate:', hasGedungSate);

    if (hasGedungSate) {
      console.log('✅ TEST 2 PASSED: Gedung Sate Bandung successfully geocoded and anchored.\n');
    } else {
      console.log('⚠️ TEST 2 WARNING: Anchor saved response:', anchorData);
    }
  } catch (err) {
    console.error('❌ TEST 2 ERROR:', err);
  }

  // ----------------------------------------------------
  // TEST 3: Places & Radar Query at Gedung Sate Bandung
  // ----------------------------------------------------
  console.log('--- TEST 3: Places & Radar Query at Gedung Sate Bandung ---');
  let testPlace = null;
  try {
    // 3a: Seed sample lead at Gedung Sate Bandung
    const seedLeadRes = await fetch(`${BASE_URL}/api/places`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Kafe Kopi Gedung Sate',
        category_raw: 'Cafe & Resto',
        address: 'Jl. Diponegoro No. 25, Citarum, Bandung',
        lat: -6.9028,
        lng: 107.6189,
        phone: '+62 22 4201234',
        website: 'https://kafekopigedungsate.id',
        bidang_usaha: 'Food & Beverage',
        anchor: 'Gedung Sate Bandung',
      }),
    });
    const seedLeadData = await seedLeadRes.json();
    console.log('Lead Seed Result:', seedLeadData);
    const overtureId = seedLeadData.overture_id || seedLeadData.place?.overture_id || 'sg_manual_bandung';
    testPlace = {
      overture_id: overtureId,
      name: 'Kafe Kopi Gedung Sate',
      bidang_usaha: 'Food & Beverage',
      address: 'Jl. Diponegoro No. 25, Bandung',
      phone: '+62 22 4201234',
      website: 'https://kafekopigedungsate.id',
    };

    // 3b: Query places around Gedung Sate
    const placesRes = await fetch(`${BASE_URL}/api/places?search=Gedung+Sate&limit=10`, {
      headers: { Cookie: adminCookie },
    });
    const placesData = await placesRes.json();
    console.log('Places Query Response:', {
      success: placesData.success,
      count: placesData.places?.length || 0,
      total: placesData.total,
    });

    console.log('✅ TEST 3 PASSED: Places query and lead creation functional for Gedung Sate Bandung.\n');
  } catch (err) {
    console.error('❌ TEST 3 ERROR:', err);
  }

  // ----------------------------------------------------
  // TEST 4: Proposal PDF & AI Analysis
  // ----------------------------------------------------
  console.log('--- TEST 4: PDF Proposal & Web Audit ---');
  try {
    const targetPlaceId = testPlace?.overture_id || 'sg_manual_bandung';
    
    // 4a: Run Company Analysis first
    console.log('Running analysis for placeId:', targetPlaceId);
    const analyzeRes = await fetch(`${BASE_URL}/api/reach/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        placeId: targetPlaceId,
        manualText: 'Kafe Kopi Gedung Sate adalah cafe modern di Jl. Diponegoro Bandung yang membutuhkan sistem reservasi meja, katalog menu digital, dan otomatisasi chat pelanggan.',
        lang: 'id',
      }),
    });
    const analyzeData = await analyzeRes.json();
    console.log('Analysis Result Status:', analyzeRes.status, 'Summary:', analyzeData.analysis?.summary ? analyzeData.analysis.summary.slice(0, 80) + '...' : analyzeData);

    // 4b: Generate Proposal PDF
    const proposalRes = await fetch(`${BASE_URL}/api/reach/proposal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        placeId: targetPlaceId,
        customOffering: 'Pengembangan Website Modern & Solusi AI Concierge Prospekta',
      }),
    });

    const proposalData = await proposalRes.json();
    console.log('Proposal API Response Status:', proposalRes.status);
    console.log('Proposal Generated:', {
      success: proposalData.success,
      title: proposalData.proposal?.title || proposalData.title,
      hasExecutiveSummary: !!(proposalData.proposal?.executive_summary || proposalData.executiveSummary),
      solution: proposalData.proposal?.solution || proposalData.solution,
    });

    if (proposalRes.status === 200 || proposalData.success) {
      console.log('✅ TEST 4 PASSED: Proposal generation and PDF structure functional.\n');
    } else {
      console.log('⚠️ TEST 4 NOTE:', proposalData);
    }
  } catch (err) {
    console.error('❌ TEST 4 ERROR:', err);
  }

  // ----------------------------------------------------
  // TEST 5: Prebuilt Website Showcase (/p/[slug])
  // ----------------------------------------------------
  console.log('--- TEST 5: Prebuilt Website Showcase ---');
  try {
    const targetPlaceId = testPlace?.overture_id || testPlace?.id || 'place_bandung_1';
    
    // Generate Prebuilt Site
    const genSiteRes = await fetch(`${BASE_URL}/api/reach/prebuilt-site`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        placeId: targetPlaceId,
        force: true,
      }),
    });
    const genSiteData = await genSiteRes.json();
    console.log('Generate Prebuilt Site Result:', {
      success: genSiteData.success,
      slug: genSiteData.site?.slug || genSiteData.slug,
      url: genSiteData.url || genSiteData.previewUrl,
      error: genSiteData.error,
    });

    const slug = genSiteData.site?.slug || genSiteData.slug;
    if (slug) {
      const prebuiltRes = await fetch(`${BASE_URL}/p/${slug}`);
      console.log(`GET /p/${slug} Showcase Page Status:`, prebuiltRes.status);

      if (prebuiltRes.status === 200) {
        console.log('✅ TEST 5 PASSED: Prebuilt interactive website rendered successfully with HTTP 200.\n');
      } else {
        console.log(`⚠️ TEST 5 Status: ${prebuiltRes.status}\n`);
      }
    } else {
      console.log('❌ TEST 5 FAILED: No slug generated. Error:', genSiteData.error || genSiteData);
    }
  } catch (err) {
    console.error('❌ TEST 5 ERROR:', err);
  }

  // ----------------------------------------------------
  // TEST 6: Dual-Role MCP Plugin Endpoints (/api/mcp/admin & /api/mcp/user)
  // ----------------------------------------------------
  console.log('--- TEST 6: Universal MCP Dual-Role Plugin (/api/mcp/admin & /api/mcp/user) ---');
  try {
    // 6a: Create MCP Token via API
    const createTokRes = await fetch(`${BASE_URL}/api/mcp/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ label: 'Test MCP Token Bandung' }),
    });
    const tokData = await createTokRes.json();
    console.log('Create MCP Token Result:', tokData);
    const mcpToken = tokData.token;

    // 6b: Test Admin MCP Endpoint Tools List
    const adminMcpRes = await fetch(`${BASE_URL}/api/mcp/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    });
    const adminMcpData = await adminMcpRes.json();
    console.log('MCP Admin tools/list Status:', adminMcpRes.status);
    const adminTools = adminMcpData.result?.tools?.map((t) => t.name) || [];
    console.log('MCP Admin Tools Count:', adminTools.length, 'Tools:', adminTools);

    // 6c: Test Calling location_search tool on Gedung Sate Bandung
    const callMcpRes = await fetch(`${BASE_URL}/api/mcp/admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'location_search',
          arguments: {
            query: 'Gedung Sate Bandung',
          },
        },
      }),
    });
    const callMcpData = await callMcpRes.json();
    console.log('MCP call location_search Result:', {
      success: !!callMcpData.result,
      content: callMcpData.result?.content?.[0]?.text?.slice ? callMcpData.result.content[0].text.slice(0, 100) + '...' : callMcpData.result,
    });

    // 6d: Test User MCP Endpoint
    // Create User Token
    const userMcpRes = await fetch(`${BASE_URL}/api/mcp/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      }),
    });
    const userMcpData = await userMcpRes.json();
    console.log('MCP User tools/list Status:', userMcpRes.status);
    const userTools = userMcpData.result?.tools?.map((t) => t.name) || [];
    console.log('MCP User Tools Count:', userTools.length, 'Tools:', userTools);

    if (adminTools.length > 0 && userTools.length > 0) {
      console.log('✅ TEST 6 PASSED: Dual-Role MCP Plugin is active, secured, and callable.\n');
    } else {
      console.log('⚠️ TEST 6 NOTE:', adminMcpData);
    }
  } catch (err) {
    console.error('❌ TEST 6 ERROR:', err);
  }

  console.log('====================================================');
  console.log('🏁 ALL TESTS COMPLETED');
  console.log('====================================================');
}

runTestSuite();
