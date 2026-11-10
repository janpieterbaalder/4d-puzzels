# Puzzel⁴ — speels leren denken in vier dimensies

Bekende logische puzzels, eerst in **2D**, dan in **3D** en ten slotte als echte **4D-puzzel**. Een leerpad (de 4D-cursus) neemt je stap voor stap mee; daarnaast kun je elke puzzelsoort vrij spelen in elke dimensie.

Vormgeving: donker ruimtethema met glazen cellen, in dezelfde familie als Sudoku³, maar met een eigen kleurtaal. Elke as heeft vast dezelfde kleur (**x** rood, **y** groen, **z** blauw, **w** paars), en elke puzzelsoort heeft een eigen accentkleur.

## Wat zit erin

| Puzzel | Oorsprong | 2D | 3D | 4D | Wat leer je over 4D |
|---|---|---|---|---|---|
| Lichtjes | Lights Out | ✓ | ✓ | ✓ | Een cel heeft 2·D directe buren (4 → 6 → 8). |
| Doolhof | labyrint | ✓ | ✓ | ✓ | Bewegen langs w; doorsnede-modus: je ziet live alleen je eigen 2D-plakje, bezochte plakjes blijven zwak zichtbaar en de ster altijd. |
| Binair | Binairo / Takuzu | ✓ | ✓ | ✓ | Door elke cel lopen D lijnen. |
| Sudoku | sudoku / Latijns vierkant | ✓ | ✓ | ✓ | Lijnen in 4 richtingen; waarom blokken niet in alle 6 vlakken passen. |
| Futoshiki | futoshiki | ✓ | ✓ | ✓ | Ongelijkheden die "de diepte in" of "ana/kata" wijzen. |
| Tectonic | Tectonic® / Suguru | ✓ | ✓ | ✓ | Koningsburen 8 → 26 → 80, en waarom de diagonaalregel in 3D/4D breekt. |
| Hitori | hitori | ✓ | ✓ | ✓ | Samenhang: in 4D is een gebied veel moeilijker af te sluiten. |
| Zeeslag | Battleships | ✓ | ✓ | ✓ | Hypervlakken: een rij → een laag → een hele 3D-ruimte. |
| Tentje-boompje | Tents & Trees | ✓ | ✓ | ✓ | Een tent kan ana/kata van zijn boom staan. |
| Kamertje verhuren | Dots & Boxes | ✓ | ✓ | ✓ | Duel tegen de computer op een tesseract: 32 ribben, 24 kamers, elke streep raakt 3 kamers. |

Bewust **weggelaten**: *Bruggen bouwen* (Hashi) en *Ikura*. Bij bruggen is "niet kruisen" de kern van de puzzel; in 3D/4D verliest die regel zijn betekenis, en de 4D-weergave van lijnen tussen eilanden werd onleesbaar. *Ikura* heb ik niet kunnen thuisbrengen als bekende puzzelsoort; daarom niet opgenomen.

Aanpassingen aan de oorspronkelijke regels (en waarom):

- **Binair**: de regel "geen twee gelijke rijen" vervalt; in lijnen van lengte 4 is "geen drie op een rij" automatisch waar.
- **Tectonic**: in 3D en 4D tellen alleen directe buren. Met de diagonaalregel zou je 8 (3D) of 16 (4D) verschillende cijfers nodig hebben, terwijl gebieden er hoogstens 5 hebben. Dit is lesstof in de cursus.
- **Sudoku 3D**: twee varianten. *Stapelsudoku*: elk bord (x–y) is een sudoku, daarnaast alleen lijnen. *Sudokubus* (ook in de cursus): 2×2-blokken in alle drie de richtingen (x–y, x–z, y–z), dus elke snede is een sudoku.
- **Sudoku 4D**: "Dubbele sudoku": elk bord is een sudoku, én elke vaste plek over alle 16 borden vormt ook een sudoku (blokken in het xy- en zw-vlak). Daarnaast een "Latijnse" variant zonder blokken.
- **Zeeslag / Tentje-boompje**: de getallen tellen per *hypervlak* (rij in 2D, laag in 3D, 3D-plak in 4D).

## De 4D-cursus

10 hoofdstukken, 48 stappen, van Platland naar de meesterproef. Lessen zijn korte kaarten met een interactief 3D/4D-model:

- **Dimensies stapelen**: punt → lijn → vierkant → kubus → tesseract, met tellingen (16 hoekpunten, 32 ribben, 24 vlakken, 8 kubussen).
- **Buren tellen** en **koningsburen** (2·D en 3ᴰ − 1).
- **4D op een plat scherm**: dezelfde 81 cellen geanimeerd van tesseract-projectie naar plakjes naar borden.
- **Doorsnedes**: een kubus en een tesseract die door een lager-dimensionale wereld zakken (vierkant/driehoek/zeshoek; kubus/viervlak/achtvlak), met schuifbalk.
- **Lijnen**, **hypervlakken**, **muren in 4D** en **draaien in zes vlakken**.

Voortgang wordt alleen lokaal in de browser bewaard (`localStorage`).

## Weergaven

- **Bord**: plat "bord-van-borden". Met *Lagen langs x · y · z (· w)* kies je langs welke as de borden gesneden worden: z = vooraanzicht (x, y), y = bovenaanzicht (x, z), x = zijaanzicht (z, y); in 4D bepaal je zo welke as van bord tot bord verandert. 3D = een rij borden (z), 4D = een raster van borden (kolommen = z, rijen = w). Beweeg over een cel: lichtsporen in vier kleuren tonen de lijnen erdoor, ook door andere borden heen.
- **Ruimte** (three.js): kubus / lagen voor 3D; tesseract-projectie (met echte 4D-rotatie in het xw- en zw-vlak), plakjes en borden voor 4D, met geanimeerde overgangen.

- **Navigeren in 3D/4D**: in de ruimte-weergave staan onderaan gecentreerd twee kleine pijlkruisen: links binnen het bord (x/y, met in het midden Wissel/Druk), rechts tussen de borden (z links/rechts, w boven/onder, met ↺). Zo bereik je ook binnenste cellen; *Lijnen* of *Laag* licht de lijnen of de laag van de gekozen cel uit (de rest blijft even groot maar vaag en doorzichtig, met gedimde cijfers); bij *Laag* kies je liggend (y vast), staand (z vast, zoals de borden) of diepte (x vast), en in 4D ook *binnen*: de hele kubus van de gekozen cel (w vast), in de tesseract een binnen- of buitenkubus. Het selectiekader is altijd zichtbaar, ook achter andere cellen. In het platte bord is elke cel direct aan te tikken.

Toetsen: pijltjes bewegen in het bord, `Shift` + `←`/`→` naar het bord links/rechts (z), `Shift` + `↑`/`↓` naar het bord erboven/eronder (w). Cijfers invullen met `1`–`9`, `Ctrl`+`Z` terug, `H` hint.

## Puzzelgeneratie

Alle puzzels worden in de browser gegenereerd (Web Worker), reproduceerbaar via een seed, en hebben precies één oplossing:

- een eigen constraint-solver met bitmask-domeinen en propagatie (alle-verschillend met hidden singles, groter-dan, tellingen, geen-drie-op-een-rij) voor Binair, Sudoku, Futoshiki en Tectonic;
- eigen solvers voor Hitori (samenhang), Zeeslag (plaatsingen per hypervlak) en Tentje-boompje (boom-tent-koppeling);
- "makkelijk/normaal" vereist oplosbaarheid met alleen logische stappen (propagatie, geen gokken), "moeilijk" alleen uniciteit;
- Lichtjes: oplossing en minimaal aantal drukken via lineaire algebra over GF(2).

`npm test` genereert elke variant met meerdere seeds (plus alle cursuspuzzels) en controleert onder meer:

- de puzzel is deterministisch en de oplossing wordt herkend;
- de oplossing voldoet aan de regels, die in `tests/logic.test.ts` nog eens los van de spelcode zijn uitgeschreven;
- er is precies één oplossing: met de oplosser van het spel, en voor kleine puzzels ook met een eigen, eenvoudige teller;
- een afwijking van de oplossing telt niet als opgelost, en hints beweren nooit iets wat niet klopt;
- Lichtjes: het genoemde minimum is echt minimaal; Doolhof: de kortste route klopt; Kamertje verhuren: telling, beurtwissel en computerzetten in hele partijen.

## Ontwikkelen

```bash
npm install
npm run dev       # lokale server
npm test          # generator- en oplostests
npm run build     # typecheck + productie-build in dist/
```

## Code

```
src/core/         rooster in N dimensies, seeded random, CSP-solver, opslag, geluid
src/puzzles/      de negen puzzelsoorten (generator + spelregels)
src/games/        Kamertje verhuren (duel + computertegenstander)
src/view/         plat bord-van-borden, three.js-ruimte, 4D-draadmodel, 4D-wiskunde
src/course/       hoofdstukken en lessen
src/ui/           schermen: start, cursus, vrij spelen, speelscherm, les, duel, instellingen
tests/            generator- en oplostests (vitest)
```

Lettertypen: Outfit en Unbounded (SIL Open Font License, zie `public/fonts`). Tectonic® is een merk van de uitgever; deze app gebruikt alleen de algemene puzzelregel.
