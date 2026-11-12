import "./styles.css";
import { LESSON_BY_ID } from "./course/lessons";
import { DB_PRESETS } from "./games/dotsboxes";
import { TYPES } from "./puzzles/registry";
import { announce, h, type Screen, toast, UI, watchToggles } from "./ui/dom";
import { homeScreen } from "./ui/home";
import { courseScreen } from "./ui/course";
import { freeScreen } from "./ui/free";
import { playScreen } from "./ui/play";
import { settingsScreen } from "./ui/settings";

const app = document.getElementById("app")!;
app.tabIndex = -1; // zodat de focus na een schermwissel bovenaan het nieuwe scherm begint
let current: Screen | null = null;
let firstRoute = true;
watchToggles();

/** Titel van het tabblad (en voor schermlezers) per scherm. */
function titleFor(parts: string[]): string {
  const base = "Puzzel⁴";
  switch (parts[0]) {
    case "cursus":
      return `De 4D-cursus · ${base}`;
    case "vrij":
      return `Vrij spelen · ${base}`;
    case "speel": {
      const t = TYPES[parts[1]];
      const p = t?.presets.find((x) => x.id === parts[2]);
      return t && p ? `${t.name} ${p.sizes.length}D · ${base}` : base;
    }
    case "les":
      return `${LESSON_BY_ID[parts[1]]?.title ?? "Les"} · ${base}`;
    case "kamertje": {
      const p = DB_PRESETS.find((x) => x.id === parts[1]);
      return `Kamertje verhuren${p ? ` ${p.dots.length}D` : ""} · ${base}`;
    }
    case "instellingen":
      return `Instellingen · ${base}`;
    default:
      return `${base} · puzzelen in vier dimensies`;
  }
}

function parse(): { parts: string[]; q: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(query ?? "") };
}

/**
 * Na een nieuwe versie bestaan oude codebestanden niet meer op de server. Lukt het laden van een
 * onderdeel daardoor niet, dan herladen we één keer (hooguit eens per minuut) om de nieuwe versie te halen.
 */
function reloadIfStale(): boolean {
  try {
    const last = Number(sessionStorage.getItem("p4:reloaded") ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem("p4:reloaded", String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}
window.addEventListener("vite:preloadError", (e) => {
  if (reloadIfStale()) e.preventDefault();
});

// Offline: de service worker bewaart de app na het eerste bezoek. Alleen in de gebouwde versie.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* zonder service worker werkt de app gewoon, alleen niet offline */
    });
  });
}

/** Scherm waarvan de code (met de 3D-bibliotheek) pas geladen wordt als het nodig is. */
function lazyScreen(load: () => Promise<Screen>): Screen {
  const el = h("div", { class: "screen lazy" }, h("div", { class: "loading" }, h("div", { class: "spinner", html: UI.tesseract }), h("p", {}, "Laden…")));
  let inner: Screen | null = null;
  let gone = false;
  load().then(
    (s) => {
      if (gone) return s.dispose();
      inner = s;
      el.replaceWith(s.el);
    },
    (err) => {
      console.error(err);
      if (gone || reloadIfStale()) return;
      el.innerHTML = "";
      el.append(
        h(
          "div",
          { class: "loading" },
          h("p", {}, "Dit onderdeel kon niet laden. Controleer je verbinding."),
          h("button", { class: "btn primary", onclick: () => location.reload() }, "Opnieuw proberen"),
        ),
      );
    },
  );
  return {
    el,
    dispose() {
      gone = true;
      inner?.dispose();
    },
  };
}

function route() {
  const { parts, q } = parse();
  let next: Screen;
  try {
    switch (parts[0]) {
      case "cursus":
        next = courseScreen();
        break;
      case "vrij":
        next = freeScreen(parts[1]);
        break;
      case "speel":
        next = playScreen({ type: parts[1], preset: parts[2], seed: parts[3] ?? "x", fog: q.get("fog") === "1", step: q.get("stap") ?? undefined });
        break;
      case "les":
        next = lazyScreen(() => import("./ui/lesson").then((m) => m.lessonScreen(parts[1], q.get("stap") ?? undefined)));
        break;
      case "kamertje":
        next = lazyScreen(() => import("./ui/duel").then((m) => m.duelScreen(parts[1] ?? "2d-4", q.get("stap") ?? undefined)));
        break;
      case "instellingen":
        next = settingsScreen();
        break;
      case undefined:
        next = homeScreen();
        break;
      default:
        throw new Error("onbekende pagina " + parts[0]);
    }
  } catch (e) {
    // foute of verouderde link: naar de startpagina, mét melding en een kloppende adresbalk
    console.error(e);
    toast(parts[0] === "speel" ? "Deze puzzel bestaat niet (meer)." : "Deze pagina bestaat niet.", "warn");
    history.replaceState(null, "", "#/");
    parts.length = 0;
    next = homeScreen();
  }
  current?.dispose();
  app.innerHTML = "";
  current = next;
  app.appendChild(next.el);
  document.body.dataset.screen = parts[0] ?? "home";
  document.title = titleFor(parts);
  window.scrollTo(0, 0);
  // na een schermwissel: focus naar het nieuwe scherm en de titel voorlezen (niet bij het eerste laden)
  if (!firstRoute) {
    app.focus({ preventScroll: true });
    announce(document.title);
  }
  firstRoute = false;
}

window.addEventListener("hashchange", route);
// onverwachte fouten niet stil laten: één melding (niet bij elke herhaling)
let lastErrorToast = 0;
const onError = () => {
  if (Date.now() - lastErrorToast < 8000) return;
  lastErrorToast = Date.now();
  toast("Er ging iets mis. Werkt iets niet meer, herlaad dan de pagina.", "warn", 6000);
};
window.addEventListener("error", (e) => {
  if (e.error) onError(); // geen meldingen voor bv. een mislukt plaatje
});
window.addEventListener("unhandledrejection", onError);
route();
