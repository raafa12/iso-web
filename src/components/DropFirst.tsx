// Mientras CLASSICS_ON_SALE = false: los clásicos se ven, pero no se pueden comprar.
// En lugar de los botones de compra: "No disponible" y el acceso a la preventa.
import "./buy-now.css";

export default function DropFirst() {
  return (
    <div className="drop-first">
      <button type="button" className="buy-cart drop-first-off" disabled>
        No disponible
      </button>
      <a className="buy-cart drop-first-cta" href="/preventa">
        Ver la preventa →
      </a>
    </div>
  );
}
