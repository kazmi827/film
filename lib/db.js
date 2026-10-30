import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { computeHub, hubIndex, allLists, stats, calendarMonths } from '@/lib/catalog';

let client;

// Site sirf anon key use karti hai (RLS: sirf published movies)
export function getDb() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

const CARD = 'id, slug, title, release_date, poster_path, vote_average';
const today = () => new Date().toISOString().slice(0, 10);

async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// ---------------- Movie ----------------
export const getMovie = cache(async (slug) => {
  const db = getDb();
  if (!db) return null;
  const { data: movie } = await db.from('movies').select('*').eq('slug', slug).maybeSingle();
  if (!movie) return null;

  const [content, credits, providers, similar, collection] = await Promise.all([
    db.from('movie_content').select('*').eq('movie_id', movie.id).maybeSingle(),
    db
      .from('credits')
      .select('kind, role, ord, people(id, slug, name, profile_path, is_published)')
      .eq('movie_id', movie.id)
      .order('ord'),
    db
      .from('movie_providers')
      .select('type, providers(id, name, slug, logo_path, priority)')
      .eq('movie_id', movie.id)
      .eq('region', 'IN'),
    db.from('movie_similar').select('similar_id, ord').eq('movie_id', movie.id).order('ord'),
    movie.collection_id
      ? db.from('collections').select('id, name, parts').eq('id', movie.collection_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const creditRows = credits.data || [];

  // Similar: sirf humari site par published (RLS filter karta hai)
  let similarMovies = [];
  const ids = (similar.data || []).map((s) => s.similar_id);
  if (ids.length) {
    const { data } = await db.from('movies').select(CARD).in('id', ids);
    const order = new Map(ids.map((id, i) => [id, i]));
    similarMovies = (data || []).sort((a, b) => order.get(a.id) - order.get(b.id)).slice(0, 6);
  }
  if (similarMovies.length < 6 && movie.genres?.[0]) {
    const { data } = await db
      .from('movies')
      .select(CARD)
      .eq('original_language', movie.original_language)
      .contains('genres', [{ id: movie.genres[0].id }])
      .neq('id', movie.id)
      .order('popularity', { ascending: false })
      .limit(12);
    const have = new Set(similarMovies.map((m) => m.id));
    for (const m of data || []) {
      if (similarMovies.length >= 6) break;
      if (!have.has(m.id)) similarMovies.push(m);
    }
  }

  // Franchise: TMDB collection parts; published parts ko link milta hai
  let franchise = null;
  if (collection.data?.parts?.length >= 2) {
    const partIds = collection.data.parts.map((p) => p.id);
    const { data: live } = await db.from('movies').select('id, slug').in('id', partIds);
    const slugOf = new Map((live || []).map((r) => [r.id, r.slug]));
    franchise = {
      name: collection.data.name,
      parts: collection.data.parts.map((p) => ({ ...p, slug: slugOf.get(p.id) || null })),
    };
  }

  // More from director / lead actor (sirf published movies)
  const moreBy = async (person, filter) => {
    if (!person) return [];
    let q = db.from('credits').select(`movie_id, movies(${CARD})`).eq('person_id', person.id).neq('movie_id', movie.id);
    q = filter(q);
    const { data } = await q;
    const seen = new Set();
    return (data || [])
      .map((r) => r.movies)
      .filter((m) => m && !seen.has(m.id) && seen.add(m.id))
      .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
      .slice(0, 6);
  };
  const director = creditRows.find((c) => c.kind === 'crew' && c.role === 'Director')?.people;
  const lead = creditRows.find((c) => c.kind === 'cast' && c.ord === 0)?.people;
  const [byDirector, byLead] = await Promise.all([
    moreBy(director, (q) => q.eq('kind', 'crew').eq('role', 'Director')),
    moreBy(lead, (q) => q.eq('kind', 'cast')),
  ]);

  return {
    movie,
    content: content.data,
    credits: creditRows,
    providers: providers.data || [],
    similar: similarMovies,
    franchise,
    director,
    lead,
    byDirector,
    byLead,
  };
});

// ---------------- Person ----------------
export const getPerson = cache(async (slug) => {
  const db = getDb();
  if (!db) return null;
  const { data: person } = await db
    .from('people')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (!person) return null;
  const [content, credits, sCredits] = await Promise.all([
    db.from('person_content').select('*').eq('person_id', person.id).maybeSingle(),
    db
      .from('credits')
      .select('kind, role, movies(id, slug, title, release_date, poster_path, vote_average, imdb_rating, is_published)')
      .eq('person_id', person.id),
    db
      .from('series_credits')
      .select('kind, role, episodes, series(id, slug, name, first_air_date, poster_path, vote_average, number_of_seasons)')
      .eq('person_id', person.id),
  ]);
  const shows = [...new Map((sCredits.data || []).filter((c) => c.series).map((c) => [c.series.id, c])).values()].sort(
    (a, b) => (b.series.first_air_date || '').localeCompare(a.series.first_air_date || '')
  );
  const films = (credits.data || [])
    .filter((c) => c.movies)
    .sort((a, b) => (b.movies.release_date || '').localeCompare(a.movies.release_date || ''));
  return { person, content: content.data, films, shows };
});

// ---------------- Catalog (hubs, lists, calendar, home, sitemap) ----------------
// Sab published titles + streaming info; har count/stat isi se calculate hota hai (koi andaza nahi)
export const getCatalog = cache(async () => {
  const db = getDb();
  const empty = { movies: [], mStreaming: new Map(), series: [], sStreaming: new Map() };
  if (!db) return empty;
  const [mRows, mProv, sRows, sProv] = await Promise.all([
    selectAll(() =>
      db
        .from('movies')
        .select(
          'id, slug, title, original_language, genres, release_date, popularity, poster_path, vote_average, vote_count, imdb_rating, runtime, certification_in, digital_release_in, production_countries, movie_content(best_for)'
        )
        .order('id')
    ),
    selectAll(() =>
      db.from('movie_providers').select('movie_id, providers(name, slug)').in('type', ['flatrate', 'free', 'ads']).order('movie_id')
    ),
    selectAll(() =>
      db
        .from('series')
        .select(
          'id, slug, name, original_language, genres, first_air_date, popularity, poster_path, vote_average, vote_count, episode_run_time, number_of_seasons, number_of_episodes, status, certification_in, origin_country, series_content(best_for)'
        )
        .order('id')
    ),
    selectAll(() =>
      db.from('series_providers').select('series_id, providers(name, slug)').in('type', ['flatrate', 'free', 'ads']).order('series_id')
    ),
  ]);
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
  const movies = mRows.map((m) => ({
    ...m,
    kind: 'movie',
    date: m.release_date,
    countries: m.production_countries || [],
    best_for: m.movie_content?.best_for || null,
  }));
  const series = sRows.map((x) => ({
    ...x,
    kind: 'series',
    title: x.name,
    date: x.first_air_date,
    runtime: x.episode_run_time,
    // Series discover sirf origin_country=IN se hota hai
    countries: x.origin_country?.length ? x.origin_country : ['IN'],
    best_for: x.series_content?.best_for || null,
  }));
  return { movies, mStreaming: group(mProv, 'movie_id'), series, sStreaming: group(sProv, 'series_id') };
});

// type: 'lang' | 'genre' | 'year' (movies) | 'series-lang' (web series)
export async function getHub(type, key, page = 1) {
  const c = await getCatalog();
  const isSeries = type === 'series-lang';
  const hub = computeHub(
    isSeries ? c.series : c.movies,
    isSeries ? c.sStreaming : c.mStreaming,
    isSeries ? 'lang' : type,
    key,
    page,
    today()
  );
  return hub ? { ...hub, movies: hub.items } : null;
}

export const getHubIndex = cache(async () => {
  const c = await getCatalog();
  const m = hubIndex(c.movies);
  const s = hubIndex(c.series);
  return { ...m, seriesLangs: s.langs };
});

export const getAllLists = cache(async () => {
  const c = await getCatalog();
  return allLists(c.movies, c.mStreaming, c.series, c.sStreaming);
});

export async function getList(slug) {
  const lists = await getAllLists();
  const hit = lists.find((l) => l.def.slug === slug);
  if (!hit) return null;
  const c = await getCatalog();
  const streaming = hit.def.kind === 'series' ? c.sStreaming : c.mStreaming;
  const pool = hit.def.kind === 'series' ? c.series : c.movies;
  // Related lists: same language ya genre wali doosri lists
  const related = lists
    .filter((l) => l.def.slug !== slug && ((hit.def.lang && l.def.lang === hit.def.lang) || (hit.def.genre && l.def.genre?.slug === hit.def.genre?.slug)))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
  return { ...hit, streaming, stats: stats(pool.filter(hit.def.filter), streaming, today()), related };
}

export const getCalendar = cache(async () => {
  const c = await getCatalog();
  return { months: calendarMonths(c.movies), streaming: c.mStreaming };
});

export async function getHome() {
  const { movies, series } = await getCatalog();
  const t = today();
  return {
    upcoming: movies
      .filter((m) => m.date > t)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6),
    latest: movies
      .filter((m) => m.date && m.date <= t)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12),
    popular: [...movies].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 12),
    series: [...series].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 12),
  };
}

// ---------------- Series ----------------
export const getSeries = cache(async (slug) => {
  const db = getDb();
  if (!db) return null;
  const { data: s } = await db.from('series').select('*').eq('slug', slug).maybeSingle();
  if (!s) return null;
  const [content, credits, providers, similar, episodes] = await Promise.all([
    db.from('series_content').select('*').eq('series_id', s.id).maybeSingle(),
    db
      .from('series_credits')
      .select('kind, role, ord, episodes, people(id, slug, name, profile_path, is_published)')
      .eq('series_id', s.id)
      .order('ord'),
    db
      .from('series_providers')
      .select('type, providers(id, name, slug, logo_path, priority)')
      .eq('series_id', s.id)
      .eq('region', 'IN'),
    db.from('series_similar').select('similar_id, ord').eq('series_id', s.id).order('ord'),
    db
      .from('series_episodes')
      .select('season_number, episode_number, name, air_date, runtime, overview')
      .eq('series_id', s.id)
      .order('season_number')
      .order('episode_number'),
  ]);
  let similarSeries = [];
  const ids = (similar.data || []).map((x) => x.similar_id);
  if (ids.length) {
    const { data } = await db.from('series').select('id, slug, name, first_air_date, poster_path, vote_average').in('id', ids);
    const order = new Map(ids.map((id, i) => [id, i]));
    similarSeries = (data || [])
      .sort((a, b) => order.get(a.id) - order.get(b.id))
      .slice(0, 6)
      .map((x) => ({ ...x, kind: 'series', title: x.name, release_date: x.first_air_date }));
  }
  return {
    series: s,
    content: content.data,
    credits: credits.data || [],
    providers: providers.data || [],
    similar: similarSeries,
    episodes: episodes.data || [],
  };
});

// Season page sirf tab: series ke 2+ seasons hon aur is season ke 3+ episodes ka data ho
export function seasonEligible(data, n) {
  if (!data || (data.series.number_of_seasons || 0) < 2) return null;
  const season = (data.series.seasons || []).find((x) => x.n === n);
  if (!season || !season.air_date) return null;
  const eps = data.episodes.filter((e) => e.season_number === n);
  if (eps.length < 3) return null;
  return { season, eps };
}

// ---------------- Sitemap ----------------
export async function getSitemapEntries() {
  const db = getDb();
  if (!db) return [];
  const out = [];
  for (const [table, prefix] of [
    ['movies', '/movie/'],
    ['people', '/actor/'],
  ]) {
    const rows = await selectAll(() => db.from(table).select('slug, updated_at').eq('is_published', true).order('id'));
    for (const r of rows) out.push({ url: prefix + r.slug, lastModified: r.updated_at });
  }
  const sRows = await selectAll(() =>
    db.from('series').select('id, slug, updated_at, number_of_seasons, seasons').eq('is_published', true).order('id')
  );
  const multi = sRows.filter((r) => (r.number_of_seasons || 0) >= 2).map((r) => r.id);
  const epCount = new Map();
  if (multi.length) {
    const eps = await selectAll(() =>
      db.from('series_episodes').select('series_id, season_number').in('series_id', multi).order('series_id')
    );
    for (const e of eps) {
      const k = `${e.series_id}|${e.season_number}`;
      epCount.set(k, (epCount.get(k) || 0) + 1);
    }
  }
  for (const r of sRows) {
    out.push({ url: `/series/${r.slug}`, lastModified: r.updated_at });
    if ((r.number_of_seasons || 0) < 2) continue;
    for (const se of r.seasons || []) {
      if (se.air_date && (epCount.get(`${r.id}|${se.n}`) || 0) >= 3) out.push({ url: `/series/${r.slug}/season/${se.n}`, lastModified: r.updated_at });
    }
  }
  const idx = await getHubIndex();
  for (const l of idx.langs) out.push({ url: `/movies/${l.key}` });
  for (const l of idx.seriesLangs) out.push({ url: `/web-series/${l.key}` });
  for (const g of idx.genres) out.push({ url: `/genre/${g.key}` });
  for (const y of idx.years) out.push({ url: `/year/${y.key}` });
  for (const l of await getAllLists()) out.push({ url: `/list/${l.def.slug}` });
  const cal = await getCalendar();
  if (cal.months.length) out.push({ url: '/ott-releases' });
  for (const m of cal.months) out.push({ url: `/ott-releases/${m.slug}` });
  return out;
}
