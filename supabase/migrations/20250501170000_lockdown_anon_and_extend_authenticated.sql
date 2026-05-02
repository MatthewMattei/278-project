-- Remove table-level privileges for anon (JWT without a logged-in user). RLS already
-- targeted authenticated; this ensures anon cannot run queries against app tables at all.
-- Extend authenticated policies so users can update/delete their own rows where missing.

-- --- Revoke all anon table access (repeat GRANT pattern from prior migrations) ---
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
revoke all on table public.notifications from anon;

-- --- profiles ---
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (id = (select auth.uid()));

-- --- friendships ---
create policy "friendships_delete_participants"
  on public.friendships for delete
  to authenticated
  using (
    requester_id = (select auth.uid())
    or addressee_id = (select auth.uid())
  );

-- --- events ---
create policy "events_delete_planner"
  on public.events for delete
  to authenticated
  using (planner_id = (select auth.uid()));

-- --- event_messages ---
create policy "event_messages_update_author"
  on public.event_messages for update
  to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.event_members em
      where em.event_id = event_messages.event_id
        and em.user_id = (select auth.uid())
    )
  )
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.event_members em
      where em.event_id = event_messages.event_id
        and em.user_id = (select auth.uid())
    )
  );

create policy "event_messages_delete_author"
  on public.event_messages for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.event_members em
      where em.event_id = event_messages.event_id
        and em.user_id = (select auth.uid())
    )
  );

-- --- polls ---
create policy "polls_update_planner"
  on public.polls for update
  to authenticated
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
  on public.polls for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = polls.event_id
        and e.planner_id = (select auth.uid())
    )
  );

-- --- poll_options ---
create policy "poll_options_update_planner"
  on public.poll_options for update
  to authenticated
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
  on public.poll_options for delete
  to authenticated
  using (
    exists (
      select 1 from public.polls p
      join public.events e on e.id = p.event_id
      where p.id = poll_options.poll_id and e.planner_id = (select auth.uid())
    )
  );

-- --- poll_votes ---
create policy "poll_votes_delete_own"
  on public.poll_votes for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- --- review_contributions ---
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
  );

create policy "review_contributions_delete_own_when_open"
  on public.review_contributions for delete
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
  );

-- --- reviews (individual only; group rows remain service-role / amalgamation) ---
create policy "reviews_update_individual_own"
  on public.reviews for update
  to authenticated
  using (
    scope = 'individual'
    and author_id = (select auth.uid())
  )
  with check (
    scope = 'individual'
    and author_id = (select auth.uid())
  );

create policy "reviews_delete_individual_own"
  on public.reviews for delete
  to authenticated
  using (
    scope = 'individual'
    and author_id = (select auth.uid())
  );

-- --- notifications ---
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = (select auth.uid()));
