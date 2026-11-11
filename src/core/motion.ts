/** Heeft de gebruiker 'minder beweging' aanstaan in het besturingssysteem? */
export function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
