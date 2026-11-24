// Marca un pedido con tarjeta/Apple Pay como pagado y manda los correos (una sola vez).
// Lo usan el webhook de Stripe y la comprobación directa al volver a /pago.

import { sb, env } from './email.js';
import { sendOrderEmails } from './order-mail.js';

export async function markPaid(code, paymentIntentId = null) {
  const { url, headers } = sb();
  // Solo pasa a pagado si estaba pendiente: si llegan el webhook y la comprobación a la vez, gana uno
  const r = await fetch(`${url}/rest/v1/orders?code=eq.${encodeURIComponent(code)}&status=eq.pendiente`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'pagado',
      paid_at: new Date().toISOString(),
      confirmation_sent_at: new Date().toISOString(),
      ...(paymentIntentId ? { stripe_payment_intent: paymentIntentId } : {}),
    }),
  });
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return { already: true };
  const res = await sendOrderEmails(rows[0]);
  if (res.errors.length) console.error('Pagado: fallo en correos', code, res.errors);
  return { paid: true, emails: res };
}

// Pregunta a Stripe si el pago de este pedido está hecho (sin esperar al webhook)
export async function checkWithStripe(order) {
  const get = async (path) => {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}` },
    });
    return res.ok ? res.json() : null;
  };
  if (order.stripe_payment_intent) {
    const pi = await get(`payment_intents/${order.stripe_payment_intent}`);
    return pi?.status === 'succeeded' ? pi.id : null;
  }
  if (order.stripe_session_id) {
    const s = await get(`checkout/sessions/${order.stripe_session_id}`);
    return s?.payment_status === 'paid' ? s.payment_intent || 'checkout' : null;
  }
  return null;
}
