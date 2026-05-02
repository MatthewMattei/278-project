-- Planners must read chat, react, and use polls even if event_members checks
-- would otherwise exclude them (e.g. missing membership row).

drop policy if exists "event_messages_select_member" on public.event_messages;

create policy "event_messages_select_member"
  on public.event_messages for select
  to authenticated
  using (
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
  );

drop policy if exists "event_messages_update_author" on public.event_messages;

create policy "event_messages_update_author"
  on public.event_messages for update
  to authenticated
  using (
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
  with check (
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
  );

drop policy if exists "event_messages_delete_author" on public.event_messages;

create policy "event_messages_delete_author"
  on public.event_messages for delete
  to authenticated
  using (
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
  );

-- --- Reactions ---

drop policy if exists "message_reactions_select_member" on public.message_reactions;

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
    or exists (
      select 1 from public.event_messages m
      join public.events e on e.id = m.event_id
      where m.id = message_reactions.message_id
        and e.planner_id = (select auth.uid())
    )
  );

drop policy if exists "message_reactions_insert_member" on public.message_reactions;

create policy "message_reactions_insert_member"
  on public.message_reactions for insert
  to authenticated
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

-- --- Polls ---

drop policy if exists "polls_select_member" on public.polls;

create policy "polls_select_member"
  on public.polls for select
  to authenticated
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

drop policy if exists "poll_options_select_member" on public.poll_options;

create policy "poll_options_select_member"
  on public.poll_options for select
  to authenticated
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

drop policy if exists "poll_votes_select_member" on public.poll_votes;

create policy "poll_votes_select_member"
  on public.poll_votes for select
  to authenticated
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

drop policy if exists "poll_votes_upsert_member" on public.poll_votes;

create policy "poll_votes_upsert_member"
  on public.poll_votes for insert
  to authenticated
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

-- --- Group review contributions (planner read/submit without membership row) ---

drop policy if exists "review_contributions_insert_member_when_open"
  on public.review_contributions;

drop policy if exists "review_contributions_insert_when_open"
  on public.review_contributions;

drop policy if exists "review_contributions_update_own_when_open"
  on public.review_contributions;

drop policy if exists "review_contributions_select_member"
  on public.review_contributions;

create policy "review_contributions_select_member"
  on public.review_contributions for select
  to authenticated
  using (
    exists (
      select 1 from public.event_members em
      where em.event_id = review_contributions.event_id
        and em.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.events e
      where e.id = review_contributions.event_id
        and e.planner_id = (select auth.uid())
    )
  );

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
