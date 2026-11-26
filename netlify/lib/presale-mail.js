// Correo "La preventa está abierta" + envío a toda la lista.

import { createHmac } from 'node:crypto';
import { SITE, sb, layout, sendEmail, p, b, button, dropImage } from './email.js';

// ---------- Lista prioritaria: enlace personal con precio de lista ----------
// La firma es la misma que comprueba la base de datos (public.vip_ok): HMAC-SHA256 del email con vip_secret.
let vipCfg = null;
async function vipConfig() {
  if (vipCfg) return vipCfg;
  const { url, headers } = sb();
  const r = await fetch(`${url}/rest/v1/presale_config?id=eq.1&select=vip_secret,vip_hours,vip_discount_cents`, { headers });
  const [c] = r.ok ? await r.json() : [];
  vipCfg = c && c.vip_secret ? c : { vip_secret: null, vip_hours: 24, vip_discount_cents: 500 };
  return vipCfg;
}
export async function vipLink(email) {
  const c = await vipConfig();
  if (!c.vip_secret) return null;
  const em = email.trim().toLowerCase();
  const t = createHmac('sha256', c.vip_secret).update(em).digest('hex').slice(0, 32);
  return `${SITE}/preventa?vip=${Buffer.from(em).toString('base64url')}.${t}&utm_source=email&utm_medium=aviso&utm_campaign=isolation`;
}

// Mantener igual que PRESALE en src/data/isolation-drop.ts
export const PRESALE_OPEN = process.env.PRESALE_OPEN || '2026-12-14T00:00:00+01:00';
export const PRESALE_CLOSE = process.env.PRESALE_CLOSE || '2026-12-20T23:59:59+01:00';

const SUBJECT = 'La preventa de Isolation está abierta';

const fmtClose = () =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(new Date(PRESALE_CLOSE)).replace(',', ' a las');

export function renderEmail(email, vip = null) {
  const link = vip || `${SITE}/preventa?utm_source=email&utm_medium=aviso&utm_campaign=isolation`;
  const close = fmtClose();
  const html = layout({
    subject: SUBJECT,
    preheader: `4 modelos · unidades limitadas · hasta el ${close}`,
    kicker: 'Drop 001 · Preventa abierta',
    title: 'Isolation.',
    unsub: email,
    footer: 'Envío gratis en Santander · Diseñado en Santander',
    body:
      (vip
        ? p(`Eres de la lista. Con este enlace tienes ${b('precio de lista')} hasta mañana a las 00:00:`) +
          p(`Camisetas <s style="color:#7a766f;">24,99 €</s> ${b('19,99 €')} · Sudadera <s style="color:#7a766f;">39,99 €</s> ${b('34,99 €')}`) +
          p(`El enlace es tuyo. No lo compartas.`, 'font-size:13px;')
        : p(`Ya puedes reservar el primer drop de ISO: ${b('4 modelos')}, ${b('unidades limitadas')}. La preventa cierra el ${b(close)} o cuando se acaben.`)) +
      dropImage(link) +
      button(vip ? 'Entrar con mi precio' : 'Ir a la preventa', link),
  });
  const text = `ISOLATION. — Drop 001 de ISO
La preventa está abierta: 4 modelos, unidades limitadas.
${vip ? 'Eres de la lista: con tu enlace, camisetas a 19,99 € (24,99 €) y sudadera a 34,99 € (39,99 €) hasta mañana a las 00:00.\n' : ''}Cierra el ${close} o cuando se acaben.

Ir a la preventa: ${link}

Envío gratis en Santander.`;
  return { subject: SUBJECT, html, text };
}

export async function sendOne(email) {
  const { subject, html, text } = renderEmail(email, await vipLink(email).catch(() => null));
  await sendEmail({ to: email, subject, html, text, unsub: email, tags: ['preventa-isolation'] });
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
// Cada fila se marca con notified_at, así que se puede ejecutar las veces
// que haga falta sin mandar nada dos veces.
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
