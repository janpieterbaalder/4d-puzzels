import { store } from "../core/store";
import { presetById } from "../puzzles/registry";
import type { PuzzleData } from "../puzzles/types";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { res: (d: PuzzleData) => void; rej: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, data, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.rej(new Error(error));
      else p.res(data);
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.rej(new Error("worker"));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Bouwen duurt normaal hooguit een paar seconden; na deze tijd geven we het op. */
const TIMEOUT_MS = 45_000;

export class GenerateTimeout extends Error {
  constructor() {
    super("Het bouwen van deze puzzel duurde te lang.");
  }
}

/** Genereer een puzzel in een Web Worker (met cache), met terugval op de hoofdthread. */
export async function generatePuzzle(type: string, preset: string, seed: string): Promise<PuzzleData> {
  const key = `${type}:${preset}:${seed}`;
  const cached = store.cacheGet<PuzzleData>(key);
  if (cached) return cached;
  const w = getWorker();
  let data: PuzzleData;
  if (w) {
    try {
      data = await new Promise<PuzzleData>((res, rej) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          // de worker zit vast: stop hem, zodat een volgende puzzel met een verse worker begint
          pending.delete(id);
          worker?.terminate();
          worker = null;
          for (const p of pending.values()) p.rej(new Error("worker"));
          pending.clear();
          rej(new GenerateTimeout());
        }, TIMEOUT_MS);
        pending.set(id, {
          res: (d) => (clearTimeout(timer), res(d)),
          rej: (e) => (clearTimeout(timer), rej(e)),
        });
        w.postMessage({ id, type, preset, seed });
      });
    } catch (e) {
      // een time-out niet op de hoofdthread overdoen: dan bevriest de hele pagina
      if (e instanceof GenerateTimeout) throw e;
      const { type: t, preset: p } = presetById(type, preset);
      data = t.generate(p, seed);
    }
  } else {
    const { type: t, preset: p } = presetById(type, preset);
    data = t.generate(p, seed);
  }
  store.cacheSet(key, data);
  return data;
}
