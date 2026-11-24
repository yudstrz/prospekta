import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`Python overture exited code ${code}: ${stderrData}`));
      }
      try {
        const places = JSON.parse(stdoutData || '[]');
        resolve(places);
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
 * Solusi A: Live POI discovery via Photon (OSM) - Zero dependency, zero API key, runs in Vercel.
 */
export async function fetchPlacesFromPhoton(minLon, minLat, maxLon, maxLat) {
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const queries = ['pt', 'kantor', 'office', 'company', 'klinik', 'bank', 'corp', 'agency'];
  const placesMap = new Map();

  await Promise.all(
    queries.map(async (q) => {
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${centerLat}&lon=${centerLon}&limit=25`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Prospekta/1.0 (admin@prospekta.id)' },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const f of data.features || []) {
          const p = f.properties || {};
          const coords = f.geometry?.coordinates;
          if (!coords || !coords[0] || !coords[1]) continue;
          const lon = coords[0];
          const lat = coords[1];

          // Pastikan berada di dalam bounding box area scan
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
      } catch (_) { }
    })
  );

  return Array.from(placesMap.values());
}

/**
 * Solusi A (Google Places Nearby): Aktif jika GOOGLE_PLACES_API_KEY tersedia di env.
 */
export async function fetchPlacesFromGoogleNearby(centerLat, centerLon, radiusMeters = 2000) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${centerLat},${centerLon}&radius=${radiusMeters}&type=establishment&key=${apiKey}`;
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
 * 2. Fallback Solusi A: Photon OpenStreetMap + Google Places (Serverless Vercel ready)
 */
export async function fetchOverturePlaces(minLon, minLat, maxLon, maxLat) {
  // 1. Coba via Python Overture lokal jika tersedia
  try {
    const pyPlaces = await runPythonOverture(minLon, minLat, maxLon, maxLat);
    if (Array.isArray(pyPlaces) && pyPlaces.length > 0) {
      return pyPlaces;
    }
  } catch (pyErr) {
    // Abaikan jika Python tidak terpasang (misal di Vercel serverless) dan lanjut ke Solusi A
  }

  // 2. Solusi A: Live REST fetcher (Photon OSM + Google Places)
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  const [osmPlaces, googlePlaces] = await Promise.all([
    fetchPlacesFromPhoton(minLon, minLat, maxLon, maxLat),
    fetchPlacesFromGoogleNearby(centerLat, centerLon, 2500),
  ]);

  const combined = new Map();
  for (const p of [...googlePlaces, ...osmPlaces]) {
    if (p.name && !combined.has(p.id)) {
      combined.set(p.id, p);
    }
  }

  return Array.from(combined.values());
}
