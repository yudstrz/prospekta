'use client';

/**
 * Modern Minimalist Prospekta Mark & Logo Component
 * Geometric 'P' monogram with geospatial radar focal beacon
 */
export function ProspektaMark({ size = 32, className = '', style = {} }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        borderRadius: Math.round(size * 0.22),
        ...style
      }}
      aria-label="Prospekta Logo"
    >
      <defs>
        <linearGradient id="psk-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0b0f19" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="psk-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="psk-beacon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      {/* Modern Squircle Surface */}
      <rect width="120" height="120" rx="28" fill="url(#psk-bg)" />
      <rect
        x="1"
        y="1"
        width="118"
        height="118"
        rx="27"
        fill="none"
        stroke="rgba(255, 255, 255, 0.09)"
        strokeWidth="1.5"
      />

      {/* Minimalist P Stem */}
      <line
        x1="39"
        y1="30"
        x2="39"
        y2="90"
        stroke="url(#psk-grad)"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Minimalist P Loop (Geospatial Discovery Arc) */}
      <path
        d="M 39 30 H 66 C 83 30, 93 39, 93 55 C 93 71, 83 80, 66 80 H 39"
        fill="none"
        stroke="url(#psk-grad)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Geospatial Beacon Point */}
      <circle cx="66" cy="55" r="5" fill="url(#psk-beacon)" />
      <circle
        cx="66"
        cy="55"
        r="11"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1.5"
        strokeDasharray="2 3"
        opacity="0.6"
      />
    </svg>
  );
}

export function ProspektaLogo({
  markSize = 32,
  fontSize = 20,
  showText = true,
  className = '',
  style = {}
}) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        userSelect: 'none',
        ...style
      }}
    >
      <ProspektaMark size={markSize} />
      {showText && (
        <span
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'inherit',
            lineHeight: 1
          }}
        >
          Prospekta
        </span>
      )}
    </div>
  );
}

export default ProspektaLogo;
