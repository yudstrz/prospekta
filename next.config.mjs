/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@libsql/client', '@neondatabase/serverless'],
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
        source: '/customer-reach/:path*',
        destination: '/:path*',
        permanent: false,
      },
      {
        source: '/customer-reach',
        destination: '/',
        permanent: false,
      },
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' }
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
