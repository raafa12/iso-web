import { useEffect, useRef, useState } from "react";
import ExpressPay from "./ExpressPay";
import "./cart-drawer.css";
import { PayBadge } from "./PayBadges.tsx";
import {
  BIZUM_PHONE,
  PAYPAL_URL,
  STRIPE_ENABLED,
  CLASSICS_ON_SALE,
  isClassic,
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

// La foto del carrito sale del id del producto (no de la que se guardó al añadirlo),
// así un carrito guardado con una versión anterior de la web sigue viéndose bien.
function cartImage(item: { id: string; image: string }) {
  const classic = item.id.match(/^iso-classic-(tee|hoodie)-([a-z]+)(-mono)?$/);
  if (classic) return `/rack/classic-${classic[1]}-${classic[2]}-front${classic[3] ?? ""}.webp`;
  if (item.id.startsWith("isolation-")) return `/drop/${item.id.slice("isolation-".length)}-front.webp`;
  return item.image;
}

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
  // Abre el carrito directamente en el formulario con una forma de pago elegida
  checkout?: (pay?: Payment) => void;
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
    const items = raw ? (JSON.parse(raw) as CartItem[]) : [];
    // Mientras los clásicos no estén a la venta, se quitan de carritos guardados
    return CLASSICS_ON_SALE ? items : items.filter((i) => !isClassic(i.id));
  } catch {
    return [];
  }
}

function formatPrice(cents: number): string {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 });
}

export default function CartDrawerReact() {
  // Vacío en el primer render (igual que el HTML del servidor) y luego se carga lo guardado
  const [cart, setCart] = useState<CartItem[]>([]);
  useEffect(() => setCart(getStoredCart()), []);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"cart" | "checkout" | "done">("cart");
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", address: "", city: "", postal_code: "" });
  const [payment, setPayment] = useState<Payment>(STRIPE_ENABLED ? "tarjeta" : "bizum");
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
    if (!CLASSICS_ON_SALE && isClassic(item.id)) return;
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
      checkout: (pay?: Payment) => {
        if (pay && (pay !== "tarjeta" || STRIPE_ENABLED)) setPayment(pay);
        setError(null);
        setView("checkout");
        openDrawer();
      },
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
      let res: Response;
      try {
        res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/place_order`, {
          method: "POST",
          headers: SB_HEADERS,
          body: JSON.stringify({
            p_items: cart.map((i) => ({ product_id: i.id, size: i.size, qty: i.qty })),
            p_customer: customer,
            p_payment: payment,
          }),
        });
      } catch (err) {
        console.error("[ISO] pedido: no hay conexión con Supabase", err);
        setError("No se ha podido conectar con la tienda. Inténtalo en un momento o escríbenos por WhatsApp.");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        console.error("[ISO] pedido rechazado", res.status, data);
        if (res.status === 404 || data?.code === "PGRST202") {
          setError("La tienda todavía no está activada. Escríbenos por WhatsApp y te lo preparamos.");
        } else {
          setError(ORDER_ERRORS[data?.error] ?? "No se ha podido hacer el pedido. Inténtalo de nuevo o escríbenos por WhatsApp.");
        }
        return;
      }
      if (payment === "tarjeta") {
        // Stripe: el carrito se vacía y se abre la página de pago; los correos salen al pagar
        const pay = await fetch("/api/pago-stripe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: data.code }),
        }).then((r) => r.json()).catch(() => null);
        persist([]);
        window.dispatchEvent(new CustomEvent("iso-order-placed"));
        location.href = pay?.url ?? `/pago?estado=error&code=${data.code}`;
        return;
      }
      setOrder({ code: data.code, total: data.total_cents, payment, lines, presale: hasPresale });
      // Correo de confirmación al cliente + aviso a ISO (si falla, el pedido ya está hecho)
      fetch("/api/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: data.code }),
        keepalive: true,
      }).catch(() => {});
      persist([]);
      setView("done");
      window.dispatchEvent(new CustomEvent("iso-order-placed"));
    } catch {
      setError("No se ha podido conectar. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  // Pedido completo para mandarlo por WhatsApp si la tienda no responde
  const waFallback = () =>
    [
      "Hola! Quiero hacer este pedido:",
      "",
      ...cart.map((i) => `• ${i.name} (talla ${i.size}) x${i.qty} — ${eur(i.price * i.qty)}`),
      "",
      `Subtotal: ${eur(subtotal)}`,
      `Envío: ${customer.postal_code.trim().length === 5 ? (shipping ? eur(shipping) : "gratis") : "—"}`,
      `Total: ${eur(total)}`,
      `Pago: ${PAY_LABEL[payment]}`,
      "",
      `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`,
      customer.email,
      `${customer.address}, ${customer.postal_code} ${customer.city}`,
    ].join("\n");

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
                      <img src={cartImage(item)} alt={item.name} onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logo-mark.png"; }} />
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
              {STRIPE_ENABLED && cart.length > 0 && (
                <ExpressPay
                  cart={cart}
                  onPaid={(code) => {
                    persist([]);
                    window.dispatchEvent(new CustomEvent("iso-order-placed"));
                    location.href = `/pago?estado=ok&code=${code}`;
                  }}
                />
              )}
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
                  ["tarjeta", "Tarjeta · Apple Pay · Google Pay"],
                  ["bizum", "Bizum"],
                  ["paypal", "PayPal"],
                  ["contrarreembolso", "Contrarreembolso"],
                ] as [Payment, string][]
              ).filter(([k]) => k !== "tarjeta" || STRIPE_ENABLED).map(([k, title]) => (
                <label key={k} className={payment === k ? "on" : ""}>
                  <input type="radio" name="pay" checked={payment === k} onChange={() => setPayment(k)} />
                  <b>{title}</b>
                  <PayBadge method={k} />
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

            {error && (
              <div className="cart-error-box" role="alert">
                <p className="cart-error">{error}</p>
                <a className="cart-wa-btn" href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(waFallback())}`} target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
                    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.31-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.16-3.49-8.41" />
                  </svg>
                  Hacer el pedido por WhatsApp
                </a>
              </div>
            )}

            <button type="submit" className="cart-checkout-btn" disabled={sending}>
              {sending ? (payment === "tarjeta" ? "Abriendo el pago…" : "Enviando…") : payment === "tarjeta" ? `Pagar · ${eur(total)}` : `Confirmar pedido · ${eur(total)}`}
            </button>
          </form>
        )}

        {view === "done" && order && (
          <div className="cart-done">
            <p className="cart-done-code">{order.code}</p>
            <p className="cart-done-total">Total: <b>{eur(order.total)}</b></p>
            <p className="cart-done-mail">Te hemos mandado el resumen a tu correo.</p>
            <div className="cart-howto">
              {order.payment === "bizum" &&
                (BIZUM_PHONE ? (
                  <p>Haz un <b>Bizum de {eur(order.total)}</b> al <b>{prettyPhone(BIZUM_PHONE)}</b> con el concepto <b>{order.code}</b>.</p>
                ) : (
                  <p>Te mandamos por email el número para hacer el <b>Bizum de {eur(order.total)}</b> con el concepto <b>{order.code}</b>.</p>
                ))}
              {order.payment === "paypal" && (
                <p>Paga <b>{eur(order.total)}</b> en nuestro <a href={PAYPAL_URL} target="_blank" rel="noopener noreferrer"><b>PayPal</b></a> y pon <b>{order.code}</b> en la nota del pago.</p>
              )}
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
