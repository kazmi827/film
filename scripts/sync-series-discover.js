// Series Step 1: Indian web series / TV shows ki list TMDB discover se.
// Usage: npm run series:discover -- --target=600
import { tmdb, upsert, slugify, arg, db, pool, selectAll } from './_lib.js';

const TARGET = Number(arg('target', 600));
const SINCE = arg('since', '2015-01-01');
const MIN_VOTES = Number(arg('min-votes', 3));

const LANGS = [
  { code: 'hi', share: 0.6 },
  { code: 'te', share: 0.1 },
  { code: 'ta', share: 0.15 },
  { code: 'ml', share: 0.1 },
  { code: 'kn', share: 0.05 },
];

async function discoverLang(code, quota) {
  const found = new Map();
  for (let page = 1; page <= 500 && found.size < quota; page++) {
    const res = await tmdb('/discover/tv', {
      with_original_language: code,
      with_origin_country: 'IN',
      with_type: '2|4', // Miniseries | Scripted (news, talk shows, reality nahi)
      'first_air_date.gte': SINCE,
      'vote_count.gte': MIN_VOTES,
      sort_by: 'popularity.desc',
      include_adult: false,
      page,
    });
    if (!res?.results?.length) break;
    for (const s of res.results) {
      if (!s.overview || !s.poster_path) continue;
      found.set(s.id, s);
      if (found.size >= quota) break;
    }
    if (page >= res.total_pages) break;
  }
  return [...found.values()];
}

async function main() {
  const existing = await selectAll('series', 'id, slug');
  const slugOwner = new Map(existing.map((r) => [r.slug, r.id]));

  let all = [];
  for (const { code, share } of LANGS) {
    const quota = Math.round(TARGET * share);
    console.log(`Discover series ${code}: target ${quota}`);
    const list = await discoverLang(code, quota);
    console.log(`  mila: ${list.length}`);
    all = all.concat(list);
  }

  const rows = all.map((s) => {
    const year = (s.first_air_date || '').slice(0, 4);
    const base = slugify(s.name) || `series-${s.id}`;
    const free = (x) => !slugOwner.has(x) || slugOwner.get(x) === s.id;
    let slug = base;
    if (!free(slug) && year) slug = `${base}-${year}`;
    if (!free(slug)) slug = `${base}-${s.id}`;
    slugOwner.set(slug, s.id);
    return {
      id: s.id,
      slug,
      name: s.name,
      original_name: s.original_name,
      original_language: s.original_language,
      overview: s.overview,
      first_air_date: s.first_air_date || null,
      popularity: s.popularity,
      vote_average: s.vote_average,
      vote_count: s.vote_count,
      poster_path: s.poster_path,
      backdrop_path: s.backdrop_path,
    };
  });

  const keep = new Set(existing.map((r) => r.id));
  const fresh = rows.filter((r) => !keep.has(r.id));
  const update = rows.filter((r) => keep.has(r.id)).map(({ slug, ...rest }) => rest);
  await upsert('series', fresh, 'id');
  await pool(update, 8, async (r) => {
    const { error } = await db.from('series').update(r).eq('id', r.id);
    if (error) throw new Error(error.message);
  });
  console.log(`Done. Naye: ${fresh.length}, updated: ${update.length}`);
  console.log('Agla step: npm run series:sync');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
