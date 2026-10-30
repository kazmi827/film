import { notFound } from 'next/navigation';
import { SITE_NAME } from '@/lib/format';
import { meta, CONTACT_EMAIL } from '@/lib/seo';
import { StaticPage } from '@/app/static-page';

export const metadata = meta({
  title: `Contact ${SITE_NAME}`,
  description: `Report a correction, a copyright concern or a general question to ${SITE_NAME}.`,
  path: '/contact',
});

export default function Contact() {
  if (!CONTACT_EMAIL) notFound();
  return (
    <StaticPage title={`Contact ${SITE_NAME}`} path="/contact" updated="October 2026">
      <p>
        Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
      <p>Please include the page link and what needs to change. Corrections to facts are usually made within a few days.</p>
      <p>For copyright notices, add “Copyright” to the subject line.</p>
    </StaticPage>
  );
}
