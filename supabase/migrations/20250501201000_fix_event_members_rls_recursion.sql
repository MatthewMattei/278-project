-- event_members_select_if_member queried event_members inside its own USING clause,
-- and events_select queried event_members while event_members policies queried events —
-- mutual recursion. Use a SECURITY DEFINER helper so membership checks bypass RLS.

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

drop policy if exists "events_select" on public.events;

create policy "events_select"
  on public.events for select
  to authenticated
  using (
    planner_id = (select auth.uid())
    or visibility = 'public'
    or public.is_event_member(events.id, (select auth.uid()))
  );

drop policy if exists "event_members_select_if_member" on public.event_members;

-- Own membership row, or any row for an event you belong to (planners are inserted
-- as admin by handle_new_event — no join to events here, avoids RLS recursion).
create policy "event_members_select_if_member"
  on public.event_members for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_event_member(event_members.event_id, (select auth.uid()))
  );
