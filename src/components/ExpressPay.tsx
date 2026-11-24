// Botón de pago rápido en el carrito: Apple Pay / Google Pay (y PayPal si se activa en Stripe).
// El monedero da el nombre, el email y la dirección, así que no hay formulario.
// Flujo: el cliente confirma en el monedero → /api/pago-express hace el pedido y el
// PaymentIntent → se confirma el pago → el webhook de Stripe lo marca como pagado.
import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements, type StripeExpressCheckoutElement } from "@stripe/stripe-js";
import "./cart-drawer.css";
import { ORDER_ERRORS, SHIPPING_CENTS, isSantander } from "../lib/shop";

const PK = import.meta.env.PUBLIC_STRIPE_KEY as string | undefined;

type Line = { id: string; name: string; size: string; qty: number; price: number };

export default function ExpressPay({ cart, onPaid, orText = "o elige otra forma de pago" }: { cart: Line[]; onPaid: (code: string) => void; orText?: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const cartRef = useRef(cart);
  const [available, setAvailable] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elsRef = useRef<StripeElements | null>(null);
  // Diagnóstico: isowear.es/?debugpay → muestra en el carrito por qué sale o no el botón
  const debug = typeof location !== "undefined" && location.search.includes("debugpay");
  const [diag, setDiag] = useState<string[]>([]);
  const log = (m: string) => { console.log("[ISO pago rápido]", m); if (debug) setDiag((d) => [...d, m]); };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  cartRef.current = cart;

  // Si cambia el carrito, se actualiza el importe del monedero
  useEffect(() => {
    if (subtotal > 0) elsRef.current?.update({ amount: subtotal + SHIPPING_CENTS });
  }, [subtotal]);

  useEffect(() => {
    log(`clave pública: ${PK ? PK.slice(0, 8) + "…" : "FALTA (PUBLIC_STRIPE_KEY)"}`);
    if (!PK || !box.current || subtotal === 0) return;
    let ece: StripeExpressCheckoutElement | null = null;
    let cancelled = false;

    (async () => {
     try {
      const stripe: Stripe | null = await loadStripe(PK, { locale: "es" }).catch((e) => { log(`Stripe.js no carga: ${e}`); return null; });
      log(stripe ? "Stripe.js cargado" : "Stripe.js no disponible");
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
        buttonTheme: { applePay: "white", googlePay: "white" }, // el fondo de la web es negro: el botón negro no se vería
        buttonHeight: 50,
        emailRequired: true,
        phoneNumberRequired: false,
        shippingAddressRequired: true,
        allowedShippingCountries: ["ES"],
        shippingRates: [rate(false)],
        paymentMethods: { link: "never", klarna: "never", amazonPay: "never" },
        layout: { maxColumns: 1, maxRows: 3, overflow: "never" },
      });

      log("botón creado");
      const showMethods = (pm: Record<string, boolean> | null | undefined) => {
        const on = pm ? Object.entries(pm).filter(([, v]) => v).map(([k]) => k) : [];
        log(`monederos disponibles: ${on.join(", ") || "ninguno"}`);
        setAvailable(on.length > 0);
      };
      // "ready" trae los monederos disponibles; el evento nuevo, si existe, también
      ece.on("ready", (e: any) => {
        log("botón listo");
        showMethods(e?.availablePaymentMethods);
      });
      try {
        (ece as any).on("availablepaymentmethodschange", (e: any) => showMethods(e?.paymentMethods));
      } catch {}
      ece.on("loaderror", (e) => log(`error al cargar el botón: ${e.error?.message}`));

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
      log("botón montado");
      // Si en 6 s no aparece ningún monedero, se recoge el hueco
      window.setTimeout(() => {
        setAvailable((a) => {
          if (!a) { log("sin respuesta del botón tras 6 s"); setGaveUp(true); }
          return a;
        });
      }, 6000);
     } catch (e) {
      log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
     }
    })();

    return () => {
      cancelled = true;
      ece?.destroy();
      elsRef.current = null;
    };
    // Se monta una vez por apertura del carrito; el importe se actualiza aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal === 0]);

  if (!PK && !debug) return null;
  return (
    <>
    {debug && <pre className="cart-debug">{[`STRIPE_ENABLED ok`, ...diag].join("\n")}</pre>}
    <div className={`cart-express${available || error ? "" : gaveUp && !debug ? " gone" : " pending"}`}>
      <div ref={box} />
      {error && <p className="cart-error">{error}</p>}
      {available && orText && <p className="cart-express-or"><span>{orText}</span></p>}
    </div>
    </>
  );
}
