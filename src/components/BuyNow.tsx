// Comprar desde la ficha de la prenda, sin pasar por el carrito:
//   - Apple Pay / Google Pay (Stripe): abre el monedero directamente
//   - Bizum: lo mete en el carrito y abre el formulario con Bizum ya elegido
//   - debajo, "Añadir al carrito" para quien quiera llevarse varias cosas
import { useState } from "react";
import ExpressPay from "./ExpressPay";
import BizumSheet from "./BizumSheet";
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
  const [bizum, setBizum] = useState(false);
  const checkout = (pay: "bizum" | "tarjeta" | "paypal") => {
    window.ISOCart?.add(line, qty);
    close();
    window.setTimeout(() => window.ISOCart?.checkout?.(pay), 50);
  };
  return (
    <div className="buy-now">
      <button type="button" className="buy-cart" onClick={onAddToCart} disabled={added}>
        {added ? "Añadido ✓" : `Añadir al carrito · ${total}`}
      </button>
      {STRIPE_ENABLED && (
        <ExpressPay
          cart={[{ ...line, qty }]}
          orText={null}
          onPaid={(code) => (location.href = `/pago?estado=ok&code=${code}`)}
        />
      )}
      <button type="button" className="buy-bizum" onClick={() => setBizum(true)} aria-label="Comprar con Bizum">
        <span>Comprar con</span> <span className="buy-bizum-logo">bizum</span>
      </button>
      {bizum && <BizumSheet line={line} qty={qty} onClose={() => setBizum(false)} />}
      <button type="button" className="buy-more" onClick={() => checkout(STRIPE_ENABLED ? "tarjeta" : "paypal")}>
        Más opciones de pago
      </button>
    </div>
  );
}
