// Correo de bienvenida al apuntarse (aviso de la preventa o lista prioritaria).

import { SITE, layout, sendEmail, p, b, box, button, dropImage, esc } from './email.js';
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
    // Antes de abrir no se enseñan los diseños (en la web también están tapados)
    subject = 'Estás dentro. Tienes prioridad 🏀';
    kicker = 'Lista prioritaria · Drop 001';
    title = 'Buena jugada.';
    const item = (t) => `<tr><td style="padding:0 10px 10px 0;vertical-align:top;color:#7ec8e3;font-weight:bold;">&#9679;</td><td style="padding:0 0 10px;">${t}</td></tr>`;
    body =
      p(`${hi ? `${hi}acabas` : 'Acabas'} de hacer lo que hacen los que saben: apuntarte ${b('antes que nadie')}. Ya estás en la lista prioritaria de ${b('Isolation')}, el Drop 001 de ISO.`) +
      p(`Mientras el resto sigue calentando en el banquillo, tú ya estás en pista.`) +
      box(`<table role="presentation" cellpadding="0" cellspacing="0">
        ${item(`${b('Prioridad.')} El ${b(open)} te llega el enlace directo a este correo, sin esperar a que lo subamos a redes.`)}
        ${item(`${b('Unidades limitadas.')} 4 modelos y pocas unidades de cada uno. Cuando se acaban, no vuelven.`)}
        ${item(`${b('Envío gratis')} en Santander.`)}
      </table>`) +
      p(`Hasta entonces los diseños siguen tapados. Ni a nuestras madres se los hemos enseñado. Tú serás de los primeros en verlos.`) +
      button('Ver la cuenta atrás', link) +
      p(`Gracias por estar desde el principio. Esto va de gente como tú.<br>${b('Call for an ISO.')}`, 'margin-top:24px;');
    text = `Estás dentro. Tienes prioridad.\nYa estás en la lista prioritaria de Isolation, el Drop 001 de ISO.\n\n- Prioridad: el ${open} te llega el enlace directo a este correo.\n- Unidades limitadas: 4 modelos y pocas unidades de cada uno.\n- Envío gratis en Santander.\n\nHasta entonces los diseños siguen tapados.\n\nCuenta atrás: ${link}\n\nCall for an ISO.`;
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
      (presaleOpen ? dropImage(link) + button('Ir a la preventa', link) : presaleSoon ? button('Ver la cuenta atrás', link) : button('Ver la web', SITE));
    text = `Estás dentro.\nTe escribimos antes que a nadie cuando saquemos algo nuevo.\n\n${link}`;
  }

  return { subject, html: layout({ subject, preheader: text.split('\n')[1] || '', kicker, title, body, unsub: email }), text };
}

export async function sendWelcome(args) {
  const { subject, html, text } = renderWelcome(args);
  await sendEmail({ to: args.email, subject, html, text, unsub: args.email, tags: ['bienvenida'] });
}
