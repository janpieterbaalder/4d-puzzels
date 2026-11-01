/** Kleine DOM-helpers en UI-iconen. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | ((e: any) => void) | undefined> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "class") el.className = String(v);
    else if (k === "style") el.setAttribute("style", String(v));
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export interface Screen {
  el: HTMLElement;
  dispose(): void;
}

const S = (p: string, w = 20) =>
  `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

export const UI = {
  back: S('<path d="M15 18l-6-6 6-6"/>'),
  next: S('<path d="M9 6l6 6-6 6"/>'),
  undo: S('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
  redo: S('<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>'),
  hint: S('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>'),
  reset: S('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  erase: S('<path d="M3 12l6-6a2 2 0 0 1 2.83 0l6.34 6.34a2 2 0 0 1 0 2.83l-3.17 3.17H9L3 12z"/><path d="M9 18l-2.5-2.5"/>'),
  pencil: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  auto: S('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01"/>'),
  help: S('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17h.01"/>'),
  settings: S('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  cube: S('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
  board: S('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  split: S('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/>'),
  camera: S('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="12" r="2.5"/>'),
  spin: S('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>'),
  book: S('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/><path d="M9 8h7M9 12h5"/>'),
  duel: S('<circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><path d="M5 5h7v7H5z" fill="currentColor" fill-opacity=".3"/><path d="M12 12h7"/>'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7"/>', 16),
  play: S('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>', 18),
  sound: S('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  dice: S('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/>'),
  tesseract: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M20 3l15 8.5v17L20 37 5 28.5v-17z" stroke-width="1.6"/><path d="M20 12l7 4v8l-7 4-7-4v-8z" stroke-width="1.4"/><path d="M20 3v9M35 11.5L27 16M35 28.5L27 24M20 37v-9M5 28.5l8-4.5M5 11.5l8 4.5" stroke-width="1.1" opacity=".7"/></svg>`,
};

export function dimBadge(d: number): string {
  return `<span class="dim-badge d${d}">${d}D</span>`;
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function toast(msg: string, kind: "info" | "good" | "warn" = "info", ms = 3200) {
  let host = document.getElementById("toasts");
  if (!host) {
    host = h("div", { id: "toasts", class: "toasts", role: "status", "aria-live": "polite" });
    document.body.appendChild(host);
  }
  const t = h("div", { class: "toast " + kind }, msg);
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => {
    t.classList.remove("in");
    setTimeout(() => t.remove(), 400);
  }, ms);
}

export function confetti(host: HTMLElement) {
  const colors = ["#ff7a8a", "#5ef2b4", "#6cb8ff", "#d77bff", "#ffd166"];
  const box = h("div", { class: "confetti" });
  for (let k = 0; k < 70; k++) {
    const p = h("i");
    p.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "%");
    p.style.setProperty("--d", (0.8 + Math.random() * 1.6).toFixed(2) + "s");
    p.style.setProperty("--r", Math.floor(Math.random() * 720 - 360) + "deg");
    p.style.setProperty("--c", colors[k % colors.length]);
    p.style.setProperty("--delay", (Math.random() * 0.4).toFixed(2) + "s");
    box.appendChild(p);
  }
  host.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}
