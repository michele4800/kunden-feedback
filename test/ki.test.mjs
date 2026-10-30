// Testet die Werkzeuge, die die KI über API bekommt (waechter/ki.mjs): Ordnergrenzen, Lese-/Schreibrechte, Ersetzen, Bau.
import { werkzeugKasten, kiApi } from "../waechter/ki.mjs";
import http from "node:http";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const ordner = mkdtempSync(path.join(os.tmpdir(), "kf-ki-"));
mkdirSync(path.join(ordner, ".git")); writeFileSync(path.join(ordner, ".git", "config"), "geheim");
writeFileSync(path.join(ordner, "index.html"), "<h1>Hallo</h1>\n<p>Hallo</p>\n");
writeFileSync(path.join(ordner, "logo.png"), Buffer.from([137, 80, 78, 71]));
const nimm = (defs, name) => defs.find(d => d.name === name);
const schema = { type: "object", properties: {} };

// Nur lesen (Schätzung): keine Schreib- und Bauwerkzeuge
const lesend = werkzeugKasten(ordner, ["Read", "Glob", "Grep"], schema);
assert.deepEqual(lesend.map(d => d.name), ["lesen", "auflisten", "suchen", "antworten"]);
assert.equal(nimm(lesend, "lesen").run({ pfad: "index.html" }).includes("Hallo"), true);
assert.equal(nimm(lesend, "lesen").run({ pfad: "logo.png" }).bild.typ, "image/png");
assert.throws(() => nimm(lesend, "lesen").run({ pfad: "../draussen.txt" }), /außerhalb/);
assert.throws(() => nimm(lesend, "lesen").run({ pfad: path.join(os.tmpdir(), "x.txt") }), /außerhalb/);
assert.throws(() => nimm(lesend, "lesen").run({ pfad: ".git/config" }), /\.git/);
assert.equal(nimm(lesend, "auflisten").run({ muster: "" }).includes(".git"), false);
assert.match(nimm(lesend, "suchen").run({ ausdruck: "<p>", muster: "**/*.html" }), /index\.html:2:/);

// Umsetzen: schreiben, ersetzen (genau einmal), bauen
const voll = werkzeugKasten(ordner, ["Read", "Edit", "Write", "Glob", "Grep", "Bash(node -e process.exit(3))"], schema);
assert.deepEqual(voll.map(d => d.name), ["lesen", "auflisten", "suchen", "schreiben", "ersetzen", "bauen", "antworten"]);
assert.throws(() => nimm(voll, "ersetzen").run({ pfad: "index.html", alt: "Hallo", neu: "Tschüss" }), /2-mal/);
nimm(voll, "ersetzen").run({ pfad: "index.html", alt: "<h1>Hallo", neu: "<h1>Guten Tag $&" });
assert.equal(readFileSync(path.join(ordner, "index.html"), "utf8").split("\n")[0], "<h1>Guten Tag $&</h1>");  // $& wörtlich
nimm(voll, "schreiben").run({ pfad: "neu/seite.html", inhalt: "x" });
assert.equal(existsSync(path.join(ordner, "neu", "seite.html")), true);
assert.throws(() => nimm(voll, "schreiben").run({ pfad: "../../boese.txt", inhalt: "x" }), /außerhalb/);
assert.match(nimm(voll, "bauen").run({}), /Exit-Code 3/);

console.log("ok – KI-Werkzeuge: Ordnergrenzen, Rechte, Ersetzen, Bau");

// Schleife gegen nachgebaute APIs: erst ein Werkzeug (ersetzen), dann „antworten“
const ANTWORT = { ergebnisse: [{ nr: 1, ergebnis: "erledigt", zusammenfassung: "Titel geändert", frage: "" }], fotos: [] };
const SCHEMA = { type: "object", properties: { ergebnisse: { type: "array" }, fotos: { type: "array" } }, required: ["ergebnisse", "fotos"] };
const anfragen = [];
const server = http.createServer(async (q, a) => {
  let body = ""; for await (const c of q) body += c;
  const b = JSON.parse(body); anfragen.push({ url: q.url, b });
  const zweite = b.messages.length > (q.url.includes("chat") ? 2 : 1);
  if (q.url.includes("/chat/completions")) {
    const call = zweite ? { id: "c2", type: "function", function: { name: "antworten", arguments: JSON.stringify(ANTWORT) } }
      : { id: "c1", type: "function", function: { name: "ersetzen", arguments: JSON.stringify({ pfad: "index.html", alt: "Guten Tag", neu: "Moin" }) } };
    a.writeHead(200, { "content-type": "application/json" });
    return a.end(JSON.stringify({ id: "x", object: "chat.completion", created: 1, model: b.model,
      choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [call] } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }));
  }
  const block = zweite ? { name: "antworten", input: ANTWORT } : { name: "ersetzen", input: { pfad: "index.html", alt: "Moin", neu: "Servus" } };
  const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`;
  a.writeHead(200, { "content-type": "text/event-stream" });
  a.end(ev("message_start", { message: { id: "m", type: "message", role: "assistant", model: b.model, content: [], stop_reason: null, usage: { input_tokens: 1000, output_tokens: 0 } } })
    + ev("content_block_start", { index: 0, content_block: { type: "tool_use", id: "t" + anfragen.length, name: block.name, input: {} } })
    + ev("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } })
    + ev("content_block_stop", { index: 0 })
    + ev("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 100 } }) + ev("message_stop", {}));
}).listen(0);
const basis = `http://127.0.0.1:${server.address().port}`;
process.env.OPENAI_BASE_URL = basis + "/v1"; process.env.ANTHROPIC_BASE_URL = basis;
const opt = { ordner, schema: SCHEMA, werkzeuge: ["Read", "Edit"], budget: 1, systemzusatz: "System", schluessel: "test-schluessel-1234567890" };
assert.deepEqual(await kiApi("Wunsch", { ...opt, anbieter: "openai_api", modell: "gpt-5" }), ANTWORT);
assert.match(readFileSync(path.join(ordner, "index.html"), "utf8"), /Moin/);
assert.deepEqual(await kiApi("Wunsch", { ...opt, anbieter: "claude_api", modell: "claude-sonnet-5-5" }), ANTWORT);
assert.match(readFileSync(path.join(ordner, "index.html"), "utf8"), /Servus/);
assert.equal(anfragen[2].b.system, "System"); assert.equal(anfragen[3].b.messages[2].content[0].type, "tool_result");
// Budget: unbekanntes Modell rechnet teuer, 0,001 $ reicht nicht
await assert.rejects(kiApi("Wunsch", { ...opt, budget: 0.001, anbieter: "claude_api", modell: "claude-unbekannt" }), /Budget/);
server.close();
console.log("ok – KI-Schleife: ChatGPT-API und Claude-API mit Werkzeug und Antwort, Budgetgrenze");
