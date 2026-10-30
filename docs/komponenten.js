// Bausteine aus dem Editor auf der fertigen Website zum Leben erwecken. Der Wächter legt diese Datei als kf-komponenten.js
// neben jede Seite, die solche Bausteine nutzt, und setzt Formular-Adresse und Projekt ein. Ohne fremde Skripte, ohne Cookies.
//   data-komp="youtube"          – Video erst nach Klick laden (youtube-nocookie.com), vorher wird nichts übertragen
//   data-komp="galerie"          – Foto anklicken: groß ansehen (<dialog>), mit Pfeiltasten blättern
//   data-komp="slider"           – Vor/Zurück-Knöpfe für die waagerechte Reihe (läuft auch ohne Skript per Wischen)
//   data-komp="videohintergrund" – Video anhalten, wenn der Besucher weniger Bewegung wünscht
//   data-komp="formular"         – Absenden an die Edge Function „formular“ (Anfragen erscheinen im Portal)
(function () {
  const FORMULAR = "__KF_FORMULAR__", PROJEKT = "__KF_PROJEKT__";
  const alle = (s, f) => document.querySelectorAll(`[data-komp="${s}"]`).forEach(f);
  const GELADEN = Date.now();

  alle("youtube", box => {
    const knopf = box.querySelector("button");
    if (!knopf) return;
    knopf.addEventListener("click", () => {
      const v = box.dataset.video || "";
      const id = (/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(v) || [])[1] || (/^[\w-]{11}$/.test(v) ? v : "");
      if (!id) return;
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      f.title = box.dataset.titel || "Video";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.allowFullscreen = true;
      f.style.cssText = "width:100%;height:100%;border:0;display:block";
      box.style.padding = "0"; box.replaceChildren(f); f.focus();
    });
  });

  alle("galerie", galerie => {
    const bilder = [...galerie.querySelectorAll("img")];
    if (!bilder.length || !window.HTMLDialogElement) return;
    const d = document.createElement("dialog");
    d.setAttribute("aria-label", "Foto");
    d.style.cssText = "padding:0;border:0;background:transparent;max-width:96vw;max-height:94vh";
    d.innerHTML = `<style>dialog::backdrop{background:rgba(0,0,0,.85)}</style><img style="display:block;max-width:96vw;max-height:84vh;object-fit:contain">
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button type="button" data-b="-1">Zurück</button><button type="button" data-b="0">Schließen</button><button type="button" data-b="1">Weiter</button></div>`;
    document.body.appendChild(d);
    const gross = d.querySelector("img");
    let nr = 0;
    const zeigen = i => { nr = (i + bilder.length) % bilder.length; const b = bilder[nr]; gross.src = b.currentSrc || b.src; gross.alt = b.alt; };
    bilder.forEach((b, i) => { b.style.cursor = "zoom-in"; b.tabIndex = 0; b.setAttribute("role", "button");
      const auf = () => { zeigen(i); d.showModal(); };
      b.addEventListener("click", auf); b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); auf(); } }); });
    d.addEventListener("click", e => { const b = e.target.closest("[data-b]"); if (e.target === d || (b && b.dataset.b === "0")) return d.close(); if (b) zeigen(nr + +b.dataset.b); });
    d.addEventListener("keydown", e => { if (e.key === "ArrowRight") zeigen(nr + 1); if (e.key === "ArrowLeft") zeigen(nr - 1); });
  });

  alle("slider", reihe => {
    const leiste = document.createElement("div");
    leiste.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:10px";
    leiste.innerHTML = `<button type="button" aria-label="Zurück">‹</button><button type="button" aria-label="Weiter">›</button>`;
    const [zurueck, weiter] = leiste.children;
    const schritt = r => reihe.scrollBy({ left: r * reihe.clientWidth * 0.8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    zurueck.onclick = () => schritt(-1); weiter.onclick = () => schritt(1);
    reihe.after(leiste);
  });

  if (matchMedia("(prefers-reduced-motion: reduce)").matches)
    alle("videohintergrund", s => s.querySelectorAll("video").forEach(v => { v.removeAttribute("autoplay"); v.pause(); }));

  alle("formular", form => {
    if (form.tagName !== "FORM") return;
    // Falle für Programme, die Formulare automatisch ausfüllen: Menschen sehen das Feld nicht
    const falle = document.createElement("div");
    falle.setAttribute("aria-hidden", "true");
    falle.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden";
    falle.innerHTML = `<label>Website<input name="webseite" tabindex="-1" autocomplete="off"></label>`;
    form.appendChild(falle);
    let meldung = form.querySelector("[data-komp-meldung]");
    if (!meldung) { meldung = document.createElement("p"); form.appendChild(meldung); }
    meldung.setAttribute("role", "status");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const knopf = form.querySelector('button[type="submit"], button:not([type])');
      const felder = {};
      for (const [k, v] of new FormData(form)) if (k !== "webseite") felder[k] = felder[k] ? felder[k] + ", " + v : String(v);
      if (!FORMULAR || FORMULAR.startsWith("__")) { meldung.textContent = "Vorschau: Im Editor wird nichts verschickt."; return; }
      if (knopf) knopf.disabled = true;
      meldung.textContent = "Wird gesendet …";
      try {
        const r = await fetch(FORMULAR, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projekt: PROJEKT, formular: form.dataset.formular || "kontakt", seite: location.href.split("#")[0],
            felder, webseite: form.querySelector('[name="webseite"]').value, dauer: Date.now() - GELADEN }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.fehler || "Senden fehlgeschlagen");
        form.reset();
        meldung.textContent = form.dataset.danke || "Danke! Eure Nachricht ist angekommen – wir melden uns.";
      } catch (err) {
        meldung.textContent = `Das hat nicht geklappt: ${err.message}. Bitte später noch einmal versuchen oder anrufen.`;
      } finally { if (knopf) knopf.disabled = false; }
    });
  });
})();
