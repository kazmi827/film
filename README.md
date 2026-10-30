# filmchilive.com — Phase 1 (Movies + Actors)

Flow: **TMDB / OMDb → scripts → Supabase → Next.js pages (ISR) → Vercel**

## 1. Keys lo
| Key | Kahan se |
|---|---|
| `TMDB_TOKEN` | themoviedb.org → Settings → API → **API Read Access Token** (commercial use ke liye TMDB se license) |
| `DEEPSEEK_API_KEY` | platform.deepseek.com |
| `OMDB_API_KEY` | omdbapi.com (optional, IMDb rating) |
| Supabase URL, anon key, service_role key | Supabase → Project Settings → API |

## 2. Database
Supabase → **SQL Editor** → `supabase/schema.sql` paste → **Run**.

## 3. Local setup (VS Code terminal)
```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env  -> phir keys bharo
```

## 4. Data bharo (pehli dafa, isi order mein)
```bash
npm run sync:discover -- --target=2000   # India movies list (Hindi 55%, Telugu/Tamil/Malayalam/Kannada baqi)
npm run sync:movies                      # details, cast, OTT India, trailer, certificate
npm run sync:people                      # actors/directors bio
npm run sync:ratings -- --limit=900      # optional, IMDb rating
npm run content:generate -- --limit=20   # pehle 20 par test, content check karo
npm run publish:check -- --dry=1         # report: kitne pages ready, kyun fail
npm run publish:check -- --limit=300     # 300 pages live
npm run dev                              # http://localhost:3000
```

## 5. Deploy
1. GitHub par naya repo → yeh folder push karo
2. Vercel → New Project → repo import → Environment Variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
   (**service_role key Vercel par nahi**)
3. Domain: Vercel → Settings → Domains → `filmchilive.com`

## 6. Rozana automation
`.github/workflows/daily-sync.yml` roz raat chalta hai: naye movies, 7 din purani re-sync (OTT refresh), content, aur **300 pages/day publish**.
GitHub repo → Settings → Secrets → Actions mein `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TMDB_TOKEN`, `DEEPSEEK_API_KEY`, `OMDB_API_KEY` daalo.

## Quality gate (publish-check)
Movie tab publish hoti hai jab: overview (80+ chars), poster, release date, 3+ cast, AI content, aur content current facts se match kare.
Actor page tab jab: photo, bio sync, AI content, aur 3+ published movies mein top-8 cast ya director.

## URLs
- `/movie/{title-year}` e.g. `/movie/jawan-2023`
- `/actor/{name}` e.g. `/actor/shah-rukh-khan`
- `/sitemap.xml`, `/robots.txt`

## Web series
```bash
npm run series:discover -- --target=600
npm run series:sync
npm run sync:people
npm run content:generate          # movies + series + actors (sirf missing/outdated)
npm run report                    # template-wise kitne pages bante hain
```

## URLs (sab)
- `/movie/{slug}`, `/actor/{slug}`, `/series/{slug}`, `/series/{slug}/season/{n}`
- Hubs: `/movies/{hindi|telugu|tamil|malayalam|kannada}`, `/web-series/{lang}`, `/genre/{genre}`, `/year/{yyyy}` (+ `/page/{n}`)
- Lists: `/list/{slug}` e.g. `hindi-thriller-movies-on-netflix`, `hindi-movies-2025`, `hindi-web-series-on-jiohotstar`
- OTT calendar: `/ott-releases`, `/ott-releases/{month-yyyy}`

Har hub/list tabhi banta hai jab 8+ asli titles hon (calendar month: 5+). Is se kam = 404, koi thin page nahi.
