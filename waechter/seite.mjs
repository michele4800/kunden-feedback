// Ganze Seite aus dem Editor (GrapesJS) übernehmen – ohne KI, getestet in test/seite.test.mjs.
//
// Der Editor schickt { art: "seite", html, css, basis }: den neuen Inhalt des <body>, die Stile des Kunden und den Prüfwert
// der Seite, die er geladen hat. Der Wächter
//   1. lehnt ab, wenn sich die Datei inzwischen geändert hat (z. B. durch einen KI-Wunsch),
//   2. bereinigt das HTML nach einer Positivliste (kein Skript, keine Ereignisse, keine javascript:-Adressen),
//   3. setzt die automatisch gefüllten Bereiche (docs/sperren.js) Zeichen für Zeichen wieder ein – doppelt: Abbruch,
//   4. behält <head> und <body>-Tag der Datei und schreibt die Stile nach <seite>.kf.css.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esc, sichereAdresse } from "./inhalte.mjs";

const ctx = {};
vm.runInNewContext(readFileSync(fileURLToPath(new URL("../docs/sperren.js", import.meta.url)), "utf8"), ctx);
export const { zerlegen, sperren, pruefwert } = ctx.KF_SPERREN;

const SVG = ["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "title", "desc", "defs", "use", "symbol", "lineargradient", "radialgradient", "stop"];
const TAGS = new Set([
  "section", "header", "footer", "main", "nav", "article", "aside", "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "a", "img", "picture", "source", "figure", "figcaption", "blockquote", "q", "cite",
  "b", "strong", "i", "em", "small", "mark", "s", "u", "sub", "sup", "abbr", "time", "address", "br", "hr", "wbr",
  "table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col", "details", "summary", "button", ...SVG,
  // Formulare (schickt kf-komponenten.js an die Edge Function „formular“ – ohne action, ohne eigenes Ziel) und Video-Hintergrund
  "form", "label", "input", "textarea", "select", "option", "fieldset", "legend", "video"]);
const LEER = new Set(["img", "source", "br", "hr", "wbr", "col", "input"]);
const WEG_MIT_INHALT = /^(script|style|iframe|object|embed|template|noscript|math|frame|frameset|applet|base|link|meta)$/;
const ATTR = new Set(["class", "id", "style", "title", "lang", "dir", "role", "hidden", "tabindex", "width", "height", "alt", "src", "srcset",
  "sizes", "href", "target", "rel", "loading", "decoding", "fetchpriority", "datetime", "colspan", "rowspan", "scope", "headers", "open",
  "type", "span", "start", "reversed", "cite", "media",
  "name", "placeholder", "required", "maxlength", "minlength", "rows", "cols", "for", "autocomplete", "value", "checked", "selected", "multiple",
  "min", "max", "step", "inputmode", "novalidate", "autoplay", "muted", "loop", "playsinline", "poster", "preload", "controls",
  "viewbox", "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "cx", "cy", "r", "rx", "ry",
  "x", "y", "x1", "y1", "x2", "y2", "points", "transform", "opacity", "fill-rule", "clip-rule", "xmlns", "focusable", "preserveaspectratio",
  "offset", "stop-color", "gradientunits"]);
const ADRESSE = new Set(["href", "src", "cite", "poster"]);
// Eingabefelder nur als einfache Felder – kein Passwort, keine Datei, nichts Verstecktes
const EINGABE = /^(text|email|tel|url|date|time|number|checkbox|radio|search)$/;

const entitaeten = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (g, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1))
    : { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " }[e.toLowerCase()]);
const textEsc = s => s.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stilSicher = s => !/expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding|@import|<\/?\s*style/i.test(entitaeten(s).replace(/\\/g, ""));

function attributeLesen(roh) {
  const raus = [];
  for (const m of roh.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
    raus.push([m[1], entitaeten(m[2] ?? m[3] ?? m[4] ?? "")]);
  return raus;
}

// html: Body-Inhalt aus dem Editor → { html (mit Platzhaltern), bilder: [{ marke, pfad, attr }] }
export function seiteBereinigen(html, marke) {
  const raus = [], stapel = [], bilder = [];
  let ueberspringen = null;
  for (const teil of String(html || "").split(/(<[^>]*>)/)) {
    if (!teil) continue;
    const m = teil[0] === "<" ? /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)\s*>$/.exec(teil) : null;
    if (ueberspringen) { if (m && m[1] && m[2].toLowerCase() === ueberspringen) ueberspringen = null; continue; }
    if (teil[0] !== "<") { raus.push(textEsc(teil)); continue; }
    if (!m) { if (!/^<\s*[!?/]/.test(teil)) raus.push(textEsc(teil)); continue; }  // Kommentare fliegen raus
    const zu = !!m[1], tag = m[2].toLowerCase();
    if (!zu && WEG_MIT_INHALT.test(tag)) { if (!m[4] && !LEER.has(tag)) ueberspringen = tag; continue; }
    if (!TAGS.has(tag)) continue;
    if (zu) {
      const i = stapel.lastIndexOf(tag);
      if (i >= 0) while (stapel.length > i) raus.push(`</${stapel.pop()}>`);
      continue;
    }
    let bild = null, datei = null, ziel = "";
    const attr = [];
    for (const [roh, wert] of attributeLesen(m[3])) {
      const n = roh.toLowerCase();
      if (n === "data-kf-bild" && tag === "img") { bild = wert; continue; }
      if (n === "data-kf-datei" && (tag === "video" || tag === "source")) { datei = wert; continue; }
      const ok = ATTR.has(n) || /^aria-[a-z-]+$/.test(n) || (/^data-[a-z0-9-]+$/.test(n) && !n.startsWith("data-kf-"));
      if (!ok) continue;
      let w = wert;
      if (ADRESSE.has(n)) { w = sichereAdresse(w); if (!w) continue; }
      if (n === "srcset") { const t = w.split(",").map(x => x.trim().split(/\s+/)).filter(([u]) => sichereAdresse(u)); if (!t.length) continue; w = t.map(x => x.join(" ")).join(", "); }
      if (n === "style" && !stilSicher(w)) continue;
      if (n === "target") { if (w !== "_blank") continue; ziel = w; }
      if (n === "rel") continue;  // wird unten gesetzt
      if (n === "type" && tag === "input" && !EINGABE.test(w.toLowerCase())) w = "text";
      if (n === "type" && tag === "button" && !/^(button|submit|reset)$/i.test(w)) w = "button";
      attr.push([SVG.includes(tag) || n === "viewbox" ? roh : n, w]);
    }
    if (tag === "a" && ziel) attr.push(["rel", "noopener"]);
    if (datei) {  // Video aus der Medienbibliothek: Wächter legt die Datei ab, Platzhalter ersetzt src
      const nr = bilder.push({ pfad: datei, attr, datei: true, tag }) - 1;
      bilder[nr].marke = `${marke}b${nr}x`;
      attr.splice(0, attr.length, ...attr.filter(([n]) => n !== "src"), ["src", bilder[nr].marke]);
    }
    const attrText = attr.map(([n, w]) => ` ${n}="${esc(w)}"`).join("");
    if (bild) {
      const nr = bilder.push({ pfad: bild, attr, datei: false }) - 1;
      bilder[nr].marke = `${marke}b${nr}x`;
      raus.push(bilder[nr].marke);
      continue;
    }
    if (LEER.has(tag)) { raus.push(`<${tag}${attrText}>`); continue; }
    if (m[4] && SVG.includes(tag)) { raus.push(`<${roh(m[2])}${attrText}/>`); continue; }
    stapel.push(tag); raus.push(`<${roh(m[2])}${attrText}>`);
  }
  while (stapel.length) raus.push(`</${stapel.pop()}>`);
  return { html: raus.join(""), bilder };
}
const roh = t => SVG.includes(t.toLowerCase()) ? t : t.toLowerCase();

// Stile des Kunden (nur CSS, keine Importe/Skript-Tricks)
export function stileBereinigen(css) {
  const t = String(css || "");
  if (t.length > 300000) throw new Error("Zu viele Stile");
  if (!stilSicher(t)) throw new Error("Die Stile enthalten nicht erlaubte Anweisungen");
  return t.trim();
}

// Seite zur Adresse finden: Pfad relativ zu einer der bekannten Website-Adressen, muss eine HTML-Datei im Git sein
export function dateiZurAdresse(seiteUrl, basisAdressen, dateien) {
  let u;
  try { u = new URL(seiteUrl); } catch (e) { throw new Error("Ungültige Seitenadresse"); }
  for (const b of basisAdressen.filter(Boolean)) {
    let basis;
    try { basis = new URL(b.replace(/\/?$/, "/")); } catch (e) { continue; }
    if (u.origin !== basis.origin || !u.pathname.startsWith(basis.pathname)) continue;
    let rel = decodeURIComponent(u.pathname.slice(basis.pathname.length));
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    rel = path.posix.normalize(rel);
    if (dateien.includes(rel)) return rel;
  }
  throw new Error("Diese Seite gehört nicht zur Website des Projekts");
}

// ---------- Daten (z. B. Öffnungszeiten in daten.json) ----------
// Die Website legt fest, was im Editor änderbar ist: kf-daten.json im Website-Ordner, z. B.
//   { "datei": "daten.json", "felder": [{ "pfad": "betrieb.telefon_anzeige", "titel": "Telefon" },
//     { "liste": "orte", "titel": "Orte", "name": "name", "felder": [{ "pfad": "zeiten", "titel": "Öffnungszeiten", "art": "woche" }] }] }
// Der Kunde schickt { art: "daten", werte: { "orte.0.zeiten": {…}, "betrieb.telefon_anzeige": "…" }, basis }.
// Nur Pfade aus kf-daten.json, nur Texte (keine Zahlen, keine neuen Einträge) – Koordinaten, Bilder usw. bleiben unberührt.
export function erlaubtePfade(schema, daten) {
  const erlaubt = new Map();
  for (const f of schema.felder || []) {
    if (f.liste) {
      const liste = f.liste.split(".").reduce((o, k) => o == null ? o : o[k], daten);
      if (Array.isArray(liste)) liste.forEach((_, i) => { for (const u of f.felder || []) erlaubt.set(`${f.liste}.${i}.${u.pfad}`, u.art || "text"); });
    } else erlaubt.set(f.pfad, f.art || "text");
  }
  return erlaubt;
}
const TEXT_OK = w => typeof w === "string" && w.length <= 2000 && !/[<>]/.test(w);
export function datenUebernehmen(altText, schema, wert) {
  if (!wert || typeof wert.werte !== "object" || !wert.werte) throw new Error("Keine Daten");
  if (wert.basis !== pruefwert(altText)) throw new Error("Die Daten wurden inzwischen geändert. Bitte die Seite neu laden und noch einmal ändern.");
  const daten = JSON.parse(altText);
  const erlaubt = erlaubtePfade(schema, daten);
  for (const [pfad, w] of Object.entries(wert.werte)) {
    const art = erlaubt.get(pfad);
    if (!art) throw new Error(`Das Feld ${pfad} ist nicht änderbar`);
    if (art === "woche") {
      if (!w || typeof w !== "object" || Array.isArray(w)) throw new Error("Ungültige Öffnungszeiten");
      for (const [tag, z] of Object.entries(w)) if (!/^[1-7]$/.test(tag) || !TEXT_OK(z) || z.length > 120) throw new Error("Ungültige Öffnungszeiten");
    } else if (!TEXT_OK(w)) throw new Error(`Ungültiger Wert für ${pfad}`);
    const teile = pfad.split("."), letzter = teile.pop();
    const ziel = teile.reduce((o, k) => o[k], daten);
    const neu = art === "woche" ? Object.fromEntries(Object.entries(w).map(([t, z]) => [t, z.trim()]).filter(([, z]) => z).sort()) : w.trim();
    if (neu === "" || (art === "woche" && !Object.keys(neu).length)) delete ziel[letzter]; else ziel[letzter] = neu;
  }
  return JSON.stringify(daten, null, 2) + "\n";
}

// alt: bisheriger Dateitext. wert: { html, css, basis }. bildAblegen(pfad) → Promise<{ src, srcset?, breite, hoehe }> (Pfade relativ zur Seite).
// Ergebnis: { text, css } – css ist der Inhalt für <seite>.kf.css (leer = keine eigenen Stile)
// dateiAblegen(pfad) → Promise<src> (Videos, unverändert abgelegt). Seiten mit data-komp="…" bekommen kf-komponenten.js eingebunden
// (Ergebnis komponenten: true – die Datei schreibt der Aufrufer). wert.seo = { titel, beschreibung, bild } ändert <title> und Meta-Angaben;
// bild ist ein Pfad im Speicher (wird abgelegt) oder eine Adresse; seiteUrl macht daraus die absolute Adresse für og:image.
export async function seiteUebernehmen(alt, wert, { cssDatei, bildAblegen, dateiAblegen, seiteUrl = "" }) {
  if (!wert || typeof wert.html !== "string" || wert.html.length > 500000) throw new Error("Seiteninhalt fehlt oder ist zu groß");
  if (wert.basis !== pruefwert(alt)) throw new Error("Die Seite wurde inzwischen geändert (z. B. durch einen KI-Wunsch). Bitte die Seite neu laden und die Änderung noch einmal machen.");
  const { kopf, body, fuss } = zerlegen(alt);
  const { bereiche } = sperren(body);
  const marke = "kf" + randomBytes(6).toString("hex");

  // gesperrte Bereiche gegen Platzhalter tauschen, bevor bereinigt wird
  const gesehen = new Map();
  const ohne = wert.html.replace(/<kf-sperre\b([^>]*)>[\s\S]*?<\/kf-sperre\s*>/gi, (g, a) => {
    const nr = +((/\bdata-nr\s*=\s*["']?(\d+)/.exec(a) || [])[1] ?? -1);
    if (!(nr >= 0 && nr < bereiche.length)) return "";
    gesehen.set(nr, (gesehen.get(nr) || 0) + 1);
    return `${marke}s${nr}x`;
  });
  // gelöscht darf ein Bereich werden (dann steht er auf dieser Seite nicht mehr), doppelt nicht
  if ([...gesehen.values()].some(n => n > 1)) throw new Error("Ein automatisch gefüllter Bereich (z. B. Öffnungszeiten) ist doppelt – bitte nicht kopieren, sondern verschieben");

  const sauber = seiteBereinigen(ohne, marke);
  let neu = sauber.html;
  for (const b of sauber.bilder) {
    if (b.datei) {
      if (!dateiAblegen) throw new Error("Videos werden hier nicht unterstützt");
      const src = await dateiAblegen(b.pfad);
      neu = neu.replace(b.marke, () => esc(src));
      continue;
    }
    const x = await bildAblegen(b.pfad);
    const behalten = b.attr.filter(([n]) => !["src", "srcset", "sizes", "width", "height"].includes(n.toLowerCase()));
    if (!behalten.some(([n]) => n === "alt")) behalten.push(["alt", ""]);
    const teile = [["src", x.src], ...(x.srcset ? [["srcset", x.srcset], ["sizes", "(max-width: 900px) 100vw, 50vw"]] : []), ["width", x.breite], ["height", x.hoehe], ...behalten];
    neu = neu.replace(b.marke, () => `<img${teile.map(([n, w]) => ` ${n}="${esc(w)}"`).join("")}>`);
  }
  // GrapesJS liefert alles in einer Zeile – Zeilenumbrüche vor Blöcken halten die Datei lesbar (für Git und KI-Wünsche)
  neu = neu.replace(/(?<=[^\n])(<(?:section|header|main|footer|nav|article|aside|h[1-6]|p|ul|ol|table|figure|blockquote)\b|<\/(?:section|header|main|footer|nav|article|aside)>)/g, "\n$1");
  neu = neu.replace(new RegExp(`${marke}s(\\d+)x`, "g"), (g, nr) => bereiche[+nr]);

  const css = stileBereinigen(wert.css);
  let k = kopf;
  const link = `<link rel="stylesheet" href="${cssDatei}">`;
  if (css && !k.includes(link)) k = k.replace(/<\/head>/i, `${link}\n</head>`);
  const komponenten = /\sdata-komp="/.test(neu);
  const skript = `<script src="${KOMPONENTEN}" defer></script>`;
  if (komponenten && !k.includes(skript)) k = k.replace(/<\/head>/i, `${skript}\n</head>`);
  if (wert.seo) k = await kopfSeo(k, wert.seo, { bildAblegen, seiteUrl });
  return { text: k + "\n" + neu.trim() + "\n" + fuss, css, komponenten };
}

export const KOMPONENTEN = "kf-komponenten.js";

// <title>, Beschreibung und Teilen-Angaben (Open Graph) im Kopf setzen. Leere Werte lassen den bisherigen Stand.
async function kopfSeo(k, seo, { bildAblegen, seiteUrl }) {
  const text = (w, max) => String(w || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const titel = text(seo.titel, 120), beschreibung = text(seo.beschreibung, 320);
  const meta = (attr, name, inhalt) => {
    const re = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${name}["'][^>]*>`, "i");
    const tag = `<meta ${attr}="${name}" content="${esc(inhalt)}">`;
    k = re.test(k) ? k.replace(re, () => tag) : k.replace(/<\/head>/i, `${tag}\n</head>`);
  };
  if (titel) {
    const re = /<title\b[^>]*>[\s\S]*?<\/title>/i;
    k = re.test(k) ? k.replace(re, () => `<title>${esc(titel)}</title>`) : k.replace(/<\/head>/i, `<title>${esc(titel)}</title>\n</head>`);
    meta("property", "og:title", titel);
  }
  if (beschreibung) { meta("name", "description", beschreibung); meta("property", "og:description", beschreibung); }
  if (seo.bild) {
    let src = "";
    if (/^https?:\/\//i.test(seo.bild)) src = sichereAdresse(seo.bild);
    else if (bildAblegen) src = (await bildAblegen(seo.bild)).src;
    if (src) { try { src = new URL(src, seiteUrl || undefined).href; } catch (e) {} meta("property", "og:image", src); }
  }
  return k;
}
