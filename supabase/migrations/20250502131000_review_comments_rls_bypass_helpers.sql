-- Avoid RLS recursion on review_comments: INSERT's parent check and SELECT's
-- review check must not re-enter review_comments / reviews policies in a cycle.

create or replace function public.review_is_group_for_comment(p_review_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.reviews r
    where r.id = p_review_id and r.scope = 'group'
  );
$$;

grant execute on function public.review_is_group_for_comment(uuid) to authenticated;
alter function public.review_is_group_for_comment(uuid) set row_security = off;

create or replace function public.review_comment_parent_valid(
  p_review_id uuid,
  p_parent_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    p_parent_id is null
    or exists (
      select 1 from public.review_comments c
      where c.id = p_parent_id
        and c.review_id = p_review_id
    );
$$;

grant execute on function public.review_comment_parent_valid(uuid, uuid) to authenticated;
alter function public.review_comment_parent_valid(uuid, uuid) set row_security = off;

drop policy if exists "review_comments_select_group_reviews" on public.review_comments;

create policy "review_comments_select_group_reviews"
  on public.review_comments for select
  to authenticated
  using (public.review_is_group_for_comment(review_id));

drop policy if exists "review_comments_insert_own_on_group" on public.review_comments;

create policy "review_comments_insert_own_on_group"
  on public.review_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.review_is_group_for_comment(review_id)
    and public.review_comment_parent_valid(review_id, parent_id)
    and (
      parent_id is null
      or thread_anchor_user_id is null
    )
  );
