import './globals.css';
import Link from 'next/link';
import { SITE_URL, SITE_NAME } from '@/lib/format';
import { getHubIndex } from '@/lib/db';
import { DEFAULT_OG, CONTACT_EMAIL } from '@/lib/seo';
import { JsonLd } from '@/app/components';

const DESC =
  'Find where to watch Bollywood and South Indian movies and web series online in India, with cast, story, OTT release dates and honest verdicts.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Where to Watch Movies in India, Cast & Reviews`, template: `%s | ${SITE_NAME}` },
  description: DESC,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, locale: 'en_IN', type: 'website', images: [{ url: DEFAULT_OG }] },
  twitter: { card: 'summary_large_image', images: [DEFAULT_OG] },
  robots: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  formatDetection: { telephone: false },
  // Search Console: Vercel env mein GOOGLE_SITE_VERIFICATION daalo (HTML tag ka content value)
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export const viewport = { themeColor: '#0f0f12', width: 'device-width', initialScale: 1 };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function RootLayout({ children }) {
  const idx = await getHubIndex().catch(() => ({ langs: [], seriesLangs: [], genres: [] }));
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="" />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
      </head>
      <body>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': `${SITE_URL}/#org`,
                name: SITE_NAME,
                url: SITE_URL,
                logo: `${SITE_URL}/icon.png`,
                ...(CONTACT_EMAIL ? { email: CONTACT_EMAIL } : {}),
              },
              {
                '@type': 'WebSite',
                '@id': `${SITE_URL}/#website`,
                name: SITE_NAME,
                url: SITE_URL,
                inLanguage: 'en-IN',
                publisher: { '@id': `${SITE_URL}/#org` },
              },
            ],
          }}
        />
        <a href="#main" className="skip">Skip to content</a>
        <header className="site-head">
          <div className="wrap head-row">
            <Link href="/" className="logo" aria-label={`${SITE_NAME} home`}>
              <span className="logo-mark" aria-hidden="true">F</span>
              <span>Filmchi<b>Live</b></span>
            </Link>
            <nav className="nav" aria-label="Main">
              {idx.langs.slice(0, 4).map((l) => (
                <Link key={l.key} href={`/movies/${l.key}`}>{cap(l.key)}</Link>
              ))}
              {idx.seriesLangs?.[0] && <Link href={`/web-series/${idx.seriesLangs[0].key}`}>Web Series</Link>}
              <Link href="/ott-releases" className="nav-cta">OTT Releases</Link>
            </nav>
            <details className="mnav">
              <summary aria-label="Open menu">
                <span /><span /><span />
              </summary>
              <div className="mnav-panel">
                <b>Movies</b>
                {idx.langs.map((l) => (
                  <Link key={l.key} href={`/movies/${l.key}`}>{cap(l.key)} movies</Link>
                ))}
                {(idx.seriesLangs || []).length > 0 && <b>Web series</b>}
                {(idx.seriesLangs || []).map((l) => (
                  <Link key={'s' + l.key} href={`/web-series/${l.key}`}>{cap(l.key)} web series</Link>
                ))}
                <b>More</b>
                <Link href="/ott-releases">OTT release calendar</Link>
              </div>
            </details>
          </div>
        </header>
        <main id="main" className="wrap">{children}</main>
        <footer className="site-foot">
          <div className="wrap">
            <div className="foot-top">
              <div className="foot-brand">
                <Link href="/" className="logo">
                  <span className="logo-mark" aria-hidden="true">F</span>
                  <span>Filmchi<b>Live</b></span>
                </Link>
                <p>
                  Where to watch Bollywood and South Indian movies and web series in India: OTT platforms, release dates, cast and
                  spoiler-free guides.
                </p>
              </div>
              <div className="foot-cols">
                <nav aria-label="Movies by language">
                  <b>Movies</b>
                  {idx.langs.map((l) => (
                    <Link key={l.key} href={`/movies/${l.key}`}>{cap(l.key)} movies</Link>
                  ))}
                </nav>
                <nav aria-label="Genres">
                  <b>Genres</b>
                  {(idx.genres || []).slice(0, 9).map((g) => (
                    <Link key={g.key} href={`/genre/${g.key}`}>{g.name} movies</Link>
                  ))}
                </nav>
                <nav aria-label="Web series and OTT">
                  <b>Web series &amp; OTT</b>
                  {(idx.seriesLangs || []).map((l) => (
                    <Link key={l.key} href={`/web-series/${l.key}`}>{cap(l.key)} web series</Link>
                  ))}
                  <Link href="/ott-releases">OTT release calendar</Link>
                </nav>
              </div>
            </div>
            <div className="foot-bottom">
              <span>© {new Date().getFullYear()} {SITE_NAME}</span>
              <nav aria-label="Site information">
                <Link href="/about">About</Link>
                <Link href="/editorial-policy">Editorial policy</Link>
                {CONTACT_EMAIL && <Link href="/contact">Contact</Link>}
                <Link href="/privacy-policy">Privacy</Link>
                <Link href="/disclaimer">Disclaimer</Link>
              </nav>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
