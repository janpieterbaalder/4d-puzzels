import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Grid } from "../core/grid";
import { reducedMotion } from "../core/motion";
import type { CellVisual, EdgeMark } from "../puzzles/types";
import { AXIS_COLORS, easeInOut, project4, rotate4, type Rot4, type Vec4, ZERO_ROT } from "./math4d";
import { layoutsFor, type Layout } from "./layouts";
import { Stage } from "./stage";
import { haloTexture, iconTexture, labelTexture, setTextureUpdateHook } from "./textures";

export { LAYOUT_LABEL, layoutsFor, type Layout } from "./layouts";

export interface SpatialOptions {
  interactive?: boolean;
  cellScale?: number;
  accent?: string;
  labelColor?: string;
  tintByW?: boolean;
  /** Volle kubussen zonder tone mapping: kleuren blijven even verzadigd als op het platte bord (Tectonic-gebieden). */
  vivid?: boolean;
  /** Kompas (assenkruis) in de hoek dat meedraait met de camera. */
  compass?: boolean;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tmpC = new THREE.Color();
const VIVID = { roughness: 0.6, clearcoat: 0.0, env: 0.45, specular: 0.3, gain: 0.68 };

function cssColor(c: string | undefined, fallback: string): THREE.Color {
  const s = c ?? fallback;
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split(",").map((x) => parseFloat(x));
    return new THREE.Color(r / 255, g / 255, b / 255);
  }
  return new THREE.Color(s);
}

/**
 * Ruimtelijke weergave van een N-dimensionaal rooster met glazen cellen.
 * Indelingen: kubus, lagen, plakjes (4D als rij kubussen), borden en tesseract-projectie.
 */
export class SpatialView extends Stage {
  grid: Grid;
  layout: Layout;
  gap = 0.2;
  rot: Rot4 = { ...ZERO_ROT };
  autoRotate = false;
  autoSpeed = 0.35;
  wDist = 3.2;
  opts: SpatialOptions;
  private visualFn: (i: number) => CellVisual = () => ({});
  private visuals: CellVisual[] = [];
  private pos: Float32Array;
  private scl: Float32Array;
  private fromPos: Float32Array;
  private fromScl: Float32Array;
  private anim = 1;
  private animDur = 0.8;
  private solid: THREE.InstancedMesh;
  private glass: THREE.InstancedMesh;
  /** Cellen buiten de focus (Lijnen/Laag): even groot, maar veel doorzichtiger. */
  private fade: THREE.InstancedMesh;
  private kind: Uint8Array; // 0 verborgen, 1 solid, 2 glas
  private sprites: (THREE.Sprite | null)[];
  private halos: THREE.Sprite[] = [];
  private haloMat: THREE.SpriteMaterial;
  private group = new THREE.Group();
  private selBox: THREE.LineSegments;
  private hoverBox: THREE.LineSegments;
  private sel = -1;
  private hover = -1;
  private rails: THREE.InstancedMesh;
  private railSegs: [number, number, number][] = [];
  private links: THREE.InstancedMesh | null = null;
  private linkPairs: [number, number][] = [];
  private marks: THREE.InstancedMesh | null = null;
  private markList: EdgeMark[] = [];
  private highlight = new Map<number, string>();
  private filter: ((i: number) => boolean) | null = null;
  private pulseT = 0;
  reframeOnResize = false; // eigen indeling-afhankelijke kadering
  onPick: ((i: number, button: number) => void) | null = null;
  onHover: ((i: number) => void) | null = null;

  constructor(host: HTMLElement, grid: Grid, opts: SpatialOptions = {}) {
    super(host, { interactive: opts.interactive });
    this.opts = opts;
    this.grid = grid;
    this.layout = layoutsFor(grid.D)[0];
    const N = grid.count;
    this.pos = new Float32Array(N * 3);
    this.scl = new Float32Array(N);
    this.fromPos = new Float32Array(N * 3);
    this.fromScl = new Float32Array(N);
    this.kind = new Uint8Array(N);
    this.sprites = new Array(N).fill(null);
    this.depthBuf = new Float32Array(N);
    this.scene.add(this.group);

    const geo = new RoundedBoxGeometry(0.9, 0.9, 0.9, 3, 0.16);
    const vivid = !!opts.vivid;
    const solidMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: vivid ? VIVID.roughness : 0.28,
      metalness: vivid ? 0 : 0.05,
      clearcoat: vivid ? VIVID.clearcoat : 0.8,
      clearcoatRoughness: vivid ? 0.4 : 0.2,
      envMapIntensity: vivid ? VIVID.env : 1.1,
      // weinig witte glans: die maakt de kleuren anders pastel
      specularIntensity: vivid ? VIVID.specular : 1,
      // ACES-tone mapping maakt verzadigde kleuren pastel; voor gebiedskleuren uitzetten
      toneMapped: !vivid,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity: 0.26,
      clearcoat: 1,
      envMapIntensity: 1.6,
      depthWrite: false,
    });
    this.solid = new THREE.InstancedMesh(geo, solidMat, N);
    this.glass = new THREE.InstancedMesh(geo, glassMat, N);
    const fadeMat = glassMat.clone();
    fadeMat.opacity = 0.09;
    fadeMat.clearcoat = 0.3;
    fadeMat.envMapIntensity = 0.5;
    this.fade = new THREE.InstancedMesh(geo, fadeMat, N);
    for (const m of [this.solid, this.glass, this.fade]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < N; i++) m.setColorAt(i, tmpC.set(0xffffff));
      this.group.add(m);
    }
    this.glass.renderOrder = 2;
    this.fade.renderOrder = 1;

    this.haloMat = new THREE.SpriteMaterial({
      map: haloTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    });

    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08, 1.08, 1.08));
    this.selBox = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }));
    this.selBox.renderOrder = 20;
    this.hoverBox = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    this.selBox.visible = this.hoverBox.visible = false;
    this.group.add(this.selBox, this.hoverBox);

    const railGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 8, 1, true);
    const railMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const maxRails = grid.n.reduce((s, x) => s + x, 0);
    this.rails = new THREE.InstancedMesh(railGeo, railMat, Math.max(1, maxRails));
    this.rails.frustumCulled = false;
    this.rails.count = 0;
    this.group.add(this.rails);

    setTextureUpdateHook(() => this.invalidate());
    this.addTicker((dt) => this.tick(dt));
    this.bindPointer();
    this.computeTargets(false);
    this.frameAll();
  }

  /* ---------- publieke API ---------- */

  setVisual(fn: (i: number) => CellVisual) {
    this.visualFn = fn;
    this.refresh();
  }

  setLayout(l: Layout, animate = true) {
    if (l === this.layout) return;
    this.layout = l;
    this.computeTargets(animate);
    this.frameAll();
  }

  setGap(g: number) {
    this.gap = g;
    this.computeTargets(false);
    this.frameAll();
  }

  setRot(r: Partial<Rot4>) {
    Object.assign(this.rot, r);
    if (this.layout === "tesseract") this.computeTargets(false, true);
  }

  setAutoRotate(on: boolean) {
    this.autoRotate = on;
    this.invalidate();
  }

  setSelected(i: number) {
    this.sel = i;
    this.updateRails();
    this.invalidate();
  }

  setHovered(i: number) {
    this.hover = i;
    this.invalidate();
  }

  setHighlight(cells: number[], color = "#ffffff") {
    this.highlight.clear();
    for (const c of cells) this.highlight.set(c, color);
    this.refresh();
  }

  setHighlightMap(m: Map<number, string>) {
    this.highlight = new Map(m);
    this.refresh();
  }

  setFilter(f: ((i: number) => boolean) | null) {
    this.filter = f;
    this.refresh();
  }

  setLinks(pairs: [number, number][], color = "#4fe3ff") {
    this.linkPairs = pairs;
    if (this.links) {
      this.group.remove(this.links);
      this.links.geometry.dispose();
      (this.links.material as THREE.Material).dispose();
      this.links = null;
    }
    if (pairs.length) {
      const geo = new THREE.CylinderGeometry(0.11, 0.11, 1, 10, 1);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1 });
      this.links = new THREE.InstancedMesh(geo, mat, pairs.length);
      this.links.frustumCulled = false;
      this.group.add(this.links);
    }
    this.updateSegments();
  }

  setMarks(marks: EdgeMark[]) {
    this.markList = marks;
    if (this.marks) {
      this.group.remove(this.marks);
      this.marks.geometry.dispose();
      (this.marks.material as THREE.Material).dispose();
      this.marks = null;
    }
    if (marks.length) {
      const geo = new THREE.ConeGeometry(0.15, 0.32, 18);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x222222 });
      this.marks = new THREE.InstancedMesh(geo, mat, marks.length);
      this.marks.frustumCulled = false;
      marks.forEach((m, k) => this.marks!.setColorAt(k, tmpC.set(AXIS_COLORS[m.axis] ?? "#ffffff")));
      this.group.add(this.marks);
    }
    this.updateSegments();
  }

  refresh() {
    const N = this.grid.count;
    for (let i = 0; i < N; i++) this.visuals[i] = this.visualFn(i);
    this.applyStyles();
    this.writeMatrices();
    // verbindingen hangen af van verborgen/zwakke cellen (doorsnede-modus)
    if (this.links) this.updateSegments();
    this.invalidate();
  }

  cellPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  resetCamera() {
    this.frameAll();
  }

  private frameSet: number[] | null = null;
  private lastFrameRadius = 0;
  private frameKey = "";
  /**
   * Kader de camera op een deel van de cellen (bv. de eigen doorsnede in het 4D-doolhof); null = alles.
   * Heeft de speler zelf gedraaid of gezoomd, dan schuift alleen het middelpunt mee.
   */
  setFrameCells(cells: number[] | null) {
    const key = cells ? cells.join(",") : "";
    if (key === this.frameKey) return;
    this.frameKey = key;
    this.frameSet = cells && cells.length ? cells : null;
    if (this.userMoved) {
      // eigen draaiing houden; middelpunt en zoom schalen mee (in de tesseract verschillen doorsnedes sterk in grootte)
      const { center, radius } = this.frameBounds();
      const scale = this.lastFrameRadius > 0 ? radius / this.lastFrameRadius : 1;
      const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(scale);
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(off);
      this.camera.near = Math.max(0.05, off.length() / 100);
      this.camera.far = off.length() * 10;
      this.camera.updateProjectionMatrix();
      this.lastFrameRadius = radius;
      this.controls.update();
      this.invalidate();
    } else this.frameAll();
  }

  /** Middelpunt en halve afmetingen van de (doel)posities van de gekaderde cellen. */
  private frameBounds() {
    const N = this.grid.count;
    const tp = new Float32Array(N * 3);
    const ts = new Float32Array(N);
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const cells = this.frameSet ?? [...Array(N).keys()];
    let pad = 0;
    for (const i of cells) {
      this.target(i, tp, ts);
      min.min(tmpV.set(tp[i * 3], tp[i * 3 + 1], tp[i * 3 + 2]));
      max.max(tmpV);
      pad = Math.max(pad, 0.6 * ts[i]);
    }
    const center = this.frameSet ? min.clone().add(max).multiplyScalar(0.5) : new THREE.Vector3();
    let r = 0;
    for (const i of cells) r = Math.max(r, Math.hypot(tp[i * 3] - center.x, tp[i * 3 + 1] - center.y, tp[i * 3 + 2] - center.z) + 0.6 * ts[i]);
    const half = this.frameSet
      ? max.clone().sub(min).multiplyScalar(0.5).addScalar(pad + 0.55 * (1 + this.gap)) // ruimte voor stompjes naar buren
      : new THREE.Vector3(Math.max(Math.abs(min.x), Math.abs(max.x)), Math.max(Math.abs(min.y), Math.abs(max.y)), Math.max(Math.abs(min.z), Math.abs(max.z))).addScalar(pad);
    return { center, half, radius: Math.max(r, 1.2) };
  }

  setInsetBottom(px: number) {
    if (Math.abs(px - this.insetBottom) < 2) return;
    this.insetBottom = px;
    this.resize();
    this.frameAll();
  }

  /* ---------- indeling ---------- */

  private sliceCols(nw: number): number {
    const aspect = this.camera.aspect || 1.5;
    if (nw <= 2) return nw;
    if (aspect >= 1.7) return nw;
    if (aspect >= 1.05 && nw === 3) return 3;
    return Math.ceil(nw / 2);
  }
  private lastCols = 0;

  resize() {
    super.resize();
    if (!this.grid) return;
    if (this.layout === "slices") {
      const c = this.sliceCols(this.grid.D > 3 ? this.grid.n[3] : 1);
      if (c !== this.lastCols) {
        this.lastCols = c;
        this.computeTargets(false);
        this.frameAll();
      }
    }
  }

  private target(i: number, out: Float32Array, outS: Float32Array) {
    const g = this.grid;
    const D = g.D;
    const s = 1 + this.gap;
    const c = (a: number) => (a < D ? g.c(i, a) - (g.n[a] - 1) / 2 : 0);
    const n = (a: number) => (a < D ? g.n[a] : 1);
    const cs = this.opts.cellScale ?? 1;
    let x = 0,
      y = 0,
      z = 0,
      k = cs;
    switch (this.layout) {
      case "flat":
        x = c(0) * s;
        y = -c(1) * s;
        break;
      case "cube":
        x = c(0) * s;
        y = -c(1) * s;
        z = -c(2) * s;
        break;
      case "layers": {
        const bw = n(0) * s + 1.2;
        x = c(0) * s + c(2) * bw;
        y = -c(1) * s;
        break;
      }
      case "slices": {
        const nw = n(3);
        const cols = this.sliceCols(nw);
        const rows = Math.ceil(nw / cols);
        const w = this.grid.D > 3 ? this.grid.c(i, 3) : 0;
        const col = w % cols;
        const row = Math.floor(w / cols);
        const bw = n(0) * s + 1.8;
        const bh = n(1) * s + 2.2;
        x = c(0) * s + (col - (cols - 1) / 2) * bw;
        y = -c(1) * s - (row - (rows - 1) / 2) * bh;
        z = -c(2) * s;
        break;
      }
      case "boards": {
        const bw = n(0) * s + 1.0;
        const bh = n(1) * s + 1.0;
        x = c(0) * s + c(2) * bw;
        y = -c(1) * s - c(3) * bh;
        break;
      }
      case "tesseract": {
        const R = ((Math.max(n(0), n(1), n(2)) - 1) / 2) * s * 1.25 || 1;
        const norm = (a: number) => (n(a) > 1 ? c(a) / ((n(a) - 1) / 2) : 0);
        const p: Vec4 = [norm(0) * R, -norm(1) * R, -norm(2) * R, norm(3) * R];
        const r = rotate4(p, this.rot);
        const o: [number, number, number] = [0, 0, 0];
        const kk = project4(r, this.wDist * R, o);
        x = o[0];
        y = o[1];
        z = o[2];
        k = cs * 0.52 * kk;
        break;
      }
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
    outS[i] = k;
  }

  private computeTargets(animate: boolean, noFrame = false) {
    if (reducedMotion()) animate = false; // geen vloeiende overgang als 'minder beweging' aanstaat
    const N = this.grid.count;
    if (animate) {
      this.fromPos.set(this.pos);
      this.fromScl.set(this.scl);
      this.anim = 0;
    }
    if (!animate || noFrame) {
      for (let i = 0; i < N; i++) this.target(i, this.pos, this.scl);
      this.writeMatrices();
      this.updateSegments();
    }
    this.invalidate();
  }

  private frameAll() {
    const { center, half, radius } = this.frameBounds();
    this.lastFrameRadius = radius;
    const flatish = this.layout === "flat" || this.layout === "layers" || this.layout === "boards";
    const dir = flatish ? new THREE.Vector3(0.0, -0.35, 1) : this.layout === "slices" ? new THREE.Vector3(0.3, 0.38, 1) : new THREE.Vector3(0.62, 0.48, 1);
    if (flatish || this.layout === "slices") {
      // rechthoekige omhullende: past beter dan een bol bij brede of hoge indelingen
      const fov = (this.camera.fov * Math.PI) / 180;
      const t = Math.tan(fov / 2);
      const d = Math.max(half.y / t / this.freeFraction(), half.x / (t * this.camera.aspect)) * 1.12 + half.z;
      this.controls.target.copy(center);
      this.camera.position.copy(dir.clone().normalize().multiplyScalar(d).add(center));
      this.camera.near = Math.max(0.05, d / 100);
      this.camera.far = d * 10;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.invalidate();
      return;
    }
    this.frame(radius * 0.98, dir, center);
  }

  /* ---------- stijl ---------- */

  private applyStyles() {
    const N = this.grid.count;
    const g = this.grid;
    const accent = this.opts.labelColor ?? this.opts.accent ?? "#ffd88a";
    for (const h of this.halos) h.visible = false;
    let halo = 0;
    for (let i = 0; i < N; i++) {
      const v = this.visuals[i];
      const filtered = this.filter && !this.filter(i);
      let kind = v.hidden ? 0 : v.tone === "solid" || v.tone === "dark" || v.tone === "glow" ? 1 : 2;
      if (filtered && kind) kind = 3; // vaag: even groot, doorzichtig
      this.kind[i] = kind;
      let col: THREE.Color;
      if (v.tone === "dark") col = cssColor(v.fill, "#151a28");
      else if (v.fill) col = cssColor(v.fill, "#ffffff");
      else if (this.opts.tintByW !== false && g.D >= 3) {
        const a = g.D === 4 ? 3 : 2;
        const t = g.n[a] > 1 ? g.c(i, a) / (g.n[a] - 1) : 0;
        col = new THREE.Color("#7fb2ff").lerp(new THREE.Color(g.D === 4 ? "#d77bff" : "#9ad0ff"), t);
      } else col = new THREE.Color("#9fb4ff");
      const hl = this.highlight.get(i);
      if (hl) col.lerp(cssColor(hl, "#fff"), 0.55);
      if (v.error) col.set("#ff4d5e");
      // buiten de focus (Lijnen/Laag): vager, niet weg
      if (filtered) col.lerp(new THREE.Color("#30364d"), 0.35);
      // zonder tone mapping lopen belichte vlakken anders over naar wit; basiskleur iets temperen
      this.solid.setColorAt(i, this.opts.vivid ? tmpC.copy(col).multiplyScalar(VIVID.gain) : col);
      this.glass.setColorAt(i, col);
      this.fade.setColorAt(i, col);

      // label / icoon
      let tex: THREE.Texture | null = null;
      // cijfers van cellen buiten de focus blijven gedimd leesbaar
      if (filtered && kind && v.text && !v.icon) tex = labelTexture(v.text, "rgba(214,222,255,0.38)", 600);
      if (!filtered && kind) {
        if (v.icon) tex = iconTexture(v.icon, v.iconColor ?? "#ffffff");
        else if (v.text) {
          // op een volle, lichte kubus (bv. Tectonic-gebieden) donkere cijfers; anders licht
          const srgb = col.clone().convertLinearToSRGB();
          const lum = 0.2126 * srgb.r + 0.7152 * srgb.g + 0.0722 * srgb.b;
          const lightSolid = v.tone === "solid" && !v.error && lum > 0.5;
          const color = v.error ? "#ffd1d6" : lightSolid ? "#0e1020" : v.given ? "#ffffff" : v.tone === "solid" || v.tone === "dark" ? "#ffffff" : accent;
          tex = labelTexture(v.text, color, v.given ? 800 : 600);
        }
      }
      let sp = this.sprites[i];
      if (tex) {
        if (!sp) {
          sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
          sp.renderOrder = 5;
          this.sprites[i] = sp;
          this.group.add(sp);
        }
        // eigen materiaal per cel: zo kan een cijfer achterin vager zijn dan een cijfer vooraan
        if (sp.material.map !== tex) {
          sp.material.map = tex;
          sp.material.needsUpdate = true;
        }
        sp.visible = true;
      } else if (sp) sp.visible = false;

      // gloed
      if (!filtered && kind && (v.tone === "glow" || v.pulse)) {
        let h = this.halos[halo];
        if (!h) {
          h = new THREE.Sprite(this.haloMat.clone());
          h.renderOrder = 4;
          this.halos.push(h);
          this.group.add(h);
        }
        (h.material as THREE.SpriteMaterial).color.copy(v.pulse ? new THREE.Color("#ffffff") : col);
        h.userData.cell = i;
        h.userData.pulse = !!v.pulse;
        h.visible = true;
        halo++;
      }
    }
    if (this.solid.instanceColor) this.solid.instanceColor.needsUpdate = true;
    if (this.glass.instanceColor) this.glass.instanceColor.needsUpdate = true;
    if (this.fade.instanceColor) this.fade.instanceColor.needsUpdate = true;
  }

  private writeMatrices() {
    const N = this.grid.count;
    for (let i = 0; i < N; i++) {
      const v = this.visuals[i] ?? {};
      let s = this.scl[i];
      if (v.dim) s *= 0.7;
      // cellen buiten de focus (Lijnen/Laag) worden alleen vager (glas, gedimd), niet kleiner
      tmpV.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      const k = this.kind[i];
      tmpS.setScalar(k === 1 ? s : 1e-6);
      tmpM.compose(tmpV, tmpQ.identity(), tmpS);
      this.solid.setMatrixAt(i, tmpM);
      tmpS.setScalar(k === 2 ? s : 1e-6);
      tmpM.compose(tmpV, tmpQ.identity(), tmpS);
      this.glass.setMatrixAt(i, tmpM);
      tmpS.setScalar(k === 3 ? s : 1e-6);
      tmpM.compose(tmpV, tmpQ.identity(), tmpS);
      this.fade.setMatrixAt(i, tmpM);
      const sp = this.sprites[i];
      if (sp) sp.scale.setScalar(s * (v.icon ? 0.85 : 0.72));
    }
    this.solid.instanceMatrix.needsUpdate = true;
    this.glass.instanceMatrix.needsUpdate = true;
    this.fade.instanceMatrix.needsUpdate = true;
    this.solid.boundingSphere = null;
    this.glass.boundingSphere = null;
    this.fade.boundingSphere = null;
  }

  private placeCylinder(mesh: THREE.InstancedMesh, k: number, a: THREE.Vector3, b: THREE.Vector3, radiusScale = 1) {
    const mid = tmpV.copy(a).add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) {
      tmpM.makeScale(1e-6, 1e-6, 1e-6);
      mesh.setMatrixAt(k, tmpM);
      return;
    }
    tmpQ.setFromUnitVectors(UP, dir.normalize());
    tmpS.set(radiusScale, len, radiusScale);
    tmpM.compose(mid, tmpQ, tmpS);
    mesh.setMatrixAt(k, tmpM);
  }

  private updateSegments() {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    if (this.links) {
      const cs = this.opts.cellScale ?? 1;
      this.linkPairs.forEach(([p, q], k) => {
        this.cellPosition(p, a);
        this.cellPosition(q, b);
        const vp = this.visuals[p];
        const vq = this.visuals[q];
        let r = Math.min(this.scl[p], this.scl[q]) / cs;
        if (vp?.hidden && vq?.hidden) r = 0;
        else if (vp?.hidden || vq?.hidden) {
          // doorgang naar een verborgen laag: kort stompje vanaf de zichtbare cel in die richting
          const [vis, hid] = vp?.hidden ? [b, a] : [a, b];
          const unit = (vp?.hidden ? this.scl[q] : this.scl[p]) / cs;
          const len = Math.min(vis.distanceTo(hid) * 0.45, unit * 0.62);
          hid.sub(vis).normalize().multiplyScalar(len).add(vis);
          r = unit;
        } else if (vp?.dim || vq?.dim) r *= 0.5; // herinnering aan een eerder bezochte laag: dunner
        this.placeCylinder(this.links!, k, a, b, r);
      });
      this.links.instanceMatrix.needsUpdate = true;
    }
    if (this.marks) {
      this.markList.forEach((m, k) => {
        this.cellPosition(m.a, a);
        this.cellPosition(m.b, b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const dir = a.clone().sub(b).normalize(); // punt wijst naar het kleinere getal (a)
        tmpQ.setFromUnitVectors(UP, dir);
        const s = Math.min(this.scl[m.a], this.scl[m.b]);
        tmpS.setScalar(s);
        tmpM.compose(mid, tmpQ, tmpS);
        this.marks!.setMatrixAt(k, tmpM);
      });
      this.marks.instanceMatrix.needsUpdate = true;
    }
    this.updateRails();
    this.placeExits();
  }

  /** Lichtsporen door de gekozen cel (alle lijnen); uit bij het doolhof, dat toont alleen echte doorgangen (setExits). */
  railsEnabled = true;
  private exitsMesh: THREE.InstancedMesh | null = null;
  private exitSegs: [number, number, number][] = [];

  /**
   * Doorgangen vanaf de speler, gekleurd per as (zoals de pijlknoppen). Zo is in de tesseract, waar cellen die
   * alleen in w verschillen bijna op elkaar liggen, meteen te zien welke buisjes echt bij de speler horen.
   */
  setExits(segs: [number, number, number][]) {
    this.exitSegs = segs;
    if (!this.exitsMesh) {
      const geo = new THREE.CylinderGeometry(0.11, 0.11, 1, 12, 1);
      // altijd zichtbaar (ook achter dichterbij liggende buisjes), net als het selectiekader
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false });
      this.exitsMesh = new THREE.InstancedMesh(geo, mat, Math.max(1, 2 * this.grid.D));
      this.exitsMesh.frustumCulled = false;
      this.exitsMesh.renderOrder = 18;
      for (let k = 0; k < 2 * this.grid.D; k++) this.exitsMesh.setColorAt(k, tmpC.set(0xffffff));
      this.group.add(this.exitsMesh);
    }
    this.placeExits();
    this.invalidate();
  }

  private placeExits() {
    const m = this.exitsMesh;
    if (!m) return;
    const cs = this.opts.cellScale ?? 1;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    m.count = this.exitSegs.length;
    // kortere buisjes bovenop (zelfde volgorde als bij het aantikken)
    const len = (x: [number, number, number]) => this.cellPosition(x[0], a).distanceTo(this.cellPosition(x[1], b));
    this.exitSegs.sort((x, y) => len(y) - len(x));
    this.exitSegs.forEach(([p, q, ax], k) => {
      this.cellPosition(p, a);
      this.cellPosition(q, b);
      const unit = this.scl[p] / cs;
      // naar een verborgen laag: alleen het stompje
      if (this.visuals[q]?.hidden) b.sub(a).normalize().multiplyScalar(Math.min(a.distanceTo(b) * 0.45, unit * 0.62)).add(a);
      this.placeCylinder(m, k, a, b, unit * 1.3);
      m.setColorAt(k, tmpC.set(AXIS_COLORS[ax]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  private updateRails() {
    const g = this.grid;
    this.railSegs = [];
    if (this.sel >= 0 && this.railsEnabled) {
      for (let ax = 0; ax < g.D; ax++) {
        const line = g.lineThrough(this.sel, ax);
        for (let k = 0; k + 1 < line.length; k++) this.railSegs.push([line[k], line[k + 1], ax]);
      }
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    this.rails.count = this.railSegs.length;
    this.railSegs.forEach(([p, q, ax], k) => {
      this.cellPosition(p, a);
      this.cellPosition(q, b);
      // geen lichtspoor door verborgen cellen (doorsnede-modus)
      const hid = this.visuals[p]?.hidden || this.visuals[q]?.hidden;
      this.placeCylinder(this.rails, k, a, b, hid ? 0 : Math.min(this.scl[p], this.scl[q]));
      this.rails.setColorAt(k, tmpC.set(AXIS_COLORS[ax]));
    });
    this.rails.instanceMatrix.needsUpdate = true;
    if (this.rails.instanceColor) this.rails.instanceColor.needsUpdate = true;
  }

  /* ---------- animatie ---------- */

  private tick(dt: number): boolean {
    let busy = false;
    if (this.anim < 1) {
      this.anim = Math.min(1, this.anim + dt / this.animDur);
      const t = easeInOut(this.anim);
      const N = this.grid.count;
      const tp = new Float32Array(N * 3);
      const ts = new Float32Array(N);
      for (let i = 0; i < N; i++) this.target(i, tp, ts);
      for (let k = 0; k < N * 3; k++) this.pos[k] = this.fromPos[k] + (tp[k] - this.fromPos[k]) * t;
      for (let k = 0; k < N; k++) this.scl[k] = this.fromScl[k] + (ts[k] - this.fromScl[k]) * t;
      this.writeMatrices();
      this.updateSegments();
      busy = true;
    }
    if (this.autoRotate && this.layout === "tesseract" && this.anim >= 1) {
      this.rot.xw += dt * this.autoSpeed;
      this.rot.zw += dt * this.autoSpeed * 0.55;
      const N = this.grid.count;
      for (let i = 0; i < N; i++) this.target(i, this.pos, this.scl);
      this.writeMatrices();
      this.updateSegments();
      busy = true;
    }
    if (this.halos.some((h) => h.visible && h.userData.pulse)) {
      this.pulseT += dt;
      busy = true;
    }
    return busy;
  }

  private depthBuf = new Float32Array(0);

  /* ---------- kompas ---------- */

  private compassEl: HTMLDivElement | null = null;
  private compassKey = "";

  /**
   * Assenkruis in de hoek: per as de richting waarin die as op dit moment loopt, gezien vanaf de gekozen cel
   * (of het midden). Afgeleid van echte celposities, dus ook juist in de tesseract, plakjes en borden.
   */
  private updateCompass() {
    if (!this.opts.compass) return;
    if (!this.compassEl) {
      this.compassEl = document.createElement("div");
      this.compassEl.className = "compass";
      this.compassEl.setAttribute("aria-hidden", "true");
      this.host.appendChild(this.compassEl);
    }
    const g = this.grid;
    this.camera.updateMatrixWorld();
    this.group.updateMatrixWorld();
    const ref = this.sel >= 0 ? this.sel : g.index(g.n.map((n) => Math.floor((n - 1) / 2)));
    const base = this.cellPosition(ref, new THREE.Vector3());
    const view = this.camera.matrixWorldInverse;
    const arrows: { a: number; x: number; y: number; z: number; radial: boolean }[] = [];
    for (let a = 0; a < g.D; a++) {
      let q = g.step(ref, a, 1);
      let sign = 1;
      if (q < 0) {
        q = g.step(ref, a, -1);
        sign = -1;
      }
      if (q < 0) continue;
      const d = this.cellPosition(q, new THREE.Vector3()).sub(base).multiplyScalar(sign);
      const len = d.length();
      if (len < 1e-4) {
        arrows.push({ a, x: 0, y: 0, z: 1, radial: true });
        continue;
      }
      d.divideScalar(len).transformDirection(this.group.matrixWorld).transformDirection(view); // richting in camera-ruimte (x rechts, y omhoog, z naar je toe)
      arrows.push({ a, x: d.x, y: d.y, z: d.z, radial: false });
    }
    const key = arrows.map((r) => `${r.a}:${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)}`).join("|") + (this.layout === "tesseract" ? "T" : "");
    if (key === this.compassKey) return;
    this.compassKey = key;
    // pijlen die van je af wijzen eerst (achter), daarna die naar je toe
    arrows.sort((p, q) => p.z - q.z);
    const R = 34;
    let svg = `<svg viewBox="-50 -50 100 100"><circle r="3" fill="rgba(255,255,255,.7)"/>`;
    for (const r of arrows) {
      if (r.radial) continue;
      const col = AXIS_COLORS[r.a];
      const ex = r.x * R;
      const ey = -r.y * R;
      const op = r.z >= 0 ? 1 : 0.45 + 0.4 * (1 + r.z);
      const tx = r.x * (R + 10);
      const ty = -r.y * (R + 10);
      svg += `<g opacity="${op.toFixed(2)}"><line x1="0" y1="0" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${col}" stroke-width="${r.z >= 0 ? 5 : 3.5}" stroke-linecap="round"/>`;
      svg += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${r.z >= 0 ? 4.2 : 3}" fill="${col}"/>`;
      svg += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${col}" text-anchor="middle" dominant-baseline="central">${"xyzw"[r.a]}</text></g>`;
    }
    svg += "</svg>";
    const radialW = arrows.some((r) => r.a === 3 && r.radial);
    const note = g.D === 4 && (this.layout === "tesseract" || radialW) ? `<small>w: binnen ↔ buiten</small>` : "";
    this.compassEl.innerHTML = svg + note;
  }

  protected beforeRender() {
    this.updateCompass();
    const cam = this.camera.position;
    const p = new THREE.Vector3();
    let near = Infinity;
    let far = 0;
    const depth = this.depthBuf;
    for (let i = 0; i < this.grid.count; i++) {
      const sp = this.sprites[i];
      if (!sp || !sp.visible) continue;
      this.cellPosition(i, p);
      const s = this.scl[i] * (this.visuals[i]?.dim ? 0.7 : 1);
      const dir = tmpV.copy(cam).sub(p);
      const d = dir.length();
      depth[i] = d;
      if (d < near) near = d;
      if (d > far) far = d;
      dir.divideScalar(d || 1);
      const solid = this.kind[i] === 1;
      // op volle kubussen het label vóór de dichtstbijzijnde hoek (√3 · halve ribbe ≈ 0.78) zetten
      sp.position.copy(p).addScaledVector(dir, solid ? s * 0.82 : s * 0.05);
    }
    // dieptewerking: cijfers achterin zijn vager, zodat overlappende cijfers uit elkaar te houden zijn
    // (geschaald op de diepte van het hele model, zodat twee cijfers vlak achter elkaar nauwelijks verschillen)
    const span = Math.max(far - near, 1.2 * this.lastFrameRadius, 1e-3);
    for (let i = 0; i < this.grid.count; i++) {
      const sp = this.sprites[i];
      if (!sp || !sp.visible) continue;
      sp.material.opacity = 1 - 0.45 * Math.min(1, (depth[i] - near) / span);
    }
    for (const h of this.halos) {
      if (!h.visible) continue;
      const i = h.userData.cell as number;
      this.cellPosition(i, p);
      h.position.copy(p);
      const base = this.scl[i] * 2.1;
      const pulse = h.userData.pulse ? 1 + 0.25 * Math.sin(this.pulseT * 6) : 1;
      h.scale.setScalar(base * pulse);
    }
    for (const [box, i] of [
      [this.selBox, this.sel],
      [this.hoverBox, this.hover],
    ] as [THREE.LineSegments, number][]) {
      if (i >= 0 && i < this.grid.count && this.kind[i]) {
        box.visible = true;
        this.cellPosition(i, box.position);
        box.scale.setScalar(this.scl[i]);
      } else box.visible = false;
    }
  }

  /* ---------- invoer ---------- */

  private pick(ev: PointerEvent | MouseEvent, preferExits = false): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hits = [...rc.intersectObject(this.solid), ...rc.intersectObject(this.glass)].filter(
      (h) => h.instanceId !== undefined && this.kind[h.instanceId] !== 0 && !(this.filter && !this.filter(h.instanceId)),
    );
    hits.sort((a, b) => a.distance - b.distance);
    if (preferExits && this.exitSegs.length) {
      // liggen cellen over elkaar (tesseract), dan telt een cel waar de speler heen kan voor
      const targets = new Set(this.exitSegs.map((x) => x[1]));
      const t = hits.find((h) => targets.has(h.instanceId!));
      if (t) return t.instanceId!;
    }
    return hits.length ? hits[0].instanceId! : -1;
  }

  /** Doorgang (doelcel) waarvan het gekleurde buisje op het scherm binnen ~26 px van de tik ligt; anders -1. */
  private pickExit(ev: PointerEvent | MouseEvent): number {
    if (!this.exitSegs.length || !this.exitsMesh) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const toScreen = (v: THREE.Vector3) => {
      this.group.localToWorld(v);
      v.project(this.camera);
      return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height];
    };
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const cs = this.opts.cellScale ?? 1;
    let best = -1;
    let bestScore = Infinity;
    for (const [p, q] of this.exitSegs) {
      this.cellPosition(p, a);
      this.cellPosition(q, b);
      if (this.visuals[q]?.hidden) b.sub(a).normalize().multiplyScalar(Math.min(a.distanceTo(b) * 0.45, (this.scl[p] / cs) * 0.62)).add(a);
      const [ax, ay] = toScreen(a.clone());
      const [bx, by] = toScreen(b.clone());
      const dx = bx - ax;
      const dy = by - ay;
      const L2 = dx * dx + dy * dy;
      if (L2 < 1) continue;
      const L = Math.sqrt(L2);
      const t = ((px - ax) * dx + (py - ay) * dy) / L2;
      // tik op de speler zelf (begin van het buisje) telt niet; lange buisjes (naar een ander bord) zijn overal aan te tikken
      if (t * L < Math.min(0.3 * L, 18) || t > 1.25) continue;
      const tc = Math.min(1, t);
      const dist = Math.hypot(px - (ax + tc * dx), py - (ay + tc * dy));
      if (dist > 26) continue;
      // het dichtstbijzijnde buisje wint; liggen buisjes over elkaar (in 'Plakjes' loopt w langs x), dan het
      // kortste (dat ligt ook bovenop); een tik voorbij het einde van een buisje telt minder
      const score = dist + (t > 1 ? 20 : 0) + 0.02 * L;
      if (score < bestScore) {
        bestScore = score;
        best = q;
      }
    }
    return best;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; t: number; b: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), b: e.button };
    });
    el.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      const b = down.b;
      down = null;
      if (moved > 6 || dt > 600 || !this.onPick) return;
      // doolhof: een tik op (of vlak bij) een gekleurde doorgang gaat die kant op
      const ex = this.pickExit(e);
      const i = ex >= 0 ? ex : this.pick(e, true);
      if (i >= 0) this.onPick(i, b);
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    let pending = false;
    el.addEventListener("pointermove", (e) => {
      if (!this.onHover || e.pointerType === "touch" || pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const i = this.pick(e);
        if (i !== this.hover) this.onHover?.(i);
      });
    });
    el.addEventListener("pointerleave", () => this.onHover?.(-1));
  }

  dispose() {
    setTextureUpdateHook(null);
    for (const sp of this.sprites) sp?.material.dispose();
    super.dispose();
  }
}
