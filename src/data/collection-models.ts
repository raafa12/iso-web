// Los básicos agrupados por modelo (camiseta / sudadera) con sus colores.
// Lo usan la colección y el perchero de la home (misma ficha de prenda).
import type { Model } from "../components/CollectionReact";
import { ISO_CLASSICS } from "./isolation-drop";

const SWATCH: Record<string, string> = { Black: "#111111", White: "#f2f1ec", Grey: "#a9a9a6", "Sport Grey": "#b3b3b0" };

export const CLASSIC_MODELS: Model[] = [];
for (const p of ISO_CLASSICS) {
  let m = CLASSIC_MODELS.find((x) => x.name === p.name);
  if (!m) {
    m = { name: p.name, category: p.category.split(" · ")[0], description: p.description, price_cents: p.price_cents, variants: [] };
    CLASSIC_MODELS.push(m);
  }
  m.variants.push({
    id: p.id,
    color: p.color ?? "",
    swatch: SWATCH[p.color ?? ""] ?? "#888",
    sizes: p.sizes,
    front: p.image_url,
    back: p.image_back_url,
    frontMono: p.image_mono_url,
  });
}
