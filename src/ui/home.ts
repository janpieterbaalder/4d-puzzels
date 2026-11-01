import { store } from "../core/store";
import { ALL_STEPS } from "../course/curriculum";
import { ALL_TYPES } from "../puzzles/registry";
import { webglAvailable } from "../view/stage";
import { h, type Screen, UI } from "./dom";
import { stepHref } from "./nav";
import { heroTesseract } from "./widgets";

export function homeScreen(): Screen {
  const done = store.doneSteps();
  const total = ALL_STEPS.length;
  const nDone = ALL_STEPS.filter((s) => done[s.step.id]).length;
  const next = ALL_STEPS.find((s) => !done[s.step.id]);
  const pct = Math.round((nDone / total) * 100);
  const hero = h("div", { class: "hero-canvas", "aria-hidden": "true" });
  const root = h(
    "div",
    { class: "screen home" },
    hero,
    h(
      "div",
      { class: "home-inner" },
      h(
        "header",
        { class: "home-head" },
        h("div", { class: "wordmark", html: "Puzzel<sup>4</sup>" }),
        h("a", { class: "round-btn", href: "#/instellingen", "aria-label": "Instellingen", html: UI.settings }),
      ),
      h(
        "section",
        { class: "hero" },
        h("p", { class: "kicker" }, "Leer denken in vier dimensies"),
        h("h1", { html: "Van <span class='d2'>platland</span> via <span class='d3'>ruimte</span> naar de <span class='d4'>vierde dimensie</span>." }),
        h(
          "p",
          { class: "lede" },
          "Bekende puzzels — sudoku, binair, zeeslag, tentje-boompje, tectonic, hitori, futoshiki, kamertje verhuren — eerst in 2D, dan in 3D, en ten slotte als echte 4D-puzzel. Zonder formules: je leert het door te doen.",
        ),
      ),
      h(
        "div",
        { class: "cta" },
        h(
          "a",
          { class: "cta-card course", href: next ? stepHref(next.step) : "#/cursus" },
          h("span", { class: "cta-ic", html: UI.book }),
          h("span", { class: "cta-t" }, nDone ? "Ga verder met de 4D-cursus" : "Start de 4D-cursus"),
          h("span", { class: "cta-s" }, next ? `Hoofdstuk ${next.chapter.n}: ${next.chapter.title}` : "Alles voltooid. Knap!"),
          h("span", { class: "ring", style: `--p:${pct}` }, h("b", {}, pct + "%")),
        ),
        h(
          "a",
          { class: "cta-card free", href: "#/vrij" },
          h("span", { class: "cta-ic", html: UI.dice }),
          h("span", { class: "cta-t" }, "Vrij spelen"),
          h("span", { class: "cta-s" }, `${ALL_TYPES.length} puzzelsoorten + duel · 2D, 3D en 4D`),
        ),
        h("a", { class: "cta-link", href: "#/cursus" }, "Bekijk het hele leerpad →"),
      ),
      h(
        "section",
        { class: "chips" },
        ...ALL_TYPES.map((t) =>
          h("a", { class: "type-chip", href: `#/vrij/${t.id}`, style: `--accent:${t.accent}` }, h("span", { class: "ic", html: t.icon }), h("span", {}, t.name)),
        ),
        h("a", { class: "type-chip", href: "#/vrij/kamertje", style: "--accent:#ff9a4a" }, h("span", { class: "ic", html: UI.duel }), h("span", {}, "Kamertje verhuren")),
      ),
      h(
        "section",
        { class: "facts" },
        fact("2 · 4 · 6 · 8", "directe buren", "Elke dimensie geeft een cel twee buren extra."),
        fact("2 · 3 · 4", "lijnen per cel", "Rij, kolom, pilaar — en in 4D de w-lijn."),
        fact("16 · 32 · 24 · 8", "tesseract", "Hoekpunten, ribben, vlakken en kubussen."),
      ),
      h("footer", { class: "home-foot" }, "Puzzel⁴ · gemaakt om de vierde dimensie te leren voelen · voortgang wordt alleen in je browser bewaard"),
    ),
  );
  let v: ReturnType<typeof heroTesseract> | null = null;
  if (webglAvailable()) requestAnimationFrame(() => (v = heroTesseract(hero)));
  return { el: root, dispose: () => v?.dispose() };
}

function fact(big: string, label: string, text: string) {
  return h("div", { class: "fact" }, h("b", {}, big), h("span", {}, label), h("p", {}, text));
}
