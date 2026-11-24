import { db } from './db.js';

let cachedRules = null;
let lastFetchTime = 0;

async function getCategoryRules() {
  const now = Date.now();
  if (cachedRules && now - lastFetchTime < 60000) {
    return cachedRules;
  }

  try {
    const result = await db.execute('SELECT category_key, bidang_usaha FROM category_rules ORDER BY id ASC;');
    cachedRules = result.rows || [];
    lastFetchTime = now;
    return cachedRules;
  } catch (err) {
    console.error('Failed to load category rules from DB, using fallback:', err);
    return [];
  }
}

export async function mapCategoryToBidang(rawCategory) {
  if (!rawCategory) return 'Lainnya';

  const rules = await getCategoryRules();
  const lower = rawCategory.toLowerCase();

  for (const rule of rules) {
    if (lower.includes(rule.category_key.toLowerCase())) {
      return rule.bidang_usaha;
    }
  }

  // Common fallbacks
  if (lower.includes('tech') || lower.includes('software') || lower.includes('computer')) {
    return 'Teknologi Informasi & Software';
  }
  if (lower.includes('consult')) {
    return 'Konsultan & Manajemen';
  }
  if (lower.includes('bank') || lower.includes('finance')) {
    return 'Perbankan & Finansial';
  }
  if (lower.includes('market') || lower.includes('advert')) {
    return 'Pemasaran & Periklanan';
  }
  if (lower.includes('office') || lower.includes('corporate')) {
    return 'Kantor Perusahaan & Korporasi';
  }
  if (lower.includes('school') || lower.includes('education') || lower.includes('academy')) {
    return 'Pendidikan & Pelatihan';
  }

  return 'Umum / ' + rawCategory.replace(/_/g, ' ');
}
