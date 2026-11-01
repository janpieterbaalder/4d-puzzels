import { AllDifferent, CSP, Less, popcount } from "../core/csp";
import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import { CspGame, domToVals, duplicateCells } from "./cspbase";
import type { CellVisual, EdgeMark, Preset, PuzzleData, PuzzleType } from "./types";

interface FutData extends PuzzleData {
  givens: number[];
  solution: number[];
  ineq: [number, number][]; // a < b
}

const presets: Preset[] = [
  { id: "2d-4", label: "Instap", sizes: [4, 4], level: 1 },
  { id: "2d-5", label: "Klassiek", sizes: [5, 5], level: 2 },
  { id: "2d-6", label: "Groot", sizes: [6, 6], level: 3 },
  { id: "3d-3", label: "Kubus", sizes: [3, 3, 3], level: 1 },
  { id: "3d-4", label: "Grote kubus", sizes: [4, 4, 4], level: 2 },
  { id: "4d-3", label: "Tesseract", sizes: [3, 3, 3, 3], level: 2 },
  { id: "4d-4", label: "Hypertesseract", sizes: [4, 4, 4, 4], level: 3 },
];

function buildCSP(g: Grid, ineq: [number, number][], withIneq: boolean[] | null): CSP {
  const n = g.n[0];
  const full = (1 << n) - 1;
  const csp = new CSP(g.count, full);
  for (const l of g.lines()) csp.add(new AllDifferent(l, full, true));
  ineq.forEach(([a, b], k) => {
    if (!withIneq || withIneq[k]) csp.add(new Less(a, b));
  });
  return csp;
}

function isOk(csp: CSP, dom: Int32Array, logicOnly: boolean): boolean {
  if (logicOnly) {
    const r = csp.propagateOnly(dom);
    return !!r && r.every((x) => popcount(x) === 1);
  }
  const r = csp.solve({ dom, limit: 2, maxNodes: 20000 });
  return r.count === 1 && !r.aborted;
}

function generate(preset: Preset, seed: string): FutData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("fut:" + preset.id + ":" + seed);
  const base = buildCSP(g, [], null);
  const sol = base.solve({ rng, limit: 1 }).solutions[0];
  const vals = domToVals(sol);
  // alle mogelijke ongelijkheden tussen buren
  const all: [number, number][] = [];
  for (let i = 0; i < g.count; i++)
    for (let a = 0; a < g.D; a++) {
      const j = g.step(i, a, 1);
      if (j < 0) continue;
      all.push(vals[i] < vals[j] ? [i, j] : [j, i]);
    }
  const logicOnly = preset.level < 3;
  const useIneq = all.map(() => true);
  const givens = new Uint8Array(g.count);
  const dom = () => {
    const d = new Int32Array(g.count).fill((1 << g.n[0]) - 1);
    for (let i = 0; i < g.count; i++) if (givens[i]) d[i] = sol[i];
    return d;
  };
  // 1. met alle ongelijkheden: voeg gegevens toe tot uniek
  let csp = buildCSP(g, all, useIneq);
  const cellOrder = rng.shuffle(Array.from({ length: g.count }, (_, i) => i));
  let ci = 0;
  while (!isOk(csp, dom(), logicOnly) && ci < cellOrder.length) givens[cellOrder[ci++]] = 1;
  // 2. verwijder eerst overbodige gegevens (zo blijven de tekens het werk doen)
  for (const c of rng.shuffle(Array.from({ length: g.count }, (_, i) => i))) {
    if (!givens[c]) continue;
    givens[c] = 0;
    if (!isOk(csp, dom(), logicOnly)) givens[c] = 1;
  }
  // 3. verwijder overbodige ongelijkheden
  const ineqOrder = rng.shuffle(all.map((_, k) => k));
  for (const k of ineqOrder) {
    useIneq[k] = false;
    csp = buildCSP(g, all, useIneq);
    if (!isOk(csp, dom(), logicOnly)) useIneq[k] = true;
  }
  // instap: een paar extra cijfers
  if (preset.level === 1) {
    const extra = Math.floor(g.count * 0.08);
    for (const c of rng.shuffle(Array.from({ length: g.count }, (_, i) => i)).slice(0, extra)) givens[c] = 1;
  }
  return {
    type: "futoshiki",
    preset: preset.id,
    seed,
    sizes: preset.sizes,
    givens: [...givens].map((x, i) => (x ? vals[i] : 0)),
    solution: vals,
    ineq: all.filter((_, k) => useIneq[k]),
  };
}

class FutoshikiGame extends CspGame {
  grid: Grid;
  input = "number" as const;
  symbols: string[];
  private ineqOf: [number, number][][];
  constructor(private data: FutData) {
    super();
    this.grid = new Grid(data.sizes);
    this.symbols = Array.from({ length: data.sizes[0] }, (_, k) => String(k + 1));
    this.init(data.givens, data.solution);
    this.ineqOf = Array.from({ length: this.grid.count }, () => []);
    for (const e of data.ineq) {
      this.ineqOf[e[0]].push(e);
      this.ineqOf[e[1]].push(e);
    }
  }
  protected buildCSP() {
    return buildCSP(this.grid, this.data.ineq, null);
  }
  visual(i: number): CellVisual {
    return this.baseVisual(i);
  }
  peers(i: number) {
    const out: number[] = [];
    for (const id of this.grid.linesOf(i)) for (const c of this.grid.lines()[id]) if (c !== i) out.push(c);
    return out;
  }
  edgeMarks(): EdgeMark[] {
    return this.data.ineq.map(([a, b]) => ({ a, b, axis: this.grid.axisBetween(a, b) }));
  }
  errorCells() {
    const errs = duplicateCells(this.grid.lines(), this.vals);
    for (const [a, b] of this.data.ineq) {
      if (this.vals[a] && this.vals[b] && !(this.vals[a] < this.vals[b])) {
        errs.add(a);
        errs.add(b);
      }
    }
    return errs;
  }
  panel() {
    const perAxis = [0, 0, 0, 0];
    for (const [a, b] of this.data.ineq) perAxis[this.grid.axisBetween(a, b)]++;
    return {
      title: "Ongelijkheden",
      items: perAxis.slice(0, this.grid.D).map((c, a) => ({ label: `langs ${"xyzw"[a]}`, value: String(c), color: `var(--axis-${"xyzw"[a]})` })),
    };
  }
}

export const Futoshiki: PuzzleType = {
  id: "futoshiki",
  name: "Futoshiki",
  origin: "Futoshiki (groter-dan)",
  tagline: "Groter dan, kleiner dan — ook tussen werelden",
  accent: "#ff7eb6",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="14" height="14" rx="3"/><rect x="23" y="12" width="14" height="14" rx="3"/><path d="M22 15.5l-3.5 3.5 3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/></g><text x="10" y="23" font-size="9" text-anchor="middle" fill="currentColor" font-family="Outfit" font-weight="700">2</text><text x="30" y="23" font-size="9" text-anchor="middle" fill="currentColor" font-family="Outfit" font-weight="700">3</text></svg>`,
  presets,
  rules(dim, preset) {
    const n = preset?.sizes[0] ?? 4;
    return {
      goal: `Vul elke cel met een cijfer 1–${n}.`,
      rules: [
        `Elke lijn in elke richting bevat 1–${n} precies één keer.`,
        "Een teken < of > tussen twee buren moet kloppen. De punt wijst naar het kleinere getal.",
        dim >= 3
          ? "Tekens tussen borden staan als klein gekleurd pijltje in de hoek van de cel: blauw (z) wijst naar het bord links/rechts, paars (w) naar het bord boven/onder."
          : "Kies een cel en tik een cijfer.",
      ],
      dimNote:
        dim >= 3
          ? "Een ongelijkheid kan nu ook 'de diepte in' wijzen: naar dezelfde plek in een andere laag. In de 3D-weergave zie je die als kegeltjes tussen de kubussen."
          : undefined,
    };
  },
  generate,
  create: (d) => new FutoshikiGame(d as FutData),
};
