-- Wipe all application data; keeps schema, migrations, extensions, and RLS policies.
-- (public.notifications is omitted — minimal schema no longer includes that table.)
-- Run with psql (see README in parent or project docs). Uses a direct Postgres role
-- (e.g. postgres) — not the Supabase Data API.

begin;

-- Remove rows in public schema (FK order handled in one TRUNCATE).
truncate table
  public.message_reactions,
  public.event_messages,
  public.poll_votes,
  public.poll_options,
  public.polls,
  public.review_contributions,
  public.review_comments,
  public.reviews,
  public.event_members,
  public.events,
  public.friendships,
  public.pins,
  public.profiles
restart identity cascade;

-- Logins and sessions (identities/sessions cascade from users in Supabase).
delete from auth.users;

commit;
