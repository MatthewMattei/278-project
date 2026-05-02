-- is_event_member() and add_private_event_guest() read public.event_members while
-- RLS policies on that table call is_event_member() again. PostgreSQL still applies
-- RLS to those internal scans unless the function sets row_security off (PG15+).

alter function public.is_event_member(uuid, uuid) set row_security = off;
alter function public.add_private_event_guest(uuid, uuid) set row_security = off;
