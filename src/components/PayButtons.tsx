// Botones de pago con el color y el logo de cada método (carrito).
// Apple Pay / Google Pay los pinta ExpressPay (Stripe); aquí van Bizum, PayPal y tarjeta.
import "./pay-buttons.css";

type Method = "bizum" | "paypal" | "tarjeta";

const PAYPAL_P =
  "M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087zM19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z";

export default function PayButtons({ onPick, card = true }: { onPick: (m: Method) => void; card?: boolean }) {
  return (
    <div className="pb-list">
      <button type="button" className="pb pb-bizum" onClick={() => onPick("bizum")} aria-label="Pagar con Bizum">
        <span className="pb-bizum-pre">Pagar con</span>
        <span className="pb-bizum-logo">bizum</span>
      </button>

      <button type="button" className="pb pb-paypal" onClick={() => onPick("paypal")} aria-label="Pagar con PayPal">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="pb-paypal-ico"><path d={PAYPAL_P} fill="#003087" /></svg>
        <span className="pb-paypal-word"><span>Pay</span><span>Pal</span></span>
      </button>

      {card && (
        <button type="button" className="pb pb-card" onClick={() => onPick("tarjeta")} aria-label="Pagar con tarjeta">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="pb-card-ico" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="5" width="19" height="14" rx="2" />
            <path d="M2.5 9.5h19M6 15h4" />
          </svg>
          <span>Tarjeta</span>
          <span className="pb-marks" aria-hidden="true">
            <span className="pb-visa">VISA</span>
            <span className="pb-mc"><i /><i /></span>
          </span>
        </button>
      )}
    </div>
  );
}
