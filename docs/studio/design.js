// Reiter „Design“: Farben und Schriften der ganzen Seite an einer Stelle.
// Farben sind die CSS-Variablen der Website (:root{--…}) plus die der Editor-Bausteine (--kf-akzent usw.). Änderungen landen als
// :root-Regel in <seite>.kf.css, die nach dem Stylesheet der Website geladen wird – so wirkt eine Farbe überall, wo sie benutzt wird.
// Schriften: nur, was die Website schon mitbringt (@font-face) oder jedes Gerät hat – keine Abrufe bei Google (DSGVO).
(function () {
  const TEILE = (window.KF_STUDIO_TEILE = window.KF_STUDIO_TEILE || []);
  const EIGENE = { "--kf-akzent": "Akzent (Knöpfe)", "--kf-auf-akzent": "Schrift auf Akzent", "--kf-linie": "Linien und Rahmen" };
  const SYSTEM = [["Serifen (klassisch)", 'Georgia, "Times New Roman", serif'], ["Ohne Serifen (modern)", 'system-ui, "Segoe UI", Roboto, Arial, sans-serif'],
    ["Rund", 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'], ["Schreibmaschine", 'ui-monospace, Consolas, "Courier New", monospace']];

  TEILE.push({ id: "design", titel: "Design", aufbauen(ctx, feld) {
    const { editor, esc } = ctx;
    const css = editor.Css;
    const regel = sel => css.getRule(sel);
    const stil = sel => ({ ...((regel(sel) || {}).getStyle?.() || {}) });
    function setzen(sel, aenderung) {
      const s = stil(sel);
      for (const [k, v] of Object.entries(aenderung)) { if (v === "" || v == null) delete s[k]; else s[k] = v; }
      css.setRule(sel, s);
      ctx.seiteAendern();
    }
    // Farbe in #rrggbb für <input type=color> (Variablen können rgb(), Namen usw. sein)
    const probe = document.createElement("canvas").getContext("2d");
    const alsHex = w => { probe.fillStyle = "#000"; probe.fillStyle = w; const f = probe.fillStyle; return /^#[0-9a-f]{6}$/i.test(f) ? f : "#000000"; };
    const istFarbe = w => w && !/var\(|gradient|url\(/i.test(w) && CSS.supports("color", w.trim());
    const name = v => EIGENE[v] || v.replace(/^--/, "").replace(/[-_]+/g, " ").replace(/^\w/, c => c.toUpperCase());

    function auslesen() {
      const doc = editor.Canvas.getDocument(), vars = new Map(), schriften = new Set();
      const gehen = regeln => { for (const r of regeln || []) {
        if (r.cssRules && !r.selectorText) gehen(r.cssRules);
        if (r.type === CSSRule.FONT_FACE_RULE) { const f = r.style.getPropertyValue("font-family").replace(/["']/g, "").trim(); if (f) schriften.add(f); }
        if (r.selectorText && /(^|,)\s*(:root|html)\s*(,|$)/.test(r.selectorText))
          for (const p of r.style) if (p.startsWith("--") && !vars.has(p)) vars.set(p, r.style.getPropertyValue(p).trim());
      } };
      for (const s of doc.styleSheets) { try { gehen(s.cssRules); } catch (e) {} }  // fremde Stylesheets lassen sich nicht lesen
      for (const [k, v] of Object.entries(stil(":root"))) vars.set(k, v);
      for (const k of Object.keys(EIGENE)) if (!vars.has(k)) vars.set(k, "");
      return { vars, schriften: [...schriften] };
    }

    function zeigen() {
      const { vars, schriften } = auslesen();
      const farben = [...vars].filter(([k, v]) => EIGENE[k] || istFarbe(v));
      const auswahl = (id, titel, aktuell) => `<div class="feld"><label for="${id}">${titel}</label><select id="${id}" data-schrift="${id}">
        <option value="">Wie bisher</option>${schriften.map(f => `<option value="'${esc(f)}', sans-serif">${esc(f)} (von der Website)</option>`).join("")}
        ${SYSTEM.map(([n, w]) => `<option value="${esc(w)}">${esc(n)}</option>`).join("")}</select></div>`;
      feld.innerHTML = `<p class="hinweis">Farben und Schriften gelten für die ganze Seite. Was hier nicht steht, lässt sich je Element unter „Gestalten“ ändern.</p>
        <h3 class="baum-titel">Farben</h3>
        ${farben.map(([k, v]) => `<div class="feld ds-farbe"><label for="ds${esc(k)}">${esc(name(k))}</label>
          <span class="zeile"><input type="color" id="ds${esc(k)}" data-var="${esc(k)}" value="${alsHex(v || (k === "--kf-auf-akzent" ? "#ffffff" : "#333333"))}">
          <input type="text" data-var-text="${esc(k)}" value="${esc(v)}" placeholder="${v ? "" : "wie die Website"}" aria-label="${esc(name(k))} als Wert" spellcheck="false"></span></div>`).join("")}
        <h3 class="baum-titel">Schriften</h3>
        ${auswahl("ds-text", "Fließtext", "")}${auswahl("ds-ueber", "Überschriften", "")}
        <div class="feld"><label for="ds-groesse">Grundgröße der Schrift: <span id="ds-groesse-wert">${esc(stil("body")["font-size"] || "wie bisher")}</span></label>
          <input type="range" id="ds-groesse" min="14" max="22" step="1" value="${parseInt(stil("body")["font-size"]) || 16}"></div>
        <button type="button" class="btn klein" data-ds="zurueck">Design-Änderungen zurücksetzen</button>`;
      const t = stil("body")["font-family"], u = stil("h1, h2, h3, h4")["font-family"];
      if (t) feld.querySelector("#ds-text").value = t;
      if (u) feld.querySelector("#ds-ueber").value = u;
    }

    feld.addEventListener("input", e => {
      const v = e.target.dataset.var, vt = e.target.dataset.varText;
      if (v) { feld.querySelector(`[data-var-text="${CSS.escape(v)}"]`).value = e.target.value; setzen(":root", { [v]: e.target.value }); }
      if (vt && (!e.target.value || CSS.supports("color", e.target.value))) setzen(":root", { [vt]: e.target.value.trim() });
      if (e.target.id === "ds-groesse") { feld.querySelector("#ds-groesse-wert").textContent = e.target.value + " px"; setzen("body", { "font-size": e.target.value + "px" }); }
    });
    feld.addEventListener("change", e => {
      if (e.target.id === "ds-text") setzen("body", { "font-family": e.target.value });
      if (e.target.id === "ds-ueber") setzen("h1, h2, h3, h4", { "font-family": e.target.value });
    });
    feld.addEventListener("click", e => {
      if (!e.target.closest('[data-ds="zurueck"]') || !confirm("Farben und Schriften wieder wie auf der Website?")) return;
      for (const s of [":root", "body", "h1, h2, h3, h4"]) { const r = regel(s); if (r) css.remove(r); }
      ctx.seiteAendern(); zeigen();
    });
    document.querySelector('[data-reiter="design"]').addEventListener("click", zeigen);
    // Für den KI-Assistenten: Farbschema übernehmen
    window.KF_DESIGN = { setzen: farben => { setzen(":root", farben); zeigen(); }, variablen: () => Object.fromEntries(auslesen().vars) };
  } });
})();
