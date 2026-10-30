import Link from 'next/link';
import { getHome, getHubIndex } from '@/lib/db';
import { MovieGrid } from '@/app/components';

import { meta } from '@/lib/seo';
import { SITE_NAME } from '@/lib/format';

export const revalidate = 3600;
export const metadata = {
  ...meta({
    title: `${SITE_NAME} — Where to Watch Movies & Web Series in India`,
    description:
      'Where to watch Bollywood and South Indian movies and web series online in India: OTT platforms, release dates, full cast, spoiler-free stories and verdicts.',
    path: '/',
  }),
  title: { absolute: `${SITE_NAME} — Where to Watch Movies & Web Series in India` },
};

export default async function Home() {
  const { latest, popular, upcoming, series } = await getHome();
  const idx = await getHubIndex();
  return (
    <>
      <section className="home-hero">
        <h1>Where to watch Bollywood & South movies in India</h1>
        <p>
          Streaming availability on Netflix, Prime Video, JioHotstar, Zee5 and more, with full cast, spoiler-free stories,
          parental guides and honest verdicts.
        </p>
      </section>
      {(idx.langs.length > 0 || idx.genres.length > 0) && (
        <section className="section">
          <h2>Browse movies</h2>
          <div className="chips">
            {idx.langs.map((l) => (
              <Link key={l.key} href={`/movies/${l.key}`} className="chip">
                {l.key.charAt(0).toUpperCase() + l.key.slice(1)} ({l.count})
              </Link>
            ))}
            {idx.seriesLangs.map((l) => (
              <Link key={'s' + l.key} href={`/web-series/${l.key}`} className="chip">
                {l.key.charAt(0).toUpperCase() + l.key.slice(1)} web series ({l.count})
              </Link>
            ))}
            {idx.genres.map((g) => (
              <Link key={g.key} href={`/genre/${g.key}`} className="chip">{g.name} ({g.count})</Link>
            ))}
            <Link href="/ott-releases" className="chip">OTT release calendar</Link>
          </div>
        </section>
      )}
      {upcoming?.length > 0 && (
        <section className="section">
          <h2>Upcoming movies</h2>
          <MovieGrid movies={upcoming} />
        </section>
      )}
      {latest.length > 0 && (
        <section className="section">
          <h2>Latest releases</h2>
          <MovieGrid movies={latest} />
        </section>
      )}
      {series.length > 0 && (
        <section className="section">
          <h2>Popular web series</h2>
          <MovieGrid movies={series} />
        </section>
      )}
      {popular.length > 0 && (
        <section className="section">
          <h2>Popular right now</h2>
          <MovieGrid movies={popular} />
        </section>
      )}
    </>
  );
}
