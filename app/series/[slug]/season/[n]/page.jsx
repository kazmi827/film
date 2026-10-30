import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeries, seasonEligible } from '@/lib/db';
import { img, date, lang, SITE_URL } from '@/lib/format';
import { JsonLd, breadcrumbLd } from '@/app/components';
import { meta, clip } from '@/lib/seo';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

async function load(params) {
  const { slug, n } = await params;
  const num = Number(n);
  if (!Number.isInteger(num) || num < 1) return null;
  const data = await getSeries(slug);
  const el = seasonEligible(data, num);
  return el ? { ...data, ...el, num } : null;
}

const realName = (e) => (e.name && !/^(episode|ep\.?)\s*\d+$/i.test(e.name.trim()) ? e.name : null);

export async function generateMetadata({ params }) {
  const d = await load(params);
  if (!d) return {};
  const { series: s, season, eps, num } = d;
  const first = eps.find((e) => e.air_date)?.air_date || season.air_date;
  const title = `${s.name} Season ${num}: All ${eps.length} Episodes, Release Date & Cast`;
  const description = `${s.name} Season ${num} premiered on ${date(first)} with ${eps.length} episodes. Episode list with air dates and runtimes, plus where to watch in India.`;
  return meta({ title, description: clip(description), path: `/series/${s.slug}/season/${num}`, image: img(season.poster_path || s.poster_path, 'w500'), type: 'video.tv_show' });
}

export default async function SeasonPage({ params }) {
  const d = await load(params);
  if (!d) notFound();
  const { series: s, season, eps, num, providers, credits } = d;

  const aired = eps.filter((e) => e.air_date).map((e) => e.air_date).sort();
  const runtimes = eps.map((e) => e.runtime).filter(Boolean);
  const totalMin = runtimes.reduce((a, b) => a + b, 0);
  const streaming = [...new Set(
    providers.filter((p) => ['flatrate', 'free', 'ads'].includes(p.type) && p.providers).map((p) => p.providers.name)
  )];
  const cast = credits.filter((x) => x.kind === 'cast' && x.people).slice(0, 8);
  const others = (s.seasons || []).filter((x) => x.n !== num && seasonEligible(d, x.n));
  const sameDay = aired.length > 1 && aired[0] === aired[aired.length - 1];
  const url = `${SITE_URL}/series/${s.slug}/season/${num}`;

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'TVSeason',
          name: `${s.name} Season ${num}`,
          url,
          seasonNumber: num,
          numberOfEpisodes: eps.length,
          startDate: aired[0] || season.air_date,
          partOfSeries: { '@type': 'TVSeries', name: s.name, url: `${SITE_URL}/series/${s.slug}` },
          episode: eps.map((e) => ({
            '@type': 'TVEpisode',
            episodeNumber: e.episode_number,
            name: realName(e) || `Episode ${e.episode_number}`,
            datePublished: e.air_date || undefined,
          })),
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: SITE_URL },
          { name: s.name, url: `${SITE_URL}/series/${s.slug}` },
          { name: `Season ${num}`, url },
        ])}
      />
      <nav className="crumbs">
        <Link href="/">Home</Link> › <Link href={`/series/${s.slug}`}>{s.name}</Link> › Season {num}
      </nav>

      <div className="hero">
        {(season.poster_path || s.poster_path) && (
          <img className="poster" src={img(season.poster_path || s.poster_path, 'w342')} alt={`${s.name} Season ${num} poster`} width="342" height="513" />
        )}
        <div>
          <h1>{s.name} Season {num}</h1>
          <div className="meta">
            <span>{eps.length} episodes</span>
            {aired[0] && <span>Premiered {date(aired[0])}</span>}
            <span>{lang(s.original_language)}</span>
          </div>
          <p className="quick"><span>Watch on</span>{streaming.length ? streaming.join(', ') : 'Not on major OTT platforms in India'}</p>
          {cast.length > 0 && (
            <p className="quick">
              <span>Starring</span>
              {[...new Map(cast.map((x) => [x.people.id, x.people])).values()].slice(0, 4).map((p, i, arr) => (
                <span key={p.id}>
                  {p.is_published ? <Link href={`/actor/${p.slug}`}>{p.name}</Link> : p.name}
                  {i < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      <section className="section">
        <h2>{s.name} Season {num} release date</h2>
        <table>
          <tbody>
            {aired[0] && <tr><th>First episode</th><td>{date(aired[0])}</td></tr>}
            {aired.length > 1 && !sameDay && <tr><th>Last episode</th><td>{date(aired[aired.length - 1])}</td></tr>}
            {sameDay && <tr><th>Release pattern</th><td>All {aired.length} episodes released on the same day</td></tr>}
            <tr><th>Episodes</th><td>{eps.length}</td></tr>
            {runtimes.length > 0 && (
              <tr>
                <th>Total runtime</th>
                <td>
                  {Math.floor(totalMin / 60)}h {totalMin % 60}m
                  {runtimes.length < eps.length ? ` (${runtimes.length} of ${eps.length} episodes have a listed runtime)` : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="note">Episode dates and runtimes as listed on TMDB.</p>
      </section>

      {season.overview && (
        <section className="section">
          <h2>About Season {num}</h2>
          <p>{season.overview}</p>
        </section>
      )}

      <section className="section">
        <h2>{s.name} Season {num} episode list</h2>
        <table className="film-table">
          <thead>
            <tr><th>#</th><th>Episode</th><th>Air date</th><th>Runtime</th></tr>
          </thead>
          <tbody>
            {eps.map((e) => (
              <tr key={e.episode_number}>
                <td>{e.episode_number}</td>
                <td>
                  {realName(e) || `Episode ${e.episode_number}`}
                  {e.overview && <span className="note" style={{ display: 'block' }}>{e.overview}</span>}
                </td>
                <td>{e.air_date ? date(e.air_date) : '—'}</td>
                <td>{e.runtime ? `${e.runtime} min` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {others.length > 0 && (
        <section className="section">
          <h2>Other seasons of {s.name}</h2>
          <div className="chips">
            {others.map((x) => (
              <Link key={x.n} href={`/series/${s.slug}/season/${x.n}`} className="chip">
                Season {x.n} ({x.episode_count} episodes)
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
