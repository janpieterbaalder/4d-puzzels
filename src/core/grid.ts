/**
 * N-dimensionaal rooster. Werkt identiek voor 1D t/m 4D (en hoger).
 * Cellen zijn genummerd 0..count-1; as 0 = x, 1 = y, 2 = z, 3 = w.
 */
export const AXIS_NAMES = ["x", "y", "z", "w"] as const;

export class Grid {
  readonly D: number;
  readonly n: number[];
  readonly count: number;
  readonly stride: number[];
  private readonly coords: Int16Array;
  private _orth: number[][] | null = null;
  private _king: number[][] | null = null;
  private _lines: number[][] | null = null;
  private _lineAxis: number[] | null = null;
  private _linesOf: number[][] | null = null;

  constructor(n: number[]) {
    this.D = n.length;
    this.n = n.slice();
    this.stride = [];
    let s = 1;
    for (let a = 0; a < this.D; a++) {
      this.stride.push(s);
      s *= n[a];
    }
    this.count = s;
    this.coords = new Int16Array(this.count * this.D);
    for (let i = 0; i < this.count; i++) {
      let r = i;
      for (let a = 0; a < this.D; a++) {
        this.coords[i * this.D + a] = r % n[a];
        r = Math.floor(r / n[a]);
      }
    }
  }

  static cube(D: number, size: number): Grid {
    return new Grid(Array.from({ length: D }, () => size));
  }

  c(i: number, axis: number): number {
    return this.coords[i * this.D + axis];
  }

  coord(i: number): number[] {
    const out: number[] = [];
    for (let a = 0; a < this.D; a++) out.push(this.coords[i * this.D + a]);
    return out;
  }

  index(c: number[]): number {
    let i = 0;
    for (let a = 0; a < this.D; a++) i += c[a] * this.stride[a];
    return i;
  }

  inside(c: number[]): boolean {
    for (let a = 0; a < this.D; a++) if (c[a] < 0 || c[a] >= this.n[a]) return false;
    return true;
  }

  /** Buurcel langs een as (dir = ±1), of -1 als die buiten het rooster valt. */
  step(i: number, axis: number, dir: number): number {
    const v = this.c(i, axis) + dir;
    if (v < 0 || v >= this.n[axis]) return -1;
    return i + dir * this.stride[axis];
  }

  /** Orthogonale buren: 2·D stuks in het binnenste. */
  orth(i: number): number[] {
    if (!this._orth) {
      this._orth = [];
      for (let k = 0; k < this.count; k++) {
        const nb: number[] = [];
        for (let a = 0; a < this.D; a++) {
          const m = this.step(k, a, -1);
          if (m >= 0) nb.push(m);
          const p = this.step(k, a, 1);
          if (p >= 0) nb.push(p);
        }
        this._orth.push(nb);
      }
    }
    return this._orth[i];
  }

  /** Koningsburen (ook diagonaal): 3^D − 1 stuks in het binnenste. */
  king(i: number): number[] {
    if (!this._king) {
      this._king = [];
      const offsets: number[][] = [];
      const rec = (pre: number[]) => {
        if (pre.length === this.D) {
          if (pre.some((v) => v !== 0)) offsets.push(pre.slice());
          return;
        }
        for (const d of [-1, 0, 1]) rec([...pre, d]);
      };
      rec([]);
      for (let k = 0; k < this.count; k++) {
        const base = this.coord(k);
        const nb: number[] = [];
        for (const off of offsets) {
          const c = base.map((v, a) => v + off[a]);
          if (this.inside(c)) nb.push(this.index(c));
        }
        this._king.push(nb);
      }
    }
    return this._king[i];
  }

  private buildLines() {
    const lines: number[][] = [];
    const axisOf: number[] = [];
    for (let a = 0; a < this.D; a++) {
      for (let i = 0; i < this.count; i++) {
        if (this.c(i, a) !== 0) continue;
        const line: number[] = [];
        for (let k = 0; k < this.n[a]; k++) line.push(i + k * this.stride[a]);
        lines.push(line);
        axisOf.push(a);
      }
    }
    const linesOf: number[][] = Array.from({ length: this.count }, () => []);
    lines.forEach((l, id) => l.forEach((cell) => linesOf[cell].push(id)));
    this._lines = lines;
    this._lineAxis = axisOf;
    this._linesOf = linesOf;
  }

  /** Alle rechte lijnen langs de assen (rijen, kolommen, pilaren, …). */
  lines(): number[][] {
    if (!this._lines) this.buildLines();
    return this._lines!;
  }

  lineAxis(id: number): number {
    if (!this._lineAxis) this.buildLines();
    return this._lineAxis![id];
  }

  linesOf(i: number): number[] {
    if (!this._linesOf) this.buildLines();
    return this._linesOf![i];
  }

  /** De lijn langs `axis` door cel i. */
  lineThrough(i: number, axis: number): number[] {
    const start = i - this.c(i, axis) * this.stride[axis];
    const out: number[] = [];
    for (let k = 0; k < this.n[axis]; k++) out.push(start + k * this.stride[axis]);
    return out;
  }

  /** Hypervlak: alle cellen met coördinaat `axis` gelijk aan k (rij → laag → 3D-ruimte). */
  hyperplane(axis: number, k: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) if (this.c(i, axis) === k) out.push(i);
    return out;
  }

  /** Vlak door cel i dat wordt opgespannen door assen a en b. */
  plane(i: number, a: number, b: number): number[] {
    const base = i - this.c(i, a) * this.stride[a] - this.c(i, b) * this.stride[b];
    const out: number[] = [];
    for (let v = 0; v < this.n[b]; v++)
      for (let u = 0; u < this.n[a]; u++) out.push(base + u * this.stride[a] + v * this.stride[b]);
    return out;
  }

  /** As waarlangs i en j buren zijn, of -1. */
  axisBetween(i: number, j: number): number {
    const d = j - i;
    for (let a = 0; a < this.D; a++) {
      if (Math.abs(d) === this.stride[a]) {
        if (this.step(i, a, Math.sign(d)) === j) return a;
      }
    }
    return -1;
  }

  /** Samenhang van een deelverzameling (orthogonaal). */
  connected(member: (i: number) => boolean): boolean {
    let start = -1;
    let total = 0;
    for (let i = 0; i < this.count; i++)
      if (member(i)) {
        total++;
        if (start < 0) start = i;
      }
    if (total === 0) return true;
    const seen = new Uint8Array(this.count);
    const stack = [start];
    seen[start] = 1;
    let found = 1;
    while (stack.length) {
      const k = stack.pop()!;
      for (const m of this.orth(k)) {
        if (!seen[m] && member(m)) {
          seen[m] = 1;
          found++;
          stack.push(m);
        }
      }
    }
    return found === total;
  }

  label(i: number): string {
    return "(" + this.coord(i).join(", ") + ")";
  }
}
