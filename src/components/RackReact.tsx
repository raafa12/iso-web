import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SizeGuideModal } from "./ProductsReact.tsx";
import "./rack.css";

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// --- Tipos ---

export interface RackProduct {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  tag?: string;
  sizes: string[];
  description: string;
  image_url: string; // PNG/WebP con fondo transparente
  image_back_url?: string | null; // espalda; sin ella la prenda solo se balancea
  color?: string | null;
}

interface Props {
  // Si se pasan productos no se consulta Supabase (página de preview)
  products?: RackProduct[];
  title?: string;
  // Vista previa: el botón no toca el carrito real (productos de prueba)
  preview?: boolean;
  // Antes de abrir la venta: el botón queda desactivado con este texto (p. ej. "Preventa · 13 dic")
  soon?: string;
  // Fecha ISO a partir de la cual se puede comprar (se comprueba en el navegador)
  opensAt?: string;
}

type LoadStatus = "loading" | "error" | "ready";

// --- Física de cada percha ---
// turn: giro en Y (0 = delante, 180 = espalda). swing: balanceo en Z desde el gancho.
interface Body {
  turn: number;
  vTurn: number;
  target: number;
  swing: number;
  vSwing: number;
  releaseAt: number;
}

const TURN_K = 150; // rigidez del giro
const TURN_C = 15; // amortiguación (algo por debajo de crítica → pequeño rebote)
const SWING_K = 38;
const SWING_C = 2.6;
const HOLD_MS = 650; // cuánto se queda de espaldas tras pasar el cursor

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// useLayoutEffect avisa en SSR; en servidor usamos useEffect
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// --- Percha ---
// La percha va "dentro" de la prenda: solo se ve el gancho metálico saliendo por el cuello.
function Hanger() {
  return (
    <>
      <span className="rack-hook-stem" aria-hidden="true" />
      <svg className="rack-hook" viewBox="88 -4 24 46" aria-hidden="true">
        <path d="M100 42 L100 22 C100 14 108 12 108 6 C108 0 100 -2 95 2" fill="none" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    </>
  );
}

// --- Componente principal ---

export default function RackReact({ products: initial, title = "El Perchero", preview = false, soon: soonLabel, opensAt }: Props) {
  const [products, setProducts] = useState<RackProduct[]>(initial ?? []);
  const [status, setStatus] = useState<LoadStatus>(initial ? "ready" : "loading");
  const [hovered, setHovered] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!opensAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [opensAt]);
  const soon = soonLabel && (!opensAt || now < Date.parse(opensAt)) ? soonLabel : undefined;

  const bodies = useRef<Body[]>([]);
  const els = useRef<(HTMLElement | null)[]>([]);
  const garmentEls = useRef<(HTMLElement | null)[]>([]);
  const raf = useRef<number | null>(null);
  const last = useRef<{ x: number; t: number; vx: number }>({ x: 0, t: 0, vx: 0 });
  const railRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const srcRect = useRef<DOMRect | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // ---- Carga desde Supabase (solo si no vienen productos por props) ----
  useEffect(() => {
    if (initial) return;
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.asc`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });
        if (!res.ok) throw new Error(`Supabase respondió ${res.status}`);
        setProducts(await res.json());
        setStatus("ready");
      } catch (err) {
        console.error("Error cargando el perchero:", err);
        setStatus("error");
      }
    })();
  }, [initial]);

  useEffect(() => {
    bodies.current = products.map(() => ({ turn: 0, vTurn: 0, target: 0, swing: 0, vSwing: 0, releaseAt: 0 }));
  }, [products]);

  // ---- Bucle de animación: se apaga solo cuando todo está quieto ----
  const tick = useCallback(() => {
    let prev = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;
      let moving = false;
      bodies.current.forEach((b, i) => {
        if (b.releaseAt && now > b.releaseAt) {
          b.target = 0;
          b.releaseAt = 0;
        }
        const aT = TURN_K * (b.target - b.turn) - TURN_C * b.vTurn;
        b.vTurn += aT * dt;
        b.turn += b.vTurn * dt;
        const aS = -SWING_K * b.swing - SWING_C * b.vSwing;
        b.vSwing += aS * dt;
        b.swing += b.vSwing * dt;
        if (Math.abs(b.target - b.turn) > 0.2 || Math.abs(b.vTurn) > 0.2 || Math.abs(b.swing) > 0.05 || Math.abs(b.vSwing) > 0.05 || b.releaseAt) {
          moving = true;
        } else {
          b.turn = b.target;
          b.vTurn = 0;
          b.swing = 0;
          b.vSwing = 0;
        }
        const el = els.current[i];
        if (el) {
          el.style.setProperty("--turn", `${b.turn.toFixed(2)}deg`);
          el.style.setProperty("--swing", `${b.swing.toFixed(2)}deg`);
          const c = Math.abs(Math.cos((b.turn * Math.PI) / 180));
          el.style.setProperty("--shade", (0.55 + 0.45 * c).toFixed(3));
        }
      });
      raf.current = moving ? requestAnimationFrame(step) : null;
    };
    if (raf.current == null) raf.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const hasBack = (i: number) => Boolean(products[i]?.image_back_url);

  function turnTo(i: number, back: boolean, holdMs = 0) {
    const b = bodies.current[i];
    if (!b) return;
    if (back && hasBack(i)) {
      b.target = 180;
      b.releaseAt = holdMs ? performance.now() + holdMs : 0;
    } else {
      b.releaseAt = performance.now() + HOLD_MS;
    }
    tick();
  }

  // Velocidad del cursor sobre el perchero → empujón al balanceo
  function onStageMove(e: React.PointerEvent) {
    const now = performance.now();
    const l = last.current;
    const dt = Math.max(1, now - l.t);
    l.vx = l.t ? (e.clientX - l.x) / dt : 0;
    l.x = e.clientX;
    l.t = now;
  }

  function onEnter(i: number, e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    setHovered(i);
    const b = bodies.current[i];
    if (!b) return;
    if (!prefersReducedMotion()) {
      const push = Math.max(-9, Math.min(9, last.current.vx * 5));
      b.vSwing += push * 6;
      [i - 1, i + 1].forEach((j) => {
        const n = bodies.current[j];
        if (n) n.vSwing += push * 1.6;
      });
    }
    b.target = hasBack(i) ? 180 : 0;
    b.releaseAt = 0;
    tick();
  }

  function onLeave(i: number) {
    setHovered((h) => (h === i ? null : h));
    const b = bodies.current[i];
    if (!b) return;
    b.releaseAt = performance.now() + HOLD_MS;
    tick();
  }

  // ---- Móvil: al deslizar el perchero, gira la prenda que pasa por el centro ----
  function onRailScroll() {
    if (window.matchMedia("(hover: hover)").matches) return;
    const rail = railRef.current;
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    garmentEls.current.forEach((el, i) => {
      if (!el) return;
      const g = el.getBoundingClientRect();
      const inCenter = Math.abs(g.left + g.width / 2 - mid) < g.width * 0.32;
      const b = bodies.current[i];
      if (!b) return;
      if (inCenter && hasBack(i)) {
        if (b.target !== 180) b.vSwing += 30;
        b.target = 180;
        b.releaseAt = 0;
      } else if (b.target === 180 && !b.releaseAt) {
        b.releaseAt = performance.now() + 250;
      }
    });
    tick();
  }

  // ---- Vista de detalle ----
  // ---- Móvil: tocar una prenda de un lado la trae al centro; tocar la del centro la abre ----
  function centeredIndex() {
    const rail = railRef.current;
    if (!rail) return -1;
    const r = rail.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    let best = -1;
    let dist = Infinity;
    els.current.forEach((el, i) => {
      if (!el) return;
      const g = el.getBoundingClientRect();
      const d = Math.abs(g.left + g.width / 2 - mid);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  }

  function onGarmentClick(i: number, e: React.MouseEvent<HTMLElement>) {
    const touchUI = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (touchUI && centeredIndex() !== i) {
      els.current[i]?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
      return;
    }
    openDetail(i, e);
  }

  function openDetail(i: number, e: React.MouseEvent<HTMLElement>) {
    returnFocus.current = e.currentTarget;
    srcRect.current = garmentEls.current[i]?.getBoundingClientRect() ?? null;
    const b = bodies.current[i];
    // En escritorio se abre por el lado que estabas viendo; en móvil siempre por delante
    const hover = window.matchMedia("(hover: hover)").matches;
    setSide(hover && b && b.turn > 90 ? "back" : "front");
    setSize(null);
    setAdded(false);
    setOpen(i);
  }

  const closeDetail = useCallback(() => {
    if (open == null || closing) return;
    const big = bigRef.current;
    const from = big?.getBoundingClientRect();
    const to = garmentEls.current[open]?.getBoundingClientRect();
    const finish = () => {
      setOpen(null);
      setClosing(false);
      returnFocus.current?.focus({ preventScroll: true });
    };
    setClosing(true);
    if (!big || !from || !to || prefersReducedMotion()) return finish();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const s = to.height / from.height;
    big.animate(
      [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(${s})` }],
      { duration: 420, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" },
    ).onfinish = finish;
  }, [open, closing]);

  // Animación de entrada: la prenda vuela desde el perchero al centro
  useIsoLayoutEffect(() => {
    if (open == null || !srcRect.current || !bigRef.current || prefersReducedMotion()) return;
    const big = bigRef.current;
    const from = srcRect.current;
    const to = big.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s = from.height / to.height;
    big.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }],
      { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    srcRect.current = null;
  }, [open]);

  useEffect(() => {
    if (open == null) return;
    closeBtnRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (guideOpen) {
        if (e.key === "Escape") setGuideOpen(false);
        return;
      }
      if (e.key === "Escape") closeDetail();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  });

  function go(dir: number) {
    if (open == null) return;
    const n = (open + dir + products.length) % products.length;
    setOpen(n);
    setSide("front");
    setSize(null);
    setAdded(false);
  }

  function addToCart() {
    if (open == null || !size) return;
    const p = products[open];
    setAdded(true);
    if (preview) {
      setTimeout(() => setAdded(false), 1600);
      return;
    }
    window.ISOCart?.add({ id: p.id, name: p.color ? `${p.name} · ${p.color}` : p.name, size, price: p.price_cents, image: p.image_url });
    setTimeout(() => {
      setAdded(false);
      closeDetail();
      window.ISOCart?.open();
    }, 700);
  }

  // En el detalle: tocar la prenda le da la vuelta; deslizar en horizontal pasa a la siguiente
  const swipe = useRef<{ x: number; y: number } | null>(null);
  function onBigPointerDown(e: React.PointerEvent) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }
  function onBigPointerUp(e: React.PointerEvent) {
    const s0 = swipe.current;
    swipe.current = null;
    if (!s0) return;
    const dx = e.clientX - s0.x;
    const dy = e.clientY - s0.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && current?.image_back_url) setSide((v) => (v === "front" ? "back" : "front"));
  }

  const current = open != null ? products[open] : null;
  const caption = hovered != null ? products[hovered] : null;

  return (
    <section className={`rack${open != null ? " is-open" : ""}`} aria-label={title || "Perchero"}>
      <div className="rack-head">
        {title && <h2 className="rack-title">{title}</h2>}
        <p className="rack-hint">
          <span className="hint-hover">Pasa el cursor para darles la vuelta · pincha para verla</span>
          <span className="hint-touch">Desliza el perchero · toca la del centro para verla</span>
        </p>
      </div>

      {status === "loading" && <p className="rack-status">Colgando la colección…</p>}
      {status === "error" && <p className="rack-status error">No hemos podido cargar la colección. Prueba a recargar.</p>}

      {status === "ready" && (
        <div className="rack-scroller" ref={railRef} onScroll={onRailScroll}>
          <div className="rack-stage" onPointerMove={onStageMove}>
            <div className="rack-bar" aria-hidden="true">
              <span className="rack-knob" />
              <span className="rack-knob" />
            </div>
            <ul className="rack-items">
              {products.map((p, i) => (
                <li
                  key={p.id}
                  className={`rack-item${hovered === i ? " is-hover" : ""}${open === i ? " is-picked" : ""}`}
                  ref={(el) => (els.current[i] = el)}
                  style={{ zIndex: hovered === i ? 50 : 10 + (i % 2) }}
                >
                  <button
                    type="button"
                    className="rack-garment"
                    aria-label={`Ver ${p.name}, ${formatPrice(p.price_cents)}`}
                    onPointerEnter={(e) => onEnter(i, e)}
                    onPointerLeave={() => onLeave(i)}
                    onFocus={() => { setHovered(i); turnTo(i, true); }}
                    onBlur={() => onLeave(i)}
                    onClick={(e) => onGarmentClick(i, e)}
                  >
                    <span className="rack-swing">
                      <Hanger />
                      <span className="rack-flip" ref={(el) => (garmentEls.current[i] = el)}>
                        <img className="rack-face front" src={p.image_url} alt="" draggable={false} />
                        {p.image_back_url && (
                          <img className="rack-face back" src={p.image_back_url} alt="" draggable={false} loading="lazy" />
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <p className="rack-caption" aria-live="polite">
        {caption ? (
          <>
            {caption.name}
            {caption.color ? ` — ${caption.color}` : ""}
            <span className="rack-caption-price">{formatPrice(caption.price_cents)}</span>
          </>
        ) : (
          " "
        )}
      </p>

      {current && (
        <div
          className={`rack-detail${closing ? " is-closing" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={current.name}
          onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
        >
          <button type="button" className="rack-close" ref={closeBtnRef} onClick={closeDetail}>
            Cerrar <span aria-hidden="true">×</span>
          </button>
          {products.length > 1 && (
            <>
              <button type="button" className="rack-arrow prev" aria-label="Prenda anterior" onClick={() => go(-1)}>←</button>
              <button type="button" className="rack-arrow next" aria-label="Prenda siguiente" onClick={() => go(1)}>→</button>
            </>
          )}

          <div className="rack-detail-inner" key={current.id}>
            <div className="rack-big" ref={bigRef} onPointerDown={onBigPointerDown} onPointerUp={onBigPointerUp}>
              <Hanger />
              <div className={`rack-big-flip${side === "back" ? " show-back" : ""}`}>
                <img className="rack-face front" src={current.image_url} alt={`${current.name}, delante`} />
                {current.image_back_url && (
                  <img className="rack-face back" src={current.image_back_url} alt={`${current.name}, espalda`} />
                )}
              </div>
              <div className="rack-tags" aria-hidden="true">
                {current.color && <span className="rack-tag dark">{current.color}</span>}
                {current.tag && <span className="rack-tag">{current.tag}</span>}
              </div>
            </div>

            <div className="rack-info">
              <p className="rack-info-cat">{current.category}</p>
              <h3 className="rack-info-name">{current.name}</h3>
              <p className="rack-info-price">{formatPrice(current.price_cents)}</p>

              {current.image_back_url && (
                <div className="rack-toggle" role="group" aria-label="Vista">
                  <button type="button" aria-pressed={side === "front"} className={side === "front" ? "on" : ""} onClick={() => setSide("front")}>Delante</button>
                  <button type="button" aria-pressed={side === "back"} className={side === "back" ? "on" : ""} onClick={() => setSide("back")}>Detrás</button>
                </div>
              )}

              <div className="rack-sizes" role="group" aria-label="Elige tu talla">
                {current.sizes.map((s) => (
                  <button key={s} type="button" aria-pressed={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                    {s}
                  </button>
                ))}
              </div>

              <button type="button" className="rack-cta" disabled={!!soon || !size || added} onClick={addToCart}>
                {soon ? soon : added ? (preview ? "Vista previa · no se añade" : "Añadido ✓") : size ? `Añadir al carrito · ${formatPrice(current.price_cents)}` : "Elige una talla"}
              </button>
              <button type="button" className="rack-guide" onClick={() => setGuideOpen(true)}>
                Guía de tallas
              </button>
            </div>
          </div>
        </div>
      )}

      <SizeGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </section>
  );
}
