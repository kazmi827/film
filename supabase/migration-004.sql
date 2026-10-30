-- Migration 004: production country (movies) + origin country (series)
alter table movies add column if not exists production_countries jsonb not null default '[]';
alter table series add column if not exists origin_country jsonb not null default '[]';
notify pgrst, 'reload schema';
