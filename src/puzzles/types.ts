import type { Grid } from "../core/grid";

export type IconId =
  | "tree"
  | "tent"
  | "grass"
  | "ship"
  | "water"
  | "player"
  | "goal"
  | "dot"
  | "cross"
  | "circle"
  | "bulb";

/** Hoe een cel getoond wordt; gedeeld door de platte en de ruimtelijke weergave. */
export interface CellVisual {
  text?: string;
  given?: boolean;
  /** CSS-kleur van de vulling; leeg = glas. */
  fill?: string;
  tone?: "glass" | "solid" | "dark" | "glow";
  icon?: IconId;
  iconColor?: string;
  notes?: number[];
  error?: boolean;
  dim?: boolean;
  hidden?: boolean;
  region?: number;
  trail?: boolean;
  /** Extra markering (bijv. hint-doel). */
  pulse?: boolean;
}

export interface EdgeMark {
  /** a < b */
  a: number;
  b: number;
  axis: number;
}

export interface HyperClue {
  axis: number;
  k: number;
  target: number;
  current: number;
  /** Aantal nog onbesliste cellen (voor 'klaar'-weergave). */
  open: number;
}

export interface Status {
  solved: boolean;
  errors: number[];
  progress: number;
  info?: string;
}

export interface Hint {
  cells: number[];
  text: string;
}

export interface SidePanel {
  title: string;
  items: { label: string; value: string; done?: boolean; color?: string }[];
}

export type InputKind = "cycle" | "number" | "press" | "move";

export interface PuzzleGame {
  readonly grid: Grid;
  readonly input: InputKind;
  /** Symbolen voor het toetsenblok (waarde 1..k). */
  readonly symbols?: string[];
  visual(i: number): CellVisual;
  act?(i: number, dir: 1 | -1): boolean;
  enter?(i: number, v: number, pencil: boolean): boolean;
  move?(axis: number, dir: number): boolean;
  getState(): unknown;
  setState(s: unknown): void;
  check(): Status;
  hint?(): Hint | null;
  edgeMarks?(): EdgeMark[];
  /** Open doorgangen per cel (bit 2a = −, bit 2a+1 = +). */
  walls?(i: number): number;
  links?(): [number, number][];
  clues?(): HyperClue[];
  panel?(): SidePanel | null;
  /** Cellen die oplichten als cel i gekozen is (groepen/buren). */
  peers?(i: number): number[];
  focus?(): number;
  /** Doorsnede-modus: alleen het 2D-vlak van de focus is zichtbaar. */
  fog?: boolean;
  /** Cellen met een vaste inhoud (niet aanklikbaar). */
  isFixed?(i: number): boolean;
  /** Region-id per cel (Tectonic). */
  regionOf?(i: number): number;
  /** Groepen (blokken) in het xy-vlak voor dikke randen in het platte bord. */
  boxOf?(i: number): number;
  /** Blok van cel i in het vlak (a, b), of −1 als dat vlak geen blokken heeft (sudoku, voor andere sneden van het bord). */
  boxOfPlane?(i: number, a: number, b: number): number;
  /** Aantal zetten (voor statistiek). */
  moves?(): number;
}

export interface Preset {
  id: string;
  label: string;
  sizes: number[];
  level: 1 | 2 | 3;
  [k: string]: unknown;
}

export interface PuzzleData {
  type: string;
  preset: string;
  seed: string;
  sizes: number[];
  [k: string]: unknown;
}

export interface RuleText {
  goal: string;
  rules: string[];
  /** Wat verandert er in deze dimensie? */
  dimNote?: string;
}

export interface PuzzleType {
  id: string;
  name: string;
  origin: string;
  tagline: string;
  accent: string;
  icon: string;
  presets: Preset[];
  rules(dim: number, preset?: Preset): RuleText;
  generate(preset: Preset, seed: string): PuzzleData;
  create(data: PuzzleData, opts?: { fog?: boolean }): PuzzleGame;
}

export function dimsOf(t: PuzzleType): number[] {
  return [...new Set(t.presets.map((p) => p.sizes.length))].sort();
}

export function presetsFor(t: PuzzleType, dim: number): Preset[] {
  return t.presets.filter((p) => p.sizes.length === dim);
}

export function sizeLabel(sizes: number[]): string {
  return sizes.join(" × ");
}
