import type { Step } from "../course/curriculum";

/** URL van een cursusstap. */
export function stepHref(s: Step): string {
  switch (s.kind) {
    case "lesson":
      return `#/les/${s.lesson}?stap=${s.id}`;
    case "puzzle":
      return `#/speel/${s.type}/${s.preset}/${s.seed}?stap=${s.id}${s.fog ? "&fog=1" : ""}`;
    case "duel":
      return `#/kamertje/${s.preset}?stap=${s.id}`;
  }
}

export function go(hash: string) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}
