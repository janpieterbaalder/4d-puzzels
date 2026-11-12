// Maakt de PNG-iconen en de deelafbeelding in public/ opnieuw.
// Eenmalig hulpmiddel, geen onderdeel van de build. Vereist Playwright met Chromium:
//   node scripts/make-icons.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
// als data-URL, want een pagina zonder adres mag geen lokale bestanden laden
const font = (name) => "data:font/woff2;base64," + readFileSync(join(pub, "fonts", name)).toString("base64");

const GLYPH = `
  <g fill="none" stroke-linejoin="round" stroke-width="2.4">
    <path d="M32 7l22 12.5v25L32 57 10 44.5v-25z" stroke="#6cb8ff"/>
    <path d="M32 21l10 5.8v11.5L32 44l-10-5.7V26.8z" stroke="#d77bff"/>
    <path d="M32 7v14M54 19.5l-12 7.3M54 44.5l-12-6.2M32 57V44M10 44.5l12-6.2M10 19.5l12 7.3" stroke="#5ef2b4" stroke-width="1.8" opacity=".9"/>
  </g>`;

/** Vierkant icoon met volledige achtergrond; `scale` is het deel dat de figuur inneemt. */
const square = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">
  <defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#1d1c45"/><stop offset="1" stop-color="#05060f"/></radialGradient></defs>
  <rect width="64" height="64" fill="url(#g)"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${GLYPH}</g>
</svg>`;

const page = (body, css = "") => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Outfit"; src: url("${font("outfit-latin-wght.woff2")}") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Unbounded"; src: url("${font("unbounded-latin-wght.woff2")}") format("woff2"); font-weight: 200 900; }
html, body { margin: 0; height: 100%; background: transparent; }
${css}</style></head><body>${body}</body></html>`;

const OG_CSS = `
body { display: flex; align-items: center; gap: 56px; padding: 0 84px; box-sizing: border-box; color: #eef0ff;
  background: radial-gradient(900px 620px at 18% 30%, rgba(108, 75, 255, .42), transparent 62%),
    radial-gradient(760px 560px at 88% 82%, rgba(31, 182, 255, .26), transparent 62%),
    radial-gradient(620px 480px at 70% 8%, rgba(255, 79, 184, .18), transparent 60%), #05060f; }
svg { width: 330px; height: 330px; flex: none; filter: drop-shadow(0 0 34px rgba(108, 184, 255, .45)); }
h1 { font: 800 96px/1 "Unbounded", sans-serif; margin: 0 0 22px; letter-spacing: -.02em; }
h1 sup { font-size: .5em; color: #5ef2b4; vertical-align: top; position: relative; top: -.1em; margin-left: .04em; }
p { font: 400 40px/1.25 "Outfit", sans-serif; margin: 0 0 30px; color: #c9cdf0; }
.dims { display: flex; align-items: center; gap: 18px; font: 700 34px/1 "Unbounded", sans-serif; }
.dims b { padding: 14px 22px; border-radius: 18px; background: rgba(255, 255, 255, .08); border: 1.5px solid rgba(255, 255, 255, .16); }
.dims b:nth-child(1) { color: #6cb8ff; } .dims b:nth-child(3) { color: #d77bff; } .dims b:nth-child(5) { color: #5ef2b4; }
.dims i { font-style: normal; color: #8087ad; }`;

const OG_BODY = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 2 56 60">${GLYPH}</svg>
<div><h1>Puzzel<sup>4</sup></h1><p>Puzzelen in vier dimensies</p>
<div class="dims"><b>2D</b><i>→</i><b>3D</b><i>→</i><b>4D</b></div></div>`;

const jobs = [
  { file: "icon-192.png", w: 192, h: 192, html: page(readFileSync(join(pub, "icon.svg"), "utf8"), "svg{width:100%;height:100%;display:block}"), transparent: true },
  { file: "icon-512.png", w: 512, h: 512, html: page(readFileSync(join(pub, "icon.svg"), "utf8"), "svg{width:100%;height:100%;display:block}"), transparent: true },
  // maskable: de figuur blijft binnen de veilige zone (middelste 80%), ook bij een ronde uitsnede
  { file: "icon-maskable-512.png", w: 512, h: 512, html: page(square(0.7), "svg{display:block}") },
  { file: "apple-touch-icon.png", w: 180, h: 180, html: page(square(0.86), "svg{display:block}") },
  { file: "og.png", w: 1200, h: 630, html: page(OG_BODY, OG_CSS) },
];

const browser = await chromium.launch();
for (const job of jobs) {
  const tab = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 });
  await tab.setContent(job.html);
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: join(pub, job.file), omitBackground: !!job.transparent });
  await tab.close();
  console.log("geschreven:", job.file);
}
await browser.close();
