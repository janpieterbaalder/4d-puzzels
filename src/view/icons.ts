import type { IconId } from "../puzzles/types";

/** SVG-iconen (viewBox 0 0 100 100). `currentColor` wordt in de 3D-weergave vervangen. */
export const ICON_SVG: Record<IconId, string> = {
  tree: `<svg viewBox="0 0 100 100"><path d="M50 8 L74 40 H62 L80 64 H58 V78 H42 V64 H20 L38 40 H26 Z" fill="#57e39b"/><path d="M50 8 L74 40 H62 L80 64 H50 Z" fill="#2fb874"/><rect x="44" y="64" width="12" height="20" rx="2" fill="#a0744d"/></svg>`,
  tent: `<svg viewBox="0 0 100 100"><path d="M50 14 L88 84 H12 Z" fill="#ff9a4a"/><path d="M50 14 L88 84 H50 Z" fill="#e2702a"/><path d="M50 46 L64 84 H36 Z" fill="#3a1d0b"/><path d="M50 8 V18" stroke="#ffd2a8" stroke-width="5" stroke-linecap="round"/></svg>`,
  grass: `<svg viewBox="0 0 100 100" fill="none" stroke="#57e39b" stroke-width="6" stroke-linecap="round" opacity=".75"><path d="M30 70 Q32 54 26 44M38 70 Q40 52 46 42M62 70 Q62 56 56 48M70 70 Q72 54 78 46"/></svg>`,
  ship: `<svg viewBox="0 0 100 100"><rect x="12" y="24" width="76" height="52" rx="26" fill="#cfd8ea"/><rect x="12" y="24" width="76" height="22" rx="11" fill="#ffffff" opacity=".55"/><circle cx="50" cy="52" r="8" fill="#5b6a86"/></svg>`,
  water: `<svg viewBox="0 0 100 100" fill="none" stroke="#3fb6ff" stroke-width="6" stroke-linecap="round" opacity=".8"><path d="M18 42 q8 -8 16 0 t16 0 t16 0 t16 0"/><path d="M18 62 q8 -8 16 0 t16 0 t16 0 t16 0"/></svg>`,
  player: `<svg viewBox="0 0 100 100"><defs><radialGradient id="pg" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#9ff3ff"/><stop offset="1" stop-color="#1aa7d6"/></radialGradient></defs><circle cx="50" cy="50" r="34" fill="url(#pg)"/><circle cx="50" cy="50" r="42" fill="none" stroke="#4fe3ff" stroke-width="4" opacity=".6"/></svg>`,
  goal: `<svg viewBox="0 0 100 100"><path d="M50 8 L61 37 L92 38 L67 57 L76 88 L50 70 L24 88 L33 57 L8 38 L39 37 Z" fill="#ffcf5c" stroke="#fff3c4" stroke-width="3" stroke-linejoin="round"/></svg>`,
  dot: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="12" fill="currentColor"/></svg>`,
  cross: `<svg viewBox="0 0 100 100" stroke="currentColor" stroke-width="10" stroke-linecap="round"><path d="M30 30 L70 70 M70 30 L30 70"/></svg>`,
  circle: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" stroke-width="7" opacity=".8"/></svg>`,
  bulb: `<svg viewBox="0 0 100 100"><defs><radialGradient id="bg" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#ffb547" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="44" fill="url(#bg)"/></svg>`,
};

export function iconSvg(id: IconId, color = "currentColor"): string {
  return ICON_SVG[id].replace(/currentColor/g, color);
}
