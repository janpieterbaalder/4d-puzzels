import { describe, it, expect } from "vitest";
import { ALL_TYPES } from "../src/puzzles/registry";
import { Grid } from "../src/core/grid";
import { solveLights } from "../src/puzzles/lightsout";

function applySolution(type: string, d: any, g: any) {
  switch (type) {
    case "binary": case "sudoku": case "futoshiki": case "tectonic":
      g.vals = Int8Array.from(d.solution); return;
    case "hitori": g.st = Int8Array.from(d.shaded.map((s: number) => (s ? 1 : 2))); return;
    case "battleships": g.st = Int8Array.from(d.ships.map((s: number) => (s ? 1 : 2))); return;
    case "tents": g.st = Int8Array.from(d.tents.map((s: number) => (s ? 1 : 2))); return;
    case "lightsout": { const sol = solveLights(new Grid(d.sizes), Uint8Array.from(d.lights))!; expect(sol.length).toBe(d.par); for (const c of sol) g.act(c, 1); return; }
    case "maze": {
      // volg hint tot het doel
      for (let k = 0; k < 2000 && !g.check().solved; k++) { const h = g.hint(); g.act(h.cells[0], 1); }
      return;
    }
  }
}

describe("generated puzzles are solvable and recognised as solved", () => {
  for (const t of ALL_TYPES)
    for (const p of t.presets)
      it(`${t.id} ${p.id}`, () => {
        for (const seed of ["s1", "s2"]) {
          const d = t.generate(p, seed);
          const d2 = t.generate(p, seed);
          expect(JSON.stringify(d2)).toBe(JSON.stringify(d)); // deterministisch
          const g = t.create(JSON.parse(JSON.stringify(d)));
          expect(g.check().solved).toBe(false);
          applySolution(t.id, d, g);
          const st = g.check();
          expect(st.errors.length).toBe(0);
          expect(st.solved).toBe(true);
        }
      });
});
