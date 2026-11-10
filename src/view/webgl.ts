let cached: boolean | null = null;

/**
 * Kan deze browser WebGL? Eén keer getest en onthouden; de test-context wordt direct vrijgegeven
 * (browsers staan maar een beperkt aantal WebGL-contexten tegelijk toe).
 */
export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    cached = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
