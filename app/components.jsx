import Link from 'next/link';
import { img, year } from '@/lib/format';

export function JsonLd({ data }) {
  // '<' escape taake content mein '</script>' aaye to page na toote
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function MovieGrid({ movies }) {
  return (
    <div className="grid">
      {movies.map((m) => (
        <Link key={m.id} href={m.kind === 'series' ? `/series/${m.slug}` : `/movie/${m.slug}`} className="movie-card">
          {m.poster_path ? (
            <img src={img(m.poster_path, 'w185')} alt={`${m.title} poster`} loading="lazy" width="185" height="278" />
          ) : (
            <div className="ph" />
          )}
          <b>{m.title}</b>
          <span>
            {year(m.release_date || m.date)}
            {m.vote_average ? ` · ★ ${Number(m.vote_average).toFixed(1)}` : ''}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function Faq({ items }) {
  if (!items?.length) return null;
  return (
    <section className="section">
      <h2>Frequently asked questions</h2>
      {items.map((f, i) => (
        <details key={i} open={i === 0}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </section>
  );
}

export function faqLd(items) {
  if (!items?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}
