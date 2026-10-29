// Neue Websites aus dem Dashboard selbst einrichten: GitHub-Repo finden (oder anlegen), in den Projekte-Ordner klonen,
// Einbau-Code (KI-Wunsch und Editor) in jede HTML-Seite setzen, hochladen und GitHub Pages einschalten.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const run = (befehl, args, cwd) => execFileSync(befehl, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

// „https://konto.github.io/name/“ → „konto/name“; Benutzerseite „https://konto.github.io/“ → „konto/konto.github.io“
export function repoAusAdresse(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\.github\.io(?:\/([A-Za-z0-9._-]+))?\/?(?:[?#].*)?$/i.exec(String(url || "").trim());
  if (!m || m[2] === "." || m[2] === "..") return "";
  return `${m[1]}/${m[2] || m[1] + ".github.io"}`;
}

// Einbau-Code vor dem letzten </body> einsetzen; null, wenn er schon drin ist oder es kein </body> gibt
export function einbauen(html, schnipsel) {
  if (html.includes("feedback.js")) return null;
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i < 0 ? null : html.slice(0, i) + schnipsel + "\n" + html.slice(i);
}

const startseite = name => `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${name.replace(/[<&>"]/g, "")}</title>
<style>body{font:18px/1.5 system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 20px;color:#222}</style></head>
<body><h1>${name.replace(/[<&>"]/g, "")}</h1><p>Hier entsteht die neue Website.</p>
</body></html>
`;

// Liefert den Eintrag für den Wächter ({ ordner, zweig, veroeffentlichen, vorschau_url })
export function einrichten(projekt, { basis, gitDaten, widget, log }) {
  const slug = projekt.slug;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw new Error(`ungültiger Kurzname „${slug}“`);
  const repo = repoAusAdresse(projekt.vorschau_url);
  if (!repo) throw new Error("Vorschau-Adresse ist keine GitHub-Pages-Adresse (https://konto.github.io/name/) – Website dann von Hand in projekte.json eintragen");
  const ordner = path.join(basis, slug);

  try { run("gh", ["repo", "view", repo, "--json", "name"]); }
  catch (e) { run("gh", ["repo", "create", repo, "--public", "--description", `Website ${projekt.name}`.slice(0, 300)]); log(`[${slug}] GitHub-Repo ${repo} angelegt`); }

  if (!existsSync(ordner)) {
    mkdirSync(gitDaten, { recursive: true });
    run("git", ["clone", "-q", "--separate-git-dir", path.join(gitDaten, slug), `https://github.com/${repo}.git`, ordner]);
    log(`[${slug}] nach ${ordner} geholt`);
  } else if (!existsSync(path.join(ordner, ".git"))) throw new Error(`${ordner} gibt es schon, ist aber kein Git-Ordner`);

  let leer = false;
  try { run("git", ["rev-parse", "HEAD"], ordner); } catch (e) { leer = true; }
  if (leer) { run("git", ["symbolic-ref", "HEAD", "refs/heads/main"], ordner); writeFileSync(path.join(ordner, "index.html"), startseite(projekt.name)); }

  const schnipsel = `<script src="${widget}" data-projekt="${slug}" defer></script>`;
  const dateien = leer ? ["index.html"] : run("git", ["ls-files", "*.html"], ordner).split("\n").filter(Boolean);
  const geaendert = dateien.filter(d => {
    const f = path.join(ordner, d), neu = einbauen(readFileSync(f, "utf8"), schnipsel);
    if (neu) writeFileSync(f, neu);
    return !!neu;
  });
  if (geaendert.length) {
    run("git", ["add", "--", ...geaendert], ordner);
    run("git", ["commit", "-q", "-m", "Kunden-Feedback einbauen (KI-Wunsch und Editor)"], ordner);
    run("git", ["push", "-q", "-u", "origin", "HEAD"], ordner);
    log(`[${slug}] Einbau-Code in ${geaendert.length} Seite(n) gesetzt und hochgeladen`);
  }
  const zweig = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], ordner);

  try { run("gh", ["api", `repos/${repo}/pages`]); }
  catch (e) { run("gh", ["api", "-X", "POST", `repos/${repo}/pages`, "-f", `source[branch]=${zweig}`, "-f", "source[path]=/"]); log(`[${slug}] GitHub Pages eingeschaltet`); }

  return { ordner: ordner.replace(/\\/g, "/"), zweig, veroeffentlichen: true, vorschau_url: projekt.vorschau_url };
}
