import { store, type Settings } from "../core/store";
import { askConfirm, h, type Screen, toast, UI } from "./dom";

export function settingsScreen(): Screen {
  const s = store.settings();
  const row = (key: keyof Settings, label: string, help: string) => {
    const input = h("input", { type: "checkbox", ...(s[key] ? { checked: true } : {}) }) as HTMLInputElement;
    input.onchange = () => store.setSettings({ [key]: input.checked });
    return h("label", { class: "setting" }, h("span", {}, h("b", {}, label), h("small", {}, help)), input);
  };
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: "puzzel4", versie: 1, datum: new Date().toISOString(), data: store.exportAll() }, null, 1)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `puzzel4-voortgang-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast("Back-up opgeslagen bij je downloads.", "good");
  }
  const picker = h("input", { type: "file", accept: "application/json,.json", hidden: true }) as HTMLInputElement;
  picker.onchange = async () => {
    const file = picker.files?.[0];
    picker.value = "";
    if (!file) return;
    let parsed: any = null;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      /* geen JSON */
    }
    if (parsed?.app !== "puzzel4" || !parsed.data) return toast("Dit is geen back-up van Puzzel⁴.", "warn");
    if (!(await askConfirm("De voortgang op dit apparaat wordt vervangen door de back-up. Doorgaan?", "Terugzetten"))) return;
    if (store.importAll(parsed.data) < 0) return toast("De back-up kon niet worden gelezen.", "warn");
    toast("Back-up teruggezet.", "good");
    location.hash = "#/";
  };
  // Offline: na het eerste bezoek staat de hele app in de browser (zie scripts/sw.template.js).
  const offline = h("small", { role: "status" }, "Wordt voorbereid…");
  const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
  if (!sw) offline.textContent = "Deze browser ondersteunt dat niet.";
  else if (!import.meta.env.PROD) offline.textContent = "Alleen in de gepubliceerde versie.";
  else sw.ready.then(() => (offline.textContent = "Klaar. De app werkt op dit apparaat ook zonder internet."));
  const root = h(
    "div",
    { class: "screen settings" },
    picker,
    h(
      "header",
      { class: "topbar" },
      h("a", { class: "round-btn", href: "#/", "aria-label": "Home", html: UI.back }),
      h("div", { class: "title" }, h("span", { class: "t-name" }, "Instellingen")),
    ),
    h(
      "div",
      { class: "settings-list card" },
      row("sound", "Geluid", "Zachte klikjes en een deuntje bij het oplossen."),
      row("showErrors", "Fouten tonen", "Markeer cellen die met een regel in strijd zijn."),
      row("rails", "Lichtsporen", "Toon de lijnen (x, y, z, w) door de cel onder je muis."),
      row("autoRotate", "4D-draai bij start", "Laat de tesseract-weergave vanzelf in 4D draaien."),
      row("padDone", "Klare cijfers dimmen", "Een cijfer op het toetsenblok wordt lichter zodra het in de hele puzzel vaak genoeg staat."),
      row("padPeers", "Onmogelijke cijfers dimmen", "Hulp: dimt ook cijfers die al bij een buur van de gekozen cel staan."),
      row("navPad", "Navigatiepijlen in de 3D-weergave", "Zwevende pijlkruisen om de gekozen cel langs x, y, z en w te verplaatsen, ook naar binnenste cellen."),
      h(
        "div",
        { class: "setting" },
        h(
          "span",
          {},
          h("b", {}, "Back-up van je voortgang"),
          h("small", {}, "Je voortgang staat alleen in deze browser. Met een back-up neem je hem mee naar een ander apparaat."),
          h(
            "span",
            { class: "backup" },
            h("button", { class: "btn ghost small", onclick: exportBackup }, "Back-up opslaan"),
            h("button", { class: "btn ghost small", onclick: () => picker.click() }, "Back-up terugzetten"),
          ),
        ),
      ),
      h("div", { class: "setting" }, h("span", {}, h("b", {}, "Offline spelen"), offline)),
      h(
        "button",
        {
          class: "btn ghost danger",
          onclick: async () => {
            if (await askConfirm("Alle voortgang en opgeslagen puzzels wissen?", "Wissen")) {
              store.resetAll();
              location.hash = "#/";
            }
          },
        },
        "Voortgang wissen",
      ),
    ),
    h(
      "div",
      { class: "card about" },
      h("h3", {}, "Over Puzzel⁴"),
      h(
        "p",
        {},
        "Elke puzzel wordt in je browser gegenereerd en heeft precies één oplossing. De cursuspuzzels liggen vast, vrij spelen geeft telkens een nieuwe. Je voortgang staat alleen op dit apparaat.",
      ),
      h("p", {}, "Tectonic® is een geregistreerd merk van de uitgever; deze app is er niet aan verbonden en gebruikt alleen de algemene puzzelregel."),
    ),
  );
  return { el: root, dispose() {} };
}
