import * as THREE from "three";
import { sfx } from "../core/audio";
import { Rng } from "../core/rng";
import { store } from "../core/store";
import { nextStep, stepById } from "../course/curriculum";
import { DB_PRESETS, DotsBoxes } from "../games/dotsboxes";
import { GraphView, type GEdge, type GFace, type GNode } from "../view/graph";
import { AXIS_COLORS, type Vec4 } from "../view/math4d";
import { webglAvailable } from "../view/stage";
import { confetti, dimBadge, h, type Screen, UI } from "./dom";
import { stepHref } from "./nav";

const ME = "#4fe3ff";
const CPU = "#ff7a8a";

export function duelScreen(presetId: string, stepId?: string): Screen {
  const preset = DB_PRESETS.find((p) => p.id === presetId) ?? DB_PRESETS[0];
  const step = stepId ? stepById(stepId) : null;
  const D = preset.dots.length;
  const root = h("div", { class: "screen duel", style: "--accent:#ff9a4a" });
  const stage = h("div", { class: "duel-stage" });
  const scoreMe = h("b", {}, "0");
  const scoreCpu = h("b", {}, "0");
  const turnEl = h("p", { class: "turn" });
  const levelSeg = h("div", { class: "seg small" });
  const layoutSeg = h("div", { class: "seg small" });
  const stats = h("div", { class: "card panel" });
  root.append(
    h(
      "header",
      { class: "topbar" },
      h("a", { class: "round-btn", href: step ? "#/cursus" : "#/vrij", "aria-label": "Terug", html: UI.back }),
      h("div", { class: "title" }, h("span", { class: "t-name", html: `Kamertje verhuren ${dimBadge(D)}` }), h("span", { class: "t-meta" }, preset.label)),
      h("div", { class: "top-actions" }, h("button", { class: "btn ghost small", onclick: () => restart() }, "Nieuw spel")),
    ),
    h(
      "div",
      { class: "duel-body" },
      stage,
      h(
        "aside",
        { class: "side" },
        h("div", { class: "card score" }, h("div", { class: "me" }, h("span", {}, "Jij"), scoreMe), h("div", { class: "cpu" }, h("span", {}, "Computer"), scoreCpu), turnEl),
        h(
          "div",
          { class: "card rules" },
          h("h4", {}, "Spelregels"),
          h(
            "ul",
            { html: "<li>Om de beurt trek je één streep tussen twee buurpunten.</li><li>Maak je de vierde wand van een kamer (een vierkantje), dan is die kamer van jou en ben je nóg een keer aan de beurt.</li><li>Wie de meeste kamers heeft als alle strepen getrokken zijn, wint.</li>" },
          ),
          h("p", { class: "dimnote" }, preset.note),
        ),
        h("div", { class: "card" }, h("h4", {}, "Tegenstander"), levelSeg, D === 4 ? h("h4", {}, "Weergave") : null, D === 4 ? layoutSeg : null),
        stats,
      ),
    ),
  );

  let game = new DotsBoxes(preset.dots);
  let level: 1 | 2 | 3 = 2;
  const rng = new Rng("duel" + Math.random());
  let view: GraphView | null = null;
  let hover = -1;
  let busy = false;
  let lastMove = -1;
  let layoutT = 0; // 0 = projectie, 1 = twee kubussen
  let layoutTarget = 0;

  for (const [lv, label] of [
    [1, "Rustig"],
    [2, "Normaal"],
    [3, "Slim"],
  ] as [1 | 2 | 3, string][]) {
    levelSeg.appendChild(
      h(
        "button",
        {
          class: lv === level ? "on" : "",
          onclick: (e: Event) => {
            level = lv;
            for (const b of levelSeg.querySelectorAll("button")) b.classList.toggle("on", b === e.currentTarget);
          },
        },
        label,
      ),
    );
  }
  for (const [t, label] of [
    [0, "Tesseract"],
    [1, "Twee kubussen"],
  ] as [number, string][]) {
    layoutSeg.appendChild(
      h(
        "button",
        {
          class: t === 0 ? "on" : "",
          onclick: (e: Event) => {
            layoutTarget = t;
            for (const b of layoutSeg.querySelectorAll("button")) b.classList.toggle("on", b === e.currentTarget);
          },
        },
        label,
      ),
    );
  }

  const posOf = (i: number, t: number): Vec4 => {
    const g = game.grid;
    const c = (a: number) => (a < g.D ? g.c(i, a) - (g.n[a] - 1) / 2 : 0);
    const s = D === 4 ? 2 : 1.6;
    if (D < 4) return [c(0) * s, -c(1) * s, -c(2) * s, 0];
    const proj: Vec4 = [c(0) * s, -c(1) * s, -c(2) * s, c(3) * s];
    const split: Vec4 = [c(0) * s * 0.8 + c(3) * 3.4, -c(1) * s * 0.8, -c(2) * s * 0.8, 0];
    return proj.map((v, k) => v + (split[k] - v) * t) as Vec4;
  };

  function buildView() {
    view?.dispose();
    if (!webglAvailable()) {
      stage.innerHTML = "<p class='nogl'>Deze browser kan geen 3D tonen.</p>";
      return;
    }
    const v = (view = new GraphView(stage));
    v.dist = D === 4 ? 3.2 : 50;
    v.haloNodes = false;
    v.pickRadius = D === 2 ? 0.32 : 0.22;
    const nodes: GNode[] = [];
    for (let i = 0; i < game.grid.count; i++) nodes.push({ p: posOf(i, layoutT), color: "#eef0ff", size: 0.09 });
    const edges: GEdge[] = game.edges.map(([a, b]) => ({ a, b, color: "#3a4266", radius: 0.03 }));
    const faces: GFace[] = game.squares.map((s) => ({ v: s.corners, color: "#ffffff", opacity: 0 }));
    v.setGraph(nodes, edges, faces);
    if (D >= 3) v.rot = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };
    v.layoutNodes();
    const r = D === 2 ? (preset.dots[0] - 1) * 0.95 : D === 3 ? 2.6 : preset.dots[0] > 2 ? 4.4 : 3.0;
    v.frame(r, D === 2 ? new THREE.Vector3(0, -0.25, 1) : new THREE.Vector3(0.7, 0.5, 1));
    v.onEdgePick = (k) => humanMove(k);
    v.onEdgeHover = (k) => {
      hover = k;
      paint();
    };
    v.addTicker((dt) => {
      if (Math.abs(layoutT - layoutTarget) < 1e-3) return false;
      layoutT += Math.sign(layoutTarget - layoutT) * Math.min(Math.abs(layoutTarget - layoutT), dt * 1.4);
      v.nodes.forEach((n, i) => (n.p = posOf(i, layoutT)));
      v.layoutNodes();
      return true;
    });
    paint();
  }

  function paint() {
    const v = view;
    if (v) {
      v.edges.forEach((e, k) => {
        const d = game.drawn[k];
        const ax = game.edges[k][2];
        e.color = d === 1 ? ME : d === 2 ? CPU : k === hover && game.turn === 1 && !busy ? "#ffffff" : mix("#262b45", AXIS_COLORS[ax], 0.28);
        e.radius = d ? (k === lastMove ? 0.08 : 0.06) : k === hover ? 0.055 : 0.02;
        e.glow = d ? 1 : 0;
      });
      v.faces.forEach((f, s) => {
        const o = game.owner[s];
        f.color = o === 1 ? ME : o === 2 ? CPU : "#ffffff";
        f.opacity = o ? 0.34 : 0;
      });
      v.restyle();
    }
    scoreMe.textContent = String(game.score[1]);
    scoreCpu.textContent = String(game.score[2]);
    root.classList.toggle("my-turn", game.turn === 1);
    turnEl.textContent = game.over ? resultText() : game.turn === 1 ? "Jij bent aan zet. Klik op een streep." : "De computer denkt na…";
    const st = game.stats();
    stats.innerHTML = `<h4>Dit bord</h4><div class="pi"><span>Punten</span><b>${st.dots}</b></div><div class="pi"><span>Strepen</span><b>${st.edges}</b></div><div class="pi"><span>Kamers</span><b>${st.squares}</b></div><div class="pi"><span>Kamers per streep (max)</span><b>${st.maxPerEdge}</b></div><div class="pi"><span>Nog te trekken</span><b>${game.drawn.filter((d) => !d).length}</b></div>`;
  }

  function resultText() {
    const [, a, b] = game.score;
    return a > b ? `Gewonnen met ${a} tegen ${b}!` : a < b ? `Verloren: ${a} tegen ${b}.` : `Gelijkspel: ${a} – ${b}.`;
  }

  function humanMove(k: number) {
    if (busy || game.turn !== 1 || game.over || game.drawn[k]) return;
    const done = game.play(k);
    lastMove = k;
    done ? sfx.claim(done) : sfx.place();
    paint();
    afterMove();
  }

  function afterMove() {
    if (game.over) return finish();
    if (game.turn === 2) {
      busy = true;
      setTimeout(cpuStep, 520);
    }
  }

  function cpuStep() {
    if (disposed) return;
    const e = game.aiMove(level, rng);
    if (e < 0) return;
    const done = game.play(e);
    lastMove = e;
    done ? sfx.claim(done) : sfx.tap();
    paint();
    if (game.over) {
      busy = false;
      return finish();
    }
    if (game.turn === 2) setTimeout(cpuStep, 420);
    else busy = false;
    paint();
  }

  function finish() {
    paint();
    const [, a, b] = game.score;
    const won = a > b;
    if (won) {
      sfx.win();
      confetti(root);
      if (step) store.markDone(step.step.id, 0);
    }
    const nxt = step ? nextStep(step.step.id) : null;
    const ov = h(
      "div",
      { class: "solved" },
      h(
        "div",
        { class: "solved-card" },
        h("p", { class: "kicker" }, won ? "Gewonnen!" : a === b ? "Gelijkspel" : "Verloren"),
        h("h2", {}, `${a} – ${b}`),
        h("p", { class: "solved-note" }, won ? (D === 4 ? "Je hebt een tesseract verhuurd." : "Mooi gespeeld.") : "Tip: geef nooit een kamer met drie wanden weg, tenzij het niet anders kan."),
        h(
          "div",
          { class: "solved-actions" },
          h("button", { class: "btn ghost", onclick: () => (ov.remove(), restart()) }, "Nog een keer"),
          won && nxt ? h("a", { class: "btn primary", href: stepHref(nxt.step) }, "Volgende stap") : h("a", { class: "btn primary", href: step ? "#/cursus" : "#/vrij" }, step ? "Cursus" : "Klaar"),
        ),
      ),
    );
    setTimeout(() => !disposed && root.appendChild(ov), 500);
  }

  function restart() {
    game = new DotsBoxes(preset.dots);
    busy = false;
    lastMove = -1;
    root.querySelector(".solved")?.remove();
    buildView();
  }

  let disposed = false;
  requestAnimationFrame(buildView);
  return {
    el: root,
    dispose() {
      disposed = true;
      view?.dispose();
    },
  };
}

function mix(a: string, b: string, t: number) {
  return "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
