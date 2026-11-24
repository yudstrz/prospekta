import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Perayap Website Domain Sama (Serverless Crawler)',
  description: 'Alat perayap website domain sama berbasis serverless. Ekstrak teks halaman HTML, judul, meta deskripsi, dan tautan internal secara bertahap tanpa server persisten.',
  keywords: [
    'website crawler',
    'same-domain crawler',
    'serverless crawler',
    'html text extractor',
    'sitemap crawler',
    'robots.txt parser',
    'vercel serverless crawler',
    'b2b web scraper'
  ],
  alternates: {
    canonical: '/crawler',
  },
  openGraph: {
    title: 'Serverless Same-Domain Website Crawler | Prospekta',
    description: 'Crawl and extract HTML content, titles, meta descriptions, and internal links across same-domain web pages with serverless batch execution.',
    url: '/crawler',
    type: 'website',
    siteName: 'Prospekta',
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'Prospekta Website Crawler' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Serverless Same-Domain Website Crawler',
    description: 'Ekstrak konten teks, metadata, dan tautan internal website secara serverless dan bertahap.',
    images: ['/icon.png'],
  },
};

export default function CrawlerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
