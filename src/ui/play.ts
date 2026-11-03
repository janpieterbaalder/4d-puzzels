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
import { askConfirm, confetti, dimBadge, fmtTime, h, type Screen, toast, UI } from "./dom";
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
  // hoogte van kop- en knoppenbalk bijhouden: op telefoons vult het spelvlak de rest van het scherm
  const chromeRO = new ResizeObserver(() => root.style.setProperty("--chrome", `${top.offsetHeight + dock.offsetHeight}px`));
  chromeRO.observe(top);
  chromeRO.observe(dock);
  cleanups.push(() => chromeRO.disconnect());

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
    if (game.input === "move") buildBoardDock();
    renderAll(false);
  }

  /**
   * Doolhof: de pijlkruisen staan in het speelvlak, onderaan gecentreerd, net als de navigatiekruisen
   * van de andere puzzels in de 3D-weergave. In de bordweergave zweven ze onder het bord.
   */
  /** Doolhofpijlen: alleen richtingen zonder muur zijn te kiezen. */
  function updateDpad() {
    for (const { a, d, b } of dpad) b.disabled = !(game as any).canMove?.(a, d);
  }

  /** Doolhof in de ruimte: de open doorgangen vanaf de lichtbol, gekleurd per as. */
  function updateExits() {
    if (!space || game.input !== "move" || !game.focus) return;
    const g = game.grid;
    const me = game.focus();
    const segs: [number, number, number][] = [];
    for (let a = 0; a < g.D; a++)
      for (const d of [-1, 1]) {
        if (!(game as any).canMove?.(a, d)) continue;
        const m = g.step(me, a, d);
        if (m >= 0) segs.push([me, m, a]);
      }
    space.setExits(segs);
  }

  function buildBoardDock() {
    const bdock = h("div", { class: "board-dock" }, buildCrosses("move"));
    main.appendChild(bdock);
    // bord boven de kruisen centreren: ondermarge = hoogte van de kruisen
    const ro = new ResizeObserver(() => {
      boardPane.style.paddingBottom = bdock.offsetHeight ? `${bdock.offsetHeight + 16}px` : "";
      flat.fit();
    });
    ro.observe(bdock);
    cleanups.push(() => ro.disconnect());
  }

  function ensureSpace() {
    if (space) return;
    space = new SpatialView(spacePane, game.grid, {
      accent: T.accent,
      cellScale: T.id === "maze" ? 0.42 : 1,
      tintByW: true,
      vivid: T.id === "tectonic",
    });
    space.autoRotate = false;
    // doolhof: geen lichtsporen door muren heen, wel de echte doorgangen in de kleur van de pijlknop (updateExits)
    if (game.input === "move") space.railsEnabled = false;
    space.onPick = (i, b) => onCell(i, b);
    space.onHover = (i) => onHover(i);
    if (game.links) space.setLinks(visibleLinks(), T.accent);
    if (game.edgeMarks) space.setMarks(game.edgeMarks());
    if (D === 4 && game.grid.count > 100) space.setLayout("slices", false);
    frameFog();
    space.setVisual((i) => visualWithErrors(i));
    space.setSelected(sel);
    focusKey = "";
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
    const sdock = h("div", { class: "space-dock" });
    if (game.input === "move") {
      sdock.appendChild(buildCrosses("move"));
      updateDpad();
      updateExits();
    }
    else if (D >= 3) {
      const ov = buildNavOverlay();
      sdock.appendChild(ov);
      const navT = h("button", {
        class: "round-btn small" + (ov.hidden ? "" : " on"),
        title: "Navigatiepijlen tonen/verbergen",
        "aria-label": "Navigatiepijlen tonen of verbergen",
        html: UI.arrows,
        onclick: () => {
          ov.hidden = !ov.hidden;
          store.setSettings({ navPad: !ov.hidden });
          navT.classList.toggle("on", !ov.hidden);
          space?.resetCamera();
        },
      });
      tools.appendChild(navT);
      const fseg = h("div", { class: "seg small focus-seg", title: "Focus op de gekozen cel" });
      for (const [m, label, title] of [
        ["all", "Alles", "Toon alle cellen"],
        ["lines", "Lijnen", "Toon alleen de lijnen door de gekozen cel"],
        ["board", "Laag", "Toon alleen het bord (de laag) van de gekozen cel"],
      ] as const) {
        const b = h("button", {
          "data-f": m,
          title,
          class: m === focusMode ? "on" : "",
          onclick: () => {
            focusMode = m;
            if (m !== "all" && sel < 0) {
              sel = firstFreeCell();
              paintSel();
            }
            for (const x of fseg.querySelectorAll<HTMLElement>("button")) x.classList.toggle("on", x.dataset.f === m);
            lseg.classList.toggle("inactive", m !== "board");
            applyFocus();
          },
        }, label);
        fseg.appendChild(b);
      }
      // oriëntatie van de oplichtende laag
      const lseg = h("div", { class: "seg small layer-seg", title: "Welke laag oplicht" });
      const layerOpts: [number, string, string][] = [
        [1, "Liggend", "Horizontale laag (y vast)"],
        [2, "Staand", "Staande laag recht van voren, zoals de borden (z vast)"],
        [0, "Diepte", "Staande laag die de diepte in loopt (x vast)"],
      ];
      if (D >= 4) layerOpts.push([3, "Binnen", "De hele kubus van de gekozen cel (w vast): in de tesseract de binnen- of buitenkubus"]);
      for (const [ax, label, title] of layerOpts) {
        lseg.appendChild(
          h("button", {
            "data-ax": ax,
            title,
            class: ax === layerAxis ? "on" : "",
            onclick: () => {
              layerAxis = ax;
              for (const x of lseg.querySelectorAll<HTMLElement>("button")) x.classList.toggle("on", Number(x.dataset.ax) === ax);
              // een laag kiezen zet de focus vanzelf op "Laag"
              if (focusMode !== "board") (fseg.querySelector('button[data-f="board"]') as HTMLElement).click();
              else applyFocus();
            },
          }, label),
        );
      }
      lseg.classList.toggle("inactive", focusMode !== "board");
      // alles in één veegbare regel: focus, laag, daarna weergave en de rest
      tools.prepend(fseg, lseg);
    }
    // gereedschapsrij: op smalle schermen horizontaal scrollbaar, met ‹ › als er meer knoppen buiten beeld staan
    const row = h("div", { class: "tools-row" });
    const scrollBy = (dir: number) => tools.scrollBy({ left: dir * Math.max(120, tools.clientWidth * 0.6), behavior: "smooth" });
    const leftBtn = h("button", { class: "tools-more l", "aria-label": "Meer knoppen links", title: "Meer knoppen links", onclick: () => scrollBy(-1) }, "‹");
    const rightBtn = h("button", { class: "tools-more r", "aria-label": "Meer knoppen rechts", title: "Meer knoppen rechts", onclick: () => scrollBy(1) }, "›");
    const updateHints = () => {
      const max = tools.scrollWidth - tools.clientWidth;
      row.classList.toggle("can-l", tools.scrollLeft > 2);
      row.classList.toggle("can-r", max - tools.scrollLeft > 2);
    };
    tools.addEventListener("scroll", updateHints, { passive: true });
    const toolsRO = new ResizeObserver(updateHints);
    toolsRO.observe(tools);
    cleanups.push(() => toolsRO.disconnect());
    row.append(leftBtn, tools, rightBtn);
    sdock.appendChild(row);
    spacePane.appendChild(sdock);
    requestAnimationFrame(updateHints);
    // model boven de knoppen centreren: ondermarge = hoogte van het onderste dock
    const insetRO = new ResizeObserver(() => space?.setInsetBottom(sdock.offsetHeight + 12));
    insetRO.observe(sdock);
    cleanups.push(() => insetRO.disconnect());
    if (D === 4 && store.settings().autoRotate) {
      space.setAutoRotate(true);
      spinBtn.classList.add("on");
    }
  }

  /** 4D-doorsnede: de camera kadert de eigen doorsnede in plaats van de hele (grotendeels verborgen) tesseract. */
  function frameFog() {
    if (!space || !game.fog || D < 4 || !game.focus) return;
    const g = game.grid;
    const me = game.focus();
    const cells: number[] = [];
    for (let i = 0; i < g.count; i++) if (g.c(i, 2) === g.c(me, 2) && g.c(i, 3) === g.c(me, 3)) cells.push(i);
    space.setFrameCells(cells);
  }

  function visibleLinks(): [number, number][] {
    const all = game.links?.() ?? [];
    if (!game.fog) return all;
    // ook doorgangen naar een verborgen laag (de ruimte toont die als stompje)
    return all.filter(([a, b]) => !game.visual(a).hidden || !game.visual(b).hidden);
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
  const navBtns: { a: number; d: number; b: HTMLButtonElement }[] = [];
  let focusMode: "all" | "lines" | "board" = "all";
  /** Welke laag oplicht in Laag-modus: de vaste as (0 = diepte/x, 1 = liggend/y, 2 = staand/z, 3 = binnen/w: de hele kubus). */
  let layerAxis = 2;
  let focusKey = "";
  function buildDock() {
    dock.innerHTML = "";
    const actions = h("div", { class: "actions" });
    const act = (icon: string, label: string, fn: () => void, extra = "") =>
      h("button", { class: "action " + extra, html: icon + `<span>${label}</span>`, onclick: fn, "aria-label": label, title: label });
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
    } else {
      dock.append(actions);
    }
  }

  /**
   * Zwevende pijlkruisen in de 3D-weergave: links binnen het bord (x/y), rechts tussen de borden
   * (z = bord links/rechts, w = bord boven/onder, zoals in de platte weergave). Kost geen ruimte in de balk.
   */
  function buildNavOverlay(): HTMLElement {
    const ov = buildCrosses("nav");
    ov.hidden = !store.settings().navPad;
    return ov;
  }

  /**
   * Twee pijlkruisen, overal gelijk: links x/y (binnen het bord), rechts z (‹ ›, bord links/rechts)
   * en w (˄ ˅, bord boven/onder). "nav" verplaatst de gekozen cel, "move" de lichtbol in het doolhof.
   */
  function buildCrosses(kind: "nav" | "move"): HTMLElement {
    const ov = h("div", { class: "navpad3d", role: "group", "aria-label": kind === "move" ? "Lopen door het doolhof" : "Navigeren door het rooster" });
    const btn = (a: number, d: number, glyph: string, title: string, area: string) => {
      const b = h("button", {
        class: "nb",
        style: `--c:${AXIS_COLORS[a]};grid-area:${area}`,
        title,
        "aria-label": title,
        onclick: () => (kind === "move" ? doMove(a, d) : moveSel(a, d)),
      }, glyph) as HTMLButtonElement;
      (kind === "move" ? dpad : navBtns).push({ a, d, b });
      return b;
    };
    const xy = h(
      "div",
      { class: "cross" },
      btn(1, -1, "↑", "omhoog (y−)", "n"),
      btn(0, -1, "←", "links (x−)", "w"),
      btn(0, 1, "→", "rechts (x+)", "e"),
      btn(1, 1, "↓", "omlaag (y+)", "s"),
    );
    if (kind === "nav" && (game.input === "cycle" || game.input === "press")) {
      xy.appendChild(
        h("button", { class: "nb go", style: "grid-area:c", title: game.input === "press" ? "Druk (spatie)" : "Wissel (spatie)", "aria-label": game.input === "press" ? "Druk" : "Wissel", onclick: () => sel >= 0 && onCell(sel, 0) }, "●"),
      );
    } else xy.appendChild(h("span", { class: "cl", style: "grid-area:c" }, "xy"));
    ov.appendChild(xy);
    if (D >= 3) {
      const zw = h("div", { class: "cross" }, btn(2, -1, "‹", "bord links / laag ervoor (z−)", "w"), btn(2, 1, "›", "bord rechts / laag erachter (z+)", "e"));
      if (D >= 4) zw.append(btn(3, -1, "˄", "bord erboven: ana (w−)", "n"), btn(3, 1, "˅", "bord eronder: kata (w+)", "s"));
      if (kind === "nav" && game.input === "cycle") zw.appendChild(h("button", { class: "nb back", style: "grid-area:c", title: "Terug wisselen", "aria-label": "Terug wisselen", onclick: () => sel >= 0 && onCell(sel, 2) }, "↺"));
      else zw.appendChild(h("span", { class: "cl", style: "grid-area:c" }, D >= 4 ? "zw" : "z"));
      ov.appendChild(zw);
    }
    return ov;
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
  async function doReset() {
    if (!(await askConfirm("Deze puzzel opnieuw beginnen?", "Opnieuw beginnen"))) return;
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
    if (a >= D || !game) return;
    if (sel < 0) {
      sel = firstFreeCell();
      sfx.tap();
      paintSel();
      revealSel();
      return;
    }
    const m = game.grid.step(sel, a, d);
    if (m >= 0) {
      sel = m;
      sfx.step(a);
      paintSel();
      revealSel();
    } else sfx.bump();
  }

  function firstFreeCell(): number {
    for (let i = 0; i < game.grid.count; i++) if (!game.isFixed?.(i)) return i;
    return 0;
  }

  function revealSel() {
    flat.cellEl(sel)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  /** Focus in de 3D-weergave: alleen de lijnen of de laag van de gekozen cel volledig tonen. */
  function applyFocus() {
    if (!space) return;
    const key = focusMode + ":" + sel + ":" + layerAxis;
    if (key === focusKey) return;
    focusKey = key;
    const g = game.grid;
    if (focusMode === "all" || sel < 0) space.setFilter(null);
    else if (focusMode === "lines")
      space.setFilter((i) => {
        let diff = 0;
        for (let a = 0; a < g.D; a++) if (g.c(i, a) !== g.c(sel, a)) diff++;
        return diff <= 1;
      });
    else
      space.setFilter((i) => {
        // de laag door de gekozen cel: de gekozen as vast, en in 4D ook w (binnen dezelfde kubus)
        // "Binnen" (4D): alleen w vast → de hele kubus van de gekozen cel (in de tesseract een binnen- of buitenkubus)
        for (let a = 0; a < g.D; a++) {
          const fixed = layerAxis === 3 ? a === 3 : a === layerAxis || a >= 3;
          if (fixed && g.c(i, a) !== g.c(sel, a)) return false;
        }
        return true;
      });
  }

  function paintSel() {
    flat.setSelected(sel);
    space?.setSelected(sel);
    for (const { a, d, b } of navBtns) b.disabled = sel >= 0 && game.grid.step(sel, a, d) < 0;
    applyFocus();
    updatePad();
  }

  /**
   * Toetsenblok: een cijfer wordt lichter als het in de hele puzzel al vaak genoeg staat (instelling "padDone",
   * standaard aan). Optioneel ook als het al bij een buur van de gekozen cel staat (instelling "padPeers", standaard uit).
   */
  function updatePad() {
    if (!padBtns.length) return;
    const st = store.settings();
    const vals = (game as any).vals as Int8Array | undefined;
    const sol = (game as any).solution as Int8Array | undefined;
    const used = new Set<number>();
    if (st.padPeers && vals && sel >= 0 && game.peers) for (const q of game.peers(sel)) if (vals[q]) used.add(vals[q]);
    const done = new Set<number>();
    if (st.padDone && vals && sol) {
      const need = new Array(padBtns.length + 1).fill(0);
      const have = new Array(padBtns.length + 1).fill(0);
      for (let i = 0; i < sol.length; i++) {
        need[sol[i]]++;
        if (vals[i]) have[vals[i]]++;
      }
      for (let v = 1; v <= padBtns.length; v++) if (need[v] > 0 && have[v] >= need[v]) done.add(v);
    }
    padBtns.forEach((b, k) => {
      b.classList.toggle("done", done.has(k + 1));
      b.classList.toggle("used", !done.has(k + 1) && used.has(k + 1));
      b.title = done.has(k + 1) ? "Dit cijfer staat overal" : "";
    });
  }

  function renderAll(fromAction = true) {
    if (!game) return;
    const st = updateStatus();
    flat.render();
    paintSel();
    if (space) {
      space.refresh();
      if (game.fog && game.links) space.setLinks(visibleLinks(), T.accent);
      frameFog();
      updateExits();
    }
    updateDpad();
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
