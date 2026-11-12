/**
 * Kern: rooster, toevalsgenerator, opslag en de opbouw van de cursus.
 * De puzzeltests leunen op deze onderdelen; hier staan ze los getest.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Grid } from "../src/core/grid";
import { hashString, Rng } from "../src/core/rng";
import { store } from "../src/core/store";
import { ALL_STEPS, CHAPTERS, nextStep, stepById } from "../src/course/curriculum";
import { LESSON_BY_ID } from "../src/course/lessons";
import { DB_PRESETS } from "../src/games/dotsboxes";
import { TYPES } from "../src/puzzles/registry";
import { colorRegions } from "../src/puzzles/tectonic";

const SHAPES = [[5], [4, 4], [3, 5], [3, 3, 3], [4, 3, 2], [3, 3, 3, 3], [2, 3, 2, 3]];

describe("rooster", () => {
  for (const n of SHAPES) {
    const g = new Grid(n);
    const name = n.join("×");

    it(`${name}: index en coördinaat zijn elkaars omgekeerde`, () => {
      expect(g.count).toBe(n.reduce((a, b) => a * b, 1));
      for (let i = 0; i < g.count; i++) {
        const c = g.coord(i);
        expect(g.index(c)).toBe(i);
        expect(g.inside(c)).toBe(true);
        for (let a = 0; a < g.D; a++) expect(g.c(i, a)).toBe(c[a]);
      }
    });

    it(`${name}: directe buren verschillen in precies één coördinaat met 1`, () => {
      for (let i = 0; i < g.count; i++) {
        const ci = g.coord(i);
        const expected = new Set<number>();
        for (let j = 0; j < g.count; j++) {
          const cj = g.coord(j);
          const dist = cj.reduce((s, v, a) => s + Math.abs(v - ci[a]), 0);
          if (dist === 1) expected.add(j);
        }
        expect(new Set(g.orth(i))).toEqual(expected);
        for (const j of g.orth(i)) expect(g.axisBetween(i, j)).toBeGreaterThanOrEqual(0);
      }
    });

    it(`${name}: koningsburen verschillen in elke coördinaat hoogstens 1`, () => {
      for (let i = 0; i < g.count; i++) {
        const ci = g.coord(i);
        const expected = new Set<number>();
        for (let j = 0; j < g.count; j++) {
          if (j === i) continue;
          const cj = g.coord(j);
          if (cj.every((v, a) => Math.abs(v - ci[a]) <= 1)) expected.add(j);
        }
        expect(new Set(g.king(i))).toEqual(expected);
      }
    });

    it(`${name}: lijnen, hypervlakken en vlakken`, () => {
      // aantal lijnen: per as het product van de andere afmetingen
      const total = n.reduce((s, _, a) => s + g.count / n[a], 0);
      expect(g.lines().length).toBe(total);
      for (let i = 0; i < g.count; i++) {
        expect(g.linesOf(i).length).toBe(g.D);
        for (let a = 0; a < g.D; a++) {
          const line = g.lineThrough(i, a);
          expect(line.length).toBe(n[a]);
          expect(line).toContain(i);
          for (const j of line) for (let b = 0; b < g.D; b++) if (b !== a) expect(g.c(j, b)).toBe(g.c(i, b));
        }
      }
      for (let a = 0; a < g.D; a++)
        for (let k = 0; k < n[a]; k++) {
          const h = g.hyperplane(a, k);
          expect(h.length).toBe(g.count / n[a]);
          for (const j of h) expect(g.c(j, a)).toBe(k);
        }
      if (g.D >= 2) {
        const p = g.plane(0, 0, 1);
        expect(p.length).toBe(n[0] * n[1]);
        expect(new Set(p).size).toBe(p.length);
      }
    });

    it(`${name}: stap over de rand geeft -1`, () => {
      for (let a = 0; a < g.D; a++) {
        expect(g.step(0, a, -1)).toBe(-1);
        expect(g.step(g.count - 1, a, 1)).toBe(-1);
        if (n[a] > 1) expect(g.c(g.step(0, a, 1), a)).toBe(1);
      }
    });
  }

  it("binnenste cel: 2·D directe buren en 3^D − 1 koningsburen", () => {
    for (let D = 1; D <= 4; D++) {
      const g = new Grid(new Array(D).fill(3));
      const mid = g.index(new Array(D).fill(1));
      expect(g.orth(mid).length).toBe(2 * D);
      expect(g.king(mid).length).toBe(3 ** D - 1);
    }
  });

  it("samenhang", () => {
    const g = new Grid([3, 3, 3]);
    expect(g.connected(() => true)).toBe(true);
    // de middelste laag weglaten splitst de kubus in twee losse lagen
    expect(g.connected((i) => g.c(i, 2) !== 1)).toBe(false);
    // alleen diagonaal verbonden telt niet
    const flat = new Grid([2, 2]);
    expect(flat.connected((i) => i === 0 || i === 3)).toBe(false);
    expect(flat.connected((i) => i !== 3)).toBe(true);
  });
});

describe("toevalsgenerator", () => {
  it("dezelfde seed geeft dezelfde reeks, een andere seed een andere", () => {
    const seq = (seed: string) => {
      const r = new Rng(seed);
      return Array.from({ length: 50 }, () => r.next());
    };
    expect(seq("abc")).toEqual(seq("abc"));
    expect(seq("abc")).not.toEqual(seq("abd"));
  });

  it("waarden blijven binnen hun bereik", () => {
    const r = new Rng("bereik");
    for (let k = 0; k < 2000; k++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const i = r.int(7);
      expect(Number.isInteger(i) && i >= 0 && i < 7).toBe(true);
    }
  });

  it("int raakt elke waarde en is ongeveer gelijk verdeeld", () => {
    const r = new Rng("verdeling");
    const hits = new Array(6).fill(0);
    for (let k = 0; k < 6000; k++) hits[r.int(6)]++;
    for (const h of hits) expect(h).toBeGreaterThan(800); // verwacht 1000
  });

  it("een aftakking is reproduceerbaar en hangt af van het label", () => {
    const a = new Rng("s").fork("x").next();
    expect(new Rng("s").fork("x").next()).toBe(a);
    expect(new Rng("s").fork("y").next()).not.toBe(a);
  });

  it("hashString is stabiel", () => {
    expect(hashString("puzzel")).toBe(hashString("puzzel"));
    expect(hashString("puzzel")).not.toBe(hashString("puzzel4"));
  });
});

describe("gebieden kleuren (Tectonic)", () => {
  it("aangrenzende gebieden krijgen nooit dezelfde kleur", () => {
    const r = new Rng("kleur");
    for (let round = 0; round < 40; round++) {
      // willekeurige verdeling van een 3D-rooster in gebieden van 1 tot 5 cellen
      const g = new Grid([4, 4, 3]);
      const region = new Array(g.count).fill(-1);
      const groups: number[][] = [];
      for (let i = 0; i < g.count; i++) {
        if (region[i] >= 0) continue;
        const cells = [i];
        region[i] = groups.length;
        const want = 1 + r.int(5);
        while (cells.length < want) {
          const free = cells.flatMap((c) => g.orth(c)).filter((j) => region[j] < 0);
          if (!free.length) break;
          const j = free[r.int(free.length)];
          region[j] = groups.length;
          cells.push(j);
        }
        groups.push(cells);
      }
      const adj = groups.map(() => new Set<number>());
      for (let i = 0; i < g.count; i++) for (const j of g.orth(i)) if (region[i] !== region[j]) adj[region[i]].add(region[j]);
      const col = colorRegions(groups, adj);
      expect(col.length).toBe(groups.length);
      for (let a = 0; a < groups.length; a++) {
        expect(col[a]).toBeGreaterThanOrEqual(0);
        for (const b of adj[a]) expect(col[a], `gebied ${a} en ${b}`).not.toBe(col[b]);
      }
    }
  });
});

describe("cursus", () => {
  it("10 hoofdstukken en 48 stappen, zoals de README zegt", () => {
    expect(CHAPTERS.length).toBe(10);
    expect(ALL_STEPS.length).toBe(48);
    expect(CHAPTERS.map((c) => c.n)).toEqual(CHAPTERS.map((_, i) => i + 1));
  });

  it("elke stap heeft een eigen id en verwijst naar iets wat bestaat", () => {
    const ids = ALL_STEPS.map((s) => s.step.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length);
    for (const { step } of ALL_STEPS) {
      if (step.kind === "lesson") expect(LESSON_BY_ID[step.lesson], step.id).toBeTruthy();
      else if (step.kind === "duel") expect(DB_PRESETS.some((p) => p.id === step.preset), step.id).toBe(true);
      else {
        const type = TYPES[step.type];
        expect(type, step.id).toBeTruthy();
        expect(type.presets.some((p) => p.id === step.preset), step.id).toBe(true);
        expect(step.seed.startsWith("c-"), step.id).toBe(true);
      }
    }
  });

  it("volgende stap loopt de hele cursus door", () => {
    let id: string | undefined = ALL_STEPS[0].step.id;
    const seen: string[] = [];
    while (id) {
      seen.push(id);
      expect(stepById(id)?.step.id).toBe(id);
      id = nextStep(id)?.step.id;
      expect(seen.length).toBeLessThanOrEqual(ALL_STEPS.length);
    }
    expect(seen).toEqual(ALL_STEPS.map((s) => s.step.id));
  });
});

describe("opslag", () => {
  /** Eenvoudige localStorage voor de test; de sleutels zijn als eigenschappen op te vragen, net als in de browser. */
  function fakeStorage(): Storage {
    const target: Record<string, unknown> = {};
    const api: Record<string, unknown> = {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(target, k) ? (target[k] as string) : null),
      setItem: (k: string, v: string) => void (target[k] = String(v)),
      removeItem: (k: string) => void delete target[k],
      clear: () => {
        for (const k of Object.keys(target)) delete target[k];
      },
    };
    return new Proxy(target, {
      get: (t, k: string) => (k in api ? api[k] : t[k]),
    }) as unknown as Storage;
  }

  beforeEach(() => {
    (globalThis as any).localStorage = fakeStorage();
    (globalThis as any).sessionStorage = fakeStorage();
  });

  it("instellingen: standaardwaarden en wijzigen", () => {
    const before = store.settings();
    store.setSettings({ sound: !before.sound });
    expect(store.settings().sound).toBe(!before.sound);
    expect(store.settings().showErrors).toBe(before.showErrors);
  });

  it("voortgang: stap afvinken en oplossingen tellen", () => {
    store.markDone("lo2a", 42);
    expect(store.doneSteps().lo2a.t).toBe(42);
    store.addSolved("sudoku", 3);
    store.addSolved("sudoku", 3);
    expect(Object.values(store.solvedCount()).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("lopende puzzel: opslaan, laden met kenmerk, wissen", () => {
    store.saveGame("sudoku|2d-4|s1", { v: [1, 2] }, 12, "sig1");
    expect(store.loadGame("sudoku|2d-4|s1")).toMatchObject({ s: { v: [1, 2] }, t: 12, sig: "sig1" });
    store.clearGame("sudoku|2d-4|s1");
    expect(store.loadGame("sudoku|2d-4|s1")).toBeNull();
  });

  it("beschadigde opslag geeft de standaardwaarde in plaats van een fout", () => {
    localStorage.setItem("p4:settings", "{geen json");
    expect(() => store.settings()).not.toThrow();
    expect(typeof store.settings().sound).toBe("boolean");
  });

  it("back-up: alles eruit en er weer in", () => {
    store.setSettings({ sound: false });
    store.markDone("lo2a", 5);
    localStorage.setItem("andere-app", "blijft staan");
    const backup = store.exportAll();
    expect(Object.keys(backup).every((k) => k.startsWith("p4:"))).toBe(true);

    store.resetAll();
    expect(store.doneSteps()).toEqual({});
    expect(localStorage.getItem("andere-app")).toBe("blijft staan");

    expect(store.importAll(backup)).toBe(Object.keys(backup).length);
    expect(store.doneSteps().lo2a.t).toBe(5);
    expect(store.settings().sound).toBe(false);
  });

  it("back-up terugzetten weigert onzin en laat de bestaande voortgang dan staan", () => {
    store.markDone("lo2a", 5);
    for (const bad of [null, 7, "tekst", [], {}, { "ander:sleutel": "1" }, { "p4:done": "{kapot" }]) {
      expect(store.importAll(bad), JSON.stringify(bad)).toBe(-1);
    }
    expect(store.doneSteps().lo2a.t).toBe(5);
  });
});
