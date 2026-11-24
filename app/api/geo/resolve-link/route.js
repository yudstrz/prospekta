import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const extractCoords = (str) => {
  if (!str) return null;
  // Raw coords: -6.9025, 107.6188 or -6.9025 107.6188
  const rawMatch = str.trim().match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (rawMatch) return { lat: parseFloat(rawMatch[1]), lng: parseFloat(rawMatch[2]) };

  // Google Maps @lat,lng
  const atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

  // Google Maps q=lat,lng or query=lat,lng
  const qMatch = str.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

  // Google Maps protobuf !3dlat!4dlng
  const protoMatch = str.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (protoMatch) return { lat: parseFloat(protoMatch[1]), lng: parseFloat(protoMatch[2]) };

  return null;
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = (searchParams.get('url') || '').trim();

    if (!targetUrl) {
      return NextResponse.json({ success: false, error: 'URL diperlukan.' }, { status: 400 });
    }

    // Direct check if targetUrl already contains coords
    let coords = extractCoords(targetUrl);

    // If it's a short URL (goo.gl / maps.app.goo.gl), resolve redirect
    if (!coords && (targetUrl.includes('goo.gl') || targetUrl.includes('maps.app.goo.gl'))) {
      try {
        const res = await fetch(targetUrl, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(6000)
        });

        const finalUrl = res.url || '';
        coords = extractCoords(finalUrl);

        if (!coords) {
          // Check HTML content for og:image or canonical meta tags containing coords
          const html = await res.text().catch(() => '');
          coords = extractCoords(html);
        }
      } catch (fetchErr) {
        // Fallback to manual redirect if follow fails
        try {
          const res = await fetch(targetUrl, {
            method: 'HEAD',
            redirect: 'manual',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(4000)
          });
          const loc = res.headers.get('location') || '';
          coords = extractCoords(loc);
        } catch (_) {}
      }
    }

    if (!coords) {
      return NextResponse.json({
        success: false,
        error: 'Tidak dapat mengekstrak koordinat dari link tersebut. Silakan pilih titik langsung di peta.'
      }, { status: 422 });
    }

    // Reverse geocode to get human-readable address
    let placeInfo = null;
    try {
      const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&addressdetails=1`, {
        headers: {
          'User-Agent': 'ProspektaApp/1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (revRes.ok) {
        const data = await revRes.json();
        const addr = data.address || {};
        const shortName = addr.amenity || addr.building || addr.road || addr.suburb || data.name || 'Lokasi Terpilih';
        const city = addr.city || addr.town || addr.municipality || addr.state || 'Kota';
        placeInfo = {
          name: shortName,
          city: city,
          address: data.display_name || `${shortName}, ${city}`
        };
      }
    } catch (_) {}

    return NextResponse.json({
      success: true,
      lat: coords.lat,
      lng: coords.lng,
      place: placeInfo
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
