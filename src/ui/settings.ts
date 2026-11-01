import { store, type Settings } from "../core/store";
import { askConfirm, h, type Screen, UI } from "./dom";

export function settingsScreen(): Screen {
  const s = store.settings();
  const row = (key: keyof Settings, label: string, help: string) => {
    const input = h("input", { type: "checkbox", ...(s[key] ? { checked: true } : {}) }) as HTMLInputElement;
    input.onchange = () => store.setSettings({ [key]: input.checked });
    return h("label", { class: "setting" }, h("span", {}, h("b", {}, label), h("small", {}, help)), input);
  };
  const root = h(
    "div",
    { class: "screen settings" },
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
