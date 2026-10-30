// Pure logic (no DB): hubs, combo lists, OTT calendar.
// Site (lib/db.js) aur report script (scripts/report-pages.js) dono yahi use karte hain,
// taake report ka count aur live pages hamesha same rahein.
import { LANG_HUBS, GENRES, genreBySlug, HUB_MIN, HUB_PER_PAGE } from './format.js';

export const LIST_MIN = 8; // list tabhi banti hai jab 8+ asli titles hon
export const LIST_MAX = 50;
export const CAL_MIN = 5; // OTT calendar month tabhi jab 5+ releases hon

// "Indian" label sirf un titles par jin ki production country mein India ho
export const isIN = (m) => (m.countries || []).includes('IN');

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function score(m) {
  if (m.imdb_rating) return { value: Number(m.imdb_rating), source: 'IMDb' };
  if (m.vote_count >= 20 && m.vote_average) return { value: Number(m.vote_average), source: 'TMDB' };
  return null;
}
const byRating = (a, b) => (score(b)?.value ?? -1) - (score(a)?.value ?? -1) || (b.popularity || 0) - (a.popularity || 0);
const byPopularity = (a, b) => (b.popularity || 0) - (a.popularity || 0);
const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');

// ---------------- Hubs ----------------
export function hubFilter(type, key) {
  if (type === 'lang') {
    const code = LANG_HUBS[key];
    return code ? (m) => m.original_language === code : null;
  }
  if (type === 'genre') {
    const g = genreBySlug(key);
    return g ? (m) => isIN(m) && (m.genres || []).some((x) => x.id === g.id) : null;
  }
  if (type === 'year') return /^(19|20)\d{2}$/.test(key) ? (m) => isIN(m) && (m.date || '').startsWith(key) : null;
  return null;
}

export function hubIndex(items) {
  const count = (f) => items.filter(f).length;
  const langs = Object.keys(LANG_HUBS)
    .map((k) => ({ key: k, count: count(hubFilter('lang', k)) }))
    .filter((x) => x.count >= HUB_MIN);
  const genres = GENRES.map((g) => ({ key: g.slug, name: g.name, count: count(hubFilter('genre', g.slug)) })).filter(
    (x) => x.count >= HUB_MIN
  );
  const years = [...new Set(items.map((m) => (m.date || '').slice(0, 4)).filter(Boolean))]
    .sort()
    .reverse()
    .map((y) => ({ key: y, count: count(hubFilter('year', y)) }))
    .filter((x) => x.count >= HUB_MIN);
  return { langs, genres, years };
}

export function stats(list, streamingBy, today) {
  const years = list.map((m) => (m.date || '').slice(0, 4)).filter(Boolean).sort();
  const released = list.filter((m) => m.date && m.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const counts = new Map();
  let streaming = 0;
  for (const m of list) {
    const provs = streamingBy.get(m.id);
    if (!provs?.length) continue;
    streaming++;
    for (const p of provs) counts.set(p.name, (counts.get(p.name) || 0) + 1);
  }
  const rated = list.map((m) => ({ m, s: score(m) })).filter((x) => x.s).sort((a, b) => b.s.value - a.s.value);
  const runtimes = list.map((m) => m.runtime).filter(Boolean);
  return {
    minYear: years[0],
    maxYear: years[years.length - 1],
    newest: released[0] || null,
    upcoming: list.filter((m) => m.date && m.date > today).length,
    streaming,
    topProviders: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    topRated: rated[0] ? { item: rated[0].m, ...rated[0].s } : null,
    avgRuntime: runtimes.length ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : null,
  };
}

export function computeHub(items, streamingBy, type, key, page, today) {
  if (!Number.isInteger(page)) return null;
  const f = hubFilter(type, key);
  if (!f) return null;
  const list = items.filter(f).sort(byPopularity);
  if (list.length < HUB_MIN) return null;
  const pages = Math.ceil(list.length / HUB_PER_PAGE);
  if (page < 1 || page > pages) return null;
  return {
    total: list.length,
    page,
    pages,
    items: list.slice((page - 1) * HUB_PER_PAGE, page * HUB_PER_PAGE),
    stats: stats(list, streamingBy, today),
  };
}

// ---------------- Combo lists ----------------
// Platforms: woh OTT jin par kam az kam HUB_MIN titles stream ho rahe hon
export function platforms(items, streamingBy) {
  const count = new Map();
  for (const m of items) for (const p of streamingBy.get(m.id) || []) {
    const c = count.get(p.slug) || { slug: p.slug, name: p.name, n: 0 };
    c.n++;
    count.set(p.slug, c);
  }
  return [...count.values()].filter((p) => p.n >= HUB_MIN).sort((a, b) => b.n - a.n);
}

function onPlatform(streamingBy, slug) {
  return (m) => (streamingBy.get(m.id) || []).some((p) => p.slug === slug);
}

// Har possible list ki definition (slug -> filter, sort, labels). Gate ke baad sirf 8+ wali bachti hain.
export function listDefs(movies, mStreaming, series, sStreaming) {
  const defs = [];
  const mPlats = platforms(movies, mStreaming);
  const sPlats = platforms(series, sStreaming);
  const langs = Object.keys(LANG_HUBS);
  const years = [...new Set(movies.map((m) => (m.date || '').slice(0, 4)).filter(Boolean))];
  const add = (d) => defs.push(d);

  for (const L of langs) {
    const lf = hubFilter('lang', L);
    for (const g of GENRES) {
      // Language lists mein sab mulk (e.g. Pakistani Punjabi films) — sirf genre check
      const gf = (m) => (m.genres || []).some((x) => x.id === g.id);
      add({ slug: `${L}-${g.slug}-movies`, kind: 'movies', lang: L, genre: g, filter: (m) => lf(m) && gf(m) });
      for (const p of mPlats)
        add({ slug: `${L}-${g.slug}-movies-on-${p.slug}`, kind: 'movies', lang: L, genre: g, platform: p,
          filter: (m) => lf(m) && gf(m) && onPlatform(mStreaming, p.slug)(m) });
      for (const y of years)
        add({ slug: `${L}-${g.slug}-movies-${y}`, kind: 'movies', lang: L, genre: g, year: y,
          filter: (m) => lf(m) && gf(m) && (m.date || '').startsWith(y) });
    }
    for (const p of mPlats)
      add({ slug: `${L}-movies-on-${p.slug}`, kind: 'movies', lang: L, platform: p, filter: (m) => lf(m) && onPlatform(mStreaming, p.slug)(m) });
    for (const y of years)
      add({ slug: `${L}-movies-${y}`, kind: 'movies', lang: L, year: y, filter: (m) => lf(m) && (m.date || '').startsWith(y) });
    // Web series
    add({ slug: `${L}-web-series`, kind: 'series', lang: L, filter: lf, skipIfHub: true });
    for (const p of sPlats)
      add({ slug: `${L}-web-series-on-${p.slug}`, kind: 'series', lang: L, platform: p, filter: (s) => lf(s) && onPlatform(sStreaming, p.slug)(s) });
  }
  // Language ke baghair lists = "Indian" lists, is liye sirf India-produced titles (genre filter isIN pehle se lagata hai)
  for (const g of GENRES) {
    const gf = hubFilter('genre', g.slug);
    for (const p of mPlats)
      add({ slug: `${g.slug}-movies-on-${p.slug}`, kind: 'movies', genre: g, platform: p, filter: (m) => gf(m) && onPlatform(mStreaming, p.slug)(m) });
    for (const y of years)
      add({ slug: `${g.slug}-movies-${y}`, kind: 'movies', genre: g, year: y, filter: (m) => gf(m) && (m.date || '').startsWith(y) });
    add({ slug: `${g.slug}-web-series`, kind: 'series', genre: g, filter: gf });
  }
  for (const p of mPlats)
    add({ slug: `indian-movies-on-${p.slug}`, kind: 'movies', platform: p, filter: (m) => isIN(m) && onPlatform(mStreaming, p.slug)(m) });
  for (const p of sPlats)
    add({ slug: `indian-web-series-on-${p.slug}`, kind: 'series', platform: p, filter: (s) => isIN(s) && onPlatform(sStreaming, p.slug)(s) });
  // Lang-only web series list ki jagah /web-series/[lang] hub hai
  return defs.filter((d) => !d.skipIfHub);
}

export function listTitle(d, n) {
  const lang = d.lang ? cap(d.lang) + ' ' : 'Indian ';
  const genre = d.genre ? d.genre.name + ' ' : '';
  const noun = d.kind === 'series' ? 'Web Series' : 'Movies';
  if (d.year) return `${lang}${genre}${noun} of ${d.year}: All ${n} Releases`;
  const plat = d.platform ? ` on ${d.platform.name}` : '';
  return `Best ${lang}${genre}${noun}${plat}: ${n} Picks Ranked by Rating`;
}

export function computeList(def, pool) {
  let list = pool.filter(def.filter);
  if (list.length < LIST_MIN) return null;
  // Year lists poori hoti hain (complete list ka wada), rating lists top LIST_MAX tak
  list = def.year ? list.sort(byDate) : list.sort(byRating).slice(0, LIST_MAX);
  return { total: pool.filter(def.filter).length, items: list };
}

export function allLists(movies, mStreaming, series, sStreaming) {
  const out = [];
  for (const d of listDefs(movies, mStreaming, series, sStreaming)) {
    const r = computeList(d, d.kind === 'series' ? series : movies);
    if (r) out.push({ def: d, ...r });
  }
  return out;
}

// ---------------- OTT calendar ----------------
export const monthSlug = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}-${ym.slice(0, 4)}`;
export function parseMonthSlug(slug) {
  const m = /^([a-z]+)-(\d{4})$/.exec(slug || '');
  if (!m) return null;
  const i = MONTHS.indexOf(m[1]);
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}
export const monthLabel = (ym) => `${cap(MONTHS[Number(ym.slice(5, 7)) - 1])} ${ym.slice(0, 4)}`;

export function calendarMonths(movies) {
  const by = new Map();
  for (const m of movies) {
    if (!m.digital_release_in) continue;
    const ym = m.digital_release_in.slice(0, 7);
    if (!by.has(ym)) by.set(ym, []);
    by.get(ym).push(m);
  }
  return [...by.entries()]
    .filter(([, list]) => list.length >= CAL_MIN)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([ym, list]) => ({ ym, slug: monthSlug(ym), items: list.sort((a, b) => a.digital_release_in.localeCompare(b.digital_release_in)) }));
}
