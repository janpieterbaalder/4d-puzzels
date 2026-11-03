import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import type { CellVisual, Hint, Preset, PuzzleData, PuzzleGame, PuzzleType, Status } from "./types";

interface MazeData extends PuzzleData {
  open: number[];
  start: number;
  goal: number;
  par: number;
}

const presets: Preset[] = [
  { id: "2d-7", label: "Instap", sizes: [7, 7], level: 1 },
  { id: "2d-11", label: "Labyrint", sizes: [11, 11], level: 2 },
  { id: "3d-3", label: "Kubus", sizes: [3, 3, 3], level: 1 },
  { id: "3d-4", label: "Grote kubus", sizes: [4, 4, 4], level: 2 },
  { id: "3d-5", label: "Doolhofblok", sizes: [5, 5, 5], level: 3 },
  { id: "4d-3", label: "Tesseract", sizes: [3, 3, 3, 3], level: 2 },
  { id: "4d-4", label: "Hyperdoolhof", sizes: [4, 4, 4, 4], level: 3 },
];

const bitFor = (axis: number, dir: number) => 1 << (2 * axis + (dir > 0 ? 1 : 0));

function bfs(g: Grid, open: number[], from: number): Int32Array {
  const dist = new Int32Array(g.count).fill(-1);
  dist[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    for (let a = 0; a < g.D; a++)
      for (const d of [-1, 1]) {
        if (!(open[c] & bitFor(a, d))) continue;
        const m = g.step(c, a, d);
        if (m >= 0 && dist[m] < 0) {
          dist[m] = dist[c] + 1;
          q.push(m);
        }
      }
  }
  return dist;
}

function generate(preset: Preset, seed: string): MazeData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("maze:" + preset.id + ":" + seed);
  const open = new Array(g.count).fill(0);
  const seen = new Uint8Array(g.count);
  const stack = [0];
  seen[0] = 1;
  while (stack.length) {
    const c = stack[stack.length - 1];
    const opts: [number, number, number][] = [];
    for (let a = 0; a < g.D; a++)
      for (const d of [-1, 1]) {
        const m = g.step(c, a, d);
        if (m >= 0 && !seen[m]) opts.push([m, a, d]);
      }
    if (!opts.length) {
      stack.pop();
      continue;
    }
    // lichte voorkeur voor van richting wisselen: dat maakt het doolhof 'meer-dimensionaal'
    const [m, a, d] = rng.pick(opts);
    open[c] |= bitFor(a, d);
    open[m] |= bitFor(a, -d);
    seen[m] = 1;
    stack.push(m);
  }
  // een paar extra doorgangen in grotere doolhoven voorkomt eindeloze doodlopers
  const extra = Math.floor(g.count * (g.D >= 3 ? 0.04 : 0.02));
  for (let k = 0; k < extra; k++) {
    const c = rng.int(g.count);
    const a = rng.int(g.D);
    const d = rng.chance(0.5) ? 1 : -1;
    const m = g.step(c, a, d);
    if (m < 0) continue;
    open[c] |= bitFor(a, d);
    open[m] |= bitFor(a, -d);
  }
  const start = 0;
  const dist = bfs(g, open, start);
  let goal = 0;
  for (let i = 0; i < g.count; i++) if (dist[i] > dist[goal]) goal = i;
  return { type: "maze", preset: preset.id, seed, sizes: preset.sizes, open, start, goal, par: dist[goal] };
}

class MazeGame implements PuzzleGame {
  grid: Grid;
  input = "move" as const;
  pos: number;
  steps = 0;
  trail: Set<number>;
  fog: boolean;
  private hintCells: number[] = [];
  constructor(
    private data: MazeData,
    fog: boolean,
  ) {
    this.grid = new Grid(data.sizes);
    this.pos = data.start;
    this.trail = new Set([data.start]);
    this.fog = fog && this.grid.D >= 3;
    this.remember();
  }
  /** Doorsnedes (z, w) waar de speler al geweest is: die blijven in de doorsnede-modus zwak zichtbaar. */
  private seen = new Set<string>();
  private sliceKey(i: number): string {
    let k = "";
    for (let a = 2; a < this.grid.D; a++) k += this.grid.c(i, a) + ",";
    return k;
  }
  private remember() {
    this.seen = new Set([...this.trail].map((i) => this.sliceKey(i)));
  }
  private sameSlice(i: number): boolean {
    for (let a = 2; a < this.grid.D; a++) if (this.grid.c(i, a) !== this.grid.c(this.pos, a)) return false;
    return true;
  }
  visual(i: number): CellVisual {
    const v: CellVisual = {};
    // doorsnede-modus: eigen laag live; bezochte lagen als herinnering (zwak); de rest verborgen
    if (this.fog && !this.sameSlice(i)) {
      if (this.seen.has(this.sliceKey(i))) v.dim = true;
      else v.hidden = true;
    }
    if (i === this.pos) {
      v.icon = "player";
      v.tone = "glow";
      v.fill = "#4fe3ff";
    } else if (i === this.data.goal) {
      // het doel blijft altijd zichtbaar: zo weet je naar welk bord je moet
      v.icon = "goal";
      v.tone = "glow";
      v.fill = "#ffcf5c";
      v.hidden = false;
    } else if (this.trail.has(i)) {
      v.trail = true;
      v.fill = "rgba(79,227,255,.22)";
      v.tone = "solid";
    }
    if (this.hintCells.includes(i)) v.pulse = true;
    return v;
  }
  walls(i: number) {
    return this.data.open[i];
  }
  links(): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < this.grid.count; i++)
      for (let a = 0; a < this.grid.D; a++)
        if (this.data.open[i] & bitFor(a, 1)) out.push([i, this.grid.step(i, a, 1)]);
    return out;
  }
  move(axis: number, dir: number): boolean {
    if (axis >= this.grid.D) return false;
    if (!(this.data.open[this.pos] & bitFor(axis, dir))) return false;
    const m = this.grid.step(this.pos, axis, dir);
    if (m < 0) return false;
    this.pos = m;
    this.steps++;
    this.trail.add(m);
    this.seen.add(this.sliceKey(m));
    this.hintCells = [];
    return true;
  }
  act(i: number): boolean {
    const a = this.grid.axisBetween(this.pos, i);
    if (a < 0) return false;
    return this.move(a, this.grid.c(i, a) - this.grid.c(this.pos, a));
  }
  focus() {
    return this.pos;
  }
  canMove(axis: number, dir: number): boolean {
    return axis < this.grid.D && !!(this.data.open[this.pos] & bitFor(axis, dir));
  }
  getState() {
    return { p: this.pos, s: this.steps, t: [...this.trail] };
  }
  setState(s: any) {
    this.pos = s.p;
    this.steps = s.s;
    this.trail = new Set(s.t);
    this.remember();
    this.hintCells = [];
  }
  check(): Status {
    const d = bfs(this.grid, this.data.open, this.pos)[this.data.goal];
    return {
      solved: this.pos === this.data.goal,
      errors: [],
      progress: 1 - d / Math.max(1, this.data.par),
      info: `${this.steps} stappen · kortste route ${this.data.par}`,
    };
  }
  hint(): Hint | null {
    const dist = bfs(this.grid, this.data.open, this.data.goal);
    const path: number[] = [];
    let c = this.pos;
    for (let k = 0; k < 4 && c !== this.data.goal; k++) {
      let next = -1;
      for (let a = 0; a < this.grid.D; a++)
        for (const d of [-1, 1]) {
          if (!(this.data.open[c] & bitFor(a, d))) continue;
          const m = this.grid.step(c, a, d);
          if (m >= 0 && dist[m] === dist[c] - 1) next = m;
        }
      if (next < 0) break;
      path.push(next);
      c = next;
    }
    this.hintCells = path;
    const first = path[0];
    if (first === undefined) return null;
    const a = this.grid.axisBetween(this.pos, first);
    const names = ["x", "y", "z", "w"];
    return { cells: path, text: `Nog ${dist[this.pos]} stappen. Eerste stap: langs de ${names[a]}-as.` };
  }
  moves() {
    return this.steps;
  }
  panel() {
    const dist = bfs(this.grid, this.data.open, this.pos)[this.data.goal];
    const c = this.grid.coord(this.pos);
    return {
      title: "Doolhof",
      items: [
        { label: "Positie", value: "(" + c.join(", ") + ")" },
        { label: "Stappen", value: String(this.steps) },
        { label: "Afstand tot doel", value: String(dist) },
        { label: "Kortste route", value: String(this.data.par) },
      ],
    };
  }
}

export const Maze: PuzzleType = {
  id: "maze",
  name: "Doolhof",
  origin: "Labyrint",
  tagline: "Loop om een muur heen — via een andere dimensie",
  accent: "#4fe3ff",
  icon: `<svg viewBox="0 0 40 40"><path d="M5 5h30v30H5zM5 15h12M23 5v12h6M11 21v14M17 27h12v-6M29 27v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="9" r="2.3" fill="currentColor"/></svg>`,
  presets,
  rules(dim) {
    const keys = [
      "pijltjes ← → voor x, ↑ ↓ voor y",
      "Shift + ← → voor z (naar het bord ernaast)",
      "Shift + ↑ ↓ voor w (naar het bord erboven/eronder)",
    ];
    return {
      goal: "Breng de lichtbol naar de gouden ster.",
      rules: [
        "Je kunt alleen bewegen waar geen muur staat.",
        dim >= 3
          ? "Een gekleurd pijltje in een cel betekent: hier is een doorgang naar het volgende of vorige bord (een andere laag)."
          : "Klik op een buurcel of gebruik de pijltjestoetsen.",
        "Toetsen: " + keys.slice(0, dim - 1).join(" · ") + ".",
        ...(dim >= 3
          ? ["In de ruimte-weergave zijn jouw doorgangen gekleurd, net als de pijlknoppen: rood = x, groen = y, blauw = z" + (dim >= 4 ? ", paars = w." : ".")]
          : []),
      ],
      dimNote:
        dim === 4
          ? "Een muur die je in 3D niet om kunt, kun je in 4D soms ontwijken door even 'ana' of 'kata' te stappen: naar een parallelle kubus. Let op: in de tesseract liggen cellen die alleen in w verschillen bijna op elkaar. Witte buisjes vlak bij je kunnen dus van zo'n buurcel zijn; alleen de gekleurde zijn van jou."
          : dim === 3
            ? "Elk bord is één laag van de kubus. Een doorgang in de diepte brengt je naar dezelfde plek in de laag ernaast."
            : undefined,
    };
  },
  generate,
  create: (d, o) => new MazeGame(d as MazeData, !!o?.fog),
};
