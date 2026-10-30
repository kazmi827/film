import { getSitemapEntries } from '@/lib/db';
import { SITE_URL } from '@/lib/format';

export const revalidate = 3600;

export default async function sitemap() {
  const entries = await getSitemapEntries().catch(() => []);
  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    ...['/about', '/editorial-policy', '/privacy-policy', '/disclaimer', ...(process.env.NEXT_PUBLIC_CONTACT_EMAIL ? ['/contact'] : [])].map(
      (p) => ({ url: SITE_URL + p, changeFrequency: 'yearly', priority: 0.2 })
    ),
    ...entries.map((e) => ({ url: SITE_URL + e.url, lastModified: e.lastModified, changeFrequency: 'weekly' })),
  ];
}
