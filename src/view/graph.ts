import * as THREE from "three";
import { project4, rotate4, type Rot4, type Vec4, ZERO_ROT } from "./math4d";
import { Stage } from "./stage";
import { haloTexture } from "./textures";

export interface GNode {
  p: Vec4;
  color: string;
  size: number;
  visible?: boolean;
}
export interface GEdge {
  a: number;
  b: number;
  color: string;
  radius: number;
  opacity?: number;
  glow?: number;
  visible?: boolean;
}
export interface GFace {
  v: number[];
  color: string;
  opacity: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tmpC = new THREE.Color();

/** Draadmodel in (tot) 4D: hoekpunten, ribben en vlakken, met 4D-rotatie en projectie. */
export class GraphView extends Stage {
  nodes: GNode[] = [];
  edges: GEdge[] = [];
  faces: GFace[] = [];
  rot: Rot4 = { ...ZERO_ROT };
  spin: Partial<Rot4> = {};
  dist = 3.2;
  scale = 1;
  private p3: THREE.Vector3[] = [];
  private k: number[] = [];
  private nodeMesh: THREE.InstancedMesh | null = null;
  private edgeMesh: THREE.InstancedMesh | null = null;
  private glowMesh: THREE.InstancedMesh | null = null;
  private pickMesh: THREE.InstancedMesh | null = null;
  private faceMesh: THREE.Mesh | null = null;
  private halos: THREE.Sprite[] = [];
  private root = new THREE.Group();
  onEdgePick: ((k: number) => void) | null = null;
  onEdgeHover: ((k: number) => void) | null = null;
  pickRadius = 0.2;
  haloNodes = true;

  constructor(host: HTMLElement, opts: { interactive?: boolean } = {}) {
    super(host, opts);
    this.scene.add(this.root);
    this.addTicker((dt) => {
      let any = false;
      for (const [k, v] of Object.entries(this.spin)) {
        if (!v) continue;
        this.rot[k as keyof Rot4] += v * dt;
        any = true;
      }
      if (any) this.layoutNodes();
      return any;
    });
    this.bindPointer();
  }

  setGraph(nodes: GNode[], edges: GEdge[], faces: GFace[] = []) {
    this.nodes = nodes;
    this.edges = edges;
    this.faces = faces;
    this.rebuild();
  }

  private rebuild() {
    for (const m of [this.nodeMesh, this.edgeMesh, this.glowMesh, this.pickMesh, this.faceMesh]) {
      if (!m) continue;
      this.root.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    for (const h of this.halos) {
      this.root.remove(h);
      (h.material as THREE.Material).dispose();
    }
    this.halos = [];
    const N = Math.max(1, this.nodes.length);
    const E = Math.max(1, this.edges.length);
    this.nodeMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1, emissive: 0x111111 }),
      N,
    );
    this.edgeMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1, emissive: 0x0a0a0a, transparent: true }),
      E,
    );
    this.glowMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }),
      E,
    );
    this.pickMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1), new THREE.MeshBasicMaterial({ visible: false }), E);
    for (const m of [this.nodeMesh, this.edgeMesh, this.glowMesh, this.pickMesh]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
    if (this.faces.length) {
      const geo = new THREE.BufferGeometry();
      const tri = this.faces.length * 6;
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tri * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(tri * 4), 4));
      this.faceMesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      );
      this.faceMesh.frustumCulled = false;
      this.faceMesh.renderOrder = 1;
      this.root.add(this.faceMesh);
    } else this.faceMesh = null;
    if (this.haloNodes) {
      for (let i = 0; i < this.nodes.length; i++) {
        const h = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }),
        );
        this.halos.push(h);
        this.root.add(h);
      }
    }
    this.restyle();
  }

  /** Kleuren/zichtbaarheid opnieuw toepassen (na wijziging van nodes/edges/faces-stijlen). */
  restyle() {
    if (!this.nodeMesh) return;
    this.nodes.forEach((n, i) => {
      this.nodeMesh!.setColorAt(i, tmpC.set(n.color));
      const h = this.halos[i];
      if (h) {
        (h.material as THREE.SpriteMaterial).color.set(n.color);
        h.visible = n.visible !== false;
      }
    });
    this.edges.forEach((e, k) => {
      this.edgeMesh!.setColorAt(k, tmpC.set(e.color));
      this.glowMesh!.setColorAt(k, tmpC.set(e.color).multiplyScalar(e.glow ?? 1));
    });
    for (const m of [this.nodeMesh, this.edgeMesh, this.glowMesh]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
    if (this.faceMesh) {
      const col = this.faceMesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      this.faces.forEach((f, k) => {
        tmpC.set(f.color);
        for (let v = 0; v < 6; v++) col.setXYZW(k * 6 + v, tmpC.r, tmpC.g, tmpC.b, f.opacity);
      });
      col.needsUpdate = true;
    }
    this.layoutNodes();
  }

  layoutNodes() {
    const o: [number, number, number] = [0, 0, 0];
    const tmp: Vec4 = [0, 0, 0, 0];
    this.nodes.forEach((n, i) => {
      rotate4(n.p, this.rot, tmp);
      const k = project4(tmp, this.dist, o);
      (this.p3[i] ??= new THREE.Vector3()).set(o[0] * this.scale, o[1] * this.scale, o[2] * this.scale);
      this.k[i] = k;
    });
    if (!this.nodeMesh) return;
    this.nodes.forEach((n, i) => {
      const s = n.visible === false ? 1e-6 : n.size * this.k[i] * this.scale;
      tmpM.compose(this.p3[i], tmpQ.identity(), tmpS.setScalar(s));
      this.nodeMesh!.setMatrixAt(i, tmpM);
      const h = this.halos[i];
      if (h) {
        h.position.copy(this.p3[i]);
        h.scale.setScalar(s * 6);
      }
    });
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    this.edges.forEach((e, k) => {
      const a = this.p3[e.a];
      const b = this.p3[e.b];
      const kk = Math.min(this.k[e.a], this.k[e.b]) * this.scale;
      const vis = e.visible !== false;
      this.cyl(this.edgeMesh!, k, a, b, vis ? e.radius * kk : 1e-6);
      this.cyl(this.glowMesh!, k, a, b, vis && e.glow ? e.radius * kk * 2.6 : 1e-6);
      this.cyl(this.pickMesh!, k, a, b, this.pickRadius * kk);
    });
    for (const m of [this.edgeMesh, this.glowMesh, this.pickMesh]) {
      m!.instanceMatrix.needsUpdate = true;
      m!.boundingSphere = null;
    }
    if (this.faceMesh) {
      const pos = this.faceMesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      this.faces.forEach((f, k) => {
        const [a, b, c, d] = f.v.map((i) => this.p3[i]);
        const verts = [a, b, c, a, c, d];
        verts.forEach((v, j) => pos.setXYZ(k * 6 + j, v.x, v.y, v.z));
      });
      pos.needsUpdate = true;
      this.faceMesh.geometry.computeBoundingSphere();
    }
    this.invalidate();
  }

  private cyl(mesh: THREE.InstancedMesh, k: number, a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-6) {
      tmpM.makeScale(1e-6, 1e-6, 1e-6);
      mesh.setMatrixAt(k, tmpM);
      return;
    }
    tmpQ.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
    const mid = a.clone().add(b).multiplyScalar(0.5);
    tmpM.compose(mid, tmpQ, tmpS.set(r, len, r));
    mesh.setMatrixAt(k, tmpM);
  }

  nodePos(i: number): THREE.Vector3 {
    return this.p3[i];
  }

  private pickEdge(ev: PointerEvent): number {
    if (!this.pickMesh) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hits = rc.intersectObject(this.pickMesh).filter((h) => h.instanceId !== undefined && this.edges[h.instanceId]?.visible !== false);
    return hits.length ? hits[0].instanceId! : -1;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
    el.addEventListener("pointerup", (e) => {
      if (!down || !this.onEdgePick) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      down = null;
      if (moved > 6 || dt > 600) return;
      const k = this.pickEdge(e);
      if (k >= 0) this.onEdgePick(k);
    });
    let pending = false;
    el.addEventListener("pointermove", (e) => {
      if (!this.onEdgeHover || pending || e.pointerType === "touch") return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        this.onEdgeHover?.(this.pickEdge(e));
      });
    });
    el.addEventListener("pointerleave", () => this.onEdgeHover?.(-1));
  }
}

/** Hoekpunten en ribben van een d-dimensionale hyperkubus (d ≤ 4), gecentreerd. */
export function hypercube(d: number, size = 1): { verts: Vec4[]; edges: [number, number, number][] } {
  const verts: Vec4[] = [];
  for (let m = 0; m < 1 << d; m++) {
    const p: Vec4 = [0, 0, 0, 0];
    for (let a = 0; a < d; a++) p[a] = (m & (1 << a) ? 1 : -1) * size;
    verts.push(p);
  }
  const edges: [number, number, number][] = [];
  for (let m = 0; m < 1 << d; m++) for (let a = 0; a < d; a++) if (!(m & (1 << a))) edges.push([m, m | (1 << a), a]);
  return { verts, edges };
}
