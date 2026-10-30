// Step 1: Indian movies TMDB discover se — har language x har saal alag scan (TMDB ki 500-page limit se bachne ke liye).
// Sirf NAYI movies add hoti hain (jo DB mein nahi), sab se zyada votes wali pehle.
// Usage:
//   npm run sync:discover -- --target=10000                     -> 10k nayi movies (1970 se ab tak, 9 languages)
//   npm run sync:discover -- --target=200 --from-year=2025      -> daily: sirf nayi releases
//   npm run sync:discover -- --langs=hi,ta --from-year=1990 --min-votes=5 --dry=1
import { tmdb, upsert, slugify, arg, pool, selectAll } from './_lib.js';

const TARGET = Number(arg('target', 10000));
const LANGS = arg('langs', 'hi,ta,te,ml,kn,bn,mr,pa,gu').split(',');
const FROM_YEAR = Number(arg('from-year', 1970));
const TO_YEAR = Number(arg('to-year', new Date().getFullYear() + 1));
const MIN_VOTES = Number(arg('min-votes', 2));
const MIN_OVERVIEW = 80; // publish gate jaisa
const DRY = arg('dry', '0') === '1';

async function scanYear(code, year, existing, found) {
  for (let page = 1; page <= 500; page++) {
    const res = await tmdb('/discover/movie', {
      with_original_language: code,
      'primary_release_date.gte': `${year}-01-01`,
      'primary_release_date.lte': `${year}-12-31`,
      'vote_count.gte': MIN_VOTES,
      sort_by: 'vote_count.desc',
      include_adult: false,
      page,
    });
    if (!res?.results?.length) break;
    for (const m of res.results) {
      if (existing.has(m.id) || found.has(m.id)) continue;
      if (!m.poster_path || !m.overview || m.overview.length < MIN_OVERVIEW) continue;
      found.set(m.id, m);
    }
    if (page >= res.total_pages) break;
  }
}

async function main() {
  const existingRows = await selectAll('movies', 'id, slug');
  const existing = new Set(existingRows.map((r) => r.id));
  const slugOwner = new Map(existingRows.map((r) => [r.slug, r.id]));
  console.log(`DB mein pehle se: ${existing.size} movies`);

  const jobs = [];
  for (const code of LANGS) for (let y = TO_YEAR; y >= FROM_YEAR; y--) jobs.push({ code, y });
  const found = new Map();
  console.log(`Scanning ${LANGS.length} languages x ${TO_YEAR - FROM_YEAR + 1} years (${jobs.length} slices)...`);
  await pool(jobs, 6, ({ code, y }) => scanYear(code, y, existing, found));

  // Sab se zyada votes (= zyada search demand) wali pehle
  const ranked = [...found.values()].sort(
    (a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0)
  );
  const picked = ranked.slice(0, TARGET);

  const byLang = {};
  for (const m of ranked) (byLang[m.original_language] ||= [0, 0])[0]++;
  for (const m of picked) byLang[m.original_language][1]++;
  console.log('\nLanguage: mili (quality filter ke baad) / li gayi');
  for (const [k, [a, b]] of Object.entries(byLang)) console.log(`  ${k}: ${a} / ${b}`);
  console.log(`Total nayi mili: ${ranked.length}, li gayi: ${picked.length}`);

  if (DRY) return console.log('Dry run — kuch save nahi hua.');

  const rows = picked.map((m) => {
    const year = (m.release_date || '').slice(0, 4);
    const base = slugify(m.title) || `movie-${m.id}`;
    const free = (s) => !slugOwner.has(s) || slugOwner.get(s) === m.id;
    let slug = base;
    if (!free(slug) && year) slug = `${base}-${year}`;
    if (!free(slug)) slug = `${base}-${m.id}`;
    slugOwner.set(slug, m.id);
    return {
      id: m.id,
      slug,
      title: m.title,
      original_title: m.original_title,
      original_language: m.original_language,
      overview: m.overview,
      release_date: m.release_date || null,
      popularity: m.popularity,
      vote_average: m.vote_average,
      vote_count: m.vote_count,
      poster_path: m.poster_path,
      backdrop_path: m.backdrop_path,
    };
  });
  await upsert('movies', rows, 'id');
  console.log(`Done. ${rows.length} nayi movies add hui. Agla step: npm run sync:movies`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
