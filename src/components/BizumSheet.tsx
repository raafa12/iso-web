// Pagar una prenda con Bizum sin pasar por el carrito.
//   1) Datos de envío (se recuerdan para la próxima vez en este navegador)
//   2) "Haz tu Bizum": importe, número y concepto con botón de copiar, y los pasos
//   3) "Ya lo he hecho": confeti y confirmación
// Desde una web no se puede abrir Bizum directamente (cada banco tiene su app),
// así que se lo dejamos todo listo para copiar y pegar.
import { vipParam } from "../lib/vip";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./bizum.css";
import {
  BIZUM_PHONE,
  ORDER_ERRORS,
  SB_HEADERS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  WHATSAPP,
  eur,
  isDemo,
  prettyPhone,
  shippingFor,
} from "../lib/shop";

type Line = { id: string; name: string; size: string; price: number; image: string };
type Customer = { name: string; email: string; phone: string; address: string; city: string; postal_code: string };

const SAVED = "iso_customer";
const empty: Customer = { name: "", email: "", phone: "", address: "", city: "", postal_code: "" };

function loadSaved(): Customer {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(SAVED) || "{}") };
  } catch {
    return empty;
  }
}

export default function BizumSheet({ line, qty, onClose }: { line: Line; qty: number; onClose: () => void }) {
  const [step, setStep] = useState<"datos" | "pagar" | "hecho">("datos");
  const [c, setC] = useState<Customer>(loadSaved);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ code: string; total: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [shown, setShown] = useState(0); // importe animado
  const sheet = useRef<HTMLDivElement>(null);
  // Confeti: cada trozo con su posición, retraso, caída y giro al azar
  const confetti = useMemo(
    () =>
      Array.from({ length: 44 }, () => ({
        "--x": `${Math.random() * 100}%`,
        "--d": `${Math.random() * 0.5}s`,
        "--t": `${1.4 + Math.random() * 1.2}s`,
        "--dx": `${(Math.random() - 0.5) * 160}px`,
        "--r": `${(Math.random() - 0.5) * 900}deg`,
        "--y": `${360 + Math.random() * 200}px`,
      })),
    [],
  );

  const subtotal = line.price * qty;
  const shipping = shippingFor(c.postal_code);
  const total = subtotal + shipping;
  const set = (k: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });

  // Bloquea el scroll del fondo y cierra con Escape
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Cuenta del importe de 0 a total al llegar al paso de pagar
  useEffect(() => {
    if (step !== "pagar" || !order) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setShown(Math.round(order.total * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, order]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    try {
      localStorage.setItem(SAVED, JSON.stringify(c));
    } catch {}

    if (isDemo()) {
      setOrder({ code: "ISO-DEMO1", total });
      setStep("pagar");
      return;
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("No se ha podido conectar. Escríbenos por WhatsApp y te lo preparamos.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/place_order`, {
        method: "POST",
        headers: SB_HEADERS,
        body: JSON.stringify({
          p_items: [{ product_id: line.id, size: line.size, qty }],
          p_customer: c,
          p_payment: "bizum",
          ...(vipParam() ? { p_vip: vipParam() } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(ORDER_ERRORS[data?.error] ?? "No se ha podido hacer el pedido. Inténtalo de nuevo o escríbenos por WhatsApp.");
        return;
      }
      // Correo de confirmación al cliente + aviso a ISO
      fetch("/api/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.code }),
        keepalive: true,
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent("iso-order-placed"));
      setOrder({ code: data.code, total: data.total_cents });
      setStep("pagar");
      sheet.current?.scrollTo({ top: 0 });
    } catch {
      setError("No se ha podido conectar. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Safari antiguo: copia con un input temporal
      const i = document.createElement("input");
      i.value = text;
      document.body.appendChild(i);
      i.select();
      document.execCommand("copy");
      i.remove();
    }
    setCopied(what);
    if (navigator.vibrate) navigator.vibrate(15);
    window.setTimeout(() => setCopied((w) => (w === what ? null : w)), 1600);
  }

  const phone = BIZUM_PHONE.replace(/\D/g, "");
  const wa = order
    ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola! Ya he hecho el Bizum del pedido ${order.code} (${eur(order.total)})`)}`
    : "#";

  return createPortal(
    <div className="bz-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bz-sheet bz-${step}`} ref={sheet} role="dialog" aria-modal="true" aria-label="Pagar con Bizum">
        <button type="button" className="bz-close" onClick={onClose} aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <header className="bz-head">
          <span className="bz-logo">bizum</span>
          <div className="bz-steps" aria-hidden="true">
            <i className="on" />
            <i className={step !== "datos" ? "on" : ""} />
            <i className={step === "hecho" ? "on" : ""} />
          </div>
        </header>

        <div className="bz-item">
          <img src={line.image} alt="" />
          <div>
            <b>{line.name}</b>
            <span>
              Talla {line.size}
              {qty > 1 ? ` · x${qty}` : ""}
            </span>
          </div>
          <strong>{eur(subtotal)}</strong>
        </div>

        {step === "datos" && (
          <form className="bz-form" onSubmit={submit}>
            <p className="bz-lead">¿A dónde te lo mandamos?</p>
            <label className="wide">Nombre y apellidos<input required autoComplete="name" value={c.name} onChange={set("name")} /></label>
            <label className="wide">Email<input required type="email" autoComplete="email" value={c.email} onChange={set("email")} /></label>
            <label className="wide">Dirección<input required autoComplete="street-address" value={c.address} onChange={set("address")} /></label>
            <label>Código postal<input required inputMode="numeric" pattern="[0-9]{5}" autoComplete="postal-code" value={c.postal_code} onChange={set("postal_code")} /></label>
            <label>Ciudad<input required autoComplete="address-level2" value={c.city} onChange={set("city")} /></label>
            <label className="wide"><span>Teléfono <i>(opcional)</i></span><input type="tel" autoComplete="tel" value={c.phone} onChange={set("phone")} /></label>

            <div className="bz-totals">
              <span>Envío</span>
              <span>{c.postal_code.trim().length === 5 ? (shipping ? eur(shipping) : "Gratis en Santander") : "—"}</span>
              <b>Total</b>
              <b>{eur(total)}</b>
            </div>
            {error && <p className="bz-error">{error}</p>}
            <button type="submit" className="bz-cta" disabled={sending}>
              {sending ? <span className="bz-spin" /> : <>Continuar · {eur(total)}</>}
            </button>
          </form>
        )}

        {step === "pagar" && order && (
          <div className="bz-pay">
            <p className="bz-kicker">Pedido {order.code} reservado</p>
            <p className="bz-amount">{eur(shown)}</p>
            <p className="bz-lead">Haz el Bizum desde la app de tu banco</p>

            <button type="button" className={`bz-copy${copied === "tel" ? " ok" : ""}`} onClick={() => copy(phone, "tel")}>
              <span>Enviar a</span>
              <b>{prettyPhone(BIZUM_PHONE)}</b>
              <em>{copied === "tel" ? "¡Copiado!" : "Copiar"}</em>
            </button>
            <button type="button" className={`bz-copy${copied === "code" ? " ok" : ""}`} onClick={() => copy(order.code, "code")}>
              <span>Concepto</span>
              <b>{order.code}</b>
              <em>{copied === "code" ? "¡Copiado!" : "Copiar"}</em>
            </button>
            <button type="button" className={`bz-copy${copied === "amt" ? " ok" : ""}`} onClick={() => copy((order.total / 100).toFixed(2).replace(".", ","), "amt")}>
              <span>Importe</span>
              <b>{eur(order.total)}</b>
              <em>{copied === "amt" ? "¡Copiado!" : "Copiar"}</em>
            </button>

            <ol className="bz-how">
              <li><b>1</b><span>Abre la app de tu banco y entra en <strong>Bizum → Enviar dinero</strong></span></li>
              <li><b>2</b><span>Pega el número y el importe</span></li>
              <li><b>3</b><span>Pon <strong>{order.code}</strong> en el concepto y envía</span></li>
            </ol>

            <button type="button" className="bz-cta" onClick={() => setStep("hecho")}>
              Ya he hecho el Bizum
            </button>
            <p className="bz-note">Te hemos mandado el resumen al correo. Lo guardamos 24 h mientras llega el pago.</p>
          </div>
        )}

        {step === "hecho" && order && (
          <div className="bz-done">
            <div className="bz-confetti" aria-hidden="true">
              {confetti.map((st, i) => (
                <i key={i} style={st as React.CSSProperties} />
              ))}
            </div>
            <div className="bz-check" aria-hidden="true">
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27l7 7 15-16" />
              </svg>
            </div>
            <p className="bz-title">¡Gracias!</p>
            <p className="bz-lead">
              En cuanto nos llegue el Bizum te mandamos la confirmación del pedido <b>{order.code}</b> por correo.
            </p>
            <a className="bz-cta ghost" href={wa} target="_blank" rel="noopener noreferrer">
              Avisar por WhatsApp
            </a>
            <button type="button" className="bz-link" onClick={onClose}>
              Seguir mirando
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
