import { NextResponse } from 'next/server';

// In-memory cache for reverse geocoding queries (15 minutes TTL)
const reverseCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ success: false, error: 'Parameter lat dan lng diperlukan.' }, { status: 400 });
    }

    const roundedLat = lat.toFixed(4);
    const roundedLng = lng.toFixed(4);
    const cacheKey = `${roundedLat},${roundedLng}`;

    const cached = reverseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, place: cached.data });
    }

    const endpoint = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${roundedLat}&lon=${roundedLng}&addressdetails=1`;
    const res = await fetch(endpoint, {
      headers: {
        'User-Agent': 'ProspektaApp/1.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      throw new Error(`Nominatim reverse error: ${res.status}`);
    }

    const data = await res.json();
    const addr = data.address || {};
    
    // Pick the most meaningful short name
    const shortName = addr.amenity || addr.building || addr.road || addr.suburb || addr.neighbourhood || data.name || `Titik Koordinat (${roundedLat}, ${roundedLng})`;
    const city = addr.city || addr.town || addr.municipality || addr.state || addr.country || 'Kota';
    const address = data.display_name || `${shortName}, ${city}`;

    const placeResult = {
      name: shortName,
      city: city,
      address: address,
      displayName: data.display_name
    };

    reverseCache.set(cacheKey, { timestamp: Date.now(), data: placeResult });
    if (reverseCache.size > 200) {
      const oldestKey = reverseCache.keys().next().value;
      reverseCache.delete(oldestKey);
    }

    return NextResponse.json({ success: true, place: placeResult });
  } catch (err) {
    console.error('Geo reverse API error:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
