/**
 * Kleine, snelle constraint-solver met eindige domeinen (bitmaskers, max 31 waarden).
 * Gebruikt door de generatoren om oplossingen te bouwen en uniciteit te controleren.
 */
import type { Rng } from "./rng";

export function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function lowBit(x: number): number {
  return x & -x;
}

export function bitIndex(bit: number): number {
  return 31 - Math.clz32(bit);
}

export function bitsOf(mask: number): number[] {
  const out: number[] = [];
  while (mask) {
    const b = mask & -mask;
    out.push(bitIndex(b));
    mask ^= b;
  }
  return out;
}

export interface Propagator {
  vars: number[];
  run(s: Store): boolean;
}

/** De domeinen tijdens zoeken, met propagatie-wachtrij. */
export class Store {
  dom: Int32Array;
  private csp: CSP;
  private queue: number[] = [];
  private inQueue: Uint8Array;

  constructor(csp: CSP, dom: Int32Array) {
    this.csp = csp;
    this.dom = dom;
    this.inQueue = new Uint8Array(csp.props.length);
  }

  /** Beperk domein van v tot mask. false bij tegenspraak. */
  restrict(v: number, mask: number): boolean {
    const old = this.dom[v];
    const nw = old & mask;
    if (nw === old) return true;
    if (nw === 0) return false;
    this.dom[v] = nw;
    const w = this.csp.watch[v];
    for (let k = 0; k < w.length; k++) {
      const p = w[k];
      if (!this.inQueue[p]) {
        this.inQueue[p] = 1;
        this.queue.push(p);
      }
    }
    return true;
  }

  remove(v: number, bits: number): boolean {
    return this.restrict(v, ~bits);
  }

  enqueueAll() {
    for (let p = 0; p < this.csp.props.length; p++) {
      if (!this.inQueue[p]) {
        this.inQueue[p] = 1;
        this.queue.push(p);
      }
    }
  }

  enqueueVar(v: number) {
    for (const p of this.csp.watch[v]) {
      if (!this.inQueue[p]) {
        this.inQueue[p] = 1;
        this.queue.push(p);
      }
    }
  }

  propagate(): boolean {
    const props = this.csp.props;
    while (this.queue.length) {
      const p = this.queue.pop()!;
      this.inQueue[p] = 0;
      if (!props[p].run(this)) {
        for (const q of this.queue) this.inQueue[q] = 0;
        this.queue.length = 0;
        return false;
      }
    }
    return true;
  }
}

export interface SolveResult {
  count: number;
  solutions: Int32Array[];
  nodes: number;
  aborted: boolean;
}

export class CSP {
  readonly n: number;
  readonly init: Int32Array;
  readonly props: Propagator[] = [];
  watch: number[][];

  constructor(n: number, fullMask: number) {
    this.n = n;
    this.init = new Int32Array(n).fill(fullMask);
    this.watch = Array.from({ length: n }, () => []);
  }

  add(p: Propagator) {
    const id = this.props.length;
    this.props.push(p);
    const seen = new Set<number>();
    for (const v of p.vars) {
      if (seen.has(v)) continue;
      seen.add(v);
      this.watch[v].push(id);
    }
  }

  /** Alleen propageren (geen gokken). Geeft domeinen terug of null bij tegenspraak. */
  propagateOnly(dom: Int32Array): Int32Array | null {
    const s = new Store(this, dom.slice());
    s.enqueueAll();
    return s.propagate() ? s.dom : null;
  }

  solve(opts: { dom?: Int32Array; limit?: number; rng?: Rng; maxNodes?: number } = {}): SolveResult {
    const limit = opts.limit ?? 1;
    const maxNodes = opts.maxNodes ?? 2_000_000;
    const rng = opts.rng;
    const res: SolveResult = { count: 0, solutions: [], nodes: 0, aborted: false };
    const root = new Store(this, (opts.dom ?? this.init).slice());
    root.enqueueAll();
    if (!root.propagate()) return res;

    const n = this.n;
    const rec = (dom: Int32Array): boolean => {
      // MRV: kleinste domein > 1
      let best = -1;
      let bestSize = 99;
      for (let v = 0; v < n; v++) {
        const d = dom[v];
        if (d & (d - 1)) {
          const sz = popcount(d);
          if (sz < bestSize || (sz === bestSize && rng && rng.next() < 0.3)) {
            bestSize = sz;
            best = v;
            if (sz === 2 && !rng) break;
          }
        }
      }
      if (best < 0) {
        res.count++;
        if (res.solutions.length < limit) res.solutions.push(dom.slice());
        return res.count >= limit;
      }
      const vals = bitsOf(dom[best]);
      if (rng) rng.shuffle(vals);
      for (const val of vals) {
        if (++res.nodes > maxNodes) {
          res.aborted = true;
          return true;
        }
        const st = new Store(this, dom.slice());
        st.dom[best] = 1 << val;
        st.enqueueVar(best);
        if (st.propagate()) {
          if (rec(st.dom)) return true;
        }
      }
      return false;
    };
    rec(root.dom);
    return res;
  }
}

/* ---------- Propagatoren ---------- */

/** Alle variabelen verschillend. perm=true: elke waarde uit `values` komt precies één keer voor. */
export class AllDifferent implements Propagator {
  vars: number[];
  perm: boolean;
  values: number;

  constructor(vars: number[], values = 0, perm = false) {
    this.vars = vars;
    this.perm = perm;
    this.values = values;
  }

  run(s: Store): boolean {
    const vs = this.vars;
    const dom = s.dom;
    // naked singles
    for (let i = 0; i < vs.length; i++) {
      const d = dom[vs[i]];
      if (d && !(d & (d - 1))) {
        for (let j = 0; j < vs.length; j++) {
          if (j !== i && dom[vs[j]] & d) {
            if (!s.remove(vs[j], d)) return false;
          }
        }
      }
    }
    if (this.perm) {
      // hidden singles
      let m = this.values;
      while (m) {
        const b = m & -m;
        m ^= b;
        let cnt = 0;
        let last = -1;
        for (let i = 0; i < vs.length; i++) {
          if (dom[vs[i]] & b) {
            cnt++;
            last = vs[i];
            if (cnt > 1) break;
          }
        }
        if (cnt === 0) return false;
        if (cnt === 1 && dom[last] !== b) {
          if (!s.restrict(last, b)) return false;
        }
      }
    }
    return true;
  }
}

/** a < b  (waarde-index als getal). */
export class Less implements Propagator {
  vars: number[];
  constructor(a: number, b: number) {
    this.vars = [a, b];
  }
  run(s: Store): boolean {
    const [a, b] = this.vars;
    const da = s.dom[a];
    const db = s.dom[b];
    const maxB = bitIndex(db);
    const minA = bitIndex(da & -da);
    // a < maxB  → bits van a onder maxB
    if (!s.restrict(a, (1 << maxB) - 1)) return false;
    // b > minA → bits van b boven minA
    if (!s.restrict(b, ~((2 << minA) - 1))) return false;
    return true;
  }
}

/** Precies k variabelen hebben waarde-bit `bit`. */
export class CountExact implements Propagator {
  vars: number[];
  bit: number;
  k: number;
  constructor(vars: number[], bit: number, k: number) {
    this.vars = vars;
    this.bit = bit;
    this.k = k;
  }
  run(s: Store): boolean {
    let fixed = 0;
    let possible = 0;
    const dom = s.dom;
    for (const v of this.vars) {
      const d = dom[v];
      if (d & this.bit) {
        possible++;
        if (d === this.bit) fixed++;
      }
    }
    if (fixed > this.k || possible < this.k) return false;
    if (fixed === this.k && possible > fixed) {
      for (const v of this.vars) if (dom[v] !== this.bit && dom[v] & this.bit) if (!s.remove(v, this.bit)) return false;
    } else if (possible === this.k && possible > fixed) {
      for (const v of this.vars) if (dom[v] & this.bit && dom[v] !== this.bit) if (!s.restrict(v, this.bit)) return false;
    }
    return true;
  }
}

/** Geen drie gelijke op een rij (binair, waarden 0/1). */
export class NoThree implements Propagator {
  vars: number[];
  constructor(vars: number[]) {
    this.vars = vars;
  }
  run(s: Store): boolean {
    const vs = this.vars;
    const dom = s.dom;
    for (let i = 0; i + 2 < vs.length; i++) {
      const a = dom[vs[i]];
      const b = dom[vs[i + 1]];
      const c = dom[vs[i + 2]];
      const sa = a === 1 || a === 2 ? a : 0;
      const sb = b === 1 || b === 2 ? b : 0;
      const sc = c === 1 || c === 2 ? c : 0;
      if (sa && sa === sb) {
        if (sc === sa) return false;
        if (!s.remove(vs[i + 2], sa)) return false;
      }
      if (sb && sb === sc) {
        if (!s.remove(vs[i], sb)) return false;
      }
      if (sa && sa === sc) {
        if (!s.remove(vs[i + 1], sa)) return false;
      }
    }
    return true;
  }
}

/** Generiek: verwijder gegevens zolang de puzzel uniek (en evt. logisch) oplosbaar blijft. */
export function minimizeGivens(
  csp: CSP,
  solution: Int32Array,
  rng: Rng,
  opts: { logicOnly: boolean; keepFraction?: number; maxChecks?: number; order?: number[] },
): Int32Array {
  const n = csp.n;
  const givens = new Uint8Array(n).fill(1);
  const order = opts.order ?? rng.shuffle(Array.from({ length: n }, (_, i) => i));
  const target = Math.floor(n * (opts.keepFraction ?? 0));
  let kept = n;
  const domFromGivens = () => {
    const d = csp.init.slice();
    for (let i = 0; i < n; i++) if (givens[i]) d[i] = solution[i];
    return d;
  };
  let checks = 0;
  for (const v of order) {
    if (kept <= target) break;
    if (opts.maxChecks && checks > opts.maxChecks) break;
    givens[v] = 0;
    checks++;
    const d = domFromGivens();
    let ok: boolean;
    if (opts.logicOnly) {
      const r = csp.propagateOnly(d);
      ok = !!r && r.every((x) => popcount(x) === 1);
    } else {
      const r = csp.solve({ dom: d, limit: 2, maxNodes: 20000 });
      ok = r.count === 1 && !r.aborted;
    }
    if (ok) kept--;
    else givens[v] = 1;
  }
  const out = new Int32Array(n).fill(0);
  for (let i = 0; i < n; i++) if (givens[i]) out[i] = solution[i];
  return out; // 0 = leeg, anders bitmask van de waarde
}
