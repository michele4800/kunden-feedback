// Tests: Repo aus der Vorschau-Adresse ableiten, Einbau-Code einsetzen
import assert from "node:assert/strict";
import { repoAusAdresse, einbauen } from "../waechter/einrichten.mjs";

assert.equal(repoAusAdresse("https://michele4800.github.io/holzbau-beuttler/"), "michele4800/holzbau-beuttler");
assert.equal(repoAusAdresse("https://michele4800.github.io/holzbau-beuttler"), "michele4800/holzbau-beuttler");
assert.equal(repoAusAdresse("https://michele4800.github.io/"), "michele4800/michele4800.github.io");
assert.equal(repoAusAdresse("https://github.com/michele4800/holzbau-beuttler"), "");
assert.equal(repoAusAdresse("https://michele4800.github.io/../x"), "");
assert.equal(repoAusAdresse(""), "");
console.log("ok – Repo aus Vorschau-Adresse");

const s = '<script src="https://x/feedback.js" data-projekt="a" defer></script>';
assert.equal(einbauen("<html><body><p>Hi</p></body></html>", s), `<html><body><p>Hi</p>${s}\n</body></html>`);
assert.equal(einbauen("<BODY>x</BODY>", s), `<BODY>x${s}\n</BODY>`);
assert.equal(einbauen(`<body>${s}</body>`, s), null, "nicht doppelt einbauen");
assert.equal(einbauen("<p>ohne body</p>", s), null);
console.log("ok – Einbau-Code");
console.log("\nAlle Einrichten-Tests bestanden.");
