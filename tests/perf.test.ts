import { describe, it, expect } from "vitest";
import { LightsOut } from "../src/puzzles/lightsout";
import { Maze } from "../src/puzzles/maze";
import { Binary } from "../src/puzzles/binary";
import { Sudoku } from "../src/puzzles/sudoku";
import { Futoshiki } from "../src/puzzles/futoshiki";
import { Tectonic } from "../src/puzzles/tectonic";
import { Hitori } from "../src/puzzles/hitori";
import { Battleships } from "../src/puzzles/battleships";
import { Tents } from "../src/puzzles/tents";

const only = process.env.ONLY?.split(",");
const types = [LightsOut, Maze, Binary, Sudoku, Futoshiki, Tectonic, Hitori, Battleships, Tents].filter((t) => !only || only.includes(t.id));
describe("perf", () => {
  for (const t of types)
    for (const p of t.presets)
      it(`${t.id} ${p.id}`, () => {
        for (const seed of ["a", "b", "c"]) {
          const t0 = performance.now();
          const d = t.generate(p, seed);
          const ms = performance.now() - t0;
          const g = t.create(d);
          const dd = d as any;
          const info = dd.givens ? "givens " + dd.givens.filter((x: number) => x).length : dd.reveal ? "reveal " + dd.reveal.length : dd.ineq ? "" : "";
          const extra = dd.ineq ? " ineq " + dd.ineq.length : "";
          process.stderr.write("\n" + [t.id, p.id, seed, ms.toFixed(0) + "ms", info + extra].join(" "));
          expect(g.check().solved).toBe(false);
        }
      });
});
