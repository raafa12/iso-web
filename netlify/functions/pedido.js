// Netlify Function: POST /api/pedido  { code }
// La llama el carrito justo después de hacer el pedido. Busca el pedido en
// Supabase (los datos salen de la base de datos, no del navegador) y manda:
//   - la confirmación al cliente
//   - el aviso de pedido nuevo a ISO (ORDERS_EMAIL o EMAIL_FROM)
// Solo una vez por pedido (orders.confirmation_sent_at) y solo en la primera hora.

import { sb } from '../lib/email.js';
import { sendOrderEmails } from '../lib/order-mail.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body = {};
  try { body = await req.json(); } catch {}
  const code = String(body.code || '').trim().toUpperCase();
  if (!/^ISO-[0-9A-F]{5}$/.test(code)) return json({ error: 'Código no válido' }, 400);

  try {
    const { url, headers } = sb();
    const res = await fetch(`${url}/rest/v1/orders?code=eq.${code}&select=*`, { headers });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const [order] = await res.json();
    if (!order) return json({ error: 'No existe' }, 404);
    if (order.confirmation_sent_at) return json({ ok: true, already: true });
    if (Date.now() - Date.parse(order.created_at) > 60 * 60 * 1000) return json({ error: 'Pedido antiguo' }, 409);

    // Se marca antes de enviar para que dos llamadas seguidas no manden dos correos
    const mark = await fetch(`${url}/rest/v1/orders?code=eq.${code}&confirmation_sent_at=is.null`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ confirmation_sent_at: new Date().toISOString() }),
    });
    if (mark.ok) {
      const rows = await mark.json();
      if (!rows.length) return json({ ok: true, already: true });
    } else {
      console.error('Pedido: no se pudo marcar (¿falta la columna confirmation_sent_at?)', await mark.text());
    }

    const r = await sendOrderEmails(order);
    if (r.errors.length) console.error('Pedido: fallo al enviar', code, r.errors);
    return json({ ok: r.customer === 'fulfilled', ...r });
  } catch (e) {
    console.error('Pedido: error', e);
    return json({ error: 'error' }, 502);
  }
};
