import Link from 'next/link';

export const metadata = { title: 'Page not found', robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <section className="home-hero">
      <h1>Page not found</h1>
      <p>This page doesn&apos;t exist or isn&apos;t available yet.</p>
      <p><Link href="/">Browse movies</Link></p>
    </section>
  );
}
