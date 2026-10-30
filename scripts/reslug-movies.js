// Ek dafa chalane wala: sab movie slugs ko sirf naam par le aao (year ke baghair).
// Same naam ki 2 movies hon to zyada popular ko saaf naam milta hai, doosri ko naam-year.
// Usage: node scripts/reslug-movies.js
// Site live hone ke baad dobara mat chalana, warna URLs badal jayenge.
import { db, pool, slugify, selectAll } from './_lib.js';

async function main() {
  const movies = await selectAll('movies', 'id, title, release_date, slug', (q) =>
    q.order('popularity', { ascending: false })
  );

  const taken = new Set();
  const plan = movies.map((m) => {
    const base = slugify(m.title) || `movie-${m.id}`;
    const y = (m.release_date || '').slice(0, 4);
    let slug = base;
    if (taken.has(slug) && y) slug = `${base}-${y}`;
    if (taken.has(slug)) slug = `${base}-${m.id}`;
    taken.add(slug);
    return { id: m.id, old: m.slug, slug };
  });

  const changes = plan.filter((p) => p.old !== p.slug);
  console.log(`${changes.length} slugs badlenge`);
  changes.slice(0, 10).forEach((c) => console.log(`  ${c.old}  ->  ${c.slug}`));

  // Step 1: temp slug (unique conflict se bachne ke liye)
  await pool(changes, 8, async (c) => {
    const { error } = await db.from('movies').update({ slug: `tmp-${c.id}` }).eq('id', c.id);
    if (error) throw new Error(error.message);
  });
  // Step 2: final slug
  await pool(changes, 8, async (c) => {
    const { error } = await db.from('movies').update({ slug: c.slug }).eq('id', c.id);
    if (error) throw new Error(error.message);
  });
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
