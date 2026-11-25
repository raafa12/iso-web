// Desplegable "Detalles" en la ficha de la prenda: tejido, acabados y cuidados.
//   Camiseta: oversize de algodón de punto liso, cuello canalé 1x1 con elastano y cubrecosturas, costuras laterales
//   Sudadera: Gildan Heavy Blend 18500 (50/50 algodón/poliéster, 271 g/m²)
// Antes de que abra la preventa, las prendas del drop salen con interrogaciones.
import "./size-guide.css";

type Kind = "tee" | "hoodie";

const kindOf = (id: string): Kind => (/hoodie|sudadera/i.test(id) ? "hoodie" : "tee");

function rows(id: string): [string, string][] {
  if (kindOf(id) === "hoodie")
    return [
      ["Tejido", "50% algodón, 50% poliéster. Felpa perchada por dentro, 271 g/m²"],
      ["Cuidados", "Lavar del revés a 30 °C. Sin secadora. Planchar del revés"],
    ];
  return [
    ["Tejido", "100% algodón de punto liso, 200 g/m²"],
    ["Cuidados", "Lavar del revés a 30 °C. Sin secadora. Planchar del revés"],
  ];
}

export default function ProductDetails({ id, veiled = false }: { id: string; veiled?: boolean }) {
  const list = rows(id);
  return (
    <details className="sg-acc pd-acc">
      <summary>
        <span>Detalles</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <dl className="pdd">
        {list.map(([k, v]) => (
          <div key={k}>
            <dt>{veiled ? "???" : k}</dt>
            <dd className={veiled ? "qq" : ""}>{veiled ? v.replace(/[^\s.,]/g, "?") : v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
