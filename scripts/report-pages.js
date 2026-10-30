// Report: agar sab eligible titles publish ho jayein to kitne pages bante hain (template-wise).
// Wahi logic jo site use karti hai (lib/catalog.js), isliye count live site se match karega.
// Usage: npm run report
import { selectAll } from './_lib.js';
import { hubIndex, allLists, calendarMonths } from '../lib/catalog.js';
import { HUB_PER_PAGE } from '../lib/format.js';

const pagesOf = (n) => Math.ceil(n / HUB_PER_PAGE);

async function main() {
  // ---- Movies (publish-check jaisa gate) ----
  const movies = await selectAll(
    'movies',
    'id, slug, title, original_language, genres, release_date, popularity, overview, poster_path, vote_average, vote_count, imdb_rating, runtime, certification_in, digital_release_in, production_countries, facts_hash, is_published, movie_content(facts_hash, best_for)'
  );
  const credits = await selectAll('credits', 'movie_id, person_id, kind, role, ord');
  const castN = new Map();
  for (const c of credits) if (c.kind === 'cast') castN.set(c.movie_id, (castN.get(c.movie_id) || 0) + 1);
  const mOk = movies.filter(
    (m) =>
      m.overview?.length >= 80 && m.poster_path && m.release_date && (castN.get(m.id) || 0) >= 3 &&
      m.movie_content && m.movie_content.facts_hash === m.facts_hash
  );
  const mIds = new Set(mOk.map((m) => m.id));

  // ---- Series ----
  const series = await selectAll(
    'series',
    'id, slug, name, original_language, genres, first_air_date, popularity, overview, poster_path, vote_average, vote_count, episode_run_time, number_of_seasons, number_of_episodes, seasons, origin_country, facts_hash, series_content(facts_hash, best_for)'
  );
  const sCredits = await selectAll('series_credits', 'series_id, person_id, kind, role, ord');
  const sCastN = new Map();
  for (const c of sCredits) if (c.kind === 'cast') sCastN.set(c.series_id, (sCastN.get(c.series_id) || 0) + 1);
  const sOk = series.filter(
    (s) =>
      s.overview?.length >= 80 && s.poster_path && s.first_air_date && (sCastN.get(s.id) || 0) >= 3 &&
      s.series_content && s.series_content.facts_hash === s.facts_hash
  );
  const sIds = new Set(sOk.map((s) => s.id));

  // Season pages: 2+ seasons, season air_date, 3+ episodes
  const eps = await selectAll('series_episodes', 'series_id, season_number');
  const epN = new Map();
  for (const e of eps) epN.set(`${e.series_id}|${e.season_number}`, (epN.get(`${e.series_id}|${e.season_number}`) || 0) + 1);
  let seasonPages = 0;
  for (const s of sOk) {
    if ((s.number_of_seasons || 0) < 2) continue;
    for (const se of s.seasons || []) if (se.air_date && (epN.get(`${s.id}|${se.n}`) || 0) >= 3) seasonPages++;
  }

  // ---- People ----
  const people = await selectAll('people', 'id, profile_path, synced_at, person_content(person_id)');
  const pc = new Map();
  const bump = (c) => {
    if ((c.kind === 'cast' && c.ord < 8) || c.role === 'Director') pc.set(c.person_id, (pc.get(c.person_id) || 0) + 1);
  };
  for (const c of credits) if (mIds.has(c.movie_id)) bump(c);
  for (const c of sCredits) if (sIds.has(c.series_id)) bump(c);
  const pOk = people.filter((p) => p.profile_path && p.synced_at && p.person_content && (pc.get(p.id) || 0) >= 3);
  const pNeedContent = people.filter((p) => p.profile_path && p.synced_at && !p.person_content && (pc.get(p.id) || 0) >= 3);

  // ---- Catalog (site jaisa shape) ----
  const group = (rows, key) => {
    const map = new Map();
    for (const r of rows) {
      if (!r.providers) continue;
      if (!map.has(r[key])) map.set(r[key], []);
      const list = map.get(r[key]);
      if (!list.some((p) => p.slug === r.providers.slug)) list.push(r.providers);
    }
    return map;
  };
  const mProv = await selectAll('movie_providers', 'movie_id, providers(name, slug)', (q) => q.in('type', ['flatrate', 'free', 'ads']));
  const sProv = await selectAll('series_providers', 'series_id, providers(name, slug)', (q) => q.in('type', ['flatrate', 'free', 'ads']));
  const mCat = mOk.map((m) => ({ ...m, kind: 'movie', date: m.release_date, countries: m.production_countries || [], best_for: m.movie_content?.best_for }));
  const sCat = sOk.map((s) => ({ ...s, kind: 'series', title: s.name, date: s.first_air_date, runtime: s.episode_run_time, countries: s.origin_country?.length ? s.origin_country : ['IN'], best_for: s.series_content?.best_for }));
  const mStreaming = group(mProv.filter((r) => mIds.has(r.movie_id)), 'movie_id');
  const sStreaming = group(sProv.filter((r) => sIds.has(r.series_id)), 'series_id');

  const mIdx = hubIndex(mCat);
  const sIdx = hubIndex(sCat);
  const hubPages = (list) => list.reduce((a, h) => a + pagesOf(h.count), 0);
  const lists = allLists(mCat, mStreaming, sCat, sStreaming);
  const cal = calendarMonths(mCat);

  const rows = [
    ['Movie pages', mOk.length],
    ['Web series pages', sOk.length],
    ['Season pages', seasonPages],
    ['Actor pages', pOk.length],
    ['Language hubs (movies, incl. pagination)', hubPages(mIdx.langs)],
    ['Language hubs (web series)', hubPages(sIdx.langs)],
    ['Genre hubs', hubPages(mIdx.genres)],
    ['Year hubs', hubPages(mIdx.years)],
    ['Curated lists', lists.length],
    ['OTT calendar months (+ index)', cal.length ? cal.length + 1 : 0],
    ['Home', 1],
  ];
  const total = rows.reduce((a, r) => a + r[1], 0);
  console.log('\nPAGES (agar sab eligible publish hon)');
  for (const [k, v] of rows) console.log(`  ${k.padEnd(44)} ${String(v).padStart(6)}`);
  console.log(`  ${'TOTAL'.padEnd(44)} ${String(total).padStart(6)}\n`);

  console.log('Pipeline status');
  console.log(`  Movies in DB: ${movies.length}, eligible: ${mOk.length}, published: ${movies.filter((m) => m.is_published).length}`);
  console.log(`  Series in DB: ${series.length}, eligible: ${sOk.length}`);
  console.log(`  Actors waiting for AI content: ${pNeedContent.length} (npm run content:generate -- --type=people)`);
  const byKind = {};
  for (const l of lists) {
    const k = [l.def.kind, l.def.lang && 'lang', l.def.genre && 'genre', l.def.platform && 'platform', l.def.year && 'year'].filter(Boolean).join('+');
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log('  Lists by type:', byKind);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
