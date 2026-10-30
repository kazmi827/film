// Ek dafa: jin movies/series ka country khali hai, TMDB se bhar do (halki call, baqi data nahi chhedta).
// Usage: npm run backfill:countries
import { tmdb, db, pool, selectAll } from './_lib.js';

async function main() {
  const movies = (await selectAll('movies', 'id, production_countries')).filter((m) => !m.production_countries?.length);
  console.log(`Movies: ${movies.length} ka country bharna hai`);
  await pool(movies, 10, async ({ id }) => {
    const m = await tmdb(`/movie/${id}`);
    if (!m) return;
    const codes = (m.production_countries || []).map((c) => c.iso_3166_1);
    if (!codes.length) return;
    const { error } = await db.from('movies').update({ production_countries: codes }).eq('id', id);
    if (error) throw new Error(error.message);
  });

  const series = (await selectAll('series', 'id, origin_country')).filter((s) => !s.origin_country?.length);
  console.log(`Series: ${series.length} ka country bharna hai`);
  await pool(series, 10, async ({ id }) => {
    const s = await tmdb(`/tv/${id}`);
    if (!s?.origin_country?.length) return;
    const { error } = await db.from('series').update({ origin_country: s.origin_country }).eq('id', id);
    if (error) throw new Error(error.message);
  });

  // Report: non-India films (inka content dobara banna chahiye taake "Indian" na likha ho)
  const all = await selectAll('movies', 'id, title, production_countries, movie_content(movie_id)');
  const nonIN = all.filter((m) => m.production_countries?.length && !m.production_countries.includes('IN'));
  const withContent = nonIN.filter((m) => m.movie_content);
  console.log(`\nIndia ke baghair produced movies: ${nonIN.length} (in mein se ${withContent.length} ka content pehle ban chuka)`);
  const byC = {};
  for (const m of nonIN) for (const c of m.production_countries) byC[c] = (byC[c] || 0) + 1;
  console.log('  Countries:', byC);
  console.log('Agla step: supabase/regen-non-india.sql chalao, phir npm run content:generate');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
