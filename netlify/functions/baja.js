// Netlify Function: GET/POST /api/baja?e=<email>&t=<firma>
// Enlace de baja de los correos (también el "Cancelar suscripción" de Gmail,
// que llega por POST). La firma evita que alguien dé de baja a otra persona.

import { checkUnsubToken, unsubscribe } from '../lib/presale-mail.js';

const page = (title, msg, status = 200) =>
  new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ISO</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#f2ede5;font-family:Helvetica,Arial,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div><p style="font-weight:900;font-style:italic;text-transform:uppercase;font-size:32px;margin:0 0 12px">${title}</p>
<p style="color:#c9c4bc;margin:0 0 24px">${msg}</p><a href="/" style="color:#7ec8e3">Volver a isowear.es</a></div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

export default async (req) => {
  const u = new URL(req.url);
  const email = (u.searchParams.get('e') || '').trim().toLowerCase();
  const token = u.searchParams.get('t') || '';

  if (!email || !checkUnsubToken(email, token)) {
    return page('Enlace no válido', 'Este enlace de baja no es correcto o está incompleto.', 400);
  }
  try {
    await unsubscribe(email);
  } catch (e) {
    console.error('Baja: error', e);
    return page('Algo ha fallado', 'No hemos podido darte de baja. Inténtalo de nuevo en un rato.', 502);
  }
  if (req.method === 'POST') return new Response('ok');
  return page('Hecho', 'Ya no te mandaremos más correos.');
};
