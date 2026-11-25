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
  image_mono_url?: string | null; // delante con el logo de un solo color (sin el balón azul)
  image_side_url?: string | null; // foto real de lado en la percha (perchero de la home)
  color?: string | null;
}

const SIZES = ["S", "M", "L", "XL"];

export const ISOLATION_DROP: DropProduct[] = [
  {
    id: "isolation-drip-hoodie",
    name: "ISO Drip Hoodie",
    category: "Sudadera · Isolation drop",
    price_cents: 3499,
    tag: "Preventa",
    sizes: SIZES,
    description: "Sudadera con el logo de ISO goteando en la espalda.",
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
    description: "Isolate Yourself y el jugador esperando su aislado, en la espalda. 100% algodón 220gsm. Fit: Oversize.",
    image_url: "/drop/isolate-yourself-front.webp",
    image_back_url: "/drop/isolate-yourself-back.webp",
    color: "Black",
  },
  {
    id: "isolation-not-like-them",
    name: "Not Like Them Tee",
    category: "Camiseta · Isolation drop",
    price_cents: 2499,
    tag: "Preventa",
    sizes: SIZES,
    description: "Not like them delante y el rebaño con la oveja negra en la espalda. 100% algodón 220gsm. Fit: Oversize.",
    image_url: "/drop/not-like-them-front.webp",
    image_back_url: "/drop/not-like-them-back.webp",
    color: "Black",
  },
  {
    id: "isolation-if-you-miss-her",
    name: "If You Miss Her Tee",
    category: "Camiseta · Isolation drop",
    price_cents: 2499,
    tag: "Preventa",
    sizes: SIZES,
    description: "If you miss her, call... for an ISO. Estampado delantero. 100% algodón 220gsm. Fit: Oversize.",
    image_url: "/drop/if-you-miss-her-front.webp",
    image_back_url: "/drop/if-you-miss-her-back.webp",
    color: "Black",
  },
];

// Siempre a la venta (perchero de la home y /collection). Precios y tallas tienen que coincidir con supabase/tienda.sql
const classicTee = (color: string, slug: string, sizes: string[] = SIZES): DropProduct => ({
  id: `iso-classic-tee-${slug}`,
  name: "ISO Classic Tee",
  category: "Camiseta · Siempre disponible",
  price_cents: 1999,
  sizes,
  description: "El logo de ISO en grande en el pecho. Basketball clothing brand. 100% algodón 220gsm. Fit: Oversize.",
  image_url: `/rack/classic-tee-${slug}-front.webp`,
  image_mono_url: `/rack/classic-tee-${slug}-front-mono.webp`,
  image_side_url: `/rack/classic-tee-${slug}-side.webp`,
  image_back_url: `/rack/classic-tee-${slug}-back.webp`,
  color,
});
const classicHoodie = (color: string, slug: string): DropProduct => ({
  id: `iso-classic-hoodie-${slug}`,
  name: "ISO Classic Hoodie",
  category: "Sudadera · Siempre disponible",
  price_cents: 2999,
  sizes: SIZES,
  description: "Sudadera con el logo de ISO en el pecho.",
  image_url: `/rack/classic-hoodie-${slug}-front.webp`,
  image_mono_url: `/rack/classic-hoodie-${slug}-front-mono.webp`,
  image_side_url: `/rack/classic-hoodie-${slug}-side.webp`,
  image_back_url: `/rack/classic-hoodie-${slug}-back.webp`,
  color,
});

export const ISO_CLASSICS: DropProduct[] = [
  classicTee("Black", "black"),
  classicTee("White", "white"),
  classicTee("Grey", "grey", ["M", "L"]),
  classicHoodie("Black", "black"),
  classicHoodie("Sport Grey", "grey"),
];

export const PRESALE = {
  open: "2026-12-14T00:00:00+01:00",
  close: "2026-12-20T23:59:59+01:00",
  shipping: "Envío gratis en Santander",
  // ⬇︎ Único dato que falta: el teléfono del Bizum (9 cifras, con o sin espacios). Vacío = "te lo enviamos por WhatsApp".
  bizumPhone: "601105483",
  shippingCents: 499, // envío fuera de Santander
  unitsPerItem: 25, // unidades por prenda (tiene que coincidir con supabase/preventa-isolation.sql)
};
