/** Indelingen van de ruimteweergave (zonder three.js, zodat de speelpagina ze direct kan gebruiken). */
export type Layout = "flat" | "cube" | "layers" | "slices" | "boards" | "tesseract";

export const LAYOUT_LABEL: Record<Layout, string> = {
  flat: "Vlak",
  cube: "Kubus",
  layers: "Lagen",
  slices: "Plakjes",
  boards: "Borden",
  tesseract: "Tesseract",
};

export function layoutsFor(D: number): Layout[] {
  if (D <= 2) return ["flat"];
  if (D === 3) return ["cube", "layers"];
  return ["tesseract", "slices", "boards"];
}
