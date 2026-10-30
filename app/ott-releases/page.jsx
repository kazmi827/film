import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCalendar } from '@/lib/db';
import { monthLabel } from '@/lib/catalog';
import { meta } from '@/lib/seo';

export const revalidate = 86400;

export async function generateMetadata() {
  const cal = await getCalendar();
  if (!cal.months.length) return {};
  return meta({
    title: 'OTT Release Calendar India: Movies by Month',
    description: `Month-by-month list of movie OTT releases in India across ${cal.months.length} months, with dates and platforms.`,
    path: '/ott-releases',
  });
}

export default async function OttIndex() {
  const cal = await getCalendar();
  if (!cal.months.length) notFound();
  const total = cal.months.reduce((a, m) => a + m.items.length, 0);
  return (
    <>
      <nav className="crumbs">
        <Link href="/">Home</Link> › OTT releases
      </nav>
      <section className="home-hero" style={{ paddingTop: 8 }}>
        <h1>OTT release calendar</h1>
        <p className="lead">
          {total} movies with a listed OTT release date in India, across {cal.months.length} months. Pick a month:
        </p>
      </section>
      <section className="section">
        <div className="chips">
          {cal.months.map((m) => (
            <Link key={m.slug} href={`/ott-releases/${m.slug}`} className="chip">
              {monthLabel(m.ym)} ({m.items.length})
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
