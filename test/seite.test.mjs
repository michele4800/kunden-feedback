// Testet den Baukasten-Weg: ganze Seite und Daten aus dem Editor übernehmen (waechter/seite.mjs, docs/sperren.js).
// Aufruf: npm test
import { seiteBereinigen, seiteUebernehmen, datenUebernehmen, dateiZurAdresse, zerlegen, sperren, pruefwert } from "../waechter/seite.mjs";
import { inhalteAnwenden } from "../waechter/inhalte.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";

let n = 0; const test = async (name, fn) => { await fn(); n++; console.log("ok –", name); };

const SEITE = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Hof</title>
<!-- hof:kopf -->
<meta name="robots" content="noindex">
<!-- /hof:kopf -->
<link rel="stylesheet" href="stil.css">
</head>
<body class="kombi">
<header><h1>Willkommen</h1></header>
<section id="a"><h2>Erste</h2><p>Text A &amp; mehr</p></section>
<section id="zeiten"><!-- hof:fakten -->
<p class="tage">Mo–Fr 9–12</p>
<script type="application/ld+json">{"x":1}</script>
<!-- /hof:fakten --></section>
<section id="neues"><!-- kf:neues art="neuigkeiten" ebene="3" --><p class="kf-leer">Gerade gibt es keine Neuigkeiten.</p><!-- /kf:neues --></section>
<p><!-- kf:titel art="text" -->Alter Titel<!-- /kf:titel --></p>
<script src="../gemeinsam/karte.js"></script>
<script src="https://michele4800.github.io/kunden-feedback/feedback.js" data-projekt="hof" defer></script>
</body>
</html>
`;

// Was der Editor mit der Seite macht: sperren, (ändern), zurückgeben
const ausDemEditor = (text, aendern = h => h) => aendern(sperren(zerlegen(text).body).html);

try {
  await test("Gesperrte Bereiche: hof-Daten, Neuigkeiten, Skripte und Kommentare werden Platzhalter", async () => {
    const { bereiche, html } = sperren(zerlegen(SEITE).body);
    assert.equal(bereiche.length, 6);  // hof:fakten, kf:neues, kf:titel (2 Kommentare), 2 Skripte
    assert.ok(bereiche[0].startsWith("<!-- hof:fakten -->") && bereiche[0].endsWith("<!-- /hof:fakten -->"));
    assert.ok(html.includes('<kf-sperre data-nr="0">\n<p class="tage">Mo–Fr 9–12</p>\n\n</kf-sperre>'), "Anzeige ohne Skript");
    assert.ok(!/<script|<!--/.test(html));
    assert.ok(html.includes("Alter Titel"), "Inhalt alter kf-Marker bleibt bearbeitbar");
    assert.equal(pruefwert("a\r\nb"), pruefwert("a\nb"));
  });

  await test("Bereinigen: Skripte, Ereignisse, javascript: und fremde Tags fliegen raus; Layout, SVG und data-* bleiben", async () => {
    const r = seiteBereinigen(`<section class="x" id="i1" style="padding:4px" onclick="böse()" data-karte="hof"><h2>T</h2>
<script>alert(1)</script><img src="a.webp" onerror="alert(1)" alt="A"><a href="javascript:alert(1)">x</a><a href="https://a.de" target="_blank" rel="opener">y</a>
<iframe src="https://boese.de"></iframe><svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4"/></svg><div style="background:url(javascript:x)">z</div>
<form action="https://boese.de"><input name="p"></form><p data-kf-bild="x">ok</p></section>`, "m");
    assert.equal(r.html, `<section class="x" id="i1" style="padding:4px" data-karte="hof"><h2>T</h2>
<img src="a.webp" alt="A"><a>x</a><a href="https://a.de" target="_blank" rel="noopener">y</a>
<svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4"/></svg><div>z</div>
<form><input name="p"></form><p>ok</p></section>`);
    assert.equal(r.bilder.length, 0);
    assert.equal(seiteBereinigen("1 &lt; 2 &amp; <b>fett", "m").html, "1 &lt; 2 &amp; <b>fett</b>");
  });

  await test("Formulare und Videos: ohne Ziel, nur einfache Felder, Video aus der Bibliothek wird Platzhalter", async () => {
    const r = seiteBereinigen(`<form data-komp="formular" action="https://boese.de" method="post" onsubmit="x()"><label for="a">A</label>
<input id="a" name="mail" type="email" required maxlength="80"><input name="pw" type="password"><input name="h" type="hidden" value="x">
<button type="submit" formaction="https://boese.de">Los</button><textarea name="t" rows="4"><b>roh</b></textarea>
<select name="s"><option selected>1</option></select></form>
<video data-hintergrund="" src="https://x.supabase.co/sig" data-kf-datei="P1/v.mp4" autoplay muted loop playsinline onplay="x()"></video>`, "m");
    assert.equal(r.html, `<form data-komp="formular"><label for="a">A</label>
<input id="a" name="mail" type="email" required="" maxlength="80"><input name="pw" type="text"><input name="h" type="text" value="x">
<button type="submit">Los</button><textarea name="t" rows="4"><b>roh</b></textarea>
<select name="s"><option selected="">1</option></select></form>
<video data-hintergrund="" autoplay="" muted="" loop="" playsinline="" src="mb0x"></video>`);
    assert.deepEqual(r.bilder.map(b => [b.pfad, b.datei]), [["P1/v.mp4", true]]);
  });

  await test("Seite übernehmen: Komponenten-Skript einmal, SEO-Angaben im Kopf, Video abgelegt", async () => {
    const html = ausDemEditor(SEITE, h => h + '<div data-komp="youtube" data-video="abc"><button type="button">Laden</button></div><video data-kf-datei="P1/v.mp4" src="https://s/x"></video>');
    const opt = { cssDatei: "i.kf.css", seiteUrl: "https://x.github.io/hof/", dateiAblegen: async p => "bilder/kf-video-1.mp4", bildAblegen: async () => ({ src: "bilder/og.webp" }) };
    const r = await seiteUebernehmen(SEITE, { html, css: "", basis: pruefwert(SEITE), seo: { titel: "Hofladen <Schneider>", beschreibung: "Frische Eier\nund Brot", bild: "P1/og.jpg" } }, opt);
    assert.ok(r.komponenten);
    assert.ok(r.text.indexOf('<script src="kf-komponenten.js" defer></script>') > 0 && r.text.indexOf('<script src="kf-komponenten.js"') < r.text.indexOf("</head>"));
    assert.ok(r.text.includes("<title>Hofladen  Schneider </title>") || r.text.includes("<title>Hofladen Schneider</title>"), r.text.slice(0, 400));
    assert.ok(r.text.includes('<meta name="description" content="Frische Eier und Brot">'));
    assert.ok(r.text.includes('<meta property="og:image" content="https://x.github.io/hof/bilder/og.webp">'));
    assert.ok(r.text.includes('<video src="bilder/kf-video-1.mp4"></video>'));
    assert.equal(r.text.split("<title>").length, 2);
    // zweite Runde: nichts doppelt, Beschreibung ersetzt
    const r2 = await seiteUebernehmen(r.text, { html: ausDemEditor(r.text), css: "", basis: pruefwert(r.text), seo: { beschreibung: "Neu" } }, opt);
    assert.equal(r2.text.split("kf-komponenten.js").length, 2);
    assert.equal(r2.text.split('name="description"').length, 2);
    assert.ok(r2.text.includes('content="Neu"') && r2.text.includes("og:image"));
  });

  await test("Seite übernehmen: Kopf, Body-Tag und automatische Bereiche bleiben Zeichen für Zeichen", async () => {
    const neu = ausDemEditor(SEITE, h => h.replace(/<section id="a">[\s\S]*?<\/section>/, "")
      .replace("<header>", '<section id="neu"><h2>Über uns</h2><p>Hallo</p></section><header>'));
    const r = await seiteUebernehmen(SEITE, { html: neu, css: "#neu{padding:20px}@media (max-width:480px){#neu{padding:8px}}", basis: pruefwert(SEITE) }, { cssDatei: "index.kf.css" });
    const { bereiche } = sperren(zerlegen(SEITE).body);
    for (const b of bereiche) assert.ok(r.text.includes(b), "Bereich erhalten: " + b.slice(0, 40));
    assert.ok(r.text.startsWith(SEITE.slice(0, SEITE.indexOf("</head>"))));
    assert.ok(r.text.includes('<link rel="stylesheet" href="index.kf.css">\n</head>\n<body class="kombi">'));
    assert.ok(r.text.indexOf('<section id="neu">') < r.text.indexOf("<header>"));
    assert.ok(!r.text.includes("Erste"));
    assert.ok(r.text.trimEnd().endsWith("</body>\n</html>"));
    assert.match(r.css, /#neu\{padding:20px\}/);
    // zweite Runde mit derselben Datei: Link nicht doppelt
    const r2 = await seiteUebernehmen(r.text, { html: ausDemEditor(r.text), css: r.css, basis: pruefwert(r.text) }, { cssDatei: "index.kf.css" });
    assert.equal(r2.text.split("index.kf.css").length, 2);
    assert.equal(r2.text, r.text);
  });

  await test("Seite übernehmen: veraltete Grundlage, doppelte Bereiche und böse Stile werden abgelehnt", async () => {
    const html = ausDemEditor(SEITE);
    await assert.rejects(seiteUebernehmen(SEITE, { html, css: "", basis: "alt" }, { cssDatei: "i.kf.css" }), /inzwischen geändert/);
    const doppelt = html.replace(/(<kf-sperre data-nr="0">[\s\S]*?<\/kf-sperre>)/, "$1$1");
    await assert.rejects(seiteUebernehmen(SEITE, { html: doppelt, css: "", basis: pruefwert(SEITE) }, { cssDatei: "i.kf.css" }), /doppelt/);
    await assert.rejects(seiteUebernehmen(SEITE, { html, css: "@import url(https://boese.de/x.css);", basis: pruefwert(SEITE) }, { cssDatei: "i.kf.css" }), /nicht erlaubte/);
    // gelöschter Bereich ist erlaubt (steht dann auf dieser Seite nicht mehr)
    const ohne = html.replace(/<kf-sperre data-nr="0">[\s\S]*?<\/kf-sperre>/, "");
    const r = await seiteUebernehmen(SEITE, { html: ohne, css: "", basis: pruefwert(SEITE) }, { cssDatei: "i.kf.css" });
    assert.ok(!r.text.includes("hof:fakten") && r.text.includes("karte.js"));
    assert.ok(!r.text.includes("i.kf.css"), "ohne Stile kein Link");
  });

  await test("Daten: nur erlaubte Felder, Öffnungszeiten als Wochenplan, keine HTML-Zeichen", async () => {
    const schema = { datei: "daten.json", felder: [{ pfad: "betrieb.telefon", titel: "Telefon" },
      { liste: "orte", name: "name", felder: [{ pfad: "zeiten", titel: "Zeiten", art: "woche" }, { pfad: "notiz", titel: "Hinweis" }] }] };
    const alt = JSON.stringify({ betrieb: { telefon: "0177", name: "Hof" }, orte: [{ name: "Laden", lat: 48.6, zeiten: { 1: "09:00-12:00" }, notiz: "Mittwoch Ruhetag" }] });
    const b = pruefwert(alt);
    const neu = JSON.parse(datenUebernehmen(alt, schema, { basis: b, werte: { "betrieb.telefon": " 0177 123 ", "orte.0.zeiten": { 1: "09:00-12:00", 3: "", 6: "09:00-12:00" }, "orte.0.notiz": "" } }));
    assert.deepEqual(neu, { betrieb: { telefon: "0177 123", name: "Hof" }, orte: [{ name: "Laden", lat: 48.6, zeiten: { 1: "09:00-12:00", 6: "09:00-12:00" } }] });
    assert.throws(() => datenUebernehmen(alt, schema, { basis: b, werte: { "betrieb.name": "X" } }), /nicht änderbar/);
    assert.throws(() => datenUebernehmen(alt, schema, { basis: b, werte: { "orte.0.lat": "1" } }), /nicht änderbar/);
    assert.throws(() => datenUebernehmen(alt, schema, { basis: b, werte: { "orte.1.notiz": "x" } }), /nicht änderbar/);
    assert.throws(() => datenUebernehmen(alt, schema, { basis: b, werte: { "orte.0.zeiten": { 8: "x" } } }), /Öffnungszeiten/);
    assert.throws(() => datenUebernehmen(alt, schema, { basis: b, werte: { "betrieb.telefon": "<b>x</b>" } }), /Ungültiger Wert/);
    assert.throws(() => datenUebernehmen(alt, schema, { basis: "alt", werte: {} }), /inzwischen geändert/);
  });

  await test("Seite zur Adresse: nur HTML-Dateien im Git unterhalb der Vorschau-Adresse", async () => {
    const d = ["index.html", "kombi/index.html", "kombi/unterwegs.html"], B = ["https://x.github.io/hof/"];
    assert.equal(dateiZurAdresse("https://x.github.io/hof/kombi/", B, d), "kombi/index.html");
    assert.equal(dateiZurAdresse("https://x.github.io/hof/kombi/unterwegs.html", B, d), "kombi/unterwegs.html");
    assert.equal(dateiZurAdresse("https://x.github.io/hof/", B, d), "index.html");
    assert.throws(() => dateiZurAdresse("https://x.github.io/hof/../geheim/index.html", B, d), /gehört nicht/);
    assert.throws(() => dateiZurAdresse("https://boese.de/hof/kombi/", B, d), /gehört nicht/);
    assert.throws(() => dateiZurAdresse("https://x.github.io/hof/kombi/neu.html", B, d), /gehört nicht/);
  });

  await test("Wächter: Seite mit neuem Foto und Daten übernehmen (Wegwerf-Website)", async () => {
    const ordner = mkdtempSync(path.join(tmpdir(), "kf-seite-"));
    try {
      const datei = (rel, inhalt) => { mkdirSync(path.dirname(path.join(ordner, rel)), { recursive: true }); writeFileSync(path.join(ordner, rel), inhalt); };
      datei("kombi/index.html", SEITE);
      datei("daten.json", JSON.stringify({ orte: [{ name: "Laden", zeiten: { 1: "09:00-12:00" } }] }));
      datei("kf-daten.json", JSON.stringify({ datei: "daten.json", felder: [{ liste: "orte", name: "name", felder: [{ pfad: "zeiten", art: "woche" }] }] }));
      const git = (...a) => execFileSync("git", a, { cwd: ordner, encoding: "utf8" });
      git("init", "-q"); git("add", "-A"); git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "start");
      const foto = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#c84" } }).jpeg().toBuffer();
      const html = ausDemEditor(SEITE, h => h.replace("<header>", '<img id="f1" src="https://x.supabase.co/sig?token=1" data-kf-bild="P1/foto.jpg" alt="Neues Foto" class="gross"><header>'));
      const p = { ordner, bilder: { ordner: "bilder", breite: 1200, klein: 640 } };
      const opt = { bildHolen: async () => foto, basisAdressen: ["https://x.github.io/hof/"], projektId: "P1" };
      const r = await inhalteAnwenden(p, [
        { schluessel: "seite-kombi", seite_url: "https://x.github.io/hof/kombi/", wert: { art: "seite", html, css: "#f1{border-radius:8px}", basis: pruefwert(SEITE) } },
        { schluessel: "daten", wert: { art: "daten", werte: { "orte.0.zeiten": { 2: "14:00-18:00" } }, basis: pruefwert(readFileSync(path.join(ordner, "daten.json"), "utf8")) } },
      ], opt);
      assert.deepEqual(r.map(x => x.ok), [true, true], JSON.stringify(r));
      const t = readFileSync(path.join(ordner, "kombi/index.html"), "utf8");
      assert.match(t, /<img src="\.\.\/bilder\/kf-seite-[0-9a-f]{8}\.webp" srcset="[^"]+640w[^"]+" sizes="[^"]+" width="1200" height="675" id="f1" alt="Neues Foto" class="gross">/);
      assert.ok(!t.includes("supabase") && !t.includes("data-kf-bild"));
      assert.equal(readdirSync(path.join(ordner, "bilder")).length, 2);
      assert.equal(readFileSync(path.join(ordner, "kombi/index.kf.css"), "utf8"), "#f1{border-radius:8px}\n");
      assert.deepEqual(JSON.parse(readFileSync(path.join(ordner, "daten.json"), "utf8")).orte[0].zeiten, { 2: "14:00-18:00" });

      // Bild eines fremden Projekts wird abgelehnt
      const fremd = ausDemEditor(t, h => h + '<img src="https://x/y" data-kf-bild="P2/geheim.jpg" alt="">');
      const r2 = await inhalteAnwenden(p, [{ schluessel: "seite-kombi", seite_url: "https://x.github.io/hof/kombi/", wert: { art: "seite", html: fremd, css: "", basis: pruefwert(t) } }], opt);
      assert.equal(r2[0].ok, false); assert.match(r2[0].meldung, /gehört nicht/);

      // Formular auf der Seite: kf-komponenten.js mit Adresse und Projekt daneben
      const mitForm = ausDemEditor(t, h => h + '<form data-komp="formular"><input name="name"><button>Senden</button></form>');
      const r3 = await inhalteAnwenden(p, [{ schluessel: "seite-kombi", seite_url: "https://x.github.io/hof/kombi/", wert: { art: "seite", html: mitForm, css: "", basis: pruefwert(t) } }],
        { ...opt, formularZiel: "https://x.supabase.co/functions/v1/formular", slug: "hof" });
      assert.deepEqual(r3.map(x => x.ok), [true], JSON.stringify(r3));
      const js = readFileSync(path.join(ordner, "kombi/kf-komponenten.js"), "utf8");
      assert.ok(js.includes('const FORMULAR = "https://x.supabase.co/functions/v1/formular", PROJEKT = "hof"'));
      assert.ok(readFileSync(path.join(ordner, "kombi/index.html"), "utf8").includes('<script src="kf-komponenten.js" defer></script>'));
    } finally { rmSync(ordner, { recursive: true, force: true }); }
  });

  console.log(`\n${n} Tests bestanden.`);
} catch (e) {
  console.error("\nFEHLER:", e);
  process.exit(1);
}
