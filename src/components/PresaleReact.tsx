import { useEffect, useRef, useState } from "react";
import { SizeGuideModal } from "./ProductsReact.tsx";
import "./presale.css";
import { SB_HEADERS, SUPABASE_ANON_KEY, SUPABASE_URL, eur } from "../lib/shop";

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
  bizumPhone?: string;
  shippingCents: number;
  unitsPerItem: number;
}

type Phase = "soon" | "open" | "closed";
const LOW_STOCK = 10; // a partir de aquí se avisa de que quedan pocas


function firstSide(p: PresaleItem): "front" | "back" {
  if (p.cover === "front" && p.front) return "front";
  return p.back ? "back" : "front";
}

function phaseAt(now: number, open: number, close: number): Phase {
  if (now < open) return "soon";
  if (now >= close) return "closed";
  return "open";
}

export default function PresaleReact({ items, opensAt, closesAt, shippingCents, unitsPerItem }: Props) {
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
  const [demo, setDemo] = useState(false);
  const [fingerOn, setFingerOn] = useState<string | null>(null);
  const [shown, setShown] = useState<boolean[]>(() => items.map(() => false));
  const listRef = useRef<HTMLUListElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Fase de la preventa (en el navegador; ?abierta en la URL la simula abierta para probar)
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const isDemo = qs.has("demo");
    setDemo(isDemo);
    if (isDemo) setStock(Object.fromEntries(items.map((p) => [p.id, 5]))); // simulación: quedan 5 de cada
    const force = isDemo || qs.has("abierta");
    const update = () => setPhase(force ? "open" : phaseAt(Date.now(), open, close));
    update();
    const id = window.setInterval(update, 15000);
    return () => window.clearInterval(id);
  }, [open, close]);

  // Stock en directo (Supabase): se refresca cada 20 s y al volver a la pestaña
  const loadStock = async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || new URLSearchParams(location.search).has("demo")) return;
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
    window.addEventListener("iso-order-placed", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("iso-order-placed", onFocus);
    };
  }, []);
  // Si todavía no hay datos de Supabase se muestran las unidades iniciales
  const left = (id: string) => (stock && id in stock ? stock[id] : unitsPerItem);

  // Móvil: la prenda que está bajo el dedo (también mientras se hace scroll pasando por encima)
  // enseña la otra cara; al levantar el dedo vuelven todas.
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) return;
    let raf = 0, lx = 0, ly = 0;
    // Menos saltos: una prenda tiene que estar bajo el dedo 180 ms para darse la vuelta,
    // y una vez girada se queda así al menos 900 ms aunque el dedo pase a otra.
    let shown: string | null = null, shownAt = 0, cand: string | null = null, candAt = 0;
    const pick = () => {
      raf = 0;
      const id = document.elementFromPoint(lx, ly)?.closest<HTMLElement>("[data-card]")?.dataset.card ?? null;
      const now = performance.now();
      if (id !== cand) {
        cand = id;
        candAt = now;
      }
      if (cand && cand !== shown && now - candAt > 180 && now - shownAt > 900) {
        shown = cand;
        shownAt = now;
        setFingerOn(shown);
      }
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      lx = t.clientX;
      ly = t.clientY;
      if (!raf) raf = requestAnimationFrame(pick);
    };
    // mientras el dedo esté quieto encima también cuenta el tiempo
    const tick = window.setInterval(() => cand && pick(), 100);
    const onEnd = () => {
      cand = null;
      const wait = Math.max(0, 900 - (performance.now() - shownAt));
      window.setTimeout(() => {
        if (cand) return;
        shown = null;
        setFingerOn(null);
      }, shown ? wait : 0);
    };
    document.addEventListener("touchstart", onTouch, { passive: true });
    document.addEventListener("touchmove", onTouch, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouch);
      document.removeEventListener("touchmove", onTouch);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      window.clearInterval(tick);
    };
  }, []);

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
  }
  function closeItem() {
    setCurrent(null);
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
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [current, guideOpen]);

  function preorder() {
    if (!item || !size || phase !== "open" || soldOut) return;
    window.ISOCart?.add(
      { id: item.id, name: `${item.name} · Preventa`, size, price: item.price_cents, image: item.front ?? item.back ?? "/logo-mark.png" },
      qty,
    );
    setAdded(true);
    window.setTimeout(() => {
      closeItem();
      window.ISOCart?.open();
    }, 650);
  }

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
    if (!item) return "";
    if (soldOut) return "Agotado";
    if (phase === "soon") return "Abre el 14 dic · 00:00";
    if (phase === "closed") return "Preventa cerrada";
    if (!size) return "Elige tu talla";
    if (added) return "Añadido ✓";
    return `Añadir al carrito · ${eur(item.price_cents * qty)}`;
  })();

  return (
    <>
      {phase === "soon" && <NotifyForm />}
      {demo && <p className="ps-demo">Vista de prueba: preventa abierta y 5 unidades por prenda. Los pedidos del carrito no se guardan.</p>}
      <ul className="ps-grid" ref={listRef}>
        {items.map((p, i) => (
          <li key={p.id} className={`ps-item${shown[i] ? " is-in" : ""}`} style={{ transitionDelay: `${i * 0.08}s` }}>
            <Card item={p} left={left(p.id)} flipped={fingerOn === p.id} onOpen={(e, sz) => openItem(i, e, sz)} />
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
                disabled={phase !== "open" || !size || soldOut || added}
                onClick={preorder}
              >
                {ctaText}
              </button>

              {phase === "soon" && <NotifyForm compact />}

              <ul className="ps-notes">
                <li><b>Unidades limitadas</b> por prenda, sin reposición</li>
                <li><b>1 semana</b> de preventa o hasta agotar existencias</li>
                <li><b>Envío gratis</b> en Santander · resto {eur(shippingCents)}</li>
                <li>Pagas con <b>Bizum</b>, <b>PayPal</b> o <b>contrarreembolso</b> al finalizar la compra</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <SizeGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}

// ---- Aviso por correo cuando abra la preventa (se guarda en la lista de Supabase con source=preventa-isolation) ----
function NotifyForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const hp = useRef<HTMLInputElement>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setState("error");
      setMsg("Revisa el correo");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "preventa-isolation", website: hp.current?.value ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se ha podido guardar");
      setState("ok");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "No se ha podido guardar");
    }
  }
  if (state === "ok")
    return <p className={`ps-notify ok${compact ? " compact" : ""}`}>Hecho. Te avisamos por correo en cuanto abra la preventa.</p>;
  return (
    <form className={`ps-notify${compact ? " compact" : ""}`} onSubmit={submit} noValidate>
      {!compact && (
        <p className="ps-notify-t">
          <b>Avísame cuando abra</b>
        </p>
      )}
      <input ref={hp} type="text" name="website" tabIndex={-1} autoComplete="off" className="ps-hp" aria-hidden="true" />
      <div className="ps-notify-row">
        <label className="sr-only" htmlFor={compact ? "ps-mail-c" : "ps-mail"}>Tu correo</label>
        <input
          id={compact ? "ps-mail-c" : "ps-mail"}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          required
        />
        <button type="submit" disabled={state === "sending"}>{state === "sending" ? "…" : compact ? "Avísame" : "Avísame"}</button>
      </div>
      {state === "error" && <p className="ps-notify-err">{msg}</p>}
    </form>
  );
}

// ---- Tarjeta: al pasar el ratón cambia de foto (fundido + zoom suave) y aparecen las tallas ----
function Card({
  item: p,
  left,
  flipped,
  onOpen,
}: {
  item: PresaleItem;
  left: number | null;
  flipped: boolean;
  onOpen: (e: React.MouseEvent<HTMLElement>, size: string | null) => void;
}) {
  const first = p.cover === "front" ? p.front ?? p.back : p.back ?? p.front;
  const imgs = [first, first === p.front ? p.back : p.front].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const media = useRef<HTMLSpanElement>(null);

  // Táctil: un toque corto abre la ficha; si el dedo se ha movido (scroll) no se abre
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
    swiped.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    const s0 = touch.current, t = e.touches[0];
    if (s0 && Math.hypot(t.clientX - s0.x, t.clientY - s0.y) > 10) swiped.current = true;
  }
  function onTouchEnd() {
    touch.current = null;
  }
  const shown = flipped && imgs.length > 1 ? 1 : idx;
  const scrub = flipped;
  function onOpenClick(e: React.MouseEvent<HTMLElement>) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    onOpen(e, null);
  }

  function onMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || imgs.length < 3 || !media.current) return;
    const r = media.current.getBoundingClientRect();
    setIdx(Math.min(imgs.length - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * imgs.length))));
  }

  return (
    <div
      data-card={p.id}
      className={`ps-card${hover ? " is-hover" : ""}${scrub ? " is-scrub" : ""}${left === 0 ? " is-out" : ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        setHover(true);
        if (imgs.length > 1) setIdx(1);
      }}
      onPointerMove={onMove}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        setHover(false);
        setIdx(0);
      }}
    >
      <div className="ps-mediawrap">
      <button type="button" className="ps-open" onClick={onOpenClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} aria-label={`${p.name}, ${eur(p.price_cents)}. Ver y precomprar`}>
        <span className="ps-thumb" ref={media}>
          {imgs.length ? (
            imgs.map((src, k) => (
              <img key={src} className={`ps-img${k === shown ? " on" : ""}`} src={src} alt="" loading="lazy" draggable={false} />
            ))
          ) : (
            <span className="ps-soon">Foto pronto</span>
          )}
          {imgs.length > 1 && (
            <span className="ps-dots" aria-hidden="true">
              {imgs.map((src, k) => <i key={src} className={k === shown ? "on" : ""} />)}
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
            <span className={`ps-stock${left === 0 ? " out" : ""}`}>
              {left === 0 ? "Agotado" : "Unidades limitadas"}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
