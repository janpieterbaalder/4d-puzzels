import { store } from "../core/store";
import { ALL_STEPS, CHAPTERS, type Step } from "../course/curriculum";
import { LESSON_BY_ID } from "../course/lessons";
import { DB_PRESETS } from "../games/dotsboxes";
import { TYPES } from "../puzzles/registry";
import { dimBadge, h, type Screen, UI } from "./dom";
import { stepHref } from "./nav";

export function stepInfo(s: Step): { title: string; sub: string; icon: string; accent: string; dim: number } {
  if (s.kind === "lesson") {
    const l = LESSON_BY_ID[s.lesson];
    return { title: l.title, sub: "Les · " + l.subtitle, icon: UI.book, accent: "#eef0fb", dim: 0 };
  }
  if (s.kind === "duel") {
    const p = DB_PRESETS.find((x) => x.id === s.preset)!;
    return { title: "Kamertje verhuren", sub: "Duel · " + p.label, icon: UI.duel, accent: "#ff9a4a", dim: p.dots.length };
  }
  const t = TYPES[s.type];
  const p = t.presets.find((x) => x.id === s.preset)!;
  return {
    title: t.name + (s.fog ? " · doorsnede" : ""),
    sub: p.label + " · " + p.sizes.join(" × "),
    icon: t.icon,
    accent: t.accent,
    dim: p.sizes.length,
  };
}

export function courseScreen(): Screen {
  const done = store.doneSteps();
  const next = ALL_STEPS.find((s) => !done[s.step.id]);
  const nDone = ALL_STEPS.filter((s) => done[s.step.id]).length;
  const root = h(
    "div",
    { class: "screen course" },
    h(
      "header",
      { class: "topbar" },
      h("a", { class: "round-btn", href: "#/", "aria-label": "Home", html: UI.back }),
      h("div", { class: "title" }, h("span", { class: "t-name" }, "De 4D-cursus"), h("span", { class: "t-meta" }, `${nDone} van ${ALL_STEPS.length} stappen voltooid`)),
      h("div", { class: "top-actions" }, next ? h("a", { class: "btn primary small", href: stepHref(next.step) }, "Ga verder") : null),
    ),
  );
  const path = h("div", { class: "path" });
  for (const c of CHAPTERS) {
    const dims = new Set(c.steps.map((s) => stepInfo(s).dim).filter((d) => d));
    const maxD = Math.max(0, ...dims);
    const cDone = c.steps.filter((s) => done[s.id]).length;
    const ch = h(
      "section",
      { class: `chapter d${maxD}` + (cDone === c.steps.length ? " complete" : "") },
      h(
        "header",
        {},
        h("span", { class: "ch-n" }, String(c.n)),
        h("div", {}, h("h2", {}, c.title), h("p", {}, c.concept)),
        h("span", { class: "ch-prog" }, `${cDone}/${c.steps.length}`),
      ),
    );
    const list = h("div", { class: "steps" });
    for (const s of c.steps) {
      const info = stepInfo(s);
      const isNext = next?.step.id === s.id;
      list.appendChild(
        h(
          "a",
          { class: "step" + (done[s.id] ? " done" : "") + (isNext ? " next" : "") + " k-" + s.kind, href: stepHref(s), style: `--accent:${info.accent}` },
          h("span", { class: "st-ic", html: info.icon }),
          h("span", { class: "st-txt" }, h("b", {}, info.title), h("small", {}, info.sub)),
          info.dim ? h("span", { html: dimBadge(info.dim) }) : null,
          h("span", { class: "st-state", html: done[s.id] ? UI.check : isNext ? UI.play : "" }),
        ),
      );
    }
    ch.appendChild(list);
    path.appendChild(ch);
  }
  root.appendChild(path);
  requestAnimationFrame(() => root.querySelector(".step.next")?.scrollIntoView({ block: "center" }));
  return { el: root, dispose() {} };
}
