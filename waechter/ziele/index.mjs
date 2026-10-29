// Veröffentlichen je Anbieter. Alle Bausteine liefern { dateien, ziel, meldung } oder werfen einen Fehler.
//   veroeffentlichen: true  → git push (Sicherung und GitHub Pages)
//   ziel.art: "sftp"        → zusätzlich per SFTP auf den Server des Kunden
// Neue Anbieter (z. B. Netlify-API) kommen als weiterer Baustein hier dazu.
import { githubVeroeffentlichen } from "./github.mjs";
import { sftpVeroeffentlichen } from "./sftp.mjs";

export const hatZiel = p => !!p.veroeffentlichen || (p.ziel || {}).art === "sftp";

export async function veroeffentlichen(p, env, merkOrdner) {
  const teile = [];
  if (p.veroeffentlichen) teile.push(githubVeroeffentlichen(p));
  if ((p.ziel || {}).art === "sftp") {
    // Netzfehler kommen vor – bis zu drei Versuche
    let letzter;
    for (let versuch = 1; versuch <= 3; versuch++) {
      try { teile.push(await sftpVeroeffentlichen(p, env, merkOrdner)); letzter = null; break; }
      catch (e) {
        letzter = e;
        if (/fehlen|unvollständig|Ausgabe-Ordner|authentication|Anmeldung|All configured authentication methods failed/i.test(e.message)) break;  // Wiederholen hilft nicht
        await new Promise(r => setTimeout(r, 5000 * versuch));
      }
    }
    if (letzter) throw letzter;
  }
  return {
    dateien: teile.reduce((s, t) => s + t.dateien, 0),
    ziel: teile.map(t => t.ziel).join(" + ") || "nirgends",
    meldung: teile.map(t => t.meldung).filter(Boolean).join("; "),
  };
}
