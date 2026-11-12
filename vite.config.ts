import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Bestanden die niet in de offline-cache hoeven: alleen voor zoekmachines en deelkaartjes. */
const NOT_CACHED = new Set(["sw.js", "index.html", "robots.txt", "og.png"]);

/** Schrijft dist/sw.js: het sjabloon met de lijst van alle bestanden uit deze build. */
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "puzzel4-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) walk(join(dir, entry.name), prefix + entry.name + "/");
          else if (!NOT_CACHED.has(prefix + entry.name) && !entry.name.endsWith(".txt")) files.push(prefix + entry.name);
        }
      };
      walk(outDir, "");
      files.sort();
      const hash = createHash("sha256");
      for (const f of ["index.html", ...files]) hash.update(f).update(readFileSync(join(outDir, f)));
      const template = readFileSync("scripts/sw.template.js", "utf8");
      const list = JSON.stringify(["./", ...files.map((f) => "./" + f)]);
      writeFileSync(join(outDir, "sw.js"), template.replace("__VERSION__", hash.digest("hex").slice(0, 12)).replace("__FILES__", list));
    },
  };
}

/** De headers voor alle paden uit vercel.json, zodat `vite preview` zich gedraagt als productie. */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { headers?: { source: string; headers: { key: string; value: string }[] }[] };
  const all = config.headers?.find((h) => h.source === "/(.*)");
  return Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));
}

export default defineConfig({
  base: "./",
  plugins: [serviceWorker()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
  },
  preview: { headers: productionHeaders() },
  worker: { format: "es" },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 120000,
  },
} as any);
