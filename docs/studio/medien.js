// Medienbibliothek des Editors: eigene Fotos und Videos (Supabase-Speicher „anhaenge“), Fotos der Website und freie Fotos
// (Wikimedia Commons, nur gemeinfrei/CC0 – keine Namensnennung nötig, die Quelle steht trotzdem im title).
// Jedes Foto wird vor dem Einfügen zugeschnitten (frei, 4:3, 16:9, 1:1, 3:4), verkleinert und bekommt einen Alternativtext.
// Ersetzt den Asset-Manager von GrapesJS (core:open-assets) und bietet KF_MEDIEN.waehlen() für andere Reiter.
(function () {
  const TEILE = (window.KF_STUDIO_TEILE = window.KF_STUDIO_TEILE || []);
  const FORMATE = [["Original", 0], ["4:3", 4 / 3], ["16:9", 16 / 9], ["1:1", 1], ["3:4", 3 / 4]];
  const MAX_VIDEO = 25 * 1024 * 1024;

  TEILE.push({ id: "medien", titel: "Medien", aufbauen(ctx, feld) {
    const { editor, be, projekt, KF, esc, bildPfade } = ctx;
    let bibliothek = null;
    const laden = async (neu) => { if (!bibliothek || neu) bibliothek = await be.medien(projekt.id).catch(() => []); return bibliothek; };

    // ---------- Reiter: Übersicht ----------
    async function reiterZeigen() {
      feld.innerHTML = `<p class="hinweis">Eure Fotos und Videos. Foto auf der Seite doppelt anklicken, um es auszutauschen.</p>
        <label class="btn klein md-hoch">Fotos oder Video hochladen<input type="file" accept="image/*,video/mp4,video/webm" multiple hidden></label>
        <div class="md-raster" style="margin-top:12px">${(await laden()).map(m => kachel(m)).join("") || `<p class="hinweis">Noch nichts hochgeladen.</p>`}</div>`;
      feld.querySelector("input[type=file]").onchange = async e => { await hochladen([...e.target.files]); reiterZeigen(); };
    }
    const kachel = (m, i = "") => m.typ && m.typ.startsWith("video/")
      ? `<button type="button" class="md-kachel" data-i="${i}" title="${esc(m.name)}"><video src="${esc(m.url)}" muted preload="metadata"></video><span>Video</span></button>`
      : `<button type="button" class="md-kachel" data-i="${i}" title="${esc(m.name || "")}"><img src="${esc(m.vorschau || m.url)}" alt="" loading="lazy"></button>`;

    async function hochladen(dateien) {
      const neu = [];
      for (const f of dateien) {
        try {
          if (/^video\/(mp4|webm)$/.test(f.type)) {
            if (f.size > MAX_VIDEO) { alert(`„${f.name}“ ist zu groß (höchstens 25 MB). Bitte kürzer oder kleiner exportieren.`); continue; }
            ctx.status("Video wird hochgeladen …");
            const d = await be.dateiHochladen(projekt.id, f, f.name); neu.push({ ...d, url: await be.dateiUrl(d.pfad) });
          } else if (/^image\//.test(f.type)) {
            ctx.status("Foto wird hochgeladen …");
            const d = await be.dateiHochladen(projekt.id, await KF.verkleinern(f), f.name); neu.push({ ...d, url: await be.dateiUrl(d.pfad) });
          }
        } catch (e) { alert(`„${f.name}“ konnte nicht hochgeladen werden: ${e.message}`); }
      }
      ctx.status();
      await laden(true);
      return neu;
    }

    // ---------- Fenster ----------
    const huelle = document.createElement("div");
    huelle.className = "st-meldung md"; huelle.hidden = true;
    document.body.appendChild(huelle);
    let auftrag = null;  // { art: "bild"|"video", ziel?, fertig(ergebnis) }

    function oeffnen(a) {
      auftrag = a;
      huelle.hidden = false;
      liste("eigene");
    }
    const schliessen = () => { huelle.hidden = true; auftrag = null; huelle.innerHTML = ""; };
    huelle.addEventListener("keydown", e => { if (e.key === "Escape") schliessen(); });

    const kopf = (titel, aktiv) => `<div class="md-kopf"><h2 id="md-titel">${titel}</h2><button type="button" class="btn klein" data-md="zu" aria-label="Schließen">×</button></div>
      ${auftrag.art === "video" ? "" : `<div class="st-reiter md-reiter" role="tablist">${[["eigene", "Eure Medien"], ["seite", "Von der Website"], ["frei", "Freie Fotos"]].map(([k, t]) =>
        `<button type="button" role="tab" data-md-quelle="${k}" aria-selected="${k === aktiv}">${t}</button>`).join("")}</div>`}`;

    let treffer = [];
    async function liste(quelle, suche = "") {
      const video = auftrag.art === "video";
      huelle.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="md-titel" class="md-fenster">${kopf(video ? "Video wählen" : "Foto wählen", quelle)}
        <div class="md-rumpf"><p class="hinweis">Wird geladen …</p></div></div>`;
      const rumpf = huelle.querySelector(".md-rumpf");
      if (quelle === "eigene") {
        treffer = (await laden()).filter(m => video ? m.typ.startsWith("video/") : m.typ.startsWith("image/"));
        rumpf.innerHTML = `<label class="btn klein md-hoch">${video ? "Video hochladen (MP4, höchstens 25 MB)" : "Fotos hochladen"}<input type="file" accept="${video ? "video/mp4,video/webm" : "image/*"}" ${video ? "" : "multiple"} hidden></label>
          <div class="md-raster">${treffer.map((m, i) => kachel(m, i)).join("") || `<p class="hinweis">Noch nichts hochgeladen.</p>`}</div>`;
        rumpf.querySelector("input[type=file]").onchange = async e => {
          const neu = await hochladen([...e.target.files]);
          if (neu.length === 1) waehlen({ ...neu[0], typ: neu[0].typ }); else liste("eigene");
        };
      } else if (quelle === "seite") {
        const gesehen = new Set();
        treffer = editor.getWrapper().find("img").map(c => c.get("src")).filter(s => s && !/^data:|platzhalter\.svg/.test(s) && !gesehen.has(s) && gesehen.add(s))
          .map(src => ({ url: new URL(src, ctx.SEITE).href, src, typ: "image/", name: src.split("/").pop() }));
        rumpf.innerHTML = `<div class="md-raster">${treffer.map((m, i) => kachel(m, i)).join("") || `<p class="hinweis">Keine Fotos auf dieser Seite.</p>`}</div>`;
      } else {
        rumpf.innerHTML = `<form class="zeile md-suche"><input name="q" type="search" required placeholder="z. B. Huhn, Hofladen, Brot" value="${esc(suche)}" aria-label="Suchbegriff"><button class="btn klein haupt">Suchen</button></form>
          <p class="hinweis">Gemeinfreie Fotos von Wikimedia Commons – frei nutzbar, auch ohne Namensnennung. Englische Begriffe finden oft mehr.</p><div class="md-raster"></div>`;
        rumpf.querySelector("form").onsubmit = e => { e.preventDefault(); liste("frei", new FormData(e.target).get("q")); };
        if (suche) {
          const raster = rumpf.querySelector(".md-raster");
          raster.innerHTML = `<p class="hinweis">Suche läuft …</p>`;
          try { treffer = await freieFotos(suche); raster.innerHTML = treffer.map((m, i) => kachel(m, i)).join("") || `<p class="hinweis">Nichts Freies gefunden. Anderen Begriff versuchen.</p>`; }
          catch (e) { raster.innerHTML = `<p class="fehler">Die Suche hat nicht geklappt: ${esc(e.message)}</p>`; }
        }
      }
      (huelle.querySelector('[aria-selected="true"]') || huelle.querySelector("button")).focus();
    }

    async function freieFotos(q) {
      const u = new URL("https://commons.wikimedia.org/w/api.php");
      Object.entries({ action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6", gsrlimit: "50", gsrsearch: q + " filetype:bitmap",
        prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: "1800", iiextmetadatafilter: "LicenseShortName|Artist" }).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u); if (!r.ok) throw new Error("Wikimedia antwortet nicht");
      const seiten = Object.values((await r.json()).query?.pages || {});
      return seiten.map(s => {
        const i = (s.imageinfo || [])[0] || {}, m = i.extmetadata || {};
        const lizenz = (m.LicenseShortName || {}).value || "";
        if (!/^(CC0|Public domain|PD)/i.test(lizenz) || !/^image\/(jpeg|png|webp)$/.test(i.mime)) return null;
        const wer = String((m.Artist || {}).value || "").replace(/<[^>]*>/g, "").trim().slice(0, 80);
        return { url: i.thumburl || i.url, vorschau: (i.thumburl || i.url).replace(/\/\d+px-/, "/400px-"), typ: i.mime, name: s.title.replace(/^File:/, ""),
          quelle: `Foto: ${wer ? wer + ", " : ""}${lizenz}, Wikimedia Commons` };
      }).filter(Boolean);
    }

    huelle.addEventListener("click", e => {
      if (e.target === huelle || e.target.closest('[data-md="zu"]')) return schliessen();
      const q = e.target.closest("[data-md-quelle]"); if (q) return liste(q.dataset.mdQuelle);
      const k = e.target.closest(".md-kachel"); if (k && treffer[+k.dataset.i]) waehlen(treffer[+k.dataset.i]);
    });

    // ---------- Zuschneiden und beschreiben ----------
    async function waehlen(m) {
      if (auftrag.art === "video") { const a = auftrag; schliessen(); return a.fertig({ url: m.url, pfad: m.pfad }); }
      const bild = new Image(); bild.crossOrigin = "anonymous";
      try { await new Promise((ok, f) => { bild.onload = ok; bild.onerror = () => f(new Error("Das Foto lässt sich nicht laden")); bild.src = m.url; }); }
      catch (e) { return alert(e.message); }
      const altBisher = auftrag.ziel ? auftrag.ziel.getAttributes().alt || "" : "";
      huelle.querySelector(".md-fenster").innerHTML = `<div class="md-kopf"><h2 id="md-titel">Foto zuschneiden und beschreiben</h2><button type="button" class="btn klein" data-md="zu" aria-label="Schließen">×</button></div>
        <div class="md-rumpf md-schnitt">
          <div class="md-buehne"><canvas width="560" height="420" aria-label="Ausschnitt – mit der Maus oder dem Finger verschieben"></canvas></div>
          <div class="zeile md-formate" role="group" aria-label="Format">${FORMATE.map(([n], i) => `<button type="button" class="btn klein" data-format="${i}" aria-pressed="${i === 0}">${n}</button>`).join("")}</div>
          <div class="feld"><label for="md-zoom">Vergrößern</label><input id="md-zoom" type="range" min="1" max="3" step="0.01" value="1"></div>
          <div class="feld"><label for="md-alt">Was ist zu sehen? (für Blinde und Google)</label><input id="md-alt" maxlength="200" value="${esc(altBisher)}" placeholder="z. B. Hühner auf der Wiese vor dem Hofladen"></div>
          <label class="md-schmuck"><input type="checkbox" id="md-schmuck"> Nur Schmuck, zeigt nichts Wichtiges</label>
          <p class="fehler" id="md-fehler" hidden>Bitte kurz beschreiben, was auf dem Foto ist – oder „Nur Schmuck“ ankreuzen.</p>
          <div class="zeile"><button type="button" class="btn haupt" data-md="einfuegen">Einfügen</button><button type="button" class="btn" data-md="zurueck">Zurück</button></div>
        </div>`;
      const leinwand = huelle.querySelector("canvas"), g = leinwand.getContext("2d");
      let format = 0, zoom = 1, ox = 0, oy = 0;
      const masse = () => {  // Bühne: höchstens 560×420, Seitenverhältnis wie gewählt
        const v = FORMATE[format][1] || bild.width / bild.height;
        return v >= 560 / 420 ? [560, Math.round(560 / v)] : [Math.round(420 * v), 420];
      };
      const skala = () => { const [w, h] = masse(); return Math.max(w / bild.width, h / bild.height) * zoom; };
      const zeichnen = () => {
        const [w, h] = masse(), s = skala();
        leinwand.width = w; leinwand.height = h;
        ox = Math.min(0, Math.max(w - bild.width * s, ox)); oy = Math.min(0, Math.max(h - bild.height * s, oy));
        g.drawImage(bild, ox, oy, bild.width * s, bild.height * s);
      };
      const mitte = () => { const [w, h] = masse(), s = skala(); ox = (w - bild.width * s) / 2; oy = (h - bild.height * s) / 2; zeichnen(); };
      mitte();
      let ziehen = null;
      leinwand.onpointerdown = e => { ziehen = [e.clientX - ox, e.clientY - oy]; leinwand.setPointerCapture(e.pointerId); };
      leinwand.onpointermove = e => { if (ziehen) { ox = e.clientX - ziehen[0]; oy = e.clientY - ziehen[1]; zeichnen(); } };
      leinwand.onpointerup = () => { ziehen = null; };
      leinwand.tabIndex = 0;
      leinwand.onkeydown = e => { const d = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[e.key]; if (d) { e.preventDefault(); ox += d[0]; oy += d[1]; zeichnen(); } };
      huelle.querySelector(".md-formate").onclick = e => { const b = e.target.closest("[data-format]"); if (!b) return;
        format = +b.dataset.format; huelle.querySelectorAll("[data-format]").forEach(x => x.setAttribute("aria-pressed", x === b)); mitte(); };
      huelle.querySelector("#md-zoom").oninput = e => { const [w, h] = masse(), alt = skala(); zoom = +e.target.value; const s = skala();
        ox = w / 2 - (w / 2 - ox) * s / alt; oy = h / 2 - (h / 2 - oy) * s / alt; zeichnen(); };
      huelle.querySelector('[data-md="zurueck"]').onclick = () => liste("eigene");
      huelle.querySelector('[data-md="einfuegen"]').onclick = async e => {
        const alt = huelle.querySelector("#md-alt").value.trim(), schmuck = huelle.querySelector("#md-schmuck").checked;
        if (!alt && !schmuck) { huelle.querySelector("#md-fehler").hidden = false; return huelle.querySelector("#md-alt").focus(); }
        e.target.disabled = true; e.target.textContent = "Wird gespeichert …";
        try {
          let erg = { url: m.url, pfad: m.pfad, src: m.src };
          // Unverändert und schon in der Bibliothek oder auf der Seite: so übernehmen. Sonst Ausschnitt rendern und hochladen.
          if (format !== 0 || zoom !== 1 || !(m.pfad || m.src)) {
            const s = skala(), [w, h] = masse();
            const sw = w / s, sh = h / s, f = Math.min(1, 2000 / Math.max(sw, sh));
            const c = document.createElement("canvas"); c.width = Math.round(sw * f); c.height = Math.round(sh * f);
            c.getContext("2d").drawImage(bild, -ox / s, -oy / s, sw, sh, 0, 0, c.width, c.height);
            const png = m.typ === "image/png";
            const blob = await new Promise(ok => c.toBlob(ok, png ? "image/png" : "image/jpeg", 0.86));
            const d = await be.dateiHochladen(projekt.id, blob, (m.name || "foto").replace(/\.\w+$/, "") + (png ? ".png" : ".jpg"));
            erg = { url: await be.dateiUrl(d.pfad), pfad: d.pfad };
            bibliothek = null;
          }
          const a = auftrag; schliessen();
          a.fertig({ ...erg, alt: schmuck ? "" : alt, quelle: m.quelle || "" });
        } catch (err) { alert("Das Foto konnte nicht gespeichert werden: " + err.message); e.target.disabled = false; e.target.textContent = "Einfügen"; }
      };
      leinwand.focus();
    }

    // ---------- Anbindung ----------
    const API = {
      waehlen: (art = "bild") => new Promise(ok => oeffnen({ art, fertig: ok })),
      // Foto-Element auf der Seite austauschen
      bildSetzen(ziel) {
        oeffnen({ art: "bild", ziel, fertig(x) {
          if (x.pfad) bildPfade.set(x.url, x.pfad);
          ziel.set("src", x.src || x.url);
          ziel.addAttributes({ alt: x.alt, ...(x.quelle ? { title: x.quelle } : {}) });
          editor.select(ziel);
        } });
      },
    };
    window.KF_MEDIEN = API;
    editor.Commands.add("core:open-assets", { run(ed, s, opt = {}) { const z = opt.target || ed.getSelected(); if (z && z.get("type") === "image") API.bildSetzen(z); }, stop() {} });
    document.querySelector('[data-reiter="medien"]').addEventListener("click", reiterZeigen);
    feld.addEventListener("click", e => {
      const k = e.target.closest(".md-kachel"); if (!k || !bibliothek) return;
      const z = editor.getSelected();
      if (z && z.get("type") === "image") API.bildSetzen(z); else alert("Erst auf der Seite ein Foto anklicken, dann hier austauschen – oder das Foto auf der Seite doppelt anklicken.");
    });
  } });
})();
