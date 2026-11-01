/// <reference lib="webworker" />
import { presetById } from "../puzzles/registry";

self.onmessage = (e: MessageEvent) => {
  const { id, type, preset, seed } = e.data as { id: number; type: string; preset: string; seed: string };
  try {
    const { type: t, preset: p } = presetById(type, preset);
    const data = t.generate(p, seed);
    (self as unknown as Worker).postMessage({ id, data });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
