-- filmchilive.com — phase 1 schema (movies + people)
-- Supabase -> SQL Editor mein poora paste kar ke Run karo.

-- 1) Raw API responses (debugging / re-processing)
create table if not exists raw_tmdb (
  kind        text not null,            -- 'movie' | 'person'
  tmdb_id     bigint not null,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now(),
  primary key (kind, tmdb_id)
);

-- 2) Movies
create table if not exists movies (
  id                 bigint primary key,          -- TMDB id
  slug               text not null unique,
  title              text not null,
  original_title     text,
  original_language  text,
  overview           text,
  tagline            text,
  release_date       date,
  runtime            int,
  budget             bigint,
  revenue            bigint,
  genres             jsonb not null default '[]',  -- [{id,name}]
  certification_in   text,
  imdb_id            text,
  imdb_rating        numeric(3,1),
  imdb_votes         int,
  vote_average       numeric(3,1),
  vote_count         int,
  popularity         numeric,
  poster_path        text,
  backdrop_path      text,
  trailer_key        text,                         -- YouTube key (official)
  status             text,
  facts_hash         text,                         -- facts badlein to content regenerate
  is_published       boolean not null default false,
  published_at       timestamptz,
  synced_at          timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists movies_published_idx on movies (is_published, popularity desc);
create index if not exists movies_release_idx  on movies (release_date desc);
create index if not exists movies_lang_idx     on movies (original_language);

-- 3) People (actors, directors)
create table if not exists people (
  id                    bigint primary key,
  slug                  text not null unique,
  name                  text not null,
  also_known_as         jsonb not null default '[]',
  biography             text,
  birthday              date,
  deathday              date,
  place_of_birth        text,
  gender                int,
  known_for_department  text,
  profile_path          text,
  imdb_id               text,
  popularity            numeric,
  is_published          boolean not null default false,
  published_at          timestamptz,
  synced_at             timestamptz,
  updated_at            timestamptz not null default now()
);
create index if not exists people_published_idx on people (is_published, popularity desc);

-- 4) Credits (movie <-> person)
create table if not exists credits (
  movie_id    bigint not null references movies(id) on delete cascade,
  person_id   bigint not null references people(id) on delete cascade,
  kind        text not null,      -- 'cast' | 'crew'
  role        text not null default '',  -- character ya job
  department  text,
  ord         int not null default 999,
  primary key (movie_id, person_id, kind, role)
);
create index if not exists credits_person_idx on credits (person_id);

-- 5) OTT providers (India)
create table if not exists providers (
  id         int primary key,
  name       text not null,
  slug       text not null unique,
  logo_path  text,
  priority   int
);

create table if not exists movie_providers (
  movie_id     bigint not null references movies(id) on delete cascade,
  provider_id  int not null references providers(id) on delete cascade,
  type         text not null,       -- 'flatrate' | 'rent' | 'buy' | 'free' | 'ads'
  region       text not null default 'IN',
  updated_at   timestamptz not null default now(),
  primary key (movie_id, provider_id, type, region)
);
create index if not exists movie_providers_provider_idx on movie_providers (provider_id);

-- 6) Similar movies (TMDB recommendations)
create table if not exists movie_similar (
  movie_id    bigint not null references movies(id) on delete cascade,
  similar_id  bigint not null,
  ord         int not null default 0,
  primary key (movie_id, similar_id)
);

-- 7) AI content (ek dafa generate, DB mein save)
create table if not exists movie_content (
  movie_id        bigint primary key references movies(id) on delete cascade,
  summary         text,          -- spoiler-free, 150-200 words
  why_watch       jsonb,         -- ["..."]
  skip_if         jsonb,         -- ["..."]
  best_for        text,
  parental_guide  jsonb,         -- {violence, language, sexual_content, family_friendly, note}
  verdict         text,
  faq             jsonb,         -- [{q,a}]
  facts_hash      text,
  model           text,
  generated_at    timestamptz not null default now()
);

create table if not exists person_content (
  person_id     bigint primary key references people(id) on delete cascade,
  intro         text,
  career        text,
  faq           jsonb,
  facts_hash    text,
  model         text,
  generated_at  timestamptz not null default now()
);

-- 8) Public read access (site anon key se sirf published data padhe)
alter table movies          enable row level security;
alter table people          enable row level security;
alter table credits         enable row level security;
alter table providers       enable row level security;
alter table movie_providers enable row level security;
alter table movie_similar   enable row level security;
alter table movie_content   enable row level security;
alter table person_content  enable row level security;
alter table raw_tmdb        enable row level security;  -- koi public policy nahi

drop policy if exists "read published movies" on movies;
create policy "read published movies" on movies for select using (is_published);
-- People: sab readable (cast list mein naam dikhane ke liye); actor page sirf is_published par banta hai (app check)
drop policy if exists "read published people" on people;
drop policy if exists "read people" on people;
create policy "read people" on people for select using (true);
drop policy if exists "read credits" on credits;
create policy "read credits" on credits for select using (true);
drop policy if exists "read providers" on providers;
create policy "read providers" on providers for select using (true);
drop policy if exists "read movie_providers" on movie_providers;
create policy "read movie_providers" on movie_providers for select using (true);
drop policy if exists "read movie_similar" on movie_similar;
create policy "read movie_similar" on movie_similar for select using (true);
drop policy if exists "read movie_content" on movie_content;
create policy "read movie_content" on movie_content for select using (true);
drop policy if exists "read person_content" on person_content;
create policy "read person_content" on person_content for select using (true);

-- ===== Migration 002 (naye install mein bhi chalega) =====
alter table movies add column if not exists theatrical_release_in date;
alter table movies add column if not exists digital_release_in date;
alter table movies add column if not exists spoken_languages jsonb not null default '[]';
alter table movies add column if not exists collection_id bigint;
create index if not exists movies_collection_idx on movies (collection_id);
create table if not exists collections (
  id bigint primary key, name text not null, overview text,
  parts jsonb not null default '[]', synced_at timestamptz
);
alter table collections enable row level security;
drop policy if exists "read collections" on collections;
create policy "read collections" on collections for select using (true);

-- ===== Migration 003 (web series) =====
-- Migration 003: Web series (TV) + seasons/episodes
-- Supabase -> SQL Editor mein paste kar ke Run karo (ek dafa).

create table if not exists series (
  id                 bigint primary key,           -- TMDB tv id
  slug               text not null unique,
  name               text not null,
  original_name      text,
  original_language  text,
  overview           text,
  tagline            text,
  first_air_date     date,
  last_air_date      date,
  status             text,                         -- Returning Series | Ended | Canceled | In Production
  in_production      boolean,
  number_of_seasons  int,
  number_of_episodes int,
  episode_run_time   int,
  genres             jsonb not null default '[]',
  networks           jsonb not null default '[]',  -- [{id,name}]
  created_by         jsonb not null default '[]',  -- [names]
  certification_in   text,
  spoken_languages   jsonb not null default '[]',
  vote_average       numeric(3,1),
  vote_count         int,
  popularity         numeric,
  poster_path        text,
  backdrop_path      text,
  trailer_key        text,
  imdb_id            text,
  next_episode       jsonb,                        -- {air_date, season_number, episode_number, name}
  seasons            jsonb not null default '[]',  -- [{n,name,air_date,episode_count,poster_path,overview}]
  facts_hash         text,
  is_published       boolean not null default false,
  published_at       timestamptz,
  synced_at          timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists series_published_idx on series (is_published, popularity desc);

create table if not exists series_credits (
  series_id   bigint not null references series(id) on delete cascade,
  person_id   bigint not null references people(id) on delete cascade,
  kind        text not null,          -- cast | crew
  role        text not null default '',
  ord         int not null default 999,
  episodes    int,
  primary key (series_id, person_id, kind, role)
);
create index if not exists series_credits_person_idx on series_credits (person_id);

create table if not exists series_providers (
  series_id    bigint not null references series(id) on delete cascade,
  provider_id  int not null references providers(id) on delete cascade,
  type         text not null,
  region       text not null default 'IN',
  updated_at   timestamptz not null default now(),
  primary key (series_id, provider_id, type, region)
);

create table if not exists series_similar (
  series_id   bigint not null references series(id) on delete cascade,
  similar_id  bigint not null,
  ord         int not null default 0,
  primary key (series_id, similar_id)
);

create table if not exists series_episodes (
  series_id       bigint not null references series(id) on delete cascade,
  season_number   int not null,
  episode_number  int not null,
  name            text,
  air_date        date,
  runtime         int,
  overview        text,
  primary key (series_id, season_number, episode_number)
);

create table if not exists series_content (
  series_id       bigint primary key references series(id) on delete cascade,
  summary         text,
  why_watch       jsonb,
  skip_if         jsonb,
  best_for        text,
  parental_guide  jsonb,
  verdict         text,
  faq             jsonb,
  facts_hash      text,
  model           text,
  generated_at    timestamptz not null default now()
);

alter table series           enable row level security;
alter table series_credits   enable row level security;
alter table series_providers enable row level security;
alter table series_similar   enable row level security;
alter table series_episodes  enable row level security;
alter table series_content   enable row level security;

drop policy if exists "read published series" on series;
create policy "read published series" on series for select using (is_published);
drop policy if exists "read series_credits" on series_credits;
create policy "read series_credits" on series_credits for select using (true);
drop policy if exists "read series_providers" on series_providers;
create policy "read series_providers" on series_providers for select using (true);
drop policy if exists "read series_similar" on series_similar;
create policy "read series_similar" on series_similar for select using (true);
drop policy if exists "read series_episodes" on series_episodes;
create policy "read series_episodes" on series_episodes for select using (true);
drop policy if exists "read series_content" on series_content;
create policy "read series_content" on series_content for select using (true);


-- ===== Migration 004 (countries) =====
-- Migration 004: production country (movies) + origin country (series)
alter table movies add column if not exists production_countries jsonb not null default '[]';
alter table series add column if not exists origin_country jsonb not null default '[]';
