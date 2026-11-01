// Editor (Baukasten) für Kunden. Das Widget öffnet ihn über den Knopf „Editor“ als Vollbild-iframe über der Website
// und übergibt in parent.KF_STUDIO_KONTEXT: be (Backend), projekt, KF, text (HTML der Seite, wie im Git), url, BASIS, schliessen().
// Grundlage ist GrapesJS (docs/vendor, BSD-Lizenz). Veröffentlicht wird über den Wächter (waechter/seite.mjs), ohne KI.
(async function () {
  const K = parent.KF_STUDIO_KONTEXT, { be, projekt, KF } = K, esc = KF.esc, SP = window.KF_SPERREN;
  const $ = s => document.querySelector(s);
  const SEITE = K.url;
  const dateiname = (new URL(SEITE).pathname.split("/").pop() || "index.html");
  const CSS_DATEI = dateiname.replace(/\.html?$/i, "") + ".kf.css";
  const ENTWURF = `kf-studio:${projekt.id}:${SEITE}`;
  // Weitere Reiter (Design, Medien, KI, SEO & Recht) kommen aus eigenen Dateien: { id, titel, aufbauen(ctx, feld), nachLaden?() }
  const TEILE = window.KF_STUDIO_TEILE || [];

  // ---------- Seite zerlegen ----------
  const { kopf, body } = SP.zerlegen(K.text);
  const basis = SP.pruefwert(K.text);
  const { bereiche, html } = SP.sperren(body);
  const info = bereiche.map(b => {
    let m = /^<!--\s*hof:(\w+)/i.exec(b);
    if (m) return { art: "daten", titel: { kopf: "Kopfzeile", fuss: "Fußzeile", woche: "Wochenplan", finder: "Stationen", steckbriefe: "Stationen", fakten: "Öffnungszeiten & Kontakt", chronik: "Chronik" }[m[1]] || "Automatische Angaben" };
    m = /^<!--\s*kf:([a-z0-9-]+)/i.exec(b);
    if (m && /art="neuigkeiten"/.test(b.slice(0, b.indexOf("-->")))) return { art: "neuigkeiten", schluessel: m[1], titel: "Neuigkeiten" };
    return { art: "unsichtbar" };
  });
  const absolut = href => new URL(href, SEITE).href;
  const links = [...kopf.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]).filter(l => /\brel=["']?stylesheet/i.test(l))
    .map(l => (/\bhref=["']([^"']+)["']/i.exec(l) || [])[1]).filter(Boolean).map(absolut);
  const eigeneCss = links.find(h => new URL(h).pathname.endsWith("/" + CSS_DATEI));
  const fremdeCss = links.filter(h => h !== eigeneCss);
  const kopfStile = [...kopf.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join("\n");
  const bodyKlasse = (/<body\b[^>]*\bclass=["']([^"']*)["']/i.exec(kopf) || [])[1] || "";
  let kfCss = "";
  if (eigeneCss) try { const r = await fetch(eigeneCss, { cache: "no-store" }); if (r.ok) kfCss = await r.text(); } catch (e) {}

  // ---------- Oberfläche ----------
  const IK = {
    desktop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
    tablet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/></svg>',
    handy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg>',
    zurueck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
    vor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
    auge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  };
  document.body.innerHTML = `<div class="st">
    <header class="st-leiste">
      <button type="button" class="btn klein" data-aktion="schliessen" title="Editor schließen – Änderungen bleiben gespeichert">Schließen</button>
      <span class="st-titel" title="${esc(SEITE)}">Editor · ${esc(parent.document.title)}</span>
      <div class="st-gruppe" role="group" aria-label="Ansicht">
        <button type="button" data-geraet="desktop" aria-pressed="true" title="Desktop">${IK.desktop}<span class="nur-vorleser">Desktop</span></button>
        <button type="button" data-geraet="tablet" aria-pressed="false" title="Tablet">${IK.tablet}<span class="nur-vorleser">Tablet</span></button>
        <button type="button" data-geraet="handy" aria-pressed="false" title="Handy">${IK.handy}<span class="nur-vorleser">Handy</span></button>
      </div>
      <div class="st-gruppe" role="group" aria-label="Bearbeiten">
        <button type="button" data-aktion="zurueck" title="Rückgängig (Strg+Z)" disabled>${IK.zurueck}</button>
        <button type="button" data-aktion="vor" title="Wiederholen (Strg+Umschalt+Z)" disabled>${IK.vor}</button>
        <button type="button" data-aktion="vorschau" title="Vorschau ohne Rahmen">${IK.auge}</button>
      </div>
      <span class="st-platz"></span>
      <span class="st-status" role="status" id="st-status">Keine Änderungen</span>
      <button type="button" class="btn" data-aktion="verwerfen">Verwerfen</button>
      <button type="button" class="btn" data-aktion="speichern" title="Zwischenstand speichern, ohne zu veröffentlichen (Strg+S)">Speichern</button>
      <button type="button" class="btn haupt" data-aktion="veroeffentlichen">Veröffentlichen</button>
    </header>
    <div class="st-mitte">
      <aside class="st-seite">
        <div class="st-reiter" role="tablist">
          <button type="button" role="tab" data-reiter="hinzufuegen" aria-selected="true">Hinzufügen</button>
          <button type="button" role="tab" data-reiter="gestalten" aria-selected="false">Gestalten</button>
          <button type="button" role="tab" data-reiter="seiten" aria-selected="false">Seiten</button>
          <button type="button" role="tab" data-reiter="daten" aria-selected="false" hidden>Angaben</button>
          <button type="button" role="tab" data-reiter="neuigkeiten" aria-selected="false" hidden>Neuigkeiten</button>
          ${TEILE.filter(t => t.titel).map(t => `<button type="button" role="tab" data-reiter="${t.id}" aria-selected="false">${esc(t.titel)}</button>`).join("")}
        </div>
        <div class="st-inhalt">
          <section data-feld="hinzufuegen"><p class="hinweis">Sektion oder Element auf die Seite ziehen. Auf der Seite: Element anklicken zum Auswählen, Text doppelt anklicken zum Schreiben, Foto doppelt anklicken zum Austauschen.</p><div id="kf-bloecke"></div></section>
          <section data-feld="gestalten" hidden><p class="hinweis" id="st-geraet-hinweis">Änderungen gelten für alle Geräte.</p><div id="kf-merkmale"></div><div id="kf-stile"></div></section>
          <section data-feld="seiten" hidden><div id="kf-baum"></div></section>
          <section data-feld="daten" hidden></section>
          <section data-feld="neuigkeiten" hidden></section>
          ${TEILE.filter(t => t.titel).map(t => `<section data-feld="${t.id}" hidden></section>`).join("")}
        </div>
      </aside>
      <main class="st-leinwand"><div id="kf-leinwand"></div></main>
    </div>
    <div class="st-meldung" id="st-meldung" hidden><div role="dialog" aria-modal="true" aria-labelledby="st-m-titel"><h2 id="st-m-titel"></h2><p id="st-m-text"></p><div class="zeile" id="st-m-knoepfe"></div></div></div>
  </div>
  <style>.nur-vorleser{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>`;

  // ---------- GrapesJS ----------
  const editor = grapesjs.init({
    container: "#kf-leinwand", height: "100%", width: "auto", fromElement: false,
    components: html, style: kfCss, storageManager: false, protectedCss: "",
    i18n: { locale: "de", detectLocale: false, messages: { de: window.KF_GJS_DE || {} } },
    canvas: { styles: fremdeCss, frameContent: `<!DOCTYPE html><html lang="de"><head><base href="${esc(SEITE)}"></head><body></body></html>`,
      frameStyle: kopfStile + "\nkf-sperre{display:contents}[data-ausgeblendet]{display:none}"
        // Ausgeblendetes bleibt im Editor sichtbar, aber abgeblendet und markiert
        + "[data-kf-aus]{outline:2px dashed #b4552d;outline-offset:-2px;position:relative}[data-kf-aus]>*{opacity:.45}"
        + "[data-kf-aus]::before{content:'ausgeblendet – erscheint nicht auf der Website';position:absolute;top:8px;left:8px;z-index:5;background:#b4552d;color:#fff;font:600 12px/1.6 system-ui,sans-serif;padding:2px 10px;border-radius:999px}" },
    deviceManager: { devices: [
      { id: "desktop", name: "Desktop", width: "" },
      { id: "tablet", name: "Tablet", width: "768px", widthMedia: "992px" },
      { id: "handy", name: "Handy", width: "375px", widthMedia: "480px" }] },
    panels: { defaults: [] },
    blockManager: { appendTo: "#kf-bloecke", blocks: window.KF_BLOECKE || [] },
    selectorManager: { componentFirst: true },
    traitManager: { appendTo: "#kf-merkmale" },
    styleManager: { appendTo: "#kf-stile", sectors: [
      { name: "Anordnung", open: true, properties: ["display", "flex-direction", "flex-wrap", "justify-content", "align-items",
        { property: "gap", label: "Abstand zwischen Elementen", type: "number", units: ["px", "rem", "%"], default: "0" },
        { extend: "text-align", label: "Textausrichtung", options: [{ id: "left", label: "links" }, { id: "center", label: "Mitte" }, { id: "right", label: "rechts" }, { id: "justify", label: "Block" }] }] },
      { name: "Größe und Abstand", open: true, properties: ["width", "max-width", { extend: "min-height", label: "Mindesthöhe" }, "margin", "padding"] },
      { name: "Schrift", open: false, properties: ["font-size", "font-weight", "line-height", "letter-spacing", "color", "text-transform"] },
      { name: "Hintergrund", open: false, properties: ["background-color", "background"] },
      { name: "Rahmen und Ecken", open: false, properties: ["border", "border-radius", "box-shadow", "opacity"] }] },
    assetManager: { upload: false, uploadFile: hochladen, assets: [] },
    plugins: window.KF_STUDIO_PLUGINS || [],
  });
  editor.getWrapper().addAttributes(bodyKlasse ? { class: bodyKlasse } : {});

  // Gesperrte Stellen: Skripte/Kommentare unsichtbar und unberührbar; Daten und Neuigkeiten anklickbar → Formular
  function einrichten() {
    editor.getWrapper().find("kf-sperre").forEach(c => {
      const b = info[+c.getAttributes()["data-nr"]] || { art: "unsichtbar" };
      for (const x of c.find("*")) x.set({ selectable: false, hoverable: false, draggable: false, droppable: false, editable: false, removable: false, copyable: false, layerable: false, highlightable: false });
      if (b.art === "unsichtbar") c.set({ selectable: false, hoverable: false, draggable: false, droppable: false, removable: false, copyable: false, layerable: false, highlightable: false });
      else c.set({ name: b.titel, droppable: false, copyable: false, editable: false, kfBereich: b });
    });
  }
  // Kopien dürfen keine automatischen Bereiche verdoppeln
  editor.on("component:clone", k => k.find("kf-sperre").forEach(x => x.remove()));

  // ---------- Bilder ----------
  const bildPfade = window.KF_STUDIO_PFADE = new Map();  // signierte Adresse → Pfad im Speicher (auch Videos)
  async function hochladen(ev) {
    const dateien = [...((ev.dataTransfer || ev.target || {}).files || [])];
    for (const f of dateien) {
      if (!/^image\//.test(f.type)) continue;
      status("Foto wird hochgeladen …");
      try {
        const blob = await KF.verkleinern(f);
        const d = await be.dateiHochladen(projekt.id, blob, f.name);
        const url = await be.dateiUrl(d.pfad);
        bildPfade.set(url, d.pfad);
        editor.AssetManager.add({ src: url, name: f.name });
      } catch (e) { alert("Das Foto konnte nicht hochgeladen werden: " + e.message); }
    }
    status();
  }

  // ---------- Leiste ----------
  let aktiverReiter = "hinzufuegen";
  const reiter = name => {
    aktiverReiter = name;
    document.querySelectorAll("[data-reiter]").forEach(b => b.setAttribute("aria-selected", b.dataset.reiter === name));
    document.querySelectorAll("[data-feld]").forEach(s => s.hidden = s.dataset.feld !== name);
  };
  document.querySelectorAll("[data-reiter]").forEach(b => b.addEventListener("click", () => reiter(b.dataset.reiter)));
  document.querySelectorAll("[data-geraet]").forEach(b => b.addEventListener("click", () => {
    editor.setDevice(b.dataset.geraet === "desktop" ? "Desktop" : b.dataset.geraet === "tablet" ? "Tablet" : "Handy");
    document.querySelectorAll("[data-geraet]").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("#st-geraet-hinweis").textContent = b.dataset.geraet === "desktop" ? "Änderungen gelten für alle Geräte."
      : `Änderungen gelten nur für ${b.dataset.geraet === "tablet" ? "Tablet und Handy" : "das Handy"} – Desktop bleibt, wie er ist.`;
  }));
  const um = editor.UndoManager;
  const leisteAktualisieren = () => {
    $('[data-aktion="zurueck"]').disabled = !um.hasUndo();
    $('[data-aktion="vor"]').disabled = !um.hasRedo();
    status();
  };
  // Änderungen an der Seite selbst zählen erst nach dem Laden (GrapesJS meldet beim Aufbau auch „update“)
  let bereit = false, seiteGeaendert = false;
  editor.on("update", () => { if (!bereit) return; seiteGeaendert = true; ungespeichert = true; leisteAktualisieren(); entwurfMerken(); baumSpaeter(); });
  editor.on("undo redo", leisteAktualisieren);
  editor.on("component:selected", c => {
    const b = c.get("kfBereich");
    // in „Seiten“, „KI“, „SEO & Recht“ usw. bleiben, wenn man von dort aus etwas auswählt oder einfügt
    if (!b) return aktiverReiter === "seiten" || TEILE.some(t => t.id === aktiverReiter) ? undefined : reiter("gestalten");
    if (b.art === "neuigkeiten") { neuigkeitenZeigen(b.schluessel); reiter("neuigkeiten"); }
    else { reiter("daten"); }
  });

  const geaendert = () => seiteGeaendert || datenGeaendert || Object.values(nachrichten).some(n => n.geaendert);
  let ungespeichert = false, gespeichertUm = null;
  const uhr = z => new Date(z).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  function status(text) {
    $("#st-status").textContent = text || (!geaendert() ? "Keine Änderungen"
      : ungespeichert || !gespeichertUm ? "Nicht gespeicherte Änderungen" : `Gespeichert um ${uhr(gespeichertUm)} · noch nicht veröffentlicht`);
  }

  $(".st-leiste").addEventListener("click", async e => {
    const a = e.target.closest("[data-aktion]")?.dataset.aktion;
    if (a === "zurueck") um.undo();
    if (a === "vor") um.redo();
    if (a === "vorschau") editor.runCommand("core:preview");
    if (a === "speichern") speichern();
    if (a === "schliessen") { if (geaendert()) speichern(); K.schliessen(); }
    if (a === "verwerfen") {
      if (geaendert() && !confirm("Alle Änderungen verwerfen und den Editor schließen?")) return;
      try { localStorage.removeItem(ENTWURF); } catch (err) {}
      K.schliessen();
    }
    if (a === "veroeffentlichen") veroeffentlichen();
  });
  editor.on("run:core:preview", () => { const s = document.createElement("button"); s.className = "btn haupt"; s.id = "st-vorschau-ende"; s.textContent = "Vorschau beenden";
    Object.assign(s.style, { position: "fixed", top: "12px", right: "12px", zIndex: 20 }); s.onclick = () => editor.stopCommand("core:preview"); document.body.appendChild(s); });
  editor.on("stop:core:preview", () => $("#st-vorschau-ende")?.remove());

  // ---------- Entwurf im Browser (falls der Tab zugeht) ----------
  // „Speichern“ legt den Zwischenstand in diesem Browser ab; beim nächsten Öffnen des Editors ist er wieder da.
  // shortcut: nur auf diesem Gerät – geräteübergreifend erst mit Entwürfen in Supabase (Status „entwurf“, braucht Schema-Update)
  let merkenUhr = null;
  function entwurfSchreiben() {
    clearTimeout(merkenUhr);
    try {
      localStorage.setItem(ENTWURF, JSON.stringify({ basis, zeit: Date.now(), projekt: seiteGeaendert ? editor.getProjectData() : null,
        daten: datenGeaendert ? datenWerte() : null, zusatz: ctx.zusatz,
        neuigkeiten: Object.fromEntries(Object.entries(nachrichten).filter(([, n]) => n.geaendert).map(([k, n]) => [k, n.liste])) }));
      return true;
    } catch (e) { return false; }
  }
  function entwurfMerken() { clearTimeout(merkenUhr); merkenUhr = setTimeout(entwurfSchreiben, 800); }
  function speichern() {
    if (!geaendert()) return status("Keine Änderungen zum Speichern");
    if (!entwurfSchreiben()) return meldung("Nicht gespeichert", "Der Browser lässt hier kein Speichern zu (z. B. im privaten Fenster). Bitte veröffentlichen oder ein normales Fenster nutzen.", [["OK", () => meldung("")]]);
    ungespeichert = false; gespeichertUm = Date.now(); status();
  }
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); speichern(); } });
  editor.Keymaps.add("kf:speichern", "⌘+s, ctrl+s", (ed, s, opt) => { opt?.event?.preventDefault?.(); speichern(); });

  // ---------- Angaben aus Daten (z. B. Öffnungszeiten in daten.json) ----------
  let schema = null, daten = null, datenBasis = "", datenGeaendert = false;
  const wurzel = projekt.vorschau_url || projekt.live_url || "";
  const lesen = (o, pfad) => pfad.split(".").reduce((x, k) => x == null ? x : x[k], o);
  async function datenLaden() {
    const feld = $('[data-feld="daten"]');
    try {
      if (!wurzel || new URL(wurzel).origin !== parent.location.origin) throw new Error("andere Adresse");
      const s = await fetch(new URL("kf-daten.json", wurzel), { cache: "no-store" });
      if (!s.ok) throw new Error("keine Angaben");
      schema = await s.json();
      const t = await (await fetch(new URL(schema.datei || "daten.json", wurzel), { cache: "no-store" })).text();
      datenBasis = SP.pruefwert(t); daten = JSON.parse(t);
    } catch (e) {
      schema = null;
      feld.innerHTML = `<p class="hinweis">Dieser Bereich wird automatisch aus den Angaben der Website gebaut. Änderungen daran bitte über „KI-Wunsch“ schicken.</p>`;
      if (info.some(b => b.art === "daten")) $('[data-reiter="daten"]').hidden = false;
      return;
    }
    $('[data-reiter="daten"]').hidden = false;
    const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const eingabe = (pfad, titel, art) => {
      const w = lesen(daten, pfad), id = "d-" + pfad.replace(/\W/g, "-");
      if (art === "woche") return `<div class="feld"><span style="font-weight:600;font-size:14px">${esc(titel)}</span><div class="woche">${TAGE.map((t, i) =>
        `<label for="${id}-${i + 1}">${t}</label><input id="${id}-${i + 1}" data-pfad="${esc(pfad)}" data-tag="${i + 1}" value="${esc((w || {})[i + 1] || "")}" placeholder="geschlossen" autocomplete="off">`).join("")}</div>
        <p class="hinweis" style="margin:4px 0 0">Zum Beispiel 09:00-12:00,14:30-17:30. Leer = geschlossen.</p></div>`;
      return `<div class="feld"><label for="${id}">${esc(titel)}</label><input id="${id}" data-pfad="${esc(pfad)}" value="${esc(w == null ? "" : w)}" autocomplete="off"></div>`;
    };
    feld.innerHTML = `<p class="hinweis">Diese Angaben stehen an mehreren Stellen der Website (z. B. Öffnungszeiten, Kontakt). Nach dem Veröffentlichen sind sie überall gleich.</p>
      ${(schema.felder || []).map(f => {
        if (!f.liste) return eingabe(f.pfad, f.titel, f.art);
        const liste = lesen(daten, f.liste) || [];
        return `<h3 style="margin:16px 0 8px;font-size:16px">${esc(f.titel || "")}</h3>` + liste.map((x, i) => `<fieldset><legend>${esc(x[f.name] || `Eintrag ${i + 1}`)}</legend>
          ${(f.felder || []).map(u => eingabe(`${f.liste}.${i}.${u.pfad}`, u.titel, u.art)).join("")}</fieldset>`).join("");
      }).join("")}`;
    feld.addEventListener("input", () => { datenGeaendert = true; status(); entwurfMerken(); });
  }
  function datenWerte() {
    const werte = {};
    $('[data-feld="daten"]').querySelectorAll("input[data-pfad]").forEach(i => {
      if (i.dataset.tag) (werte[i.dataset.pfad] = werte[i.dataset.pfad] || {})[i.dataset.tag] = i.value.trim();
      else werte[i.dataset.pfad] = i.value.trim();
    });
    return werte;
  }

  // ---------- Neuigkeiten ----------
  const nachrichten = {};  // schluessel → { liste, geaendert }
  let verlauf = [];
  try { verlauf = await be.inhalte(projekt.id); } catch (e) {}
  for (const b of info) if (b.art === "neuigkeiten" && !nachrichten[b.schluessel]) {
    const z = verlauf.find(x => x.schluessel === b.schluessel && ["live", "neu"].includes(x.status));
    nachrichten[b.schluessel] = { liste: (z && z.wert.eintraege) || [], geaendert: false };
    $('[data-reiter="neuigkeiten"]').hidden = false;
  }
  let nachrichtSchluessel = Object.keys(nachrichten)[0], bearbeite = null;
  const heute = () => new Date().toISOString().slice(0, 10);
  function neuigkeitenZeigen(schluessel = nachrichtSchluessel) {
    nachrichtSchluessel = schluessel;
    const n = nachrichten[schluessel], feld = $('[data-feld="neuigkeiten"]');
    if (!n) return;
    const form = e => `<form class="eintrag" data-form="${esc(e.id)}">
      <div class="feld"><label for="n-titel">Überschrift</label><input id="n-titel" name="titel" required maxlength="200" value="${esc(e.titel || "")}"></div>
      <div class="feld"><label for="n-datum">Datum</label><input id="n-datum" name="datum" type="date" required value="${esc(e.datum || heute())}"></div>
      <div class="feld"><label for="n-text">Text</label><textarea id="n-text" name="text" maxlength="4000">${esc(e.text || "")}</textarea></div>
      <div class="feld"><label for="n-bis">Sichtbar bis (freiwillig)</label><input id="n-bis" name="bis" type="date" value="${esc(e.bis || "")}"></div>
      <div class="zeile"><button class="btn haupt klein">Übernehmen</button><button type="button" class="btn klein" data-n="abbrechen">Abbrechen</button></div></form>`;
    feld.innerHTML = `<p class="hinweis">Neuigkeiten erscheinen auf der Seite und im RSS-Feed. Abgelaufene verschwinden von selbst.</p>
      ${bearbeite && bearbeite.neu ? form(bearbeite) : `<button type="button" class="btn klein" data-n="neu" style="margin-bottom:12px">Neuigkeit hinzufügen</button>`}
      ${n.liste.map(e => bearbeite && bearbeite.id === e.id ? form(bearbeite) : `<div class="eintrag"><h4>${esc(e.titel)}</h4><p class="meta">${esc(e.datum)}${e.bis ? ` · bis ${esc(e.bis)}` : ""}</p>
        <div class="zeile"><button type="button" class="btn klein" data-n="aendern" data-id="${esc(e.id)}">Ändern</button><button type="button" class="btn klein" data-n="loeschen" data-id="${esc(e.id)}">Löschen</button></div></div>`).join("")
        || `<p class="hinweis">Noch keine Neuigkeiten.</p>`}`;
  }
  $('[data-feld="neuigkeiten"]').addEventListener("click", e => {
    const t = e.target.closest("[data-n]"); if (!t) return;
    const n = nachrichten[nachrichtSchluessel];
    if (t.dataset.n === "neu") bearbeite = { id: Math.random().toString(36).slice(2, 10), datum: heute(), neu: true };
    if (t.dataset.n === "aendern") bearbeite = { ...n.liste.find(x => x.id === t.dataset.id) };
    if (t.dataset.n === "abbrechen") bearbeite = null;
    if (t.dataset.n === "loeschen" && confirm("Diese Neuigkeit löschen?")) { n.liste = n.liste.filter(x => x.id !== t.dataset.id); n.geaendert = true; status(); }
    neuigkeitenZeigen();
  });
  $('[data-feld="neuigkeiten"]').addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(e.target), n = nachrichten[nachrichtSchluessel];
    const x = { ...bearbeite, titel: f.get("titel").trim(), datum: f.get("datum"), text: f.get("text"), bis: f.get("bis") || "" };
    delete x.neu;
    n.liste = bearbeite.neu ? [x, ...n.liste] : n.liste.map(y => y.id === x.id ? x : y);
    n.geaendert = true; bearbeite = null; status(); neuigkeitenZeigen();
  });

  // ---------- Seiten: Register (Seiten der Website) → Abschnitte → Inhalte ----------
  // Register kommen aus der Navigation der Seite, Abschnitte und Inhalte aus dem Editor – in Seitenreihenfolge, mit Namen aus den Überschriften.
  const quelle = new DOMParser().parseFromString(K.text, "text/html");
  const ohneAnker = u => u.split("#")[0];
  const register = (() => {
    const gesehen = new Set(), liste = [];
    const nav = quelle.querySelector("header nav, nav") || quelle.body;
    const weitere = [...quelle.querySelectorAll("footer a[href]")];
    for (const [a, gruppe] of [...[...nav.querySelectorAll("a[href]")].map(a => [a, "haupt"]), ...weitere.map(a => [a, "weitere"])]) {
      let u; try { u = new URL(a.getAttribute("href"), SEITE); } catch (e) { continue; }
      if (u.origin !== new URL(SEITE).origin || !/(\/|\.html?)$/i.test(u.pathname)) continue;
      const titel = (a.textContent || "").replace(/\s+/g, " ").trim();
      const schluessel = ohneAnker(u.href) + "#" + u.hash;
      if (!titel || gesehen.has(schluessel)) continue;
      gesehen.add(schluessel); liste.push({ titel, url: ohneAnker(u.href), anker: u.hash.slice(1), gruppe });
    }
    if (!liste.some(r => r.url === SEITE && !r.anker)) liste.unshift({ titel: parent.document.title.split(/[–|-]/)[0].trim() || "Diese Seite", url: SEITE, anker: "", gruppe: "haupt" });
    return liste;
  })();

  const TAGNAMEN = { header: "Kopfbereich", footer: "Fußbereich", nav: "Navigation", section: "Abschnitt", article: "Beitrag", aside: "Randspalte" };
  // Kurzbeschreibung: Text, sonst Bildbeschreibung (auch für Überschriften, die nur ein Logo enthalten)
  const kurzText = c => (textVon(c) || (c.get("tagName") === "img" ? c.getAttributes().alt : c.find("img")[0]?.getAttributes().alt) || "").slice(0, 48);
  const textVon = c => { const el = c.getEl && c.getEl(); return ((el && el.textContent) || "").replace(/\s+/g, " ").trim(); };
  function nameVon(c) {
    const b = c.get("kfBereich"); if (b) return b.titel + " (automatisch)";
    const h = c.find("h1, h2, h3")[0];
    if (h) { const t = textVon(h) || (h.find("img")[0]?.getAttributes().alt || ""); if (t) return t.slice(0, 60); }
    const a = c.getAttributes();
    if (a["aria-label"] || TAGNAMEN[c.get("tagName")]) return a["aria-label"] || TAGNAMEN[c.get("tagName")];
    const t = kurzText(c);
    return t ? `${ART[c.get("tagName")] || "Element"}: ${t}` : "Element";
  }
  // Abschnitte = header/section/footer/aside/… bis in main und Hüllen-divs hinein, ohne Verschachtelung
  function abschnitte() {
    const raus = [];
    const gehen = liste => liste.forEach(c => {
      const tag = c.get("tagName"), b = c.get("kfBereich");
      if (tag === "kf-sperre") { if (b) raus.push(c); return; }
      if (["header", "section", "footer", "aside", "article", "nav"].includes(tag)) { raus.push(c); return; }
      if (["main", "div"].includes(tag) && c.find("section, header, footer").length) return gehen(c.components());
      if (c.get("type") !== "textnode" && c.get("selectable") !== false && tag !== "script") raus.push(c);
    });
    gehen(editor.getWrapper().components());
    return raus;
  }
  const ART = { h1: "Überschrift", h2: "Überschrift", h3: "Zwischenüberschrift", h4: "Zwischenüberschrift", p: "Text", img: "Foto", a: "Link", blockquote: "Zitat", ul: "Liste", ol: "Liste", table: "Tabelle", button: "Knopf", figure: "Foto" };
  function inhalte(abschnitt) {
    if (abschnitt.get("kfBereich")) return [];
    return abschnitt.find("h1, h2, h3, h4, p, img, blockquote, ul, ol, table, a").filter(c =>
      !c.closest("kf-sperre") && c.get("selectable") !== false && !c.parents().some(x => ["p", "ul", "ol", "blockquote", "table", "a"].includes(x.get("tagName")) && abschnitt.find("*").includes(x))
    ).slice(0, 30);
  }
  const offeneAbschnitte = new Set();
  let baumUhr = null;
  const baumSpaeter = () => { clearTimeout(baumUhr); baumUhr = setTimeout(baum, 250); };
  const AUGE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  const KN = (aktion, cid, text, titel) => `<button type="button" class="baum-knopf" data-b="${aktion}" data-cid="${cid}" title="${esc(titel)}" aria-label="${esc(titel)}">${text}</button>`;
  function baum() {
    const ziel = $("#kf-baum"); if (!ziel) return;
    const gewaehlt = editor.getSelected();
    const teile = abschnitte();
    const abschnittHtml = (c, i) => {
      const cid = c.cid, offen = offeneAbschnitte.has(cid), kinder = offen ? inhalte(c) : [];
      const aktiv = gewaehlt && (gewaehlt === c || gewaehlt.parents().includes(c));
      const aus = !!c.getAttributes()["data-kf-aus"];
      return `<li class="baum-abschnitt${aktiv ? " aktiv" : ""}${aus ? " aus" : ""}">
        <div class="baum-zeile">
          <button type="button" class="baum-auf" data-b="auf" data-cid="${cid}" aria-expanded="${offen}" ${c.get("kfBereich") ? "disabled" : ""} title="Inhalte zeigen">${c.get("kfBereich") ? "•" : offen ? "▾" : "▸"}</button>
          <button type="button" class="baum-name" data-b="waehlen" data-cid="${cid}">${esc(nameVon(c))}</button>${aus ? `<span class="etikett aus" title="ausgeblendet – erscheint nicht auf der Website">aus</span>` : ""}
          <span class="baum-knoepfe">${c.get("kfBereich") ? "" : KN("auge", cid, AUGE + (aus ? '<path d="M3 3l18 18"/></svg>' : "</svg>"), aus ? "Einblenden" : "Ausblenden (bleibt im Editor, erscheint nicht auf der Website)")}${KN("hoch", cid, "↑", "Nach oben")}${KN("runter", cid, "↓", "Nach unten")}${c.get("kfBereich") ? "" : KN("kopie", cid, "⧉", "Kopieren")}${KN("weg", cid, "✕", "Löschen")}</span>
        </div>
        ${offen ? `<ul class="baum-inhalte">${kinder.map(k => `<li><button type="button" class="baum-inhalt${gewaehlt === k ? " aktiv" : ""}" data-b="inhalt" data-cid="${k.cid}">
          <span class="baum-art">${ART[k.get("tagName")] || "Element"}</span> ${esc(kurzText(k) || "(leer)")}</button></li>`).join("") || `<li class="hinweis">Keine Inhalte</li>`}</ul>` : ""}
      </li>`;
    };
    const aktuell = r => r.url === SEITE;
    const haupt = register.filter(r => r.gruppe === "haupt"), weitere = register.filter(r => r.gruppe === "weitere" && !haupt.some(h => h.url === r.url && h.anker === r.anker));
    const regHtml = r => {
      if (aktuell(r) && r.anker) {
        const c = editor.getWrapper().find(`#${CSS.escape(r.anker)}`)[0];
        return `<li class="baum-register"><button type="button" class="baum-reg-name" data-b="anker" data-anker="${esc(r.anker)}" ${c ? "" : "disabled"}>${esc(r.titel)}</button><span class="hinweis">Abschnitt auf dieser Seite</span></li>`;
      }
      if (aktuell(r)) return `<li class="baum-register aktuell"><span class="baum-reg-name">${esc(r.titel)}</span><span class="etikett">wird bearbeitet</span>
        <ol class="baum-abschnitte">${teile.map(abschnittHtml).join("")}</ol></li>`;
      return `<li class="baum-register"><button type="button" class="baum-reg-name" data-b="seite" data-url="${esc(r.url)}">${esc(r.titel)}</button><span class="hinweis">${r.anker ? "Abschnitt einer anderen Seite" : "andere Seite – öffnen"}</span></li>`;
    };
    ziel.innerHTML = `<p class="hinweis">Register der Website und ihre Abschnitte. Anklicken springt zur Stelle, ▸ zeigt die Inhalte. Zum Bearbeiten Inhalt anklicken.</p>
      <ul class="baum">${haupt.map(regHtml).join("")}</ul>
      ${weitere.length ? `<h3 class="baum-titel">Weitere Seiten</h3><ul class="baum">${weitere.map(regHtml).join("")}</ul>` : ""}`;
  }
  const zeigen = c => { editor.select(c); const el = c.getEl && c.getEl(); el && el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  $("#kf-baum").addEventListener("click", e => {
    const t = e.target.closest("[data-b]"); if (!t) return;
    const c = t.dataset.cid && editor.getWrapper().find("*").concat(editor.getWrapper().components().models).find(x => x.cid === t.dataset.cid);
    const art = t.dataset.b;
    if (art === "seite") {
      if (geaendert()) speichern();
      parent.location.href = t.dataset.url + parent.location.search + "#kf-editor";
      return;
    }
    if (art === "anker") { const z = editor.getWrapper().find(`#${CSS.escape(t.dataset.anker)}`)[0]; if (z) zeigen(z); return; }
    if (!c) return;
    if (art === "auf") { offeneAbschnitte.has(c.cid) ? offeneAbschnitte.delete(c.cid) : offeneAbschnitte.add(c.cid); return baum(); }
    if (art === "waehlen") { zeigen(c); return baum(); }
    if (art === "inhalt") {
      zeigen(c);
      // Text gleich zum Schreiben öffnen, Foto gleich zum Austauschen
      if (c.get("tagName") === "img") editor.runCommand("core:open-assets", { target: c, types: ["image"], accept: "image/*" });
      else if (c.is("text")) setTimeout(() => c.getEl()?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })), 350);
      return baum();
    }
    const eltern = c.parent(), i = eltern.components().indexOf(c);
    if (art === "hoch" && i > 0) c.move(eltern, { at: i - 1 });
    if (art === "runter" && i < eltern.components().length - 1) c.move(eltern, { at: i + 2 });
    if (art === "auge") c.getAttributes()["data-kf-aus"] ? c.removeAttributes("data-kf-aus") : c.addAttributes({ "data-kf-aus": Math.random().toString(36).slice(2, 10) });
    if (art === "kopie") { const k = c.clone(); eltern.components().add(k, { at: i + 1 }); }
    if (art === "weg" && confirm(`„${nameVon(c)}“ von dieser Seite löschen?`)) c.remove();
    baum();
  });
  editor.on("component:selected component:deselected", baumSpaeter);
  document.querySelector('[data-reiter="seiten"]').addEventListener("click", baum);

  // ---------- Veröffentlichen ----------
  const meldung = (titel, text, knoepfe = []) => {
    $("#st-m-titel").textContent = titel; $("#st-m-text").innerHTML = text;
    $("#st-m-knoepfe").innerHTML = knoepfe.map((k, i) => `<button type="button" class="btn${i === 0 ? " haupt" : ""}" data-m="${i}">${esc(k[0])}</button>`).join("");
    $("#st-m-knoepfe").onclick = e => { const i = e.target.closest("[data-m]")?.dataset.m; if (i != null) knoepfe[+i][1](); };
    $("#st-meldung").hidden = !titel;
    $("#st-m-knoepfe button")?.focus();
  };
  const kurz = s => s.toLowerCase().replace(/\.html?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "start";

  // Ausgeblendete Abschnitte gehen nicht in die Seite: an ihrer Stelle steht nur eine leere Marke, der Inhalt bleibt in der
  // Inhalte-Zeile (nur für Mitglieder lesbar) und kommt beim nächsten Öffnen über ausgeblendeteHolen() zurück in den Editor.
  function ausgeblendetTrennen(h) {
    if (!/data-kf-aus=/.test(h)) return { h, aus: [] };
    const d = new DOMParser().parseFromString(`<body>${h}</body>`, "text/html"), aus = [];
    for (const el of d.body.querySelectorAll("[data-kf-aus]")) {
      if (!d.body.contains(el)) continue;  // steckt in einem schon ausgeblendeten Abschnitt
      const id = el.getAttribute("data-kf-aus"), m = d.createElement("div");
      aus.push({ id, html: el.outerHTML });
      m.hidden = true; m.setAttribute("data-ausgeblendet", id); el.replaceWith(m);
    }
    return { h: d.body.innerHTML, aus };
  }
  async function ausgeblendeteHolen() {
    const marken = editor.getWrapper().find("[data-ausgeblendet]"); if (!marken.length) return;
    let teile = [];
    try { teile = (await be.inhalte(projekt.id)).filter(z => z.seite_url === SEITE && z.status === "live" && Array.isArray(z.wert?.ausgeblendet)).flatMap(z => z.wert.ausgeblendet); } catch (e) { return; }
    for (const m of marken) {
      const teil = teile.find(a => a.id === m.getAttributes()["data-ausgeblendet"]); if (!teil) continue;
      const d = new DOMParser().parseFromString(`<body>${teil.html}</body>`, "text/html");
      // Fotos/Videos aus der Medienbibliothek: Adresse neu holen (die alte galt nur eine Stunde)
      for (const el of d.querySelectorAll("[data-kf-bild], [data-kf-datei]")) {
        const p = el.getAttribute("data-kf-bild") || el.getAttribute("data-kf-datei");
        try { const u = await be.dateiUrl(p); if (u) { el.setAttribute("src", u); bildPfade.set(u, p); } } catch (e) {}
      }
      const eltern = m.parent(); eltern.components().add(d.body.innerHTML, { at: eltern.components().indexOf(m) }); m.remove();
    }
  }

  async function veroeffentlichen() {
    if (!geaendert()) return meldung("Keine Änderungen", "Es gibt nichts zu veröffentlichen.", [["OK", () => meldung("")]]);
    const zeilen = [];
    if (seiteGeaendert) {
      const platzhalter = editor.getWrapper().find("img").filter(c => /studio\/platzhalter\.svg/.test(c.get("src") || ""));
      if (platzhalter.length) {
        editor.select(platzhalter[0]); platzhalter[0].view?.el?.scrollIntoView({ block: "center" });
        return meldung("Noch Platzhalter-Fotos", `${platzhalter.length === 1 ? "Ein Platzhalter-Foto ist" : platzhalter.length + " Platzhalter-Fotos sind"} noch auf der Seite. Bitte doppelt anklicken und ein eigenes Foto wählen – oder löschen.`, [["OK", () => meldung("")]]);
      }
      for (const c of editor.getWrapper().find("img")) { const p = bildPfade.get(c.get("src")); if (p) c.addAttributes({ "data-kf-bild": p }); }
      for (const c of editor.getWrapper().find("video")) { const p = bildPfade.get(c.getAttributes().src); if (p) c.addAttributes({ "data-kf-datei": p }); }
      const ohneVideo = editor.getWrapper().find("video[data-hintergrund]").filter(c => !c.getAttributes().src);
      if (ohneVideo.length) { editor.select(ohneVideo[0]); return meldung("Video fehlt", "Beim Video-Hintergrund ist noch kein Video gewählt. Bitte im Reiter „Gestalten“ auf „Video wählen …“ klicken – oder den Abschnitt löschen.", [["OK", () => meldung("")]]); }
      const { h, aus } = ausgeblendetTrennen(editor.getHtml().replace(/^\s*<body\b[^>]*>/i, "").replace(/<\/body>\s*$/i, ""));
      const css = editor.getCss({ avoidProtected: true }) || "";
      if (h.length + css.length + JSON.stringify(aus).length > 480000) return meldung("Seite zu groß", "Die Seite ist zu umfangreich zum Speichern. Bitte große Bereiche entfernen.", [["OK", () => meldung("")]]);
      zeilen.push({ schluessel: "seite-" + kurz(new URL(SEITE).pathname.replace(/^\//, "") || "index"), wert: { art: "seite", html: h, css, basis, ...(aus.length ? { ausgeblendet: aus } : {}),...(ctx.zusatz.seo ? { seo: ctx.zusatz.seo } : {}) } });
    }
    if (datenGeaendert && schema) zeilen.push({ schluessel: "daten", wert: { art: "daten", werte: datenWerte(), basis: datenBasis } });
    for (const [schluessel, n] of Object.entries(nachrichten)) if (n.geaendert) zeilen.push({ schluessel, wert: { eintraege: n.liste } });

    meldung("Wird veröffentlicht …", "Eure Änderungen werden gespeichert und auf die Website gebracht. Das dauert meist ein bis zwei Minuten.");
    const ids = [];
    try {
      for (const z of zeilen) ids.push((await be.inhaltAnlegen({ projekt_id: projekt.id, seite_url: SEITE, ...z })).id);
    } catch (e) {
      return meldung("Nicht gespeichert", `<span class="fehler">${esc(e.message)}</span>`, [["Schließen", () => meldung("")]]);
    }
    try { localStorage.removeItem(ENTWURF); } catch (e) {}
    const start = Date.now();
    const warten = async () => {
      let liste = [];
      try { liste = (await be.inhalte(projekt.id)).filter(z => ids.includes(z.id)); } catch (e) {}
      const offen = liste.filter(z => z.status === "neu");
      const fehler = liste.filter(z => z.status === "fehler");
      if (liste.length === ids.length && !offen.length) {
        if (fehler.length) return meldung("Nicht veröffentlicht", fehler.map(z => `<span class="fehler">${esc(z.meldung || "Unbekannter Fehler")}</span>`).join("<br>"),
          [["Seite neu laden", () => parent.location.reload()], ["Weiter bearbeiten", () => meldung("")]]);
        seiteGeaendert = false; datenGeaendert = false; Object.values(nachrichten).forEach(n => n.geaendert = false); status();
        return meldung("Veröffentlicht", "Die Änderung ist übernommen. Die Website zeigt sie in etwa einer Minute – danach die Seite neu laden.",
          [["Editor schließen", () => K.schliessen()], ["Weiter bearbeiten", () => meldung("")]]);
      }
      if (Date.now() - start > 10 * 60000) return meldung("Dauert länger", "Die Automatik hat die Änderung noch nicht übernommen. Sie ist gespeichert und wird veröffentlicht, sobald die Automatik läuft.",
        [["Editor schließen", () => K.schliessen()]]);
      setTimeout(warten, 3000);
    };
    warten();
  }

  // ---------- Weitere Reiter ----------
  const ctx = { editor, K, be, projekt, KF, esc, $, SEITE, kopf, quelle, bildPfade, reiter, status, meldung, zusatz: {},
    // Änderung außerhalb der Leinwand (z. B. SEO), die mit der Seite veröffentlicht wird
    seiteAendern() { seiteGeaendert = true; ungespeichert = true; leisteAktualisieren(); entwurfMerken(); } };
  for (const t of TEILE) try { t.aufbauen(ctx, $(`[data-feld="${t.id}"]`) || document.createElement("section")); } catch (e) { console.error(t.id, e); }

  // ---------- Start ----------
  editor.on("load", async () => {
    einrichten();
    await datenLaden();
    neuigkeitenZeigen();
    let e = null;
    try { e = JSON.parse(localStorage.getItem(ENTWURF) || "null"); } catch (err) {}
    // Gespeicherten Stand ohne Rückfrage laden. Hat sich die Seite seitdem geändert (z. B. durch einen KI-Wunsch), fragen:
    // wer trotzdem lädt, ersetzt beim Veröffentlichen die neuere Fassung.
    const weiter = e && (e.basis === basis || confirm(`Ihr habt am ${new Date(e.zeit).toLocaleString("de-DE")} einen Stand gespeichert. Die Seite wurde seitdem geändert (z. B. durch einen KI-Wunsch).\n\nGespeicherten Stand trotzdem laden? Beim Veröffentlichen würde er die neueren Änderungen ersetzen.`));
    if (weiter) {
      if (e.projekt) { editor.loadProjectData(e.projekt); einrichten(); seiteGeaendert = true; }
      if (e.daten) for (const [pfad, w] of Object.entries(e.daten)) $('[data-feld="daten"]').querySelectorAll(`input[data-pfad="${CSS.escape(pfad)}"]`).forEach(i => { i.value = i.dataset.tag ? (w[i.dataset.tag] || "") : w; datenGeaendert = true; });
      for (const [k, liste] of Object.entries(e.neuigkeiten || {})) if (nachrichten[k]) { nachrichten[k].liste = liste; nachrichten[k].geaendert = true; }
      if (e.zusatz) Object.assign(ctx.zusatz, e.zusatz);
      neuigkeitenZeigen();
      gespeichertUm = e.zeit;
    } else if (e) { try { localStorage.removeItem(ENTWURF); } catch (err) {} }
    if (!weiter || !e.projekt) await ausgeblendeteHolen();
    um.clear();
    setTimeout(() => { bereit = true; ungespeichert = false; if (weiter) status(`Gespeicherter Stand vom ${uhr(e.zeit)} geladen · noch nicht veröffentlicht`); }, 400);  // Nachzügler-„update“ vom Laden nicht zählen
    for (const t of TEILE) try { t.nachLaden && t.nachLaden(); } catch (err) { console.error(t.id, err); }
    leisteAktualisieren(); baum();
    if (weiter) status(`Gespeicherter Stand vom ${uhr(e.zeit)} geladen · noch nicht veröffentlicht`);
  });
})().catch(e => { console.error(e); document.body.innerHTML = `<p style="padding:24px;font:16px system-ui">Der Editor konnte nicht geladen werden: ${String(e.message).replace(/</g, "&lt;")}</p><p style="padding:0 24px"><button onclick="parent.KF_STUDIO_KONTEXT.schliessen()">Schließen</button></p>`; });
