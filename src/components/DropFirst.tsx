// Mientras CLASSICS_ON_SALE = false: los clásicos se ven, pero no se pueden comprar.
// En lugar de los botones de compra, se manda a la preventa del drop.
import "./buy-now.css";

export default function DropFirst() {
  return (
    <div className="drop-first">
      <p className="drop-first-text">
        <b>Ahora mismo, prioridad al drop.</b> Los básicos vuelven a la venta después de la preventa de Isolation.
      </p>
      <a className="buy-cart drop-first-cta" href="/preventa">
        Ver la preventa →
      </a>
    </div>
  );
}
