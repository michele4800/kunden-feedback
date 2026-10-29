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

  const S = "Sektionen", E = "Elemente";
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
      content: sek(`<h2>Eindrücke</h2>${spalten(220, bild("Foto 1") + bild("Foto 2") + bild("Foto 3"))}`) },
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
  ];
})();
