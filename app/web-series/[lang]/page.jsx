import { HubPage, hubMetadata } from '@/app/hub';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const p = await params;
  return hubMetadata('series-lang', p.lang, 1);
}

export default async function Page({ params }) {
  const p = await params;
  return <HubPage type="series-lang" keyName={p.lang} page={1} />;
}
