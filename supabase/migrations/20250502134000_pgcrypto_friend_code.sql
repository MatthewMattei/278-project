-- Friend signup runs generate_friend_code() -> gen_random_bytes() from pgcrypto.
-- If the extension is missing, or only installed under `extensions`, unqualified
-- calls fail with: function gen_random_bytes(integer) does not exist

create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_friend_code()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  code text;
  attempts int := 0;
begin
  loop
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
