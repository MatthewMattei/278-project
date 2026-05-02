-- Discussion threads on published group reviews only. Remove client policies that
-- allowed inserting/updating/deleting individual scope reviews.

-- --- review_comments ---
create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index review_comments_review on public.review_comments (review_id, created_at desc);

alter table public.review_comments enable row level security;

create policy "review_comments_select_group_reviews"
  on public.review_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and r.scope = 'group'
    )
  );

create policy "review_comments_insert_own_on_group"
  on public.review_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.reviews r
      where r.id = review_id and r.scope = 'group'
    )
  );

create policy "review_comments_update_own"
  on public.review_comments for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "review_comments_delete_own"
  on public.review_comments for delete
  to authenticated
  using (author_id = (select auth.uid()));

revoke all on table public.review_comments from anon;
grant select, insert, update, delete on table public.review_comments to authenticated;
grant all on table public.review_comments to service_role;

-- --- Stop authenticated users from managing individual pin reviews (group rows stay service-role only) ---
drop policy if exists "reviews_insert_individual_own" on public.reviews;
drop policy if exists "reviews_update_individual_own" on public.reviews;
drop policy if exists "reviews_delete_individual_own" on public.reviews;

-- Remove legacy individual pin reviews (group rows unchanged).
delete from public.reviews where scope = 'individual';

-- --- Realtime (optional live updates in pin panel) ---
alter table public.review_comments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.review_comments;
exception
  when duplicate_object then null;
end $$;
