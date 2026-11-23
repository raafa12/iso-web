-- =====================================================================
--  PREVENTA ISOLATION · stock limitado + pedidos (Bizum / tarjeta / contrarreembolso)
--  Pegar entero en Supabase → SQL Editor → Run. Se puede ejecutar más de
--  una vez: no borra pedidos ni resetea el stock que ya haya bajado.
-- =====================================================================

-- ---------- Configuración: fechas de la preventa ----------
create table if not exists public.presale_config (
  id        int primary key default 1 check (id = 1),
  open_at   timestamptz not null,
  close_at  timestamptz not null
);
insert into public.presale_config (id, open_at, close_at)
values (1, '2026-12-13 20:00:00+01', '2026-12-20 20:00:00+01')
on conflict (id) do nothing;

-- ---------- Stock por prenda (25 de cada) ----------
create table if not exists public.presale_stock (
  product_id   text primary key,
  name         text not null,
  price_cents  int  not null check (price_cents > 0),
  initial      int  not null check (initial >= 0),
  stock        int  not null check (stock >= 0)
);
insert into public.presale_stock (product_id, name, price_cents, initial, stock) values
  ('isolation-isolate-yourself', 'Isolate Yourself Tee', 2499, 25, 25),
  ('isolation-drip-hoodie',      'ISO Drip Hoodie',      4000, 25, 25),
  ('isolation-out-of-my-way',    'Out Of My Waaay Tee',  2499, 25, 25),
  ('isolation-if-you-miss-her',  'If You Miss Her Tee',  2499, 25, 25)
on conflict (product_id) do nothing;

-- ---------- Pedidos ----------
create table if not exists public.presale_orders (
  id            bigint generated always as identity primary key,
  code          text unique not null,
  created_at    timestamptz not null default now(),
  name          text not null,
  phone         text,
  email         text not null,
  address       text not null,
  city          text not null,
  postal_code   text not null,
  notes         text,
  payment       text not null,
  items         jsonb not null,          -- [{product_id, name, size, qty, price_cents}]
  shipping_cents int not null default 0,
  total_cents   int  not null,
  status        text not null default 'pendiente'
                check (status in ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'))
);

-- Por si la tabla ya existía de una versión anterior de este archivo
alter table public.presale_orders add column if not exists shipping_cents int not null default 0;
alter table public.presale_orders alter column phone drop not null;
alter table public.presale_orders drop constraint if exists presale_orders_payment_check;
alter table public.presale_orders add constraint presale_orders_payment_check
  check (payment in ('bizum', 'tarjeta', 'contrarreembolso'));

-- ---------- Seguridad ----------
-- La web (clave anon) solo puede LEER el stock. Los pedidos solo se crean a
-- través de la función de abajo, que comprueba todo en el servidor.
alter table public.presale_config enable row level security;
alter table public.presale_stock  enable row level security;
alter table public.presale_orders enable row level security;

drop policy if exists "stock visible" on public.presale_stock;
create policy "stock visible" on public.presale_stock for select to anon, authenticated using (true);

drop policy if exists "fechas visibles" on public.presale_config;
create policy "fechas visibles" on public.presale_config for select to anon, authenticated using (true);

-- ---------- Hacer un pedido (resta stock de forma atómica) ----------
create or replace function public.place_presale_order(p_items jsonb, p_customer jsonb, p_payment text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg        public.presale_config;
  it         jsonb;
  row_       public.presale_stock;
  qty        int;
  size_      text;
  lines      jsonb := '[]'::jsonb;
  total      int := 0;
  ship       int := 0;
  new_code   text;
  need       record;
begin
  select * into cfg from public.presale_config where id = 1;
  if now() < cfg.open_at then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if now() >= cfg.close_at then return jsonb_build_object('ok', false, 'error', 'closed'); end if;

  if p_payment not in ('bizum', 'tarjeta', 'contrarreembolso') then
    return jsonb_build_object('ok', false, 'error', 'payment');
  end if;
  if coalesce(trim(p_customer->>'name'), '') = '' or coalesce(trim(p_customer->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(trim(p_customer->>'address'), '') = '' or coalesce(trim(p_customer->>'city'), '') = ''
     or coalesce(trim(p_customer->>'postal_code'), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'customer');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 10 then
    return jsonb_build_object('ok', false, 'error', 'items');
  end if;

  -- Cantidad total pedida por prenda (bloquea las filas para que dos compras a la vez no vendan de más)
  for need in
    select x->>'product_id' as pid, sum((x->>'qty')::int) as q
    from jsonb_array_elements(p_items) x group by 1
  loop
    select * into row_ from public.presale_stock where product_id = need.pid for update;
    if not found then return jsonb_build_object('ok', false, 'error', 'product'); end if;
    if need.q < 1 or need.q > 5 then return jsonb_build_object('ok', false, 'error', 'qty'); end if;
    if row_.stock < need.q then
      return jsonb_build_object('ok', false, 'error', 'stock', 'product_id', need.pid, 'stock', row_.stock);
    end if;
  end loop;

  for it in select * from jsonb_array_elements(p_items) loop
    qty := (it->>'qty')::int;
    size_ := it->>'size';
    if size_ not in ('S', 'M', 'L', 'XL') then return jsonb_build_object('ok', false, 'error', 'size'); end if;
    update public.presale_stock set stock = stock - qty where product_id = it->>'product_id' returning * into row_;
    lines := lines || jsonb_build_object('product_id', row_.product_id, 'name', row_.name, 'size', size_,
                                         'qty', qty, 'price_cents', row_.price_cents);
    total := total + row_.price_cents * qty;
  end loop;

  -- Envío: gratis en Santander (CP 39001–39012), 4,99 € en el resto
  if trim(p_customer->>'postal_code') !~ '^390(0[1-9]|1[0-2])$' then ship := 499; end if;

  new_code := 'ISO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  insert into public.presale_orders (code, name, phone, email, address, city, postal_code, notes, payment, items, shipping_cents, total_cents)
  values (new_code, trim(p_customer->>'name'), nullif(trim(p_customer->>'phone'), ''), trim(p_customer->>'email'),
          trim(p_customer->>'address'), trim(p_customer->>'city'), trim(p_customer->>'postal_code'),
          nullif(trim(p_customer->>'notes'), ''), p_payment, lines, ship, total + ship);

  return jsonb_build_object('ok', true, 'code', new_code, 'shipping_cents', ship, 'total_cents', total + ship, 'items', lines);
end;
$$;

revoke all on function public.place_presale_order(jsonb, jsonb, text) from public;
grant execute on function public.place_presale_order(jsonb, jsonb, text) to anon, authenticated;

-- ---------- Cancelar un pedido (devuelve las prendas al stock) ----------
-- Uso desde el SQL Editor:  select public.cancel_presale_order('ISO-AB12C');
create or replace function public.cancel_presale_order(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o  public.presale_orders;
  it jsonb;
begin
  select * into o from public.presale_orders where code = p_code for update;
  if not found then return 'No existe ese pedido'; end if;
  if o.status = 'cancelado' then return 'Ya estaba cancelado'; end if;
  for it in select * from jsonb_array_elements(o.items) loop
    update public.presale_stock set stock = least(initial, stock + (it->>'qty')::int)
    where product_id = it->>'product_id';
  end loop;
  update public.presale_orders set status = 'cancelado' where id = o.id;
  return 'Cancelado y stock devuelto';
end;
$$;
revoke all on function public.cancel_presale_order(text) from public, anon, authenticated;
