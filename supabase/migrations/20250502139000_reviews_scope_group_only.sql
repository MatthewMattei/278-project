-- Product uses group amalgamation only; individual reviews were removed earlier.
-- (notify_friends_new_review trigger/function already dropped in 20250501180000.)
alter table public.reviews drop constraint if exists reviews_scope_check;

alter table public.reviews
  add constraint reviews_scope_check check (scope = 'group');
