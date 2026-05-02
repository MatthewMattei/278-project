-- RLS policies control which rows are visible; PostgreSQL still requires table-level
-- GRANTs for the JWT roles used by PostgREST. Without these, queries raise
-- "permission denied for table pins" even when policies exist.
grant select on table public.pins to anon;
grant select, insert, update, delete on table public.pins to authenticated;
grant all on table public.pins to service_role;
