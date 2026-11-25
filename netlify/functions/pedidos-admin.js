// Netlify Function: /api/admin/pedidos  (panel privado /pedidos)
// Cabecera x-staff-passcode: ADMIN_KEY o STAFF_PASSCODE
//   GET                                   -> pedidos + stock de la preventa
//   POST { code, status: "pagado" }       -> marca pagado y manda "Pago recibido"
//   POST { code, status: "enviado", tracking? } -> marca enviado y manda "En camino"
//   POST { code, status: "entregado" }    -> solo cambia el estado
//   POST { code, status: "cancelado" }    -> cancela, devuelve el stock y manda "Cancelado"
//   POST { code, status: "recordatorio" } -> manda otra vez el recordatorio de pago
//   POST { ..., silent: true }            -> cambia el estado sin mandar correo
//   POST { code, action: "borrar" }      -> borra para siempre un pedido ya cancelado
//   POST { action: "vaciar", confirm: "BORRAR" } -> borra TODOS los pedidos y deja el stock de la preventa como al principio

import { sb } from '../lib/email.js';
import { sendStatusEmail } from '../lib/order-mail.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

const STATUSES = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];

export default async (req) => {
  const keys = [process.env.ADMIN_KEY, process.env.STAFF_PASSCODE].map((k) => (k || '').trim()).filter(Boolean);
  const given = (req.headers.get('x-staff-passcode') || '').trim();
  if (!keys.length || !keys.includes(given)) return json({ error: 'PIN incorrecto' }, 401);

  const { url, headers } = sb();

  try {
    if (req.method === 'GET') {
      const [o, s] = await Promise.all([
        fetch(`${url}/rest/v1/orders?select=*&order=created_at.desc&limit=1000`, { headers }),
        fetch(`${url}/rest/v1/presale_stock?select=product_id,name,initial,stock&order=product_id`, { headers }),
      ]);
      if (!o.ok) throw new Error(`orders ${o.status}: ${await o.text()}`);
      return json({ orders: await o.json(), stock: s.ok ? await s.json() : [] });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await req.json().catch(() => ({}));

    // Empezar de cero (para quitar los pedidos de prueba antes de abrir)
    if (body.action === 'vaciar') {
      if (body.confirm !== 'BORRAR') return json({ error: 'Falta la confirmación' }, 400);
      const d = await fetch(`${url}/rest/v1/orders?code=like.ISO-*`, { method: 'DELETE', headers });
      if (!d.ok) throw new Error(`orders ${d.status}: ${await d.text()}`);
      const s = await fetch(`${url}/rest/v1/presale_stock?select=product_id,initial`, { headers });
      for (const row of s.ok ? await s.json() : []) {
        await fetch(`${url}/rest/v1/presale_stock?product_id=eq.${encodeURIComponent(row.product_id)}`, {
          method: 'PATCH', headers, body: JSON.stringify({ stock: row.initial }),
        });
      }
      return json({ ok: true, emptied: true });
    }

    const code = String(body.code || '').trim().toUpperCase();
    const status = String(body.status || '');
    if (!/^ISO-[0-9A-F]{5}$/.test(code)) return json({ error: 'Código no válido' }, 400);

    const get = async () => {
      const r = await fetch(`${url}/rest/v1/orders?code=eq.${code}&select=*`, { headers });
      const [row] = await r.json();
      return row;
    };
    let order = await get();
    if (!order) return json({ error: 'No existe ese pedido' }, 404);

    if (body.action === 'borrar') {
      if (order.status !== 'cancelado') return json({ error: 'Solo se pueden borrar pedidos cancelados' }, 409);
      const r = await fetch(`${url}/rest/v1/orders?code=eq.${code}&status=eq.cancelado`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error(`orders ${r.status}: ${await r.text()}`);
      return json({ ok: true, deleted: code });
    }

    if (status === 'recordatorio') {
      await sendStatusEmail(order, 'recordatorio');
      return json({ ok: true, order, email: 'enviado' });
    }
    if (!STATUSES.includes(status)) return json({ error: 'Estado no válido' }, 400);
    if (order.status === 'cancelado') return json({ error: 'Ese pedido ya está cancelado' }, 409);

    if (status === 'cancelado') {
      // La función de la base de datos devuelve las unidades de preventa al stock
      const r = await fetch(`${url}/rest/v1/rpc/cancel_order`, { method: 'POST', headers, body: JSON.stringify({ p_code: code }) });
      if (!r.ok) throw new Error(`cancel_order ${r.status}: ${await r.text()}`);
    } else {
      const patch = { status };
      const now = new Date().toISOString();
      if (status === 'pagado') patch.paid_at = now;
      if (status === 'enviado') {
        patch.shipped_at = now;
        if (typeof body.tracking === 'string') patch.tracking = body.tracking.trim() || null;
      }
      let r = await fetch(`${url}/rest/v1/orders?code=eq.${code}`, { method: 'PATCH', headers, body: JSON.stringify(patch) });
      if (!r.ok) {
        // Si aún no existen las columnas nuevas, al menos cambia el estado
        r = await fetch(`${url}/rest/v1/orders?code=eq.${code}`, { method: 'PATCH', headers, body: JSON.stringify({ status }) });
        if (!r.ok) throw new Error(`orders ${r.status}: ${await r.text()}`);
      }
    }

    order = await get();
    let email = 'no';
    if (!body.silent && ['pagado', 'enviado', 'cancelado'].includes(status)) {
      try {
        email = await sendStatusEmail(order, status);
      } catch (e) {
        console.error('Panel: fallo al mandar correo', code, e);
        email = 'error';
      }
    }
    return json({ ok: true, order, email });
  } catch (e) {
    console.error('Panel pedidos: error', e);
    return json({ error: String(e.message || e) }, 502);
  }
};
