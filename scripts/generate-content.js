// Step 4: AI content (DeepSeek) — sirf DB facts se, ek dafa generate, DB mein save.
// Regenerate sirf tab jab movie ka facts_hash badle.
// Usage:
//   npm run content:generate                       -> movies + people, missing/outdated
//   npm run content:generate -- --type=movies --limit=200
//   npm run content:generate -- --type=people
//   npm run content:generate -- --type=series
import { db, upsert, pool, arg, selectAll, env, hash } from './_lib.js';

const TYPE = arg('type', 'all');
const LIMIT = Number(arg('limit', 100000));
const CONCURRENCY = Number(arg('concurrency', 6));
const MODEL = arg('model', 'deepseek-chat');
const KEY = env('DEEPSEEK_API_KEY');

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (c) => {
  try {
    return regionNames.of(c) || c;
  } catch {
    return c;
  }
};

const LANG = { hi: 'Hindi', te: 'Telugu', ta: 'Tamil', ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', pa: 'Punjabi', gu: 'Gujarati', en: 'English' };

async function llmJSON(system, user) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, attempt * 3000));
      continue;
    }
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
    const j = await res.json();
    try {
      return JSON.parse(j.choices[0].message.content);
    } catch {
      if (attempt === 4) throw new Error('Invalid JSON from model');
    }
  }
  throw new Error('DeepSeek failed after retries');
}

const MOVIE_SYSTEM = `You write for filmchilive.com, a movie guide for Indian audiences.
Rules:
- Use ONLY the facts provided. Never invent box office numbers, awards, release dates, cast, songs, dubbed languages or streaming platforms.
- If a fact is missing, do not mention it and do not guess (no "expected", "likely", "rumoured").
- Describe the film's nationality only from production_countries (e.g. a film produced in Pakistan is a Pakistani film, never an Indian film). If production_countries is missing, do not state a nationality.
- EVERY sentence must be specific to this movie: it must name a character, actor, director, plot element, genre detail, date, platform or number from the facts. A sentence that could be pasted onto another movie page is not allowed.
- Banned filler: "masterpiece", "must-watch", "rollercoaster", "edge of your seat", "something for everyone", "keeps you hooked", "stellar performances", "a treat for fans", "don't miss", "in conclusion", "overall".
- No spoilers in the summary. Plain, natural English, like a knowledgeable friend giving an honest take.
- Output valid JSON only.`;

// Chhota overview = chhota summary (taake AI kahani apni taraf se na bhare)
function summaryWords(overview = '') {
  const n = overview.length;
  if (n < 250) return '70-100';
  if (n < 500) return '100-140';
  return '150-200';
}

function movieUserPrompt(f) {
  return `FACTS:
${JSON.stringify(f, null, 2)}

Return JSON with exactly these keys:
{
  "summary": "spoiler-free plot summary, ${summaryWords(f.overview)} words, based ONLY on the overview; explain setup, main conflict and tone. Do not add any plot detail, character or event that is not in the overview",
  "why_watch": ["3-4 specific reasons tied to the facts (genre, cast, director, tone, runtime)"],
  "skip_if": ["2-3 honest reasons someone might not enjoy it"],
  "best_for": "one sentence: who this movie suits (e.g. family viewing, thriller fans)",
  "parental_guide": {
    "violence": "None|Mild|Moderate|Strong",
    "language": "None|Mild|Moderate|Strong",
    "sexual_content": "None|Mild|Moderate|Strong",
    "family_friendly": true,
    "note": "one sentence, based on genre and certification; say it is a general guide"
  },
  "verdict": "2-3 sentence honest take",
  "faq": [
    {"q": "Where can I watch ${f.title} online in India?", "a": "answer using only the streaming facts; if none, say it is not currently listed on major Indian OTT platforms"},
    {"q": "...", "a": "..."}
  ]
}
FAQ: 5 questions total, real user questions people search in India. Pick from: where to watch, OTT release date (ONLY if ott_release_date_india is given), release date, cast, director, runtime, certificate, watch order / previous parts (ONLY if franchise is given). Never ask about dubbed versions or box office. Answers 1-3 sentences, facts only, with the exact date/name/number.`;
}

async function movieFacts(id) {
  const [{ data: m }, { data: credits }, { data: provs }] = await Promise.all([
    db.from('movies').select('*').eq('id', id).single(),
    db.from('credits').select('kind, role, ord, people(name)').eq('movie_id', id).order('ord'),
    db.from('movie_providers').select('type, providers(name)').eq('movie_id', id).eq('region', 'IN'),
  ]);
  let franchise;
  if (m.collection_id) {
    const { data: col } = await db.from('collections').select('name, parts').eq('id', m.collection_id).maybeSingle();
    if (col?.parts?.length >= 2) {
      franchise = {
        name: col.name,
        movies_in_release_order: col.parts.map(
          (p, i) => `${i + 1}. ${p.title}${p.release_date ? ` (${p.release_date.slice(0, 4)})` : ' (date not announced)'}${p.id === m.id ? ' <- this movie' : ''}`
        ),
      };
    }
  }
  const cast = (credits || []).filter((c) => c.kind === 'cast').slice(0, 8);
  const crew = (credits || []).filter((c) => c.kind === 'crew');
  const byType = {};
  for (const p of provs || []) (byType[p.type] ||= []).push(p.providers?.name);
  return {
    movie: m,
    facts: {
      title: m.title,
      original_title: m.original_title !== m.title ? m.original_title : undefined,
      original_language: LANG[m.original_language] || m.original_language,
      production_countries: m.production_countries?.length ? m.production_countries.map(countryName) : undefined,
      release_date: m.release_date,
      theatrical_release_india: m.theatrical_release_in || undefined,
      ott_release_date_india: m.digital_release_in || undefined,
      languages_spoken_in_film: m.spoken_languages?.length ? m.spoken_languages : undefined,
      franchise,
      runtime_minutes: m.runtime,
      genres: (m.genres || []).map((g) => g.name),
      certificate_india: m.certification_in || undefined,
      tagline: m.tagline || undefined,
      overview: m.overview,
      cast: cast.map((c) => `${c.people?.name}${c.role ? ' as ' + c.role : ''}`),
      director: crew.filter((c) => c.role === 'Director').map((c) => c.people?.name),
      music: crew.filter((c) => /Music/.test(c.role)).map((c) => c.people?.name),
      tmdb_rating: m.vote_count >= 20 ? `${m.vote_average}/10 (${m.vote_count} votes)` : undefined,
      imdb_rating: m.imdb_rating ? `${m.imdb_rating}/10` : undefined,
      streaming_india_subscription: byType.flatrate,
      streaming_india_free: [...(byType.free || []), ...(byType.ads || [])],
      rent_india: byType.rent,
      buy_india: byType.buy,
    },
  };
}

// Generic filler ka automatic check: mile to dobara likhwao, phir bhi mile to skip (page publish nahi hoga)
const BANNED = [
  'masterpiece', 'must-watch', 'must watch', 'rollercoaster', 'roller coaster', 'edge of your seat',
  'something for everyone', 'keeps you hooked', 'stellar performance', 'a treat for', "don't miss",
  'in conclusion', 'overall,', 'expected to', 'is likely to', 'rumoured', 'rumored', 'hindi dubbed',
  'versatile', 'legendary', 'heartthrob', 'needs no introduction', 'household name', 'millions of hearts',
];
// Jo lafz facts mein khud maujood ho (e.g. film ka naam "Masterpiece") woh generic nahi gina jata
function bannedHits(obj, factsText = '') {
  const text = JSON.stringify(obj).toLowerCase();
  const facts = factsText.toLowerCase();
  return BANNED.filter((w) => text.includes(w) && !facts.includes(w));
}

async function writeChecked(system, prompt, label) {
  let out = await llmJSON(system, prompt);
  let hits = bannedHits(out, prompt);
  if (hits.length) {
    out = await llmJSON(
      system,
      `${prompt}\n\nYour previous draft used banned generic phrases: ${hits.join(', ')}. Rewrite without them; every sentence must be specific to the facts.`
    );
    hits = bannedHits(out, prompt);
    if (hits.length) throw new Error(`${label}: generic phrases (${hits.join(', ')})`);
  }
  return out;
}

async function genMovie({ id }) {
  const { movie, facts } = await movieFacts(id);
  const out = await writeChecked(MOVIE_SYSTEM, movieUserPrompt(facts), `movie ${id}`);
  if (!out.summary || !Array.isArray(out.faq)) throw new Error('incomplete output');
  await upsert(
    'movie_content',
    [
      {
        movie_id: id,
        summary: out.summary,
        why_watch: out.why_watch || [],
        skip_if: out.skip_if || [],
        best_for: out.best_for || null,
        parental_guide: out.parental_guide || null,
        verdict: out.verdict || null,
        faq: out.faq.slice(0, 6),
        facts_hash: movie.facts_hash,
        model: MODEL,
        generated_at: new Date().toISOString(),
      },
    ],
    'movie_id'
  );
}

// ---------------- Series ----------------
const SERIES_SYSTEM = MOVIE_SYSTEM.replace('this movie', 'this series');

async function seriesFacts(id) {
  const [{ data: s }, { data: credits }, { data: provs }] = await Promise.all([
    db.from('series').select('*').eq('id', id).single(),
    db.from('series_credits').select('kind, role, ord, episodes, people(name)').eq('series_id', id).order('ord'),
    db.from('series_providers').select('type, providers(name)').eq('series_id', id).eq('region', 'IN'),
  ]);
  const cast = (credits || []).filter((c) => c.kind === 'cast').slice(0, 8);
  const crew = (credits || []).filter((c) => c.kind === 'crew');
  const byType = {};
  for (const p of provs || []) (byType[p.type] ||= []).push(p.providers?.name);
  return {
    series: s,
    facts: {
      title: s.name,
      original_title: s.original_name !== s.name ? s.original_name : undefined,
      original_language: LANG[s.original_language] || s.original_language,
      first_aired: s.first_air_date,
      last_aired: s.last_air_date || undefined,
      status: s.status,
      seasons: (s.seasons || []).map(
        (x) => `Season ${x.n}: ${x.episode_count} episodes${x.air_date ? `, premiered ${x.air_date}` : ''}`
      ),
      next_episode: s.next_episode
        ? `Season ${s.next_episode.season_number} Episode ${s.next_episode.episode_number} airs ${s.next_episode.air_date}`
        : undefined,
      typical_episode_runtime_minutes: s.episode_run_time || undefined,
      genres: (s.genres || []).map((g) => g.name),
      certificate_india: s.certification_in || undefined,
      tv_channel_or_network: (s.networks || []).map((n) => n.name),
      created_by: s.created_by?.length ? s.created_by : undefined,
      overview: s.overview,
      cast: cast.map((c) => `${c.people?.name}${c.role ? ' as ' + c.role : ''}${c.episodes ? ` (${c.episodes} episodes)` : ''}`),
      director: [...new Set(crew.filter((c) => c.role === 'Director').map((c) => c.people?.name))].slice(0, 4),
      languages_spoken: s.spoken_languages?.length ? s.spoken_languages : undefined,
      tmdb_rating: s.vote_count >= 20 ? `${s.vote_average}/10 (${s.vote_count} votes)` : undefined,
      streaming_india_subscription: byType.flatrate,
      streaming_india_free: [...(byType.free || []), ...(byType.ads || [])],
    },
  };
}

function seriesUserPrompt(f) {
  return movieUserPrompt(f)
    .replace(/"summary": "spoiler-free plot summary[^\n]*",/,
      `"summary": "spoiler-free premise summary, ${summaryWords(f.overview)} words, based ONLY on the overview; explain setup, main conflict and tone; mention number of seasons from the facts. Do not add any plot detail that is not in the overview"`)
    .replace(/FAQ: 5 questions total[\s\S]*$/,
      'FAQ: 5 questions total, real user questions people search in India. Pick from: where to watch, how many seasons and episodes, next episode / new season date (ONLY if next_episode is given), whether it has ended (from status), cast, creator/director, episode runtime, certificate. Never guess a future season. Never ask about dubbed versions. Answers 1-3 sentences, facts only, with the exact date/name/number.');
}

async function genSeries({ id }) {
  const { series, facts } = await seriesFacts(id);
  const out = await writeChecked(SERIES_SYSTEM, seriesUserPrompt(facts), `series ${id}`);
  if (!out.summary || !Array.isArray(out.faq)) throw new Error('incomplete output');
  await upsert(
    'series_content',
    [
      {
        series_id: id,
        summary: out.summary,
        why_watch: out.why_watch || [],
        skip_if: out.skip_if || [],
        best_for: out.best_for || null,
        parental_guide: out.parental_guide || null,
        verdict: out.verdict || null,
        faq: out.faq.slice(0, 6),
        facts_hash: series.facts_hash,
        model: MODEL,
        generated_at: new Date().toISOString(),
      },
    ],
    'series_id'
  );
}

const PERSON_SYSTEM = `You write actor/filmmaker profiles for filmchilive.com, a movie guide for Indian audiences.
Rules: use ONLY the facts provided. Never invent awards, net worth, family details, relationships, height or salaries.
EVERY sentence must name a specific film, year, role, place or date from the facts; no sentence that could fit another person.
Banned filler: "versatile", "legendary", "heartthrob", "needs no introduction", "won millions of hearts", "household name".
Plain natural English. Output valid JSON only.`;

async function genPerson({ id }) {
  const [{ data: p }, { data: credits }, { data: sCredits }] = await Promise.all([
    db.from('people').select('*').eq('id', id).single(),
    db
      .from('credits')
      .select('kind, role, movies(title, release_date, genres, vote_average)')
      .eq('person_id', id),
    db.from('series_credits').select('kind, role, episodes, series(name, first_air_date)').eq('person_id', id),
  ]);
  const films = (credits || [])
    .filter((c) => c.movies)
    .map((c) => ({
      title: c.movies.title,
      year: (c.movies.release_date || '').slice(0, 4),
      role: c.kind === 'cast' ? `as ${c.role || 'cast'}` : c.role,
      genres: (c.movies.genres || []).map((g) => g.name).join(', '),
    }))
    .sort((a, b) => (b.year || '').localeCompare(a.year || ''));
  const facts = {
    name: p.name,
    known_for: p.known_for_department,
    birthday: p.birthday,
    place_of_birth: p.place_of_birth,
    biography_source: p.biography ? p.biography.slice(0, 2500) : undefined,
    films_in_our_database: films.slice(0, 30),
    web_series_in_our_database: (sCredits || [])
      .filter((c) => c.series)
      .map((c) => ({
        title: c.series.name,
        year: (c.series.first_air_date || '').slice(0, 4),
        role: c.kind === 'cast' ? `as ${c.role || 'cast'}${c.episodes ? `, ${c.episodes} episodes` : ''}` : c.role,
      }))
      .slice(0, 15),
  };
  const out = await writeChecked(
    PERSON_SYSTEM,
    `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nReturn JSON:
{
  "intro": "2-3 sentence intro: who they are and what they're known for",
  "career": "250-400 words career overview in your own words (do not copy the biography), mention notable films from the list with years",
  "faq": [{"q":"...","a":"..."}]
}
FAQ: 4 questions (latest movie, debut or early work if known from facts, age/birthplace if given, best-known films). Answers facts only.`,
    `person ${id}`
  );
  if (!out.intro || !out.career) throw new Error('incomplete output');
  await upsert(
    'person_content',
    [
      {
        person_id: id,
        intro: out.intro,
        career: out.career,
        faq: (out.faq || []).slice(0, 5),
        facts_hash: hash(facts),
        model: MODEL,
        generated_at: new Date().toISOString(),
      },
    ],
    'person_id'
  );
}

async function main() {
  if (TYPE === 'all' || TYPE === 'movies') {
    const movies = await selectAll('movies', 'id, facts_hash, popularity, movie_content(facts_hash)', (q) =>
      q.not('facts_hash', 'is', null).not('overview', 'is', null).order('popularity', { ascending: false })
    );
    const todo = movies
      .filter((m) => !m.movie_content || m.movie_content.facts_hash !== m.facts_hash)
      .slice(0, LIMIT);
    console.log(`Movie content: ${todo.length} to generate`);
    await pool(todo, CONCURRENCY, genMovie);
  }

  if (TYPE === 'all' || TYPE === 'series') {
    const list = await selectAll('series', 'id, facts_hash, popularity, series_content(facts_hash)', (q) =>
      q.not('facts_hash', 'is', null).not('overview', 'is', null).order('popularity', { ascending: false })
    );
    const todo = list.filter((x) => !x.series_content || x.series_content.facts_hash !== x.facts_hash).slice(0, LIMIT);
    console.log(`Series content: ${todo.length} to generate`);
    await pool(todo, CONCURRENCY, genSeries);
  }

  if (TYPE === 'all' || TYPE === 'people') {
    // Sirf woh log jin ka page banega (publish-check jaisa criteria)
    const people = await selectAll('people', 'id, profile_path, synced_at, person_content(person_id)', (q) =>
      q.not('synced_at', 'is', null).not('profile_path', 'is', null).order('popularity', { ascending: false })
    );
    const credits = [
      ...(await selectAll('credits', 'person_id, kind, role, ord')),
      ...(await selectAll('series_credits', 'person_id, kind, role, ord')),
    ];
    const count = new Map();
    for (const c of credits) {
      if ((c.kind === 'cast' && c.ord < 8) || c.role === 'Director') count.set(c.person_id, (count.get(c.person_id) || 0) + 1);
    }
    const todo = people
      .filter((p) => !p.person_content && (count.get(p.id) || 0) >= 3)
      .slice(0, LIMIT);
    console.log(`Person content: ${todo.length} to generate`);
    await pool(todo, CONCURRENCY, genPerson);
  }
  console.log('Done. Agla step: npm run publish:check');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
