import { useEffect, useRef, useState } from "react";
import { SizeGuideModal } from "./ProductsReact.tsx";
import "./presale.css";

// Prenda de la preventa (las fotos que no existen llegan a null desde la página)
export interface PresaleItem {
  id: string;
  num: string;
  name: string;
  category: string;
  price_cents: number;
  sizes: string[];
  description: string;
  front: string | null;
  back: string | null;
  cover?: "front" | "back"; // qué cara se ve primero
}

interface Props {
  items: PresaleItem[];
  opensAt: string;
  closesAt: string;
}

type Phase = "soon" | "open" | "closed";
type Step = "product" | "checkout" | "done";
type Payment = "bizum" | "contrarreembolso";

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
const SB_HEADERS = { apikey: SUPABASE_ANON_KEY ?? "", Authorization: `Bearer ${SUPABASE_ANON_KEY ?? ""}`, "Content-Type": "application/json" };
// Teléfono al que se hace el Bizum y al que se avisa por WhatsApp
const BIZUM_PHONE = "690 342 138";
const WHATSAPP = "34690342138";
const LOW_STOCK = 10; // a partir de aquí se avisa de que quedan pocas

interface Customer {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postal_code: string;
  notes: string;
}
const EMPTY_CUSTOMER: Customer = { name: "", phone: "", email: "", address: "", city: "", postal_code: "", notes: "" };

interface OrderResult {
  code: string;
  total_cents: number;
  payment: Payment;
  lines: { name: string; size: string; qty: number }[];
}

const ERRORS: Record<string, string> = {
  not_open: "La preventa todavía no está abierta. Abre el 13 de diciembre a las 20:00.",
  closed: "La preventa ya ha cerrado.",
  stock: "Justo se han agotado las unidades que pedías. Prueba con menos cantidad.",
  customer: "Faltan datos de envío.",
};

const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

function firstSide(p: PresaleItem): "front" | "back" {
  if (p.cover === "front" && p.front) return "front";
  return p.back ? "back" : "front";
}

function phaseAt(now: number, open: number, close: number): Phase {
  if (now < open) return "soon";
  if (now >= close) return "closed";
  return "open";
}

export default function PresaleReact({ items, opensAt, closesAt }: Props) {
  const open = Date.parse(opensAt);
  const close = Date.parse(closesAt);
  const [phase, setPhase] = useState<Phase>("soon");
  const [current, setCurrent] = useState<number | null>(null);
  const [side, setSide] = useState<"front" | "back">("back");
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [stock, setStock] = useState<Record<string, number> | null>(null);
  const [step, setStep] = useState<Step>("product");
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [payment, setPayment] = useState<Payment>("bizum");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [shown, setShown] = useState<boolean[]>(() => items.map(() => false));
  const listRef = useRef<HTMLUListElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Fase de la preventa (en el navegador; ?abierta en la URL la simula abierta para probar)
  useEffect(() => {
    const force = new URLSearchParams(location.search).has("abierta");
    const update = () => setPhase(force ? "open" : phaseAt(Date.now(), open, close));
    update();
    const id = window.setInterval(update, 15000);
    return () => window.clearInterval(id);
  }, [open, close]);

  // Stock en directo (Supabase): se refresca cada 20 s y al volver a la pestaña
  const loadStock = async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/presale_stock?select=product_id,stock`, { headers: SB_HEADERS });
      if (!res.ok) return;
      const rows: { product_id: string; stock: number }[] = await res.json();
      setStock(Object.fromEntries(rows.map((r) => [r.product_id, r.stock])));
    } catch {
      /* sin conexión: no se muestra el contador */
    }
  };
  useEffect(() => {
    loadStock();
    const id = window.setInterval(loadStock, 20000);
    const onFocus = () => loadStock();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  const left = (id: string) => (stock && id in stock ? stock[id] : null);

  // Aparecen al bajar
  useEffect(() => {
    const lis = Array.from(listRef.current?.children ?? []);
    if (!("IntersectionObserver" in window)) return setShown(items.map(() => true));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const i = lis.indexOf(e.target);
          setShown((s) => s.map((v, j) => v || j === i));
          io.unobserve(e.target);
        }),
      { threshold: 0.2 },
    );
    lis.forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, [items]);

  const item = current != null ? items[current] : null;

  function openItem(i: number, e: React.MouseEvent<HTMLElement>, presetSize: string | null = null) {
    returnFocus.current = e.currentTarget;
    setCurrent(i);
    setSide(firstSide(items[i]));
    setSize(presetSize);
    setQty(1);
    setAdded(false);
    setStep("product");
    setError(null);
  }
  function closeItem() {
    setCurrent(null);
    setStep("product");
    setError(null);
    setResult(null);
    setGuideOpen(false);
    returnFocus.current?.focus();
  }
  function go(d: number) {
    if (current == null) return;
    const n = (current + d + items.length) % items.length;
    setCurrent(n);
    setSide(firstSide(items[n]));
    setSize(null);
    setQty(1);
    setAdded(false);
    setStep("product");
    setError(null);
  }

  // Teclado, scroll del fondo y foco
  useEffect(() => {
    if (current == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (guideOpen) return;
      if (e.key === "Escape") closeItem();
      if (step !== "product") return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [current, guideOpen, step]);

  function preorder() {
    if (!item || !size || phase !== "open") return;
    setError(null);
    setStep("checkout");
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !size || sending) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("No se ha podido conectar. Escríbenos por WhatsApp y te lo reservamos.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/place_presale_order`, {
        method: "POST",
        headers: SB_HEADERS,
        body: JSON.stringify({
          p_items: [{ product_id: item.id, size, qty }],
          p_customer: customer,
          p_payment: payment,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(ERRORS[data?.error] ?? "No se ha podido hacer el pedido. Inténtalo de nuevo o escríbenos por WhatsApp.");
        loadStock();
        return;
      }
      setResult({ code: data.code, total_cents: data.total_cents, payment, lines: [{ name: item.name, size, qty }] });
      setStep("done");
      loadStock();
    } catch {
      setError("No se ha podido conectar. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  const waMessage = (r: OrderResult) =>
    `Hola! Acabo de hacer el pedido ${r.code} de la preventa Isolation:\n` +
    r.lines.map((l) => `• ${l.name} (talla ${l.size}) x${l.qty}`).join("\n") +
    `\nTotal: ${eur(r.total_cents)} · Pago: ${r.payment === "bizum" ? "Bizum" : "contrarreembolso"}\nNombre: ${customer.name}`;

  // Deslizar en la foto: cambia de prenda; tocar: le da la vuelta
  const swipe = useRef<{ x: number; y: number } | null>(null);
  function onDown(e: React.PointerEvent) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }
  function onUp(e: React.PointerEvent) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !item) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && item.front && item.back) setSide((v) => (v === "front" ? "back" : "front"));
  }

  const itemLeft = item ? left(item.id) : null;
  const soldOut = itemLeft === 0;
  const maxQty = Math.max(1, Math.min(5, itemLeft ?? 5));
  const ctaText = (() => {
    if (soldOut) return "Agotado";
    if (phase === "soon") return "Abre el 13 dic · 20:00";
    if (phase === "closed") return "Preventa cerrada";
    if (!size) return "Elige tu talla";
    return `Precomprar · ${eur(item!.price_cents * qty)}`;
  })();

  return (
    <>
      <ul className="ps-grid" ref={listRef}>
        {items.map((p, i) => (
          <li key={p.id} className={`ps-item${shown[i] ? " is-in" : ""}`} style={{ transitionDelay: `${i * 0.08}s` }}>
            <Card item={p} left={left(p.id)} onOpen={(e, sz) => openItem(i, e, sz)} />
          </li>
        ))}
      </ul>

      {item && (
        <div
          className="ps-modal"
          role="dialog"
          aria-modal="true"
          aria-label={item.name}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeItem();
          }}
        >
          <div className="ps-sheet">
            <button type="button" className="ps-close" ref={closeBtn} onClick={closeItem} aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="ps-media" onPointerDown={onDown} onPointerUp={onUp}>
              {item.front || item.back ? (
                <div className={`ps-flip${side === "back" ? " show-back" : ""}`}>
                  {item.front && <img className="ps-face" src={item.front} alt={`${item.name}, delante`} draggable={false} />}
                  {item.back && <img className={`ps-face back${item.front ? "" : " only"}`} src={item.back} alt={`${item.name}, detrás`} draggable={false} />}
                </div>
              ) : (
                <div className="ps-nophoto">
                  <img src="/logo-white-nav.png" alt="" />
                  <span>Foto pronto</span>
                </div>
              )}
              {item.front && item.back && (
                <div className="ps-toggle" role="group" aria-label="Ver la prenda">
                  <button type="button" aria-pressed={side === "front"} className={side === "front" ? "on" : ""} onClick={() => setSide("front")}>Delante</button>
                  <button type="button" aria-pressed={side === "back"} className={side === "back" ? "on" : ""} onClick={() => setSide("back")}>Detrás</button>
                </div>
              )}
              <button type="button" className="ps-nav prev" onClick={() => go(-1)} aria-label="Prenda anterior">←</button>
              <button type="button" className="ps-nav next" onClick={() => go(1)} aria-label="Prenda siguiente">→</button>
            </div>

            <div className="ps-info">
              {step === "product" && (
                <>
              <p className="ps-kicker">
                <span className="ps-dot" aria-hidden="true" />
                Drop 001 · Isolation · Preventa
              </p>
              <h3 className="ps-title">{item.name}</h3>
              <p className="ps-desc">{item.description}</p>
              <p className="ps-big-price">
                {eur(item.price_cents)}
                {itemLeft != null && (
                  <span className={`ps-left${soldOut ? " out" : itemLeft <= LOW_STOCK ? " low" : ""}`}>
                    {soldOut ? "Agotado" : `Quedan ${itemLeft}`}
                  </span>
                )}
              </p>

              <div className="ps-field">
                <div className="ps-label">
                  <span>Talla</span>
                  <button type="button" className="ps-guide" onClick={() => setGuideOpen(true)}>Guía de tallas</button>
                </div>
                <div className="ps-sizes" role="group" aria-label="Elige tu talla">
                  {item.sizes.map((s) => (
                    <button key={s} type="button" aria-pressed={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ps-field">
                <div className="ps-label"><span>Cantidad</span></div>
                <div className="ps-qty">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Una menos" disabled={qty <= 1}>−</button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Una más" disabled={qty >= maxQty}>+</button>
                </div>
              </div>

              <button
                type="button"
                className={`ps-cta${phase === "open" && size && !soldOut ? " ready" : ""}`}
                disabled={phase !== "open" || !size || soldOut}
                onClick={preorder}
              >
                {ctaText}
              </button>

              <ul className="ps-notes">
                <li><b>1 semana</b> de preventa o hasta agotar existencias</li>
                <li><b>Envío gratis</b> en Santander</li>
                <li>Pagas por <b>Bizum</b> o <b>contrarreembolso</b></li>
              </ul>
                </>
              )}

              {step === "checkout" && (
                <form className="ps-checkout" onSubmit={submitOrder}>
                  <button type="button" className="ps-back" onClick={() => setStep("product")}>← Volver</button>
                  <p className="ps-kicker"><span className="ps-dot" aria-hidden="true" />Tu pedido</p>
                  <div className="ps-summary">
                    <span>{item.name} · {size} · x{qty}</span>
                    <b>{eur(item.price_cents * qty)}</b>
                  </div>

                  <div className="ps-form">
                    <label className="wide">Nombre y apellidos<input required autoComplete="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></label>
                    <label>Teléfono<input required type="tel" autoComplete="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></label>
                    <label><span>Email <i>(opcional)</i></span><input type="email" autoComplete="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></label>
                    <label className="wide">Dirección<input required autoComplete="street-address" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></label>
                    <label>Ciudad<input required autoComplete="address-level2" value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} /></label>
                    <label>Código postal<input required inputMode="numeric" autoComplete="postal-code" value={customer.postal_code} onChange={(e) => setCustomer({ ...customer, postal_code: e.target.value })} /></label>
                  </div>

                  <fieldset className="ps-pay">
                    <legend>Forma de pago</legend>
                    <label className={payment === "bizum" ? "on" : ""}>
                      <input type="radio" name="pay" checked={payment === "bizum"} onChange={() => setPayment("bizum")} />
                      <b>Bizum</b>
                      <span>Al confirmar te damos el número y el concepto.</span>
                    </label>
                    <label className={payment === "contrarreembolso" ? "on" : ""}>
                      <input type="radio" name="pay" checked={payment === "contrarreembolso"} onChange={() => setPayment("contrarreembolso")} />
                      <b>Contrarreembolso</b>
                      <span>Pagas en efectivo cuando te llega.</span>
                    </label>
                  </fieldset>

                  {error && <p className="ps-error" role="alert">{error}</p>}

                  <button type="submit" className="ps-cta ready" disabled={sending}>
                    {sending ? "Reservando…" : `Confirmar pedido · ${eur(item.price_cents * qty)}`}
                  </button>
                  <p className="ps-fine">Envío gratis en Santander. Fuera de Santander te confirmamos el envío por WhatsApp.</p>
                </form>
              )}

              {step === "done" && result && (
                <div className="ps-done">
                  <p className="ps-kicker"><span className="ps-dot" aria-hidden="true" />Pedido reservado</p>
                  <h3 className="ps-title">{result.code}</h3>
                  <p className="ps-desc">
                    {result.lines.map((l) => `${l.name} · ${l.size} · x${l.qty}`).join(", ")} — <b>{eur(result.total_cents)}</b>
                  </p>
                  {result.payment === "bizum" ? (
                    <div className="ps-howto">
                      <p>Haz un <b>Bizum de {eur(result.total_cents)}</b> al <b>{BIZUM_PHONE}</b> con el concepto <b>{result.code}</b>.</p>
                      <p>Tu prenda queda reservada 24 horas. Cuando nos llegue el Bizum, te confirmamos el pedido.</p>
                    </div>
                  ) : (
                    <div className="ps-howto">
                      <p>Pagas <b>{eur(result.total_cents)}</b> en efectivo cuando te llegue el pedido.</p>
                      <p>Te escribiremos para confirmar la dirección y la entrega.</p>
                    </div>
                  )}
                  <a className="ps-cta ready ps-wa" href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waMessage(result))}`} target="_blank" rel="noopener noreferrer">
                    Avisar por WhatsApp
                  </a>
                  <button type="button" className="ps-guide" onClick={closeItem}>Cerrar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SizeGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}

// ---- Tarjeta: al pasar el ratón cambia de foto (fundido + zoom suave) y aparecen las tallas ----
function Card({
  item: p,
  left,
  onOpen,
}: {
  item: PresaleItem;
  left: number | null;
  onOpen: (e: React.MouseEvent<HTMLElement>, size: string | null) => void;
}) {
  const first = p.cover === "front" ? p.front ?? p.back : p.back ?? p.front;
  const imgs = [first, first === p.front ? p.back : p.front].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const media = useRef<HTMLSpanElement>(null);

  function onMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || imgs.length < 3 || !media.current) return;
    const r = media.current.getBoundingClientRect();
    setIdx(Math.min(imgs.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * imgs.length))));
  }

  return (
    <div
      className={`ps-card${hover ? " is-hover" : ""}${left === 0 ? " is-out" : ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        setHover(true);
        if (imgs.length > 1) setIdx(1);
      }}
      onPointerMove={onMove}
      onPointerLeave={() => {
        setHover(false);
        setIdx(0);
      }}
    >
      <div className="ps-mediawrap">
      <button type="button" className="ps-open" onClick={(e) => onOpen(e, null)} aria-label={`${p.name}, ${eur(p.price_cents)}. Ver y precomprar`}>
        <span className="ps-thumb" ref={media}>
          {imgs.length ? (
            imgs.map((src, k) => (
              <img key={src} className={`ps-img${k === idx ? " on" : ""}`} src={src} alt="" loading="lazy" draggable={false} />
            ))
          ) : (
            <span className="ps-soon">Foto pronto</span>
          )}
          {imgs.length > 1 && (
            <span className="ps-dots" aria-hidden="true">
              {imgs.map((src, k) => <i key={src} className={k === idx ? "on" : ""} />)}
            </span>
          )}
        </span>
      </button>

      <div className="ps-quick" aria-label={`Tallas de ${p.name}`}>
        {p.sizes.map((sz) => (
          <button key={sz} type="button" onClick={(e) => onOpen(e, sz)} tabIndex={hover ? 0 : -1}>
            {sz}
          </button>
        ))}
      </div>
      </div>

      <button type="button" className="ps-meta-btn" onClick={(e) => onOpen(e, null)} tabIndex={-1} aria-hidden="true">
        <span className="ps-meta">
          <span className="ps-name">{p.name}</span>
          <span className="ps-price">{eur(p.price_cents)}</span>
        </span>
        <span className="ps-cat">
          {p.category} · Isolation
          {left != null && (
            <span className={`ps-stock${left === 0 ? " out" : left <= LOW_STOCK ? " low" : ""}`}>
              {left === 0 ? "Agotado" : `Quedan ${left}`}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
