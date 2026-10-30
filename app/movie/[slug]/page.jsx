import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMovie, getHubIndex } from '@/lib/db';
import { img, year, runtime, date, lang, money, PROVIDER_TYPE, SITE_URL, langHub, genreById, country } from '@/lib/format';
import { JsonLd, MovieGrid, Faq, faqLd, breadcrumbLd } from '@/app/components';
import { meta, clip } from '@/lib/seo';
import Trailer from '@/app/trailer';

// ISR: page pehli request par banta hai, phir 24 ghante cache
export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getMovie(slug);
  if (!data) return {};
  const { movie: m, providers } = data;
  const y = year(m.release_date);
  const streaming = [...new Set(providers.filter((p) => p.type === 'flatrate').map((p) => p.providers?.name))];
  const title = `${m.title} (${y}) — Where to Watch, Cast, Story & Review`;
  const description = streaming.length
    ? `Watch ${m.title} (${y}) on ${streaming.slice(0, 2).join(' & ')} in India. Full cast, spoiler-free story, parental guide and honest verdict.`
    : `${m.title} (${y}) ${lang(m.original_language)} movie: where to watch in India, full cast, spoiler-free story, parental guide and verdict.`;
  return meta({
    title,
    description: clip(description),
    path: `/movie/${m.slug}`,
    image: img(m.backdrop_path, 'w780') || img(m.poster_path, 'w500'),
    type: 'video.movie',
  });
}

function groupProviders(rows) {
  const groups = {};
  for (const r of rows) {
    if (!r.providers) continue;
    (groups[r.type] ||= []).push(r.providers);
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return ['flatrate', 'free', 'ads', 'rent', 'buy'].filter((t) => groups[t]?.length).map((t) => [t, groups[t]]);
}

export default async function MoviePage({ params }) {
  const { slug } = await params;
  const data = await getMovie(slug);
  if (!data) notFound();
  const { movie: m, content: c, credits, providers, similar, franchise, director, lead, byDirector, byLead } = data;
  const idx = await getHubIndex();
  const langKey = langHub(m.original_language);
  const hasLangHub = idx.langs.some((l) => l.key === langKey);
  const genreHubs = new Set(idx.genres.map((g) => g.key));
  const yearHub = idx.years.some((x) => x.key === year(m.release_date));
  const daysToOtt =
    m.theatrical_release_in && m.digital_release_in
      ? Math.round((new Date(m.digital_release_in) - new Date(m.theatrical_release_in)) / 86400000)
      : null;

  const y = year(m.release_date);
  const cast = credits.filter((x) => x.kind === 'cast' && x.people).slice(0, 12);
  const crew = credits.filter((x) => x.kind === 'crew' && x.people);
  const directors = crew.filter((x) => x.role === 'Director');
  const groups = groupProviders(providers);
  const streaming = [...new Set(
    providers.filter((p) => ['flatrate', 'free', 'ads'].includes(p.type) && p.providers).map((p) => p.providers.name)
  )];
  const isUpcoming = m.release_date && m.release_date > new Date().toISOString().slice(0, 10);
  const pg = c?.parental_guide;

  const crewRows = [
    ['Director', directors],
    ['Writer', crew.filter((x) => ['Screenplay', 'Writer'].includes(x.role))],
    ['Music', crew.filter((x) => /Music/.test(x.role))],
    ['Cinematography', crew.filter((x) => x.role === 'Director of Photography')],
    ['Producer', crew.filter((x) => x.role === 'Producer').slice(0, 4)],
  ].filter(([, list]) => list.length);

  const personLink = (p) =>
    p.is_published ? (
      <Link key={p.id} href={`/actor/${p.slug}`}>{p.name}</Link>
    ) : (
      <span key={p.id}>{p.name}</span>
    );
  const joinLinks = (list) =>
    [...new Map(list.map((x) => [x.people.id, x.people])).values()].map((p, i, arr) => (
      <span key={p.id}>
        {personLink(p)}
        {i < arr.length - 1 ? ', ' : ''}
      </span>
    ));

  const url = `${SITE_URL}/movie/${m.slug}`;
  const movieLd = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: m.title,
    url,
    image: img(m.poster_path, 'w500'),
    datePublished: m.release_date || undefined,
    description: m.overview,
    inLanguage: lang(m.original_language),
    genre: (m.genres || []).map((g) => g.name),
    duration: m.runtime ? `PT${Math.floor(m.runtime / 60)}H${m.runtime % 60}M` : undefined,
    contentRating: m.certification_in || undefined,
    dateModified: m.updated_at || undefined,
    countryOfOrigin: (m.production_countries || []).map((c) => ({ '@type': 'Country', name: country(c) })),
    director: directors.map((d) => ({ '@type': 'Person', name: d.people.name })),
    actor: cast.slice(0, 8).map((a) => ({ '@type': 'Person', name: a.people.name })),
    trailer: m.trailer_key
      ? {
          '@type': 'VideoObject',
          name: `${m.title} Trailer`,
          description: `Official trailer of ${m.title} (${y}).`,
          embedUrl: `https://www.youtube.com/embed/${m.trailer_key}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${m.trailer_key}/hqdefault.jpg`,
          uploadDate: m.release_date || undefined,
        }
      : undefined,
  };

  return (
    <>
      <JsonLd data={movieLd} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: SITE_URL },
          ...(hasLangHub ? [{ name: `${lang(m.original_language)} Movies`, url: `${SITE_URL}/movies/${langKey}` }] : []),
          { name: m.title, url },
        ])}
      />
      {c?.faq && <JsonLd data={faqLd(c.faq)} />}

      <nav className="crumbs">
        <Link href="/">Home</Link> ›{' '}
        {hasLangHub ? <Link href={`/movies/${langKey}`}>{lang(m.original_language)} Movies</Link> : `${lang(m.original_language)} Movies`} ›{' '}
        {m.title}
      </nav>

      <div className="hero">
        {m.poster_path && (
          <img className="poster" src={img(m.poster_path, 'w342')} alt={`${m.title} (${y}) poster`} width="342" height="513" fetchPriority="high" />
        )}
        <div>
          <h1>
            {m.title} ({y})
          </h1>
          <div className="meta">
            {m.release_date && (
              <span>
                {isUpcoming ? 'Releasing ' : ''}
                {yearHub ? <Link href={`/year/${y}`}>{date(m.release_date)}</Link> : date(m.release_date)}
              </span>
            )}
            {m.runtime ? <span>{runtime(m.runtime)}</span> : null}
            <span>{lang(m.original_language)}</span>
            {m.production_countries?.length > 0 && <span>{m.production_countries.map(country).join(' / ')}</span>}
          </div>
          <div className="chips">
            {m.certification_in && <span className="chip cert">{m.certification_in}</span>}
            {(m.genres || []).map((g) => {
              const hub = genreById(g.id);
              return hub && genreHubs.has(hub.slug) ? (
                <Link key={g.id} href={`/genre/${hub.slug}`} className="chip">{g.name}</Link>
              ) : (
                <span key={g.id} className="chip">{g.name}</span>
              );
            })}
          </div>
          <div className="ratings">
            {m.imdb_rating && (
              <div className="rating">
                <b>{Number(m.imdb_rating).toFixed(1)}</b>/10<small>IMDb</small>
              </div>
            )}
            {m.vote_count >= 20 && (
              <div className="rating">
                <b>{Number(m.vote_average).toFixed(1)}</b>/10<small>TMDB · {m.vote_count} votes</small>
              </div>
            )}
          </div>
          {directors.length > 0 && (
            <p className="quick"><span>Director</span>{joinLinks(directors)}</p>
          )}
          {cast.length > 0 && (
            <p className="quick"><span>Starring</span>{joinLinks(cast.slice(0, 4))}</p>
          )}
          <p className="quick">
            <span>Watch on</span>
            {streaming.length
              ? streaming.join(', ')
              : isUpcoming
                ? 'Releasing in theatres, OTT not announced yet'
                : 'Not on major OTT platforms in India'}
          </p>
          {c?.best_for && (
            <p className="lead" style={{ marginTop: 14 }}><b>Best for:</b> {c.best_for}</p>
          )}
        </div>
      </div>

      {/* Sab se pehle user intent: kahan dekhein */}
      <section className="section watch" id="where-to-watch">
        <div className="section-head">
          <h2>Where to watch {m.title} online in India</h2>
        </div>
        {groups.length ? (
          groups.map(([type, list]) => (
            <div key={type} className="prov-group">
              <h3>{PROVIDER_TYPE[type]}</h3>
              <div className="prov-list">
                {list.map((p) => (
                  <span key={p.id} className="prov">
                    {p.logo_path && <img src={img(p.logo_path, 'w92')} alt="" width="32" height="32" loading="lazy" />}
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p>
            {isUpcoming
              ? `${m.title} is an upcoming release. Streaming details will appear here once an OTT platform is announced.`
              : `${m.title} is not currently listed on major OTT platforms in India. We check availability every week.`}
          </p>
        )}
        <p className="note">Availability for India, data by JustWatch. Updated {date(m.synced_at?.slice(0, 10))}.</p>
      </section>

      {m.digital_release_in && (
        <section className="section" id="ott-release-date">
          <h2>{m.title} OTT release date</h2>
          <table>
            <tbody>
              {m.theatrical_release_in && (
                <tr><th>Theatrical release (India)</th><td>{date(m.theatrical_release_in)}</td></tr>
              )}
              <tr><th>OTT / digital release (India)</th><td>{date(m.digital_release_in)}</td></tr>
              {daysToOtt !== null && daysToOtt >= 0 && (
                <tr><th>Gap between theatre and OTT</th><td>{daysToOtt} days</td></tr>
              )}
              {streaming.length > 0 && (
                <tr><th>Streaming now on</th><td>{streaming.join(', ')}</td></tr>
              )}
            </tbody>
          </table>
          <p className="note">Release dates for India as listed on TMDB.</p>
        </section>
      )}

      {franchise && (
        <section className="section" id="watch-order">
          <h2>{franchise.name}: all movies in order</h2>
          <ol className="order">
            {franchise.parts.map((p) => (
              <li key={p.id} className={p.id === m.id ? 'this' : ''}>
                {p.slug && p.id !== m.id ? <Link href={`/movie/${p.slug}`}>{p.title}</Link> : <span>{p.title}</span>}
                {' '}
                <span className="note">
                  {p.release_date ? `(${date(p.release_date)})` : '(release date not announced)'}
                  {p.id === m.id ? ' · this movie' : ''}
                </span>
              </li>
            ))}
          </ol>
          <p className="note">Listed in release order, as per TMDB&apos;s {franchise.name}.</p>
        </section>
      )}

      {c?.summary && (
        <section className="section">
          <h2>{m.title} story (no spoilers)</h2>
          {c.summary.split(/\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </section>
      )}

      {(c?.why_watch?.length || c?.skip_if?.length) && (
        <section className="section">
          <h2>Should you watch {m.title}?</h2>
          <div className="cols">
            <div>
              <h3>Watch it for</h3>
              <ul className="ticks">{(c.why_watch || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <div>
              <h3>Skip it if</h3>
              <ul className="ticks cross">{(c.skip_if || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          </div>
        </section>
      )}

      {cast.length > 0 && (
        <section className="section">
          <h2>{m.title} cast</h2>
          <div className="cast">
            {cast.map((x) => {
              const p = x.people;
              const inner = (
                <>
                  {p.profile_path ? (
                    <img src={img(p.profile_path, 'w185')} alt={p.name} loading="lazy" width="185" height="278" />
                  ) : (
                    <div className="ph" />
                  )}
                  <b>{p.name}</b>
                  {x.role && <span>as {x.role}</span>}
                </>
              );
              return p.is_published ? (
                <Link key={`${p.id}-${x.role}`} href={`/actor/${p.slug}`} className="person-card">{inner}</Link>
              ) : (
                <div key={`${p.id}-${x.role}`} className="person-card">{inner}</div>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <h2>{m.title} movie details</h2>
        <table>
          <tbody>
            {crewRows.map(([label, list]) => (
              <tr key={label}><th>{label}</th><td>{joinLinks(list)}</td></tr>
            ))}
            {m.release_date && <tr><th>Release date</th><td>{date(m.release_date)}</td></tr>}
            {m.runtime ? <tr><th>Runtime</th><td>{runtime(m.runtime)} ({m.runtime} minutes)</td></tr> : null}
            <tr><th>Original language</th><td>{lang(m.original_language)}</td></tr>
            {m.production_countries?.length > 0 && (
              <tr><th>Country of origin</th><td>{m.production_countries.map(country).join(', ')}</td></tr>
            )}
            {m.spoken_languages?.length > 0 && (
              <tr><th>Languages spoken in the film</th><td>{m.spoken_languages.join(', ')}</td></tr>
            )}
            {m.original_title && m.original_title !== m.title && <tr><th>Original title</th><td>{m.original_title}</td></tr>}
            {m.certification_in && <tr><th>Certificate (India)</th><td>{m.certification_in}</td></tr>}
            {m.budget ? <tr><th>Budget</th><td>{money(m.budget)} (approx.)</td></tr> : null}
            {m.revenue ? <tr><th>Worldwide box office</th><td>{money(m.revenue)} (approx.)</td></tr> : null}
          </tbody>
        </table>
      </section>

      {pg && (
        <section className="section">
          <h2>Parental guide: is {m.title} family friendly?</h2>
          <div className="pg">
            <div><small>Violence</small>{pg.violence}</div>
            <div><small>Language</small>{pg.language}</div>
            <div><small>Sexual content</small>{pg.sexual_content}</div>
            <div><small>Family viewing</small>{pg.family_friendly ? 'Suitable' : 'Not ideal'}</div>
          </div>
          {pg.note && <p className="note">{pg.note} This is a general guide based on genre and certification.</p>}
        </section>
      )}

      {m.trailer_key && (
        <section className="section">
          <h2>{m.title} official trailer</h2>
          <Trailer id={m.trailer_key} title={`${m.title} trailer`} />
        </section>
      )}

      {c?.verdict && (
        <section className="section">
          <h2>Our verdict</h2>
          <p>{c.verdict}</p>
        </section>
      )}

      {byDirector.length > 0 && director && (
        <section className="section">
          <h2>More movies directed by {director.name}</h2>
          <MovieGrid movies={byDirector} />
        </section>
      )}

      {byLead.length > 0 && lead && (
        <section className="section">
          <h2>More {lead.name} movies</h2>
          <MovieGrid movies={byLead} />
        </section>
      )}

      {similar.length > 0 && (
        <section className="section">
          <h2>Movies like {m.title}</h2>
          <MovieGrid movies={similar} />
        </section>
      )}

      <Faq items={c?.faq} />
      <p className="note updated">Page last updated {date((m.updated_at || '').slice(0, 10))}. Facts from TMDB; how we write these pages: <Link href="/editorial-policy">editorial policy</Link>.</p>
    </>
  );
}
