-- Backfill public.profiles for every auth.users row that does not yet have a profile.
-- Use after a destructive public-schema rebuild (or any wipe of profiles) when
-- auth.users was left intact — e.g. you ran rebuild_minimal_used_schema.sql but
-- did not delete from auth.users.
--
-- Requires: public.generate_friend_code() (and pgcrypto) already defined.
-- Run as a privileged role (e.g. postgres / Supabase SQL editor with service access).

begin;

do $$
declare
  r record;
  new_code text;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    new_code := public.generate_friend_code();
    insert into public.profiles (id, display_name, friend_code)
    values (
      r.id,
      coalesce(
        nullif(trim(r.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(r.raw_user_meta_data->>'name'), ''),
        nullif(trim(split_part(coalesce(r.email, ''), '@', 1)), ''),
        'User'
      ),
      new_code
    )
    on conflict (id) do nothing;
  end loop;
end;
$$;

commit;
