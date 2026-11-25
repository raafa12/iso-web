import { useEffect, useRef, useState } from "react";
import { SizeGuideModal, guideKindOf } from "./SizeGuide.tsx";
import { STRIPE_ENABLED, canBuy, eur } from "../lib/shop";
import BuyNow from "./BuyNow";
import ShareWhatsApp from "./ShareWhatsApp";
import MoreProducts from "./MoreProducts";
import DropFirst from "./DropFirst";
import "./presale.css";
import "./collection.css";

// Misma interfaz que la preventa: tarjetas que cambian de foto al pasar el ratón o el dedo,
// tallas rápidas y ficha con fotos delante/detrás, color, logo, talla y cantidad.

export interface Variant {
  id: string;
  color: string;
  swatch: string; // color del círculo
  sizes: string[];
  front: string;
  back?: string | null;
  frontMono?: string | null; // mismo color de prenda, logo entero blanco o negro
}
export interface Model {
  name: string;
  category: string;
  description: string;
  price_cents: number;
  variants: Variant[];
}

interface Item extends Variant {
  model: Model;
}

const ALL_SIZES = ["S", "M", "L", "XL"];
// en prendas oscuras el logo de un color es blanco; en claras, negro
const monoName = (v: Variant) => (v.swatch === "#111111" ? "Blanco" : "Negro");

// modalOnly: solo la ficha, sin la cuadrícula (la usa el perchero de la home para abrir
// la misma ficha que la colección al pulsar una prenda)
export default function CollectionReact({
  models,
  shippingCents = 499,
  modalOnly = false,
}: {
  models: Model[];
  shippingCents?: number;
  modalOnly?: boolean;
}) {
  const items: Item[] = models.flatMap((m) => m.variants.map((v) => ({ ...v, model: m })));
  const [current, setCurrent] = useState<number | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [monoIds, setMonoIds] = useState<Record<string, boolean>>({});
  const [fingerOn, setFingerOn] = useState<string | null>(null);
  const [shown, setShown] = useState<boolean[]>(() => items.map(() => false));
  const listRef = useRef<HTMLUListElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const frontOf = (it: Item) => (monoIds[it.id] && it.frontMono ? it.frontMono : it.front);

  // Móvil: la prenda bajo el dedo enseña la espalda (igual que en la preventa)
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) return;
    let raf = 0, lx = 0, ly = 0;
    let on: string | null = null, onAt = 0, cand: string | null = null, candAt = 0;
    const pick = () => {
      raf = 0;
      const id = document.elementFromPoint(lx, ly)?.closest<HTMLElement>("[data-card]")?.dataset.card ?? null;
      const now = performance.now();
      if (id !== cand) {
        cand = id;
        candAt = now;
      }
      if (cand && cand !== on && now - candAt > 180 && now - onAt > 900) {
        on = cand;
        onAt = now;
        setFingerOn(on);
      }
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      lx = t.clientX;
      ly = t.clientY;
      if (!raf) raf = requestAnimationFrame(pick);
    };
    const tick = window.setInterval(() => cand && pick(), 100);
    const onEnd = () => {
      cand = null;
      const wait = Math.max(0, 900 - (performance.now() - onAt));
      window.setTimeout(() => {
        if (cand) return;
        on = null;
        setFingerOn(null);
      }, on ? wait : 0);
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
  }, []);

  const item = current != null ? items[current] : null;

  // El perchero de la home pide abrir una prenda con esta misma ficha
  useEffect(() => {
    if (!modalOnly) return;
    (window as any).__isoProductModal = true;
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; handled?: boolean }>).detail;
      const i = items.findIndex((it) => it.id === d.id);
      if (i < 0) return;
      d.handled = true;
      returnFocus.current = document.activeElement as HTMLElement | null;
      setCurrent(i);
      setSide("front");
      setSize(null);
      setQty(1);
      setAdded(false);
    };
    window.addEventListener("iso-open-product", onOpen);
    return () => {
      window.removeEventListener("iso-open-product", onOpen);
      (window as any).__isoProductModal = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOnly]);

  // Enlace compartido (/p/<id> → /collection?p=<id>): abre esa prenda directamente
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("p");
    const i = id ? items.findIndex((it) => it.id === id) : -1;
    if (i >= 0) {
      setCurrent(i);
      setSide("front");
      setSize(null);
      setQty(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openItem(i: number, e: React.MouseEvent<HTMLElement>, presetSize: string | null = null) {
    returnFocus.current = e.currentTarget;
    setCurrent(i);
    setSide("front");
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
    setCurrent((current + d + items.length) % items.length);
    setSide("front");
    setSize(null);
    setQty(1);
    setAdded(false);
  }
  // Cambiar de color dentro de la ficha: pasa a la otra variante del mismo modelo
  function pickColor(id: string) {
    const n = items.findIndex((x) => x.id === id);
    if (n < 0) return;
    if (size && !items[n].sizes.includes(size)) setSize(null);
    setCurrent(n);
    setAdded(false);
  }
  function pickLogo(m: boolean) {
    if (!item) return;
    setMonoIds((prev) => ({ ...prev, [item.id]: m }));
    setSide("front");
  }

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

  // Mismo id y nombre que en el perchero (tienen que coincidir con supabase/tienda.sql)
  function lineFor(it: Item, sz: string) {
    const isMono = Boolean(monoIds[it.id] && it.frontMono);
    return {
      id: isMono ? `${it.id}-mono` : it.id,
      name: `${it.model.name} · ${it.color} · Logo ${isMono ? monoName(it).toLowerCase() : "clásico"}`,
      size: sz,
      price: it.model.price_cents,
      image: frontOf(it),
    };
  }

  function addToCart() {
    if (!item || !size) return;
    window.ISOCart?.add(lineFor(item, size), qty);
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
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && item.back) setSide((v) => (v === "front" ? "back" : "front"));
  }

  const isMono = Boolean(item && monoIds[item.id] && item.frontMono);
  const siblings = item ? items.filter((x) => x.model === item.model) : [];

  return (
    <>
      {!modalOnly && (
      <ul className="ps-grid cl-ps-grid" ref={listRef}>
        {items.map((it, i) => (
          <li key={it.id} className={`ps-item${shown[i] ? " is-in" : ""}`} style={{ transitionDelay: `${i * 0.08}s` }}>
            <Card item={it} front={frontOf(it)} flipped={fingerOn === it.id} onOpen={(e, sz) => openItem(i, e, sz)} />
          </li>
        ))}
      </ul>
      )}

      {item && (
        <div
          className="ps-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${item.model.name} ${item.color}`}
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

            <div className="ps-media cl-ps-media" onPointerDown={onDown} onPointerUp={onUp}>
              <div className={`ps-flip${side === "back" ? " show-back" : ""}`}>
                <img className="ps-face" src={frontOf(item)} alt={`${item.model.name} ${item.color}, delante`} draggable={false} />
                {item.back && <img className="ps-face back" src={item.back} alt={`${item.model.name} ${item.color}, detrás`} draggable={false} />}
              </div>
              {item.back && (
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
                {canBuy(item.id) ? "Best seller · Siempre disponible" : "Best seller"}
              </p>
              <h3 className="ps-title">{item.model.name}</h3>
              <p className="ps-desc">{item.model.description}</p>
              <p className="ps-big-price">{eur(item.model.price_cents)}</p>

              {siblings.length > 1 && (
                <div className="ps-field">
                  <div className="ps-label">
                    <span>
                      Color <b>{item.color}</b>
                    </span>
                  </div>
                  <div className="cl-swatches" role="radiogroup" aria-label="Color">
                    {siblings.map((x) => (
                      <button
                        key={x.id}
                        type="button"
                        role="radio"
                        aria-checked={x.id === item.id}
                        aria-label={x.color}
                        title={x.color}
                        className={`cl-swatch${x.id === item.id ? " on" : ""}`}
                        style={{ background: x.swatch }}
                        onClick={() => pickColor(x.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {item.frontMono && (
                <div className="ps-field">
                  <div className="ps-label">
                    <span>
                      Logo <b>{isMono ? `${monoName(item)} entero` : "Clásico"}</b>
                    </span>
                  </div>
                  <div className="cl-logos" role="radiogroup" aria-label="Logo">
                    <button type="button" role="radio" aria-checked={!isMono} className={!isMono ? "on" : ""} onClick={() => pickLogo(false)}>
                      <span className="cl-dot" style={{ background: "#7ec8e3" }} /> Clásico
                    </button>
                    <button type="button" role="radio" aria-checked={isMono} className={isMono ? "on" : ""} onClick={() => pickLogo(true)}>
                      <span className="cl-dot" style={{ background: monoName(item) === "Blanco" ? "#f2f1ec" : "#111" }} /> {monoName(item)} entero
                    </button>
                  </div>
                </div>
              )}

              <div className="ps-field">
                <div className="ps-label">
                  <span>Talla</span>
                  <button type="button" className="ps-guide" onClick={() => setGuideOpen(true)}>Guía de tallas</button>
                </div>
                <div className="ps-sizes" role="group" aria-label="Elige tu talla">
                  {ALL_SIZES.map((s) => {
                    const ok = item.sizes.includes(s);
                    return (
                      <button key={s} type="button" disabled={!ok} aria-pressed={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="ps-field" hidden={!canBuy(item.id)}>
                <div className="ps-label"><span>Cantidad</span></div>
                <div className="ps-qty">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Una menos" disabled={qty <= 1}>−</button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(5, q + 1))} aria-label="Una más" disabled={qty >= 5}>+</button>
                </div>
              </div>

              {!canBuy(item.id) ? (
                <DropFirst />
              ) : size ? (
                <BuyNow line={lineFor(item, size)} qty={qty} close={closeItem} onAddToCart={addToCart} added={added} />
              ) : (
                <button type="button" className="ps-cta" disabled>Elige tu talla</button>
              )}

              <ul className="ps-notes">
                <li><b>Envío gratis</b> en Santander · resto {eur(shippingCents)}</li>
                <li>Pagas con {STRIPE_ENABLED && <><b>tarjeta</b>, <b>Apple Pay</b>, <b>Google Pay</b>, </>}<b>Bizum</b>, <b>PayPal</b> o <b>contrarreembolso</b></li>
              </ul>
              <ShareWhatsApp id={item.id} name={`${item.model.name} · ${item.color}`} price={eur(item.model.price_cents)} />
              <MoreProducts
                currentId={item.id}
                here="collection"
                onPick={(id) => {
                  const i = items.findIndex((it) => it.id === id);
                  if (i < 0) return;
                  setCurrent(i);
                  setSide("front");
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

      <SizeGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} kind={guideKindOf(item?.id)} />
    </>
  );
}

// ---- Tarjeta: al pasar el ratón (o el dedo) cambia a la espalda y aparecen las tallas ----
function Card({
  item: it,
  front,
  flipped,
  onOpen,
}: {
  item: Item;
  front: string;
  flipped: boolean;
  onOpen: (e: React.MouseEvent<HTMLElement>, size: string | null) => void;
}) {
  const imgs = [front, it.back].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);

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
  const shownIdx = flipped && imgs.length > 1 ? 1 : idx;
  function onOpenClick(e: React.MouseEvent<HTMLElement>) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    onOpen(e, null);
  }

  return (
    <div
      data-card={it.id}
      className={`ps-card${hover ? " is-hover" : ""}${flipped ? " is-scrub" : ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        setHover(true);
        if (imgs.length > 1) setIdx(1);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        setHover(false);
        setIdx(0);
      }}
    >
      <div className="ps-mediawrap">
        <button
          type="button"
          className="ps-open"
          onClick={onOpenClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          aria-label={`${it.model.name} ${it.color}, ${eur(it.model.price_cents)}. Ver y comprar`}
        >
          <span className="ps-thumb">
            {imgs.map((src, k) => (
              <img key={src} className={`ps-img${k === shownIdx ? " on" : ""}`} src={src} alt="" loading="lazy" draggable={false} />
            ))}
            {imgs.length > 1 && (
              <span className="ps-dots" aria-hidden="true">
                {imgs.map((src, k) => <i key={src} className={k === shownIdx ? "on" : ""} />)}
              </span>
            )}
          </span>
        </button>

        <div className="ps-quick" aria-label={`Tallas de ${it.model.name} ${it.color}`}>
          {it.sizes.map((sz) => (
            <button key={sz} type="button" onClick={(e) => onOpen(e, sz)} tabIndex={hover ? 0 : -1}>
              {sz}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="ps-meta-btn" onClick={(e) => onOpen(e, null)} tabIndex={-1} aria-hidden="true">
        <span className="ps-meta">
          <span className="ps-name">{it.model.name}</span>
          <span className="ps-price">{eur(it.model.price_cents)}</span>
        </span>
        <span className="ps-cat">
          {it.model.category} · {it.color}
        </span>
      </button>
    </div>
  );
}
