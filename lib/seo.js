import { SITE_URL, SITE_NAME } from './format';

export const DEFAULT_OG = '/og-default.png';
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || '';

// Har page ka metadata ek jagah se: title, description, canonical, Open Graph, Twitter
export function meta({ title, description, path, image, type = 'website', noindex = false }) {
  const url = SITE_URL + path;
  const img = image || DEFAULT_OG;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url, siteName: SITE_NAME, locale: 'en_IN', type, images: [{ url: img }] },
    twitter: { card: 'summary_large_image', title, description, images: [img] },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

// Description 155 characters ke andar, lafz beech se na kate
export function clip(text, max = 155) {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:\s]+$/, '') + '…';
}
