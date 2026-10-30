// KI über API statt Claude Code: Claude-API oder ChatGPT-API, mit denselben Werkzeugen (Lesen, Suchen, Schreiben, Bau)
// und derselben strukturierten Antwort wie claude.mjs. Der Wächter wählt den Anbieter laut Dashboard (Tabelle ki_einstellungen).
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, globSync, statSync, realpathSync, existsSync } from "node:fs";
import path from "node:path";

// $ je 1 Mio. Token (Eingabe, Ausgabe). Unbekannte Modelle rechnen teuer, damit das Budget sicher hält.
const PREISE = {
  "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-fable-5-1": [10, 50],
};
const preis = (anbieter, modell) => PREISE[modell] || (anbieter === "claude_api" ? [10, 50] : [15, 60]);
const BILD = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const AUSSEN_VOR = ["**/.git/**", "**/node_modules/**"];

// Pfad im Projektordner auflösen; alles außerhalb oder in .git ist tabu
export function imOrdner(ordner, pfad) {
  const basis = realpathSync(ordner);
  const ziel = path.resolve(basis, String(pfad || ""));
  const echt = existsSync(ziel) ? realpathSync(ziel) : ziel;
  if (echt !== basis && !echt.startsWith(basis + path.sep)) throw new Error("Pfad liegt außerhalb des Projektordners");
  if (echt.split(path.sep).includes(".git")) throw new Error(".git ist tabu");
  return echt;
}

export function werkzeugKasten(ordner, werkzeuge, schema) {
  const schreiben = werkzeuge.includes("Edit") || werkzeuge.includes("Write");
  // shortcut: Bau-Befehl wird an Leerzeichen getrennt, reicht für die Befehle aus projekte.json (keine Leerzeichen in Argumenten)
  const bauBefehl = (werkzeuge.map(w => /^Bash\((.+)\)$/.exec(w)).find(Boolean) || [])[1];
  const defs = [
    { name: "lesen", description: "Datei im Projektordner lesen (Text oder Bild: png/jpg/webp/gif).",
      schema: { type: "object", additionalProperties: false, required: ["pfad"], properties: { pfad: { type: "string" } } },
      run: ({ pfad }) => {
        const d = imOrdner(ordner, pfad), endung = path.extname(d).toLowerCase();
        if (BILD[endung]) return { bild: { typ: BILD[endung], daten: readFileSync(d).toString("base64") } };
        if (statSync(d).size > 400000) throw new Error("Datei zu groß (über 400 KB)");
        return readFileSync(d, "utf8");
      } },
    { name: "auflisten", description: "Dateien im Projektordner auflisten. muster ist ein Glob wie **/*.html (leer = alles).",
      schema: { type: "object", additionalProperties: false, required: ["muster"], properties: { muster: { type: "string" } } },
      run: ({ muster }) => globSync(muster || "**/*", { cwd: ordner, exclude: AUSSEN_VOR }).slice(0, 2000).join("\n") || "(keine Treffer)" },
    { name: "suchen", description: "Regulären Ausdruck in Dateien suchen. muster begrenzt die Dateien (Glob, leer = alle Textdateien).",
      schema: { type: "object", additionalProperties: false, required: ["ausdruck", "muster"], properties: { ausdruck: { type: "string" }, muster: { type: "string" } } },
      run: ({ ausdruck, muster }) => {
        const re = new RegExp(ausdruck), treffer = [];
        for (const f of globSync(muster || "**/*", { cwd: ordner, exclude: AUSSEN_VOR })) {
          const d = path.join(ordner, f);
          if (BILD[path.extname(f).toLowerCase()] || !statSync(d).isFile() || statSync(d).size > 400000) continue;
          readFileSync(d, "utf8").split("\n").forEach((z, i) => { if (treffer.length < 200 && re.test(z)) treffer.push(`${f}:${i + 1}: ${z.slice(0, 300)}`); });
        }
        return treffer.join("\n") || "(keine Treffer)";
      } },
  ];
  if (schreiben) defs.push(
    { name: "schreiben", description: "Datei im Projektordner ganz neu schreiben (legt Ordner an).",
      schema: { type: "object", additionalProperties: false, required: ["pfad", "inhalt"], properties: { pfad: { type: "string" }, inhalt: { type: "string" } } },
      run: ({ pfad, inhalt }) => { const d = imOrdner(ordner, pfad); mkdirSync(path.dirname(d), { recursive: true }); writeFileSync(d, inhalt); return "geschrieben"; } },
    { name: "ersetzen", description: "In einer Datei genau eine Stelle ersetzen: alt muss genau einmal vorkommen.",
      schema: { type: "object", additionalProperties: false, required: ["pfad", "alt", "neu"], properties: { pfad: { type: "string" }, alt: { type: "string" }, neu: { type: "string" } } },
      run: ({ pfad, alt, neu }) => {
        const d = imOrdner(ordner, pfad), t = readFileSync(d, "utf8"), n = alt ? t.split(alt).length - 1 : 0;
        if (n !== 1) throw new Error(`„alt“ kommt ${n}-mal vor, muss genau einmal vorkommen`);
        writeFileSync(d, t.replace(alt, () => neu)); return "ersetzt";
      } });
  if (bauBefehl) defs.push(
    { name: "bauen", description: `Den Bau ausführen: ${bauBefehl}`,
      schema: { type: "object", additionalProperties: false, required: [], properties: {} },
      run: () => {
        const [cmd, ...args] = bauBefehl.split(" ");
        const r = spawnSync(cmd, args, { cwd: ordner, encoding: "utf8", windowsHide: true, timeout: 300000 });
        return `Exit-Code ${r.status}\n${(r.stdout || "").slice(-3000)}\n${(r.stderr || "").slice(-3000)}`;
      } });
  defs.push({ name: "antworten", description: "Zum Schluss genau einmal aufrufen: die fertige Antwort im verlangten Format.", schema, run: null });
  return defs;
}

async function ausfuehren(defs, name, eingabe) {
  const d = defs.find(x => x.name === name);
  if (!d || !d.run) return { fehler: `Unbekanntes Werkzeug: ${name}` };
  try { return { wert: await d.run(eingabe || {}) }; } catch (e) { return { fehler: e.message }; }
}

// Gleiche Schnittstelle wie claude() aus claude.mjs, plus anbieter/modell/schluessel
export async function kiApi(prompt, { ordner, schema, werkzeuge, budget, systemzusatz, maxMinuten = 30, anbieter, modell, schluessel }) {
  const defs = werkzeugKasten(ordner, werkzeuge, schema);
  const [pe, pa] = preis(anbieter, modell);
  const ende = Date.now() + maxMinuten * 60000;
  let kosten = 0, erinnert = false;
  const zaehlen = (ein, aus) => {
    kosten += (ein * pe + aus * pa) / 1e6;
    if (kosten > budget) throw new Error(`Budget von ${budget} $ erreicht (${kosten.toFixed(2)} $)`);
    if (Date.now() > ende) throw new Error("Zeitüberschreitung");
  };
  const lauf = anbieter === "claude_api" ? claudeLauf : openaiLauf;
  return lauf({ prompt, defs, systemzusatz, modell, schluessel, zaehlen, nochmal: () => !erinnert && (erinnert = true) });
}

async function claudeLauf({ prompt, defs, systemzusatz, modell, schluessel, zaehlen, nochmal }) {
  const client = new Anthropic({ apiKey: schluessel });
  const tools = defs.map(d => ({ name: d.name, description: d.description, input_schema: d.schema }));
  const messages = [{ role: "user", content: prompt }];
  for (let runde = 0; runde < 80; runde++) {
    const r = await client.messages.stream({ model: modell, max_tokens: 64000, system: systemzusatz, tools, messages }).finalMessage();
    zaehlen(r.usage.input_tokens + (r.usage.cache_read_input_tokens || 0), r.usage.output_tokens);
    if (r.stop_reason === "refusal") throw new Error("Die KI hat die Anfrage abgelehnt");
    messages.push({ role: "assistant", content: r.content });
    const aufrufe = r.content.filter(b => b.type === "tool_use");
    const antwort = aufrufe.find(b => b.name === "antworten");
    if (antwort) return antwort.input;
    if (r.stop_reason === "pause_turn") continue;
    if (!aufrufe.length) {
      if (!nochmal()) throw new Error("Die KI hat keine Antwort im verlangten Format gegeben");
      messages.push({ role: "user", content: "Rufe jetzt das Werkzeug „antworten“ mit dem Ergebnis auf." });
      continue;
    }
    const ergebnisse = [];
    for (const b of aufrufe) {
      const e = await ausfuehren(defs, b.name, b.input);
      const inhalt = e.fehler ? e.fehler : e.wert.bild ? [{ type: "image", source: { type: "base64", media_type: e.wert.bild.typ, data: e.wert.bild.daten } }] : String(e.wert);
      ergebnisse.push({ type: "tool_result", tool_use_id: b.id, content: inhalt, ...(e.fehler ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: ergebnisse });
  }
  throw new Error("Zu viele Schritte ohne Ergebnis");
}

async function openaiLauf({ prompt, defs, systemzusatz, modell, schluessel, zaehlen, nochmal }) {
  const client = new OpenAI({ apiKey: schluessel });
  const tools = defs.map(d => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.schema } }));
  const messages = [{ role: "system", content: systemzusatz }, { role: "user", content: prompt }];
  for (let runde = 0; runde < 80; runde++) {
    const r = await client.chat.completions.create({ model: modell, messages, tools, max_completion_tokens: 32000 });
    zaehlen(r.usage?.prompt_tokens || 0, r.usage?.completion_tokens || 0);
    const m = r.choices[0].message;
    messages.push(m);
    const aufrufe = m.tool_calls || [];
    const antwort = aufrufe.find(a => a.function?.name === "antworten");
    if (antwort) return JSON.parse(antwort.function.arguments);
    if (!aufrufe.length) {
      if (!nochmal()) throw new Error("Die KI hat keine Antwort im verlangten Format gegeben");
      messages.push({ role: "user", content: "Rufe jetzt das Werkzeug „antworten“ mit dem Ergebnis auf." });
      continue;
    }
    const bilder = [];
    for (const a of aufrufe) {
      let eingabe = {};
      try { eingabe = JSON.parse(a.function.arguments || "{}"); } catch (e) {}
      const e = await ausfuehren(defs, a.function.name, eingabe);
      if (e.wert?.bild) bilder.push({ type: "image_url", image_url: { url: `data:${e.wert.bild.typ};base64,${e.wert.bild.daten}` } });
      messages.push({ role: "tool", tool_call_id: a.id, content: e.fehler ? `Fehler: ${e.fehler}` : e.wert.bild ? "Bild folgt in der nächsten Nachricht." : String(e.wert) });
    }
    // Bilder darf ein Werkzeug-Ergebnis bei OpenAI nicht enthalten – deshalb als eigene Nachricht hinterher
    if (bilder.length) messages.push({ role: "user", content: [{ type: "text", text: "Angeforderte Bilder:" }, ...bilder] });
  }
  throw new Error("Zu viele Schritte ohne Ergebnis");
}
