import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import { Hyper, planeName } from "./hyper";
import type { CellVisual, Hint, HyperClue, Preset, PuzzleData, PuzzleGame, PuzzleType, Status } from "./types";

interface TentData extends PuzzleData {
  trees: number[];
  clues: number[][];
  reveal: [number, number][]; // [cel, 1=tent|2=gras]
  tents: number[];
}

const presets: Preset[] = [
  { id: "2d-6", label: "Instap", sizes: [6, 6], level: 1, density: 0.2 },
  { id: "2d-8", label: "Camping", sizes: [8, 8], level: 2, density: 0.19 },
  { id: "3d-4", label: "Kubus", sizes: [4, 4, 4], level: 1, density: 0.1 },
  { id: "3d-5", label: "Grote kubus", sizes: [5, 5, 5], level: 2, density: 0.1 },
  { id: "4d-3", label: "Tesseract", sizes: [3, 3, 3, 3], level: 2, density: 0.08 },
  { id: "4d-4", label: "Hypercamping", sizes: [4, 4, 4, 4], level: 3, density: 0.05 },
];

export function solveTents(
  g: Grid,
  trees: number[],
  target: number[],
  reveal: Map<number, number>,
  limit: number,
  maxNodes = 300000,
): { count: number; sols: Uint8Array[]; aborted: boolean } {
  const H = new Hyper(g);
  const D = g.D;
  const isTree = new Uint8Array(g.count);
  trees.forEach((t) => (isTree[t] = 1));
  const okCell = (c: number) => {
    if (isTree[c] || reveal.get(c) === 2) return false;
    for (let a = 0; a < D; a++) if (target[H.planeOf[c * D + a]] === 0) return false;
    return true;
  };
  const options = trees.map((t) => g.orth(t).filter(okCell));
  const order = trees.map((_, k) => k).sort((a, b) => options[a].length - options[b].length);
  const tent = new Uint8Array(g.count);
  const blocked = new Int16Array(g.count);
  const cnt = new Int32Array(H.planes);
  const mustTent = [...reveal].filter(([, v]) => v === 1).map(([c]) => c);
  const seen = new Set<string>();
  const res = { count: 0, sols: [] as Uint8Array[], aborted: false };
  let nodes = 0;
  const rec = (k: number): boolean => {
    if (k === order.length) {
      for (let p = 0; p < H.planes; p++) if (cnt[p] !== target[p]) return false;
      for (const c of mustTent) if (!tent[c]) return false;
      const key = tent.join("");
      if (seen.has(key)) return false;
      seen.add(key);
      res.count++;
      if (res.sols.length < limit) res.sols.push(tent.slice());
      return res.count >= limit;
    }
    const remaining = order.length - k;
    let unc = 0;
    for (const c of mustTent) if (!tent[c]) unc++;
    if (unc > remaining) return false;
    for (const c of options[order[k]]) {
      if (tent[c] || blocked[c]) continue;
      let over = false;
      for (let a = 0; a < D; a++) if (cnt[H.planeOf[c * D + a]] + 1 > target[H.planeOf[c * D + a]]) over = true;
      if (over) continue;
      if (++nodes > maxNodes) {
        res.aborted = true;
        return true;
      }
      tent[c] = 1;
      for (let a = 0; a < D; a++) cnt[H.planeOf[c * D + a]]++;
      for (const m of g.king(c)) blocked[m]++;
      if (rec(k + 1)) return true;
      for (const m of g.king(c)) blocked[m]--;
      for (let a = 0; a < D; a++) cnt[H.planeOf[c * D + a]]--;
      tent[c] = 0;
    }
    return false;
  };
  rec(0);
  return res;
}

function generate(preset: Preset, seed: string): TentData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("tent:" + preset.id + ":" + seed);
  const H = new Hyper(g);
  const want = Math.max(3, Math.round(g.count * (preset.density as number)));
  for (let attempt = 0; attempt < 300; attempt++) {
    const tent = new Uint8Array(g.count);
    const tree = new Uint8Array(g.count);
    const blocked = new Uint8Array(g.count);
    const trees: number[] = [];
    let placed = 0;
    for (const c of rng.shuffle(Array.from({ length: g.count }, (_, i) => i))) {
      if (placed >= want) break;
      if (blocked[c] || tree[c]) continue;
      const spots = g.orth(c).filter((m) => !tent[m] && !tree[m]);
      if (!spots.length) continue;
      const t = rng.pick(spots);
      tent[c] = 1;
      tree[t] = 1;
      trees.push(t);
      for (const m of g.king(c)) blocked[m] = 1;
      blocked[c] = 1;
      placed++;
    }
    if (placed < Math.max(3, want * 0.8)) continue;
    const target = H.counts((i) => tent[i] === 1);
    const reveal = new Map<number, number>();
    let ok = false;
    for (let round = 0; round < 60; round++) {
      const r = solveTents(g, trees, target, reveal, 2);
      if (r.count === 1 && !r.aborted) {
        ok = true;
        break;
      }
      let cand: number[] = [];
      if (r.sols.length >= 2) for (let i = 0; i < g.count; i++) if (r.sols[0][i] !== r.sols[1][i] && !reveal.has(i)) cand.push(i);
      if (!cand.length) cand = Array.from({ length: g.count }, (_, i) => i).filter((i) => !reveal.has(i) && tent[i]);
      if (!cand.length) break;
      const c = rng.pick(cand);
      reveal.set(c, tent[c] ? 1 : 2);
    }
    if (!ok) continue;
    if (preset.level === 1) {
      const extra = rng
        .shuffle(Array.from({ length: g.count }, (_, i) => i).filter((i) => !reveal.has(i) && !tree[i]))
        .slice(0, Math.ceil(g.count * 0.05));
      for (const c of extra) reveal.set(c, tent[c] ? 1 : 2);
    }
    return {
      type: "tents",
      preset: preset.id,
      seed,
      sizes: preset.sizes,
      trees,
      clues: H.split(target),
      reveal: [...reveal],
      tents: [...tent],
    };
  }
  throw new Error("tenten generatie mislukt");
}

class TentsGame implements PuzzleGame {
  grid: Grid;
  input = "cycle" as const;
  st: Int8Array; // 0 leeg, 1 tent, 2 gras
  private isTree: Uint8Array;
  private fixed: Uint8Array;
  private H: Hyper;
  private hintCells: number[] = [];
  constructor(private data: TentData) {
    this.grid = new Grid(data.sizes);
    this.H = new Hyper(this.grid);
    this.st = new Int8Array(this.grid.count);
    this.isTree = new Uint8Array(this.grid.count);
    this.fixed = new Uint8Array(this.grid.count);
    for (const t of data.trees) {
      this.isTree[t] = 1;
      this.fixed[t] = 1;
    }
    for (const [c, v] of data.reveal) {
      this.st[c] = v;
      this.fixed[c] = 1;
    }
  }
  isFixed(i: number) {
    return this.fixed[i] === 1;
  }
  visual(i: number): CellVisual {
    if (this.isTree[i]) return { icon: "tree", tone: "glass", fill: "rgba(87,227,155,.3)", given: true };
    const s = this.st[i];
    return {
      icon: s === 1 ? "tent" : s === 2 ? "grass" : undefined,
      tone: s === 1 ? "solid" : "glass",
      fill: s === 1 ? "#ff9a4a" : s === 2 ? "rgba(87,227,155,.12)" : undefined,
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
    return this.grid.orth(i);
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
    const open = this.H.counts((i) => this.st[i] === 0 && !this.isTree[i]);
    return this.H.clues(this.data.clues, cur, open);
  }
  check(): Status {
    const g = this.grid;
    const errs = new Set<number>();
    for (let i = 0; i < g.count; i++) {
      if (this.st[i] !== 1) continue;
      for (const m of g.king(i)) if (this.st[m] === 1) errs.add(i).add(m);
      if (!g.orth(i).some((m) => this.isTree[m])) errs.add(i);
    }
    let good = true;
    let found = 0;
    for (let i = 0; i < g.count; i++) {
      if ((this.st[i] === 1) !== (this.data.tents[i] === 1)) good = false;
      if (this.st[i] === 1 && this.data.tents[i]) found++;
    }
    return { solved: good, errors: [...errs], progress: found / this.data.trees.length };
  }
  hint(): Hint | null {
    const g = this.grid;
    const wrong: number[] = [];
    for (let i = 0; i < g.count; i++) {
      if (this.st[i] === 1 && !this.data.tents[i]) wrong.push(i);
      if (this.st[i] === 2 && this.data.tents[i]) wrong.push(i);
    }
    if (wrong.length) {
      this.hintCells = wrong;
      return { cells: wrong, text: "Deze markering klopt niet." };
    }
    // cellen die niet naast een boom liggen: altijd gras
    const far: number[] = [];
    for (let i = 0; i < g.count; i++) if (!this.st[i] && !this.isTree[i] && !g.orth(i).some((m) => this.isTree[m])) far.push(i);
    if (far.length) {
      this.hintCells = far.slice(0, 24);
      return { cells: this.hintCells, text: "Deze cellen liggen naast geen enkele boom: daar kan nooit een tent staan." };
    }
    for (const c of this.clues()) {
      if (c.open > 0 && c.current === c.target) {
        const cells = g.hyperplane(c.axis, c.k).filter((i) => this.st[i] === 0 && !this.isTree[i]);
        this.hintCells = cells;
        return { cells, text: `${planeName(g.D, c.axis)} ${"xyzw"[c.axis]} = ${c.k} is al vol: de rest is gras.` };
      }
    }
    for (let i = 0; i < g.count; i++) {
      if (this.st[i] !== 1) continue;
      const around = g.king(i).filter((m) => this.st[m] === 0 && !this.isTree[m]);
      if (around.length) {
        this.hintCells = around;
        return { cells: around, text: `Tenten raken elkaar niet, ook niet schuin. In ${g.D}D heeft een cel ${3 ** g.D - 1} koningsburen.` };
      }
    }
    for (let i = 0; i < g.count; i++)
      if (!this.st[i] && this.data.tents[i]) {
        this.hintCells = [i];
        return { cells: [i], text: "Verklapt: hier staat een tent." };
      }
    return null;
  }
  panel() {
    const tents = this.st.filter((s) => s === 1).length;
    return {
      title: "Camping",
      items: [
        { label: "Bomen", value: String(this.data.trees.length) },
        { label: "Tenten gezet", value: String(tents) },
        { label: "Plekken naast een boom", value: String(2 * this.grid.D) },
      ],
    };
  }
}

export const Tents: PuzzleType = {
  id: "tents",
  name: "Tentje-boompje",
  origin: "Tents & Trees",
  tagline: "Elke boom een tent — misschien in een parallelle wereld",
  accent: "#57e39b",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M11 5l7 11h-4l5 8H3l5-8H4z" fill="currentColor" fill-opacity=".35"/><path d="M11 24v5"/><path d="M29 14l9 18H20z"/><path d="M29 22l-3 10M29 22l3 10"/></g></svg>`,
  presets,
  rules(dim) {
    return {
      goal: "Geef elke boom zijn eigen tent.",
      rules: [
        `Er zijn evenveel tenten als bomen. Elke tent hoort bij één boom en staat er direct naast (één van de ${2 * dim} directe buren).`,
        "Let op: een boom mag óók naast de tent van een andere boom staan.",
        "Tenten raken elkaar nergens, ook niet schuin.",
        `Elk getal zegt hoeveel tenten er in die ${["", "", "rij of kolom", "laag (een heel vlak van de kubus)", "3D-plak (een hele kubus)"][dim]} staan.`,
        "Klik: leeg → tent → gras → leeg.",
      ],
      dimNote:
        dim === 4
          ? "In 4D kan de tent van een boom ook 'ana' of 'kata' staan: op dezelfde plek in het bord erboven of eronder. Elk getal telt nu een hele 3D-plak."
          : dim === 3
            ? "In 3D kan de tent ook in de laag ernaast staan: op dezelfde plek in het buurbord."
            : undefined,
    };
  },
  generate,
  create: (d) => new TentsGame(d as TentData),
};
