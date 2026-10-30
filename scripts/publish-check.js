// Step 5: Quality gate + drip publishing.
// Sirf complete pages publish hote hain, aur har run mein --limit tak naye (default 300/day).
// Usage: npm run publish:check -- --limit=300 --series-limit=100   |   --dry=1 (sirf report)
import { db, pool, arg, selectAll } from './_lib.js';

const LIMIT = Number(arg('limit', 300));
const DRY = arg('dry', '0') === '1';

async function main() {
  const now = new Date().toISOString();

  // ---------- Movies ----------
  const movies = await selectAll(
    'movies',
    'id, title, overview, poster_path, runtime, release_date, facts_hash, is_published, popularity, movie_content(facts_hash)',
    (q) => q.order('popularity', { ascending: false })
  );
  const credits = await selectAll('credits', 'movie_id, person_id, kind, role, ord');
  const castCount = new Map();
  for (const c of credits) if (c.kind === 'cast') castCount.set(c.movie_id, (castCount.get(c.movie_id) || 0) + 1);

  const reasons = {};
  const fail = (r) => (reasons[r] = (reasons[r] || 0) + 1);
  const ok = (m) => {
    if (!m.overview || m.overview.length < 80) return fail('short overview'), false;
    if (!m.poster_path) return fail('no poster'), false;
    if (!m.release_date) return fail('no release date'), false;
    if ((castCount.get(m.id) || 0) < 3) return fail('cast < 3'), false;
    if (!m.movie_content) return fail('no AI content'), false;
    if (m.movie_content.facts_hash !== m.facts_hash) return fail('content outdated'), false;
    return true;
  };

  const eligible = movies.filter(ok);
  const toPublish = eligible.filter((m) => !m.is_published).slice(0, LIMIT);
  // Agar koi published page ab gate fail kare to unpublish (e.g. content outdated) — 1 din grace nahi, foran
  const eligibleIds = new Set(eligible.map((m) => m.id));
  const failing = movies.filter((m) => m.is_published && !eligibleIds.has(m.id));

  console.log(`Movies: total ${movies.length}, eligible ${eligible.length}, published ${movies.filter((m) => m.is_published).length}`);
  console.log('  Gate fail reasons:', reasons);
  console.log(`  Naye publish: ${toPublish.length}, unpublish: ${failing.length}`);

  if (!DRY) {
    await pool(toPublish, 8, async (m) => {
      const { error } = await db.from('movies').update({ is_published: true, published_at: now }).eq('id', m.id);
      if (error) throw new Error(error.message);
    });
    await pool(failing, 8, async (m) => {
      const { error } = await db.from('movies').update({ is_published: false }).eq('id', m.id);
      if (error) throw new Error(error.message);
    });
  }

  // ---------- Series ----------
  const SERIES_LIMIT = Number(arg('series-limit', 100));
  const series = await selectAll(
    'series',
    'id, overview, poster_path, first_air_date, facts_hash, is_published, popularity, series_content(facts_hash)',
    (q) => q.order('popularity', { ascending: false })
  );
  const sCredits = await selectAll('series_credits', 'series_id, person_id, kind, role, ord');
  const sCast = new Map();
  for (const c of sCredits) if (c.kind === 'cast') sCast.set(c.series_id, (sCast.get(c.series_id) || 0) + 1);
  const sReasons = {};
  const sFail = (r) => (sReasons[r] = (sReasons[r] || 0) + 1);
  const sOk = (x) => {
    if (!x.overview || x.overview.length < 80) return sFail('short overview'), false;
    if (!x.poster_path) return sFail('no poster'), false;
    if (!x.first_air_date) return sFail('no first air date'), false;
    if ((sCast.get(x.id) || 0) < 3) return sFail('cast < 3'), false;
    if (!x.series_content) return sFail('no AI content'), false;
    if (x.series_content.facts_hash !== x.facts_hash) return sFail('content outdated'), false;
    return true;
  };
  const sEligible = series.filter(sOk);
  const sEligibleIds = new Set(sEligible.map((x) => x.id));
  const sPublish = sEligible.filter((x) => !x.is_published).slice(0, SERIES_LIMIT);
  const sFailing = series.filter((x) => x.is_published && !sEligibleIds.has(x.id));
  console.log(`Series: total ${series.length}, eligible ${sEligible.length}, published ${series.filter((x) => x.is_published).length}`);
  console.log('  Gate fail reasons:', sReasons);
  console.log(`  Naye publish: ${sPublish.length}, unpublish: ${sFailing.length}`);
  if (!DRY) {
    await pool(sPublish, 8, async (x) => {
      const { error } = await db.from('series').update({ is_published: true, published_at: now }).eq('id', x.id);
      if (error) throw new Error(error.message);
    });
    await pool(sFailing, 8, async (x) => {
      const { error } = await db.from('series').update({ is_published: false }).eq('id', x.id);
      if (error) throw new Error(error.message);
    });
  }

  // ---------- People ----------
  // Actor page tab jab: photo + full sync + AI content + kam az kam 3 PUBLISHED movies/series mein top-8 cast ya director
  const publishedMovies = new Set(
    (await selectAll('movies', 'id', (q) => q.eq('is_published', true))).map((r) => r.id)
  );
  const publishedSeries = new Set(
    (await selectAll('series', 'id', (q) => q.eq('is_published', true))).map((r) => r.id)
  );
  const pc = new Map();
  const bump = (c) => {
    if ((c.kind === 'cast' && c.ord < 8) || c.role === 'Director') pc.set(c.person_id, (pc.get(c.person_id) || 0) + 1);
  };
  for (const c of credits) if (publishedMovies.has(c.movie_id)) bump(c);
  for (const c of sCredits) if (publishedSeries.has(c.series_id)) bump(c);
  const people = await selectAll(
    'people',
    'id, profile_path, synced_at, is_published, popularity, person_content(person_id)',
    (q) => q.order('popularity', { ascending: false })
  );
  const pOk = (p) => p.profile_path && p.synced_at && p.person_content && (pc.get(p.id) || 0) >= 3;
  const pEligible = people.filter(pOk);
  const pPublish = pEligible.filter((p) => !p.is_published).slice(0, Math.max(0, Math.round(LIMIT / 3)));
  const pFailing = people.filter((p) => p.is_published && !pOk(p));
  console.log(`People: eligible ${pEligible.length}, naye publish: ${pPublish.length}, unpublish: ${pFailing.length}`);

  if (!DRY) {
    await pool(pPublish, 8, async (p) => {
      const { error } = await db.from('people').update({ is_published: true, published_at: now }).eq('id', p.id);
      if (error) throw new Error(error.message);
    });
    await pool(pFailing, 8, async (p) => {
      const { error } = await db.from('people').update({ is_published: false }).eq('id', p.id);
      if (error) throw new Error(error.message);
    });
  }
  console.log(DRY ? 'Dry run — kuch change nahi hua.' : 'Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
