import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Modern Minimalist Prospekta Icon SVG (512x512)
// Clean Geometric P Monogram with Precision Radar Beacon
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="pGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <linearGradient id="beaconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Modern Dark Squircle Container -->
  <rect width="512" height="512" rx="120" fill="url(#bg)"/>
  <rect x="2" y="2" width="508" height="508" rx="118" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="4"/>

  <!-- Minimalist 'P' Stem -->
  <line x1="168" y1="130" x2="168" y2="382" stroke="url(#pGrad)" stroke-width="42" stroke-linecap="round"/>

  <!-- Minimalist 'P' Loop (Geometric Discovery Arc) -->
  <path d="M 168 130 H 280 C 352 130, 396 168, 396 238 C 396 308, 352 346, 280 346 H 168" fill="none" stroke="url(#pGrad)" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Geospatial Radar Beacon & Focal Point -->
  <circle cx="282" cy="238" r="22" fill="url(#beaconGrad)" filter="url(#subtleGlow)"/>
  <circle cx="282" cy="238" r="48" fill="none" stroke="#38bdf8" stroke-width="5" stroke-dasharray="6 8" opacity="0.6"/>
</svg>`;

// Horizontal Full Logo SVG (with Modern Typography)
const fullLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 150" width="600" height="150" fill="none">
  <defs>
    <linearGradient id="pGradH" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
    <linearGradient id="beaconGradH" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
  </defs>

  <!-- Mark Container (120x120 centered at x=15, y=15) -->
  <g transform="translate(15, 15)">
    <rect width="120" height="120" rx="30" fill="#0b0f19"/>
    <rect x="1" y="1" width="118" height="118" rx="29" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5"/>
    
    <!-- P Mark (scaled) -->
    <line x1="39" y1="30" x2="39" y2="90" stroke="url(#pGradH)" stroke-width="10" stroke-linecap="round"/>
    <path d="M 39 30 H 66 C 83 30, 93 39, 93 55 C 93 71, 83 80, 66 80 H 39" fill="none" stroke="url(#pGradH)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="66" cy="55" r="5" fill="url(#beaconGradH)"/>
    <circle cx="66" cy="55" r="11" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="2 3" opacity="0.6"/>
  </g>

  <!-- Clean Minimalist Modern Wordmark -->
  <text x="160" y="88" font-family="system-ui, -apple-system, 'SF Pro Display', Inter, sans-serif" font-size="48" font-weight="800" letter-spacing="-0.03em" fill="#ffffff">Prospekta</text>
  <circle cx="400" cy="84" r="5" fill="#38bdf8"/>
</svg>`;

async function main() {
  const iconBuffer = Buffer.from(iconSvg);
  
  // 1. Save raw SVGs
  fs.writeFileSync('public/icon.svg', iconSvg, 'utf8');
  fs.writeFileSync('public/logo.svg', fullLogoSvg, 'utf8');

  // 2. Generate 512x512 PNG
  const png512 = await sharp(iconBuffer).resize(512, 512).png().toBuffer();
  fs.writeFileSync('public/icon-512.png', png512);

  // 3. Generate 192x192 PNG
  const png192 = await sharp(iconBuffer).resize(192, 192).png().toBuffer();
  fs.writeFileSync('public/icon-192.png', png192);

  // 4. Generate 32x32 PNG for favicon & app icon
  const png32 = await sharp(iconBuffer).resize(32, 32).png().toBuffer();
  fs.writeFileSync('app/icon.png', png32);
  fs.writeFileSync('public/icon.png', png32);
  fs.writeFileSync('public/favicon.ico', png32);
  fs.writeFileSync('app/favicon.ico', png32);

  console.log('Icons and logos generated successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
