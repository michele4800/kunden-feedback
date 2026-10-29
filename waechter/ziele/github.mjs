// Veröffentlichen per git push (GitHub Pages oder jedes Hosting, das aus einem Git-Repo baut, z. B. Netlify mit Git).
import { execFileSync } from "node:child_process";

const git = (ordner, ...args) => execFileSync("git", args, { cwd: ordner, encoding: "utf8" }).trim();

export function githubVeroeffentlichen(p) {
  let offen = 0;
  try { offen = git(p.ordner, "diff", "--name-only", `origin/${p.zweig}..${p.zweig}`).split("\n").filter(Boolean).length; } catch (e) {}
  git(p.ordner, "push", "-q", "origin", p.zweig);
  const remote = git(p.ordner, "remote", "get-url", "origin");
  return { dateien: offen, ziel: /github\.com/.test(remote) ? "GitHub Pages" : "Git " + remote.replace(/^.*[/:]([^/]+\/[^/]+?)(\.git)?$/, "$1"), meldung: "" };
}
