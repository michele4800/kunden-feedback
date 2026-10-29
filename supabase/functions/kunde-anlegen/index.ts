// Edge Function „kunde-anlegen“: legt aus dem Dashboard einen neuen Kunden an.
// Nur für Plattform-Admins (Tabelle admins). Den service_role-Schlüssel stellt Supabase der Funktion selbst
// als Umgebungsvariable bereit – er steht nirgends im Code und verlässt den Supabase-Server nie.
//
// Ablauf: Aufrufer prüfen → Kunden-Login anlegen (oder vorhandenen verwenden) → Projekt, Mitglieder und Automatik
// mit den Rechten des AUFRUFERS anlegen (es gelten also die normalen Zugriffsregeln) → Zugangsdaten zurückgeben.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (status: number, daten: unknown) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Passwort ohne leicht verwechselbare Zeichen (0/O, 1/l/I)
function passwort(laenge = 14) {
  const zeichen = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const z = crypto.getRandomValues(new Uint32Array(laenge));
  return Array.from(z, n => zeichen[n % zeichen.length]).join("");
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort(405, { fehler: "Nur POST" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const nutzer = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: istAdmin, error: e0 } = await nutzer.rpc("ist_admin");
  if (e0 || istAdmin !== true) return antwort(403, { fehler: "Nur für Admins" });

  let d: Record<string, unknown>;
  try { d = await req.json(); } catch { return antwort(400, { fehler: "Ungültige Anfrage" }); }
  const text = (k: string, max: number) => String(d[k] ?? "").trim().slice(0, max);
  const slug = text("slug", 60), name = text("name", 200), email = text("email", 254).toLowerCase();
  const anzeigename = text("anzeigename", 120) || name;
  const modus = ["aus", "mit_freigabe", "direkt"].includes(String(d.modus)) ? String(d.modus) : "mit_freigabe";
  const hosting = ["keins", "github", "sftp", "netlify"].includes(String(d.hosting)) ? String(d.hosting) : "keins";
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return antwort(400, { fehler: "Kurzname: nur a–z, 0–9 und Bindestrich (2–60 Zeichen)" });
  if (!name) return antwort(400, { fehler: "Name fehlt" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return antwort(400, { fehler: "E-Mail ungültig" });

  const dienst = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Kunden-Login: neu anlegen oder vorhandenen verwenden (z. B. Kunde mit zweiter Website)
  let userId: string, neuesPasswort: string | null = null;
  const pw = passwort();
  const angelegt = await dienst.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (angelegt.data.user) { userId = angelegt.data.user.id; neuesPasswort = pw; }
  else {
    // shortcut: durchsucht nur die ersten 1000 Benutzer – reicht für eine Agentur, bei Wachstum über die E-Mail filtern
    const { data } = await dienst.auth.admin.listUsers({ perPage: 1000 });
    const da = data?.users.find(u => (u.email ?? "").toLowerCase() === email);
    if (!da) return antwort(400, { fehler: "Login konnte nicht angelegt werden: " + (angelegt.error?.message ?? "unbekannt") });
    userId = da.id;
  }
  const zuruecksetzen = async () => { if (neuesPasswort) await dienst.auth.admin.deleteUser(userId); };

  const entwuerfe = Array.isArray(d.entwuerfe) ? d.entwuerfe : [];
  const { data: projekt, error: e1 } = await nutzer.from("projekte").insert({
    slug, name, hosting, entwuerfe,
    vorschau_url: text("vorschau_url", 500) || null, live_url: text("live_url", 500), domain: text("domain", 255),
  }).select().single();
  if (e1) { await zuruecksetzen(); return antwort(400, { fehler: e1.code === "23505" ? "Kurzname ist schon vergeben" : e1.message }); }

  // Alle Agentur-Benutzer (Michele, Automatik) aus bestehenden Projekten übernehmen, dazu den Kunden
  const { data: agentur } = await nutzer.from("mitglieder").select("user_id, anzeigename").eq("rolle", "agentur");
  const mitglieder = new Map<string, { rolle: string; anzeigename: string }>();
  for (const m of agentur ?? []) mitglieder.set(m.user_id, { rolle: "agentur", anzeigename: m.anzeigename });
  mitglieder.set(userId, { rolle: "kunde", anzeigename });
  const { error: e2 } = await nutzer.from("mitglieder").insert(
    [...mitglieder].map(([user_id, m]) => ({ projekt_id: projekt.id, user_id, ...m })));
  const { error: e3 } = await nutzer.from("automatik").insert({ projekt_id: projekt.id, modus });
  if (e2 || e3) return antwort(500, { fehler: "Projekt angelegt, aber: " + (e2 ?? e3)!.message, projekt });

  return antwort(200, { projekt, kunde: { email, passwort: neuesPasswort, vorhanden: !neuesPasswort } });
});
