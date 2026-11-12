/* Puzzel⁴ — service worker. Sjabloon: de build vult VERSION en FILES in (zie vite.config.ts).
 *
 * - Bij installatie komt de hele app in de cache, zodat hij daarna zonder internet werkt.
 * - Paginabezoek: eerst het netwerk (altijd de nieuwste versie), zonder internet de cache.
 * - Overige bestanden: eerst de cache. Bestanden in /assets hebben een hash in hun naam,
 *   dus een andere inhoud heeft altijd een andere naam.
 * - Een nieuwe versie wacht tot alle tabbladen dicht zijn. Een open spel houdt daardoor
 *   de bestanden waarmee het is gestart.
 */
const VERSION = "__VERSION__";
const CACHE = "p4-" + VERSION;
const FILES = __FILES__;
const PAGE = "./";
// Een server kan "Vary: Origin" meesturen; zonder ignoreVary vindt een script- of lettertypeverzoek
// het bewaarde bestand dan niet terug.
const MATCH = { ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("p4-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function page(request) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    return await fetch(request, { signal: ctl.signal });
  } catch (err) {
    const cached = await caches.match(PAGE, MATCH);
    if (cached) return cached;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const res = await fetch(request);
  // Alleen bestanden met een hash in de naam erbij bewaren: die verouderen niet.
  if (res.ok && res.type === "basic" && new URL(request.url).pathname.includes("/assets/")) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === "navigate" ? page(request) : asset(request));
});
