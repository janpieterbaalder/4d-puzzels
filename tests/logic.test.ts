/**
 * Onafhankelijke controle van de spellogica.
 *
 * De regels staan hier nog een keer uitgeschreven, los van de spelcode. Per puzzel controleren we:
 *  - de opgeslagen oplossing voldoet aan de regels;
 *  - er is precies één oplossing (met de oplosser van het spel, en voor kleine puzzels ook met
 *    een eenvoudige eigen teller die niets van de spelcode gebruikt);
 *  - check() herkent de oplossing, en een afwijking is niet "opgelost";
 *  - foutdetectie en hints kloppen met de oplossing.
 */
import { describe, expect, it } from "vitest";
import { Grid } from "../src/core/grid";
import { popcount } from "../src/core/csp";
import { Rng } from "../src/core/rng";
import { ALL_STEPS } from "../src/course/curriculum";
import { DB_PRESETS, DotsBoxes } from "../src/games/dotsboxes";
import { solveFleet } from "../src/puzzles/battleships";
import { solveHitori } from "../src/puzzles/hitori";
import { solveLights } from "../src/puzzles/lightsout";
import { ALL_TYPES, TYPES } from "../src/puzzles/registry";
import { solveTents } from "../src/puzzles/tents";
import type { Preset, PuzzleType } from "../src/puzzles/types";

const SEEDS = ["L1", "L2", "L3"];

/** Alle (soort, variant, seed)-combinaties: elke variant met een paar seeds, plus alle cursuspuzzels. */
function cases(typeId: string): { t: PuzzleType; p: Preset; seed: string; fog: boolean }[] {
  const t = TYPES[typeId];
  const out = t.presets.flatMap((p) => SEEDS.map((seed) => ({ t, p, seed, fog: false })));
  for (const { step } of ALL_STEPS)
    if (step.kind === "puzzle" && step.type === typeId) out.push({ t, p: t.presets.find((x) => x.id === step.preset)!, seed: step.seed, fog: !!step.fog });
  return out;
}

const cache = new Map<string, any>();
function gen(t: PuzzleType, p: Preset, seed: string): any {
  const k = `${t.id}:${p.id}:${seed}`;
  if (!cache.has(k)) cache.set(k, t.generate(p, seed));
  return JSON.parse(JSON.stringify(cache.get(k)));
}

/* ------------------------------------------------------------------ */
/* Eigen, eenvoudige teller voor invulpuzzels (geen spelcode)          */
/* ------------------------------------------------------------------ */

/**
 * Tel oplossingen door cel voor cel te proberen. `ok(vals, i)` controleert of de invulling tot nu toe
 * (cellen met waarde ≠ 0) geen regel breekt rond cel i; `maxOf(i)` is de hoogste waarde voor cel i.
 */
function countFill(n: number, givens: number[], maxOf: (i: number) => number, ok: (v: number[], i: number) => boolean, cap = 3, nodeCap = 3_000_000): number {
  const vals = givens.slice();
  for (let i = 0; i < n; i++) if (vals[i] && !ok(vals, i)) return 0;
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (!vals[i]) order.push(i);
  let count = 0;
  let nodes = 0;
  const rec = (k: number): boolean => {
    if (k === order.length) return ++count >= cap;
    const i = order[k];
    for (let v = 1; v <= maxOf(i); v++) {
      if (++nodes > nodeCap) throw new Error("te veel knopen");
      vals[i] = v;
      if (ok(vals, i) && rec(k + 1)) return true;
    }
    vals[i] = 0;
    return false;
  };
  rec(0);
  return count;
}

/* ---------- regels, onafhankelijk uitgeschreven ---------- */

/** Geen dubbele waarde in de lijnen door cel i (alleen ingevulde cellen). */
function linesDistinct(g: Grid, v: number[], i: number): boolean {
  for (let a = 0; a < g.D; a++) for (const c of g.lineThrough(i, a)) if (c !== i && v[c] && v[c] === v[i]) return false;
  return true;
}

function binaryOk(g: Grid, v: number[], i: number): boolean {
  for (let a = 0; a < g.D; a++) {
    const line = g.lineThrough(i, a);
    const half = line.length / 2;
    let zeros = 0;
    let ones = 0;
    let empty = 0;
    for (const c of line) v[c] === 1 ? zeros++ : v[c] === 2 ? ones++ : empty++;
    if (zeros > half || ones > half) return false;
    void empty;
    for (let k = 0; k + 2 < line.length; k++) if (v[line[k]] && v[line[k]] === v[line[k + 1]] && v[line[k]] === v[line[k + 2]]) return false;
  }
  return true;
}

function sudokuOk(g: Grid, box: number[], planes: number[][], v: number[], i: number): boolean {
  if (!linesDistinct(g, v, i)) return false;
  for (const [a, b] of planes) {
    for (const c of g.plane(i, a, b)) {
      if (c === i || !v[c] || v[c] !== v[i]) continue;
      if (Math.floor(g.c(c, a) / box[0]) === Math.floor(g.c(i, a) / box[0]) && Math.floor(g.c(c, b) / box[1]) === Math.floor(g.c(i, b) / box[1])) return false;
    }
  }
  return true;
}

function futoshikiOk(g: Grid, ineq: [number, number][], v: number[], i: number): boolean {
  if (!linesDistinct(g, v, i)) return false;
  for (const [a, b] of ineq) if ((a === i || b === i) && v[a] && v[b] && !(v[a] < v[b])) return false;
  return true;
}

function tectonicOk(g: Grid, region: number[], sizes: number[], diagonal: boolean, v: number[], i: number): boolean {
  if (v[i] > sizes[region[i]]) return false;
  for (let c = 0; c < g.count; c++) if (c !== i && region[c] === region[i] && v[c] === v[i]) return false;
  for (const c of diagonal ? g.king(i) : g.orth(i)) if (v[c] && v[c] === v[i]) return false;
  return true;
}

/** Controleer een volledige invulling met een per-cel-regel. */
function allOk(n: number, v: number[], ok: (v: number[], i: number) => boolean): boolean {
  for (let i = 0; i < n; i++) if (!v[i] || !ok(v, i)) return false;
  return true;
}

function fillRules(typeId: string, d: any): { maxOf: (i: number) => number; ok: (v: number[], i: number) => boolean } {
  const g = new Grid(d.sizes);
  if (typeId === "binary") return { maxOf: () => 2, ok: (v, i) => binaryOk(g, v, i) };
  if (typeId === "sudoku") return { maxOf: () => d.sizes[0], ok: (v, i) => sudokuOk(g, d.box, d.planes, v, i) };
  if (typeId === "futoshiki") return { maxOf: () => d.sizes[0], ok: (v, i) => futoshikiOk(g, d.ineq, v, i) };
  const sizes: number[] = [];
  for (const r of d.region) sizes[r] = (sizes[r] ?? 0) + 1;
  return { maxOf: (i) => sizes[d.region[i]], ok: (v, i) => tectonicOk(g, d.region, sizes, d.diagonal, v, i) };
}

/** Binaire lijnen moeten bij een volle lijn precies in evenwicht zijn. */
function binaryBalanced(g: Grid, v: number[]): boolean {
  for (const line of g.lines()) if (line.filter((c) => v[c] === 1).length !== line.length / 2) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Invulpuzzels: Binair, Sudoku, Futoshiki, Tectonic                   */
/* ------------------------------------------------------------------ */

for (const typeId of ["binary", "sudoku", "futoshiki", "tectonic"]) {
  describe(`logica ${typeId}`, () => {
    for (const { t, p, seed } of cases(typeId))
      it(`${p.id} ${seed}`, () => {
        const d = gen(t, p, seed);
        const g = new Grid(d.sizes);
        const N = g.count;
        const { maxOf, ok } = fillRules(typeId, d);

        // 1. de oplossing voldoet aan de regels, en de gegevens komen uit de oplossing
        expect(allOk(N, d.solution, ok)).toBe(true);
        if (typeId === "binary") expect(binaryBalanced(g, d.solution)).toBe(true);
        for (let i = 0; i < N; i++) if (d.givens[i]) expect(d.givens[i]).toBe(d.solution[i]);
        expect(d.givens.some((x: number) => !x)).toBe(true);

        // 2. precies één oplossing (oplosser van het spel)
        const game: any = t.create(gen(t, p, seed));
        const csp = game.csp;
        const dom = csp.init.slice();
        for (let i = 0; i < N; i++) if (d.givens[i]) dom[i] = 1 << (d.givens[i] - 1);
        const r = csp.solve({ dom, limit: 2, maxNodes: 400000 });
        expect(r.aborted).toBe(false);
        expect(r.count).toBe(1);
        expect([...r.solutions[0]].map((x) => 32 - Math.clz32(x))).toEqual(d.solution);

        // 2b. kleine puzzels: ook met de eigen teller (binair: evenwicht pas bij volle lijn afdwingen)
        if (N <= (typeId === "futoshiki" ? 25 : 36)) {
          const okFull = typeId === "binary" ? (v: number[], i: number) => binaryOk(g, v, i) && fullLinesBalanced(g, v, i) : ok;
          expect(countFill(N, d.givens, maxOf, okFull)).toBe(1);
        }

        // 3. makkelijk/normaal: oplosbaar met alleen logische stappen (geen gokken)
        if (p.level < 3) {
          const pr = csp.propagateOnly(dom);
          expect(pr && pr.every((x: number) => popcount(x) === 1)).toBe(true);
        }

        // 4. het spel herkent begin, oplossing en afwijkingen
        expect(game.check().solved).toBe(false);
        expect(game.check().errors.length).toBe(0);
        const free: number[] = [];
        for (let i = 0; i < N; i++) if (!d.givens[i]) free.push(i);
        game.vals = Int8Array.from(d.solution);
        expect(game.check().solved).toBe(true);
        expect(game.check().errors.length).toBe(0);
        for (const i of free.filter((_, k) => k % Math.ceil(free.length / 12) === 0)) {
          const keep = game.vals[i];
          for (let v = 1; v <= maxOf(i); v++) {
            if (v === keep) continue;
            game.vals[i] = v;
            const st = game.check();
            expect(st.solved).toBe(false);
            expect(st.errors.length).toBeGreaterThan(0); // elke andere waarde breekt zichtbaar een regel
          }
          game.vals[i] = 0;
          expect(game.check().solved).toBe(false);
          game.vals[i] = keep;
        }

        // 5. hints: nooit een fout melden bij een juiste stand, en de genoemde waarde klopt
        const h: any = t.create(gen(t, p, seed));
        for (let step = 0; step < 6; step++) {
          const hint = h.hint();
          if (!hint) break;
          expect(hint.text).not.toMatch(/klop/);
          const c = hint.cells[0];
          expect(h.vals[c]).toBe(0);
          const m = /alleen (\S+) staan|hier hoort (\S+?)\./.exec(hint.text);
          expect(m).not.toBeNull();
          const sym = m![1] ?? m![2];
          const want = h.symbols ? h.symbols[d.solution[c] - 1] : String(d.solution[c]);
          expect(sym).toBe(want);
          h.vals[c] = d.solution[c];
        }
        // een fout wordt wél gemeld
        const w: any = t.create(gen(t, p, seed));
        const c0 = free[0];
        w.vals[c0] = d.solution[c0] === 1 ? 2 : 1;
        if (w.vals[c0] <= maxOf(c0)) expect(w.hint().cells).toContain(c0);
      });
  });
}

function fullLinesBalanced(g: Grid, v: number[], i: number): boolean {
  for (let a = 0; a < g.D; a++) {
    const line = g.lineThrough(i, a);
    if (line.every((c) => v[c]) && line.filter((c) => v[c] === 1).length !== line.length / 2) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* De CSP-oplosser zelf: vergelijk met de eigen teller                 */
/* ------------------------------------------------------------------ */

describe("oplosser telt hetzelfde als de eigen teller", () => {
  for (const [typeId, presetId] of [
    ["sudoku", "2d-4"],
    ["binary", "2d-6"],
    ["futoshiki", "2d-4"],
    ["tectonic", "2d-5"],
  ] as const)
    it(`${typeId} ${presetId}`, () => {
      const t = TYPES[typeId];
      const p = t.presets.find((x) => x.id === presetId)!;
      const rng = new Rng("teller:" + typeId);
      for (const seed of ["T1", "T2", "T3", "T4"]) {
        const d = gen(t, p, seed);
        const g = new Grid(d.sizes);
        const { maxOf, ok } = fillRules(typeId, d);
        const okFull = typeId === "binary" ? (v: number[], i: number) => binaryOk(g, v, i) && fullLinesBalanced(g, v, i) : ok;
        const game: any = t.create(gen(t, p, seed));
        // haal willekeurig gegevens weg: dan zijn er meestal meerdere oplossingen
        for (const drop of [0.3, 0.6]) {
          const givens: number[] = d.givens.map((x: number) => (x && rng.chance(drop) ? 0 : x));
          const dom = game.csp.init.slice();
          for (let i = 0; i < g.count; i++) if (givens[i]) dom[i] = 1 << (givens[i] - 1);
          const cap = 40;
          const a = game.csp.solve({ dom, limit: cap, maxNodes: 2_000_000 }).count;
          const b = countFill(g.count, givens, maxOf, okFull, cap, 20_000_000);
          expect(a).toBe(b);
        }
      }
    });
});

/* ------------------------------------------------------------------ */
/* Hitori                                                              */
/* ------------------------------------------------------------------ */

function hitoriValid(g: Grid, values: number[], black: (i: number) => boolean): string | null {
  for (const line of g.lines()) {
    const seen = new Set<number>();
    for (const c of line) {
      if (black(c)) continue;
      if (seen.has(values[c])) return "dubbel getal in een lijn";
      seen.add(values[c]);
    }
  }
  for (let i = 0; i < g.count; i++) if (black(i) && g.orth(i).some((m) => black(m))) return "zwarte buren";
  if (!g.connected((i) => !black(i))) return "wit niet aaneengesloten";
  return null;
}

describe("logica hitori", () => {
  for (const { t, p, seed } of cases("hitori"))
    it(`${p.id} ${seed}`, () => {
      const d = gen(t, p, seed);
      const g = new Grid(d.sizes);
      expect(hitoriValid(g, d.values, (i) => d.shaded[i] === 1)).toBeNull();

      // elke zwarte cel van de oplossing is nodig: zijn getal staat dubbel in minstens één lijn
      const dupInLine = (i: number) => {
        for (let a = 0; a < g.D; a++) for (const c of g.lineThrough(i, a)) if (c !== i && d.values[c] === d.values[i]) return true;
        return false;
      };
      for (let i = 0; i < g.count; i++) if (d.shaded[i]) expect(dupInLine(i)).toBe(true);

      // precies één oplossing, en dat is de opgeslagen oplossing
      const r = solveHitori(g, d.values, 2, 400000);
      expect(r.count).toBe(1);
      expect([...r.sol!].map((s) => (s === 1 ? 1 : 0))).toEqual(d.shaded);

      // kleine puzzels: eigen telling (getallen zonder dubbele blijven wit)
      if (g.count <= 36) {
        const cand: number[] = [];
        for (let i = 0; i < g.count; i++) if (dupInLine(i)) cand.push(i);
        const black = new Uint8Array(g.count);
        let count = 0;
        const rec = (k: number) => {
          if (k === cand.length) {
            if (!hitoriValid(g, d.values, (i) => black[i] === 1)) count++;
            return;
          }
          rec(k + 1);
          const c = cand[k];
          if (!g.orth(c).some((m) => black[m])) {
            black[c] = 1;
            rec(k + 1);
            black[c] = 0;
          }
        };
        rec(0);
        expect(count).toBe(1);
      }

      // spel: begin niet opgelost, oplossing wel; een zwarte cel te weinig of te veel niet
      const game: any = t.create(gen(t, p, seed));
      expect(game.check().solved).toBe(false);
      game.st = Int8Array.from(d.shaded.map((s: number) => (s ? 1 : 0))); // wit hoeft niet gemarkeerd te zijn
      expect(game.check().solved).toBe(true);
      const firstBlack = d.shaded.indexOf(1);
      game.st[firstBlack] = 0;
      expect(game.check().solved).toBe(false);
      game.st[firstBlack] = 1;
      const nb = g.orth(firstBlack)[0];
      game.st[nb] = 1;
      const st = game.check();
      expect(st.solved).toBe(false);
      expect(st.errors).toContain(nb);

      // hints volgen leidt naar de oplossing, zonder ooit iets fouts te beweren
      const h: any = t.create(gen(t, p, seed));
      for (let k = 0; k < 4 * g.count && !h.check().solved; k++) {
        const hint = h.hint();
        expect(hint).not.toBeNull();
        expect(hint.text).not.toMatch(/klopt niet/);
        for (const c of hint.cells) {
          const toBlack = /zwart/.test(hint.text);
          expect(d.shaded[c] === 1).toBe(toBlack);
          h.st[c] = toBlack ? 1 : 2;
        }
      }
      expect(h.check().solved).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/* Zeeslag                                                             */
/* ------------------------------------------------------------------ */

function planeCounts(g: Grid, on: (i: number) => boolean): number[][] {
  return g.n.map((n, a) => Array.from({ length: n }, (_, k) => g.hyperplane(a, k).filter(on).length));
}

/** Samenhangende groepen (orthogonaal) van cellen waarvoor `on` geldt. */
function components(g: Grid, on: (i: number) => boolean): number[][] {
  const seen = new Uint8Array(g.count);
  const out: number[][] = [];
  for (let i = 0; i < g.count; i++) {
    if (!on(i) || seen[i]) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      for (const m of g.orth(c)) if (on(m) && !seen[m]) (seen[m] = 1), stack.push(m);
    }
    out.push(comp);
  }
  return out;
}

function fleetValid(g: Grid, fleet: number[], ship: (i: number) => boolean): string | null {
  const runs = components(g, ship);
  for (const run of runs) {
    let varying = 0;
    for (let a = 0; a < g.D; a++) if (new Set(run.map((c) => g.c(c, a))).size > 1) varying++;
    if (varying > 1) return "schip niet recht";
    const set = new Set(run);
    for (const c of run) for (const m of g.king(c)) if (ship(m) && !set.has(m)) return "schepen raken elkaar";
  }
  const a = runs.map((r) => r.length).sort((x, y) => x - y);
  const b = [...fleet].sort((x, y) => x - y);
  if (a.join() !== b.join()) return `vloot ${a.join()} ≠ ${b.join()}`;
  return null;
}

describe("logica zeeslag", () => {
  for (const { t, p, seed } of cases("battleships"))
    it(`${p.id} ${seed}`, () => {
      const d = gen(t, p, seed);
      const g = new Grid(d.sizes);
      const isShip = (i: number) => d.ships[i] === 1;
      expect(fleetValid(g, d.fleet, isShip)).toBeNull();
      expect(d.clues).toEqual(planeCounts(g, isShip));
      for (const [c, v] of d.reveal) expect(v).toBe(isShip(c) ? 1 : 2);

      const r = solveFleet(g, d.fleet, d.clues.flat(), new Map(d.reveal), 2, 3_000_000);
      expect(r.aborted).toBe(false);
      expect(r.count).toBe(1);
      expect([...r.sols[0]]).toEqual(d.ships);

      // 2D: eigen telling over alle roosters die bij de tellingen passen
      if (g.D === 2) {
        const [W, H] = g.n;
        const cur = new Uint8Array(g.count);
        const col = new Int32Array(W);
        const reveal = new Map<number, number>(d.reveal);
        let count = 0;
        const rec = (i: number, rowCount: number) => {
          if (count > 1) return;
          if (i === g.count) {
            if (!fleetValid(g, d.fleet, (c) => cur[c] === 1)) count++;
            return;
          }
          const x = i % W;
          const y = Math.floor(i / W);
          const rc = x === 0 ? 0 : rowCount;
          for (const v of [0, 1]) {
            if (reveal.has(i) && (reveal.get(i) === 1) !== (v === 1)) continue;
            if (v) {
              if (rc + 1 > d.clues[1][y] || col[x] + 1 > d.clues[0][x]) continue;
              // schuin raken kan nooit
              if (x > 0 && y > 0 && cur[i - W - 1]) continue;
              if (x < W - 1 && y > 0 && cur[i - W + 1]) continue;
            }
            const nrc = rc + v;
            if (x === W - 1 && nrc !== d.clues[1][y]) continue;
            if (y === H - 1 && col[x] + v !== d.clues[0][x]) continue;
            cur[i] = v;
            col[x] += v;
            rec(i + 1, nrc);
            col[x] -= v;
            cur[i] = 0;
          }
        };
        rec(0, 0);
        expect(count).toBe(1);
      }

      // spel
      const game: any = t.create(gen(t, p, seed));
      expect(game.check().solved).toBe(false);
      for (let i = 0; i < g.count; i++) if (!game.isFixed(i)) game.st[i] = isShip(i) ? 1 : 0; // water hoeft niet
      expect(game.check().solved).toBe(true);
      expect(game.check().errors.length).toBe(0);
      const free = [...Array(g.count).keys()].filter((i) => !game.isFixed(i));
      const s0 = free.find((i) => isShip(i));
      if (s0 !== undefined) {
        game.st[s0] = 0;
        expect(game.check().solved).toBe(false);
        game.st[s0] = 1;
      }
      const w0 = free.find((i) => !isShip(i))!;
      game.st[w0] = 1;
      expect(game.check().solved).toBe(false);

      // hints volgen: elke bewering klopt met de oplossing en je komt uit
      const h: any = t.create(gen(t, p, seed));
      for (let k = 0; k < 4 * g.count && !h.check().solved; k++) {
        const hint = h.hint();
        expect(hint).not.toBeNull();
        expect(hint.text).not.toMatch(/klopt niet/);
        expect(hint.cells.length).toBeGreaterThan(0);
        for (const c of hint.cells) {
          if (/water/.test(hint.text)) expect(isShip(c)).toBe(false);
          else if (/Verklapt/.test(hint.text)) expect(isShip(c)).toBe(true);
          h.st[c] = isShip(c) ? 1 : 2;
        }
      }
      expect(h.check().solved).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/* Tentje-boompje                                                      */
/* ------------------------------------------------------------------ */

/** Kan elke boom een eigen tent ernaast krijgen (1-op-1)? */
function matchable(g: Grid, trees: number[], tent: (i: number) => boolean): boolean {
  const tents = [...Array(g.count).keys()].filter(tent);
  if (tents.length !== trees.length) return false;
  const owner = new Map<number, number>(); // tent → boom
  const tryTree = (tr: number, seen: Set<number>): boolean => {
    for (const c of g.orth(tr)) {
      if (!tent(c) || seen.has(c)) continue;
      seen.add(c);
      if (!owner.has(c) || tryTree(owner.get(c)!, seen)) {
        owner.set(c, tr);
        return true;
      }
    }
    return false;
  };
  return trees.every((tr) => tryTree(tr, new Set()));
}

function tentsValid(g: Grid, trees: number[], tent: (i: number) => boolean): string | null {
  const isTree = new Set(trees);
  for (let i = 0; i < g.count; i++) {
    if (!tent(i)) continue;
    if (isTree.has(i)) return "tent op een boom";
    if (g.king(i).some((m) => tent(m))) return "tenten raken elkaar";
  }
  if (!matchable(g, trees, tent)) return "niet elke boom heeft een eigen tent";
  return null;
}

describe("logica tentje-boompje", () => {
  for (const { t, p, seed } of cases("tents"))
    it(`${p.id} ${seed}`, () => {
      const d = gen(t, p, seed);
      const g = new Grid(d.sizes);
      const isTent = (i: number) => d.tents[i] === 1;
      expect(new Set(d.trees).size).toBe(d.trees.length);
      expect(tentsValid(g, d.trees, isTent)).toBeNull();
      expect(d.clues).toEqual(planeCounts(g, isTent));
      for (const [c, v] of d.reveal) expect(v).toBe(isTent(c) ? 1 : 2);

      const r = solveTents(g, d.trees, d.clues.flat(), new Map(d.reveal), 2, 3_000_000);
      expect(r.aborted).toBe(false);
      expect(r.count).toBe(1);
      expect([...r.sols[0]]).toEqual(d.tents);

      // 2D: eigen telling
      if (g.D === 2) {
        const [W, H] = g.n;
        const isTree = new Set<number>(d.trees);
        const reveal = new Map<number, number>(d.reveal);
        const cur = new Uint8Array(g.count);
        const col = new Int32Array(W);
        let count = 0;
        const rec = (i: number, rowCount: number) => {
          if (count > 1) return;
          if (i === g.count) {
            if (!tentsValid(g, d.trees, (c) => cur[c] === 1)) count++;
            return;
          }
          const x = i % W;
          const y = Math.floor(i / W);
          const rc = x === 0 ? 0 : rowCount;
          for (const v of [0, 1]) {
            if (reveal.has(i) && (reveal.get(i) === 1) !== (v === 1)) continue;
            if (v) {
              if (isTree.has(i) || rc + 1 > d.clues[1][y] || col[x] + 1 > d.clues[0][x]) continue;
              if (!g.orth(i).some((m) => isTree.has(m))) continue;
              if ((x > 0 && cur[i - 1]) || (y > 0 && (cur[i - W] || (x > 0 && cur[i - W - 1]) || (x < W - 1 && cur[i - W + 1])))) continue;
            }
            const nrc = rc + v;
            if (x === W - 1 && nrc !== d.clues[1][y]) continue;
            if (y === H - 1 && col[x] + v !== d.clues[0][x]) continue;
            cur[i] = v;
            col[x] += v;
            rec(i + 1, nrc);
            col[x] -= v;
            cur[i] = 0;
          }
        };
        rec(0, 0);
        expect(count).toBe(1);
      }

      // spel
      const game: any = t.create(gen(t, p, seed));
      expect(game.check().solved).toBe(false);
      for (let i = 0; i < g.count; i++) if (!game.isFixed(i)) game.st[i] = isTent(i) ? 1 : 0;
      expect(game.check().solved).toBe(true);
      expect(game.check().errors.length).toBe(0);
      const t0 = [...Array(g.count).keys()].find((i) => !game.isFixed(i) && isTent(i));
      if (t0 !== undefined) {
        game.st[t0] = 0;
        expect(game.check().solved).toBe(false);
        game.st[t0] = 1;
      }

      // hints volgen
      const h: any = t.create(gen(t, p, seed));
      for (let k = 0; k < 4 * g.count && !h.check().solved; k++) {
        const hint = h.hint();
        expect(hint).not.toBeNull();
        expect(hint.text).not.toMatch(/klopt niet/);
        expect(hint.cells.length).toBeGreaterThan(0);
        for (const c of hint.cells) {
          if (/Verklapt/.test(hint.text)) expect(isTent(c)).toBe(true);
          else expect(isTent(c)).toBe(false);
          h.st[c] = isTent(c) ? 1 : 2;
        }
      }
      expect(h.check().solved).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/* Lichtjes                                                            */
/* ------------------------------------------------------------------ */

/** Dimensie van de kern van (buren + zelf) over GF(2): hoeveel 'onzichtbare' drukpatronen er zijn. */
function lightsNullity(g: Grid): number {
  const N = g.count;
  const rows: bigint[] = [];
  for (let i = 0; i < N; i++) {
    let r = 1n << BigInt(i);
    for (const j of g.orth(i)) r |= 1n << BigInt(j);
    rows.push(r);
  }
  let rank = 0;
  for (let c = 0; c < N; c++) {
    const bit = 1n << BigInt(c);
    const p = rows.findIndex((r, k) => k >= rank && r & bit);
    if (p < 0) continue;
    [rows[p], rows[rank]] = [rows[rank], rows[p]];
    for (let k = 0; k < N; k++) if (k !== rank && rows[k] & bit) rows[k] ^= rows[rank];
    rank++;
  }
  return N - rank;
}

describe("logica lichtjes", () => {
  for (const { t, p, seed } of cases("lightsout"))
    it(`${p.id} ${seed}`, () => {
      const d = gen(t, p, seed);
      const g = new Grid(d.sizes);
      // de oplosser zoekt alle combinaties van de kern af (tot 2^14): dan is 'minimaal' ook echt minimaal
      expect(lightsNullity(g)).toBeLessThanOrEqual(14);
      const sol = solveLights(g, Uint8Array.from(d.lights))!;
      expect(sol.length).toBe(d.par);
      expect(new Set(sol).size).toBe(sol.length);

      // kleine roosters: eigen zoektocht naar het minimum over alle drukpatronen
      if (g.count <= 16) {
        const masks = [...Array(g.count).keys()].map((i) => g.orth(i).reduce((m, j) => m | (1 << j), 1 << i));
        const target = d.lights.reduce((m: number, on: number, i: number) => (on ? m | (1 << i) : m), 0);
        let best = Infinity;
        for (let s = 0; s < 1 << g.count; s++) {
          let acc = 0;
          for (let i = 0; i < g.count; i++) if (s & (1 << i)) acc ^= masks[i];
          if (acc === target) best = Math.min(best, popcount(s));
        }
        expect(d.par).toBe(best);
      }

      // spel: de gevonden drukken zetten alles uit; een druk heft zichzelf op
      const game: any = t.create(gen(t, p, seed));
      expect(game.check().solved).toBe(false);
      game.act(0, 1);
      game.act(0, 1);
      expect([...game.lights]).toEqual(d.lights);
      // elke druk wisselt precies de cel en zijn directe buren
      const before = [...game.lights];
      const cell = Math.floor(g.count / 2);
      game.act(cell, 1);
      for (let i = 0; i < g.count; i++) expect(game.lights[i] !== before[i]).toBe(i === cell || g.orth(cell).includes(i));
      game.act(cell, 1);
      for (const c of sol) game.act(c, 1);
      expect(game.check().solved).toBe(true);

      // hints volgen kost precies het minimum
      const h: any = t.create(gen(t, p, seed));
      let presses = 0;
      while (!h.check().solved && presses < 200) {
        h.act(h.hint().cells[0], 1);
        presses++;
      }
      expect(presses).toBe(d.par);
    });
});

/* ------------------------------------------------------------------ */
/* Doolhof                                                             */
/* ------------------------------------------------------------------ */

describe("logica doolhof", () => {
  for (const { t, p, seed, fog } of cases("maze"))
    it(`${p.id} ${seed}${fog ? " doorsnede" : ""}`, () => {
      const d = gen(t, p, seed);
      const g = new Grid(d.sizes);
      const open = (i: number, a: number, dir: number) => !!(d.open[i] & (1 << (2 * a + (dir > 0 ? 1 : 0))));
      // doorgangen zijn wederzijds en wijzen nooit het rooster uit
      for (let i = 0; i < g.count; i++)
        for (let a = 0; a < g.D; a++)
          for (const dir of [-1, 1]) {
            const m = g.step(i, a, dir);
            if (m < 0) expect(open(i, a, dir)).toBe(false);
            else expect(open(i, a, dir)).toBe(open(m, a, -dir));
          }
      // eigen kortste-pad-berekening
      const dist = new Int32Array(g.count).fill(-1);
      dist[d.start] = 0;
      const q = [d.start];
      for (let hd = 0; hd < q.length; hd++)
        for (let a = 0; a < g.D; a++)
          for (const dir of [-1, 1]) {
            const m = g.step(q[hd], a, dir);
            if (m >= 0 && open(q[hd], a, dir) && dist[m] < 0) (dist[m] = dist[q[hd]] + 1), q.push(m);
          }
      expect(dist.every((x) => x >= 0)).toBe(true); // elke cel bereikbaar
      expect(d.goal).not.toBe(d.start);
      expect(d.par).toBe(dist[d.goal]);
      expect(d.par).toBe(Math.max(...dist)); // het doel is het verste punt

      const game: any = t.create(gen(t, p, seed), { fog });
      expect(game.check().solved).toBe(false);
      // tegen een muur lopen kan niet, en verandert niets
      for (let a = 0; a < g.D; a++)
        for (const dir of [-1, 1]) {
          const can = open(d.start, a, dir);
          expect(game.canMove(a, dir)).toBe(can);
          if (!can) expect(game.move(a, dir)).toBe(false);
        }
      expect(game.pos).toBe(d.start);
      // hints volgen is de kortste route; de voortgang blijft tussen 0 en 1
      let steps = 0;
      while (!game.check().solved && steps < 5000) {
        const st = game.check();
        expect(st.progress).toBeGreaterThanOrEqual(0);
        expect(st.progress).toBeLessThanOrEqual(1);
        expect(game.act(game.hint().cells[0], 1)).toBe(true);
        steps++;
      }
      expect(steps).toBe(d.par);
      // doorsnede-modus: het doel en de eigen laag zijn nooit verborgen
      if (fog) {
        const f: any = t.create(gen(t, p, seed), { fog: true });
        expect(f.visual(d.goal).hidden).toBeFalsy();
        expect(f.visual(d.start).hidden).toBeFalsy();
      }
    });

  it("voortgang blijft binnen 0–100% op elke plek in het doolhof", () => {
    for (const p of TYPES.maze.presets) {
      const d = gen(TYPES.maze, p, "L1");
      const game: any = TYPES.maze.create(gen(TYPES.maze, p, "L1"));
      for (let i = 0; i < d.open.length; i++) {
        game.pos = i;
        const pr = game.check().progress;
        expect(pr).toBeGreaterThanOrEqual(0);
        expect(pr).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Kamertje verhuren                                                   */
/* ------------------------------------------------------------------ */

describe("logica kamertje verhuren", () => {
  for (const preset of DB_PRESETS)
    it(preset.id, () => {
      const n = preset.dots;
      const D = n.length;
      const total = n.reduce((a, b) => a * b, 1);
      const game = new DotsBoxes(n);
      // aantallen volgen uit het rooster
      let edges = 0;
      for (let a = 0; a < D; a++) edges += (total / n[a]) * (n[a] - 1);
      let squares = 0;
      for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) squares += (total / (n[a] * n[b])) * (n[a] - 1) * (n[b] - 1);
      expect(game.edges.length).toBe(edges);
      expect(game.squares.length).toBe(squares);
      for (const s of game.squares) expect(new Set(s.edges).size).toBe(4);
      if (preset.id === "4d-2") {
        expect([total, edges, squares]).toEqual([16, 32, 24]);
        for (const list of game.edgeSquares) expect(list.length).toBe(3);
      }

      // hele partijen: computer tegen computer, alle niveaus
      for (const level of [1, 2, 3] as const) {
        const g = new DotsBoxes(n);
        const rng = new Rng("duel:" + preset.id + level);
        let guard = 0;
        while (!g.over && guard++ < 10000) {
          const turn = g.turn;
          const sidesBefore = g.squares.map((_, k) => g.sides(k));
          const e = g.aiMove(level, rng);
          expect(e).toBeGreaterThanOrEqual(0);
          expect(g.drawn[e]).toBe(0);
          // vanaf 'normaal' laat de computer nooit een kamer met drie wanden liggen
          if (level >= 2 && sidesBefore.some((s) => s === 3)) expect(g.edgeSquares[e].some((s) => sidesBefore[s] === 3)).toBe(true);
          const done = g.play(e);
          const closed = g.edgeSquares[e].filter((s) => sidesBefore[s] === 3).length;
          expect(done).toBe(closed);
          expect(g.turn).toBe(done ? turn : turn === 1 ? 2 : 1); // kamer gesloten → nog een keer
          expect(g.play(e)).toBe(-1); // dezelfde streep kan niet nog eens
        }
        expect(g.over).toBe(true);
        expect(g.score[1] + g.score[2]).toBe(squares);
        expect([...g.owner].every((o) => o === 1 || o === 2)).toBe(true);
      }
    });
});

/* ------------------------------------------------------------------ */
/* Algemeen: opslaan en terugzetten, voor alle soorten                 */
/* ------------------------------------------------------------------ */

describe("toestand opslaan en terugzetten", () => {
  for (const t of ALL_TYPES)
    it(t.id, () => {
      const p = t.presets[0];
      const a: any = t.create(gen(t, p, "L1"));
      const b: any = t.create(gen(t, p, "L1"));
      // doe een paar zetten via de gewone invoer
      const g = a.grid as Grid;
      for (let i = 0; i < g.count && i < 12; i++) {
        if (a.isFixed?.(i)) continue;
        if (a.input === "number") a.enter(i, 1, false);
        else if (a.input === "move") a.act(a.hint().cells[0], 1);
        else a.act(i, 1);
      }
      const snap = JSON.parse(JSON.stringify(a.getState()));
      b.setState(snap);
      expect(JSON.stringify(b.getState())).toBe(JSON.stringify(a.getState()));
      expect(b.check().solved).toBe(a.check().solved);
      expect(b.check().errors.slice().sort()).toEqual(a.check().errors.slice().sort());
    });
});
