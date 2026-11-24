// Correo "La preventa está abierta" + envío a toda la lista.

import { SITE, sb, layout, sendEmail, p, b, button, dropImage } from './email.js';

// Mantener igual que PRESALE en src/data/isolation-drop.ts
export const PRESALE_OPEN = process.env.PRESALE_OPEN || '2026-12-14T00:00:00+01:00';
export const PRESALE_CLOSE = process.env.PRESALE_CLOSE || '2026-12-20T23:59:59+01:00';

const SUBJECT = 'La preventa de Isolation está abierta';

const fmtClose = () =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(new Date(PRESALE_CLOSE)).replace(',', ' a las');

export function renderEmail(email) {
  const link = `${SITE}/preventa?utm_source=email&utm_medium=aviso&utm_campaign=isolation`;
  const close = fmtClose();
  const html = layout({
    subject: SUBJECT,
    preheader: `4 modelos · unidades limitadas · hasta el ${close}`,
    kicker: 'Drop 001 · Preventa abierta',
    title: 'Isolation.',
    unsub: email,
    footer: 'Envío gratis en Santander · Diseñado en Santander',
    body:
      p(`Ya puedes reservar el primer drop de ISO: ${b('4 modelos')}, ${b('unidades limitadas')}. La preventa cierra el ${b(close)} o cuando se acaben.`) +
      dropImage(link) +
      button('Ir a la preventa', link),
  });
  const text = `ISOLATION. — Drop 001 de ISO
La preventa está abierta: 4 modelos, unidades limitadas.
Cierra el ${close} o cuando se acaben.

Ir a la preventa: ${link}

Envío gratis en Santander.`;
  return { subject: SUBJECT, html, text };
}

export async function sendOne(email) {
  const { subject, html, text } = renderEmail(email);
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
