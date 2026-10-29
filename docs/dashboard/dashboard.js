// Agentur-Dashboard: alle Websites, ihre Kunden (Logins), Wünsche, Veröffentlichungen und der Zustand der Automatik. Nur für Admins.
(async function () {
  const V = "20261030d";
  const laden = src => new Promise((ok, fehler) => { const s = document.createElement("script"); s.src = src + "?v=" + V; s.onload = ok; s.onerror = fehler; document.head.appendChild(s); });
  if ((window.KF_KONFIG || {}).url) await laden("../vendor/supabase.js");
  await laden("../backend.js");
  const KF = window.KundenFeedback, esc = KF.esc, be = await KF.backend();
  const inhalt = document.getElementById("inhalt"), kopfRechts = document.getElementById("kopf-rechts");
  const BASIS = new URL("../", location.href).href;  // …/kunden-feedback/
  const AKTIV = ["offen", "in_arbeit", "rueckfrage", "zur_freigabe"];
  const HOSTING = { keins: "Noch kein Hosting", github: "GitHub Pages", sftp: "SFTP (z. B. STRATO)", netlify: "Netlify" };
  const MODUS = { aus: "Automatik aus", mit_freigabe: "Mit Freigabe", direkt: "Direkt" };
  const ANLASS = { wunsch: "Wunsch", inhalt: "Editor", freigabe: "Freigabe", zuruecknehmen: "Zurückgenommen", manuell: "Manuell" };
  let ich = null, daten = null, reiter = "websites", stopp = null, offen = null, offenArt = "", zeichnenNr = 0;
  // Begriffe: Website = Projekt (z. B. Hühnerhof), Kunde = Login einer Person (z. B. robin), die Zugang zu einer Website hat.
  // Logins je Website (aus der Edge Function), offenes Formular („zg-pw:<uid>:<pid>“) und einmalige Meldung (neues Passwort)
  const zugaenge = {};
  let zgModus = "", zgMeldung = null;
  const DOMAIN = (window.KF_KONFIG || {}).benutzer_domain || "kunden.example.com";
  const GITHUB = (window.KF_KONFIG || {}).github_konto || "michele4800";
  const benutzername = login => String(login || "").endsWith("@" + DOMAIN) ? login.slice(0, -(DOMAIN.length + 1)) : login;
  const filter = { status: "aktiv", projekt: "", suche: "" };
  const tippt = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && inhalt.contains(a); };
  const portal = p => `${BASIS}portal/?projekt=${encodeURIComponent(p.slug)}`;
  const vor = iso => {
    if (!iso) return "";
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min.`;
    if (min < 1440) return `vor ${Math.round(min / 60)} Std.`;
    return KF.zeit(iso);
  };

  // ---------- Anmeldung ----------
  function anmeldung(meldung = "") {
    kopfRechts.innerHTML = "";
    inhalt.innerHTML = `<div class="karte anmelden"><h2 style="margin-top:0">Anmelden</h2>
      ${be.istDemo ? `<p class="demo">Demo-Modus: Mit „admin“ im Namen meldest du dich als Admin an, Passwort beliebig.</p>` : ""}
      <form id="login"><label for="email">Benutzername oder E-Mail</label><input id="email" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        <label for="pw">Passwort</label><input id="pw" type="password" autocomplete="current-password" required>
        <div class="zeile"><button class="btn">Anmelden</button></div>
        <p class="fehler" role="alert">${esc(meldung)}</p></form></div>`;
    const f = document.getElementById("login");
    f.addEventListener("submit", async e => {
      e.preventDefault();
      try { await be.anmelden(f.email.value.trim(), f.pw.value); await start(); }
      catch (err) { f.querySelector(".fehler").textContent = err.message; }
    });
    f.email.focus();
  }

  function kopfZeichnen() {
    kopfRechts.innerHTML = `<span style="margin-right:12px;font-size:14px">${esc(benutzername(ich.email || ""))}</span><button class="btn hell klein" id="mein-konto" style="margin-right:6px">Mein Konto</button><button class="btn hell klein" id="abmelden">Abmelden</button>`;
    document.getElementById("mein-konto").addEventListener("click", () => { reiter = "konto"; offen = null; zeichnen(); });
  }

  async function start() {
    const s = await be.sitzung();
    if (!s) return anmeldung();
    ich = s.user;
    kopfZeichnen();
    document.getElementById("abmelden").addEventListener("click", async () => { if (stopp) stopp(); stopp = null; await be.abmelden(); anmeldung(); });
    if (!(await be.istAdmin())) {
      inhalt.innerHTML = `<div class="karte anmelden"><h2 style="margin-top:0">Nur für Admins</h2>
        <p>Dieses Dashboard ist für die Agentur. Eure Wünsche findet ihr im <a href="${BASIS}portal/">Kundenportal</a>.</p></div>`;
      return;
    }
    if (stopp) stopp();
    let warten = null;
    stopp = be.beobachtenAlle(() => { clearTimeout(warten); warten = setTimeout(() => { if (!tippt() && !offen && !zgModus && !["neu", "kunden", "konto"].includes(reiter)) zeichnen(); }, 400); });
    await zeichnen();
    kundenLaden();
  }

  // ---------- Hauptansicht ----------
  async function zeichnen() {
    const nr = ++zeichnenNr;
    let d;
    try { d = await be.uebersicht(); }
    catch (err) { inhalt.innerHTML = `<p class="fehler">${esc(err.message)}</p>`; return; }
    if (nr !== zeichnenNr) return;
    daten = d;
    const offeneW = d.wuensche.filter(w => AKTIV.includes(w.status));
    const fehlerV = d.veroeffentlichungen.filter(v => v.status === "fehler" && Date.now() - new Date(v.start) < 864e5);
    const alle = alleKunden(d);
    const reiterListe = [["websites", `Websites (${d.projekte.length})`], ["kunden", `Kunden${alle ? ` (${new Set(alle.map(z => z.user_id)).size})` : ""}`],
      ["wuensche", `Alle Wünsche (${offeneW.length} offen)`],
      ["veroeffentlichungen", `Veröffentlichungen${fehlerV.length ? ` (${fehlerV.length} Fehler)` : ""}`], ["neu", "+ Neue Website"]];
    inhalt.innerHTML = `${be.istDemo ? `<p class="demo">Demo-Modus – Beispieldaten nur in diesem Browser.</p>` : ""}
      ${lage(d)}
      <div class="reiter" role="tablist">${reiterListe.map(([id, t]) => `<button role="tab" aria-selected="${reiter === id}" data-reiter="${id}">${t}</button>`).join("")}</div>
      <div id="ansicht">${({ konto: kontoAnsicht, websites: websiteAnsicht, kunden: kundenAnsicht, wuensche: wunschAnsicht, veroeffentlichungen: protokollAnsicht, neu: neuAnsicht })[reiter](d)}</div>`;
  }

  function lage(d) {
    const aktiv = d.automatik.filter(a => a.modus !== "aus");
    const zuletzt = d.automatik.map(a => a.letzter_lauf).filter(Boolean).sort().pop();
    const min = zuletzt ? Math.round((Date.now() - new Date(zuletzt)) / 60000) : null;
    const laeuft = min != null && min <= 5;
    const heute = d.automatik.reduce((s, a) => s + (+a.heute_laeufe || 0), 0);
    const fehler = d.automatik.filter(a => a.letzter_fehler).map(a => ({ a, p: d.projekte.find(p => p.id === a.projekt_id) }));
    return `<div class="lage" role="status">
      <span><span class="punkt ${laeuft ? "an" : aktiv.length ? "rot" : ""}"></span><b>Automatik ${laeuft ? "läuft" : aktiv.length ? "antwortet nicht" : "überall aus"}</b>
        ${zuletzt ? `<span class="hinweis"> · zuletzt geprüft ${vor(zuletzt)}</span>` : ""}</span>
      <span>Läufe heute: <b>${heute}</b></span>
      <span>Automatik an bei <b>${aktiv.length}</b> von ${d.projekte.length} Websites</span>
      ${fehler.map(({ a, p }) => `<span class="fehlerzeile">${esc(p ? p.name : "?")}: ${esc(a.letzter_fehler)}</span>`).join("")}
    </div>`;
  }

  // ---------- Websites ----------
  function websiteAnsicht(d) {
    if (!d.projekte.length) return `<p class="leer">Noch keine Website. Lege unter „+ Neue Website“ die erste an.</p>`;
    return `<div class="kunden">${d.projekte.map(p => website(p, d)).join("")}</div>`;
  }

  // Wer hat Zugang zu dieser Website? (nur Kunden-Logins, nicht die Automatik)
  function kundenZeile(p) {
    const l = zugaenge[p.id];
    if (!l) return "Kunden: …";
    const k = l.filter(z => z.rolle === "kunde");
    return k.length ? "Kunden: " + k.map(z => `<b>${esc(z.anzeigename || z.benutzername)}</b> (${esc(z.benutzername)})`).join(", ") : `<span class="fehler">Noch kein Kunden-Login</span>`;
  }

  function website(p, d) {
    const w = d.wuensche.filter(x => x.projekt_id === p.id);
    const a = d.automatik.find(x => x.projekt_id === p.id) || { modus: "aus" };
    const v = d.veroeffentlichungen.find(x => x.projekt_id === p.id);
    const zahl = (klasse, n, text) => `<span class="zahl ${klasse}${n ? "" : " null"}"><b>${n}</b>${text}</span>`;
    const anz = s => w.filter(x => x.status === s).length;
    const wichtig = w.filter(x => AKTIV.includes(x.status) && x.prioritaet === 1).length;
    const website = p.live_url || p.vorschau_url;
    const ww = KF.waechterText(a);
    return `<article class="kunde${p.aktiv === false ? " inaktiv" : ""}" aria-labelledby="k-${p.id}">
      <div class="kunde-kopf"><h3 id="k-${p.id}">${esc(p.name)}</h3><span class="etikett">${esc(HOSTING[p.hosting] || HOSTING.keins)}</span></div>
      <div class="zahlen">${zahl("offen", anz("offen"), "offen")}${zahl("in_arbeit", anz("in_arbeit"), "in Arbeit")}${zahl("rueckfrage", anz("rueckfrage"), "Rückfrage")}${zahl("zur_freigabe", anz("zur_freigabe"), "Freigabe")}${wichtig ? zahl("wichtig", wichtig, "wichtig") : ""}</div>
      <div class="meta">${v ? `Zuletzt veröffentlicht: <span class="status ${v.status}">${v.status === "ok" ? "ok" : v.status === "fehler" ? "Fehler" : "läuft"}</span> ${vor(v.ende || v.start)} · ${esc(ANLASS[v.anlass] || v.anlass)}` : "Noch nichts veröffentlicht"}</div>
      <div class="meta">${kundenZeile(p)}</div>
      <div class="links">
        ${website ? `<a href="${esc(website)}" target="_blank" rel="noopener">${p.live_url ? "Live-Website" : "Vorschau"}<span class="nur-vorleser"> (neues Fenster)</span></a>` : ""}
        ${(p.entwuerfe || []).map(e => `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.name)}<span class="nur-vorleser"> (neues Fenster)</span></a>`).join("")}
        <a href="${portal(p)}">Kundenportal</a>
      </div>
      ${offen === p.id && offenArt === "einstellungen" ? einstellungen(p) : ""}
      <div class="unten">
        <label class="nur-vorleser" for="m-${p.id}">Automatik für ${esc(p.name)}</label>
        <select id="m-${p.id}" data-modus="${p.id}" title="${esc(ww.text)}">${Object.entries(MODUS).map(([k, t]) => `<option value="${k}"${a.modus === k ? " selected" : ""}>${t}</option>`).join("")}</select>
        <span class="meta"><span class="punkt ${ww.aktiv ? "an" : ""}"></span>${a.modus === "aus" ? "aus" : ww.aktiv ? "aktiv" : "wartet"}</span>
        <span style="display:flex;gap:6px">
          <button class="btn hell klein" data-reiter="kunden">Kunden</button>
          <button class="btn hell klein" data-aktion="einstellungen" data-id="${p.id}" aria-expanded="${offen === p.id && offenArt === "einstellungen"}">Einstellungen</button>
        </span>
      </div>
    </article>`;
  }

  function einstellungen(p) {
    const e = (p.entwuerfe || []).map(x => `${x.name} | ${x.url}`).join("\n");
    return `<form class="einstellungen" data-projekt="${p.id}">
      <div><label for="h-${p.id}">Hosting</label><select id="h-${p.id}" name="hosting">${Object.entries(HOSTING).map(([k, t]) => `<option value="${k}"${p.hosting === k ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      <div><label for="d-${p.id}">Domain</label><input id="d-${p.id}" name="domain" type="text" value="${esc(p.domain || "")}" placeholder="beispiel.de"></div>
      <div><label for="l-${p.id}">Live-Adresse</label><input id="l-${p.id}" name="live_url" type="url" value="${esc(p.live_url || "")}" placeholder="https://www.beispiel.de/"></div>
      <div><label for="v-${p.id}">Vorschau-Adresse</label><input id="v-${p.id}" name="vorschau_url" type="url" value="${esc(p.vorschau_url || "")}"></div>
      <div class="breit"><label for="e-${p.id}">Entwürfe (je Zeile: Name | Adresse)</label><textarea id="e-${p.id}" name="entwuerfe">${esc(e)}</textarea></div>
      <div class="breit"><label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" name="aktiv"${p.aktiv === false ? "" : " checked"}> Website aktiv</label></div>
      ${p.hosting === "sftp" ? `<p class="hinweis breit">Zugangsdaten zum Server stehen nie hier. Trage sie auf dem Rechner der Automatik in <code>waechter/.env</code> ein: <code>KF_ZIEL_${esc(p.slug.toUpperCase().replace(/-/g, "_"))}_PASSWORT=…</code></p>` : ""}
      <div class="zeile breit"><button class="btn klein">Speichern</button><span class="fehler" role="alert"></span></div>
    </form>`;
  }

  // ---------- Kunden (Logins) ----------
  // shortcut: eine Abfrage je Website – bei sehr vielen Websites eine Sammelabfrage in der Edge Function ergänzen
  async function kundenLaden(neuZeichnen = true) {
    if (!daten) return;
    await Promise.all(daten.projekte.map(p => be.verwalten("zugaenge", { projekt_id: p.id })
      .then(r => { zugaenge[p.id] = r.zugaenge; }, err => { zugaenge[p.id] = []; zgMeldung = { text: err.message, fehler: true }; })));
    if (neuZeichnen) zeichnen();
  }

  // Alle Kunden-Logins mit ihrer Website; null, solange noch nicht alle geladen sind
  const alleKunden = d => d.projekte.every(p => zugaenge[p.id]) ?
    d.projekte.flatMap(p => zugaenge[p.id].filter(z => z.rolle === "kunde").map(z => ({ ...z, p }))) : null;

  const feld = (id, name, label, wert = "", extra = "") => `<div><label for="${id}">${label}</label><input id="${id}" name="${name}" type="${name === "passwort" ? "password" : "text"}" value="${esc(wert)}" autocomplete="${name === "passwort" ? "new-password" : "off"}" autocapitalize="none" spellcheck="false" ${extra}></div>`;

  function kundenAnsicht(d) {
    const liste = alleKunden(d);
    const meld = zgMeldung ? `<div class="zg-meldung${zgMeldung.fehler ? " fehler" : ""}" role="status">${esc(zgMeldung.text)}
      ${zgMeldung.kopie ? `<pre id="zg-kopie">${esc(zgMeldung.kopie)}</pre><button type="button" class="btn hell klein" data-kopieren="zg-kopie">Kopieren</button>
        <p class="hinweis" style="margin:6px 0 0">Wird nur jetzt angezeigt.</p>` : ""}</div>` : "";
    if (!liste) return `${meld}<p class="hinweis">Kunden werden geladen …</p>`;
    const knopf = (art, z, text) => `<button class="btn hell klein" data-aktion="${art}" data-uid="${z.user_id}" data-pid="${z.p.id}"${art === "zg-weg" ? "" : ` aria-expanded="${zgModus === `${art}:${z.user_id}:${z.p.id}`}"`}>${text}</button>`;
    const zeile = z => {
      const k = `${z.user_id}:${z.p.id}`;
      const form = zgModus === "zg-pw:" + k ? `<form class="zg-form" data-art="pw" data-uid="${z.user_id}" data-pid="${z.p.id}">${feld("zp-" + z.user_id, "passwort", "Neues Passwort (leer = wird erzeugt)", "", 'minlength="10"')}
            <div class="zeile"><button class="btn klein">Passwort setzen</button><span class="fehler" role="alert"></span></div></form>`
        : zgModus === "zg-edit:" + k ? `<form class="zg-form" data-art="edit" data-uid="${z.user_id}" data-pid="${z.p.id}">${feld("za-" + z.user_id, "anzeigename", "Anzeigename", z.anzeigename)}
            ${feld("zb-" + z.user_id, "benutzername", "Benutzername", z.benutzername, "required")}${feld("ze-" + z.user_id, "email", "E-Mail (freiwillig)", z.kontakt_email)}
            <div class="zeile"><button class="btn klein">Speichern</button><span class="fehler" role="alert"></span></div></form>` : "";
      return `<tr><td><b>${esc(z.anzeigename || z.benutzername)}</b></td><td>${esc(z.benutzername)}</td><td>${esc(z.p.name)}</td>
        <td class="weg">${esc(z.kontakt_email || "–")}</td><td class="weg">${z.zuletzt ? vor(z.zuletzt) : "noch nie"}</td>
        <td><span style="display:flex;gap:6px;flex-wrap:wrap">${knopf("zg-pw", z, "Passwort")}${knopf("zg-edit", z, "Bearbeiten")}${knopf("zg-weg", z, "Entfernen")}</span></td></tr>
        ${form ? `<tr><td colspan="6">${form}</td></tr>` : ""}`;
    };
    return `${meld}<p class="hinweis" style="margin-top:0">Kunden sind die Personen mit Login (z. B. robin). Jeder Kunde hat Zugang zu einer oder mehreren Websites.</p>
      ${liste.length ? `<div class="tabelle"><table class="liste"><thead><tr><th>Kunde</th><th>Benutzername</th><th>Website</th><th class="weg">E-Mail</th><th class="weg">Zuletzt angemeldet</th><th>Verwalten</th></tr></thead>
        <tbody>${liste.map(zeile).join("")}</tbody></table></div>` : `<p class="leer">Noch keine Kunden-Logins.</p>`}
      ${d.projekte.length ? `<form class="zg-form zg-neu karte" data-art="neu" style="margin-top:24px"><b class="breit">Kunden hinzufügen</b>
        <div><label for="zn-p">Website</label><select id="zn-p" name="projekt_id" required>${d.projekte.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></div>
        ${feld("zn-b", "benutzername", "Benutzername", "", 'required placeholder="z. B. robin"')}${feld("zn-a", "anzeigename", "Anzeigename")}
        ${feld("zn-e", "email", "E-Mail (freiwillig)")}${feld("zn-pw", "passwort", "Passwort (leer = wird erzeugt)", "", 'minlength="10"')}
        <div class="zeile breit"><button class="btn klein">Kunden hinzufügen</button><span class="fehler" role="alert"></span></div></form>` : ""}`;
  }

  // ---------- Alle Wünsche ----------
  function wunschAnsicht(d) {
    const name = Object.fromEntries(d.projekte.map(p => [p.id, p]));
    const such = filter.suche.toLowerCase();
    const liste = d.wuensche
      .filter(w => filter.status === "alle" || (filter.status === "aktiv" ? AKTIV.includes(w.status) : w.status === filter.status))
      .filter(w => !filter.projekt || w.projekt_id === filter.projekt)
      .filter(w => !such || (w.text + " " + w.seite_titel).toLowerCase().includes(such))
      .sort((a, b) => (filter.status === "aktiv" ? a.prioritaet - b.prioritaet : 0) || b.erstellt_am.localeCompare(a.erstellt_am));
    return `<div class="filter">
        <div><label for="f-status">Status</label><select id="f-status" data-filter="status">${[["aktiv", "Offen und in Arbeit"], ...Object.entries(KF.STATUS), ["alle", "Alle"]]
          .map(([k, t]) => `<option value="${k}"${filter.status === k ? " selected" : ""}>${t}</option>`).join("")}</select></div>
        <div><label for="f-projekt">Website</label><select id="f-projekt" data-filter="projekt"><option value="">Alle Websites</option>${d.projekte.map(p => `<option value="${p.id}"${filter.projekt === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>
        <div style="flex:1"><label for="f-suche">Suche</label><input id="f-suche" type="search" data-filter="suche" value="${esc(filter.suche)}"></div>
      </div>
      ${liste.length ? `<div class="tabelle"><table class="liste"><thead><tr><th>Website</th><th>Status</th><th>Wunsch</th><th class="weg">Seite</th><th class="weg">Eingang</th></tr></thead><tbody>
        ${liste.map(w => { const p = name[w.projekt_id] || {}; return `<tr>
          <td>${esc(p.name || "?")}</td>
          <td><span class="status ${w.status}">${esc(KF.STATUS[w.status] || w.status)}</span>${w.prioritaet === 1 ? `<div class="wichtig">wichtig</div>` : ""}</td>
          <td class="text"><a href="${p.slug ? portal(p) : "#"}">${esc(w.text.length > 140 ? w.text.slice(0, 140) + " …" : w.text)}</a>${w.fortschritt ? `<div class="meta">${esc(w.fortschritt)}</div>` : ""}</td>
          <td class="weg">${esc(w.seite_titel || "")}</td>
          <td class="weg">${vor(w.erstellt_am)}</td></tr>`; }).join("")}
      </tbody></table></div>` : `<p class="leer">Keine Wünsche für diese Auswahl.</p>`}`;
  }

  // ---------- Veröffentlichungen ----------
  function protokollAnsicht(d) {
    const name = Object.fromEntries(d.projekte.map(p => [p.id, p.name]));
    if (!d.veroeffentlichungen.length) return `<p class="leer">Noch keine Veröffentlichungen. Die Automatik trägt hier jede Veröffentlichung ein.</p>`;
    const zurueck = v => v.zuruecknehmen === "angefragt" ? `<span class="meta">wird zurückgenommen …</span>`
      : v.zuruecknehmen === "erledigt" ? `<span class="meta">zurückgenommen</span>`
      : v.zuruecknehmen === "fehler" ? `<span class="meta" style="color:var(--fehler)">Zurücknehmen fehlgeschlagen</span>`
      : v.status === "ok" && v.commit_hash && ["wunsch", "inhalt", "freigabe"].includes(v.anlass) ? `<button class="btn hell klein" data-aktion="zuruecknehmen" data-id="${v.id}">Zurücknehmen</button>` : "";
    return `<div class="tabelle"><table class="liste"><thead><tr><th>Zeit</th><th>Website</th><th>Anlass</th><th>Status</th><th>Meldung</th><th class="weg">Ziel</th><th></th></tr></thead><tbody>
      ${d.veroeffentlichungen.map(v => `<tr>
        <td>${KF.zeit(v.start)}</td><td>${esc(name[v.projekt_id] || "?")}</td><td>${esc(ANLASS[v.anlass] || v.anlass)}</td>
        <td><span class="status ${v.status}">${v.status === "ok" ? "ok" : v.status === "fehler" ? "Fehler" : "läuft"}</span></td>
        <td>${esc(v.meldung)}${v.dateien ? `<div class="meta">${v.dateien} Datei${v.dateien === 1 ? "" : "en"}${v.commit_hash ? " · " + esc(v.commit_hash.slice(0, 7)) : ""}</div>` : ""}</td>
        <td class="weg">${esc(v.ziel)}</td><td>${zurueck(v)}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  // ---------- Mein Konto (eigener Login) ----------
  let kontoMeldung = "";
  function kontoAnsicht() {
    const pw = (id, label, extra = "") => `<div><label for="${id}">${label}</label><input id="${id}" name="${id}" type="password" autocomplete="${id === "k-alt" ? "current-password" : "new-password"}" ${extra}></div>`;
    return `<form class="neu-form karte" id="konto-form">
      <div class="breit"><h2 style="margin:0 0 4px;font-size:20px">Mein Konto</h2>
        <p class="hinweis" style="margin:0">Dein eigener Login fürs Dashboard. Zum Speichern brauchst du dein aktuelles Passwort.</p></div>
      ${kontoMeldung ? `<p class="breit zg-meldung" role="status">${esc(kontoMeldung)}</p>` : ""}
      <div><label for="k-benutzer">Benutzername</label><input id="k-benutzer" name="benutzername" type="text" required autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(benutzername(ich.email || ""))}"></div>
      <div><label for="k-anzeige">Anzeigename</label><input id="k-anzeige" name="anzeigename" type="text" value="${esc((ich.user_metadata || {}).anzeigename || "")}"></div>
      ${pw("k-neu", "Neues Passwort (leer = bleibt)", 'minlength="10"')}${pw("k-neu2", "Neues Passwort wiederholen")}
      ${pw("k-alt", "Aktuelles Passwort", "required")}
      <div class="zeile breit"><button class="btn">Speichern</button><span class="fehler" role="alert"></span></div>
    </form>`;
  }

  // ---------- Neue Website (mit erstem Kunden-Login) ----------
  function neuAnsicht() {
    return `<form class="neu-form karte" id="neu-kunde">
      <div class="breit"><h2 style="margin:0 0 4px;font-size:20px">Neue Website anlegen</h2>
        <p class="hinweis" style="margin:0">Legt die Website samt Automatik an und dazu den ersten Kunden, der sich mit seinem Benutzernamen anmeldet. Das Passwort wird nur einmal angezeigt; weitere Kunden und neue Passwörter gibt es jederzeit unter „Kunden“.</p></div>
      <h3 class="breit" style="margin:8px 0 0;font-size:16px">Website</h3>
      <div><label for="n-name">Name der Website</label><input id="n-name" name="name" type="text" required placeholder="Hühnerhof Schneider"></div>
      <div><label for="n-slug">Kurzname (für Adressen)</label><input id="n-slug" name="slug" type="text" required pattern="[a-z0-9\\-]{2,60}" placeholder="huehnerhof-schneider"></div>
      <div><label for="n-hosting">Hosting</label><select id="n-hosting" name="hosting">${Object.entries(HOSTING).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select></div>
      <div><label for="n-modus">Automatik</label><select id="n-modus" name="modus">${Object.entries(MODUS).map(([k, t]) => `<option value="${k}"${k === "mit_freigabe" ? " selected" : ""}>${t}</option>`).join("")}</select></div>
      <div><label for="n-vorschau">Vorschau-Adresse (GitHub Pages)</label><input id="n-vorschau" name="vorschau_url" type="url" placeholder="leer = neues Repo ${esc(GITHUB)}/kurzname"></div>
      <div><label for="n-live">Live-Adresse (optional)</label><input id="n-live" name="live_url" type="url"></div>
      <h3 class="breit" style="margin:8px 0 0;font-size:16px">Erster Kunde (Login)</h3>
      <div><label for="n-benutzer">Benutzername (Login)</label><input id="n-benutzer" name="benutzername" type="text" required autocomplete="off" autocapitalize="none" spellcheck="false" pattern="[a-z0-9][a-z0-9._\\-]{1,39}" placeholder="z. B. robin"></div>
      <div><label for="n-pw">Passwort (leer = wird erzeugt)</label><input id="n-pw" name="passwort" type="password" minlength="10" autocomplete="new-password" spellcheck="false"></div>
      <div><label for="n-email">E-Mail (freiwillig, nur Kontakt)</label><input id="n-email" name="email" type="email" autocomplete="off"></div>
      <div><label for="n-anzeige">Anzeigename</label><input id="n-anzeige" name="anzeigename" type="text" placeholder="z. B. Robin (Bäckerei)"></div>
      <div class="zeile breit"><button class="btn">Website anlegen</button><span class="fehler" role="alert"></span></div>
    </form><div id="ergebnis"></div>`;
  }

  // Vorschlag für den Kurznamen: „Bäckerei Müller & Söhne“ → „baeckerei-mueller-soehne“
  const kurzname = n => n.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  function ergebnis(r, x) {
    const p = r.projekt, k = r.kunde;
    const schnipsel = `<script src="${BASIS}feedback.js" data-projekt="${p.slug}" defer><\/script>`;
    const zugang = `Euer Zugang zum Website-Portal\nAdresse: ${portal(p)}\nBenutzername: ${benutzername(k.login)}\n${k.passwort ? "Passwort: " + k.passwort : "Passwort: wie bisher"}`;
    return `<div class="ergebnis" role="status"><h3 style="margin:0">${esc(p.name)} ist angelegt.</h3>
      ${k.vorhanden ? `<p>Den Login ${esc(benutzername(k.login))} gab es schon. Er wurde dem neuen Projekt zugeordnet, sein Passwort bleibt.</p>` : `<p>Das Passwort wird nur jetzt angezeigt. Schick dem Kunden die Zugangsdaten. Ändern kannst du es später unter „Zugänge“.</p>`}
      <label>Zugangsdaten für den Kunden</label><pre id="zugang">${esc(zugang)}</pre>
      <button class="btn hell klein" data-kopieren="zugang">Zugangsdaten kopieren</button>
      <p><b>Den Rest erledigt die Automatik</b> in den nächsten Minuten: GitHub-Repo ${esc(x.vorschau_url)} holen (oder neu anlegen), auf deinen PC holen,
        KI-Wunsch und Editor in jede Seite einbauen, hochladen. Klappt etwas nicht, steht der Fehler oben in der Statuszeile.</p>
      <details><summary>Einbau-Code für Websites außerhalb von GitHub</summary><pre id="schnipsel">${esc(schnipsel)}</pre>
      <button class="btn hell klein" data-kopieren="schnipsel">Einbau-Code kopieren</button></details></div>`;
  }

  // ---------- Ereignisse ----------
  inhalt.addEventListener("click", async e => {
    const t = e.target.closest("[data-reiter],[data-aktion],[data-kopieren]");
    if (!t) return;
    if (t.dataset.reiter) { reiter = t.dataset.reiter; offen = null; return zeichnen(); }
    if (t.dataset.kopieren) {
      const text = document.getElementById(t.dataset.kopieren).textContent;
      try { await navigator.clipboard.writeText(text); t.textContent = "Kopiert"; } catch (err) { t.textContent = "Bitte von Hand markieren und kopieren"; }
      return;
    }
    if (t.dataset.aktion === "einstellungen") {
      const zu = offen === t.dataset.id;
      offen = zu ? null : t.dataset.id; offenArt = zu ? "" : "einstellungen";
      return zeichnen();
    }
    if (/^zg-/.test(t.dataset.aktion || "")) {
      const uid = t.dataset.uid, pid = t.dataset.pid, z = (zugaenge[pid] || []).find(x => x.user_id === uid), p = daten.projekte.find(x => x.id === pid);
      if (t.dataset.aktion === "zg-weg") {
        if (!confirm(`${z.anzeigename} (${z.benutzername}) von der Website ${p.name} entfernen?\nHat der Kunde keine andere Website, wird sein Login gelöscht.`)) return;
        try { await be.verwalten("entfernen", { user_id: uid, projekt_id: pid }); zgMeldung = { text: `${z.anzeigename} wurde von ${p.name} entfernt.` }; }
        catch (err) { zgMeldung = { text: err.message, fehler: true }; }
        return kundenLaden();
      }
      const k = `${t.dataset.aktion}:${uid}:${pid}`;
      zgModus = zgModus === k ? "" : k; zgMeldung = null;
      return zeichnen();
    }
    if (t.dataset.aktion === "zuruecknehmen") {
      const v = daten.veroeffentlichungen.find(x => x.id === t.dataset.id), p = daten.projekte.find(x => x.id === v.projekt_id);
      if (!confirm(`Diese Veröffentlichung bei ${p ? p.name : "dieser Website"} zurücknehmen?\n„${v.meldung}“\n\nDie Automatik stellt den Stand davor wieder her und veröffentlicht ihn.`)) return;
      t.disabled = true;
      try { await be.zuruecknehmen(v.id); await zeichnen(); } catch (err) { alert(err.message); t.disabled = false; }
    }
  });

  inhalt.addEventListener("change", async e => {
    const t = e.target;
    if (t.dataset.modus) {
      try { await be.automatikSetzen(t.dataset.modus, t.value); await zeichnen(); } catch (err) { alert(err.message); }
    } else if (t.dataset.filter && t.dataset.filter !== "suche") { filter[t.dataset.filter] = t.value; zeichnen(); }
    else if (t.id === "n-name") { const s = document.getElementById("n-slug"); if (!s.value) s.value = kurzname(t.value); }
  });

  inhalt.addEventListener("input", e => {
    if (e.target.dataset.filter !== "suche") return;
    filter.suche = e.target.value;
    const pos = e.target.selectionStart;
    document.getElementById("ansicht").innerHTML = wunschAnsicht(daten);
    const neu = document.getElementById("f-suche"); neu.focus(); neu.setSelectionRange(pos, pos);
  });

  inhalt.addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, meldung = f.querySelector(".fehler"), knopf = f.querySelector("button:not([type=button])");
    meldung.textContent = "";
    if (f.matches(".einstellungen")) {
      const entwuerfe = f.entwuerfe.value.split("\n").map(z => z.split("|").map(s => s.trim())).filter(([n, u]) => n && u)
        .map(([name, url]) => ({ name: name.slice(0, 80), url: url.slice(0, 300) }));
      const patch = { hosting: f.hosting.value, domain: f.domain.value.trim(), live_url: f.live_url.value.trim(),
        vorschau_url: f.vorschau_url.value.trim() || null, entwuerfe, aktiv: f.aktiv.checked };
      knopf.disabled = true;
      try { await be.projektSpeichern(f.dataset.projekt, patch); offen = null; await zeichnen(); }
      catch (err) { meldung.textContent = err.message; knopf.disabled = false; }
    } else if (f.matches(".zg-form")) {
      const x = Object.fromEntries(new FormData(f)), art = f.dataset.art, pid = f.dataset.pid || x.projekt_id;
      knopf.disabled = true;
      try {
        if (art === "pw") {
          const r = await be.verwalten("passwort", { user_id: f.dataset.uid, passwort: x.passwort });
          const z = zugaenge[pid].find(q => q.user_id === f.dataset.uid);
          zgMeldung = { text: `Neues Passwort für ${z.anzeigename}`, kopie: `Benutzername: ${z.benutzername}\nPasswort: ${r.passwort}` };
        } else if (art === "edit") {
          await be.verwalten("aendern", { user_id: f.dataset.uid, anzeigename: x.anzeigename, email: x.email, benutzername: x.benutzername });
          zgMeldung = { text: "Gespeichert." };
        } else {
          const r = await be.verwalten("zugang", x);
          zgMeldung = r.vorhanden ? { text: `Den Login ${benutzername(r.login)} gab es schon – er hat jetzt Zugang zu dieser Website.` }
            : { text: "Kunde angelegt", kopie: `Adresse: ${portal(daten.projekte.find(q => q.id === pid))}\nBenutzername: ${benutzername(r.login)}\nPasswort: ${r.passwort}` };
        }
        zgModus = "";
        await kundenLaden();
      } catch (err) { meldung.textContent = err.message; knopf.disabled = false; }
    } else if (f.id === "konto-form") {
      const x = Object.fromEntries(new FormData(f));
      if (x["k-neu"] !== x["k-neu2"]) { meldung.textContent = "Die beiden neuen Passwörter sind nicht gleich."; return; }
      knopf.disabled = true;
      try {
        const r = await be.verwalten("ich", { benutzername: x.benutzername.trim(), anzeigename: x.anzeigename.trim(), passwort_alt: x["k-alt"], passwort_neu: x["k-neu"] });
        // Neu anmelden, damit Name und Sitzung zum geänderten Login passen
        await be.anmelden(r.login || ich.email, x["k-neu"] || x["k-alt"]);
        ich = (await be.sitzung()).user; kopfZeichnen();
        kontoMeldung = x["k-neu"] ? "Gespeichert – ab jetzt gilt dein neues Passwort." : "Gespeichert.";
        await zeichnen(); kontoMeldung = "";
      } catch (err) { meldung.textContent = err.message; knopf.disabled = false; }
    } else if (f.id === "neu-kunde") {
      const x = Object.fromEntries(new FormData(f));
      // Ohne Vorschau-Adresse legt die Automatik ein neues Repo an – die Adresse ergibt sich daraus
      if (!x.vorschau_url.trim()) { x.vorschau_url = `https://${GITHUB}.github.io/${x.slug}/`; if (x.hosting === "keins") x.hosting = "github"; }
      knopf.disabled = true; knopf.textContent = "Wird angelegt …";
      try {
        const r = await be.verwalten("anlegen", x);
        f.reset(); knopf.disabled = false; knopf.textContent = "Website anlegen";
        document.getElementById("ergebnis").innerHTML = ergebnis(r, x);
        // Daten auffrischen, ohne das Ergebnis (einmaliges Passwort) wegzuwerfen
        try { daten = await be.uebersicht(); kundenLaden(false); } catch (err) {}
        document.querySelector(".ergebnis").scrollIntoView({ block: "start" });
      } catch (err) { meldung.textContent = err.message; knopf.disabled = false; knopf.textContent = "Website anlegen"; }
    }
  });

  // Ohne Live-Verbindung (oder im Demo-Modus) zumindest jede Minute auffrischen
  setInterval(() => { if (daten && !tippt() && !offen && !zgModus && !["neu", "kunden", "konto"].includes(reiter)) zeichnen(); }, 60000);
  be.beiAnmeldung(ereignis => { if (ereignis === "SIGNED_OUT") anmeldung(); });
  start();
})();
