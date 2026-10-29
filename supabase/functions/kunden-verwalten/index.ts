// Edge Function „kunden-verwalten“: Kunden und ihre Zugänge aus dem Dashboard pflegen. Nur für Plattform-Admins.
// Den service_role-Schlüssel stellt Supabase der Funktion selbst bereit – er steht nirgends im Code.
//
// Anmeldung der Kunden mit Benutzername: „robin“ → Login-Adresse robin@<benutzer_domain> (wie im Portal, siehe konfig.js).
// Eine echte E-Mail-Adresse ist freiwillig und wird nur als Kontakt gespeichert.
//
// Aktionen (POST { aktion, … }):
//   anlegen   – Projekt + erster Kunden-Zugang + Agentur-Mitglieder + Automatik
//   zugaenge  – alle Zugänge eines Projekts mit Benutzername, Kontakt-E-Mail, letzter Anmeldung
//   zugang    – weiteren Kunden-Zugang zu einem Projekt hinzufügen (oder vorhandenen Login zuordnen)
//   passwort  – Passwort eines Kunden setzen (leer = neues erzeugen)
//   aendern   – Anzeigename, Kontakt-E-Mail oder Benutzername eines Kunden ändern
//   entfernen – Kunden aus einem Projekt entfernen; gehört er zu keinem Projekt mehr, wird der Login gelöscht
//   ich       – den eigenen Login ändern (Benutzername, Anzeigename, Passwort) – nur mit dem aktuellen Passwort
// Agentur-Logins (z. B. die Automatik) lassen sich hier bewusst nicht ändern – sonst könnte man den Wächter aussperren.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
class Fehler extends Error { constructor(public status: number, text: string) { super(text); } }
const antwort = (status: number, daten: unknown) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function passwortErzeugen(laenge = 14) {
  const zeichen = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(laenge)), n => zeichen[n % zeichen.length]).join("");
}
const BENUTZER = /^[a-z0-9][a-z0-9._-]{1,39}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN = /^[a-z0-9.-]+\.[a-z]{2,}$/;

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort(405, { fehler: "Nur POST" });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const nutzer = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
    const { data: istAdmin, error } = await nutzer.rpc("ist_admin");
    if (error || istAdmin !== true) throw new Fehler(403, "Nur für Admins");
    const dienst = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    let d: Record<string, unknown>;
    try { d = await req.json(); } catch { throw new Fehler(400, "Ungültige Anfrage"); }
    const text = (k: string, max: number) => String(d[k] ?? "").trim().slice(0, max);
    const domain = text("domain", 100).toLowerCase() || "kunden.example.com";
    if (!DOMAIN.test(domain)) throw new Fehler(400, "Ungültige Benutzer-Domain");
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const ctx = { nutzer, dienst, d, text, domain, token, url };
    const aktionen: Record<string, (c: typeof ctx) => Promise<unknown>> = { anlegen, zugaenge, zugang, passwort, aendern, entfernen, ich };
    const f = aktionen[String(d.aktion)];
    if (!f) throw new Fehler(400, "Unbekannte Aktion");
    return antwort(200, await f(ctx));
  } catch (e) {
    return antwort(e instanceof Fehler ? e.status : 500, { fehler: e instanceof Error ? e.message : String(e) });
  }
});

type Ctx = { nutzer: SupabaseClient; dienst: SupabaseClient; d: Record<string, unknown>; text: (k: string, max: number) => string; domain: string; token: string; url: string };

// Benutzername → Login-Adresse; wer eine echte Adresse als Benutzernamen angibt, meldet sich damit an
function loginAdresse(c: Ctx, feld = "benutzername") {
  const b = c.text(feld, 254).toLowerCase();
  if (b.includes("@")) { if (!EMAIL.test(b)) throw new Fehler(400, "Benutzername ungültig"); return b; }
  if (!BENUTZER.test(b)) throw new Fehler(400, "Benutzername: 2–40 Zeichen, Kleinbuchstaben, Ziffern, Punkt, Bindestrich");
  return `${b}@${c.domain}`;
}
function kontakt(c: Ctx) {
  const e = c.text("email", 254).toLowerCase();
  if (e && !EMAIL.test(e)) throw new Fehler(400, "E-Mail ungültig");
  return e;
}
function neuesPasswort(c: Ctx) {
  const pw = String(c.d.passwort ?? "");
  if (!pw) return passwortErzeugen();
  if (pw.length < 10 || pw.length > 72) throw new Fehler(400, "Passwort: mindestens 10 Zeichen");
  return pw;
}
async function loginSuchen(c: Ctx, adresse: string) {
  // shortcut: durchsucht die ersten 1000 Logins – reicht für eine Agentur, bei Wachstum über eine eigene Suche lösen
  const { data } = await c.dienst.auth.admin.listUsers({ perPage: 1000 });
  return data?.users.find(u => (u.email ?? "").toLowerCase() === adresse) ?? null;
}
// Login anlegen oder vorhandenen nehmen; gibt das Passwort nur bei neuen Logins zurück
async function loginBesorgen(c: Ctx, anzeigename: string) {
  const adresse = loginAdresse(c), email = kontakt(c);
  const vorhanden = await loginSuchen(c, adresse);
  if (vorhanden) return { id: vorhanden.id, adresse, passwort: null as string | null };
  const pw = neuesPasswort(c);
  const { data, error } = await c.dienst.auth.admin.createUser({ email: adresse, password: pw, email_confirm: true,
    user_metadata: { anzeigename, kontakt_email: email } });
  if (error || !data.user) throw new Fehler(400, "Login konnte nicht angelegt werden: " + (error?.message ?? "unbekannt"));
  return { id: data.user.id, adresse, passwort: pw };
}
// Nur Kunden-Logins dürfen geändert werden, und nur, wenn sie zu einem Projekt gehören (Admins sehen alle Projekte)
async function kundeSicherstellen(c: Ctx, userId: string) {
  const { data } = await c.nutzer.from("mitglieder").select("rolle").eq("user_id", userId);
  if (!data?.length) throw new Fehler(404, "Diesen Zugang gibt es in keinem Projekt");
  if (data.some(m => m.rolle !== "kunde")) throw new Fehler(400, "Agentur-Zugänge (z. B. die Automatik) werden hier nicht geändert");
  const { data: admin } = await c.dienst.from("admins").select("user_id").eq("user_id", userId);
  if (admin?.length) throw new Fehler(400, "Admin-Zugänge werden hier nicht geändert");
}

async function anlegen(c: Ctx) {
  const slug = c.text("slug", 60), name = c.text("name", 200), anzeigename = c.text("anzeigename", 120) || name;
  const modus = ["aus", "mit_freigabe", "direkt"].includes(String(c.d.modus)) ? String(c.d.modus) : "mit_freigabe";
  const hosting = ["keins", "github", "sftp", "netlify"].includes(String(c.d.hosting)) ? String(c.d.hosting) : "keins";
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw new Fehler(400, "Kurzname: nur a–z, 0–9 und Bindestrich (2–60 Zeichen)");
  if (!name) throw new Fehler(400, "Name fehlt");
  const { data: schon } = await c.nutzer.from("projekte").select("id").eq("slug", slug);
  if (schon?.length) throw new Fehler(400, "Kurzname ist schon vergeben");
  const login = await loginBesorgen(c, anzeigename);
  const { data: projekt, error: e1 } = await c.nutzer.from("projekte").insert({ slug, name, hosting,
    vorschau_url: c.text("vorschau_url", 500) || null, live_url: c.text("live_url", 500), domain: c.text("domain_kunde", 255) }).select().single();
  if (e1) { if (login.passwort) await c.dienst.auth.admin.deleteUser(login.id); throw new Fehler(400, e1.message); }
  // Alle Agentur-Benutzer (du, die Automatik) aus bestehenden Projekten übernehmen, dazu den Kunden
  const { data: agentur } = await c.nutzer.from("mitglieder").select("user_id, anzeigename").eq("rolle", "agentur");
  const m = new Map<string, { rolle: string; anzeigename: string }>();
  for (const a of agentur ?? []) m.set(a.user_id, { rolle: "agentur", anzeigename: a.anzeigename });
  m.set(login.id, { rolle: "kunde", anzeigename });
  const { error: e2 } = await c.nutzer.from("mitglieder").insert([...m].map(([user_id, x]) => ({ projekt_id: projekt.id, user_id, ...x })));
  const { error: e3 } = await c.nutzer.from("automatik").insert({ projekt_id: projekt.id, modus });
  if (e2 || e3) throw new Fehler(500, "Projekt angelegt, aber: " + (e2 ?? e3)!.message);
  return { projekt, kunde: { login: login.adresse, passwort: login.passwort, vorhanden: !login.passwort } };
}

async function zugaenge(c: Ctx) {
  const projekt_id = c.text("projekt_id", 40);
  const { data: mitglieder, error } = await c.nutzer.from("mitglieder").select("user_id, rolle, anzeigename").eq("projekt_id", projekt_id);
  if (error) throw new Fehler(400, error.message);
  const liste = [];
  for (const m of mitglieder ?? []) {
    const { data } = await c.dienst.auth.admin.getUserById(m.user_id);
    const u = data?.user;
    const adresse = (u?.email ?? "").toLowerCase();
    liste.push({ user_id: m.user_id, rolle: m.rolle, anzeigename: m.anzeigename,
      benutzername: adresse.endsWith("@" + c.domain) ? adresse.slice(0, -(c.domain.length + 1)) : adresse,
      kontakt_email: (u?.user_metadata as Record<string, string> | undefined)?.kontakt_email ?? "",
      zuletzt: u?.last_sign_in_at ?? null });
  }
  return { zugaenge: liste.sort((a, b) => a.rolle.localeCompare(b.rolle) || a.anzeigename.localeCompare(b.anzeigename)) };
}

async function zugang(c: Ctx) {
  const projekt_id = c.text("projekt_id", 40), anzeigename = c.text("anzeigename", 120);
  const { data: p } = await c.nutzer.from("projekte").select("id").eq("id", projekt_id);
  if (!p?.length) throw new Fehler(404, "Projekt nicht gefunden");
  const login = await loginBesorgen(c, anzeigename);
  const { error } = await c.nutzer.from("mitglieder").upsert({ projekt_id, user_id: login.id, rolle: "kunde", anzeigename: anzeigename || login.adresse });
  if (error) throw new Fehler(400, error.message);
  return { login: login.adresse, passwort: login.passwort, vorhanden: !login.passwort };
}

async function passwort(c: Ctx) {
  const user_id = c.text("user_id", 40);
  await kundeSicherstellen(c, user_id);
  const pw = neuesPasswort(c);
  const { error } = await c.dienst.auth.admin.updateUserById(user_id, { password: pw });
  if (error) throw new Fehler(400, error.message);
  return { passwort: pw };
}

async function aendern(c: Ctx) {
  const user_id = c.text("user_id", 40);
  await kundeSicherstellen(c, user_id);
  const patch: Record<string, unknown> = {};
  const { data } = await c.dienst.auth.admin.getUserById(user_id);
  const meta = { ...(data?.user?.user_metadata ?? {}) } as Record<string, unknown>;
  if ("email" in c.d) meta.kontakt_email = kontakt(c);
  if ("anzeigename" in c.d) meta.anzeigename = c.text("anzeigename", 120);
  patch.user_metadata = meta;
  if (c.text("benutzername", 254)) {
    const adresse = loginAdresse(c);
    const anderer = await loginSuchen(c, adresse);
    if (anderer && anderer.id !== user_id) throw new Fehler(400, "Diesen Benutzernamen gibt es schon");
    patch.email = adresse; patch.email_confirm = true;
  }
  const { error } = await c.dienst.auth.admin.updateUserById(user_id, patch);
  if (error) throw new Fehler(400, error.message);
  if ("anzeigename" in c.d && c.text("anzeigename", 120)) {
    const { error: e2 } = await c.nutzer.from("mitglieder").update({ anzeigename: c.text("anzeigename", 120) }).eq("user_id", user_id);
    if (e2) throw new Fehler(400, e2.message);
  }
  return { ok: true };
}

async function entfernen(c: Ctx) {
  const user_id = c.text("user_id", 40), projekt_id = c.text("projekt_id", 40);
  await kundeSicherstellen(c, user_id);
  const { error } = await c.nutzer.from("mitglieder").delete().eq("user_id", user_id).eq("projekt_id", projekt_id);
  if (error) throw new Fehler(400, error.message);
  const { data: rest } = await c.nutzer.from("mitglieder").select("projekt_id").eq("user_id", user_id);
  if (!rest?.length) await c.dienst.auth.admin.deleteUser(user_id);
  return { geloescht: !rest?.length };
}

// Eigenen Login ändern (auch als Admin). Zur Sicherheit nur mit dem aktuellen Passwort – ein offen gelassenes Dashboard reicht nicht.
async function ich(c: Ctx) {
  const { data: u } = await c.nutzer.auth.getUser(c.token);
  const user = u?.user;
  if (!user?.email) throw new Fehler(401, "Nicht angemeldet");
  const pruefen = createClient(c.url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
  const { error: e0 } = await pruefen.auth.signInWithPassword({ email: user.email, password: String(c.d.passwort_alt ?? "") });
  if (e0) throw new Fehler(400, "Das aktuelle Passwort stimmt nicht");
  const patch: Record<string, unknown> = {};
  if (c.text("benutzername", 254)) {
    const adresse = loginAdresse(c);
    if (adresse !== user.email.toLowerCase()) {
      const anderer = await loginSuchen(c, adresse);
      if (anderer && anderer.id !== user.id) throw new Fehler(400, "Diesen Benutzernamen gibt es schon");
      patch.email = adresse; patch.email_confirm = true;
    }
  }
  const neu = String(c.d.passwort_neu ?? "");
  if (neu) {
    if (neu.length < 10 || neu.length > 72) throw new Fehler(400, "Neues Passwort: mindestens 10 Zeichen");
    patch.password = neu;
  }
  if (c.text("anzeigename", 120)) patch.user_metadata = { ...(user.user_metadata ?? {}), anzeigename: c.text("anzeigename", 120) };
  if (Object.keys(patch).length) {
    const { error } = await c.dienst.auth.admin.updateUserById(user.id, patch);
    if (error) throw new Fehler(400, error.message);
  }
  return { login: (patch.email as string) ?? user.email };
}
