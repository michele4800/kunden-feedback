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
// ---------- Ein Wunsch oder ein Paket gesammelter Wünsche (ein Durchlauf, ein Commit) ----------
async function umsetzen(p, projekt, modus, ws, namen, meineId) {
  const kurz = ws[0].id.slice(0, 8);
  const nrVon = new Map(ws.map((w, i) => [w.id, i + 1]));
  log(`[${p.slug}] ${ws.length > 1 ? `Paket ${kurz} mit ${ws.length} Wünschen` : `Wunsch ${kurz}`}: ${ws.map(w => w.text.slice(0, 40)).join(" | ").slice(0, 160)}`);
  // Sofort zeigen, dass jemand dran ist – die Schätzung dauert oft eine halbe Minute
  for (const w of ws) await aendern(w.id, { status: "in_arbeit", bearbeiter: NAME, fortschritt: "Schaut sich den Wunsch an und schätzt den Aufwand", fertig_bis: null });
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
    s = await claude(`Schätze, wie viele Minuten die Umsetzung ${ws.length > 1 ? "aller dieser Wünsche zusammen" : "dieses Wunsches"} in diesem Projekt dauert (inkl. Prüfen).
Fehlt bei einem Wunsch eine Information, trage ihn mit nr und Frage in "rueckfragen" ein; sonst bleibt die Liste leer.\n\n${texte()}`,
      { ordner: p.ordner, schema: SCHEMA_SCHAETZUNG, werkzeuge: ["Read", "Glob", "Grep"], budget: 1, systemzusatz: SYSTEM });
  } catch (e) {
    leeren();
    for (const w of ws) await anAgentur(w, `Schätzung fehlgeschlagen: ${e.message}`);
    return;
  }
  const fragen = new Map((s.rueckfragen || []).filter(f => f.frage && ws[f.nr - 1]).map(f => [ws[f.nr - 1].id, f.frage]));
  for (const w of ws.filter(w => fragen.has(w.id))) {
    await aendern(w.id, { status: "rueckfrage", bearbeiter: NAME, fortschritt: "Rückfrage an euch – bitte unten antworten", fertig_bis: null });
    await kommentieren(w.id, fragen.get(w.id));
  }
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

  if (!fertig.length || nichtsGeaendert) {
    zuruecksetzen(p);
    git(p.ordner, "checkout", "-q", p.zweig);
    if (zweig !== p.zweig) git(p.ordner, "branch", "-D", zweig);
  } else {
    // 3. Festhalten und veröffentlichen – ein Commit für alles Erledigte
    git(p.ordner, "add", "-A");
    const titel = fertig.length > 1 ? `Kundenwünsche (${fertig.length}): ${fertig.map(d => d.w.text.replace(/\s+/g, " ").slice(0, 30)).join(" | ")}` : `Kundenwunsch ${kurz}: ${fertig[0].w.text.replace(/\s+/g, " ").slice(0, 60)}`;
    git(p.ordner, "commit", "-q", "-m", titel.slice(0, 200), "-m", `${fertig.map(d => `- ${(erg.get(nrVon.get(d.w.id)) || {}).zusammenfassung || ""}`).join("\n")}\n\nUmgesetzt vom Wächter (Claude Code).`);
    if (modus === "direkt") { if (p.veroeffentlichen) git(p.ordner, "push", "-q", "origin", p.zweig); }
    else git(p.ordner, "checkout", "-q", p.zweig);
    heuteZaehlen(1);
  }

  // Status je Wunsch
  for (const d of aktiv) {
    const e = erg.get(nrVon.get(d.w.id)) || { ergebnis: "fehler", zusammenfassung: fehler || "keine Antwort", frage: "" };
    if (fertig.includes(d) && !nichtsGeaendert) {
      if (modus === "direkt") await aendern(d.w.id, { status: "erledigt", fortschritt: p.veroeffentlichen ? "Umgesetzt – in der Vorschau in ca. 1–2 Min. sichtbar" : "Umgesetzt", fertig_bis: null });
      else await aendern(d.w.id, { status: "zur_freigabe", details: { ...(d.w.details || {}), zweig }, fortschritt: "Umgesetzt – wartet auf Freigabe durch die Agentur", fertig_bis: null });
      await kommentieren(d.w.id, e.zusammenfassung);
    } else if (e.ergebnis === "rueckfrage" || (e.ergebnis === "erledigt" && nichtsGeaendert)) {
      await aendern(d.w.id, { status: "rueckfrage", fortschritt: "Rückfrage an euch – bitte unten antworten", fertig_bis: null });
      await kommentieren(d.w.id, e.frage || "Ich konnte nichts finden, was ich ändern müsste. Könnt ihr genauer beschreiben, was anders sein soll?");
    } else {
      await anAgentur(d.w, fehler || e.zusammenfassung);
      if (e.ergebnis === "nicht_moeglich") await kommentieren(d.w.id, e.zusammenfassung || "Diesen Wunsch schaut sich die Agentur persönlich an.");
    }
  }
}

// Freigegebene Umsetzungen veröffentlichen. Ein Paket liegt auf einem gemeinsamen Zweig: die Freigabe gilt für alle seine Wünsche.
async function freigabenVeroeffentlichen(p, liste) {
  const zweigVon = w => (w.details || {}).zweig || `wunsch-${w.id.slice(0, 8)}`;
  const zweige = [...new Set(liste.filter(w => w.status === "zur_freigabe" && w.freigegeben).map(zweigVon))];
  for (const zweig of zweige) {
    const dazu = liste.filter(w => w.status === "zur_freigabe" && zweigVon(w) === zweig);
    try {
      git(p.ordner, "checkout", "-q", p.zweig);
      if (p.veroeffentlichen) git(p.ordner, "pull", "-q", "--ff-only");
      git(p.ordner, "merge", "-q", "--no-edit", zweig);
      bauen(p);
      if (!sauber(p.ordner)) { git(p.ordner, "add", "-A"); git(p.ordner, "commit", "-q", "-m", `Neu gebaut nach Wunsch ${zweig}`); }
      if (p.veroeffentlichen) git(p.ordner, "push", "-q", "origin", p.zweig);
      git(p.ordner, "branch", "-d", zweig);
      for (const w of dazu) await aendern(w.id, { status: "erledigt", fortschritt: "Veröffentlicht – in der Vorschau in ca. 1–2 Min. sichtbar" });
      log(`[${p.slug}] ${zweig} veröffentlicht (${dazu.length} Wunsch/Wünsche)`);
    } catch (e) {
      try { git(p.ordner, "merge", "--abort"); } catch (e2) {}
      for (const w of dazu) await aendern(w.id, { freigegeben: false, fortschritt: "Veröffentlichen fehlgeschlagen – die Agentur kümmert sich" });
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
      // Gesammelt abgeschickte Wünsche (gleiches Paket) zusammen umsetzen – wartet kurz, bis alle eingetroffen sind
      const kopf = warteschlange[0];
      const paket = kopf && (kopf.details || {}).paket;
      const ws = paket ? warteschlange.filter(w => (w.details || {}).paket === paket).slice(0, 10) : kopf ? [kopf] : [];
      const unvollstaendig = paket && ws.length < (+kopf.details.paket_anzahl || 0) && Date.now() - Date.parse(kopf.erstellt_am) < 60000;
      if (ws.length && !unvollstaendig) await umsetzen(p, projekt, modus, ws, namen, meineId);
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
