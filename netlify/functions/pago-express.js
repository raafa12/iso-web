// Netlify Function: POST /api/pago-express
//   { items, customer, expected_cents } -> hace el pedido (place_order, pago "tarjeta")
//                                          y crea el PaymentIntent de Stripe
//   { cancel: "ISO-XXXXX" }             -> el pago no se completó: cancela el pedido
//                                          y devuelve el stock (si no está pagado)
// El webhook de Stripe (payment_intent.succeeded) lo marca como pagado y manda los correos.

import { sb, env } from '../lib/email.js';
import { markPaid, checkWithStripe } from '../lib/paid.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function stripe(path, params, method = 'POST') {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data?.error?.message}`);
  return data;
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const { url, headers } = sb();

  // ---- Comprobar el pago al volver a /pago (no depende solo del webhook) ----
  if (body.confirm) {
    const code = String(body.confirm).toUpperCase();
    if (!/^ISO-[0-9A-F]{5}$/.test(code)) return json({ error: 'Código no válido' }, 400);
    const r = await fetch(`${url}/rest/v1/orders?code=eq.${code}&select=*`, { headers });
    const [o] = await r.json();
    if (!o) return json({ error: 'No existe' }, 404);
    if (o.status !== 'pendiente') return json({ status: o.status });
    const pi = await checkWithStripe(o).catch(() => null);
    if (!pi) return json({ status: 'pendiente' });
    await markPaid(code, pi.startsWith('pi_') ? pi : null);
    return json({ status: 'pagado' });
  }

  // ---- Cancelar un pedido que no se llegó a pagar ----
  if (body.cancel) {
    const code = String(body.cancel).toUpperCase();
    if (!/^ISO-[0-9A-F]{5}$/.test(code)) return json({ error: 'Código no válido' }, 400);
    const r = await fetch(`${url}/rest/v1/orders?code=eq.${code}&select=status,payment,stripe_payment_intent`, { headers });
    const [o] = await r.json();
    if (!o || o.payment !== 'tarjeta' || o.status !== 'pendiente') return json({ ok: true, skipped: true });
    if (o.stripe_payment_intent) {
      const pi = await stripe(`payment_intents/${o.stripe_payment_intent}`, null, 'GET').catch(() => null);
      if (pi && ['succeeded', 'processing', 'requires_capture'].includes(pi.status)) return json({ ok: true, paid: true });
      if (pi && pi.status !== 'canceled') await stripe(`payment_intents/${pi.id}/cancel`, {}).catch(() => {});
    }
    await fetch(`${url}/rest/v1/rpc/cancel_order`, { method: 'POST', headers, body: JSON.stringify({ p_code: code }) });
    return json({ ok: true, cancelled: true });
  }

  // ---- Pedido + PaymentIntent ----
  const c = body.customer || {};
  if (!c.email || !c.address || !c.postal_code) {
    return json({ error: 'customer', message: 'Al monedero le falta el email o la dirección de envío.' }, 400);
  }
  try {
    const r = await fetch(`${url}/rest/v1/rpc/place_order`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_items: body.items, p_customer: c, p_payment: 'tarjeta' }),
    });
    const order = await r.json();
    if (!r.ok || !order?.ok) return json({ error: order?.error || 'order' }, 400);

    const cancel = () =>
      fetch(`${url}/rest/v1/rpc/cancel_order`, { method: 'POST', headers, body: JSON.stringify({ p_code: order.code }) });

    // El importe que el cliente ha visto en el monedero tiene que ser el real
    if (Number.isFinite(body.expected_cents) && body.expected_cents !== order.total_cents) {
      await cancel();
      return json({ error: 'price', message: 'El precio ha cambiado. Recarga la página e inténtalo de nuevo.' }, 409);
    }

    let pi;
    try {
      pi = await stripe('payment_intents', {
        amount: String(order.total_cents),
        currency: 'eur',
        'automatic_payment_methods[enabled]': 'true',
        description: `Pedido ${order.code}`,
        'metadata[code]': order.code,
        receipt_email: c.email,
        'shipping[name]': c.name || c.email,
        'shipping[address][line1]': c.address,
        'shipping[address][city]': c.city || '',
        'shipping[address][postal_code]': c.postal_code,
        'shipping[address][country]': 'ES',
      });
    } catch (e) {
      await cancel();
      throw e;
    }
    await fetch(`${url}/rest/v1/orders?code=eq.${order.code}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ stripe_payment_intent: pi.id }),
    });
    return json({ code: order.code, client_secret: pi.client_secret, total_cents: order.total_cents });
  } catch (e) {
    console.error('Pago express: error', e);
    const why = String(e?.message || '').replace(/^Stripe \d+: /, '').replace(/(sk|rk|pk)_(live|test)_[A-Za-z0-9*]+/g, '$1_$2_…');
    return json({ error: 'stripe', message: `No se ha podido iniciar el pago. ${why}` }, 502);
  }
};
