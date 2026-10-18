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
const INTERVALL = (KONF.intervall_sekunden || 60) * 1000;
const MAX_PRO_TAG = KONF.max_pro_tag || 20;
const CLAUDE = ENV.CLAUDE_BEFEHL || "claude";
const ZAEHLER = path.join(HIER, ".heute.json");
const claude = (prompt, o) => claudeRoh(prompt, { ...o, befehl: CLAUDE, maxMinuten: KONF.max_minuten || 30 });

const sb = createClient(ENV.KF_URL, ENV.KF_SCHLUESSEL, { auth: { persistSession: false, autoRefreshToken: true } });
const LOGBUCH = path.join(HIER, "waechter.log");
const log = (...a) => {
  const z = [new Date().toLocaleString("de-DE"), ...a].join(" ");
  console.log(z);
  try { appendFileSync(LOGBUCH, z + "\n"); } catch (e) {}
};
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

function heuteZaehlen(plus = 0) {
  const tag = new Date().toISOString().slice(0, 10);
  let z = { tag, anzahl: 0 };
  try { z = JSON.parse(readFileSync(ZAEHLER, "utf8")); } catch (e) {}
  if (z.tag !== tag) z = { tag, anzahl: 0 };
  z.anzahl += plus; writeFileSync(ZAEHLER, JSON.stringify(z));
  return z.anzahl;
}

// ---------- Git ----------
const git = (ordner, ...args) => execFileSync("git", args, { cwd: ordner, encoding: "utf8" }).trim();
const sauber = ordner => git(ordner, "status", "--porcelain") === "";
function bauen(p) {
  if (!p.bauen) return;
  execFileSync(p.bauen[0], p.bauen.slice(1), { cwd: p.ordner, encoding: "utf8", stdio: "pipe", timeout: 300000 });
}
function geschuetztBeruehrt(p) {
  const geaendert = git(p.ordner, "status", "--porcelain").split("\n").filter(Boolean).map(z => z.slice(3).replace(/^"|"$/g, ""));
  return geaendert.filter(d => (p.geschuetzt || []).some(g => d === g || d.startsWith(g)));
}
const zuruecksetzen = (p) => { git(p.ordner, "reset", "--hard", "-q"); git(p.ordner, "clean", "-fdq"); };

// ---------- Datenbank-Helfer ----------
const aendern = (id, patch) => sb.from("wuensche").update(patch).eq("id", id).then(ok);
const kommentieren = (wunsch_id, text) => sb.from("kommentare").insert({ wunsch_id, text: text.slice(0, 4900) }).then(ok);
async function lebenszeichen(projekt_id, hinweis) {
  ok(await sb.from("automatik").update({ letzter_lauf: new Date().toISOString(), hinweis: hinweis.slice(0, 480) }).eq("projekt_id", projekt_id));
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
// ---------- Ein Wunsch ----------
async function umsetzen(p, projekt, modus, w, namen, meineId) {
  const verlauf = ok(await sb.from("kommentare").select("*").eq("wunsch_id", w.id).order("erstellt_am"));
  const kurz = w.id.slice(0, 8);
  log(`[${p.slug}] Wunsch ${kurz}: ${w.text.slice(0, 60)}`);
  // Sofort zeigen, dass jemand dran ist – die Schätzung dauert oft eine halbe Minute
  await aendern(w.id, { status: "in_arbeit", bearbeiter: NAME, fortschritt: "Schaut sich den Wunsch an und schätzt den Aufwand", fertig_bis: null });
  rmSync(path.join(p.ordner, EINGANG), { recursive: true, force: true });
  const fotos = await fotosHolen(p, w, kurz);

  // 1. Aufwand schätzen (nur lesen)
  let s;
  try {
    s = await claude(`Schätze, wie viele Minuten die Umsetzung dieses Wunsches in diesem Projekt dauert (inkl. Prüfen).
Wenn eine Information fehlt, schreibe die Frage in "rueckfrage", sonst "".\n\n${wunschText(w, verlauf, namen, fotos)}`,
      { ordner: p.ordner, schema: SCHEMA_SCHAETZUNG, werkzeuge: ["Read", "Glob", "Grep"], budget: 1, systemzusatz: SYSTEM });
  } catch (e) {
    rmSync(path.join(p.ordner, EINGANG), { recursive: true, force: true });
    await aendern(w.id, { status: "offen", bearbeiter: "Agentur", fortschritt: "Wird von der Agentur übernommen", fertig_bis: null });
    log(`[${p.slug}] ${kurz} Schätzung fehlgeschlagen, an Agentur: ${e.message}`);
    return;
  }
  if (s.rueckfrage) {
    rmSync(path.join(p.ordner, EINGANG), { recursive: true, force: true });
    await aendern(w.id, { status: "rueckfrage", bearbeiter: NAME, fortschritt: "Rückfrage an euch – bitte unten antworten", fertig_bis: null });
    await kommentieren(w.id, s.rueckfrage);
    return;
  }
  await aendern(w.id, { status: "in_arbeit", bearbeiter: NAME, fortschritt: "Wird umgesetzt",
    fertig_bis: new Date(Date.now() + s.minuten * 60000).toISOString() });

  // 2. Umsetzen
  const zweig = modus === "mit_freigabe" ? `wunsch-${kurz}` : p.zweig;
  git(p.ordner, "checkout", "-q", p.zweig);
  if (p.veroeffentlichen) git(p.ordner, "pull", "-q", "--ff-only");
  if (zweig !== p.zweig) git(p.ordner, "checkout", "-q", "-B", zweig);
  const werkzeuge = ["Read", "Edit", "Write", "Glob", "Grep", ...(p.bauen ? [`Bash(${p.bauen.join(" ")})`] : [])];

  // „Augen“: Bildschirmfotos der betroffenen Seite vor der Änderung
  const seite = seitePfad(p, w.seite_url);
  const knipsen = async (praefix, verschiebung = null) => {
    if (!seite || !existsSync(path.join(p.ordner, seite))) return [];
    try { return await ansichten(p, { seite, selektor: (w.stelle || {}).selektor, ziel: `${EINGANG}/ansicht`, praefix, verschiebung }); }
    catch (e) { log(`[${p.slug}] ${kurz} Bildschirmfoto fehlgeschlagen: ${e.message}`); return []; }
  };
  const vorher = await knipsen("vorher");
  // Hat der Kunde etwas auf der Seite verschoben: so soll es ungefähr aussehen
  const wunschbild = (w.details || {}).verschiebung && w.stelle ? await knipsen("wunsch", w.details.verschiebung) : [];
  const fotoText = (liste, wann) => liste.length ? `\nBildschirmfotos ${wann} (Desktop und Handy; die rot gestrichelte Linie zeigt nur die vom Kunden markierte Stelle und ist nicht Teil der Seite) – sieh sie dir mit Read an:\n${liste.map(f => `- ${f}`).join("\n")}` : "";

  let r;
  try {
    r = await claude(`Setze diesen Wunsch in diesem Projektordner um.${p.bauen ? ` Führe danach den Bau aus: ${p.bauen.join(" ")}` : ""}${fotos.length ? `\n${bildHinweis(p)}` : ""}${fotoText(vorher, "der Seite vor deiner Änderung, so sieht der Kunde sie jetzt")}${fotoText(wunschbild, "mit der Verschiebung des Kunden – so ungefähr wünscht er es sich (nur eine Vorschau, sauber umsetzen)")}\n\n${wunschText(w, verlauf, namen, fotos)}`,
      { ordner: p.ordner, schema: SCHEMA_ERGEBNIS, werkzeuge, budget: KONF.max_budget_usd || 3, systemzusatz: SYSTEM });
  } catch (e) { r = { ergebnis: "fehler", zusammenfassung: e.message, frage: "" }; }

  // Gewählte Fotos ins Projekt übernehmen
  if (r.ergebnis === "erledigt" && (r.fotos || []).length) {
    try { await fotosAblegen(p, r.fotos, fotos); } catch (e) { r = { ergebnis: "fehler", zusammenfassung: "Foto konnte nicht übernommen werden: " + e.message, frage: "" }; }
  }

  // Prüfrunden: Ergebnis fotografieren, Claude vergleicht mit vorher und bessert nach (höchstens zwei Runden)
  for (let runde = 1; r.ergebnis === "erledigt" && vorher.length && runde <= 2; runde++) {
    try { bauen(p); } catch (e) { break; }
    const nachher = await knipsen(`nachher${runde}`);
    if (!nachher.length) break;
    await aendern(w.id, { fortschritt: "Prüft das Ergebnis auf Desktop und Handy" });
    const stand = git(p.ordner, "status", "--porcelain") + git(p.ordner, "diff");
    try {
      const pr = await claude(`Du hast diesen Wunsch umgesetzt. Prüfe jetzt mit eigenen Augen, ob er erfüllt ist.${fotoText(vorher, "vorher")}${fotoText(wunschbild, "Wunschbild des Kunden (von ihm verschoben)")}${fotoText(nachher, "nach deiner Änderung")}
Vergleiche vorher und nachher genau, so wie der Kunde hinsieht (Ausrichtung, Abstände, Lesbarkeit, Desktop UND Handy).
Ist der Wunsch sichtbar erfüllt und nichts anderes kaputt? Wenn nicht: korrigiere den Code${p.bauen ? ` und führe den Bau aus: ${p.bauen.join(" ")}` : ""}.
Beschreibe in zusammenfassung nur, was auf den Fotos wirklich zu sehen ist. fotos bleibt leer.\n\n${wunschText(w, verlauf, namen, fotos)}`,
        { ordner: p.ordner, schema: SCHEMA_ERGEBNIS, werkzeuge, budget: KONF.max_budget_usd || 3, systemzusatz: SYSTEM });
      r = { ...pr, fotos: [] };
    } catch (e) { log(`[${p.slug}] ${kurz} Prüfrunde ${runde} fehlgeschlagen: ${e.message}`); break; }
    log(`[${p.slug}] ${kurz} Prüfrunde ${runde}: ${r.ergebnis}`);
    if (git(p.ordner, "status", "--porcelain") + git(p.ordner, "diff") === stand) break;  // nichts nachgebessert → fertig
  }
  rmSync(path.join(p.ordner, EINGANG), { recursive: true, force: true });

  const verboten = geschuetztBeruehrt(p);
  if (r.ergebnis === "erledigt" && verboten.length) r = { ergebnis: "fehler", zusammenfassung: "Geschützte Dateien geändert: " + verboten.join(", "), frage: "" };
  if (r.ergebnis === "erledigt") { try { bauen(p); } catch (e) { r = { ergebnis: "fehler", zusammenfassung: "Bau fehlgeschlagen: " + String(e.stderr || e.message).slice(-300), frage: "" }; } }
  if (r.ergebnis === "erledigt" && sauber(p.ordner)) r = { ergebnis: "rueckfrage", zusammenfassung: "", frage: r.frage || "Ich konnte nichts finden, was ich ändern müsste. Könnt ihr genauer beschreiben, was anders sein soll?" };

  if (r.ergebnis !== "erledigt") {
    zuruecksetzen(p);
    git(p.ordner, "checkout", "-q", p.zweig);
    if (zweig !== p.zweig) git(p.ordner, "branch", "-D", zweig);
    if (r.ergebnis === "rueckfrage") {
      await aendern(w.id, { status: "rueckfrage", fortschritt: "Rückfrage an euch – bitte unten antworten", fertig_bis: null });
      await kommentieren(w.id, r.frage);
    } else {
      await aendern(w.id, { status: "offen", bearbeiter: "Agentur", fortschritt: "Wird von der Agentur übernommen", fertig_bis: null });
      if (r.ergebnis === "nicht_moeglich") await kommentieren(w.id, r.zusammenfassung || "Diesen Wunsch schaut sich die Agentur persönlich an.");
      log(`[${p.slug}] ${kurz} an Agentur: ${r.zusammenfassung}`);
    }
    return;
  }

  // 3. Festhalten und veröffentlichen
  git(p.ordner, "add", "-A");
  git(p.ordner, "commit", "-q", "-m", `Kundenwunsch ${kurz}: ${w.text.replace(/\s+/g, " ").slice(0, 60)}`, "-m", `${r.zusammenfassung}\n\nUmgesetzt vom Wächter (Claude Code).`);
  if (modus === "direkt") {
    if (p.veroeffentlichen) git(p.ordner, "push", "-q", "origin", p.zweig);
    await aendern(w.id, { status: "erledigt", fortschritt: p.veroeffentlichen ? "Umgesetzt – in der Vorschau in ca. 1–2 Min. sichtbar" : "Umgesetzt", fertig_bis: null });
  } else {
    git(p.ordner, "checkout", "-q", p.zweig);
    await aendern(w.id, { status: "zur_freigabe", fortschritt: "Umgesetzt – wartet auf Freigabe durch die Agentur", fertig_bis: null });
  }
  await kommentieren(w.id, r.zusammenfassung);
  heuteZaehlen(1);
}

async function freigabenVeroeffentlichen(p, liste) {
  for (const w of liste.filter(w => w.status === "zur_freigabe" && w.freigegeben)) {
    const zweig = `wunsch-${w.id.slice(0, 8)}`;
    try {
      git(p.ordner, "checkout", "-q", p.zweig);
      if (p.veroeffentlichen) git(p.ordner, "pull", "-q", "--ff-only");
      git(p.ordner, "merge", "-q", "--no-edit", zweig);
      bauen(p);
      if (!sauber(p.ordner)) { git(p.ordner, "add", "-A"); git(p.ordner, "commit", "-q", "-m", `Neu gebaut nach Wunsch ${zweig}`); }
      if (p.veroeffentlichen) git(p.ordner, "push", "-q", "origin", p.zweig);
      git(p.ordner, "branch", "-d", zweig);
      await aendern(w.id, { status: "erledigt", fortschritt: "Veröffentlicht – in der Vorschau in ca. 1–2 Min. sichtbar" });
      log(`[${p.slug}] ${zweig} veröffentlicht`);
    } catch (e) {
      try { git(p.ordner, "merge", "--abort"); } catch (e2) {}
      await aendern(w.id, { freigegeben: false, fortschritt: "Veröffentlichen fehlgeschlagen – die Agentur kümmert sich" });
      log(`[${p.slug}] ${zweig} Fehler: ${e.message}`);
    }
  }
}

// ---------- Hauptschleife ----------
async function runde(meineId) {
  for (const [slug, einst] of Object.entries(KONF.projekte)) {
    const p = { slug, zweig: "main", veroeffentlichen: false, geschuetzt: [".git", ".github/", ".gitignore"], ...einst };
    try {
      const projekt = ok(await sb.from("projekte").select("*").eq("slug", slug).maybeSingle());
      if (!projekt) { log(`[${slug}] kein Zugriff – ist der Automatik-Benutzer Mitglied mit Rolle „agentur“?`); continue; }
      const auto = ok(await sb.from("automatik").select("*").eq("projekt_id", projekt.id).maybeSingle());
      if (!auto) ok(await sb.from("automatik").insert({ projekt_id: projekt.id, modus: "aus" }));
      const modus = (auto || {}).modus || "aus";
      if (modus === "aus") { await lebenszeichen(projekt.id, "Wächter läuft, Automatik ist aus"); continue; }
      if (!sauber(p.ordner)) { await lebenszeichen(projekt.id, "Arbeitsordner hat ungespeicherte Änderungen – Automatik wartet"); continue; }

      const liste = ok(await sb.from("wuensche").select("*").eq("projekt_id", projekt.id).order("erstellt_am"));
      const namen = Object.fromEntries(ok(await sb.from("mitglieder").select("user_id, anzeigename").eq("projekt_id", projekt.id)).map(m => [m.user_id, m.anzeigename]));
      await freigabenVeroeffentlichen(p, liste);

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
      if (heuteZaehlen() >= MAX_PRO_TAG) { await lebenszeichen(projekt.id, `Tagesgrenze von ${MAX_PRO_TAG} Wünschen erreicht – morgen geht es weiter`); continue; }
      await lebenszeichen(projekt.id, warteschlange.length ? `Bearbeite ${warteschlange.length} Wunsch/Wünsche` : "Keine offenen Wünsche");
      if (warteschlange[0]) await umsetzen(p, projekt, modus, warteschlange[0], namen, meineId);
      await lebenszeichen(projekt.id, "Bereit");
    } catch (e) {
      log(`[${slug}] Fehler:`, e.message);
    }
  }
}

const anmeldung = ok(await sb.auth.signInWithPassword({ email: ENV.KF_EMAIL, password: ENV.KF_PASSWORT }));
const meineId = anmeldung.user.id;
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
  .subscribe(s => log("Live-Verbindung:", s));
