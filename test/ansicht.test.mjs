// Testet waechter/ansicht.mjs: Bildschirmfotos aus dem lokalen Projektordner, nur eigene Dateien, Adress-Zuordnung.
import { ansichten, seitePfad } from "../waechter/ansicht.mjs";
import sharp from "sharp";
sharp.cache(false);
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const p = { vorschau_url: "https://beispiel.github.io/kunde/" };
assert.equal(seitePfad(p, "https://beispiel.github.io/kunde/"), "index.html");
assert.equal(seitePfad(p, "https://beispiel.github.io/kunde/hofbus/?x=1#k"), "hofbus/index.html");
assert.equal(seitePfad(p, "https://beispiel.github.io/kunde/a/impressum.html"), "a/impressum.html");
assert.equal(seitePfad(p, "https://andere.de/kunde/"), null);
assert.equal(seitePfad(p, "https://beispiel.github.io/kunde/../geheim"), null);
console.log("ok – Vorschau-Adresse wird der Datei im Projekt zugeordnet");

const ordner = mkdtempSync(path.join(tmpdir(), "kf-ansicht-"));
try {
  p.ordner = ordner;
  mkdirSync(path.join(ordner, "seite"));
  writeFileSync(path.join(ordner, "seite/stil.css"), "section{height:600px;background:#b8862f}");
  writeFileSync(path.join(ordner, "seite/index.html"), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="stil.css">
    <header style="height:1200px">Kopf</header><section id="zeiten"><h2>Öffnungszeiten</h2></section>
    <script src="https://fremd.example.com/x.js"></script>`);
  const fotos = await ansichten(p, { seite: "seite/index.html", selektor: "#zeiten h2", ziel: "eingang/ansicht", praefix: "vorher" });
  assert.deepEqual(fotos, ["eingang/ansicht/vorher-desktop.png", "eingang/ansicht/vorher-handy.png"]);
  const d = await sharp(path.join(ordner, fotos[0])).metadata();
  const h = await sharp(path.join(ordner, fotos[1])).metadata();
  assert.equal(d.width, 1440); assert.equal(d.height, 600);
  assert.equal(h.width, 390);
  const { data } = await sharp(path.join(ordner, fotos[0])).extract({ left: 700, top: 300, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 150 && data[2] < 90, "Abschnitt mit eigenem CSS fotografiert");
  console.log("ok – markierter Abschnitt am Desktop und Handy fotografiert, CSS aus dem Projekt geladen");

  const wunsch = await ansichten(p, { seite: "seite/index.html", selektor: "#zeiten h2", ziel: "eingang/ansicht", praefix: "wunsch", verschiebung: { dx: 300, dy: 0, breite: 1440 } });
  assert.deepEqual(wunsch, ["eingang/ansicht/wunsch-desktop.png"]);
  const handy = await ansichten(p, { seite: "seite/index.html", selektor: "#zeiten h2", ziel: "eingang/ansicht", praefix: "wunsch", verschiebung: { dx: 20, dy: 0, breite: 390 } });
  assert.deepEqual(handy, ["eingang/ansicht/wunsch-handy.png"]);
  console.log("ok – Wunschbild mit Verschiebung nur auf dem passenden Gerät");
  console.log("\nAlle Ansicht-Tests bestanden.");
} finally {
  rmSync(ordner, { recursive: true, force: true });
}
