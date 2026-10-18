// Testet supabase/schema.sql gegen echtes Postgres (PGlite) mit nachgebildeter Supabase-Anmeldung.
// Aufruf: npm test
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

// --- Supabase nachbilden: Rollen, auth.users, auth.uid() ---
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Supabase Storage nachbilden (vereinfacht)
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`);
await db.exec(schema);
await db.exec(schema); // zweimal: muss wiederholbar sein

const ID = {
  kundeA: "00000000-0000-0000-0000-0000000000a1", kundeA2: "00000000-0000-0000-0000-0000000000a2",
  kundeB: "00000000-0000-0000-0000-0000000000b1", agentur: "00000000-0000-0000-0000-0000000000c1",
  claude: "00000000-0000-0000-0000-0000000000c2",
  projA: "10000000-0000-0000-0000-00000000000a", projB: "10000000-0000-0000-0000-00000000000b",
};
await db.exec(`
  insert into auth.users values ('${ID.kundeA}','a@x'),('${ID.kundeA2}','a2@x'),('${ID.kundeB}','b@x'),('${ID.agentur}','ag@x'),('${ID.claude}','cl@x');
  insert into projekte (id, slug, name) values ('${ID.projA}','hof-a','Hof A'),('${ID.projB}','hof-b','Hof B');
  insert into mitglieder values
    ('${ID.projA}','${ID.kundeA}','kunde','Kunde A'),('${ID.projA}','${ID.kundeA2}','kunde','Kunde A2'),
    ('${ID.projB}','${ID.kundeB}','kunde','Kunde B'),
    ('${ID.projA}','${ID.agentur}','agentur','Agentur'),('${ID.projB}','${ID.agentur}','agentur','Agentur'),
    ('${ID.projA}','${ID.claude}','agentur','Michele (Automatik)');
`);

// Als bestimmter Benutzer ausführen (wie ein Browser mit gültiger Anmeldung)
async function als(wer, sql, params = []) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${wer ? ID[wer] : ""}', false); set role ${wer ? "authenticated" : "anon"};`);
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role;"); }
}
const fehlt = async (wer, sql, params, muster) => {
  await assert.rejects(als(wer, sql, params), e => (muster ? muster.test(e.message) : true), `sollte scheitern: ${wer}: ${sql}`);
};
let n = 0; const test = async (name, fn) => { await fn(); n++; console.log("ok –", name); };

await test("anon sieht nichts", async () => {
  await fehlt(null, "select * from projekte", [], /permission denied/);
  await fehlt(null, "select * from wuensche", [], /permission denied/);
});

await test("Kunde sieht nur sein Projekt", async () => {
  const r = await als("kundeA", "select slug from projekte");
  assert.deepEqual(r.rows.map(x => x.slug), ["hof-a"]);
  const m = await als("kundeA", "select count(*)::int c from mitglieder");
  assert.equal(m.rows[0].c, 4);
});

let wunschA;
await test("Kunde legt Wunsch an – Status, Autor und Automatik-Felder setzt der Server", async () => {
  const r = await als("kundeA", `insert into wuensche (projekt_id, text, status, prioritaet, autor, bearbeiter, fertig_bis)
    values ($1, 'Foto tauschen', 'erledigt', 1, $2, 'Hacker', now()) returning *`, [ID.projA, ID.kundeB]);
  wunschA = r.rows[0];
  assert.equal(wunschA.status, "offen"); assert.equal(wunschA.prioritaet, 1); // Wichtigkeit darf der Kunde wählen
  assert.equal(wunschA.autor, ID.kundeA); assert.equal(wunschA.bearbeiter, ""); assert.equal(wunschA.fertig_bis, null);
});

await test("Kunde kann nicht in fremdes Projekt schreiben oder es lesen", async () => {
  await fehlt("kundeA", "insert into wuensche (projekt_id, text) values ($1, 'x')", [ID.projB], /row-level security/);
  const r = await als("kundeB", "select count(*)::int c from wuensche"); assert.equal(r.rows[0].c, 0);
});

await test("Leerer Text wird abgelehnt", async () => {
  await fehlt("kundeA", "insert into wuensche (projekt_id, text) values ($1, '   ')", [ID.projA], /check constraint/);
});

await test("Kunde ändert eigenen offenen Wunsch, aber nicht Status oder Bearbeitung", async () => {
  await als("kundeA", "update wuensche set text = 'Foto oben tauschen' where id = $1", [wunschA.id]);
  await fehlt("kundeA", "update wuensche set status = 'erledigt' where id = $1", [wunschA.id], /Agentur/);
  await fehlt("kundeA", "update wuensche set fertig_bis = now() where id = $1", [wunschA.id], /Agentur/);
  await fehlt("kundeA", "update wuensche set freigegeben = true where id = $1", [wunschA.id], /Agentur/);
});

await test("Anderer Kunde im selben Projekt kann fremden Wunsch nicht ändern", async () => {
  const r = await als("kundeA2", "update wuensche set text = 'gekapert' where id = $1 returning id", [wunschA.id]);
  assert.equal(r.rows.length, 0);
});

await test("Automatik/Agentur setzt In Arbeit mit Fertigstellung; danach ist der Wunsch für den Kunden gesperrt", async () => {
  const r = await als("claude", `update wuensche set status='in_arbeit', bearbeiter='Michele (Automatik)', fortschritt='Wird umgesetzt',
    fertig_bis = now() + interval '20 minutes' where id = $1 returning status, bearbeiter`, [wunschA.id]);
  assert.equal(r.rows[0].status, "in_arbeit");
  await fehlt("kundeA", "update wuensche set text = 'doch anders' where id = $1", [wunschA.id], /Bearbeitung/);
  const d = await als("kundeA", "delete from wuensche where id = $1 returning id", [wunschA.id]);
  assert.equal(d.rows.length, 0);
});

await test("Unveränderliche Felder bleiben unveränderlich, auch für die Agentur", async () => {
  await fehlt("agentur", "update wuensche set projekt_id = $2 where id = $1", [wunschA.id, ID.projB], /unveränderlich/);
});

await test("Kommentare: Projekt kommt aus dem Wunsch, Autor vom Server; fremde Wünsche gesperrt", async () => {
  const r = await als("kundeA", "insert into kommentare (wunsch_id, projekt_id, text, autor) values ($1, $2, 'Danke!', $3) returning projekt_id, autor",
    [wunschA.id, ID.projB, ID.agentur]);
  assert.equal(r.rows[0].projekt_id, ID.projA); assert.equal(r.rows[0].autor, ID.kundeA);
  await fehlt("kundeB", "insert into kommentare (wunsch_id, projekt_id, text) values ($1, $2, 'x')", [wunschA.id, ID.projB], /row-level security/);
  const b = await als("kundeB", "select count(*)::int c from kommentare"); assert.equal(b.rows[0].c, 0);
});

let frage;
await test("Fragen pflegt nur die Agentur; Kunde antwortet", async () => {
  await fehlt("kundeA", "insert into fragen (projekt_id, frage) values ($1, 'x')", [ID.projA], /row-level security/);
  frage = (await als("agentur", "insert into fragen (projekt_id, frage, art, optionen) values ($1, 'Stil?', 'auswahl', '[\"1\",\"2\"]') returning id", [ID.projA])).rows[0];
  const a = await als("kundeA", "insert into antworten (frage_id, projekt_id, wert) values ($1, $2, '\"1\"') returning projekt_id, autor", [frage.id, ID.projB]);
  assert.equal(a.rows[0].projekt_id, ID.projA); assert.equal(a.rows[0].autor, ID.kundeA);
  await als("kundeA2", "update antworten set wert = '\"2\"' where frage_id = $1", [frage.id]);
  await fehlt("kundeB", "insert into antworten (frage_id, projekt_id, wert) values ($1, $2, '\"x\"')", [frage.id, ID.projB], /row-level security|duplicate key/);
  const b = await als("kundeB", "select count(*)::int c from antworten"); assert.equal(b.rows[0].c, 0);
});

await test("Automatik-Status: Agentur schreibt, Kunde liest nur", async () => {
  await als("claude", "insert into automatik (projekt_id, modus, letzter_lauf) values ($1, 'direkt', now())", [ID.projA]);
  await fehlt("kundeA", "insert into automatik (projekt_id, modus) values ($1, 'direkt')", [ID.projB], /row-level security/);
  const u = await als("kundeA", "update automatik set modus = 'aus' where projekt_id = $1 returning modus", [ID.projA]);
  assert.equal(u.rows.length, 0);
  const l = await als("kundeA", "select modus from automatik"); assert.equal(l.rows[0].modus, "direkt");
});

await test("Kunde kann sich nicht selbst in Projekte eintragen oder Projekte ändern", async () => {
  await fehlt("kundeA", "insert into mitglieder values ($1, $2, 'agentur', 'x')", [ID.projB, ID.kundeA], /permission denied/);
  await fehlt("kundeA", "update projekte set name = 'x'", [], /permission denied/);
});

await test("Kunde löscht eigenen offenen Wunsch", async () => {
  const w = (await als("kundeA", "insert into wuensche (projekt_id, text) values ($1, 'weg damit') returning id", [ID.projA])).rows[0];
  const d = await als("kundeA", "delete from wuensche where id = $1 returning id", [w.id]);
  assert.equal(d.rows.length, 1);
});

await test("Vorlage neuer-kunde.sql legt Projekt, Mitglieder, Automatik und Fragen an – auch bei zweimaligem Ausführen", async () => {
  await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-0000000000d1','kunde@beispiel.de'),
    ('00000000-0000-0000-0000-0000000000d2','du@deine-agentur.de'),('00000000-0000-0000-0000-0000000000d3','automatik@deine-domain.de')`);
  const vorlage = readFileSync(new URL("../supabase/neuer-kunde.sql", import.meta.url), "utf8");
  await db.exec(vorlage); await db.exec(vorlage);
  const r = await db.query(`select (select count(*)::int from mitglieder m join projekte p on p.id = m.projekt_id where p.slug = 'huehnerhof-schneider') m,
    (select count(*)::int from fragen f join projekte p on p.id = f.projekt_id where p.slug = 'huehnerhof-schneider') f,
    (select modus from automatik a join projekte p on p.id = a.projekt_id where p.slug = 'huehnerhof-schneider') modus`);
  assert.deepEqual(r.rows[0], { m: 3, f: 9, modus: "mit_freigabe" });
  // Der neue Kunde sieht nur sein Projekt
  const id = "00000000-0000-0000-0000-0000000000d1";
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`);
  try { assert.deepEqual((await db.query("select slug from projekte")).rows.map(x => x.slug), ["huehnerhof-schneider"]); }
  finally { await db.exec("reset role;"); }
});

await test("Werkzeuge: Art, Details und Wichtigkeit vom Kunden; ungültige Werte abgelehnt", async () => {
  const r = await als("kundeA", `insert into wuensche (projekt_id, text, art, details, prioritaet, anhaenge)
    values ($1, 'Text ändern', 'text', '{"alter_text":"Alt","neuer_text":"Neu","farbe":"#336699"}', 3, '[{"pfad":"x","name":"a.jpg"}]')
    returning art, details, prioritaet, status`, [ID.projA]);
  assert.equal(r.rows[0].art, "text"); assert.equal(r.rows[0].details.neuer_text, "Neu");
  assert.equal(r.rows[0].prioritaet, 3); assert.equal(r.rows[0].status, "offen");
  await fehlt("kundeA", "insert into wuensche (projekt_id, text, art) values ($1, 'x', 'hack')", [ID.projA], /check constraint/);
  await fehlt("kundeA", "insert into wuensche (projekt_id, text, anhaenge) values ($1, 'x', '{}')", [ID.projA], /check constraint/);
  await fehlt("kundeA", "insert into wuensche (projekt_id, text, prioritaet) values ($1, 'x', 9)", [ID.projA], /check constraint/);
});

await test("Foto-Speicher: nur im eigenen Projekt hochladen und lesen, löschen nur die Agentur", async () => {
  const b = await db.query("select public from storage.buckets where id = 'anhaenge'");
  assert.equal(b.rows[0].public, false);
  await als("kundeA", "insert into storage.objects (bucket_id, name) values ('anhaenge', $1)", [`${ID.projA}/1-foto.jpg`]);
  await fehlt("kundeA", "insert into storage.objects (bucket_id, name) values ('anhaenge', $1)", [`${ID.projB}/2-foto.jpg`], /row-level security/);
  await fehlt("kundeA", "insert into storage.objects (bucket_id, name) values ('anhaenge', 'kein-uuid/3.jpg')", [], /row-level security/);
  assert.equal((await als("kundeB", "select count(*)::int c from storage.objects")).rows[0].c, 0);
  assert.equal((await als("kundeA2", "select count(*)::int c from storage.objects")).rows[0].c, 1);
  assert.equal((await als("kundeA", "delete from storage.objects returning id")).rows.length, 0);
  assert.equal((await als("agentur", "delete from storage.objects returning id")).rows.length, 1);
});

console.log(`\nAlle ${n} Tests bestanden.`);
