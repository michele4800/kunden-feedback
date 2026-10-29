// Editor-Änderungen ohne KI in die Website schreiben (vom Wächter genutzt, getestet in test/inhalte.test.mjs).
//
// Bearbeitbar ist nur, was im Website-Code markiert ist:
//   <!-- kf:schluessel art="text" -->Inhalt<!-- /kf:schluessel -->
// art: text (eine Zeile, fett/kursiv/Link) · mehrzeilig (Absätze, Listen) · bild (ein <img>) · link (ein <a>) · neuigkeiten (Liste + RSS)
// Der Kunde wählt nur Schlüssel und Wert; WAS die Stelle ist (art), steht im Code. Unbekannte Schlüssel werden abgelehnt,
// HTML wird nach einer Positivliste bereinigt – Kundentext kann weder Skripte noch fremde Marker einschleusen.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

export const MARKER = /<!--\s*kf:([a-z0-9-]{1,60})((?:\s+[a-z-]+="[^"]*")*)\s*-->([\s\S]*?)<!--\s*\/kf:\1\s*-->/g;
export const ARTEN = ["text", "mehrzeilig", "bild", "link", "neuigkeiten"];
const attribute = s => Object.fromEntries([...String(s || "").matchAll(/([a-z-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

// ---------- Bereinigen ----------
const textEsc = s => s.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const entitaetenWeg = s => s.replace(/&amp;/gi, "&").replace(/&#0*58;|&colon;/gi, ":").replace(/&#x0*3a;/gi, ":");

// Erlaubt: http(s), mailto, tel und Pfade innerhalb der Website – kein javascript:, data: usw.
export function sichereAdresse(href) {
  const h = entitaetenWeg(String(href || "")).replace(/[\u0000- \u007f]+/g, "");
  if (!h) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
  if (/^[^:]*$/.test(h.split(/[/?#]/)[0]) && !/^\/\//.test(h)) return h;  // relativ, ohne Schema
  return null;
}

const INLINE = ["b", "strong", "i", "em", "br", "a"];
const BLOCK = [...INLINE, "p", "ul", "ol", "li"];
const WEG_MIT_INHALT = /^(script|style|iframe|object|embed|template|noscript|svg|math)$/;
export function bereinigen(html, mehrzeilig = false) {
  const erlaubt = new Set(mehrzeilig ? BLOCK : INLINE);
  const raus = [], stapel = [];
  let ueberspringen = null;
  for (const teil of String(html || "").split(/(<[^>]*>)/)) {
    if (!teil) continue;
    const m = teil[0] === "<" ? /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/.exec(teil) : null;
    if (ueberspringen) { if (m && m[1] && m[2].toLowerCase() === ueberspringen) ueberspringen = null; continue; }
    if (teil[0] !== "<") { raus.push(textEsc(teil)); continue; }
    if (!m) { if (!/^<\s*[!?/]/.test(teil)) raus.push(textEsc(teil)); continue; }  // „1 < 2 > 0“ ist Text; Kommentare fliegen raus
    const zu = !!m[1];
    let tag = m[2].toLowerCase();
    if (!zu && WEG_MIT_INHALT.test(tag) && !/\/\s*$/.test(m[3])) { ueberspringen = tag; continue; }
    if (mehrzeilig && tag === "div") tag = "p";  // Enter im Editor erzeugt in Chrome <div>
    if (!erlaubt.has(tag)) continue;
    if (tag === "br") { if (!zu) raus.push("<br>"); continue; }
    if (zu) {
      const i = stapel.lastIndexOf(tag);
      if (i >= 0) while (stapel.length > i) raus.push(`</${stapel.pop()}>`);
      continue;
    }
    let attr = "";
    if (tag === "a") {
      const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const href = sichereAdresse(h ? (h[1] ?? h[2] ?? h[3]) : "");
      if (!href) continue;
      attr = ` href="${esc(href)}"` + (/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : "");
    }
    if (tag === "p" && stapel.includes("p")) while (stapel.includes("p")) raus.push(`</${stapel.pop()}>`);  // kein <p> im <p>
    stapel.push(tag); raus.push(`<${tag}${attr}>`);
  }
  while (stapel.length) raus.push(`</${stapel.pop()}>`);
  return raus.join("").replace(/<(p|li|b|strong|i|em)><\/\1>/g, "").trim();
}

// Klartext → Absätze (Leerzeile) und Zeilenumbrüche
const absaetze = t => String(t || "").trim().split(/\n\s*\n/).map(a => `<p>${esc(a.trim()).replace(/\n/g, "<br>")}</p>`).join("");

// ---------- Neuigkeiten und RSS ----------
export const heuteBerlin = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const datumLang = iso => new Date(iso + "T12:00:00Z").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const sichtbar = (eintraege, heute = heuteBerlin()) =>
  (eintraege || []).filter(e => e && e.titel && (!e.bis || e.bis >= heute)).sort((a, b) => String(b.datum).localeCompare(String(a.datum)));

export function neuigkeitenHtml(eintraege, { ebene = 3, bild = () => "", heute } = {}) {
  const h = Math.min(6, Math.max(2, +ebene || 3));
  const liste = sichtbar(eintraege, heute);
  if (!liste.length) return `<p class="kf-leer">Gerade gibt es keine Neuigkeiten.</p>`;
  return `<div class="kf-neuigkeiten">${liste.map(e => `
<article class="kf-neuigkeit" id="neu-${esc(e.id)}"><time datetime="${esc(e.datum)}">${esc(datumLang(e.datum))}</time><h${h}>${esc(e.titel)}</h${h}>${bild(e)}${absaetze(e.text)}</article>`).join("")}
<p class="kf-rss"><a href="feed.xml">Neuigkeiten als RSS-Feed abonnieren</a></p></div>`;
}

export function rssXml(eintraege, { titel, link, heute }) {
  const x = s => esc(s).replace(/&#39;/g, "&apos;");
  const items = sichtbar(eintraege, heute).map(e => `  <item>
    <title>${x(e.titel)}</title>
    <link>${x(link)}#neu-${x(e.id)}</link>
    <guid isPermaLink="false">${x(e.id)}</guid>
    <pubDate>${new Date(e.datum + "T09:00:00Z").toUTCString()}</pubDate>
    <description>${x(String(e.text || "").trim())}</description>
  </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${x(titel)}</title>
  <link>${x(link)}</link>
  <description>Neuigkeiten von ${x(titel)}</description>
  <language>de-de</language>
${items}
</channel>
</rss>
`;
}

// ---------- Website lesen ----------
export function htmlDateien(ordner) {
  return execFileSync("git", ["ls-files", "--", "*.html", "*.htm"], { cwd: ordner, encoding: "utf8" }).split("\n").filter(Boolean);
}
// schluessel → { art, attr, dateien[] }; widersprüchliche Arten für denselben Schlüssel sind ein Fehler im Code der Website
export function bereiche(ordner, dateien = htmlDateien(ordner)) {
  const v = new Map();
  for (const d of dateien) {
    for (const m of readFileSync(path.join(ordner, d), "utf8").matchAll(MARKER)) {
      const a = attribute(m[2]), art = ARTEN.includes(a.art) ? a.art : "text";
      const b = v.get(m[1]) || { art, attr: a, dateien: [] };
      if (b.art !== art) throw new Error(`Bereich ${m[1]} hat in ${d} eine andere Art (${art}) als anderswo (${b.art})`);
      if (!b.dateien.includes(d)) b.dateien.push(d);
      v.set(m[1], b);
    }
  }
  return v;
}

const inhaltErsetzen = (text, schluessel, fn) => text.replace(MARKER, (ganz, k, a, alt) => k === schluessel ? ganz.replace(alt, () => fn(alt, attribute(a))) : ganz);

// ---------- Bilder ----------
// Speichert ein Kundenbild als WebP (Größen aus p.bilder wie bei fotos.mjs). Gleiches Bild = gleicher Name, wird nicht doppelt abgelegt.
async function bildAblegen(p, schluessel, puffer) {
  const b = p.bilder || { ordner: "bilder", breite: 1200 };
  const name = `kf-${schluessel}-${createHash("sha1").update(puffer).digest("hex").slice(0, 8)}`;
  const ordner = path.join(p.ordner, b.ordner || "bilder");
  mkdirSync(ordner, { recursive: true });
  const { default: sharp } = await import("sharp");
  sharp.cache(false);
  const gross = path.join(ordner, `${name}.webp`);
  const info = await sharp(puffer).rotate().resize({ width: b.breite || 1200, withoutEnlargement: true }).webp({ quality: 74 }).toFile(gross);
  let klein = null;
  if (b.klein && info.width > b.klein) {
    klein = path.join(ordner, `${name}-${b.klein}.webp`);
    await sharp(puffer).rotate().resize({ width: b.klein }).webp({ quality: 72 }).toFile(klein);
  }
  return { gross, klein, kleinBreite: b.klein, breite: info.width, hoehe: info.height };
}
const relativ = (vonDatei, ziel, ordner) => path.relative(path.dirname(path.join(ordner, vonDatei)), ziel).split(path.sep).join("/");

function imgTag(altTag, bild, alt, datei, ordner) {
  const behalten = ["class", "loading", "decoding", "fetchpriority", "style", "sizes"];
  const alte = Object.fromEntries([...String(altTag || "").matchAll(/\s([a-z-]+)\s*=\s*"([^"]*)"/gi)].map(m => [m[1].toLowerCase(), m[2]]));
  const src = relativ(datei, bild.gross, ordner);
  const teile = [`src="${esc(src)}"`];
  if (bild.klein) teile.push(`srcset="${esc(relativ(datei, bild.klein, ordner))} ${bild.kleinBreite}w, ${esc(src)} ${bild.breite}w"`);
  teile.push(`alt="${esc(alt)}"`, `width="${bild.breite}"`, `height="${bild.hoehe}"`);
  for (const k of behalten) if (alte[k] != null && !(k === "sizes" && !bild.klein)) teile.push(`${k}="${esc(alte[k])}"`);
  if (bild.klein && alte.sizes == null) teile.push(`sizes="(max-width: 900px) 100vw, 50vw"`);
  return `<img ${teile.join(" ")}>`;
}

// ---------- Anwenden ----------
// aenderungen: [{ schluessel, wert }] (je Schlüssel die neueste). optionen.bildHolen(pfad) → Buffer (aus dem Speicher von Supabase).
// Ergebnis je Änderung: { schluessel, ok, meldung }. Schreibt nur Dateien, die sich wirklich ändern.
export async function inhalteAnwenden(p, aenderungen, { bildHolen, basisUrl = "", titel = "", heute } = {}) {
  const dateien = htmlDateien(p.ordner);
  const verz = bereiche(p.ordner, dateien);
  const texte = new Map(dateien.map(d => [d, readFileSync(path.join(p.ordner, d), "utf8")]));
  const feeds = new Map();  // Datei des feed.xml → Einträge
  const ergebnisse = [];

  for (const { schluessel, wert } of aenderungen) {
    try {
      const b = verz.get(schluessel);
      if (!b) throw new Error("Diesen Bereich gibt es auf der Website nicht (mehr)");
      if (!wert || typeof wert !== "object") throw new Error("Ungültiger Wert");
      let neu;  // (alterInhalt, datei) → neuer Inhalt
      if (b.art === "text" || b.art === "mehrzeilig") {
        if (typeof wert.html !== "string" || wert.html.length > 20000) throw new Error("Text fehlt oder ist zu lang");
        const sauber = bereinigen(wert.html, b.art === "mehrzeilig");
        neu = () => sauber;
      } else if (b.art === "link") {
        const href = sichereAdresse(wert.href);
        if (!href) throw new Error("Ungültige Adresse");
        const text = String(wert.text || "").trim().slice(0, 200);
        neu = alt => {
          const a = /<a\b([^>]*)>[\s\S]*?<\/a>/i.exec(alt);
          if (!a) throw new Error("Im Bereich steht kein Link");
          const attr = a[1].replace(/\s+href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "");
          return alt.replace(a[0], () => `<a href="${esc(href)}"${attr}>${esc(text || href)}</a>`);
        };
      } else if (b.art === "bild") {
        if (!wert.pfad || !bildHolen) throw new Error("Bild fehlt");
        const bild = await bildAblegen(p, schluessel, await bildHolen(wert.pfad));
        const alt = String(wert.alt || "").trim().slice(0, 300);
        neu = (altInhalt, datei) => {
          const img = /<img\b[^>]*>/i.exec(altInhalt);
          if (!img) throw new Error("Im Bereich steht kein Bild");
          return altInhalt.replace(img[0], () => imgTag(img[0], bild, alt, datei, p.ordner));
        };
      } else if (b.art === "neuigkeiten") {
        if (!Array.isArray(wert.eintraege) || wert.eintraege.length > 30) throw new Error("Ungültige Neuigkeiten");
        const eintraege = [];
        for (const e of wert.eintraege) {
          if (!/^[a-z0-9-]{4,40}$/i.test(String(e.id || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(e.datum || ""))) throw new Error("Ungültiger Eintrag");
          if (e.bis && !/^\d{4}-\d{2}-\d{2}$/.test(e.bis)) throw new Error("Ungültiges Datum");
          const x = { id: e.id, datum: e.datum, bis: e.bis || "", titel: String(e.titel || "").trim().slice(0, 200), text: String(e.text || "").slice(0, 4000) };
          if (e.bild && e.bild.pfad && bildHolen) { x.bild = await bildAblegen(p, `neu-${e.id}`.toLowerCase(), await bildHolen(e.bild.pfad)); x.bildAlt = String(e.bild.alt || "").slice(0, 300); }
          eintraege.push(x);
        }
        neu = (_, datei, attr) => {
          feeds.set(path.posix.join(path.posix.dirname(datei), "feed.xml"), { eintraege, datei });
          return "\n" + neuigkeitenHtml(eintraege, { ebene: attr.ebene, heute,
            bild: e => e.bild ? imgTag("", e.bild, e.bildAlt, datei, p.ordner).replace("<img ", '<img loading="lazy" ') : "" }) + "\n";
        };
      }
      for (const d of b.dateien) texte.set(d, inhaltErsetzen(texte.get(d), schluessel, (alt, attr) => neu(alt, d, attr)));
      ergebnisse.push({ schluessel, ok: true, meldung: "" });
    } catch (e) {
      ergebnisse.push({ schluessel, ok: false, meldung: e.message });
    }
  }

  for (const [d, t] of texte) if (t !== readFileSync(path.join(p.ordner, d), "utf8")) writeFileSync(path.join(p.ordner, d), t);
  for (const [feed, { eintraege, datei }] of feeds) {
    const seite = path.posix.dirname(datei) === "." ? "" : path.posix.dirname(datei) + "/";
    const link = basisUrl ? new URL(seite, basisUrl.replace(/\/?$/, "/")).href : seite || "./";
    const ziel = path.join(p.ordner, feed), xml = rssXml(eintraege, { titel: titel || "Neuigkeiten", link, heute });
    if (!existsSync(ziel) || readFileSync(ziel, "utf8") !== xml) writeFileSync(ziel, xml);
  }
  return ergebnisse;
}
