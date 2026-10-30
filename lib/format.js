export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://filmchilive.com';
export const SITE_NAME = 'FilmchiLive';

export const img = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

export const year = (d) => (d ? String(d).slice(0, 4) : '');

export function runtime(min) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function date(d) {
  if (!d) return null;
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const LANGS = { hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', pa: 'Punjabi', gu: 'Gujarati', en: 'English' };
let regionNames;
export function country(code) {
  try {
    regionNames ||= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

export const lang = (code) => LANGS[code] || (code ? code.toUpperCase() : '');

export function money(n) {
  if (!n) return null;
  // TMDB budget/revenue USD mein hota hai
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} million`;
  return `$${n.toLocaleString('en-US')}`;
}

export function age(birthday, deathday) {
  if (!birthday) return null;
  const end = deathday ? new Date(deathday) : new Date();
  const b = new Date(birthday);
  let a = end.getFullYear() - b.getFullYear();
  const m = end.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < b.getDate())) a--;
  return a;
}

export const PROVIDER_TYPE = {
  flatrate: 'Subscription',
  free: 'Free',
  ads: 'Free with ads',
  rent: 'Rent',
  buy: 'Buy',
};

// Hubs: URL slug <-> TMDB language code
export const LANG_HUBS = {
  hindi: 'hi', telugu: 'te', tamil: 'ta', malayalam: 'ml', kannada: 'kn',
  bengali: 'bn', marathi: 'mr', punjabi: 'pa', gujarati: 'gu',
};
export const langHub = (code) => Object.keys(LANG_HUBS).find((k) => LANG_HUBS[k] === code) || null;

// TMDB movie genre ids
export const GENRES = [
  [28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'],
  [99, 'Documentary'], [18, 'Drama'], [10751, 'Family'], [14, 'Fantasy'], [36, 'History'],
  [27, 'Horror'], [10402, 'Music'], [9648, 'Mystery'], [10749, 'Romance'], [878, 'Science Fiction'],
  [53, 'Thriller'], [10752, 'War'],
].map(([id, name]) => ({ id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
export const genreBySlug = (s) => GENRES.find((g) => g.slug === s) || null;
export const genreById = (id) => GENRES.find((g) => g.id === id) || null;

export const HUB_PER_PAGE = 48;
export const HUB_MIN = 8; // isse kam movies hon to hub page nahi banta
