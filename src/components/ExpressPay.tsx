// Botón de pago rápido en el carrito: Apple Pay / Google Pay (y PayPal si se activa en Stripe).
// El monedero da el nombre, el email y la dirección, así que no hay formulario.
// Flujo: el cliente confirma en el monedero → /api/pago-express hace el pedido y el
// PaymentIntent → se confirma el pago → el webhook de Stripe lo marca como pagado.
import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements, type StripeExpressCheckoutElement } from "@stripe/stripe-js";
import { ORDER_ERRORS, SHIPPING_CENTS, isSantander } from "../lib/shop";

const PK = import.meta.env.PUBLIC_STRIPE_KEY as string | undefined;

type Line = { id: string; name: string; size: string; qty: number; price: number };

export default function ExpressPay({ cart, onPaid }: { cart: Line[]; onPaid: (code: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cartRef = useRef(cart);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elsRef = useRef<StripeElements | null>(null);

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartRef.current = cart;

  // Si cambia el carrito, se actualiza el importe del monedero
  useEffect(() => {
    if (subtotal > 0) elsRef.current?.update({ amount: subtotal + SHIPPING_CENTS });
  }, [subtotal]);

  useEffect(() => {
    if (!PK || !box.current || subtotal === 0) return;
    let ece: StripeExpressCheckoutElement | null = null;
    let cancelled = false;

    (async () => {
      const stripe: Stripe | null = await loadStripe(PK, { locale: "es" });
      if (!stripe || cancelled || !box.current) return;
      const sub = () => cartRef.current.reduce((s, i) => s + i.price * i.qty, 0);
      const elements = stripe.elements({
        mode: "payment",
        amount: sub() + SHIPPING_CENTS,
        currency: "eur",
        appearance: { theme: "night", variables: { borderRadius: "0px" } },
      });
      elsRef.current = elements;
      const rate = (free: boolean) => ({
        id: free ? "gratis" : "envio",
        displayName: free ? "Envío gratis en Santander" : "Envío",
        amount: free ? 0 : SHIPPING_CENTS,
      });
      let shipping = SHIPPING_CENTS;

      ece = elements.create("expressCheckout", {
        buttonType: { applePay: "buy", googlePay: "buy" },
        buttonTheme: { applePay: "white", googlePay: "white" },
        buttonHeight: 50,
        emailRequired: true,
        phoneNumberRequired: false,
        shippingAddressRequired: true,
        allowedShippingCountries: ["ES"],
        shippingRates: [rate(false)],
        paymentMethods: { link: "never", klarna: "never", amazonPay: "never" },
        layout: { maxColumns: 1, maxRows: 3, overflow: "never" },
      });

      ece.on("availablepaymentmethodschange", ({ paymentMethods }) => setAvailable(!!paymentMethods));

      ece.on("click", (event) => {
        setError(null);
        event.resolve({
          lineItems: cartRef.current.map((i) => ({ name: `${i.name} · ${i.size}${i.qty > 1 ? ` x${i.qty}` : ""}`, amount: i.price * i.qty })),
        });
      });

      ece.on("shippingaddresschange", (event) => {
        const free = isSantander(event.address.postal_code || "");
        shipping = free ? 0 : SHIPPING_CENTS;
        elements.update({ amount: sub() + shipping });
        event.resolve({ shippingRates: [rate(free)] });
      });

      ece.on("cancel", () => {
        shipping = SHIPPING_CENTS;
        elements.update({ amount: sub() + SHIPPING_CENTS });
      });

      ece.on("confirm", async (event) => {
        const fail = (msg: string) => {
          event.paymentFailed({ reason: "fail" });
          setError(msg);
        };
        const { error: submitError } = await elements.submit();
        if (submitError) return fail(submitError.message || "No se ha podido completar el pago");

        const a = event.shippingAddress?.address;
        const customer = {
          name: event.shippingAddress?.name || event.billingDetails?.name || "",
          email: event.billingDetails?.email || "",
          phone: event.billingDetails?.phone || "",
          address: [a?.line1, a?.line2].filter(Boolean).join(", "),
          city: a?.city || "",
          postal_code: (a?.postal_code || "").replace(/\s/g, ""),
        };
        const res = await fetch("/api/pago-express", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cartRef.current.map((i) => ({ product_id: i.id, size: i.size, qty: i.qty })),
            customer,
            expected_cents: sub() + shipping,
          }),
        }).then((r) => r.json()).catch(() => null);

        if (!res?.client_secret) {
          return fail(ORDER_ERRORS[res?.error] ?? res?.message ?? "No se ha podido hacer el pedido. Inténtalo de nuevo o usa otra forma de pago.");
        }

        const { error: confirmError } = await stripe.confirmPayment({
          elements,
          clientSecret: res.client_secret,
          confirmParams: { return_url: `${location.origin}/pago?estado=ok&code=${res.code}` },
          redirect: "if_required",
        });
        if (confirmError) {
          // Libera las unidades: el pedido no se ha pagado
          fetch("/api/pago-express", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cancel: res.code }),
          }).catch(() => {});
          return fail(confirmError.message || "El pago no se ha completado");
        }
        onPaid(res.code);
      });

      ece.mount(box.current);
    })();

    return () => {
      cancelled = true;
      ece?.destroy();
      elsRef.current = null;
    };
    // Se monta una vez por apertura del carrito; el importe se actualiza aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal === 0]);

  if (!PK) return null;
  return (
    <div className="cart-express" hidden={!available && !error}>
      <div ref={box} />
      {error && <p className="cart-error">{error}</p>}
      {available && <p className="cart-express-or"><span>o elige otra forma de pago</span></p>}
    </div>
  );
}
