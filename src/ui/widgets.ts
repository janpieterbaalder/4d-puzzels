import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { Grid } from "../core/grid";
import { reducedMotion } from "../core/motion";
import type { WidgetSpec } from "../course/lessons";
import type { CellVisual } from "../puzzles/types";
import { GraphView, hypercube, type GEdge, type GNode } from "../view/graph";
import { AXIS_COLORS, easeInOut, type Rot4, type Vec4 } from "../view/math4d";
import { SpatialView, type Layout } from "../view/spatial";
import { Stage } from "../view/stage";

export interface Widget {
  update(spec: WidgetSpec): void;
  dispose(): void;
}

function ctlBar(host: HTMLElement): HTMLDivElement {
  const bar = document.createElement("div");
  bar.className = "wctl";
  host.appendChild(bar);
  return bar;
}

function badge(host: HTMLElement): HTMLDivElement {
  const b = document.createElement("div");
  b.className = "wbadge";
  host.appendChild(b);
  return b;
}

/* ---------- 1. Uitschuiven: punt → tesseract ---------- */

class ExtrudeWidget implements Widget {
  view: GraphView;
  d = 0;
  t = 1;
  private info: HTMLDivElement;
  private spinOn = false;
  constructor(host: HTMLElement, spec: Extract<WidgetSpec, { type: "extrude" }>) {
    this.view = new GraphView(host);
    this.view.dist = 3.4;
    this.info = badge(host);
    const { verts, edges } = hypercube(4, 1);
    const nodes: GNode[] = verts.map((p) => ({ p: [...p] as Vec4, color: "#eef0ff", size: 0.07 }));
    const es: GEdge[] = edges.map(([a, b, ax]) => ({ a, b, color: AXIS_COLORS[ax], radius: 0.028, glow: 1 }));
    this.view.setGraph(nodes, es);
    this.view.frame(2.3, new THREE.Vector3(0.7, 0.5, 1));
    this.view.addTicker((dt) => {
      if (this.t < 1) {
        this.t = Math.min(1, this.t + dt / 1.3);
        this.place();
        return true;
      }
      return false;
    });
    this.update(spec);
  }
  update(spec: WidgetSpec) {
    if (spec.type !== "extrude") return;
    const nd = spec.d;
    if (nd === this.d + 1) this.t = 0;
    else this.t = 1;
    this.d = nd;
    this.spinOn = !!spec.spin;
    this.view.spin = this.spinOn ? { xw: 0.45, yz: 0.12 } : nd === 4 ? { xz: 0.12 } : { xz: 0.18 };
    if (!this.spinOn) this.view.rot = { xy: 0, xz: 0.5, yz: 0.25, xw: nd === 4 ? 0.0 : 0, yw: 0, zw: 0 };
    this.place();
    const d = nd;
    const C = (n: number, k: number) => (k < 0 || k > n ? 0 : [1, n, (n * (n - 1)) / 2, (n * (n - 1) * (n - 2)) / 6, 1][k] ?? 0);
    const cnt = (k: number) => (k > d ? 0 : C(d, k) * 2 ** (d - k));
    const names = ["punt", "lijnstuk", "vierkant", "kubus", "tesseract"];
    this.info.innerHTML = `<b>${d}D · ${names[d]}</b><span>hoekpunten <i>${cnt(0)}</i></span><span>ribben <i>${cnt(1)}</i></span>${d >= 2 ? `<span>vlakken <i>${cnt(2)}</i></span>` : ""}${d >= 3 ? `<span>kubussen <i>${cnt(3)}</i></span>` : ""}`;
  }
  private place() {
    const d = this.d;
    const e = easeInOut(this.t);
    this.view.nodes.forEach((n, m) => {
      const vis = m < 1 << Math.max(0, d);
      for (let a = 0; a < 4; a++) {
        const ext = a < d - 1 ? 1 : a === d - 1 ? e : 0;
        n.p[a] = (m & (1 << a) ? 1 : -1) * ext;
      }
      n.visible = vis;
      n.size = d === 0 ? 0.12 : 0.07;
    });
    this.view.edges.forEach((ed) => {
      ed.visible = ed.a < 1 << d && ed.b < 1 << d;
    });
    this.view.restyle();
  }
  dispose() {
    this.view.dispose();
    this.info.remove();
  }
}

/* ---------- helpers voor roosterweergaven ---------- */

function layoutFor(d: number, pref?: Layout): Layout {
  if (d <= 2) return "flat";
  if (d === 3) return pref === "layers" ? "layers" : "cube";
  return pref ?? "slices";
}

/* ---------- 2. Buren ---------- */

class NeighborsWidget implements Widget {
  view: SpatialView | null = null;
  private info: HTMLDivElement;
  private key = "";
  constructor(private host: HTMLElement, spec: WidgetSpec) {
    this.info = badge(host);
    this.update(spec);
  }
  update(spec: WidgetSpec) {
    if (spec.type !== "neighbors") return;
    const d = spec.d;
    const king = !!spec.king;
    const key = d + ":" + king;
    if (key === this.key) return;
    this.key = key;
    this.view?.dispose();
    const g = d === 1 ? new Grid([3]) : Grid.cube(d, 3);
    const gv = d === 1 ? new Grid([3, 1]) : g;
    const v = new SpatialView(this.host, gv, { tintByW: false });
    this.view = v;
    v.setLayout(layoutFor(d), false);
    const center = Math.floor(gv.count / 2);
    const cc = gv.coord(center);
    let count = 0;
    v.setVisual((i): CellVisual => {
      if (i === center) return { tone: "glow", fill: "#ffffff" };
      const c = gv.coord(i);
      const diff = c.map((x, a) => Math.abs(x - cc[a]));
      const nz = diff.filter((x) => x).length;
      const axis = diff.findIndex((x) => x);
      if (nz === 1) return { tone: "solid", fill: AXIS_COLORS[axis] };
      if (king && nz > 1) return { tone: "solid", fill: ["", "", "#e9e4ff", "#b9a8ff", "#8a74ff"][nz] };
      return { tone: "glass", dim: true };
    });
    for (let i = 0; i < gv.count; i++) {
      const c = gv.coord(i);
      const nz = c.filter((x, a) => x !== cc[a]).length;
      if (nz === 1 || (king && nz > 0)) count++;
    }
    const formula = king ? `3<sup>${d}</sup> − 1` : `2 × ${d}`;
    this.info.innerHTML = `<b>${d}D</b><span>${king ? "koningsburen" : "directe buren"} <i>${count}</i></span><span class="f">${formula}</span>`;
    this.info.remove();
    this.host.appendChild(this.info);
  }
  dispose() {
    this.view?.dispose();
    this.info.remove();
  }
}

/* ---------- 3. Indelingen ---------- */

class LayoutsWidget implements Widget {
  view: SpatialView;
  private bar: HTMLDivElement;
  constructor(host: HTMLElement, spec: WidgetSpec) {
    const g = Grid.cube(4, 3);
    this.view = new SpatialView(host, g, {});
    const center = g.index([1, 1, 1, 1]);
    this.view.setVisual((i): CellVisual => {
      const w = g.c(i, 3);
      return { tone: "solid", fill: ["#6cb8ff", "#a48bff", "#e07bff"][w], text: i === center ? "●" : undefined };
    });
    this.view.setSelected(center);
    this.bar = ctlBar(host);
    for (const l of ["tesseract", "slices", "boards"] as Layout[]) {
      const b = document.createElement("button");
      b.textContent = { tesseract: "Tesseract", slices: "Plakjes", boards: "Borden" }[l as "tesseract"];
      b.dataset.l = l;
      b.onclick = () => this.set(l);
      this.bar.appendChild(b);
    }
    this.update(spec);
  }
  private set(l: Layout) {
    this.view.setLayout(l, true);
    this.view.setAutoRotate(l === "tesseract");
    for (const b of this.bar.querySelectorAll("button")) b.classList.toggle("on", b.dataset.l === l);
  }
  update(spec: WidgetSpec) {
    if (spec.type !== "layouts") return;
    this.set(spec.layout);
  }
  dispose() {
    this.view.dispose();
    this.bar.remove();
  }
}

/* ---------- 4. Lijnen ---------- */

class LinesWidget implements Widget {
  view: SpatialView | null = null;
  private info: HTMLDivElement;
  private d = 0;
  constructor(private host: HTMLElement, spec: WidgetSpec) {
    this.info = badge(host);
    this.update(spec);
  }
  update(spec: WidgetSpec) {
    if (spec.type !== "lines" || spec.d === this.d) return;
    const d = (this.d = spec.d);
    this.view?.dispose();
    const g = Grid.cube(d, 4);
    const v = (this.view = new SpatialView(this.host, g, { tintByW: true }));
    v.setLayout(layoutFor(d), false);
    const sel = g.index([1, 2, 1, 2].slice(0, d));
    const axisOf = new Map<number, number>();
    for (let a = 0; a < d; a++) for (const c of g.lineThrough(sel, a)) if (c !== sel) axisOf.set(c, a);
    v.setVisual((i): CellVisual => {
      if (i === sel) return { tone: "glow", fill: "#ffffff" };
      const a = axisOf.get(i);
      return a !== undefined ? { tone: "solid", fill: AXIS_COLORS[a] } : { tone: "glass", dim: true };
    });
    v.setSelected(sel);
    const lines = d * 4 ** (d - 1);
    this.info.innerHTML = `<b>${d}D · 4<sup>${d}</sup> = ${g.count} cellen</b><span>lijnen door een cel <i>${d}</i></span><span>lijnen in totaal <i>${lines}</i></span>`;
    this.host.appendChild(this.info);
  }
  dispose() {
    this.view?.dispose();
    this.info.remove();
  }
}

/* ---------- 5. Hypervlakken en muren ---------- */

class HyperplaneWidget implements Widget {
  view: SpatialView | null = null;
  private bar: HTMLDivElement;
  private info: HTMLDivElement;
  private d = 0;
  private axis = 0;
  private k = 1;
  private wall = false;
  constructor(private host: HTMLElement, spec: WidgetSpec) {
    this.bar = ctlBar(host);
    this.info = badge(host);
    this.update(spec);
  }
  update(spec: WidgetSpec) {
    if (spec.type !== "hyperplane") return;
    if (spec.d !== this.d || !!spec.wall !== this.wall) {
      this.d = spec.d;
      this.wall = !!spec.wall;
      this.axis = spec.d - 1;
      this.k = 1;
      this.view?.dispose();
      const g = Grid.cube(this.d, 4);
      this.view = new SpatialView(this.host, g, { tintByW: false });
      this.view.setLayout(layoutFor(this.d), false);
      this.buildBar();
    }
    this.paint();
  }
  private buildBar() {
    this.bar.innerHTML = "";
    for (let a = 0; a < this.d; a++) {
      const b = document.createElement("button");
      b.innerHTML = `<b class="ax ${"xyzw"[a]}">${"xyzw"[a]}</b>`;
      b.onclick = () => {
        this.axis = a;
        this.paint();
      };
      b.dataset.a = String(a);
      this.bar.appendChild(b);
    }
    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.onclick = () => {
      this.k = Math.max(0, this.k - 1);
      this.paint();
    };
    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = () => {
      this.k = Math.min(3, this.k + 1);
      this.paint();
    };
    this.bar.append(minus, plus);
    this.host.appendChild(this.info);
  }
  private paint() {
    const v = this.view!;
    const g = v.grid;
    const ax = this.axis;
    const k = this.k;
    v.setVisual((i): CellVisual => {
      const c = g.c(i, ax);
      if (this.wall) {
        if (c === k) return { tone: "dark", fill: "#1a1f30" };
        return { tone: "solid", fill: c < k ? "#5ef2b4" : "#ff7a8a" };
      }
      return c === k ? { tone: "solid", fill: AXIS_COLORS[ax] } : { tone: "glass", dim: true };
    });
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>("button[data-a]")) b.classList.toggle("on", Number(b.dataset.a) === ax);
    const name = ["", "", "rij", "vlak (laag)", "3D-ruimte"][this.d];
    const L = "xyzw"[ax];
    this.info.innerHTML = this.wall
      ? `<b>${L} = ${k} als muur</b><span>${this.d - 1}D-muur scheidt ${this.d}D</span>`
      : `<b>${L} = ${k}</b><span>${name} van <i>${4 ** (this.d - 1)}</i> cellen</span>`;
  }
  dispose() {
    this.view?.dispose();
    this.bar.remove();
    this.info.remove();
  }
}

/* ---------- 6. Doorsnedes ---------- */

/** Householder-spiegeling die vector u op as e afbeeldt (werkt in elke dimensie). */
function reflectTo(u: number[], axis: number): (p: number[]) => number[] {
  const n = Math.hypot(...u);
  const un = u.map((x) => x / n);
  const v = un.map((x, a) => x - (a === axis ? 1 : 0));
  const vv = v.reduce((s, x) => s + x * x, 0);
  if (vv < 1e-12) return (p) => p.slice();
  return (p) => {
    const dot = p.reduce((s, x, a) => s + x * v[a], 0);
    return p.map((x, a) => x - (2 * dot * v[a]) / vv);
  };
}

class SliceWidget extends Stage implements Widget {
  private d: 3 | 4 = 3;
  private mode: "face" | "vertex" = "face";
  private h = 0;
  private verts: number[][] = [];
  private edges: [number, number][] = [];
  private range = 1;
  private obj = new THREE.Group();
  private bar: HTMLDivElement;
  private info: HTMLDivElement;
  private slider: HTMLInputElement;
  private playing = false;
  constructor(host: HTMLElement, spec: WidgetSpec) {
    super(host);
    this.scene.add(this.obj);
    this.bar = ctlBar(host);
    this.info = badge(host);
    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.min = "-1";
    this.slider.max = "1";
    this.slider.step = "0.005";
    this.slider.value = "0";
    this.slider.oninput = () => {
      this.playing = false;
      this.h = Number(this.slider.value) * this.range;
      this.build();
    };
    const play = document.createElement("button");
    play.textContent = "▶ Laat zakken";
    play.onclick = () => {
      this.playing = true;
      this.h = this.range;
    };
    this.bar.append(this.slider, play);
    this.addTicker((dt) => {
      if (!this.playing) return false;
      this.h -= dt * this.range * 0.45;
      if (this.h < -this.range) {
        this.h = -this.range;
        this.playing = false;
      }
      this.slider.value = String(this.h / this.range);
      this.build();
      return true;
    });
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.8;
    this.addTicker(() => true);
    this.update(spec);
  }
  update(spec: WidgetSpec) {
    if (spec.type !== "slice") return;
    this.d = spec.d;
    this.mode = spec.mode;
    const { verts, edges } = hypercube(this.d, 1);
    const axis = this.d - 1; // snijrichting: y in 3D (verticaal), w in 4D
    const u = this.mode === "vertex" ? new Array(this.d).fill(1) : Array.from({ length: this.d }, (_, a) => (a === axis ? 1 : 0));
    let R = reflectTo(u, axis);
    if (this.d === 3) {
      // in 3D snijden we langs y (verticaal); coördinaat 2 → y
      const R0 = reflectTo(u, 2);
      R = (p) => {
        const q = R0(p);
        return [q[0], q[2], q[1]];
      };
    }
    this.verts = verts.map((p) => R(p.slice(0, this.d)));
    this.edges = edges.map(([a, b]) => [a, b]);
    this.range = Math.max(...this.verts.map((p) => Math.abs(this.d === 3 ? p[1] : p[3]))) - 1e-3;
    this.h = this.mode === "vertex" ? this.range * (this.d === 4 ? 0.72 : 0.5) : 0;
    this.slider.value = String(this.h / this.range);
    this.frame(this.d === 3 ? 2.6 : 2.2, new THREE.Vector3(0.8, 0.55, 1));
    this.build();
  }
  private build() {
    for (const c of [...this.obj.children]) {
      this.obj.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const h = this.h;
    const pts: THREE.Vector3[] = [];
    const sliceAxis = this.d === 3 ? 1 : 3;
    for (const [a, b] of this.edges) {
      const p = this.verts[a];
      const q = this.verts[b];
      const pa = p[sliceAxis];
      const qa = q[sliceAxis];
      if ((pa - h) * (qa - h) > 0 || Math.abs(pa - qa) < 1e-9) continue;
      const t = (h - pa) / (qa - pa);
      const r = p.map((x, k) => x + (q[k] - x) * t);
      pts.push(new THREE.Vector3(r[0], r[1], r[2]));
    }
    const accent = new THREE.Color(this.d === 3 ? "#5ef2b4" : "#d77bff");
    if (this.d === 3) {
      // de kubus zelf als draadmodel + snijvlak
      const lineGeo = new THREE.BufferGeometry().setFromPoints(this.edges.flatMap(([a, b]) => [new THREE.Vector3(...this.verts[a]), new THREE.Vector3(...this.verts[b])]));
      this.obj.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.7 })));
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(4.2, 4.2),
        new THREE.MeshBasicMaterial({ color: 0x6cb8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = h;
      this.obj.add(plane);
      if (pts.length >= 3) {
        const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
        pts.sort((p, q) => Math.atan2(p.z - c.z, p.x - c.x) - Math.atan2(q.z - c.z, q.x - c.x));
        const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
        const sg = new THREE.ShapeGeometry(shape);
        const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = h + 0.002;
        this.obj.add(m);
        const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff }));
        this.obj.add(loop);
      }
      const names: Record<number, string> = { 3: "driehoek", 4: "vierkant", 5: "vijfhoek", 6: "zeshoek" };
      this.info.innerHTML = `<b>y = ${h.toFixed(2)}</b><span>doorsnede: <i>${pts.length >= 3 ? names[uniqueCount(pts)] ?? uniqueCount(pts) + "-hoek" : "niets"}</i></span>`;
    } else {
      if (pts.length >= 4) {
        const uniq = dedupe(pts);
        try {
          const geo = new ConvexGeometry(uniq);
          const mat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.15, transparent: true, opacity: 0.7, clearcoat: 1, side: THREE.DoubleSide });
          this.obj.add(new THREE.Mesh(geo, mat));
          const eg = new THREE.EdgesGeometry(geo, 10);
          this.obj.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0xffffff })));
          const faces = countFaces(geo);
          const names: Record<number, string> = { 4: "viervlak", 6: "kubus / zesvlak", 8: "achtvlak", 7: "zevenvlak", 5: "vijfvlak" };
          this.info.innerHTML = `<b>w = ${h.toFixed(2)}</b><span>doorsnede: <i>${names[faces] ?? faces + "-vlak"}</i></span><span>${uniq.length} hoekpunten</span>`;
        } catch {
          this.info.innerHTML = `<b>w = ${h.toFixed(2)}</b>`;
        }
      } else this.info.innerHTML = `<b>w = ${h.toFixed(2)}</b><span>doorsnede: <i>niets</i></span>`;
    }
    this.invalidate();
  }
  dispose() {
    this.bar.remove();
    this.info.remove();
    super.dispose();
  }
}

function dedupe(pts: THREE.Vector3[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of pts) if (!out.some((q) => q.distanceTo(p) < 1e-4)) out.push(p);
  return out;
}
function uniqueCount(pts: THREE.Vector3[]) {
  return dedupe(pts).length;
}
/** Aantal vlakken van een convex omhulsel (driehoeken samenvoegen op normaal). */
function countFaces(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute("position");
  const normals: THREE.Vector3[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-10) continue;
    n.normalize();
    if (!normals.some((m) => m.dot(n) > 0.999)) normals.push(n);
  }
  return normals.length;
}

/* ---------- 7. Draaien ---------- */

class RotateWidget implements Widget {
  view: GraphView;
  private bar: HTMLDivElement;
  private d = 0;
  private auto: HTMLButtonElement | null = null;
  constructor(host: HTMLElement, spec: WidgetSpec) {
    this.view = new GraphView(host);
    this.view.dist = 3.4;
    this.bar = ctlBar(host);
    this.bar.classList.add("sliders");
    this.update(spec);
  }
  update(spec: WidgetSpec) {
    if (spec.type !== "rotate" || spec.d === this.d) return;
    this.d = spec.d;
    const { verts, edges } = hypercube(this.d, 1);
    this.view.setGraph(
      verts.map((p) => ({ p: [...p] as Vec4, color: "#eef0ff", size: 0.065 })),
      edges.map(([a, b, ax]) => ({ a, b, color: AXIS_COLORS[ax], radius: 0.026, glow: 1 })),
    );
    this.view.rot = { xy: 0, xz: 0.4, yz: 0.3, xw: 0, yw: 0, zw: 0 };
    this.view.spin = {};
    this.view.layoutNodes();
    this.view.frame(2.4, new THREE.Vector3(0.6, 0.45, 1));
    this.bar.innerHTML = "";
    const planes: (keyof Rot4)[] = this.d === 3 ? ["xy", "xz", "yz"] : ["xy", "xz", "yz", "xw", "yw", "zw"];
    for (const p of planes) {
      const lab = document.createElement("label");
      const four = p.includes("w");
      lab.innerHTML = `<span class="${four ? "w4" : ""}">${p.toUpperCase()}</span>`;
      const s = document.createElement("input");
      s.type = "range";
      s.min = String(-Math.PI);
      s.max = String(Math.PI);
      s.step = "0.01";
      s.value = String(this.view.rot[p]);
      s.oninput = () => {
        this.view.spin = {};
        this.auto?.classList.remove("on");
        this.view.rot[p] = Number(s.value);
        this.view.layoutNodes();
      };
      lab.appendChild(s);
      this.bar.appendChild(lab);
    }
    const auto = document.createElement("button");
    auto.textContent = "Auto";
    auto.onclick = () => {
      const on = !auto.classList.contains("on");
      auto.classList.toggle("on", on);
      this.view.spin = on ? (this.d === 4 ? { xw: 0.5, yw: 0.21, xz: 0.1 } : { xz: 0.4, yz: 0.17 }) : {};
    };
    this.auto = auto;
    this.bar.appendChild(auto);
  }
  dispose() {
    this.view.dispose();
    this.bar.remove();
  }
}

export function createWidget(host: HTMLElement, spec: WidgetSpec): Widget {
  switch (spec.type) {
    case "extrude":
      return new ExtrudeWidget(host, spec);
    case "neighbors":
      return new NeighborsWidget(host, spec);
    case "layouts":
      return new LayoutsWidget(host, spec);
    case "lines":
      return new LinesWidget(host, spec);
    case "hyperplane":
      return new HyperplaneWidget(host, spec);
    case "slice":
      return new SliceWidget(host, spec);
    case "rotate":
      return new RotateWidget(host, spec);
  }
}

/** Tesseract-hero voor het beginscherm. */
export function heroTesseract(host: HTMLElement): GraphView {
  const v = new GraphView(host, { interactive: false });
  v.dist = 3.3;
  const { verts, edges } = hypercube(4, 1);
  v.setGraph(
    verts.map((p) => ({ p: [...p] as Vec4, color: "#ffffff", size: 0.055 })),
    edges.map(([a, b, ax]) => ({ a, b, color: AXIS_COLORS[ax], radius: 0.022, glow: 1.2 })),
  );
  v.rot = { xy: 0, xz: 0.6, yz: 0.35, xw: 0.5, yw: 0, zw: 0.2 };
  // 'minder beweging': een stilstaande tesseract
  if (!reducedMotion()) v.spin = { xw: 0.32, zw: 0.13, xz: 0.05 };
  v.frame(3.1, new THREE.Vector3(0, 0.1, 1));
  return v;
}
