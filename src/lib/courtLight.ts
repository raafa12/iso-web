// Foco que ilumina las líneas de la pista (variables --mx/--my + clase is-lit).
// Ordenador: sigue al cursor. Móvil: sigue al dedo y, mientras no se toca,
// recorre la pista solo, despacio, para que el efecto se vea igualmente.
export function courtLight(el: HTMLElement) {
  const set = (x: number, y: number) => {
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
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
  let lastTouch = 0;
  const onTouch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touching = true;
    lastTouch = performance.now();
    set(...local(t.clientX, t.clientY));
  };
  el.addEventListener("touchstart", onTouch, { passive: true });
  el.addEventListener("touchmove", onTouch, { passive: true });
  el.addEventListener("touchend", () => { touching = false; lastTouch = performance.now(); }, { passive: true });

  // Recorrido automático (en forma de 8) mientras está en pantalla y nadie toca
  let visible = false, raf = 0;
  const loop = (now: number) => {
    if (!touching && now - lastTouch > 1200) {
      const w = el.clientWidth, h = el.clientHeight, s = now / 1000;
      set(w * (0.5 + 0.36 * Math.sin(s * 0.55)), h * (0.55 + 0.25 * Math.sin(s * 1.1)));
    }
    raf = visible ? requestAnimationFrame(loop) : 0;
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(loop);
  }).observe(el);
}
