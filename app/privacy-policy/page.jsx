import Link from 'next/link';
import { SITE_NAME } from '@/lib/format';
import { meta, CONTACT_EMAIL } from '@/lib/seo';
import { StaticPage } from '@/app/static-page';

export const metadata = meta({
  title: 'Privacy Policy',
  description: `What data ${SITE_NAME} collects and how third-party services on the site use cookies.`,
  path: '/privacy-policy',
});

export default function Privacy() {
  return (
    <StaticPage title="Privacy policy" path="/privacy-policy" updated="October 2026">
      <p>{SITE_NAME} does not offer accounts and does not ask you for any personal information.</p>
      <h2>Server logs</h2>
      <p>Our hosting provider keeps standard technical logs (such as IP address, browser type and pages requested) for security and performance. We do not use them to identify individual visitors.</p>
      <h2>Third-party content</h2>
      <ul>
        <li>Images are loaded from TMDB’s image servers.</li>
        <li>Trailers use YouTube’s privacy-enhanced mode and only load from YouTube after you press play. YouTube’s own privacy policy then applies.</li>
      </ul>
      <h2>Advertising and analytics</h2>
      <p>If we add analytics or advertising in future, this page will be updated before they go live, including any cookies they set and how to opt out.</p>
      <h2>Contact</h2>
      <p>
        {CONTACT_EMAIL ? (
          <>Questions about this policy: <Link href="/contact">contact us</Link>.</>
        ) : (
          'Questions about this policy can be sent through the contact details listed on this site.'
        )}
      </p>
    </StaticPage>
  );
}
