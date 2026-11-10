import type { Grid } from "../core/grid";
import type { HyperClue } from "./types";

/** Hulpfuncties voor puzzels met tellingen per hypervlak (rij → laag → 3D-ruimte). */
export class Hyper {
  readonly planes: number; // totaal aantal hypervlakken
  readonly offset: number[]; // per as: eerste plane-id
  readonly planeOf: Int32Array; // [cel * D + as] → plane-id
  constructor(readonly g: Grid) {
    this.offset = [];
    let p = 0;
    for (let a = 0; a < g.D; a++) {
      this.offset.push(p);
      p += g.n[a];
    }
    this.planes = p;
    this.planeOf = new Int32Array(g.count * g.D);
    for (let i = 0; i < g.count; i++) for (let a = 0; a < g.D; a++) this.planeOf[i * g.D + a] = this.offset[a] + g.c(i, a);
  }
  counts(member: (i: number) => boolean): number[] {
    const out = new Array(this.planes).fill(0);
    for (let i = 0; i < this.g.count; i++) if (member(i)) for (let a = 0; a < this.g.D; a++) out[this.planeOf[i * this.g.D + a]]++;
    return out;
  }
  /** clues als per-as-arrays */
  split(flat: number[]): number[][] {
    return this.offset.map((o, a) => flat.slice(o, o + this.g.n[a]));
  }
  flat(perAxis: number[][]): number[] {
    return perAxis.flat();
  }
  clues(target: number[][], current: number[], open: number[]): HyperClue[] {
    const out: HyperClue[] = [];
    for (let a = 0; a < this.g.D; a++)
      for (let k = 0; k < this.g.n[a]; k++) {
        const p = this.offset[a] + k;
        out.push({ axis: a, k, target: target[a][k], current: current[p], open: open[p] });
      }
    return out;
  }
}

/** Naam van een hypervlak in gewone taal: kolom/rij in 2D, laag in 3D, 3D-plak in 4D. */
export function planeName(D: number, axis: number): string {
  if (D === 2) return axis === 0 ? "Kolom" : "Rij";
  return D === 3 ? "Laag" : "3D-plak";
}
