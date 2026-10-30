import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getHub, getHubIndex, getAllLists } from '@/lib/db';
import { listTitle } from '@/lib/catalog';
import { meta, clip } from '@/lib/seo';
import { genreBySlug, date, year, SITE_URL, HUB_PER_PAGE } from '@/lib/format';
import { MovieGrid, JsonLd, breadcrumbLd } from '@/app/components';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function hubBase(type, key) {
  if (type === 'lang') return `/movies/${key}`;
  if (type === 'series-lang') return `/web-series/${key}`;
  if (type === 'genre') return `/genre/${key}`;
  return `/year/${key}`;
}

function hubName(type, key) {
  if (type === 'lang') return `${cap(key)} Movies`;
  if (type === 'series-lang') return `${cap(key)} Web Series`;
  if (type === 'genre') return `Indian ${genreBySlug(key).name} Movies`;
  return `Indian Movies of ${key}`;
}

function hubTitle(type, key, hub) {
  const { minYear, maxYear } = hub.stats;
  const range = minYear && maxYear && minYear !== maxYear ? ` (${minYear}–${maxYear})` : '';
  return `${hubName(type, key)}${type === 'year' ? '' : range}: Where to Watch Online in India`;
}

export async function hubMetadata(type, key, page) {
  const hub = await getHub(type, key, page);
  if (!hub) return {};
  const base = hubBase(type, key);
  const s = hub.stats;
  const title = hubTitle(type, key, hub) + (page > 1 ? ` – Page ${page}` : '');
  const description = `${hub.total} ${hubName(type, key).replace('Indian ', '').replace('Movies', 'movies')}${
    s.streaming ? `, ${s.streaming} streaming in India` : ''
  }${s.topProviders.length ? ` on ${s.topProviders.map(([n]) => n).join(', ')}` : ''}. Cast, story, OTT details and verdicts.`;
  return meta({ title, description: clip(description), path: page > 1 ? `${base}/page/${page}` : base });
}

// Intro: har sentence DB se gine hue numbers par (koi generic line nahi)
function Intro({ type, keyName: key, hub }) {
  const s = hub.stats;
  const subject =
    type === 'series-lang'
      ? `${hub.total} ${cap(key)}-language web series and TV shows`
      : type === 'lang'
      ? `${hub.total} ${cap(key)}-language movies`
      : type === 'genre'
        ? `${hub.total} Indian ${genreBySlug(key).name.toLowerCase()} movies`
        : `${hub.total} Indian movies released in ${key}`;
  const span = type !== 'year' && s.minYear && s.maxYear ? `, released between ${s.minYear} and ${s.maxYear},` : '';
  return (
    <>
      <p className="lead">
        This page lists {subject}{span} sorted by TMDB popularity.
        {s.streaming > 0 && (
          <>
            {' '}
            {s.streaming === 1 ? '1 of them is' : `${s.streaming} of them are`} streaming in India right now
            {s.topProviders.length > 0 && (
              <>
                {s.topProviders.length === 1 ? ', on ' : ', across '}
                {s.topProviders.map(([n, c], i) => (
                  <span key={n}>
                    {n} ({c}){i < s.topProviders.length - 2 ? ', ' : i === s.topProviders.length - 2 ? ' and ' : ''}
                  </span>
                ))}
              </>
            )}
            .
          </>
        )}
        {s.newest && (
          <>
            {' '}
            The newest {type === 'series-lang' ? 'premiere' : 'release'} here is{' '}
            <Link href={`/${s.newest.kind === 'series' ? 'series' : 'movie'}/${s.newest.slug}`}>{s.newest.title}</Link> ({date(s.newest.date)})
            {s.upcoming > 0 ? `, with ${s.upcoming} more upcoming.` : '.'}
          </>
        )}
      </p>
    </>
  );
}

function Pager({ type, keyName, page, pages }) {
  if (pages <= 1) return null;
  const base = hubBase(type, keyName);
  const href = (n) => (n === 1 ? base : `${base}/page/${n}`);
  return (
    <nav className="pager" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)} rel="prev">← Previous</Link>}
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) =>
        n === page ? (
          <span key={n} className="current">{n}</span>
        ) : (
          <Link key={n} href={href(n)}>{n}</Link>
        )
      )}
      {page < pages && <Link href={href(page + 1)} rel="next">Next →</Link>}
    </nav>
  );
}

export async function HubPage({ type, keyName, page, paged }) {
  if (paged && page === 1) permanentRedirect(hubBase(type, keyName));
  const hub = await getHub(type, keyName, page);
  if (!hub) notFound();
  const idx = await getHubIndex();
  const lists = (await getAllLists())
    .filter((l) =>
      type === 'lang' ? l.def.lang === keyName && l.def.kind === 'movies'
      : type === 'series-lang' ? l.def.lang === keyName && l.def.kind === 'series'
      : type === 'genre' ? l.def.genre?.slug === keyName
      : l.def.year === keyName
    )
    .sort((a, b) => b.total - a.total);
  const base = hubBase(type, keyName);
  const name = hubName(type, keyName);

  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: SITE_URL },
          { name, url: SITE_URL + base },
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name,
          numberOfItems: hub.total,
          itemListElement: hub.movies.map((m, i) => ({
            '@type': 'ListItem',
            position: (page - 1) * HUB_PER_PAGE + i + 1,
            url: `${SITE_URL}/${m.kind === 'series' ? 'series' : 'movie'}/${m.slug}`,
            name: `${m.title} (${year(m.date)})`,
          })),
        }}
      />
      <nav className="crumbs">
        <Link href="/">Home</Link> › {name}
        {page > 1 ? ` › Page ${page}` : ''}
      </nav>
      <section className="home-hero" style={{ paddingTop: 8 }}>
        <h1>
          {hubTitle(type, keyName, hub)}
          {page > 1 ? ` – Page ${page}` : ''}
        </h1>
        {page === 1 && <Intro type={type} keyName={keyName} hub={hub} />}
      </section>

      <section className="section">
        <MovieGrid movies={hub.movies} />
        <Pager type={type} keyName={keyName} page={page} pages={hub.pages} />
      </section>

      {lists.length > 0 && (
        <section className="section">
          <h2>{name}: curated lists</h2>
          <div className="chips">
            {lists.map((l) => (
              <Link key={l.def.slug} href={`/list/${l.def.slug}`} className="chip">
                {listTitle(l.def, l.items.length).split(':')[0]} ({l.total})
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Browse more</h2>
        <h3>By language</h3>
        <div className="chips">
          {idx.langs.map((l) => (
            <Link key={l.key} href={`/movies/${l.key}`} className="chip">{cap(l.key)} movies ({l.count})</Link>
          ))}
          {idx.seriesLangs.map((l) => (
            <Link key={'s' + l.key} href={`/web-series/${l.key}`} className="chip">{cap(l.key)} web series ({l.count})</Link>
          ))}
        </div>
        <h3>By genre</h3>
        <div className="chips">
          {idx.genres.map((g) => (
            <Link key={g.key} href={`/genre/${g.key}`} className="chip">{g.name} ({g.count})</Link>
          ))}
        </div>
        <h3>By year</h3>
        <div className="chips">
          {idx.years.map((y) => (
            <Link key={y.key} href={`/year/${y.key}`} className="chip">{y.key} ({y.count})</Link>
          ))}
        </div>
      </section>
    </>
  );
}
