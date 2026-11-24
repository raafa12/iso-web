// Correos de pedido: confirmación al cliente y aviso para ISO.

import { SITE, WHATSAPP, BIZUM_PHONE, PAYPAL_URL, C, F, layout, sendEmail, p, b, box, esc, eur, prettyPhone, env } from './email.js';

const PAY = { bizum: 'Bizum', paypal: 'PayPal', contrarreembolso: 'Contrarreembolso', tarjeta: 'Tarjeta / Apple Pay' };

function itemsTable(order) {
  const rows = (order.items || [])
    .map(
      (it) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${F.body};font-size:15px;color:${C.text};">
  ${esc(it.name)}<br><span style="font-size:13px;color:${C.dim};">Talla ${esc(it.size)} · x${it.qty}${it.presale ? ' · Preventa' : ''}</span></td>
<td align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${F.body};font-size:15px;color:${C.text};white-space:nowrap;">${eur(it.price_cents * it.qty)}</td>
</tr>`
    )
    .join('');
  const line = (label, value, strong = false) => `<tr>
<td style="padding:${strong ? '14px' : '8px'} 0 0;font-family:${strong ? F.display : F.body};font-size:${strong ? 18 : 14}px;${strong ? 'font-style:italic;text-transform:uppercase;' : ''}color:${strong ? C.text : C.soft};">${label}</td>
<td align="right" style="padding:${strong ? '14px' : '8px'} 0 0;font-family:${strong ? F.display : F.body};font-size:${strong ? 18 : 14}px;color:${strong ? C.text : C.soft};">${value}</td></tr>`;
  const subtotal = order.total_cents - order.shipping_cents;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">${rows}
${line('Subtotal', eur(subtotal))}${line('Envío', order.shipping_cents ? eur(order.shipping_cents) : 'Gratis')}${line('Total', eur(order.total_cents), true)}</table>`;
}

function howToPay(order) {
  const total = eur(order.total_cents);
  if (order.payment === 'bizum') {
    return BIZUM_PHONE
      ? `Haz un ${b(`Bizum de ${total}`)} al ${b(prettyPhone(BIZUM_PHONE))} con el concepto ${b(order.code)}. Tu pedido queda reservado 24 horas mientras se completa el pago.`
      : `En breve te mandamos el número para hacer el ${b(`Bizum de ${total}`)} con el concepto ${b(order.code)}. Tu pedido queda reservado 24 horas mientras se completa el pago.`;
  }
  if (order.payment === 'paypal') {
    return `Paga ${b(total)} en nuestro <a href="${PAYPAL_URL}" style="color:${C.accent};font-weight:bold;">PayPal (paypal.biz/isoweares)</a> y pon ${b(order.code)} en la nota del pago. Tu pedido queda reservado 24 horas mientras se completa el pago.`;
  }
  if (order.payment === 'tarjeta') return `${b(`Pagado: ${total}`)} con tarjeta. No tienes que hacer nada más.`;
  return `Pagas ${b(total)} en efectivo cuando te llegue el pedido.`;
}

export function renderCustomer(order) {
  const first = String(order.name || '').trim().split(/\s+/)[0];
  const paid = order.status === 'pagado';
  const subject = `Pedido ${order.code} ${paid ? 'confirmado' : 'recibido'}`;
  const presale = order.has_presale
    ? p(`Las prendas de ${b('preventa')} se preparan al cerrar la preventa y te avisamos por correo cuando salgan.`)
    : p('Te avisamos por correo cuando salga tu pedido.');
  const body =
    p(`${first ? `${esc(first)}, gracias` : 'Gracias'} por tu pedido. Aquí tienes el resumen.`) +
    itemsTable(order) +
    box(`<span style="font-family:${F.body};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.accent};font-weight:bold;">Pago · ${PAY[order.payment] || order.payment}</span><br><br>${howToPay(order)}`) +
    box(`<span style="font-family:${F.body};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.accent};font-weight:bold;">Envío</span><br><br>
${esc(order.name)}<br>${esc(order.address)}<br>${esc(order.postal_code)} ${esc(order.city)}${order.notes ? `<br><span style="color:${C.dim};">${esc(order.notes)}</span>` : ''}`) +
    presale;

  const text = [
    `Pedido ${order.code} recibido`,
    '',
    ...(order.items || []).map((it) => `- ${it.name} · talla ${it.size} · x${it.qty} · ${eur(it.price_cents * it.qty)}`),
    `Envío: ${order.shipping_cents ? eur(order.shipping_cents) : 'gratis'}`,
    `Total: ${eur(order.total_cents)}`,
    '',
    `Pago: ${PAY[order.payment] || order.payment}`,
    howToPay(order).replace(/<[^>]+>/g, ''),
    '',
    `Envío a: ${order.name}, ${order.address}, ${order.postal_code} ${order.city}`,
  ].join('\n');

  return {
    subject,
    text,
    html: layout({ subject, preheader: `Total ${eur(order.total_cents)} · ${PAY[order.payment] || ''}`, kicker: paid ? 'Pedido confirmado' : 'Pedido recibido', title: esc(order.code), body }),
  };
}

export function renderOwner(order) {
  const subject = `Nuevo pedido ${order.code} · ${eur(order.total_cents)} · ${PAY[order.payment] || order.payment}`;
  const wa = order.phone ? `https://wa.me/${String(order.phone).replace(/\D/g, '').replace(/^(?!34)(\d{9})$/, '34$1')}` : null;
  const body =
    itemsTable(order) +
    box(`${b(esc(order.name))}<br>${esc(order.email)}${order.phone ? `<br>${esc(order.phone)}` : ''}<br><br>
${esc(order.address)}<br>${esc(order.postal_code)} ${esc(order.city)}${order.notes ? `<br><br>Notas: ${esc(order.notes)}` : ''}`) +
    p(`Pago: ${b(PAY[order.payment] || order.payment)} · Estado: ${b(order.status || 'pendiente')}${order.has_presale ? ' · Incluye preventa' : ''}`) +
    (wa ? p(`<a href="${wa}" style="color:${C.accent};">Escribirle por WhatsApp</a>`) : '') +
    p(`Para marcarlo como pagado: Supabase → Table Editor → orders → ${esc(order.code)} → status = pagado.`, `font-size:13px;color:${C.dim};`);
  const text = `${subject}\n${order.name} · ${order.email} · ${order.phone || ''}\n${order.address}, ${order.postal_code} ${order.city}\n` +
    (order.items || []).map((it) => `- ${it.name} · ${it.size} · x${it.qty}`).join('\n');
  return { subject, text, html: layout({ subject, kicker: 'Nuevo pedido', title: esc(order.code), body, footer: `Pedido hecho en ${SITE}` }) };
}

export async function sendOrderEmails(order) {
  const c = renderCustomer(order);
  const o = renderOwner(order);
  const results = await Promise.allSettled([
    sendEmail({ to: order.email, subject: c.subject, html: c.html, text: c.text, tags: ['pedido'] }),
    sendEmail({ to: env('ORDERS_EMAIL', process.env.EMAIL_FROM), subject: o.subject, html: o.html, text: o.text, replyTo: order.email, tags: ['pedido-aviso'] }),
  ]);
  return { customer: results[0].status, owner: results[1].status, errors: results.filter((r) => r.status === 'rejected').map((r) => String(r.reason)) };
}

export { WHATSAPP };

// ---------- Cambios de estado (los manda el panel /pedidos) ----------

const STATUS_MAIL = {
  pagado: (o) => ({
    subject: `Pago recibido · ${o.code}`,
    kicker: 'Pago recibido',
    title: 'Pagado.',
    body:
      p(`${hi(o)}hemos recibido tu pago de ${b(eur(o.total_cents))}. Tu pedido ${b(o.code)} está confirmado.`) +
      p(o.has_presale
        ? `Las prendas de ${b('preventa')} se preparan al cerrar la preventa. Te escribimos cuando salgan.`
        : 'Lo preparamos y te escribimos cuando salga.'),
  }),
  enviado: (o) => ({
    subject: `Tu pedido ${o.code} va en camino`,
    kicker: 'Pedido enviado',
    title: 'En camino.',
    body:
      p(`${hi(o)}tu pedido ${b(o.code)} ya ha salido hacia ${b(`${esc(o.address)}, ${esc(o.postal_code)} ${esc(o.city)}`)}.`) +
      (o.tracking
        ? box(`<span style="font-family:${F.body};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.accent};font-weight:bold;">Seguimiento</span><br><br>${
            /^https?:\/\//.test(o.tracking) ? `<a href="${esc(o.tracking)}" style="color:${C.text};">${esc(o.tracking)}</a>` : b(esc(o.tracking))
          }`)
        : '') +
      (o.payment === 'contrarreembolso' ? p(`Recuerda tener ${b(eur(o.total_cents))} en efectivo para cuando llegue.`) : '') +
      p('Gracias por apoyar a ISO. Si lo subes a redes, etiquétanos en @isowear_.'),
  }),
  cancelado: (o) => ({
    subject: `Pedido ${o.code} cancelado`,
    kicker: 'Pedido cancelado',
    title: 'Cancelado.',
    body:
      p(`${hi(o)}hemos cancelado tu pedido ${b(o.code)}${o.payment !== 'contrarreembolso' ? ' porque no nos ha llegado el pago' : ''}.`) +
      p('Si crees que es un error o ya habías pagado, responde a este correo y lo arreglamos.'),
  }),
  recordatorio: (o) => ({
    subject: `Tu pedido ${o.code} está pendiente de pago`,
    kicker: 'Pendiente de pago',
    title: 'Falta el pago.',
    body:
      p(`${hi(o)}tu pedido ${b(o.code)} sigue reservado, pero aún no nos ha llegado el pago. Si no lo recibimos en las próximas horas, se cancela y las unidades vuelven a estar disponibles.`) +
      box(howToPay(o)),
  }),
};

function hi(o) {
  const first = String(o.name || '').trim().split(/\s+/)[0];
  return first ? `${esc(first)}, ` : '';
}

export async function sendStatusEmail(order, kind) {
  const make = STATUS_MAIL[kind];
  if (!make) return 'sin-correo';
  const m = make(order);
  // "hi" va en minúscula tras el nombre; sin nombre, primera letra en mayúscula
  const body = m.body.replace(/(<p[^>]*>)([a-záéíóú])/, (_, tag, ch) => (hi(order) ? tag + ch : tag + ch.toUpperCase()));
  const html = layout({ subject: m.subject, preheader: m.subject, kicker: m.kicker, title: m.title, body });
  const text = `${m.subject}\n\n${body.replace(/<[^>]+>/g, '').replace(/\s+\n/g, '\n')}`;
  await sendEmail({ to: order.email, subject: m.subject, html, text, tags: [`pedido-${kind}`] });
  return 'enviado';
}
