import Link from 'next/link';
import { SITE_NAME } from '@/lib/format';
import { meta, CONTACT_EMAIL } from '@/lib/seo';
import { StaticPage } from '@/app/static-page';

export const metadata = meta({
  title: 'Disclaimer & Copyright',
  description: `${SITE_NAME} does not host or link to pirated content. Data sources, trademarks and how to send a copyright notice.`,
  path: '/disclaimer',
});

export default function Disclaimer() {
  return (
    <StaticPage title="Disclaimer & copyright" path="/disclaimer" updated="October 2026">
      <h2>No streaming or downloads</h2>
      <p>{SITE_NAME} is an information guide. We do not host, stream, upload or link to any copy of a film or series. Streaming entries point only to licensed platforms.</p>
      <h2>Accuracy</h2>
      <p>Streaming availability and release dates change often. We refresh them weekly, but please confirm on the platform before you subscribe or pay.</p>
      <h2>Trademarks and images</h2>
      <p>Posters, stills and logos belong to their respective owners and are shown for identification only, supplied through the TMDB API. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      <h2>Copyright notices</h2>
      <p>
        {CONTACT_EMAIL ? (
          <>If you believe something on this site infringes your rights, <Link href="/contact">contact us</Link> with the page link and details, and we will review it promptly.</>
        ) : (
          'If you believe something on this site infringes your rights, send the page link and details through the contact details on this site and we will review it promptly.'
        )}
      </p>
    </StaticPage>
  );
}
