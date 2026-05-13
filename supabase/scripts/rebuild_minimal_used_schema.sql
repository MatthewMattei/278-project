-- =============================================================================
-- DESTRUCTIVE: drops and recreates public (+ private) application schema.
-- Intended for local/staging resets — backup production before running.
-- Omits unused notifications table and profiles.is_suspended (app never uses them).
-- Includes host_photo_url on reviews + review_photos storage bucket.
-- Does NOT delete auth.users; after run, backfill profiles for existing users if needed.
-- =============================================================================

begin;

-- --- Drop triggers that reference public objects --------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_event_created on public.events;
drop trigger if exists events_enforce_editable_window_trigger on public.events;

-- --- Tear down schemas (public tables auto-removed from realtime publication) --
drop schema if exists private cascade;
drop schema if exists public cascade;

create schema public;
create schema private;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, anon, authenticated, service_role;

grant usage on schema private to postgres, authenticated, service_role;

-- --- Extensions (friend codes use extensions.gen_random_bytes) -----------------
create extension if not exists pgcrypto with schema extensions;

-- =============================================================================
-- TABLES (FK order)
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  friend_code text not null,
  created_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index friendships_requester on public.friendships (requester_id);
create index friendships_addressee on public.friendships (addressee_id);

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  title text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index pins_lat_lng on public.pins (lat, lng);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  planner_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  capacity int not null check (capacity > 0),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'review_open', 'completed')),
  blurb text not null default '',
  invite_token uuid not null default gen_random_uuid(),
  review_opens_at timestamptz,
  review_closes_at timestamptz,
  members_can_invite_friends boolean not null default false,
  created_at timestamptz not null default now()
);

create index events_pin on public.events (pin_id);
create index events_planner on public.events (planner_id);
create unique index events_invite_token on public.events (invite_token);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_members_user on public.event_members (user_id);

create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  kind text not null check (kind in ('planner_broadcast', 'system')),
  created_at timestamptz not null default now()
);

create index event_messages_event on public.event_messages (event_id, created_at desc);

create table public.message_reactions (
  message_id uuid not null references public.event_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  question text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create index polls_event on public.polls (event_id);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label_text text not null,
  sort_order int not null default 0
);

create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table public.review_contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  submitted_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  scope text not null,
  author_id uuid references public.profiles (id) on delete set null,
  source_event_id uuid references public.events (id) on delete set null,
  title text,
  body text not null default '',
  rating numeric(3, 2),
  stats jsonb,
  member_summaries jsonb,
  host_photo_url text,
  created_at timestamptz not null default now(),
  constraint reviews_scope_check check (scope = 'group')
);

create index reviews_pin on public.reviews (pin_id, created_at desc);
create index reviews_author on public.reviews (author_id);
create unique index reviews_one_group_per_event
  on public.reviews (source_event_id)
  where scope = 'group' and source_event_id is not null;

create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  parent_id uuid references public.review_comments (id) on delete cascade,
  thread_anchor_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index review_comments_review on public.review_comments (review_id, created_at desc);
create index review_comments_parent on public.review_comments (parent_id);

-- =============================================================================
-- FUNCTIONS (before RLS policies that reference them)
-- =============================================================================

create or replace function public.is_event_member(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.event_members em
    where em.event_id = p_event_id and em.user_id = p_user_id
  );
$$;

grant execute on function public.is_event_member(uuid, uuid) to authenticated;
alter function public.is_event_member(uuid, uuid) set row_security = off;

create or replace function private.join_public_event(p_event_id uuid)
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
  cur int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select e.capacity, e.visibility, e.status into cap, vis, st
  from public.events e
  where e.id = p_event_id
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if vis <> 'public' then
    raise exception 'not_public';
  end if;
  if st not in ('scheduled', 'live') then
    raise exception 'bad_status';
  end if;
  if exists (
    select 1 from public.event_members em
    where em.event_id = p_event_id and em.user_id = uid
  ) then
    return json_build_object('ok', true);
  end if;
  select count(*)::int into cur from public.event_members where event_id = p_event_id;
  if cur >= cap then
    return json_build_object('ok', false, 'reason', 'full');
  end if;
  insert into public.event_members (event_id, user_id, role)
  values (p_event_id, uid, 'member')
  on conflict (event_id, user_id) do nothing;
  return json_build_object('ok', true);
end;
$$;

grant execute on function private.join_public_event(uuid) to authenticated;

create or replace function private.join_private_event(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  eid uuid;
  cap int;
  st text;
  cur int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select e.id, e.capacity, e.status into eid, cap, st
  from public.events e
  where e.invite_token = p_token and e.visibility = 'private'
  for update;
  if not found then
    raise exception 'not_found';
  end if;
  if st not in ('scheduled', 'live') then
    raise exception 'bad_status';
  end if;
  if exists (
    select 1 from public.event_members em
    where em.event_id = eid and em.user_id = uid
  ) then
    return json_build_object('ok', true, 'event_id', eid);
  end if;
  select count(*)::int into cur from public.event_members where event_id = eid;
  if cur >= cap then
    return json_build_object('ok', false, 'reason', 'full');
  end if;
  insert into public.event_members (event_id, user_id, role)
  values (eid, uid, 'member')
  on conflict (event_id, user_id) do nothing;
  return json_build_object('ok', true, 'event_id', eid);
end;
$$;

grant execute on function private.join_private_event(uuid) to authenticated;

create or replace function public.join_public_event(p_event_id uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select private.join_public_event(p_event_id);
$$;

grant execute on function public.join_public_event(uuid) to authenticated;

create or replace function public.join_private_event(p_token uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select private.join_private_event(p_token);
$$;

grant execute on function public.join_private_event(uuid) to authenticated;

create or replace function public.generate_friend_code()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  code text;
  attempts int := 0;
begin
  loop
    code := lower(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.profiles p where p.friend_code = code
    );
    attempts := attempts + 1;
    if attempts > 100 then
      raise exception 'Could not generate unique friend_code';
    end if;
  end loop;
  return code;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_code text;
begin
  new_code := public.generate_friend_code();
  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'User'
    ),
    new_code
  );
  return new;
end;
$$;

create or replace function public.handle_new_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_members (event_id, user_id, role)
  values (new.id, new.planner_id, 'admin');
  return new;
end;
$$;

create or replace function public.events_enforce_editable_window()
returns trigger
language plpgsql
as $$
begin
  if old.starts_at <= now() then
    if new.blurb is distinct from old.blurb
       or new.capacity is distinct from old.capacity
       or new.starts_at is distinct from old.starts_at
       or new.visibility is distinct from old.visibility
       or new.members_can_invite_friends is distinct from old.members_can_invite_friends
    then
      raise exception 'cannot_edit_event_after_start' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.add_event_guest(p_event_id uuid, p_guest_user_id uuid)
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

  if vis not in ('public', 'private') then
    raise exception 'bad_visibility';
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

  if exists (
    select 1 from public.event_members em
    where em.event_id = p_event_id and em.user_id = p_guest_user_id
  ) then
    return json_build_object('ok', true);
  end if;

  select count(*)::int into cur from public.event_members where event_id = p_event_id;
  if cur >= cap then
    return json_build_object('ok', false, 'reason', 'full');
  end if;

  insert into public.event_members (event_id, user_id, role)
  values (p_event_id, p_guest_user_id, 'member')
  on conflict (event_id, user_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.add_event_guest(uuid, uuid) to authenticated;
alter function public.add_event_guest(uuid, uuid) set row_security = off;

create or replace function public.add_private_event_guest(p_event_id uuid, p_guest_user_id uuid)
returns json
language sql
security definer
set search_path = public
as $$
  select public.add_event_guest(p_event_id, p_guest_user_id);
$$;

grant execute on function public.add_private_event_guest(uuid, uuid) to authenticated;
alter function public.add_private_event_guest(uuid, uuid) set row_security = off;

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

create or replace function public.storage_user_can_manage_review_photo(p_name text, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.reviews r
    join public.events e on e.id = r.source_event_id
    where r.id::text = split_part(p_name, '/', 1)
      and e.planner_id = p_uid
      and r.scope = 'group'
  );
$$;

grant execute on function public.storage_user_can_manage_review_photo(text, uuid) to authenticated;
alter function public.storage_user_can_manage_review_photo(text, uuid) set row_security = off;

-- =============================================================================
-- ROW LEVEL SECURITY + POLICIES
-- =============================================================================

alter table public.profiles enable row level security;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles_delete_own"
  on public.profiles for delete to authenticated using (id = (select auth.uid()));

alter table public.friendships enable row level security;
create policy "friendships_select_participants"
  on public.friendships for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy "friendships_insert_requester"
  on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()));
create policy "friendships_update_participants"
  on public.friendships for update to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()))
  with check (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy "friendships_delete_participants"
  on public.friendships for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

alter table public.pins enable row level security;
create policy "pins_select_authenticated"
  on public.pins for select to authenticated using (true);
create policy "pins_insert_own"
  on public.pins for insert to authenticated with check (created_by = (select auth.uid()));
create policy "pins_update_creator"
  on public.pins for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "pins_delete_creator"
  on public.pins for delete to authenticated using (created_by = (select auth.uid()));

alter table public.events enable row level security;
create policy "events_select"
  on public.events for select to authenticated
  using (
    planner_id = (select auth.uid())
    or visibility = 'public'
    or public.is_event_member(events.id, (select auth.uid()))
  );
create policy "events_insert_planner"
  on public.events for insert to authenticated with check (planner_id = (select auth.uid()));
create policy "events_update_planner"
  on public.events for update to authenticated
  using (planner_id = (select auth.uid())) with check (planner_id = (select auth.uid()));
create policy "events_delete_planner"
  on public.events for delete to authenticated
  using (planner_id = (select auth.uid()) and starts_at > now());

alter table public.event_members enable row level security;
create policy "event_members_select_if_member"
  on public.event_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_event_member(event_members.event_id, (select auth.uid()))
  );
create policy "event_members_select_public_roster"
  on public.event_members for select to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_members.event_id and e.visibility = 'public'
    )
  );
create policy "event_members_insert_planner"
  on public.event_members for insert to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "event_members_delete_self_or_planner"
  on public.event_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );

alter table public.event_messages enable row level security;
create policy "event_messages_select_member"
  on public.event_messages for select to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = event_messages.event_id and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.events e
      where e.id = event_messages.event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "event_messages_insert_planner_broadcast"
  on public.event_messages for insert to authenticated
  with check (
    kind = 'planner_broadcast'
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "event_messages_insert_system_planner"
  on public.event_messages for insert to authenticated
  with check (
    kind = 'system'
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "event_messages_update_author"
  on public.event_messages for update to authenticated
  using (
    author_id = (select auth.uid())
    and (
      exists (
        select 1 from public.event_members em
        where em.event_id = event_messages.event_id and em.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.events e
        where e.id = event_messages.event_id and e.planner_id = (select auth.uid())
      )
    )
  )
  with check (
    author_id = (select auth.uid())
    and (
      exists (
        select 1 from public.event_members em
        where em.event_id = event_messages.event_id and em.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.events e
        where e.id = event_messages.event_id and e.planner_id = (select auth.uid())
      )
    )
  );
create policy "event_messages_delete_author_or_planner"
  on public.event_messages for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_messages.event_id and e.planner_id = (select auth.uid())
    )
    or (
      author_id = (select auth.uid())
      and (
        exists (
          select 1 from public.event_members em
          where em.event_id = event_messages.event_id and em.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.events e
          where e.id = event_messages.event_id and e.planner_id = (select auth.uid())
        )
      )
    )
  );

alter table public.message_reactions enable row level security;
create policy "message_reactions_select_member"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.event_messages m
      join public.event_members em on em.event_id = m.event_id
      where m.id = message_reactions.message_id and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.event_messages m
      join public.events e on e.id = m.event_id
      where m.id = message_reactions.message_id and e.planner_id = (select auth.uid())
    )
  );
create policy "message_reactions_insert_member"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      exists (
        select 1 from public.event_messages m
        join public.event_members em on em.event_id = m.event_id
        where m.id = message_id and em.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.event_messages m
        join public.events e on e.id = m.event_id
        where m.id = message_id and e.planner_id = (select auth.uid())
      )
    )
  );
create policy "message_reactions_delete_own"
  on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.polls enable row level security;
create policy "polls_select_member"
  on public.polls for select to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = polls.event_id and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.events e
      where e.id = polls.event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "polls_insert_planner"
  on public.polls for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "polls_update_planner"
  on public.polls for update to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = polls.event_id and e.planner_id = (select auth.uid())
    )
  )
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = polls.event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "polls_delete_planner"
  on public.polls for delete to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = polls.event_id and e.planner_id = (select auth.uid())
    )
  );

alter table public.poll_options enable row level security;
create policy "poll_options_select_member"
  on public.poll_options for select to authenticated
  using (
    exists (
      select 1 from public.polls p
      join public.event_members em on em.event_id = p.event_id
      where p.id = poll_options.poll_id and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_options.poll_id and e.planner_id = (select auth.uid())
    )
  );
create policy "poll_options_insert_planner"
  on public.poll_options for insert to authenticated
  with check (
    exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_id and e.planner_id = (select auth.uid())
    )
  );
create policy "poll_options_update_planner"
  on public.poll_options for update to authenticated
  using (
    exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_options.poll_id and e.planner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_options.poll_id and e.planner_id = (select auth.uid())
    )
  );
create policy "poll_options_delete_planner"
  on public.poll_options for delete to authenticated
  using (
    exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_options.poll_id and e.planner_id = (select auth.uid())
    )
  );

alter table public.poll_votes enable row level security;
create policy "poll_votes_select_member"
  on public.poll_votes for select to authenticated
  using (
    exists (
      select 1 from public.polls p
      join public.event_members em on em.event_id = p.event_id
      where p.id = poll_votes.poll_id and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_votes.poll_id and e.planner_id = (select auth.uid())
    )
  );
create policy "poll_votes_upsert_member"
  on public.poll_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      exists (
        select 1 from public.poll_options o
        join public.polls p on p.id = o.poll_id
        join public.event_members em on em.event_id = p.event_id
        where o.id = option_id and p.id = poll_id and em.user_id = (select auth.uid())
      )
      or exists (
        select 1 from public.poll_options o
        join public.polls p on p.id = o.poll_id
        join public.events e on e.id = p.event_id
        where o.id = option_id and p.id = poll_id and e.planner_id = (select auth.uid())
      )
    )
  );
create policy "poll_votes_update_own"
  on public.poll_votes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "poll_votes_delete_own"
  on public.poll_votes for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.review_contributions enable row level security;
create policy "review_contributions_select_member"
  on public.review_contributions for select to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = review_contributions.event_id and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.events e
      where e.id = review_contributions.event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "review_contributions_insert_when_open"
  on public.review_contributions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and e.status = 'review_open'
        and (
          e.planner_id = (select auth.uid())
          or exists (
            select 1 from public.event_members em
            where em.event_id = e.id and em.user_id = (select auth.uid())
          )
        )
    )
  );
create policy "review_contributions_update_own_when_open"
  on public.review_contributions for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = review_contributions.event_id
        and e.status = 'review_open'
        and (
          e.planner_id = (select auth.uid())
          or exists (
            select 1 from public.event_members em
            where em.event_id = e.id and em.user_id = (select auth.uid())
          )
        )
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = review_contributions.event_id
        and e.status = 'review_open'
        and (
          e.planner_id = (select auth.uid())
          or exists (
            select 1 from public.event_members em
            where em.event_id = e.id and em.user_id = (select auth.uid())
          )
        )
    )
  );
create policy "review_contributions_delete_own_when_open"
  on public.review_contributions for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      join public.event_members em on em.event_id = e.id
      where e.id = review_contributions.event_id
        and e.status = 'review_open'
        and em.user_id = (select auth.uid())
    )
  );

alter table public.reviews enable row level security;
create policy "reviews_select_authenticated"
  on public.reviews for select to authenticated using (true);
create policy "reviews_update_group_planner"
  on public.reviews for update to authenticated
  using (
    scope = 'group'
    and source_event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = reviews.source_event_id and e.planner_id = (select auth.uid())
    )
  )
  with check (
    scope = 'group'
    and source_event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = reviews.source_event_id and e.planner_id = (select auth.uid())
    )
  );
create policy "reviews_delete_group_planner"
  on public.reviews for delete to authenticated
  using (
    scope = 'group'
    and source_event_id is not null
    and exists (
      select 1 from public.events e
      where e.id = reviews.source_event_id and e.planner_id = (select auth.uid())
    )
  );

alter table public.review_comments enable row level security;
create policy "review_comments_select_group_reviews"
  on public.review_comments for select to authenticated
  using (public.review_is_group_for_comment(review_id));
create policy "review_comments_insert_own_on_group"
  on public.review_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.review_is_group_for_comment(review_id)
    and public.review_comment_parent_valid(review_id, parent_id)
    and (parent_id is null or thread_anchor_user_id is null)
  );
create policy "review_comments_update_own"
  on public.review_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "review_comments_delete_own"
  on public.review_comments for delete to authenticated
  using (author_id = (select auth.uid()));

-- =============================================================================
-- TABLE GRANTS (anon revoked — match lockdown)
-- =============================================================================

revoke all on table public.pins from anon;
revoke all on table public.profiles from anon;
revoke all on table public.friendships from anon;
revoke all on table public.events from anon;
revoke all on table public.event_members from anon;
revoke all on table public.event_messages from anon;
revoke all on table public.message_reactions from anon;
revoke all on table public.polls from anon;
revoke all on table public.poll_options from anon;
revoke all on table public.poll_votes from anon;
revoke all on table public.review_contributions from anon;
revoke all on table public.reviews from anon;
revoke all on table public.review_comments from anon;

grant select, insert, update, delete on table public.pins to authenticated;
grant all on table public.pins to service_role;

grant select, insert, update, delete on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

grant select, insert, update, delete on table public.friendships to authenticated;
grant all on table public.friendships to service_role;

grant select, insert, update, delete on table public.events to authenticated;
grant all on table public.events to service_role;

grant select, insert, update, delete on table public.event_members to authenticated;
grant all on table public.event_members to service_role;

grant select, insert, update, delete on table public.event_messages to authenticated;
grant all on table public.event_messages to service_role;

grant select, insert, update, delete on table public.message_reactions to authenticated;
grant all on table public.message_reactions to service_role;

grant select, insert, update, delete on table public.polls to authenticated;
grant all on table public.polls to service_role;

grant select, insert, update, delete on table public.poll_options to authenticated;
grant all on table public.poll_options to service_role;

grant select, insert, update, delete on table public.poll_votes to authenticated;
grant all on table public.poll_votes to service_role;

grant select, insert, update, delete on table public.review_contributions to authenticated;
grant all on table public.review_contributions to service_role;

grant select, insert, update, delete on table public.reviews to authenticated;
grant all on table public.reviews to service_role;

grant select, insert, update, delete on table public.review_comments to authenticated;
grant all on table public.review_comments to service_role;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger on_event_created
  after insert on public.events
  for each row execute procedure public.handle_new_event();

create trigger events_enforce_editable_window_trigger
  before update on public.events
  for each row execute procedure public.events_enforce_editable_window();

-- =============================================================================
-- STORAGE
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('review_photos', 'review_photos', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update to authenticated
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
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid()::text)
  );

drop policy if exists "review_photos_public_read" on storage.objects;
create policy "review_photos_public_read"
  on storage.objects for select to public
  using (bucket_id = 'review_photos');

drop policy if exists "review_photos_insert_planner" on storage.objects;
create policy "review_photos_insert_planner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  );

drop policy if exists "review_photos_update_planner" on storage.objects;
create policy "review_photos_update_planner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  )
  with check (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  );

drop policy if exists "review_photos_delete_planner" on storage.objects;
create policy "review_photos_delete_planner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  );

-- =============================================================================
-- REALTIME (no notifications)
-- =============================================================================

alter table public.event_messages replica identity full;
alter table public.message_reactions replica identity full;
alter table public.polls replica identity full;
alter table public.poll_options replica identity full;
alter table public.poll_votes replica identity full;
alter table public.review_contributions replica identity full;
alter table public.review_comments replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.event_messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.poll_options;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.review_contributions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.review_comments;
exception when duplicate_object then null;
end $$;

commit;
