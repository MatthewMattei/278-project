-- One amalgamated group review per source event
create unique index if not exists reviews_one_group_per_event
  on public.reviews (source_event_id)
  where scope = 'group' and source_event_id is not null;
