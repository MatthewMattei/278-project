-- Map-first events + reviews schema (Supabase Postgres)
-- Apply with: supabase db push / SQL editor / migration run

create extension if not exists "pgcrypto";

-- --- Types as check constraints ---
-- events.visibility: public | private
-- events.status: scheduled | live | review_open | completed
-- event_members.role: admin | member
-- event_messages.kind: planner_broadcast | system
-- reviews.scope: individual | group
-- friendships.status: pending | accepted | blocked

-- --- Profiles ---
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'User'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- --- Friendships ---
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

alter table public.friendships enable row level security;

create policy "friendships_select_participants"
  on public.friendships for select
  to authenticated
  using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
  );

create policy "friendships_insert_requester"
  on public.friendships for insert
  to authenticated
  with check (requester_id = (select auth.uid()));

create policy "friendships_update_participants"
  on public.friendships for update
  to authenticated
  using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
  )
  with check (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
  );

-- --- Pins ---
create table public.pins (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  title text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index pins_lat_lng on public.pins (lat, lng);

alter table public.pins enable row level security;

create policy "pins_select_authenticated"
  on public.pins for select
  to authenticated
  using (true);

create policy "pins_insert_own"
  on public.pins for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "pins_update_creator"
  on public.pins for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "pins_delete_creator"
  on public.pins for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- --- Events ---
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
  created_at timestamptz not null default now()
);

create index events_pin on public.events (pin_id);
create index events_planner on public.events (planner_id);
create unique index events_invite_token on public.events (invite_token);

alter table public.events enable row level security;

-- Visible if: public (authenticated) OR member OR planner
create policy "events_select"
  on public.events for select
  to authenticated
  using (
    planner_id = (select auth.uid())
    or visibility = 'public'
    or exists (
      select 1 from public.event_members em
      where em.event_id = events.id and em.user_id = (select auth.uid())
    )
  );

create policy "events_insert_planner"
  on public.events for insert
  to authenticated
  with check (planner_id = (select auth.uid()));

create policy "events_update_planner"
  on public.events for update
  to authenticated
  using (planner_id = (select auth.uid()))
  with check (planner_id = (select auth.uid()));

-- --- Event members ---
create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_members_user on public.event_members (user_id);

alter table public.event_members enable row level security;

create policy "event_members_select_if_member"
  on public.event_members for select
  to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = event_members.event_id
        and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.events e
      where e.id = event_members.event_id
        and e.planner_id = (select auth.uid())
    )
  );

-- Planner can add members; RPC handles self-join for public/private token
create policy "event_members_insert_planner"
  on public.event_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );

create policy "event_members_delete_self_or_planner"
  on public.event_members for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );

-- Add planner as admin on new event
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

create trigger on_event_created
  after insert on public.events
  for each row execute procedure public.handle_new_event();

-- --- Private schema RPCs ---
create schema if not exists private;
grant usage on schema private to authenticated;

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
  select count(*)::int into cur from public.event_members where event_id = p_event_id;
  if cur >= cap then
    raise exception 'full';
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
  select count(*)::int into cur from public.event_members where event_id = eid;
  if cur >= cap then
    raise exception 'full';
  end if;
  insert into public.event_members (event_id, user_id, role)
  values (eid, uid, 'member')
  on conflict (event_id, user_id) do nothing;
  return json_build_object('ok', true, 'event_id', eid);
end;
$$;

grant execute on function private.join_private_event(uuid) to authenticated;

-- PostgREST exposes public schema only — thin wrappers:
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

-- --- Messages ---
create table public.event_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  kind text not null check (kind in ('planner_broadcast', 'system')),
  created_at timestamptz not null default now()
);

create index event_messages_event on public.event_messages (event_id, created_at desc);

alter table public.event_messages enable row level security;

create policy "event_messages_select_member"
  on public.event_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = event_messages.event_id
        and em.user_id = (select auth.uid())
    )
  );

create policy "event_messages_insert_planner_broadcast"
  on public.event_messages for insert
  to authenticated
  with check (
    kind = 'planner_broadcast'
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );

-- Planner-only logistics / system lines (e.g. review window opened)
create policy "event_messages_insert_system_planner"
  on public.event_messages for insert
  to authenticated
  with check (
    kind = 'system'
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );

-- --- Reactions ---
create table public.message_reactions (
  message_id uuid not null references public.event_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "message_reactions_select_member"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.event_messages m
      join public.event_members em on em.event_id = m.event_id
      where m.id = message_reactions.message_id
        and em.user_id = (select auth.uid())
    )
  );

create policy "message_reactions_insert_member"
  on public.message_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.event_messages m
      join public.event_members em on em.event_id = m.event_id
      where m.id = message_id and em.user_id = (select auth.uid())
    )
  );

create policy "message_reactions_delete_own"
  on public.message_reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- --- Polls ---
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  question text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create index polls_event on public.polls (event_id);

alter table public.polls enable row level security;

create policy "polls_select_member"
  on public.polls for select
  to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = polls.event_id and em.user_id = (select auth.uid())
    )
  );

create policy "polls_insert_planner"
  on public.polls for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.planner_id = (select auth.uid())
    )
  );

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label_text text not null,
  sort_order int not null default 0
);

alter table public.poll_options enable row level security;

create policy "poll_options_select_member"
  on public.poll_options for select
  to authenticated
  using (
    exists (
      select 1 from public.polls p
      join public.event_members em on em.event_id = p.event_id
      where p.id = poll_options.poll_id and em.user_id = (select auth.uid())
    )
  );

create policy "poll_options_insert_planner"
  on public.poll_options for insert
  to authenticated
  with check (
    exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_id and e.planner_id = (select auth.uid())
    )
  );

create table public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

alter table public.poll_votes enable row level security;

create policy "poll_votes_select_member"
  on public.poll_votes for select
  to authenticated
  using (
    exists (
      select 1 from public.polls p
      join public.event_members em on em.event_id = p.event_id
      where p.id = poll_votes.poll_id and em.user_id = (select auth.uid())
    )
  );

create policy "poll_votes_upsert_member"
  on public.poll_votes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.poll_options o
      join public.polls p on p.id = o.poll_id
      join public.event_members em on em.event_id = p.event_id
      where o.id = option_id and p.id = poll_id and em.user_id = (select auth.uid())
    )
  );

create policy "poll_votes_update_own"
  on public.poll_votes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --- Review contributions (during review_open) ---
create table public.review_contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  submitted_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.review_contributions enable row level security;

create policy "review_contributions_select_member"
  on public.review_contributions for select
  to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = review_contributions.event_id
        and em.user_id = (select auth.uid())
    )
  );

create policy "review_contributions_insert_member_when_open"
  on public.review_contributions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      join public.event_members em on em.event_id = e.id
      where e.id = event_id
        and e.status = 'review_open'
        and em.user_id = (select auth.uid())
    )
  );

-- --- Published reviews (individual + group aggregate) ---
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  scope text not null check (scope in ('individual', 'group')),
  author_id uuid references public.profiles (id) on delete set null,
  source_event_id uuid references public.events (id) on delete set null,
  title text,
  body text not null default '',
  rating numeric(3, 2),
  stats jsonb,
  member_summaries jsonb,
  created_at timestamptz not null default now()
);

create index reviews_pin on public.reviews (pin_id, created_at desc);
create index reviews_author on public.reviews (author_id);

alter table public.reviews enable row level security;

create policy "reviews_select_authenticated"
  on public.reviews for select
  to authenticated
  using (true);

create policy "reviews_insert_individual_own"
  on public.reviews for insert
  to authenticated
  with check (
    scope = 'individual'
    and author_id = (select auth.uid())
  );

-- Group amalgamation via service role only (no insert policy for group)

create or replace function public.notify_friends_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'individual' and new.author_id is not null then
    insert into public.notifications (user_id, type, payload)
    select
      case
        when f.requester_id = new.author_id then f.addressee_id
        else f.requester_id
      end,
      'friend_review',
      jsonb_build_object(
        'review_id', new.id,
        'pin_id', new.pin_id,
        'author_id', new.author_id
      )
    from public.friendships f
    where f.status = 'accepted'
      and (f.requester_id = new.author_id or f.addressee_id = new.author_id);
  end if;
  return new;
end;
$$;

create trigger tr_notify_friends_review
  after insert on public.reviews
  for each row execute procedure public.notify_friends_new_review();

-- --- Notifications ---
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Inserts: trigger + service role (no authenticated insert policy)

-- --- Realtime ---
alter publication supabase_realtime add table public.event_messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.polls;
alter publication supabase_realtime add table public.poll_options;
alter publication supabase_realtime add table public.poll_votes;
alter publication supabase_realtime add table public.review_contributions;
alter publication supabase_realtime add table public.notifications;
