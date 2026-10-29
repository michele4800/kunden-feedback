// Testet das Übernehmen von Editor-Änderungen (waechter/inhalte.mjs) an einer Wegwerf-Website.
// Aufruf: npm test
import { bereinigen, sichereAdresse, inhalteAnwenden, bereiche, rssXml } from "../waechter/inhalte.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";

let n = 0; const test = async (name, fn) => { await fn(); n++; console.log("ok –", name); };
const ordner = mkdtempSync(path.join(tmpdir(), "kf-inhalte-"));
const datei = (rel, inhalt) => { mkdirSync(path.dirname(path.join(ordner, rel)), { recursive: true }); writeFileSync(path.join(ordner, rel), inhalt); };
const lesen = rel => readFileSync(path.join(ordner, rel), "utf8");
const git = (...a) => execFileSync("git", a, { cwd: ordner, encoding: "utf8" });

try {
  await test("Bereinigen: nur fett, kursiv, Links und Umbrüche; Skripte und Ereignisse fliegen raus", async () => {
    assert.equal(bereinigen('Hallo <b>Welt</b><script>alert(1)</script> & <img src=x onerror=alert(1)>'), "Hallo <b>Welt</b> &amp;");
    assert.equal(bereinigen('<a href="javascript:alert(1)">x</a>'), "x");
    assert.equal(bereinigen('<a href="java&#58;script:alert(1)">x</a>'), "x");
    assert.equal(bereinigen('<a href="https://x.de" onclick="böse()">x</a>'), '<a href="https://x.de" target="_blank" rel="noopener">x</a>');
    assert.equal(bereinigen("<p>Absatz</p>"), "Absatz");  // einzeilig: keine Absätze
    assert.equal(bereinigen("<div>Eins</div><div>Zwei<br></div>", true), "<p>Eins</p><p>Zwei<br></p>");
    assert.equal(bereinigen("<b>offen"), "<b>offen</b>");
    assert.equal(bereinigen("a <!-- /kf:x --> b"), "a  b");  // Marker lassen sich nicht einschleusen
    assert.equal(bereinigen("1 < 2 &amp; 3 > 2"), "1 &lt; 2 &amp; 3 &gt; 2");
    assert.equal(bereinigen('<svg><a href="https://x">x</a></svg>ok'), "ok");
  });

  await test("Adressen: http(s), mailto, tel, relative Pfade erlaubt; javascript, data und //fremd nicht", async () => {
    for (const ok of ["https://a.de", "mailto:a@b.de", "tel:+49123", "unterwegs.html", "/seite", "#anker", "./x"]) assert.ok(sichereAdresse(ok), ok);
    for (const nein of ["javascript:x", " JaVaScRiPt:x", "data:text/html,x", "//boese.de", "vbscript:x", ""]) assert.equal(sichereAdresse(nein), null, nein);
  });

  // Wegwerf-Website mit markierten Bereichen
  datei("index.html", `<h1><!-- kf:titel art="text" -->Alter Titel<!-- /kf:titel --></h1>
<div><!-- kf:cafe art="mehrzeilig" --><p>Alt</p><!-- /kf:cafe --></div>
<p><!-- kf:telefon art="link" --><a class="tel" href="tel:1">0177</a><!-- /kf:telefon --></p>
<figure><!-- kf:hero art="bild" --><img class="bild" src="bilder/alt.webp" alt="Alt" width="10" height="10" loading="lazy"><!-- /kf:hero --></figure>
<section><!-- kf:neues art="neuigkeiten" ebene="2" --><!-- /kf:neues --></section>
<footer><!-- kf:titel art="text" -->Alter Titel<!-- /kf:titel --></footer>`);
  datei("unter/seite.html", `<p><!-- kf:telefon art="link" --><a href="tel:1">0177</a><!-- /kf:telefon --></p>`);
  datei("livegang/kopie.html", `<!-- kf:titel art="text" -->Alter Titel<!-- /kf:titel -->`);  // nicht im Git → wird nicht angefasst
  git("init", "-q"); git("add", "index.html", "unter/seite.html");

  await test("Bereiche werden aus den Dateien im Git gelesen", async () => {
    const v = bereiche(ordner);
    assert.deepEqual([...v.keys()].sort(), ["cafe", "hero", "neues", "telefon", "titel"]);
    assert.deepEqual(v.get("telefon").dateien, ["index.html", "unter/seite.html"]);
  });

  const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#c96" } }).png().toBuffer();
  const p = { ordner, bilder: { ordner: "bilder", breite: 1200, klein: 640 } };
  let r;
  await test("Änderungen werden übernommen: Text überall, Absätze, Link, Bild als WebP, Neuigkeiten mit RSS", async () => {
    r = await inhalteAnwenden(p, [
      { schluessel: "titel", wert: { html: "Neuer <b>Titel</b><script>x</script>" } },
      { schluessel: "cafe", wert: { html: "<div>Kaffee</div><div>Kuchen</div>" } },
      { schluessel: "telefon", wert: { text: "0177 2136695", href: "tel:+491772136695" } },
      { schluessel: "hero", wert: { pfad: "projekt/foto.png", alt: "Neuer Laden" } },
      { schluessel: "neues", wert: { eintraege: [
        { id: "a1b2c3", datum: "2026-10-28", titel: "Kürbisse sind da", text: "Ab heute im Hofladen.\nSolange der Vorrat reicht." },
        { id: "d4e5f6", datum: "2026-10-01", bis: "2026-10-05", titel: "Abgelaufen", text: "weg" },
        { id: "g7h8i9", datum: "2026-10-29", titel: "Mit Foto <script>", text: "", bild: { pfad: "projekt/n.png", alt: "Kürbis" } },
      ] } },
      { schluessel: "gibts-nicht", wert: { html: "x" } },
      { schluessel: "telefon", wert: { text: "x", href: "javascript:alert(1)" } },
    ], { bildHolen: async () => png, basisUrl: "https://hof.example/", titel: "Hofladen", heute: "2026-10-29" });
    assert.deepEqual(r.map(x => x.ok), [true, true, true, true, true, false, false]);
    assert.match(r[5].meldung, /gibt es auf der Website nicht/);
    const t = lesen("index.html");
    assert.equal((t.match(/Neuer <b>Titel<\/b>/g) || []).length, 2);
    assert.ok(!t.includes("<script"));
    assert.match(t, /<!-- kf:cafe art="mehrzeilig" --><p>Kaffee<\/p><p>Kuchen<\/p><!-- \/kf:cafe -->/);
    assert.match(t, /<a href="tel:\+491772136695" class="tel">0177 2136695<\/a>/);
    assert.match(lesen("unter/seite.html"), /<a href="tel:\+491772136695">0177 2136695<\/a>/);
    const img = /<!-- kf:hero art="bild" -->(<img[^>]*>)/.exec(t)[1];
    assert.match(img, /src="bilder\/kf-hero-[0-9a-f]{8}\.webp"/);
    assert.match(img, /srcset="bilder\/kf-hero-[0-9a-f]{8}-640\.webp 640w, bilder\/kf-hero-[0-9a-f]{8}\.webp 1200w"/);
    assert.match(img, /alt="Neuer Laden" width="1200" height="675" class="bild" loading="lazy"/);
    assert.ok(readdirSync(path.join(ordner, "bilder")).some(f => /^kf-hero-.*-640\.webp$/.test(f)));
    assert.match(t, /<h2>Kürbisse sind da<\/h2><p>Ab heute im Hofladen\.<br>Solange der Vorrat reicht\.<\/p>/);
    assert.match(t, /<h2>Mit Foto &lt;script&gt;<\/h2><img loading="lazy" src="bilder\/kf-neu-g7h8i9-/);
    assert.ok(!t.includes("Abgelaufen"));
    assert.ok(t.indexOf("Mit Foto") < t.indexOf("Kürbisse"));  // neueste zuerst
    assert.equal(lesen("livegang/kopie.html"), `<!-- kf:titel art="text" -->Alter Titel<!-- /kf:titel -->`);
    const rss = lesen("feed.xml");
    assert.match(rss, /<link>https:\/\/hof\.example\/#neu-a1b2c3<\/link>/);
    assert.ok(!rss.includes("Abgelaufen"));
  });

  await test("Zweimal anwenden ändert nichts mehr (Marker bleiben erhalten)", async () => {
    const vorher = lesen("index.html");
    await inhalteAnwenden(p, [{ schluessel: "titel", wert: { html: "Neuer <b>Titel</b>" } }], { heute: "2026-10-29" });
    assert.equal(lesen("index.html"), vorher);
    assert.equal(bereiche(ordner).size, 5);
  });

  await test("RSS ist gültiges XML ohne ungeschützte Zeichen", async () => {
    const x = rssXml([{ id: "x1x1", datum: "2026-10-29", titel: "A & B <c>", text: "\"zitat\" 'x'" }], { titel: "Hof & Co", link: "https://h/", heute: "2026-10-29" });
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(x));
    assert.match(x, /<title>A &amp; B &lt;c&gt;<\/title>/);
  });
} finally {
  rmSync(ordner, { recursive: true, force: true });
}
console.log(`\nAlle ${n} Inhalte-Tests bestanden.`);
