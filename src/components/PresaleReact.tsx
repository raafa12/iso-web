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

  function openItem(i: number, e: React.MouseEvent<HTMLElement>) {
    returnFocus.current = e.currentTarget;
    setCurrent(i);
    setSide(firstSide(items[i]));
    setSize(null);
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
    if (!item || !size || phase !== "open") return;
    window.ISOCart?.add(
      {
        id: `${item.id}-preventa`,
        name: `${item.name} · Preventa Isolation`,
        size,
        price: item.price_cents,
        image: item.front ?? item.back ?? "/logo-mark.png",
      },
      qty,
    );
    setAdded(true);
    window.setTimeout(() => {
      closeItem();
      window.ISOCart?.open();
    }, 750);
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

  const ctaText = (() => {
    if (added) return "Añadido ✓";
    if (phase === "soon") return "Abre el 13 dic · 20:00";
    if (phase === "closed") return "Preventa cerrada";
    if (!size) return "Elige tu talla";
    return `Precomprar · ${eur(item!.price_cents * qty)}`;
  })();

  return (
    <>
      <ul className="ps-grid" ref={listRef}>
        {items.map((p, i) => {
          const thumb = p.cover === "front" ? p.front ?? p.back : p.back ?? p.front;
          const other = thumb === p.front ? p.back : p.front; // la otra cara, al pasar el ratón
          return (
            <li key={p.id} className={`ps-item${shown[i] ? " is-in" : ""}`} style={{ transitionDelay: `${i * 0.08}s` }}>
              <button type="button" className="ps-card" onClick={(e) => openItem(i, e)} aria-label={`${p.name}, ${eur(p.price_cents)}. Ver y precomprar`}>
                <span className="ps-thumb">
                  {thumb ? (
                    <span className={`ps-flipcard${other ? " has-other" : ""}`}>
                      <img className="ps-side" src={thumb} alt="" loading="lazy" />
                      {other && <img className="ps-side other" src={other} alt="" loading="lazy" />}
                    </span>
                  ) : (
                    <span className="ps-soon">Foto pronto</span>
                  )}
                </span>
                <span className="ps-meta">
                  <span className="ps-name">{p.name}</span>
                  <span className="ps-price">{eur(p.price_cents)}</span>
                </span>
                <span className="ps-cat">{p.category} · Isolation</span>
              </button>
            </li>
          );
        })}
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
              <p className="ps-big-price">{eur(item.price_cents)}</p>

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
                  <button type="button" onClick={() => setQty((q) => Math.min(5, q + 1))} aria-label="Una más" disabled={qty >= 5}>+</button>
                </div>
              </div>

              <button
                type="button"
                className={`ps-cta${phase === "open" && size ? " ready" : ""}`}
                disabled={phase !== "open" || !size || added}
                onClick={preorder}
              >
                {ctaText}
              </button>

              <ul className="ps-notes">
                <li><b>1 semana</b> de preventa o hasta agotar existencias</li>
                <li><b>Envío gratis</b> en Santander</li>
                <li>Cierras el pedido por <b>WhatsApp</b> desde el carrito</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <SizeGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
}
