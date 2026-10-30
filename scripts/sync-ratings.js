// Optional: IMDb rating OMDb se (OMDB_API_KEY chahiye). Free tier = 1000/day, isliye --limit use karo.
// Usage: npm run sync:ratings -- --limit=900
import { db, pool, arg, selectAll, env } from './_lib.js';

const KEY = env('OMDB_API_KEY');
const LIMIT = Number(arg('limit', 900));

async function main() {
  // Default: sirf jin ki rating abhi nahi aayi. --all=1 se sab refresh (weekly)
  const ALL = arg('all', '0') === '1';
  const rows = await selectAll('movies', 'id, imdb_id', (q) => {
    q = q.not('imdb_id', 'is', null);
    return ALL ? q.order('popularity', { ascending: false }) : q.is('imdb_votes', null);
  });
  const todo = rows.slice(0, LIMIT);
  console.log(`OMDb: ${todo.length} movies`);
  await pool(todo, 4, async ({ id, imdb_id }) => {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdb_id}&apikey=${KEY}`);
    const j = await res.json();
    if (j.Response !== 'True') return;
    const rating = parseFloat(j.imdbRating);
    const votes = parseInt(String(j.imdbVotes || '').replace(/,/g, ''), 10);
    const { error } = await db
      .from('movies')
      .update({ imdb_rating: isNaN(rating) ? null : rating, imdb_votes: isNaN(votes) ? 0 : votes })
      .eq('id', id);
    if (error) throw new Error(error.message);
  });
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
