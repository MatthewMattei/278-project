-- Non-members need roster size to hide full public events in pin listings.
-- (Private events are only visible to planners/members via events_select.)

create policy "event_members_select_public_roster"
  on public.event_members for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_members.event_id
        and e.visibility = 'public'
    )
  );
