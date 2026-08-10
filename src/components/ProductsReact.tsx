import { useEffect, useState } from "react";
import "./products.css";

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// --- Tipos ---

interface Product {
  id: string;
  name: string;
  category: string;
  price_cents: number;
  tag?: string;
  sizes: string[];
  description: string;
  image_url: string;
}

interface CartItemToAdd {
  id: string;
  name: string;
  size: string;
  price: number;
  image: string;
}

type LoadStatus = "loading" | "error" | "ready";

interface SizeGuideModalProps {
  open: boolean;
  onClose: () => void;
}

function SizeGuideModal({ open, onClose }: SizeGuideModalProps) {
  return (
    <div
      className={`size-guide-overlay${open ? " open" : ""}`}
      hidden={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="size-guide-modal">
        <button type="button" className="size-guide-close" aria-label="Cerrar guía de tallas" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <h3>Guía de tallas</h3>
        <img src="/tallas.png" alt="Tabla de tallas ISO: ancho y largo en cm para XS, S, M, L, XL y 2XL" />
      </div>
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  onAddToCart: (item: CartItemToAdd) => void;
  onOpenSizeGuide: () => void;
}

function ProductCard({ product, onAddToCart, onOpenSizeGuide }: ProductCardProps) {
  // Empieza con la talla "M" seleccionada si existe, si no la del medio —
  // igual que hacía el script original (index 2 del array de tallas)
  const defaultSize = product.sizes.includes("M") ? "M" : product.sizes[Math.floor(product.sizes.length / 2)];
  const [selectedSize, setSelectedSize] = useState<string>(defaultSize);
  const [justAdded, setJustAdded] = useState(false);

  function handleAdd() {
    onAddToCart({
      id: product.id,
      name: product.name,
      size: selectedSize,
      price: product.price_cents,
      image: product.image_url,
    });

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }

  return (
    <article className="product-card" data-id={product.id}>
      <div className="card-image">
        <img src={product.image_url} alt={product.name} loading="lazy" width={400} height={500} />
        {product.tag && <span className="card-tag">{product.tag}</span>}
        <div className="card-overlay">
          <p className="overlay-desc">{product.description}</p>
        </div>
      </div>

      <div className="card-body">
        <div className="card-header">
          <div>
            <p className="card-cat">{product.category}</p>
            <h3 className="card-name">{product.name}</h3>
          </div>
          <span className="card-price">{formatPrice(product.price_cents)}</span>
        </div>

        <div className="size-selector" role="group" aria-label="Elige tu talla">
          <p className="size-label">Talla</p>
          <div className="sizes">
            {product.sizes.map((s) => (
              <button
                key={s}
                type="button"
                className={`size-btn${s === selectedSize ? " active" : ""}`}
                aria-pressed={s === selectedSize}
                onClick={() => setSelectedSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <button type="button" className="size-guide-link" onClick={onOpenSizeGuide}>
            Guía de tallas →
          </button>
        </div>

        <div className="buy-options">
          <button
            type="button"
            className="btn-buy btn-add-cart"
            aria-label={`Añadir ${product.name} al carrito`}
            disabled={justAdded}
            onClick={handleAdd}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span className="buy-label">{justAdded ? "Añadido ✓" : "Añadir al carrito"}</span>
          </button>
        </div>

        <div className="trust">
          <span className="trust-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><path d="m16 8-8.5 8.5" /><path d="M2 2l20 20" /></svg>
            100% algodón
          </span>
          <span className="trust-item">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
            Te respondemos por WhatsApp
          </span>
        </div>
      </div>
    </article>
  );
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default function ProductsReact() {
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);

  // ---- useEffect + fetch: aquí es donde se traen los productos de Supabase ----
  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.asc`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });

        if (!res.ok) throw new Error(`Supabase respondió ${res.status}`);

        const data: Product[] = await res.json();
        setProducts(data);
        setStatus("ready");
      } catch (err) {
        console.error("Error cargando productos:", err);
        setStatus("error");
      }
    }

    loadProducts();
  }, []); // array vacío -> se ejecuta solo una vez, al montar el componente

  function handleAddToCart(item: CartItemToAdd) {
    window.ISOCart?.add(item);
    window.ISOCart?.open();
  }

  return (
    <section className="products" id="collection">
      <div className="section-head">
        <div className="head-left">
          <h2 className="section-title">La Colección</h2>
        </div>
      </div>

      {status === "loading" && <p className="products-status">Cargando colección…</p>}

      {status === "error" && (
        <p className="products-status error">
          No hemos podido cargar la colección ahora mismo. Prueba a recargar la página.
        </p>
      )}

      {status === "ready" && (
        <div className="products-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
              onOpenSizeGuide={() => setSizeGuideOpen(true)}
            />
          ))}
        </div>
      )}

      <SizeGuideModal open={sizeGuideOpen} onClose={() => setSizeGuideOpen(false)} />
    </section>
  );
}
