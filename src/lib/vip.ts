// Lista prioritaria: quien entra con el enlace personal del correo ve (y paga) el precio de lista
// durante las primeras horas de la preventa. El precio de verdad lo decide la base de datos
// (public.place_order comprueba la firma); esto solo es para enseñarlo bien en la web.
import { PRESALE } from "../data/isolation-drop";

export const VIP_HOURS = 24;
export const VIP_DISCOUNT_CENTS = 500;
const KEY = "iso_vip";

type Vip = { e: string; t: string };

// Guarda el enlace personal (?vip=email-en-base64.firma) para el resto de la visita y del día
export function captureVip() {
  try {
    const q = new URLSearchParams(location.search).get("vip");
    if (!q) return;
    const [e64, t] = q.split(".");
    const e = atob(e64.replace(/-/g, "+").replace(/_/g, "/"));
    if (e.includes("@") && /^[0-9a-f]{32}$/.test(t)) localStorage.setItem(KEY, JSON.stringify({ e, t }));
  } catch {}
}

function stored(): Vip | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && v.e && v.t ? v : null;
  } catch {
    return null;
  }
}

export function vipWindow(now = Date.now()) {
  const open = Date.parse(PRESALE.open);
  return now >= open && now < open + VIP_HOURS * 3600e3;
}

// Lo que se manda al hacer el pedido (null fuera de plazo o sin enlace)
export function vipParam(): Vip | null {
  if (typeof window === "undefined" || !vipWindow()) return null;
  return stored();
}
export const vipActive = () => !!vipParam();

const isDrop = (id: string) => id.startsWith("isolation-");
export const listPrice = (id: string, cents: number) => (isDrop(id) && vipActive() ? Math.max(cents - VIP_DISCOUNT_CENTS, 0) : cents);
