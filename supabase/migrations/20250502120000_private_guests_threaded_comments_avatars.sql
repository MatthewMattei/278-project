-- Private events: invite friends from graph (optional member invites).
-- Threaded review comments (reply + per-member anchors).
-- Stricter event delete; block editing core fields after start time.
-- Remove user DELETE on review_contributions (edit only while review open).
-- Group review update/delete for event planner.
-- Avatars bucket (public read, authenticated upload own prefix).

-- --- events: member invite flag ---
alter table public.events
  add column if not exists members_can_invite_friends boolean not null default false;

-- --- review_comments: threading ---
alter table public.review_comments
  add column if not exists parent_id uuid references public.review_comments (id) on delete cascade;

alter table public.review_comments
  add column if not exists thread_anchor_user_id uuid references public.profiles (id) on delete set null;

create index if not exists review_comments_parent on public.review_comments (parent_id);

comment on column public.review_comments.thread_anchor_user_id is
  'For top-level comments only: which group-review member perspective this thread is about.';

drop policy if exists "review_comments_insert_own_on_group" on public.review_comments;

create policy "review_comments_insert_own_on_group"
  on public.review_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.reviews r
      where r.id = review_id and r.scope = 'group'
    )
    and (
      parent_id is null
      or exists (
        select 1 from public.review_comments p
        where p.id = parent_id and p.review_id = review_id
      )
    )
    and (
      parent_id is null or thread_anchor_user_id is null
    )
  );

-- --- Event metadata edits after start ---
create or replace function public.events_enforce_editable_window()
returns trigger
language plpgsql
as $$
begin
  if OLD.starts_at <= now() then
    if NEW.blurb is distinct from OLD.blurb
       or NEW.capacity is distinct from OLD.capacity
       or NEW.starts_at is distinct from OLD.starts_at
       or NEW.visibility is distinct from OLD.visibility
       or NEW.members_can_invite_friends is distinct from OLD.members_can_invite_friends
    then
      raise exception 'cannot_edit_event_after_start' using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists events_enforce_editable_window_trigger on public.events;
create trigger events_enforce_editable_window_trigger
  before update on public.events
  for each row
  execute procedure public.events_enforce_editable_window();

-- --- Event delete only before start ---
drop policy if exists "events_delete_planner" on public.events;

create policy "events_delete_planner"
  on public.events for delete
  to authenticated
  using (
    planner_id = (select auth.uid())
    and starts_at > now()
  );

-- --- review_contributions: no user deletes ---
drop policy if exists "review_contributions_delete_own_when_open" on public.review_contributions;

-- --- Group review host update/delete ---
drop policy if exists "reviews_update_group_planner" on public.reviews;
create policy "reviews_update_group_planner"
  on public.reviews for update
  to authenticated
  using (
    scope = 'group'
    and source_event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = reviews.source_event_id
        and e.planner_id = (select auth.uid())
    )
  )
  with check (
    scope = 'group'
    and source_event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = reviews.source_event_id
        and e.planner_id = (select auth.uid())
    )
  );

drop policy if exists "reviews_delete_group_planner" on public.reviews;
create policy "reviews_delete_group_planner"
  on public.reviews for delete
  to authenticated
  using (
    scope = 'group'
    and source_event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = reviews.source_event_id
        and e.planner_id = (select auth.uid())
    )
  );

-- --- Add friend to private event (from friends list) ---
create or replace function public.add_private_event_guest(p_event_id uuid, p_guest_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cap int;
  vis text;
  st text;
  st_at timestamptz;
  planner uuid;
  mem_invite boolean;
  cur int;
  friends boolean;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select
    e.capacity,
    e.visibility,
    e.status,
    e.starts_at,
    e.planner_id,
    e.members_can_invite_friends
  into cap, vis, st, st_at, planner, mem_invite
  from public.events e
  where e.id = p_event_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if vis <> 'private' then
    raise exception 'not_private';
  end if;

  if st not in ('scheduled', 'live') then
    raise exception 'bad_status';
  end if;

  if st_at <= now() then
    raise exception 'already_started';
  end if;

  if not (
    planner = uid
    or (
      mem_invite
      and public.is_event_member(p_event_id, uid)
    )
  ) then
    raise exception 'forbidden';
  end if;

  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = uid and f.addressee_id = p_guest_user_id)
        or (f.addressee_id = uid and f.requester_id = p_guest_user_id)
      )
  ) into friends;

  if not friends then
    raise exception 'not_friends';
  end if;

  select count(*)::int into cur from public.event_members where event_id = p_event_id;
  if cur >= cap then
    raise exception 'full';
  end if;

  insert into public.event_members (event_id, user_id, role)
  values (p_event_id, p_guest_user_id, 'member')
  on conflict (event_id, user_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.add_private_event_guest(uuid, uuid) to authenticated;

-- --- Storage: avatars ---
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );
