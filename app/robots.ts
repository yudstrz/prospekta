import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const rawBase = process.env.NEXT_PUBLIC_BASE_URL || 'https://prospekta.vercel.app';
  const baseUrl = rawBase.replace(/\/+$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/crawler'],
        disallow: ['/api/', '/p/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
