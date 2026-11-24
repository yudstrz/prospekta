/**
 * Google Places API integration for real metrics: rating, reviews, hours, and place details.
 */

/**
 * Mengambil detail tempat dari Google Maps Platform
 * @param {Object} params - { name, address, lat, lng }
 * @returns {Promise<Object|null>}
 */
export async function fetchGooglePlaceDetails({ name, address = '', lat, lng }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    // 1. Cari Place ID berdasarkan nama, alamat, dan koordinat
    const query = `${name} ${address}`.trim();
    const locationBias = (lat && lng) ? `&locationbias=point:${lat},${lng}` : '';
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery${locationBias}&fields=place_id,name,rating,user_ratings_total,geometry&key=${apiKey}`;

    const findRes = await fetch(findUrl, { signal: AbortSignal.timeout(10000) });
    if (!findRes.ok) return null;

    const findData = await findRes.json();
    const candidate = findData.candidates?.[0];
    if (!candidate?.place_id) return null;

    // 2. Ambil Place Details lengkap (rating, reviews, opening_hours, url, phone, website)
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${candidate.place_id}&fields=name,rating,user_ratings_total,formatted_phone_number,website,opening_hours,reviews,url,business_status&language=id&key=${apiKey}`;

    const detailsRes = await fetch(detailsUrl, { signal: AbortSignal.timeout(10000) });
    if (!detailsRes.ok) return null;

    const detailsData = await detailsRes.json();
    const result = detailsData.result;
    if (!result) return null;

    // Bersihkan ulasan pelanggan (ambil 3-5 ulasan terbaru yang ada teksnya)
    const reviews = (result.reviews || [])
      .filter((r) => r.text && r.text.trim().length > 10)
      .slice(0, 5)
      .map((r) => ({
        author: r.author_name || 'Pengunjung Google Maps',
        rating: r.rating || 5,
        text: r.text.slice(0, 280),
        relative_time: r.relative_time_description || ''
      }));

    return {
      place_id: candidate.place_id,
      name: result.name || name,
      rating: result.rating || null,
      user_ratings_total: result.user_ratings_total || 0,
      business_status: result.business_status || 'OPERATIONAL',
      is_open_now: result.opening_hours?.open_now ?? null,
      weekday_text: result.opening_hours?.weekday_text || [],
      phone: result.formatted_phone_number || null,
      website: result.website || null,
      maps_url: result.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address)}`,
      reviews
    };
  } catch (err) {
    console.warn('Google Places API fetch error:', err.message);
    return null;
  }
}
