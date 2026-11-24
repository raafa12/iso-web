-- Pago con tarjeta / Apple Pay / Google Pay (Stripe). Ejecutar una vez en Supabase → SQL Editor.

-- 1) Columnas de Stripe en los pedidos
alter table public.orders add column if not exists stripe_session_id text;
alter table public.orders add column if not exists stripe_payment_intent text;

-- 2) Aceptar "tarjeta" como forma de pago
alter table public.orders drop constraint if exists orders_payment_check;
alter table public.orders add constraint orders_payment_check check (payment in ('bizum', 'paypal', 'contrarreembolso', 'tarjeta'));

-- 3) La función de pedidos también tiene que aceptar "tarjeta"
do $$
declare d text;
begin
  select pg_get_functiondef('public.place_order(jsonb,jsonb,text)'::regprocedure) into d;
  if position('''tarjeta''' in d) = 0 then
    d := replace(d, '(''bizum'', ''paypal'', ''contrarreembolso'')', '(''bizum'', ''paypal'', ''contrarreembolso'', ''tarjeta'')');
    execute d;
  end if;
end $$;
