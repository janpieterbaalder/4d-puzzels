/** 4D-wiskunde: rotaties in vlakken en perspectivische projectie naar 3D. */
export type Vec4 = [number, number, number, number];

export interface Rot4 {
  xy: number;
  xz: number;
  yz: number;
  xw: number;
  yw: number;
  zw: number;
}

export const ZERO_ROT: Rot4 = { xy: 0, xz: 0, yz: 0, xw: 0, yw: 0, zw: 0 };

const PLANES: [keyof Rot4, number, number][] = [
  ["xy", 0, 1],
  ["xz", 0, 2],
  ["yz", 1, 2],
  ["xw", 0, 3],
  ["yw", 1, 3],
  ["zw", 2, 3],
];

export function rotate4(p: Vec4, r: Rot4, out: Vec4 = [0, 0, 0, 0]): Vec4 {
  out[0] = p[0];
  out[1] = p[1];
  out[2] = p[2];
  out[3] = p[3];
  for (const [k, a, b] of PLANES) {
    const t = r[k];
    if (!t) continue;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const u = out[a];
    const v = out[b];
    out[a] = c * u - s * v;
    out[b] = s * u + c * v;
  }
  return out;
}

/** Perspectief vanuit de w-richting: verder weg in w ⇒ kleiner. Geeft schaalfactor terug. */
export function project4(p: Vec4, dist: number, out: [number, number, number]): number {
  const k = dist / (dist - p[3]);
  out[0] = p[0] * k;
  out[1] = p[1] * k;
  out[2] = p[2] * k;
  return k;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const AXIS_COLORS = ["#ff7a8a", "#5ef2b4", "#6cb8ff", "#d77bff"];
export const AXIS_LABELS = ["x", "y", "z", "w"];
export const AXIS_WORDS = ["breedte", "hoogte", "diepte", "ana–kata"];
