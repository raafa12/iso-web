import { useState } from "react";
import { SizeGuideModal } from "./ProductsReact.tsx";
import { eur } from "../lib/shop";
import "./collection.css";

export interface Variant {
  id: string;
  color: string;
  swatch: string; // color del círculo
  sizes: string[];
  front: string;
  back?: string | null;
}
export interface Model {
  name: string;
  category: string;
  description: string;
  price_cents: number;
  variants: Variant[];
}

// ---- Una tarjeta por modelo, con sus colores ----
function ModelCard({ model, onGuide }: { model: Model; onGuide: () => void }) {
  const [vi, setVi] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const v = model.variants[vi];

  function pickColor(i: number) {
    setVi(i);
    // si la talla elegida no existe en ese color, se borra
    if (size && !model.variants[i].sizes.includes(size)) setSize(null);
    setAdded(false);
  }

  function add() {
    if (!size) return;
    window.ISOCart?.add({ id: v.id, name: `${model.name} · ${v.color}`, size, price: model.price_cents, image: v.front });
    setAdded(true);
    window.setTimeout(() => {
      setAdded(false);
      window.ISOCart?.open();
    }, 600);
  }

  return (
    <article className="cl-card">
      <div className="cl-media">
        {model.variants.map((x, i) => (
          <span key={x.id} className={`cl-variant${i === vi ? " on" : ""}`} aria-hidden={i !== vi}>
            <img className="cl-img front" src={x.front} alt={i === vi ? `${model.name} ${x.color}, delante` : ""} loading={i ? "lazy" : "eager"} />
            {x.back && <img className="cl-img back" src={x.back} alt="" loading="lazy" />}
          </span>
        ))}
        {v.back && <span className="cl-hint">Pasa el cursor para ver la espalda</span>}
      </div>

      <div className="cl-info">
        <div className="cl-head">
          <div>
            <p className="cl-cat">{model.category}</p>
            <h2 className="cl-name">{model.name}</h2>
          </div>
          <p className="cl-price">{eur(model.price_cents)}</p>
        </div>
        <p className="cl-desc">{model.description}</p>

        <div className="cl-field">
          <span className="cl-label">
            <span>
              Color <b>{v.color}</b>
            </span>
          </span>
          <div className="cl-swatches" role="radiogroup" aria-label="Color">
            {model.variants.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={i === vi}
                aria-label={x.color}
                title={x.color}
                className={`cl-swatch${i === vi ? " on" : ""}`}
                style={{ background: x.swatch }}
                onClick={() => pickColor(i)}
              />
            ))}
          </div>
        </div>

        <div className="cl-field">
          <span className="cl-label">
            <span>Talla</span>
            <button type="button" className="cl-guide" onClick={onGuide}>Guía de tallas</button>
          </span>
          <div className="cl-sizes" role="group" aria-label="Talla">
            {["S", "M", "L", "XL"].map((s) => {
              const ok = v.sizes.includes(s);
              return (
                <button key={s} type="button" disabled={!ok} aria-pressed={size === s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <button type="button" className={`cl-cta${size ? " ready" : ""}`} disabled={!size || added} onClick={add}>
          {added ? "Añadido ✓" : size ? `Añadir al carrito · ${eur(model.price_cents)}` : "Elige tu talla"}
        </button>
      </div>
    </article>
  );
}

export default function CollectionReact({ models }: { models: Model[] }) {
  const [guide, setGuide] = useState(false);
  return (
    <>
      <div className="cl-grid">
        {models.map((m) => (
          <ModelCard key={m.name} model={m} onGuide={() => setGuide(true)} />
        ))}
      </div>
      <SizeGuideModal open={guide} onClose={() => setGuide(false)} />
    </>
  );
}
