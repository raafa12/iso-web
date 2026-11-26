// Botón de pago rápido: Apple Pay / Google Pay con el Payment Request Button de Stripe.
// El monedero da el nombre, el email y la dirección, así que no hay formulario.
// Flujo: el cliente confirma en el monedero → /api/pago-express hace el pedido y el
// PaymentIntent → se confirma con el método del monedero → el webhook lo marca pagado.
import { vipParam } from "../lib/vip";
import { useEffect, useRef, useState } from "react";
import { loadStripe, type PaymentRequest } from "@stripe/stripe-js";
import "./cart-drawer.css";
import { ORDER_ERRORS, SHIPPING_CENTS, isSantander } from "../lib/shop";

const PK = import.meta.env.PUBLIC_STRIPE_KEY as string | undefined;

type Line = { id: string; name: string; size: string; qty: number; price: number };

// Diagnóstico solo si la dirección lleva ?debugpay (no se queda guardado)
const DEBUG = typeof location !== "undefined" && location.search.includes("debugpay");

export default function ExpressPay({
  cart,
  onPaid,
  orText = "o elige otra forma de pago",
}: {
  cart: Line[];
  onPaid: (code: string) => void;
  orText?: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cartRef = useRef(cart);
  const prRef = useRef<PaymentRequest | null>(null);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<string[]>([]);
  const log = (m: string) => {
    console.log("[ISO pago rápido]", m);
    if (DEBUG) setDiag((d) => [...d, m]);
  };

  cartRef.current = cart;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const sub = () => cartRef.current.reduce((s, i) => s + i.price * i.qty, 0);
  const items = () =>
    cartRef.current.map((i) => ({ label: `${i.name} · ${i.size}${i.qty > 1 ? ` x${i.qty}` : ""}`, amount: i.price * i.qty }));
  const option = (free: boolean) => ({
    id: free ? "gratis" : "envio",
    label: free ? "Envío gratis en Santander" : "Envío",
    detail: free ? "Santander" : "Península",
    amount: free ? 0 : SHIPPING_CENTS,
  });

  // Si cambia el carrito (talla, cantidad), se actualiza el importe del monedero
  useEffect(() => {
    if (!prRef.current || subtotal === 0) return;
    try {
      prRef.current.update({ total: { label: "ISO", amount: subtotal + SHIPPING_CENTS }, displayItems: items(), shippingOptions: [option(false)] });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  useEffect(() => {
    log(`clave pública: ${PK ? PK.slice(0, 8) + "…" : "FALTA (PUBLIC_STRIPE_KEY)"}`);
    if (!PK || !box.current || subtotal === 0) return;
    let cancelled = false;
    let btn: { destroy: () => void } | null = null;

    (async () => {
      try {
        const stripe = await loadStripe(PK, { locale: "es" });
        log(stripe ? "Stripe.js cargado" : "Stripe.js no disponible");
        if (!stripe || cancelled) return;

        const pr = stripe.paymentRequest({
          country: "ES",
          currency: "eur",
          total: { label: "ISO", amount: sub() + SHIPPING_CENTS },
          displayItems: items(),
          requestPayerName: true,
          requestPayerEmail: true,
          requestPayerPhone: false,
          requestShipping: true,
          shippingOptions: [option(false)],
        });
        prRef.current = pr;

        const can = await pr.canMakePayment();
        log(`monedero disponible: ${can ? Object.entries(can).filter(([, v]) => v).map(([k]) => k).join(", ") || "sí" : "ninguno"}`);
        if (!can || cancelled || !box.current) return;

        let shipping = SHIPPING_CENTS;
        pr.on("shippingaddresschange", (ev) => {
          const free = isSantander(ev.shippingAddress.postalCode || "");
          shipping = free ? 0 : SHIPPING_CENTS;
          if (ev.shippingAddress.country && ev.shippingAddress.country !== "ES") {
            ev.updateWith({ status: "invalid_shipping_address" });
            return;
          }
          ev.updateWith({
            status: "success",
            shippingOptions: [option(free)],
            total: { label: "ISO", amount: sub() + shipping },
            displayItems: items(),
          });
        });
        pr.on("cancel", () => {
          shipping = SHIPPING_CENTS;
        });

        pr.on("paymentmethod", async (ev) => {
          setError(null);
          const a = ev.shippingAddress;
          const customer = {
            name: a?.recipient || ev.payerName || "",
            email: ev.payerEmail || "",
            phone: ev.payerPhone || a?.phone || "",
            address: (a?.addressLine || []).filter(Boolean).join(", "),
            city: a?.city || "",
            postal_code: (a?.postalCode || "").replace(/\s/g, ""),
          };
          const res = await fetch("/api/pago-express", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: cartRef.current.map((i) => ({ product_id: i.id, size: i.size, qty: i.qty })),
              customer,
              expected_cents: sub() + shipping,
              vip: vipParam(),
            }),
          })
            .then((r) => r.json())
            .catch(() => null);

          if (!res?.client_secret) {
            ev.complete("fail");
            setError(ORDER_ERRORS[res?.error] ?? res?.message ?? "No se ha podido hacer el pedido. Inténtalo de nuevo o usa otra forma de pago.");
            return;
          }

          const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
            res.client_secret,
            { payment_method: ev.paymentMethod.id },
            { handleActions: false },
          );
          const cancelOrder = () =>
            fetch("/api/pago-express", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cancel: res.code }),
            }).catch(() => {});

          if (confirmError) {
            ev.complete("fail");
            cancelOrder();
            setError(confirmError.message || "El pago no se ha completado");
            return;
          }
          ev.complete("success");
          if (paymentIntent?.status === "requires_action") {
            // El banco pide verificación (3D Secure)
            const { error: actionError } = await stripe.confirmCardPayment(res.client_secret);
            if (actionError) {
              cancelOrder();
              setError(actionError.message || "El banco no ha confirmado el pago");
              return;
            }
          }
          onPaid(res.code);
        });

        const elements = stripe.elements({ locale: "es" });
        const el = elements.create("paymentRequestButton", {
          paymentRequest: pr,
          // Fondo negro de la web: botón blanco para que se vea
          style: { paymentRequestButton: { type: "buy", theme: "light", height: "50px" } },
        });
        btn = el;
        el.mount(box.current);
        setAvailable(true);
        log("botón mostrado");
      } catch (e) {
        log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
      btn?.destroy();
      prRef.current = null;
    };
    // Se crea una vez; el importe se actualiza en el otro efecto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal === 0]);

  if (!PK && !DEBUG) return null;
  return (
    <>
      {DEBUG && (
        <pre className="cart-debug">
          {[`modo: ${PK?.startsWith("pk_live") ? "LIVE (real)" : PK?.startsWith("pk_test") ? "TEST (prueba)" : "sin clave"}`, ...diag].join("\n")}
        </pre>
      )}
      <div className="cart-express" hidden={!available && !error}>
        <div ref={box} />
        {error && <p className="cart-error">{error}</p>}
        {available && orText && (
          <p className="cart-express-or">
            <span>{orText}</span>
          </p>
        )}
      </div>
    </>
  );
}
