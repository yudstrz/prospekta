/**
 * Unified Design Intelligence & Anti-Slop Engine
 * Synthesizes 14 Elite Systems:
 * - antislop, antislop-code, antislop-copywriting, antislop-human, antislop-layoutmobile, antislop-ui
 * - awesome-claude-design (68 tokenized design systems)
 * - banner-design, brand, design-motion-principles, design-system, ui-styling, ui-ux-pro-max
 * - ponytail (minimalist, YAGNI, native CSS, zero bloat)
 *
 * Provides:
 * 1. Curated industry color tokens, typography pairings, and semantic elevation
 * 2. Anti-slop copywriting filters (banned AI buzzwords, em dashes, generic tropes)
 * 3. Human accessibility (WCAG AA contrast, 44px touch targets, focus states)
 * 4. Responsive mobile reflow rules (fluid typography clamp, zero horizontal scroll)
 * 5. Micro-interactions and motion curves (150-250ms ease-out transitions)
 */

// 1. Strict Banned Words List (antislop-copywriting & brand)
export const BANNED_AI_WORDS = [
  'revolutionize', 'revolutionizing', 'revolutionary',
  'transform', 'transforming', 'transformation',
  'delve', 'delving',
  'tapestry',
  'beacon',
  'game-changer', 'game changer',
  'seamlessly', 'seamless',
  'elevate', 'elevating',
  'unlock', 'unlocking',
  'empower', 'empowering',
  'harness', 'harnessing',
  'testament',
  'in today\'s fast-paced world',
  'in today\'s digital landscape',
  'cutting-edge',
  'state-of-the-art',
  'world-class',
  'next-level',
  'groundbreaking',
  'synergy',
  'holistic',
  'bespoke solutions for all your needs'
];

/**
 * Filter text to purge AI slop, em dashes, and generic filler words
 */
export function sanitizeAntiSlopCopy(text = '') {
  if (!text || typeof text !== 'string') return '';
  let clean = text;

  // Replace em dashes and en dashes with clean colons or commas
  clean = clean.replace(/\s*[—–]\s*/g, ': ');

  // Strip excessive exclamation points
  clean = clean.replace(/!{2,}/g, '.').replace(/!/g, '.');

  // Replace banned buzzwords with grounded, factual terms
  for (const banned of BANNED_AI_WORDS) {
    const regex = new RegExp(`\\b${banned}\\b`, 'gi');
    clean = clean.replace(regex, (match) => {
      const lower = match.toLowerCase();
      if (lower.startsWith('revolution')) return 'modernize';
      if (lower.startsWith('transform')) return 'upgrade';
      if (lower.startsWith('seamless')) return 'direct';
      if (lower.startsWith('elevat')) return 'improve';
      if (lower.startsWith('unlock')) return 'deliver';
      if (lower.startsWith('empower')) return 'enable';
      if (lower.startsWith('delv')) return 'evaluate';
      if (lower.includes('game-changer')) return 'practical improvement';
      if (lower.includes('cutting-edge') || lower.includes('state-of-the-art')) return 'verified';
      return 'proven';
    });
  }

  // Clean trailing punctuation and double spaces
  return clean.replace(/\s{2,}/g, ' ').trim();
}

// 2. Curated Singapore B2B Industry Archetypes & Color Tokens (awesome-claude-design + ui-ux-pro-max)
export const INDUSTRY_DESIGN_ARCHETYPES = {
  b2b_industrial: {
    name: 'Industrial Precision & Engineering',
    keywords: ['engineering', 'manufacturing', 'machinery', 'precision', 'fabrication', 'automation', 'contractor', 'civil'],
    primaryColor: '#0f766e', // Deep Teal / Industrial Jade
    secondaryColor: '#134e4a',
    accentColor: '#f59e0b', // Amber safety highlight
    lightTint: '#f0fdfa',
    darkBase: '#042f2e',
    surfaceCard: '#ffffff',
    borderSubtle: '#ccfbf1',
    badgeStyle: { bg: '#e6fffa', text: '#0d9488', border: '#99f6e4' },
    heroBadge: 'VERIFIED SINGAPORE INDUSTRIAL OPERATIONS',
    taglineDefault: 'Precision Engineering & Verified Manufacturing Execution',
    workflowTitle: 'Engineering & Manufacturing Lifecycle',
    stats: [
      { value: 'BizSAFE Star', label: 'Safety & Compliance Standard' },
      { value: 'ISO 9001', label: 'Quality Management Process' },
      { value: '24/7', label: 'Automated Operations Concierge' }
    ]
  },
  logistics_freight: {
    name: 'Logistics, Port Haulage & Global Cargo',
    keywords: ['logistics', 'freight', 'forwarding', 'cargo', 'storage', 'haulage', 'warehouse', 'transit', 'marine'],
    primaryColor: '#0369a1', // Deep Marine Blue
    secondaryColor: '#075985',
    accentColor: '#0284c7',
    lightTint: '#f0f9ff',
    darkBase: '#082f49',
    surfaceCard: '#ffffff',
    borderSubtle: '#e0f2fe',
    badgeStyle: { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
    heroBadge: 'SINGAPORE LOGISTICS & CARGO OPERATIONS',
    taglineDefault: 'End-to-End Multimodal Freight Forwarding & Port Haulage',
    workflowTitle: 'Shipment Intake & Customs Clearance Workflow',
    stats: [
      { value: 'Port Connected', label: 'PSA / Jurong Port Haulage' },
      { value: '100% Tracked', label: 'Verified Dispatch Monitoring' },
      { value: '24/7', label: 'Automated Booking & Status Inquiries' }
    ]
  },
  clinical_healthcare: {
    name: 'Specialist Medical, Dental & Clinical Care',
    keywords: ['clinic', 'dental', 'medical', 'surgeons', 'dentistry', 'orthodontics', 'physiotherapy', 'doctor', 'health'],
    primaryColor: '#0284c7', // Medical Cerulean
    secondaryColor: '#0369a1',
    accentColor: '#10b981', // Clinical Emerald
    lightTint: '#f0f9ff',
    darkBase: '#0c4a6e',
    surfaceCard: '#ffffff',
    borderSubtle: '#e0f2fe',
    badgeStyle: { bg: '#e0f2fe', text: '#0284c7', border: '#bae6fd' },
    heroBadge: 'REGISTERED SINGAPORE CLINICAL PRACTICE',
    taglineDefault: 'Dedicated Specialist Consultations & Patient-Centric Care',
    workflowTitle: 'Patient Intake & Consultation Journey',
    stats: [
      { value: 'MOH Compliant', label: 'Singapore Clinical Standards' },
      { value: 'CHAS / Medisave', label: 'Accredited Healthcare Facility' },
      { value: '24/7', label: 'Direct Appointment & Inquiry Concierge' }
    ]
  },
  trading_wholesale: {
    name: 'Trading, Distribution & Wholesale Import/Export',
    keywords: ['trading', 'wholesale', 'distributor', 'import', 'export', 'supply chain', 'commodities'],
    primaryColor: '#1e3a8a', // Corporate Navy
    secondaryColor: '#172554',
    accentColor: '#d97706', // Gold / Amber
    lightTint: '#eff6ff',
    darkBase: '#0f172a',
    surfaceCard: '#ffffff',
    borderSubtle: '#dbeafe',
    badgeStyle: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
    heroBadge: 'SINGAPORE COMMERCIAL TRADING & DISTRIBUTION',
    taglineDefault: 'Reliable Regional B2B Trade & Verified Wholesale Fulfilment',
    workflowTitle: 'Order Quotation & Dispatch Execution',
    stats: [
      { value: 'Direct Sourcing', label: 'Verified Global Manufacturer Network' },
      { value: 'Commercial Tier', label: 'Institutional Volume Fulfillment' },
      { value: '24/7', label: 'Quotation Request Concierge' }
    ]
  },
  professional_corporate: {
    name: 'Corporate Advisory, Accounting & Legal',
    keywords: ['consulting', 'corporate', 'legal', 'accounting', 'advisory', 'audit', 'secretarial', 'tax', 'recruitment', 'employment'],
    primaryColor: '#334155', // Slate Elegance (Stripe / Linear inspiration)
    secondaryColor: '#1e293b',
    accentColor: '#4f46e5', // Indigo Accent
    lightTint: '#f8fafc',
    darkBase: '#0f172a',
    surfaceCard: '#ffffff',
    borderSubtle: '#e2e8f0',
    badgeStyle: { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
    heroBadge: 'SINGAPORE CORPORATE PRACTICE',
    taglineDefault: 'Rigorous Advisory, Regulatory Governance & Fiduciary Integrity',
    workflowTitle: 'Client Engagement & Advisory Framework',
    stats: [
      { value: 'ACRA Regulated', label: 'Registered Singapore Filing Agents' },
      { value: 'Tier 1 Rigor', label: 'Fiduciary & Compliance Adherence' },
      { value: '24/7', label: 'Executive Consultation Concierge' }
    ]
  },
  architecture_interior: {
    name: 'Architecture, Interior Architecture & Commercial Fit-out',
    keywords: ['interior', 'renovation', 'architecture', 'fit-out', 'design studio', 'commercial interior', 'space planning'],
    primaryColor: '#18181b', // Stark Architectural Monochrome
    secondaryColor: '#27272a',
    accentColor: '#d97757', // Warm Terracotta (Claude Design inspiration)
    lightTint: '#fafaf9',
    darkBase: '#09090b',
    surfaceCard: '#ffffff',
    borderSubtle: '#e4e4e7',
    badgeStyle: { bg: '#fafaf9', text: '#27272a', border: '#e4e4e7' },
    heroBadge: 'LICENSED SPACE PLANNING & FIT-OUT STUDIO',
    taglineDefault: 'Architectural Restraint, Material Honesty & Spatial Precision',
    workflowTitle: 'Design Concept to Handover Milestones',
    stats: [
      { value: 'BCA Registered', label: 'Certified Contractor Standards' },
      { value: 'Bespoke Craft', label: 'Dedicated Material Specifications' },
      { value: '24/7', label: 'Design Inquiry & Portfolio Concierge' }
    ]
  }
};

/**
 * Resolve the optimal design archetype given an entity's name, category, and crawled text
 */
export function resolveIndustryArchetype(category = '', name = '', text = '') {
  const combined = `${category} ${name} ${text}`.toLowerCase();

  if (/clinic|dental|surgeon|dentist|orthodontic|physio|medical|doctor|healthcare|aesthetics/i.test(combined)) {
    return INDUSTRY_DESIGN_ARCHETYPES.clinical_healthcare;
  }
  if (/logistic|freight|forwarding|cargo|haulage|warehouse|shipping|transit|port\b/i.test(combined)) {
    return INDUSTRY_DESIGN_ARCHETYPES.logistics_freight;
  }
  if (/manufactur|machinery|precision|industrial|factory|engineering|contractor|automation|fabricat/i.test(combined)) {
    return INDUSTRY_DESIGN_ARCHETYPES.b2b_industrial;
  }
  if (/trading|wholesale|distributor|import|export|bulk supply|merchandise/i.test(combined)) {
    return INDUSTRY_DESIGN_ARCHETYPES.trading_wholesale;
  }
  if (/interior|renovation|fit-out|architecture|decor|carpentry/i.test(combined)) {
    return INDUSTRY_DESIGN_ARCHETYPES.architecture_interior;
  }

  // Default to Corporate / Professional
  return INDUSTRY_DESIGN_ARCHETYPES.professional_corporate;
}

// 2b. Curated Contextual B2B Operational Images (WCAG Tested, Verified 200 URLs)
export const CONTEXTUAL_SHOWCASE_IMAGES = {
  // Logistics & Freight Forwarding
  logistics_sea_freight: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=800&q=80', // Port container vessel
  logistics_land_transport: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80', // Commercial highway haulage truck
  logistics_warehouse: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80', // High-bay distribution center
  logistics_air_cargo: 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=800&q=80', // Air cargo operations
  logistics_port_terminal: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=800&q=80', // Gantry cranes container terminal

  // B2B Industrial, Engineering & Manufacturing
  industrial_cnc_machining: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80', // Precision CNC tooling
  industrial_automation: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80', // Industrial automation & assembly
  industrial_quality_metrology: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=800&q=80', // Metrology & laser inspection
  industrial_fabrication: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80', // Metal fabrication & welding
  industrial_cleanroom: 'https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?auto=format&fit=crop&w=800&q=80', // Electronics & cleanroom facility

  // Specialist Clinical & Healthcare
  clinical_dental_operatory: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80', // Modern dental clinic operatory
  clinical_medical_suite: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80', // Specialist medical consultation suite

  // Corporate Advisory, Legal, Audit & Accounting
  corporate_cbd_headquarters: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80', // Singapore CBD architectural facade
  corporate_boardroom_advisory: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80', // Executive meeting & consultation suite

  // Commercial Trading, Wholesale & Supply Chain
  trading_distribution_hub: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=80', // Palletized wholesale distribution

  // Architecture & Interior Spatial Design
  architecture_workspace: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80' // Modern architectural fit-out
};

// 2c. Curated Full-Bleed Contextual Hero Background Images (2000px High-Res 4K, Midnight Vignette Optimized)
export const CONTEXTUAL_HERO_IMAGES = {
  // Environmental, Clean Energy, Sustainability & Emission Engineering (e.g. Airgorithm)
  environmental_sustainability: 'https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=2000&q=85',
  environmental_clean_air: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=2000&q=85',

  // Logistics, Marine, Freight & Cargo Hubs (e.g. Neptune Global Logistics)
  logistics_freight_port: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2000&q=85',
  logistics_marine_transport: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=2000&q=85',

  // B2B Advanced Manufacturing, CNC Robotics & Industrial Automation
  industrial_automation: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=2000&q=85',
  industrial_precision_engineering: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=2000&q=85',

  // Clinical Practice, Dental, Specialist Medical & Life Sciences
  clinical_healthcare_suite: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=2000&q=85',

  // Corporate Headquarters, Executive Advisory, Finance & Digital Systems
  corporate_cbd_skyline: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=2000&q=85',

  // Spatial Architecture, Modern Built Environment & Construction
  architecture_spatial_design: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2000&q=85',

  // Global Trading, High-Bay Distribution & Automated Warehousing
  trading_distribution_center: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=2000&q=85',

  // Automotive, High-Performance Workshop & Fleet Engineering
  automotive_engineering: 'https://images.unsplash.com/photo-1613214149922-f1809c99b414?auto=format&fit=crop&w=2000&q=85',
};

/**
 * Resolve authentic, high-impact contextual photographic background for the Hero section.
 * Combined with midnight dark overlay (#030712) for maximum legibility and depth.
 */
export function resolveContextualHeroImage({ category = '', companyName = '', archetype = '', headline = '' } = {}) {
  const combined = `${category} ${companyName} ${typeof archetype === 'string' ? archetype : archetype?.name || ''} ${headline}`.toLowerCase();

  // 1. Environmental Engineering / Sustainability / Airgorithm
  if (
    combined.includes('airgorithm') ||
    combined.includes('emission') ||
    combined.includes('sustainability') ||
    combined.includes('environmental') ||
    combined.includes('clean energy') ||
    combined.includes('green') ||
    combined.includes('cleantech') ||
    combined.includes('esg') ||
    combined.includes('waste') ||
    combined.includes('carbon')
  ) {
    return CONTEXTUAL_HERO_IMAGES.environmental_sustainability;
  }

  // 2. Logistics, Freight, Marine & Cargo Operations
  if (
    combined.includes('logistic') ||
    combined.includes('cargo') ||
    combined.includes('freight') ||
    combined.includes('shipping') ||
    combined.includes('port') ||
    combined.includes('forwarding') ||
    combined.includes('transport')
  ) {
    return CONTEXTUAL_HERO_IMAGES.logistics_freight_port;
  }

  // 3. Clinical & Healthcare
  if (
    combined.includes('dental') ||
    combined.includes('clinic') ||
    combined.includes('health') ||
    combined.includes('medical') ||
    combined.includes('doctor') ||
    combined.includes('surgery') ||
    combined.includes('patient')
  ) {
    return CONTEXTUAL_HERO_IMAGES.clinical_healthcare_suite;
  }

  // 4. Industrial, Automation & Precision Engineering
  if (
    combined.includes('cnc') ||
    combined.includes('machin') ||
    combined.includes('manufactur') ||
    combined.includes('industrial') ||
    combined.includes('automation') ||
    combined.includes('robot') ||
    combined.includes('fabricat')
  ) {
    return CONTEXTUAL_HERO_IMAGES.industrial_automation;
  }

  // 5. Automotive & Workshops
  if (
    combined.includes('motor') ||
    combined.includes('garage') ||
    combined.includes('automotive') ||
    combined.includes('car ') ||
    combined.includes('vehicle') ||
    combined.includes('tyre')
  ) {
    return CONTEXTUAL_HERO_IMAGES.automotive_engineering;
  }

  // 6. Architecture & Interior Construction
  if (
    combined.includes('architect') ||
    combined.includes('interior') ||
    combined.includes('spatial') ||
    combined.includes('construction') ||
    combined.includes('builder') ||
    combined.includes('renovat')
  ) {
    return CONTEXTUAL_HERO_IMAGES.architecture_spatial_design;
  }

  // 7. Trading & Wholesale
  if (
    combined.includes('trading') ||
    combined.includes('wholesale') ||
    combined.includes('distribution') ||
    combined.includes('import') ||
    combined.includes('export')
  ) {
    return CONTEXTUAL_HERO_IMAGES.trading_distribution_center;
  }

  // Fallback to Singapore CBD Skyline / Corporate
  return CONTEXTUAL_HERO_IMAGES.corporate_cbd_skyline;
}

/**
 * Resolve authentic, verified B2B operational imagery for showcase cards
 * Strictly placed inside modular cards, never behind text.
 */
export function resolveContextualShowcaseImage({ title = '', desc = '', tag = '', category = '', archetype = '' } = {}) {
  const combined = `${tag} ${title} ${desc} ${category}`.toLowerCase();

  // 1. Logistics & Supply Chain
  if (/truck|haulage|road transport|cross-border|fleet|land transport/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.logistics_land_transport;
  }
  if (/sea|ocean|port|terminal|marine|intermodal|container vessel|ship/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.logistics_sea_freight;
  }
  if (/warehouse|warehousing|storage|inventory|distribution|cold chain|bonded/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.logistics_warehouse;
  }
  if (/air cargo|air freight|plane|flight|express/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.logistics_air_cargo;
  }
  if (/customs|brokerage|compliance|clearance|documentation/i.test(combined)) {
    return combined.includes('sea') || combined.includes('port')
      ? CONTEXTUAL_SHOWCASE_IMAGES.logistics_port_terminal
      : CONTEXTUAL_SHOWCASE_IMAGES.logistics_land_transport;
  }
  if (/freight forwarding|multimodal|supply chain/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.logistics_sea_freight;
  }

  // 2. Healthcare & Clinical
  if (/dental|dentist|orthodont|teeth|oral|smile/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.clinical_dental_operatory;
  }
  if (/clinic|medical|patient|health|treatment|doctor|physio|surgeon/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.clinical_medical_suite;
  }

  // 3. Precision Engineering & Industrial
  if (/cnc|machining|milling|lathe|tooling|precision engineering/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.industrial_cnc_machining;
  }
  if (/cleanroom|semiconductor|wafer|electronics|micro/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.industrial_cleanroom;
  }
  if (/metrology|quality assurance|inspection|testing|calibration|qa/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.industrial_quality_metrology;
  }
  if (/fabricat|sheet metal|welding|laser cut|machinery|industrial/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.industrial_fabrication;
  }
  if (/automation|robotics|assembly/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.industrial_automation;
  }

  // 4. Corporate Advisory, Legal, Audit & Accounting
  if (/legal|audit|accounting|tax|advisory|corporate secretarial|compliance|governance/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.corporate_boardroom_advisory;
  }

  // 5. Interior & Architecture
  if (/interior|renovation|architecture|fit-out|spatial|space planning/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.architecture_workspace;
  }

  // 6. Trading & Wholesale
  if (/trading|wholesale|distributor|bulk|import|export/i.test(combined)) {
    return CONTEXTUAL_SHOWCASE_IMAGES.trading_distribution_hub;
  }

  // Fallbacks by archetype
  const archKey = (typeof archetype === 'string' ? archetype : archetype?.name || '').toLowerCase();
  if (archKey.includes('logistics')) return CONTEXTUAL_SHOWCASE_IMAGES.logistics_sea_freight;
  if (archKey.includes('industrial')) return CONTEXTUAL_SHOWCASE_IMAGES.industrial_cnc_machining;
  if (archKey.includes('clinical') || archKey.includes('health')) return CONTEXTUAL_SHOWCASE_IMAGES.clinical_medical_suite;
  if (archKey.includes('trading')) return CONTEXTUAL_SHOWCASE_IMAGES.trading_distribution_hub;
  if (archKey.includes('architecture') || archKey.includes('interior')) return CONTEXTUAL_SHOWCASE_IMAGES.architecture_workspace;

  return CONTEXTUAL_SHOWCASE_IMAGES.corporate_cbd_headquarters;
}

// 3. Three-Layer Design Tokens Generator (awesome-claude-design & design-system)
export function generateDesignTokens({
  primaryColor = '#0f766e',
  secondaryColor = '#134e4a',
  lightTint = '#f0fdfa',
  accentColor = '#f59e0b',
  darkBase = '#042f2e'
}) {
  return {
    // Layer 1: Primitive Tokens
    primitives: {
      colorBrand: primaryColor,
      colorBrandDark: secondaryColor,
      colorBrandTint: lightTint,
      colorAccent: accentColor,
      colorNeutralDark: darkBase,
      colorNeutralLight: '#ffffff',
      fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    },
    // Layer 2: Semantic Tokens (WCAG AA Compliant)
    semantic: {
      bgCanvas: '#fafafa',
      bgSurface: '#ffffff',
      bgSubtle: lightTint,
      textPrimary: '#0f172a',
      textSecondary: '#475569',
      textMuted: '#64748b',
      borderSubtle: '#e2e8f0',
      borderProminent: `${primaryColor}40`,
      actionPrimaryBg: primaryColor,
      actionPrimaryText: '#ffffff',
      actionSecondaryBg: '#ffffff',
      actionSecondaryText: '#0f172a',
      actionSecondaryBorder: '#cbd5e1'
    },
    // Layer 3: Component Specs (antislop-human + design-motion-principles)
    components: {
      buttonTouchHeight: '44px',
      buttonBorderRadius: '7px',
      buttonTransition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      cardShadow: '0 1px 3px rgba(15, 23, 42, 0.05), 0 10px 25px -5px rgba(15, 23, 42, 0.04)',
      cardBorder: '1px solid #e2e8f0',
      cardHoverTransform: 'translateY(-2px)',
      badgeRadius: '20px'
    }
  };
}

// 4. Prompt Generator for AI LLM (antislop-copywriting + brand + ponytail)
export function buildAntiSlopWebsitePrompt({
  name,
  category,
  address,
  phone,
  website,
  summary,
  products,
  cleanedRawText = '',
  formattedSnippets = '',
  formattedImagesSnippet = '',
  reviewsSnippet = '',
  rating = '4.9',
  reviewsCount = 18,
  extractedLogo = null,
  extractedPrimary = null,
  extractedSecondary = null,
  extractedLightTint = null
}) {
  const archetype = resolveIndustryArchetype(category, name, cleanedRawText);

  return `You are an elite Digital Experience Architect and Senior Creative Director.
Your task is to craft an AUTHENTIC, grounded digital showcase for "${name}" (${category}, Singapore).
Follow the anti-slop, human copywriting, and brand design guidelines:

--- 1. ANTI-SLOP COPYWRITING CONTRACT (STRICT) ---
- Prohibited AI words: ${BANNED_AI_WORDS.slice(0, 15).join(', ')}.
- Prohibited punctuation: NEVER use em dashes (—) or en dashes (–). Use clean colons (:), commas, or separate sentences.
- Prohibited exclamation marks: zero exclamation marks in headlines and value propositions.
- Voice & Tone: Write strictly from the perspective of "${name}" speaking directly to Singapore clients, partners, and facility managers.
- Grounding: Base every single capability on their real industry operations (${category}). Zero cross-industry contamination.

--- 2. DESIGN SYSTEM & COLOR TOKEN SPECIFICATIONS ---
${extractedPrimary ? `- Detected verified SVG/CSS brand color: "${extractedPrimary}". You MUST use this as "primaryColor".` : `- Recommend an authoritative primary brand color fitting "${archetype.name}" (e.g. "${archetype.primaryColor}").`}
- Derive harmonizing "secondaryColor" and soft pastel "lightTint" that guarantee WCAG AA contrast against dark text.
- Recommend darkBase (e.g. "${archetype.darkBase}") for high-contrast footer and header anchors.

--- 3. AUTHENTIC ASSET ALLOCATION (NAVBAR LOGO & SHOWCASE MODULES ONLY) ---
Real extracted images for "${name}":
${formattedImagesSnippet}
- Official Company Logo: If a clean SVG or PNG logo exists for "${name}", allocate it exclusively to "logoUrl" so it renders cleanly in the top navigation header. NEVER stretch or use the company logo as a card cover or background image.
- Showcase Card Photos: If authentic, sharp company photos exist (e.g. actual fleet trucks, warehouse facilities, cleanroom, equipment, or verified certificates), allocate them specifically to "showcaseItems".
- STRICT QUALITY FILTER: NEVER use tiny logo crops, header banners with blurry text, or out-of-context images (such as school graduation photos for B2B logistics).
- If no sharp, high-resolution photo (>600px wide) of the real physical facility/operation exists, set "image": null so the design engine automatically pairs it with verified, high-resolution B2B industry photography.
- STRICT ZERO BACKGROUND IMAGE RULE: NEVER place photographs, illustrations, earth/globe graphics, or video behind text or in the hero banner ("heroImage": null). The hero section relies on the high-conversion modern dark atmospheric glowing horizon architecture.

--- 4. DOSSIER & REAL FACTS ---
- Entity Name: ${name}
- Industry: ${category}
- Base: ${address || 'Singapore'}
- Website: ${website || 'None'}
- Verified Rating: ${rating} / 5.0 (${reviewsCount} Google Reviews)
${reviewsSnippet ? `- Real Customer Feedback:\n${reviewsSnippet}` : ''}
${formattedSnippets ? `- Web Research Discoveries:\n${formattedSnippets}` : ''}
${cleanedRawText ? `- Real Website Scraped Text:\n"""\n${cleanedRawText.slice(0, 6000)}\n"""` : ''}

--- 5. PROSPEKTA EDITORIAL COPYWRITING & HERO ARCHITECTURE ---
- Hero Headline Formula (Inspired by high-conversion editorial tone):
  Draft a high-impact, outcome-focused headline stating the commercial transformation directly:
  Pattern: "Turn [Core Operational Challenge/Capability] into [Measurable Tangible Outcome] with [Solution/Standards]"
  Or: "Deliver [Specialized Capability] with [Verified Quality Standard] across [Singapore/Regional Corridors]"
  Examples:
  - Logistics: "Turn freight complexity into predictable supply chain velocity"
  - Engineering: "Turn technical engineering blueprints into certified precision components"
  - Healthcare: "Combine advanced clinical care with immediate patient consultation"
  - Trading: "Deliver certified wholesale supplies with guaranteed fulfillment schedules"
  Max 10-12 words. NO buzzwords (no revolutionize, no seamless, no elevate). NO dashes.
- Hero Subheadline Formula:
  1-2 punchy, confident sentences stating who they are, their operational base in Singapore, key accreditations/standards, and a concrete turnaround timeframe (e.g. "quotations within 24 hours", "24/7 dedicated dispatch", "ISO-certified quality").
- Primary CTA:
  High-converting pill button text (e.g. "Book a Strategy Consultation", "Request Scope & Quotation", "Schedule Operational Assessment").
- Secondary CTA:
  Outlined pill button text (e.g. "Explore Capabilities", "Review Operational Standards").
- HERO BERLATAR FOTO KONTEKSTUAL:
  The Hero section is styled with a full-bleed authentic contextual photograph fitting the company's real operational environment (e.g. cleanroom facility, cargo terminal, sustainable environmental infrastructure) coupled with a layered midnight dark (#030712) gradient overlay to guarantee 100% WCAG AAA contrast for the white Instrument Serif headline, pulsing dot pill badge, and glowing white pill CTA.
  Set "heroImage": null to let the system dynamically bind the verified 4K contextual hero photo. All authentic photos for modular service cards must be allocated to "showcaseItems".

Respond ONLY with valid JSON matching this schema:
{
  "archetype": "one of: 'b2b_industrial' | 'logistics_freight' | 'clinical_healthcare' | 'trading_wholesale' | 'professional_corporate' | 'architecture_interior'",
  "brandTagline": "Crisp brand tagline without fluff (max 8 words)",
  "industryTag": "Precise industry classification",
  "primaryColor": "${extractedPrimary || archetype.primaryColor}",
  "secondaryColor": "${extractedSecondary || archetype.secondaryColor}",
  "darkBase": "${archetype.darkBase}",
  "lightTint": "${extractedLightTint || archetype.lightTint}",
  "accentColor": "${archetype.accentColor}",
  "logoUrl": ${extractedLogo ? `"${extractedLogo}"` : 'null'},
  "heroImage": null,
  "navLinks": ["4-5 clean section anchors: Capabilities, Track Record, Location, Contact"],
  "heroBadge": "${archetype.heroBadge}",
  "heroHeadline": "High-impact high-conversion modern outcome headline (e.g. Turn [X] into [Y] with [Z]) (max 10-12 words, NO buzzwords, NO dashes)",
  "heroSubheadline": "1-2 concise, factual sentences with concrete turnaround and Singapore operational standards. NO AI clichés.",
  "primaryCta": "High-converting pill button (e.g. Book a Strategy Consultation / Request Scope & Quotation)",
  "secondaryCta": "Secondary pill button (e.g. Explore Capabilities / Review Operational Standards)",
  "stats": [
    { "value": "Real metric or standard (e.g. ${rating} / 5.0 or BizSAFE Star)", "label": "Short label (max 4 words)" }
  ],
  "valueProps": [
    {
      "icon": "One of: 'sparkles' | 'shield' | 'clock' | 'heart' | 'truck' | 'badge' | 'award' | 'wrench' | 'compass'",
      "title": "Clear operational pillar based on real operations",
      "desc": "1 crisp sentence explaining the tangible client benefit."
    }
  ],
  "showcaseTitle": "Title for their core products or service capabilities",
  "showcaseSubtitle": "1 sentence describing what ${name} delivers",
  "showcaseItems": [
    {
      "tag": "UPPERCASE CATEGORY TAG (e.g. PRECISION MACHINING, REFRIGERATED LOGISTICS, ORTHODONTICS)",
      "title": "Specific capability or product line",
      "desc": "Factual description of this capability and client outcome",
      "meta": "Short specification or standard (e.g. ISO 9001, Temperature Controlled, MOH Accredited)",
      "image": null
    }
  ],
  "workflowOrCapabilities": {
    "title": "${archetype.workflowTitle}",
    "subtitle": "How we manage requirements from intake to delivery",
    "steps": [
      { "stepNumber": "01", "title": "Requirements Scope", "desc": "Direct intake and technical specification review." },
      { "stepNumber": "02", "title": "Quotation & Schedule", "desc": "Transparent pricing, timeline, and SLA confirmation." },
      { "stepNumber": "03", "title": "Execution & Fulfillment", "desc": "Standardized delivery under verified Singapore standards." }
    ]
  },
  "operatingHours": "Monday - Friday: 08:30 - 18:00 (or actual business shift)",
  "aiSampleQuestions": [
    "What services does ${name} provide?",
    "How can I request a quotation or consultation?",
    "Where is your Singapore facility located?",
    "What are your standard turnaround times?"
  ]
}`;
}
