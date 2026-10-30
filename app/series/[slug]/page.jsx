import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeries, getHubIndex, seasonEligible } from '@/lib/db';
import { img, year, date, lang, PROVIDER_TYPE, SITE_URL, langHub, genreById, country } from '@/lib/format';
import { JsonLd, MovieGrid, Faq, faqLd, breadcrumbLd } from '@/app/components';
import { meta, clip } from '@/lib/seo';
import Trailer from '@/app/trailer';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

const yearsLabel = (s) => {
  const a = year(s.first_air_date);
  const b = year(s.last_air_date);
  if (!a) return '';
  if (s.status === 'Ended' || s.status === 'Canceled') return b && b !== a ? `${a}–${b}` : a;
  return `${a}–present`;
};

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getSeries(slug);
  if (!data) return {};
  const { series: s, providers } = data;
  const streaming = [...new Set(providers.filter((p) => p.type === 'flatrate').map((p) => p.providers?.name))];
  const title = `${s.name} (${yearsLabel(s)}) Web Series — All Seasons, Cast & Where to Watch`;
  const description = `${s.name}: ${s.number_of_seasons} season${s.number_of_seasons === 1 ? '' : 's'}, ${s.number_of_episodes} episodes${
    streaming.length ? `, streaming on ${streaming.slice(0, 2).join(' & ')} in India` : ''
  }. Full cast, episode guide, spoiler-free story and verdict.`;
  return meta({
    title,
    description: clip(description),
    path: `/series/${s.slug}`,
    image: img(s.backdrop_path, 'w780') || img(s.poster_path, 'w500'),
    type: 'video.tv_show',
  });
}

export default async function SeriesPage({ params }) {
  const { slug } = await params;
  const data = await getSeries(slug);
  if (!data) notFound();
  const { series: s, content: c, credits, providers, similar, episodes } = data;
  const idx = await getHubIndex();
  const langKey = langHub(s.original_language);
  const hasHub = idx.seriesLangs.some((l) => l.key === langKey);
  const genreHubs = new Set(idx.genres.map((g) => g.key));

  const cast = credits.filter((x) => x.kind === 'cast' && x.people).slice(0, 12);
  const crew = credits.filter((x) => x.kind === 'crew' && x.people);
  const uniq = (list) => [...new Map(list.map((x) => [x.people.id, x.people])).values()];
  const directors = uniq(crew.filter((x) => x.role === 'Director')).slice(0, 6);
  const writers = uniq(crew.filter((x) => ['Writer', 'Screenplay'].includes(x.role))).slice(0, 6);
  const music = uniq(crew.filter((x) => /Music/.test(x.role))).slice(0, 4);
  const streaming = [...new Set(
    providers.filter((p) => ['flatrate', 'free', 'ads'].includes(p.type) && p.providers).map((p) => p.providers.name)
  )];
  const groups = ['flatrate', 'free', 'ads', 'rent', 'buy']
    .map((t) => [t, providers.filter((p) => p.type === t && p.providers).map((p) => p.providers)])
    .filter(([, l]) => l.length);
  const seasons = s.seasons || [];
  const pg = c?.parental_guide;
  const name = s.name;

  const personLink = (p) =>
    p.is_published ? <Link key={p.id} href={`/actor/${p.slug}`}>{p.name}</Link> : <span key={p.id}>{p.name}</span>;
  const join = (list) =>
    list.map((p, i) => (
      <span key={p.id}>
        {personLink(p)}
        {i < list.length - 1 ? ', ' : ''}
      </span>
    ));

  const url = `${SITE_URL}/series/${s.slug}`;
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'TVSeries',
          name,
          url,
          image: img(s.poster_path, 'w500'),
          description: s.overview,
          startDate: s.first_air_date || undefined,
          endDate: s.status === 'Ended' ? s.last_air_date || undefined : undefined,
          numberOfSeasons: s.number_of_seasons,
          numberOfEpisodes: s.number_of_episodes,
          dateModified: s.updated_at || undefined,
          inLanguage: lang(s.original_language),
          genre: (s.genres || []).map((g) => g.name),
          contentRating: s.certification_in || undefined,
          creator: (s.created_by || []).map((n) => ({ '@type': 'Person', name: n })),
          actor: cast.slice(0, 8).map((a) => ({ '@type': 'Person', name: a.people.name })),
          containsSeason: seasons.map((x) => ({
            '@type': 'TVSeason',
            seasonNumber: x.n,
            numberOfEpisodes: x.episode_count,
            startDate: x.air_date || undefined,
          })),
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: SITE_URL },
          ...(hasHub ? [{ name: `${lang(s.original_language)} Web Series`, url: `${SITE_URL}/web-series/${langKey}` }] : []),
          { name, url },
        ])}
      />
      {c?.faq && <JsonLd data={faqLd(c.faq)} />}

      <nav className="crumbs">
        <Link href="/">Home</Link> ›{' '}
        {hasHub ? <Link href={`/web-series/${langKey}`}>{lang(s.original_language)} Web Series</Link> : `${lang(s.original_language)} Web Series`} ›{' '}
        {name}
      </nav>

      <div className="hero">
        {s.poster_path && <img className="poster" src={img(s.poster_path, 'w342')} alt={`${name} poster`} width="342" height="513" fetchPriority="high" />}
        <div>
          <h1>
            {name} ({yearsLabel(s)})
          </h1>
          <div className="meta">
            <span>{s.number_of_seasons} season{s.number_of_seasons === 1 ? '' : 's'}</span>
            <span>{s.number_of_episodes} episodes</span>
            {s.episode_run_time ? <span>~{s.episode_run_time} min per episode</span> : null}
            <span>{lang(s.original_language)}</span>
          </div>
          <div className="chips">
            {s.certification_in && <span className="chip cert">{s.certification_in}</span>}
            {s.status && <span className="chip">{s.status === 'Returning Series' ? 'Returning series' : s.status}</span>}
            {(s.genres || []).map((g) => {
              const hub = genreById(g.id);
              return hub && genreHubs.has(hub.slug) ? (
                <Link key={g.id} href={`/genre/${hub.slug}`} className="chip">{g.name}</Link>
              ) : (
                <span key={g.id} className="chip">{g.name}</span>
              );
            })}
          </div>
          {s.vote_count >= 20 && (
            <div className="ratings">
              <div className="rating">
                <b>{Number(s.vote_average).toFixed(1)}</b>/10<small>TMDB · {s.vote_count} votes</small>
              </div>
            </div>
          )}
          {s.created_by?.length > 0 && (
            <p className="quick"><span>Created by</span>{s.created_by.join(', ')}</p>
          )}
          {cast.length > 0 && (
            <p className="quick"><span>Starring</span>{join(uniq(cast.slice(0, 4)))}</p>
          )}
          <p className="quick">
            <span>Watch on</span>
            {streaming.length ? streaming.join(', ') : 'Not on major OTT platforms in India'}
          </p>
          {s.networks?.length > 0 && (
            <p className="quick"><span>Network</span>{s.networks.map((n) => n.name).join(', ')}</p>
          )}
          {c?.best_for && (
            <p className="lead" style={{ marginTop: 14 }}><b>Best for:</b> {c.best_for}</p>
          )}
        </div>
      </div>

      <section className="section watch" id="where-to-watch">
        <h2>Where to watch {name} online in India</h2>
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
          <p>{name} is not currently listed on major OTT platforms in India. We check availability every week.</p>
        )}
        <p className="note">Availability for India, data by JustWatch. Updated {date(s.synced_at?.slice(0, 10))}.</p>
      </section>

      {(s.next_episode || s.status) && (
        <section className="section" id="new-episodes">
          <h2>{name}: new episodes and status</h2>
          <table>
            <tbody>
              <tr><th>Status</th><td>{s.status === 'Returning Series' ? 'Returning series' : s.status}</td></tr>
              {s.next_episode && (
                <tr>
                  <th>Next episode</th>
                  <td>
                    Season {s.next_episode.season_number}, Episode {s.next_episode.episode_number}
                    {s.next_episode.name && !/^Episode \d+$/i.test(s.next_episode.name) ? ` (“${s.next_episode.name}”)` : ''} on{' '}
                    {date(s.next_episode.air_date)}
                  </td>
                </tr>
              )}
              {s.last_air_date && <tr><th>Last episode aired</th><td>{date(s.last_air_date)}</td></tr>}
            </tbody>
          </table>
          <p className="note">Episode dates as listed on TMDB.</p>
        </section>
      )}

      {seasons.length > 0 && (
        <section className="section" id="seasons">
          <h2>{name} seasons and episodes</h2>
          <table className="film-table">
            <thead>
              <tr><th>Season</th><th>Premiered</th><th>Episodes</th></tr>
            </thead>
            <tbody>
              {seasons.map((x) => (
                <tr key={x.n}>
                  <td>
                    {seasonEligible(data, x.n) ? (
                      <Link href={`/series/${s.slug}/season/${x.n}`}>Season {x.n}</Link>
                    ) : (
                      `Season ${x.n}`
                    )}
                  </td>
                  <td>{x.air_date ? date(x.air_date) : 'Not announced'}</td>
                  <td>{x.episode_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {c?.summary && (
        <section className="section">
          <h2>{name} story (no spoilers)</h2>
          {c.summary.split(/\n+/).map((para, i) => <p key={i}>{para}</p>)}
        </section>
      )}

      {(c?.why_watch?.length || c?.skip_if?.length) && (
        <section className="section">
          <h2>Should you watch {name}?</h2>
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
          <h2>{name} cast</h2>
          <div className="cast">
            {cast.map((x) => {
              const p = x.people;
              const inner = (
                <>
                  {p.profile_path ? <img src={img(p.profile_path, 'w185')} alt={p.name} loading="lazy" width="185" height="278" /> : <div className="ph" />}
                  <b>{p.name}</b>
                  {x.role && <span>as {x.role}</span>}
                  {x.episodes ? <span style={{ display: 'block' }}>{x.episodes} episodes</span> : null}
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
        <h2>{name} details</h2>
        <table>
          <tbody>
            {s.created_by?.length > 0 && <tr><th>Created by</th><td>{s.created_by.join(', ')}</td></tr>}
            {directors.length > 0 && <tr><th>Directed by</th><td>{join(directors)}</td></tr>}
            {writers.length > 0 && <tr><th>Written by</th><td>{join(writers)}</td></tr>}
            {music.length > 0 && <tr><th>Music</th><td>{join(music)}</td></tr>}
            {s.first_air_date && <tr><th>First episode</th><td>{date(s.first_air_date)}</td></tr>}
            <tr><th>Seasons / episodes</th><td>{s.number_of_seasons} / {s.number_of_episodes}</td></tr>
            {s.episode_run_time ? <tr><th>Typical episode length</th><td>{s.episode_run_time} minutes</td></tr> : null}
            {s.networks?.length > 0 && <tr><th>Network</th><td>{s.networks.map((n) => n.name).join(', ')}</td></tr>}
            <tr><th>Original language</th><td>{lang(s.original_language)}</td></tr>
            {s.origin_country?.length > 0 && <tr><th>Country of origin</th><td>{s.origin_country.map(country).join(', ')}</td></tr>}
            {s.spoken_languages?.length > 0 && <tr><th>Languages spoken</th><td>{s.spoken_languages.join(', ')}</td></tr>}
            {s.certification_in && <tr><th>Certificate (India)</th><td>{s.certification_in}</td></tr>}
          </tbody>
        </table>
      </section>

      {pg && (
        <section className="section">
          <h2>Parental guide: is {name} family friendly?</h2>
          <div className="pg">
            <div><small>Violence</small>{pg.violence}</div>
            <div><small>Language</small>{pg.language}</div>
            <div><small>Sexual content</small>{pg.sexual_content}</div>
            <div><small>Family viewing</small>{pg.family_friendly ? 'Suitable' : 'Not ideal'}</div>
          </div>
          {pg.note && <p className="note">{pg.note} This is a general guide based on genre and certification.</p>}
        </section>
      )}

      {s.trailer_key && (
        <section className="section">
          <h2>{name} official trailer</h2>
          <Trailer id={s.trailer_key} title={`${name} trailer`} />
        </section>
      )}

      {c?.verdict && (
        <section className="section">
          <h2>Our verdict</h2>
          <p>{c.verdict}</p>
        </section>
      )}

      {similar.length > 0 && (
        <section className="section">
          <h2>Web series like {name}</h2>
          <MovieGrid movies={similar} />
        </section>
      )}

      <Faq items={c?.faq} />
      <p className="note updated">Page last updated {date((s.updated_at || '').slice(0, 10))}. Facts from TMDB; how we write these pages: <Link href="/editorial-policy">editorial policy</Link>.</p>
    </>
  );
}
