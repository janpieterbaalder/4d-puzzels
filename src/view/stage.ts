import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Gedeelde basis voor alle 3D-weergaven: renderer, camera, orbit-besturing,
 * omgevingslicht en een render-lus die alleen tekent als er iets verandert.
 */
export class Stage {
  readonly host: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private raf = 0;
  private dirty = true;
  private ro: ResizeObserver;
  private tickers = new Set<(dt: number) => boolean | void>();
  private last = performance.now();
  private disposed = false;
  private visible = true;
  private io: IntersectionObserver | null = null;

  constructor(host: HTMLElement, opts: { interactive?: boolean; fov?: number } = {}) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.classList.add("stage-canvas");
    host.appendChild(canvas);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1030, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(4, 7, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xd77bff, 0.7);
    rim.position.set(-6, -2, -5);
    this.scene.add(rim);

    this.camera = new THREE.PerspectiveCamera(opts.fov ?? 38, 1, 0.05, 500);
    this.camera.position.set(6, 5, 9);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.rotateSpeed = 0.8;
    this.controls.enabled = opts.interactive !== false;
    // alleen echt draaien/zoomen telt als 'zelf verplaatst', niet een tik op een cel
    let dragging = false;
    this.controls.addEventListener("start", () => (dragging = true));
    this.controls.addEventListener("end", () => (dragging = false));
    this.controls.addEventListener("change", () => {
      if (dragging) this.userMoved = true;
      this.invalidate();
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    if ("IntersectionObserver" in window) {
      this.io = new IntersectionObserver((e) => {
        this.visible = e[0]?.isIntersecting ?? true;
        if (this.visible) this.invalidate();
      });
      this.io.observe(host);
    }
    this.resize();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  invalidate() {
    this.dirty = true;
  }

  /** Functie die elk frame draait; geef true terug zolang er geanimeerd wordt. */
  addTicker(fn: (dt: number) => boolean | void) {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  private lastFrame: [number, THREE.Vector3, THREE.Vector3] | null = null;
  /** Bij formaatwijziging opnieuw kaderen (alleen zolang de gebruiker de camera niet zelf verplaatste). */
  reframeOnResize = true;
  protected userMoved = false;

  /** Ruimte (px) onderin die door knoppen bedekt is; het beeld schuift zo dat het model erboven staat. */
  insetBottom = 0;

  /** Deel van de hoogte dat vrij is (voor kadering). */
  protected freeFraction(): number {
    const h = Math.max(1, this.host.clientHeight);
    return Math.max(0.35, (h - this.insetBottom) / h);
  }

  private applyViewOffset() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const off = Math.min(this.insetBottom, h * 0.65) / 2;
    if (off > 0.5) this.camera.setViewOffset(w, h, 0, off, w, h);
    else this.camera.clearViewOffset();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyViewOffset();
    this.camera.updateProjectionMatrix();
    if (this.reframeOnResize && !this.userMoved && this.lastFrame) this.frame(...this.lastFrame);
    this.invalidate();
  }

  /** Camera zo plaatsen dat een bol met straal r rond het midden in beeld past. */
  frame(radius: number, dir = new THREE.Vector3(0.55, 0.42, 1), target = new THREE.Vector3()) {
    this.lastFrame = [radius, dir.clone(), target.clone()];
    const fov = (this.camera.fov * Math.PI) / 180;
    const fitH = radius / Math.sin(fov / 2) / this.freeFraction();
    const fitW = radius / Math.sin(Math.atan(Math.tan(fov / 2) * this.camera.aspect));
    const d = Math.max(fitH, fitW) * 1.04;
    this.controls.target.copy(target);
    this.camera.position.copy(dir.clone().normalize().multiplyScalar(d).add(target));
    this.camera.near = Math.max(0.05, d / 100);
    this.camera.far = d * 10;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  private loop(now: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible) return;
    let animating = false;
    for (const t of this.tickers) if (t(dt)) animating = true;
    if (this.controls.enabled) this.controls.update();
    if (animating) this.dirty = true;
    if (this.dirty) {
      this.dirty = false;
      this.beforeRender();
      this.renderer.render(this.scene, this.camera);
    }
  }

  protected beforeRender() {}

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io?.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
