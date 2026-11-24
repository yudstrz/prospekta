/**
 * Apollo.io B2B Intelligence Integration
 * Matches company domains to decision makers (CEO, Director, Owner) and returns verified email & LinkedIn.
 */

export async function lookupApolloPerson({ companyName, domain }) {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      reason: 'NO_API_KEY',
      message: 'APOLLO_API_KEY is not configured in environment.'
    };
  }

  try {
    const cleanDomain = domain ? domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim() : null;

    // Use Apollo's mixed_people search to find decision makers for this organization
    const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        api_key: apiKey,
        q_organization_domains: cleanDomain || undefined,
        q_organization_name: !cleanDomain ? companyName : undefined,
        person_titles: [
          'CEO',
          'Chief Executive Officer',
          'Founder',
          'Co-Founder',
          'Managing Director',
          'Director',
          'Owner',
          'Clinic Director',
          'General Manager'
        ],
        page: 1,
        per_page: 1
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, status: res.status, error: errText };
    }

    const data = await res.json();
    const person = data.people && data.people.length > 0 ? data.people[0] : null;

    if (!person) {
      return { success: false, reason: 'NO_PERSON_FOUND' };
    }

    const phone = person.phone_numbers && person.phone_numbers.length > 0 ? person.phone_numbers[0] : null;

    return {
      success: true,
      person: {
        name: person.name || `${person.first_name || ''} ${person.last_name || ''}`.trim(),
        title: person.title || 'Executive',
        email: person.email || null,
        linkedin_url: person.linkedin_url || null,
        phone: phone || null
      }
    };
  } catch (err) {
    console.error('Apollo lookup error:', err);
    return { success: false, error: err.message };
  }
}
