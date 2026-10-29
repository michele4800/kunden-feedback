// Gesperrte Bereiche einer Seite – gemeinsam genutzt vom Editor (Browser) und vom Wächter (Node, über vm).
// Was der Bau-Befehl oder der Wächter selbst erzeugt, darf der Kunde im Editor sehen, aber nicht ändern:
//   <!-- hof:… --> … <!-- /hof:… -->        (aus daten.json gebaut, z. B. Öffnungszeiten)
//   <!-- kf:… art="neuigkeiten" --> … <!-- /kf:… -->   (Neuigkeiten, vom Wächter aus dem Verlauf gebaut)
//   <script>, <noscript>, <template>, <style>  (laufen nie im Editor)
//   alle übrigen Kommentare (z. B. kf:-Marker des alten Editors) als leere Platzhalter
// Beide Seiten zerlegen denselben Text (geprüft über einen Prüfwert), daher passen die Nummern zusammen.
(function (ziel) {
  const MUSTER = /<!--\s*hof:(\w+)[\s\S]*?-->[\s\S]*?<!--\s*\/hof:\1\s*-->|<!--\s*kf:([a-z0-9-]+)[^>]*?\bart="neuigkeiten"[^>]*?-->[\s\S]*?<!--\s*\/kf:\2\s*-->|<(script|noscript|template|style)\b[\s\S]*?<\/\3\s*>|<!--[\s\S]*?-->/gi;

  // Text des <body> (ohne das Tag selbst) und die Teile davor/danach
  function zerlegen(html) {
    const t = String(html).replace(/\r\n?/g, "\n");
    const auf = /<body\b[^>]*>/i.exec(t), zu = t.toLowerCase().lastIndexOf("</body>");
    if (!auf || zu < auf.index) throw new Error("Die Seite hat keinen <body>");
    const start = auf.index + auf[0].length;
    return { kopf: t.slice(0, start), body: t.slice(start, zu), fuss: t.slice(zu) };
  }

  // body → { bereiche: [Originaltext], html: body mit <kf-sperre data-nr="i">Anzeige</kf-sperre> }
  function sperren(body) {
    const bereiche = [];
    const html = body.replace(MUSTER, ganz => {
      const nr = bereiche.push(ganz) - 1;
      // innen nur zur Anzeige, ohne Skripte und Kommentare
      const sichtbar = /^<!--\s*(hof|kf):/i.test(ganz) ? ganz.slice(ganz.indexOf("-->") + 3, ganz.lastIndexOf("<!--")).replace(MUSTER, "") : "";
      return `<kf-sperre data-nr="${nr}">${sichtbar}</kf-sperre>`;
    });
    return { bereiche, html };
  }

  // Prüfwert über den normalisierten Text (gleich im Browser und in Node)
  function pruefwert(text) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const t = String(text).replace(/\r\n?/g, "\n");
    for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
    return t.length.toString(36) + "-" + h1.toString(36) + h2.toString(36);
  }

  ziel.KF_SPERREN = { zerlegen, sperren, pruefwert };
})(typeof window !== "undefined" ? window : globalThis);
