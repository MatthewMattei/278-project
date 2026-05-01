-- Realtime: add tables to the publication via SQL (dashboard may show these as protected / migration-managed).
-- REPLICA IDENTITY FULL helps Postgres emit full row data for UPDATE/DELETE with RLS-filtered Realtime.

alter table public.event_messages replica identity full;
alter table public.message_reactions replica identity full;
alter table public.polls replica identity full;
alter table public.poll_options replica identity full;
alter table public.poll_votes replica identity full;
alter table public.review_contributions replica identity full;
alter table public.notifications replica identity full;

-- Idempotent: skip if already in supabase_realtime (e.g. partial re-run)
do $$
begin
  alter publication supabase_realtime add table public.event_messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.polls;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.poll_options;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.review_contributions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;
