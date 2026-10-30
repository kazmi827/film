import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPerson } from '@/lib/db';
import { img, year, date, age, SITE_URL } from '@/lib/format';
import { JsonLd, MovieGrid, Faq, faqLd, breadcrumbLd } from '@/app/components';
import { meta, clip } from '@/lib/seo';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

const roleLabel = (p) => (p.known_for_department === 'Directing' ? 'Director' : p.gender === 1 ? 'Actress' : 'Actor');

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getPerson(slug);
  if (!data) return {};
  const { person: p, films } = data;
  const latest = films.find((f) => f.movies.release_date)?.movies;
  const title = `${p.name} Movies List, Upcoming Films & Biography`;
  const description = `${p.name} filmography with ${films.length} movies${
    latest ? `, latest: ${latest.title} (${year(latest.release_date)})` : ''
  }. Where to watch, roles, career overview and quick facts.`;
  return meta({ title, description: clip(description), path: `/actor/${p.slug}`, image: img(p.profile_path, 'h632'), type: 'profile' });
}

export default async function ActorPage({ params }) {
  const { slug } = await params;
  const data = await getPerson(slug);
  if (!data) notFound();
  const { person: p, content: c, films, shows } = data;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = films.filter((f) => f.movies.release_date > today);
  const released = films.filter((f) => !f.movies.release_date || f.movies.release_date <= today);
  const best = [...released]
    .filter((f) => f.movies.imdb_rating || f.movies.vote_average)
    .sort((a, b) => (b.movies.imdb_rating || b.movies.vote_average) - (a.movies.imdb_rating || a.movies.vote_average))
    .slice(0, 6)
    .map((f) => f.movies);
  const unique = (arr) => [...new Map(arr.map((f) => [f.movies.id, f])).values()];

  const url = `${SITE_URL}/actor/${p.slug}`;
  const label = roleLabel(p);

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: p.name,
          url,
          image: img(p.profile_path, 'h632'),
          birthDate: p.birthday || undefined,
          birthPlace: p.place_of_birth || undefined,
          jobTitle: label,
          dateModified: p.updated_at || undefined,
          sameAs: p.imdb_id ? [`https://www.imdb.com/name/${p.imdb_id}/`] : undefined,
        }}
      />
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: p.name, url }])} />
      {c?.faq && <JsonLd data={faqLd(c.faq)} />}

      <nav className="crumbs">
        <Link href="/">Home</Link> › {label}s › {p.name}
      </nav>

      <div className="hero">
        {p.profile_path && <img className="poster" src={img(p.profile_path, 'h632')} alt={p.name} width="421" height="632" fetchPriority="high" />}
        <div>
          <h1>{p.name} movies & biography</h1>
          <div className="meta">
            <span>{label}</span>
            <span>{unique(films).length} movies on FilmchiLive</span>
          </div>
          {c?.intro && <p className="lead">{c.intro}</p>}
        </div>
      </div>

      <section className="section">
        <h2>Quick facts</h2>
        <table>
          <tbody>
            <tr><th>Known for</th><td>{label}</td></tr>
            {p.birthday && (
              <tr>
                <th>Born</th>
                <td>
                  {date(p.birthday)}
                  {!p.deathday && ` (age ${age(p.birthday)})`}
                </td>
              </tr>
            )}
            {p.deathday && <tr><th>Died</th><td>{date(p.deathday)} (aged {age(p.birthday, p.deathday)})</td></tr>}
            {p.place_of_birth && <tr><th>Birthplace</th><td>{p.place_of_birth}</td></tr>}
            {released[0] && (
              <tr>
                <th>Latest release</th>
                <td><Link href={`/movie/${released[0].movies.slug}`}>{released[0].movies.title}</Link> ({year(released[0].movies.release_date)})</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {upcoming.length > 0 && (
        <section className="section">
          <h2>{p.name} upcoming movies</h2>
          <MovieGrid movies={unique(upcoming).map((f) => f.movies)} />
        </section>
      )}

      {best.length > 0 && (
        <section className="section">
          <h2>Best {p.name} movies</h2>
          <MovieGrid movies={best} />
        </section>
      )}

      {c?.career && (
        <section className="section">
          <h2>Career overview</h2>
          {c.career.split(/\n+/).map((para, i) => <p key={i}>{para}</p>)}
        </section>
      )}

      <section className="section">
        <h2>{p.name} movies list</h2>
        <table className="film-table">
          <thead>
            <tr><th>Year</th><th>Movie</th><th>Role</th><th>Rating</th></tr>
          </thead>
          <tbody>
            {films.map((f, i) => (
              <tr key={`${f.movies.id}-${i}`}>
                <td>{year(f.movies.release_date) || 'TBA'}</td>
                <td><Link href={`/movie/${f.movies.slug}`}>{f.movies.title}</Link></td>
                <td>{f.kind === 'cast' ? f.role || 'Cast' : f.role}</td>
                <td>{f.movies.imdb_rating ? `${f.movies.imdb_rating} IMDb` : f.movies.vote_average ? `${Number(f.movies.vote_average).toFixed(1)} TMDB` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {shows.length > 0 && (
        <section className="section">
          <h2>{p.name} web series</h2>
          <table className="film-table">
            <thead>
              <tr><th>Year</th><th>Series</th><th>Role</th><th>Episodes</th></tr>
            </thead>
            <tbody>
              {shows.map((x) => (
                <tr key={x.series.id}>
                  <td>{year(x.series.first_air_date) || 'TBA'}</td>
                  <td><Link href={`/series/${x.series.slug}`}>{x.series.name}</Link></td>
                  <td>{x.kind === 'cast' ? x.role || 'Cast' : x.role}</td>
                  <td>{x.episodes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Faq items={c?.faq} />
      <p className="note updated">Page last updated {date((p.updated_at || '').slice(0, 10))}. Facts from TMDB; how we write these pages: <Link href="/editorial-policy">editorial policy</Link>.</p>
    </>
  );
}
