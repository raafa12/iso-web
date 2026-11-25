// "Ya ha vuelto": correo a quien pidió aviso de stock de una prenda (clásicos).
// Lo lanza el panel /pedidos (pestaña Números → Avisos de stock).

import { SITE, layout, sendEmail, p, b, button, esc, sb } from './email.js';

export function renderStockBack({ productId, productName }) {
  const link = `${SITE}/collection?p=${encodeURIComponent(productId)}&utm_source=email&utm_medium=stock`;
  const subject = `Ha vuelto: ${productName} 🏀`;
  const body =
    p(`La ${b(esc(productName))} vuelve a estar disponible. Te avisamos porque nos lo pediste.`) +
    p('Unidades limitadas.') +
    button('Comprar ahora', link) +
    p(b('Call for an ISO.'), 'margin-top:24px;');
  const text = `Ha vuelto.\nLa ${productName} vuelve a estar disponible.\n\n${link}\n\nCall for an ISO.`;
  return { subject, html: layout({ subject, preheader: `La ${productName} vuelve a estar disponible`, kicker: 'Aviso de stock', title: 'Ha vuelto.', body }), text };
}

// Manda el aviso a todos los que lo esperan para esa prenda y los marca como avisados
export async function sendStockAlerts(productId) {
  const { url, headers } = sb();
  const r = await fetch(`${url}/rest/v1/stock_alerts?product_id=eq.${encodeURIComponent(productId)}&kind=eq.stock&notified_at=is.null&select=id,email,product_name`, { headers });
  if (!r.ok) throw new Error(`stock_alerts ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  let sent = 0, failed = 0;
  for (const row of rows) {
    const { subject, html, text } = renderStockBack({ productId, productName: row.product_name || productId });
    try {
      await sendEmail({ to: row.email, subject, html, text, tags: ['stock'] });
      await fetch(`${url}/rest/v1/stock_alerts?id=eq.${row.id}`, { method: 'PATCH', headers, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
      sent++;
    } catch (e) {
      console.error('Aviso de stock: fallo', row.email, e);
      failed++;
    }
  }
  return { sent, failed };
}
