# Kunden-Feedback

Kunden melden sich auf ihrer Website an und tragen Wünsche **direkt zur jeweiligen Seite** ein, auf Wunsch mit markierter Stelle.
Alles synchronisiert sich live. Ein **Wächter** kann neue Wünsche automatisch von Claude Code umsetzen lassen –
der Kunde sieht dabei, *dass* daran gearbeitet wird und *wann* es voraussichtlich fertig ist.

Wiederverwendbar für beliebig viele Kunden: ein Supabase-Projekt, je Kunde ein Eintrag.

```
Kunde (Website + Widget) ──► Supabase (EU) ◄── Portal (Kunde & Agentur)
                                   ▲
                                   └── Wächter (dein PC) ──► Claude Code ──► Git/GitHub Pages
```

## Bestandteile

| Ordner | Inhalt |
|---|---|
| `docs/feedback.js` | **Widget** für jede Kunden-Website: Knopf „Wünsche“, Anmeldung, Werkzeuge (siehe unten), Verlauf, Live-Status |
| `docs/portal/` | **Portal**: alle Wünsche mit Filter, Status, Restzeit, Antworten, Fragen, Freigabe, Export für Claude |
| `docs/backend.js` | Gemeinsame Schicht für Supabase und den Demo-Modus |
| `docs/konfig.js` | Supabase-Adresse und öffentlicher Schlüssel (leer = Demo-Modus) |
| `supabase/schema.sql` | Tabellen, Zugriffsregeln (RLS), Trigger, Realtime |
| `supabase/neuer-kunde.sql` | Vorlage: Projekt, Mitglieder, Automatik und Fragen für einen Kunden |
| `waechter/` | **Wächter**: setzt Wünsche mit Claude Code um |
| `test/` | Tests der Zugriffsregeln (echtes Postgres) und Praxistest für Claude Code |

Status eines Wunsches: **offen → in Arbeit** (mit Bearbeiter, Stand, voraussichtlicher Fertigstellung) → **erledigt**,
oder **Rückfrage** (Kunde antwortet → wieder offen), **wartet auf Freigabe** (Modus „mit Freigabe“), **nicht umgesetzt**.

## Werkzeuge für Kunden

Im Widget wählt der Kunde zuerst, **was** er möchte – danach zeigt es die passenden Werkzeuge:

- **Text ändern**: Absatz auf der Seite anklicken und direkt umschreiben. Gespeichert wird „bisher → neu“; die Seite selbst bleibt unverändert.
- **Foto tauschen / Neuer Inhalt**: bis zu 5 Fotos (JPEG, PNG, WebP, PDF), werden im Browser auf max. 2000 px verkleinert.
- **Farbe & Design**: Farbwähler mit Pipette (Chrome/Edge) – Farbe direkt von der Seite aufnehmen.
- **Auf der Seite verschieben**: Element anklicken und mit Maus, Finger oder Pfeiltasten ziehen. Hilfslinien zeigen
  Seitenmitte, Abschnittsmitte und Kanten anderer Elemente; nahe einer Linie rastet es ein. Gespeichert wird nur die
  Verschiebung („161 px nach rechts · mittig zur Seite“), die Seite selbst bleibt unverändert. Der Wächter fotografiert
  daraus ein Wunschbild, Claude setzt die Position sauber im Layout um.
- **Stelle markieren**: Element anklicken, im Portal und auf der Seite erscheint eine Stecknadel.
- **Wichtigkeit**: wichtig / normal / kann warten – der Wächter arbeitet wichtige Wünsche zuerst ab.

Der Wächter lädt angehängte Fotos in den Ordner `eingang/` des Projekts, Claude sieht sie sich an und wählt,
welche auf die Website kommen. Die Automatik legt sie als WebP ab (Größen aus `bilder` in `projekte.json`), danach wird `eingang/` gelöscht.

**Augen der Automatik:** Ist in `projekte.json` eine `vorschau_url` eingetragen, fotografiert der Wächter die betroffene Seite
(markierte Stelle, Desktop 1440 px und Handy 390 px) vor der Änderung und danach. Claude vergleicht beide Fotos und bessert bis zu
zweimal nach. Dafür wird das installierte Google Chrome genutzt (anderer Pfad: `"chrome"` in `projekte.json`).

Mit `?kf-demo` in der Adresse läuft Widget oder Portal auch bei eingetragenem Server im Demo-Modus (zum Vorführen).

## Einmalige Einrichtung (ca. 15 Minuten)

1. **Supabase-Projekt anlegen** auf [supabase.com](https://supabase.com): Region **Frankfurt (eu-central-1)**.
   Unter *Organization → Legal Documents* den Auftragsverarbeitungsvertrag (DPA) abschließen.
2. **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → *Run*. Die Datei ist wiederholbar: nach jedem Update
   von `schema.sql` einfach erneut ausführen (legt u. a. den Speicher `anhaenge` für Fotos an).
3. **Authentication → Sign In / Providers**: „Allow new users to sign up“ **ausschalten** (nur du legst Zugänge an).
   **Authentication → URL Configuration**: als *Site URL* und *Redirect URL* das Portal eintragen
   (`https://michele4800.github.io/kunden-feedback/portal/`), damit „Passwort vergessen“ funktioniert.
4. **Project Settings → API**: *Project URL* und *anon public key* in `docs/konfig.js` eintragen.
   Der anon-Schlüssel ist öffentlich und darf ins Git. **Niemals den service_role-Schlüssel verwenden.**
5. Committen und pushen – GitHub Pages veröffentlicht `docs/`.

## Neuen Kunden anlegen

1. *Authentication → Users → Add user*: Kunde (E-Mail + Passwort, „Auto Confirm User“), dazu einmalig du selbst
   und der Automatik-Benutzer (z. B. `automatik@…`).
2. `supabase/neuer-kunde.sql` kopieren, Slug, Name, E-Mails und Fragen anpassen, im SQL Editor ausführen.
3. Auf **jeder Seite** der Kunden-Website vor `</body>` einfügen:
   ```html
   <script src="https://michele4800.github.io/kunden-feedback/feedback.js" data-projekt="kunden-slug" defer></script>
   ```
4. Dem Kunden schicken: Website-Link, E-Mail und Passwort. Er kann das Passwort im Portal über „Passwort vergessen?“ selbst ändern.

## Wächter (automatische Umsetzung)

Voraussetzungen: Node.js 20+, Git, [Claude Code](https://claude.com/claude-code) angemeldet, Website-Projekt lokal geklont mit Push-Rechten.

```bash
npm install
cp waechter/.env.beispiel waechter/.env                    # ausfüllen
cp waechter/projekte.beispiel.json waechter/projekte.json  # Ordner und Bau-Befehl je Projekt
npm run waechter
```

- Modus je Projekt im Portal unter *Automatik*: **aus**, **mit Freigabe** (empfohlen) oder **direkt**.
- Der Wächter prüft jede Minute, meldet ein Lebenszeichen (im Portal: „Automatik aktiv – zuletzt geprüft …“),
  zeigt Warteschlangenplätze an und arbeitet die Wünsche nacheinander ab.
- Dauerbetrieb unter Windows: Aufgabenplanung → „Beim Anmelden“ → `npm run waechter` im Projektordner.

**Sicherheit**
- Der Wächter meldet sich als normaler Agentur-Benutzer an – die Datenbankregeln gelten auch für ihn.
- Claude Code läuft nur im Projektordner, nur mit Lesen/Bearbeiten und dem Bau-Befehl, ohne Internet-Werkzeuge, ohne MCP,
  mit Kosten- und Zeitgrenze je Wunsch und einer Tagesgrenze.
- Kundentext wird als Daten übergeben; Wünsche, die Geheimnisse, fremde Skripte oder Dateien außerhalb des Projekts verlangen,
  werden abgelehnt (im Praxistest geprüft). Geschützte Pfade (`geschuetzt`) dürfen nicht geändert werden.
- Veröffentlicht wird nur, wenn der Bau fehlerfrei durchläuft; im Modus „mit Freigabe“ erst nach deinem Klick.

## Tests

```bash
npm test                                                    # 17 Tests der Zugriffsregeln (PGlite) + Foto-Ablage
node test/claude-probe.mjs <git-url> [bau-befehl …]         # Praxistest mit Claude Code an einer Wegwerf-Kopie
```

## Demo

Ohne Eintrag in `docs/konfig.js` läuft alles im **Demo-Modus** (Daten nur im eigenen Browser):
`https://michele4800.github.io/kunden-feedback/` – mit „agentur“ in der E-Mail meldest du dich als Agentur an.
