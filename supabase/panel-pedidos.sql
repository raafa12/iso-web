-- Panel /pedidos: ejecutar una vez en Supabase → SQL Editor.
alter table public.orders add column if not exists confirmation_sent_at timestamptz;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists tracking text;
alter table public.orders add column if not exists reminder_sent_at timestamptz;
grant execute on function public.cancel_order(text) to service_role;
