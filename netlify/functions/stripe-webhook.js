// Netlify Function: POST /api/stripe-webhook  (lo llama Stripe)
//   checkout.session.completed / async_payment_succeeded / payment_intent.succeeded -> pedido pagado + correos
//   checkout.session.expired -> si sigue sin pagar, se cancela y vuelve el stock

import { sb } from '../lib/email.js';
import { verifyWebhook } from '../lib/stripe.js';
import { sendOrderEmails } from '../lib/order-mail.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get('stripe-signature'))) {
    return new Response('firma no válida', { status: 400 });
  }
  const event = JSON.parse(raw);
  const s = event.data?.object || {};
  const code = s.metadata?.code || s.client_reference_id;
  if (!code) return new Response('sin pedido');

  const { url, headers } = sb();
  const getOrder = async () => {
    const r = await fetch(`${url}/rest/v1/orders?code=eq.${encodeURIComponent(code)}&select=*`, { headers });
    return (await r.json())[0];
  };

  try {
    if (
      (event.type === 'checkout.session.completed' && s.payment_status === 'paid') ||
      event.type === 'checkout.session.async_payment_succeeded' ||
      event.type === 'payment_intent.succeeded'
    ) {
      // Solo pasa a pagado si estaba pendiente (Stripe puede repetir el aviso)
      const r = await fetch(`${url}/rest/v1/orders?code=eq.${encodeURIComponent(code)}&status=eq.pendiente`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'pagado',
          paid_at: new Date().toISOString(),
          confirmation_sent_at: new Date().toISOString(),
          stripe_payment_intent: s.object === 'payment_intent' ? s.id : s.payment_intent || null,
        }),
      });
      const rows = r.ok ? await r.json() : [];
      if (!rows.length) {
        const o = await getOrder();
        if (o?.status === 'cancelado') {
          // Pagó después de caducar: hay que revisarlo a mano (devolver o reactivar)
          console.error('Stripe: pago de un pedido ya cancelado', code);
        }
        return new Response('ya procesado');
      }
      const r2 = await sendOrderEmails(rows[0]);
      if (r2.errors.length) console.error('Stripe: fallo en correos', code, r2.errors);
      return new Response('ok');
    }

    if (event.type === 'checkout.session.expired') {
      const o = await getOrder();
      if (o && o.status === 'pendiente' && o.payment === 'tarjeta' && (!o.stripe_session_id || o.stripe_session_id === s.id)) {
        await fetch(`${url}/rest/v1/rpc/cancel_order`, { method: 'POST', headers, body: JSON.stringify({ p_code: code }) });
        console.log('Stripe: pedido sin pagar cancelado', code);
      }
      return new Response('ok');
    }

    return new Response('ignorado');
  } catch (e) {
    console.error('Stripe webhook: error', code, e);
    return new Response('error', { status: 500 }); // Stripe lo reintenta
  }
};
