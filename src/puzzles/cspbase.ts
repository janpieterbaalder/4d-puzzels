import { CSP, popcount, bitIndex } from "../core/csp";
import type { Grid } from "../core/grid";
import type { CellVisual, Hint, InputKind, PuzzleGame, Status } from "./types";

/**
 * Basis voor invulpuzzels met een CSP-model (Binair, Sudoku, Futoshiki, Tectonic).
 * Waarden in het spel: 0 = leeg, 1..k = symbool. In de CSP: waarde v ↔ bit (v−1).
 */
export abstract class CspGame implements PuzzleGame {
  abstract grid: Grid;
  abstract input: InputKind;
  symbols?: string[];
  vals!: Int8Array;
  notes!: Int32Array;
  given!: Uint8Array;
  solution!: Int8Array;
  protected hintCells: number[] = [];
  private _csp: CSP | null = null;

  protected init(givens: number[], solution: number[]) {
    const n = givens.length;
    this.given = Uint8Array.from(givens.map((v) => (v ? 1 : 0)));
    this.vals = Int8Array.from(givens);
    this.notes = new Int32Array(n);
    this.solution = Int8Array.from(solution);
  }

  protected abstract buildCSP(): CSP;

  get csp(): CSP {
    if (!this._csp) this._csp = this.buildCSP();
    return this._csp;
  }

  abstract errorCells(): Set<number>;

  isFixed(i: number) {
    return this.given[i] === 1;
  }

  baseVisual(i: number): CellVisual {
    const v = this.vals[i];
    return {
      text: v ? (this.symbols ? this.symbols[v - 1] : String(v)) : undefined,
      given: this.given[i] === 1,
      notes: !v && this.notes[i] ? bitsToVals(this.notes[i]) : undefined,
      pulse: this.hintCells.includes(i),
    };
  }

  abstract visual(i: number): CellVisual;

  enter(i: number, v: number, pencil: boolean): boolean {
    if (this.given[i]) return false;
    this.hintCells = [];
    if (pencil && v > 0) {
      if (this.vals[i]) return false;
      this.notes[i] ^= 1 << (v - 1);
      return true;
    }
    if (this.vals[i] === v && v !== 0) v = 0;
    if (this.vals[i] === v && !this.notes[i]) return false;
    this.vals[i] = v;
    if (v === 0) this.notes[i] = 0;
    else this.clearNotesAround(i, v);
    return true;
  }

  /** Een ingevuld cijfer wist die optie bij de buren. */
  protected clearNotesAround(i: number, v: number) {
    const bit = 1 << (v - 1);
    for (const p of this.peers(i)) this.notes[p] &= ~bit;
  }

  peers(_i: number): number[] {
    return [];
  }

  getState() {
    return { v: [...this.vals], n: [...this.notes] };
  }
  setState(s: any) {
    this.vals = Int8Array.from(s.v);
    this.notes = Int32Array.from(s.n);
    this.hintCells = [];
  }

  check(): Status {
    const errs = this.errorCells();
    let filled = 0;
    let total = 0;
    let correct = true;
    for (let i = 0; i < this.vals.length; i++) {
      if (this.given[i]) continue;
      total++;
      if (this.vals[i]) filled++;
      if (this.vals[i] !== this.solution[i]) correct = false;
    }
    // Oplossen op basis van de regels: elke volledige, foutloze invulling telt.
    const full = filled === total;
    const solved = full && (correct || (errs.size === 0 && this.rulesOk()));
    return { solved, errors: [...errs], progress: total ? filled / total : 1 };
  }

  /** Volledig ingevuld rooster voldoet aan alle regels? */
  rulesOk(): boolean {
    const dom = new Int32Array(this.vals.length);
    for (let i = 0; i < dom.length; i++) dom[i] = this.vals[i] ? 1 << (this.vals[i] - 1) : this.csp.init[i];
    const r = this.csp.propagateOnly(dom);
    return !!r && r.every((x, i) => x === dom[i]);
  }

  hint(): Hint | null {
    const wrong: number[] = [];
    for (let i = 0; i < this.vals.length; i++) if (this.vals[i] && this.vals[i] !== this.solution[i]) wrong.push(i);
    if (wrong.length) {
      this.hintCells = wrong;
      return { cells: wrong, text: wrong.length === 1 ? "Deze cel klopt niet." : `${wrong.length} cellen kloppen niet.` };
    }
    const dom = this.csp.init.slice();
    for (let i = 0; i < dom.length; i++) if (this.vals[i]) dom[i] = 1 << (this.vals[i] - 1);
    const r = this.csp.propagateOnly(dom);
    const empties: number[] = [];
    for (let i = 0; i < dom.length; i++) if (!this.vals[i]) empties.push(i);
    if (!empties.length) return null;
    if (r) {
      // voorkeur: cel die door één directe stap vastligt
      const once = this.oneStep(dom);
      const cand = once.length ? once : empties.filter((i) => popcount(r[i]) === 1);
      if (cand.length) {
        const c = cand[0];
        const val = bitIndex(r[c]) + 1;
        this.hintCells = [c];
        return {
          cells: [c],
          text: `Deze cel ligt vast: hier kan alleen ${this.symbols ? this.symbols[val - 1] : val} staan.`,
        };
      }
    }
    const c = empties[Math.floor(empties.length / 2)];
    this.hintCells = [c];
    const val = this.solution[c];
    return { cells: [c], text: `Lastig! Verklapt: hier hoort ${this.symbols ? this.symbols[val - 1] : val}.` };
  }

  /** Cellen die na één propagatieronde vastliggen. */
  private oneStep(dom: Int32Array): number[] {
    const out: number[] = [];
    const r = this.csp.propagateOnly(dom);
    if (!r) return out;
    for (let i = 0; i < dom.length; i++) if (!this.vals[i] && popcount(r[i]) === 1) out.push(i);
    // sorteer op 'nabijheid' van ingevulde cellen: hoe meer bekende peers, hoe logischer
    out.sort((a, b) => this.knownPeers(b) - this.knownPeers(a));
    return out.slice(0, 1);
  }

  private knownPeers(i: number): number {
    return this.peers(i).filter((p) => this.vals[p]).length;
  }

  /** Vul alle mogelijke opties in (op basis van de huidige invulling). */
  autoNotes() {
    for (let i = 0; i < this.vals.length; i++) {
      if (this.vals[i]) continue;
      let m = this.csp.init[i];
      for (const p of this.peers(i)) if (this.vals[p]) m &= ~(1 << (this.vals[p] - 1));
      this.notes[i] = m;
    }
  }

  moves() {
    return 0;
  }
}

export function bitsToVals(mask: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < 31; b++) if (mask & (1 << b)) out.push(b + 1);
  return out;
}

/** Duplicaten binnen groepen (alleen ingevulde cellen). */
export function duplicateCells(groups: number[][], vals: Int8Array): Set<number> {
  const errs = new Set<number>();
  for (const g of groups) {
    const seen = new Map<number, number>();
    for (const c of g) {
      const v = vals[c];
      if (!v) continue;
      if (seen.has(v)) {
        errs.add(c);
        errs.add(seen.get(v)!);
      } else seen.set(v, c);
    }
  }
  return errs;
}

/** Domeinen (bitmask) → waarden 1..k. */
export function domToVals(dom: Int32Array): number[] {
  return [...dom].map((d) => (d && !(d & (d - 1)) ? bitIndex(d) + 1 : 0));
}
