import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCalendar } from '@/lib/db';
import { monthLabel } from '@/lib/catalog';
import { date, lang, year, SITE_URL } from '@/lib/format';
import { JsonLd, breadcrumbLd } from '@/app/components';
import { meta } from '@/lib/seo';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

async function load(params) {
  const { month } = await params;
  const cal = await getCalendar();
  const i = cal.months.findIndex((m) => m.slug === month);
  if (i < 0) return null;
  return { cur: cal.months[i], newer: cal.months[i - 1] || null, older: cal.months[i + 1] || null, streaming: cal.streaming };
}

export async function generateMetadata({ params }) {
  const d = await load(params);
  if (!d) return {};
  const label = monthLabel(d.cur.ym);
  return meta({
    title: `New OTT Releases in India, ${label}: ${d.cur.items.length} Movies`,
    description: `${d.cur.items.length} movies with an OTT / digital release in India in ${label}, with dates and where to stream each one.`,
    path: `/ott-releases/${d.cur.slug}`,
  });
}

export default async function MonthPage({ params }) {
  const d = await load(params);
  if (!d) notFound();
  const { cur, newer, older, streaming } = d;
  const label = monthLabel(cur.ym);
  const items = cur.items;

  const langCount = new Map();
  const provCount = new Map();
  for (const m of items) {
    const l = lang(m.original_language);
    langCount.set(l, (langCount.get(l) || 0) + 1);
    for (const p of streaming.get(m.id) || []) provCount.set(p.name, (provCount.get(p.name) || 0) + 1);
  }
  const fmt = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(', ');
  const byDay = new Map();
  for (const m of items) {
    if (!byDay.has(m.digital_release_in)) byDay.set(m.digital_release_in, []);
    byDay.get(m.digital_release_in).push(m);
  }
  const url = `${SITE_URL}/ott-releases/${cur.slug}`;

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `OTT releases in ${label}`,
          numberOfItems: items.length,
          itemListElement: items.map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/movie/${m.slug}`, name: m.title })),
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: SITE_URL },
          { name: 'OTT releases', url: `${SITE_URL}/ott-releases` },
          { name: label, url },
        ])}
      />
      <nav className="crumbs">
        <Link href="/">Home</Link> › <Link href="/ott-releases">OTT releases</Link> › {label}
      </nav>
      <section className="home-hero" style={{ paddingTop: 8 }}>
        <h1>New OTT releases in {label}</h1>
        <p className="lead">
          {items.length} movies have a digital (OTT) release date in India in {label}, as listed on TMDB. By language:{' '}
          {fmt(langCount)}.{provCount.size > 0 ? ` Where they are streaming now: ${fmt(provCount)}.` : ''}
        </p>
      </section>

      {[...byDay.entries()].map(([day, list]) => (
        <section key={day} className="section">
          <h2>{date(day)}</h2>
          <table className="film-table">
            <thead>
              <tr><th>Movie</th><th>Language</th><th>Theatrical release</th><th>Streaming now on</th></tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td><Link href={`/movie/${m.slug}`}>{m.title}</Link> ({year(m.date)})</td>
                  <td>{lang(m.original_language)}</td>
                  <td>{m.date ? date(m.date) : '—'}</td>
                  <td>{(streaming.get(m.id) || []).map((p) => p.name).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <nav className="pager" aria-label="Months">
        {older && <Link href={`/ott-releases/${older.slug}`}>← {monthLabel(older.ym)}</Link>}
        {newer && <Link href={`/ott-releases/${newer.slug}`}>{monthLabel(newer.ym)} →</Link>}
      </nav>
    </>
  );
}
