import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const EXCLUDED_OSM_KEYS = new Set(['highway', 'boundary', 'place', 'natural', 'landuse', 'waterway', 'railway']);
const EXCLUDED_OSM_VALUES = new Set([
  'atm', 'bus_stop', 'parking', 'toilets', 'waste_basket', 'bench',
  'post_box', 'fuel', 'charging_station', 'place_of_worship', 'monument'
]);

const ARCGIS_CORE_CATS = [
  'Business Facility',
  'Shops and Service',
  'Bank',
  'Hospital',
  'Education',
  'Pharmacy',
  'Hotel',
  'Coffee Shop',
  'Restaurant',
];
const ARCGIS_RADIAL_CATS = ['Business Facility', 'Shops and Service', 'Bank', 'Hospital', 'Education'];

function normalizeWebsiteUrl(raw) {
  const s = (raw || '').trim();
  if (!s || !s.includes('.')) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function resolvePythonBinary() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  if (process.platform === 'win32') {
    const candidatePaths = [
      'C:\\Users\\SSD\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Windows\\py.exe',
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
    }
    return 'python';
  }
  return 'python3';
}

function runPythonOverture(minLon, minLat, maxLon, maxLat) {
  return new Promise((resolve, reject) => {
    if (process.env.NODE_ENV === 'production') {
      return reject(new Error('Python runtime unavailable in production serverless.'));
    }
    const pythonBin = resolvePythonBinary();
    const scriptPath = path.join(process.cwd(), 'scripts', 'overture_fetch.py');

    if (!fs.existsSync(/*turbopackIgnore: true*/ scriptPath)) {
      return reject(new Error('Script overture_fetch.py tidak ditemukan.'));
    }

    const pythonProcess = spawn(/*turbopackIgnore: true*/ pythonBin, [
      scriptPath,
      minLon.toString(),
      minLat.toString(),
      maxLon.toString(),
      maxLat.toString(),
    ]);

    let stdoutData = '';
    let stderrData = '';

    const timer = setTimeout(() => {
      try { pythonProcess.kill(); } catch (_) { }
      reject(new Error('Python overture timeout'));
    }, 5000);

    pythonProcess.stdout.on('data', (data) => { stdoutData += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { stderrData += data.toString(); });

    pythonProcess.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Python overture exited code ${code}: ${stderrData}`));
      try {
        resolve(JSON.parse(stdoutData || '[]'));
      } catch (err) {
        reject(err);
      }
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Spatial POI discovery via ArcGIS World Geocoder (gratis, tanpa API key, termasuk telepon & website).
 */
export async function fetchPlacesFromArcGis(centerLat, centerLon, radiusKm = 2) {
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.cos((centerLat * Math.PI) / 180);

  const samplePoints = [{ lat: centerLat, lon: centerLon, cats: ARCGIS_CORE_CATS }];
  if (radiusKm >= 4) {
    const off = radiusKm * 0.55;
    samplePoints.push(
      { lat: centerLat + off / kmPerLat, lon: centerLon, cats: ARCGIS_RADIAL_CATS },
      { lat: centerLat - off / kmPerLat, lon: centerLon, cats: ARCGIS_RADIAL_CATS },
      { lat: centerLat, lon: centerLon + off / kmPerLon, cats: ARCGIS_RADIAL_CATS },
      { lat: centerLat, lon: centerLon - off / kmPerLon, cats: ARCGIS_RADIAL_CATS }
    );
  }

  const distMeters = radiusKm >= 4 ? Math.round(radiusKm * 580) : Math.round(radiusKm * 1000);
  const tasks = [];

  for (const pt of samplePoints) {
    for (const cat of pt.cats) {
      const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?category=${encodeURIComponent(cat)}&location=${pt.lon.toFixed(6)},${pt.lat.toFixed(6)}&distance=${distMeters}&maxLocations=50&outFields=PlaceName,Place_addr,Type,Phone,URL&f=json`;
      tasks.push(
        fetch(url, { signal: AbortSignal.timeout(5000) })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      );
    }
  }

  const responses = await Promise.all(tasks);
  const placesMap = new Map();

  for (const data of responses) {
    for (const c of data?.candidates || []) {
      const a = c.attributes || {};
      const name = (a.PlaceName || c.address || '').trim();
      const lat = c.location?.y;
      const lng = c.location?.x;
      if (!name || name.length < 3 || !lat || !lng) continue;

      const dedupeKey = `${name.toLowerCase()}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
      if (placesMap.has(dedupeKey)) continue;

      const idHash = crypto.createHash('sha1').update(dedupeKey).digest('hex').slice(0, 14);
      placesMap.set(dedupeKey, {
        id: `arc_${idHash}`,
        name,
        category: a.Type || 'commercial',
        confidence: 0.9,
        address: (a.Place_addr || '').trim() || null,
        website: normalizeWebsiteUrl(a.URL),
        phone: (a.Phone || '').trim() || null,
        email: null,
        lat,
        lng,
      });
    }
  }

  return Array.from(placesMap.values());
}

/**
 * Spatial POI discovery via Photon (OSM) dibatasi bbox & concurrency aman agar tidak terkena rate-limit.
 */
export async function fetchPlacesFromPhoton(minLon, minLat, maxLon, maxLat) {
  const bbox = `${minLon.toFixed(6)},${minLat.toFixed(6)},${maxLon.toFixed(6)},${maxLat.toFixed(6)}`;
  const specs = [
    ['pt', null],
    ['kantor', null],
    ['a', 'office'],
    ['s', 'office'],
    ['b', 'office'],
  ];
  const placesMap = new Map();

  await Promise.all(
    specs.map(async ([q, osmTag]) => {
      try {
        const tagParam = osmTag ? `&osm_tag=${osmTag}` : '';
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&bbox=${bbox}${tagParam}&limit=50`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Prospekta/1.0 (admin@prospekta.id)' },
          signal: AbortSignal.timeout(3500),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const f of data.features || []) {
          const p = f.properties || {};
          if (EXCLUDED_OSM_KEYS.has(p.osm_key) || EXCLUDED_OSM_VALUES.has(p.osm_value)) continue;

          const coords = f.geometry?.coordinates;
          if (!coords || !coords[0] || !coords[1]) continue;
          const [lon, lat] = coords;
          if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;

          const name = (p.name || '').trim();
          if (!name || name.length < 3 || name.toLowerCase() === 'kantor') continue;

          const id = `osm_${p.osm_type || 'N'}_${p.osm_id || `${Math.round(lat * 10000)}_${Math.round(lon * 10000)}`}`;
          if (placesMap.has(id)) continue;

          const addrParts = [p.street, p.district, p.city, p.state, p.country].filter(Boolean);
          placesMap.set(id, {
            id,
            name,
            category: p.osm_value || p.osm_key || 'commercial',
            confidence: 0.85,
            address: addrParts.join(', ') || null,
            website: null,
            phone: null,
            email: null,
            lat,
            lng: lon,
          });
        }
      } catch (_) {}
    })
  );

  return Array.from(placesMap.values());
}

/**
 * Google Places Nearby: Aktif jika GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY tersedia di env.
 */
export async function fetchPlacesFromGoogleNearby(centerLat, centerLon, radiusMeters = 2000) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${centerLat},${centerLon}&radius=${Math.min(radiusMeters, 50000)}&type=establishment&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .map((r) => ({
        id: `gplace_${r.place_id}`,
        name: r.name,
        category: r.types?.[0] || 'establishment',
        confidence: 0.95,
        address: r.vicinity || null,
        website: null,
        phone: null,
        email: null,
        lat: r.geometry?.location?.lat,
        lng: r.geometry?.location?.lng,
      }))
      .filter((p) => p.lat && p.lng && p.name);
  } catch (_) {
    return [];
  }
}

/**
 * Multi-source Resilient Places Fetcher:
 * 1. Overture Maps (Python lokal/VM jika tersedia)
 * 2. Fallback serverless: ArcGIS POI + Photon OSM (bbox) + Google Places
 */
export async function fetchOverturePlaces(minLon, minLat, maxLon, maxLat, radiusKm = 2) {
  if (process.env.ENABLE_PYTHON_OVERTURE === 'true') {
    try {
      const pyPlaces = await runPythonOverture(minLon, minLat, maxLon, maxLat);
      if (Array.isArray(pyPlaces) && pyPlaces.length > 0) {
        return pyPlaces;
      }
    } catch (_) {}
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  const [arcPlaces, osmPlaces, googlePlaces] = await Promise.all([
    fetchPlacesFromArcGis(centerLat, centerLon, radiusKm),
    fetchPlacesFromPhoton(minLon, minLat, maxLon, maxLat),
    fetchPlacesFromGoogleNearby(centerLat, centerLon, Math.round(radiusKm * 1000)),
  ]);

  // Prioritas sumber terlengkap: Google -> ArcGIS (ada phone & web) -> Photon OSM
  const byId = new Map();
  const byNameCoord = new Set();

  for (const p of [...googlePlaces, ...arcPlaces, ...osmPlaces]) {
    if (!p?.name || !p.lat || !p.lng) continue;
    const nameCoord = `${p.name.trim().toLowerCase()}_${Number(p.lat).toFixed(4)}_${Number(p.lng).toFixed(4)}`;
    if (byId.has(p.id) || byNameCoord.has(nameCoord)) continue;
    byId.set(p.id, p);
    byNameCoord.add(nameCoord);
  }

  return Array.from(byId.values());
}
