import Link from 'next/link';
import { getCatalog } from '@/lib/db';
import { SITE_NAME } from '@/lib/format';
import { meta, CONTACT_EMAIL } from '@/lib/seo';
import { StaticPage } from '@/app/static-page';

export const revalidate = 86400;
export const metadata = meta({
  title: `About ${SITE_NAME}`,
  description: `What ${SITE_NAME} is, where our movie and streaming data comes from, and how our pages are made.`,
  path: '/about',
});

export default async function About() {
  const { movies, series } = await getCatalog();
  return (
    <StaticPage title={`About ${SITE_NAME}`} path="/about" updated="October 2026">
      <p>
        {SITE_NAME} is a movie and web series guide for viewers in India. Each page answers the questions people actually
        search for: where a title is streaming in India, when it reached OTT, who is in it, what it is about without
        spoilers, and whether it suits a family audience.
      </p>
      <p>
        The site currently covers {movies.length.toLocaleString('en-IN')} movies and {series.length.toLocaleString('en-IN')} web
        series across Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Punjabi and Gujarati.
      </p>
      <h2>Where our information comes from</h2>
      <ul>
        <li>Titles, cast, crew, release dates, certificates and images: <a href="https://www.themoviedb.org/" rel="nofollow noopener" target="_blank">TMDB</a>.</li>
        <li>Streaming availability in India: <a href="https://www.justwatch.com/in" rel="nofollow noopener" target="_blank">JustWatch</a> (via TMDB), refreshed every week.</li>
        <li>Trailers: official YouTube uploads only.</li>
      </ul>
      <p className="note">This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data by JustWatch.</p>
      <p>
        Read our <Link href="/editorial-policy">editorial policy</Link> to see how summaries, verdicts and FAQs are written and checked.
      </p>
      <h2>What we do not do</h2>
      <p>
        We do not host, stream or link to any pirated copy of a film or show. Every “where to watch” entry points to a
        licensed platform.
      </p>
      {CONTACT_EMAIL && (
        <p>
          Found a mistake? <Link href="/contact">Contact us</Link> and we will correct it.
        </p>
      )}
    </StaticPage>
  );
}
