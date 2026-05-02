-- Short shareable friend codes (not display name search).

create or replace function public.generate_friend_code()
returns text
language plpgsql
as $$
declare
  code text;
  attempts int := 0;
begin
  loop
    -- 8 hex chars from random bytes (low collision risk; retry on conflict)
    code := lower(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.profiles p where p.friend_code = code
    );
    attempts := attempts + 1;
    if attempts > 100 then
      raise exception 'Could not generate unique friend_code';
    end if;
  end loop;
  return code;
end;
$$;

alter table public.profiles
  add column if not exists friend_code text;

-- Backfill existing profiles (sequential so each code is visible to the next)
do $$
declare
  r record;
begin
  for r in select id from public.profiles where friend_code is null
  loop
    update public.profiles
    set friend_code = public.generate_friend_code()
    where id = r.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column friend_code set not null;

create unique index if not exists profiles_friend_code_key
  on public.profiles (friend_code);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  new_code := public.generate_friend_code();
  insert into public.profiles (id, display_name, friend_code)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'User'
    ),
    new_code
  );
  return new;
end;
$$;
