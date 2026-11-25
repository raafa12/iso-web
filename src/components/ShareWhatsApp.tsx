// Botón para compartir una prenda por WhatsApp. El enlace (/p/<id>) tiene su propia
// foto y título para la vista previa de WhatsApp, y abre la prenda en la web.
import { useState } from "react";
import "./buy-now.css";

export default function ShareWhatsApp({ id, name, price }: { id: string; name: string; price: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${location.origin}/p/${id}?s=2`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Navegadores sin portapapeles moderno
      const t = document.createElement("textarea");
      t.value = url; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch {}
      t.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }
  function share() {
    const url = `${location.origin}/p/${id}?s=2`;
    // La vista previa ya enseña la foto, el nombre y el precio
    const text = `Mira esta de ISO 👇\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  return (
    <div className="share-row">
    <button type="button" className="share-wa" onClick={share}>
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="currentColor">
        <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.38 9.38 0 0 1-1.44-5.01c0-5.19 4.23-9.42 9.43-9.42 2.52 0 4.88.98 6.66 2.76a9.36 9.36 0 0 1 2.76 6.67c0 5.2-4.23 9.42-9.42 9.42m8.02-17.44A11.27 11.27 0 0 0 12.05.75C5.8.75.72 5.83.72 12.08c0 2 .52 3.95 1.52 5.66L.62 23.25l5.65-1.48a11.3 11.3 0 0 0 5.78 1.47h.01c6.24 0 11.33-5.08 11.33-11.33 0-3.03-1.18-5.87-3.32-8.01" />
      </svg>
      Compartir por WhatsApp
    </button>
    <button type="button" className={`share-link${copied ? " done" : ""}`} onClick={copy}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {copied ? <path d="M20 6 9 17l-5-5" /> : <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>}
      </svg>
      {copied ? "Enlace copiado" : "Copiar enlace"}
    </button>
    </div>
  );
}
