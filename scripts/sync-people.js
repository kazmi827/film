// Step 3: Actors/crew ki full details (bio, birthday, etc.)
// Default: sirf woh log jo kisi movie mein top-8 cast ya Director hain (actor pages ke candidates)
// Usage: npm run sync:people  |  -- --all=1
import { tmdb, db, upsert, pool, arg, selectAll , saveRaw } from './_lib.js';

const ALL = arg('all', '0') === '1';
const CONCURRENCY = Number(arg('concurrency', 8));

async function syncOne(id) {
  const p = await tmdb(`/person/${id}`, { append_to_response: 'external_ids' });
  if (!p) return;
  await saveRaw('person', id, p);
  const { error } = await db
    .from('people')
    .update({
      name: p.name,
      also_known_as: p.also_known_as || [],
      biography: p.biography || null,
      birthday: p.birthday || null,
      deathday: p.deathday || null,
      place_of_birth: p.place_of_birth || null,
      gender: p.gender,
      known_for_department: p.known_for_department,
      profile_path: p.profile_path,
      imdb_id: p.external_ids?.imdb_id || p.imdb_id || null,
      popularity: p.popularity,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

async function main() {
  let ids;
  if (ALL) {
    ids = (await selectAll('people', 'id')).map((r) => r.id);
  } else {
    const credits = [
      ...(await selectAll('credits', 'person_id, kind, role, ord')),
      ...(await selectAll('series_credits', 'person_id, kind, role, ord')),
    ];
    const want = new Set();
    for (const c of credits) {
      if ((c.kind === 'cast' && c.ord < 8) || (c.kind === 'crew' && c.role === 'Director')) want.add(c.person_id);
    }
    const synced = new Set(
      (await selectAll('people', 'id', (q) => q.not('synced_at', 'is', null))).map((r) => r.id)
    );
    ids = [...want].filter((id) => !synced.has(id));
  }
  console.log(`Syncing ${ids.length} people...`);
  await pool(ids, CONCURRENCY, syncOne);
  console.log('Done. Agla step: npm run sync:ratings (optional) phir npm run content:generate');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
