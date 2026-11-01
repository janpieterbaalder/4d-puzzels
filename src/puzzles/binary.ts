import { CSP, CountExact, NoThree, minimizeGivens } from "../core/csp";
import { Grid } from "../core/grid";
import { Rng } from "../core/rng";
import { CspGame, domToVals } from "./cspbase";
import type { CellVisual, Preset, PuzzleData, PuzzleType } from "./types";

interface BinData extends PuzzleData {
  givens: number[];
  solution: number[];
}

const presets: Preset[] = [
  { id: "2d-6", label: "Instap", sizes: [6, 6], level: 1 },
  { id: "2d-8", label: "Klassiek", sizes: [8, 8], level: 2 },
  { id: "2d-10", label: "Groot", sizes: [10, 10], level: 3 },
  { id: "3d-4", label: "Kubus", sizes: [4, 4, 4], level: 1 },
  { id: "3d-6", label: "Grote kubus", sizes: [6, 6, 6], level: 3 },
  { id: "4d-4", label: "Tesseract", sizes: [4, 4, 4, 4], level: 2 },
  { id: "4d-4h", label: "Tesseract zwaar", sizes: [4, 4, 4, 4], level: 3 },
];

export function binaryCSP(g: Grid): CSP {
  const csp = new CSP(g.count, 0b11);
  for (const line of g.lines()) {
    const h = line.length / 2;
    csp.add(new CountExact(line, 1, h));
    csp.add(new CountExact(line, 2, h));
    if (line.length > 4) csp.add(new NoThree(line));
  }
  return csp;
}

function generate(preset: Preset, seed: string): BinData {
  const g = new Grid(preset.sizes);
  const rng = new Rng("bin:" + preset.id + ":" + seed);
  const csp = binaryCSP(g);
  const sol = csp.solve({ rng, limit: 1 }).solutions[0];
  const keep = preset.level === 1 ? 0.12 : 0;
  const giv = minimizeGivens(csp, sol, rng, { logicOnly: preset.level < 3, keepFraction: keep });
  return {
    type: "binary",
    preset: preset.id,
    seed,
    sizes: preset.sizes,
    givens: domToVals(giv),
    solution: domToVals(sol),
  };
}

const C0 = "#6cb8ff";
const C1 = "#ff7a8a";

class BinaryGame extends CspGame {
  grid: Grid;
  input = "cycle" as const;
  symbols = ["0", "1"];
  constructor(data: BinData) {
    super();
    this.grid = new Grid(data.sizes);
    this.init(data.givens, data.solution);
  }
  protected buildCSP() {
    return binaryCSP(this.grid);
  }
  visual(i: number): CellVisual {
    const v = this.baseVisual(i);
    const val = this.vals[i];
    if (val) {
      v.fill = val === 1 ? C0 : C1;
      v.tone = "solid";
    }
    return v;
  }
  act(i: number, dir: 1 | -1): boolean {
    if (this.given[i]) return false;
    const next = dir === 1 ? [1, 2, 0][this.vals[i]] : [2, 0, 1][this.vals[i]];
    this.vals[i] = next;
    this.hintCells = [];
    return true;
  }
  peers(i: number) {
    const out: number[] = [];
    for (const id of this.grid.linesOf(i)) for (const c of this.grid.lines()[id]) if (c !== i) out.push(c);
    return out;
  }
  errorCells(): Set<number> {
    const errs = new Set<number>();
    for (const line of this.grid.lines()) {
      const h = line.length / 2;
      let z = 0;
      let o = 0;
      for (const c of line) {
        if (this.vals[c] === 1) z++;
        else if (this.vals[c] === 2) o++;
      }
      if (z > h) line.forEach((c) => this.vals[c] === 1 && errs.add(c));
      if (o > h) line.forEach((c) => this.vals[c] === 2 && errs.add(c));
      for (let k = 0; k + 2 < line.length; k++) {
        const a = this.vals[line[k]];
        if (a && a === this.vals[line[k + 1]] && a === this.vals[line[k + 2]]) {
          errs.add(line[k]);
          errs.add(line[k + 1]);
          errs.add(line[k + 2]);
        }
      }
    }
    return errs;
  }
  panel() {
    const n = this.grid.n[0];
    return {
      title: "Binair",
      items: [
        { label: "Lijnen", value: String(this.grid.lines().length) },
        { label: "Lijnen door elke cel", value: String(this.grid.D) },
        { label: "Per lijn", value: `${n / 2}× 0 en ${n / 2}× 1` },
      ],
    };
  }
}

export const Binary: PuzzleType = {
  id: "binary",
  name: "Binair",
  origin: "Binairo / Takuzu",
  tagline: "Nullen en enen in evenwicht, in elke richting",
  accent: "#7aa8ff",
  icon: `<svg viewBox="0 0 40 40"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="14" height="14" rx="3"/><rect x="22" y="22" width="14" height="14" rx="3"/><rect x="22" y="4" width="14" height="14" rx="3" fill="currentColor" fill-opacity=".35"/><rect x="4" y="22" width="14" height="14" rx="3" fill="currentColor" fill-opacity=".35"/></g><text x="11" y="15.5" font-size="10" text-anchor="middle" fill="currentColor" font-family="Outfit" font-weight="700">0</text><text x="29" y="33.5" font-size="10" text-anchor="middle" fill="currentColor" font-family="Outfit" font-weight="700">1</text></svg>`,
  presets,
  rules(dim) {
    const names = ["rij", "kolom", "pilaar", "w-lijn"];
    return {
      goal: "Vul elke cel met een 0 of een 1.",
      rules: [
        `Elke lijn — ${names.slice(0, dim).join(", ")} — bevat evenveel nullen als enen.`,
        "Nergens staan drie dezelfde cijfers direct achter elkaar in een lijn.",
        "Klik om te wisselen: leeg → 0 → 1 → leeg. Rechtsklik gaat terug.",
      ],
      dimNote:
        dim >= 3
          ? `Door elke cel lopen nu ${dim} lijnen in plaats van 2. In lijnen van 4 lang is de 'geen drie op een rij'-regel vanzelf al waar: alleen het evenwicht telt.`
          : "De klassieke regel 'geen twee gelijke rijen' laten we weg; die schaalt niet mooi mee naar hogere dimensies.",
    };
  },
  generate,
  create: (d) => new BinaryGame(d as BinData),
};
