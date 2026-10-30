import { HubPage, hubMetadata } from '@/app/hub';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const p = await params;
  return hubMetadata('year', p.year, 1);
}

export default async function Page({ params }) {
  const p = await params;
  return <HubPage type="year" keyName={p.year} page={1} />;
}
