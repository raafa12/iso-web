// Botones de pago con el color y el logo de cada método (carrito).
// Apple Pay / Google Pay los pinta ExpressPay (Stripe); aquí van Bizum y tarjeta.
import "./pay-buttons.css";

type Method = "bizum" | "tarjeta";


export default function PayButtons({ onPick, card = true }: { onPick: (m: Method) => void; card?: boolean }) {
  return (
    <div className="pb-list">
      <button type="button" className="pb pb-bizum" onClick={() => onPick("bizum")} aria-label="Pagar con Bizum">
        <span className="pb-bizum-pre">Pagar con</span>
        <span className="pb-bizum-logo">bizum</span>
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
