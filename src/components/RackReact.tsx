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
  image_back_url?: string | null; // espalda (se elige en el detalle)
  color?: string | null;
}

interface Props {
  // Si se pasan productos no se consulta Supabase (página de preview)
  products?: RackProduct[];
  title?: string;
}

type LoadStatus = "loading" | "error" | "ready";

// --- Cómo se mueve el perchero ---
// Las prendas cuelgan de frente. Hay un "foco" que se mueve por el perchero: en escritorio
// lo lleva el cursor, en móvil el scroll. La prenda en el foco da la vuelta y enseña la
// espalda (muelle con rebote), se balancea desde el gancho, y al irse el foco se queda un
// momento de espaldas antes de volver.
const HOLD_MS = 650; // cuánto se queda de espaldas tras pasar el cursor
const HOLD_TOUCH_MS = 250;
const TURN_K = 150; // rigidez del giro
const TURN_C = 15; // amortiguación (algo por debajo de crítica → pequeño rebote)
const SWING_K = 38;
const SWING_C = 2.6;
const FOCUS_K = 110; // muelle del foco (sin rebote)
const FOCUS_C = 21;

interface Body {
  turn: number;
  vTurn: number;
  swing: number;
  vSwing: number;
  back: boolean;
  releaseAt: number;
}

interface Focus {
  c: number; // posición del foco en índices (puede ser decimal, entre dos prendas)
  vc: number;
  cT: number;
  f: number; // intensidad del foco: 0 = todas de lado, 1 = la del foco de frente
  vf: number;
  fT: number;
  near: number; // prenda más cercana al foco
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

// useLayoutEffect avisa en SSR; en servidor usamos useEffect
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isTouchUI() {
  return typeof window !== "undefined" && window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

// --- Gancho metálico: sale de la barra y se mete por el cuello, detrás de la prenda ---
function Hanger() {
  return (
    <svg className="rack-hook" viewBox="88 -4 24 46" aria-hidden="true">
      <path d="M100 42 L100 22 C100 14 108 12 108 6 C108 0 100 -2 95 2" fill="none" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function Side({ src, back, alt, lazy }: { src: string; back?: boolean; alt: string; lazy?: boolean }) {
  return (
    <span className={`rack-face ${back ? "back" : "front"}`}>
      <img src={src} alt={alt} draggable={false} loading={lazy ? "lazy" : undefined} />
    </span>
  );
}

// --- Componente principal ---

export default function RackReact({ products: initial, title = "El Perchero" }: Props) {
  const [products, setProducts] = useState<RackProduct[]>(initial ?? []);
  const [status, setStatus] = useState<LoadStatus>(initial ? "ready" : "loading");
  const [near, setNear] = useState<number | null>(null); // prenda de frente (para el pie)
  const [open, setOpen] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const bodies = useRef<Body[]>([]);
  const focus = useRef<Focus>({ c: 0, vc: 0, cT: 0, f: 0, vf: 0, fT: 0, near: -1 });
  const els = useRef<(HTMLLIElement | null)[]>([]);
  const garmentEls = useRef<(HTMLElement | null)[]>([]);
  const raf = useRef<number | null>(null);
  const last = useRef<{ x: number; t: number; vx: number }>({ x: 0, t: 0, vx: 0 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const srcRect = useRef<DOMRect | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const touch = useRef(false);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);

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

  // ---- Bucle de animación: se apaga solo cuando todo está quieto ----
  const tick = useCallback(() => {
    if (raf.current != null) return;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;
      const F = focus.current;
      const still = prefersReducedMotion();

      // foco (muelle crítico; en móvil va pegado al scroll)
      if (touch.current || still) {
        F.c = F.cT;
        F.vc = 0;
      } else {
        F.vc += (FOCUS_K * (F.cT - F.c) - FOCUS_C * F.vc) * dt;
        F.c += F.vc * dt;
      }
      F.vf += (FOCUS_K * (F.fT - F.f) - FOCUS_C * F.vf) * dt;
      F.f += F.vf * dt;
      if (still) F.f = F.fT;
      let moving = Math.abs(F.cT - F.c) > 0.002 || Math.abs(F.vc) > 0.01 || Math.abs(F.fT - F.f) > 0.002 || Math.abs(F.vf) > 0.01;

      // prenda más cercana: empujón de balanceo al llegarle el foco
      const n = Math.round(F.c);
      const nearNow = F.fT > 0.5 ? n : -1;
      if (nearNow !== F.near) {
        F.near = nearNow;
        setNear(nearNow >= 0 ? nearNow : null);
        const b = bodies.current[nearNow];
        if (b && !still) {
          const push = touch.current ? 4 : Math.max(-9, Math.min(9, last.current.vx * 5));
          b.vSwing += push * 4;
        }
      }

      const nowMs = performance.now();
      bodies.current.forEach((b, i) => {
        // de espaldas mientras tenga el foco; al perderlo, espera un poco y vuelve
        if (i === nearNow) {
          b.back = Boolean(products[i]?.image_back_url);
          b.releaseAt = 0;
        } else if (b.back) {
          if (!b.releaseAt) b.releaseAt = nowMs + (touch.current ? HOLD_TOUCH_MS : HOLD_MS);
          else if (nowMs > b.releaseAt) {
            b.back = false;
            b.releaseAt = 0;
          }
        }
        const target = b.back ? 180 : 0;
        if (still) {
          b.turn = target;
          b.vTurn = 0;
        } else {
          b.vTurn += (TURN_K * (target - b.turn) - TURN_C * b.vTurn) * dt;
          b.turn += b.vTurn * dt;
          b.vSwing += (-SWING_K * b.swing - SWING_C * b.vSwing) * dt;
          b.swing += b.vSwing * dt;
        }
        if (b.releaseAt || Math.abs(target - b.turn) > 0.15 || Math.abs(b.vTurn) > 0.2 || Math.abs(b.swing) > 0.05 || Math.abs(b.vSwing) > 0.05) moving = true;

        const el = els.current[i];
        if (el) {
          el.style.setProperty("--turn", `${b.turn.toFixed(2)}deg`);
          el.style.setProperty("--swing", `${b.swing.toFixed(2)}deg`);
          el.style.setProperty("--shade", (0.55 + 0.45 * Math.abs(Math.cos((b.turn * Math.PI) / 180))).toFixed(3));
          el.style.zIndex = i === nearNow ? "100" : String(10 + (i % 2));
        }
      });
      raf.current = moving ? requestAnimationFrame(step) : null;
    };
    raf.current = requestAnimationFrame(step);
  }, [products]);

  useEffect(() => {
    bodies.current = products.map(() => ({ turn: 0, vTurn: 0, swing: 0, vSwing: 0, back: false, releaseAt: 0 }));
    touch.current = isTouchUI();
    const F = focus.current;
    // en móvil siempre hay una prenda de frente: la del centro
    F.fT = touch.current ? 1 : 0;
    F.f = F.fT;
    tick();
  }, [products, tick]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  // ---- Escritorio: el cursor lleva el foco ----
  function onStageMove(e: React.PointerEvent) {
    if (e.pointerType === "touch" || touch.current) return;
    const now = performance.now();
    const l = last.current;
    l.vx = l.t ? (e.clientX - l.x) / Math.max(1, now - l.t) : 0;
    l.x = e.clientX;
    l.t = now;
    const first = els.current[0];
    if (!first) return;
    const r = first.getBoundingClientRect(); // los <li> no se mueven (se aparta su contenido)
    const slot = first.offsetWidth;
    const centre0 = r.left + slot / 2;
    const F = focus.current;
    F.cT = Math.max(0, Math.min(products.length - 1, (e.clientX - centre0) / slot));
    F.fT = 1;
    tick();
  }

  function onStageLeave() {
    if (touch.current) return;
    focus.current.fT = 0;
    tick();
  }

  // ---- Móvil: el scroll lleva el foco (la prenda del centro se pone de frente) ----
  function onScroll() {
    if (!touch.current) return;
    const sc = scrollerRef.current;
    const slot = els.current[0]?.offsetWidth;
    if (!sc || !slot) return;
    focus.current.cT = Math.max(0, Math.min(products.length - 1, sc.scrollLeft / slot));
    tick();
  }

  function centerOn(i: number) {
    const sc = scrollerRef.current;
    const slot = els.current[0]?.offsetWidth;
    if (!sc || !slot) return;
    sc.scrollTo({ left: i * slot, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function onGarmentClick(i: number, e: React.MouseEvent<HTMLElement>) {
    // en móvil, tocar una prenda de lado la trae al centro; tocar la del centro la abre
    if (touch.current && Math.round(focus.current.c) !== i) {
      centerOn(i);
      return;
    }
    openDetail(i, e);
  }

  function onGarmentFocus(i: number) {
    const F = focus.current;
    F.cT = i;
    F.fT = 1;
    if (touch.current) centerOn(i);
    tick();
  }

  // ---- Vista de detalle ----
  function openDetail(i: number, e: React.MouseEvent<HTMLElement>) {
    returnFocus.current = e.currentTarget;
    srcRect.current = garmentEls.current[i]?.getBoundingClientRect() ?? null;
    // en escritorio se abre por el lado que estabas viendo; en móvil siempre por delante
    setSide(!touch.current && bodies.current[i]?.back ? "back" : "front");
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
    // el perchero de debajo sigue a la prenda que estás viendo
    focus.current.cT = n;
    if (touch.current) centerOn(n);
    tick();
  }

  // En el detalle: tocar la prenda le da la vuelta; deslizar pasa a la siguiente
  function onBigPointerDown(e: React.PointerEvent) {
    swipe.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function onBigPointerUp(e: React.PointerEvent) {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && current?.image_back_url) {
      setSide((v) => (v === "front" ? "back" : "front"));
    }
  }

  function addToCart() {
    if (open == null || !size) return;
    const p = products[open];
    window.ISOCart?.add({ id: p.id, name: p.name, size, price: p.price_cents, image: p.image_url });
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      closeDetail();
      window.ISOCart?.open();
    }, 700);
  }

  const current = open != null ? products[open] : null;
  const caption = near != null ? products[near] : null;

  return (
    <section className={`rack${open != null ? " is-open" : ""}`} aria-label={title}>
      <div className="rack-head">
        <h2 className="rack-title">{title}</h2>
        <p className="rack-hint">
          <span className="hint-hover">Pasa el cursor para darles la vuelta · pincha para verla</span>
          <span className="hint-touch">Desliza el perchero · toca la del centro para verla</span>
        </p>
      </div>

      {status === "loading" && <p className="rack-status">Colgando la colección…</p>}
      {status === "error" && <p className="rack-status error">No hemos podido cargar la colección. Prueba a recargar.</p>}

      {status === "ready" && (
        <div className="rack-scroller" ref={scrollerRef} onScroll={onScroll}>
          <div className="rack-stage" onPointerMove={onStageMove} onPointerLeave={onStageLeave}>
            <div className="rack-bar" aria-hidden="true">
              <span className="rack-knob" />
              <span className="rack-knob" />
            </div>
            <ul className="rack-items">
              {products.map((p, i) => (
                <li
                  key={p.id}
                  className={`rack-item${near === i ? " is-near" : ""}${open === i ? " is-picked" : ""}`}
                  ref={(el) => (els.current[i] = el)}
                >
                  <button
                    type="button"
                    className="rack-garment"
                    aria-label={`Ver ${p.name}, ${formatPrice(p.price_cents)}`}
                    onFocus={() => onGarmentFocus(i)}
                    onBlur={onStageLeave}
                    onClick={(e) => onGarmentClick(i, e)}
                  >
                    <span className="rack-swing">
                      <Hanger />
                      <span className="rack-flip" ref={(el) => (garmentEls.current[i] = el)}>
                        <Side src={p.image_url} alt="" />
                        {p.image_back_url && <Side src={p.image_back_url} alt="" back lazy />}
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
                <Side src={current.image_url} alt={`${current.name}, delante`} />
                {current.image_back_url && (
                  <Side src={current.image_back_url} alt={`${current.name}, espalda`} back />
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

              <button type="button" className="rack-cta" disabled={!size || added} onClick={addToCart}>
                {added ? "Añadido ✓" : size ? `Añadir al carrito · ${formatPrice(current.price_cents)}` : "Elige una talla"}
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
