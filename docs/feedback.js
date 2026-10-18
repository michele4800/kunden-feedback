// Kunden-Feedback-Widget. Einbinden auf jeder Seite der Kunden-Website:
//   <script src="https://…/kunden-feedback/feedback.js" data-projekt="projekt-slug" defer></script>
// Optional: data-portal="URL des Portals" (Standard: portal/ neben dieser Datei)
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
    let projekt = null, rolle = null, namen = {}, stelle = null, offen = false, stopp = null;

    const css = document.createElement("style");
    css.textContent = `
.kf-knopf{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:600 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;background:#1b1b19;color:#fff;border:0;border-radius:999px;padding:13px 18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28);display:flex;gap:8px;align-items:center}
.kf-knopf:focus-visible,.kf *:focus-visible{outline:3px solid #2f6f8a;outline-offset:2px}
.kf-zahl{background:#f2c14e;color:#1b1b19;border-radius:999px;padding:2px 7px;font-size:12px}
.kf{position:fixed;inset:0 0 0 auto;margin:0 0 0 auto;width:min(440px,100vw);max-width:100vw;height:100dvh;max-height:100dvh;border:0;padding:0;background:#fff;color:#1b1b19;font:400 15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:-10px 0 30px rgba(0,0,0,.2);z-index:2147483001}
.kf::backdrop{background:rgba(0,0,0,.35)}
.kf-innen{display:flex;flex-direction:column;height:100%}
.kf-kopf{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #e3e1da}
.kf-kopf h2{font:700 17px/1.3 inherit;margin:0;letter-spacing:normal;text-transform:none;color:inherit}
.kf-kopf small{display:block;color:#5c5a54;font-weight:400;font-size:13px}
.kf-rumpf{overflow:auto;padding:16px 18px 24px;flex:1}
.kf button,.kf input,.kf textarea{font:inherit}
.kf-zu{background:none;border:0;font-size:24px;line-height:1;cursor:pointer;padding:4px 8px;color:inherit}
.kf label{display:block;font-weight:600;margin:12px 0 6px}
.kf input[type=text],.kf input[type=email],.kf input[type=password],.kf textarea{width:100%;box-sizing:border-box;border:1px solid #8a877f;border-radius:8px;padding:10px 12px;background:#fff;color:#1b1b19}
.kf textarea{min-height:92px;resize:vertical}
.kf-btn{border:2px solid #1b1b19;background:#1b1b19;color:#fff;border-radius:999px;padding:9px 16px;font-weight:600;cursor:pointer}
.kf-btn.hell{background:#fff;color:#1b1b19}
.kf-btn.klein{padding:5px 12px;font-size:13px}
.kf-zeile{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.kf-hinweis{font-size:13px;color:#5c5a54;margin:8px 0 0}
.kf-fehler{color:#a4161a;font-weight:600;margin:10px 0 0;min-height:1em}
.kf-demo{background:#fff3cc;border-left:4px solid #b98900;padding:8px 12px;font-size:13px;margin-bottom:12px}
.kf-waechter{display:flex;gap:8px;align-items:center;font-size:13px;color:#5c5a54;margin:0 0 14px}
.kf-punkt{width:9px;height:9px;border-radius:50%;background:#a7a59d;flex:none}
.kf-punkt.an{background:#2d8a3e;box-shadow:0 0 0 3px rgba(45,138,62,.18)}
.kf h3{font:700 15px/1.3 inherit;margin:22px 0 8px;letter-spacing:normal;text-transform:none;color:inherit}
.kf-stelle{font-size:13px;background:#eef4f7;border-radius:8px;padding:6px 10px;margin-top:8px}
.kf-liste{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.kf-w{border:1px solid #e3e1da;border-radius:10px;padding:12px}
.kf-w p{margin:6px 0 0;white-space:pre-wrap;word-break:break-word}
.kf-status{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:#ecebe6}
.kf-status.in_arbeit{background:#dbeafe;color:#1e3a8a}.kf-status.rueckfrage{background:#fde68a;color:#78350f}
.kf-status.zur_freigabe{background:#e9d5ff;color:#581c87}.kf-status.erledigt{background:#d1fae5;color:#065f46}.kf-status.abgelehnt{background:#fee2e2;color:#7f1d1d}
.kf-arbeit{font-size:13px;color:#1e3a8a;margin-top:6px}
.kf-meta{font-size:12px;color:#6b6962;margin-top:6px}
.kf-k{border-top:1px dashed #e3e1da;margin-top:10px;padding-top:8px}
.kf-k div{font-size:14px;margin-top:6px}.kf-k b{font-weight:600}
.kf-k form{display:flex;gap:6px;margin-top:8px}.kf-k input{flex:1;border:1px solid #8a877f;border-radius:8px;padding:6px 10px}
.kf-markieren{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483002;background:#1b1b19;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.kf-ziel{outline:3px dashed #2f6f8a!important;outline-offset:2px!important;cursor:crosshair!important}
.kf-pin{position:absolute;z-index:2147482999;width:26px;height:26px;border-radius:50% 50% 50% 4px;background:#2f6f8a;color:#fff;font:700 12px/26px system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none}
@media (prefers-reduced-motion:no-preference){.kf[open]{animation:kf-rein .18s ease-out}@keyframes kf-rein{from{transform:translateX(30px);opacity:.6}}}
`;
    document.head.appendChild(css);

    const knopf = document.createElement("button");
    knopf.type = "button"; knopf.className = "kf-knopf"; knopf.setAttribute("aria-haspopup", "dialog");
    knopf.innerHTML = "Wünsche";
    const dlg = document.createElement("dialog");
    dlg.className = "kf"; dlg.setAttribute("aria-labelledby", "kf-titel");
    document.body.append(knopf, dlg);
    knopf.addEventListener("click", () => { dlg.showModal(); offen = true; zeichnen(); });
    dlg.addEventListener("close", () => { offen = false; pinsEntfernen(); knopf.focus(); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

    const rahmen = (titel, unter, inhalt) => `<div class="kf-innen"><div class="kf-kopf"><div><h2 id="kf-titel">${titel}</h2>${unter ? `<small>${unter}</small>` : ""}</div>
      <button type="button" class="kf-zu" data-aktion="schliessen" aria-label="Schließen">×</button></div><div class="kf-rumpf">${inhalt}</div></div>`;

    async function zeichnen() {
      const s = await be.sitzung();
      if (!s) return anmeldung();
      projekt = projekt || await be.projekt(SLUG);
      if (!projekt) { dlg.innerHTML = rahmen("Wünsche", "", `<p>Für dieses Konto ist hier kein Projekt freigegeben.</p><button class="kf-btn hell" data-aktion="abmelden">Abmelden</button>`); return; }
      const [mitglieder, wuensche, kommentare, auto] = await Promise.all([be.mitglieder(projekt.id), be.wuensche(projekt.id), be.kommentare(projekt.id), be.automatik(projekt.id)]);
      namen = Object.fromEntries(mitglieder.map(m => [m.user_id, m.anzeigename || (m.rolle === "agentur" ? "Agentur" : "Kunde")]));
      rolle = (mitglieder.find(m => m.user_id === s.user.id) || {}).rolle;
      const hier = wuensche.filter(w => urlPfad(w.seite_url) === SEITE);
      const w8 = KF.waechterText(auto);
      const liste = hier.length ? hier.map((w, i) => karte(w, i + 1, kommentare.filter(k => k.wunsch_id === w.id), s.user.id)).join("") : `<li class="kf-hinweis">Zu dieser Seite gibt es noch keine Wünsche.</li>`;
      const scroll = dlg.querySelector(".kf-rumpf")?.scrollTop || 0;
      const entwurf = dlg.querySelector("#kf-text")?.value || "";
      dlg.innerHTML = rahmen("Wünsche zu dieser Seite", esc(projekt.name) + " · " + esc(namen[s.user.id] || s.user.email), `
        ${be.istDemo ? `<p class="kf-demo">Demo-Modus: Daten bleiben nur in diesem Browser.</p>` : ""}
        <p class="kf-waechter"><span class="kf-punkt${w8.aktiv ? " an" : ""}"></span>${esc(w8.text)}</p>
        <form data-form="neu">
          <label for="kf-text">Was soll auf dieser Seite anders sein?</label>
          <textarea id="kf-text" maxlength="5000" required placeholder="z. B. „Das Foto oben gegen ein Bild vom Hofcafé tauschen“">${esc(entwurf)}</textarea>
          ${stelle ? `<p class="kf-stelle">Markierte Stelle: „${esc(stelle.text || stelle.selektor)}“ <button type="button" class="kf-btn hell klein" data-aktion="stelle-weg">entfernen</button></p>` : ""}
          <div class="kf-zeile"><button class="kf-btn" type="submit">Wunsch absenden</button>
            <button type="button" class="kf-btn hell" data-aktion="markieren">Stelle auf der Seite markieren</button></div>
          <p class="kf-fehler" role="alert"></p>
        </form>
        <h3>Bisherige Wünsche hier (${hier.length})</h3>
        <ul class="kf-liste">${liste}</ul>
        <div class="kf-zeile" style="margin-top:18px"><a class="kf-btn hell" href="${esc(PORTAL)}?projekt=${encodeURIComponent(SLUG)}" target="_blank" rel="noopener">Alle Wünsche im Portal</a>
          <button type="button" class="kf-btn hell" data-aktion="abmelden">Abmelden</button></div>`);
      dlg.querySelector(".kf-rumpf").scrollTop = scroll;
      pinsZeigen(hier);
      if (!stopp) stopp = be.beobachten(projekt.id, () => { if (offen && !tippt()) zeichnen(); zaehlen(); });
    }

    function karte(w, nr, ks, ichId) {
      const meins = w.autor === ichId;
      const arbeit = w.status === "in_arbeit"
        ? `<div class="kf-arbeit">${esc(w.bearbeiter || "Agentur")} arbeitet daran${w.fertig_bis ? " – " + esc(KF.restzeit(w.fertig_bis)) : ""}${w.fortschritt ? `<br>${esc(w.fortschritt)}` : ""}</div>`
        : w.fortschritt ? `<div class="kf-arbeit">${esc(w.fortschritt)}</div>` : "";
      return `<li class="kf-w"><span class="kf-status ${w.status}">${w.stelle ? nr + " · " : ""}${esc(KF.STATUS[w.status] || w.status)}</span>
        <p>${esc(w.text)}</p>${arbeit}
        <div class="kf-meta">${esc(namen[w.autor] || "")}, ${esc(KF.zeit(w.erstellt_am))}${meins && w.status === "offen" ? ` · <button type="button" class="kf-btn hell klein" data-aktion="loeschen" data-id="${w.id}">Löschen</button>` : ""}</div>
        <div class="kf-k">${ks.map(k => `<div><b>${esc(namen[k.autor] || "")}:</b> ${esc(k.text)}</div>`).join("")}
          <form data-form="kommentar" data-id="${w.id}"><label class="kf-nur" for="kf-k-${w.id}" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Antwort zu diesem Wunsch</label>
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

    dlg.addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, fehler = f.querySelector(".kf-fehler");
      try {
        if (f.dataset.form === "login") {
          await be.anmelden(f.querySelector("#kf-email").value.trim(), f.querySelector("#kf-pw").value);
          projekt = null; await zeichnen(); zaehlen();
        } else if (f.dataset.form === "neu") {
          const text = f.querySelector("#kf-text").value.trim();
          if (!text) { fehler.textContent = "Bitte zuerst einen Wunsch eintragen."; return; }
          f.querySelector("button[type=submit]").disabled = true;
          await be.wunschAnlegen({ projekt_id: projekt.id, text, seite_url: location.origin + location.pathname, seite_titel: document.title.slice(0, 300), stelle });
          stelle = null; f.querySelector("#kf-text").value = "";
          await zeichnen(); zaehlen();
        } else if (f.dataset.form === "kommentar") {
          const feld = f.querySelector("input"), text = feld.value.trim();
          if (!text) return;
          await be.kommentarAnlegen(f.dataset.id, text); feld.value = ""; await zeichnen();
        }
      } catch (err) { if (fehler) fehler.textContent = err.message; else alert(err.message); const b = f.querySelector("button[type=submit]"); if (b) b.disabled = false; }
    });

    dlg.addEventListener("click", async e => {
      const a = e.target.closest("[data-aktion]")?.dataset.aktion;
      if (!a) return;
      if (a === "schliessen") dlg.close();
      if (a === "abmelden") { if (stopp) { stopp(); stopp = null; } projekt = null; await be.abmelden(); anmeldung(); zaehlen(); }
      if (a === "vergessen") {
        const email = dlg.querySelector("#kf-email").value.trim(), f = dlg.querySelector(".kf-fehler");
        if (!email) { f.textContent = "Bitte zuerst Benutzername oder E-Mail eintragen."; return; }
        try { await be.passwortVergessen(email, PORTAL + "?passwort=neu"); f.textContent = "Wenn die Adresse bei uns hinterlegt ist, kommt gleich eine E-Mail zum Zurücksetzen."; }
        catch (err) { f.textContent = err.message; }
      }
      if (a === "loeschen" && confirm("Diesen Wunsch löschen?")) { await be.wunschLoeschen(e.target.dataset.id); await zeichnen(); zaehlen(); }
      if (a === "stelle-weg") { stelle = null; zeichnen(); }
      if (a === "markieren") markieren();
    });

    // Stelle auf der Seite markieren: Dialog kurz schließen, Element anklicken
    function markieren() {
      const entwurf = dlg.querySelector("#kf-text")?.value || "";
      dlg.close();
      const hinweis = document.createElement("div");
      hinweis.className = "kf-markieren"; hinweis.setAttribute("role", "status");
      hinweis.textContent = "Klicke auf die Stelle, die du meinst – Esc bricht ab";
      document.body.append(hinweis);
      let ziel = null;
      const über = e => { if (ziel) ziel.classList.remove("kf-ziel"); ziel = e.target.closest("body *:not(.kf-knopf):not(.kf-markieren)"); if (ziel) ziel.classList.add("kf-ziel"); };
      const ende = () => { document.removeEventListener("mouseover", über, true); document.removeEventListener("click", klick, true); document.removeEventListener("keydown", taste, true); hinweis.remove(); if (ziel) ziel.classList.remove("kf-ziel"); dlg.showModal(); offen = true; zeichnen().then(() => { const t = dlg.querySelector("#kf-text"); if (t) { t.value = entwurf; t.focus(); } }); };
      const klick = e => {
        e.preventDefault(); e.stopPropagation();
        const el = e.target; if (el.closest(".kf-markieren")) return;
        const r = el.getBoundingClientRect();
        stelle = { selektor: selektor(el), text: (el.innerText || el.alt || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 100), x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY) };
        ende();
      };
      const taste = e => { if (e.key === "Escape") { e.preventDefault(); ende(); } };
      document.addEventListener("mouseover", über, true);
      document.addEventListener("click", klick, true);
      document.addEventListener("keydown", taste, true);
    }

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
    const tippt = () => { const a = document.activeElement; return offen && dlg.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value; };
    const urlPfad = u => { try { return new URL(u).pathname.replace(/index\.html$/, ""); } catch (e) { return ""; } };

    // Zähler am Knopf: offene Wünsche auf dieser Seite
    async function zaehlen() {
      try {
        if (!(await be.sitzung())) { knopf.innerHTML = "Wünsche"; return; }
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
