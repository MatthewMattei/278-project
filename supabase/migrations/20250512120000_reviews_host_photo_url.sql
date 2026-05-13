-- Optional host-attached image on published group reviews (public URL).

alter table public.reviews
  add column if not exists host_photo_url text;

comment on column public.reviews.host_photo_url is
  'Public URL for an optional photo attached by the event host (planner).';

-- --- Storage bucket + RLS (path prefix = reviews.id) ---
insert into storage.buckets (id, name, public)
values ('review_photos', 'review_photos', true)
on conflict (id) do nothing;

create or replace function public.storage_user_can_manage_review_photo(p_name text, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.reviews r
    join public.events e on e.id = r.source_event_id
    where r.id::text = split_part(p_name, '/', 1)
      and e.planner_id = p_uid
      and r.scope = 'group'
  );
$$;

grant execute on function public.storage_user_can_manage_review_photo(text, uuid) to authenticated;
alter function public.storage_user_can_manage_review_photo(text, uuid) set row_security = off;

drop policy if exists "review_photos_public_read" on storage.objects;
create policy "review_photos_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'review_photos');

drop policy if exists "review_photos_insert_planner" on storage.objects;
create policy "review_photos_insert_planner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  );

drop policy if exists "review_photos_update_planner" on storage.objects;
create policy "review_photos_update_planner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  )
  with check (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  );

drop policy if exists "review_photos_delete_planner" on storage.objects;
create policy "review_photos_delete_planner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'review_photos'
    and public.storage_user_can_manage_review_photo(name, (select auth.uid()))
  );
