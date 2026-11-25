-- Avisos por prenda:
--   - Drop: quién ha pedido que le avisen de una prenda concreta (interesados)
--   - Clásicos sin stock: a quién avisar cuando vuelva esa prenda
-- Solo la usan las funciones de Netlify (service key); la web no la lee.
create table if not exists public.stock_alerts (
  id           bigserial primary key,
  email        text not null,
  product_id   text not null,
  product_name text,
  kind         text not null default 'stock',   -- 'drop' | 'stock'
  created_at   timestamptz not null default now(),
  notified_at  timestamptz,
  unique (email, product_id)
);
alter table public.stock_alerts enable row level security;
