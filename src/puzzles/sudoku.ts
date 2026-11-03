import { AllDifferent, CSP, minimizeGivens } from "../core/csp";
import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import { CspGame, domToVals, duplicateCells } from "./cspbase";
import type { CellVisual, Preset, PuzzleData, PuzzleType } from "./types";

interface SudData extends PuzzleData {
  givens: number[];
  solution: number[];
  box: number[];
  planes: number[][];
}

const presets: Preset[] = [
  { id: "2d-4", label: "Mini", sizes: [4, 4], level: 1, box: [2, 2], planes: [[0, 1]] },
  { id: "2d-6", label: "Zesje", sizes: [6, 6], level: 2, box: [3, 2], planes: [[0, 1]] },
  { id: "2d-9", label: "Klassiek", sizes: [9, 9], level: 3, box: [3, 3], planes: [[0, 1]] },
  { id: "3d-stack", label: "Stapelsudoku", sizes: [4, 4, 4], level: 1, box: [2, 2], planes: [[0, 1]] },
  {
    id: "3d-cube",
    label: "Sudokubus",
    sizes: [4, 4, 4],
    level: 2,
    box: [2, 2],
    planes: [
      [0, 1],
      [0, 2],
      [1, 2],
    ],
  },
  { id: "4d-latin3", label: "Tesseract-Latijns", sizes: [3, 3, 3, 3], level: 1, box: [3, 3], planes: [] },
  { id: "4d-latin", label: "Hyper-Latijns", sizes: [4, 4, 4, 4], level: 2, box: [2, 2], planes: [] },
  {
    id: "4d-double",
    label: "Dubbele sudoku",
    sizes: [4, 4, 4, 4],
    level: 2,
    box: [2, 2],
    planes: [
      [0, 1],
      [2, 3],
    ],
  },
  {
    id: "4d-double-h",
    label: "Dubbele sudoku zwaar",
    sizes: [4, 4, 4, 4],
    level: 3,
    box: [2, 2],
    planes: [
      [0, 1],
      [2, 3],
    ],
  },
];

export function sudokuGroups(g: Grid, box: number[], planes: number[][]): { groups: number[][]; kinds: string[] } {
  const groups: number[][] = [];
  const kinds: string[] = [];
  g.lines().forEach((l, id) => {
    groups.push(l);
    kinds.push("line" + g.lineAxis(id));
  });
  for (const [a, b] of planes) {
    const map = new Map<string, number[]>();
    for (let i = 0; i < g.count; i++) {
      const c = g.coord(i);
      const key = c.map((v, ax) => (ax === a ? Math.floor(v / box[0]) : ax === b ? Math.floor(v / box[1]) : v)).join(",");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    for (const cells of map.values()) {
      groups.push(cells);
      kinds.push("box" + a + b);
    }
  }
  return { groups, kinds };
}

function buildCSP(g: Grid, groups: number[][]): CSP {
  const n = g.n[0];
  const full = (1 << n) - 1;
  const csp = new CSP(g.count, full);
  for (const gr of groups) csp.add(new AllDifferent(gr, full, true));
  return csp;
}

function generate(preset: Preset, seed: string): SudData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("sud:" + preset.id + ":" + seed);
  const box = preset.box as number[];
  const planes = preset.planes as number[][];
  const { groups } = sudokuGroups(g, box, planes);
  const csp = buildCSP(g, groups);
  const sol = csp.solve({ rng, limit: 1 }).solutions[0];
  const giv = minimizeGivens(csp, sol, rng, {
    logicOnly: preset.level < 3,
    keepFraction: preset.level === 1 ? (g.D === 2 ? 0.3 : 0.08) : 0,
  });
  return {
    type: "sudoku",
    preset: preset.id,
    seed,
    sizes: preset.sizes,
    givens: domToVals(giv),
    solution: domToVals(sol),
    box,
    planes,
  };
}

class SudokuGame extends CspGame {
  grid: Grid;
  input = "number" as const;
  symbols: string[];
  groups: number[][];
  groupsOf: number[][];
  private peerCache = new Map<number, number[]>();
  constructor(private data: SudData) {
    super();
    this.grid = new Grid(data.sizes);
    this.symbols = Array.from({ length: data.sizes[0] }, (_, k) => String(k + 1));
    this.init(data.givens, data.solution);
    this.groups = sudokuGroups(this.grid, data.box, data.planes).groups;
    this.groupsOf = Array.from({ length: this.grid.count }, () => []);
    this.groups.forEach((gr, id) => gr.forEach((c) => this.groupsOf[c].push(id)));
  }
  protected buildCSP() {
    return buildCSP(this.grid, this.groups);
  }
  visual(i: number): CellVisual {
    return this.baseVisual(i);
  }
  peers(i: number) {
    let p = this.peerCache.get(i);
    if (!p) {
      const s = new Set<number>();
      for (const id of this.groupsOf[i]) for (const c of this.groups[id]) if (c !== i) s.add(c);
      p = [...s];
      this.peerCache.set(i, p);
    }
    return p;
  }
  boxOf(i: number) {
    const hasXY = this.data.planes.some(([a, b]) => a === 0 && b === 1);
    if (!hasXY) return -1;
    const bx = Math.floor(this.grid.c(i, 0) / this.data.box[0]);
    const by = Math.floor(this.grid.c(i, 1) / this.data.box[1]);
    return by * 100 + bx;
  }
  errorCells() {
    return duplicateCells(this.groups, this.vals);
  }
  panel() {
    const planeName = (p: number[]) => p.map((a) => "XYZW"[a]).join("");
    return {
      title: "Sudoku",
      items: [
        { label: "Groepen per cel", value: String(this.groupsOf[0].length) },
        { label: "Buren per cel", value: String(this.peers(0).length) },
        {
          label: "Blokken in vlakken",
          value: this.data.planes.length ? this.data.planes.map(planeName).join(" · ") : "geen",
        },
      ],
    };
  }
}

export const Sudoku: PuzzleType = {
  id: "sudoku",
  name: "Sudoku",
  origin: "Sudoku / Latijns vierkant",
  tagline: "Elk cijfer één keer, in elke richting",
  accent: "#ffb547",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor"><rect x="4" y="4" width="32" height="32" rx="4" stroke-width="2"/><path d="M20 4v32M4 20h32" stroke-width="2"/><path d="M12 4v32M28 4v32M4 12h32M4 28h32" stroke-width=".8" opacity=".6"/></g><text x="8" y="11" font-size="7" fill="currentColor" font-family="Outfit" font-weight="700">1</text><text x="23" y="27" font-size="7" fill="currentColor" font-family="Outfit" font-weight="700">4</text></svg>`,
  presets,
  rules(dim, preset) {
    const planes = (preset?.planes as number[][] | undefined) ?? [[0, 1]];
    const n = preset?.sizes[0] ?? 4;
    const lines = ["rij", "kolom", "pilaar (z)", "w-lijn"].slice(0, dim).join(", ");
    const r = [`Elke lijn — ${lines} — bevat de cijfers 1–${n} precies één keer.`];
    if (planes.length) {
      const hasZW = planes.some(([a, b]) => a === 2 && b === 3);
      r.push(
        dim === 2
          ? `Elk blok (dik omrand) bevat 1–${n} precies één keer.`
          : planes.length === 3
            ? "Elk 2×2-blok in elke snede — in alle drie de richtingen (x–y, x–z en y–z) — bevat 1–4 één keer. Elke laag die je uit de kubus snijdt, liggend, staand of in de diepte, is dus een sudoku. Op het platte bord zie je alleen de x–y-blokken; kies een cel en de cellen die meetellen lichten op, ook in de borden ernaast."
            : hasZW
              ? "Elk bord is een sudoku met 2×2-blokken. Én: kijk je naar één vaste plek in alle 16 borden, dan vormen die 16 cellen óók een sudoku (het grote raster van borden met zijn 2×2-blokken van borden)."
              : "Elk bord (laag) is een sudoku met 2×2-blokken. Van opzij gezien (x–z en y–z) gelden alleen de lijnen; wil je ook daar blokken, kies dan de Sudokubus.",
      );
    } else r.push("Er zijn geen blokken: alleen lijnen. Dat heet een Latijnse hyperkubus.");
    r.push("Kies een cel en tik een cijfer. Met 'Potlood' noteer je opties.");
    return {
      goal: `Vul elke cel met een cijfer 1–${n}.`,
      rules: r,
      dimNote:
        dim === 4
          ? "Waarom niet in álle zes vlakrichtingen blokken? Dan zou elk 2×2×2×2-blok van 16 cellen al 8 verschillende cijfers nodig hebben, en je hebt er maar 4. Dimensies hebben gevolgen!"
          : dim === 3
            ? "In 3D telt elke cel mee in drie lijnen. De pilaar loopt door alle borden heen, op dezelfde plek."
            : undefined,
    };
  },
  generate,
  create: (d) => new SudokuGame(d as SudData),
};
