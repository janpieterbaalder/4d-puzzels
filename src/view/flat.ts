import type { Grid } from "../core/grid";
import type { CellVisual, PuzzleGame } from "../puzzles/types";
import { iconSvg } from "./icons";

export interface FlatCallbacks {
  onCell(i: number, button: number): void;
  onHover(i: number): void;
}

const AX = ["x", "y", "z", "w"];

/**
 * Plat 'bord-van-borden': 2D = één bord, 3D = rij borden (z), 4D = raster van borden
 * (kolommen = z, rijen = w). Zo ligt elke 4D-buur op een voorspelbare plek.
 */
export class FlatBoard {
  readonly el: HTMLDivElement;
  private grid: Grid;
  private game: PuzzleGame;
  private cells: HTMLDivElement[] = [];
  private boardEls: HTMLDivElement[] = [];
  private lined: boolean;
  private cb: FlatCallbacks;
  private sel = -1;
  private hover = -1;
  private hl = new Map<number, string>();
  private ro: ResizeObserver;
  private clueEls: { el: HTMLElement; axis: number; k: number }[] = [];
  private last: string[] = [];
  showRails = true;
  showPeers = true;

  constructor(host: HTMLElement, game: PuzzleGame, cb: FlatCallbacks, opts: { lined?: boolean } = {}) {
    this.grid = game.grid;
    this.game = game;
    this.cb = cb;
    this.lined = !!opts.lined;
    this.el = document.createElement("div");
    this.el.className = "flat" + (this.lined ? " lined" : " tiles") + ` d${this.grid.D}`;
    host.appendChild(this.el);
    this.build();
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(host);
    this.render();
  }

  private build() {
    const g = this.grid;
    const D = g.D;
    const nz = D >= 3 ? g.n[2] : 1;
    const nw = D >= 4 ? g.n[3] : 1;
    const nx = g.n[0];
    const ny = D >= 2 ? g.n[1] : 1;
    this.cells = new Array(g.count);
    const wrap = document.createElement("div");
    wrap.className = "flat-grid";
    wrap.style.setProperty("--nz", String(nz));
    wrap.style.setProperty("--nw", String(nw));
    this.el.appendChild(wrap);

    const clues = this.game.clues?.();
    const hasClues = !!clues && clues.length > 0;

    // kolomkoppen (z) voor 4D
    if (D === 4) {
      if (D === 4) wrap.appendChild(document.createElement("div"));
      for (let z = 0; z < nz; z++) {
        const h = document.createElement("div");
        h.className = "axis-head z";
        h.innerHTML = `<b>z</b> = ${z}` + (hasClues ? ` <span class="clue-chip" data-axis="2" data-k="${z}"></span>` : "");
        wrap.appendChild(h);
      }
    }
    for (let w = 0; w < nw; w++) {
      if (D === 4) {
        const h = document.createElement("div");
        h.className = "axis-head w";
        h.innerHTML = `<b>w</b> = ${w}` + (hasClues ? ` <span class="clue-chip" data-axis="3" data-k="${w}"></span>` : "");
        wrap.appendChild(h);
      }
      for (let z = 0; z < nz; z++) {
        const board = document.createElement("div");
        board.className = "board";
        board.dataset.z = String(z);
        board.dataset.w = String(w);
        if (D === 3) {
          const h = document.createElement("div");
          h.className = "axis-head z board-head";
          h.innerHTML = `<b>z</b> = ${z}` + (hasClues ? ` <span class="clue-chip" data-axis="2" data-k="${z}"></span>` : "");
          board.appendChild(h);
        }
        const inner = document.createElement("div");
        inner.className = "cells";
        inner.style.gridTemplateColumns = `repeat(${nx}, var(--cell))`;
        if (D === 2 && hasClues) {
          board.classList.add("with-clues");
          const top = document.createElement("div");
          top.className = "clue-row";
          top.style.gridTemplateColumns = `repeat(${nx}, var(--cell))`;
          for (let x = 0; x < nx; x++) top.insertAdjacentHTML("beforeend", `<span class="clue-chip" data-axis="0" data-k="${x}"></span>`);
          const left = document.createElement("div");
          left.className = "clue-col";
          left.style.gridTemplateRows = `repeat(${ny}, var(--cell))`;
          for (let y = 0; y < ny; y++) left.insertAdjacentHTML("beforeend", `<span class="clue-chip" data-axis="1" data-k="${y}"></span>`);
          board.append(document.createElement("span"), top, left);
        }
        for (let y = 0; y < ny; y++)
          for (let x = 0; x < nx; x++) {
            const c = [x, y, z, w].slice(0, D);
            const i = g.index(c);
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.dataset.i = String(i);
            this.cells[i] = cell;
            inner.appendChild(cell);
          }
        board.appendChild(inner);
        wrap.appendChild(board);
        this.boardEls.push(board);
      }
    }
    this.clueEls = [...this.el.querySelectorAll<HTMLElement>(".clue-chip")].map((el) => ({
      el,
      axis: Number(el.dataset.axis),
      k: Number(el.dataset.k),
    }));

    // invoer
    this.el.addEventListener("contextmenu", (e) => e.preventDefault());
    this.el.addEventListener("pointerdown", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!t) return;
      e.preventDefault();
      this.cb.onCell(Number(t.dataset.i), e.button);
    });
    this.el.addEventListener("pointerover", (e) => {
      if (e.pointerType === "touch") return;
      const t = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      const i = t ? Number(t.dataset.i) : -1;
      if (i !== this.hover) this.cb.onHover(i);
    });
    this.el.addEventListener("pointerleave", () => this.cb.onHover(-1));
  }

  /** Celgrootte zo kiezen dat alles past; anders scrollen. */
  fit() {
    const host = this.el.parentElement;
    if (!host) return;
    const g = this.grid;
    const D = g.D;
    const nz = D >= 3 ? g.n[2] : 1;
    const nw = D >= 4 ? g.n[3] : 1;
    const nx = g.n[0];
    const ny = D >= 2 ? g.n[1] : 1;
    const W = host.clientWidth - 30;
    const H = host.clientHeight - 30;
    const gapRatio = this.lined ? 0 : 0.14;
    const boardPad = D === 4 ? 8 : 11;
    const boardGap = 14;
    const side = D === 4 ? 40 : 0;
    const clue = D === 2 && this.clueEls.length ? 1.2 : 0;
    const size = (cols: number, rows: number, head: number) => {
      const cellsX = cols * (nx + (nx - 1) * gapRatio) + clue;
      const cellsY = rows * (ny + (ny - 1) * gapRatio) + clue;
      const fixedX = cols * boardPad * 2 + (cols - 1) * boardGap + side;
      const fixedY = rows * (boardPad * 2 + head) + (rows - 1) * boardGap + (D === 4 ? 24 : 0);
      return Math.min((W - fixedX) / cellsX, (H - fixedY) / cellsY);
    };
    let cell: number;
    if (D === 3) {
      // kies het aantal kolommen borden dat de grootste cellen oplevert
      let best = 0;
      let bestCols = nz;
      for (let cols = nz; cols >= 1; cols--) {
        const rows = Math.ceil(nz / cols);
        const c = size(cols, rows, 26);
        if (c > best + 0.5) {
          best = c;
          bestCols = cols;
        }
      }
      cell = best;
      this.el.style.setProperty("--cols", String(bestCols));
    } else cell = size(nz, nw, 0);
    const coarse = matchMedia("(pointer: coarse)").matches;
    const min = coarse ? 28 : 18;
    cell = Math.max(min, Math.min(D === 2 ? 66 : 58, Math.floor(cell)));
    this.el.style.setProperty("--cell", cell + "px");
    this.el.style.setProperty("--gap", Math.round(cell * gapRatio) + "px");
    // controleer de echte maat (koppen, tellingen) en krimp zo nodig
    for (let k = 0; k < 8 && cell > min; k++) {
      const over = Math.max(this.el.scrollWidth - (host.clientWidth - 4), this.el.scrollHeight - (host.clientHeight - 4));
      if (over <= 0) break;
      const cols = D === 4 ? nz * nx : D === 3 ? Number(this.el.style.getPropertyValue("--cols") || nz) * nx : nx;
      cell = Math.max(min, cell - Math.max(1, Math.ceil(over / Math.max(cols, ny * nw))));
      this.el.style.setProperty("--cell", cell + "px");
      this.el.style.setProperty("--gap", Math.round(cell * gapRatio) + "px");
    }
  }

  setSelected(i: number) {
    this.sel = i;
    this.paintRelations();
  }

  setHovered(i: number) {
    this.hover = i;
    this.paintRelations();
  }

  setHighlight(m: Map<number, string>) {
    this.hl = m;
    this.paintRelations();
  }

  private paintRelations() {
    const g = this.grid;
    const focus = this.hover >= 0 ? this.hover : this.sel;
    const rails = new Map<number, number>();
    if (focus >= 0 && this.showRails && this.game.input !== "move") {
      for (let a = 0; a < g.D; a++) for (const c of g.lineThrough(focus, a)) if (c !== focus) rails.set(c, a);
    }
    const peers = new Set<number>(focus >= 0 && this.showPeers && this.game.peers ? this.game.peers(focus) : []);
    for (let i = 0; i < g.count; i++) {
      const el = this.cells[i];
      const a = rails.get(i);
      el.classList.toggle("sel", i === this.sel);
      el.classList.toggle("hov", i === this.hover);
      el.classList.toggle("rail", a !== undefined);
      if (a !== undefined) el.style.setProperty("--rail", `var(--axis-${AX[a]})`);
      el.classList.toggle("peer", peers.has(i) && a === undefined);
      const h = this.hl.get(i);
      el.classList.toggle("hl", !!h);
      if (h) el.style.setProperty("--hl", h);
    }
  }

  /** Alle cellen bijwerken vanuit game.visual(). Alleen gewijzigde cellen krijgen nieuwe HTML. */
  render() {
    const g = this.grid;
    const game = this.game;
    const errs = new Set(game.check().errors);
    const marks = game.edgeMarks?.() ?? [];
    const markOf = new Map<number, string[]>();
    for (const m of marks) {
      const ax = m.axis;
      const lo = g.c(m.a, ax) < g.c(m.b, ax) ? m.a : m.b; // cel aan de −-kant
      const hi = lo === m.a ? m.b : m.a;
      const loSmaller = lo === m.a;
      if (ax <= 1) {
        const glyph = ax === 0 ? (loSmaller ? "<" : ">") : loSmaller ? "∧" : "∨";
        (markOf.get(lo) ?? markOf.set(lo, []).get(lo)!).push(`<i class="mk mk-${AX[ax]}">${glyph}</i>`);
      } else {
        const glyph = ax === 2 ? (loSmaller ? "‹" : "›") : loSmaller ? "˄" : "˅";
        (markOf.get(lo) ?? markOf.set(lo, []).get(lo)!).push(`<i class="bd bd-${AX[ax]}1" title="vergelijk met ${AX[ax]}+1">${glyph}</i>`);
        (markOf.get(hi) ?? markOf.set(hi, []).get(hi)!).push(`<i class="bd bd-${AX[ax]}0" title="vergelijk met ${AX[ax]}−1">${glyph}</i>`);
      }
    }
    const regionOf = game.regionOf?.bind(game);
    const boxOf = game.boxOf?.bind(game);
    for (let i = 0; i < g.count; i++) {
      const v: CellVisual = game.visual(i);
      if (errs.has(i)) v.error = true;
      const cls: string[] = ["cell"];
      if (v.tone) cls.push("t-" + v.tone);
      if (v.given) cls.push("given");
      if (v.error) cls.push("err");
      if (v.hidden) cls.push("hidden");
      if (v.dim) cls.push("dim");
      if (v.trail) cls.push("trail");
      if (v.pulse) cls.push("pulse");
      if (game.isFixed?.(i)) cls.push("fixed");
      // dikke randen: gebieden, blokken, muren
      const borders: string[] = [];
      if (regionOf || (boxOf && boxOf(i) >= 0)) {
        const key = regionOf ? regionOf : boxOf!;
        const me = key(i);
        const sides: [number, number, string][] = [
          [0, -1, "l"],
          [0, 1, "r"],
          [1, -1, "t"],
          [1, 1, "b"],
        ];
        for (const [ax, d, s] of sides) {
          if (ax >= g.D) continue;
          const m = g.step(i, ax, d);
          if (m >= 0 && key(m) !== me) borders.push("rb-" + s);
        }
      }
      let portals = "";
      if (game.walls) {
        const open = game.walls(i);
        const sides: [number, number, string][] = [
          [0, -1, "l"],
          [0, 1, "r"],
          [1, -1, "t"],
          [1, 1, "b"],
        ];
        for (const [ax, d, s] of sides) {
          if (ax >= g.D) continue;
          const bit = 1 << (2 * ax + (d > 0 ? 1 : 0));
          if (!(open & bit)) borders.push("wl-" + s);
        }
        for (let ax = 2; ax < g.D; ax++)
          for (const d of [-1, 1]) {
            const bit = 1 << (2 * ax + (d > 0 ? 1 : 0));
            if (open & bit) {
              const glyph = ax === 2 ? (d < 0 ? "‹" : "›") : d < 0 ? "˄" : "˅";
              portals += `<i class="pt pt-${AX[ax]}${d > 0 ? 1 : 0}">${glyph}</i>`;
            }
          }
      }
      cls.push(...borders);
      let inner = "";
      if (v.icon) inner += `<span class="ic">${iconSvg(v.icon)}</span>`;
      if (v.text) inner += `<span class="v">${v.text}</span>`;
      if (v.notes?.length) {
        const n = g.n[0] > 4 || (game.symbols?.length ?? 0) > 4 ? 9 : 4;
        inner += `<span class="notes n${n}">` + v.notes.map((x) => `<i style="grid-area:n${x}">${x}</i>`).join("") + "</span>";
      }
      inner += portals + (markOf.get(i)?.join("") ?? "");
      const style = v.fill ? `--fill:${v.fill}` : "";
      const key = cls.join(" ") + "|" + inner + "|" + style;
      if (this.last[i] === key) continue;
      this.last[i] = key;
      const el = this.cells[i];
      // relatieklassen behouden
      const keep = ["sel", "hov", "rail", "peer", "hl"].filter((c) => el.classList.contains(c));
      el.className = cls.concat(keep).join(" ");
      el.innerHTML = inner;
      if (style) el.style.setProperty("--fill", v.fill!);
      else el.style.removeProperty("--fill");
    }
    // tellingen
    const clues = game.clues?.();
    if (clues) {
      for (const ce of this.clueEls) {
        const c = clues.find((q) => q.axis === ce.axis && q.k === ce.k);
        if (!c) continue;
        ce.el.textContent = String(c.target);
        ce.el.classList.toggle("over", c.current > c.target);
        ce.el.classList.toggle("done", c.current === c.target);
      }
    }
    // fog: lege borden verbergen
    for (const b of this.boardEls) {
      const all = [...b.querySelectorAll(".cell")];
      b.classList.toggle("fogged", all.length > 0 && all.every((c) => c.classList.contains("hidden")));
    }
    this.paintRelations();
  }

  /** Cel-element (voor scrollen naar de speler e.d.). */
  cellEl(i: number) {
    return this.cells[i];
  }

  dispose() {
    this.ro.disconnect();
    this.el.remove();
  }
}
