/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    agentUpgrade: 'security',
  },
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: '/calendly',
        destination: 'https://calendar.google.com',
        permanent: false,
      },
      {
        source: '/calendar',
        destination: 'https://calendar.google.com',
        permanent: false,
      },
      {
        source: '/schedule',
        destination: 'https://calendar.google.com',
        permanent: false,
      },
      {
        source: '/meeting',
        destination: 'https://calendar.google.com',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      }
    ];
  },
  async rewrites() {
    return [
      {
        source: '/:slug-preview',
        destination: '/p/:slug-preview',
      },
    ];
  },
};

export default nextConfig;
