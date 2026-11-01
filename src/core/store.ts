/** Lokale opslag: voortgang, instellingen, lopende puzzels. */
const PREFIX = "p4:";

function read<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(PREFIX + key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(v));
  } catch {
    /* vol of geblokkeerd: negeren */
  }
}

export interface Settings {
  sound: boolean;
  showErrors: boolean;
  rails: boolean;
  autoRotate: boolean;
  navPad: boolean;
}

export const store = {
  settings(): Settings {
    return { sound: true, showErrors: true, rails: true, autoRotate: false, navPad: true, ...read<Partial<Settings>>("settings", {}) };
  },
  setSettings(s: Partial<Settings>) {
    write("settings", { ...store.settings(), ...s });
  },
  doneSteps(): Record<string, { t: number; at: number }> {
    return read("done", {});
  },
  markDone(stepId: string, seconds: number) {
    const d = store.doneSteps();
    const prev = d[stepId];
    d[stepId] = { t: prev ? Math.min(prev.t, seconds) : seconds, at: Date.now() };
    write("done", d);
  },
  solvedCount(): Record<string, number> {
    return read("solved", {});
  },
  addSolved(type: string, dim: number) {
    const s = store.solvedCount();
    const k = `${type}:${dim}`;
    s[k] = (s[k] ?? 0) + 1;
    write("solved", s);
  },
  saveGame(key: string, state: unknown, seconds: number) {
    const all = read<Record<string, { s: unknown; t: number; at: number }>>("games", {});
    all[key] = { s: state, t: seconds, at: Date.now() };
    // hou het beperkt
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    for (const k of keys.slice(30)) delete all[k];
    write("games", all);
  },
  loadGame(key: string): { s: unknown; t: number } | null {
    const all = read<Record<string, { s: unknown; t: number }>>("games", {});
    return all[key] ?? null;
  },
  clearGame(key: string) {
    const all = read<Record<string, unknown>>("games", {});
    delete all[key];
    write("games", all);
  },
  cacheGet<T>(key: string): T | null {
    try {
      const s = sessionStorage.getItem(PREFIX + "gen:" + key);
      return s ? (JSON.parse(s) as T) : null;
    } catch {
      return null;
    }
  },
  cacheSet(key: string, v: unknown) {
    try {
      sessionStorage.setItem(PREFIX + "gen:" + key, JSON.stringify(v));
    } catch {
      /* negeren */
    }
  },
  resetAll() {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  },
};
