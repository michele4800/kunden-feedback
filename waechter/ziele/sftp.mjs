// Veröffentlichen per SFTP (STRATO, IONOS, All-Inkl, Hetzner-Webhosting …).
// Lädt nur geänderte Dateien hoch und löscht nur Dateien, die wir früher selbst hochgeladen haben – fremde Dateien
// auf dem Server bleiben unberührt. Bilder, CSS und Skripte zuerst, HTML zuletzt: Seiten zeigen nie auf fehlende Dateien.
// Die Liste des Hochgeladenen (Prüfsummen) liegt beim Wächter, nicht im Website-Ordner, damit dieser sauber bleibt.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

// Nie hochladen: Git, Arbeitsordner der Automatik, Windows-/Mac-Systemdateien, versteckte Dateien außer .htaccess
const AUSLASSEN = /(^|\/)(\.git|node_modules|eingang)(\/|$)|(^|\/)(desktop\.ini|Thumbs\.db|\.DS_Store)$|(^|\/)\.(?!htaccess$)[^/]+$/i;

export function dateienListen(quelle) {
  const liste = {};
  const gehen = rel => {
    for (const n of readdirSync(path.join(quelle, rel))) {
      const r = rel ? `${rel}/${n}` : n;
      if (AUSLASSEN.test(r)) continue;
      const s = statSync(path.join(quelle, r));
      if (s.isDirectory()) gehen(r);
      else liste[r] = createHash("sha1").update(readFileSync(path.join(quelle, r))).digest("hex");
    }
  };
  gehen("");
  return liste;
}

// alt/neu: { "pfad": "prüfsumme" } → was hoch- und was runtergeladen werden muss
export function planen(alt, neu) {
  const geaendert = Object.keys(neu).filter(d => alt[d] !== neu[d]).sort();
  const istSeite = d => /\.html?$/i.test(d);
  return {
    hochladen: [...geaendert.filter(d => !istSeite(d)), ...geaendert.filter(istSeite)],
    loeschen: Object.keys(alt).filter(d => !(d in neu)).sort(),
  };
}

// client: { mkdir(pfad, rekursiv), put(lokal, entfernt), delete(entfernt) } – ssh2-sftp-client oder ein Test-Ersatz
export async function uebertragen(client, quelle, zielPfad, plan) {
  const ordner = new Set();
  for (const d of plan.hochladen) {
    const entfernt = path.posix.join(zielPfad, d), dir = path.posix.dirname(entfernt);
    if (!ordner.has(dir)) { await client.mkdir(dir, true).catch(() => {}); ordner.add(dir); }
    await client.put(path.join(quelle, d), entfernt);
  }
  for (const d of plan.loeschen) await client.delete(path.posix.join(zielPfad, d)).catch(() => {});  // schon weg ist auch gut
}

// Ziel aus projekte.json: { art: "sftp", host, port, benutzer, pfad }; Passwort bzw. Schlüsseldatei nur aus .env
export async function sftpVeroeffentlichen(p, env, merkOrdner) {
  const z = p.ziel || {};
  if (!z.host || !z.benutzer || !z.pfad) throw new Error("SFTP-Ziel unvollständig: host, benutzer und pfad in projekte.json eintragen");
  const name = `KF_ZIEL_${p.slug.toUpperCase().replace(/-/g, "_")}`;
  const passwort = env[`${name}_PASSWORT`], schluessel = env[`${name}_SCHLUESSEL`];
  if (!passwort && !schluessel) throw new Error(`Zugangsdaten fehlen: ${name}_PASSWORT oder ${name}_SCHLUESSEL in waechter/.env eintragen`);
  const quelle = path.resolve(p.ordner, p.ausgabe || ".");
  if (!existsSync(quelle)) throw new Error(`Ausgabe-Ordner fehlt: ${quelle}`);

  mkdirSync(merkOrdner, { recursive: true });
  const merk = path.join(merkOrdner, `${p.slug}.json`);
  let alt = {};
  try { alt = JSON.parse(readFileSync(merk, "utf8")); } catch (e) {}
  const neu = dateienListen(quelle);
  const plan = planen(alt, neu);
  if (!plan.hochladen.length && !plan.loeschen.length) return { dateien: 0, ziel: `SFTP ${z.host}`, meldung: "Server ist schon aktuell" };

  const { default: SftpClient } = await import("ssh2-sftp-client");
  const client = new SftpClient();
  try {
    await client.connect({ host: z.host, port: z.port || 22, username: z.benutzer, readyTimeout: 20000,
      ...(schluessel ? { privateKey: readFileSync(schluessel) } : { password: passwort }) });
    await uebertragen(client, quelle, z.pfad, plan);
  } finally { await client.end().catch(() => {}); }
  writeFileSync(merk, JSON.stringify(neu));  // erst nach Erfolg merken – sonst beim nächsten Mal alles erneut
  return { dateien: plan.hochladen.length + plan.loeschen.length, ziel: `SFTP ${z.host}`,
    meldung: `${plan.hochladen.length} hochgeladen${plan.loeschen.length ? `, ${plan.loeschen.length} gelöscht` : ""}` };
}
