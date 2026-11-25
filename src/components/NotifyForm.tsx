// Formulario "Avísame": deja el correo en /api/waitlist.
//   - Preventa (página): aviso general de cuando abre
//   - Prenda del drop: además guarda qué prenda quiere (correo "te avisamos por la X")
//   - Clásico sin stock (source "stock"): solo aviso de cuando vuelva esa prenda
import { useRef, useState } from "react";
import "./presale.css";

export default function NotifyForm({
  compact = false,
  featured = false,
  source = "preventa-isolation",
  productId,
  productName,
  title = "Avísame cuando abra",
  label = "Avísame",
  okText = "Hecho. Te avisamos por correo en cuanto abra la preventa.",
}: {
  compact?: boolean;
  featured?: boolean;
  source?: string;
  productId?: string;
  productName?: string;
  title?: string;
  label?: string;
  okText?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const hp = useRef<HTMLInputElement>(null);
  const idBase = `ps-mail-${productId ?? (compact ? "c" : "p")}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setState("error");
      setMsg("Revisa el correo");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source,
          product_id: productId,
          product_name: productName,
          website: hp.current?.value ?? "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se ha podido guardar");
      setState("ok");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "No se ha podido guardar");
    }
  }

  if (state === "ok")
    return featured ? (
      <div className="ps-notify featured ok">
        <p className="ps-pri-kicker">● Estás dentro</p>
        <p className="ps-pri-title">Ya eres de la lista.</p>
        <p className="ps-pri-sub">El <b>14 de diciembre a las 00:00</b> te llega tu enlace con el precio especial. Mira el correo (y el spam, por si acaso).</p>
      </div>
    ) : (
      <p className={`ps-notify ok${compact ? " compact" : ""}`}>{okText}</p>
    );
  return (
    <form className={`ps-notify${compact ? " compact" : ""}${featured ? " featured" : ""}`} onSubmit={submit} noValidate>
      {featured && (
        <>
          <p className="ps-pri-kicker">● Lista prioritaria</p>
          <p className="ps-pri-title">Precio especial<br />para la lista.</p>
          <ul className="ps-pri-list">
            <li><b>Precio rebajado</b> solo para la lista, las primeras 24 h</li>
            <li>El <b>14 dic a las 00:00</b> te llega tu enlace, antes de que lo subamos a redes</li>
            <li><b>25 unidades</b> por modelo</li>
          </ul>
        </>
      )}
      {!compact && !featured && (
        <p className="ps-notify-t">
          <b>{title}</b>
        </p>
      )}
      <input ref={hp} type="text" name="website" tabIndex={-1} autoComplete="off" className="ps-hp" aria-hidden="true" />
      <div className="ps-notify-row">
        <label className="sr-only" htmlFor={idBase}>Tu correo</label>
        <input
          id={idBase}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          required
        />
        <button type="submit" disabled={state === "sending"}>{state === "sending" ? "…" : label}</button>
      </div>
      {state === "error" && <p className="ps-notify-err">{msg}</p>}
    </form>
  );
}
