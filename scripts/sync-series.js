// Series Step 2: har series ki full details: cast, crew, OTT India, seasons, episodes, trailer, certificate.
// Usage:
//   npm run series:sync                  -> jo kabhi sync nahi hui ya 7 din purani
//   npm run series:sync -- --all=1       -> sab dobara
import { tmdb, db, upsert, pool, slugify, hash, arg, selectAll , saveRaw } from './_lib.js';

const ALL = arg('all', '0') === '1';
const STALE_DAYS = Number(arg('stale-days', 7));
const CONCURRENCY = Number(arg('concurrency', 6));
const CAST_LIMIT = 15;
const CREW_JOBS = new Set(['Director', 'Writer', 'Screenplay', 'Producer', 'Original Music Composer', 'Music']);

const peopleIds = new Set();
const peopleSlugs = new Map();
const pendingPeople = new Map();
const knownProviders = new Set();

function personSlug(id, name) {
  let slug = slugify(name) || `person-${id}`;
  if (peopleSlugs.has(slug) && peopleSlugs.get(slug) !== id) slug = `${slug}-${id}`;
  peopleSlugs.set(slug, id);
  return slug;
}

function pickTrailer(videos) {
  const yt = (videos?.results || []).filter((v) => v.site === 'YouTube');
  const score = (v) =>
    (v.type === 'Trailer' ? 4 : v.type === 'Teaser' ? 2 : 0) + (v.official ? 2 : 0) + (v.iso_639_1 === 'hi' ? 1 : 0);
  return yt.sort((a, b) => score(b) - score(a))[0]?.key || null;
}

async function ensurePeople(list) {
  const fresh = [];
  const waitFor = [];
  for (const p of list) {
    if (peopleIds.has(p.id)) {
      if (pendingPeople.has(p.id)) waitFor.push(pendingPeople.get(p.id));
      continue;
    }
    peopleIds.add(p.id);
    fresh.push({
      id: p.id,
      slug: personSlug(p.id, p.name),
      name: p.name,
      gender: p.gender,
      known_for_department: p.known_for_department,
      profile_path: p.profile_path,
      popularity: p.popularity,
    });
  }
  if (fresh.length) {
    const ins = db
      .from('people')
      .upsert(fresh, { onConflict: 'id', ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) throw new Error(`people: ${error.message}`);
      });
    for (const p of fresh) pendingPeople.set(p.id, ins);
    await ins;
  }
  await Promise.allSettled(waitFor);
}

async function syncProviders(seriesId, wp) {
  const IN = wp?.results?.IN;
  await db.from('series_providers').delete().eq('series_id', seriesId).eq('region', 'IN');
  if (!IN) return [];
  const rows = [];
  const provs = [];
  for (const type of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
    for (const p of IN[type] || []) {
      rows.push({ series_id: seriesId, provider_id: p.provider_id, type, region: 'IN', updated_at: new Date().toISOString() });
      if (!knownProviders.has(p.provider_id)) {
        knownProviders.add(p.provider_id);
        provs.push({
          id: p.provider_id,
          name: p.provider_name,
          slug: slugify(p.provider_name) || `provider-${p.provider_id}`,
          logo_path: p.logo_path,
          priority: p.display_priority,
        });
      }
    }
  }
  if (provs.length) {
    const { error } = await db.from('providers').upsert(provs, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`providers: ${error.message}`);
  }
  // Same provider/type do dafa na aaye
  const uniq = [...new Map(rows.map((r) => [`${r.provider_id}|${r.type}`, r])).values()];
  await upsert('series_providers', uniq, 'series_id,provider_id,type,region');
  return uniq.map((r) => `${r.provider_id}:${r.type}`).sort();
}

async function syncOne({ id }) {
  const s = await tmdb(`/tv/${id}`, {
    append_to_response: 'aggregate_credits,videos,content_ratings,watch/providers,recommendations,external_ids',
  });
  if (!s) return;
  await saveRaw('tv', id, s);

  // Cast + crew
  const cast = (s.aggregate_credits?.cast || []).slice(0, CAST_LIMIT);
  const crew = [];
  for (const c of s.aggregate_credits?.crew || []) {
    for (const j of c.jobs || []) if (CREW_JOBS.has(j.job)) crew.push({ ...c, job: j.job, episode_count: j.episode_count });
  }
  await ensurePeople([...cast, ...crew]);

  await db.from('series_credits').delete().eq('series_id', id);
  const credits = new Map();
  cast.forEach((c, i) => {
    const role = c.roles?.[0]?.character || '';
    credits.set(`${c.id}|cast|${role}`, {
      series_id: id, person_id: c.id, kind: 'cast', role, ord: i, episodes: c.total_episode_count || null,
    });
  });
  crew.forEach((c, i) => {
    credits.set(`${c.id}|crew|${c.job}`, {
      series_id: id, person_id: c.id, kind: 'crew', role: c.job, ord: i, episodes: c.episode_count || null,
    });
  });
  await upsert('series_credits', [...credits.values()], 'series_id,person_id,kind,role');

  const providerKeys = await syncProviders(id, s['watch/providers']);

  await db.from('series_similar').delete().eq('series_id', id);
  const sim = (s.recommendations?.results || []).slice(0, 12).map((r, i) => ({ series_id: id, similar_id: r.id, ord: i }));
  await upsert('series_similar', sim, 'series_id,similar_id');

  // Seasons + episodes (specials / season 0 nahi)
  const seasons = (s.seasons || [])
    .filter((x) => x.season_number > 0 && x.episode_count > 0)
    .map((x) => ({
      n: x.season_number,
      name: x.name,
      air_date: x.air_date || null,
      episode_count: x.episode_count,
      poster_path: x.poster_path,
      overview: x.overview || null,
    }));
  await db.from('series_episodes').delete().eq('series_id', id);
  const episodes = [];
  for (const se of seasons) {
    const d = await tmdb(`/tv/${id}/season/${se.n}`);
    for (const e of d?.episodes || []) {
      episodes.push({
        series_id: id,
        season_number: se.n,
        episode_number: e.episode_number,
        name: e.name || null,
        air_date: e.air_date || null,
        runtime: e.runtime || null,
        overview: e.overview || null,
      });
    }
  }
  await upsert('series_episodes', episodes, 'series_id,season_number,episode_number');

  const cert = (s.content_ratings?.results || []).find((r) => r.iso_3166_1 === 'IN')?.rating || null;
  const genres = (s.genres || []).map((g) => ({ id: g.id, name: g.name }));
  const created_by = (s.created_by || []).map((c) => c.name);
  const next = s.next_episode_to_air
    ? {
        air_date: s.next_episode_to_air.air_date,
        season_number: s.next_episode_to_air.season_number,
        episode_number: s.next_episode_to_air.episode_number,
        name: s.next_episode_to_air.name,
      }
    : null;
  const runtimes = episodes.map((e) => e.runtime).filter(Boolean).sort((a, b) => a - b);
  const medianRuntime = runtimes.length ? runtimes[Math.floor(runtimes.length / 2)] : s.episode_run_time?.[0] || null;

  const facts_hash = hash({
    name: s.name,
    first_air_date: s.first_air_date,
    status: s.status,
    seasons: seasons.map((x) => [x.n, x.episode_count, x.air_date]),
    next,
    genres: genres.map((g) => g.name),
    overview: s.overview,
    cast: cast.slice(0, 8).map((c) => c.name),
    created_by,
    cert,
    providers: providerKeys,
  });

  const { error } = await db
    .from('series')
    .update({
      name: s.name,
      original_name: s.original_name,
      original_language: s.original_language,
      overview: s.overview,
      tagline: s.tagline || null,
      first_air_date: s.first_air_date || null,
      last_air_date: s.last_air_date || null,
      status: s.status,
      in_production: s.in_production,
      number_of_seasons: seasons.length,
      number_of_episodes: seasons.reduce((a, x) => a + x.episode_count, 0),
      episode_run_time: medianRuntime,
      genres,
      networks: (s.networks || []).map((n) => ({ id: n.id, name: n.name })),
      created_by,
      certification_in: cert,
      origin_country: s.origin_country || [],
      spoken_languages: (s.spoken_languages || []).map((l) => l.english_name || l.name).filter(Boolean),
      vote_average: s.vote_average,
      vote_count: s.vote_count,
      popularity: s.popularity,
      poster_path: s.poster_path,
      backdrop_path: s.backdrop_path,
      trailer_key: pickTrailer(s.videos),
      imdb_id: s.external_ids?.imdb_id || null,
      next_episode: next,
      seasons,
      facts_hash,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`series update: ${error.message}`);
}

async function main() {
  for (const p of await selectAll('people', 'id, slug')) {
    peopleIds.add(p.id);
    peopleSlugs.set(p.slug, p.id);
  }
  (await selectAll('providers', 'id')).forEach((p) => knownProviders.add(p.id));
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
  const list = await selectAll('series', 'id', (q) => (ALL ? q : q.or(`synced_at.is.null,synced_at.lt.${cutoff}`)));
  console.log(`Syncing ${list.length} series...`);
  await pool(list, CONCURRENCY, syncOne);
  console.log('Done. Agla step: npm run sync:people (naye actors ke liye)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
