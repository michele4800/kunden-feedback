// Testet waechter/fotos.mjs: Kundenfotos als WebP in zwei Größen ablegen, Missbrauch abwehren.
import { fotosAblegen, bildHinweis } from "../waechter/fotos.mjs";
import sharp from "sharp";
sharp.cache(false);
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const ordner = mkdtempSync(path.join(tmpdir(), "kf-fotos-"));
try {
  mkdirSync(path.join(ordner, "eingang", "ab12"), { recursive: true });
  const foto = "eingang/ab12/1-hofcafe.jpg";
  await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#b8862f" } }).jpeg().toFile(path.join(ordner, foto));
  const p = { ordner, bilder: { ordner: "bilder", breite: 1200, klein: 640 } };

  await fotosAblegen(p, [{ datei: foto, ziel: "hofcafe-innen" }], [foto]);
  const g = await sharp(path.join(ordner, "bilder/hofcafe-innen.webp")).metadata();
  const k = await sharp(path.join(ordner, "bilder/hofcafe-innen-640.webp")).metadata();
  assert.equal(g.format, "webp"); assert.equal(g.width, 1200);
  assert.equal(k.width, 640);
  console.log("ok – Foto als WebP in 1200 und 640 px abgelegt");

  await assert.rejects(fotosAblegen(p, [{ datei: foto, ziel: "hofcafe-innen" }], [foto]), /gibt es schon/);
  console.log("ok – vorhandenes Bild wird nicht überschrieben");
  await assert.rejects(fotosAblegen(p, [{ datei: "../../geheim.txt", ziel: "x" }], [foto]), /Unbekannte Datei/);
  console.log("ok – nur Fotos aus dem Eingang erlaubt");
  await assert.rejects(fotosAblegen(p, [{ datei: foto, ziel: "../boese" }], [foto]), /Ungültiger Name/);
  console.log("ok – Zielname ohne Pfadangaben");

  await fotosAblegen({ ordner }, [{ datei: foto, ziel: "roh" }], [foto]);
  assert.ok(existsSync(path.join(ordner, "bilder/roh.jpg")));
  assert.match(bildHinweis(p), /hofcafe|webp/);
  console.log("ok – ohne Bild-Einstellung wird das Original übernommen");
  console.log("\nAlle Foto-Tests bestanden.");
} finally {
  rmSync(ordner, { recursive: true, force: true });
}
