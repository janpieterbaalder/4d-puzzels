import { AllDifferent, CSP, minimizeGivens } from "../core/csp";
import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import { CspGame, domToVals, duplicateCells } from "./cspbase";
import type { CellVisual, Preset, PuzzleData, PuzzleType } from "./types";

interface TecData extends PuzzleData {
  region: number[];
  givens: number[];
  solution: number[];
  diagonal: boolean;
}

const presets: Preset[] = [
  { id: "2d-5", label: "Instap", sizes: [5, 5], level: 1, diagonal: true },
  { id: "2d-6", label: "Klassiek", sizes: [6, 6], level: 2, diagonal: true },
  { id: "2d-8", label: "Groot", sizes: [8, 8], level: 3, diagonal: true },
  { id: "3d-3", label: "Kubus", sizes: [3, 3, 3], level: 1, diagonal: false },
  { id: "3d-4", label: "Grote kubus", sizes: [4, 4, 4], level: 2, diagonal: false },
  { id: "4d-3", label: "Tesseract", sizes: [3, 3, 3, 3], level: 2, diagonal: false },
  { id: "4d-3h", label: "Tesseract zwaar", sizes: [3, 3, 3, 3], level: 3, diagonal: false },
];

const MAXR = 5;

function partition(g: Grid, rng: Rng): number[] {
  const region = new Array(g.count).fill(-1);
  let id = 0;
  const order = rng.shuffle(Array.from({ length: g.count }, (_, i) => i));
  for (const s of order) {
    if (region[s] >= 0) continue;
    const target = rng.pick([3, 4, 4, 5, 5, 5]);
    const cells = [s];
    region[s] = id;
    while (cells.length < target) {
      const frontier: number[] = [];
      for (const c of cells) for (const m of g.orth(c)) if (region[m] < 0) frontier.push(m);
      if (!frontier.length) break;
      const m = rng.pick(frontier);
      region[m] = id;
      cells.push(m);
    }
    id++;
  }
  // kleine restjes (1 cel) samenvoegen met een buur-regio die nog ruimte heeft
  const sizes = new Map<number, number>();
  region.forEach((r) => sizes.set(r, (sizes.get(r) ?? 0) + 1));
  for (let i = 0; i < g.count; i++) {
    if (sizes.get(region[i]) !== 1) continue;
    const opts = g.orth(i).filter((m) => (sizes.get(region[m]) ?? 0) < MAXR);
    if (!opts.length) continue;
    const m = rng.pick(opts);
    sizes.set(region[i], 0);
    region[i] = region[m];
    sizes.set(region[m], sizes.get(region[m])! + 1);
  }
  // hernummer
  const map = new Map<number, number>();
  return region.map((r) => {
    if (!map.has(r)) map.set(r, map.size);
    return map.get(r)!;
  });
}

function buildCSP(g: Grid, region: number[], diagonal: boolean): CSP {
  const groups = regionGroups(region);
  const csp = new CSP(g.count, (1 << MAXR) - 1);
  for (const cells of groups) {
    const full = (1 << cells.length) - 1;
    for (const c of cells) csp.init[c] = full;
    csp.add(new AllDifferent(cells, full, true));
  }
  for (let i = 0; i < g.count; i++) {
    const nbs = diagonal ? g.king(i) : g.orth(i);
    for (const j of nbs) if (j > i && region[j] !== region[i]) csp.add(new AllDifferent([i, j]));
  }
  return csp;
}

export function regionGroups(region: number[]): number[][] {
  const groups: number[][] = [];
  region.forEach((r, i) => {
    (groups[r] ??= []).push(i);
  });
  return groups;
}

function generate(preset: Preset, seed: string): TecData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("tec:" + preset.id + ":" + seed);
  const diagonal = !!preset.diagonal;
  for (let attempt = 0; attempt < 200; attempt++) {
    const region = partition(g, rng);
    const csp = buildCSP(g, region, diagonal);
    const r = csp.solve({ rng, limit: 1, maxNodes: 50000 });
    if (!r.count) continue;
    const sol = r.solutions[0];
    const giv = minimizeGivens(csp, sol, rng, {
      logicOnly: preset.level < 3,
      keepFraction: preset.level === 1 ? 0.12 : 0,
    });
    return {
      type: "tectonic",
      preset: preset.id,
      seed,
      sizes: preset.sizes,
      region,
      givens: domToVals(giv),
      solution: domToVals(sol),
      diagonal,
    };
  }
  throw new Error("tectonic generatie mislukt");
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Zachte regio-tinten, toegewezen zodat buur-regio's verschillen. */
const TINTS = ["#5ef2b4", "#6cb8ff", "#ffb547", "#ff7eb6", "#c99bff", "#b6f36a", "#4fe3ff", "#ff9a6b"];

class TectonicGame extends CspGame {
  grid: Grid;
  input = "number" as const;
  symbols = ["1", "2", "3", "4", "5"];
  groups: number[][];
  tint: string[];
  constructor(private data: TecData) {
    super();
    this.grid = new Grid(data.sizes);
    this.init(data.givens, data.solution);
    this.groups = regionGroups(data.region);
    // kleur regio's met een gulzige graafkleuring
    const adj = this.groups.map(() => new Set<number>());
    for (let i = 0; i < this.grid.count; i++)
      for (const j of this.grid.orth(i)) if (data.region[i] !== data.region[j]) adj[data.region[i]].add(data.region[j]);
    const col: number[] = [];
    this.groups.forEach((_, r) => {
      const used = new Set([...adj[r]].map((q) => col[q]).filter((x) => x !== undefined));
      let c = r % TINTS.length;
      for (let k = 0; k < TINTS.length; k++) {
        const cand = (r * 3 + k) % TINTS.length;
        if (!used.has(cand)) {
          c = cand;
          break;
        }
      }
      col[r] = c;
    });
    this.tint = col.map((c) => hexA(TINTS[c], 0.42));
  }
  protected buildCSP() {
    return buildCSP(this.grid, this.data.region, this.data.diagonal);
  }
  regionOf(i: number) {
    return this.data.region[i];
  }
  regionSize(i: number) {
    return this.groups[this.data.region[i]].length;
  }
  visual(i: number): CellVisual {
    const v = this.baseVisual(i);
    v.region = this.data.region[i];
    v.fill = this.tint[this.data.region[i]];
    v.tone = "glass";
    return v;
  }
  peers(i: number) {
    const s = new Set<number>(this.groups[this.data.region[i]]);
    for (const j of this.data.diagonal ? this.grid.king(i) : this.grid.orth(i)) s.add(j);
    s.delete(i);
    return [...s];
  }
  enter(i: number, v: number, pencil: boolean) {
    if (v > this.regionSize(i)) return false;
    return super.enter(i, v, pencil);
  }
  errorCells() {
    const errs = duplicateCells(this.groups, this.vals);
    for (let i = 0; i < this.grid.count; i++) {
      if (!this.vals[i]) continue;
      if (this.vals[i] > this.regionSize(i)) errs.add(i);
      for (const j of this.data.diagonal ? this.grid.king(i) : this.grid.orth(i))
        if (this.vals[j] === this.vals[i]) {
          errs.add(i);
          errs.add(j);
        }
    }
    return errs;
  }
  panel() {
    const nb = this.data.diagonal ? 3 ** this.grid.D - 1 : 2 * this.grid.D;
    return {
      title: "Tectonic",
      items: [
        { label: "Gebieden", value: String(this.groups.length) },
        { label: "Buren per cel", value: String(nb) },
        { label: "Diagonalen tellen mee", value: this.data.diagonal ? "ja" : "nee" },
      ],
    };
  }
}

export const Tectonic: PuzzleType = {
  id: "tectonic",
  name: "Tectonic",
  origin: "Tectonic® / Suguru",
  tagline: "Gebieden vol cijfers die elkaar niet mogen raken",
  accent: "#b6f36a",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M4 4h32v32H4z" stroke-width="2"/><path d="M4 20h12v-8h8v24M24 20h12" stroke-width="2.4"/></g><text x="10" y="15" font-size="8" fill="currentColor" font-family="Outfit" font-weight="700">1</text><text x="28" y="31" font-size="8" fill="currentColor" font-family="Outfit" font-weight="700">3</text></svg>`,
  presets,
  rules(dim) {
    return {
      goal: "Vul elk gebied met de cijfers 1 tot en met zijn grootte.",
      rules: [
        "Een gebied van 3 cellen bevat 1, 2 en 3; van 5 cellen 1 t/m 5.",
        dim === 2
          ? "Twee gelijke cijfers mogen elkaar niet raken, ook niet diagonaal."
          : "Twee gelijke cijfers mogen geen directe buren zijn (links/rechts, boven/onder, en in de diepte).",
        dim >= 3 ? "Gebieden kunnen over meerdere borden doorlopen: dezelfde kleurtint = hetzelfde gebied." : "Dikke lijnen scheiden de gebieden.",
      ],
      dimNote:
        dim === 2
          ? undefined
          : dim === 3
            ? "Waarom tellen diagonalen hier níet mee? In 3D raken de 8 cellen van elk 2×2×2-blokje elkaar allemaal. Dan zou je minstens 8 verschillende cijfers nodig hebben, en gebieden hebben er hoogstens 5. In 3D heeft een cel 26 koningsburen."
            : "In 4D heeft een cel 3⁴ − 1 = 80 koningsburen, en raken de 16 cellen van elk 2×2×2×2-blokje elkaar allemaal. Met de diagonaalregel zouden je minstens 16 cijfers nodig hebben. Daarom tellen alleen de 8 directe buren.",
    };
  },
  generate,
  create: (d) => new TectonicGame(d as TecData),
};
