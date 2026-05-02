-- Host (event planner) may delete any chat message in their event; authors retain delete on own rows.

drop policy if exists "event_messages_delete_author" on public.event_messages;

create policy "event_messages_delete_author_or_planner"
  on public.event_messages for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_messages.event_id
        and e.planner_id = (select auth.uid())
    )
    or (
      author_id = (select auth.uid())
      and (
        exists (
          select 1 from public.event_members em
          where em.event_id = event_messages.event_id
            and em.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.events e
          where e.id = event_messages.event_id
            and e.planner_id = (select auth.uid())
        )
      )
    )
  );
