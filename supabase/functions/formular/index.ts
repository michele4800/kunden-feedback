// Edge Function „formular“: nimmt Anfragen aus Formularen der Websites an (kf-komponenten.js) und legt sie in „anfragen“ ab.
// Öffentlich erreichbar (beim Einrichten „Verify JWT“ AUSschalten) – darum streng: nur bekannte, aktive Projekte, Größengrenzen,
// Falle für Programme (Feld „webseite“, zu schnelles Absenden), höchstens 5 Anfragen je Stunde und Absender, 200 je Tag und Projekt.
// Die IP-Adresse wird nicht gespeichert, nur ein Prüfwert (SHA-256 mit Tages-Salz) für die Begrenzung.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const antwort = (status: number, daten: unknown) =>
  new Response(JSON.stringify(daten), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const ARTEN = new Set(["kontakt", "anfrage", "feedback"]);

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return antwort(405, { fehler: "Nur POST" });
  const roh = await req.text();
  if (roh.length > 20000) return antwort(413, { fehler: "Zu viel Text" });
  let d: Record<string, unknown>;
  try { d = JSON.parse(roh); } catch { return antwort(400, { fehler: "Ungültige Anfrage" }); }

  // Falle: ausgefüllt oder in unter 3 Sekunden abgeschickt → freundlich „ok“, aber nichts speichern
  if (String(d.webseite ?? "") !== "" || Number(d.dauer) < 3000) return antwort(200, { ok: true });

  const felder: Record<string, string> = {};
  const eingang = d.felder && typeof d.felder === "object" ? Object.entries(d.felder as Record<string, unknown>) : [];
  if (!eingang.length || eingang.length > 25) return antwort(400, { fehler: "Bitte das Formular ausfüllen" });
  for (const [k, v] of eingang) {
    const name = String(k).replace(/[^\p{L}\p{N}_ -]/gu, "").slice(0, 60);
    if (name) felder[name] = String(v ?? "").slice(0, 4000);
  }
  if (!Object.values(felder).some(v => v.trim())) return antwort(400, { fehler: "Bitte das Formular ausfüllen" });
  const email = Object.entries(felder).find(([k]) => /mail/i.test(k))?.[1] ?? "";
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return antwort(400, { fehler: "Die E-Mail-Adresse sieht nicht richtig aus" });

  const dienst = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: projekt } = await dienst.from("projekte").select("id, aktiv").eq("slug", String(d.projekt ?? "")).maybeSingle();
  if (!projekt || projekt.aktiv === false) return antwort(404, { fehler: "Unbekannte Website" });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unbekannt";
  const tag = new Date().toISOString().slice(0, 10);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${tag}:${projekt.id}:${ip}`))))
    .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const stunde = new Date(Date.now() - 3600000).toISOString(), heute = new Date(Date.now() - 86400000).toISOString();
  const [{ count: vomAbsender }, { count: vomProjekt }] = await Promise.all([
    dienst.from("anfragen").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("erstellt_am", stunde),
    dienst.from("anfragen").select("id", { count: "exact", head: true }).eq("projekt_id", projekt.id).gte("erstellt_am", heute),
  ]);
  if ((vomAbsender ?? 0) >= 5 || (vomProjekt ?? 0) >= 200) return antwort(429, { fehler: "Gerade sind zu viele Anfragen eingegangen" });

  let seite = "";
  try { const u = new URL(String(d.seite ?? "")); if (/^https?:$/.test(u.protocol)) seite = u.href.slice(0, 500); } catch { /* leer lassen */ }
  const { error } = await dienst.from("anfragen").insert({
    projekt_id: projekt.id, formular: ARTEN.has(String(d.formular)) ? String(d.formular) : "kontakt", felder, seite_url: seite, ip_hash: hash });
  if (error) return antwort(500, { fehler: "Konnte nicht gespeichert werden" });
  return antwort(200, { ok: true });
});
