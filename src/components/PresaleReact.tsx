import { useEffect, useRef, useState } from "react";
import { SizeGuideInline, guideKindOf } from "./SizeGuide.tsx";
import BuyNow from "./BuyNow";
import ShareWhatsApp from "./ShareWhatsApp";
import MoreProducts from "./MoreProducts";
import ProductDetails, { ShippingReturns } from "./ProductDetails";
import NotifyForm from "./NotifyForm";
import "./presale.css";
import { SB_HEADERS, STRIPE_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL, eur } from "../lib/shop";

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

  // Enlace compartido (/p/<id> → /preventa?p=<id>): abre esa prenda directamente
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("p");
    const i = id ? items.findIndex((it) => it.id === id) : -1;
    if (i >= 0) {
      setCurrent(i);
      setSide(firstSide(items[i]));
      setSize(null);
      setQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Antes de que abra, los diseños se ven difuminados
  const veiled = phase === "soon" && !demo;

  return (
    <>
      {phase === "soon" && <NotifyForm featured label="Apuntarme" />}
      {demo && <p className="ps-demo">Vista de prueba: preventa abierta y 5 unidades por prenda. Los pedidos del carrito no se guardan.</p>}
      <ul className="ps-grid" ref={listRef}>
        {items.map((p, i) => (
          <li key={p.id} className={`ps-item${shown[i] ? " is-in" : ""}`} style={{ transitionDelay: `${i * 0.08}s` }}>
            <Card item={p} left={left(p.id)} flipped={fingerOn === p.id} veiled={veiled} onOpen={(e, sz) => openItem(i, e, sz)} />
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

            <div className={`ps-media${veiled ? " is-veiled" : ""}`} onPointerDown={onDown} onPointerUp={onUp}>
              {veiled && <Veil />}
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
              <div className="ps-head">
                <h3 className="ps-title">{item.name}</h3>
                <p className="ps-big-price">{veiled ? <span className="ps-qq">??,?? €</span> : eur(item.price_cents)}</p>
              </div>
              <p className="ps-left-line">
                <span className={`ps-left${soldOut ? " out" : itemLeft != null && itemLeft <= LOW_STOCK ? " low" : ""}`}>
                  {soldOut ? "Agotado" : !veiled && itemLeft != null && itemLeft <= LOW_STOCK ? `Quedan ${itemLeft}` : "Unidades limitadas"}
                </span>
              </p>
              {/* Antes de abrir: solo el nombre; lo demás, con interrogaciones */}
              <p className="ps-desc">{veiled ? <span className="ps-qq">??? ????? ?? ???? ????? ? ?? ????? ?????? ?? ?? ????????.</span> : item.description}</p>

              <div className="ps-field">
                <div className="ps-label">
                  <span>Talla</span>
                </div>
                <div className="ps-sizes" role="group" aria-label="Elige tu talla">
                  {veiled
                    ? item.sizes.map((s) => <button key={s} type="button" disabled className="ps-qq-size">?</button>)
                    : item.sizes.map((s) => (
                        <button key={s} type="button" aria-pressed={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                          {s}
                        </button>
                      ))}
                </div>
                {!veiled && <SizeGuideInline key={item.id} kind={guideKindOf(item.id)} />}
              </div>

              <div className="ps-field" hidden={veiled}>
                <div className="ps-label"><span>Cantidad</span></div>
                <div className="ps-qty">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Una menos" disabled={qty <= 1}>−</button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} aria-label="Una más" disabled={qty >= maxQty}>+</button>
                </div>
              </div>

              {phase === "open" && size && !soldOut ? (
                <BuyNow
                  line={{ id: item.id, name: `${item.name} · Preventa`, size, price: item.price_cents, image: item.front ?? item.back ?? "/logo-mark.png" }}
                  qty={qty}
                  close={closeItem}
                  onAddToCart={preorder}
                  added={added}
                />
              ) : (
                <button type="button" className="ps-cta" disabled>
                  {ctaText}
                </button>
              )}

              {phase === "soon" && <NotifyForm key={item.id} compact source="preventa-isolation" productId={item.id} productName={item.name} label="La quiero" hint="Esta no la va a tener cualquiera." okText="Apuntado. 14.12 · 00:00. No llegues tarde." />}

              <ul className="ps-notes">
                <li><b>{unitsPerItem} unidades</b> disponibles</li>
                <li>Recíbelo <b>antes de Navidad</b></li>
                <li><b>Envío gratis</b> en Santander</li>
              </ul>
              <ShareWhatsApp id={item.id} name={item.name} price={eur(item.price_cents)} />
              <ProductDetails key={item.id} id={item.id} veiled={veiled} />
              <ShippingReturns presale />
              <MoreProducts
                currentId={item.id}
                here="preventa"
                onPick={(id) => {
                  const i = items.findIndex((it) => it.id === id);
                  if (i < 0) return;
                  setCurrent(i);
                  setSide(firstSide(items[i]));
                  setSize(null);
                  setQty(1);
                  setAdded(false);
                  document.querySelectorAll(".ps-modal, .ps-sheet").forEach((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
                }}
              />
            </div>
          </div>
        </div>
      )}

    </>
  );
}

// ---- Aviso por correo cuando abra la preventa (se guarda en la lista de Supabase con source=preventa-isolation) ----

// Velo sobre la foto mientras la preventa no ha abierto
export function Veil({ small = false }: { small?: boolean }) {
  return (
    <span className={`ps-veil${small ? " small" : ""}`} aria-hidden="true">
      <img src="/logo-white-nav.png" alt="" />
      <b>Próximamente</b>
    </span>
  );
}

// ---- Tarjeta: al pasar el ratón cambia de foto (fundido + zoom suave) y aparecen las tallas ----
function Card({
  item: p,
  left,
  flipped,
  veiled = false,
  onOpen,
}: {
  item: PresaleItem;
  left: number | null;
  flipped: boolean;
  veiled?: boolean;
  onOpen: (e: React.MouseEvent<HTMLElement>, size: string | null) => void;
}) {
  const first = p.cover === "front" ? p.front ?? p.back : p.back ?? p.front;
  // Antes de abrir solo una foto (difuminada): al pasar el ratón no se ve la otra cara
  const imgs = (veiled ? [first] : [first, first === p.front ? p.back : p.front]).filter(Boolean) as string[];
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
      <button type="button" className="ps-open" onClick={onOpenClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} aria-label={veiled ? `${p.name}. Próximamente` : `${p.name}, ${eur(p.price_cents)}. Ver y precomprar`}>
        <span className={`ps-thumb${veiled ? " is-veiled" : ""}`} ref={media}>
          {veiled && <Veil />}
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

      <div className="ps-quick" aria-label={`Tallas de ${p.name}`} hidden={veiled}>
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
          {!veiled && <span className="ps-price">{eur(p.price_cents)}</span>}
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
