// Netlify Function: valida una invitación y la marca como usada.
// La comprobación y el marcado son una sola operación atómica en la base de
// datos (UPDATE ... WHERE used = false), así que si dos móviles escanean el
// mismo código a la vez, solo uno de los dos consigue validarlo.
//
// Variables de entorno necesarias (configúralas en Netlify, no aquí):
//   SUPABASE_URL          -> Project URL de Supabase
//   SUPABASE_SERVICE_KEY  -> service_role key de Supabase (NUNCA la anon key)

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Servidor mal configurado (faltan variables de entorno)' }),
      { status: 500 }
    );
  }


  let code;
  try {
    const body = await req.json();
    code = (body.code || '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), { status: 400 });
  }

  if (!code) {
    return new Response(JSON.stringify({ valid: false, reason: 'sin_codigo' }), { status: 400 });
  }


  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Consulta el aforo actual sin traer filas: solo pedimos el conteo,
  // que Supabase devuelve en la cabecera Content-Range (ej. "0-0/126").
  async function getCount(onlyUsed) {
    const url = `${SUPABASE_URL}/rest/v1/invitations?select=code${onlyUsed ? '&used=eq.true' : ''}`;
    const res = await fetch(url, {
      headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
    });
    const range = res.headers.get('content-range');
    return range ? parseInt(range.split('/')[1], 10) : null;
  }

  async function getStats() {
    const [used, total] = await Promise.all([getCount(true), getCount(false)]);
    return { used, total };
  }

  // Intento atómico: solo actualiza si used = false. Si la fila ya estaba
  // usada, esta consulta no devuelve nada (0 filas), y eso es justo la señal
  // de "ya se usó" sin necesidad de una comprobación previa por separado.
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/invitations?code=eq.${encodeURIComponent(code)}&used=eq.false`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ used: true, used_at: new Date().toISOString() }),
    }
  );

  if (!updateRes.ok) {
    return new Response(JSON.stringify({ error: 'Error al consultar la base de datos' }), {
      status: 502,
    });
  }

  const updated = await updateRes.json();

  if (updated.length > 0) {
    const row = updated[0];
    const stats = await getStats();
    return new Response(
      JSON.stringify({
        valid: true,
        invite_number: row.invite_number,
        name: row.name || null,
        stats,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // No se actualizó nada: o el código no existe, o ya estaba usado.
  // Hacemos un select rápido solo para dar el mensaje correcto al staff.
  const lookupRes = await fetch(
    `${SUPABASE_URL}/rest/v1/invitations?code=eq.${encodeURIComponent(code)}&select=invite_number,name,used_at`,
    { headers }
  );
  const lookup = await lookupRes.json();

  if (lookup.length === 0) {
    const stats = await getStats();
    return new Response(JSON.stringify({ valid: false, reason: 'no_existe', stats }), { status: 200 });
  }

  const stats = await getStats();
  return new Response(
    JSON.stringify({
      valid: false,
      reason: 'ya_usada',
      invite_number: lookup[0].invite_number,
      used_at: lookup[0].used_at,
      stats,
    }),
    { status: 200 }
  );
};
