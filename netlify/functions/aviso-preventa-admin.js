// Netlify Function (manual, protegida): POST /api/aviso-preventa
//   cabecera x-staff-passcode: <STAFF_PASSCODE>  (o ADMIN_KEY si la defines)
//   { "test": "tu@correo.com" }  -> manda solo un correo de prueba a esa dirección
//   { "send": true }             -> fuerza el envío a todos los pendientes ahora
//   { }                          -> devuelve cuántos hay pendientes

import { sendOne, sendPending } from '../lib/presale-mail.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const key = (process.env.ADMIN_KEY || process.env.STAFF_PASSCODE || '').trim();
  if (!key) return json({ error: 'Falta STAFF_PASSCODE en las variables de entorno de Netlify' }, 500);
  if ((req.headers.get('x-staff-passcode') || '').trim() !== key) return json({ error: 'PIN incorrecto' }, 401);
  if (!process.env.BREVO_API_KEY) return json({ error: 'Falta BREVO_API_KEY en Netlify' }, 500);
  if (!process.env.EMAIL_FROM) return json({ error: 'Falta EMAIL_FROM en Netlify' }, 500);

  let body = {};
  try { body = await req.json(); } catch {}

  try {
    if (body.test) {
      const email = String(body.test).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email no válido' }, 400);
      await sendOne(email);
      return json({ ok: true, test: email });
    }
    if (body.send === true) return json({ ok: true, ...(await sendPending()) });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_KEY;
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/waitlist?select=id&notified_at=is.null&unsubscribed=is.false`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' } }
    );
    const range = res.headers.get('content-range');
    return json({ pending: range ? parseInt(range.split('/')[1], 10) : null });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
};
