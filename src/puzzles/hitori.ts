import { AllDifferent, CSP } from "../core/csp";
import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import { domToVals } from "./cspbase";
import type { CellVisual, Hint, Preset, PuzzleData, PuzzleGame, PuzzleType, Status } from "./types";

interface HitData extends PuzzleData {
  values: number[];
  shaded: number[]; // oplossing: 1 = zwart
}

const presets: Preset[] = [
  { id: "2d-5", label: "Instap", sizes: [5, 5], level: 1 },
  { id: "2d-6", label: "Klassiek", sizes: [6, 6], level: 2 },
  { id: "2d-8", label: "Groot", sizes: [8, 8], level: 3 },
  { id: "3d-4", label: "Kubus", sizes: [4, 4, 4], level: 2 },
  { id: "3d-5", label: "Grote kubus", sizes: [5, 5, 5], level: 3 },
  { id: "4d-3", label: "Tesseract", sizes: [3, 3, 3, 3], level: 2 },
  { id: "4d-4", label: "Hypertesseract", sizes: [4, 4, 4, 4], level: 3 },
];

/* ---------- Solver ---------- */
// toestand: 0 onbekend, 1 zwart, 2 wit

function partnersOf(g: Grid, values: number[]): number[][] {
  const p: number[][] = Array.from({ length: g.count }, () => []);
  for (const line of g.lines())
    for (let a = 0; a < line.length; a++)
      for (let b = a + 1; b < line.length; b++)
        if (values[line[a]] === values[line[b]]) {
          p[line[a]].push(line[b]);
          p[line[b]].push(line[a]);
        }
  return p;
}

function whitesConnected(g: Grid, st: Int8Array): boolean {
  let start = -1;
  let whites = 0;
  for (let i = 0; i < g.count; i++)
    if (st[i] === 2) {
      whites++;
      if (start < 0) start = i;
    }
  if (start < 0) return true;
  const seen = new Uint8Array(g.count);
  const stack = [start];
  seen[start] = 1;
  let found = 0;
  while (stack.length) {
    const c = stack.pop()!;
    if (st[c] === 2) found++;
    for (const m of g.orth(c))
      if (!seen[m] && st[m] !== 1) {
        seen[m] = 1;
        stack.push(m);
      }
  }
  return found === whites;
}

function propagate(g: Grid, partners: number[][], st: Int8Array): boolean {
  const queue: number[] = [];
  for (let i = 0; i < g.count; i++) if (st[i]) queue.push(i);
  const set = (c: number, v: number): boolean => {
    if (st[c] === v) return true;
    if (st[c] !== 0) return false;
    st[c] = v;
    queue.push(c);
    return true;
  };
  while (queue.length) {
    const c = queue.pop()!;
    if (st[c] === 1) {
      for (const m of g.orth(c)) if (!set(m, 2)) return false;
    } else if (st[c] === 2) {
      for (const p of partners[c]) if (!set(p, 1)) return false;
    }
  }
  return whitesConnected(g, st);
}

export function solveHitori(g: Grid, values: number[], limit: number, maxNodes = 200000): { count: number; sol: Int8Array | null; sols: Int8Array[] } {
  const partners = partnersOf(g, values);
  const st = new Int8Array(g.count);
  for (let i = 0; i < g.count; i++) if (!partners[i].length) st[i] = 2;
  let count = 0;
  let sol: Int8Array | null = null;
  const sols: Int8Array[] = [];
  let nodes = 0;
  const rec = (s: Int8Array): boolean => {
    if (!propagate(g, partners, s)) return false;
    let best = -1;
    let bestP = -1;
    for (let i = 0; i < g.count; i++)
      if (s[i] === 0 && partners[i].length > bestP) {
        bestP = partners[i].length;
        best = i;
      }
    if (best < 0) {
      count++;
      if (!sol) sol = s.slice();
      if (sols.length < limit) sols.push(s.slice());
      return count >= limit;
    }
    for (const v of [1, 2]) {
      if (++nodes > maxNodes) {
        count = limit + 1;
        return true;
      }
      const t = s.slice();
      t[best] = v;
      if (rec(t)) return true;
    }
    return false;
  };
  rec(st);
  return { count, sol, sols };
}

/* ---------- Generator ---------- */

function generate(preset: Preset, seed: string): HitData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("hit:" + preset.id + ":" + seed);
  const n = g.n[0];
  const full = (1 << n) - 1;
  const latin = new CSP(g.count, full);
  for (const l of g.lines()) latin.add(new AllDifferent(l, full, true));
  const density = g.D === 2 ? 0.3 : g.D === 3 ? 0.22 : 0.18;
  for (let attempt = 0; attempt < 400; attempt++) {
    const base = domToVals(latin.solve({ rng, limit: 1 }).solutions[0]);
    // kies zwarte cellen: niet naast elkaar, wit blijft samenhangend
    const shaded = new Int8Array(g.count);
    const target = Math.round(g.count * density);
    let count = 0;
    for (const c of rng.shuffle(Array.from({ length: g.count }, (_, i) => i))) {
      if (count >= target) break;
      if (g.orth(c).some((m) => shaded[m])) continue;
      shaded[c] = 1;
      if (!g.connected((i) => !shaded[i])) {
        shaded[c] = 0;
        continue;
      }
      count++;
    }
    // Een zwarte cel krijgt een ander getal dan in het Latijnse basisrooster:
    // dan is hij in al zijn lijnen een dubbele en moet hij weg.
    const values = base.slice();
    const reassign = (c: number, avoid: number) => {
      const opts: number[] = [];
      for (let v = 1; v <= n; v++) if (v !== base[c] && v !== avoid) opts.push(v);
      values[c] = rng.pick(opts);
    };
    for (let c = 0; c < g.count; c++) if (shaded[c]) reassign(c, -1);
    const shadedCells = [...shaded].map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    // lokaal zoeken: verstoor de alternatieve oplossing tot de puzzel uniek is
    for (let it = 0; it < 300; it++) {
      const r = solveHitori(g, values, 2, 40000);
      if (r.count === 1) {
        // De oplossing is wat de oplosser vindt, niet het patroon waarmee we begonnen: een zwarte cel waarvan het
        // getal (na het verschuiven van getallen) nergens meer dubbel staat, hoort wit te zijn. Anders spreken de
        // hints ("altijd wit") en de voortgang de opgeslagen oplossing tegen.
        return { type: "hitori", preset: preset.id, seed, sizes: preset.sizes, values, shaded: [...r.sol!].map((s) => (s === 1 ? 1 : 0)) };
      }
      if (r.count > 2 || r.count === 0) break;
      const alt = r.sols.find((B) => B.some((b, i) => (b === 1) !== (shaded[i] === 1)));
      if (!alt) {
        const c = rng.pick(shadedCells);
        reassign(c, values[c]);
        continue;
      }
      const xs: number[] = [];
      for (let i = 0; i < g.count; i++) if (!shaded[i] && alt[i] === 1) xs.push(i);
      if (xs.length) {
        const x = rng.pick(xs);
        for (const lid of g.linesOf(x)) for (const c of g.lines()[lid]) if (shaded[c] && values[c] === values[x]) reassign(c, values[x]);
      } else {
        const ys = shadedCells.filter((i) => alt[i] !== 1);
        const c = rng.pick(ys.length ? ys : shadedCells);
        reassign(c, values[c]);
      }
    }
  }
  throw new Error("hitori generatie mislukt");
}

/* ---------- Spel ---------- */

class HitoriGame implements PuzzleGame {
  grid: Grid;
  input = "cycle" as const;
  st: Int8Array;
  private partners: number[][];
  private hintCells: number[] = [];
  constructor(private data: HitData) {
    this.grid = new Grid(data.sizes);
    this.st = new Int8Array(this.grid.count);
    this.partners = partnersOf(this.grid, data.values);
  }
  visual(i: number): CellVisual {
    const s = this.st[i];
    return {
      text: String(this.data.values[i]),
      given: true,
      tone: s === 1 ? "dark" : s === 2 ? "solid" : "glass",
      fill: s === 1 ? "#141824" : s === 2 ? "rgba(255,255,255,.14)" : undefined,
      icon: s === 2 ? "circle" : undefined,
      pulse: this.hintCells.includes(i),
    };
  }
  act(i: number, dir: 1 | -1) {
    this.st[i] = dir === 1 ? [1, 2, 0][this.st[i]] : [2, 0, 1][this.st[i]];
    this.hintCells = [];
    return true;
  }
  peers(i: number) {
    const out = new Set<number>(this.partners[i]);
    for (const m of this.grid.orth(i)) out.add(m);
    return [...out];
  }
  getState() {
    return [...this.st];
  }
  setState(s: any) {
    this.st = Int8Array.from(s);
    this.hintCells = [];
  }
  private errorSet(): { errs: Set<number>; disconnected: boolean } {
    const errs = new Set<number>();
    const g = this.grid;
    for (let i = 0; i < g.count; i++) {
      if (this.st[i] === 1) for (const m of g.orth(i)) if (this.st[m] === 1) errs.add(i).add(m);
      if (this.st[i] === 2) for (const p of this.partners[i]) if (this.st[p] === 2) errs.add(i).add(p);
    }
    const disconnected = !g.connected((i) => this.st[i] !== 1);
    if (disconnected) {
      // markeer de kleinste losse stukken
      const comp = new Int32Array(g.count).fill(-1);
      const sizes: number[] = [];
      for (let i = 0; i < g.count; i++) {
        if (this.st[i] === 1 || comp[i] >= 0) continue;
        const id = sizes.length;
        let sz = 0;
        const stack = [i];
        comp[i] = id;
        while (stack.length) {
          const c = stack.pop()!;
          sz++;
          for (const m of g.orth(c)) if (this.st[m] !== 1 && comp[m] < 0) (comp[m] = id), stack.push(m);
        }
        sizes.push(sz);
      }
      const biggest = sizes.indexOf(Math.max(...sizes));
      for (let i = 0; i < g.count; i++) if (comp[i] >= 0 && comp[i] !== biggest) errs.add(i);
    }
    return { errs, disconnected };
  }
  check(): Status {
    const { errs, disconnected } = this.errorSet();
    // opgelost: geen dubbelen onder niet-zwarte cellen, regels in orde
    let dup = false;
    for (let i = 0; i < this.grid.count && !dup; i++)
      if (this.st[i] !== 1) for (const p of this.partners[i]) if (this.st[p] !== 1) dup = true;
    const solved = !dup && errs.size === 0 && !disconnected;
    let need = 0;
    let done = 0;
    for (let i = 0; i < this.grid.count; i++) {
      if (this.data.shaded[i]) {
        need++;
        if (this.st[i] === 1) done++;
      }
    }
    return {
      solved,
      errors: [...errs],
      progress: need ? done / need : 1,
      info: disconnected ? "Let op: de witte cellen zijn niet meer één geheel." : undefined,
    };
  }
  hint(): Hint | null {
    const g = this.grid;
    const wrong: number[] = [];
    for (let i = 0; i < g.count; i++) {
      if (this.st[i] === 1 && !this.data.shaded[i]) wrong.push(i);
      if (this.st[i] === 2 && this.data.shaded[i]) wrong.push(i);
    }
    if (wrong.length) {
      this.hintCells = wrong;
      return { cells: wrong, text: "Deze markering klopt niet." };
    }
    // logische stap: propagatie vanaf huidige toestand
    const st = this.st.slice();
    for (let i = 0; i < g.count; i++) if (!this.partners[i].length && !st[i]) st[i] = 2;
    const before = this.st.slice();
    propagate(g, this.partners, st);
    for (let i = 0; i < g.count; i++) {
      if (!before[i] && st[i]) {
        this.hintCells = [i];
        return {
          cells: [i],
          text: st[i] === 1 ? "Deze cel moet zwart worden." : this.partners[i].length ? "Deze cel moet wit blijven (rondje)." : "Dit getal komt in geen enkele lijn dubbel voor: altijd wit.",
        };
      }
    }
    for (let i = 0; i < g.count; i++)
      if (!this.st[i] && this.data.shaded[i]) {
        this.hintCells = [i];
        return { cells: [i], text: "Verklapt: deze cel wordt zwart." };
      }
    return null;
  }
  panel() {
    const D = this.grid.D;
    return {
      title: "Hitori",
      items: [
        { label: "Zwarte cellen", value: String(this.st.filter((s) => s === 1).length) },
        { label: "Buren per cel", value: String(2 * D) },
        { label: "Lijnen per cel", value: String(D) },
      ],
    };
  }
}

export const Hitori: PuzzleType = {
  id: "hitori",
  name: "Hitori",
  origin: "Hitori",
  tagline: "Streep dubbelen weg, maar breek het netwerk niet",
  accent: "#ff6b6b",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="32" height="32" rx="4"/><path d="M15 4v32M25 4v32M4 15h32M4 25h32" opacity=".5"/></g><rect x="15" y="4" width="10" height="11" fill="currentColor"/><rect x="4" y="25" width="11" height="11" fill="currentColor"/><rect x="25" y="15" width="11" height="10" fill="currentColor"/></svg>`,
  presets,
  rules(dim) {
    return {
      goal: "Maak cellen zwart zodat geen getal dubbel voorkomt in een lijn.",
      rules: [
        "In elke lijn (in elke richting) komt elk getal hoogstens één keer voor bij de niet-zwarte cellen.",
        "Zwarte cellen mogen geen directe buren van elkaar zijn.",
        "Maak alleen zwart wat nodig is: een getal dat in geen enkele lijn dubbel staat, blijft wit.",
        "Alle niet-zwarte cellen vormen samen één aaneengesloten geheel.",
        "Klik: leeg → zwart → rondje (zeker wit) → leeg.",
      ],
      dimNote:
        dim >= 3
          ? `Samenhang in ${dim}D: witte cellen mogen elkaar ook via de diepte${dim === 4 ? " of via ana/kata" : ""} bereiken. Daardoor is het in hogere dimensies véél moeilijker om iets af te sluiten — in 2D sluit een lijn een gebied af, in 3D heb je een heel vlak nodig, in 4D een hele ruimte.`
          : undefined,
    };
  },
  generate,
  create: (d) => new HitoriGame(d as HitData),
};
