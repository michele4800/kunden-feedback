// Kunden-Feedback-Widget. Einbinden auf jeder Seite der Kunden-Website:
//   <script src="https://…/kunden-feedback/feedback.js" data-projekt="projekt-slug" defer></script>
// Optional: data-portal="URL des Portals" (Standard: portal/ neben dieser Datei)
//
// Werkzeuge für Kunden: Art des Wunsches, Text direkt auf der Seite ändern, Stelle markieren,
// Fotos anhängen (werden im Browser verkleinert), Farbe wählen (mit Pipette), Wichtigkeit.
(function () {
  const skript = document.currentScript;
  if (!skript || window.__kfWidget) return;
  window.__kfWidget = true;
  const BASIS = skript.src.replace(/[^/]*$/, "");
  const SLUG = skript.dataset.projekt;
  const PORTAL = skript.dataset.portal || BASIS + "portal/";
  if (!SLUG) { console.warn("Kunden-Feedback: data-projekt fehlt"); return; }

  const laden = src => new Promise((ok, fehler) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = fehler; document.head.appendChild(s); });

  async function start() {
    await laden(BASIS + "konfig.js");
    if ((window.KF_KONFIG || {}).url) await laden(BASIS + "vendor/supabase.js");
    await laden(BASIS + "backend.js");
    widget(await window.KundenFeedback.backend());
  }

  function widget(be) {
    const KF = window.KundenFeedback, esc = KF.esc;
    const SEITE = location.pathname.replace(/index\.html$/, "");
    let projekt = null, namen = {}, offen = false, stopp = null;
    // Entwurf des neuen Wunsches – bleibt erhalten, während der Kunde auf der Seite markiert oder Text ändert
    const leer = () => ({ art: "sonstiges", text: "", stelle: null, details: {}, dateien: [], wichtig: 2 });
    let neu = leer();

    const HINWEIS = {
      text: "Klicke auf „Text auf der Seite ändern“ und schreib den Text direkt um. Wir sehen genau, was vorher und nachher dasteht.",
      foto: "Häng eure Fotos an und markiere am besten das Foto auf der Seite, das ersetzt werden soll.",
      design: "Wähle eine Farbe (oder nimm sie mit der Pipette von der Seite) und markiere die Stelle.",
      inhalt: "Beschreibe, was neu dazukommen soll, und markiere die Stelle, wo es hin soll.",
      fehler: "Markiere die Stelle und beschreibe, was nicht stimmt.",
      sonstiges: "Beschreibe einfach, was anders sein soll.",
    };

    const css = document.createElement("style");
    css.textContent = `
.kf-knopf{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:600 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;background:#1b1b19;color:#fff;border:0;border-radius:999px;padding:13px 18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28);display:flex;gap:8px;align-items:center}
.kf-knopf:focus-visible,.kf *:focus-visible,.kf-markieren button:focus-visible{outline:3px solid #2f6f8a;outline-offset:2px}
.kf-zahl{background:#f2c14e;color:#1b1b19;border-radius:999px;padding:2px 7px;font-size:12px}
.kf{position:fixed;inset:0 0 0 auto;margin:0 0 0 auto;width:min(460px,100vw);max-width:100vw;height:100dvh;max-height:100dvh;border:0;padding:0;background:#fff;color:#1b1b19;font:400 15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:-10px 0 30px rgba(0,0,0,.2);z-index:2147483001}
.kf::backdrop{background:rgba(0,0,0,.35)}
.kf-innen{display:flex;flex-direction:column;height:100%}
.kf-kopf{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #e3e1da}
.kf-kopf h2{font:700 17px/1.3 system-ui,sans-serif;margin:0;letter-spacing:normal;text-transform:none;color:inherit}
.kf-kopf small{display:block;color:#5c5a54;font-weight:400;font-size:13px}
.kf-rumpf{overflow:auto;padding:16px 18px 28px;flex:1}
.kf button,.kf input,.kf textarea{font:inherit}
.kf-zu{background:none;border:0;font-size:24px;line-height:1;cursor:pointer;padding:4px 8px;color:inherit}
.kf label,.kf .kf-titel{display:block;font-weight:600;margin:14px 0 6px}
.kf input[type=text],.kf input[type=email],.kf input[type=password],.kf textarea{width:100%;box-sizing:border-box;border:1px solid #8a877f;border-radius:8px;padding:10px 12px;background:#fff;color:#1b1b19}
.kf textarea{min-height:84px;resize:vertical}
.kf-btn{border:2px solid #1b1b19;background:#1b1b19;color:#fff;border-radius:999px;padding:9px 16px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;font-size:15px}
.kf-btn.hell{background:#fff;color:#1b1b19}
.kf-btn.klein{padding:5px 12px;font-size:13px}
.kf-btn:disabled{opacity:.55;cursor:wait}
.kf-zeile{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.kf-hinweis{font-size:13px;color:#5c5a54;margin:8px 0 0}
.kf-fehler{color:#a4161a;font-weight:600;margin:10px 0 0;min-height:1em}
.kf-demo{background:#fff3cc;border-left:4px solid #b98900;padding:8px 12px;font-size:13px;margin-bottom:12px}
.kf-waechter{display:flex;gap:8px;align-items:center;font-size:13px;color:#5c5a54;margin:0 0 6px}
.kf-punkt{width:9px;height:9px;border-radius:50%;background:#a7a59d;flex:none}
.kf-punkt.an{background:#2d8a3e;box-shadow:0 0 0 3px rgba(45,138,62,.18)}
.kf h3{font:700 15px/1.3 system-ui,sans-serif;margin:24px 0 8px;letter-spacing:normal;text-transform:none;color:inherit}
.kf-arten{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;border:0;padding:0;margin:0}
.kf-arten legend{font-weight:600;margin:14px 0 6px;padding:0}
.kf-arten label{margin:0;font-weight:500;font-size:13px;border:2px solid #e3e1da;border-radius:10px;padding:8px 6px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px}
.kf-arten label span{font-size:18px;line-height:1}
.kf-arten input{position:absolute;opacity:0;width:1px;height:1px}
.kf-arten label:has(input:checked){border-color:#1b1b19;background:#f3f2ee}
.kf-arten label:has(input:focus-visible){outline:3px solid #2f6f8a;outline-offset:2px}
.kf-werkzeuge{margin-top:8px}
.kf-werkzeuge button{font:inherit;font-weight:500;font-size:13px;color:inherit;background:#fff;border:2px dashed #c9c6bc;border-radius:10px;padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px}
.kf-werkzeuge button span{font-size:18px;line-height:1}
.kf-werkzeuge button:hover{border-color:#1b1b19}
.kf-werkzeuge button[aria-pressed=true]{border-style:solid;border-color:#1b1b19;background:#f3f2ee}
.kf-werkzeuge button:focus-visible{outline:3px solid #2f6f8a;outline-offset:2px}
.kf-schritte{display:flex;gap:4px;list-style:none;margin:8px 0 0;padding:0;font-size:12px;color:#6b6a63}
.kf-schritte li{flex:1;border-top:4px solid #e3e1da;padding-top:4px}
.kf-schritte li.fertig{border-color:#2d8a3e;color:#1b1b19}
.kf-schritte li.jetzt{border-color:#1e3a8a;color:#1e3a8a;font-weight:700}
@media (prefers-reduced-motion:no-preference){.kf-schritte li.jetzt{animation:kf-puls 1.4s ease-in-out infinite}@keyframes kf-puls{50%{border-color:#93c5fd}}}
.kf-box{background:#f6f5f1;border-radius:10px;padding:10px 12px;margin-top:10px;font-size:14px}
.kf-box del{color:#8a1c1c}.kf-box ins{color:#1d5a2a;text-decoration:none;font-weight:600}
.kf-farbe{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.kf-farbe input[type=color]{width:44px;height:36px;border:1px solid #8a877f;border-radius:8px;padding:2px;background:#fff;cursor:pointer}
.kf-tupfer{display:inline-block;width:16px;height:16px;border-radius:4px;border:1px solid rgba(0,0,0,.2);vertical-align:-3px;margin-right:4px}
.kf-fotos{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.kf-foto{position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;background:#eee}
.kf-foto img{width:100%;height:100%;object-fit:cover;display:block}
.kf-foto button{position:absolute;top:2px;right:2px;width:24px;height:24px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;cursor:pointer;line-height:1}
.kf-wichtig{display:flex;gap:14px;flex-wrap:wrap;border:0;padding:0;margin:0}
.kf-wichtig legend{font-weight:600;margin:14px 0 6px;padding:0}
.kf-wichtig label{margin:0;font-weight:400;display:flex;gap:6px;align-items:center}
.kf-datei{position:absolute;width:1px;height:1px;opacity:0}
.kf-liste{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.kf-w{border:1px solid #e3e1da;border-radius:10px;padding:12px}
.kf-w p{margin:6px 0 0;white-space:pre-wrap;word-break:break-word}
.kf-status{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:#ecebe6}
.kf-status.in_arbeit{background:#dbeafe;color:#1e3a8a}.kf-status.rueckfrage{background:#fde68a;color:#78350f}
.kf-status.zur_freigabe{background:#e9d5ff;color:#581c87}.kf-status.erledigt{background:#d1fae5;color:#065f46}.kf-status.abgelehnt{background:#fee2e2;color:#7f1d1d}
.kf-etikett{display:inline-block;font-size:12px;border:1px solid #d6d3ca;border-radius:999px;padding:1px 8px;margin-left:4px;color:#47453f}
.kf-etikett.wichtig{border-color:#a4161a;color:#a4161a}
.kf-arbeit{font-size:13px;color:#1e3a8a;margin-top:6px}
.kf-meta{font-size:12px;color:#6b6962;margin-top:6px}
.kf-k{border-top:1px dashed #e3e1da;margin-top:10px;padding-top:8px}
.kf-k div{font-size:14px;margin-top:6px}.kf-k b{font-weight:600}
.kf-k form{display:flex;gap:6px;margin-top:8px}.kf-k input{flex:1;border:1px solid #8a877f;border-radius:8px;padding:6px 10px}
.kf-nur{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.kf-markieren{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483002;background:#1b1b19;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)}
.kf-markieren button{font:600 14px system-ui,sans-serif;border-radius:999px;padding:6px 14px;border:2px solid #fff;cursor:pointer}
.kf-markieren .ja{background:#fff;color:#1b1b19}.kf-markieren .nein{background:transparent;color:#fff}
.kf-ziel{outline:3px dashed #2f6f8a!important;outline-offset:2px!important;cursor:crosshair!important}
.kf-bearbeiten{outline:3px solid #f2c14e!important;outline-offset:3px!important;background:rgba(242,193,78,.12)!important;cursor:text!important}
.kf-pin{position:absolute;z-index:2147482999;width:26px;height:26px;border-radius:50% 50% 50% 4px;background:#2f6f8a;color:#fff;font:700 12px/26px system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none}
@media (prefers-reduced-motion:no-preference){.kf[open]{animation:kf-rein .18s ease-out}@keyframes kf-rein{from{transform:translateX(30px);opacity:.6}}}
`;
    document.head.appendChild(css);

    const knopf = document.createElement("button");
    knopf.type = "button"; knopf.className = "kf-knopf"; knopf.setAttribute("aria-haspopup", "dialog");
    knopf.textContent = "Wünsche";
    const dlg = document.createElement("dialog");
    dlg.className = "kf"; dlg.setAttribute("aria-labelledby", "kf-titel");
    document.body.append(knopf, dlg);
    const öffnen = () => { if (!dlg.open) dlg.showModal(); offen = true; return zeichnen(); };
    knopf.addEventListener("click", öffnen);
    dlg.addEventListener("close", () => { offen = false; pinsEntfernen(); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

    const rahmen = (titel, unter, inhalt) => `<div class="kf-innen"><div class="kf-kopf"><div><h2 id="kf-titel">${titel}</h2>${unter ? `<small>${unter}</small>` : ""}</div>
      <button type="button" class="kf-zu" data-aktion="schliessen" aria-label="Schließen">×</button></div><div class="kf-rumpf">${inhalt}</div></div>`;

    // ---------- Ansichten ----------
    async function zeichnen() {
      const s = await be.sitzung();
      if (!s) return anmeldung();
      projekt = projekt || await be.projekt(SLUG);
      if (!projekt) { dlg.innerHTML = rahmen("Wünsche", "", `<p>Für dieses Konto ist hier kein Projekt freigegeben.</p><button class="kf-btn hell" data-aktion="abmelden">Abmelden</button>`); return; }
      const [mitglieder, wuensche, kommentare, auto] = await Promise.all([be.mitglieder(projekt.id), be.wuensche(projekt.id), be.kommentare(projekt.id), be.automatik(projekt.id)]);
      namen = Object.fromEntries(mitglieder.map(m => [m.user_id, m.anzeigename || (m.rolle === "agentur" ? "Agentur" : "Kunde")]));
      const hier = wuensche.filter(w => urlPfad(w.seite_url) === SEITE);
      const w8 = KF.waechterText(auto);
      const scroll = dlg.querySelector(".kf-rumpf")?.scrollTop || 0;
      dlg.innerHTML = rahmen("Wünsche zu dieser Seite", esc(projekt.name) + " · " + esc(namen[s.user.id] || s.user.email), `
        ${be.istDemo ? `<p class="kf-demo">Demo-Modus: Daten bleiben nur in diesem Browser.</p>` : ""}
        <p class="kf-waechter"><span class="kf-punkt${w8.aktiv ? " an" : ""}"></span>${esc(w8.text)}</p>
        ${formular()}
        <h3>Bisherige Wünsche hier (${hier.length})</h3>
        <ul class="kf-liste">${hier.length ? hier.map((w, i) => karte(w, i + 1, kommentare.filter(k => k.wunsch_id === w.id), s.user.id)).join("") : `<li class="kf-hinweis">Zu dieser Seite gibt es noch keine Wünsche.</li>`}</ul>
        <div class="kf-zeile" style="margin-top:18px"><a class="kf-btn hell" href="${esc(PORTAL)}?projekt=${encodeURIComponent(SLUG)}" target="_blank" rel="noopener">Alle Wünsche im Portal</a>
          <button type="button" class="kf-btn hell" data-aktion="abmelden">Abmelden</button></div>`);
      dlg.querySelector(".kf-rumpf").scrollTop = scroll;
      vorschauenLaden(); anhaengeLaden(hier);
      pinsZeigen(hier);
      if (!stopp) stopp = be.beobachten(projekt.id, () => { if (offen && !tippt()) zeichnen(); zaehlen(); });
    }

    function formular() {
      const d = neu.details, wahl = Object.entries(KF.ARTEN);
      const symbol = { text: "✎", foto: "▣", design: "◐", inhalt: "＋", fehler: "!", sonstiges: "…" };
      return `<form data-form="neu" novalidate>
        <fieldset class="kf-arten"><legend>Was möchtet ihr?</legend>
          ${wahl.map(([k, t]) => `<label><input type="radio" name="kf-art" value="${k}"${neu.art === k ? " checked" : ""}><span aria-hidden="true">${symbol[k]}</span>${t}</label>`).join("")}
        </fieldset>
        <p class="kf-hinweis">${esc(HINWEIS[neu.art])}</p>
        <div class="kf-arten kf-werkzeuge" role="group" aria-label="Auf der Seite zeigen">
          ${neu.art === "text" ? `<button type="button" data-aktion="text-aendern" aria-pressed="${d.alter_text != null}"><span aria-hidden="true">✎</span>${d.alter_text != null ? "Anderen Text ändern" : "Text auf der Seite ändern"}</button>` : ""}
          <button type="button" data-aktion="markieren" aria-pressed="${!!neu.stelle && d.alter_text == null}"><span aria-hidden="true">◎</span>${neu.stelle ? "Andere Stelle markieren" : "Stelle auf der Seite markieren"}</button>
        </div>
        ${d.alter_text != null ? `<div class="kf-box"><b>Textänderung</b><br><del>${esc(d.alter_text)}</del><br>→ <ins>${esc(d.neuer_text)}</ins><div class="kf-zeile"><button type="button" class="kf-btn hell klein" data-aktion="text-weg">Änderung verwerfen</button></div></div>` : ""}
        ${neu.stelle && d.alter_text == null ? `<div class="kf-box">Markierte Stelle: „${esc(neu.stelle.text || neu.stelle.selektor)}“ <button type="button" class="kf-btn hell klein" data-aktion="stelle-weg">entfernen</button></div>` : ""}
        ${neu.art === "design" ? `<span class="kf-titel" id="kf-farbe-titel">Farbe</span>
          <div class="kf-farbe" role="group" aria-labelledby="kf-farbe-titel"><input type="color" id="kf-farbe" value="${esc(d.farbe || "#6e7f2a")}" aria-label="Farbe auswählen">
            <span>${d.farbe ? `<span class="kf-tupfer" style="background:${esc(d.farbe)}"></span>${esc(d.farbe)}` : "noch keine gewählt"}</span>
            ${"EyeDropper" in window ? `<button type="button" class="kf-btn hell klein" data-aktion="pipette">Farbe von der Seite nehmen</button>` : ""}
            ${d.farbe ? `<button type="button" class="kf-btn hell klein" data-aktion="farbe-weg">entfernen</button>` : ""}</div>` : ""}
        <label for="kf-text">${neu.art === "text" ? "Anmerkung (optional)" : "Beschreibung"}</label>
        <textarea id="kf-text" maxlength="5000" placeholder="${neu.art === "foto" ? "z. B. „Dieses Foto bitte durch unser Bild vom Hofcafé ersetzen“" : "z. B. „Die Öffnungszeiten am Samstag stimmen nicht“"}">${esc(neu.text)}</textarea>
        <span class="kf-titel" id="kf-foto-titel">Fotos (optional, bis zu 5)</span>
        <div class="kf-zeile" role="group" aria-labelledby="kf-foto-titel"><label class="kf-btn hell" style="margin:0" for="kf-datei">Foto hinzufügen</label>
          <input class="kf-datei" id="kf-datei" type="file" accept="image/jpeg,image/png,image/webp" multiple></div>
        <div class="kf-fotos">${neu.dateien.map((f, i) => `<div class="kf-foto"><img data-vorschau="${i}" alt="${esc(f.name)}"><button type="button" data-aktion="foto-weg" data-i="${i}" aria-label="Foto ${esc(f.name)} entfernen">×</button></div>`).join("")}</div>
        <fieldset class="kf-wichtig"><legend>Wie wichtig?</legend>
          ${[[1, "Wichtig"], [2, "Normal"], [3, "Kann warten"]].map(([v, t]) => `<label><input type="radio" name="kf-wichtig" value="${v}"${neu.wichtig === v ? " checked" : ""}>${t}</label>`).join("")}
        </fieldset>
        <div class="kf-zeile" style="margin-top:16px"><button class="kf-btn" type="submit">Wunsch absenden</button></div>
        <p class="kf-fehler" role="alert"></p>
      </form>`;
    }

    function karte(w, nr, ks, ichId) {
      const d = w.details || {}, meins = w.autor === ichId;
      const arbeit = w.status === "in_arbeit"
        ? `<div class="kf-arbeit">${esc(w.bearbeiter || "Agentur")} arbeitet daran${w.fertig_bis ? " – " + esc(KF.restzeit(w.fertig_bis)) : ""}${w.fortschritt ? `<br>${esc(w.fortschritt)}` : ""}</div>`
        : w.fortschritt ? `<div class="kf-arbeit">${esc(w.fortschritt)}</div>` : "";
      return `<li class="kf-w"><span class="kf-status ${w.status}">${w.stelle ? nr + " · " : ""}${esc(KF.STATUS[w.status] || w.status)}</span>
        ${w.art && w.art !== "sonstiges" ? `<span class="kf-etikett">${esc(KF.ARTEN[w.art] || w.art)}</span>` : ""}${w.prioritaet === 1 ? `<span class="kf-etikett wichtig">Wichtig</span>` : ""}
        ${w.text ? `<p>${esc(w.text)}</p>` : ""}
        ${d.alter_text != null ? `<div class="kf-box"><del>${esc(d.alter_text)}</del><br>→ <ins>${esc(d.neuer_text)}</ins></div>` : ""}
        ${d.farbe ? `<div class="kf-box"><span class="kf-tupfer" style="background:${esc(d.farbe)}"></span>${esc(d.farbe)}</div>` : ""}
        ${(w.anhaenge || []).length ? `<div class="kf-fotos">${w.anhaenge.map(a => `<a class="kf-foto" data-anhang="${esc(a.pfad)}" target="_blank" rel="noopener"><img alt="${esc(a.name)}"></a>`).join("")}</div>` : ""}
        ${KF.schritte(w, "kf-schritte")}${arbeit}
        <div class="kf-meta">${esc(namen[w.autor] || "")}, ${esc(KF.zeit(w.erstellt_am))}${meins && w.status === "offen" ? ` · <button type="button" class="kf-btn hell klein" data-aktion="loeschen" data-id="${w.id}">Löschen</button>` : ""}</div>
        <div class="kf-k">${ks.map(k => `<div><b>${esc(namen[k.autor] || "")}:</b> ${esc(k.text)}</div>`).join("")}
          <form data-form="kommentar" data-id="${w.id}"><label class="kf-nur" for="kf-k-${w.id}">Antwort zu diesem Wunsch</label>
            <input id="kf-k-${w.id}" maxlength="5000" placeholder="${w.status === "rueckfrage" ? "Rückfrage beantworten…" : "Antworten…"}"><button class="kf-btn klein">Senden</button></form></div></li>`;
    }

    function anmeldung(meldung = "") {
      dlg.innerHTML = rahmen("Anmelden", "Mit den Zugangsdaten, die ihr von uns bekommen habt", `
        ${be.istDemo ? `<p class="kf-demo">Demo-Modus: Beliebigen Namen und Passwort eingeben. Mit „agentur“ im Namen meldest du dich als Agentur an.</p>` : ""}
        <form data-form="login">
          <label for="kf-email">Benutzername oder E-Mail</label><input id="kf-email" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
          <label for="kf-pw">Passwort</label><input id="kf-pw" type="password" autocomplete="current-password" required>
          <div class="kf-zeile"><button class="kf-btn" type="submit">Anmelden</button>
            <button type="button" class="kf-btn hell" data-aktion="vergessen">Passwort vergessen?</button></div>
          <p class="kf-fehler" role="alert">${esc(meldung)}</p>
        </form>`);
      dlg.querySelector("#kf-email").focus();
    }

    // Vorschaubilder der ausgewählten Fotos und der gespeicherten Anhänge
    const vorschauUrls = new Map();
    function vorschauenLaden() {
      dlg.querySelectorAll("[data-vorschau]").forEach(img => {
        const f = neu.dateien[+img.dataset.vorschau];
        if (!vorschauUrls.has(f)) vorschauUrls.set(f, URL.createObjectURL(f));
        img.src = vorschauUrls.get(f);
      });
    }
    async function anhaengeLaden() {
      for (const a of dlg.querySelectorAll("[data-anhang]")) {
        try { const u = await be.dateiUrl(a.dataset.anhang); a.href = u; a.querySelector("img").src = u; } catch (e) {}
      }
    }

    // ---------- Eingaben ----------
    dlg.addEventListener("input", e => {
      if (e.target.id === "kf-text") neu.text = e.target.value;
      if (e.target.id === "kf-farbe") { neu.details.farbe = e.target.value; }
    });
    dlg.addEventListener("change", async e => {
      const t = e.target;
      if (t.name === "kf-art") { neu.art = t.value; return zeichnen(); }
      if (t.name === "kf-wichtig") { neu.wichtig = +t.value; return; }
      if (t.id === "kf-farbe") { neu.details.farbe = t.value; return zeichnen(); }
      if (t.id === "kf-datei") {
        const fehler = dlg.querySelector(".kf-fehler");
        const neueDateien = [...t.files].filter(f => /^image\//.test(f.type));
        if (neu.dateien.length + neueDateien.length > 5) { fehler.textContent = "Bitte höchstens 5 Fotos pro Wunsch."; return; }
        neu.dateien.push(...neueDateien);
        if (neu.art === "sonstiges") neu.art = "foto";
        zeichnen();
      }
    });

    dlg.addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, fehler = f.querySelector(".kf-fehler");
      try {
        if (f.dataset.form === "login") {
          await be.anmelden(f.querySelector("#kf-email").value.trim(), f.querySelector("#kf-pw").value);
          projekt = null; await zeichnen(); zaehlen();
        } else if (f.dataset.form === "neu") {
          const text = neu.text.trim(), d = { ...neu.details };
          if (!text && d.alter_text == null) { fehler.textContent = neu.art === "text" ? "Bitte zuerst den Text auf der Seite ändern oder eine Beschreibung schreiben." : "Bitte kurz beschreiben, was anders sein soll."; return; }
          const knopfSenden = f.querySelector("button[type=submit]");
          knopfSenden.disabled = true; knopfSenden.textContent = neu.dateien.length ? "Fotos werden hochgeladen …" : "Wird gesendet …";
          const anhaenge = [];
          for (const datei of neu.dateien) anhaenge.push(await be.dateiHochladen(projekt.id, await KF.verkleinern(datei), datei.name));
          if (neu.art !== "design") delete d.farbe;
          await be.wunschAnlegen({
            projekt_id: projekt.id, art: neu.art, details: d, anhaenge, prioritaet: neu.wichtig,
            text: text || `Text ändern: „${String(d.alter_text).slice(0, 80)}“`,
            seite_url: location.origin + location.pathname, seite_titel: document.title.slice(0, 300), stelle: neu.stelle,
          });
          vorschauUrls.forEach(u => URL.revokeObjectURL(u)); vorschauUrls.clear();
          neu = leer(); await zeichnen(); zaehlen();
          const liste = dlg.querySelector(".kf-liste"); if (liste) liste.scrollIntoView({ block: "start" });
        } else if (f.dataset.form === "kommentar") {
          const feld = f.querySelector("input"), text = feld.value.trim();
          if (!text) return;
          await be.kommentarAnlegen(f.dataset.id, text); feld.value = ""; await zeichnen();
        }
      } catch (err) {
        if (fehler) fehler.textContent = err.message; else alert(err.message);
        const b = f.querySelector("button[type=submit]"); if (b) { b.disabled = false; b.textContent = f.dataset.form === "neu" ? "Wunsch absenden" : b.textContent; }
      }
    });

    dlg.addEventListener("click", async e => {
      const t = e.target.closest("[data-aktion]"), a = t && t.dataset.aktion;
      if (!a) return;
      if (a === "schliessen") dlg.close();
      if (a === "abmelden") { if (stopp) { stopp(); stopp = null; } projekt = null; await be.abmelden(); anmeldung(); zaehlen(); }
      if (a === "vergessen") {
        const email = dlg.querySelector("#kf-email").value.trim(), f = dlg.querySelector(".kf-fehler");
        if (!email) { f.textContent = "Bitte zuerst Benutzername oder E-Mail eintragen."; return; }
        try { await be.passwortVergessen(email, PORTAL + "?passwort=neu"); f.textContent = "Wenn die Adresse bei uns hinterlegt ist, kommt gleich eine E-Mail zum Zurücksetzen."; }
        catch (err) { f.textContent = err.message; }
      }
      if (a === "loeschen" && confirm("Diesen Wunsch löschen?")) { await be.wunschLoeschen(t.dataset.id); await zeichnen(); zaehlen(); }
      if (a === "stelle-weg") { neu.stelle = null; zeichnen(); }
      if (a === "text-weg") { delete neu.details.alter_text; delete neu.details.neuer_text; neu.stelle = null; zeichnen(); }
      if (a === "farbe-weg") { delete neu.details.farbe; zeichnen(); }
      if (a === "foto-weg") { const f = neu.dateien.splice(+t.dataset.i, 1)[0]; if (vorschauUrls.has(f)) { URL.revokeObjectURL(vorschauUrls.get(f)); vorschauUrls.delete(f); } zeichnen(); }
      if (a === "markieren") auswaehlen(false);
      if (a === "text-aendern") auswaehlen(true);
      if (a === "pipette") {
        try { const r = await new window.EyeDropper().open(); neu.details.farbe = r.sRGBHex; zeichnen(); } catch (err) { /* abgebrochen */ }
      }
    });

    // ---------- Auf der Seite auswählen: Stelle markieren oder Text direkt ändern ----------
    function banner(html) {
      const b = document.createElement("div");
      b.className = "kf-markieren"; b.setAttribute("role", "status"); b.innerHTML = html;
      document.body.append(b); return b;
    }
    function auswaehlen(textModus) {
      dlg.close();
      const hinweis = banner(textModus ? "Klicke auf den Text, den du ändern möchtest – Esc bricht ab" : "Klicke auf die Stelle, die du meinst – Esc bricht ab");
      let ziel = null;
      const passt = el => el && !el.closest(".kf-knopf,.kf-markieren,.kf-pin,.kf") && (!textModus || (el.innerText || "").trim().length > 0);
      const über = e => { if (ziel) ziel.classList.remove("kf-ziel"); ziel = passt(e.target) ? e.target : null; if (ziel) ziel.classList.add("kf-ziel"); };
      const aufräumen = () => { document.removeEventListener("mouseover", über, true); document.removeEventListener("click", klick, true); document.removeEventListener("keydown", taste, true); hinweis.remove(); if (ziel) ziel.classList.remove("kf-ziel"); };
      const zurück = () => öffnen().then(() => dlg.querySelector("#kf-text")?.focus());
      const klick = e => {
        if (e.target.closest(".kf-markieren")) return;
        e.preventDefault(); e.stopPropagation();
        const el = e.target; if (!passt(el)) return;
        aufräumen();
        const r = el.getBoundingClientRect();
        neu.stelle = { selektor: selektor(el), text: kurztext(el), x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY) };
        if (textModus) textBearbeiten(el, zurück); else zurück();
      };
      const taste = e => { if (e.key === "Escape") { e.preventDefault(); aufräumen(); zurück(); } };
      document.addEventListener("mouseover", über, true);
      document.addEventListener("click", klick, true);
      document.addEventListener("keydown", taste, true);
    }

    // Text direkt auf der Seite umschreiben – danach wird die Seite wiederhergestellt, gespeichert wird nur „alt → neu“
    function textBearbeiten(el, fertig) {
      const vorherHtml = el.innerHTML, vorherText = el.innerText.trim();
      el.contentEditable = "true"; el.classList.add("kf-bearbeiten"); el.focus();
      const auswahl = getSelection(); const bereich = document.createRange(); bereich.selectNodeContents(el); auswahl.removeAllRanges(); auswahl.addRange(bereich);
      const b = banner(`<span>Schreib den Text direkt um</span><button type="button" class="ja">Übernehmen</button><button type="button" class="nein">Abbrechen</button>`);
      const linkSperre = e => { if (el.contains(e.target)) e.preventDefault(); };
      document.addEventListener("click", linkSperre, true);
      const ende = übernehmen => {
        const neuText = el.innerText.trim();
        el.contentEditable = "false"; el.removeAttribute("contenteditable"); el.classList.remove("kf-bearbeiten");
        el.innerHTML = vorherHtml; b.remove(); document.removeEventListener("click", linkSperre, true); document.removeEventListener("keydown", taste, true);
        if (übernehmen && neuText !== vorherText) { neu.details.alter_text = vorherText.slice(0, 4000); neu.details.neuer_text = neuText.slice(0, 4000); neu.art = "text"; }
        fertig();
      };
      const taste = e => { if (e.key === "Escape") { e.preventDefault(); ende(false); } };
      document.addEventListener("keydown", taste, true);
      b.querySelector(".ja").addEventListener("click", e => { e.stopPropagation(); ende(true); });
      b.querySelector(".nein").addEventListener("click", e => { e.stopPropagation(); ende(false); });
    }

    const kurztext = el => (el.innerText || el.alt || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 100);
    function selektor(el) {
      if (el.id) return "#" + CSS.escape(el.id);
      const teile = [];
      while (el && el !== document.body && teile.length < 6) {
        let t = el.tagName.toLowerCase();
        if (el.id) { teile.unshift("#" + CSS.escape(el.id)); break; }
        const geschwister = el.parentElement ? [...el.parentElement.children].filter(x => x.tagName === el.tagName) : [];
        if (geschwister.length > 1) t += `:nth-of-type(${geschwister.indexOf(el) + 1})`;
        teile.unshift(t); el = el.parentElement;
      }
      return teile.join(" > ");
    }

    function pinsZeigen(liste) {
      pinsEntfernen();
      let nr = 0;
      for (const w of liste) {
        nr++;
        if (!w.stelle) continue;
        let el = null; try { el = document.querySelector(w.stelle.selektor); } catch (e) {}
        const r = el ? el.getBoundingClientRect() : null;
        const pin = document.createElement("div");
        pin.className = "kf-pin"; pin.setAttribute("aria-hidden", "true"); pin.textContent = nr;
        pin.style.left = (r ? r.left + scrollX : w.stelle.x || 0) - 6 + "px";
        pin.style.top = (r ? r.top + scrollY : w.stelle.y || 0) - 22 + "px";
        document.body.append(pin);
      }
    }
    function pinsEntfernen() { document.querySelectorAll(".kf-pin").forEach(p => p.remove()); }

    // Nicht neu zeichnen, solange jemand in ein Feld tippt
    const tippt = () => { const a = document.activeElement; return offen && dlg.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== "radio" && a.value; };
    const urlPfad = u => { try { return new URL(u).pathname.replace(/index\.html$/, ""); } catch (e) { return ""; } };

    // Zähler am Knopf: offene Wünsche auf dieser Seite
    async function zaehlen() {
      try {
        if (!(await be.sitzung())) { knopf.textContent = "Wünsche"; return; }
        projekt = projekt || await be.projekt(SLUG);
        if (!projekt) return;
        const n = (await be.wuensche(projekt.id)).filter(w => urlPfad(w.seite_url) === SEITE && !["erledigt", "abgelehnt"].includes(w.status)).length;
        knopf.innerHTML = "Wünsche" + (n ? `<span class="kf-zahl" aria-label="${n} offen">${n}</span>` : "");
        if (!stopp) stopp = be.beobachten(projekt.id, () => { if (offen && !tippt()) zeichnen(); zaehlen(); });
      } catch (e) {}
    }
    zaehlen();
    setInterval(() => { if (offen && !tippt()) zeichnen(); }, 30000); // Restzeit aktuell halten
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
