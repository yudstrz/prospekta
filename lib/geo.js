/**
 * Geo calculation helpers
 */

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Splits a circle area into a grid of tiles (approx 4x4 km each).
 * 1 deg latitude is approx 111.32 km.
 * 1 deg longitude at equator is approx 111.32 * cos(lat) km.
 */
export function generateTiles(centerLat, centerLng, radiusKm, tileSizeKm = 4) {
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((centerLat * Math.PI) / 180);

  const deltaLat = radiusKm / kmPerDegLat;
  const deltaLng = radiusKm / kmPerDegLng;

  const minLat = centerLat - deltaLat;
  const maxLat = centerLat + deltaLat;
  const minLng = centerLng - deltaLng;
  const maxLng = centerLng + deltaLng;

  const stepLat = tileSizeKm / kmPerDegLat;
  const stepLng = tileSizeKm / kmPerDegLng;

  const tiles = [];
  let tileIndex = 0;

  for (let lat = minLat; lat < maxLat; lat += stepLat) {
    for (let lng = minLng; lng < maxLng; lng += stepLng) {
      const tileMinLat = lat;
      const tileMaxLat = Math.min(lat + stepLat, maxLat);
      const tileMinLng = lng;
      const tileMaxLng = Math.min(lng + stepLng, maxLng);

      tiles.push({
        id: `tile_${tileIndex++}`,
        minLat: parseFloat(tileMinLat.toFixed(6)),
        maxLat: parseFloat(tileMaxLat.toFixed(6)),
        minLng: parseFloat(tileMinLng.toFixed(6)),
        maxLng: parseFloat(tileMaxLng.toFixed(6)),
        centerLat: (tileMinLat + tileMaxLat) / 2,
        centerLng: (tileMinLng + tileMaxLng) / 2
      });
    }
  }

  return {
    totalTiles: tiles.length,
    bounds: { minLat, maxLat, minLng, maxLng },
    tiles
  };
}

export async function geocodeAddress(query) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { 'User-Agent': 'ProspektaApp/1.0' }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) throw new Error(`Geocoding gagal (${res.status})`);
  const [hit] = await res.json();
  if (!hit) return null;
  return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), display: hit.display_name };
}
