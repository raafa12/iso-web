// "Más productos" al final de la ficha de una prenda: fila con scroll horizontal.
// Las prendas de la misma página se abren ahí mismo; las de la otra página
// (colección ↔ preventa) llevan a esa prenda en su página.
import { ISO_CLASSICS, ISOLATION_DROP } from "../data/isolation-drop";
import { CLASSICS_ON_SALE, eur } from "../lib/shop";
import "./buy-now.css";

export type MoreItem = { id: string; name: string; price_cents: number; image: string };

// Portada de cada prenda: los clásicos por delante; el drop, por la cara del diseño
const DROP_COVER: Record<string, string> = {
  "isolation-if-you-miss-her": "front",
};
const classics: MoreItem[] = ISO_CLASSICS.map((p) => ({
  id: p.id,
  name: `${p.name} · ${p.color}`,
  price_cents: p.price_cents,
  image: p.image_url,
}));
const drop: MoreItem[] = ISOLATION_DROP.map((p) => ({
  id: p.id,
  name: p.name,
  price_cents: p.price_cents,
  image: DROP_COVER[p.id] === "front" || !p.image_back_url ? p.image_url : p.image_back_url,
}));

export default function MoreProducts({
  currentId,
  here,
  onPick,
}: {
  currentId: string;
  here: "collection" | "preventa";
  onPick: (id: string) => void;
}) {
  const local = here === "collection" ? classics : drop;
  const other = here === "collection" ? drop : classics;
  const mine = local.filter((p) => p.id !== currentId).map((p) => ({ ...p, href: null as string | null }));
  const theirs = other.map((p) => ({ ...p, href: `/${here === "collection" ? "preventa" : "collection"}?p=${p.id}` }));
  // Con los clásicos fuera de venta: en la colección el drop va primero y en la preventa no se enseñan los clásicos
  const list = CLASSICS_ON_SALE ? [...mine, ...theirs] : here === "collection" ? [...theirs, ...mine] : mine;
  return (
    <section className="more" aria-label="Más productos">
      <p className="more-title">Más productos</p>
      <ul className="more-row">
        {list.map((p) => (
          <li key={p.id}>
            {p.href ? (
              <a href={p.href} className="more-card">
                <Card p={p} tag={here === "collection" ? "Preventa" : null} />
              </a>
            ) : (
              <button type="button" className="more-card" onClick={() => onPick(p.id)}>
                <Card p={p} tag={null} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Card({ p, tag }: { p: MoreItem; tag: string | null }) {
  return (
    <>
      <span className="more-img">
        <img src={p.image} alt="" loading="lazy" draggable={false} />
        {tag && <em>{tag}</em>}
      </span>
      <span className="more-name">{p.name}</span>
      <span className="more-price">{eur(p.price_cents)}</span>
    </>
  );
}
