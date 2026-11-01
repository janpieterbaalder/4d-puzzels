import { store } from "./store";

/** Kleine gesynthetiseerde geluidjes (WebAudio), zonder bestanden. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (!store.settings().sound) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.06, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tap() {
    tone(660, 0.07, "triangle", 0.035);
  },
  place() {
    tone(520, 0.09, "sine", 0.05);
    tone(780, 0.08, "sine", 0.03, 0.03);
  },
  step(axis: number) {
    tone([392, 466, 554, 698][axis] ?? 440, 0.09, "triangle", 0.045);
  },
  bump() {
    tone(140, 0.12, "square", 0.025);
  },
  error() {
    tone(220, 0.16, "sawtooth", 0.025);
  },
  hint() {
    tone(880, 0.12, "sine", 0.04);
    tone(1320, 0.18, "sine", 0.025, 0.08);
  },
  claim(n = 1) {
    for (let k = 0; k < n; k++) tone(700 + 180 * k, 0.14, "triangle", 0.05, k * 0.07);
  },
  win() {
    [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, 0.35, "triangle", 0.05, k * 0.09));
  },
};
