// Foco que ilumina las líneas de la pista (variables --mx/--my + clase is-lit).
// Ordenador: sigue al cursor. Móvil: sigue al dedo y, mientras no se toca,
// recorre la pista solo, despacio, para que el efecto se vea igualmente.
export function courtLight(el: HTMLElement, litSelector = ".court-lit, .pvc-lit") {
  // Safari no repinta las máscaras cuando cambia una variable CSS: la máscara se escribe directamente
  const lit = Array.from(el.querySelectorAll<HTMLElement | SVGElement>(litSelector));
  const set = (x: number, y: number) => {
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    const m = `radial-gradient(circle 280px at ${x.toFixed(0)}px ${y.toFixed(0)}px, #000 0%, transparent 70%)`;
    for (const l of lit) {
      l.style.setProperty("-webkit-mask-image", m);
      l.style.setProperty("mask-image", m);
    }
    el.classList.add("is-lit");
  };
  const local = (cx: number, cy: number) => {
    const r = el.getBoundingClientRect();
    return [cx - r.left, cy - r.top] as const;
  };

  if (window.matchMedia("(pointer: fine)").matches) {
    let raf = 0, tx = 0, ty = 0;
    el.addEventListener("pointermove", (e) => {
      [tx, ty] = local(e.clientX, e.clientY);
      if (!raf) raf = requestAnimationFrame(() => {
        set(tx, ty);
        raf = 0;
      });
    });
    el.addEventListener("pointerleave", () => el.classList.remove("is-lit"));
    return;
  }

  // ---- Táctil ----
  let touching = false;
  const onTouch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touching = true;
    set(...local(t.clientX, t.clientY));
  };
  el.addEventListener("touchstart", onTouch, { passive: true });
  el.addEventListener("touchmove", onTouch, { passive: true });
  el.addEventListener("touchend", () => { touching = false; }, { passive: true });

  // Una sola pasada automática al entrar (de izquierda a derecha); después solo con el dedo
  let start = 0;
  const DUR = 3200;
  const sweep = (now: number) => {
    if (touching) return;
    if (!start) start = now;
    const t = Math.min(1, (now - start) / DUR);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const w = el.clientWidth, h = el.clientHeight;
    set(w * (0.1 + 0.8 * e), h * (0.62 - 0.18 * Math.sin(e * Math.PI)));
    if (t < 1) requestAnimationFrame(sweep);
    else window.setTimeout(() => !touching && el.classList.remove("is-lit"), 400);
  };
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    window.setTimeout(() => requestAnimationFrame(sweep), 600);
  });
  io.observe(el);
  el.addEventListener("touchend", () => window.setTimeout(() => !touching && el.classList.remove("is-lit"), 900), { passive: true });
}
