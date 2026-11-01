import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import type { CellVisual, Hint, Preset, PuzzleData, PuzzleGame, PuzzleType, Status } from "./types";

/* ---------- GF(2)-lineaire algebra: welke cellen moet je indrukken? ---------- */

function pressMatrix(g: Grid): Uint32Array[] {
  const N = g.count;
  const W = Math.ceil((N + 1) / 32);
  const rows: Uint32Array[] = [];
  for (let i = 0; i < N; i++) {
    const r = new Uint32Array(W);
    const set = (j: number) => (r[j >>> 5] ^= 1 << (j & 31));
    set(i);
    for (const j of g.orth(i)) set(j);
    rows.push(r);
  }
  return rows;
}

const getBit = (r: Uint32Array, j: number) => (r[j >>> 5] >>> (j & 31)) & 1;

/** Kortste set drukken die `lights` uitzet (of null als onoplosbaar). */
export function solveLights(g: Grid, lights: Uint8Array): number[] | null {
  const N = g.count;
  const rows = pressMatrix(g); // symmetrisch: rij i = effect van cel i
  for (let i = 0; i < N; i++) if (lights[i]) rows[i][N >>> 5] ^= 1 << (N & 31);
  const pivCol: number[] = [];
  let r = 0;
  const where = new Int32Array(N).fill(-1);
  for (let c = 0; c < N && r < N; c++) {
    let p = -1;
    for (let k = r; k < N; k++)
      if (getBit(rows[k], c)) {
        p = k;
        break;
      }
    if (p < 0) continue;
    [rows[p], rows[r]] = [rows[r], rows[p]];
    for (let k = 0; k < N; k++) {
      if (k !== r && getBit(rows[k], c)) {
        const a = rows[k];
        const b = rows[r];
        for (let w = 0; w < a.length; w++) a[w] ^= b[w];
      }
    }
    where[c] = r;
    pivCol.push(c);
    r++;
  }
  for (let k = r; k < N; k++) if (getBit(rows[k], N)) return null;
  const free: number[] = [];
  for (let c = 0; c < N; c++) if (where[c] < 0) free.push(c);
  const base = new Uint8Array(N);
  for (let c = 0; c < N; c++) if (where[c] >= 0) base[c] = getBit(rows[where[c]], N);
  // kern-vectoren: per vrije kolom f
  const kernel: Uint8Array[] = free.map((f) => {
    const v = new Uint8Array(N);
    v[f] = 1;
    for (let c = 0; c < N; c++) if (where[c] >= 0 && getBit(rows[where[c]], f)) v[c] = 1;
    return v;
  });
  let best = base;
  let bestW = base.reduce((s, x) => s + x, 0);
  if (kernel.length > 0 && kernel.length <= 14) {
    const total = 1 << kernel.length;
    const cur = new Uint8Array(N);
    for (let m = 1; m < total; m++) {
      cur.set(base);
      for (let k = 0; k < kernel.length; k++) if (m & (1 << k)) for (let i = 0; i < N; i++) cur[i] ^= kernel[k][i];
      const w = cur.reduce((s, x) => s + x, 0);
      if (w < bestW) {
        bestW = w;
        best = cur.slice();
      }
    }
  }
  const out: number[] = [];
  best.forEach((v, i) => v && out.push(i));
  return out;
}

/* ---------- Puzzel ---------- */

interface LOData extends PuzzleData {
  lights: number[];
  par: number;
}

const presets: Preset[] = [
  { id: "2d-3", label: "Instap", sizes: [3, 3], level: 1, presses: 3 },
  { id: "2d-5", label: "Klassiek", sizes: [5, 5], level: 2, presses: 9 },
  { id: "2d-7", label: "Groot", sizes: [7, 7], level: 3, presses: 18 },
  { id: "3d-3", label: "Kubus", sizes: [3, 3, 3], level: 1, presses: 5 },
  { id: "3d-4", label: "Grote kubus", sizes: [4, 4, 4], level: 3, presses: 14 },
  { id: "4d-2", label: "Tesseract", sizes: [2, 2, 2, 2], level: 1, presses: 3 },
  { id: "4d-3", label: "Hyperkubus", sizes: [3, 3, 3, 3], level: 2, presses: 8 },
  { id: "4d-3x", label: "Hyper-expert", sizes: [3, 3, 3, 3], level: 3, presses: 16 },
];

function generate(preset: Preset, seed: string): LOData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("lo:" + preset.id + ":" + seed);
  const k = preset.presses as number;
  for (let attempt = 0; attempt < 50; attempt++) {
    const lights = new Uint8Array(g.count);
    const cells = rng.shuffle(Array.from({ length: g.count }, (_, i) => i)).slice(0, k);
    for (const c of cells) {
      lights[c] ^= 1;
      for (const m of g.orth(c)) lights[m] ^= 1;
    }
    const on = lights.reduce((s, x) => s + x, 0);
    if (on < Math.max(2, Math.floor(k / 2))) continue;
    const sol = solveLights(g, lights);
    if (!sol || sol.length < Math.min(k, 2)) continue;
    return { type: "lightsout", preset: preset.id, seed, sizes: preset.sizes, lights: [...lights], par: sol.length };
  }
  throw new Error("lights out generatie mislukt");
}

class LightsGame implements PuzzleGame {
  grid: Grid;
  input = "press" as const;
  lights: Uint8Array;
  presses = 0;
  private start: Uint8Array;
  private hintCell = -1;
  constructor(private data: LOData) {
    this.grid = new Grid(data.sizes);
    this.start = Uint8Array.from(data.lights);
    this.lights = this.start.slice();
  }
  visual(i: number): CellVisual {
    const on = this.lights[i] === 1;
    return {
      tone: on ? "glow" : "glass",
      fill: on ? "#ffd166" : undefined,
      icon: on ? "bulb" : undefined,
      pulse: i === this.hintCell,
    };
  }
  act(i: number): boolean {
    this.lights[i] ^= 1;
    for (const m of this.grid.orth(i)) this.lights[m] ^= 1;
    this.presses++;
    this.hintCell = -1;
    return true;
  }
  peers(i: number) {
    return this.grid.orth(i);
  }
  getState() {
    return { l: [...this.lights], p: this.presses };
  }
  setState(s: any) {
    this.lights = Uint8Array.from(s.l);
    this.presses = s.p;
    this.hintCell = -1;
  }
  check(): Status {
    const on = this.lights.reduce((s, x) => s + x, 0);
    return {
      solved: on === 0,
      errors: [],
      progress: 1 - on / this.grid.count,
      info: `${this.presses} keer gedrukt · minimaal ${this.data.par}`,
    };
  }
  hint(): Hint | null {
    const sol = solveLights(this.grid, this.lights);
    if (!sol || !sol.length) return null;
    this.hintCell = sol[0];
    return { cells: [sol[0]], text: `Nog minstens ${sol.length} keer drukken. Begin hier.` };
  }
  moves() {
    return this.presses;
  }
  panel() {
    const on = this.lights.reduce((s, x) => s + x, 0);
    return {
      title: "Lichtjes",
      items: [
        { label: "Lampen aan", value: String(on) },
        { label: "Gedrukt", value: String(this.presses) },
        { label: "Minimaal nodig", value: String(this.data.par) },
        { label: "Buren per cel", value: String(2 * this.grid.D) },
      ],
    };
  }
}

export const LightsOut: PuzzleType = {
  id: "lightsout",
  name: "Lichtjes",
  origin: "Lights Out",
  tagline: "Eén druk, alle buren flippen mee",
  accent: "#ffd166",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="15" y="15" width="10" height="10" rx="2.5" fill="currentColor" fill-opacity=".35"/><rect x="15" y="3" width="10" height="10" rx="2.5"/><rect x="15" y="27" width="10" height="10" rx="2.5"/><rect x="3" y="15" width="10" height="10" rx="2.5"/><rect x="27" y="15" width="10" height="10" rx="2.5"/></g></svg>`,
  presets,
  rules(dim) {
    const nb = 2 * dim;
    return {
      goal: "Zet alle lampjes uit.",
      rules: [
        "Druk je op een cel, dan wisselt die cel én elke directe buur van aan naar uit (of andersom).",
        `In ${dim}D heeft een cel tot ${nb} directe buren: ${["", "links/rechts", "links/rechts en boven/onder", "links/rechts, boven/onder en voor/achter", "links/rechts, boven/onder, voor/achter en ana/kata"][dim]}.`,
        "Twee keer op dezelfde cel drukken heft zichzelf op. De volgorde maakt niet uit.",
      ],
      dimNote:
        dim === 4
          ? "De twee buren in de vierde richting (w) zitten op dezelfde plek in het bord erboven en eronder. In het bord ernaast vind je de z-buren."
          : dim === 3
            ? "De buren in de derde richting (z) zitten op dezelfde plek in het bord ernaast."
            : undefined,
    };
  },
  generate,
  create: (d) => new LightsGame(d as LOData),
};
