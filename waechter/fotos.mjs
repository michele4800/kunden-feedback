// Kundenfotos ins Website-Projekt übernehmen (vom Wächter genutzt, getestet in test/fotos.test.mjs).
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Wo ein Foto landet, das Claude verwenden will (je Projekt einstellbar, z. B. WebP in zwei Größen)
export function bildHinweis(p) {
  const b = p.bilder;
  if (!b) return "Fotos werden unverändert als bilder/<ziel>.<endung> abgelegt.";
  return `Fotos werden als ${b.ordner}/<ziel>.webp (max. ${b.breite || 1200} px)${b.klein ? ` und ${b.ordner}/<ziel>-${b.klein}.webp (${b.klein} px)` : ""} abgelegt. Binde sie so ein wie die vorhandenen Bilder des Projekts.`;
}
export async function fotosAblegen(p, auswahl, erlaubt) {
  const b = p.bilder;
  for (const f of auswahl) {
    if (!erlaubt.includes(f.datei)) throw new Error(`Unbekannte Datei ${f.datei}`);
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(f.ziel)) throw new Error(`Ungültiger Name ${f.ziel}`);
    const quelle = path.join(p.ordner, f.datei);
    if (!b) {
      const ziel = path.join(p.ordner, "bilder", f.ziel + path.extname(f.datei).toLowerCase());
      if (existsSync(ziel)) throw new Error(`${f.ziel} gibt es schon`);
      mkdirSync(path.dirname(ziel), { recursive: true }); writeFileSync(ziel, readFileSync(quelle));
      continue;
    }
    const { default: sharp } = await import("sharp");
    sharp.cache(false); // sonst hält Windows die Dateien offen und der Eingang lässt sich nicht löschen
    const ordner = path.join(p.ordner, b.ordner);
    const gross = path.join(ordner, `${f.ziel}.webp`);
    if (existsSync(gross)) throw new Error(`${b.ordner}/${f.ziel}.webp gibt es schon`);
    mkdirSync(ordner, { recursive: true });
    await sharp(quelle).rotate().resize({ width: b.breite || 1200, withoutEnlargement: true }).webp({ quality: 74 }).toFile(gross);
    if (b.klein) await sharp(quelle).rotate().resize({ width: b.klein, withoutEnlargement: true }).webp({ quality: 72 }).toFile(path.join(ordner, `${f.ziel}-${b.klein}.webp`));
  }
}

