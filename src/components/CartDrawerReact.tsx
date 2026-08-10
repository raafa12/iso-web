import { useEffect, useRef, useState } from "react";
import "./cart-drawer.css";

const CART_KEY = "iso_cart";
const WHATSAPP_NUMBER = "34690342138";

// --- Tipos ---
// Antes esto vivía solo "en la cabeza" del que leía el código.
// Ahora TypeScript lo obliga a estar escrito, y avisa si algo no encaja.

interface CartItem {
  id: string;
  name: string;
  size: string;
  price: number; // en céntimos
  image: string;
  qty: number;
}

// Lo que llega desde fuera (Products.astro) al llamar a .add() —
// todavía no tiene "qty", eso lo añade el propio carrito.
type NewCartItem = Omit<CartItem, "qty">;

interface ISOCartAPI {
  add: (item: NewCartItem, qty?: number) => void;
  remove: (id: string, size: string) => void;
  setQty: (id: string, size: string, qty: number) => void;
  getAll: () => CartItem[];
  open: () => void;
}

// Le decimos a TypeScript que window.ISOCart puede existir,
// con esta forma exacta — así Products.astro también se beneficia
// del autocompletado y del chequeo de tipos si se convierte más adelante.
declare global {
  interface Window {
    ISOCart?: ISOCartAPI;
  }
}

function getStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

export default function CartDrawerReact() {
  const [cart, setCart] = useState<CartItem[]>(() => getStoredCart());
  const [isOpen, setIsOpen] = useState(false);

  // Manteniendo el mismo objeto en un ref para que las funciones expuestas
  // en window.ISOCart siempre lean el estado más reciente, no una copia vieja.
  const cartRef = useRef(cart);
  cartRef.current = cart;

  function persist(items: CartItem[]) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("iso-cart-updated", { detail: { items } }));
    setCart(items);
  }

  function addToCart(item: NewCartItem, qty: number = 1) {
    const items = getStoredCart();
    const existing = items.find((i) => i.id === item.id && i.size === item.size);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({ ...item, qty });
    }
    persist(items);
  }

  function removeFromCart(id: string, size: string) {
    persist(getStoredCart().filter((i) => !(i.id === id && i.size === size)));
  }

  function setQty(id: string, size: string, qty: number) {
    const items = getStoredCart();
    const item = items.find((i) => i.id === id && i.size === size);
    if (!item) return;
    if (qty <= 0) {
      removeFromCart(id, size);
      return;
    }
    item.qty = qty;
    persist(items);
  }

  function openDrawer() {
    setIsOpen(true);
  }

  function closeDrawer() {
    setIsOpen(false);
  }

  // --- Efectos: exponer la API global igual que antes, y engancharse a
  // los elementos que viven FUERA del árbol de React (botón del navbar,
  // badge de contador) ---

  useEffect(() => {
    window.ISOCart = {
      add: addToCart,
      remove: removeFromCart,
      setQty,
      getAll: () => cartRef.current,
      open: openDrawer,
    };

    function handleOpenClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const trigger = target.closest("[data-cart-open]");
      if (!trigger) return;
      e.preventDefault();
      openDrawer();
    }

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDrawer();
    }

    document.addEventListener("click", handleOpenClick);
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("click", handleOpenClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  // Actualiza el badge del navbar (vive fuera de React) cada vez que cambia el carrito
  useEffect(() => {
    const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
    document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
      el.textContent = String(totalQty);
      el.style.display = totalQty > 0 ? "flex" : "none";
    });
  }, [cart]);

  // Bloquear/desbloquear el scroll del body al abrir/cerrar
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
  }, [isOpen]);

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  function handleCheckout() {
    if (cart.length === 0) return;
    const lines = cart
      .map((i) => `• ${i.name} (talla ${i.size}) x${i.qty} — ${formatPrice(i.price * i.qty)}`)
      .join("\n");
    const total = formatPrice(subtotal);
    const msg = `Hola! Quiero hacer este pedido:\n\n${lines}\n\nTotal: ${total}\n\n¿Me confirmáis disponibilidad y forma de pago/envío?`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <div
        className={`cart-overlay${isOpen ? " open" : ""}`}
        hidden={!isOpen}
        onClick={closeDrawer}
      />

      <aside
        className={`cart-drawer${isOpen ? " open" : ""}`}
        aria-hidden={!isOpen}
        aria-label="Carrito de compra"
      >
        <div className="cart-header">
          <h2>Tu carrito</h2>
          <button className="cart-close" aria-label="Cerrar carrito" onClick={closeDrawer}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="cart-items">
          {cart.length === 0 ? (
            <p className="cart-empty">Tu carrito está vacío.</p>
          ) : (
            cart.map((item) => (
              <div className="cart-item" key={`${item.id}-${item.size}`}>
                <div className="cart-item-img">
                  <img src={item.image} alt={item.name} />
                </div>
                <div className="cart-item-info">
                  <p className="cart-item-name">{item.name}</p>
                  <p className="cart-item-meta">Talla: {item.size}</p>
                  <div className="cart-item-row">
                    <div className="cart-qty">
                      <button type="button" onClick={() => setQty(item.id, item.size, item.qty - 1)}>
                        −
                      </button>
                      <span>{item.qty}</span>
                      <button type="button" onClick={() => setQty(item.id, item.size, item.qty + 1)}>
                        +
                      </button>
                    </div>
                    <span className="cart-item-price">{formatPrice(item.price * item.qty)}</span>
                  </div>
                  <button
                    type="button"
                    className="cart-item-remove"
                    onClick={() => removeFromCart(item.id, item.size)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cart-footer">
          <div className="cart-subtotal">
            <span>Subtotal</span>
            <span className="cart-subtotal-amount">{formatPrice(subtotal)}</span>
          </div>
          <p className="cart-shipping-note">Envío calculado en el siguiente paso.</p>
          <button className="cart-checkout-btn" disabled={cart.length === 0} onClick={handleCheckout}>
            Finalizar compra
          </button>
        </div>
      </aside>
    </>
  );
}
