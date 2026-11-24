import { NextResponse } from 'next/server';

// In-memory cache for geocoding search queries (10 minutes TTL)
const searchCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ success: true, results: [] });
    }

    const cacheKey = query.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, results: cached.data });
    }

    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`;
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'ProspektaApp/1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.status}`);
    }

    const data = await res.json();
    const results = (Array.isArray(data) ? data : []).map((item) => {
      const addr = item.address || {};
      const primaryName = item.name || addr.amenity || addr.building || addr.road || item.display_name.split(',')[0].trim();
      const city = addr.city || addr.town || addr.municipality || addr.state || addr.country || 'Kota';

      return {
        id: item.place_id,
        name: primaryName,
        displayName: item.display_name,
        city: city,
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      };
    });

    // Cache results
    searchCache.set(cacheKey, { timestamp: Date.now(), data: results });
    if (searchCache.size > 200) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('Geo search API error:', err.message);
    return NextResponse.json({ success: false, error: err.message, results: [] }, { status: 500 });
  }
}
