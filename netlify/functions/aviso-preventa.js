// Netlify Scheduled Function: cada 10 minutos comprueba si la preventa ya ha
// abierto y, si es así, manda el correo a los apuntados que aún no lo tienen.
// Antes de la apertura y después del cierre no hace nada.
// Si una tanda falla o se corta, la siguiente ejecución sigue donde se quedó.

import { presaleIsOpen, sendPending } from '../lib/presale-mail.js';

export default async () => {
  if (!presaleIsOpen()) return new Response('fuera de plazo');
  try {
    const r = await sendPending();
    if (r.candidates) console.log('Aviso preventa:', r);
    return new Response(JSON.stringify(r));
  } catch (e) {
    console.error('Aviso preventa: error', e);
    return new Response('error', { status: 500 });
  }
};

export const config = { schedule: '*/10 * * * *' };
