import { HubPage, hubMetadata } from '@/app/hub';

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const p = await params;
  return hubMetadata('genre', p.slug, Number(p.n));
}

export default async function Page({ params }) {
  const p = await params;
  return <HubPage type="genre" keyName={p.slug} page={Number(p.n)} paged />;
}
