-- After the host submits a group review contribution, members may no longer insert
-- or update theirs (host can still edit their own while the window is open).

drop policy if exists "review_contributions_insert_member_when_open"
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
      join public.event_members em on em.event_id = e.id
      where e.id = event_id
        and e.status = 'review_open'
        and em.user_id = (select auth.uid())
    )
    and (
      user_id = (select e2.planner_id from public.events e2 where e2.id = event_id)
      or not exists (
        select 1 from public.review_contributions c
        join public.events e3 on e3.id = c.event_id
        where c.event_id = review_contributions.event_id
          and c.user_id = e3.planner_id
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
      join public.event_members em on em.event_id = e.id
      where e.id = review_contributions.event_id
        and e.status = 'review_open'
        and em.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      join public.event_members em on em.event_id = e.id
      where e.id = review_contributions.event_id
        and e.status = 'review_open'
        and em.user_id = (select auth.uid())
    )
    and (
      user_id = (select e2.planner_id from public.events e2 where e2.id = review_contributions.event_id)
      or not exists (
        select 1 from public.review_contributions c
        join public.events e3 on e3.id = c.event_id
        where c.event_id = review_contributions.event_id
          and c.user_id = e3.planner_id
      )
    )
  );
