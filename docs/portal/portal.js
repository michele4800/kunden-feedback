// Kunden-Portal: alle Wünsche eines Projekts, Fragen, Freigabe und Export.
(async function () {
  const laden = src => new Promise((ok, fehler) => { const s = document.createElement("script"); s.src = src + "?v=20261019a"; s.onload = ok; s.onerror = fehler; document.head.appendChild(s); });
  if ((window.KF_KONFIG || {}).url) await laden("../vendor/supabase.js");
  await laden("../backend.js");
  const KF = window.KundenFeedback, esc = KF.esc, be = await KF.backend();
  const inhalt = document.getElementById("inhalt"), kopfRechts = document.getElementById("kopf-rechts"), titel = document.getElementById("titel");
  const params = new URLSearchParams(location.search);
  const AKTIV = ["offen", "in_arbeit", "rueckfrage", "zur_freigabe"];
  let projekt = null, rolle = null, ich = null, namen = {}, reiter = "wuensche", stopp = null;
  const filter = { status: "aktiv", seite: "", suche: "" };

  const tippt = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && inhalt.contains(a); };

  // ---------- Anmeldung ----------
  function anmeldung(meldung = "") {
    kopfRechts.innerHTML = ""; titel.textContent = "Wünsche & Änderungen";
    inhalt.innerHTML = `<div class="karte anmelden"><h2 style="margin-top:0">Anmelden</h2>
      ${be.istDemo ? `<p class="demo">Demo-Modus: beliebiger Name und Passwort. Mit „agentur“ im Namen meldest du dich als Agentur an.</p>` : ""}
      <form id="login"><label for="email">Benutzername oder E-Mail</label><input id="email" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        <label for="pw">Passwort</label><input id="pw" type="password" autocomplete="current-password" required>
        <div class="zeile"><button class="btn">Anmelden</button><button type="button" class="btn hell" id="vergessen">Passwort vergessen?</button></div>
        <p class="fehler" role="alert">${esc(meldung)}</p></form></div>`;
    const f = document.getElementById("login");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      try { await be.anmelden(f.email.value.trim(), f.pw.value); await start(); }
      catch (err) { f.querySelector(".fehler").textContent = err.message; }
    });
    document.getElementById("vergessen").addEventListener("click", async () => {
      const email = f.email.value.trim(), m = f.querySelector(".fehler");
      if (!email) { m.textContent = "Bitte zuerst Benutzername oder E-Mail eintragen."; return; }
      try { await be.passwortVergessen(email, location.origin + location.pathname + "?passwort=neu"); m.textContent = "Wenn die Adresse bei uns hinterlegt ist, kommt gleich eine E-Mail zum Zurücksetzen."; }
      catch (err) { m.textContent = err.message; }
    });
    f.email.focus();
  }

  function passwortNeu() {
    inhalt.innerHTML = `<div class="karte anmelden"><h2 style="margin-top:0">Neues Passwort festlegen</h2>
      <form id="neu"><label for="pw1">Neues Passwort (mindestens 10 Zeichen)</label><input id="pw1" type="password" minlength="10" autocomplete="new-password" required>
      <div class="zeile"><button class="btn">Speichern</button></div><p class="fehler" role="alert"></p></form></div>`;
    const f = document.getElementById("neu");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      if (f.pw1.value.length < 10) { f.querySelector(".fehler").textContent = "Bitte mindestens 10 Zeichen."; return; }
      try { await be.passwortSetzen(f.pw1.value); history.replaceState(null, "", location.pathname); await start(); }
      catch (err) { f.querySelector(".fehler").textContent = err.message; }
    });
  }

  // ---------- Start ----------
  async function start() {
    const s = await be.sitzung();
    if (!s) return params.get("passwort") === "neu" ? anmeldung("Der Link ist abgelaufen. Bitte erneut „Passwort vergessen?“ wählen.") : anmeldung();
    ich = s.user;
    if (params.get("passwort") === "neu") return passwortNeu();
    const slug = params.get("projekt");
    projekt = slug ? await be.projekt(slug) : null;
    if (!projekt) {
      const alle = await be.projekte();
      if (alle.length === 1) projekt = alle[0];
      else return auswahl(alle);
    }
    if (stopp) stopp();
    stopp = be.beobachten(projekt.id, () => { if (!tippt()) zeichnen(); });
    await zeichnen();
  }

  function auswahl(alle) {
    kopf();
    inhalt.innerHTML = `<h2>Projekte</h2>${alle.length ? `<ul class="liste">${alle.map(p => `<li class="w"><a href="?projekt=${encodeURIComponent(p.slug)}">${esc(p.name)}</a></li>`).join("")}</ul>` : `<p class="leer">Für dieses Konto ist noch kein Projekt freigegeben.</p>`}`;
  }

  function kopf() {
    kopfRechts.innerHTML = `<span style="margin-right:12px;font-size:14px">${esc(namen[ich.id] || ich.email)}</span><button class="btn hell klein" id="abmelden">Abmelden</button>`;
    document.getElementById("abmelden").addEventListener("click", async () => { if (stopp) stopp(); stopp = null; projekt = null; await be.abmelden(); anmeldung(); });
  }

  // ---------- Hauptansicht ----------
  async function zeichnen() {
    if (!projekt || !(await be.sitzung())) return anmeldung();
    const [mitglieder, wuensche, kommentare, fragen, antworten, auto] = await Promise.all([
      be.mitglieder(projekt.id), be.wuensche(projekt.id), be.kommentare(projekt.id), be.fragen(projekt.id), be.antworten(projekt.id), be.automatik(projekt.id)]);
    namen = Object.fromEntries(mitglieder.map(m => [m.user_id, m.anzeigename || (m.rolle === "agentur" ? "Agentur" : "Kunde")]));
    rolle = (mitglieder.find(m => m.user_id === ich.id) || {}).rolle;
    titel.innerHTML = `${esc(projekt.name)}<small>Wünsche &amp; Änderungen</small>`;
    kopf();
    const w8 = KF.waechterText(auto);
    const offen = wuensche.filter(w => AKTIV.includes(w.status)).length;
    const reiterListe = [["wuensche", `Wünsche (${offen} offen)`], ["fragen", `Fragen (${antworten.length}/${fragen.length})`], ["neu", "Neuer Wunsch"]];
    if (rolle === "agentur") reiterListe.push(["export", "Export für Claude"], ["einstellungen", "Automatik"]);
    const scroll = scrollY;
    inhalt.innerHTML = `${be.istDemo ? `<p class="demo">Demo-Modus: Daten bleiben nur in diesem Browser.</p>` : ""}
      <p class="waechter"><span class="punkt${w8.aktiv ? " an" : ""}"></span>${esc(w8.text)}</p>
      <div class="reiter" role="tablist">${reiterListe.map(([id, t]) => `<button role="tab" aria-selected="${id === reiter}" data-reiter="${id}">${t}</button>`).join("")}</div>
      <section role="tabpanel">${{ wuensche: () => wunschListe(wuensche, kommentare), fragen: () => fragenAnsicht(fragen, antworten), neu: neuAnsicht,
        export: () => exportAnsicht(wuensche, kommentare, fragen, antworten), einstellungen: () => einstellungen(auto) }[reiter]()}</section>`;
    scrollTo(0, scroll);
    for (const a of inhalt.querySelectorAll("[data-anhang]")) { try { const u = await be.dateiUrl(a.dataset.anhang); a.href = u; a.querySelector("img").src = u; } catch (e) {} }
  }

  function wunschListe(wuensche, kommentare) {
    const seiten = [...new Set(wuensche.map(w => w.seite_titel || w.seite_url).filter(Boolean))];
    const liste = wuensche.filter(w =>
      (filter.status === "alle" || (filter.status === "aktiv" ? AKTIV.includes(w.status) : w.status === filter.status)) &&
      (!filter.seite || (w.seite_titel || w.seite_url) === filter.seite) &&
      (!filter.suche || w.text.toLowerCase().includes(filter.suche.toLowerCase())));
    return `<div class="filter">
        <div><label for="f-status">Status</label><select id="f-status" data-filter="status">
          ${[["aktiv", "Alle aktiven"], ["alle", "Alle"], ...Object.entries(KF.STATUS)].map(([v, t]) => `<option value="${v}"${filter.status === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        <div><label for="f-seite">Seite</label><select id="f-seite" data-filter="seite"><option value="">Alle Seiten</option>
          ${seiten.map(s => `<option${filter.seite === s ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
        <div><label for="f-suche">Suchen</label><input id="f-suche" type="search" data-filter="suche" value="${esc(filter.suche)}"></div>
      </div>
      <ul class="liste">${liste.length ? liste.map(w => wunsch(w, kommentare.filter(k => k.wunsch_id === w.id))).join("") : `<li class="leer">Keine Wünsche für diese Auswahl.</li>`}</ul>`;
  }

  function wunsch(w, ks) {
    const ag = rolle === "agentur";
    const arbeit = w.status === "in_arbeit"
      ? `<div class="arbeit">${esc(w.bearbeiter || "Agentur")} arbeitet daran${w.fertig_bis ? " – " + esc(KF.restzeit(w.fertig_bis)) : ""}${w.fortschritt ? "<br>" + esc(w.fortschritt) : ""}</div>`
      : w.fortschritt ? `<div class="arbeit">${esc(w.fortschritt)}</div>` : "";
    const stand = KF.schritte(w, "schritte");
    const seite = w.seite_url ? `<a href="${esc(w.seite_url)}" target="_blank" rel="noopener">${esc(w.seite_titel || w.seite_url)}<span class="nur-vorleser"> (neues Fenster)</span></a>` : "allgemein";
    return `<li class="w" id="w-${w.id}">
      <div class="w-kopf"><span class="status ${w.status}">${esc(KF.STATUS[w.status] || w.status)}${w.status === "zur_freigabe" && w.freigegeben ? " – freigegeben" : ""}</span>
        <span class="meta">${esc(namen[w.autor] || "")}, ${esc(KF.zeit(w.erstellt_am))}</span></div>
      ${w.art && w.art !== "sonstiges" ? `<span class="etikett">${esc(KF.ARTEN[w.art] || w.art)}</span>` : ""}${w.prioritaet === 1 ? `<span class="etikett wichtig">Wichtig</span>` : w.prioritaet === 3 ? `<span class="etikett">Kann warten</span>` : ""}
      <p class="text">${esc(w.text)}</p>
      ${(w.details || {}).alter_text != null ? `<div class="box"><b>Textänderung</b><br><del>${esc(w.details.alter_text)}</del><br>→ <ins>${esc(w.details.neuer_text)}</ins></div>` : ""}
      ${(w.details || {}).farbe ? `<div class="box"><span class="tupfer" style="background:${esc(w.details.farbe)}"></span>Farbe ${esc(w.details.farbe)}</div>` : ""}
      ${(w.anhaenge || []).length ? `<div class="fotos">${w.anhaenge.map(a => `<a class="foto" data-anhang="${esc(a.pfad)}" target="_blank" rel="noopener"><img alt="${esc(a.name)}"></a>`).join("")}</div>` : ""}
      ${stand}${arbeit}
      <div class="meta">Seite: ${seite}${w.stelle ? ` · Stelle: „${esc(w.stelle.text || w.stelle.selektor)}“` : ""}
        ${(w.autor === ich.id && w.status === "offen") || rolle === "agentur" ? ` · <button class="btn hell klein" data-aktion="loeschen" data-id="${w.id}">Löschen<span class="nur-vorleser"> – Wunsch „${esc(w.text.slice(0, 40))}“</span></button>` : ""}</div>
      ${ag ? `<div class="agentur">
        <div><label for="s-${w.id}">Status</label><select id="s-${w.id}" data-feld="status" data-id="${w.id}">${Object.entries(KF.STATUS).map(([v, t]) => `<option value="${v}"${w.status === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        <div><label for="b-${w.id}">Bearbeiter</label><input id="b-${w.id}" type="text" data-feld="bearbeiter" data-id="${w.id}" value="${esc(w.bearbeiter)}"></div>
        <div><label for="d-${w.id}">Fertig in</label><select id="d-${w.id}" data-feld="dauer" data-id="${w.id}"><option value="">${w.fertig_bis ? esc(KF.zeit(w.fertig_bis)) : "–"}</option><option value="30">30 Min.</option><option value="120">2 Std.</option><option value="480">heute</option><option value="1440">1 Tag</option><option value="4320">3 Tage</option></select></div>
        <div><label for="p-${w.id}">Stand für den Kunden</label><input id="p-${w.id}" type="text" maxlength="500" data-feld="fortschritt" data-id="${w.id}" value="${esc(w.fortschritt)}"></div>
        ${w.status === "zur_freigabe" && !w.freigegeben ? `<div style="grid-column:1/-1"><button class="btn" data-aktion="freigeben" data-id="${w.id}">Umsetzung freigeben und veröffentlichen</button></div>` : ""}
      </div>` : ""}
      <div class="verlauf">${ks.map(k => `<div><b>${esc(namen[k.autor] || "")}</b> <small>${esc(KF.zeit(k.erstellt_am))}</small><br>${esc(k.text)}</div>`).join("")}
        <form data-form="kommentar" data-id="${w.id}"><label class="nur-vorleser" for="k-${w.id}">Antwort</label>
          <input id="k-${w.id}" type="text" maxlength="5000" placeholder="${w.status === "rueckfrage" ? "Rückfrage beantworten …" : "Antworten …"}"><button class="btn klein">Senden</button></form></div>
    </li>`;
  }

  function fragenAnsicht(fragen, antworten) {
    if (!fragen.length) return `<p class="leer">Für dieses Projekt sind keine Fragen hinterlegt.</p>`;
    return `<p class="hinweis">Antworten werden sofort gespeichert und sind für alle im Projekt sichtbar.</p>` + fragen.map(f => {
      const a = antworten.find(x => x.frage_id === f.id), wert = a ? a.wert : f.art === "mehrfach" ? [] : "";
      const opt = Array.isArray(f.optionen) ? f.optionen : [];
      let feld;
      if (f.art === "auswahl") feld = `<div class="optionen" role="radiogroup" aria-labelledby="fr-${f.id}">${opt.map(o => `<label><input type="radio" name="fr-${f.id}" value="${esc(o)}" data-frage="${f.id}"${wert === o ? " checked" : ""}>${esc(o)}</label>`).join("")}</div>`;
      else if (f.art === "mehrfach") feld = `<div class="optionen" role="group" aria-labelledby="fr-${f.id}">${opt.map(o => `<label><input type="checkbox" value="${esc(o)}" data-frage="${f.id}" data-mehrfach${(wert || []).includes(o) ? " checked" : ""}>${esc(o)}</label>`).join("")}</div>`;
      else feld = `<textarea aria-labelledby="fr-${f.id}" data-frage="${f.id}">${esc(wert)}</textarea>`;
      return `<div class="frage karte"><p id="fr-${f.id}" style="font-weight:700;margin:0 0 4px">${esc(f.frage)}</p>${f.hilfe ? `<p class="hinweis" style="margin:0 0 8px">${esc(f.hilfe)}</p>` : ""}${feld}
        ${a ? `<p class="wer">Zuletzt: ${esc(namen[a.autor] || "")}, ${esc(KF.zeit(a.geaendert_am))}</p>` : ""}</div>`;
    }).join("");
  }

  function neuAnsicht() {
    return `<form class="karte" data-form="neu"><label for="n-text" style="margin-top:0">Was soll anders sein?</label>
      <textarea id="n-text" maxlength="5000" required placeholder="Am besten direkt auf der Website über den Knopf „Wünsche“ – dann ist die Seite gleich dabei. Hier geht es für allgemeine Wünsche."></textarea>
      <label for="n-seite">Seite (optional)</label><input id="n-seite" type="text" placeholder="z. B. Startseite">
      <div class="zeile"><button class="btn">Wunsch absenden</button></div><p class="fehler" role="alert"></p></form>`;
  }

  function einstellungen(auto) {
    const m = (auto || {}).modus || "aus";
    return `<div class="karte"><h2 style="margin-top:0">Automatik (Wächter)</h2>
      <p class="hinweis">Der Wächter läuft auf dem Rechner der Agentur und lässt neue Wünsche automatisch von Claude umsetzen.</p>
      ${[["aus", "Aus – die Agentur bearbeitet alles selbst"], ["mit_freigabe", "Mit Freigabe – Claude setzt um, veröffentlicht wird erst nach eurer Freigabe"], ["direkt", "Direkt – Claude setzt um und aktualisiert die Vorschau sofort"]]
        .map(([v, t]) => `<label style="font-weight:400;display:flex;gap:8px;align-items:center"><input type="radio" name="modus" value="${v}" data-modus${m === v ? " checked" : ""}>${t}</label>`).join("")}
      ${auto && auto.hinweis ? `<p class="hinweis">Letzte Meldung des Wächters: ${esc(auto.hinweis)}</p>` : ""}</div>`;
  }

  // Export als Markdown – genau das, was Claude zum Umsetzen braucht
  function markdown(wuensche, kommentare, fragen, antworten) {
    const z = [`# Wünsche – ${projekt.name}`, `Stand: ${new Date().toLocaleString("de-DE")}`, "", "## Antworten"];
    for (const f of fragen) { const a = antworten.find(x => x.frage_id === f.id); z.push(`- **${f.frage}** ${a ? (Array.isArray(a.wert) ? a.wert.join(", ") : a.wert) : "_(offen)_"}`); }
    z.push("", "## Offene Wünsche");
    const aktiv = wuensche.filter(w => AKTIV.includes(w.status));
    if (!aktiv.length) z.push("_keine_");
    for (const w of aktiv) {
      z.push("", `### ${w.seite_titel || "Allgemein"} – ${KF.STATUS[w.status]} (id ${w.id})`, `- Art: ${KF.ARTEN[w.art] || "Sonstiges"} · Wichtigkeit: ${KF.WICHTIG[w.prioritaet] || "Normal"}`, `- Seite: ${w.seite_url || "–"}`);
      const d = w.details || {};
      if (d.alter_text != null) z.push(`- Text alt: „${d.alter_text}“`, `- Text neu: „${d.neuer_text}“`);
      if (d.farbe) z.push(`- Farbe: ${d.farbe}`);
      if ((w.anhaenge || []).length) z.push(`- Fotos: ${w.anhaenge.map(a => a.name).join(", ")} (im Portal ansehen)`);
      if (w.stelle) z.push(`- Stelle: \`${w.stelle.selektor}\` („${w.stelle.text || ""}“)`);
      z.push(`- Von: ${namen[w.autor] || ""}, ${KF.zeit(w.erstellt_am)}`, "", "> " + w.text.replace(/\n/g, "\n> "));
      for (const k of kommentare.filter(k => k.wunsch_id === w.id)) z.push(`- ${namen[k.autor] || ""}: ${k.text}`);
    }
    return z.join("\n");
  }
  function exportAnsicht(wuensche, kommentare, fragen, antworten) {
    const md = markdown(wuensche, kommentare, fragen, antworten);
    return `<div class="karte"><p class="hinweis" style="margin-top:0">Diesen Text an Claude geben – er enthält alle offenen Wünsche mit Seite, markierter Stelle und Verlauf.</p>
      <div class="zeile" style="margin:0 0 12px"><button class="btn" data-aktion="kopieren">Kopieren</button><button class="btn hell" data-aktion="md">Als .md herunterladen</button><button class="btn hell" data-aktion="json">Als JSON herunterladen</button></div>
      <pre class="export" id="export">${esc(md)}</pre></div>`;
  }
  function herunterladen(name, inhalt, typ) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([inhalt], { type: typ })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Ereignisse ----------
  inhalt.addEventListener("click", async e => {
    const t = e.target.closest("[data-reiter],[data-aktion]");
    if (!t) return;
    try {
      if (t.dataset.reiter) { reiter = t.dataset.reiter; return zeichnen(); }
      const a = t.dataset.aktion, id = t.dataset.id;
      if (a === "loeschen" && confirm("Diesen Wunsch löschen?")) { await be.wunschLoeschen(id); await zeichnen(); }
      if (a === "freigeben") { await be.wunschAendern(id, { freigegeben: true, fortschritt: "Freigegeben – wird veröffentlicht" }); await zeichnen(); }
      if (["kopieren", "md", "json"].includes(a)) {
        const [w, k, f, an] = await Promise.all([be.wuensche(projekt.id), be.kommentare(projekt.id), be.fragen(projekt.id), be.antworten(projekt.id)]);
        if (a === "kopieren") { await navigator.clipboard.writeText(markdown(w, k, f, an)); t.textContent = "Kopiert ✓"; }
        if (a === "md") herunterladen(`wuensche-${projekt.slug}.md`, markdown(w, k, f, an), "text/markdown");
        if (a === "json") herunterladen(`wuensche-${projekt.slug}.json`, JSON.stringify({ projekt, wuensche: w, kommentare: k, fragen: f, antworten: an, namen }, null, 2), "application/json");
      }
    } catch (err) { alert(err.message); }
  });

  inhalt.addEventListener("change", async e => {
    const t = e.target;
    try {
      if (t.dataset.filter) { filter[t.dataset.filter] = t.value; return zeichnen(); }
      if (t.dataset.feld) {
        const patch = t.dataset.feld === "dauer"
          ? (t.value ? { fertig_bis: new Date(Date.now() + t.value * 60000).toISOString() } : null)
          : { [t.dataset.feld]: t.value };
        if (patch) { t.blur(); await be.wunschAendern(t.dataset.id, patch); await zeichnen(); }
      }
      if (t.dataset.frage) {
        const id = t.dataset.frage;
        const wert = "mehrfach" in t.dataset ? [...inhalt.querySelectorAll(`[data-frage="${id}"]:checked`)].map(x => x.value) : t.value;
        await be.antwortSpeichern(id, projekt.id, wert);
      }
      if ("modus" in t.dataset) await be.automatikSetzen(projekt.id, t.value);
    } catch (err) { alert(err.message); zeichnen(); }
  });
  // Freitext-Antworten beim Verlassen des Feldes speichern
  inhalt.addEventListener("focusout", async e => {
    const t = e.target;
    if (t.tagName === "TEXTAREA" && t.dataset.frage) { try { await be.antwortSpeichern(t.dataset.frage, projekt.id, t.value); } catch (err) { alert(err.message); } }
  });

  inhalt.addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.dataset.form === "kommentar") {
        const feld = f.querySelector("input"); if (!feld.value.trim()) return;
        await be.kommentarAnlegen(f.dataset.id, feld.value.trim()); feld.value = ""; await zeichnen();
      }
      if (f.dataset.form === "neu") {
        const text = f.querySelector("#n-text").value.trim();
        if (!text) { f.querySelector(".fehler").textContent = "Bitte zuerst einen Wunsch eintragen."; return; }
        await be.wunschAnlegen({ projekt_id: projekt.id, text, seite_titel: f.querySelector("#n-seite").value.trim().slice(0, 300) });
        reiter = "wuensche"; await zeichnen();
      }
    } catch (err) { const m = f.querySelector(".fehler"); if (m) m.textContent = err.message; else alert(err.message); }
  });

  setInterval(() => { if (projekt && !tippt()) zeichnen(); }, 60000);
  be.beiAnmeldung(e => { if (e === "SIGNED_OUT") { if (stopp) stopp(); stopp = null; projekt = null; anmeldung(); } }); // Restzeiten und Wächter-Status aktuell halten
  await start();
})();
