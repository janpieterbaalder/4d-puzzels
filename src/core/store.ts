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
  padDone: boolean;
  padPeers: boolean;
}

export const store = {
  settings(): Settings {
    return { sound: true, showErrors: true, rails: true, autoRotate: false, navPad: true, padDone: true, padPeers: false, ...read<Partial<Settings>>("settings", {}) };
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
  /** `sig` is een vingerafdruk van de puzzel: verandert de puzzel bij dezelfde sleutel, dan vervalt de opslag. */
  saveGame(key: string, state: unknown, seconds: number, sig?: string) {
    const all = read<Record<string, { s: unknown; t: number; at: number; sig?: string }>>("games", {});
    all[key] = { s: state, t: seconds, at: Date.now(), sig };
    // hou het beperkt
    const keys = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
    for (const k of keys.slice(30)) delete all[k];
    write("games", all);
  },
  loadGame(key: string): { s: unknown; t: number; sig?: string } | null {
    const all = read<Record<string, { s: unknown; t: number; sig?: string }>>("games", {});
    return all[key] ?? null;
  },
  /** Onafgemaakte puzzels, nieuwste eerst. Sleutel: soort:variant:seed:doorsnede. */
  recentGames(): { key: string; type: string; preset: string; seed: string; fog: boolean; t: number; at: number }[] {
    const all = read<Record<string, { t: number; at: number }>>("games", {});
    return Object.entries(all)
      .map(([key, g]) => {
        const parts = key.split(":");
        return { key, type: parts[0], preset: parts[1], seed: parts.slice(2, -1).join(":"), fog: parts[parts.length - 1] === "1", t: g.t ?? 0, at: g.at ?? 0 };
      })
      .sort((a, b) => b.at - a.at);
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
    try {
      for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIX)) sessionStorage.removeItem(k);
    } catch {
      /* negeren */
    }
  },
  /** Alles wat de app bewaart (voortgang, instellingen, lopende puzzels), voor een back-up. */
  exportAll(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) out[k] = localStorage.getItem(k)!;
    return out;
  },
  /** Zet een back-up terug. Geeft het aantal teruggezette onderdelen, of -1 als het bestand niet klopt. */
  importAll(data: unknown): number {
    if (!data || typeof data !== "object" || Array.isArray(data)) return -1;
    const entries = Object.entries(data as Record<string, unknown>).filter(([k, v]) => k.startsWith(PREFIX) && typeof v === "string");
    if (!entries.length) return -1;
    for (const [, v] of entries) {
      try {
        JSON.parse(v as string);
      } catch {
        return -1;
      }
    }
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    for (const [k, v] of entries) localStorage.setItem(k, v as string);
    return entries.length;
  },
};
