// Reiter „SEO & Recht“: Suchmaschinen-Angaben je Seite, Prüfungen, Impressum- und Datenschutz-Vorlage, Cookie-Prüfung.
// SEO-Angaben gehen mit der Seite an den Wächter (wert.seo) und landen im <head>. noindex bleibt – das hebt nur die Agentur auf.
// Impressum und Datenschutz sind VORLAGEN (keine Rechtsberatung): Der Editor fügt einen Abschnitt ein, den der Kunde prüft und anpasst.
(function () {
  const TEILE = (window.KF_STUDIO_TEILE = window.KF_STUDIO_TEILE || []);

  TEILE.push({ id: "seo", titel: "SEO & Recht", aufbauen(ctx, feld) {
    const { editor, esc, kopf, projekt, SEITE } = ctx;
    const k = new DOMParser().parseFromString(kopf + "</head><body></body></html>", "text/html");
    const vorher = {
      titel: k.querySelector("title")?.textContent.trim() || "",
      beschreibung: k.querySelector('meta[name="description"]')?.getAttribute("content") || "",
      bild: k.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
    };
    const gesperrt = /noindex/i.test(k.querySelector('meta[name="robots"]')?.getAttribute("content") || "");
    const seo = () => ({ ...vorher, ...(ctx.zusatz.seo || {}) });
    let bildVorschau = "";
    const RECHT = `kf-recht:${projekt.id}`;
    const recht = () => { try { return JSON.parse(localStorage.getItem(RECHT) || "{}"); } catch (e) { return {}; } };

    const balken = (n, gut, max) => `<span class="${n >= gut[0] && n <= gut[1] ? "ok" : n > max ? "fehler" : ""}" style="font-size:13px">${n} Zeichen ${n >= gut[0] && n <= gut[1] ? "– passt" : n < gut[0] ? `– gut sind ${gut[0]}–${gut[1]}` : "– wird bei Google abgeschnitten"}</span>`;

    function pruefungen() {
      const w = editor.getWrapper(), liste = [];
      const h1 = w.find("h1").length;
      if (!h1) liste.push(["fehler", "Keine Hauptüberschrift (H1). Jede Seite braucht genau eine – sie sagt Google, worum es geht."]);
      if (h1 > 1) liste.push(["", `${h1} Hauptüberschriften (H1). Besser nur eine; die anderen als Zwischenüberschrift (H2).`]);
      const ohneAlt = w.find("img").filter(c => !("alt" in c.getAttributes()) && !c.closest("kf-sperre"));
      if (ohneAlt.length) liste.push(["fehler", `${ohneAlt.length} Foto${ohneAlt.length > 1 ? "s" : ""} ohne Beschreibung (Alternativtext). Doppelt anklicken und beschreiben.`]);
      let stufe = 1;
      for (const c of w.find("h1, h2, h3, h4, h5, h6")) { const n = +c.get("tagName")[1]; if (n > stufe + 1) { liste.push(["", `Überschrift springt von H${stufe} auf H${n} – Stufen nicht überspringen.`]); break; } stufe = n; }
      const schwach = w.find("a").filter(c => /^(hier|klicken|mehr|link)$/i.test((c.getEl()?.textContent || "").trim()));
      if (schwach.length) liste.push(["", `${schwach.length} Link${schwach.length > 1 ? "s" : ""} heißen nur „hier“ oder „mehr“. Besser sagen, wohin es geht.`]);
      if (!seo().beschreibung) liste.push(["", "Keine Beschreibung – Google nimmt dann irgendeinen Satz der Seite."]);
      return liste;
    }

    // Fremde Dienste, die schon beim Öffnen laden, brauchen eine Einwilligung (Cookie-Banner)
    function fremde() {
      const eigen = new URL(SEITE).origin, raus = new Map();
      const pruefen = (u, was) => { try { const x = new URL(u, SEITE); if (/^https?:$/.test(x.protocol) && x.origin !== eigen && !/\/kunden-feedback\/feedback\.js$/.test(x.pathname)) raus.set(x.host, was); } catch (e) {} };
      k.querySelectorAll("script[src]").forEach(s => pruefen(s.getAttribute("src"), "Skript"));
      k.querySelectorAll('link[rel~="stylesheet"][href], link[rel~="preconnect"][href]').forEach(s => pruefen(s.getAttribute("href"), "Schrift/Stil"));
      for (const c of editor.getWrapper().find("img, iframe, video, source")) { const s = c.getAttributes().src || c.get("src"); if (s && !ctx.bildPfade.has(s) && !/studio\/platzhalter\.svg/.test(s)) pruefen(s, c.get("tagName") === "iframe" ? "Einbettung" : "Bild/Video"); }
      return [...raus];
    }

    function zeigen() {
      const s = seo(), r = recht(), f = fremde(), p = pruefungen();
      const seiteHat = re => re.test(editor.getHtml()) || re.test(ctx.kopf);
      feld.innerHTML = `
        ${gesperrt ? `<p class="hinweis" style="border-left:3px solid var(--akzent);padding-left:10px">Diese Seite ist für Suchmaschinen noch gesperrt (noindex). Die Agentur gibt sie frei, wenn alles fertig ist.</p>` : ""}
        <h3 class="baum-titel">Bei Google</h3>
        <div class="seo-vorschau" aria-label="So ungefähr erscheint die Seite bei Google"><span class="seo-adresse">${esc(new URL(SEITE).host + new URL(SEITE).pathname)}</span>
          <span class="seo-titel">${esc(s.titel || "(kein Titel)")}</span><span class="seo-text">${esc(s.beschreibung || "(keine Beschreibung)")}</span></div>
        <div class="feld"><label for="seo-titel">Seitentitel</label><input id="seo-titel" data-seo="titel" maxlength="120" value="${esc(s.titel)}">${balken(s.titel.length, [30, 60], 65)}</div>
        <div class="feld"><label for="seo-beschreibung">Beschreibung</label><textarea id="seo-beschreibung" data-seo="beschreibung" maxlength="320" rows="3">${esc(s.beschreibung)}</textarea>${balken(s.beschreibung.length, [70, 160], 165)}</div>
        <div class="feld"><span style="font-weight:600;font-size:14px">Bild beim Teilen (WhatsApp, Facebook …)</span>
          ${bildVorschau || /^https?:/.test(s.bild) ? `<img src="${esc(bildVorschau || s.bild)}" alt="" style="max-width:100%;border-radius:6px;aspect-ratio:1.91;object-fit:cover">` : ""}
          <button type="button" class="btn klein" data-seo-knopf="bild">${s.bild ? "Anderes Foto wählen" : "Foto wählen"}</button></div>
        <h3 class="baum-titel">Prüfung</h3>
        <ul class="seo-pruefung">${p.map(([art, t]) => `<li class="${art}">${esc(t)}</li>`).join("") || `<li class="ok">Alles Wichtige ist da.</li>`}</ul>

        <h3 class="baum-titel">Cookie-Banner</h3>
        ${f.length ? `<p class="fehler">Diese Seite lädt beim Öffnen Inhalte von fremden Servern: ${f.map(([h, w]) => `${esc(h)} (${esc(w)})`).join(", ")}. Dafür ist vorher eine Einwilligung nötig.
          Besser: lokal einbinden lassen (als KI-Wunsch schicken) – dann braucht es keinen Banner.</p>`
          : `<p class="ok">Kein Cookie-Banner nötig: Die Seite lädt nichts von fremden Servern, bevor jemand zustimmt. Videos und Karten laden erst nach Klick.</p>`}

        <h3 class="baum-titel">Impressum und Datenschutz</h3>
        <p class="hinweis"><strong>Vorlage, keine Rechtsberatung.</strong> Bitte prüfen und anpassen – im Zweifel von einer Fachperson oder einem Dienst wie eRecht24 prüfen lassen.</p>
        <details class="seo-recht"><summary>Impressum</summary>
          ${[["name", "Name bzw. Firma", "z. B. Muster GbR"], ["vertreten", "Vertreten durch / Inhaber", "Vor- und Nachname"], ["strasse", "Straße und Hausnummer", ""], ["ort", "PLZ und Ort", ""],
             ["telefon", "Telefon", ""], ["email", "E-Mail", ""], ["ustid", "USt-IdNr. (falls vorhanden)", "DE123456789"], ["register", "Handelsregister (falls eingetragen)", "Amtsgericht …, HRA …"],
             ["kammer", "Kammer / Aufsicht (falls nötig)", ""], ["verantwortlich", "Verantwortlich für den Inhalt (Name, Anschrift)", ""]].map(([n, t, b]) =>
             `<div class="feld"><label for="r-${n}">${t}</label><input id="r-${n}" data-recht="${n}" value="${esc(r[n] || "")}" placeholder="${esc(b)}"></div>`).join("")}
          <button type="button" class="btn klein haupt" data-seo-knopf="impressum">Impressum auf dieser Seite einfügen</button></details>
        <details class="seo-recht"><summary>Datenschutzerklärung</summary>
          <p class="hinweis">Angekreuzt ist, was die Seite nutzt. Auf anderen Seiten der Website kann mehr vorkommen – bitte ergänzen.</p>
          ${[["formular", "Kontakt- oder Anfrageformular", seiteHat(/data-komp="formular"/) || r.formular], ["youtube", "YouTube-Videos (erst nach Klick)", seiteHat(/data-komp="youtube"/) || r.youtube],
             ["karte", "Karte (erst nach Klick)", seiteHat(/karte|openstreetmap/i) || r.karte], ["email", "Kontakt per E-Mail oder Telefon", true]].map(([n, t, an]) =>
             `<label class="md-schmuck"><input type="checkbox" data-recht-art="${n}" ${an ? "checked" : ""}> ${t}</label>`).join("")}
          <button type="button" class="btn klein haupt" data-seo-knopf="datenschutz" style="margin-top:10px">Datenschutzerklärung auf dieser Seite einfügen</button></details>`;
    }

    feld.addEventListener("input", e => {
      const n = e.target.dataset.seo;
      if (n) { ctx.zusatz.seo = { ...seo(), [n]: e.target.value }; ctx.seiteAendern();
        const v = feld.querySelector(n === "titel" ? ".seo-titel" : ".seo-text"); if (v) v.textContent = e.target.value;
        e.target.nextElementSibling.outerHTML = n === "titel" ? balken(e.target.value.length, [30, 60], 65) : balken(e.target.value.length, [70, 160], 165); }
      if (e.target.dataset.recht) { const r = recht(); r[e.target.dataset.recht] = e.target.value.trim(); try { localStorage.setItem(RECHT, JSON.stringify(r)); } catch (err) {} }
    });

    feld.addEventListener("click", async e => {
      const b = e.target.closest("[data-seo-knopf]")?.dataset.seoKnopf; if (!b) return;
      if (b === "bild") {
        if (!window.KF_MEDIEN) return;
        const x = await window.KF_MEDIEN.waehlen("bild");
        bildVorschau = x.url;
        ctx.zusatz.seo = { ...seo(), bild: x.pfad || new URL(x.src || x.url, SEITE).href };
        ctx.seiteAendern(); return zeigen();
      }
      const r = recht(), arten = Object.fromEntries([...feld.querySelectorAll("[data-recht-art]")].map(x => [x.dataset.rechtArt, x.checked]));
      if (b === "impressum" && !(r.name && r.strasse && r.ort && r.email)) return alert("Bitte mindestens Name, Anschrift und E-Mail eintragen.");
      const html = b === "impressum" ? impressum(r) : datenschutz(r, arten, projekt);
      const id = b === "impressum" ? "kf-impressum" : "kf-datenschutz";
      const alt = editor.getWrapper().find("#" + id)[0];
      if (alt && !confirm("Auf dieser Seite steht schon ein solcher Abschnitt. Ersetzen?")) return;
      const neu = alt ? alt.replaceWith(html)[0] : editor.getWrapper().append(html)[0];
      editor.select(neu); neu.getEl()?.scrollIntoView({ behavior: "smooth", block: "start" });
      ctx.status("Abschnitt eingefügt – bitte lesen und anpassen");
    });

    const e = s => esc(s || "");
    const sek = (id, titel, innen) => `<section id="${id}" style="padding:56px 20px"><div style="max-width:760px;margin:0 auto"><h1>${titel}</h1>${innen}</div></section>`;
    function impressum(r) {
      return sek("kf-impressum", "Impressum", `<h2>Angaben gemäß § 5 DDG</h2>
        <p>${e(r.name)}<br>${r.vertreten ? `Vertreten durch: ${e(r.vertreten)}<br>` : ""}${e(r.strasse)}<br>${e(r.ort)}</p>
        <h2>Kontakt</h2><p>${r.telefon ? `Telefon: ${e(r.telefon)}<br>` : ""}E-Mail: <a href="mailto:${e(r.email)}">${e(r.email)}</a></p>
        ${r.register ? `<h2>Registereintrag</h2><p>${e(r.register)}</p>` : ""}
        ${r.ustid ? `<h2>Umsatzsteuer</h2><p>Umsatzsteuer-Identifikationsnummer nach § 27a Umsatzsteuergesetz: ${e(r.ustid)}</p>` : ""}
        ${r.kammer ? `<h2>Aufsicht und Kammer</h2><p>${e(r.kammer)}</p>` : ""}
        ${r.verantwortlich ? `<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2><p>${e(r.verantwortlich)}</p>` : ""}
        <h2>Verbraucherstreitbeilegung</h2><p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>`);
    }
    function datenschutz(r, a, p) {
      const hoster = p.hosting === "sftp" || /strato/i.test(p.domain || "") ? "STRATO GmbH, Otto-Ostrowski-Straße 7, 10249 Berlin"
        : p.hosting === "github" ? "GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA (Übermittlung in die USA auf Grundlage des EU-US Data Privacy Framework)"
        : "[Name und Anschrift des Hosting-Anbieters eintragen]";
      const wer = r.name ? `${e(r.name)}${r.vertreten ? `, vertreten durch ${e(r.vertreten)}` : ""}<br>${e(r.strasse)}<br>${e(r.ort)}<br>E-Mail: ${e(r.email)}` : "[Name, Anschrift und E-Mail eintragen – wie im Impressum]";
      return sek("kf-datenschutz", "Datenschutzerklärung", `
        <h2>1. Wer ist verantwortlich?</h2><p>${wer}</p>
        <h2>2. Aufruf der Website</h2><p>Die Website liegt bei ${hoster}. Beim Aufruf verarbeitet der Server technisch nötige Daten (IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, Browser) in Protokolldateien, um die Seite sicher auszuliefern. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Die Protokolle werden nach kurzer Zeit gelöscht. Mit dem Anbieter besteht ein Vertrag zur Auftragsverarbeitung.</p>
        <h2>3. Cookies und Analyse</h2><p>Wir setzen keine Cookies zur Analyse oder Werbung ein und binden keine Tracking-Dienste ein. Schriften liegen auf unserem eigenen Server.</p>
        ${a.email ? `<h2>4. Kontakt per E-Mail oder Telefon</h2><p>Wenn ihr uns schreibt oder anruft, verarbeiten wir eure Angaben, um die Anfrage zu beantworten (Art. 6 Abs. 1 lit. b und f DSGVO). Wir löschen sie, wenn sie nicht mehr nötig sind und keine Aufbewahrungspflicht besteht.</p>` : ""}
        ${a.formular ? `<h2>Kontakt- und Anfrageformular</h2><p>Was ihr im Formular eintragt, wird an unseren Dienstleister Supabase (Supabase Inc., Rechenzentrum in der EU) übertragen und dort gespeichert, damit wir antworten können. Rechtsgrundlage ist eure Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die ihr jederzeit für die Zukunft widerrufen könnt, bzw. die Anbahnung eines Vertrags (Art. 6 Abs. 1 lit. b DSGVO). Zum Schutz vor Missbrauch speichern wir zusätzlich einen nicht rückverfolgbaren Prüfwert der IP-Adresse. Wir löschen die Anfrage, sobald sie erledigt ist und keine Aufbewahrungspflicht besteht.</p>` : ""}
        ${a.youtube ? `<h2>YouTube-Videos</h2><p>Videos von YouTube (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland) laden erst, wenn ihr auf „Video laden“ klickt. Erst dann werden Daten wie die IP-Adresse an YouTube übertragen; dabei kann es auch zu einer Übermittlung in die USA kommen. Wir nutzen den erweiterten Datenschutzmodus (youtube-nocookie.com). Rechtsgrundlage ist eure Einwilligung durch den Klick (Art. 6 Abs. 1 lit. a DSGVO).</p>` : ""}
        ${a.karte ? `<h2>Karte</h2><p>Die Karte lädt erst nach eurem Klick. Dann werden Kartenausschnitte vom Kartendienst geladen und dabei eure IP-Adresse an dessen Server übertragen. Rechtsgrundlage ist eure Einwilligung durch den Klick (Art. 6 Abs. 1 lit. a DSGVO). [Kartendienst mit Anschrift eintragen, z. B. OpenStreetMap Foundation.]</p>` : ""}
        <h2>Eure Rechte</h2><p>Ihr habt das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung, auf Datenübertragbarkeit sowie auf Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 15–21 DSGVO). Eine Einwilligung könnt ihr jederzeit widerrufen. Ihr könnt euch außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel in eurem Bundesland.</p>
        <p><small>Stand: ${new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</small></p>`);
    }

    document.querySelector('[data-reiter="seo"]').addEventListener("click", zeigen);
  } });
})();
