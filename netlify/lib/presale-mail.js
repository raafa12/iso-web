// Lógica compartida del correo "La preventa está abierta".
//
// Variables de entorno (en Netlify → Site configuration → Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  -> ya existen
//   BREVO_API_KEY   -> API key de Brevo (SMTP & API → API keys)
//   EMAIL_FROM      -> remitente verificado en Brevo, p. ej. hola@isowear.es
//   EMAIL_SECRET    -> (opcional) secreto para firmar los enlaces de baja;
//                      si falta se usa SUPABASE_SERVICE_KEY
//   PRESALE_OPEN / PRESALE_CLOSE -> (opcional) para probar con otras fechas

import { createHmac, timingSafeEqual } from 'node:crypto';

// Mantener igual que PRESALE en src/data/isolation-drop.ts
export const PRESALE_OPEN = process.env.PRESALE_OPEN || '2026-12-14T00:00:00+01:00';
export const PRESALE_CLOSE = process.env.PRESALE_CLOSE || '2026-12-20T23:59:59+01:00';

const SITE = 'https://isowear.es';
const SUBJECT = 'La preventa de Isolation está abierta';

function env(name, fallback) {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

function sb() {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return { url, headers };
}

// ---------- Baja (enlace firmado, sin login) ----------

function secret() {
  return env('EMAIL_SECRET', process.env.SUPABASE_SERVICE_KEY);
}

export function unsubToken(email) {
  return createHmac('sha256', secret()).update(email.toLowerCase()).digest('base64url').slice(0, 32);
}

export function checkUnsubToken(email, token) {
  const good = Buffer.from(unsubToken(email));
  const got = Buffer.from(String(token || ''));
  return good.length === got.length && timingSafeEqual(good, got);
}

export function unsubUrl(email) {
  return `${SITE}/api/baja?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
}

export async function unsubscribe(email) {
  const { url, headers } = sb();
  const res = await fetch(`${url}/rest/v1/waitlist?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ unsubscribed: true }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

// ---------- Contenido ----------

const fmtClose = () =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(new Date(PRESALE_CLOSE)).replace(',', ' a las');

export function renderEmail(email) {
  const unsub = unsubUrl(email);
  const link = `${SITE}/preventa?utm_source=email&utm_medium=aviso&utm_campaign=isolation`;
  const close = fmtClose();
  const font = "'Arial Black','Helvetica Neue',Helvetica,Arial,sans-serif";
  const body = "Helvetica,Arial,sans-serif";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${SUBJECT}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">4 modelos · unidades limitadas · hasta el ${close}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="padding:0 0 32px;"><a href="${SITE}"><img src="${SITE}/email/iso-logo.png" width="120" alt="ISO" style="display:block;border:0;width:120px;height:auto;"></a></td></tr>
  <tr><td style="font-family:${body};font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#7ec8e3;font-weight:bold;padding:0 0 12px;">&#9679; Drop 001 · Preventa abierta</td></tr>
  <tr><td style="font-family:${font};font-size:52px;line-height:0.95;font-weight:900;font-style:italic;text-transform:uppercase;color:#f2ede5;letter-spacing:-1px;padding:0 0 20px;">Isolation.</td></tr>
  <tr><td style="font-family:${body};font-size:16px;line-height:1.55;color:#c9c4bc;padding:0 0 28px;">
    Ya puedes reservar el primer drop de ISO: <b style="color:#f2ede5;">4 modelos</b>, <b style="color:#f2ede5;">unidades limitadas</b>.
    La preventa cierra el <b style="color:#f2ede5;">${close}</b> o cuando se acaben.
  </td></tr>
  <tr><td style="padding:0 0 28px;"><a href="${link}"><img src="${SITE}/email/isolation-drop.jpg" width="600" alt="Isolate Yourself, Not Like Them, Drip Hoodie e If You Miss Her" style="display:block;border:0;width:100%;max-width:600px;height:auto;"></a></td></tr>
  <tr><td align="left" style="padding:0 0 36px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:#7ec8e3;"><a href="${link}" style="display:inline-block;padding:16px 30px;font-family:${font};font-size:15px;font-weight:900;font-style:italic;letter-spacing:2px;text-transform:uppercase;color:#0a0a0a;text-decoration:none;">Ir a la preventa &rarr;</a></td>
    </tr></table>
  </td></tr>
  <tr><td style="border-top:1px solid #262626;padding:20px 0 0;font-family:${body};font-size:12px;line-height:1.6;color:#7a766f;">
    Envío gratis en Santander · Diseñado en Santander<br>
    Te escribimos porque te apuntaste en isowear.es. <a href="${unsub}" style="color:#7a766f;">Darme de baja</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = `ISOLATION. — Drop 001 de ISO
La preventa está abierta: 4 modelos, unidades limitadas.
Cierra el ${close} o cuando se acaben.

Ir a la preventa: ${link}

Envío gratis en Santander.
Darme de baja: ${unsub}`;

  return { subject: SUBJECT, html, text, unsub };
}

// ---------- Envío ----------

export async function sendOne(email) {
  const { subject, html, text, unsub } = renderEmail(email);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'ISO', email: env('EMAIL_FROM') },
      to: [{ email }],
      subject,
      htmlContent: html,
      textContent: text,
      headers: {
        'List-Unsubscribe': `<${unsub}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: ['preventa-isolation'],
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

async function pending(limit) {
  const { url, headers } = sb();
  const q = `select=id,email&notified_at=is.null&unsubscribed=is.false&order=id.asc&limit=${limit}`;
  const res = await fetch(`${url}/rest/v1/waitlist?${q}`, { headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function markSent(ids) {
  if (!ids.length) return;
  const { url, headers } = sb();
  const res = await fetch(`${url}/rest/v1/waitlist?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ notified_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

// Manda el aviso a todos los apuntados que aún no lo han recibido.
// Cada fila se marca con notified_at al enviarse, así que se puede ejecutar
// las veces que haga falta sin mandar nada dos veces.
export async function sendPending({ max = 400, concurrency = 8, deadlineMs = 22000 } = {}) {
  const started = Date.now();
  const rows = await pending(max);
  const sent = [];
  const failed = [];
  let i = 0;

  async function worker() {
    while (i < rows.length && Date.now() - started < deadlineMs) {
      const row = rows[i++];
      try {
        await sendOne(row.email);
        sent.push(row.id);
      } catch (e) {
        failed.push({ id: row.id, error: String(e.message || e) });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  await markSent(sent);
  if (failed.length) console.error('Aviso preventa: fallos', failed.slice(0, 10));
  return { candidates: rows.length, sent: sent.length, failed: failed.length };
}

export function presaleIsOpen(now = Date.now()) {
  return now >= Date.parse(PRESALE_OPEN) && now < Date.parse(PRESALE_CLOSE);
}
