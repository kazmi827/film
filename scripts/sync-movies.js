// Step 2: Har movie ki full details (cast, crew, OTT IN, trailer, certification, similar) DB mein.
// Usage:
//   npm run sync:movies                 -> jo kabhi sync nahi hui ya 7 din purani
//   npm run sync:movies -- --all=1      -> sab dobara
//   npm run sync:movies -- --providers-only=1  -> weekly OTT refresh (tez)
import { tmdb, db, upsert, pool, slugify, hash, arg, selectAll , saveRaw } from './_lib.js';

const ALL = arg('all', '0') === '1';
const PROVIDERS_ONLY = arg('providers-only', '0') === '1';
const STALE_DAYS = Number(arg('stale-days', 7));
const CONCURRENCY = Number(arg('concurrency', 8));

const CAST_LIMIT = 15;
const CREW_JOBS = new Set(['Director', 'Screenplay', 'Writer', 'Producer', 'Original Music Composer', 'Music', 'Director of Photography']);

// People slug registry (in-memory taake parallel workers collide na karein)
const peopleIds = new Set();
const peopleSlugs = new Map();
const knownProviders = new Set();
const pendingPeople = new Map(); // person id -> insert promise

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

function pickCertIN(releaseDates) {
  const IN = (releaseDates?.results || []).find((r) => r.iso_3166_1 === 'IN');
  return IN?.release_dates?.map((d) => d.certification).find(Boolean) || null;
}

// TMDB release types: 2 = theatrical (limited), 3 = theatrical, 4 = digital (OTT)
function pickReleaseIN(releaseDates, types) {
  const IN = (releaseDates?.results || []).find((r) => r.iso_3166_1 === 'IN');
  const dates = (IN?.release_dates || [])
    .filter((d) => types.includes(d.type) && d.release_date)
    .map((d) => d.release_date.slice(0, 10))
    .sort();
  return dates[0] || null;
}

// Franchise (collection) — har run mein ek collection sirf ek dafa fetch
const collectionJobs = new Map();
function syncCollection(id) {
  if (!collectionJobs.has(id)) {
    collectionJobs.set(
      id,
      (async () => {
        const c = await tmdb(`/collection/${id}`);
        if (!c) return null;
        const parts = (c.parts || [])
          .map((p) => ({ id: p.id, title: p.title, release_date: p.release_date || null, poster_path: p.poster_path }))
          .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'));
        const { error } = await db
          .from('collections')
          .upsert([{ id: c.id, name: c.name, overview: c.overview || null, parts, synced_at: new Date().toISOString() }], {
            onConflict: 'id',
          });
        if (error) throw new Error(`collections: ${error.message}`);
        return { name: c.name, parts };
      })()
    );
  }
  return collectionJobs.get(id);
}

async function syncProviders(movieId, wp) {
  const IN = wp?.results?.IN;
  await db.from('movie_providers').delete().eq('movie_id', movieId).eq('region', 'IN');
  if (!IN) return [];
  const rows = [];
  const provs = [];
  for (const type of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
    for (const p of IN[type] || []) {
      rows.push({ movie_id: movieId, provider_id: p.provider_id, type, region: 'IN', updated_at: new Date().toISOString() });
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
  await upsert('movie_providers', rows, 'movie_id,provider_id,type,region');
  return rows.map((r) => `${r.provider_id}:${r.type}`).sort();
}

async function syncOne({ id }) {
  if (PROVIDERS_ONLY) {
    const wp = await tmdb(`/movie/${id}/watch/providers`);
    await syncProviders(id, wp);
    return;
  }

  const m = await tmdb(`/movie/${id}`, {
    append_to_response: 'credits,videos,release_dates,watch/providers,recommendations,external_ids',
  });
  if (!m) return;

  await saveRaw('movie', id, m);

  // People stubs (naye log hi insert, purano ka slug nahi badalta)
  const cast = (m.credits?.cast || []).slice(0, CAST_LIMIT);
  const crew = (m.credits?.crew || []).filter((c) => CREW_JOBS.has(c.job));
  const newPeople = [];
  const waitFor = [];
  for (const p of [...cast, ...crew]) {
    if (peopleIds.has(p.id)) {
      // Doosra worker abhi isay insert kar raha ho to uska intezar
      if (pendingPeople.has(p.id)) waitFor.push(pendingPeople.get(p.id));
      continue;
    }
    peopleIds.add(p.id);
    newPeople.push({
      id: p.id,
      slug: personSlug(p.id, p.name),
      name: p.name,
      gender: p.gender,
      known_for_department: p.known_for_department,
      profile_path: p.profile_path,
      popularity: p.popularity,
    });
  }
  if (newPeople.length) {
    const ins = db
      .from('people')
      .upsert(newPeople, { onConflict: 'id', ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) throw new Error(`people: ${error.message}`);
      });
    for (const p of newPeople) pendingPeople.set(p.id, ins);
    await ins;
  }
  await Promise.allSettled(waitFor);

  // Credits
  await db.from('credits').delete().eq('movie_id', id);
  const creditMap = new Map();
  cast.forEach((c, i) => {
    const row = { movie_id: id, person_id: c.id, kind: 'cast', role: c.character || '', department: 'Acting', ord: i };
    creditMap.set(`${c.id}|cast|${row.role}`, row);
  });
  crew.forEach((c, i) => {
    const row = { movie_id: id, person_id: c.id, kind: 'crew', role: c.job, department: c.department, ord: i };
    creditMap.set(`${c.id}|crew|${row.role}`, row);
  });
  await upsert('credits', [...creditMap.values()], 'movie_id,person_id,kind,role');

  const providerKeys = await syncProviders(id, m['watch/providers']);

  // Similar
  await db.from('movie_similar').delete().eq('movie_id', id);
  const sim = (m.recommendations?.results || []).slice(0, 12).map((r, i) => ({ movie_id: id, similar_id: r.id, ord: i }));
  await upsert('movie_similar', sim, 'movie_id,similar_id');

  const director = crew.filter((c) => c.job === 'Director').map((c) => c.name);
  const certification = pickCertIN(m.release_dates);
  const genres = (m.genres || []).map((g) => ({ id: g.id, name: g.name }));
  const theatrical_release_in = pickReleaseIN(m.release_dates, [3, 2]);
  const digital_release_in = pickReleaseIN(m.release_dates, [4]);
  const spoken_languages = (m.spoken_languages || []).map((l) => l.english_name || l.name).filter(Boolean);
  const collection_id = m.belongs_to_collection?.id || null;
  const collection = collection_id ? await syncCollection(collection_id) : null;

  // Content sirf in facts par based hai; yeh badlein to AI content regenerate hoga
  const facts_hash = hash({
    title: m.title,
    release_date: m.release_date,
    runtime: m.runtime,
    genres: genres.map((g) => g.name),
    overview: m.overview,
    cast: cast.slice(0, 8).map((c) => c.name),
    director,
    certification,
    providers: providerKeys,
    theatrical_release_in,
    digital_release_in,
    collection: collection ? collection.parts.map((p) => p.id) : null,
  });

  const { error } = await db
    .from('movies')
    .update({
      title: m.title,
      original_title: m.original_title,
      original_language: m.original_language,
      overview: m.overview,
      tagline: m.tagline || null,
      release_date: m.release_date || null,
      runtime: m.runtime || null,
      budget: m.budget || null,
      revenue: m.revenue || null,
      genres,
      certification_in: certification,
      production_countries: (m.production_countries || []).map((c) => c.iso_3166_1),
      theatrical_release_in,
      digital_release_in,
      spoken_languages,
      collection_id,
      imdb_id: m.external_ids?.imdb_id || m.imdb_id || null,
      vote_average: m.vote_average,
      vote_count: m.vote_count,
      popularity: m.popularity,
      poster_path: m.poster_path,
      backdrop_path: m.backdrop_path,
      trailer_key: pickTrailer(m.videos),
      status: m.status,
      facts_hash,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`movie update: ${error.message}`);
}

async function main() {
  const people = await selectAll('people', 'id, slug');
  for (const p of people) {
    peopleIds.add(p.id);
    peopleSlugs.set(p.slug, p.id);
  }
  const provs = await selectAll('providers', 'id');
  provs.forEach((p) => knownProviders.add(p.id));

  const cutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();
  const movies = await selectAll('movies', 'id', (q) =>
    ALL || PROVIDERS_ONLY ? q : q.or(`synced_at.is.null,synced_at.lt.${cutoff}`)
  );

  console.log(`Syncing ${movies.length} movies${PROVIDERS_ONLY ? ' (providers only)' : ''}...`);
  await pool(movies, CONCURRENCY, syncOne);
  console.log('Done. Agla step: npm run sync:people');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
