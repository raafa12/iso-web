// Base común de todos los correos de ISO: envío por Brevo, plantilla con el
// logo, enlace de baja firmado y acceso a Supabase.
//
// Variables de entorno (Netlify):
//   BREVO_API_KEY, EMAIL_FROM (hola@isowear.es)
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   ORDERS_EMAIL  -> (opcional) dónde te llegan los avisos de pedido; por defecto EMAIL_FROM
//   EMAIL_SECRET  -> (opcional) firma de los enlaces de baja; por defecto SUPABASE_SERVICE_KEY

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SITE = 'https://isowear.es';
export const WHATSAPP = '34690342138';
// Mantener igual que PRESALE.bizumPhone en src/data/isolation-drop.ts
export const BIZUM_PHONE = '601105483';
// Mantener igual que PAYPAL_URL en src/lib/shop.ts
export const PAYPAL_URL = 'https://www.paypal.biz/isoweares';

export function env(name, fallback) {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export function sb() {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_KEY');
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0 });
export const prettyPhone = (p) => String(p).replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');

// ---------- Baja (enlace firmado, sin login) ----------

const secret = () => env('EMAIL_SECRET', process.env.SUPABASE_SERVICE_KEY);

export function unsubToken(email) {
  return createHmac('sha256', secret()).update(email.toLowerCase()).digest('base64url').slice(0, 32);
}
export function checkUnsubToken(email, token) {
  const good = Buffer.from(unsubToken(email));
  const got = Buffer.from(String(token || ''));
  return good.length === got.length && timingSafeEqual(good, got);
}
export const unsubUrl = (email) => `${SITE}/api/baja?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;

export async function setUnsubscribed(email, value) {
  const { url, headers } = sb();
  const res = await fetch(`${url}/rest/v1/waitlist?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ unsubscribed: value }),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

// ---------- Plantilla ----------

export const C = { bg: '#0a0a0a', card: '#141414', line: '#262626', text: '#f2ede5', soft: '#c9c4bc', dim: '#7a766f', accent: '#7ec8e3' };
export const F = {
  display: "'Arial Black','Helvetica Neue',Helvetica,Arial,sans-serif",
  body: 'Helvetica,Arial,sans-serif',
};

export const p = (html, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${F.body};font-size:16px;line-height:1.55;color:${C.soft};${extra}">${html}</p>`;
export const b = (html) => `<b style="color:${C.text};">${html}</b>`;

export function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr>
<td style="background:${C.accent};"><a href="${href}" style="display:inline-block;padding:16px 30px;font-family:${F.display};font-size:15px;font-weight:900;font-style:italic;letter-spacing:2px;text-transform:uppercase;color:${C.bg};text-decoration:none;">${label} &rarr;</a></td>
</tr></table>`;
}

export function box(html) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:${C.card};border:1px solid ${C.line};">
<tr><td style="padding:20px 22px;font-family:${F.body};font-size:15px;line-height:1.55;color:${C.soft};">${html}</td></tr></table>`;
}

export const dropImage = (href = `${SITE}/preventa`) =>
  `<a href="${href}"><img src="${SITE}/email/isolation-drop.jpg" width="600" alt="Isolate Yourself, Not Like Them, Drip Hoodie e If You Miss Her" style="display:block;border:0;width:100%;max-width:600px;height:auto;margin:8px 0 28px;"></a>`;

/**
 * kicker: línea pequeña azul sobre el título
 * title:  título grande estilo ISO
 * body:   HTML del cuerpo
 * unsub:  email para poner el enlace de baja (solo en correos de la lista, no en los de pedido)
 */
export function layout({ subject, preheader = '', kicker = '', title = '', body = '', unsub = null, footer = '' }) {
  const unsubLine = unsub
    ? `<br>Te escribimos porque te apuntaste en isowear.es. <a href="${unsubUrl(unsub)}" style="color:${C.dim};">Darme de baja</a>`
    : '';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="padding:0 0 32px;"><a href="${SITE}"><img src="${SITE}/email/iso-logo-azul.png" width="120" alt="ISO" style="display:block;border:0;width:120px;height:auto;"></a></td></tr>
  ${kicker ? `<tr><td style="font-family:${F.body};font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${C.accent};font-weight:bold;padding:0 0 12px;">&#9679; ${kicker}</td></tr>` : ''}
  ${title ? `<tr><td style="font-family:${F.display};font-size:48px;line-height:0.95;font-weight:900;font-style:italic;text-transform:uppercase;color:${C.text};letter-spacing:-1px;padding:0 0 22px;">${title}</td></tr>` : ''}
  <tr><td style="padding:0 0 12px;">${body}</td></tr>
  <tr><td style="border-top:1px solid ${C.line};padding:20px 0 0;font-family:${F.body};font-size:12px;line-height:1.6;color:${C.dim};">
    ${footer || 'ISO · Basketball clothing brand · Diseñado en Santander'}
    <br>¿Dudas? Responde a este correo o escríbenos por <a href="https://wa.me/${WHATSAPP}" style="color:${C.dim};">WhatsApp</a>.${unsubLine}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ---------- Envío ----------

export async function sendEmail({ to, subject, html, text, replyTo, unsub, tags }) {
  const headers = unsub
    ? { 'List-Unsubscribe': `<${unsubUrl(unsub)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'ISO', email: env('EMAIL_FROM') },
      to: [{ email: to }],
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      subject,
      htmlContent: html,
      textContent: text,
      ...(headers ? { headers } : {}),
      ...(tags ? { tags } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}
