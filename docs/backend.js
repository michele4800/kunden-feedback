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
      async dateiHochladen(p, blob, name) {
        const pfad = `${p}/${crypto.randomUUID()}-${sicherName(name)}`;
        ok(await sb.storage.from("anhaenge").upload(pfad, blob, { contentType: blob.type, upsert: false }));
        return { pfad, name: String(name).slice(0, 120), typ: blob.type, groesse: blob.size };
      },
      async dateiUrl(pfad) { const d = ok(await sb.storage.from("anhaenge").createSignedUrl(pfad, 3600)); return d.signedUrl; },
      async automatikSetzen(p, modus) { ok(await sb.from("automatik").upsert({ projekt_id: p, modus })); },
      beobachten(p, fn) {
        const kanal = sb.channel("kf-" + p);
        for (const t of ["wuensche", "kommentare", "antworten", "automatik"])
          kanal.on("postgres_changes", { event: "*", schema: "public", table: t, filter: "projekt_id=eq." + p }, () => fn(t));
        kanal.subscribe();
        return () => sb.removeChannel(kanal);
      },
      // ---- Dashboard (Admin) ----
      async istAdmin() {
        const s = await this.sitzung(); if (!s) return false;
        return ok(await sb.from("admins").select("user_id").eq("user_id", s.user.id)).length > 0;
      },
      // Alles, was der Benutzer sehen darf – für Admins also alle Projekte
      async uebersicht() {
        const [projekte, wuensche, automatik, veroeffentlichungen] = await Promise.all([
          sb.from("projekte").select("*").order("name"),
          sb.from("wuensche").select("id, projekt_id, status, prioritaet, art, text, seite_titel, seite_url, bearbeiter, fortschritt, freigegeben, erstellt_am, geaendert_am")
            .neq("status", "abgelehnt").order("erstellt_am", { ascending: false }).limit(1000),
          sb.from("automatik").select("*"),
          sb.from("veroeffentlichungen").select("*").order("start", { ascending: false }).limit(200),
        ].map(p => p.then(ok)));
        return { projekte, wuensche, automatik, veroeffentlichungen };
      },
      async projektSpeichern(id, patch) { return ok(await sb.from("projekte").update(patch).eq("id", id).select().single()); },
      async zuruecknehmen(id) { ok(await sb.from("veroeffentlichungen").update({ zuruecknehmen: "angefragt" }).eq("id", id)); },
      async kundeAnlegen(daten) {
        const { data, error } = await sb.functions.invoke("kunde-anlegen", { body: daten });
        if (error) {
          let text = error.message;
          try { text = (await error.context.json()).fehler || text; } catch (e) {}
          if (/Failed to send|404/i.test(text)) text = "Die Funktion „kunde-anlegen“ ist in Supabase noch nicht eingerichtet (siehe README).";
          throw new Error(übersetzen(text));
        }
        return data;
      },
      beobachtenAlle(fn) {
        const kanal = sb.channel("kf-alle");
        for (const t of ["projekte", "wuensche", "automatik", "veroeffentlichungen"])
          kanal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => fn(t));
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
      d.veroeffentlichungen = d.veroeffentlichungen || [];  // ältere Demo-Daten
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
        const neuer = { id: neu(), stelle: null, seite_url: "", seite_titel: "", art: "sonstiges", details: {}, anhaenge: [], ...w, autor: ich().id, status: agentur && w.status ? w.status : "offen",
          prioritaet: [1, 2, 3].includes(w.prioritaet) ? w.prioritaet : 2, bearbeiter: "", fortschritt: "", fertig_bis: null, freigegeben: false, erstellt_am: jetzt(), geaendert_am: jetzt() };
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
      async dateiHochladen(p, blob, name) {
        const url = await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
        const pfad = `${p}/${neu()}-${sicherName(name)}`;
        try { const d = JSON.parse(localStorage.getItem("kf-demo-dateien") || "{}"); d[pfad] = url; localStorage.setItem("kf-demo-dateien", JSON.stringify(d)); }
        catch (e) { throw new Error("Im Demo-Modus ist der Speicher voll – bitte ein kleineres Foto wählen."); }
        return { pfad, name: String(name).slice(0, 120), typ: blob.type, groesse: blob.size };
      },
      async dateiUrl(pfad) { try { return JSON.parse(localStorage.getItem("kf-demo-dateien") || "{}")[pfad] || ""; } catch (e) { return ""; } },
      async automatikSetzen(p, modus) { const d = daten(); const a = d.automatik.find(x => x.projekt_id === p); if (a) a.modus = modus; else d.automatik.push({ projekt_id: p, modus }); schreiben(d); },
      beobachten(p, fn) { const f = () => fn("alle"); zuhörer.add(f); return () => zuhörer.delete(f); },
      // ---- Dashboard (Admin) – Demo: „admin“ oder „agentur“ im Namen ----
      async istAdmin() { return /agentur|admin/i.test((ich() || {}).email || ""); },
      async uebersicht() {
        if (!daten().projekte.length) demoBeispiele();
        const d = daten();
        return { projekte: [...d.projekte].sort((a, b) => a.name.localeCompare(b.name)), wuensche: d.wuensche.filter(w => w.status !== "abgelehnt"),
          automatik: d.automatik, veroeffentlichungen: [...d.veroeffentlichungen].sort((a, b) => b.start.localeCompare(a.start)) };
      },
      async projektSpeichern(id, patch) { const d = daten(), p = d.projekte.find(x => x.id === id); Object.assign(p, patch); schreiben(d); return p; },
      async zuruecknehmen(id) { const d = daten(), v = d.veroeffentlichungen.find(x => x.id === id); v.zuruecknehmen = "angefragt"; schreiben(d); },
      async kundeAnlegen(x) {
        if (!/^[a-z0-9-]{2,60}$/.test(x.slug || "")) throw new Error("Kurzname: nur a–z, 0–9 und Bindestrich (2–60 Zeichen)");
        const d = daten();
        if (d.projekte.some(p => p.slug === x.slug)) throw new Error("Kurzname ist schon vergeben");
        const p = { id: neu(), slug: x.slug, name: x.name, vorschau_url: x.vorschau_url || "", live_url: x.live_url || "", domain: x.domain || "",
          hosting: x.hosting || "keins", entwuerfe: x.entwuerfe || [], aktiv: true, erstellt_am: jetzt() };
        d.projekte.push(p);
        d.mitglieder.push({ projekt_id: p.id, user_id: "demo-kunde", rolle: "kunde", anzeigename: x.anzeigename || x.name },
          { projekt_id: p.id, user_id: "demo-agentur", rolle: "agentur", anzeigename: "Agentur (Demo)" });
        d.automatik.push({ projekt_id: p.id, modus: x.modus || "mit_freigabe", letzter_lauf: null, hinweis: "", heute_laeufe: 0, letzter_fehler: "" });
        schreiben(d);
        return { projekt: p, kunde: { email: x.email, passwort: "demo-" + Math.random().toString(36).slice(2, 10), vorhanden: false } };
      },
      beobachtenAlle(fn) { const f = () => fn("alle"); zuhörer.add(f); return () => zuhörer.delete(f); },
    };

    // Zwei Beispielkunden, damit das Demo-Dashboard nicht leer ist
    function demoBeispiele() {
      const d = daten(), vor = min => new Date(Date.now() - min * 60000).toISOString();
      const a = { id: neu(), slug: "huehnerhof-schneider", name: "Hühnerhof Schneider", vorschau_url: "https://michele4800.github.io/huehnerhof-schneider-entwurf/",
        live_url: "", domain: "huehnerhof-schneider.de", hosting: "sftp", aktiv: true, erstellt_am: vor(9000),
        entwuerfe: [1, 2, 3, 4].map(n => ({ name: "Entwurf " + n, url: `https://michele4800.github.io/huehnerhof-schneider-entwurf/${["eroeffnung", "hofbus", "hofgeschichte", "kombi"][n - 1]}/` })) };
      const b = { id: neu(), slug: "baeckerei-muster", name: "Bäckerei Muster", vorschau_url: "", live_url: "https://baeckerei-muster.example", domain: "baeckerei-muster.example",
        hosting: "github", aktiv: true, erstellt_am: vor(3000), entwuerfe: [] };
      d.projekte.push(a, b);
      for (const p of [a, b]) for (const u of [["demo-kunde", "kunde", "Kunde (Demo)"], ["demo-agentur", "agentur", "Agentur (Demo)"]])
        d.mitglieder.push({ projekt_id: p.id, user_id: u[0], rolle: u[1], anzeigename: u[2] });
      d.automatik.push({ projekt_id: a.id, modus: "direkt", letzter_lauf: vor(1), hinweis: "Bereit", heute_laeufe: 3, letzter_fehler: "" },
        { projekt_id: b.id, modus: "mit_freigabe", letzter_lauf: vor(1), hinweis: "Bereit", heute_laeufe: 1, letzter_fehler: "" });
      const w = (p, text, status, prioritaet, min, extra = {}) => d.wuensche.push({ id: neu(), projekt_id: p.id, autor: "demo-kunde", text, status, prioritaet,
        art: "sonstiges", details: {}, anhaenge: [], stelle: null, seite_url: (p.vorschau_url || p.live_url) + "", seite_titel: "Startseite",
        bearbeiter: status === "in_arbeit" ? "Michele (Automatik)" : "", fortschritt: "", fertig_bis: null, freigegeben: false, erstellt_am: vor(min), geaendert_am: vor(min), ...extra });
      w(a, "Tausch das Bild vom Hofladen gegen das neue Foto", "rueckfrage", 2, 300);
      w(a, "Öffnungszeiten am 24.12. nur bis 12 Uhr", "offen", 1, 12);
      w(a, "Das soll mittig sein", "erledigt", 2, 900);
      w(b, "Neue Seite für Torten", "zur_freigabe", 2, 120);
      w(b, "Telefonnummer im Fuß ist falsch", "in_arbeit", 1, 4);
      const v = (p, anlass, status, min, meldung, ziel) => d.veroeffentlichungen.push({ id: neu(), projekt_id: p.id, anlass, status, commit_hash: Math.random().toString(16).slice(2, 9),
        ziel, meldung, dateien: 3, zuruecknehmen: "", start: vor(min), ende: vor(min - 1) });
      v(a, "wunsch", "ok", 880, "Öffnungszeiten mittig", "SFTP ftp.strato.de");
      v(a, "inhalt", "fehler", 60, "Verbindung abgelehnt (Passwort prüfen)", "SFTP ftp.strato.de");
      v(b, "freigabe", "ok", 200, "Neue Startseite", "GitHub Pages");
      schreiben(d);
    }
  }

  let versprechen = null;
  KF.backend = function () {
    if (versprechen) return versprechen;
    const k = window.KF_KONFIG || {};
    // ?kf-demo in der Adresse: Sandbox im Browser, auch wenn ein Server eingetragen ist (zum Vorführen und Testen)
    const sandbox = /[?&]kf-demo(=|&|$)/.test(location.search);
    versprechen = Promise.resolve(!sandbox && k.url && k.schluessel && window.supabase ? supabaseBackend(k) : demoBackend());
    return versprechen;
  };

  // ---------- gemeinsame Helfer ----------
  function sicherName(n) { return String(n || "datei").normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80) || "datei"; }
  KF.ARTEN = {
    text: "Text ändern", foto: "Foto tauschen", design: "Farbe & Design", inhalt: "Neuer Inhalt", fehler: "Fehler melden", sonstiges: "Sonstiges",
  };
  KF.WICHTIG = { 1: "Wichtig", 2: "Normal", 3: "Kann warten" };
  // Foto im Browser verkleinern (max. 2000 px, JPEG) – spart Speicher und Upload-Zeit
  KF.verkleinern = async (datei, max = 2000) => {
    if (!/^image\/(jpeg|png|webp)$/.test(datei.type)) return datei;
    const bild = await createImageBitmap(datei);
    const f = Math.min(1, max / Math.max(bild.width, bild.height));
    if (f === 1 && datei.size < 1500000) return datei;
    const c = document.createElement("canvas"); c.width = Math.round(bild.width * f); c.height = Math.round(bild.height * f);
    c.getContext("2d").drawImage(bild, 0, 0, c.width, c.height);
    return await new Promise(ok => c.toBlob(b => ok(b), "image/jpeg", 0.86));
  };
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
  // „24 px nach rechts · 8 px nach oben · mittig zur Seite (bei 1440 px Bildschirmbreite)“
  KF.verschiebungText = v => {
    const teil = (n, plus, minus) => n ? `${Math.abs(n)} px ${n > 0 ? plus : minus}` : "";
    return [teil(+v.dx || 0, "nach rechts", "nach links"), teil(+v.dy || 0, "nach unten", "nach oben"), v.ausrichtung].filter(Boolean).join(" · ")
      + (v.breite ? ` (bei ${+v.breite} px Bildschirmbreite)` : "");
  };
  // Fortschrittsleiste Eingegangen → In Arbeit → Fertig; der aktuelle Schritt pulsiert (CSS je Oberfläche)
  KF.schritte = (w, klasse) => {
    const stufe = { offen: 1, in_arbeit: 1, zur_freigabe: 2, erledigt: 3 }[w.status];
    if (stufe == null) return "";
    const beiAgentur = w.status === "offen" && w.bearbeiter === "Agentur";
    const namen = ["Eingegangen", beiAgentur ? "Liegt bei der Agentur" : w.status === "offen" ? "Wird angeschaut …" : "In Arbeit", w.status === "zur_freigabe" ? "Wartet auf Freigabe" : "Fertig"];
    return `<ol class="${klasse}" aria-label="Bearbeitungsstand">${namen.map((n, i) =>
      `<li class="${i < stufe ? "fertig" : i === stufe ? "jetzt" : ""}"${i === stufe ? ' aria-current="step"' : ""}>${n}</li>`).join("")}</ol>`;
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
