import { LightsOut } from "./lightsout";
import { Maze } from "./maze";
import { Binary } from "./binary";
import { Sudoku } from "./sudoku";
import { Futoshiki } from "./futoshiki";
import { Tectonic } from "./tectonic";
import { Hitori } from "./hitori";
import { Battleships } from "./battleships";
import { Tents } from "./tents";
import type { PuzzleType } from "./types";

export const ALL_TYPES: PuzzleType[] = [LightsOut, Maze, Binary, Sudoku, Futoshiki, Tectonic, Hitori, Battleships, Tents];

export const TYPES: Record<string, PuzzleType> = Object.fromEntries(ALL_TYPES.map((t) => [t.id, t]));

export function presetById(typeId: string, presetId: string) {
  const t = TYPES[typeId];
  const p = t?.presets.find((x) => x.id === presetId);
  if (!t || !p) throw new Error(`onbekende puzzel ${typeId}/${presetId}`);
  return { type: t, preset: p };
}
