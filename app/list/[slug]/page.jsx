import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getList } from '@/lib/db';
import { listTitle, score } from '@/lib/catalog';
import { img, year, date, lang, runtime, SITE_URL, LANG_HUBS } from '@/lib/format';
import { JsonLd, breadcrumbLd } from '@/app/components';
import { meta, clip } from '@/lib/seo';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

const href = (m) => (m.kind === 'series' ? `/series/${m.slug}` : `/movie/${m.slug}`);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const l = await getList(slug);
  if (!l) return {};
  const title = listTitle(l.def, l.items.length);
  const top = l.stats.topRated;
  const description = `${l.total} titles${top ? `, led by ${top.item.title} (${top.value.toFixed(1)}/10 ${top.source})` : ''}. Ratings, runtime, certificate and where to stream each one in India.`;
  return meta({ title, description: clip(description), path: `/list/${slug}`, image: img(l.items[0]?.poster_path, 'w500') });
}

export default async function ListPage({ params }) {
  const { slug } = await params;
  const l = await getList(slug);
  if (!l) notFound();
  const { def, items, total, stats: st, streaming, related } = l;
  const title = listTitle(def, items.length);
  const noun = def.kind === 'series' ? 'web series' : 'movies';
  const subject = [def.lang ? lang(LANG_HUBS[def.lang]) : 'Indian', def.genre?.name.toLowerCase(), noun]
    .filter(Boolean)
    .join(' ');
  const url = `${SITE_URL}/list/${slug}`;

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: title,
          numberOfItems: items.length,
          itemListElement: items.map((m, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: SITE_URL + href(m),
            name: `${m.title} (${year(m.date)})`,
          })),
        }}
      />
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: title, url }])} />
      <nav className="crumbs">
        <Link href="/">Home</Link> › Lists › {title.split(':')[0]}
      </nav>
      <section className="home-hero" style={{ paddingTop: 8 }}>
        <h1>{title}</h1>
        <p className="lead">
          {total} {subject}
          {def.platform ? ` currently streaming on ${def.platform.name} in India` : ''}
          {def.year ? ` released in ${def.year}` : ''} are in our database
          {total > items.length ? `; this page shows the top ${items.length}` : ''}.{' '}
          {def.year
            ? 'They are listed in order of release date.'
            : 'They are ranked by IMDb rating where available, otherwise by TMDB user rating (20+ votes); titles without enough ratings come last.'}
          {st.topRated && (
            <>
              {' '}
              The highest rated is <Link href={href(st.topRated.item)}>{st.topRated.item.title}</Link> ({year(st.topRated.item.date)}) at{' '}
              {st.topRated.value.toFixed(1)}/10 on {st.topRated.source}.
            </>
          )}
          {st.newest && (
            <>
              {' '}
              The newest is <Link href={href(st.newest)}>{st.newest.title}</Link>, {def.kind === 'series' ? 'first aired' : 'released'}{' '}
              {date(st.newest.date)}.
            </>
          )}
          {st.avgRuntime ? ` Average ${def.kind === 'series' ? 'episode length' : 'runtime'}: ${st.avgRuntime} minutes.` : ''}
          {!def.platform && st.streaming > 0 && st.topProviders.length > 0 && (
            <>
              {' '}
              {st.streaming === 1 ? '1 title is' : `${st.streaming} titles are`} streaming in India right now, across{' '}
              {st.topProviders.map(([n, c]) => `${n} (${c})`).join(', ')}.
            </>
          )}
        </p>
      </section>

      <section className="section">
        {items.map((m, i) => {
          const sc = score(m);
          const provs = (streaming.get(m.id) || []).map((p) => p.name);
          return (
            <div key={m.id} className="rank">
              <div className="num">{i + 1}</div>
              <Link href={href(m)}>
                {m.poster_path ? (
                  <img src={img(m.poster_path, 'w185')} alt={`${m.title} poster`} loading="lazy" width="185" height="278" />
                ) : (
                  <div className="ph" />
                )}
              </Link>
              <div>
                <h3>
                  <Link href={href(m)}>{m.title}</Link> <span className="note">({year(m.date)})</span>
                </h3>
                <div className="meta" style={{ margin: 0 }}>
                  {sc && <span>★ {sc.value.toFixed(1)} {sc.source}</span>}
                  {m.kind === 'series' ? (
                    <span>{m.number_of_seasons} season{m.number_of_seasons === 1 ? '' : 's'} · {m.number_of_episodes} episodes</span>
                  ) : (
                    m.runtime && <span>{runtime(m.runtime)}</span>
                  )}
                  {m.certification_in && <span>{m.certification_in}</span>}
                  {def.year && m.date && <span>{date(m.date)}</span>}
                </div>
                <p className="quick" style={{ marginTop: 6 }}>
                  <span>Watch on</span>
                  {provs.length ? provs.join(', ') : 'Not on major OTT platforms in India'}
                </p>
                {m.best_for && <p>{m.best_for}</p>}
              </div>
            </div>
          );
        })}
        <p className="note">Ratings and streaming availability for India, updated weekly. Streaming data by JustWatch.</p>
      </section>

      {related.length > 0 && (
        <section className="section">
          <h2>Related lists</h2>
          <div className="chips">
            {related.map((r) => (
              <Link key={r.def.slug} href={`/list/${r.def.slug}`} className="chip">
                {listTitle(r.def, r.items.length).split(':')[0]} ({r.total})
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
