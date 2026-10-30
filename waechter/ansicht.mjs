// „Augen“ der Automatik: Bildschirmfotos einer Seite aus dem lokalen Projektordner, am Desktop und am Handy.
// Ein kleiner Server liefert nur Dateien aus dem Projektordner aus; Anfragen an andere Adressen werden blockiert.
import http from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TYPEN = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const GERAETE = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "handy", width: 390, height: 844, isMobile: true, hasTouch: true },
];

// Vorschau-Adresse des Wunsches → Datei im Projektordner (null, wenn sie nicht zum Projekt gehört)
export function seitePfad(p, url) {
  if (!p.vorschau_url || !url || !url.startsWith(p.vorschau_url)) return null;
  let rel = decodeURIComponent(url.slice(p.vorschau_url.length).split(/[?#]/)[0]);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (rel.split("/").includes("..") || path.isAbsolute(rel)) return null;
  return rel;
}

function server(ordner) {
  const wurzel = path.resolve(ordner);
  const s = http.createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (rel.endsWith("/")) rel += "index.html";
      const datei = path.resolve(wurzel, "." + rel);
      if (!datei.startsWith(wurzel + path.sep) || !(await stat(datei)).isFile()) throw 0;
      res.writeHead(200, { "content-type": TYPEN[path.extname(datei).toLowerCase()] || "application/octet-stream" });
      res.end(await readFile(datei));
    } catch (e) { res.writeHead(404).end(); }
  });
  return new Promise(ok => s.listen(0, "127.0.0.1", () => ok(s)));
}

// Fotografiert die Seite (bzw. den Abschnitt um den Selektor) und legt PNGs in <ziel>/<praefix>-desktop.png und -handy.png ab.
// Gibt die Pfade relativ zum Projektordner zurück.
// verschiebung {dx, dy, breite}: das markierte Element so verschoben fotografieren, wie der Kunde es gezogen hat –
// nur auf dem Gerät, dessen Breite zu seiner passt („Wunschbild“).
export async function ansichten(p, { seite, selektor = "", ziel, praefix, verschiebung = null }) {
  await mkdir(path.join(p.ordner, ziel), { recursive: true });
  const srv = await server(p.ordner);
  const basis = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await puppeteer.launch({ executablePath: p.chrome || CHROME, headless: true, args: ["--no-first-run", "--disable-extensions"] });
  const fotos = [];
  try {
    const geraete = verschiebung ? [(+verschiebung.breite || 1440) < 700 ? GERAETE[1] : GERAETE[0]] : GERAETE;
    const v = verschiebung ? { dx: Math.round(+verschiebung.dx) || 0, dy: Math.round(+verschiebung.dy) || 0 } : null;
    for (const g of geraete) {
      const seiteTab = await browser.newPage();
      await seiteTab.setViewport({ width: g.width, height: g.height, isMobile: !!g.isMobile, hasTouch: !!g.hasTouch, deviceScaleFactor: 1 });
      await seiteTab.setRequestInterception(true);
      seiteTab.on("request", r => (r.url().startsWith(basis) || r.url().startsWith("data:") ? r.continue() : r.abort()));
      await seiteTab.goto(basis + seite, { waitUntil: "networkidle0", timeout: 30000 });
      await seiteTab.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
      // Abschnitt um die markierte Stelle suchen, Stelle gestrichelt rot umranden
      const rahmen = await seiteTab.evaluate((sel, v) => {
        // Fest stehende Einblendungen (Entwurfs-Leiste, Knöpfe) würden sonst über dem Ausschnitt liegen
        for (const x of document.querySelectorAll("body *")) if (getComputedStyle(x).position === "fixed") x.style.visibility = "hidden";
        let el = null;
        try { el = sel ? document.querySelector(sel) : null; } catch (e) {}
        if (!el) return null;
        el.style.outline = "3px dashed #e11d48"; el.style.outlineOffset = "4px";
        if (v) { if (getComputedStyle(el).display === "inline") el.style.display = "inline-block"; el.style.transform = `${el.style.transform} translate(${v.dx}px, ${v.dy}px)`; }
        const block = el.closest("section, header, footer, aside, main > *") || el;
        el.scrollIntoView({ block: "center" });  // lädt auch Bilder mit loading="lazy" rund um die Stelle
        const b = block.getBoundingClientRect(), r = el.getBoundingClientRect();
        let y = b.top + scrollY, hoehe = Math.max(b.height, 300);
        // Langer Abschnitt: Ausschnitt um die markierte Stelle statt nur den Anfang des Abschnitts
        if (hoehe > 1800) {
          const mitte = r.top + scrollY + r.height / 2;
          y = Math.max(y, Math.min(mitte - 700, b.bottom + scrollY - 1400));
          hoehe = 1400;
        }
        return { x: 0, y, width: document.documentElement.clientWidth, height: hoehe };
      }, selektor, v);
      // Nach dem Scrollen nachgeladene Bilder (loading="lazy") abwarten
      await seiteTab.waitForNetworkIdle({ idleTime: 300, timeout: 5000 }).catch(() => {});
      await seiteTab.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i => new Promise(ok => { i.onload = i.onerror = ok; setTimeout(ok, 3000); }))));
      const datei = path.join(ziel, `${praefix}-${g.name}.png`).replaceAll("\\", "/");
      await seiteTab.screenshot({ path: path.join(p.ordner, datei), ...(rahmen ? { clip: rahmen, captureBeyondViewport: true } : {}) });
      fotos.push(datei);
      await seiteTab.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  return fotos;
}
