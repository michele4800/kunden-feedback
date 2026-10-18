// Kunden-Feedback – Lader. Einbinden auf jeder Seite der Kunden-Website:
//   <script src="https://…/kunden-feedback/feedback.js" data-projekt="projekt-slug" defer></script>
// Diese Datei bleibt klein und ändert sich (fast) nie. Sie fragt bei jedem Aufruf nach, ob widget.js neu ist
// (cache: "no-cache" = kurze Rückfrage beim Server), damit Updates sofort ankommen statt erst nach 10 Minuten Browser-Cache.
(function () {
  const skript = document.currentScript;
  if (!skript) return;
  const ziel = skript.src.replace(/[^/]*$/, "") + "widget.js";
  const laden = () => {
    const s = document.createElement("script");
    s.src = ziel;
    for (const [k, v] of Object.entries(skript.dataset)) s.dataset[k] = v;
    document.head.appendChild(s);
  };
  fetch(ziel, { cache: "no-cache" }).then(laden, laden);
})();
