// Todo lo que comparten el carrito, la preventa y la tienda a la hora de cobrar.
import { PRESALE } from "../data/isolation-drop";

export type Payment = "tarjeta" | "bizum" | "paypal" | "contrarreembolso";

export const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
export const SB_HEADERS = {
  apikey: SUPABASE_ANON_KEY ?? "",
  Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ""}`,
  "Content-Type": "application/json",
};

export const WHATSAPP = "34690342138";
// La opción de tarjeta solo aparece cuando Stripe está configurado (PUBLIC_STRIPE_ENABLED=1 en Netlify)
export const STRIPE_ENABLED = import.meta.env.PUBLIC_STRIPE_ENABLED === "1";
export const PAYPAL_URL = "https://www.paypal.biz/isoweares";
export const BIZUM_PHONE = PRESALE.bizumPhone; // único sitio donde va el teléfono del Bizum
export const SHIPPING_CENTS = PRESALE.shippingCents;
export const MAX_PER_ITEM = 5;

export const PAY_LABEL: Record<Payment, string> = { tarjeta: "tarjeta / Apple Pay", bizum: "Bizum", paypal: "PayPal", contrarreembolso: "contrarreembolso" };

export const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
// Santander (municipio): CP 39001–39012 → envío gratis
export const isSantander = (cp: string) => /^390(0[1-9]|1[0-2])$/.test(cp.trim());
export const shippingFor = (cp: string) => (cp.trim().length === 5 && !isSantander(cp) ? SHIPPING_CENTS : 0);
export const prettyPhone = (p: string) => p.replace(/\D/g, "").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
export const isPresaleId = (id: string) => id.startsWith("isolation-");
export const isDemo = () => typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

export const ORDER_ERRORS: Record<string, string> = {
  not_open: "La preventa todavía no está abierta. Abre el 14 de diciembre a las 00:00.",
  closed: "La preventa ya ha cerrado.",
  stock: "Se han agotado las unidades de una prenda de tu carrito. Baja la cantidad e inténtalo de nuevo.",
  customer: "Revisa tus datos: falta alguno o el email no es válido.",
  size: "Hay una talla que no está disponible para esa prenda.",
  product: "Hay una prenda que ya no está a la venta.",
  qty: `Máximo ${MAX_PER_ITEM} unidades por prenda de la preventa.`,
};
