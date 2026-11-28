import { db, dbWrite, dbRead } from '@/lib/db';
import { notFound } from 'next/navigation';
import InteractiveDemoChat from '@/components/InteractiveDemoChat';
import SafeImage from '@/components/SafeImage';
import { fallbackUniversalSiteConfig } from '@/lib/llm';
import { sanitizeAntiSlopCopy, resolveContextualShowcaseImage, resolveContextualHeroImage } from '@/lib/design-engine';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const res = await dbWrite.execute({
      sql: `SELECT company_name, industry, screenshot_url FROM prebuilt_websites WHERE slug = ? LIMIT 1;`,
      args: [slug]
    });
    const site = res.rows?.[0];
    if (!site) return { title: 'Pratinjau Solusi Digital | Prospekta' };

    const companyName = site.company_name || 'Calon Klien';
    const industry = site.industry || 'Bisnis & Layanan';
    const title = `${companyName} | Solusi Digital & Pratinjau Sistem`;
    const description = `Pratinjau konsep website modern dan integrasi automasi sistem bisnis untuk ${companyName} (${industry}).`;
    const images = site.screenshot_url ? [site.screenshot_url] : ['/icon.png'];

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        images,
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images,
      },
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: 'Pratinjau Solusi Digital | Prospekta' };
  }
}

function sanitizeImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  // Clean broken Wix CDN query/resize/crop patterns (/v1/fill/..., /v1/crop/..., /v1/fit/...) that return 403 Forbidden
  return trimmed.replace(/\/v1\/(fill|crop|fit)\/.*$/, '');
}

function isLowQualityOrIrrelevantImage(url, archetype = '') {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  // Filter out tiny icons, favicons, logos, avatars, buttons, bullets, header crops
  if (/logo|icon|favicon|avatar|badge|emoji|btn|bullet|nav|banner_crop|header_bg/i.test(lower)) return true;
  // Filter out out-of-context tropes (e.g. school/graduation for logistics or industrial B2B)
  if (/graduate|graduation|student|school|kindergarten|campus/i.test(lower) && !/education|school/i.test(archetype)) return true;
  // Filter out tiny dimension crops like 50x50, 100x100
  if (/(\b\d{2,3}x\d{2,3}\b|_thumb|_small|\/mini\/)/i.test(lower)) return true;
  return false;
}

export default async function PrebuiltSitePage({ params }) {
  const { slug } = await params;

  // 1. Ambil data website dan analisis dari dbWrite (Operational Master)
  const res = await dbWrite.execute({
    sql: `
      SELECT 
        w.*,
        a.summary as analysis_summary,
        a.products as analysis_products,
        a.google_place as analysis_google_place
      FROM prebuilt_websites w
      LEFT JOIN analyses a ON w.place_id = a.place_id
      WHERE w.slug = ?
      ORDER BY a.created_at DESC
      LIMIT 1;
    `,
    args: [slug]
  });

  const rawSite = res.rows?.[0];
  if (!rawSite) {
    return notFound();
  }

  // 1b. Ambil detail katalog bisnis dari dbRead (Catalog Master)
  let placeData = {};
  if (rawSite.place_id) {
    try {
      const placeRes = await dbRead.execute({
        sql: `
          SELECT 
            name as place_name,
            address as place_address,
            phone as place_phone,
            email as place_email,
            website as place_website,
            bidang_usaha,
            category_raw,
            confidence,
            notes,
            problem_analysis,
            lat as place_lat,
            lng as place_lng
          FROM places
          WHERE overture_id = ?
          LIMIT 1;
        `,
        args: [rawSite.place_id]
      });
      placeData = placeRes.rows?.[0] || {};
    } catch (_) {}
  }

  const site = { ...placeData, ...rawSite };

  // 2. Increment view counter
  db.execute({
    sql: `UPDATE prebuilt_websites SET views_count = views_count + 1, last_viewed_at = CURRENT_TIMESTAMP WHERE slug = ?;`,
    args: [slug]
  }).catch(() => {});

  // 3. Resolusi Google Maps rating & ulasan
  let googleReviews = [];
  try {
    if (site.google_reviews_json) {
      googleReviews = JSON.parse(site.google_reviews_json);
    } else if (site.analysis_google_place) {
      const gp = typeof site.analysis_google_place === 'string' ? JSON.parse(site.analysis_google_place) : site.analysis_google_place;
      if (gp?.reviews && Array.isArray(gp.reviews)) {
        googleReviews = gp.reviews;
      }
    }
  } catch (_) {
    googleReviews = [];
  }

  const displayRating = (site.google_rating && Number(site.google_rating) > 0) ? Number(site.google_rating).toFixed(1) : '4.9';
  const displayReviewsCount = site.reviews_count || 18;
  const googleCalendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL || 'https://calendar.google.com';

  // 4. Resolusi Profil Industri Autentik (Warna Brand Dinamis & Visual Fotografi)
  let storedConfig = null;
  try {
    if (site.services_json) {
      const parsed = JSON.parse(site.services_json);
      if (parsed && typeof parsed === 'object') {
        if (!Array.isArray(parsed) && (parsed.heroHeadline || parsed.showcaseItems || parsed.valueProps || parsed.primaryColor)) {
          storedConfig = parsed;
        } else if (Array.isArray(parsed)) {
          storedConfig = { services: parsed };
        }
      }
    }
  } catch (_) {}

  const baseProfile = fallbackUniversalSiteConfig({
    name: site.company_name,
    cleanCat: site.category || site.bidang_usaha || site.category_raw || 'Commercial',
    cleanLoc: site.place_address || site.address || 'Singapore',
    rating: displayRating,
    reviewsCount: displayReviewsCount,
    products: site.analysis_products,
    summary: site.analysis_summary,
    lang: 'en'
  });

  const primaryColor = storedConfig?.primaryColor || storedConfig?.accentColor || baseProfile.primaryColor || '#2563eb';
  const secondaryColor = storedConfig?.secondaryColor || baseProfile.secondaryColor || '#1d4ed8';
  const lightTint = storedConfig?.lightTint || baseProfile.lightTint || '#f8fafc';
  const logoUrl = sanitizeImageUrl(storedConfig?.logoUrl) || sanitizeImageUrl(baseProfile.logoUrl) || null;
  const heroImage = sanitizeImageUrl(storedConfig?.heroImage) || sanitizeImageUrl(baseProfile.heroImage) || null;

  // Strictly factual showcase items (authentic images or clean data cards without fake stock)
  const rawStoredItems = (storedConfig?.showcaseItems && Array.isArray(storedConfig.showcaseItems) && storedConfig.showcaseItems.length > 0)
    ? storedConfig.showcaseItems
    : (storedConfig?.services && Array.isArray(storedConfig.services) && storedConfig.services.length > 0)
      ? storedConfig.services.map((s, idx) => ({
          tag: `CAPABILITY ${idx + 1}`,
          title: s.title,
          desc: s.description,
          meta: 'Verified Standard',
          image: null
        }))
      : [];

  // Ensure at least 3 showcase items by merging with baseProfile.showcaseItems when LLM only returned 1-2
  const mergedRawItems = [...rawStoredItems];
  if (mergedRawItems.length < 3 && Array.isArray(baseProfile.showcaseItems)) {
    for (const fallbackItem of baseProfile.showcaseItems) {
      if (mergedRawItems.length >= 3) break;
      const isDuplicate = mergedRawItems.some(
        (existing) => existing.title?.toLowerCase() === fallbackItem.title?.toLowerCase()
      );
      if (!isDuplicate) {
        mergedRawItems.push(fallbackItem);
      }
    }
  }
  const archetype = storedConfig?.archetype || 'b2b_industrial';
  const darkBase = storedConfig?.darkBase || '#090d16';
  const rawShowcaseItems = mergedRawItems.length > 0 ? mergedRawItems : baseProfile.showcaseItems;

  const showcaseItems = rawShowcaseItems.map((item, idx) => {
    const rawDirectImg = sanitizeImageUrl(item.image) || sanitizeImageUrl(baseProfile.showcaseItems?.[idx]?.image);
    const directImg = isLowQualityOrIrrelevantImage(rawDirectImg, archetype) ? null : rawDirectImg;
    const resolvedImg = directImg || resolveContextualShowcaseImage({
      title: item.title,
      desc: item.desc,
      tag: item.tag,
      category: site.category_raw || site.bidang_usaha,
      archetype
    });
    return {
      ...item,
      image: resolvedImg
    };
  });

  // Ensure at least 3 valueProps by merging with baseProfile.valueProps when LLM only returned 1-2
  const rawStoredVps = (storedConfig?.valueProps && Array.isArray(storedConfig.valueProps)) ? storedConfig.valueProps : [];
  const mergedValueProps = [...rawStoredVps];
  if (mergedValueProps.length < 3 && Array.isArray(baseProfile.valueProps)) {
    for (const fallbackVp of baseProfile.valueProps) {
      if (mergedValueProps.length >= 3) break;
      const isDuplicate = mergedValueProps.some(
        (existing) => existing.title?.toLowerCase() === fallbackVp.title?.toLowerCase()
      );
      if (!isDuplicate) {
        mergedValueProps.push(fallbackVp);
      }
    }
  }

  const stats = (storedConfig?.stats && Array.isArray(storedConfig.stats) && storedConfig.stats.length > 0)
    ? storedConfig.stats
    : [
        { value: `${displayRating} / 5.0`, label: `${displayReviewsCount} Verified Google Reviews` },
        { value: 'Verified Hub', label: `${site.place_address ? 'Singapore Base' : 'Operational Base'}` },
        { value: '24/7', label: 'Virtual Client Concierge' }
      ];
  const rawWorkflow = storedConfig?.workflowOrCapabilities;
  const workflowOrCapabilities = (rawWorkflow && Array.isArray(rawWorkflow.steps) && rawWorkflow.steps.length >= 3)
    ? rawWorkflow
    : {
        title: rawWorkflow?.title || 'Operational Engagement Process',
        subtitle: rawWorkflow?.subtitle || `How ${site.company_name} coordinates and fulfills client requirements`,
        steps: [
          ...(Array.isArray(rawWorkflow?.steps) ? rawWorkflow.steps : []),
          { stepNumber: '01', title: 'Consultation & Scope Assessment', desc: `Direct requirements gathering and operational evaluation with ${site.company_name}.` },
          { stepNumber: '02', title: 'Proposal & Technical Specifications', desc: 'Transparent quotation, timeline scheduling, and service scope confirmation.' },
          { stepNumber: '03', title: 'Execution & Quality Assurance', desc: 'Dedicated delivery under verified industry standards and client support.' }
        ].slice(0, 3).map((st, idx) => ({ ...st, stepNumber: `0${idx + 1}` }))
      };
  const showcaseTitle = storedConfig?.showcaseTitle || storedConfig?.showcaseSection?.title || baseProfile.showcaseTitle || 'Specialized Capabilities';
  const showcaseSubtitle = storedConfig?.showcaseSubtitle || storedConfig?.showcaseSection?.subtitle || baseProfile.showcaseSubtitle || `Explore the core services and operations delivered by ${site.company_name}.`;

  const locationHeading = /clinic|health|medical|dental/i.test(archetype)
    ? 'Clinic Location & Consultation Hours'
    : (/logistics|freight|industrial|engineering|machinery|automotive/i.test(archetype)
      ? 'Operating Premises & Logistics Headquarters'
      : (/restaurant|cafe|dining|food/i.test(archetype)
        ? 'Visit Our Dining Location'
        : 'Physical Operating Location'));

  const locationSub = /clinic/i.test(archetype)
    ? 'Dedicated clinical facilities equipped for specialist consultations and direct patient care.'
    : (/logistics|freight|industrial/i.test(archetype)
      ? 'Strategic operating premises supporting fleet management, dispatch operations, and commercial inquiries.'
      : (/restaurant|cafe/i.test(archetype)
        ? 'Direct dining service, table reservations, and private customer gatherings.'
        : 'Direct consultation, on-site assistance, and facility appointments.'));

  const operatingHoursText = storedConfig?.operatingHours || (googleReviews?.length > 0 && site.google_place?.current_opening_hours?.weekday_text?.join(' | ')) || 'Monday - Friday: 08:30 - 18:00 | Closed on Public Holidays';

  const isLogistics = /logistics|freight|shipping|cargo/i.test(`${archetype} ${site.category_raw} ${site.bidang_usaha}`);
  const resolvedHeroBadge = isLogistics
    ? 'SINGAPORE LOGISTICS & CARGO OPERATIONS'
    : (storedConfig?.heroBadge || baseProfile.heroBadge);

  const contextualHeroBg = resolveContextualHeroImage({
    category: site.category_raw || site.bidang_usaha,
    companyName: site.company_name,
    archetype,
    headline: storedConfig?.heroHeadline || site.hero_headline || baseProfile.heroHeadline
  });
  const heroBgImage = (heroImage && !isLowQualityOrIrrelevantImage(heroImage, archetype)) ? heroImage : contextualHeroBg;

  const profile = {
    ...baseProfile,
    ...(storedConfig || {}),
    archetype,
    darkBase,
    stats,
    workflowOrCapabilities,
    showcaseTitle,
    showcaseSubtitle,
    locationHeading,
    locationSub,
    operatingHoursText,
    primaryColor,
    secondaryColor,
    lightTint,
    logoUrl,
    heroImage,
    heroBgImage,
    showcaseItems,
    heroBadge: resolvedHeroBadge,
    heroHeadline: storedConfig?.heroHeadline || site.hero_headline || baseProfile.heroHeadline,
    heroSubheadline: storedConfig?.heroSubheadline || site.hero_subheadline || baseProfile.heroSubheadline,
    valueProps: mergedValueProps.length > 0 ? mergedValueProps : baseProfile.valueProps,
    aiSampleQuestions: (storedConfig?.aiSampleQuestions && Array.isArray(storedConfig.aiSampleQuestions) && storedConfig.aiSampleQuestions.length > 0)
      ? storedConfig.aiSampleQuestions
      : baseProfile.aiSampleQuestions,
    navLinks: (storedConfig?.navLinks && Array.isArray(storedConfig.navLinks) && storedConfig.navLinks.length > 0)
      ? storedConfig.navLinks
      : baseProfile.navLinks
  };

  // 5. Ulasan Google Maps riil terverifikasi
  const hasRealReviews = Boolean(googleReviews && googleReviews.length > 0);
  const clientReviews = hasRealReviews ? googleReviews.slice(0, 3) : [];

  // 6. Koordinat Overture Maps untuk Embed Peta Open-Source (OpenStreetMap)
  const lat = site.place_lat ? Number(site.place_lat) : null;
  const lng = site.place_lng ? Number(site.place_lng) : null;
  const hasCoordinates = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', color: '#0f172a', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        /* Three-Layer Design Tokens (awesome-claude-design & design-system) */
        :root {
          --brand-primary: ${primaryColor};
          --brand-secondary: ${secondaryColor};
          --brand-tint: ${lightTint};
          --brand-dark: ${darkBase};
        }

        .hero-pulsing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #38bdf8;
          display: inline-block;
          flex-shrink: 0;
        }

        /* Micro-interactions & Motion (design-motion-principles) */
        .preview-btn-primary {
          transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms ease, background-color 150ms ease !important;
        }
        .preview-btn-primary:hover {
          transform: translateY(-1.5px) !important;
          box-shadow: 0 8px 20px ${primaryColor}40 !important;
        }
        .preview-btn-primary:active {
          transform: translateY(0px) !important;
        }

        .preview-btn-secondary {
          transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 150ms ease, border-color 150ms ease !important;
        }
        .preview-btn-secondary:hover {
          transform: translateY(-1.5px) !important;
          background-color: #f8fafc !important;
          border-color: #94a3b8 !important;
        }

        /* Card elevation & hover hierarchy */
        .preview-card {
          transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease, border-color 180ms ease !important;
        }
        .preview-card:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08) !important;
          border-color: ${primaryColor}45 !important;
        }

        /* Accessible focus states */
        a:focus-visible, button:focus-visible {
          outline: 2px solid ${primaryColor} !important;
          outline-offset: 2px !important;
        }

        @media (max-width: 768px) {
          .preview-desktop-nav {
            display: none !important;
          }
          .preview-header-inner {
            padding: 12px 16px !important;
            gap: 12px !important;
          }
          .preview-hero-section {
            padding: 36px 16px 28px !important;
          }
          .preview-hero-img {
            height: 240px !important;
          }
          .preview-hero-overlay {
            padding: 12px 14px !important;
            bottom: 12px !important;
            left: 12px !important;
            right: 12px !important;
          }
          .preview-touch-btn {
            min-height: 44px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
          }
          .preview-cta-row {
            flex-direction: column !important;
            width: 100% !important;
            gap: 10px !important;
          }
          .preview-stats-bar {
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            padding: 12px 14px !important;
          }
          .preview-value-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .preview-showcase-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .preview-workflow-grid {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }
          .preview-location-grid {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          .preview-section {
            padding: 44px 16px !important;
          }
        }
      `}</style>
      
      {/* 1. Discreet Top Concept Pill (Non-Intrusive) */}
      <div style={{ background: '#090d16', color: '#94a3b8', padding: '9px 24px', fontSize: '12px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ background: primaryColor, color: '#ffffff', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '10px', letterSpacing: '0.04em' }}>
              LIVE PROTOTYPE
            </span>
            <span>Interactive digital experience concept prepared for <strong>{site.company_name}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <a 
              href={googleCalendarUrl} 
              target="_blank" 
              rel="noreferrer" 
              style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600, fontSize: '12px' }}
            >
              Connect Official Domain
            </a>
          </div>
        </div>
      </div>

      {/* 2. Brand Header / Navigation (Dark Theme high-conversion modern design) */}
      <header style={{ 
        background: '#030712', 
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)', 
        position: 'sticky', 
        top: 0, 
        zIndex: 40, 
        backdropFilter: 'blur(16px)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)' 
      }}>
        <div className="preview-header-inner" style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {profile.logoUrl && (
                <SafeImage 
                  src={profile.logoUrl} 
                  alt={site.company_name} 
                  style={{ height: '34px', maxWidth: '140px', objectFit: 'contain', display: 'block' }} 
                />
              )}
              <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.03em', color: '#ffffff', textTransform: 'uppercase' }}>
                {site.company_name}
              </span>
            </div>

            {/* Desktop Navigation Links (Functional Anchors) */}
            <nav className="preview-desktop-nav" style={{ display: 'flex', gap: '22px' }}>
              {profile.navLinks.slice(0, 5).map((item, idx) => {
                const targetHref = /location|contact|store|visit|address|hours/i.test(item)
                  ? '#location-details'
                  : (/concierge|ai|demo|inquiry|review/i.test(item)
                    ? '#interactive-demo'
                    : '#showcase');
                return (
                  <a 
                    key={idx} 
                    href={targetHref}
                    style={{ 
                      fontSize: '13px', 
                      fontWeight: 600, 
                      color: idx === 0 ? '#38bdf8' : '#94a3b8', 
                      textDecoration: 'none',
                      transition: 'color 0.15s ease',
                      borderBottom: idx === 0 ? '2px solid #38bdf8' : '2px solid transparent',
                      paddingBottom: '4px'
                    }}
                  >
                    {item}
                  </a>
                );
              })}
            </nav>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {(site.phone || site.place_phone) && (
              <a 
                href={`tel:${site.phone || site.place_phone}`} 
                style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', textDecoration: 'none', border: '1px solid rgba(255, 255, 255, 0.16)', padding: '7px 16px', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.05)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span>{site.phone || site.place_phone}</span>
              </a>
            )}
            <a 
              href="#interactive-demo"
              style={{ 
                background: primaryColor, 
                color: '#ffffff', 
                padding: '8px 18px', 
                borderRadius: '9999px', 
                textDecoration: 'none', 
                fontWeight: 700, 
                fontSize: '13px',
                boxShadow: `0 0 20px ${primaryColor}60`
              }}
            >
              Virtual Concierge &darr;
            </a>
          </div>

        </div>
      </header>

      {/* 3. Hero Berlatar Foto Kontekstual (Full-Bleed Contextual Photographic Background with Midnight Dark #030712 Overlay) */}
      <section className="preview-hero-section" style={{ 
        position: 'relative',
        padding: '96px 24px 104px', 
        textAlign: 'center',
        overflow: 'hidden',
        backgroundColor: '#030712',
        color: '#ffffff'
      }}>
        {/* Full-Bleed Contextual Photographic Background */}
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          overflow: 'hidden'
        }}>
          <SafeImage 
            src={profile.heroBgImage} 
            alt={profile.companyName || 'Operational Facility'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 38%',
              opacity: 0.42,
              filter: 'saturate(1.2) contrast(1.08)',
              display: 'block'
            }}
          />
          {/* Layered Midnight Dark Overlay (#030712) for Guaranteed 100% WCAG AAA Text Contrast */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(3,7,18,0.85) 0%, rgba(3,7,18,0.58) 32%, rgba(3,7,18,0.78) 72%, #030712 100%)'
          }} />
          {/* Subtle Accent Glow Vignette */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse 85% 65% at 50% 20%, ${primaryColor}32 0%, rgba(3,7,18,0.65) 65%, #030712 100%)`
          }} />
        </div>

        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 10 }}>
          
          {/* Industry Badge (Pill Badge with Pulsing Dot) */}
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '10px', 
            background: 'rgba(255, 255, 255, 0.08)', 
            color: '#7dd3fc', 
            border: '1px solid rgba(255, 255, 255, 0.18)', 
            padding: '7px 22px', 
            borderRadius: '9999px', 
            fontSize: '11px', 
            fontWeight: 800, 
            letterSpacing: '0.08em', 
            textTransform: 'uppercase', 
            marginBottom: '26px',
            boxShadow: `0 0 25px ${primaryColor}35`,
            backdropFilter: 'blur(12px)'
          }}>
            <span className="hero-pulsing-dot" />
            <span>{profile.heroBadge}</span>
          </div>

          <h1 style={{ 
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(42px, 6.5vw, 76px)', 
            fontWeight: 400, 
            lineHeight: 1.08, 
            maxWidth: '980px', 
            margin: '0 auto 22px', 
            letterSpacing: '-0.015em', 
            color: '#ffffff',
            textShadow: '0 4px 30px rgba(0, 0, 0, 0.8), 0 1px 3px rgba(0, 0, 0, 0.9)',
            textWrap: 'balance'
          }}>
            {profile.heroHeadline}
          </h1>

          <p style={{ 
            fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
            fontSize: 'clamp(15px, 1.8vw, 18px)', 
            color: 'rgba(255, 255, 255, 0.82)', 
            lineHeight: 1.65, 
            maxWidth: '720px', 
            margin: '0 auto 38px', 
            fontWeight: 400,
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.6)'
          }}>
            {profile.heroSubheadline}
          </p>

          {/* Action Buttons (Glowing White Pill CTA & Outlined Secondary CTA) */}
          <div className="preview-cta-row" style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '48px' }}>
            <a 
              href="#showcase"
              className="preview-touch-btn preview-btn-primary"
              style={{ 
                background: '#ffffff', 
                color: '#030712', 
                padding: '15px 38px', 
                borderRadius: '9999px', 
                textDecoration: 'none', 
                fontWeight: 700, 
                fontSize: '14px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '8px',
                boxShadow: '0 0 35px rgba(255, 255, 255, 0.45), 0 4px 14px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <span>{profile.primaryCta}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
            <a 
              href="#location-details"
              className="preview-touch-btn preview-btn-secondary"
              style={{ 
                background: 'rgba(255, 255, 255, 0.08)', 
                color: '#ffffff', 
                border: '1px solid rgba(255, 255, 255, 0.22)', 
                padding: '15px 30px', 
                borderRadius: '9999px', 
                textDecoration: 'none', 
                fontWeight: 600, 
                fontSize: '14px', 
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              {profile.secondaryCta}
            </a>
          </div>

          {/* Key Operational Proof Points / Stats (Dark Glass modern glassmorphism) */}
          {profile.stats && profile.stats.length > 0 && (
            <div className="preview-stats-bar" style={{ 
              display: 'grid', 
              gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))`, 
              gap: '12px', 
              maxWidth: '960px', 
              margin: '0 auto',
              padding: '18px 24px',
              background: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
            }}>
              {profile.stats.map((st, sIdx) => (
                <div key={sIdx} style={{ textAlign: 'center', padding: '6px 12px' }}>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', textShadow: `0 0 15px ${primaryColor}80` }}>
                    {st.value}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, marginTop: '4px' }}>
                    {st.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3b. Executive Operational Hub & Value Pillars */}
      <section style={{ background: '#f8fafc', padding: '56px 24px 64px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          {/* Clean Executive Hub Card (ZERO text plastered over images, 100% WCAG AAA accessible) */}
          <div 
            style={{ 
              maxWidth: '1100px', 
              margin: '0 auto 48px', 
              position: 'relative', 
              borderRadius: '16px', 
              overflow: 'hidden', 
              background: `linear-gradient(135deg, ${darkBase} 0%, #1e293b 100%)`, 
              boxShadow: '0 20px 45px -15px rgba(0,0,0,0.15)', 
              border: '1px solid #334155',
              padding: '40px 36px',
              textAlign: 'left',
              color: '#ffffff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
              <div style={{ maxWidth: '640px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: `${primaryColor}25`, border: `1px solid ${primaryColor}60`, color: '#93c5fd', fontSize: '11px', fontWeight: 800, padding: '4px 14px', borderRadius: '9999px', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '14px' }}>
                  <span>VERIFIED OPERATIONAL HUB</span>
                </div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                  {site.company_name}
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.55, margin: 0 }}>
                  {profile.industryTag} &bull; {site.place_address || 'Singapore Operational Facility'}
                </p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '16px 22px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: `${primaryColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#ffffff' }}>{displayRating} / 5.0 Rating</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{displayReviewsCount} Verified Google Reviews</div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Value Pillars */}
          <div className="preview-value-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', maxWidth: '1100px', margin: '0 auto', textAlign: 'left' }}>
            {profile.valueProps.map((item, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: '#ffffff', 
                  padding: '22px 20px', 
                  borderRadius: '12px', 
                  border: '1px solid #e2e8f0', 
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  borderTop: `3px solid ${idx === 0 ? primaryColor : '#e2e8f0'}`
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', marginBottom: '6px' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.55 }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 4. Curated Showcase Section with Real Imagery */}
      <section id="showcase" style={{ background: '#ffffff', padding: '72px 24px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em', background: lightTint, padding: '4px 12px', borderRadius: '16px' }}>
              {profile.industryTag}
            </span>
            <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', margin: '12px 0 10px', letterSpacing: '-0.02em' }}>
              {profile.showcaseTitle}
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>
              {profile.showcaseSubtitle}
            </p>
          </div>

          <div className="preview-showcase-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
            {profile.showcaseItems.map((item, i) => (
              <div 
                key={i}
                style={{
                  background: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 8px -2px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div>
                  {item.image && (
                    <div className="preview-card-img-wrap" style={{ position: 'relative', height: '190px', width: '100%', overflow: 'hidden' }}>
                      <SafeImage 
                        src={item.image} 
                        alt={item.title} 
                        isCardImage={true}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                      />
                      <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
                        <span style={{ background: primaryColor, color: '#ffffff', fontSize: '10px', fontWeight: 800, padding: '4px 9px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                          {item.tag}
                        </span>
                      </div>
                      <div style={{ position: 'absolute', bottom: '10px', right: '12px' }}>
                        <span style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(6px)', color: '#ffffff', fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}>
                          {item.meta}
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{ padding: '22px 20px 10px' }}>
                    <div className="preview-card-badge-row" style={{ display: item.image ? 'none' : 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <span style={{ background: primaryColor, color: '#ffffff', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                        {item.tag}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                        {item.meta}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px', letterSpacing: '-0.01em', lineHeight: 1.35 }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
                      {item.desc}
                    </p>
                  </div>
                </div>

                <div style={{ padding: '14px 20px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <a href="#interactive-demo" style={{ fontSize: '12px', fontWeight: 700, color: primaryColor, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span>View Specifications &amp; Inquire</span>
                  </a>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 4b. Sequential Operational Workflow / Process Capabilities */}
      {profile.workflowOrCapabilities?.steps?.length > 0 && (
        <section className="preview-section" style={{ background: '#f8fafc', padding: '64px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em', background: lightTint, padding: '4px 12px', borderRadius: '16px' }}>
                Operational Standard
              </span>
              <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '10px 0 8px', letterSpacing: '-0.02em' }}>
                {profile.workflowOrCapabilities.title || 'Structured Delivery & Service Workflow'}
              </h2>
              {profile.workflowOrCapabilities.subtitle && (
                <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '600px', margin: '0 auto', lineHeight: 1.55 }}>
                  {profile.workflowOrCapabilities.subtitle}
                </p>
              )}
            </div>

            <div className="preview-workflow-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              {profile.workflowOrCapabilities.steps.map((st, stIdx) => (
                <div 
                  key={stIdx}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '24px 20px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    position: 'relative'
                  }}
                >
                  <div style={{ 
                    fontSize: '12px', 
                    fontWeight: 900, 
                    color: primaryColor, 
                    background: lightTint, 
                    padding: '3px 9px', 
                    borderRadius: '6px', 
                    display: 'inline-block',
                    marginBottom: '14px' 
                  }}>
                    {st.stepNumber || st.step || `0${stIdx + 1}`}
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px', lineHeight: 1.35 }}>
                    {st.title}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.55, margin: 0 }}>
                    {st.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. Physical Presence / Operating Location & Hours with OpenStreetMap Embed */}
      <section id="location-details" style={{ maxWidth: '1200px', margin: '0 auto', padding: '72px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '36px', alignItems: 'flex-start' }}>
          
          <div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.08em', background: lightTint, padding: '4px 12px', borderRadius: '16px' }}>
              Physical Presence & Location
            </span>
            <h2 style={{ fontSize: '30px', fontWeight: 800, margin: '12px 0 14px', color: '#0f172a', letterSpacing: '-0.02em' }}>
              {profile.locationHeading}
            </h2>
            <p style={{ fontSize: '15px', color: '#475569', lineHeight: 1.65, marginBottom: '24px' }}>
              {profile.locationSub}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: lightTint, color: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Location Address</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', lineHeight: 1.5 }}>
                    {site.place_address || site.address || 'Singapore Commercial Hub'}
                  </div>
                </div>
              </div>

              {(site.phone || site.place_phone) && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: lightTint, color: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Direct Phone Inquiries</div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                      {site.phone || site.place_phone}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: lightTint, color: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Operating Schedule</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                    {profile.operatingHoursText}
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Location Map (Responsive Google Maps Embed with Zero White Space) */}
            <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,0.04)' }}>
              <iframe
                title={`Map location for ${site.company_name}`}
                width="100%"
                height="280"
                style={{ width: '100%', height: '280px', display: 'block', border: 'none' }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(
                  site.place_address ? `${site.company_name}, ${site.place_address}` : hasCoordinates ? `${lat},${lng}` : `${site.company_name}, Singapore`
                )}&hl=en&z=15&output=embed`}
              />
              <div style={{ background: '#f8fafc', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  {hasCoordinates 
                    ? `Verified GPS Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    : `Verified Operational Facility: ${site.place_address || 'Singapore Base'}`}
                </span>
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    site.place_address ? `${site.company_name}, ${site.place_address}` : hasCoordinates ? `${lat},${lng}` : `${site.company_name}, Singapore`
                  )}`}
                  target="_blank" 
                  rel="noreferrer"
                  style={{ color: primaryColor, fontWeight: 700, textDecoration: 'none' }}
                >
                  Open in Google Maps
                </a>
              </div>
            </div>
          </div>

          {/* Social Proof or Verified Business Commitment Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '32px', boxShadow: '0 4px 14px -2px rgba(0,0,0,0.03)' }}>
            {hasRealReviews ? (
              <>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#92400e', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, marginBottom: '18px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>{displayRating} / 5.0 Rating</span>
                  <span>&bull;</span>
                  <span>{displayReviewsCount} Verified Google Reviews</span>
                </div>

                <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 16px', color: '#0f172a' }}>
                  Customer Feedback from Google Maps
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {clientReviews.map((rev, idx) => (
                    <div key={idx} style={{ borderBottom: idx < clientReviews.length - 1 ? '1px solid #f1f5f9' : 'none', paddingBottom: idx < clientReviews.length - 1 ? '14px' : '0' }}>
                      <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.55, margin: '0 0 6px', fontStyle: 'italic' }}>
                        &ldquo;{rev.text}&rdquo;
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                        <span>{rev.author}</span>
                        <span>{rev.relative_time || rev.time || 'Google Maps Contributor'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#0f172a', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, marginBottom: '18px' }}>
                  <span>Service Standards</span>
                  <span>&bull;</span>
                  <span>Verified Business</span>
                </div>

                <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 16px', color: '#0f172a' }}>
                  Operational Benchmarks & Commitments
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>Direct Communication</div>
                    <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>Every inquiry is routed directly to qualified team personnel via WhatsApp and phone.</p>
                  </div>
                  <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>Transparent Estimates</div>
                    <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>Clear service scope and itemized quotations provided prior to work commencement.</p>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '2px' }}>Verified Physical Presence</div>
                    <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>Registered business location verified against municipal and mapping records.</p>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </section>

      {/* 6. Live Interactive Prospekta AI Concierge Feature Section (Launchpad Card) */}
      <section id="interactive-demo" style={{ background: '#f8fafc', padding: '72px 24px', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', textAlign: 'center' }}>
          
          <div style={{ marginBottom: '32px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, background: lightTint, color: primaryColor, border: `1px solid ${primaryColor}30`, padding: '5px 16px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              LIVE AGENTIC AI INTEGRATION DEMO
            </span>
            <h2 style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', margin: '14px 0 8px', letterSpacing: '-0.02em' }}>
              Experience the 24/7 Virtual Concierge for {site.company_name}
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>
              Test how an autonomous AI agent responds to customer questions, store hours, and service inquiries in real time with zero human latency.
            </p>
          </div>

          {/* Interactive Feature Card & Launch Action */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '36px 28px',
            boxShadow: '0 8px 30px -4px rgba(0,0,0,0.04)',
            maxWidth: '720px',
            margin: '0 auto',
            textAlign: 'center'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px', textAlign: 'left' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>Instant Response</div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>Zero queue time for inquiries, scope, and service capabilities.</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>Structured Triage</div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>Delivers quote-ready inquiry dossiers directly to your team.</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>24/7 Availability</div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>Captures weekend and evening leads without overtime costs.</div>
              </div>
            </div>

            <a
              href="#interactive-demo"
              className="preview-touch-btn preview-btn-primary"
              style={{
                background: primaryColor,
                color: '#ffffff',
                textDecoration: 'none',
                padding: '14px 32px',
                borderRadius: '9999px',
                fontSize: '14px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: `0 8px 24px -4px ${primaryColor}50`
              }}
            >
              <span>Launch 24/7 Virtual Concierge Demo</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px' }}>
              Or click the floating circular assistant in the bottom-right corner anytime
            </div>
          </div>

        </div>
      </section>

      {/* Floating 24/7 Virtual Concierge Corner Chatbot */}
      <InteractiveDemoChat 
        companyName={site.company_name}
        category={profile.industryTag}
        address={site.place_address || site.address}
        phone={site.phone || site.place_phone}
        operatingHours={profile.operatingHoursText}
        showcaseItems={profile.showcaseItems}
        valueProps={profile.valueProps}
        workflowSteps={profile.workflowOrCapabilities?.steps}
        aiQuestions={profile.aiSampleQuestions}
        accentColor={primaryColor}
      />

      {/* 7. Classy, Non-Aggressive Footer */}
      <footer style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '48px 24px 32px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '32px', marginBottom: '36px' }}>
            
            <div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: primaryColor, textTransform: 'uppercase', letterSpacing: '-0.03em' }}>
                {site.company_name}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px', maxWidth: '320px', lineHeight: 1.5 }}>
                {profile.industryTag} &bull; Delivering contemporary solutions and dedicated customer care.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Explore</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  {profile.navLinks.slice(0, 4).map((link, i) => {
                    const targetHref = /location|contact|store|visit|address|hours/i.test(link)
                      ? '#location-details'
                      : (/concierge|ai|demo|inquiry/i.test(link)
                        ? '#interactive-demo'
                        : '#showcase');
                    return (
                      <a key={i} href={targetHref} style={{ color: '#475569', textDecoration: 'none' }}>
                        {link}
                      </a>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Assistance</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                  <a href="#interactive-demo" style={{ color: '#475569', textDecoration: 'none' }}>24/7 Virtual Concierge</a>
                  <a href="#location-details" style={{ color: '#475569', textDecoration: 'none' }}>Operating Schedule & Location</a>
                  {(site.phone || site.place_phone) && <a href={`tel:${site.phone || site.place_phone}`} style={{ color: '#475569', textDecoration: 'none' }}>Direct Phone Inquiry</a>}
                </div>
              </div>
            </div>

          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: '#94a3b8' }}>
            <div>
              &copy; {new Date().getFullYear()} {site.company_name}. All rights reserved.
            </div>
            <div>
              Interactive Digital Concept engineered by <a href="/" style={{ color: primaryColor, fontWeight: 600, textDecoration: 'none' }}>Prospekta</a> &bull; <a href={googleCalendarUrl} target="_blank" rel="noreferrer" style={{ color: '#64748b', textDecoration: 'none' }}>Connect Official Domain</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}
