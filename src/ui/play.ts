import { sfx } from "../core/audio";
import { randomSeed } from "../core/rng";
import { store } from "../core/store";
import { nextStep, stepById } from "../course/curriculum";
import { generatePuzzle } from "../gen/client";
import { presetById } from "../puzzles/registry";
import type { HyperClue, PuzzleGame } from "../puzzles/types";
import { sizeLabel } from "../puzzles/types";
import { FlatBoard } from "../view/flat";
import { AXIS_COLORS } from "../view/math4d";
import { LAYOUT_LABEL, layoutsFor, SpatialView, type Layout } from "../view/spatial";
import { webglAvailable } from "../view/stage";
import { confetti, dimBadge, fmtTime, h, type Screen, toast, UI } from "./dom";
import { stepHref } from "./nav";

export interface PlayParams {
  type: string;
  preset: string;
  seed: string;
  fog?: boolean;
  step?: string;
}

type ViewMode = "board" | "space" | "split";

const AX = ["x", "y", "z", "w"];

export function playScreen(p: PlayParams): Screen {
  const { type: T, preset: P } = presetById(p.type, p.preset);
  const D = P.sizes.length;
  const step = p.step ? stepById(p.step) : null;
  const root = h("div", { class: "screen play", style: `--accent:${T.accent}` });
  const saveKey = `${p.type}:${p.preset}:${p.seed}:${p.fog ? 1 : 0}`;
  let disposed = false;
  const cleanups: (() => void)[] = [];

  /* ---------- kop ---------- */
  const timerEl = h("span", { class: "chip time" }, "00:00");
  const progEl = h("span", { class: "chip prog" }, "0%");
  const backHref = step ? "#/cursus" : "#/vrij";
  const viewSeg = h("div", { class: "seg view-seg", role: "radiogroup", "aria-label": "Weergave" });
  const top = h(
    "header",
    { class: "topbar" },
    h("a", { class: "round-btn", href: backHref, "aria-label": "Terug", html: UI.back }),
    h(
      "div",
      { class: "title" },
      h("span", { class: "t-name", html: `${T.name} ${dimBadge(D)}` }),
      h("span", { class: "t-meta" }, `${P.label} · ${sizeLabel(P.sizes)}${p.fog ? " · doorsnede" : ""}${step ? ` · hoofdstuk ${step.chapter.n}` : ""}`),
    ),
    h("div", { class: "top-actions" }, progEl, timerEl, viewSeg, h("button", { class: "round-btn", "aria-label": "Spelregels", html: UI.help, onclick: () => showRules(true) })),
  );
  const main = h("div", { class: "play-main" });
  const boardPane = h("div", { class: "pane board-pane" });
  const spacePane = h("div", { class: "pane space-pane" });
  const side = h("aside", { class: "side" });
  const dock = h("div", { class: "dock" });
  main.append(boardPane, spacePane);
  const body = h("div", { class: "play-body" }, main, side);
  root.append(top, body, dock);
  const loading = h("div", { class: "loading" }, h("div", { class: "spinner", html: UI.tesseract }), h("p", {}, `${T.name} in ${D}D wordt gebouwd…`));
  boardPane.appendChild(loading);

  let game: PuzzleGame;
  let flat: FlatBoard;
  let space: SpatialView | null = null;
  let sel = -1;
  let pencil = false;
  let undo: string[] = [];
  let redo: string[] = [];
  let seconds = 0;
  let running = false;
  let solved = false;
  let hintMsg = "";
  let clueHL: Map<number, string> | null = null;
  const statusEl = h("div", { class: "status" });
  const panelEl = h("div", { class: "panel-items" });
  const cluesEl = h("div", { class: "clues" });

  const tick = setInterval(() => {
    if (running && !solved && !document.hidden) {
      seconds++;
      timerEl.textContent = fmtTime(seconds);
      if (seconds % 10 === 0) save();
    }
  }, 1000);
  cleanups.push(() => clearInterval(tick));

  function save() {
    if (!game || solved) return;
    store.saveGame(saveKey, game.getState(), seconds);
  }

  /* ---------- regels ---------- */
  const rules = T.rules(D, P);
  function rulesHtml() {
    return `<p class="goal">${rules.goal}</p><ul>${rules.rules.map((r) => `<li>${r}</li>`).join("")}</ul>${rules.dimNote ? `<p class="dimnote"><b>${D}D:</b> ${rules.dimNote}</p>` : ""}`;
  }
  function showRules(open: boolean) {
    const dlg = h(
      "div",
      { class: "modal", onclick: (e: Event) => e.target === dlg && dlg.remove() },
      h(
        "div",
        { class: "sheet" },
        h("header", {}, h("h2", { html: `${T.name} ${dimBadge(D)}` }), h("button", { class: "round-btn", "aria-label": "Sluiten", html: UI.close, onclick: () => dlg.remove() })),
        h("div", { class: "sheet-body rules", html: rulesHtml() + keysHtml() }),
      ),
    );
    if (open) root.appendChild(dlg);
  }
  function keysHtml() {
    const k = ["<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> bewegen in het bord"];
    if (D >= 3) k.push("<kbd>Shift</kbd> + <kbd>←</kbd><kbd>→</kbd> naar het bord links/rechts (z)");
    if (D >= 4) k.push("<kbd>Shift</kbd> + <kbd>↑</kbd><kbd>↓</kbd> naar het bord erboven/eronder (w)");
    if (T.id !== "maze") k.push("<kbd>Spatie</kbd> invullen/wisselen · rechtsklik terug");
    k.push("<kbd>Ctrl</kbd>+<kbd>Z</kbd> terug · <kbd>H</kbd> hint");
    return `<h3>Toetsen</h3><p class="keys">${k.join("<br>")}</p>`;
  }

  /* ---------- opbouw na genereren ---------- */
  void generatePuzzle(p.type, p.preset, p.seed)
    .then((data) => {
      if (disposed) return;
      game = T.create(data, { fog: p.fog });
      const saved = store.loadGame(saveKey);
      if (saved) {
        try {
          game.setState(saved.s);
          seconds = saved.t;
          timerEl.textContent = fmtTime(seconds);
        } catch {
          /* oude opslag */
        }
      }
      loading.remove();
      build();
      running = true;
    })
    .catch((e) => {
      loading.innerHTML = `<p>Er ging iets mis bij het bouwen van de puzzel.</p><small>${String(e)}</small>`;
    });

  function build() {
    const lined = ["sudoku", "tectonic", "maze"].includes(T.id);
    flat = new FlatBoard(boardPane, game, { onCell, onHover }, { lined });
    flat.showRails = store.settings().rails;
    if (game.focus) sel = game.focus();

    // weergavekeuze
    const canSpace = webglAvailable();
    const modes: [ViewMode, string, string][] = [
      ["board", "Bord", UI.board],
      ["split", "Beide", UI.split],
      ["space", "Ruimte", UI.cube],
    ];
    const wide = matchMedia("(min-width: 1100px)").matches;
    let mode: ViewMode = D >= 3 && wide && canSpace ? "split" : "board";
    for (const [m, label, icon] of modes) {
      if (!canSpace && m !== "board") continue;
      if (m === "split" && !wide) continue;
      const b = h("button", { "data-m": m, title: label, html: icon + `<span>${label}</span>`, onclick: () => setMode(m) });
      viewSeg.appendChild(b);
    }
    const setMode = (m: ViewMode) => {
      mode = m;
      main.dataset.mode = m;
      for (const b of viewSeg.querySelectorAll<HTMLElement>("button")) b.classList.toggle("on", b.dataset.m === m);
      if (m !== "board") ensureSpace();
      requestAnimationFrame(() => {
        flat.fit();
        space?.resize();
      });
    };
    setMode(mode);

    buildSide();
    buildDock();
    renderAll(false);
  }

  function ensureSpace() {
    if (space) return;
    space = new SpatialView(spacePane, game.grid, {
      accent: T.accent,
      cellScale: T.id === "maze" ? 0.42 : 1,
      tintByW: true,
    });
    space.autoRotate = false;
    space.onPick = (i, b) => onCell(i, b);
    space.onHover = (i) => onHover(i);
    if (game.links) space.setLinks(visibleLinks(), T.accent);
    if (game.edgeMarks) space.setMarks(game.edgeMarks());
    if (D === 4 && game.grid.count > 100) space.setLayout("slices", false);
    space.setVisual((i) => visualWithErrors(i));
    space.setSelected(sel);
    // gereedschap
    const layouts = layoutsFor(D);
    const tools = h("div", { class: "space-tools" });
    if (layouts.length > 1) {
      const seg = h("div", { class: "seg small" });
      for (const l of layouts) {
        const b = h("button", {
          "data-l": l,
          onclick: () => {
            space!.setLayout(l as Layout);
            for (const x of seg.querySelectorAll<HTMLElement>("button")) x.classList.toggle("on", x.dataset.l === l);
            spinBtn.hidden = l !== "tesseract";
          },
        }, LAYOUT_LABEL[l]);
        if (l === space.layout) b.classList.add("on");
        seg.appendChild(b);
      }
      tools.appendChild(seg);
    }
    const spinBtn = h("button", {
      class: "round-btn small",
      title: "Draai in 4D (xw- en zw-vlak)",
      html: UI.spin,
      onclick: () => {
        space!.setAutoRotate(!space!.autoRotate);
        spinBtn.classList.toggle("on", space!.autoRotate);
      },
    });
    spinBtn.hidden = space.layout !== "tesseract";
    const gap = h("input", { type: "range", min: "0", max: "1.2", step: "0.05", value: String(space.gap), title: "Ruimte tussen cellen" }) as HTMLInputElement;
    gap.oninput = () => space!.setGap(Number(gap.value));
    tools.append(spinBtn, h("label", { class: "gap", title: "Ruimte tussen cellen" }, h("span", {}, "ruimte"), gap), h("button", { class: "round-btn small", title: "Camera herstellen", html: UI.camera, onclick: () => space!.resetCamera() }));
    spacePane.appendChild(tools);
    if (D === 4 && store.settings().autoRotate) {
      space.setAutoRotate(true);
      spinBtn.classList.add("on");
    }
  }

  function visibleLinks(): [number, number][] {
    const all = game.links?.() ?? [];
    if (!game.fog) return all;
    return all.filter(([a, b]) => !game.visual(a).hidden && !game.visual(b).hidden);
  }

  function visualWithErrors(i: number) {
    const v = game.visual(i);
    if (errorSet.has(i) && store.settings().showErrors) v.error = true;
    return v;
  }
  let errorSet = new Set<number>();

  /* ---------- zijpaneel ---------- */
  function buildSide() {
    side.innerHTML = "";
    if (step && step.step.kind === "puzzle" && step.step.note) side.appendChild(h("div", { class: "card note", html: `<b>Opdracht</b>${step.step.note}` }));
    const rulesCard = h("details", { class: "card rules", open: true }, h("summary", {}, "Spelregels"), h("div", { html: rulesHtml() }));
    side.append(rulesCard, statusEl, cluesEl, panelEl);
  }

  function updateStatus() {
    const st = game.check();
    errorSet = new Set(st.errors);
    const pct = Math.round(st.progress * 100);
    progEl.textContent = pct + "%";
    progEl.style.setProperty("--p", String(pct));
    const info = st.info ? `<p class="info">${st.info}</p>` : "";
    const errs = st.errors.length && store.settings().showErrors ? `<p class="warn">${st.errors.length} cel${st.errors.length === 1 ? "" : "len"} in conflict</p>` : "";
    statusEl.className = "card status" + (hintMsg || errs || info ? "" : " empty");
    statusEl.innerHTML = `<div class="bar"><i style="width:${pct}%"></i></div>${info}${errs}${hintMsg ? `<p class="hintmsg">${hintMsg}</p>` : ""}`;
    // paneel
    const pnl = game.panel?.();
    panelEl.className = "card panel";
    panelEl.innerHTML = pnl
      ? `<h4>${pnl.title}</h4>` +
        pnl.items.map((it) => `<div class="pi${it.done ? " done" : ""}"><span>${it.label}</span><b ${it.color ? `style="color:${it.color}"` : ""}>${it.value}</b></div>`).join("")
      : "";
    renderClues();
    return st;
  }

  function renderClues() {
    const clues = game.clues?.();
    if (!clues) {
      cluesEl.hidden = true;
      return;
    }
    cluesEl.hidden = false;
    cluesEl.className = "card clues";
    const byAxis: HyperClue[][] = [];
    for (const c of clues) (byAxis[c.axis] ??= []).push(c);
    const names = ["", "", "rij/kolom", "laag", "3D-plak"];
    cluesEl.innerHTML =
      `<h4>Tellingen per ${names[D]}</h4>` +
      byAxis
        .map(
          (list, a) =>
            `<div class="clue-line"><b class="ax ${AX[a]}">${AX[a]}</b>${list
              .map(
                (c) =>
                  `<button class="cchip${c.current > c.target ? " over" : c.current === c.target ? " done" : ""}" data-a="${a}" data-k="${c.k}" title="${AX[a]} = ${c.k}: ${c.current} van ${c.target}"><i>${c.target}</i><small>${c.current}</small></button>`,
              )
              .join("")}</div>`,
        )
        .join("");
    for (const b of cluesEl.querySelectorAll<HTMLElement>(".cchip")) {
      const a = Number(b.dataset.a);
      const k = Number(b.dataset.k);
      const on = () => {
        clueHL = new Map(game.grid.hyperplane(a, k).map((c) => [c, AXIS_COLORS[a]]));
        applyHL();
      };
      const off = () => {
        clueHL = null;
        applyHL();
      };
      b.addEventListener("pointerenter", on);
      b.addEventListener("pointerleave", off);
      b.addEventListener("focus", on);
      b.addEventListener("blur", off);
    }
  }

  function applyHL() {
    const m = clueHL ?? new Map<number, string>();
    flat.setHighlight(m);
    space?.setHighlightMap(m);
  }

  /* ---------- dock ---------- */
  const padBtns: HTMLButtonElement[] = [];
  const dpad: { a: number; d: number; b: HTMLButtonElement }[] = [];
  function buildDock() {
    dock.innerHTML = "";
    const actions = h("div", { class: "actions" });
    const act = (icon: string, label: string, fn: () => void, extra = "") =>
      h("button", { class: "action " + extra, html: icon + `<span>${label}</span>`, onclick: fn, "aria-label": label });
    actions.append(
      act(UI.undo, "Terug", doUndo),
      act(UI.redo, "Opnieuw", doRedo),
      act(UI.hint, "Hint", doHint),
      act(UI.reset, "Begin", doReset),
    );
    if (game.input === "number") {
      const pad = h("div", { class: "pad" });
      const syms = game.symbols ?? [];
      syms.forEach((s, k) => {
        const b = h("button", { class: "key", onclick: () => enterValue(k + 1) }, s) as HTMLButtonElement;
        padBtns.push(b);
        pad.appendChild(b);
      });
      pad.appendChild(h("button", { class: "key erase", html: UI.erase, "aria-label": "Wissen", onclick: () => enterValue(0) }));
      const pen = act(UI.pencil, "Potlood", () => {
        pencil = !pencil;
        pen.classList.toggle("on", pencil);
        pad.classList.toggle("pencil", pencil);
      });
      const autoB = act(UI.auto, "Opties", () => {
        const g = game as any;
        if (typeof g.autoNotes === "function") {
          snapshot();
          g.autoNotes();
          renderAll();
        }
      });
      actions.prepend(pen, autoB);
      dock.append(pad, actions);
    } else if (game.input === "move") {
      const pad = h("div", { class: "dpad" });
      const glyph = [
        ["←", "→"],
        ["↑", "↓"],
        ["‹ z", "z ›"],
        ["ana", "kata"],
      ];
      for (let a = 0; a < D; a++) {
        const grp = h("div", { class: "dgrp", style: `--c:${AXIS_COLORS[a]}` }, h("b", {}, AX[a]));
        for (const d of [-1, 1]) {
          const b = h("button", { class: "dkey", onclick: () => doMove(a, d) }, glyph[a][d < 0 ? 0 : 1]) as HTMLButtonElement;
          dpad.push({ a, d, b });
          grp.appendChild(b);
        }
        pad.appendChild(grp);
      }
      dock.append(pad, actions);
    } else {
      dock.append(h("p", { class: "dock-tip" }, game.input === "press" ? "Tik op een cel om te drukken." : "Tik om te wisselen · rechtsklik of lang drukken om terug te gaan."), actions);
    }
  }

  /* ---------- acties ---------- */
  function snapshot() {
    undo.push(JSON.stringify(game.getState()));
    if (undo.length > 400) undo.shift();
    redo = [];
  }
  function doUndo() {
    const s = undo.pop();
    if (!s) return;
    redo.push(JSON.stringify(game.getState()));
    game.setState(JSON.parse(s));
    if (game.focus) sel = game.focus();
    hintMsg = "";
    renderAll();
  }
  function doRedo() {
    const s = redo.pop();
    if (!s) return;
    undo.push(JSON.stringify(game.getState()));
    game.setState(JSON.parse(s));
    if (game.focus) sel = game.focus();
    renderAll();
  }
  function doHint() {
    if (!game.hint) return;
    const hnt = game.hint();
    sfx.hint();
    hintMsg = hnt ? hnt.text : "Geen hint nodig: alles klopt tot nu toe.";
    if (hnt && hnt.cells.length && game.input === "number") sel = hnt.cells[0];
    renderAll(false);
  }
  function doReset() {
    if (!confirm("Deze puzzel opnieuw beginnen?")) return;
    snapshot();
    void generatePuzzle(p.type, p.preset, p.seed).then((data) => {
      const g2 = T.create(data, { fog: p.fog });
      game.setState(g2.getState());
      seconds = 0;
      if (game.focus) sel = game.focus();
      hintMsg = "";
      store.clearGame(saveKey);
      renderAll();
    });
  }

  function onCell(i: number, button: number) {
    if (!game || solved) return;
    if (game.input === "number") {
      sel = i;
      if (button === 2 && !game.isFixed?.(i)) {
        enterValue(0);
        return;
      }
      sfx.tap();
      paintSel();
      return;
    }
    if (game.input === "move") {
      const before = JSON.stringify(game.getState());
      if (game.act!(i, 1)) {
        undo.push(before);
        redo = [];
        sel = game.focus!();
        sfx.step(game.grid.axisBetween(JSON.parse(before).p, sel));
        hintMsg = "";
        renderAll();
      } else sfx.bump();
      return;
    }
    if (game.isFixed?.(i)) {
      sfx.bump();
      return;
    }
    snapshot();
    const ok = game.act!(i, button === 2 ? -1 : 1);
    if (!ok) {
      undo.pop();
      return;
    }
    sel = i;
    hintMsg = "";
    sfx.place();
    renderAll();
  }

  function onHover(i: number) {
    flat?.setHovered(i);
    space?.setHovered(i);
  }

  function enterValue(v: number) {
    if (sel < 0 || !game.enter) return;
    if (game.isFixed?.(sel)) {
      sfx.bump();
      return;
    }
    snapshot();
    if (!game.enter(sel, v, pencil)) {
      undo.pop();
      sfx.bump();
      return;
    }
    hintMsg = "";
    v ? sfx.place() : sfx.tap();
    renderAll();
  }

  function doMove(a: number, d: number) {
    if (!game.move || solved) return;
    const before = JSON.stringify(game.getState());
    if (game.move(a, d)) {
      undo.push(before);
      redo = [];
      sel = game.focus!();
      sfx.step(a);
      hintMsg = "";
      renderAll();
      flat.cellEl(sel)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    } else sfx.bump();
  }

  function moveSel(a: number, d: number) {
    if (a >= D) return;
    if (sel < 0) sel = 0;
    const m = game.grid.step(sel, a, d);
    if (m >= 0) {
      sel = m;
      paintSel();
    }
  }

  function paintSel() {
    flat.setSelected(sel);
    space?.setSelected(sel);
    // toetsenblok: dim onmogelijke cijfers
    if (padBtns.length && sel >= 0 && game.peers) {
      const used = new Set<number>();
      const vals = (game as any).vals as Int8Array | undefined;
      if (vals) for (const q of game.peers(sel)) if (vals[q]) used.add(vals[q]);
      padBtns.forEach((b, k) => b.classList.toggle("used", used.has(k + 1)));
    }
  }

  function renderAll(fromAction = true) {
    if (!game) return;
    const st = updateStatus();
    flat.render();
    paintSel();
    if (space) {
      if (game.fog && game.links) space.setLinks(visibleLinks(), T.accent);
      space.refresh();
    }
    for (const { a, d, b } of dpad) b.disabled = !(game as any).canMove?.(a, d);
    if (fromAction) {
      running = true;
      save();
    }
    if (st.solved && !solved) win();
  }

  function win() {
    solved = true;
    running = false;
    store.clearGame(saveKey);
    store.addSolved(T.id, D);
    if (step) store.markDone(step.step.id, seconds);
    sfx.win();
    confetti(root);
    const nxt = step ? nextStep(step.step.id) : null;
    const moves = game.moves?.() ?? undo.length;
    const card = h(
      "div",
      { class: "solved-card" },
      h("p", { class: "kicker" }, "Opgelost!"),
      h("h2", { html: `${T.name} ${dimBadge(D)}` }),
      h("div", { class: "solved-stats" }, h("div", {}, h("b", {}, fmtTime(seconds)), h("span", {}, "tijd")), h("div", {}, h("b", {}, String(moves)), h("span", {}, "zetten"))),
      D === 4 ? h("p", { class: "solved-note" }, "Je hebt zojuist in vier dimensies gedacht.") : null,
      h(
        "div",
        { class: "solved-actions" },
        step
          ? h("a", { class: "btn ghost", href: "#/cursus" }, "Cursus")
          : h("a", { class: "btn ghost", href: "#/vrij" }, "Andere puzzel"),
        step && nxt
          ? h("a", { class: "btn primary", href: stepHref(nxt.step) }, "Volgende stap")
          : !step
            ? h("a", { class: "btn primary", href: `#/speel/${p.type}/${p.preset}/${randomSeed()}${p.fog ? "?fog=1" : ""}` }, "Nieuwe puzzel")
            : h("a", { class: "btn primary", href: "#/cursus" }, "Klaar!"),
      ),
    );
    const ov = h("div", { class: "solved" }, card);
    setTimeout(() => !disposed && root.appendChild(ov), 650);
  }

  /* ---------- toetsenbord ---------- */
  const onKey = (e: KeyboardEvent) => {
    if (!game || (e.target as HTMLElement).closest("input,textarea")) return;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "y") {
      e.preventDefault();
      doRedo();
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, -1], ArrowDown: [1, 1] };
    if (arrows[k]) {
      e.preventDefault();
      let [a, d] = arrows[k];
      if (e.shiftKey) a += 2;
      if (game.input === "move") doMove(a, d);
      else moveSel(a, d);
      return;
    }
    if (k === "h" || k === "H") return doHint();
    if (game.input === "number") {
      if (/^[1-9]$/.test(k)) enterValue(Number(k));
      else if (k === "Backspace" || k === "Delete" || k === "0") enterValue(0);
      else if (k === "n" || k === "N") (dock.querySelector(".action") as HTMLElement)?.click();
    } else if ((k === " " || k === "Enter") && sel >= 0 && game.input !== "move") {
      e.preventDefault();
      onCell(sel, 0);
    }
  };
  window.addEventListener("keydown", onKey);
  cleanups.push(() => window.removeEventListener("keydown", onKey));
  const onHide = () => save();
  document.addEventListener("visibilitychange", onHide);
  cleanups.push(() => document.removeEventListener("visibilitychange", onHide));

  return {
    el: root,
    dispose() {
      disposed = true;
      save();
      cleanups.forEach((f) => f());
      flat?.dispose();
      space?.dispose();
    },
  };
}

export function toastOnce(msg: string) {
  toast(msg);
}
