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

notify pgrst, 'reload schema';
