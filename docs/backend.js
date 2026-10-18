// Backend-Schicht für Widget und Portal. Gleiche Schnittstelle für Supabase und den Demo-Modus.
// KundenFeedback.backend() → Promise<Backend>
(function () {
  const KF = (window.KundenFeedback = window.KundenFeedback || {});
  const STATUS = {
    offen: "Offen", in_arbeit: "In Arbeit", rueckfrage: "Rückfrage", zur_freigabe: "Wartet auf Freigabe",
    erledigt: "Erledigt", abgelehnt: "Nicht umgesetzt",
  };
  KF.STATUS = STATUS;

  // ---------- Supabase ----------
  // „robin“ → „robin@kunden.example.com“; E-Mail-Adressen bleiben unverändert
  const zuEmail = (eingabe, k) => { const e = String(eingabe || "").trim().toLowerCase(); return e.includes("@") ? e : `${e}@${(k && k.benutzer_domain) || "kunden.example.com"}`; };
  KF.zuEmail = zuEmail;

  function supabaseBackend(k) {
    const sb = window.supabase.createClient(k.url, k.schluessel, { auth: { persistSession: true, storageKey: "kf-sitzung" } });
    const ok = ({ data, error }) => { if (error) throw new Error(übersetzen(error.message)); return data; };
    return {
      istDemo: false,
      async sitzung() { const { data } = await sb.auth.getSession(); return data.session ? { user: data.session.user } : null; },
      async anmelden(name, passwort) { ok(await sb.auth.signInWithPassword({ email: zuEmail(name, k), password: passwort })); },
      async abmelden() { await sb.auth.signOut(); },
      async passwortVergessen(name, zurueck) {
        if (!String(name).includes("@")) throw new Error("Für Zugänge mit Benutzernamen setzen wir das Passwort zurück – meldet euch einfach bei uns.");
        ok(await sb.auth.resetPasswordForEmail(name.trim(), { redirectTo: zurueck }));
      },
      async passwortSetzen(passwort) { ok(await sb.auth.updateUser({ password: passwort })); },
      beiAnmeldung(fn) { return sb.auth.onAuthStateChange((ereignis) => fn(ereignis)).data.subscription.unsubscribe; },
      async projekte() { return ok(await sb.from("projekte").select("*").order("name")); },
      async projekt(slug) { return ok(await sb.from("projekte").select("*").eq("slug", slug).maybeSingle()); },
      async mitglieder(p) { return ok(await sb.from("mitglieder").select("user_id, rolle, anzeigename").eq("projekt_id", p)); },
      async wuensche(p) { return ok(await sb.from("wuensche").select("*").eq("projekt_id", p).order("erstellt_am", { ascending: false })); },
      async wunschAnlegen(w) { return ok(await sb.from("wuensche").insert(w).select().single()); },
      async wunschAendern(id, patch) { return ok(await sb.from("wuensche").update(patch).eq("id", id).select().single()); },
      async wunschLoeschen(id) { ok(await sb.from("wuensche").delete().eq("id", id)); },
      async kommentare(p) { return ok(await sb.from("kommentare").select("*").eq("projekt_id", p).order("erstellt_am")); },
      async kommentarAnlegen(wunsch_id, text) { return ok(await sb.from("kommentare").insert({ wunsch_id, text }).select().single()); },
      async fragen(p) { return ok(await sb.from("fragen").select("*").eq("projekt_id", p).order("reihenfolge")); },
      async antworten(p) { return ok(await sb.from("antworten").select("*").eq("projekt_id", p)); },
      async antwortSpeichern(frage_id, projekt_id, wert) { ok(await sb.from("antworten").upsert({ frage_id, projekt_id, wert })); },
      async automatik(p) { return ok(await sb.from("automatik").select("*").eq("projekt_id", p).maybeSingle()); },
      async automatikSetzen(p, modus) { ok(await sb.from("automatik").upsert({ projekt_id: p, modus })); },
      beobachten(p, fn) {
        const kanal = sb.channel("kf-" + p);
        for (const t of ["wuensche", "kommentare", "antworten", "automatik"])
          kanal.on("postgres_changes", { event: "*", schema: "public", table: t, filter: "projekt_id=eq." + p }, () => fn(t));
        kanal.subscribe();
        return () => sb.removeChannel(kanal);
      },
    };
  }

  function übersetzen(m) {
    if (/Invalid login credentials/i.test(m)) return "Benutzername bzw. E-Mail oder Passwort stimmt nicht.";
    if (/Email not confirmed/i.test(m)) return "Die E-Mail-Adresse ist noch nicht bestätigt.";
    if (/row-level security|permission denied/i.test(m)) return "Dafür fehlt die Berechtigung.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Keine Verbindung zum Server. Bitte später erneut versuchen.";
    return m;
  }

  // ---------- Demo (nur dieser Browser) ----------
  function demoBackend() {
    const K = "kf-demo", S = "kf-demo-sitzung";
    const zuhörer = new Set();
    const lesen = () => { try { return JSON.parse(localStorage.getItem(K)); } catch (e) { return null; } };
    const schreiben = d => { try { localStorage.setItem(K, JSON.stringify(d)); } catch (e) {} zuhörer.forEach(f => f()); };
    const neu = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
    const jetzt = () => new Date().toISOString();
    function daten() {
      let d = lesen();
      if (!d) {
        d = { projekte: [], mitglieder: [], wuensche: [], kommentare: [], fragen: [], antworten: [], automatik: [] };
        schreiben(d);
      }
      return d;
    }
    const sitzung = () => { try { return JSON.parse(localStorage.getItem(S)); } catch (e) { return null; } };
    const ich = () => (sitzung() || {}).user;
    function sicherstellen(slug) {
      const d = daten();
      let p = d.projekte.find(x => x.slug === slug);
      if (!p) {
        p = { id: neu(), slug, name: slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()), vorschau_url: "", erstellt_am: jetzt() };
        d.projekte.push(p);
        d.fragen.push({ id: neu(), projekt_id: p.id, reihenfolge: 1, frage: "Welcher Stil gefällt euch?", hilfe: "Demo-Frage", art: "auswahl", optionen: ["Entwurf 1", "Entwurf 2", "Entwurf 3", "Mischung"] });
        d.automatik.push({ projekt_id: p.id, modus: "direkt", letzter_lauf: null, hinweis: "Demo – kein Wächter aktiv" });
        schreiben(d);
      }
      for (const u of [{ id: "demo-kunde", rolle: "kunde", anzeigename: "Kunde (Demo)" }, { id: "demo-agentur", rolle: "agentur", anzeigename: "Agentur (Demo)" }])
        if (!d.mitglieder.find(m => m.projekt_id === p.id && m.user_id === u.id)) { d.mitglieder.push({ projekt_id: p.id, user_id: u.id, rolle: u.rolle, anzeigename: u.anzeigename }); schreiben(d); }
      return p;
    }
    const rolleVon = p => ((daten().mitglieder.find(m => m.projekt_id === p && m.user_id === (ich() || {}).id)) || {}).rolle;
    window.addEventListener("storage", e => { if (e.key === K) zuhörer.forEach(f => f()); });
    return {
      istDemo: true,
      async sitzung() { return sitzung(); },
      async anmelden(email) {
        const agentur = /agentur|admin/i.test(email);
        localStorage.setItem(S, JSON.stringify({ user: { id: agentur ? "demo-agentur" : "demo-kunde", email } }));
        zuhörer.forEach(f => f());
      },
      async abmelden() { localStorage.removeItem(S); zuhörer.forEach(f => f()); },
      async passwortVergessen() {}, async passwortSetzen() {},
      beiAnmeldung(fn) { const f = () => fn("DEMO"); zuhörer.add(f); return () => zuhörer.delete(f); },
      async projekte() { return daten().projekte; },
      async projekt(slug) { return sicherstellen(slug); },
      async mitglieder(p) { return daten().mitglieder.filter(m => m.projekt_id === p); },
      async wuensche(p) { return daten().wuensche.filter(w => w.projekt_id === p).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am)); },
      async wunschAnlegen(w) {
        const d = daten(), agentur = rolleVon(w.projekt_id) === "agentur";
        const neuer = { id: neu(), stelle: null, seite_url: "", seite_titel: "", ...w, autor: ich().id, status: agentur && w.status ? w.status : "offen",
          prioritaet: 2, bearbeiter: "", fortschritt: "", fertig_bis: null, freigegeben: false, erstellt_am: jetzt(), geaendert_am: jetzt() };
        d.wuensche.push(neuer); schreiben(d); return neuer;
      },
      async wunschAendern(id, patch) {
        const d = daten(), w = d.wuensche.find(x => x.id === id);
        if (rolleVon(w.projekt_id) !== "agentur") {
          if (w.autor !== ich().id) throw new Error("Nur eigene Wünsche können geändert werden.");
          if (!["offen", "rueckfrage"].includes(w.status)) throw new Error("Dieser Wunsch ist bereits in Bearbeitung.");
          if (["status", "prioritaet", "bearbeiter", "fortschritt", "fertig_bis", "freigegeben"].some(k => k in patch)) throw new Error("Status und Bearbeitung setzt die Agentur.");
        }
        Object.assign(w, patch, { geaendert_am: jetzt() }); schreiben(d); return w;
      },
      async wunschLoeschen(id) { const d = daten(); d.wuensche = d.wuensche.filter(w => w.id !== id); d.kommentare = d.kommentare.filter(k => k.wunsch_id !== id); schreiben(d); },
      async kommentare(p) { return daten().kommentare.filter(k => k.projekt_id === p); },
      async kommentarAnlegen(wunsch_id, text) {
        const d = daten(), w = d.wuensche.find(x => x.id === wunsch_id);
        const k = { id: neu(), wunsch_id, projekt_id: w.projekt_id, autor: ich().id, text, erstellt_am: jetzt() };
        d.kommentare.push(k); w.geaendert_am = jetzt(); schreiben(d); return k;
      },
      async fragen(p) { return daten().fragen.filter(f => f.projekt_id === p).sort((a, b) => a.reihenfolge - b.reihenfolge); },
      async antworten(p) { return daten().antworten.filter(a => a.projekt_id === p); },
      async antwortSpeichern(frage_id, projekt_id, wert) {
        const d = daten(); d.antworten = d.antworten.filter(a => a.frage_id !== frage_id);
        d.antworten.push({ frage_id, projekt_id, wert, autor: ich().id, geaendert_am: jetzt() }); schreiben(d);
      },
      async automatik(p) { return daten().automatik.find(a => a.projekt_id === p) || null; },
      async automatikSetzen(p, modus) { const d = daten(); const a = d.automatik.find(x => x.projekt_id === p); if (a) a.modus = modus; else d.automatik.push({ projekt_id: p, modus }); schreiben(d); },
      beobachten(p, fn) { const f = () => fn("alle"); zuhörer.add(f); return () => zuhörer.delete(f); },
    };
  }

  let versprechen = null;
  KF.backend = function () {
    if (versprechen) return versprechen;
    const k = window.KF_KONFIG || {};
    versprechen = Promise.resolve(k.url && k.schluessel && window.supabase ? supabaseBackend(k) : demoBackend());
    return versprechen;
  };

  // ---------- gemeinsame Helfer ----------
  KF.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  KF.zeit = iso => iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  // „voraussichtlich fertig in ca. 20 Min.“ bzw. „… heute gegen 15:30“
  KF.restzeit = iso => {
    if (!iso) return "";
    const min = Math.round((new Date(iso) - Date.now()) / 60000);
    if (min <= 0) return "sollte gleich fertig sein";
    if (min < 60) return `voraussichtlich fertig in ca. ${min} Min.`;
    const d = new Date(iso);
    return `voraussichtlich fertig ${d.toDateString() === new Date().toDateString() ? "heute" : "am " + d.toLocaleDateString("de-DE")} gegen ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
  };
  KF.waechterText = a => {
    if (!a || a.modus === "aus") return { aktiv: false, text: "Automatik aus – die Agentur bearbeitet eure Wünsche." };
    if (!a.letzter_lauf) return { aktiv: false, text: "Automatik eingerichtet, aber noch nicht gestartet." };
    const min = Math.round((Date.now() - new Date(a.letzter_lauf)) / 60000);
    return min <= 5
      ? { aktiv: true, text: `Automatik aktiv – zuletzt geprüft ${min < 1 ? "gerade eben" : "vor " + min + " Min."}` }
      : { aktiv: false, text: `Automatik pausiert (zuletzt vor ${min} Min.) – die Agentur übernimmt.` };
  };
})();
