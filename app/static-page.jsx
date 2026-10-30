import Link from 'next/link';
import { SITE_URL } from '@/lib/format';
import { JsonLd, breadcrumbLd } from '@/app/components';

export function StaticPage({ title, path, updated, children }) {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: 'Home', url: SITE_URL }, { name: title, url: SITE_URL + path }])} />
      <nav className="crumbs">
        <Link href="/">Home</Link> › {title}
      </nav>
      <article className="section prose">
        <h1>{title}</h1>
        {children}
        <p className="note">Last updated: {updated}</p>
      </article>
    </>
  );
}
