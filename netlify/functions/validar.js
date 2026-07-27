// Netlify Function: guarda un registro en la lista de acceso prioritario
// para el próximo drop (recogidos vía QR en eventos, ej. el torneo 1v1).
//
// Variables de entorno necesarias (ya deberías tener las 2 primeras
// configuradas en Netlify desde el sistema de invitaciones):
//   SUPABASE_URL          -> Project URL de Supabase
//   SUPABASE_SERVICE_KEY  -> service_role key de Supabase

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

  // Honeypot anti-spam: campo oculto que un humano nunca rellena.
  if (body.website) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 }); // fingimos éxito, no delatamos el honeypot
  }

  if (!name) {
    return new Response(JSON.stringify({ error: 'Falta el nombre' }), { status: 400 });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return new Response(JSON.stringify({ error: 'Email no válido' }), { status: 400 });
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
        name,
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

  return new Response(JSON.stringify({ ok: true, already: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};