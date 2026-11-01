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
        pending.set(id, { res, rej });
        w.postMessage({ id, type, preset, seed });
      });
    } catch {
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
