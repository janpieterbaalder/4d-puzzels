import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import { Hyper } from "./hyper";
import type { CellVisual, Hint, HyperClue, Preset, PuzzleData, PuzzleGame, PuzzleType, Status } from "./types";

interface BsData extends PuzzleData {
  fleet: number[];
  clues: number[][];
  reveal: [number, number][]; // [cel, 1=schip|2=water]
  ships: number[]; // oplossing: 1 = schip
}

const presets: Preset[] = [
  { id: "2d-6", label: "Instap", sizes: [6, 6], level: 1, fleet: [3, 2, 2, 1, 1, 1] },
  { id: "2d-8", label: "Klassiek", sizes: [8, 8], level: 2, fleet: [4, 3, 2, 2, 1, 1, 1] },
  { id: "3d-4", label: "Kubus", sizes: [4, 4, 4], level: 1, fleet: [3, 2, 1, 1] },
  { id: "3d-5", label: "Grote kubus", sizes: [5, 5, 5], level: 2, fleet: [3, 3, 2, 2, 1, 1] },
  { id: "4d-4", label: "Tesseract", sizes: [4, 4, 4, 4], level: 2, fleet: [3, 2, 2, 1, 1] },
  { id: "4d-4h", label: "Armada", sizes: [4, 4, 4, 4], level: 3, fleet: [3, 3, 2, 2, 1, 1, 1] },
];

interface Placement {
  cells: number[];
  zone: number[]; // cellen die na plaatsing verboden zijn (koningsburen + zelf)
}

function placements(g: Grid, L: number): Placement[] {
  const out: Placement[] = [];
  const axes = L === 1 ? [0] : Array.from({ length: g.D }, (_, a) => a);
  for (const a of axes)
    for (let i = 0; i < g.count; i++) {
      if (g.c(i, a) + L > g.n[a]) continue;
      const cells: number[] = [];
      for (let k = 0; k < L; k++) cells.push(i + k * g.stride[a]);
      const z = new Set<number>(cells);
      for (const c of cells) for (const m of g.king(c)) z.add(m);
      out.push({ cells, zone: [...z] });
    }
  return out;
}

export function solveFleet(
  g: Grid,
  fleet: number[],
  target: number[],
  reveal: Map<number, number>,
  limit: number,
  maxNodes = 400000,
): { count: number; sols: Uint8Array[]; aborted: boolean } {
  const H = new Hyper(g);
  const D = g.D;
  const lens = [...fleet].sort((a, b) => b - a);
  const byLen = new Map<number, Placement[]>();
  for (const L of new Set(lens)) {
    // alleen plaatsingen zonder water-onthullingen en binnen tellingen van 1 schip
    byLen.set(
      L,
      placements(g, L).filter((p) =>
        p.cells.every((c) => {
          if (reveal.get(c) === 2) return false;
          for (let a = 0; a < D; a++) if (target[H.planeOf[c * D + a]] === 0) return false;
          return true;
        }),
      ),
    );
  }
  const blocked = new Int16Array(g.count);
  const ship = new Uint8Array(g.count);
  const cnt = new Int32Array(H.planes);
  const mustShip = [...reveal].filter(([, v]) => v === 1).map(([c]) => c);
  const res = { count: 0, sols: [] as Uint8Array[], aborted: false };
  let nodes = 0;

  const feasible = (remaining: number): boolean => {
    // per vlak: tekort ≤ beschikbare cellen
    const avail = new Int32Array(H.planes);
    for (let i = 0; i < g.count; i++) {
      if (ship[i] || blocked[i] || reveal.get(i) === 2) continue;
      for (let a = 0; a < D; a++) avail[H.planeOf[i * D + a]]++;
    }
    for (let p = 0; p < H.planes; p++) if (target[p] - cnt[p] > avail[p]) return false;
    // verplichte schepen nog bereikbaar?
    let uncovered = 0;
    for (const c of mustShip) if (!ship[c]) {
      if (blocked[c]) return false;
      uncovered++;
    }
    return uncovered <= remaining;
  };

  const rec = (k: number, minIdx: number, remainingCells: number): boolean => {
    if (k === lens.length) {
      for (let p = 0; p < H.planes; p++) if (cnt[p] !== target[p]) return false;
      for (const c of mustShip) if (!ship[c]) return false;
      res.count++;
      if (res.sols.length < limit) res.sols.push(ship.slice());
      return res.count >= limit;
    }
    const L = lens[k];
    const list = byLen.get(L)!;
    const start = k > 0 && lens[k - 1] === L ? minIdx : 0;
    for (let pi = start; pi < list.length; pi++) {
      const pl = list[pi];
      let ok = true;
      for (const c of pl.cells) if (blocked[c] || ship[c]) { ok = false; break; }
      if (!ok) continue;
      // plaats
      for (const c of pl.cells) {
        ship[c] = 1;
        for (let a = 0; a < D; a++) cnt[H.planeOf[c * D + a]]++;
      }
      let over = false;
      for (const c of pl.cells) for (let a = 0; a < D; a++) if (cnt[H.planeOf[c * D + a]] > target[H.planeOf[c * D + a]]) over = true;
      for (const z of pl.zone) blocked[z]++;
      if (++nodes > maxNodes) {
        res.aborted = true;
        return true;
      }
      if (!over && feasible(remainingCells - L)) {
        if (rec(k + 1, pi + 1, remainingCells - L)) return true;
      }
      for (const z of pl.zone) blocked[z]--;
      for (const c of pl.cells) {
        ship[c] = 0;
        for (let a = 0; a < D; a++) cnt[H.planeOf[c * D + a]]--;
      }
    }
    return false;
  };
  rec(0, 0, lens.reduce((s, x) => s + x, 0));
  return res;
}

function randomFleet(g: Grid, fleet: number[], rng: Rng): Uint8Array | null {
  const ship = new Uint8Array(g.count);
  const blocked = new Uint8Array(g.count);
  for (const L of [...fleet].sort((a, b) => b - a)) {
    const opts = placements(g, L).filter((p) => p.cells.every((c) => !blocked[c]));
    if (!opts.length) return null;
    const p = rng.pick(opts);
    for (const c of p.cells) ship[c] = 1;
    for (const z of p.zone) blocked[z] = 1;
  }
  return ship;
}

function generate(preset: Preset, seed: string): BsData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("bs:" + preset.id + ":" + seed);
  const fleet = preset.fleet as number[];
  const H = new Hyper(g);
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = randomFleet(g, fleet, rng);
    if (!ships) continue;
    const target = H.counts((i) => ships[i] === 1);
    const reveal = new Map<number, number>();
    let ok = false;
    for (let round = 0; round < 60; round++) {
      const r = solveFleet(g, fleet, target, reveal, 2);
      if (r.count === 1 && !r.aborted) {
        ok = true;
        break;
      }
      let cand: number[] = [];
      if (r.sols.length >= 2) {
        for (let i = 0; i < g.count; i++) if (r.sols[0][i] !== r.sols[1][i] && !reveal.has(i)) cand.push(i);
      }
      if (!cand.length) cand = Array.from({ length: g.count }, (_, i) => i).filter((i) => !reveal.has(i) && ships[i]);
      if (!cand.length) break;
      // liefst een scheepsdeel onthullen (informatiever en leuker)
      const shipCand = cand.filter((c) => ships[c]);
      const c = shipCand.length && rng.chance(0.6) ? rng.pick(shipCand) : rng.pick(cand);
      reveal.set(c, ships[c] ? 1 : 2);
    }
    if (!ok) continue;
    if (preset.level === 1) {
      const extra = rng.shuffle(Array.from({ length: g.count }, (_, i) => i).filter((i) => !reveal.has(i))).slice(0, Math.ceil(g.count * 0.06));
      for (const c of extra) reveal.set(c, ships[c] ? 1 : 2);
    }
    return {
      type: "battleships",
      preset: preset.id,
      seed,
      sizes: preset.sizes,
      fleet,
      clues: H.split(target),
      reveal: [...reveal],
      ships: [...ships],
    };
  }
  throw new Error("zeeslag generatie mislukt");
}

/* ---------- Spel ---------- */

class BattleshipGame implements PuzzleGame {
  grid: Grid;
  input = "cycle" as const;
  st: Int8Array; // 0 onbekend, 1 schip, 2 water
  private H: Hyper;
  private fixed: Uint8Array;
  private hintCells: number[] = [];
  constructor(private data: BsData) {
    this.grid = new Grid(data.sizes);
    this.H = new Hyper(this.grid);
    this.st = new Int8Array(this.grid.count);
    this.fixed = new Uint8Array(this.grid.count);
    for (const [c, v] of data.reveal) {
      this.st[c] = v;
      this.fixed[c] = 1;
    }
  }
  isFixed(i: number) {
    return this.fixed[i] === 1;
  }
  visual(i: number): CellVisual {
    const s = this.st[i];
    return {
      tone: s === 1 ? "solid" : s === 2 ? "glass" : "glass",
      fill: s === 1 ? "#cfd8ea" : s === 2 ? "rgba(63,182,255,.28)" : undefined,
      icon: s === 1 ? "ship" : s === 2 ? "water" : undefined,
      given: this.fixed[i] === 1,
      pulse: this.hintCells.includes(i),
    };
  }
  act(i: number, dir: 1 | -1) {
    if (this.fixed[i]) return false;
    this.st[i] = dir === 1 ? [1, 2, 0][this.st[i]] : [2, 0, 1][this.st[i]];
    this.hintCells = [];
    return true;
  }
  peers(i: number) {
    return this.grid.king(i);
  }
  getState() {
    return [...this.st];
  }
  setState(s: any) {
    this.st = Int8Array.from(s);
    this.hintCells = [];
  }
  clues(): HyperClue[] {
    const cur = this.H.counts((i) => this.st[i] === 1);
    const open = this.H.counts((i) => this.st[i] === 0);
    return this.H.clues(this.data.clues, cur, open);
  }
  private shipRuns(): number[][] {
    // samenhangende scheepsstukken
    const g = this.grid;
    const seen = new Uint8Array(g.count);
    const runs: number[][] = [];
    for (let i = 0; i < g.count; i++) {
      if (this.st[i] !== 1 || seen[i]) continue;
      const comp: number[] = [];
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        comp.push(c);
        for (const m of g.orth(c)) if (this.st[m] === 1 && !seen[m]) (seen[m] = 1), stack.push(m);
      }
      runs.push(comp);
    }
    return runs;
  }
  private errorSet(): Set<number> {
    const g = this.grid;
    const errs = new Set<number>();
    const maxL = Math.max(...this.data.fleet);
    for (const run of this.shipRuns()) {
      // recht? alle cellen delen alle coördinaten op één as na
      const axesVar = new Set<number>();
      for (let a = 0; a < g.D; a++) if (new Set(run.map((c) => g.c(c, a))).size > 1) axesVar.add(a);
      if (axesVar.size > 1 || run.length > maxL) run.forEach((c) => errs.add(c));
      // diagonaal contact met ander schip
      const inRun = new Set(run);
      for (const c of run) for (const m of g.king(c)) if (this.st[m] === 1 && !inRun.has(m)) errs.add(c).add(m);
    }
    return errs;
  }
  check(): Status {
    const errs = this.errorSet();
    let good = true;
    let found = 0;
    let need = 0;
    for (let i = 0; i < this.grid.count; i++) {
      const isShip = this.st[i] === 1;
      if (isShip !== (this.data.ships[i] === 1)) good = false;
      if (this.data.ships[i]) {
        need++;
        if (isShip) found++;
      }
    }
    return { solved: good, errors: [...errs], progress: need ? found / need : 1 };
  }
  hint(): Hint | null {
    const wrong: number[] = [];
    for (let i = 0; i < this.grid.count; i++) {
      if (this.st[i] === 1 && !this.data.ships[i]) wrong.push(i);
      if (this.st[i] === 2 && this.data.ships[i]) wrong.push(i);
    }
    if (wrong.length) {
      this.hintCells = wrong;
      return { cells: wrong, text: "Deze markering klopt niet." };
    }
    // vlakken die vol zijn → rest water
    const cl = this.clues();
    for (const c of cl) {
      if (c.open > 0 && (c.current === c.target || c.target - c.current === c.open)) {
        const cells = this.grid.hyperplane(c.axis, c.k).filter((i) => this.st[i] === 0);
        this.hintCells = cells;
        const name = ["x", "y", "z", "w"][c.axis];
        return {
          cells,
          text:
            c.current === c.target
              ? `Hypervlak ${name} = ${c.k} heeft al ${c.target} scheepsdelen: de rest is water.`
              : `Hypervlak ${name} = ${c.k} heeft precies zoveel open cellen als er nog schip nodig is.`,
        };
      }
    }
    // rond een schip is water
    for (let i = 0; i < this.grid.count; i++) {
      if (this.st[i] !== 1) continue;
      const diag = this.grid.king(i).filter((m) => this.grid.axisBetween(i, m) < 0 && this.st[m] === 0);
      if (diag.length) {
        this.hintCells = diag;
        return { cells: diag, text: "Schepen raken elkaar nergens, ook niet schuin: deze cellen zijn water." };
      }
    }
    for (let i = 0; i < this.grid.count; i++)
      if (this.st[i] === 0 && this.data.ships[i]) {
        this.hintCells = [i];
        return { cells: [i], text: "Verklapt: hier ligt een stukje schip." };
      }
    return null;
  }
  panel() {
    const runs = this.shipRuns().map((r) => r.length);
    const fleet = [...this.data.fleet].sort((a, b) => b - a);
    const left = runs.slice();
    return {
      title: "Vloot",
      items: fleet.map((L) => {
        const k = left.indexOf(L);
        if (k >= 0) left.splice(k, 1);
        return { label: "▮".repeat(L), value: L === 1 ? "onderzeeër" : `${L} lang`, done: k >= 0 };
      }),
    };
  }
}

export const Battleships: PuzzleType = {
  id: "battleships",
  name: "Zeeslag",
  origin: "Zeeslag / Battleships",
  tagline: "Schepen die door meerdere werelden varen",
  accent: "#3fb6ff",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 22h30l-4 8H9z" fill="currentColor" fill-opacity=".35"/><path d="M14 22v-7h10l3 7M19 15v-5"/><path d="M3 34c3 0 3-2 6-2s3 2 6 2 3-2 6-2 3 2 6 2 3-2 6-2 3 2 4 2" stroke-linecap="round"/></g></svg>`,
  presets,
  rules(dim, preset) {
    const fleet = (preset?.fleet as number[] | undefined) ?? [];
    const plane = ["", "", "rij of kolom", "laag (een heel vlak van de kubus)", "3D-plak (een hele kubus)"][dim];
    return {
      goal: "Vind de verborgen vloot" + (fleet.length ? ` (${fleet.length} schepen).` : "."),
      rules: [
        "Schepen liggen recht langs één as en zijn 1 tot 4 cellen lang.",
        "Schepen raken elkaar nergens, ook niet schuin.",
        `Elk getal zegt hoeveel scheepsdelen er in die ${plane} liggen.`,
        "Klik: leeg → schip → water → leeg.",
      ],
      dimNote:
        dim === 4
          ? "In 2D telt een getal een rij. In 3D is het analogon van een rij een heel vlak, en in 4D een complete 3D-plak: een 'hypervlak'. Een schip langs w ligt in drie of vier verschillende kubussen tegelijk!"
          : dim === 3
            ? "De tellingen gaan nu over hele lagen in plaats van rijen: een vlak is in 3D wat een rij in 2D is. Een schip langs z ligt over meerdere borden verspreid."
            : undefined,
    };
  },
  generate,
  create: (d) => new BattleshipGame(d as BsData),
};
