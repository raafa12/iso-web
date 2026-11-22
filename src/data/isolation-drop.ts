// Isolation drop: catálogo para el perchero y la tienda mientras no esté en Supabase.
// Las imágenes se rellenan cuando estén las fotos de cada prenda (delante / detrás, fondo transparente).
export interface DropProduct {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  tag?: string;
  sizes: string[];
  description: string;
  image_url: string;
  image_back_url?: string | null;
  color?: string | null;
}

const SIZES = ["S", "M", "L", "XL"];

export const ISOLATION_DROP: DropProduct[] = [
  {
    id: "isolation-drip-hoodie",
    name: "ISO Drip Hoodie",
    category: "Sudadera · Isolation drop",
    price_cents: 4000,
    tag: "Preventa",
    sizes: SIZES,
    description: "Sudadera oversize con el logo de ISO goteando en la espalda.",
    image_url: "/drop/drip-hoodie-front.webp",
    image_back_url: "/drop/drip-hoodie-back.webp",
    color: "Black",
  },
  {
    id: "isolation-isolate-yourself",
    name: "Isolate Yourself Tee",
    category: "Camiseta · Isolation drop",
    price_cents: 2499,
    tag: "Preventa",
    sizes: SIZES,
    description: "Camiseta oversize. Isolate Yourself y el jugador esperando su aislado, en la espalda.",
    image_url: "/drop/isolate-yourself-front.webp",
    image_back_url: "/drop/isolate-yourself-back.webp",
    color: "Black",
  },
  {
    id: "isolation-out-of-my-way",
    name: "Out Of My Waaay Tee",
    category: "Camiseta · Isolation drop",
    price_cents: 2499,
    tag: "Preventa",
    sizes: SIZES,
    description: "Camiseta oversize con Out of my waaay a pincel en la espalda.",
    image_url: "/drop/out-of-my-way-front.webp",
    image_back_url: "/drop/out-of-my-way-back.webp",
    color: "Black",
  },
  {
    id: "isolation-if-you-miss-her",
    name: "If You Miss Her Tee",
    category: "Camiseta · Isolation drop",
    price_cents: 2499,
    tag: "Preventa",
    sizes: SIZES,
    description: "If you miss her, call... for an ISO. Camiseta oversize, estampado delantero.",
    image_url: "/drop/if-you-miss-her-front.webp",
    image_back_url: "/drop/if-you-miss-her-back.webp",
    color: "Black",
  },
];

// Siempre a la venta (perchero de la home). Fotos provisionales hasta tener las reales.
const classicTee = (color: string, front: string, back: string): DropProduct => ({
  id: `iso-classic-tee-${color.toLowerCase()}`,
  name: "ISO Classic Tee",
  category: "Camiseta · Siempre disponible",
  price_cents: 1999,
  sizes: SIZES,
  description: "El logo de ISO en grande en el pecho. Basketball clothing brand. Oversize.",
  image_url: front,
  image_back_url: back,
  color,
});

export const ISO_CLASSICS: DropProduct[] = [
  classicTee("Black", "/rack/tee-icon-front.webp", "/rack/tee-icon-back.webp"),
  classicTee("White", "/rack/classic-white-front.webp", "/rack/classic-white-back.webp"),
  {
    id: "iso-classic-hoodie-black",
    name: "ISO Classic Hoodie",
    category: "Sudadera · Siempre disponible",
    price_cents: 4000,
    sizes: SIZES,
    description: "Sudadera oversize con el logo de ISO en el pecho.",
    image_url: "/rack/classic-hoodie-front.webp",
    image_back_url: "/rack/classic-hoodie-back.webp",
    color: "Black",
  },
];

export const PRESALE = {
  open: "2026-12-13T20:00:00+01:00",
  close: "2026-12-20T23:59:00+01:00",
  shipping: "Envío gratis en Santander",
};
