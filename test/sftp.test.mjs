// Testet den SFTP-Baustein ohne echten Server: Ein Ersatz-Client kopiert in einen lokalen Ordner.
// Aufruf: npm test
import { dateienListen, planen, uebertragen, sftpVeroeffentlichen } from "../waechter/ziele/sftp.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

let n = 0; const test = async (name, fn) => { await fn(); n++; console.log("ok –", name); };
const tmp = mkdtempSync(path.join(tmpdir(), "kf-sftp-"));
const quelle = path.join(tmp, "site"), server = path.join(tmp, "server");
const schreiben = (rel, inhalt) => { mkdirSync(path.dirname(path.join(quelle, rel)), { recursive: true }); writeFileSync(path.join(quelle, rel), inhalt); };

// Ersatz für ssh2-sftp-client, merkt sich die Reihenfolge
const protokoll = [];
const client = {
  async mkdir(d) { mkdirSync(path.join(server, d), { recursive: true }); },
  async put(lokal, entfernt) { protokoll.push(entfernt); copyFileSync(lokal, path.join(server, entfernt)); },
  async delete(entfernt) { protokoll.push("-" + entfernt); rmSync(path.join(server, entfernt)); },
};

try {
  schreiben("index.html", "<h1>Hallo</h1>");
  schreiben("bilder/a.webp", "bild-a");
  schreiben("stil.css", "body{}");
  schreiben(".htaccess", "RewriteEngine On");
  schreiben(".git/config", "geheim");
  schreiben("eingang/kunde.jpg", "roh");
  schreiben("desktop.ini", "x");
  schreiben(".env", "PASSWORT=x");

  await test("Liste enthält nur Website-Dateien (keine .git, .env, eingang, desktop.ini; aber .htaccess)", async () => {
    assert.deepEqual(Object.keys(dateienListen(quelle)).sort(), [".htaccess", "bilder/a.webp", "index.html", "stil.css"]);
  });

  await test("Erstes Hochladen: alles, HTML zuletzt", async () => {
    const plan = planen({}, dateienListen(quelle));
    assert.equal(plan.hochladen.at(-1), "index.html");
    assert.deepEqual(plan.loeschen, []);
    await uebertragen(client, quelle, "/www", plan);
    assert.equal(readFileSync(path.join(server, "www/bilder/a.webp"), "utf8"), "bild-a");
    assert.equal(protokoll.at(-1), "/www/index.html");
  });

  await test("Zweites Hochladen: nur Geändertes, Entferntes wird gelöscht", async () => {
    const alt = dateienListen(quelle);
    schreiben("stil.css", "body{color:red}");
    rmSync(path.join(quelle, "bilder/a.webp"));
    schreiben("bilder/b.webp", "bild-b");
    protokoll.length = 0;
    const plan = planen(alt, dateienListen(quelle));
    assert.deepEqual(plan.hochladen, ["bilder/b.webp", "stil.css"]);
    assert.deepEqual(plan.loeschen, ["bilder/a.webp"]);
    await uebertragen(client, quelle, "/www", plan);
    assert.ok(!existsSync(path.join(server, "www/bilder/a.webp")));
    assert.deepEqual(protokoll, ["/www/bilder/b.webp", "/www/stil.css", "-/www/bilder/a.webp"]);
  });

  await test("Fremde Dateien auf dem Server bleiben unberührt", async () => {
    writeFileSync(path.join(server, "www/fremd.txt"), "vom Kunden");
    const plan = planen(dateienListen(quelle), dateienListen(quelle));
    assert.deepEqual(plan, { hochladen: [], loeschen: [] });
    await uebertragen(client, quelle, "/www", plan);
    assert.ok(existsSync(path.join(server, "www/fremd.txt")));
  });

  await test("Ohne Zugangsdaten oder Ziel klare Fehlermeldung statt Verbindungsversuch", async () => {
    const p = { slug: "baeckerei-x", ordner: quelle, ziel: { art: "sftp", host: "h", benutzer: "u", pfad: "/" } };
    await assert.rejects(sftpVeroeffentlichen(p, {}, path.join(tmp, "merk")), /KF_ZIEL_BAECKEREI_X_PASSWORT/);
    await assert.rejects(sftpVeroeffentlichen({ ...p, ziel: { art: "sftp" } }, {}, path.join(tmp, "merk")), /unvollständig/);
    await assert.rejects(sftpVeroeffentlichen({ ...p, ausgabe: "gibts-nicht" }, { KF_ZIEL_BAECKEREI_X_PASSWORT: "x" }, path.join(tmp, "merk")), /Ausgabe-Ordner/);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\nAlle ${n} SFTP-Tests bestanden.`);
