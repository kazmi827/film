-- Non-India films ka purana AI content hatao (us mein "Indian film" likha ho sakta hai).
-- content:generate inhein naye country facts ke saath dobara likhega; tab tak publish-check inhein unpublish rakhega.
delete from movie_content
where movie_id in (
  select id from movies
  where jsonb_array_length(production_countries) > 0
    and not (production_countries ? 'IN')
);
