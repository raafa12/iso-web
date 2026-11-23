-- =====================================================================
--  TIENDA ISO · pedidos desde el carrito (básicos + preventa Isolation)
--  Pegar entero en Supabase → SQL Editor → Run. Se puede ejecutar varias
--  veces: no borra pedidos ni resetea el stock que ya haya bajado.
-- =====================================================================

-- ---------- Fechas de la preventa ----------
create table if not exists public.presale_config (
  id        int primary key default 1 check (id = 1),
  open_at   timestamptz not null,
  close_at  timestamptz not null
);
insert into public.presale_config (id, open_at, close_at)
values (1, '2026-12-13 20:00:00+01', '2026-12-20 20:00:00+01')
on conflict (id) do nothing;

-- ---------- Preventa: 25 unidades por prenda ----------
create table if not exists public.presale_stock (
  product_id   text primary key,
  name         text not null,
  price_cents  int  not null check (price_cents > 0),
  sizes        text[] not null default array['S','M','L','XL'],
  initial      int  not null check (initial >= 0),
  stock        int  not null check (stock >= 0)
);
alter table public.presale_stock add column if not exists sizes text[] not null default array['S','M','L','XL'];
insert into public.presale_stock (product_id, name, price_cents, initial, stock) values
  ('isolation-isolate-yourself', 'Isolate Yourself Tee', 2499, 25, 25),
  ('isolation-drip-hoodie',      'ISO Drip Hoodie',      4000, 25, 25),
  ('isolation-out-of-my-way',    'Out Of My Waaay Tee',  2499, 25, 25),
  ('isolation-if-you-miss-her',  'If You Miss Her Tee',  2499, 25, 25)
on conflict (product_id) do nothing;

-- ---------- Básicos: siempre a la venta (sin límite) ----------
create table if not exists public.shop_products (
  product_id   text primary key,
  name         text not null,
  price_cents  int  not null check (price_cents > 0),
  sizes        text[] not null,
  active       boolean not null default true
);
insert into public.shop_products (product_id, name, price_cents, sizes) values
  ('iso-classic-tee-black',    'ISO Classic Tee · Black',         1999, array['S','M','L','XL']),
  ('iso-classic-tee-white',    'ISO Classic Tee · White',         1999, array['S','M','L','XL']),
  ('iso-classic-tee-grey',     'ISO Classic Tee · Grey',          1999, array['M','L']),
  ('iso-classic-hoodie-black', 'ISO Classic Hoodie · Black',      2999, array['S','M','L','XL']),
  ('iso-classic-hoodie-grey',  'ISO Classic Hoodie · Sport Grey', 2999, array['S','M','L','XL'])
on conflict (product_id) do update
  set name = excluded.name, price_cents = excluded.price_cents, sizes = excluded.sizes;

-- ---------- Pedidos ----------
create table if not exists public.orders (
  id              bigint generated always as identity primary key,
  code            text unique not null,
  created_at      timestamptz not null default now(),
  name            text not null,
  email           text not null,
  phone           text,
  address         text not null,
  city            text not null,
  postal_code     text not null,
  notes           text,
  payment         text not null,
  items           jsonb not null,   -- [{product_id, name, size, qty, price_cents, presale}]
  has_presale     boolean not null default false,
  shipping_cents  int not null default 0,
  total_cents     int not null,
  status          text not null default 'pendiente'
                  check (status in ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'))
);

alter table public.orders drop constraint if exists orders_payment_check;
alter table public.orders add constraint orders_payment_check
  check (payment in ('bizum', 'paypal', 'contrarreembolso'));

-- ---------- Seguridad: la web solo LEE stock, precios y fechas ----------
alter table public.presale_config enable row level security;
alter table public.presale_stock  enable row level security;
alter table public.shop_products  enable row level security;
alter table public.orders         enable row level security;

drop policy if exists "fechas visibles" on public.presale_config;
create policy "fechas visibles" on public.presale_config for select to anon, authenticated using (true);
drop policy if exists "stock visible" on public.presale_stock;
create policy "stock visible" on public.presale_stock for select to anon, authenticated using (true);
drop policy if exists "productos visibles" on public.shop_products;
create policy "productos visibles" on public.shop_products for select to anon, authenticated using (true);
-- orders: sin políticas → nadie la lee ni escribe desde la web; solo la función de abajo.

-- Versión anterior (pedido solo de preventa), ya no se usa
drop function if exists public.place_presale_order(jsonb, jsonb, text);

-- ---------- Hacer un pedido desde el carrito ----------
-- Precios y stock salen de la base de datos, nunca del navegador.
create or replace function public.place_order(p_items jsonb, p_customer jsonb, p_payment text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg      public.presale_config;
  it       jsonb;
  need     record;
  ps       public.presale_stock;
  sp       public.shop_products;
  qty      int;
  size_    text;
  pid      text;
  lines    jsonb := '[]'::jsonb;
  subtotal int := 0;
  ship     int := 0;
  presale  boolean := false;
  new_code text;
begin
  if p_payment not in ('bizum', 'paypal', 'contrarreembolso') then
    return jsonb_build_object('ok', false, 'error', 'payment');
  end if;
  if coalesce(trim(p_customer->>'name'), '') = ''
     or coalesce(trim(p_customer->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or coalesce(trim(p_customer->>'address'), '') = '' or coalesce(trim(p_customer->>'city'), '') = ''
     or coalesce(trim(p_customer->>'postal_code'), '') !~ '^[0-9]{5}$' then
    return jsonb_build_object('ok', false, 'error', 'customer');
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('ok', false, 'error', 'items');
  end if;

  -- 1) Preventa: ventana abierta y stock suficiente (filas bloqueadas para no vender de más)
  for need in
    select x->>'product_id' as pid, sum((x->>'qty')::int) as q
    from jsonb_array_elements(p_items) x
    where exists (select 1 from public.presale_stock s where s.product_id = x->>'product_id')
    group by 1
  loop
    presale := true;
    select * into cfg from public.presale_config where id = 1;
    if now() < cfg.open_at then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
    if now() >= cfg.close_at then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
    select * into ps from public.presale_stock where product_id = need.pid for update;
    if need.q < 1 or need.q > 5 then return jsonb_build_object('ok', false, 'error', 'qty'); end if;
    if ps.stock < need.q then
      return jsonb_build_object('ok', false, 'error', 'stock', 'product_id', need.pid, 'stock', ps.stock);
    end if;
  end loop;

  -- 2) Líneas del pedido con el precio de la base de datos
  for it in select * from jsonb_array_elements(p_items) loop
    pid := it->>'product_id';
    qty := (it->>'qty')::int;
    size_ := it->>'size';
    if qty is null or qty < 1 or qty > 20 then return jsonb_build_object('ok', false, 'error', 'qty'); end if;

    select * into ps from public.presale_stock where product_id = pid;
    if found then
      if not (size_ = any(ps.sizes)) then return jsonb_build_object('ok', false, 'error', 'size'); end if;
      update public.presale_stock set stock = stock - qty where product_id = pid;
      lines := lines || jsonb_build_object('product_id', pid, 'name', ps.name, 'size', size_, 'qty', qty,
                                           'price_cents', ps.price_cents, 'presale', true);
      subtotal := subtotal + ps.price_cents * qty;
    else
      select * into sp from public.shop_products where product_id = pid and active;
      if not found then return jsonb_build_object('ok', false, 'error', 'product'); end if;
      if not (size_ = any(sp.sizes)) then return jsonb_build_object('ok', false, 'error', 'size'); end if;
      lines := lines || jsonb_build_object('product_id', pid, 'name', sp.name, 'size', size_, 'qty', qty,
                                           'price_cents', sp.price_cents, 'presale', false);
      subtotal := subtotal + sp.price_cents * qty;
    end if;
  end loop;

  -- 3) Envío: gratis en Santander (CP 39001–39012), 4,99 € en el resto
  if trim(p_customer->>'postal_code') !~ '^390(0[1-9]|1[0-2])$' then ship := 499; end if;

  new_code := 'ISO-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  insert into public.orders (code, name, email, phone, address, city, postal_code, notes, payment,
                             items, has_presale, shipping_cents, total_cents)
  values (new_code, trim(p_customer->>'name'), trim(p_customer->>'email'), nullif(trim(p_customer->>'phone'), ''),
          trim(p_customer->>'address'), trim(p_customer->>'city'), trim(p_customer->>'postal_code'),
          nullif(trim(p_customer->>'notes'), ''), p_payment, lines, presale, ship, subtotal + ship);

  return jsonb_build_object('ok', true, 'code', new_code, 'shipping_cents', ship,
                            'total_cents', subtotal + ship, 'items', lines);
end;
$$;
revoke all on function public.place_order(jsonb, jsonb, text) from public;
grant execute on function public.place_order(jsonb, jsonb, text) to anon, authenticated;

-- ---------- Cancelar un pedido (devuelve al stock lo de la preventa) ----------
-- Uso desde el SQL Editor:  select public.cancel_order('ISO-AB12C');
create or replace function public.cancel_order(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o  public.orders;
  it jsonb;
begin
  select * into o from public.orders where code = p_code for update;
  if not found then return 'No existe ese pedido'; end if;
  if o.status = 'cancelado' then return 'Ya estaba cancelado'; end if;
  for it in select * from jsonb_array_elements(o.items) loop
    if (it->>'presale')::boolean then
      update public.presale_stock set stock = least(initial, stock + (it->>'qty')::int)
      where product_id = it->>'product_id';
    end if;
  end loop;
  update public.orders set status = 'cancelado' where id = o.id;
  return 'Cancelado' || case when o.has_presale then ' y stock de preventa devuelto' else '' end;
end;
$$;
revoke all on function public.cancel_order(text) from public, anon, authenticated;
