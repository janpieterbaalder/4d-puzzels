import { Grid } from "../core/grid";
import { Rng } from "../core/rng";

export interface DBPreset {
  id: string;
  label: string;
  dots: number[];
  note: string;
}

export const DB_PRESETS: DBPreset[] = [
  { id: "2d-4", label: "Klassiek 3 × 3", dots: [4, 4], note: "Elke streep grenst aan hoogstens 2 kamers." },
  { id: "2d-5", label: "Groot 4 × 4", dots: [5, 5], note: "Meer kamers, langere ketens." },
  { id: "3d-3", label: "Kubus 2 × 2 × 2", dots: [3, 3, 3], note: "In 3D grenst een streep aan maximaal 4 kamers." },
  { id: "4d-2", label: "Tesseract", dots: [2, 2, 2, 2], note: "16 hoekpunten, 32 ribben, 24 kamers. Elke streep raakt precies 3 kamers." },
  { id: "4d-3", label: "Dubbele tesseract", dots: [3, 2, 2, 2], note: "Twee tesseracten die een kubus delen." },
];

export class DotsBoxes {
  grid: Grid;
  edges: [number, number, number][] = []; // [dot a, dot b, as]
  squares: { edges: number[]; corners: number[]; plane: [number, number] }[] = [];
  edgeSquares: number[][] = [];
  drawn: Int8Array;
  owner: Int8Array;
  turn: 1 | 2 = 1;
  score: [number, number, number] = [0, 0, 0];
  history: number[] = [];

  constructor(dots: number[]) {
    const g = (this.grid = new Grid(dots));
    const key = new Map<number, number>();
    for (let i = 0; i < g.count; i++)
      for (let a = 0; a < g.D; a++) {
        const j = g.step(i, a, 1);
        if (j < 0) continue;
        key.set(i * g.count + j, this.edges.length);
        this.edges.push([i, j, a]);
      }
    const eid = (p: number, q: number) => key.get(Math.min(p, q) * g.count + Math.max(p, q))!;
    for (let a = 0; a < g.D; a++)
      for (let b = a + 1; b < g.D; b++)
        for (let i = 0; i < g.count; i++) {
          const ia = g.step(i, a, 1);
          const ib = g.step(i, b, 1);
          if (ia < 0 || ib < 0) continue;
          const iab = g.step(ia, b, 1);
          this.squares.push({ edges: [eid(i, ia), eid(ia, iab), eid(ib, iab), eid(i, ib)], corners: [i, ia, iab, ib], plane: [a, b] });
        }
    this.edgeSquares = this.edges.map(() => []);
    this.squares.forEach((s, k) => s.edges.forEach((e) => this.edgeSquares[e].push(k)));
    this.drawn = new Int8Array(this.edges.length);
    this.owner = new Int8Array(this.squares.length);
  }

  sides(sq: number, drawn = this.drawn): number {
    let c = 0;
    for (const e of this.squares[sq].edges) if (drawn[e]) c++;
    return c;
  }

  get over(): boolean {
    return this.drawn.every((d) => d !== 0);
  }

  /** Zet een streep. Geeft het aantal voltooide kamers terug; bij 0 wisselt de beurt. */
  play(e: number): number {
    if (this.drawn[e]) return -1;
    this.drawn[e] = this.turn;
    this.history.push(e);
    let done = 0;
    for (const s of this.edgeSquares[e]) {
      if (this.sides(s) === 4) {
        this.owner[s] = this.turn;
        this.score[this.turn]++;
        done++;
      }
    }
    if (!done) this.turn = this.turn === 1 ? 2 : 1;
    return done;
  }

  /** Hoeveel kamers geeft deze streep weg als de tegenstander gulzig alles pakt? */
  private giveaway(e: number): number {
    const d = this.drawn.slice();
    d[e] = 9;
    // eigen kamers die we direct sluiten tellen negatief
    let mine = 0;
    for (const s of this.edgeSquares[e]) if (this.sides(s, d) === 4) mine++;
    if (mine) return -mine;
    let taken = 0;
    let progress = true;
    while (progress) {
      progress = false;
      for (let s = 0; s < this.squares.length; s++) {
        if (this.sides(s, d) !== 3) continue;
        const free = this.squares[s].edges.find((x) => !d[x])!;
        d[free] = 9;
        for (const t of this.edgeSquares[free]) if (this.sides(t, d) === 4) taken++;
        progress = true;
      }
    }
    return taken;
  }

  aiMove(level: 1 | 2 | 3, rng: Rng): number {
    const free = this.edges.map((_, k) => k).filter((k) => !this.drawn[k]);
    if (!free.length) return -1;
    const completing = free.filter((e) => this.edgeSquares[e].some((s) => this.sides(s) === 3));
    if (completing.length && (level > 1 || rng.chance(0.7))) {
      // pak de streep die de meeste kamers tegelijk sluit
      completing.sort((a, b) => this.edgeSquares[b].filter((s) => this.sides(s) === 3).length - this.edgeSquares[a].filter((s) => this.sides(s) === 3).length);
      return completing[0];
    }
    const safe = free.filter((e) => this.edgeSquares[e].every((s) => this.sides(s) < 2));
    if (level === 1) return rng.pick(safe.length && rng.chance(0.6) ? safe : free);
    if (safe.length) return rng.pick(safe);
    let best = free[0];
    let bestG = Infinity;
    for (const e of rng.shuffle(free.slice())) {
      const g = this.giveaway(e);
      if (g < bestG) {
        bestG = g;
        best = e;
      }
      if (level === 2 && bestG <= 1) break;
    }
    return best;
  }

  stats() {
    const per = this.edges.map((_, k) => this.edgeSquares[k].length);
    return { dots: this.grid.count, edges: this.edges.length, squares: this.squares.length, maxPerEdge: Math.max(...per) };
  }
}
