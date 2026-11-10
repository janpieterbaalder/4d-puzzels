import "./styles.css";
import { h, type Screen, toast, UI } from "./ui/dom";
import { homeScreen } from "./ui/home";
import { courseScreen } from "./ui/course";
import { freeScreen } from "./ui/free";
import { playScreen } from "./ui/play";
import { settingsScreen } from "./ui/settings";

const app = document.getElementById("app")!;
let current: Screen | null = null;

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
  window.scrollTo(0, 0);
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
