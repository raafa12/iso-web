// Netlify Function: /api/baja?e=<email>&t=<firma>
//   GET  -> página para confirmar la baja (no da de baja sola: algunos
//           antivirus de correo abren los enlaces y te darían de baja sin querer)
//   POST -> da de baja (botón de la página y "Cancelar suscripción" de Gmail)
//   POST con undo=1 -> vuelve a apuntar

import { checkUnsubToken, setUnsubscribed, esc } from '../lib/email.js';

const page = ({ title, msg, actions = '', status = 200 }) =>
  new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ISO</title><link rel="icon" href="/favicon.svg">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#f2ede5;font-family:Helvetica,Arial,sans-serif;text-align:center;padding:32px 20px}
  .wrap{max-width:420px;width:100%}
  .logo{display:block;width:120px;height:auto;margin:0 auto 40px}
  h1{font-family:'Arial Black',Helvetica,Arial,sans-serif;font-weight:900;font-style:italic;text-transform:uppercase;font-size:clamp(2.4rem,9vw,3.4rem);line-height:.95;letter-spacing:-.02em;margin:0 0 14px}
  p{color:#c9c4bc;line-height:1.55;margin:0 0 28px}
  form{margin:0}
  .btn{display:inline-block;width:100%;padding:16px 24px;border:0;background:#7ec8e3;color:#0a0a0a;font:900 italic 15px/1 'Arial Black',Helvetica,Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;text-decoration:none;cursor:pointer}
  .link{display:inline-block;margin-top:18px;color:#7a766f;font-size:14px;background:none;border:0;font-family:inherit;cursor:pointer;text-decoration:underline}
  .link:hover{color:#f2ede5}
</style></head>
<body><div class="wrap">
<a href="/"><img class="logo" src="/email/iso-logo-azul.png" alt="ISO" width="120"></a>
<h1>${title}</h1><p>${msg}</p>${actions}
</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

const home = '<a class="btn" href="/">Volver a isowear.es</a>';

export default async (req) => {
  const u = new URL(req.url);
  let form = new URLSearchParams();
  if (req.method === 'POST') {
    try { form = new URLSearchParams(await req.text()); } catch {}
  }
  const email = (u.searchParams.get('e') || form.get('e') || '').trim().toLowerCase();
  const token = u.searchParams.get('t') || form.get('t') || '';
  const action = `/api/baja?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;

  if (!email || !checkUnsubToken(email, token)) {
    return page({ title: 'Enlace no válido', msg: 'Este enlace no es correcto o está incompleto.', actions: home, status: 400 });
  }

  if (req.method === 'GET') {
    return page({
      title: '¿Te vas?',
      msg: `Dejaremos de mandar avisos de drops y preventas a <b style="color:#f2ede5">${esc(email)}</b>.`,
      actions: `<form method="post" action="${action}"><button class="btn" type="submit">Darme de baja</button></form>
<a class="link" href="/">No, me quedo</a>`,
    });
  }

  const undo = form.get('undo') === '1';
  try {
    await setUnsubscribed(email, !undo);
  } catch (e) {
    console.error('Baja: error', e);
    return page({ title: 'Algo ha fallado', msg: 'No hemos podido guardar el cambio. Inténtalo de nuevo en un rato.', actions: home, status: 502 });
  }

  // "Cancelar suscripción" de Gmail (List-Unsubscribe=One-Click) no necesita página
  if (form.get('List-Unsubscribe') === 'One-Click') return new Response('ok');

  if (undo) {
    return page({ title: 'De vuelta.', msg: 'Te seguiremos avisando antes que a nadie de cada drop.', actions: home });
  }
  return page({
    title: 'Hecho.',
    msg: 'Ya no te mandaremos más correos.',
    actions: `${home}<form method="post" action="${action}"><input type="hidden" name="undo" value="1"><button class="link" type="submit">Me he equivocado, volver a apuntarme</button></form>`,
  });
};
