// Netlify Scheduled Function: cada hora busca pedidos con Bizum o PayPal que
// lleven más de 20 h sin pagar y les manda un recordatorio (una sola vez).
// No cancela nada solo: eso lo decides tú desde /pedidos.

import { sb } from '../lib/email.js';
import { sendStatusEmail } from '../lib/order-mail.js';

export default async () => {
  try {
    const { url, headers } = sb();
    const before = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const q =
      `select=*&status=eq.pendiente&payment=in.(bizum,paypal)&reminder_sent_at=is.null` +
      `&created_at=lt.${encodeURIComponent(before)}&limit=50`;
    const r = await fetch(`${url}/rest/v1/orders?${q}`, { headers });
    if (!r.ok) return new Response(`sin columnas: ${r.status}`); // falta ejecutar el SQL
    const rows = await r.json();
    let sent = 0;
    for (const o of rows) {
      const mark = await fetch(`${url}/rest/v1/orders?code=eq.${o.code}&reminder_sent_at=is.null`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
      });
      if (!mark.ok || !(await mark.json()).length) continue;
      try {
        await sendStatusEmail(o, 'recordatorio');
        sent++;
      } catch (e) {
        console.error('Recordatorio: fallo', o.code, e);
      }
    }
    if (rows.length) console.log('Recordatorios de pago:', { candidatos: rows.length, enviados: sent });

    // Pagos con tarjeta/Apple Pay que se quedaron a medias hace más de 2 h: se cancelan
    // y las unidades vuelven al stock (si se hubieran pagado, Stripe ya los habría marcado)
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const t = await fetch(
      `${url}/rest/v1/orders?select=code&status=eq.pendiente&payment=eq.tarjeta&created_at=lt.${encodeURIComponent(old)}&limit=50`,
      { headers }
    );
    if (t.ok) {
      for (const { code } of await t.json()) {
        await fetch(`${url}/rest/v1/rpc/cancel_order`, { method: 'POST', headers, body: JSON.stringify({ p_code: code }) });
        console.log('Tarjeta sin pagar cancelado:', code);
      }
    }
    return new Response(JSON.stringify({ sent }));
  } catch (e) {
    console.error('Recordatorio: error', e);
    return new Response('error', { status: 500 });
  }
};

export const config = { schedule: '17 * * * *' };
