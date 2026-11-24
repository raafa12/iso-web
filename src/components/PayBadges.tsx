// Distintivos de los métodos de pago. PayPal: iconos de Simple Icons (CC0, simpleicons.org).
// Bizum va como texto en su color; contrarreembolso con un icono genérico.
const Svg = ({ d, color, label }: { d: string; color: string; label: string }) => (
  <svg viewBox="0 0 24 24" role="img" aria-label={label} className="pay-ico">
    <path d={d} fill={color} />
  </svg>
);
const PAYPAL = "M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087zM19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z";

export function PayBadge({ method }: { method: "tarjeta" | "bizum" | "paypal" | "contrarreembolso" }) {
  if (method === "tarjeta")
    return (
      <span className="pay-badge">
        <svg viewBox="0 0 24 24" className="pay-ico" aria-hidden="true" fill="none" stroke="#2b2b2b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="2" />
          <path d="M2.5 9.5h19M6 15h4" />
        </svg>
      </span>
    );
  if (method === "bizum") return <span className="pay-badge"><span className="pay-bizum">bizum</span></span>;
  if (method === "paypal") return <span className="pay-badge"><Svg d={PAYPAL} color="#003087" label="PayPal" /></span>;
  return (
    <span className="pay-badge">
      <svg viewBox="0 0 24 24" className="pay-ico" aria-hidden="true" fill="none" stroke="#2b2b2b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M6 9.5v5M18 9.5v5" />
      </svg>
    </span>
  );
}
