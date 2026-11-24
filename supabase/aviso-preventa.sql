-- Aviso por correo de la preventa: ejecutar una vez en Supabase → SQL Editor.
-- notified_at: cuándo se le mandó el aviso (null = pendiente)
-- unsubscribed: se dio de baja desde el enlace del correo
alter table public.waitlist add column if not exists notified_at timestamptz;
alter table public.waitlist add column if not exists unsubscribed boolean not null default false;
create index if not exists waitlist_pending_idx on public.waitlist (id) where notified_at is null and unsubscribed = false;
