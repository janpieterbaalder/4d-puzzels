import { randomSeed } from "../core/rng";
import { store } from "../core/store";
import { DB_PRESETS } from "../games/dotsboxes";
import { ALL_TYPES, TYPES } from "../puzzles/registry";
import { dimsOf, presetsFor, sizeLabel, type PuzzleType } from "../puzzles/types";
import { dimBadge, h, type Screen, UI } from "./dom";

export function freeScreen(openId?: string): Screen {
  const solved = store.solvedCount();
  const root = h(
    "div",
    { class: "screen free" },
    h(
      "header",
      { class: "topbar" },
      h("a", { class: "round-btn", href: "#/", "aria-label": "Home", html: UI.back }),
      h("div", { class: "title" }, h("span", { class: "t-name" }, "Vrij spelen"), h("span", { class: "t-meta" }, "Kies een puzzel en een dimensie")),
    ),
  );
  const grid = h("div", { class: "type-grid" });
  for (const t of ALL_TYPES) {
    const dims = dimsOf(t);
    const count = dims.reduce((s, d) => s + (solved[`${t.id}:${d}`] ?? 0), 0);
    grid.appendChild(
      h(
        "button",
        { class: "type-card", style: `--accent:${t.accent}`, onclick: () => open(t.id) },
        h("span", { class: "tc-ic", html: t.icon }),
        h("span", { class: "tc-name" }, t.name),
        h("span", { class: "tc-origin" }, "naar " + t.origin),
        h("span", { class: "tc-tag" }, t.tagline),
        h("span", { class: "tc-dims", html: dims.map(dimBadge).join("") + (count ? `<em>${count}× opgelost</em>` : "") }),
      ),
    );
  }
  grid.appendChild(
    h(
      "button",
      { class: "type-card duel", style: "--accent:#ff9a4a", onclick: () => open("kamertje") },
      h("span", { class: "tc-ic", html: UI.duel }),
      h("span", { class: "tc-name" }, "Kamertje verhuren"),
      h("span", { class: "tc-origin" }, "naar Dots & Boxes"),
      h("span", { class: "tc-tag" }, "Duel tegen de computer — op een tesseract"),
      h("span", { class: "tc-dims", html: [2, 3, 4].map(dimBadge).join("") }),
    ),
  );
  root.appendChild(grid);

  let sheet: HTMLElement | null = null;
  function open(id: string) {
    sheet?.remove();
    sheet = id === "kamertje" ? duelSheet() : typeSheet(TYPES[id]);
    root.appendChild(sheet);
  }
  function close() {
    sheet?.remove();
    sheet = null;
    if (location.hash !== "#/vrij") history.replaceState(null, "", "#/vrij");
  }

  function typeSheet(t: PuzzleType): HTMLElement {
    const dims = dimsOf(t);
    let dim = dims[dims.length - 1] === 4 && solved[`${t.id}:2`] ? 4 : dims[0];
    let fog = false;
    const body = h("div", { class: "sheet-body" });
    const tabs = h("div", { class: "seg dim-tabs" });
    const render = () => {
      for (const b of tabs.querySelectorAll<HTMLElement>("button")) b.classList.toggle("on", Number(b.dataset.d) === dim);
      const r = t.rules(dim, presetsFor(t, dim)[0]);
      body.innerHTML = "";
      body.append(
        h("div", { class: "rules", html: `<p class="goal">${r.goal}</p><ul>${r.rules.map((x) => `<li>${x}</li>`).join("")}</ul>${r.dimNote ? `<p class="dimnote"><b>${dim}D:</b> ${r.dimNote}</p>` : ""}` }),
      );
      if (t.id === "maze" && dim >= 3) {
        const cb = h("label", { class: "toggle" }, h("input", { type: "checkbox", ...(fog ? { checked: true } : {}) }), h("span", {}, "Doorsnede-modus: zie alleen je eigen 2D-plakje"));
        cb.querySelector("input")!.addEventListener("change", (e) => (fog = (e.target as HTMLInputElement).checked));
        body.appendChild(cb);
      }
      const list = h("div", { class: "preset-list" });
      for (const p of presetsFor(t, dim)) {
        list.appendChild(
          h(
            "a",
            {
              class: "preset",
              href: "#",
              onclick: (e: Event) => {
                e.preventDefault();
                location.hash = `#/speel/${t.id}/${p.id}/${randomSeed()}${fog ? "?fog=1" : ""}`;
              },
            },
            h("b", {}, p.label),
            h("span", {}, sizeLabel(p.sizes) + ` · ${p.sizes.reduce((a, b) => a * b, 1)} cellen`),
            h("span", { class: "lvl", html: "●".repeat(p.level) + "<i>" + "●".repeat(3 - p.level) + "</i>" }),
          ),
        );
      }
      body.appendChild(list);
    };
    for (const d of dims) tabs.appendChild(h("button", { "data-d": d, onclick: () => ((dim = d), render()), html: `${d}D` }));
    render();
    return h(
      "div",
      { class: "modal", onclick: (e: Event) => (e.target as HTMLElement).classList.contains("modal") && close() },
      h(
        "div",
        { class: "sheet", style: `--accent:${t.accent}` },
        h("header", {}, h("span", { class: "sh-ic", html: t.icon }), h("div", {}, h("h2", {}, t.name), h("p", {}, t.tagline)), h("button", { class: "round-btn", html: UI.close, "aria-label": "Sluiten", onclick: close })),
        tabs,
        body,
      ),
    );
  }

  function duelSheet(): HTMLElement {
    const list = h("div", { class: "preset-list" });
    for (const p of DB_PRESETS) {
      list.appendChild(
        h("a", { class: "preset", href: `#/kamertje/${p.id}` }, h("b", { html: `${p.label} ${dimBadge(p.dots.length)}` }), h("span", {}, p.note)),
      );
    }
    return h(
      "div",
      { class: "modal", onclick: (e: Event) => (e.target as HTMLElement).classList.contains("modal") && close() },
      h(
        "div",
        { class: "sheet", style: "--accent:#ff9a4a" },
        h(
          "header",
          {},
          h("span", { class: "sh-ic", html: UI.duel }),
          h("div", {}, h("h2", {}, "Kamertje verhuren"), h("p", {}, "Om de beurt een streep. Maak je een kamer af, dan is hij van jou en ben je nog een keer.")),
          h("button", { class: "round-btn", html: UI.close, "aria-label": "Sluiten", onclick: close }),
        ),
        h("div", { class: "sheet-body" }, list),
      ),
    );
  }

  if (openId) requestAnimationFrame(() => open(openId));
  return { el: root, dispose() {} };
}
