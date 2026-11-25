// Guía de tallas (medidas de la prenda en plano, en cm).
//   Camiseta: oversize 200 g/m² de las camisetas de ISO
//   Sudadera: Gildan Heavy Blend 18500 (ficha del fabricante: 20/22/24/26" de pecho, 27/28/29/30" de largo)
import { useEffect, useState } from "react";
import "./size-guide.css";

export type GuideKind = "tee" | "hoodie";

const GUIDE: Record<GuideKind, { label: string; fit: string; rows: [string, number, number][] }> = {
  tee: {
    label: "Camiseta",
    fit: "Corte oversize: con tu talla de siempre te queda ancha y con el hombro caído. Si la quieres más ajustada, pide una talla menos.",
    rows: [["S", 56, 74], ["M", 59, 76], ["L", 62, 78], ["XL", 65, 80]],
  },
  hoodie: {
    label: "Sudadera",
    fit: "Pide tu talla de siempre. Si la quieres más ancha, con look oversize, una talla más.",
    rows: [["S", 51, 69], ["M", 56, 71], ["L", 61, 74], ["XL", 66, 76]],
  },
};

export const guideKindOf = (id?: string | null): GuideKind => (/hoodie|sudadera/i.test(id || "") ? "hoodie" : "tee");

function Diagram({ kind }: { kind: GuideKind }) {
  // Silueta de la prenda con A (ancho, de axila a axila) y B (largo, del hombro al bajo)
  return (
    <svg viewBox="0 0 200 190" className="sg-svg" aria-hidden="true">
      {kind === "tee" ? (
        <path className="sg-body" d="M70 18 Q100 34 130 18 L176 40 L192 86 L160 96 L154 78 L154 176 L46 176 L46 78 L40 96 L8 86 L24 40 Z" />
      ) : (
        <>
          <path className="sg-body" d="M70 26 L130 26 L172 46 L194 150 L166 156 L152 92 L152 178 L48 178 L48 92 L34 156 L6 150 L28 46 Z" />
          <path className="sg-line" d="M70 26 Q72 2 100 2 Q128 2 130 26 Q100 44 70 26 Z" />
          <path className="sg-line" d="M48 160 L152 160" />
        </>
      )}
      {/* A: ancho */}
      <g className="sg-a">
        <path d={kind === "tee" ? "M50 92 H150" : "M52 98 H148"} />
        <path d={kind === "tee" ? "M56 87 L50 92 L56 97 M144 87 L150 92 L144 97" : "M58 93 L52 98 L58 103 M142 93 L148 98 L142 103"} />
        <text x="100" y={kind === "tee" ? 86 : 92}>A</text>
      </g>
      {/* B: largo */}
      <g className="sg-b">
        <path d={kind === "tee" ? "M114 30 V172" : "M116 32 V174"} />
        <path d={kind === "tee" ? "M109 36 L114 30 L119 36 M109 166 L114 172 L119 166" : "M111 38 L116 32 L121 38 M111 168 L116 174 L121 168"} />
        <text x={kind === "tee" ? 124 : 126} y="140">B</text>
      </g>
    </svg>
  );
}

export function SizeGuideModal({ open, onClose, kind = "tee" }: { open: boolean; onClose: () => void; kind?: GuideKind }) {
  const [tab, setTab] = useState<GuideKind>(kind);
  useEffect(() => { if (open) setTab(kind); }, [open, kind]);
  const g = GUIDE[tab];
  return (
    <div
      className={`size-guide-overlay${open ? " open" : ""}`}
      hidden={!open}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sg" role="dialog" aria-modal="true" aria-label="Guía de tallas">
        <button type="button" className="sg-close" aria-label="Cerrar guía de tallas" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <p className="sg-kicker">● Guía de tallas</p>
        <h3 className="sg-title">¿Qué talla<br />me pido?</h3>

        <div className="sg-tabs" role="tablist">
          {(Object.keys(GUIDE) as GuideKind[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{GUIDE[k].label}</button>
          ))}
        </div>

        <GuideBody kind={tab} />
      </div>
    </div>
  );
}

function GuideBody({ kind }: { kind: GuideKind }) {
  return (
    <>
    <div className="sg-main">
      <Diagram kind={kind} />
      <table className="sg-table">
        <thead>
          <tr><th>Talla</th><th><i className="a">A</i>Ancho</th><th><i className="b">B</i>Largo</th></tr>
        </thead>
        <tbody>
          {GUIDE[kind].rows.map(([s, a, b]) => (
            <tr key={s}><td>{s}</td><td>{a}<small> cm</small></td><td>{b}<small> cm</small></td></tr>
          ))}
        </tbody>
      </table>
    </div>

    <p className="sg-fit">{GUIDE[kind].fit}</p>
    <ul className="sg-how">
      <li><b>A · Ancho:</b> de axila a axila, con la prenda estirada en plano.</li>
      <li><b>B · Largo:</b> desde lo más alto del hombro hasta el bajo.</li>
      <li><b>Truco:</b> mide una {kind === "tee" ? "camiseta" : "sudadera"} tuya que te quede bien y compárala con la tabla.</li>
    </ul>
    </>
  );
}

// Desplegable "Guía de tallas" debajo de las tallas, dentro de la ficha de la prenda
export function SizeGuideInline({ kind }: { kind: GuideKind }) {
  return (
    <details className="sg-acc">
      <summary>
        <span>Guía de tallas</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="sg-acc-body">
        <GuideBody kind={kind} />
      </div>
    </details>
  );
}
