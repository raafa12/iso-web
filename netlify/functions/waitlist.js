// Netlify Function: guarda un registro en la lista de acceso prioritario
// para el próximo drop (recogidos vía QR en eventos, ej. el torneo 1v1).
//
// Variables de entorno necesarias (ya deberías tener las 2 primeras
// configuradas en Netlify desde el sistema de invitaciones):
//   SUPABASE_URL          -> Project URL de Supabase
//   SUPABASE_SERVICE_KEY  -> service_role key de Supabase
//   BREVO_API_KEY, EMAIL_FROM -> para el correo de bienvenida (si faltan, se apunta igual)

import { sendWelcome } from '../lib/welcome-mail.js';

export default async (req) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Servidor mal configurado (faltan variables de entorno)' }),
      { status: 500 }
    );
  }

  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // GET → solo devuelve cuántos hay apuntados (prueba social en la página).
  if (req.method === 'GET') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist?select=id`, {
      headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
    });
    const range = res.headers.get('content-range');
    const count = range ? parseInt(range.split('/')[1], 10) : null;
    return new Response(JSON.stringify({ count }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), { status: 400 });
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const instagram = (body.instagram || '').trim().replace(/^@/, '');
  const sizePref = (body.size_pref || '').trim();
  const source = (body.source || 'web').trim();
  // Aviso de una prenda concreta (drop) o de stock de un clásico
  const productId = String(body.product_id || '').trim().slice(0, 80);
  const productName = String(body.product_name || '').trim().slice(0, 120);
  const stockOnly = source === 'stock';

  // Honeypot anti-spam: campo oculto que un humano nunca rellena.
  if (body.website) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 }); // fingimos éxito, no delatamos el honeypot
  }

  // El aviso de la preventa (y el de stock) solo pide el correo
  if (!name && !source.startsWith('preventa') && !stockOnly) {
    return new Response(JSON.stringify({ error: 'Falta el nombre' }), { status: 400 });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return new Response(JSON.stringify({ error: 'Email no válido' }), { status: 400 });
  }

  // Guarda qué prenda quiere (si falla, p. ej. porque falta la tabla, sigue adelante)
  if (productId) {
    await fetch(`${SUPABASE_URL}/rest/v1/stock_alerts?on_conflict=email,product_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ email, product_id: productId, product_name: productName || productId, kind: stockOnly ? 'stock' : 'drop', notified_at: null }]),
    }).then(async (r) => { if (!r.ok) console.error('stock_alerts:', r.status, await r.text()); }).catch((e) => console.error('stock_alerts:', e));
  }

  // Aviso de stock de un clásico: no se apunta a la lista de la preventa, solo se le confirma
  if (stockOnly) {
    if (!productId) return new Response(JSON.stringify({ error: 'Falta la prenda' }), { status: 400 });
    if (process.env.BREVO_API_KEY && process.env.EMAIL_FROM) {
      try {
        await sendWelcome({ email, source, productName: productName || productId, productId });
      } catch (e) {
        console.error('Aviso de stock: no se pudo enviar', e);
      }
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Evita duplicados: si el email ya existe, lo tratamos como éxito
  // (idempotente) en vez de dar error, así el usuario no se confunde
  // si escanea el QR dos veces.
  const existingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}&select=id`,
    { headers }
  );
  const existing = await existingRes.json();

  if (existing.length > 0) {
    // Si se había dado de baja y se vuelve a apuntar, vuelve a recibir avisos
    await fetch(`${SUPABASE_URL}/rest/v1/waitlist?email=eq.${encodeURIComponent(email)}&unsubscribed=is.true`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ unsubscribed: false }),
    }).catch(() => {});
    // Le vuelve a llegar el correo de bienvenida (si no, parece que no ha funcionado)
    if (process.env.BREVO_API_KEY && process.env.EMAIL_FROM) {
      try {
        await sendWelcome({ email, name, source, productName, productId });
      } catch (e) {
        console.error('Bienvenida (ya apuntado): no se pudo enviar', e);
      }
    }
    return new Response(JSON.stringify({ ok: true, already: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
    method: 'POST',
    headers,
    body: JSON.stringify([
      {
        name: name || '',
        email,
        instagram: instagram || null,
        size_pref: sizePref || null,
        source,
      },
    ]),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    console.error('Supabase insert error:', errText);
    return new Response(JSON.stringify({ error: 'Error al guardar' }), { status: 502 });
  }

  // Correo de bienvenida (si falla, el registro ya está guardado)
  if (process.env.BREVO_API_KEY && process.env.EMAIL_FROM) {
    try {
      await sendWelcome({ email, name, source, productName, productId });
    } catch (e) {
      console.error('Bienvenida: no se pudo enviar', e);
    }
  }

  return new Response(JSON.stringify({ ok: true, already: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};