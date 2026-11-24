// Comprar desde la ficha de la prenda, sin pasar por el carrito:
//   - Apple Pay / Google Pay (Stripe): abre el monedero directamente
//   - Bizum: lo mete en el carrito y abre el formulario con Bizum ya elegido
//   - debajo, "Añadir al carrito" para quien quiera llevarse varias cosas
import ExpressPay from "./ExpressPay";
import "./buy-now.css";
import { STRIPE_ENABLED, eur } from "../lib/shop";

export type BuyLine = { id: string; name: string; size: string; price: number; image: string };

export default function BuyNow({
  line,
  qty,
  close,
  onAddToCart,
  added = false,
}: {
  line: BuyLine;
  qty: number;
  close: () => void;
  onAddToCart: () => void;
  added?: boolean;
}) {
  const total = eur(line.price * qty);
  const checkout = (pay: "bizum" | "tarjeta") => {
    window.ISOCart?.add(line, qty);
    close();
    window.setTimeout(() => window.ISOCart?.checkout?.(pay), 50);
  };
  return (
    <div className="buy-now">
      {STRIPE_ENABLED && (
        <ExpressPay
          cart={[{ ...line, qty }]}
          orText="o paga con"
          onPaid={(code) => (location.href = `/pago?estado=ok&code=${code}`)}
        />
      )}
      <button type="button" className="buy-bizum" onClick={() => checkout("bizum")}>
        Pagar {total} con <span className="buy-bizum-logo">bizum</span>
      </button>
      <div className="buy-more">
        <button type="button" onClick={onAddToCart} disabled={added}>
          {added ? "Añadido ✓" : "Añadir al carrito"}
        </button>
        {STRIPE_ENABLED && (
          <>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => checkout("tarjeta")}>Pagar con tarjeta</button>
          </>
        )}
      </div>
    </div>
  );
}
