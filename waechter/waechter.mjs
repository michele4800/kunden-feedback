// Wächter: holt neue Kundenwünsche aus Supabase und lässt sie von Claude Code umsetzen.
// Start:  npm run waechter        (Einstellungen: waechter/.env und waechter/projekte.json)
//
// Ablauf je Wunsch:  offen → Aufwand schätzen → in_arbeit (mit voraussichtlicher Fertigstellung)
//   → Claude ändert die Website im Projektordner → Bau prüfen → Commit
//   → Modus „direkt“: push, erledigt   |   Modus „mit_freigabe“: Zweig, zur_freigabe → nach Freigabe push, erledigt
//   → Unklar: rueckfrage mit Frage an den Kunden; nach seiner Antwort wieder offen.
// Der Wächter meldet sich als normaler Agentur-Benutzer an (kein service_role-Schlüssel).
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { claude as claudeRoh, SYSTEM, SCHEMA_SCHAETZUNG, SCHEMA_ERGEBNIS, wunschText } from "./claude.mjs";
import { bildHinweis, fotosAblegen } from "./fotos.mjs";
import { ansichten, seitePfad } from "./ansicht.mjs";
import { veroeffentlichen, hatZiel } from "./ziele/index.mjs";
import { inhalteAnwenden, heuteBerlin } from "./inhalte.mjs";
import { einrichten } from "./einrichten.mjs";
import { kiApi } from "./ki.mjs";
import os from "node:os";
import net from "node:net";
import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HIER = path.dirname(fileURLToPath(import.meta.url));
// So erscheint die Automatik bei Kunden (Bearbeiter); muss zum Anzeigenamen in „mitglieder“ passen

// ---------- Einstellungen ----------
function env() {
  const datei = path.join(HIER, ".env");
  if (!existsSync(datei)) throw new Error("waechter/.env fehlt – siehe .env.beispiel");
  const e = Object.fromEntries(readFileSync(datei, "utf8").split(/\r?\n/).filter(z => /^\s*[A-Z_]+\s*=/.test(z))
    .map(z => { const i = z.indexOf("="); return [z.slice(0, i).trim(), z.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
  for (const k of ["KF_URL", "KF_SCHLUESSEL", "KF_EMAIL", "KF_PASSWORT"]) if (!e[k]) throw new Error(`${k} fehlt in waechter/.env`);
  return e;
}
const ENV = env();
// So erscheint die Automatik bei Kunden (Bearbeiter); muss zum Anzeigenamen in „mitglieder“ passen
const NAME = ENV.KF_NAME || "Michele (Automatik)";
const KONF = JSON.parse(readFileSync(path.join(HIER, "projekte.json"), "utf8"));
// Selbst eingerichtete Websites (aus dem Dashboard); Einträge in projekte.json gehen vor
const AUTO = path.join(HIER, "projekte.auto.json");
const AUTO_PROJEKTE = existsSync(AUTO) ? JSON.parse(readFileSync(AUTO, "utf8")) : {};
KONF.projekte = { ...AUTO_PROJEKTE, ...(KONF.projekte || {}) };
const INTERVALL = (KONF.intervall_sekunden || 60) * 1000;
const MAX_PRO_TAG = KONF.max_pro_tag || 20;
const CLAUDE = ENV.CLAUDE_BEFEHL || "claude";
const ZAEHLER = path.join(HIER, ".heute.json");
const MERK = path.join(HIER, ".ziele");  // je Projekt: Stand des Servers (SFTP) und „Veröffentlichen nachholen“
// KI-Anbieter laut Dashboard: Claude Code auf diesem PC (cli), Claude-API oder ChatGPT-API. Ohne Einstellung bleibt es bei cli.
const ANBIETER = { cli: "Claude Code", claude_api: "Claude-API", openai_api: "ChatGPT-API" };
let letzterAnbieter = "";
async function claude(prompt, o) {
  const { data: e, error } = await sb.from("ki_einstellungen").select("*").maybeSingle();
  const wahl = (!error && e && e.anbieter) || "cli";
  if (wahl !== letzterAnbieter) { log(`KI-Anbieter: ${ANBIETER[wahl] || wahl}${wahl === "cli" ? "" : ` (${wahl === "claude_api" ? e.modell_claude : e.modell_openai})`}`); letzterAnbieter = wahl; }
  if (wahl === "cli") return claudeRoh(prompt, { ...o, befehl: CLAUDE, maxMinuten: KONF.max_minuten || 30, modell: o.schnell ? "sonnet" : "" });
  const schluessel = ok(await sb.rpc("ki_schluessel_holen", { p_anbieter: wahl }));
  if (!schluessel) throw new Error(`Für ${ANBIETER[wahl]} ist im Dashboard kein API-Schlüssel hinterlegt`);
  return kiApi(prompt, { ...o, maxMinuten: KONF.max_minuten || 30, anbieter: wahl, modell: wahl === "claude_api" ? e.modell_claude : e.modell_openai, schluessel });
}

const sb = createClient(ENV.KF_URL, ENV.KF_SCHLUESSEL, { auth: { persistSession: false, autoRefreshToken: true } });
const LOGBUCH = path.join(HIER, "waechter.log");
const log = (...a) => {
  const z = [new Date().toLocaleString("de-DE"), ...a].join(" ");
  console.log(z);
  try { appendFileSync(LOGBUCH, z + "\n"); } catch (e) {}
};
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// Läufe heute: gesamt (für die Tagesgrenze) und je Projekt (fürs Dashboard)
function heuteZaehlen(plus = 0, slug = "") {
  const tag = new Date().toISOString().slice(0, 10);
  let z = { tag, anzahl: 0, je: {} };
  try { z = JSON.parse(readFileSync(ZAEHLER, "utf8")); } catch (e) {}
  if (z.tag !== tag) z = { tag, anzahl: 0, je: {} };
  z.je = z.je || {};
  z.anzahl += plus;
  if (slug) z.je[slug] = (z.je[slug] || 0) + plus;
  writeFileSync(ZAEHLER, JSON.stringify(z));
  return slug ? z.je[slug] : z.anzahl;
}

// ---------- Git ----------
const git = (ordner, ...args) => execFileSync("git", args, { cwd: ordner, encoding: "utf8" }).trim();
// desktop.ini legt Windows/Drive-Sync von selbst an – lokal ignorieren, sonst wartet die Automatik ewig auf einen „sauberen“ Ordner
const ignoriert = new Set();
const sauber = ordner => {
  if (!ignoriert.has(ordner)) {
    const datei = path.resolve(ordner, git(ordner, "rev-parse", "--git-path", "info/exclude").trim());  // .git kann auch eine Verweis-Datei sein
    const alt = existsSync(datei) ? readFileSync(datei, "utf8") : "";
    if (!/^desktop\.ini$/mi.test(alt)) { mkdirSync(path.dirname(datei), { recursive: true }); appendFileSync(datei, `${alt && !alt.endsWith("\n") ? "\n" : ""}desktop.ini\n`); }
    ignoriert.add(ordner);
  }
  return git(ordner, "status", "--porcelain") === "";
};
function bauen(p) {
  if (!p.bauen) return;
  execFileSync(p.bauen[0], p.bauen.slice(1), { cwd: p.ordner, encoding: "utf8", stdio: "pipe", timeout: 300000 });
}
function geschuetztBeruehrt(p) {
  const geaendert = git(p.ordner, "status", "--porcelain").split("\n").filter(Boolean).map(z => z.slice(3).replace(/^"|"$/g, ""));
  return geaendert.filter(d => (p.geschuetzt || []).some(g => d === g || d.startsWith(g)));
}
const zuruecksetzen = (p) => { git(p.ordner, "reset", "--hard", "-q"); git(p.ordner, "clean", "-fdq"); };

// ---------- Wie lange Durchläufe wirklich dauern (für ehrliche Zeitangaben) ----------
const DAUER = path.join(MERK, "dauer.json");
const dauerListe = () => { try { return JSON.parse(readFileSync(DAUER, "utf8")); } catch (e) { return []; } };
function dauerMerken(minuten) {
  mkdirSync(MERK, { recursive: true });
  writeFileSync(DAUER, JSON.stringify([...dauerListe(), Math.round(minuten * 10) / 10].slice(-20)));
}
const dauerHinweis = () => {
  const l = dauerListe();
  return l.length ? `Zum Vergleich – so viele Minuten dauerten die letzten Durchläufe der Automatik insgesamt (inkl. Prüfen und Veröffentlichen): ${l.slice(-10).join(", ")}.`
    : "Die Automatik ist schnell: kleine Änderungen dauern insgesamt meist 2–5 Minuten, größere selten mehr als 15.";
};

// ---------- Ist die Änderung schon auf der Website zu sehen? ----------
// Vergleicht die geänderten Dateien (seit <basis>) auf der Vorschau-Adresse Byte für Byte mit dem Commit.
// SFTP lädt direkt hoch – dort ist nach dem Hochladen alles sichtbar. GitHub Pages braucht meist 1–2 Minuten.
async function sichtbarAbwarten(p, basis, maxMinuten = 10) {
  if (!p.veroeffentlichen || !p.vorschau_url) return true;
  const dateien = git(p.ordner, "diff", "--name-only", "--diff-filter=AM", basis, "HEAD").split("\n")
    .filter(f => /\.(html|css|js|json|svg|webp|png|jpe?g)$/i.test(f)).slice(0, 8);
  if (!dateien.length) return true;
  const soll = new Map(dateien.map(f => [f, execFileSync("git", ["show", `HEAD:${f}`], { cwd: p.ordner, maxBuffer: 50e6 })]));
  const ende = Date.now() + maxMinuten * 60000;
  while (Date.now() < ende) {
    const offen = [];
    for (const [f, inhalt] of soll) {
      try {
        const r = await fetch(`${p.vorschau_url}${f.split("/").map(encodeURIComponent).join("/")}?kf=${Date.now()}`, { cache: "no-store" });
        if (!r.ok || !Buffer.from(await r.arrayBuffer()).equals(inhalt)) offen.push(f);
      } catch (e) { offen.push(f); }
    }
    if (!offen.length) return true;
    for (const f of [...soll.keys()]) if (!offen.includes(f)) soll.delete(f);
    await new Promise(r => setTimeout(r, 10000));
  }
  log(`[${p.slug}] nach ${maxMinuten} Min. noch nicht sichtbar: ${[...soll.keys()].join(", ")}`);
  return false;
}

// ---------- Datenbank-Helfer ----------
const aendern = (id, patch) => sb.from("wuensche").update(patch).eq("id", id).then(ok);
const kommentieren = (wunsch_id, text) => sb.from("kommentare").insert({ wunsch_id, text: text.slice(0, 4900) }).then(ok);
// Rückfrage stellen; Antwortvorschläge liegen in details.rueckfrage und erscheinen beim Kunden als Knöpfe
async function rueckfragen(w, { frage, optionen = [] }) {
  const opt = [...new Set((optionen || []).map(o => String(o).trim().slice(0, 120)).filter(Boolean))].slice(0, 4);
  await aendern(w.id, { status: "rueckfrage", bearbeiter: NAME, fortschritt: "Rückfrage an euch – bitte unten antworten", fertig_bis: null,
    details: { ...(w.details || {}), rueckfrage: { frage: frage.slice(0, 1000), optionen: opt } } });
  await kommentieren(w.id, frage);
}
async function lebenszeichen(projekt_id, hinweis, slug) {
  ok(await sb.from("automatik").update({ letzter_lauf: new Date().toISOString(), hinweis: hinweis.slice(0, 480),
    ...(slug ? { heute_laeufe: heuteZaehlen(0, slug) } : {}) }).eq("projekt_id", projekt_id));
}

// ---------- Veröffentlichen mit Protokoll (Tabelle veroeffentlichungen) ----------
const nachholenDatei = p => path.join(MERK, `${p.slug}.nachholen`);
// Liefert { ok, id }: ok = veröffentlicht (oder kein Ziel), id = Zeile im Protokoll. Bei Fehler: Protokoll „fehler“, letzter_fehler fürs
// Dashboard und eine Merkdatei – die nächste Runde versucht es erneut.
async function ausliefern(p, projekt, anlass, meldung) {
  if (!hatZiel(p)) return { ok: true, id: null };
  const commit_hash = git(p.ordner, "rev-parse", "HEAD");
  const zeile = ok(await sb.from("veroeffentlichungen").insert({ projekt_id: projekt.id, anlass, commit_hash, meldung: meldung.slice(0, 1900) }).select("id").single());
  try {
    const r = await veroeffentlichen(p, ENV, MERK);
    ok(await sb.from("veroeffentlichungen").update({ status: "ok", ende: new Date().toISOString(), ziel: r.ziel.slice(0, 200), dateien: r.dateien,
      meldung: (meldung + (r.meldung ? ` (${r.meldung})` : "")).slice(0, 1900) }).eq("id", zeile.id));
    ok(await sb.from("automatik").update({ letzter_fehler: "" }).eq("projekt_id", projekt.id));
    rmSync(nachholenDatei(p), { force: true });
    log(`[${p.slug}] veröffentlicht (${anlass}): ${r.ziel}, ${r.dateien} Datei(en)`);
    return { ok: true, id: zeile.id };
  } catch (e) {
    const text = `Veröffentlichen fehlgeschlagen: ${e.message}`.slice(0, 900);
    ok(await sb.from("veroeffentlichungen").update({ status: "fehler", ende: new Date().toISOString(), meldung: `${meldung} – ${e.message}`.slice(0, 1900) }).eq("id", zeile.id));
    ok(await sb.from("automatik").update({ letzter_fehler: text }).eq("projekt_id", projekt.id));
    mkdirSync(MERK, { recursive: true }); writeFileSync(nachholenDatei(p), anlass);
    log(`[${p.slug}] ${text}`);
    return { ok: false, id: zeile.id };
  }
}

// ---------- Editor-Änderungen (Tabelle inhalte) – ohne KI ----------
// Je Schlüssel gilt die neueste Änderung, ältere werden „ersetzt“. Einmal am Tag werden Neuigkeiten neu erzeugt,
// damit abgelaufene Einträge verschwinden.
async function inhalteVeroeffentlichen(p, projekt) {
  const tagDatei = path.join(MERK, `${p.slug}.neuigkeiten-tag`), heute = heuteBerlin();
  const neu = ok(await sb.from("inhalte").select("*").eq("projekt_id", projekt.id).eq("status", "neu").order("erstellt_am"));
  let taeglich = [];
  if (!neu.length) {
    if (existsSync(tagDatei) && readFileSync(tagDatei, "utf8") === heute) return;
    const live = ok(await sb.from("inhalte").select("schluessel, wert, erstellt_am").eq("projekt_id", projekt.id).eq("status", "live").order("erstellt_am"));
    taeglich = [...new Map(live.filter(z => Array.isArray(z.wert.eintraege)).map(z => [z.schluessel, z])).values()];
    mkdirSync(MERK, { recursive: true }); writeFileSync(tagDatei, heute);
    if (!taeglich.some(z => z.wert.eintraege.some(e => e.bis))) return;
  }
  const neueste = new Map(neu.map(z => [z.schluessel, z]));
  const ersetzt = neu.filter(z => neueste.get(z.schluessel) !== z);
  if (ersetzt.length) ok(await sb.from("inhalte").update({ status: "ersetzt" }).in("id", ersetzt.map(z => z.id)));
  const liste = neu.length ? [...neueste.values()] : taeglich;
  const kundenZeilen = neu.length ? liste : [];

  git(p.ordner, "checkout", "-q", p.zweig);
  if (p.veroeffentlichen) { try { git(p.ordner, "pull", "-q", "--ff-only"); } catch (e) { log(`[${p.slug}] pull vor Inhalten: ${e.message}`); } }
  let erg;
  try {
    erg = await inhalteAnwenden(p, liste.map(z => ({ schluessel: z.schluessel, wert: z.wert, seite_url: z.seite_url })), {
      bildHolen: async pfad => Buffer.from(await ok(await sb.storage.from("anhaenge").download(pfad)).arrayBuffer()),
      basisUrl: projekt.live_url || p.vorschau_url || projekt.vorschau_url || "", titel: projekt.name, heute,
      // Seiten werden auf der Vorschau bearbeitet: dort liegen die Quelldateien so, wie sie im Git stehen
      basisAdressen: [projekt.vorschau_url || p.vorschau_url || projekt.live_url], projektId: projekt.id,
      formularZiel: ENV.KF_URL.replace(/\/$/, "") + "/functions/v1/formular", slug: projekt.slug });
    bauen(p);
  } catch (e) {
    zuruecksetzen(p);
    for (const z of kundenZeilen) await sb.from("inhalte").update({ status: "fehler", meldung: `Übernehmen fehlgeschlagen: ${e.message}`.slice(0, 900) }).eq("id", z.id);
    log(`[${p.slug}] Inhalte fehlgeschlagen: ${e.message}`);
    return;
  }
  const verboten = geschuetztBeruehrt(p);
  if (verboten.length) {
    zuruecksetzen(p);
    for (const z of kundenZeilen) await sb.from("inhalte").update({ status: "fehler", meldung: "Geschützte Dateien wären geändert worden" }).eq("id", z.id);
    log(`[${p.slug}] Inhalte abgebrochen, geschützte Dateien: ${verboten.join(", ")}`);
    return;
  }
  const fehler = new Map(erg.filter(e => !e.ok).map(e => [e.schluessel, e.meldung]));
  let geliefert = { ok: true, id: null };
  if (!sauber(p.ordner)) {
    const titel = neu.length ? `Inhalt geändert: ${liste.filter(z => !fehler.has(z.schluessel)).map(z => z.schluessel).join(", ")}` : "Abgelaufene Neuigkeiten entfernt";
    git(p.ordner, "add", "-A");
    git(p.ordner, "commit", "-q", "-m", titel.slice(0, 200), "-m", "Vom Kunden im Editor geändert, übernommen vom Wächter (ohne KI).");
    geliefert = await ausliefern(p, projekt, "inhalt", titel.slice(0, 300));
  }
  for (const z of kundenZeilen) {
    const f = fehler.get(z.schluessel);
    await sb.from("inhalte").update(f ? { status: "fehler", meldung: f.slice(0, 900) }
      : { status: "live", veroeffentlichung_id: geliefert.id, meldung: geliefert.ok ? "" : "Übernommen – wird gleich veröffentlicht" }).eq("id", z.id);
  }
  log(`[${p.slug}] Inhalte: ${liste.length - fehler.size} übernommen${fehler.size ? `, ${fehler.size} fehlerhaft` : ""}`);
}

// Vom Admin im Dashboard angefragt: Commit rückgängig machen, neu bauen, veröffentlichen
async function zuruecknehmen(p, projekt, v) {
  try {
    git(p.ordner, "checkout", "-q", p.zweig);
    if (p.veroeffentlichen) git(p.ordner, "pull", "-q", "--ff-only");
    const eltern = git(p.ordner, "rev-list", "--parents", "-n", "1", v.commit_hash).split(" ").length - 1;
    git(p.ordner, "revert", "--no-edit", ...(eltern > 1 ? ["-m", "1"] : []), v.commit_hash);
    bauen(p);
    if (!sauber(p.ordner)) { git(p.ordner, "add", "-A"); git(p.ordner, "commit", "-q", "-m", `Neu gebaut nach Zurücknehmen von ${v.commit_hash.slice(0, 7)}`); }
    const geliefert = (await ausliefern(p, projekt, "zuruecknehmen", `Zurückgenommen: ${v.meldung}`.slice(0, 300))).ok;
    ok(await sb.from("inhalte").update({ status: "zurueckgenommen" }).eq("veroeffentlichung_id", v.id));
    ok(await sb.from("veroeffentlichungen").update({ zuruecknehmen: geliefert ? "erledigt" : "fehler" }).eq("id", v.id));
  } catch (e) {
    try { git(p.ordner, "revert", "--abort"); } catch (e2) {}
    zuruecksetzen(p);
    ok(await sb.from("veroeffentlichungen").update({ zuruecknehmen: "fehler" }).eq("id", v.id));
    ok(await sb.from("automatik").update({ letzter_fehler: `Zurücknehmen fehlgeschlagen: ${e.message}`.slice(0, 900) }).eq("projekt_id", projekt.id));
    log(`[${p.slug}] Zurücknehmen ${v.commit_hash.slice(0, 7)} fehlgeschlagen: ${e.message}`);
  }
}

// ---------- Fotos des Kunden ----------
const EINGANG = "eingang";
const sicher = n => String(n || "foto").normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(-60) || "foto";
// Lädt die angehängten Fotos nach <projekt>/eingang/<kurz>/, damit Claude sie ansehen kann
async function fotosHolen(p, w, kurz) {
  const liste = [];
  for (const [i, a] of (w.anhaenge || []).entries()) {
    try {
      const blob = ok(await sb.storage.from("anhaenge").download(a.pfad));
      const rel = `${EINGANG}/${kurz}/${i + 1}-${sicher(a.name)}`;
      mkdirSync(path.join(p.ordner, EINGANG, kurz), { recursive: true });
      writeFileSync(path.join(p.ordner, rel), Buffer.from(await blob.arrayBuffer()));
      liste.push(rel);
    } catch (e) { log(`[${p.slug}] Foto ${a.name} nicht geladen: ${e.message}`); }
  }
  return liste;
}
// ---------- Ein Wunsch oder ein Paket gesammelter Wünsche (ein Durchlauf, ein Commit) ----------
async function umsetzen(p, projekt, modus, ws, namen, meineId) {
  // Wünsche atomar beanspruchen: nur was noch „offen“ ist, gehört diesem Wächter – ein zweiter (auch auf einem anderen PC) geht leer aus
  const geholt = new Set(ok(await sb.from("wuensche").update({ status: "in_arbeit", bearbeiter: NAME, fortschritt: "Schaut sich den Wunsch an und schätzt den Aufwand", fertig_bis: null })
    .in("id", ws.map(w => w.id)).eq("status", "offen").select("id")).map(r => r.id));
  ws = ws.filter(w => geholt.has(w.id));
  if (!ws.length) return;
  const beginn = Date.now();
  const kurz = ws[0].id.slice(0, 8);
  const nrVon = new Map(ws.map((w, i) => [w.id, i + 1]));
  log(`[${p.slug}] ${ws.length > 1 ? `Paket ${kurz} mit ${ws.length} Wünschen` : `Wunsch ${kurz}`}: ${ws.map(w => w.text.slice(0, 40)).join(" | ").slice(0, 160)}`);
  rmSync(path.join(p.ordner, EINGANG), { recursive: true, force: true });
  const daten = [];
  for (const w of ws) {
    const verlauf = ok(await sb.from("kommentare").select("*").eq("wunsch_id", w.id).order("erstellt_am"));
    daten.push({ w, verlauf, fotos: await fotosHolen(p, w, w.id.slice(0, 8)) });
  }
  const alleFotos = daten.flatMap(d => d.fotos);
  const texte = (auswahl = daten) => auswahl.map(d => wunschText(d.w, d.verlauf, namen, d.fotos, nrVon.get(d.w.id))).join("\n\n");
  const leeren = () => rmSync(path.join(p.ordner, EINGANG), { recursive: true, force: true });
  const anAgentur = async (w, grund) => {
    await aendern(w.id, { status: "offen", bearbeiter: "Agentur", fortschritt: "Wird von der Agentur übernommen", fertig_bis: null });
    log(`[${p.slug}] ${w.id.slice(0, 8)} an Agentur: ${grund}`);
  };

  // 1. Aufwand schätzen (nur lesen)
  let s;
  try {
    s = await claude(`Schätze, wie viele Minuten die Automatik für ${ws.length > 1 ? "alle diese Wünsche zusammen" : "diesen Wunsch"} in diesem Projekt braucht (inkl. Prüfen und Veröffentlichen).
Gemeint ist die Zeit der Automatik, nicht die eines Menschen. ${dauerHinweis()} Sieh dir nur kurz die betroffene Stelle an, sei zügig.
Fehlt bei einem Wunsch eine Information, trage ihn mit nr und Frage in "rueckfragen" ein; sonst bleibt die Liste leer.\n\n${texte()}`,
      { ordner: p.ordner, schema: SCHEMA_SCHAETZUNG, werkzeuge: ["Read", "Glob", "Grep"], budget: 1, systemzusatz: SYSTEM, schnell: true });
  } catch (e) {
    leeren();
    for (const w of ws) await anAgentur(w, `Schätzung fehlgeschlagen: ${e.message}`);
    return;
  }
  const fragen = new Map((s.rueckfragen || []).filter(f => f.frage && ws[f.nr - 1]).map(f => [ws[f.nr - 1].id, f]));
  for (const w of ws.filter(w => fragen.has(w.id))) await rueckfragen(w, fragen.get(w.id));
  const aktiv = daten.filter(d => !fragen.has(d.w.id));
  if (!aktiv.length) { leeren(); return; }
  for (const { w } of aktiv) await aendern(w.id, { status: "in_arbeit", bearbeiter: NAME, fortschritt: "Wird umgesetzt",
    fertig_bis: new Date(Date.now() + s.minuten * 60000).toISOString() });

  // 2. Umsetzen
  const zweig = modus === "mit_freigabe" ? `wunsch-${kurz}` : p.zweig;
  git(p.ordner, "checkout", "-q", p.zweig);
  if (p.veroeffentlichen) git(p.ordner, "pull", "-q", "--ff-only");
  if (zweig !== p.zweig) git(p.ordner, "checkout", "-q", "-B", zweig);
  const werkzeuge = ["Read", "Edit", "Write", "Glob", "Grep", ...(p.bauen ? [`Bash(${p.bauen.join(" ")})`] : [])];

  // „Augen“: Bildschirmfotos der betroffenen Stellen vor der Änderung (höchstens 4 Wünsche je Paket)
  const knipsen = async (w, praefix, verschiebung = null) => {
    const seite = seitePfad(p, w.seite_url);
    if (!seite || !existsSync(path.join(p.ordner, seite))) return [];
    try { return await ansichten(p, { seite, selektor: (w.stelle || {}).selektor, ziel: `${EINGANG}/ansicht`, praefix: `${praefix}-w${nrVon.get(w.id)}`, verschiebung }); }
    catch (e) { log(`[${p.slug}] ${w.id.slice(0, 8)} Bildschirmfoto fehlgeschlagen: ${e.message}`); return []; }
  };
  const augen = aktiv.slice(0, 4);
  const vorher = [], wunschbild = [];
  for (const { w } of augen) {
    vorher.push(...await knipsen(w, "vorher"));
    if ((w.details || {}).verschiebung && w.stelle) wunschbild.push(...await knipsen(w, "wunsch", w.details.verschiebung));
  }
  const fotoText = (liste, wann) => liste.length ? `\nBildschirmfotos ${wann} (Desktop und Handy; Dateiname -wN = Wunsch N; die rot gestrichelte Linie zeigt nur die vom Kunden markierte Stelle und ist nicht Teil der Seite) – sieh sie dir mit Read an:\n${liste.map(f => `- ${f}`).join("\n")}` : "";
  const ergebnisAntwort = `Gib in "ergebnisse" für jeden Wunsch (nr) ein Ergebnis an.`;

  // erg: nr → { ergebnis, zusammenfassung, frage }
  let erg = new Map(), fotosWahl = [];
  const uebernehmen = r => { for (const e of r.ergebnisse || []) if (aktiv.some(d => nrVon.get(d.w.id) === e.nr)) erg.set(e.nr, e); };
  try {
    const r = await claude(`Setze ${aktiv.length > 1 ? "diese Wünsche" : "diesen Wunsch"} in diesem Projektordner um.${p.bauen ? ` Führe danach den Bau aus: ${p.bauen.join(" ")}` : ""} ${ergebnisAntwort}${alleFotos.length ? `\n${bildHinweis(p)}` : ""}${fotoText(vorher, "der Seite vor deiner Änderung, so sieht der Kunde sie jetzt")}${fotoText(wunschbild, "mit der Verschiebung des Kunden – so ungefähr wünscht er es sich (nur eine Vorschau, sauber umsetzen)")}\n\n${texte(aktiv)}`,
      { ordner: p.ordner, schema: SCHEMA_ERGEBNIS, werkzeuge, budget: (KONF.max_budget_usd || 3) * Math.min(aktiv.length, 3), systemzusatz: SYSTEM });
    uebernehmen(r); fotosWahl = r.fotos || [];
  } catch (e) { log(`[${p.slug}] ${kurz} Umsetzen fehlgeschlagen: ${e.message}`); }
  const erledigt = () => aktiv.filter(d => (erg.get(nrVon.get(d.w.id)) || {}).ergebnis === "erledigt");

  // Gewählte Fotos ins Projekt übernehmen
  if (erledigt().length && fotosWahl.length) {
    try { await fotosAblegen(p, fotosWahl, alleFotos); } catch (e) { log(`[${p.slug}] ${kurz} Foto nicht übernommen: ${e.message}`); erg = new Map(); }
  }

  // Prüfrunden: Ergebnis fotografieren, Claude vergleicht mit vorher und bessert nach (höchstens zwei Runden)
  for (let runde = 1; erledigt().length && vorher.length && runde <= 2; runde++) {
    try { bauen(p); } catch (e) { break; }
    const nachher = [];
    for (const { w } of augen) if (erledigt().some(d => d.w.id === w.id)) nachher.push(...await knipsen(w, `nachher${runde}`));
    if (!nachher.length) break;
    for (const { w } of erledigt()) await aendern(w.id, { fortschritt: "Prüft das Ergebnis auf Desktop und Handy" });
    const stand = git(p.ordner, "status", "--porcelain") + git(p.ordner, "diff");
    try {
      const pr = await claude(`Du hast ${erledigt().length > 1 ? "diese Wünsche" : "diesen Wunsch"} umgesetzt. Prüfe jetzt mit eigenen Augen, ob sie erfüllt sind.${fotoText(vorher, "vorher")}${fotoText(wunschbild, "Wunschbild des Kunden (von ihm verschoben)")}${fotoText(nachher, "nach deiner Änderung")}
Vergleiche vorher und nachher genau, so wie der Kunde hinsieht (Ausrichtung, Abstände, Lesbarkeit, Desktop UND Handy).
Ist jeder Wunsch sichtbar erfüllt und nichts anderes kaputt? Wenn nicht: korrigiere den Code${p.bauen ? ` und führe den Bau aus: ${p.bauen.join(" ")}` : ""}.
${ergebnisAntwort} Beschreibe in zusammenfassung nur, was auf den Fotos wirklich zu sehen ist. fotos bleibt leer.\n\n${texte(erledigt())}`,
        { ordner: p.ordner, schema: SCHEMA_ERGEBNIS, werkzeuge, budget: KONF.max_budget_usd || 3, systemzusatz: SYSTEM });
      uebernehmen(pr);
    } catch (e) { log(`[${p.slug}] ${kurz} Prüfrunde ${runde} fehlgeschlagen: ${e.message}`); break; }
    log(`[${p.slug}] ${kurz} Prüfrunde ${runde}: ${erledigt().length} von ${aktiv.length} erledigt`);
    if (git(p.ordner, "status", "--porcelain") + git(p.ordner, "diff") === stand) break;  // nichts nachgebessert → fertig
  }
  leeren();

  // Sicherheitsnetz: geschützte Dateien, Bau, „nichts geändert“
  let fehler = "";
  const verboten = geschuetztBeruehrt(p);
  if (verboten.length) fehler = "Geschützte Dateien geändert: " + verboten.join(", ");
  if (!fehler && erledigt().length) { try { bauen(p); } catch (e) { fehler = "Bau fehlgeschlagen: " + String(e.stderr || e.message).slice(-300); } }
  const fertig = fehler ? [] : erledigt();
  const nichtsGeaendert = fertig.length && sauber(p.ordner);
  let geliefert = true;

  if (!fertig.length || nichtsGeaendert) {
    zuruecksetzen(p);
    git(p.ordner, "checkout", "-q", p.zweig);
    if (zweig !== p.zweig) git(p.ordner, "branch", "-D", zweig);
  } else {
    // 3. Festhalten und veröffentlichen – ein Commit für alles Erledigte
    git(p.ordner, "add", "-A");
    const titel = fertig.length > 1 ? `Kundenwünsche (${fertig.length}): ${fertig.map(d => d.w.text.replace(/\s+/g, " ").slice(0, 30)).join(" | ")}` : `Kundenwunsch ${kurz}: ${fertig[0].w.text.replace(/\s+/g, " ").slice(0, 60)}`;
    git(p.ordner, "commit", "-q", "-m", titel.slice(0, 200), "-m", `${fertig.map(d => `- ${(erg.get(nrVon.get(d.w.id)) || {}).zusammenfassung || ""}`).join("\n")}\n\nUmgesetzt vom Wächter (Claude Code).`);
    if (modus === "direkt") geliefert = (await ausliefern(p, projekt, "wunsch", titel.slice(0, 300))).ok;
    else git(p.ordner, "checkout", "-q", p.zweig);
    heuteZaehlen(1, p.slug);
  }

  // Erst „erledigt“, wenn der Kunde die Änderung auf der Website auch sieht
  let sichtbar = true;
  if (fertig.length && !nichtsGeaendert && modus === "direkt" && geliefert && hatZiel(p)) {
    for (const d of fertig) await aendern(d.w.id, { fortschritt: "Wird veröffentlicht – gleich auf der Website zu sehen", fertig_bis: new Date(Date.now() + 2 * 60000).toISOString() });
    sichtbar = await sichtbarAbwarten(p, "HEAD~1");
  }
  if (fertig.length && !nichtsGeaendert) dauerMerken((Date.now() - beginn) / 60000);

  // Status je Wunsch
  for (const d of aktiv) {
    const e = erg.get(nrVon.get(d.w.id)) || { ergebnis: "fehler", zusammenfassung: fehler || "keine Antwort", frage: "" };
    if (fertig.includes(d) && !nichtsGeaendert) {
      if (modus === "direkt" && (!geliefert || !sichtbar)) await aendern(d.w.id, { status: "in_arbeit", bearbeiter: "Agentur", fertig_bis: null,
        fortschritt: !geliefert ? "Umgesetzt – das Veröffentlichen hakt, die Agentur kümmert sich" : "Umgesetzt – noch nicht auf der Website zu sehen, die Agentur prüft das" });
      else if (modus === "direkt") await aendern(d.w.id, { status: "erledigt", fertig_bis: null, fortschritt: hatZiel(p) ? "Jetzt auf der Website zu sehen" : "Umgesetzt" });
      else await aendern(d.w.id, { status: "zur_freigabe", details: { ...(d.w.details || {}), zweig }, fortschritt: "Umgesetzt – wartet auf Freigabe durch die Agentur", fertig_bis: null });
      await kommentieren(d.w.id, e.zusammenfassung);
    } else if (e.ergebnis === "rueckfrage" || (e.ergebnis === "erledigt" && nichtsGeaendert)) {
      await rueckfragen(d.w, e.frage ? e : { frage: "Ich konnte nichts finden, was ich ändern müsste. Könnt ihr genauer beschreiben, was anders sein soll?" });
    } else {
      await anAgentur(d.w, fehler || e.zusammenfassung);
      if (e.ergebnis === "nicht_moeglich") await kommentieren(d.w.id, e.zusammenfassung || "Diesen Wunsch schaut sich die Agentur persönlich an.");
    }
  }
}

// Freigegebene Umsetzungen veröffentlichen. Ein Paket liegt auf einem gemeinsamen Zweig: die Freigabe gilt für alle seine Wünsche.
async function freigabenVeroeffentlichen(p, projekt, liste) {
  const zweigVon = w => (w.details || {}).zweig || `wunsch-${w.id.slice(0, 8)}`;
  const zweige = [...new Set(liste.filter(w => w.status === "zur_freigabe" && w.freigegeben).map(zweigVon))];
  for (const zweig of zweige) {
    const dazu = liste.filter(w => w.status === "zur_freigabe" && zweigVon(w) === zweig);
    try {
      git(p.ordner, "checkout", "-q", p.zweig);
      if (p.veroeffentlichen) git(p.ordner, "pull", "-q", "--ff-only");
      const vorMerge = git(p.ordner, "rev-parse", "HEAD");
      git(p.ordner, "merge", "-q", "--no-ff", "--no-edit", zweig);
      bauen(p);
      // Gebautes in den Merge-Commit aufnehmen: so nimmt „Zurücknehmen“ im Dashboard alles auf einmal zurück
      if (!sauber(p.ordner)) { git(p.ordner, "add", "-A"); git(p.ordner, "commit", "-q", "--amend", "--no-edit"); }
      if (git(p.ordner, "rev-parse", "HEAD") === vorMerge) throw new Error("Zweig enthält nichts Neues");
      const geliefert = (await ausliefern(p, projekt, "freigabe", dazu.map(w => w.text.replace(/\s+/g, " ").slice(0, 60)).join(" | ").slice(0, 300))).ok;
      git(p.ordner, "branch", "-d", zweig);
      if (geliefert) for (const w of dazu) await aendern(w.id, { fortschritt: "Wird veröffentlicht – gleich auf der Website zu sehen" });
      const sichtbar = geliefert && await sichtbarAbwarten(p, vorMerge);
      for (const w of dazu) await aendern(w.id, sichtbar ? { status: "erledigt", fortschritt: "Jetzt auf der Website zu sehen" }
        : { fortschritt: geliefert ? "Freigegeben – noch nicht auf der Website zu sehen, die Agentur prüft das" : "Freigegeben – das Veröffentlichen hakt, die Agentur kümmert sich" });
      log(`[${p.slug}] ${zweig} veröffentlicht (${dazu.length} Wunsch/Wünsche)`);
    } catch (e) {
      try { git(p.ordner, "merge", "--abort"); } catch (e2) {}
      for (const w of dazu) await aendern(w.id, { freigegeben: false, fortschritt: "Veröffentlichen fehlgeschlagen – die Agentur kümmert sich" });
      log(`[${p.slug}] ${zweig} Fehler: ${e.message}`);
    }
  }
}

// ---------- Neue Websites einrichten ----------
// Fehlversuche: erst nach 30 Minuten oder geänderter Vorschau-Adresse erneut versuchen
const einrichtenFehler = {};
async function neueWebsites() {
  const alle = ok(await sb.from("projekte").select("id, slug, name, vorschau_url, aktiv"));
  for (const projekt of alle.filter(x => x.aktiv !== false && !KONF.projekte[x.slug])) {
    const f = einrichtenFehler[projekt.slug];
    if (f && f.url === projekt.vorschau_url && Date.now() - f.zeit < 30 * 60000) continue;
    try {
      log(`[${projekt.slug}] Neue Website – wird eingerichtet`);
      const e = einrichten(projekt, { basis: KONF.projekte_ordner || path.resolve(HIER, "../../../Projekte"),
        gitDaten: KONF.git_daten || path.join(os.homedir(), ".git-daten"),
        widget: KONF.widget_url || "https://michele4800.github.io/kunden-feedback/feedback.js", log });
      KONF.projekte[projekt.slug] = AUTO_PROJEKTE[projekt.slug] = e;
      writeFileSync(AUTO, JSON.stringify(AUTO_PROJEKTE, null, 2) + "\n");
      delete einrichtenFehler[projekt.slug];
      await sb.from("automatik").update({ letzter_fehler: "" }).eq("projekt_id", projekt.id);
      log(`[${projekt.slug}] eingerichtet: ${e.ordner}`);
    } catch (err) {
      einrichtenFehler[projekt.slug] = { zeit: Date.now(), url: projekt.vorschau_url };
      const text = `Einrichten fehlgeschlagen: ${String(err.stderr || err.message).trim()}`.slice(0, 900);
      log(`[${projekt.slug}]`, text);
      await sb.from("automatik").update({ letzter_fehler: text }).eq("projekt_id", projekt.id);
    }
  }
}

// ---------- Hauptschleife ----------
async function runde(meineId) {
  try { await neueWebsites(); } catch (e) { log("Neue Websites prüfen fehlgeschlagen:", e.message); }
  for (const [slug, einst] of Object.entries(KONF.projekte)) {
    const p = { slug, zweig: "main", veroeffentlichen: false, geschuetzt: [".git", ".github/", ".gitignore"], ...einst };
    try {
      const projekt = ok(await sb.from("projekte").select("*").eq("slug", slug).maybeSingle());
      if (!projekt) { log(`[${slug}] kein Zugriff – ist der Automatik-Benutzer Mitglied mit Rolle „agentur“?`); continue; }
      const auto = ok(await sb.from("automatik").select("*").eq("projekt_id", projekt.id).maybeSingle());
      if (!auto) ok(await sb.from("automatik").insert({ projekt_id: projekt.id, modus: "aus" }));
      const modus = (auto || {}).modus || "aus";
      if (!sauber(p.ordner)) { await lebenszeichen(projekt.id, "Arbeitsordner hat ungespeicherte Änderungen – Automatik wartet", slug); continue; }

      // Zurücknehmen und fehlgeschlagenes Veröffentlichen erledigen – auch wenn die Automatik aus ist
      for (const v of ok(await sb.from("veroeffentlichungen").select("*").eq("projekt_id", projekt.id).eq("zuruecknehmen", "angefragt")))
        if (v.commit_hash) await zuruecknehmen(p, projekt, v);
      if (existsSync(nachholenDatei(p))) {
        git(p.ordner, "checkout", "-q", p.zweig);
        await ausliefern(p, projekt, "manuell", "Nachgeholt nach fehlgeschlagenem Veröffentlichen");
      }
      await inhalteVeroeffentlichen(p, projekt);  // Editor-Änderungen gehen immer live, auch bei Automatik „aus“ (keine KI)
      if (modus === "aus") { await lebenszeichen(projekt.id, "Wächter läuft, Automatik ist aus", slug); continue; }

      const liste = ok(await sb.from("wuensche").select("*").eq("projekt_id", projekt.id).order("erstellt_am"));
      const namen = Object.fromEntries(ok(await sb.from("mitglieder").select("user_id, anzeigename").eq("projekt_id", projekt.id)).map(m => [m.user_id, m.anzeigename]));
      await freigabenVeroeffentlichen(p, projekt, liste);

      // Rückfragen, auf die der Kunde geantwortet hat, wieder einreihen
      for (const w of liste.filter(w => w.status === "rueckfrage")) {
        const letzte = ok(await sb.from("kommentare").select("autor").eq("wunsch_id", w.id).order("erstellt_am", { ascending: false }).limit(1))[0];
        if (letzte && letzte.autor !== meineId) { await aendern(w.id, { status: "offen", fortschritt: "Antwort erhalten – geht weiter" }); w.status = "offen"; }
      }

      // Wichtige Wünsche zuerst, sonst in der Reihenfolge des Eingangs
      const warteschlange = liste.filter(w => w.status === "offen" && w.bearbeiter !== "Agentur")
        .sort((a, b) => (a.prioritaet || 2) - (b.prioritaet || 2) || a.erstellt_am.localeCompare(b.erstellt_am));
      // Platz in der Warteschlange anzeigen
      for (const [i, w] of warteschlange.entries()) {
        const text = i === 0 ? "Wird gleich bearbeitet" : `In der Warteschlange – Platz ${i + 1}`;
        if (w.fortschritt !== text) await aendern(w.id, { fortschritt: text });
      }
      if (heuteZaehlen() >= MAX_PRO_TAG) { await lebenszeichen(projekt.id, `Tagesgrenze von ${MAX_PRO_TAG} Wünschen erreicht – morgen geht es weiter`, slug); continue; }
      await lebenszeichen(projekt.id, warteschlange.length ? `Bearbeite ${warteschlange.length} Wunsch/Wünsche` : "Keine offenen Wünsche", slug);
      // Gesammelt abgeschickte Wünsche (gleiches Paket) zusammen umsetzen – wartet kurz, bis alle eingetroffen sind
      const kopf = warteschlange[0];
      const paket = kopf && (kopf.details || {}).paket;
      const ws = paket ? warteschlange.filter(w => (w.details || {}).paket === paket).slice(0, 10) : kopf ? [kopf] : [];
      const unvollstaendig = paket && ws.length < (+kopf.details.paket_anzahl || 0) && Date.now() - Date.parse(kopf.erstellt_am) < 60000;
      // Bricht ein Durchlauf unerwartet ab, bleibt kein Wunsch ewig „in Arbeit“ hängen
      if (ws.length && !unvollstaendig) await umsetzen(p, projekt, modus, ws, namen, meineId).catch(async e => {
        log(`[${slug}] ${ws[0].id.slice(0, 8)} abgebrochen: ${e.message}`);
        await sb.from("wuensche").update({ bearbeiter: "Agentur", status: "offen", fortschritt: "Wird von der Agentur übernommen", fertig_bis: null })
          .in("id", ws.map(w => w.id)).eq("status", "in_arbeit").eq("bearbeiter", NAME);
      });
      await lebenszeichen(projekt.id, "Bereit", slug);
    } catch (e) {
      log(`[${slug}] Fehler:`, e.message);
    }
  }
}

// Nur ein Wächter gleichzeitig: mehrere bearbeiten sonst denselben Wunsch und löschen sich gegenseitig Fotos und Zweige.
// Der Port wird beim Prozessende vom System freigegeben, eine verwaiste Sperre gibt es also nicht.
await new Promise(weiter => net.createServer().once("error", e => {
  if (e.code !== "EADDRINUSE") throw e;
  log("Es läuft schon ein Wächter – dieser beendet sich.");
  process.exit(3);  // 3 = waechter-starten.cmd startet nicht neu
}).listen(KONF.sperr_port || 47813, "127.0.0.1", weiter).unref());

const anmeldung = ok(await sb.auth.signInWithPassword({ email: ENV.KF_EMAIL, password: ENV.KF_PASSWORT }));
const meineId = anmeldung.user.id;
// Nach Absturz oder Neustart: was dieser Wächter noch „in Arbeit“ hatte, wird neu eingereiht
// (die Port-Sperre oben garantiert, dass auf diesem PC kein anderer Wächter mehr daran arbeitet)
const haengend = ok(await sb.from("wuensche").update({ status: "offen", fortschritt: "Wird nach einem Neustart erneut aufgegriffen", fertig_bis: null })
  .eq("status", "in_arbeit").eq("bearbeiter", NAME).select("id"));
if (haengend.length) log(`${haengend.length} hängengebliebene(n) Wunsch/Wünsche neu eingereiht`);
log(`Wächter gestartet als ${ENV.KF_EMAIL}, prüft alle ${INTERVALL / 1000} s. Beenden mit Strg+C.`);
let läuft = false, nochmal = false;
const takt = async () => {
  if (läuft) { nochmal = true; return; }
  läuft = true;
  try { do { nochmal = false; await runde(meineId); } while (nochmal); } finally { läuft = false; }
};
await takt();
setInterval(takt, INTERVALL);
// Neue Wünsche und Kundenantworten sofort aufgreifen statt bis zur nächsten Runde zu warten
let anstoss;
const sofort = () => { clearTimeout(anstoss); anstoss = setTimeout(takt, 1500); };
sb.channel("waechter")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "wuensche" }, sofort)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "kommentare" }, sofort)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "inhalte" }, sofort)
  .on("postgres_changes", { event: "*", schema: "public", table: "projekte" }, sofort)
  .subscribe(s => log("Live-Verbindung:", s));
