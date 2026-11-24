// Stripe sin SDK: Checkout Sessions por la API REST y verificación de webhooks.
//   STRIPE_SECRET_KEY      -> sk_live_... (Stripe → Desarrolladores → Claves de API)
//   STRIPE_WEBHOOK_SECRET  -> whsec_... (Stripe → Desarrolladores → Webhooks → tu endpoint)

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, SITE } from './email.js';

// Aplana { a: { b: 1 } } -> a[b]=1 como espera la API de Stripe
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(path, params, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'POST' ? form(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
  return data;
}

export async function createCheckout(order) {
  const line_items = {};
  (order.items || []).forEach((it, i) => {
    line_items[i] = {
      quantity: it.qty,
      price_data: {
        currency: 'eur',
        unit_amount: it.price_cents,
        product_data: { name: `${it.name} · Talla ${it.size}${it.presale ? ' · Preventa' : ''}` },
      },
    };
  });
  const code = order.code;
  return stripe('checkout/sessions', {
    mode: 'payment',
    locale: 'es',
    customer_email: order.email,
    client_reference_id: code,
    metadata: { code },
    payment_intent_data: { description: `Pedido ${code}`, metadata: { code } },
    line_items,
    shipping_options: {
      0: {
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: order.shipping_cents ? 'Envío' : 'Envío gratis en Santander',
          fixed_amount: { amount: order.shipping_cents, currency: 'eur' },
        },
      },
    },
    // Si no paga en 1 h la sesión caduca y el pedido se cancela (vuelve el stock)
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    success_url: `${SITE}/pago?estado=ok&code=${code}`,
    cancel_url: `${SITE}/pago?estado=cancelado&code=${code}`,
  });
}

// https://docs.stripe.com/webhooks#verify-manually
export function verifyWebhook(rawBody, header, toleranceSec = 300) {
  const secret = env('STRIPE_WEBHOOK_SECRET');
  const parts = Object.fromEntries(
    String(header || '')
      .split(',')
      .map((p) => p.split('='))
      .filter((p) => p.length === 2 && p[0] === 't')
  );
  const sigs = String(header || '')
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
