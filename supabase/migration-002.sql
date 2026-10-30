-- Migration 002: OTT release date, theatrical date, spoken languages, franchise (collections)
-- Supabase -> SQL Editor mein paste kar ke Run karo (ek dafa).

alter table movies add column if not exists theatrical_release_in date;
alter table movies add column if not exists digital_release_in date;
alter table movies add column if not exists spoken_languages jsonb not null default '[]';
alter table movies add column if not exists collection_id bigint;
create index if not exists movies_collection_idx on movies (collection_id);

create table if not exists collections (
  id         bigint primary key,
  name       text not null,
  overview   text,
  parts      jsonb not null default '[]',   -- [{id,title,release_date,poster_path}] release order
  synced_at  timestamptz
);
alter table collections enable row level security;
drop policy if exists "read collections" on collections;
create policy "read collections" on collections for select using (true);

notify pgrst, 'reload schema';
