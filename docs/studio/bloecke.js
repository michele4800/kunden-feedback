// Bausteine für den Editor: fertige Sektionen und einfache Elemente.
// Sie übernehmen Schrift und Farben der Website (inherit / CSS-Variablen mit Rückfallwert) und ordnen sich auf dem Handy von selbst untereinander.
(function () {
  const BILD = (window.KF_STUDIO_BASIS || "") + "studio/platzhalter.svg";
  const sek = inhalt => `<section style="padding:72px 20px"><div style="max-width:1100px;margin:0 auto">${inhalt}</div></section>`;
  const spalten = (min, inhalt) => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(${min}px,1fr));gap:32px;align-items:center">${inhalt}</div>`;
  const bild = alt => `<img src="${BILD}" alt="${alt}" style="width:100%;height:auto;display:block;border-radius:8px">`;
  const knopf = text => `<a href="#" style="display:inline-block;padding:13px 24px;border-radius:999px;background:var(--kf-akzent,currentColor);color:var(--kf-auf-akzent,#fff);text-decoration:none;font-weight:600">${text}</a>`;
  const karte = (titel, preis, text) => `<div style="padding:28px;border:1px solid var(--kf-linie,rgba(0,0,0,.15));border-radius:10px"><h3>${titel}</h3><p style="font-size:1.6em;font-weight:700;margin:6px 0">${preis}</p><p>${text}</p></div>`;
  const ikon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const galeriebild = alt => `<img src="${BILD}" alt="${alt}" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;border-radius:6px">`;
  // Formular-Felder: Beschriftung über dem Feld, volle Breite
  const FS = "width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--kf-linie,rgba(0,0,0,.25));border-radius:6px;font:inherit";
  const feld = (titel, innen) => `<label style="display:grid;gap:4px;font-weight:600">${titel}${innen}</label>`;
  const eingabe = (titel, name, typ = "text", extra = "") => feld(titel, `<input name="${name}" type="${typ}" maxlength="300" style="${FS};font-weight:400"${extra}>`);
  const textfeld = (titel, name, extra = "") => feld(titel, `<textarea name="${name}" rows="5" maxlength="4000" style="${FS};font-weight:400"${extra}></textarea>`);
  const einwilligung = `<label style="display:flex;gap:10px;align-items:flex-start;font-size:.9em"><input type="checkbox" name="einwilligung" value="ja" required style="margin-top:4px"> Ich bin einverstanden, dass meine Angaben zur Beantwortung der Anfrage gespeichert werden. Mehr dazu in der Datenschutzerklärung.</label>`;
  const absenden = text => `<button type="submit" style="justify-self:start;padding:13px 24px;border:0;border-radius:999px;background:var(--kf-akzent,#333);color:var(--kf-auf-akzent,#fff);font:inherit;font-weight:600;cursor:pointer">${text}</button><p data-komp-meldung></p>`;
  const formular = (art, titel, innen, knopf) => sek(`<h2>${titel}</h2><form data-komp="formular" data-formular="${art}" style="display:grid;gap:14px;max-width:600px">${innen}${einwilligung}${absenden(knopf)}</form>`);
  const frage = (f, a) => `<details style="border-bottom:1px solid var(--kf-linie,rgba(0,0,0,.15));padding:4px 0"><summary style="cursor:pointer;font-weight:600;padding:12px 0">${f}</summary><p>${a}</p></details>`;
  const S = "Sektionen", E = "Elemente", K = "Komponenten";
  const KOMPONENTEN = [
    { id: "kontaktformular", category: K, label: "Kontaktformular", media: ikon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h5"/>'),
      content: formular("kontakt", "Schreibt uns", eingabe("Name", "name", "text", ' required autocomplete="name"') + eingabe("E-Mail", "email", "email", ' required autocomplete="email"') + eingabe("Telefon (freiwillig)", "telefon", "tel", ' autocomplete="tel"') + textfeld("Nachricht", "nachricht", " required"), "Nachricht senden") },
    { id: "anfrageformular", category: K, label: "Anfrage / Buchung", media: ikon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
      content: formular("anfrage", "Anfrage", eingabe("Name", "name", "text", ' required autocomplete="name"') + eingabe("E-Mail", "email", "email", ' required autocomplete="email"') + eingabe("Telefon", "telefon", "tel", ' autocomplete="tel"')
        + eingabe("Wunschtermin", "termin", "date") + eingabe("Personen", "personen", "number", ' min="1" max="500"') + textfeld("Was wünscht ihr euch?", "nachricht"), "Anfrage senden") },
    { id: "feedbackformular", category: K, label: "Feedback", media: ikon('<path d="M4 5h16v11H8l-4 4z"/>'),
      content: formular("feedback", "Wie war's?", feld("Bewertung", `<select name="bewertung" style="${FS};font-weight:400"><option>Sehr gut</option><option>Gut</option><option>Geht so</option><option>Nicht gut</option></select>`)
        + textfeld("Was sollen wir wissen?", "nachricht", " required") + eingabe("Name (freiwillig)", "name"), "Absenden") },
    { id: "feld-text", category: K, label: "Eingabefeld", media: ikon('<rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 12h1"/>'), content: eingabe("Beschriftung", "feld") },
    { id: "feld-mehrzeilig", category: K, label: "Textfeld", media: ikon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h6"/>'), content: textfeld("Beschriftung", "text") },
    { id: "feld-ankreuzen", category: K, label: "Ankreuzfeld", media: ikon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>'),
      content: `<label style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="auswahl" value="ja"> Beschriftung</label>` },
    { id: "faq", category: K, label: "Fragen & Antworten", media: ikon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01"/>'),
      content: sek(`<h2>Häufige Fragen</h2><div data-komp="faq">${frage("Wann habt ihr geöffnet?", "Antwort hier eintragen.") + frage("Kann ich vorbestellen?", "Antwort hier eintragen.") + frage("Wo kann ich parken?", "Antwort hier eintragen.")}</div>`) },
    { id: "frage", category: K, label: "Eine Frage", media: ikon('<path d="M6 9l6 6 6-6"/>'), content: frage("Neue Frage?", "Antwort hier eintragen.") },
    { id: "slider", category: K, label: "Bilder-Reihe (Slider)", media: ikon('<rect x="6" y="5" width="12" height="14" rx="1"/><path d="M3 8v8M21 8v8"/>'),
      content: sek(`<div data-komp="slider" style="display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px">${[1, 2, 3, 4].map(n =>
        `<figure style="flex:0 0 min(85%,640px);scroll-snap-align:center;margin:0">${galeriebild("Foto " + n)}<figcaption style="margin-top:8px">Bildunterschrift</figcaption></figure>`).join("")}</div>`) },
    { id: "youtube", category: K, label: "YouTube-Video", media: ikon('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>'),
      content: `<div data-komp="youtube" data-video="" data-titel="Video" style="aspect-ratio:16/9;background:#1b1b19;color:#fff;display:grid;place-items:center;text-align:center;padding:20px;border-radius:8px"><div><p style="margin:0 0 12px;font-weight:600">Video von YouTube</p><button type="button" style="padding:11px 20px;border:0;border-radius:999px;background:#fff;color:#1b1b19;font:inherit;font-weight:600;cursor:pointer">Video laden</button><p style="font-size:13px;opacity:.8;margin:12px 0 0">Erst beim Laden werden Daten an YouTube (Google) übertragen.</p></div></div>` },
    { id: "videohintergrund", category: K, label: "Video-Hintergrund", media: ikon('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/><path d="M2 16h20"/>'),
      content: `<section data-komp="videohintergrund" style="position:relative;overflow:hidden;min-height:60vh;display:grid;place-items:center;padding:72px 20px;color:#fff;background:#1b1b19"><video data-hintergrund="" autoplay muted loop playsinline preload="metadata" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.7"></video><div style="position:relative;max-width:800px;text-align:center"><h2>Überschrift über dem Video</h2><p>Ein kurzer Satz.</p></div></section>` },
  ];
  window.KF_BLOECKE = [
    { id: "ueber-uns", category: S, label: "Über uns", media: ikon('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
      content: sek(spalten(280, `<div><h2>Über uns</h2><p>Erzählt hier in zwei, drei Sätzen, wer ihr seid und was euch wichtig ist.</p><p>Was macht euch besonders? Seit wann gibt es euch?</p></div>${bild("Foto von uns")}`)) },
    { id: "angebot", category: S, label: "Preise / Angebot", media: ikon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h4M7 13h10"/>'),
      content: sek(`<h2 style="text-align:center">Unser Angebot</h2>${spalten(240, karte("Klein", "5 €", "Kurze Beschreibung") + karte("Mittel", "9 €", "Kurze Beschreibung") + karte("Groß", "14 €", "Kurze Beschreibung"))}`) },
    { id: "kontakt", category: S, label: "Kontakt", media: ikon('<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'),
      content: sek(spalten(260, `<div><h2>Kontakt</h2><p>Musterstraße 1<br>12345 Musterstadt</p><p><a href="tel:+490000000000">0000 000000</a><br><a href="mailto:info@example.com">info@example.com</a></p></div><div><h3>So erreicht ihr uns</h3><p>Ruft an oder schreibt uns – wir melden uns schnell zurück.</p>${knopf("Jetzt anrufen")}</div>`)) },
    { id: "text-bild", category: S, label: "Text und Bild", media: ikon('<rect x="3" y="5" width="8" height="14" rx="1"/><path d="M14 8h7M14 12h7M14 16h5"/>'),
      content: sek(spalten(280, `${bild("Bild beschreiben")}<div><h2>Überschrift</h2><p>Hier steht euer Text. Klickt doppelt, um ihn zu ändern.</p></div>`)) },
    { id: "galerie", category: S, label: "Galerie", media: ikon('<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>'),
      content: sek(`<h2>Eindrücke</h2><div data-komp="galerie" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">${[1, 2, 3, 4, 5, 6].map(n => galeriebild("Foto " + n)).join("")}</div>`) },
    { id: "zitat", category: S, label: "Zitat", media: ikon('<path d="M7 7h4v4c0 3-2 5-4 5M14 7h4v4c0 3-2 5-4 5"/>'),
      content: sek(`<blockquote style="margin:0 auto;max-width:720px;text-align:center;font-size:1.5em;line-height:1.35">„Ein schöner Satz von einem Kunden.“<p style="font-size:.6em;margin-top:14px">– Name</p></blockquote>`) },
    { id: "aufruf", category: S, label: "Aufruf mit Knopf", media: ikon('<rect x="4" y="9" width="16" height="6" rx="3"/>'),
      content: sek(`<div style="text-align:center"><h2>Besucht uns!</h2><p>Ein kurzer Satz, warum es sich lohnt.</p>${knopf("Mehr erfahren")}</div>`) },
    { id: "leer", category: S, label: "Leere Sektion", media: ikon('<rect x="3" y="6" width="18" height="12" rx="2" stroke-dasharray="3 2"/>'),
      content: `<section style="padding:72px 20px;min-height:160px"></section>` },

    { id: "ueberschrift", category: E, label: "Überschrift", media: ikon('<path d="M6 5v14M18 5v14M6 12h12"/>'), content: `<h2>Überschrift</h2>` },
    { id: "text", category: E, label: "Text", media: ikon('<path d="M4 7h16M4 12h16M4 17h10"/>'), content: `<p>Hier steht euer Text.</p>` },
    { id: "bild", category: E, label: "Bild", media: ikon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-8 7"/>'), content: { type: "image", attributes: { alt: "" }, style: { width: "100%", height: "auto" }, src: BILD }, activate: true },
    { id: "knopf", category: E, label: "Knopf", media: ikon('<rect x="4" y="9" width="16" height="6" rx="3"/>'), content: knopf("Knopf") },
    { id: "spalten-2", category: E, label: "2 Spalten", media: ikon('<rect x="3" y="5" width="8" height="14" rx="1"/><rect x="13" y="5" width="8" height="14" rx="1"/>'), content: spalten(260, `<div><p>Linke Spalte</p></div><div><p>Rechte Spalte</p></div>`) },
    { id: "spalten-3", category: E, label: "3 Spalten", media: ikon('<rect x="2" y="5" width="6" height="14" rx="1"/><rect x="9" y="5" width="6" height="14" rx="1"/><rect x="16" y="5" width="6" height="14" rx="1"/>'), content: spalten(200, `<div><p>Spalte 1</p></div><div><p>Spalte 2</p></div><div><p>Spalte 3</p></div>`) },
    { id: "abstand", category: E, label: "Abstand", media: ikon('<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>'), content: `<div style="height:48px"></div>` },
    { id: "linie", category: E, label: "Trennlinie", media: ikon('<path d="M3 12h18"/>'), content: `<hr style="border:0;border-top:1px solid currentColor;opacity:.25;margin:32px 0">` },
    ...KOMPONENTEN,
  ];

  // Eigene Bauteil-Arten mit Einstellungen im Reiter „Gestalten“ (läuft vor dem Laden der Seite, als GrapesJS-Plugin)
  window.KF_STUDIO_PLUGINS = [editor => {
    const D = editor.Components;
    D.addType("kf-video", {
      isComponent: el => el.tagName === "VIDEO" && el.hasAttribute && el.hasAttribute("data-hintergrund"),
      model: { defaults: { tagName: "video", droppable: false, draggable: false, traits: [{ type: "button", text: "Video wählen …", full: true, label: "Video",
        command: ed => window.KF_MEDIEN && window.KF_MEDIEN.waehlen("video").then(x => { const c = ed.getSelected(); if (!c) return;
          if (x.pfad) window.KF_STUDIO_PFADE?.set(x.url, x.pfad); c.addAttributes({ src: x.url }); c.view?.el?.load?.(); }) }] } },
    });
    D.addType("kf-youtube", {
      isComponent: el => el.dataset && el.dataset.komp === "youtube",
      model: { defaults: { droppable: false, traits: [{ type: "text", name: "data-video", label: "YouTube-Adresse", placeholder: "https://www.youtube.com/watch?v=…" },
        { type: "text", name: "data-titel", label: "Titel (für Vorleseprogramme)" }] } },
    });
    D.addType("kf-formular", {
      isComponent: el => el.tagName === "FORM",
      model: { defaults: { tagName: "form", traits: [{ type: "select", name: "data-formular", label: "Art", options: [{ id: "kontakt", label: "Kontakt" }, { id: "anfrage", label: "Anfrage / Buchung" }, { id: "feedback", label: "Feedback" }] },
        { type: "text", name: "data-danke", label: "Text nach dem Absenden", placeholder: "Danke! Eure Nachricht ist angekommen." }] } },
    });
    // Felder: Name im Formular, Pflichtfeld, Art; GrapesJS soll sie nicht als Text bearbeiten
    for (const [art, tag] of [["kf-eingabe", "INPUT"], ["kf-textfeld", "TEXTAREA"], ["kf-auswahl", "SELECT"]])
      D.addType(art, {
        isComponent: el => el.tagName === tag,
        model: { defaults: { tagName: tag.toLowerCase(), droppable: tag === "SELECT", traits: [
          { type: "text", name: "name", label: "Feldname (für die Anfrage)" },
          ...(tag === "INPUT" ? [{ type: "select", name: "type", label: "Art", options: [["text", "Text"], ["email", "E-Mail"], ["tel", "Telefon"], ["date", "Datum"], ["time", "Uhrzeit"], ["number", "Zahl"], ["checkbox", "Ankreuzen"]].map(([id, label]) => ({ id, label })) }] : []),
          ...(tag !== "SELECT" ? [{ type: "text", name: "placeholder", label: "Beispieltext im Feld" }] : []),
          { type: "checkbox", name: "required", label: "Pflichtfeld" }] } },
      });
  }];
})();
