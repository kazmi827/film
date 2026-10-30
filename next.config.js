import { readFileSync } from 'node:fs';

// Purane URLs -> naye: data/redirects.json mein [{ "source": "/old-path", "destination": "/movie/x" }]
const oldRedirects = JSON.parse(readFileSync(new URL('./data/redirects.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return oldRedirects.map((r) => ({ source: r.source, destination: r.destination, permanent: true }));
  },
  // TMDB images direct CDN se, Vercel image optimization ka kharcha nahi
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
