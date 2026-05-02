-- Same pattern as 20250501163000_pins_table_grants.sql: PostgREST roles need table-level
-- GRANTs before RLS applies. Without these, queries raise "permission denied for table …".

-- profiles
grant select on table public.profiles to anon;
grant select, insert, update, delete on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- friendships
grant select on table public.friendships to anon;
grant select, insert, update, delete on table public.friendships to authenticated;
grant all on table public.friendships to service_role;

-- events
grant select on table public.events to anon;
grant select, insert, update, delete on table public.events to authenticated;
grant all on table public.events to service_role;

-- event_members
grant select on table public.event_members to anon;
grant select, insert, update, delete on table public.event_members to authenticated;
grant all on table public.event_members to service_role;

-- event_messages
grant select on table public.event_messages to anon;
grant select, insert, update, delete on table public.event_messages to authenticated;
grant all on table public.event_messages to service_role;

-- message_reactions
grant select on table public.message_reactions to anon;
grant select, insert, update, delete on table public.message_reactions to authenticated;
grant all on table public.message_reactions to service_role;

-- polls
grant select on table public.polls to anon;
grant select, insert, update, delete on table public.polls to authenticated;
grant all on table public.polls to service_role;

-- poll_options
grant select on table public.poll_options to anon;
grant select, insert, update, delete on table public.poll_options to authenticated;
grant all on table public.poll_options to service_role;

-- poll_votes
grant select on table public.poll_votes to anon;
grant select, insert, update, delete on table public.poll_votes to authenticated;
grant all on table public.poll_votes to service_role;

-- review_contributions
grant select on table public.review_contributions to anon;
grant select, insert, update, delete on table public.review_contributions to authenticated;
grant all on table public.review_contributions to service_role;

-- reviews
grant select on table public.reviews to anon;
grant select, insert, update, delete on table public.reviews to authenticated;
grant all on table public.reviews to service_role;

-- notifications
grant select on table public.notifications to anon;
grant select, insert, update, delete on table public.notifications to authenticated;
grant all on table public.notifications to service_role;
