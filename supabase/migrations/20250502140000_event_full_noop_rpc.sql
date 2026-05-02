-- Full events: return ok=false instead of raising (clients treat as no-op).
-- Idempotent join if caller is already on the roster.

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
