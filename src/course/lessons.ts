/** Lessen: korte kaarten met tekst en een interactief 3D/4D-model. */
export type WidgetSpec =
  | { type: "extrude"; d: number; spin?: boolean }
  | { type: "neighbors"; d: number; king?: boolean }
  | { type: "layouts"; layout: "tesseract" | "slices" | "boards" }
  | { type: "slice"; d: 3 | 4; mode: "face" | "vertex" }
  | { type: "lines"; d: number }
  | { type: "hyperplane"; d: number; wall?: boolean }
  | { type: "rotate"; d: 3 | 4 };

export interface LessonCard {
  title: string;
  text: string;
  widget: WidgetSpec;
  tip?: string;
}

export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  cards: LessonCard[];
}

const X = '<b class="ax x">x</b>';
const Y = '<b class="ax y">y</b>';
const Z = '<b class="ax z">z</b>';
const W = '<b class="ax w">w</b>';

export const LESSONS: Lesson[] = [
  {
    id: "dimensies",
    title: "Dimensies stapelen",
    subtitle: "Van punt naar tesseract",
    cards: [
      {
        title: "Een punt",
        text: "Begin met één punt. Geen lengte, geen breedte, geen diepte: <b>nul dimensies</b>. Er is nergens om heen te gaan.",
        widget: { type: "extrude", d: 0 },
      },
      {
        title: "Schuif: een lijn",
        text: `Schuif het punt op langs ${X}. Het spoor is een lijnstuk: <b>één dimensie</b>. Je kunt alleen vooruit of achteruit. 2 hoekpunten, 1 ribbe.`,
        widget: { type: "extrude", d: 1 },
      },
      {
        title: "Nog eens: een vierkant",
        text: `Schuif het lijnstuk haaks op zichzelf, langs ${Y}. Je krijgt een vierkant: 4 hoekpunten, 4 ribben. Dit is <b>Platland</b>, de wereld van gewone puzzels op papier.`,
        widget: { type: "extrude", d: 2 },
      },
      {
        title: "De diepte in: een kubus",
        text: `Schuif het vierkant langs ${Z}, de diepte in. Een kubus: 8 hoekpunten, 12 ribben, 6 vlakken. Sleep in het beeld om hem te draaien.`,
        widget: { type: "extrude", d: 3 },
      },
      {
        title: "De vierde stap",
        text: `Nu het onvoorstelbare: schuif de kubus in een richting die haaks staat op ${X}, ${Y} én ${Z}. Die richting heet ${W}; de twee kanten heten <b>ana</b> en <b>kata</b>. Het resultaat is een <b>tesseract</b>. Zien kunnen we hem niet, wel zijn schaduw: een kubus in een kubus, met paarse ribben ertussen.`,
        widget: { type: "extrude", d: 4 },
      },
      {
        title: "Het patroon",
        text: "Elke stap verdubbelt het aantal hoekpunten (1, 2, 4, 8, <b>16</b>). De ribben: alle oude ribben twee keer, plus één nieuwe per hoekpunt (0, 1, 4, 12, <b>32</b>). Je hoeft 4D niet te <i>zien</i> om erover te <i>redeneren</i>. Dat ga je in deze cursus doen, puzzel voor puzzel.",
        widget: { type: "extrude", d: 4, spin: true },
        tip: "Kijk hoe de binnenste kubus door de buitenste heen draait: dat is een draaiing in het xw-vlak.",
      },
    ],
  },
  {
    id: "buren",
    title: "Buren tellen",
    subtitle: "2 · 4 · 6 · 8",
    cards: [
      { title: "Op een lijn", text: "Een cel op een lijn heeft <b>2 buren</b>: links en rechts.", widget: { type: "neighbors", d: 1 } },
      { title: "In een vlak", text: `Boven en onder komen erbij (${Y}): <b>4 buren</b>.`, widget: { type: "neighbors", d: 2 } },
      { title: "In de ruimte", text: `Voor en achter (${Z}): <b>6 buren</b>. Draai het model om ze allemaal te zien.`, widget: { type: "neighbors", d: 3 } },
      {
        title: "In vier dimensies",
        text: `Ana en kata (${W}): <b>8 buren</b>. De twee nieuwe buren zitten op precies dezelfde plek in de kubus ernaast. Elke dimensie voegt er 2 toe: een cel heeft <b>2 × D</b> directe buren.`,
        widget: { type: "neighbors", d: 4 },
      },
      {
        title: "Wat betekent dat voor Lichtjes?",
        text: "Bij Lichtjes wisselen een cel en al zijn directe buren tegelijk. In 2D zijn dat er 5, in 3D 7 en in 4D 9. Je gaat dat zo zelf voelen.",
        widget: { type: "neighbors", d: 4 },
      },
    ],
  },
  {
    id: "scherm",
    title: "4D op een plat scherm",
    subtitle: "Tesseract → plakjes → borden",
    cards: [
      {
        title: "De schaduw",
        text: `Dit is een rooster van 3 × 3 × 3 × 3 = 81 cellen. De kleur volgt ${W}. Projecteer je het naar 3D, dan zit de laag met ${W} = 0 binnenin en ${W} = 2 buitenom: de bekende kubus-in-een-kubus.`,
        widget: { type: "layouts", layout: "tesseract" },
      },
      {
        title: "Plakjes",
        text: `Overzichtelijker: zet de drie 3D-plakjes naast elkaar. Elk plakje is een gewone kubus met een vaste ${W}. Eén stap langs ${W} brengt je naar <b>dezelfde plek in de kubus ernaast</b>.`,
        widget: { type: "layouts", layout: "slices" },
      },
      {
        title: "Borden",
        text: `Snijd elke kubus ook nog in lagen langs ${Z}. Dan krijg je een raster van platte borden: <b>kolommen zijn ${Z}, rijen zijn ${W}</b>. Dit is het platte bord dat je bij elke 4D-puzzel krijgt.`,
        widget: { type: "layouts", layout: "boards" },
      },
      {
        title: "De vuistregel",
        text: `Twee cellen zijn 4D-buren als ze in hetzelfde bord naast elkaar liggen (${X}, ${Y}), óf op <b>precies dezelfde plek</b> in het bord links/rechts (${Z}) of erboven/eronder (${W}). Beweeg in een puzzel over een cel: lichtsporen in vier kleuren tonen de vier lijnen erdoor.`,
        widget: { type: "layouts", layout: "boards" },
      },
    ],
  },
  {
    id: "doorsnede",
    title: "Doorsnedes",
    subtitle: "Wat een plat wezen ziet",
    cards: [
      {
        title: "Een kubus zakt door Platland",
        text: "Stel je een plat wezen voor in een plat vlak. Zakt er een kubus door zijn wereld, dan ziet het alleen de <b>doorsnede</b>: een vierkant dat opeens verschijnt, even blijft en weer verdwijnt. Speel met de schuif.",
        widget: { type: "slice", d: 3, mode: "face" },
      },
      {
        title: "Op een punt",
        text: "Kantel dezelfde kubus op een hoekpunt. Nu ziet het platte wezen een <b>driehoek</b> die groeit, een <b>zeshoek</b> wordt en weer krimpt. Dezelfde kubus, totaal andere doorsnedes.",
        widget: { type: "slice", d: 3, mode: "vertex" },
      },
      {
        title: "Wij zijn het platte wezen",
        text: "Schuift er een tesseract door <i>onze</i> ruimte, dan zien wij een <b>kubus</b> die verschijnt, blijft en verdwijnt.",
        widget: { type: "slice", d: 4, mode: "face" },
      },
      {
        title: "Een tesseract op een punt",
        text: "Gekanteld op een hoekpunt groeit er een <b>viervlak</b>, dat via een <b>achtvlak</b> weer krimpt tot een omgekeerd viervlak. Zo ziet een 4D-voorwerp eruit voor wezens uit 3D.",
        widget: { type: "slice", d: 4, mode: "vertex" },
      },
      {
        title: "In het doolhof",
        text: "In de <b>doorsnede-modus</b> van het doolhof zie je alleen je eigen 2D-plakje. Doorgangen naar andere lagen zie je als gekleurde pijltjes. Zo voelt dwalen in een hogere dimensie.",
        widget: { type: "slice", d: 4, mode: "vertex" },
      },
    ],
  },
  {
    id: "lijnen",
    title: "Lijnen door een cel",
    subtitle: "2 · 3 · 4 richtingen",
    cards: [
      { title: "2D", text: "In een gewone puzzel lopen door elke cel twee lijnen: een <b>rij</b> en een <b>kolom</b>.", widget: { type: "lines", d: 2 } },
      { title: "3D", text: `In 3D komt er een <b>pilaar</b> bij (${Z}). Een 3D-sudoku moet dus in drie richtingen kloppen.`, widget: { type: "lines", d: 3 } },
      {
        title: "4D",
        text: `In 4D: vier lijnen. De ${W}-lijn loopt door dezelfde plek in elke kubus. Elke regel als ‘elk cijfer één keer’ geldt ineens in een extra richting.`,
        widget: { type: "lines", d: 4 },
      },
      {
        title: "Tellen",
        text: "Een 4 × 4-bord heeft 8 lijnen. Een 4 × 4 × 4-kubus 48. Een 4 × 4 × 4 × 4-tesseract heeft er 256: in elke richting 64. Meer regels betekent: meer houvast. Vaak heb je in 4D verrassend weinig gegeven cijfers nodig.",
        widget: { type: "lines", d: 4 },
      },
    ],
  },
  {
    id: "koning",
    title: "Koningsburen",
    subtitle: "8 · 26 · 80",
    cards: [
      { title: "2D met diagonalen", text: "Tel je ook de diagonalen mee, dan heeft een cel <b>8 buren</b>, zoals een koning op een schaakbord.", widget: { type: "neighbors", d: 2, king: true } },
      { title: "3D", text: "In 3D: <b>26</b>. Een blokje van 3 × 3 × 3 min de cel zelf.", widget: { type: "neighbors", d: 3, king: true } },
      { title: "4D", text: "In 4D: 3⁴ − 1 = <b>80 buren</b>. Bijna alles raakt alles.", widget: { type: "neighbors", d: 4, king: true } },
      {
        title: "Een regel die breekt",
        text: "In Tectonic mogen gelijke cijfers elkaar niet raken, ook niet schuin. In 3D raken de 8 cellen van een 2 × 2 × 2-blokje elkaar allemaal: dan heb je 8 verschillende cijfers nodig, terwijl gebieden er maar 5 hebben. In 4D zelfs 16. Daarom tellen in 3D en 4D alleen de <b>directe</b> buren.",
        widget: { type: "neighbors", d: 3, king: true },
      },
    ],
  },
  {
    id: "hypervlak",
    title: "Hypervlakken",
    subtitle: "Rij → vlak → ruimte",
    cards: [
      { title: "Een rij", text: "In Zeeslag staat bij elke rij een getal. Een rij krijg je door één coördinaat vast te zetten, bijvoorbeeld y = 1.", widget: { type: "hyperplane", d: 2 } },
      { title: "Een laag", text: "Zet je in 3D één coördinaat vast, dan krijg je geen lijn maar een heel <b>vlak</b>: een laag van de kubus. Dát is in 3D het broertje van een rij.", widget: { type: "hyperplane", d: 3 } },
      {
        title: "Een hele ruimte",
        text: "In 4D levert één vaste coördinaat een complete 3D-ruimte op: een <b>hypervlak</b>. In 4D-zeeslag telt elk getal dus de scheepsdelen in een hele kubus.",
        widget: { type: "hyperplane", d: 4 },
      },
      {
        title: "Schepen tussen werelden",
        text: "Een schip dat langs w ligt, steekt door meerdere van die 3D-ruimtes tegelijk. In het platte bord zie je het als stukjes op dezelfde plek in borden onder elkaar.",
        widget: { type: "hyperplane", d: 4 },
      },
    ],
  },
  {
    id: "samenhang",
    title: "Muren in 4D",
    subtitle: "Wat scheidt een ruimte?",
    cards: [
      { title: "In 2D", text: "Eén rij zwarte cellen knipt een plat bord in tweeën. Links kan niet meer bij rechts.", widget: { type: "hyperplane", d: 2, wall: true } },
      { title: "In 3D", text: "In een kubus loop je om een rij heen. Je hebt een hele <b>wand</b> nodig om de ruimte te scheiden.", widget: { type: "hyperplane", d: 3, wall: true } },
      {
        title: "In 4D",
        text: "In 4D kun je zelfs om een wand heen, via ana of kata. Pas een volledige 3D-ruimte scheidt de twee helften. In Hitori moeten de witte cellen één geheel blijven: in 4D raakt dat veel minder snel versnipperd.",
        widget: { type: "hyperplane", d: 4, wall: true },
      },
    ],
  },
  {
    id: "draaien",
    title: "Draaien in een vlak",
    subtitle: "1 · 3 · 6 draaivlakken",
    cards: [
      {
        title: "Draaien is een vlak",
        text: "We zeggen ‘draaien om een as’, maar eigenlijk draai je <b>in een vlak</b>. In 2D is er één draaivlak (xy). In 3D zijn er drie: xy, xz en yz.",
        widget: { type: "rotate", d: 3 },
      },
      {
        title: "Zes in 4D",
        text: "In 4D zijn er <b>zes</b> draaivlakken. Drie ervan (xw, yw, zw) bestaan in onze ruimte niet. Probeer de schuifjes: de binnenste kubus keert zich binnenstebuiten. Er vervormt niets; het is de schaduw die zo beweegt.",
        widget: { type: "rotate", d: 4 },
      },
      {
        title: "Kamers op een tesseract",
        text: "Een tesseract heeft 24 vierkante vlakken. Straks verhuur je die als kamers. Elke ribbe hoort bij precies 3 vlakken: met één streep kun je dus drie kamers tegelijk afmaken. Of weggeven.",
        widget: { type: "rotate", d: 4 },
      },
    ],
  },
];

export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.id, l]));
