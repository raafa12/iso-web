// Correo de bienvenida al apuntarse (aviso de la preventa o lista prioritaria).

import { SITE, layout, sendEmail, p, b, button, dropImage, esc } from './email.js';
import { PRESALE_OPEN, PRESALE_CLOSE } from './presale-mail.js';

const fmt = (iso) =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  }).format(new Date(iso)).replace(',', ' a las');

export function renderWelcome({ email, name = '', source = 'web', now = Date.now() }) {
  const first = String(name).trim().split(/\s+/)[0];
  const hi = first ? `${esc(first)}, ` : '';
  const open = fmt(PRESALE_OPEN);
  const presaleSoon = now < Date.parse(PRESALE_OPEN);
  const presaleOpen = !presaleSoon && now < Date.parse(PRESALE_CLOSE);
  const link = `${SITE}/preventa?utm_source=email&utm_medium=bienvenida`;

  let subject, kicker, title, body, text;

  if (source.startsWith('preventa')) {
    subject = 'Te avisamos cuando abra la preventa';
    kicker = 'Estás en la lista';
    title = 'Te avisamos.';
    body =
      p(`${hi ? `${hi}la` : 'La'} preventa de ${b('Isolation')}, el primer drop de ISO, abre el ${b(open)}. En cuanto abra te llega un correo con el enlace directo.`) +
      p(`${b('4 modelos')}, ${b('unidades limitadas')}. Cuando se acaban, se acaban.`) +
      dropImage(link) +
      button('Ver los diseños', link);
    text = `Estás en la lista.\nLa preventa de Isolation abre el ${open}. Te mandamos un correo en cuanto abra.\n4 modelos, unidades limitadas.\n\nVer los diseños: ${link}`;
  } else {
    subject = 'Estás dentro · Acceso prioritario ISO';
    kicker = 'Acceso prioritario';
    title = 'Estás dentro.';
    const drop = presaleSoon
      ? p(`El primero es ${b('Isolation')}: la preventa abre el ${b(open)} y te avisamos en cuanto abra.`)
      : presaleOpen
        ? p(`Y no tienes que esperar: la preventa de ${b('Isolation')} ya está abierta, con unidades limitadas.`)
        : '';
    body =
      p(`${hi ? `${hi}gracias` : 'Gracias'} por apuntarte. Te escribimos ${b('antes que a nadie')} cada vez que saquemos algo nuevo: drops, preventas y eventos.`) +
      drop +
      (presaleSoon || presaleOpen ? dropImage(link) + button(presaleOpen ? 'Ir a la preventa' : 'Ver los diseños', link) : button('Ver la web', SITE));
    text = `Estás dentro.\nTe escribimos antes que a nadie cuando saquemos algo nuevo.\n\n${link}`;
  }

  return { subject, html: layout({ subject, preheader: text.split('\n')[1] || '', kicker, title, body, unsub: email }), text };
}

export async function sendWelcome(args) {
  const { subject, html, text } = renderWelcome(args);
  await sendEmail({ to: args.email, subject, html, text, unsub: args.email, tags: ['bienvenida'] });
}
