import { useEffect, useRef, useState } from "react";
import "./cart-drawer.css";
import {
  BIZUM_PHONE,
  ORDER_ERRORS,
  PAY_LABEL,
  SB_HEADERS,
  SHIPPING_CENTS,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  WHATSAPP,
  eur,
  isDemo,
  isPresaleId,
  prettyPhone,
  shippingFor,
  type Payment,
} from "../lib/shop";

const CART_KEY = "iso_cart";

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
  // Vacío en el primer render (igual que el HTML del servidor) y luego se carga lo guardado
  const [cart, setCart] = useState<CartItem[]>([]);
  useEffect(() => setCart(getStoredCart()), []);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"cart" | "checkout" | "done">("cart");
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", address: "", city: "", postal_code: "" });
  const [payment, setPayment] = useState<Payment>("bizum");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ code: string; total: number; payment: Payment; lines: string; presale: boolean } | null>(null);

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
    // al cerrar tras un pedido, el siguiente empieza en el carrito
    setView((v) => (v === "done" ? "cart" : v));
    setError(null);
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

  const shipping = shippingFor(customer.postal_code);
  const total = subtotal + shipping;
  const hasPresale = cart.some((i) => isPresaleId(i.id));
  const set = (k: keyof typeof customer) => (e: React.ChangeEvent<HTMLInputElement>) => setCustomer({ ...customer, [k]: e.target.value });

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0 || sending) return;
    setError(null);
    const lines = cart.map((i) => `• ${i.name} (talla ${i.size}) x${i.qty}`).join("\n");
    if (isDemo()) {
      // Vista de prueba: no se guarda nada
      setOrder({ code: "ISO-DEMO1", total, payment, lines, presale: hasPresale });
      persist([]);
      setView("done");
      return;
    }
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError("No se ha podido conectar. Escríbenos por WhatsApp y te lo preparamos.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/place_order`, {
        method: "POST",
        headers: SB_HEADERS,
        body: JSON.stringify({
          p_items: cart.map((i) => ({ product_id: i.id, size: i.size, qty: i.qty })),
          p_customer: customer,
          p_payment: payment,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(ORDER_ERRORS[data?.error] ?? "No se ha podido hacer el pedido. Inténtalo de nuevo o escríbenos por WhatsApp.");
        return;
      }
      setOrder({ code: data.code, total: data.total_cents, payment, lines, presale: hasPresale });
      persist([]);
      setView("done");
      window.dispatchEvent(new CustomEvent("iso-order-placed"));
    } catch {
      setError("No se ha podido conectar. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  const waText = (o: NonNullable<typeof order>) =>
    `Hola! Acabo de hacer el pedido ${o.code}:\n${o.lines}\nTotal: ${eur(o.total)} · Pago: ${PAY_LABEL[o.payment]}\n${customer.name} · ${customer.email}`;

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
          {view === "checkout" ? (
            <button type="button" className="cart-back" onClick={() => setView("cart")}>← Carrito</button>
          ) : (
            <h2>{view === "done" ? "Pedido hecho" : "Tu carrito"}</h2>
          )}
          <button className="cart-close" aria-label="Cerrar carrito" onClick={closeDrawer}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {view === "cart" && (
          <>
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
                      <p className="cart-item-meta">
                        Talla: {item.size}
                        {isPresaleId(item.id) && <span className="cart-tag">Preventa</span>}
                      </p>
                      <div className="cart-item-row">
                        <div className="cart-qty">
                          <button type="button" onClick={() => setQty(item.id, item.size, item.qty - 1)}>−</button>
                          <span>{item.qty}</span>
                          <button type="button" onClick={() => setQty(item.id, item.size, Math.min(isPresaleId(item.id) ? 5 : 20, item.qty + 1))}>+</button>
                        </div>
                        <span className="cart-item-price">{formatPrice(item.price * item.qty)}</span>
                      </div>
                      <button type="button" className="cart-item-remove" onClick={() => removeFromCart(item.id, item.size)}>
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
              <p className="cart-shipping-note">
                Envío gratis en Santander · resto de España {eur(SHIPPING_CENTS)}.
                {hasPresale && " Las prendas de preventa se envían al cerrar la preventa."}
              </p>
              <button className="cart-checkout-btn" disabled={cart.length === 0} onClick={() => setView("checkout")}>
                Finalizar compra
              </button>
            </div>
          </>
        )}

        {view === "checkout" && (
          <form className="cart-checkout" onSubmit={placeOrder}>
            <div className="cart-form">
              <label className="wide">Nombre y apellidos<input required autoComplete="name" value={customer.name} onChange={set("name")} /></label>
              <label className="wide">Email<input required type="email" autoComplete="email" value={customer.email} onChange={set("email")} /></label>
              <label className="wide"><span>Teléfono <i>(opcional)</i></span><input type="tel" autoComplete="tel" value={customer.phone} onChange={set("phone")} /></label>
              <label className="wide">Dirección<input required autoComplete="street-address" value={customer.address} onChange={set("address")} /></label>
              <label>Ciudad<input required autoComplete="address-level2" value={customer.city} onChange={set("city")} /></label>
              <label>Código postal<input required inputMode="numeric" pattern="[0-9]{5}" autoComplete="postal-code" value={customer.postal_code} onChange={set("postal_code")} /></label>
            </div>

            <fieldset className="cart-pay">
              <legend>Forma de pago</legend>
              {(
                [
                  ["bizum", "Bizum", "Al confirmar te damos el número y el concepto."],
                  ["tarjeta", "Tarjeta (Visa / Mastercard)", "Te enviamos un enlace de pago seguro."],
                  ["contrarreembolso", "Contrarreembolso", "Pagas en efectivo cuando te llega."],
                ] as [Payment, string, string][]
              ).map(([k, title, sub]) => (
                <label key={k} className={payment === k ? "on" : ""}>
                  <input type="radio" name="pay" checked={payment === k} onChange={() => setPayment(k)} />
                  <b>{title}</b>
                  <span>{sub}</span>
                </label>
              ))}
            </fieldset>

            <div className="cart-totals">
              <div><span>Subtotal</span><span>{eur(subtotal)}</span></div>
              <div>
                <span>Envío</span>
                <span>{customer.postal_code.trim().length === 5 ? (shipping ? eur(shipping) : "Gratis") : "—"}</span>
              </div>
              <div className="tot"><span>Total</span><span>{eur(total)}</span></div>
            </div>

            {error && <p className="cart-error" role="alert">{error}</p>}

            <button type="submit" className="cart-checkout-btn" disabled={sending}>
              {sending ? "Enviando…" : `Confirmar pedido · ${eur(total)}`}
            </button>
          </form>
        )}

        {view === "done" && order && (
          <div className="cart-done">
            <p className="cart-done-code">{order.code}</p>
            <p className="cart-done-total">Total: <b>{eur(order.total)}</b></p>
            <div className="cart-howto">
              {order.payment === "bizum" &&
                (BIZUM_PHONE ? (
                  <p>Haz un <b>Bizum de {eur(order.total)}</b> al <b>{prettyPhone(BIZUM_PHONE)}</b> con el concepto <b>{order.code}</b>.</p>
                ) : (
                  <p>Te mandamos por email el número para hacer el <b>Bizum de {eur(order.total)}</b> con el concepto <b>{order.code}</b>.</p>
                ))}
              {order.payment === "tarjeta" && <p>Te enviamos un <b>enlace de pago con tarjeta de {eur(order.total)}</b> por email.</p>}
              {order.payment === "contrarreembolso" && <p>Pagas <b>{eur(order.total)}</b> en efectivo cuando te llegue el pedido.</p>}
              {order.payment !== "contrarreembolso" && <p>Tu pedido queda reservado 24 horas mientras se completa el pago.</p>}
              {order.presale && <p>Las prendas de preventa se envían al cerrar la preventa.</p>}
            </div>
            <a className="cart-checkout-btn cart-wa" href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waText(order))}`} target="_blank" rel="noopener noreferrer">
              Avisar por WhatsApp
            </a>
            <button type="button" className="cart-item-remove" onClick={closeDrawer}>Seguir mirando</button>
          </div>
        )}
      </aside>
    </>
  );
}
