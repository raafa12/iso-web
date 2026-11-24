// Netlify Function: POST /api/pago-stripe { code }
// Crea la página de pago de Stripe (tarjeta, Apple Pay, Google Pay) para un
// pedido ya hecho con "tarjeta". El importe sale de la base de datos.

import { sb } from '../lib/email.js';
import { createCheckout } from '../lib/stripe.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  if (!/^ISO-[0-9A-F]{5}$/.test(code)) return json({ error: 'Código no válido' }, 400);

  try {
    const { url, headers } = sb();
    const r = await fetch(`${url}/rest/v1/orders?code=eq.${code}&select=*`, { headers });
    const [order] = await r.json();
    if (!order) return json({ error: 'No existe ese pedido' }, 404);
    if (order.payment !== 'tarjeta') return json({ error: 'Este pedido no es con tarjeta' }, 400);
    if (order.status === 'cancelado') return json({ error: 'Este pedido ha caducado. Vuelve a hacerlo desde el carrito.' }, 409);
    if (order.status !== 'pendiente') return json({ error: 'Este pedido ya está pagado', paid: true }, 409);

    const session = await createCheckout(order);
    // La última sesión es la buena: si caduca una anterior no se cancela el pedido
    await fetch(`${url}/rest/v1/orders?code=eq.${code}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ stripe_session_id: session.id }),
    });
    return json({ url: session.url });
  } catch (e) {
    console.error('Stripe: no se pudo crear el pago', code, e);
    // El motivo de Stripe ayuda a ver qué falta en la cuenta (no incluye claves)
    const why = String(e?.message || '').replace(/^Stripe \d+: /, '').replace(/(sk|rk|pk)_(live|test)_[A-Za-z0-9*]+/g, '$1_$2_…');
    return json({ error: `No se ha podido abrir el pago con tarjeta. ${why}` }, 502);
  }
};
