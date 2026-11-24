import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const rawBase = process.env.NEXT_PUBLIC_BASE_URL || 'https://prospekta.vercel.app';
  const baseUrl = rawBase.replace(/\/+$/, '');

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/crawler`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ];
}
