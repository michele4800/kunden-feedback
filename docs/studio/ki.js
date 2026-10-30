// Reiter „KI“: Texte umschreiben, eine Sektion aus einer Beschreibung bauen, ein Farbschema vorschlagen.
// Läuft über die Edge Function „ki-assistent“ (Claude, Schlüssel nur als Supabase-Secret, Tageslimit je Projekt).
// Die KI schlägt nur vor: Erst „Übernehmen“ ändert die Seite, veröffentlicht wird wie immer über den Wächter (der nochmals bereinigt).
// Große Umbauten („baue mir eine neue Seite“) gehen weiter als KI-Wunsch an die Agentur.
(function () {
  const TEILE = (window.KF_STUDIO_TEILE = window.KF_STUDIO_TEILE || []);
  const WUENSCHE = [["kuerzer", "Kürzer"], ["freundlicher", "Freundlicher"], ["foermlicher", "Förmlicher"], ["fehler", "Rechtschreibung prüfen"]];
  // Vorschläge der KI vor dem Einfügen säubern: keine Skripte, Ereignisse, Einbettungen oder javascript:-Adressen
  const ERLAUBT = new Set("SECTION DIV P H2 H3 H4 UL OL LI A STRONG EM B I BR SPAN BLOCKQUOTE FIGURE FIGCAPTION IMG DETAILS SUMMARY TABLE THEAD TBODY TR TH TD HR SMALL".split(" "));
  function saeubern(html) {
    const d = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    for (const el of [...d.body.querySelectorAll("*")]) {
      if (!ERLAUBT.has(el.tagName)) { el.replaceWith(...(/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|NOSCRIPT|SVG|MATH)$/.test(el.tagName) ? [] : el.childNodes)); continue; }
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        if (!/^(class|style|href|src|alt|title|id|aria-[a-z-]+|role|loading)$/.test(n) || /^\s*(javascript|data|vbscript):/i.test(a.value) || (n === "style" && /url\(|expression/i.test(a.value))) el.removeAttribute(a.name);
      }
    }
    return d.body.innerHTML;
  }

  TEILE.push({ id: "ki", titel: "KI", aufbauen(ctx, feld) {
    const { editor, be, projekt, esc } = ctx;
    let vorschlag = null;  // { art, wert, ziel }

    const gewaehlterText = () => {
      const c = editor.getSelected();
      if (!c || c.closest("kf-sperre")) return null;
      const t = c.is("text") ? c : ["h1", "h2", "h3", "h4", "p", "li", "blockquote"].includes(c.get("tagName")) ? c : null;
      return t && (t.getEl()?.textContent || "").trim() ? t : null;
    };

    function zeigen() {
      const t = gewaehlterText();
      feld.innerHTML = `<p class="hinweis">Die KI macht Vorschläge – übernommen wird erst, wenn ihr auf „Übernehmen“ klickt. Für größere Umbauten bitte „KI-Wunsch“ nutzen.</p>
        <h3 class="baum-titel">Text umschreiben</h3>
        ${t ? `<p class="ki-zitat">${esc((t.getEl().textContent || "").trim().slice(0, 240))}</p>
          <div class="zeile" style="flex-wrap:wrap">${WUENSCHE.map(([k, n]) => `<button type="button" class="btn klein" data-ki-text="${k}">${n}</button>`).join("")}</div>
          <div class="feld" style="margin-top:8px"><label for="ki-wunsch">Oder eigener Wunsch</label><input id="ki-wunsch" maxlength="300" placeholder="z. B. mehr Lust auf frische Eier machen"></div>
          <button type="button" class="btn klein" data-ki-text="eigen">Umschreiben</button>`
          : `<p class="hinweis">Erst auf der Seite einen Text anklicken (Überschrift oder Absatz).</p>`}
        <h3 class="baum-titel">Neue Sektion</h3>
        <div class="feld"><label for="ki-sektion">Was soll drinstehen?</label><textarea id="ki-sektion" rows="3" maxlength="1000" placeholder="z. B. Abschnitt über unsere Hühner: Freilandhaltung, 400 Tiere, Eier jeden Morgen frisch"></textarea></div>
        <button type="button" class="btn klein" data-ki="sektion">Sektion vorschlagen</button>
        <h3 class="baum-titel">Farbschema</h3>
        <div class="feld"><label for="ki-farben">Wie soll es wirken?</label><input id="ki-farben" maxlength="300" placeholder="z. B. ländlich, warm, freundlich"></div>
        <button type="button" class="btn klein" data-ki="farben">Farben vorschlagen</button>
        <div id="ki-ergebnis" role="status" style="margin-top:16px"></div>`;
    }

    async function fragen(aufgabe, daten, ziel) {
      const box = feld.querySelector("#ki-ergebnis");
      feld.querySelectorAll("button").forEach(b => b.disabled = true);
      box.innerHTML = `<p class="hinweis">Die KI denkt nach …</p>`;
      try {
        const x = await be.ki(projekt.id, aufgabe, daten);
        if (aufgabe === "text") vorschlag = { art: "text", wert: saeubern(x.text || ""), ziel };
        if (aufgabe === "sektion") vorschlag = { art: "sektion", wert: saeubern(x.html || "") };
        if (aufgabe === "farben") vorschlag = { art: "farben", wert: Object.fromEntries(Object.entries(x.farben || {}).filter(([k, v]) => /^--[\w-]{1,40}$/.test(k) && CSS.supports("color", v))), erklaerung: x.erklaerung || "" };
        if (!vorschlag || !(typeof vorschlag.wert === "string" ? vorschlag.wert.trim() : Object.keys(vorschlag.wert).length)) throw new Error("Die KI hat nichts Brauchbares geliefert. Bitte anders formulieren.");
        box.innerHTML = `<div class="eintrag"><h4>Vorschlag</h4>
          ${vorschlag.art === "farben" ? `<div class="ki-farben">${Object.entries(vorschlag.wert).map(([k, v]) => `<span title="${esc(k)}: ${esc(v)}" style="background:${esc(v)}"></span>`).join("")}</div><p class="meta">${esc(vorschlag.erklaerung)}</p>`
            : vorschlag.art === "text" ? `<p>${vorschlag.wert}</p>` : `<div class="ki-sektion">${vorschlag.wert}</div>`}
          <div class="zeile"><button type="button" class="btn klein haupt" data-ki="uebernehmen">Übernehmen</button><button type="button" class="btn klein" data-ki="verwerfen">Verwerfen</button></div>
          ${x.rest != null ? `<p class="meta">Heute noch ${x.rest} Anfragen frei.</p>` : ""}</div>`;
      } catch (e) { box.innerHTML = `<p class="fehler">${esc(e.message)}</p>`; }
      feld.querySelectorAll("button").forEach(b => b.disabled = false);
    }

    feld.addEventListener("click", e => {
      const b = e.target.closest("[data-ki-text], [data-ki]"); if (!b) return;
      if (b.dataset.kiText) {
        const t = gewaehlterText(); if (!t) return zeigen();
        const wunsch = b.dataset.kiText === "eigen" ? feld.querySelector("#ki-wunsch").value.trim() : b.dataset.kiText;
        if (!wunsch) return feld.querySelector("#ki-wunsch").focus();
        return fragen("text", { text: t.toHTML ? t.getInnerHTML() : t.getEl().innerHTML, wunsch }, t);
      }
      const a = b.dataset.ki;
      if (a === "sektion") { const v = feld.querySelector("#ki-sektion").value.trim(); return v ? fragen("sektion", { text: v }) : feld.querySelector("#ki-sektion").focus(); }
      if (a === "farben") { const v = feld.querySelector("#ki-farben").value.trim(); return v ? fragen("farben", { text: v, aktuell: window.KF_DESIGN?.variablen() || {} }) : feld.querySelector("#ki-farben").focus(); }
      if (a === "verwerfen") { vorschlag = null; feld.querySelector("#ki-ergebnis").innerHTML = ""; }
      if (a === "uebernehmen" && vorschlag) {
        if (vorschlag.art === "text") { vorschlag.ziel.components(vorschlag.wert); editor.select(vorschlag.ziel); }
        if (vorschlag.art === "farben") window.KF_DESIGN?.setzen(vorschlag.wert);
        if (vorschlag.art === "sektion") {
          // hinter dem gewählten Abschnitt einfügen, sonst ans Ende
          const g = editor.getSelected(), abschnitt = g && [g, ...g.parents()].find(c => ["section", "header", "footer", "article"].includes(c.get("tagName")) && c.parent());
          const neu = abschnitt ? abschnitt.parent().components().add(vorschlag.wert, { at: abschnitt.index() + 1 }) : editor.getWrapper().append(vorschlag.wert);
          const c = Array.isArray(neu) ? neu[0] : neu; editor.select(c); c.getEl()?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        vorschlag = null; feld.querySelector("#ki-ergebnis").innerHTML = `<p class="ok">Übernommen. Mit „Rückgängig“ lässt es sich zurücknehmen.</p>`;
      }
    });
    document.querySelector('[data-reiter="ki"]').addEventListener("click", zeigen);
    editor.on("component:selected", () => { if (!feld.hidden && !vorschlag) zeigen(); });
  } });
})();
