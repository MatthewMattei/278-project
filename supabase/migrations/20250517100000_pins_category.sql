-- Add category to pins so events can be filtered on the map
alter table public.pins
  add column if not exists category text not null default 'other'
    check (category in ('food', 'outdoors', 'arts', 'sports', 'social', 'other'));
