-- Lista prioritaria: precio rebajado para los apuntados durante las primeras horas de la preventa.
-- El enlace del correo lleva el email y una firma (HMAC con vip_secret). La firma se comprueba
-- aquí, en la base de datos: desde el navegador no se puede falsificar el precio.
-- Ejecutar entero en Supabase → SQL Editor.

create extension if not exists pgcrypto with schema extensions;

alter table public.presale_config add column if not exists vip_secret text;
alter table public.presale_config add column if not exists vip_hours int not null default 24;
alter table public.presale_config add column if not exists vip_discount_cents int not null default 500;
update public.presale_config set vip_secret = encode(extensions.gen_random_bytes(24), 'hex') where id = 1 and vip_secret is null;

-- La web lee presale_config (fechas): que no pueda leer la clave
revoke select on public.presale_config from anon, authenticated;
grant select (id, open_at, close_at, vip_hours, vip_discount_cents) on public.presale_config to anon, authenticated;

-- Sudadera del drop: 39,99 € (la lista la paga a 34,99 €)
update public.presale_stock set price_cents = 3999 where product_id = 'isolation-drip-hoodie';

create or replace function public.vip_ok(p_vip jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  cfg public.presale_config;
  em  text;
begin
  if p_vip is null or coalesce(p_vip->>'e', '') = '' or coalesce(p_vip->>'t', '') = '' then return false; end if;
  select * into cfg from public.presale_config where id = 1;
  if cfg.vip_secret is null then return false; end if;
  if now() < cfg.open_at or now() >= cfg.open_at + make_interval(hours => cfg.vip_hours) then return false; end if;
  em := lower(trim(p_vip->>'e'));
  return left(encode(extensions.hmac(em, cfg.vip_secret, 'sha256'), 'hex'), 32) = (p_vip->>'t');
end;
$$;
revoke all on function public.vip_ok(jsonb) from public;

-- place_order con el precio de lista (sustituye a la versión de 3 parámetros)
drop function if exists public.place_order(jsonb, jsonb, text);
create or replace function public.place_order(p_items jsonb, p_customer jsonb, p_payment text, p_vip jsonb default null)
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
  vip      boolean := public.vip_ok(p_vip);
  disc     int := 0;
  price    int;
begin
  select * into cfg from public.presale_config where id = 1;
  if vip then disc := coalesce(cfg.vip_discount_cents, 0); end if;
  if p_payment not in ('bizum', 'paypal', 'contrarreembolso', 'tarjeta') then
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
      -- Lista prioritaria: precio rebajado durante las primeras horas (sin límite de unidades)
      price := greatest(ps.price_cents - disc, 0);
      lines := lines || jsonb_build_object('product_id', pid, 'name', ps.name, 'size', size_, 'qty', qty,
                                           'price_cents', price, 'presale', true, 'lista', vip);
      subtotal := subtotal + price * qty;
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
revoke all on function public.place_order(jsonb, jsonb, text, jsonb) from public;
grant execute on function public.place_order(jsonb, jsonb, text, jsonb) to anon, authenticated, service_role;
