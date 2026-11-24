import './globals.css';
import { LanguageProvider } from '@/lib/i18n';

const rawBase = process.env.NEXT_PUBLIC_BASE_URL || 'https://prospekta.vercel.app';
const baseUrl = rawBase.replace(/\/+$/, '');

export const metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'Prospekta | B2B Prospect Intelligence & Client Outreach',
    template: '%s | Prospekta',
  },
  description: 'Platform otomasi intelijen bisnis, perayapan website calon klien, dan penjangkauan prospek B2B bertenaga AI untuk percepatan pipeline penjualan.',
  keywords: [
    'Prospekta',
    'B2B Lead Generation',
    'Prospect Intelligence',
    'Website Crawler',
    'Client Outreach',
    'AI Email Personalization',
    'Sales Automation',
    'Singapore B2B Outreach',
    'Jakarta Business Intelligence',
    'Same-Domain Crawler'
  ],
  authors: [{ name: 'Prospekta' }],
  creator: 'Prospekta',
  publisher: 'Prospekta',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    alternateLocale: ['en_US'],
    url: baseUrl,
    siteName: 'Prospekta',
    title: 'Prospekta | B2B Prospect Intelligence & Client Outreach',
    description: 'Platform otomasi intelijen bisnis, perayapan website calon klien, dan penjangkauan prospek B2B bertenaga AI.',
    images: [
      {
        url: '/icon.png',
        width: 512,
        height: 512,
        alt: 'Prospekta Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prospekta | B2B Prospect Intelligence & Client Outreach',
    description: 'Platform otomasi intelijen bisnis, perayapan website calon klien, dan penjangkauan B2B bertenaga AI.',
    images: ['/icon.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

const jsonLdData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: 'Prospekta',
      url: baseUrl,
      logo: `${baseUrl}/icon.png`,
    },
    {
      '@type': 'WebApplication',
      '@id': `${baseUrl}/#webapp`,
      url: baseUrl,
      name: 'Prospekta',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'All',
      browserRequirements: 'Requires JavaScript. Requires HTML5.',
      description: 'Platform otomatisasi intelijen bisnis, perayapan website calon klien, dan penjangkauan B2B bertenaga AI.',
      provider: {
        '@id': `${baseUrl}/#organization`
      }
    }
  ]
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
