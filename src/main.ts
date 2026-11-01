import "./styles.css";
import type { Screen } from "./ui/dom";
import { homeScreen } from "./ui/home";
import { courseScreen } from "./ui/course";
import { freeScreen } from "./ui/free";
import { playScreen } from "./ui/play";
import { lessonScreen } from "./ui/lesson";
import { duelScreen } from "./ui/duel";
import { settingsScreen } from "./ui/settings";

const app = document.getElementById("app")!;
let current: Screen | null = null;

function parse(): { parts: string[]; q: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(query ?? "") };
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
        next = lessonScreen(parts[1], q.get("stap") ?? undefined);
        break;
      case "kamertje":
        next = duelScreen(parts[1] ?? "2d-4", q.get("stap") ?? undefined);
        break;
      case "instellingen":
        next = settingsScreen();
        break;
      default:
        next = homeScreen();
    }
  } catch (e) {
    console.error(e);
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
route();
