// Editor für Kunden: markierte Bereiche der Website direkt bearbeiten. Wird vom Widget nachgeladen („Editor“).
// Markierung im Website-Code:  <!-- kf:schluessel art="text" titel="Überschrift oben" -->…<!-- /kf:schluessel -->
// art: text · mehrzeilig · bild · link · neuigkeiten. Änderungen sind bis „Veröffentlichen“ nur eine Vorschau in diesem Browser;
// danach legt der Editor je Bereich eine Zeile in „inhalte“ an, der Wächter übernimmt sie ohne KI und veröffentlicht.
(function () {
  const KF = window.KundenFeedback;
  const ARTEN = ["text", "mehrzeilig", "bild", "link", "neuigkeiten"];
  const NAMEN = { text: "Text", mehrzeilig: "Text", bild: "Bild", link: "Link", neuigkeiten: "Neuigkeiten" };
  const attribute = s => Object.fromEntries([...String(s || "").matchAll(/([a-z-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const heute = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const kurzId = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, "0")).join("");

  // Markierte Bereiche finden: Kommentar „kf:schluessel …“ und dazu passendes „/kf:schluessel“ auf derselben Ebene
  function bereicheFinden() {
    const liste = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    const anfaenge = [];
    while (w.nextNode()) anfaenge.push(w.currentNode);
    for (const k of anfaenge) {
      const m = /^\s*kf:([a-z0-9-]{1,60})((?:\s+[a-z-]+="[^"]*")*)\s*$/.exec(k.data);
      if (!m) continue;
      let ende = k.nextSibling;
      while (ende && !(ende.nodeType === 8 && new RegExp(`^\\s*/kf:${m[1]}\\s*$`).test(ende.data))) ende = ende.nextSibling;
      if (!ende) continue;
      const a = attribute(m[2]);
      liste.push({ schluessel: m[1], art: ARTEN.includes(a.art) ? a.art : "text", titel: a.titel || "", attr: a, anfang: k, ende });
    }
    return liste;
  }
  KF.hatBereiche = () => bereicheFinden().length > 0;

  KF.editor = async function (be, projekt) {
    if (document.querySelector(".kf-ed-leiste")) return;
    const esc = KF.esc;
    const bereiche = bereicheFinden();
    const offen = new Map();     // schluessel → { art, wert, blob?, … } (noch nicht veröffentlicht)
    const zustand = { aktiv: null, gesendet: [] };

    // Bisherige Werte (für Neuigkeiten-Liste und „zurück“)
    let verlauf = [];
    try { verlauf = await be.inhalte(projekt.id); } catch (e) {}
    const letzter = s => verlauf.filter(z => z.schluessel === s && ["live", "neu"].includes(z.status)).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am))[0];

    // ---------- Aussehen ----------
    const css = document.createElement("style");
    css.textContent = `
.kf-feld{outline:2px dashed #2f6f8a!important;outline-offset:4px!important;cursor:pointer;border-radius:2px;transition:outline-color .15s}
.kf-feld:hover,.kf-feld:focus-visible{outline:3px solid #2f6f8a!important;background:rgba(47,111,138,.06)}
.kf-feld.kf-geaendert{outline-color:#b98900!important}
.kf-feld[contenteditable=true]{outline:3px solid #f2c14e!important;background:rgba(242,193,78,.12)!important;cursor:text}
span.kf-feld{display:inline}
.kf-ed-leiste{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483001;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;
  max-width:calc(100vw - 24px);background:#1b1b19;color:#fff;font:500 14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;border-radius:16px;padding:10px 12px 10px 16px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.kf-ed-leiste b{font-weight:700}
.kf-ed-leiste button,.kf-ed-panel button{font:600 14px system-ui,sans-serif;border-radius:999px;padding:8px 14px;cursor:pointer;border:2px solid #fff;background:transparent;color:#fff}
.kf-ed-leiste .voll{background:#fff;color:#1b1b19}
.kf-ed-leiste button:disabled{opacity:.45;cursor:default}
.kf-ed-leiste button:focus-visible,.kf-ed-panel :focus-visible,.kf-feld:focus-visible{outline:3px solid #f2c14e;outline-offset:2px}
.kf-ed-panel{position:fixed;right:16px;top:16px;bottom:96px;width:min(380px,calc(100vw - 32px));z-index:2147483002;background:#fff;color:#1b1b19;border-radius:14px;
  box-shadow:0 10px 40px rgba(0,0,0,.3);font:400 15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;flex-direction:column;overflow:hidden}
.kf-ed-panel header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #e1dfd8}
.kf-ed-panel h2{font:700 17px system-ui,sans-serif;margin:0}
.kf-ed-panel .rumpf{padding:14px 16px;overflow:auto;flex:1}
.kf-ed-panel label{display:block;font-weight:600;font-size:14px;margin:12px 0 5px}
.kf-ed-panel input,.kf-ed-panel textarea{width:100%;box-sizing:border-box;font:inherit;border:1px solid #8a877f;border-radius:8px;padding:8px 10px;background:#fff;color:#1b1b19}
.kf-ed-panel textarea{min-height:110px;resize:vertical}
.kf-ed-panel button{border-color:#1b1b19;color:#1b1b19}
.kf-ed-panel .voll{background:#1b1b19;color:#fff}
.kf-ed-panel .zu{border:0;font-size:24px;line-height:1;padding:2px 8px}
.kf-ed-panel .zeile{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.kf-ed-panel .vorschau{max-width:100%;max-height:200px;border-radius:8px;display:block;margin-top:8px;object-fit:contain;background:#f1f0eb}
.kf-ed-panel .hinweis{color:#5c5a54;font-size:13px;margin:6px 0 0}
.kf-ed-panel .eintrag{border:1px solid #e1dfd8;border-radius:10px;padding:10px 12px;margin-top:10px}
.kf-ed-panel .eintrag small{color:#5c5a54}
.kf-ed-panel .fehler{color:#a4161a;font-weight:600;font-size:14px;min-height:1em;margin:8px 0 0}
.kf-ed-panel[hidden]{display:none}
@media (max-width:600px){.kf-ed-panel{top:auto;bottom:140px;height:58vh;right:8px;left:8px;width:auto}.kf-ed-leiste{bottom:74px;border-radius:12px}}
@media (prefers-reduced-motion:reduce){.kf-feld{transition:none}}`;
    document.head.appendChild(css);
    // Websites können damit im Bearbeiten-Modus z. B. leere Bereiche einblenden (html.kf-ed-an)
    document.documentElement.classList.add("kf-ed-an");

    // ---------- Bereiche einrahmen ----------
    for (const b of bereiche) {
      const block = ["mehrzeilig", "neuigkeiten"].includes(b.art);
      const el = document.createElement(block ? "div" : "span");
      el.className = "kf-feld";
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${NAMEN[b.art]} bearbeiten${b.titel ? ": " + b.titel : ""}`);
      el.title = `${NAMEN[b.art]} bearbeiten${b.titel ? " – " + b.titel : ""}`;
      let n = b.anfang.nextSibling;
      while (n && n !== b.ende) { const weiter = n.nextSibling; el.appendChild(n); n = weiter; }
      b.ende.parentNode.insertBefore(el, b.ende);
      b.el = el; b.original = el.innerHTML;
      el.addEventListener("click", e => { if (el.isContentEditable) return; e.preventDefault(); e.stopPropagation(); bearbeiten(b); }, true);
      el.addEventListener("keydown", e => { if (!el.isContentEditable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); bearbeiten(b); } });
    }
    // Gleicher Schlüssel an mehreren Stellen (z. B. Telefon oben und unten): Änderung überall zeigen
    const gleiche = b => bereiche.filter(x => x.schluessel === b.schluessel && x !== b);

    // ---------- Leiste ----------
    const leiste = document.createElement("div");
    leiste.className = "kf-ed-leiste"; leiste.setAttribute("role", "region"); leiste.setAttribute("aria-label", "Bearbeiten");
    document.body.appendChild(leiste);
    const panel = document.createElement("aside");
    panel.className = "kf-ed-panel"; panel.hidden = true; panel.setAttribute("aria-labelledby", "kf-ed-titel");
    document.body.appendChild(panel);

    function leisteZeichnen(text) {
      const n = offen.size;
      leiste.innerHTML = text || `<span><b>Bearbeiten</b> · ${n ? `${n} ${n === 1 ? "Änderung" : "Änderungen"} – noch nicht veröffentlicht` : "Klickt auf eine umrandete Stelle"}</span>
        <button type="button" data-ed="verwerfen"${n ? "" : " disabled"}>Verwerfen</button>
        <button type="button" class="voll" data-ed="veroeffentlichen"${n ? "" : " disabled"}>Veröffentlichen</button>
        <button type="button" data-ed="fertig">Fertig</button>`;
    }
    leisteZeichnen();

    const merken = (b, wert, extra = {}) => {
      offen.set(b.schluessel, { art: b.art, wert, ...extra });
      for (const x of [b, ...gleiche(b)]) x.el.classList.add("kf-geaendert");
      leisteZeichnen();
    };

    // ---------- Bearbeiten je Art ----------
    function bearbeiten(b) {
      textBeenden();
      if (b.art === "text" || b.art === "mehrzeilig") return textBearbeiten(b);
      if (b.art === "bild") return bildPanel(b);
      if (b.art === "link") return linkPanel(b);
      if (b.art === "neuigkeiten") return neuigkeitenPanel(b);
    }

    function textBearbeiten(b) {
      panelZu();
      zustand.aktiv = b;
      const el = b.el;
      el.contentEditable = "true"; el.removeAttribute("role");
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      leisteZeichnen(`<span>Tippt direkt auf der Seite. <b>Strg+B</b> fett, <b>Strg+I</b> kursiv${b.art === "text" ? "" : ", Enter = neuer Absatz"}.</span>
        <button type="button" class="voll" data-ed="text-fertig">Übernehmen</button>`);
    }
    function textBeenden() {
      const b = zustand.aktiv;
      if (!b) return;
      zustand.aktiv = null;
      b.el.contentEditable = "false"; b.el.setAttribute("role", "button");
      const html = b.el.innerHTML.trim();
      if (html !== b.original.trim()) { for (const x of gleiche(b)) x.el.innerHTML = html; merken(b, { html }); }
      else { offen.delete(b.schluessel); b.el.classList.remove("kf-geaendert"); leisteZeichnen(); }
    }
    document.addEventListener("keydown", e => {
      const b = zustand.aktiv;
      if (!b || !b.el.contains(e.target)) return;
      if (e.key === "Escape") { e.preventDefault(); textBeenden(); return; }
      if (e.key === "Enter" && b.art === "text") { e.preventDefault(); textBeenden(); }
    }, true);
    // Eingefügtes immer als reiner Text – keine fremden Formatierungen
    document.addEventListener("paste", e => {
      const b = zustand.aktiv;
      if (!b || !b.el.contains(e.target)) return;
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, b.art === "text" ? t.replace(/\s*\n\s*/g, " ") : t);
    }, true);
    document.addEventListener("click", e => { const b = zustand.aktiv; if (b && !b.el.contains(e.target) && !leiste.contains(e.target)) textBeenden(); }, true);

    // ---------- Seitenfenster ----------
    function panelOeffnen(titel, inhalt) {
      panel.innerHTML = `<header><h2 id="kf-ed-titel">${esc(titel)}</h2><button type="button" class="zu" data-ed="panel-zu" aria-label="Schließen">×</button></header>
        <div class="rumpf">${inhalt}</div>`;
      panel.hidden = false;
      const erstes = panel.querySelector(".rumpf input, .rumpf textarea, .rumpf button"); if (erstes) erstes.focus();
    }
    function panelZu() { panel.hidden = true; panel.innerHTML = ""; }

    function bildPanel(b) {
      const img = b.el.querySelector("img");
      if (!img) return;
      const o = offen.get(b.schluessel);
      panelOeffnen(`Bild${b.titel ? ": " + b.titel : ""}`, `<img class="vorschau" src="${esc(img.currentSrc || img.src)}" alt="">
        <label for="kf-ed-datei">Neues Foto</label><input id="kf-ed-datei" type="file" accept="image/jpeg,image/png,image/webp">
        <label for="kf-ed-alt">Was ist auf dem Bild zu sehen?</label><input id="kf-ed-alt" type="text" maxlength="300" value="${esc(o ? o.wert.alt : img.alt)}">
        <p class="hinweis">Die Beschreibung lesen Suchmaschinen und Menschen, die nicht gut sehen.</p>
        <div class="zeile"><button type="button" class="voll" data-ed="bild-ok">Übernehmen</button></div><p class="fehler" role="alert"></p>`);
      panel.querySelector("#kf-ed-datei").addEventListener("change", async e => {
        const f = e.target.files[0]; if (!f) return;
        try { const blob = await KF.verkleinern(f); panel._blob = blob; panel._name = f.name; panel.querySelector(".vorschau").src = URL.createObjectURL(blob); }
        catch (err) { console.error(err); panel.querySelector(".fehler").textContent = "Dieses Foto lässt sich nicht lesen."; }
      });
      panel._ok = () => {
        const alt = panel.querySelector("#kf-ed-alt").value.trim();
        const blob = panel._blob || (o && o.blob);
        if (!blob) { if (alt !== img.alt) panel.querySelector(".fehler").textContent = "Bitte ein neues Foto wählen."; else panelZu(); return; }
        for (const x of [b, ...gleiche(b)]) { const i = x.el.querySelector("img"); if (i) { i.removeAttribute("srcset"); i.src = URL.createObjectURL(blob); i.alt = alt; } }
        merken(b, { alt }, { blob, name: panel._name || (o && o.name) || "foto.jpg" });
        panelZu();
      };
    }

    function linkPanel(b) {
      const a = b.el.querySelector("a");
      if (!a) return;
      panelOeffnen(`Link${b.titel ? ": " + b.titel : ""}`, `<label for="kf-ed-ltext">Angezeigter Text</label><input id="kf-ed-ltext" type="text" maxlength="200" value="${esc(a.textContent.trim())}">
        <label for="kf-ed-lziel">Ziel (Adresse, Telefon oder E-Mail)</label><input id="kf-ed-lziel" type="text" maxlength="500" value="${esc(a.getAttribute("href") || "")}">
        <p class="hinweis">Beispiele: https://www.beispiel.de · tel:+491771234567 · mailto:info@beispiel.de</p>
        <div class="zeile"><button type="button" class="voll" data-ed="link-ok">Übernehmen</button></div><p class="fehler" role="alert"></p>`);
      panel._ok = () => {
        const text = panel.querySelector("#kf-ed-ltext").value.trim(), href = panel.querySelector("#kf-ed-lziel").value.trim();
        if (!/^(https?:\/\/|mailto:|tel:)/i.test(href) && /:/.test(href.split(/[/?#]/)[0])) { panel.querySelector(".fehler").textContent = "Diese Adresse ist nicht erlaubt."; return; }
        if (!href) { panel.querySelector(".fehler").textContent = "Bitte ein Ziel angeben."; return; }
        for (const x of [b, ...gleiche(b)]) { const l = x.el.querySelector("a"); if (l) { l.textContent = text || href; l.setAttribute("href", href); } }
        merken(b, { text, href });
        panelZu();
      };
    }

    // Neuigkeiten: die ganze Liste ist ein Wert; Fotos werden erst beim Veröffentlichen hochgeladen
    function neuigkeitenPanel(b) {
      const o = offen.get(b.schluessel);
      const liste = o ? o.wert.eintraege : ((letzter(b.schluessel) || {}).wert || {}).eintraege || [];
      const arbeit = { eintraege: liste.map(e => ({ ...e })), blobs: { ...((o && o.blobs) || {}) }, bearbeite: null };
      const zeichnen = () => {
        const e = arbeit.bearbeite;
        panelOeffnen("Neuigkeiten", e ? `
          <label for="kf-n-titel">Überschrift</label><input id="kf-n-titel" type="text" maxlength="200" value="${esc(e.titel)}" required>
          <label for="kf-n-text">Text</label><textarea id="kf-n-text" maxlength="4000">${esc(e.text)}</textarea>
          <label for="kf-n-bis">Sichtbar bis (freiwillig)</label><input id="kf-n-bis" type="date" value="${esc(e.bis || "")}" min="${heute()}">
          <p class="hinweis">Danach verschwindet die Neuigkeit von selbst.</p>
          <label for="kf-n-foto">Foto (freiwillig)</label><input id="kf-n-foto" type="file" accept="image/jpeg,image/png,image/webp">
          ${arbeit.blobs[e.id] || (e.bild && e.bild.pfad) ? `<p class="hinweis">Ein Foto ist ausgewählt.</p>` : ""}
          <div class="zeile"><button type="button" class="voll" data-ed="n-speichern">Speichern</button><button type="button" data-ed="n-abbrechen">Abbrechen</button></div>
          <p class="fehler" role="alert"></p>` : `
          <p class="hinweis" style="margin-top:0">Die neueste steht oben. Alles wird erst mit „Veröffentlichen“ sichtbar.</p>
          <div class="zeile" style="margin-top:6px"><button type="button" class="voll" data-ed="n-neu">Neue Neuigkeit</button></div>
          ${arbeit.eintraege.length ? [...arbeit.eintraege].sort((x, y) => String(y.datum).localeCompare(String(x.datum))).map(x => `<div class="eintrag">
            <b>${esc(x.titel)}</b><br><small>${esc(x.datum)}${x.bis ? ` · sichtbar bis ${esc(x.bis)}${x.bis < heute() ? " (abgelaufen)" : ""}` : ""}</small>
            <div class="zeile" style="margin-top:8px"><button type="button" data-ed="n-bearbeiten" data-id="${esc(x.id)}">Bearbeiten</button>
            <button type="button" data-ed="n-loeschen" data-id="${esc(x.id)}">Löschen</button></div></div>`).join("") : `<p class="hinweis">Noch keine Neuigkeiten.</p>`}
          <div class="zeile"><button type="button" class="voll" data-ed="n-fertig">Übernehmen</button></div>`);
        const foto = panel.querySelector("#kf-n-foto");
        if (foto) foto.addEventListener("change", async ev => { const f = ev.target.files[0]; if (f) arbeit.blobs[arbeit.bearbeite.id] = { blob: await KF.verkleinern(f), name: f.name }; });
      };
      panel._n = aktion => {
        if (aktion === "n-neu") arbeit.bearbeite = { id: kurzId(), datum: heute(), titel: "", text: "", bis: "", neu: true };
        else if (aktion === "n-abbrechen") arbeit.bearbeite = null;
        else if (aktion === "n-speichern") {
          const e = arbeit.bearbeite, titel = panel.querySelector("#kf-n-titel").value.trim();
          if (!titel) { panel.querySelector(".fehler").textContent = "Bitte eine Überschrift eingeben."; return; }
          Object.assign(e, { titel, text: panel.querySelector("#kf-n-text").value, bis: panel.querySelector("#kf-n-bis").value || "" });
          if (e.neu) { delete e.neu; arbeit.eintraege.push(e); }
          arbeit.bearbeite = null;
        } else if (aktion === "n-fertig") {
          for (const x of [b, ...gleiche(b)]) x.el.innerHTML = vorschauHtml(arbeit.eintraege, arbeit.blobs, b.attr.ebene);
          merken(b, { eintraege: arbeit.eintraege.map(({ id, datum, titel, text, bis, bild }) => ({ id, datum, titel, text, bis, ...(bild ? { bild } : {}) })) }, { blobs: arbeit.blobs });
          return panelZu();
        }
        zeichnen();
      };
      panel._nId = (aktion, id) => {
        const i = arbeit.eintraege.findIndex(x => x.id === id);
        if (aktion === "n-bearbeiten") arbeit.bearbeite = arbeit.eintraege[i];
        if (aktion === "n-loeschen" && confirm(`„${arbeit.eintraege[i].titel}“ löschen?`)) { arbeit.eintraege.splice(i, 1); delete arbeit.blobs[id]; }
        zeichnen();
      };
      zeichnen();
    }
    // Vorschau der Neuigkeiten (die endgültige Fassung erzeugt der Wächter)
    function vorschauHtml(eintraege, blobs, ebene) {
      const h = Math.min(6, Math.max(2, +ebene || 3)), t = heute();
      const liste = eintraege.filter(e => !e.bis || e.bis >= t).sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
      if (!liste.length) return `<p class="kf-leer">Gerade gibt es keine Neuigkeiten.</p>`;
      return `<div class="kf-neuigkeiten">${liste.map(e => `<article class="kf-neuigkeit"><time datetime="${esc(e.datum)}">${esc(new Date(e.datum + "T12:00:00").toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }))}</time>
        <h${h}>${esc(e.titel)}</h${h}>${blobs[e.id] ? `<img src="${URL.createObjectURL(blobs[e.id].blob)}" alt="">` : ""}${String(e.text || "").trim().split(/\n\s*\n/).filter(Boolean).map(a => `<p>${esc(a).replace(/\n/g, "<br>")}</p>`).join("")}</article>`).join("")}</div>`;
    }

    // ---------- Veröffentlichen ----------
    async function veroeffentlichen() {
      textBeenden();
      leisteZeichnen(`<span>Wird gespeichert …</span>`);
      try {
        const ids = [];
        for (const [schluessel, o] of offen) {
          let wert = o.wert;
          if (o.art === "bild") wert = { ...wert, pfad: (await be.dateiHochladen(projekt.id, o.blob, o.name)).pfad };
          if (o.art === "neuigkeiten") {
            const eintraege = [];
            for (const e of wert.eintraege) {
              const f = (o.blobs || {})[e.id];
              eintraege.push(f ? { ...e, bild: { pfad: (await be.dateiHochladen(projekt.id, f.blob, f.name)).pfad, alt: e.titel } } : e);
            }
            wert = { eintraege };
          }
          ids.push((await be.inhaltAnlegen({ projekt_id: projekt.id, schluessel, seite_url: location.href, wert })).id);
        }
        offen.clear();
        for (const b of bereiche) { b.el.classList.remove("kf-geaendert"); b.original = b.el.innerHTML; }
        zustand.gesendet = ids;
        warten();
      } catch (e) {
        leisteZeichnen(`<span>Speichern fehlgeschlagen: ${esc(e.message)}</span><button type="button" class="voll" data-ed="veroeffentlichen">Nochmal</button>`);
      }
    }
    // Bis der Wächter die Änderungen übernommen hat (Status „live“ oder „fehler“)
    async function warten(versuch = 0) {
      leisteZeichnen(`<span>Wird veröffentlicht … das dauert meist 1–2 Minuten.</span><button type="button" data-ed="fertig">Weiter bearbeiten später</button>`);
      let zeilen = [];
      try { zeilen = (await be.inhalte(projekt.id)).filter(z => zustand.gesendet.includes(z.id)); } catch (e) {}
      const fehler = zeilen.filter(z => z.status === "fehler");
      if (zeilen.length && zeilen.every(z => z.status !== "neu")) {
        if (fehler.length) return leisteZeichnen(`<span>Nicht übernommen: ${esc(fehler.map(z => z.meldung).join("; "))}</span><button type="button" data-ed="fertig">Schließen</button>`);
        return leisteZeichnen(`<span><b>Veröffentlicht.</b> In etwa einer Minute für alle sichtbar.</span><button type="button" class="voll" data-ed="neu-laden">Seite neu laden</button>`);
      }
      if (versuch > 90) return leisteZeichnen(`<span>Die Automatik hat noch nicht übernommen – eure Änderung ist gespeichert und geht online, sobald sie läuft.</span><button type="button" data-ed="fertig">Schließen</button>`);
      setTimeout(() => warten(versuch + 1), 4000);
    }

    // ---------- Ereignisse ----------
    const ereignis = async e => {
      const t = e.target.closest("[data-ed]");
      if (!t) return;
      const a = t.dataset.ed;
      if (a === "text-fertig") textBeenden();
      else if (a === "panel-zu") panelZu();
      else if (a === "bild-ok" || a === "link-ok") panel._ok();
      else if (/^n-(bearbeiten|loeschen)$/.test(a)) panel._nId(a, t.dataset.id);
      else if (/^n-/.test(a)) panel._n(a);
      else if (a === "verwerfen") { if (confirm("Alle noch nicht veröffentlichten Änderungen verwerfen?")) { offen.clear(); location.reload(); } }
      else if (a === "veroeffentlichen") veroeffentlichen();
      else if (a === "neu-laden") { try { await fetch(location.href, { cache: "reload" }); } catch (err) {} location.reload(); }
      else if (a === "fertig") {
        if (offen.size && !confirm("Es gibt noch nicht veröffentlichte Änderungen. Trotzdem beenden? Sie gehen verloren.")) return;
        offen.clear(); location.reload();
      }
    };
    leiste.addEventListener("click", ereignis);
    panel.addEventListener("click", ereignis);
    panel.addEventListener("keydown", e => { if (e.key === "Escape") panelZu(); });
    window.addEventListener("beforeunload", e => { if (offen.size) { e.preventDefault(); e.returnValue = ""; } });
  };
})();
