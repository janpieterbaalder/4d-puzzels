import { sfx } from "../core/audio";
import { store } from "../core/store";
import { nextStep, stepById } from "../course/curriculum";
import { LESSON_BY_ID } from "../course/lessons";
import { webglAvailable } from "../view/stage";
import { h, type Screen, UI } from "./dom";
import { stepHref } from "./nav";
import { createWidget, type Widget } from "./widgets";

export function lessonScreen(id: string, stepId?: string): Screen {
  const lesson = LESSON_BY_ID[id];
  const step = stepId ? stepById(stepId) : null;
  const root = h("div", { class: "screen lesson" });
  if (!lesson) {
    root.textContent = "Les niet gevonden.";
    return { el: root, dispose() {} };
  }
  const stage = h("div", { class: "lesson-stage" });
  const card = h("div", { class: "lesson-card" });
  root.append(
    h(
      "header",
      { class: "topbar" },
      h("a", { class: "round-btn", href: step ? "#/cursus" : "#/", "aria-label": "Terug", html: UI.back }),
      h("div", { class: "title" }, h("span", { class: "t-name" }, lesson.title), h("span", { class: "t-meta" }, `Les · ${lesson.subtitle}${step ? ` · hoofdstuk ${step.chapter.n}` : ""}`)),
    ),
    h("div", { class: "lesson-body" }, stage, card),
  );
  let k = 0;
  let widget: Widget | null = null;
  let widgetType = "";
  const gl = webglAvailable();
  if (!gl) stage.innerHTML = `<p class="nogl">Deze browser kan geen 3D tonen. De tekst werkt wel.</p>`;

  const render = () => {
    const c = lesson.cards[k];
    if (gl) {
      if (widget && widgetType === c.widget.type && !["neighbors", "lines", "hyperplane"].includes(c.widget.type)) widget.update(c.widget);
      else if (widget && widgetType === c.widget.type) widget.update(c.widget);
      else {
        widget?.dispose();
        stage.innerHTML = "";
        widget = createWidget(stage, c.widget);
        widgetType = c.widget.type;
      }
    }
    const last = k === lesson.cards.length - 1;
    const nxt = step ? nextStep(step.step.id) : null;
    card.innerHTML = "";
    card.append(
      h("div", { class: "dots" }, ...lesson.cards.map((_, j) => h("button", { class: j === k ? "on" : j < k ? "seen" : "", "aria-label": `Kaart ${j + 1}`, onclick: () => ((k = j), render()) }))),
      h("h2", {}, c.title),
      h("div", { class: "lesson-text", html: c.text }),
      c.tip ? h("p", { class: "tip" }, c.tip) : "",
      h(
        "div",
        { class: "lesson-nav" },
        h("button", { class: "btn ghost", disabled: k === 0, onclick: () => k > 0 && ((k -= 1), render()) }, "Vorige"),
        last
          ? h(
              "button",
              {
                class: "btn primary",
                onclick: () => {
                  if (step) store.markDone(step.step.id, 0);
                  sfx.win();
                  location.hash = nxt ? stepHref(nxt.step) : step ? "#/cursus" : "#/";
                },
              },
              nxt ? "Naar de puzzel" : "Klaar",
            )
          : h("button", { class: "btn primary", onclick: () => ((k += 1), sfx.tap(), render()) }, "Verder"),
      ),
    );
  };
  render();
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input")) return;
    if (e.key === "ArrowRight" && k < lesson.cards.length - 1) {
      k++;
      render();
    } else if (e.key === "ArrowLeft" && k > 0) {
      k--;
      render();
    }
  };
  window.addEventListener("keydown", onKey);
  return {
    el: root,
    dispose() {
      window.removeEventListener("keydown", onKey);
      widget?.dispose();
    },
  };
}
