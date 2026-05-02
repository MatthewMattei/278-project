-- Revert host-submission lock: while review_open, any event member (and planner)
-- may insert or update their own contribution regardless of host submit state.

drop policy if exists "review_contributions_insert_when_open"
  on public.review_contributions;

drop policy if exists "review_contributions_update_own_when_open"
  on public.review_contributions;

create policy "review_contributions_insert_when_open"
  on public.review_contributions for insert
  to authenticated
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
  on public.review_contributions for update
  to authenticated
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
