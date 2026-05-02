-- Host may delete an event while it is still scheduled or live (not after review opens).

drop policy if exists "events_delete_planner" on public.events;

create policy "events_delete_planner"
  on public.events for delete
  to authenticated
  using (
    planner_id = (select auth.uid())
    and status in ('scheduled', 'live')
  );
