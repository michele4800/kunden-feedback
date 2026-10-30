// Kunden-Feedback-Widget. Wird von feedback.js nachgeladen (Daten-Attribute werden übernommen). Einbinden wie bisher:
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

  // Version an alle nachgeladenen Dateien hängen, damit der Browser nie alte und neue Teile mischt (bei jeder Änderung erhöhen)
  const V = "20261031a";
  const laden = src => new Promise((ok, fehler) => { const s = document.createElement("script"); s.src = src + "?v=" + V; s.onload = ok; s.onerror = fehler; document.head.appendChild(s); });

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
    let nachAnmeldung = "";
    // Gesammelte Wünsche (noch nicht abgeschickt) – im Browser gespeichert, damit sie Seitenwechsel überstehen
    const SAMMEL = "kf-liste-" + SLUG;
    const sammlung = () => { try { return JSON.parse(localStorage.getItem(SAMMEL) || "[]"); } catch (e) { return []; } };
    const sammlungSetzen = l => { try { localStorage.setItem(SAMMEL, JSON.stringify(l)); } catch (e) { throw new Error("Die Liste konnte in diesem Browser nicht gespeichert werden – bitte einzeln absenden."); } };

    // ---------- Neue Version der Seite erkennen ----------
    // Vergleicht, was der Browser zwischengespeichert hat, mit dem Stand auf dem Server (Seite + eigene Stylesheets).
    const GELADEN = Date.now();
    let neueVersion = false, wacht = false;
    const dateien = () => [location.href.split("#")[0], ...[...document.querySelectorAll('link[rel="stylesheet"], script[src]')]
      .map(e => e.href || e.src).filter(u => u && new URL(u).origin === location.origin && !u.startsWith(BASIS))];
    async function abdruck(cache) {
      // Virenscanner (z. B. Kaspersky) schieben manchmal eigene Skripte von fremden Servern in die Seite – die zählen nicht
      const fremd = new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*["']?(?:https?:)?//(?!${location.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[^>]*>\\s*</script>`, "gi");
      const texte = await Promise.all(dateien().map(u => fetch(u, { cache }).then(r => r.ok ? r.text() : "").then(t => t.replace(fremd, "")).catch(() => "")));
      let h = 5381; for (const c of texte.join("\u0000")) h = (h * 33 + c.charCodeAt(0)) >>> 0;
      return h;
    }
    // Fingerabdruck dessen, was beim Laden angezeigt wurde (kommt aus demselben Browser-Cache wie die Seite)
    const angezeigt = abdruck("default");
    async function vergleichen() {
      if (neueVersion) return true;
      const [alt, neuStand] = await Promise.all([angezeigt, abdruck("no-store")]);
      if (alt !== neuStand) { neueVersion = true; leisteZeigen(); if (offen) zeichnen(); }
      return neueVersion;
    }
    // Nach einem erledigten Wunsch bis zu 6 Minuten alle 15 s nachsehen, bis die Änderung online ist
    async function versionAbwarten() {
      if (wacht || neueVersion) return;
      wacht = true;
      for (let i = 0; i < 24 && !(await vergleichen()); i++) await new Promise(ok => setTimeout(ok, 15000));
      wacht = false;
    }
    async function neuLaden() {
      await Promise.all(dateien().map(u => fetch(u, { cache: "reload" }).catch(() => {})));
      location.reload();
    }
    const leiste = document.createElement("div");
    leiste.className = "kf-neu-leiste"; leiste.setAttribute("role", "status"); leiste.hidden = true;
    leiste.innerHTML = `<span>Eure Änderung ist online.</span><button type="button" class="kf-btn klein">Seite neu laden</button>`;
    leiste.querySelector("button").addEventListener("click", neuLaden);
    function leisteZeigen() { leiste.hidden = false; }
    setTimeout(vergleichen, 3000);

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
.kf-knopf[hidden]{display:none}
.kf-knopf[hidden]{display:none}
.kf-bearbeiten-knopf{right:var(--kf-ed-rechts,150px);background:#2f6f8a}
.kf-portal-knopf{right:var(--kf-portal-rechts,240px);background:#fff;color:#1b1b19;border:1px solid #d6d3ca;text-decoration:none}
.kf-studio{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483001;background:#f4f4f2}
.kf-knopf:focus-visible,.kf *:focus-visible,.kf-markieren button:focus-visible{outline:3px solid #2f6f8a;outline-offset:2px}
.kf-schiebt{outline:2px solid #2f6f8a!important;outline-offset:3px;cursor:grab!important;touch-action:none;user-select:none}
.kf-schiebt:active{cursor:grabbing!important}
.kf-linien{position:absolute;left:0;top:0;width:0;height:0;z-index:2147482998;pointer-events:none}
.kf-linie{position:absolute;background:#e11d48}
.kf-linie.senk{width:1px}.kf-linie.waag{height:1px}
.kf-linie span{position:absolute;white-space:nowrap;background:#e11d48;color:#fff;font:600 12px/1.3 system-ui,sans-serif;padding:2px 6px;border-radius:4px}
.kf-linie.senk span{left:4px}
.kf-linie.waag span{left:8px;top:4px}
.kf-sammel{border:2px solid #1b1b19;border-radius:12px;padding:12px 14px;margin:6px 0 14px;background:#fbfaf7}
.kf-sammel h3{margin:0 0 2px;font-size:16px}
.kf-sammel ol{margin:8px 0 12px;padding-left:20px}
.kf-sammel li{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #e3e1da}
.kf-sammel li small{display:block;color:#5c5a54}
.kf-neu-leiste{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:12px;align-items:center;background:#065f46;color:#fff;font:600 15px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 12px 10px 18px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.28);max-width:calc(100vw - 32px)}
.kf-neu-leiste[hidden]{display:none}
.kf-neu-leiste .kf-btn,.kf-neu .kf-btn{background:#fff;color:#065f46;border-color:#fff}
.kf-neu{background:#065f46;color:#fff;border-radius:10px;padding:12px 14px;margin:0 0 12px;display:flex;gap:12px;align-items:center;justify-content:space-between;font-weight:600}
.kf-zahl{background:#f2c14e;color:#1b1b19;border-radius:999px;padding:2px 7px;font-size:12px}
.kf{position:fixed;inset:0 0 0 auto;margin:0 0 0 auto;width:min(460px,100vw);max-width:100vw;height:100dvh;max-height:100dvh;border:0;padding:0;background:#fff;color:#1b1b19;font:400 15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:-10px 0 30px rgba(0,0,0,.2);z-index:2147483001}
.kf{overflow:hidden}
.kf-rumpf{scrollbar-width:thin;overscroll-behavior:contain}
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
.kf-eingeklappt{padding:8px 12px;background:#fafaf8;min-width:0;overflow:hidden}.kf-eingeklappt details{min-width:0}.kf .kf-eingeklappt summary{display:block;cursor:pointer;list-style:none;font:inherit;margin:0;padding:0;min-width:0}.kf-eingeklappt summary::-webkit-details-marker{display:none}
/* Seiten-Stile (z. B. FAQ-Aufklapper) dürfen hier nicht durchschlagen */
.kf .kf-eingeklappt summary p{font:400 15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:normal;max-width:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#57534e}.kf .kf-eingeklappt details[open] summary p{white-space:pre-wrap;color:inherit}
.kf-auf{float:right;font-size:13px;color:#2f6f8a;text-decoration:underline}.kf-eingeklappt details[open] .kf-auf{display:none}
.kf-w .kf-neu{margin:10px 0 0;font-size:14px}
.kf-status{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:#ecebe6}
.kf-status.in_arbeit{background:#dbeafe;color:#1e3a8a}.kf-status.rueckfrage{background:#fde68a;color:#78350f}
.kf-status.zur_freigabe{background:#e9d5ff;color:#581c87}.kf-status.erledigt{background:#d1fae5;color:#065f46}.kf-status.abgelehnt{background:#fee2e2;color:#7f1d1d}
.kf-etikett{display:inline-block;font-size:12px;border:1px solid #d6d3ca;border-radius:999px;padding:1px 8px;margin-left:4px;color:#47453f}
.kf-etikett.wichtig{border-color:#a4161a;color:#a4161a}
.kf-arbeit{font-size:13px;color:#1e3a8a;margin-top:6px}
.kf-meta{font-size:12px;color:#6b6962;margin-top:6px}
.kf-k{border-top:1px dashed #e3e1da;margin-top:10px;padding-top:8px}
.kf-k div{font-size:14px;margin-top:6px}.kf-k b{font-weight:600}
.kf-k form{display:flex;gap:6px;margin-top:8px}
.kf-k form.kf-rf{display:block;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px}
.kf-rf-titel{margin:0 0 4px;font-weight:600;font-size:14px;color:#78350f;white-space:pre-wrap}.kf-rf-hilfe{margin:0 0 8px;font-size:13px;color:#92400e}.kf-rf-opt{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.kf-rf-opt .kf-btn{white-space:normal;text-align:left}
.kf-rf textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #8a877f;border-radius:8px;padding:8px 10px;font:inherit;resize:vertical;margin-bottom:8px}.kf-k input{flex:1;border:1px solid #8a877f;border-radius:8px;padding:6px 10px}
.kf-nur{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.kf-markieren{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483002;background:#1b1b19;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 32px)}
.kf-markieren.unten{top:auto;bottom:16px}
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
    knopf.textContent = "KI-Wunsch";
    const dlg = document.createElement("dialog");
    dlg.className = "kf"; dlg.setAttribute("aria-labelledby", "kf-titel");
    document.body.append(knopf, dlg, leiste);
    // Solange das Fenster offen ist, scrollt nur sein Inhalt – nicht zusätzlich die Seite dahinter
    let seitenUeberlauf = "";
    const öffnen = () => { if (!dlg.open) { seitenUeberlauf = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; dlg.showModal(); } offen = true; return zeichnen().catch(fehlerZeigen); };
    const fehlerZeigen = e => { console.error(e); dlg.innerHTML = rahmen("Wünsche", "", `<p>Das Fenster konnte nicht geladen werden. Bitte die Seite neu laden.</p><button type="button" class="kf-btn" onclick="location.reload()">Seite neu laden</button>`); };
    knopf.addEventListener("click", öffnen);

    // Editor (Baukasten, docs/studio/): Vollbild-iframe über der Seite. Ohne Anmeldung führt der Knopf zur Anmeldung.
    {
      const bearbeitenKnopf = document.createElement("button");
      bearbeitenKnopf.type = "button"; bearbeitenKnopf.className = "kf-knopf kf-bearbeiten-knopf"; bearbeitenKnopf.textContent = "Editor";
      document.body.appendChild(bearbeitenKnopf);
      // Editor sitzt links neben „KI-Wunsch“; dessen Breite ändert sich mit dem Zähler
      new ResizeObserver(() => document.documentElement.style.setProperty("--kf-ed-rechts", (16 + knopf.offsetWidth + 10) + "px")).observe(knopf);
      bearbeitenKnopf.addEventListener("click", async () => {
        if (!(await be.sitzung())) { nachAnmeldung = "bearbeiten"; return öffnen(); }
        bearbeitenKnopf.disabled = true;
        try {
          projekt = projekt || await be.projekt(SLUG);
          if (!projekt) throw new Error("Für dieses Konto ist hier kein Projekt freigegeben.");
          // Die Seite so holen, wie sie im Git steht (der Editor arbeitet auf dem Quelltext, nicht auf dem veränderten DOM)
          const r = await fetch(location.href.split("#")[0], { cache: "no-store" });
          if (!r.ok) throw new Error("Die Seite konnte nicht geladen werden.");
          const text = await r.text();
          const rahmen = document.createElement("iframe");
          const ueberlauf = document.documentElement.style.overflow;
          window.KF_STUDIO_KONTEXT = { be, projekt, KF, text, url: location.origin + location.pathname, BASIS,
            schliessen() { rahmen.remove(); document.documentElement.style.overflow = ueberlauf; knopf.hidden = bearbeitenKnopf.hidden = false; bearbeitenKnopf.disabled = false; bearbeitenKnopf.focus(); } };
          const d = n => `${BASIS}${n}?v=${V}`;
          rahmen.className = "kf-studio"; rahmen.title = "Editor";
          rahmen.srcdoc = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Editor</title><link rel="stylesheet" href="${d("vendor/grapes.min.css")}"><link rel="stylesheet" href="${d("studio/studio.css")}"></head>
<body><p style="padding:24px;font:16px system-ui">Editor wird geladen …</p><script>window.KF_STUDIO_BASIS=${JSON.stringify(BASIS)}<\/script>${["vendor/grapes.min.js", "vendor/grapes.de.js", "sperren.js", "studio/bloecke.js", "studio/medien.js", "studio/design.js", "studio/ki.js", "studio/seo.js", "studio/studio.js"].map(n => `<script src="${d(n)}"><\/script>`).join("")}</body></html>`;
          document.documentElement.style.overflow = "hidden";
          document.body.appendChild(rahmen);
          knopf.hidden = bearbeitenKnopf.hidden = true;
          rahmen.focus();
        } catch (e) { alert(e.message); bearbeitenKnopf.disabled = false; }
      });
      // Seitenwechsel aus dem Editor (Reiter „Seiten“): …#kf-editor öffnet ihn auf der neuen Seite gleich wieder
      if (location.hash === "#kf-editor") {
        history.replaceState(null, "", location.pathname + location.search);
        be.sitzung().then(s => s && bearbeitenKnopf.click());
      }
    }
    dlg.addEventListener("close", () => { offen = false; document.documentElement.style.overflow = seitenUeberlauf; pinsEntfernen(); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });

    const rahmen = (titel, unter, inhalt) => `<div class="kf-innen"><div class="kf-kopf"><div><h2 id="kf-titel">${titel}</h2>${unter ? `<small>${unter}</small>` : ""}</div>
      <button type="button" class="kf-zu" data-aktion="schliessen" aria-label="Schließen">×</button></div><div class="kf-rumpf">${inhalt}</div></div>`;

    // ---------- Ansichten ----------
    let zeichnenNr = 0;
    async function zeichnen() {
      const nr = ++zeichnenNr;  // nur der jüngste Aufruf darf zeichnen – ein älterer, langsamerer würde neuere Daten überschreiben
      const s = await be.sitzung();
      if (!s) return anmeldung();
      projekt = projekt || await be.projekt(SLUG);
      if (!projekt) { dlg.innerHTML = rahmen("Wünsche", "", `<p>Für dieses Konto ist hier kein Projekt freigegeben.</p><button class="kf-btn hell" data-aktion="abmelden">Abmelden</button>`); return; }
      const [mitglieder, wuensche, kommentare, auto] = await Promise.all([be.mitglieder(projekt.id), be.wuensche(projekt.id), be.kommentare(projekt.id), be.automatik(projekt.id)]);
      if (nr !== zeichnenNr) return;
      namen = Object.fromEntries(mitglieder.map(m => [m.user_id, m.anzeigename || (m.rolle === "agentur" ? "Agentur" : "Kunde")]));
      const hier = wuensche.filter(w => urlPfad(w.seite_url) === SEITE);
      const w8 = KF.waechterText(auto);
      if (wuensche.some(w => w.status === "erledigt" && Date.parse(w.geaendert_am) > GELADEN)) versionAbwarten();
      const scroll = dlg.querySelector(".kf-rumpf")?.scrollTop || 0;
      dlg.innerHTML = rahmen("Wünsche zu dieser Seite", esc(projekt.name) + " · " + esc(namen[s.user.id] || s.user.email), `
        ${neueVersion ? `<div class="kf-neu" role="status"><span>Eure Änderung ist online.</span><button type="button" class="kf-btn klein" data-aktion="neu-laden">Seite neu laden</button></div>` : ""}
        ${be.istDemo ? `<p class="kf-demo">Demo-Modus: Daten bleiben nur in diesem Browser.</p>` : ""}
        <p class="kf-waechter"><span class="kf-punkt${w8.aktiv ? " an" : ""}"></span>${esc(w8.text)}</p>
        ${sammelBox()}
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

    function sammelBox() {
      const l = sammlung();
      if (!l.length) return "";
      return `<section class="kf-sammel" aria-labelledby="kf-sammel-titel"><h3 id="kf-sammel-titel">Eure Liste (${l.length})</h3>
        <p class="kf-hinweis">Noch nicht abgeschickt. Ihr könnt auf anderen Seiten weitersammeln.</p>
        <ol>${l.map((e, i) => `<li><span><span class="kf-etikett">${esc(KF.ARTEN[e.art] || "Sonstiges")}</span>${esc(e.text.slice(0, 90))}${e.anhaenge.length ? ` · ${e.anhaenge.length} Foto${e.anhaenge.length > 1 ? "s" : ""}` : ""}
          <small>${esc((e.seite_titel || "").split(/ [|–-] /)[0].trim().slice(0, 50))}</small></span>
          <button type="button" class="kf-btn hell klein" data-aktion="liste-weg" data-i="${i}" aria-label="Eintrag ${i + 1} entfernen">×</button></li>`).join("")}</ol>
        <button type="button" class="kf-btn" data-aktion="liste-senden">${l.length === 1 ? "Wunsch absenden" : `Alle ${l.length} Wünsche zusammen absenden`}</button>
        <p class="kf-fehler" role="alert" data-sammel-fehler></p></section>`;
    }

    // Liste abschicken: als Paket (gemeinsame Kennung), damit der Wächter alles in einem Durchgang umsetzt.
    // Jeder gesendete Eintrag wird sofort aus der Liste genommen – bricht etwas ab, wird nichts doppelt geschickt.
    async function sammlungSenden(knopf) {
      const l = sammlung();
      if (!l.length) return;
      knopf.disabled = true; knopf.textContent = "Wird gesendet …";
      const paket = l.length > 1 ? (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) : null;
      try {
        for (const [i, e] of l.entries()) {
          await be.wunschAnlegen({ projekt_id: projekt.id, ...e, details: paket ? { ...e.details, paket, paket_nr: i + 1, paket_anzahl: l.length } : e.details });
          sammlungSetzen(sammlung().slice(1));
        }
      } catch (err) {
        const f = dlg.querySelector("[data-sammel-fehler]"); if (f) f.textContent = err.message || "Senden fehlgeschlagen.";
        knopf.disabled = false; return;
      }
      await zeichnen(); zaehlen();
      const ziel = dlg.querySelector(".kf-liste"); if (ziel) ziel.scrollIntoView({ block: "start" });
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
          <button type="button" data-aktion="verschieben" aria-pressed="${!!d.verschiebung}"><span aria-hidden="true">✥</span>${d.verschiebung ? "Neu verschieben" : "Auf der Seite verschieben"}</button>
          <button type="button" data-aktion="markieren" aria-pressed="${!!neu.stelle && d.alter_text == null}"><span aria-hidden="true">◎</span>${neu.stelle ? "Andere Stelle markieren" : "Stelle auf der Seite markieren"}</button>
        </div>
        ${d.alter_text != null ? `<div class="kf-box"><b>Textänderung</b><br><del>${esc(d.alter_text)}</del><br>→ <ins>${esc(d.neuer_text)}</ins><div class="kf-zeile"><button type="button" class="kf-btn hell klein" data-aktion="text-weg">Änderung verwerfen</button></div></div>` : ""}
        ${d.verschiebung ? `<div class="kf-box"><b>Verschiebung</b><br>${esc(KF.verschiebungText(d.verschiebung))}<div class="kf-zeile"><button type="button" class="kf-btn hell klein" data-aktion="verschiebung-weg">Verschiebung verwerfen</button></div></div>` : ""}
        ${neu.stelle && d.alter_text == null && !d.verschiebung ? `<div class="kf-box">Markierte Stelle: „${esc(neu.stelle.text || neu.stelle.selektor)}“ <button type="button" class="kf-btn hell klein" data-aktion="stelle-weg">entfernen</button></div>` : ""}
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
        <div class="kf-zeile" style="margin-top:16px">
          ${sammlung().length
            ? `<button class="kf-btn" type="submit" value="liste" data-label="Zur Liste hinzufügen">Zur Liste hinzufügen</button><button class="kf-btn hell" type="submit" value="senden" data-label="Einzeln absenden">Einzeln absenden</button>`
            : `<button class="kf-btn" type="submit" value="senden" data-label="Wunsch absenden">Wunsch absenden</button><button class="kf-btn hell" type="submit" value="liste" data-label="Zur Liste hinzufügen">Zur Liste hinzufügen</button>`}
        </div>
        ${sammlung().length ? "" : `<p class="kf-hinweis">Mehrere Wünsche? Sammelt sie in der Liste – auch über mehrere Seiten – und schickt sie zusammen ab. Dann setzen wir alles in einem Durchgang um.</p>`}
        <p class="kf-fehler" role="alert"></p>
      </form>`;
    }

    // Erledigte Wünsche sind eingeklappt; was der Kunde aufklappt, bleibt beim Neuzeichnen offen
    const aufgeklappt = new Set();
    document.addEventListener("toggle", e => { const el = e.target; if (el.tagName === "DETAILS" && el.closest(".kf-eingeklappt")) el.open ? aufgeklappt.add(el.dataset.id) : aufgeklappt.delete(el.dataset.id); }, true);
    function karte(w, nr, ks, ichId) {
      const d = w.details || {}, meins = w.autor === ichId;
      const arbeit = w.status === "in_arbeit"
        ? `<div class="kf-arbeit">${esc(w.bearbeiter || "Agentur")} arbeitet daran${w.fertig_bis ? " – " + esc(KF.restzeit(w.fertig_bis)) : ""}${w.fortschritt ? `<br>${esc(w.fortschritt)}` : ""}</div>`
        : w.fortschritt ? `<div class="kf-arbeit">${esc(w.fortschritt)}</div>` : "";
      // Erst nach dem Laden dieser Seite fertig geworden → angezeigt wird noch die alte Fassung
      const frisch = w.status === "erledigt" && Date.parse(w.geaendert_am) > GELADEN - 5000;
      const zu = ["erledigt", "abgelehnt"].includes(w.status) && !frisch;
      const kopf = `<span class="kf-status ${w.status}">${w.stelle ? nr + " · " : ""}${esc(KF.STATUS[w.status] || w.status)}</span>
        ${w.art && w.art !== "sonstiges" ? `<span class="kf-etikett">${esc(KF.ARTEN[w.art] || w.art)}</span>` : ""}${w.prioritaet === 1 ? `<span class="kf-etikett wichtig">Wichtig</span>` : ""}${d.paket_anzahl > 1 ? `<span class="kf-etikett">Paket ${+d.paket_nr}/${+d.paket_anzahl}</span>` : ""}${zu ? `<span class="kf-auf">Details</span>` : ""}
        ${w.text ? `<p>${esc(w.text)}</p>` : ""}`;
      const rest = `${frisch ? `<div class="kf-neu" role="status"><span>Fertig! Ladet die Seite neu, um die Änderung zu sehen.</span><button type="button" class="kf-btn klein" data-aktion="neu-laden">Seite neu laden</button></div>` : ""}
        ${d.alter_text != null ? `<div class="kf-box"><del>${esc(d.alter_text)}</del><br>→ <ins>${esc(d.neuer_text)}</ins></div>` : ""}
        ${d.verschiebung ? `<div class="kf-box"><b>Verschiebung:</b> ${esc(KF.verschiebungText(d.verschiebung))}</div>` : ""}
        ${d.farbe ? `<div class="kf-box"><span class="kf-tupfer" style="background:${esc(d.farbe)}"></span>${esc(d.farbe)}</div>` : ""}
        ${(w.anhaenge || []).length ? `<div class="kf-fotos">${w.anhaenge.map(a => `<a class="kf-foto" data-anhang="${esc(a.pfad)}" target="_blank" rel="noopener"><img alt="${esc(a.name)}"></a>`).join("")}</div>` : ""}
        ${KF.schritte(w, "kf-schritte")}${arbeit}
        <div class="kf-meta">${esc(namen[w.autor] || "")}, ${esc(KF.zeit(w.erstellt_am))}${meins && w.status === "offen" ? ` · <button type="button" class="kf-btn hell klein" data-aktion="loeschen" data-id="${w.id}">Löschen</button>` : ""}</div>
        <div class="kf-k">${ks.filter(k => !(w.status === "rueckfrage" && k.text === ((w.details || {}).rueckfrage || {}).frage)).map(k => `<div><b>${esc(namen[k.autor] || "")}:</b> ${esc(k.text)}</div>`).join("")}
          ${w.status === "rueckfrage" ? antwortBox(w) : `<form data-form="kommentar" data-id="${w.id}"><label class="kf-nur" for="kf-k-${w.id}">Antwort zu diesem Wunsch</label>
            <input id="kf-k-${w.id}" maxlength="5000" placeholder="Antworten…"><button class="kf-btn klein">Senden</button></form>`}</div>`;
      return zu ? `<li class="kf-w kf-eingeklappt"><details data-id="${w.id}"${aufgeklappt.has(w.id) ? " open" : ""}><summary>${kopf}</summary>${rest}</details></li>` : `<li class="kf-w">${kopf}${rest}</li>`;
    }
    // Rückfrage der Automatik: Vorschläge zum Antippen und immer ein freies Antwortfeld
    function antwortBox(w) {
      const rf = (w.details || {}).rueckfrage || {}, opt = rf.optionen || [];
      return `<form class="kf-rf" data-form="kommentar" data-id="${w.id}">
        <p class="kf-rf-titel" id="kf-rf-${w.id}">${esc(rf.frage || "Rückfrage")}</p>
        ${opt.length ? `<p class="kf-rf-hilfe">Antwort antippen oder selbst schreiben</p>` : ""}
        ${opt.length ? `<div class="kf-rf-opt" role="group" aria-labelledby="kf-rf-${w.id}">${opt.map(o => `<button type="submit" class="kf-btn hell klein" name="option" value="${esc(o)}">${esc(o)}</button>`).join("")}</div>` : ""}
        <label class="kf-nur" for="kf-k-${w.id}">Eigene Antwort</label>
        <textarea id="kf-k-${w.id}" rows="3" maxlength="5000" placeholder="${opt.length ? "Oder eigene Antwort schreiben …" : "Rückfrage beantworten …"}"></textarea>
        <button class="kf-btn klein">Antwort senden</button></form>`;
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
          projekt = null;
          if (nachAnmeldung === "bearbeiten") { nachAnmeldung = ""; dlg.close(); document.querySelector(".kf-bearbeiten-knopf").click(); return; }
          await zeichnen(); zaehlen();
        } else if (f.dataset.form === "neu") {
          const zurListe = (e.submitter && e.submitter.value) === "liste";
          const text = neu.text.trim(), d = { ...neu.details };
          if (!text && d.alter_text == null && !d.verschiebung) { fehler.textContent = neu.art === "text" ? "Bitte zuerst den Text auf der Seite ändern oder eine Beschreibung schreiben." : "Bitte kurz beschreiben, was anders sein soll."; return; }
          const knopf = e.submitter || f.querySelector("button[type=submit]");
          f.querySelectorAll("button[type=submit]").forEach(b => (b.disabled = true));
          knopf.textContent = neu.dateien.length ? "Fotos werden hochgeladen …" : zurListe ? "Wird hinzugefügt …" : "Wird gesendet …";
          // Fotos gleich hochladen – so bleibt ein Listeneintrag auch beim Seitenwechsel vollständig
          const anhaenge = [];
          for (const datei of neu.dateien) anhaenge.push(await be.dateiHochladen(projekt.id, await KF.verkleinern(datei), datei.name));
          if (neu.art !== "design") delete d.farbe;
          const eintrag = {
            art: neu.art, details: d, anhaenge, prioritaet: neu.wichtig,
            text: text || (d.alter_text != null ? `Text ändern: „${String(d.alter_text).slice(0, 80)}“` : `Verschieben: „${(neu.stelle && neu.stelle.text || "").slice(0, 60)}“ – ${KF.verschiebungText(d.verschiebung)}`),
            seite_url: location.origin + location.pathname, seite_titel: document.title.slice(0, 300), stelle: neu.stelle,
          };
          if (zurListe) sammlungSetzen([...sammlung(), eintrag]);
          else await be.wunschAnlegen({ projekt_id: projekt.id, ...eintrag });
          vorschauUrls.forEach(u => URL.revokeObjectURL(u)); vorschauUrls.clear();
          neu = leer(); await zeichnen(); zaehlen();
          const ziel = dlg.querySelector(zurListe ? ".kf-sammel" : ".kf-liste"); if (ziel) ziel.scrollIntoView({ block: "start" });
        } else if (f.dataset.form === "kommentar") {
          const feld = f.querySelector("input, textarea"), opt = e.submitter && e.submitter.name === "option";
          const text = (opt ? e.submitter.value : feld.value).trim();
          if (!text) return;
          await be.kommentarAnlegen(f.dataset.id, text); feld.value = ""; await zeichnen();
        }
      } catch (err) {
        if (fehler) fehler.textContent = err.message; else alert(err.message);
        f.querySelectorAll("button[type=submit]").forEach(b => { b.disabled = false; if (b.dataset.label) b.textContent = b.dataset.label; });
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
      if (a === "neu-laden") return neuLaden();
      if (a === "liste-weg") { const l = sammlung(); l.splice(+t.dataset.i, 1); sammlungSetzen(l); zeichnen(); }
      if (a === "liste-senden") return sammlungSenden(t);
      if (a === "markieren") auswaehlen("markieren");
      if (a === "text-aendern") auswaehlen("text");
      if (a === "verschieben") auswaehlen("verschieben");
      if (a === "verschiebung-weg") { delete neu.details.verschiebung; neu.stelle = null; zeichnen(); }
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
    // modus: "markieren" | "text" | "verschieben"
    function auswaehlen(modus) {
      dlg.close();
      const textModus = modus === "text";
      const hinweis = banner({ text: "Klicke auf den Text, den du ändern möchtest – Esc bricht ab", verschieben: "Klicke auf das, was du verschieben möchtest – Esc bricht ab" }[modus] || "Klicke auf die Stelle, die du meinst – Esc bricht ab");
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
        if (textModus) textBearbeiten(el, zurück); else if (modus === "verschieben") verschieben(el, zurück); else zurück();
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

    // Element mit Maus/Finger (oder Pfeiltasten) verschieben. Hilfslinien zeigen Seitenmitte, Abschnittsmitte und Kanten
    // anderer Elemente; nahe einer Linie rastet es ein. Gespeichert wird nur die Verschiebung – die Seite wird danach zurückgesetzt.
    function verschieben(el, fertig) {
      const RASTER = 8, vorher = el.style.transform, vorherDisplay = el.style.display;
      // transform wirkt nicht auf Inline-Elemente (z. B. Links) – fürs Ziehen kurz inline-block
      if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
      const vw = document.documentElement.clientWidth;
      const r0 = el.getBoundingClientRect();
      const s0 = { x: scrollX, y: scrollY };
      const start = { l: r0.left + s0.x, t: r0.top + s0.y, w: r0.width, h: r0.height };
      const block = (el.parentElement && el.parentElement.closest("section, header, footer, main > *")) || el.parentElement || document.body;
      const bb = block.getBoundingClientRect();
      // Linien in Seitenkoordinaten: x-Linien (senkrecht) und y-Linien (waagrecht), je mit Kante l/c/r bzw. t/c/b
      const xs = [{ x: vw / 2 + s0.x, k: "c", name: "mittig zur Seite" }, { x: (bb.left + bb.right) / 2 + s0.x, k: "c", name: "mittig im Abschnitt" }];
      const ys = [];
      for (const o of [...block.querySelectorAll("h1,h2,h3,h4,p,img,a,button,table,ul,ol,figure,picture,blockquote,svg")].slice(0, 80)) {
        if (o === el || o.contains(el) || el.contains(o) || o.closest(".kf, .kf-knopf, .kf-markieren, .kf-pin")) continue;
        const r = o.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const n = `„${kurztext(o).slice(0, 30)}“`;
        xs.push({ x: r.left + s0.x, k: "l", name: `links bündig mit ${n}` }, { x: (r.left + r.right) / 2 + s0.x, k: "c", name: `mittig zu ${n}` }, { x: r.right + s0.x, k: "r", name: `rechts bündig mit ${n}` });
        ys.push({ y: r.top + s0.y, k: "t", name: `oben auf Höhe von ${n}` }, { y: (r.top + r.bottom) / 2 + s0.y, k: "c", name: `mittig auf Höhe von ${n}` }, { y: r.bottom + s0.y, k: "b", name: `unten bündig mit ${n}` });
      }
      const linien = document.createElement("div"); linien.className = "kf-linien"; document.body.append(linien);
      el.classList.add("kf-schiebt");
      const b = banner(`<span class="kf-info" aria-live="polite">Zieh es an die gewünschte Stelle – oder Pfeiltasten (mit Umschalt 10 px)</span>
        <button type="button" class="ja">Übernehmen</button><button type="button" class="nein" data-z="1">Zurücksetzen</button><button type="button" class="nein">Abbrechen</button>`);
      b.classList.add("unten");  // oben würde die Leiste das gezogene Element verdecken
      const info = b.querySelector(".kf-info");
      let dx = 0, dy = 0, nameX = "", nameY = "";

      const einrasten = (rohX, rohY) => {
        const kanten = (p, groesse, d) => ({ [p === "x" ? "l" : "t"]: d, c: d + groesse / 2, [p === "x" ? "r" : "b"]: d + groesse });
        let bx = null, by = null;
        const kx = kanten("x", start.w, start.l + rohX), ky = kanten("y", start.h, start.t + rohY);
        for (const l of xs) { const a = l.x - kx[l.k]; if (Math.abs(a) <= RASTER && (!bx || Math.abs(a) < Math.abs(bx.a))) bx = { a, l }; }
        for (const l of ys) { const a = l.y - ky[l.k]; if (Math.abs(a) <= RASTER && (!by || Math.abs(a) < Math.abs(by.a))) by = { a, l }; }
        return { dx: Math.round(rohX + (bx ? bx.a : 0)), dy: Math.round(rohY + (by ? by.a : 0)), lx: bx && bx.l, ly: by && by.l };
      };
      const setzen = (ndx, ndy, lx, ly) => {
        dx = ndx; dy = ndy; nameX = lx ? lx.name : ""; nameY = ly ? ly.name : "";
        el.style.transform = `${vorher} translate(${dx}px, ${dy}px)`.trim();
        linien.innerHTML = (lx ? `<div class="kf-linie senk" style="left:${lx.x}px;top:0;height:${document.documentElement.scrollHeight}px"><span style="top:${Math.round(scrollY + 90)}px">${esc(lx.name)}</span></div>` : "")
          + (ly ? `<div class="kf-linie waag" style="top:${ly.y}px;left:0;width:${document.documentElement.scrollWidth}px"><span>${esc(ly.name)}</span></div>` : "");
        const pfeil = (v, plus, minus) => v ? `${Math.abs(v)} px ${v > 0 ? plus : minus}` : "";
        info.textContent = [pfeil(dx, "nach rechts", "nach links"), pfeil(dy, "nach unten", "nach oben"), nameX, nameY].filter(Boolean).join(" · ") || "Noch nicht verschoben";
      };

      let ziehen = null;
      const runter = e => { if (e.button) return; e.preventDefault(); el.setPointerCapture(e.pointerId); ziehen = { x: e.clientX, y: e.clientY, dx, dy }; };
      const bewegen = e => { if (!ziehen) return; const r = einrasten(ziehen.dx + e.clientX - ziehen.x, ziehen.dy + e.clientY - ziehen.y); setzen(r.dx, r.dy, r.lx, r.ly); };
      const hoch = () => { ziehen = null; };
      const klickSperre = e => { if (el.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
      const taste = e => {
        const schritt = e.shiftKey ? 10 : 1, pfeile = { ArrowLeft: [-schritt, 0], ArrowRight: [schritt, 0], ArrowUp: [0, -schritt], ArrowDown: [0, schritt] };
        if (pfeile[e.key]) { e.preventDefault(); const r = einrasten(dx + pfeile[e.key][0], dy + pfeile[e.key][1]); setzen(r.dx, r.dy, r.lx, r.ly); }
        if (e.key === "Escape") { e.preventDefault(); ende(false); }
        if (e.key === "Enter") { e.preventDefault(); ende(true); }
      };
      el.addEventListener("pointerdown", runter); el.addEventListener("pointermove", bewegen);
      el.addEventListener("pointerup", hoch); el.addEventListener("pointercancel", hoch);
      document.addEventListener("click", klickSperre, true); document.addEventListener("keydown", taste, true);
      const ende = übernehmen => {
        el.removeEventListener("pointerdown", runter); el.removeEventListener("pointermove", bewegen);
        el.removeEventListener("pointerup", hoch); el.removeEventListener("pointercancel", hoch);
        document.removeEventListener("click", klickSperre, true); document.removeEventListener("keydown", taste, true);
        el.style.transform = vorher; el.style.display = vorherDisplay; el.classList.remove("kf-schiebt"); linien.remove(); b.remove();
        if (übernehmen && (dx || dy)) {
          neu.details.verschiebung = { dx, dy, ausrichtung: [nameX, nameY].filter(Boolean).join("; ").slice(0, 300), breite: vw };
          if (neu.art === "sonstiges") neu.art = "design";
        }
        fertig();
      };
      b.querySelector(".ja").addEventListener("click", e => { e.stopPropagation(); ende(true); });
      b.querySelector("[data-z]").addEventListener("click", e => { e.stopPropagation(); setzen(0, 0, null, null); });
      b.querySelector(".nein:not([data-z])").addEventListener("click", e => { e.stopPropagation(); ende(false); });
      setzen(0, 0, null, null);
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

    // Nur für Angemeldete: „Portal“ links neben „Editor“ (alle Wünsche, Verlauf, Rückfragen)
    const portalKnopf = document.createElement("a");
    portalKnopf.className = "kf-knopf kf-portal-knopf"; portalKnopf.textContent = "Portal"; portalKnopf.hidden = true;
    portalKnopf.href = PORTAL + "?projekt=" + encodeURIComponent(SLUG);
    document.body.appendChild(portalKnopf);
    const editorKnopf = document.querySelector(".kf-bearbeiten-knopf");
    const portalPlatz = new ResizeObserver(() => document.documentElement.style.setProperty("--kf-portal-rechts", (16 + knopf.offsetWidth + 10 + editorKnopf.offsetWidth + 10) + "px"));
    portalPlatz.observe(knopf); portalPlatz.observe(editorKnopf);

    // Zähler am Knopf: offene Wünsche auf dieser Seite
    async function zaehlen() {
      try {
        if (!(await be.sitzung())) { knopf.textContent = "KI-Wunsch"; portalKnopf.hidden = true; return; }
        portalKnopf.hidden = false;
        projekt = projekt || await be.projekt(SLUG);
        if (!projekt) return;
        const n = (await be.wuensche(projekt.id)).filter(w => urlPfad(w.seite_url) === SEITE && !["erledigt", "abgelehnt"].includes(w.status)).length;
        knopf.innerHTML = "KI-Wunsch" + (n ? `<span class="kf-zahl" aria-label="${n} offen">${n}</span>` : "");
        if (!stopp) stopp = be.beobachten(projekt.id, () => { if (offen && !tippt()) zeichnen(); zaehlen(); });
      } catch (e) {}
    }
    zaehlen();
    setInterval(() => { if (offen && !tippt()) zeichnen(); }, 30000); // Restzeit aktuell halten
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
