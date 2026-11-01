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

export function labelTexture(text: string, color: string, weight = 700): THREE.Texture {
  const key = `t:${text}:${color}:${weight}`;
  let t = cache.get(key);
  if (!t) {
    t = canvasTex((ctx, s) => {
      ctx.font = `${weight} ${text.length > 1 ? s * 0.5 : s * 0.62}px Outfit, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = s * 0.06;
      ctx.strokeStyle = "rgba(5,6,14,.55)";
      ctx.strokeText(text, s / 2, s / 2 + s * 0.04);
      ctx.fillStyle = color;
      ctx.fillText(text, s / 2, s / 2 + s * 0.04);
    });
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
