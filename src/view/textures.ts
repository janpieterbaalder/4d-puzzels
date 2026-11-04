import * as THREE from "three";
import type { IconId } from "../puzzles/types";
import { iconSvg } from "./icons";

const cache = new Map<string, THREE.Texture>();
let onUpdate: (() => void) | null = null;

/** Wordt aangeroepen als een asynchroon geladen icoon klaar is (om opnieuw te renderen). */
export function setTextureUpdateHook(fn: (() => void) | null) {
  onUpdate = fn;
}

function canvasTex(draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Labels die opnieuw getekend moeten worden zodra het lettertype (Outfit) geladen is. */
const labelDraws: { tex: THREE.CanvasTexture; draw: () => void }[] = [];
let fontsReady = typeof document === "undefined" || !document.fonts;
if (!fontsReady) {
  Promise.all(["600", "700", "800"].map((w) => document.fonts.load(`${w} 64px Outfit`)))
    .catch(() => undefined)
    .then(() => {
      fontsReady = true;
      for (const l of labelDraws) l.draw();
      labelDraws.length = 0;
      onUpdate?.();
    });
}

/** Licht of donker? (voor de juiste rand rond het cijfer) */
function isDark(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 110;
}

/**
 * Cijfer als textuur voor een sprite. Scherp (256 px), één tekenslag zonder losse omlijning
 * (een omlijning die net anders valt dan de vulling gaf op iOS een 'dubbel' cijfer).
 * Lichte cijfers krijgen een zachte donkere schaduw, donkere cijfers een dunne lichte rand.
 */
export function labelTexture(text: string, color: string, weight = 700): THREE.Texture {
  const key = `t:${text}:${color}:${weight}`;
  let t = cache.get(key) as THREE.CanvasTexture | undefined;
  if (!t) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const draw = () => {
      const s = size;
      ctx.clearRect(0, 0, s, s);
      ctx.font = `${weight} ${text.length > 1 ? s * 0.5 : s * 0.62}px Outfit, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const x = s / 2;
      const y = s / 2 + s * 0.04;
      const dark = isDark(color);
      ctx.save();
      if (dark) {
        // dunne lichte rand, precies op de vulling (zelfde aanroep, zelfde lettertype)
        ctx.lineJoin = "round";
        ctx.lineWidth = s * 0.03;
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.strokeText(text, x, y);
      } else {
        ctx.shadowColor = "rgba(4,5,14,0.65)";
        ctx.shadowBlur = s * 0.05;
        ctx.shadowOffsetY = s * 0.012;
      }
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      ctx.restore();
      tex.needsUpdate = true;
    };
    draw();
    if (!fontsReady) labelDraws.push({ tex, draw });
    t = tex;
    cache.set(key, t);
  }
  return t;
}

export function iconTexture(id: IconId, color = "#ffffff"): THREE.Texture {
  const key = `i:${id}:${color}`;
  let t = cache.get(key);
  if (!t) {
    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      tex.needsUpdate = true;
      onUpdate?.();
    };
    const svg = iconSvg(id, color).replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    t = tex;
    cache.set(key, t);
  }
  return t;
}

export function haloTexture(): THREE.Texture {
  const key = "halo";
  let t = cache.get(key);
  if (!t) {
    t = canvasTex((ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,.55)");
      g.addColorStop(0.6, "rgba(255,255,255,.12)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 128);
    cache.set(key, t);
  }
  return t;
}

export function ringTexture(): THREE.Texture {
  const key = "ring";
  let t = cache.get(key);
  if (!t) {
    t = canvasTex((ctx, s) => {
      ctx.strokeStyle = "rgba(255,255,255,1)";
      ctx.lineWidth = s * 0.07;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    });
    cache.set(key, t);
  }
  return t;
}
