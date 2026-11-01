/** Het leerpad: hoofdstukken met lessen, puzzels en duels, van 2D via 3D naar 4D. */
export type Step =
  | { id: string; kind: "lesson"; lesson: string }
  | { id: string; kind: "puzzle"; type: string; preset: string; seed: string; fog?: boolean; note?: string }
  | { id: string; kind: "duel"; preset: string; note?: string };

export interface Chapter {
  id: string;
  n: number;
  title: string;
  concept: string;
  steps: Step[];
}

const P = (id: string, type: string, preset: string, extra: Partial<Extract<Step, { kind: "puzzle" }>> = {}): Step => ({
  id,
  kind: "puzzle",
  type,
  preset,
  seed: "c-" + id,
  ...extra,
});

export const CHAPTERS: Chapter[] = [
  {
    id: "platland",
    n: 1,
    title: "Welkom in Platland",
    concept: "Dimensies stapelen: punt, lijn, vierkant, kubus, tesseract.",
    steps: [
      { id: "l-dim", kind: "lesson", lesson: "dimensies" },
      P("lo2a", "lightsout", "2d-3", { note: "Druk op een lampje: het lampje én zijn 4 buren wisselen." }),
      P("lo2b", "lightsout", "2d-5"),
    ],
  },
  {
    id: "diepte",
    n: 2,
    title: "Een stap de diepte in",
    concept: "Elke dimensie geeft een cel twee buren extra.",
    steps: [
      { id: "l-buren", kind: "lesson", lesson: "buren" },
      P("lo3", "lightsout", "3d-3", { note: "Nu 6 buren: ook in het bord links en rechts, op dezelfde plek." }),
      { id: "l-scherm", kind: "lesson", lesson: "scherm" },
      P("lo4a", "lightsout", "4d-2", { note: "De 16 hoekpunten van een tesseract. Elk heeft precies 4 buren, één per as." }),
      P("lo4b", "lightsout", "4d-3", { note: "8 buren per cel. Kijk ook in de borden erboven en eronder." }),
    ],
  },
  {
    id: "doorsnede",
    n: 3,
    title: "Doorsnedes",
    concept: "Een hogere dimensie zie je in plakjes.",
    steps: [
      { id: "l-doorsnede", kind: "lesson", lesson: "doorsnede" },
      P("mz2", "maze", "2d-7"),
      P("mz3", "maze", "3d-3", { note: "Gekleurde pijltjes zijn doorgangen naar de laag ernaast." }),
      P("mz3f", "maze", "3d-4", { fog: true, note: "Doorsnede-modus: je ziet alleen je eigen laag." }),
      P("mz4", "maze", "4d-3", { note: "Blauw = naar het bord links/rechts (z). Paars = naar het bord boven/onder (w)." }),
      P("mz4f", "maze", "4d-3", { fog: true, seed: "c-mz4f", note: "Platland-modus in 4D. Onthoud waar je vandaan komt!" }),
    ],
  },
  {
    id: "lijnen",
    n: 4,
    title: "Lijnen in alle richtingen",
    concept: "Door elke cel lopen D lijnen.",
    steps: [
      { id: "l-lijnen", kind: "lesson", lesson: "lijnen" },
      P("bi2", "binary", "2d-6"),
      P("bi3", "binary", "3d-4", { note: "Elke rij, kolom én pilaar: twee nullen en twee enen." }),
      P("su2", "sudoku", "2d-4"),
      P("su3", "sudoku", "3d-stack", { note: "Elk bord is een sudoku, én elke pilaar door de borden heen bevat 1–4." }),
      P("su4", "sudoku", "4d-latin3", { note: "Geen blokken, alleen lijnen: in elke richting 1, 2 en 3." }),
      P("bi4", "binary", "4d-4", { note: "256 cellen, 256 lijnen. Elke lijn: twee nullen, twee enen." }),
    ],
  },
  {
    id: "groter",
    n: 5,
    title: "Groter dan",
    concept: "Ongelijkheden die de diepte in wijzen.",
    steps: [P("fu2", "futoshiki", "2d-4"), P("fu3", "futoshiki", "3d-3"), P("fu4", "futoshiki", "4d-3")],
  },
  {
    id: "koning",
    n: 6,
    title: "Buren en diagonalen",
    concept: "8, 26, 80: waarom een regel kan breken.",
    steps: [
      { id: "l-koning", kind: "lesson", lesson: "koning" },
      P("te2", "tectonic", "2d-5"),
      P("te3", "tectonic", "3d-3", { note: "Gebieden lopen door de borden heen: dezelfde tint = hetzelfde gebied." }),
      P("te4", "tectonic", "4d-3"),
    ],
  },
  {
    id: "hypervlak",
    n: 7,
    title: "Hypervlakken",
    concept: "Een rij in 2D, een laag in 3D, een kubus in 4D.",
    steps: [
      { id: "l-hypervlak", kind: "lesson", lesson: "hypervlak" },
      P("bs2", "battleships", "2d-6"),
      P("bs3", "battleships", "3d-4", { note: "De getallen tellen nu hele lagen. Beweeg over een getal om de laag te zien." }),
      P("tt2", "tents", "2d-6"),
      P("tt3", "tents", "3d-4"),
      P("tt4", "tents", "4d-3", { note: "Een tent kan ook ana of kata van zijn boom staan." }),
      P("bs4", "battleships", "4d-4"),
    ],
  },
  {
    id: "samenhang",
    n: 8,
    title: "Samenhang",
    concept: "In 4D is het moeilijk iets af te sluiten.",
    steps: [
      { id: "l-samenhang", kind: "lesson", lesson: "samenhang" },
      P("hi2", "hitori", "2d-5"),
      P("hi3", "hitori", "3d-4"),
      P("hi4", "hitori", "4d-3"),
    ],
  },
  {
    id: "draaien",
    n: 9,
    title: "Draaien in vier dimensies",
    concept: "Zes draaivlakken en kamers op een tesseract.",
    steps: [
      { id: "l-draaien", kind: "lesson", lesson: "draaien" },
      { id: "db2", kind: "duel", preset: "2d-4", note: "Speel tegen de computer. Wie een kamer afmaakt, mag nog een keer." },
      { id: "db3", kind: "duel", preset: "3d-3" },
      { id: "db4", kind: "duel", preset: "4d-2", note: "Eén streep raakt hier 3 kamers tegelijk." },
    ],
  },
  {
    id: "meester",
    n: 10,
    title: "Meesterproef",
    concept: "Echte 4D-puzzels, zonder vangnet.",
    steps: [
      P("m-su", "sudoku", "4d-double", { note: "Elk bord een sudoku, en elke vaste plek over alle borden ook." }),
      P("m-fu", "futoshiki", "4d-4"),
      P("m-hi", "hitori", "4d-4"),
      P("m-mz", "maze", "4d-4", { fog: true }),
      P("m-te", "tectonic", "4d-3h"),
    ],
  },
];

export const ALL_STEPS: { chapter: Chapter; step: Step; index: number }[] = CHAPTERS.flatMap((c) => c.steps.map((s, index) => ({ chapter: c, step: s, index })));

export function stepById(id: string) {
  return ALL_STEPS.find((s) => s.step.id === id) ?? null;
}

export function nextStep(id: string) {
  const i = ALL_STEPS.findIndex((s) => s.step.id === id);
  return i >= 0 && i + 1 < ALL_STEPS.length ? ALL_STEPS[i + 1] : null;
}
