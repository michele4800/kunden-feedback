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
| `docs/feedback.js` | Kleiner **Lader** für jede Kunden-Website, holt immer die aktuelle `widget.js` |
| `docs/widget.js` | **Widget**: Knopf „KI-Wunsch“, Anmeldung, Werkzeuge (siehe unten), Verlauf, Live-Status |
| `docs/dashboard/` | **Dashboard** für dich (Admin): alle Kunden, Wünsche, Veröffentlichungen, Zustand der Automatik, Kunden anlegen |
| `docs/portal/` | **Portal**: alle Wünsche mit Filter, Status, Restzeit, Antworten, Fragen, Freigabe, Export für Claude |
| `docs/editor.js` | **Editor**: Knopf „Editor“ (links neben „KI-Wunsch“) auf Seiten mit markierten Bereichen – Text, Bild, Link, Neuigkeiten direkt ändern |
| `docs/beispiel/` | Beispiel-Website mit markierten Bereichen (Vorlage für neue Kundenseiten, Test des Editors) |
| `docs/backend.js` | Gemeinsame Schicht für Supabase und den Demo-Modus |
| `docs/konfig.js` | Supabase-Adresse und öffentlicher Schlüssel (leer = Demo-Modus) |
| `supabase/schema.sql` | Tabellen, Zugriffsregeln (RLS), Trigger, Realtime |
| `supabase/functions/kunden-verwalten/` | Edge Function: Kunden anlegen, Zugänge (Benutzername, Passwort) pflegen – nur Admins |
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

**Wünsche sammeln:** Mit „Zur Liste hinzufügen“ sammelt der Kunde mehrere Wünsche – auch über mehrere Seiten (die Liste liegt
im Browser, Fotos werden sofort hochgeladen) – und schickt sie mit „Alle zusammen absenden“ als Paket ab. Der Wächter setzt ein
Paket in einem Durchgang um (eine Schätzung, eine Umsetzung, ein Commit) und zählt es als einen Lauf für die Tagesgrenze.
Jeder Wunsch bekommt trotzdem sein eigenes Ergebnis (erledigt, Rückfrage, an Agentur). Bei „mit Freigabe“ gibt eine Freigabe
das ganze Paket frei.

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

## Dashboard einrichten (einmalig)

1. **SQL Editor:** aktuelle `supabase/schema.sql` ausführen, danach dich selbst als Admin eintragen:
   ```sql
   insert into public.admins select id from auth.users where email = 'deine@adresse.de' on conflict do nothing;
   ```
   Admins sehen alle Projekte und gelten in jedem Projekt als Agentur. Der Automatik-Benutzer wird **kein** Admin.
2. **Edge Function:** *Edge Functions → Deploy a new function → Via Editor*, Name `kunden-verwalten`, Inhalt von
   `supabase/functions/kunden-verwalten/index.ts` einfügen, *Deploy*. „Verify JWT“ eingeschaltet lassen.
   Den service_role-Schlüssel stellt Supabase der Funktion selbst bereit – er wird nirgends eingetragen.
3. Dashboard öffnen: `https://michele4800.github.io/kunden-feedback/dashboard/` und mit deinem Agentur-Login anmelden.

Neue Kunden legst du danach im Dashboard unter **+ Neue Website** an (Website = Projekt wie der Hühnerhof, Kunde = Login einer Person wie robin): Benutzername (Pflicht), Passwort (selbst wählen oder
erzeugen lassen), E-Mail freiwillig als Kontakt. Es entstehen Login, Projekt, Mitglieder (der Kunde und alle Agentur-Benutzer,
also auch die Automatik) und der Automatik-Eintrag; Zugangsdaten, Einbau-Code und der Eintrag für `waechter/projekte.json`
stehen zum Kopieren bereit. Unter **Kunden** (alle Logins über alle Websites): Passwort neu setzen, Benutzername/E-Mail ändern, weitere Zugänge
hinzufügen oder entfernen. Agentur-Zugänge (die Automatik) sind dort bewusst gesperrt.

## Neuen Kunden anlegen (ohne Dashboard)

1. *Authentication → Users → Add user*: Kunde (E-Mail + Passwort, „Auto Confirm User“), dazu einmalig du selbst
   und der Automatik-Benutzer (z. B. `automatik@…`).
2. `supabase/neuer-kunde.sql` kopieren, Slug, Name, E-Mails und Fragen anpassen, im SQL Editor ausführen.
3. Auf **jeder Seite** der Kunden-Website vor `</body>` einfügen:
   ```html
   <script src="https://michele4800.github.io/kunden-feedback/feedback.js" data-projekt="kunden-slug" defer></script>
   ```
4. Dem Kunden schicken: Website-Link, E-Mail und Passwort. Er kann das Passwort im Portal über „Passwort vergessen?“ selbst ändern.

## Editor für Kunden (Baukasten)

Auf jeder Seite erscheint links neben „KI-Wunsch“ der Knopf **Editor**. Er öffnet einen Vollbild-Baukasten
(`docs/studio/`, Grundlage [GrapesJS](https://grapesjs.com) 0.23.8, BSD-Lizenz, lokal in `docs/vendor/`) direkt über der Seite:

- **Hinzufügen**: Sektionen (Über uns, Angebot, Kontakt, Text+Bild, Galerie, Zitat, Aufruf) und Elemente per Drag-and-Drop.
- **Gestalten**: Abstände, Größen, Schrift, Farben, Rahmen fürs ausgewählte Element. Oben Desktop / Tablet / Handy –
  auf Tablet oder Handy gesetzte Werte gelten nur dort (Media Query), Desktop bleibt.
- **Ebenen**: Aufbau der Seite, Reihenfolge per Ziehen. Rückgängig/Wiederholen, Vorschau.
- **Angaben**: Felder aus `kf-daten.json` der Website (z. B. Öffnungszeiten, Telefon in `daten.json`). Ein Klick auf einen
  automatisch gebauten Bereich der Seite öffnet sie. Der Wächter schreibt nur die dort erlaubten Felder.
- **Neuigkeiten**: Einträge für `<!-- kf:… art="neuigkeiten" -->` (mit RSS-Feed).

Beim **Veröffentlichen** entstehen Zeilen in `inhalte` (`wert.art = "seite"` bzw. `"daten"`). Der Wächter (`waechter/seite.mjs`)
übernimmt sie **ohne KI** (zählt nicht zur Tagesgrenze), baut, committet und veröffentlicht – auch wenn die Automatik für Wünsche aus ist:

- Der Editor arbeitet auf dem Quelltext der Seite (so, wie er auf der **Vorschau-Adresse** liegt). Hat sich die Datei inzwischen
  geändert (z. B. durch einen KI-Wunsch), lehnt der Wächter ab: „bitte neu laden“.
- Automatisch gebaute Bereiche (`<!-- hof:… -->`, Neuigkeiten), Skripte und Kommentare werden Zeichen für Zeichen wieder eingesetzt
  (`docs/sperren.js`, von Editor und Wächter gemeinsam genutzt). Verschieben und Löschen geht, Verdoppeln nicht.
- HTML wird nach einer Positivliste bereinigt (kein Skript, keine Ereignisse, keine `javascript:`-Adressen, keine Formulare/iframes).
  `<head>` und `<body>`-Tag bleiben aus der Datei. Stile des Kunden landen in `<seite>.kf.css` neben der Seite.
- Neue Fotos werden als WebP im Bilder-Ordner abgelegt; nur Dateien aus dem eigenen Projekt.

Jede Änderung steht im Portal unter „Bearbeitet“ und im Dashboard unter „Veröffentlichungen“ (mit Zurücknehmen).
Der ältere Marker-Editor (`docs/editor.js`, Bereiche unten) wird nicht mehr geöffnet; seine Marker bleiben gültig.

Bereiche markieren (im HTML der Website, Beispiel: `docs/beispiel/index.html`):

```html
<h1><!-- kf:titel art="text" titel="Überschrift" -->Frisch gebacken seit 1952<!-- /kf:titel --></h1>
<!-- kf:laden art="mehrzeilig" --><p>Absätze …</p><!-- /kf:laden -->
<!-- kf:telefon art="link" --><a href="tel:+49…">07031 …</a><!-- /kf:telefon -->
<!-- kf:foto art="bild" --><img src="…" alt="…"><!-- /kf:foto -->
<!-- kf:neues art="neuigkeiten" ebene="3" --><!-- /kf:neues -->
```

- `text`: eine Zeile, fett/kursiv/Link · `mehrzeilig`: Absätze und Listen · `link`: ein `<a>` · `bild`: ein `<img>`
  (wird als WebP in den Größen aus `bilder` abgelegt) · `neuigkeiten`: Liste mit Ablaufdatum, dazu `feed.xml` (RSS) daneben.
- Gleicher Schlüssel an mehreren Stellen (z. B. Telefon oben und unten) wird überall geändert.
- Nur Dateien im Git werden geändert; erzeugte Ordner (z. B. `livegang/`) baut der Bau-Befehl neu.
- Sicherheit: Der Kunde wählt nur Schlüssel und Wert. Was eine Stelle ist, steht im Code; unbekannte Schlüssel werden abgelehnt,
  HTML wird nach einer Positivliste bereinigt (kein Skript, keine Ereignisse, keine `javascript:`-Links, keine Marker).

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
- Dauerbetrieb unter Windows: Aufgabenplanung, Aktion `wscript.exe "<ordner>\waechter-unsichtbar.vbs"`, Auslöser
  „Beim Anmelden“ **und** „Alle 5 Minuten wiederholen“, Einstellung „Neue Instanz nicht starten“. Der Wächter läuft ohne
  Fenster (kann nicht versehentlich geschlossen werden); ist er beendet, startet ihn die Aufgabe spätestens nach 5 Minuten neu.
  Ausgaben: `waechter/waechter.log`. Beenden: Aufgabe beenden und Prozesse `waechter.mjs` beenden.
- Der Wächter arbeitet nur, wenn der Website-Ordner keine ungespeicherten Änderungen hat (Hinweis im Portal).

**Veröffentlichen je Anbieter** (`waechter/ziele/`)
- `"veroeffentlichen": true` → `git push` (GitHub Pages bzw. Sicherung des Website-Repos).
- `"ziel": {"art": "sftp", "host", "port", "benutzer", "pfad"}` → zusätzlich per SFTP zum Hosting des Kunden (STRATO, IONOS, All-Inkl …).
  Hochgeladen wird der Ordner `ausgabe` (z. B. `livegang/kombi`); nur geänderte Dateien, HTML zuletzt, gelöscht wird nur, was die
  Automatik selbst hochgeladen hat. Passwort bzw. Schlüsseldatei nur in `waechter/.env` (`KF_ZIEL_<SLUG>_PASSWORT`).
- Jede Veröffentlichung steht im Dashboard unter „Veröffentlichungen“. Schlägt sie fehl, versucht der Wächter es in der nächsten
  Runde erneut und zeigt den Fehler im Dashboard. **Zurücknehmen** im Dashboard: der Wächter macht den Commit rückgängig, baut neu
  und veröffentlicht den Stand davor.

**Sicherheit**
- Der Wächter meldet sich als normaler Agentur-Benutzer an – die Datenbankregeln gelten auch für ihn.
- Claude Code läuft nur im Projektordner, nur mit Lesen/Bearbeiten und dem Bau-Befehl, ohne Internet-Werkzeuge, ohne MCP,
  mit Kosten- und Zeitgrenze je Wunsch und einer Tagesgrenze.
- Kundentext wird als Daten übergeben; Wünsche, die Geheimnisse, fremde Skripte oder Dateien außerhalb des Projekts verlangen,
  werden abgelehnt (im Praxistest geprüft). Geschützte Pfade (`geschuetzt`) dürfen nicht geändert werden.
- Veröffentlicht wird nur, wenn der Bau fehlerfrei durchläuft; im Modus „mit Freigabe“ erst nach deinem Klick.

## Tests

```bash
npm test                                                    # 20 Tests der Zugriffsregeln (PGlite) + Foto-Ablage + SFTP + Editor-Inhalte
node test/claude-probe.mjs <git-url> [bau-befehl …]         # Praxistest mit Claude Code an einer Wegwerf-Kopie
```

## Demo

Ohne Eintrag in `docs/konfig.js` läuft alles im **Demo-Modus** (Daten nur im eigenen Browser):
`https://michele4800.github.io/kunden-feedback/` – mit „agentur“ in der E-Mail meldest du dich als Agentur an.
