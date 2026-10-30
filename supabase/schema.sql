-- Kunden-Feedback: Datenbankschema für Supabase (Postgres).
-- Einmalig im Supabase-Dashboard unter „SQL Editor“ ausführen. Das Skript ist wiederholbar (idempotent).
--
-- Rollen je Projekt:
--   kunde   – sieht nur sein Projekt, trägt Wünsche, Kommentare und Antworten ein, bearbeitet eigene offene Wünsche
--   agentur – sieht das Projekt, setzt Status und Priorität, antwortet, pflegt Fragen
-- Plattformweit:
--   admin   – (Tabelle admins) sieht und verwaltet alle Projekte, legt Projekte und Mitglieder an (Agentur-Dashboard)
-- Projekte und Mitglieder legt nur ein Admin an (Dashboard, Edge Function kunde-anlegen oder neuer-kunde.sql).

-- gen_random_uuid() ist seit Postgres 13 eingebaut, keine Erweiterung nötig

-- ---------- Tabellen ----------
create table if not exists public.projekte (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name         text not null check (length(name) between 1 and 200),
  vorschau_url text,
  erstellt_am  timestamptz not null default now()
);

create table if not exists public.mitglieder (
  projekt_id  uuid not null references public.projekte(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rolle       text not null default 'kunde' check (rolle in ('kunde', 'agentur')),
  anzeigename text not null default '' check (length(anzeigename) <= 120),
  primary key (projekt_id, user_id)
);
create index if not exists mitglieder_user on public.mitglieder(user_id);

create table if not exists public.wuensche (
  id           uuid primary key default gen_random_uuid(),
  projekt_id   uuid not null references public.projekte(id) on delete cascade,
  autor        uuid not null default auth.uid() references auth.users(id) on delete set null,
  seite_url    text not null default '' check (length(seite_url) <= 2000),
  seite_titel  text not null default '' check (length(seite_titel) <= 300),
  stelle       jsonb,              -- markierte Stelle: {selektor, text, x, y}
  text         text not null check (length(btrim(text)) between 1 and 5000),
  status       text not null default 'offen' check (status in ('offen', 'in_arbeit', 'rueckfrage', 'zur_freigabe', 'erledigt', 'abgelehnt')),
  bearbeiter   text not null default '' check (length(bearbeiter) <= 120),   -- z. B. „Michele (Automatik)“ oder „Agentur“
  fortschritt  text not null default '' check (length(fortschritt) <= 500),  -- kurzer Stand für den Kunden
  fertig_bis   timestamptz,                                                   -- voraussichtliche Fertigstellung
  freigegeben  boolean not null default false,                                -- Agentur hat die Umsetzung zur Veröffentlichung freigegeben
  prioritaet   smallint not null default 2 check (prioritaet between 1 and 3),
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);
create index if not exists wuensche_projekt on public.wuensche(projekt_id, erstellt_am desc);
-- Werkzeuge für Kunden (seit Version 2): Art des Wunsches, Details (Text alt/neu, Farbe), Anhänge (Fotos)
alter table public.wuensche add column if not exists art text not null default 'sonstiges';
alter table public.wuensche add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.wuensche add column if not exists anhaenge jsonb not null default '[]'::jsonb;
do $$ begin
  alter table public.wuensche add constraint wuensche_art check (art in ('text', 'foto', 'design', 'inhalt', 'fehler', 'sonstiges'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wuensche add constraint wuensche_details check (jsonb_typeof(details) = 'object' and length(details::text) <= 20000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wuensche add constraint wuensche_anhaenge check (jsonb_typeof(anhaenge) = 'array' and jsonb_array_length(anhaenge) <= 10);
exception when duplicate_object then null; end $$;

create table if not exists public.kommentare (
  id          uuid primary key default gen_random_uuid(),
  wunsch_id   uuid not null references public.wuensche(id) on delete cascade,
  projekt_id  uuid not null references public.projekte(id) on delete cascade,
  autor       uuid not null default auth.uid() references auth.users(id) on delete set null,
  text        text not null check (length(btrim(text)) between 1 and 5000),
  erstellt_am timestamptz not null default now()
);
create index if not exists kommentare_wunsch on public.kommentare(wunsch_id, erstellt_am);

create table if not exists public.fragen (
  id          uuid primary key default gen_random_uuid(),
  projekt_id  uuid not null references public.projekte(id) on delete cascade,
  reihenfolge integer not null default 0,
  frage       text not null check (length(frage) between 1 and 1000),
  hilfe       text not null default '',
  art         text not null default 'text' check (art in ('text', 'auswahl', 'mehrfach')),
  optionen    jsonb not null default '[]'::jsonb
);
create index if not exists fragen_projekt on public.fragen(projekt_id, reihenfolge);

create table if not exists public.antworten (
  frage_id     uuid primary key references public.fragen(id) on delete cascade,
  projekt_id   uuid not null references public.projekte(id) on delete cascade,
  wert         jsonb not null,    -- Text als String, Auswahl als String, Mehrfach als Liste
  autor        uuid not null default auth.uid() references auth.users(id) on delete set null,
  geaendert_am timestamptz not null default now()
);

create table if not exists public.automatik (
  projekt_id   uuid primary key references public.projekte(id) on delete cascade,
  modus        text not null default 'aus' check (modus in ('aus', 'mit_freigabe', 'direkt')),
  letzter_lauf timestamptz,                        -- Lebenszeichen des Wächters
  hinweis      text not null default '' check (length(hinweis) <= 500)
);
-- Dashboard (seit Version 3): Tagesverbrauch und letzter Fehler des Wächters
alter table public.automatik add column if not exists heute_laeufe integer not null default 0;
alter table public.automatik add column if not exists letzter_fehler text not null default '';
do $$ begin
  alter table public.automatik add constraint automatik_fehler check (length(letzter_fehler) <= 1000);
exception when duplicate_object then null; end $$;

-- Website-Angaben je Projekt (seit Version 3). Zugangsdaten zum Hosting stehen NIE hier, nur lokal beim Wächter.
alter table public.projekte add column if not exists live_url  text not null default '';
alter table public.projekte add column if not exists domain    text not null default '';
alter table public.projekte add column if not exists hosting   text not null default 'keins';
alter table public.projekte add column if not exists entwuerfe jsonb not null default '[]'::jsonb;  -- [{name, url}]
alter table public.projekte add column if not exists aktiv     boolean not null default true;
do $$ begin
  alter table public.projekte add constraint projekte_hosting check (hosting in ('keins', 'github', 'sftp', 'netlify'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.projekte add constraint projekte_angaben check (
    length(live_url) <= 500 and length(domain) <= 255 and length(coalesce(vorschau_url, '')) <= 500
    and jsonb_typeof(entwuerfe) = 'array' and jsonb_array_length(entwuerfe) <= 20 and length(entwuerfe::text) <= 5000);
exception when duplicate_object then null; end $$;

-- Plattform-Admins (Agentur-Dashboard). Eintragen nur im SQL Editor: insert into public.admins select id from auth.users where email = '…';
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- Protokoll aller Veröffentlichungen (schreibt der Wächter)
create table if not exists public.veroeffentlichungen (
  id            uuid primary key default gen_random_uuid(),
  projekt_id    uuid not null references public.projekte(id) on delete cascade,
  anlass        text not null check (anlass in ('wunsch', 'inhalt', 'freigabe', 'zuruecknehmen', 'manuell')),
  status        text not null default 'laeuft' check (status in ('laeuft', 'ok', 'fehler')),
  commit_hash   text not null default '' check (length(commit_hash) <= 64),
  ziel          text not null default '' check (length(ziel) <= 200),      -- z. B. „GitHub Pages“ oder „SFTP ftp.strato.de“
  meldung       text not null default '' check (length(meldung) <= 2000),
  dateien       integer not null default 0,
  zuruecknehmen text not null default '' check (zuruecknehmen in ('', 'angefragt', 'erledigt', 'fehler')),
  start         timestamptz not null default now(),
  ende          timestamptz
);
create index if not exists veroeffentlichungen_projekt on public.veroeffentlichungen(projekt_id, start desc);

-- Editor (seit Version 4): jede Änderung eines markierten Bereichs (<!-- kf:schluessel -->) als eigene Zeile = Verlauf.
-- Der Wächter übernimmt sie ohne KI, nur in Bereiche, die im Website-Code markiert sind.
create table if not exists public.inhalte (
  id                  uuid primary key default gen_random_uuid(),
  projekt_id          uuid not null references public.projekte(id) on delete cascade,
  schluessel          text not null check (schluessel ~ '^[a-z0-9-]{1,60}$'),
  seite_url           text not null default '' check (length(seite_url) <= 2000),
  wert                jsonb not null,
  status              text not null default 'neu' check (status in ('neu', 'live', 'fehler', 'ersetzt', 'zurueckgenommen')),
  meldung             text not null default '' check (length(meldung) <= 1000),
  autor               uuid default auth.uid() references auth.users(id) on delete set null,
  veroeffentlichung_id uuid references public.veroeffentlichungen(id) on delete set null,
  erstellt_am         timestamptz not null default now(),
  geaendert_am        timestamptz not null default now()
);
create index if not exists inhalte_projekt on public.inhalte(projekt_id, erstellt_am desc);
-- Seit dem Baukasten (Version 5) kann ein Wert eine ganze Seite sein: { art: "seite", html, css, basis } – daher bis 600 KB
alter table public.inhalte drop constraint if exists inhalte_wert_check;
alter table public.inhalte add constraint inhalte_wert_check check (jsonb_typeof(wert) = 'object' and length(wert::text) <= 600000);

-- ---------- Hilfsfunktionen (security definer, damit RLS-Prüfungen nicht rekursiv werden) ----------
create or replace function public.ist_admin() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins a where a.user_id = auth.uid()) $$;

-- Admins gelten in jedem Projekt als Mitglied und Agentur
create or replace function public.ist_mitglied(p uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select public.ist_admin() or exists (select 1 from public.mitglieder m where m.projekt_id = p and m.user_id = auth.uid()) $$;

create or replace function public.ist_agentur(p uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select public.ist_admin() or exists (select 1 from public.mitglieder m where m.projekt_id = p and m.user_id = auth.uid() and m.rolle = 'agentur') $$;

revoke all on function public.ist_admin() from public, anon;
revoke all on function public.ist_mitglied(uuid) from public, anon;
revoke all on function public.ist_agentur(uuid) from public, anon;
grant execute on function public.ist_admin() to authenticated;
grant execute on function public.ist_mitglied(uuid) to authenticated;
grant execute on function public.ist_agentur(uuid) to authenticated;

-- ---------- Trigger ----------
-- Wünsche: Zeitstempel pflegen; Kunden dürfen nur Text und Stelle ihrer eigenen offenen Wünsche ändern
create or replace function public.wunsch_pruefen() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if tg_op = 'INSERT' then
    new.autor := auth.uid();
    new.erstellt_am := now();
    new.geaendert_am := now();
    if not public.ist_agentur(new.projekt_id) then
      new.status := 'offen';
      new.bearbeiter := '';
      new.fortschritt := '';
      new.fertig_bis := null;
      new.freigegeben := false;
    end if;
    return new;
  end if;
  -- UPDATE: Nur den Zeitstempel anfassen (z. B. durch einen neuen Kommentar) ist immer erlaubt
  if (to_jsonb(new) - 'geaendert_am') = (to_jsonb(old) - 'geaendert_am') then
    new.geaendert_am := now();
    return new;
  end if;
  if new.projekt_id <> old.projekt_id or new.autor is distinct from old.autor or new.erstellt_am <> old.erstellt_am then
    raise exception 'Projekt, Autor und Erstellzeit sind unveränderlich';
  end if;
  if not public.ist_agentur(old.projekt_id) then
    if old.autor is distinct from auth.uid() then
      raise exception 'Nur eigene Wünsche können geändert werden';
    end if;
    if old.status not in ('offen', 'rueckfrage') then
      raise exception 'Dieser Wunsch ist bereits in Bearbeitung';
    end if;
    if new.status <> old.status or new.prioritaet <> old.prioritaet or new.bearbeiter <> old.bearbeiter
       or new.fortschritt <> old.fortschritt or new.fertig_bis is distinct from old.fertig_bis or new.freigegeben <> old.freigegeben then
      raise exception 'Status, Priorität und Bearbeitung setzt die Agentur';
    end if;
  end if;
  new.geaendert_am := now();
  return new;
end
$$;
drop trigger if exists wunsch_pruefen on public.wuensche;
create trigger wunsch_pruefen before insert or update on public.wuensche
  for each row execute function public.wunsch_pruefen();

-- Kommentare: Autor und Projekt werden vom Server gesetzt (Projekt kommt aus dem Wunsch)
create or replace function public.kommentar_pruefen() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  new.autor := auth.uid();
  new.erstellt_am := now();
  select w.projekt_id into new.projekt_id from public.wuensche w where w.id = new.wunsch_id;
  if new.projekt_id is null then raise exception 'Wunsch nicht gefunden'; end if;
  update public.wuensche set geaendert_am = now() where id = new.wunsch_id;
  return new;
end
$$;
drop trigger if exists kommentar_pruefen on public.kommentare;
create trigger kommentar_pruefen before insert on public.kommentare
  for each row execute function public.kommentar_pruefen();

-- Antworten: Autor, Zeit und Projekt (aus der Frage) setzt der Server
create or replace function public.antwort_pruefen() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  new.autor := auth.uid();
  new.geaendert_am := now();
  select f.projekt_id into new.projekt_id from public.fragen f where f.id = new.frage_id;
  if new.projekt_id is null then raise exception 'Frage nicht gefunden'; end if;
  return new;
end
$$;
drop trigger if exists antwort_pruefen on public.antworten;
create trigger antwort_pruefen before insert or update on public.antworten
  for each row execute function public.antwort_pruefen();

-- Veröffentlichungen: Zurücknehmen anfragen darf nur ein Admin; Projekt und Start sind unveränderlich
create or replace function public.veroeffentlichung_pruefen() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if tg_op = 'INSERT' then
    new.start := now();
    if new.zuruecknehmen = 'angefragt' and not public.ist_admin() then
      raise exception 'Zurücknehmen kann nur ein Admin anfragen';
    end if;
    return new;
  end if;
  if new.projekt_id <> old.projekt_id or new.start <> old.start then
    raise exception 'Projekt und Startzeit sind unveränderlich';
  end if;
  if new.zuruecknehmen <> old.zuruecknehmen and new.zuruecknehmen = 'angefragt' and not public.ist_admin() then
    raise exception 'Zurücknehmen kann nur ein Admin anfragen';
  end if;
  return new;
end
$$;
-- Inhalte: Autor und Zeit setzt der Server; Kunden legen nur neue Änderungen an (Status „neu“), den Rest setzt der Wächter.
-- Was geändert werden sollte (Schlüssel, Wert, Projekt, Autor), bleibt für immer so – der Verlauf ist unverfälschbar.
create or replace function public.inhalt_pruefen() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  if tg_op = 'INSERT' then
    new.autor := auth.uid();
    new.erstellt_am := now();
    new.geaendert_am := now();
    if not public.ist_agentur(new.projekt_id) then
      new.status := 'neu'; new.meldung := ''; new.veroeffentlichung_id := null;
    end if;
    return new;
  end if;
  if new.projekt_id <> old.projekt_id or new.schluessel <> old.schluessel or new.wert <> old.wert
     or new.autor is distinct from old.autor or new.erstellt_am <> old.erstellt_am or new.seite_url <> old.seite_url then
    raise exception 'Eine gespeicherte Änderung ist unveränderlich';
  end if;
  new.geaendert_am := now();
  return new;
end
$$;
drop trigger if exists inhalt_pruefen on public.inhalte;
create trigger inhalt_pruefen before insert or update on public.inhalte
  for each row execute function public.inhalt_pruefen();

drop trigger if exists veroeffentlichung_pruefen on public.veroeffentlichungen;
create trigger veroeffentlichung_pruefen before insert or update on public.veroeffentlichungen
  for each row execute function public.veroeffentlichung_pruefen();

-- ---------- Zugriffsregeln (Row Level Security) ----------
alter table public.projekte   enable row level security;
alter table public.mitglieder enable row level security;
alter table public.wuensche   enable row level security;
alter table public.kommentare enable row level security;
alter table public.fragen     enable row level security;
alter table public.antworten  enable row level security;
alter table public.automatik  enable row level security;
alter table public.admins     enable row level security;
alter table public.veroeffentlichungen enable row level security;
alter table public.inhalte    enable row level security;

-- Nicht angemeldete Besucher (anon) bekommen gar nichts
revoke all on public.projekte, public.mitglieder, public.wuensche, public.kommentare, public.fragen, public.antworten, public.automatik,
  public.admins, public.veroeffentlichungen, public.inhalte from anon;
grant select, insert, update on public.inhalte to authenticated;
drop policy if exists inhalte_lesen on public.inhalte;
create policy inhalte_lesen on public.inhalte for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists inhalte_anlegen on public.inhalte;
create policy inhalte_anlegen on public.inhalte for insert to authenticated with check (public.ist_mitglied(projekt_id));
drop policy if exists inhalte_aendern on public.inhalte;
create policy inhalte_aendern on public.inhalte for update to authenticated
  using (public.ist_agentur(projekt_id)) with check (public.ist_agentur(projekt_id));
grant select, insert, update on public.projekte to authenticated;
grant select, insert, update, delete on public.mitglieder to authenticated;
grant select, insert, update, delete on public.wuensche, public.kommentare, public.fragen, public.antworten to authenticated;
grant select, insert, update on public.automatik, public.veroeffentlichungen to authenticated;
grant select on public.admins to authenticated;

drop policy if exists projekte_lesen on public.projekte;
create policy projekte_lesen on public.projekte for select to authenticated using (public.ist_mitglied(id));
drop policy if exists projekte_anlegen on public.projekte;
create policy projekte_anlegen on public.projekte for insert to authenticated with check (public.ist_admin());
drop policy if exists projekte_aendern on public.projekte;
create policy projekte_aendern on public.projekte for update to authenticated using (public.ist_admin()) with check (public.ist_admin());

drop policy if exists mitglieder_lesen on public.mitglieder;
create policy mitglieder_lesen on public.mitglieder for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists mitglieder_pflegen on public.mitglieder;
create policy mitglieder_pflegen on public.mitglieder for all to authenticated using (public.ist_admin()) with check (public.ist_admin());

-- Jeder sieht nur, ob er selbst Admin ist; eingetragen wird nur im SQL Editor
drop policy if exists admins_lesen on public.admins;
create policy admins_lesen on public.admins for select to authenticated using (user_id = auth.uid());

drop policy if exists veroeffentlichungen_lesen on public.veroeffentlichungen;
create policy veroeffentlichungen_lesen on public.veroeffentlichungen for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists veroeffentlichungen_anlegen on public.veroeffentlichungen;
create policy veroeffentlichungen_anlegen on public.veroeffentlichungen for insert to authenticated with check (public.ist_agentur(projekt_id));
drop policy if exists veroeffentlichungen_aendern on public.veroeffentlichungen;
create policy veroeffentlichungen_aendern on public.veroeffentlichungen for update to authenticated
  using (public.ist_agentur(projekt_id)) with check (public.ist_agentur(projekt_id));

drop policy if exists wuensche_lesen on public.wuensche;
create policy wuensche_lesen on public.wuensche for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists wuensche_anlegen on public.wuensche;
create policy wuensche_anlegen on public.wuensche for insert to authenticated with check (public.ist_mitglied(projekt_id));
drop policy if exists wuensche_aendern on public.wuensche;
create policy wuensche_aendern on public.wuensche for update to authenticated
  using (public.ist_agentur(projekt_id) or autor = auth.uid())
  with check (public.ist_mitglied(projekt_id));
drop policy if exists wuensche_loeschen on public.wuensche;
create policy wuensche_loeschen on public.wuensche for delete to authenticated
  using (public.ist_agentur(projekt_id) or (autor = auth.uid() and status = 'offen'));

drop policy if exists kommentare_lesen on public.kommentare;
create policy kommentare_lesen on public.kommentare for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists kommentare_anlegen on public.kommentare;
create policy kommentare_anlegen on public.kommentare for insert to authenticated
  with check (exists (select 1 from public.wuensche w where w.id = wunsch_id and public.ist_mitglied(w.projekt_id)));
drop policy if exists kommentare_loeschen on public.kommentare;
create policy kommentare_loeschen on public.kommentare for delete to authenticated
  using (autor = auth.uid() or public.ist_agentur(projekt_id));

drop policy if exists fragen_lesen on public.fragen;
create policy fragen_lesen on public.fragen for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists fragen_pflegen on public.fragen;
create policy fragen_pflegen on public.fragen for all to authenticated
  using (public.ist_agentur(projekt_id)) with check (public.ist_agentur(projekt_id));

drop policy if exists antworten_lesen on public.antworten;
create policy antworten_lesen on public.antworten for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists antworten_schreiben on public.antworten;
create policy antworten_schreiben on public.antworten for insert to authenticated
  with check (exists (select 1 from public.fragen f where f.id = frage_id and public.ist_mitglied(f.projekt_id)));
drop policy if exists antworten_aendern on public.antworten;
create policy antworten_aendern on public.antworten for update to authenticated
  using (public.ist_mitglied(projekt_id))
  with check (exists (select 1 from public.fragen f where f.id = frage_id and public.ist_mitglied(f.projekt_id)));

drop policy if exists automatik_lesen on public.automatik;
create policy automatik_lesen on public.automatik for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists automatik_anlegen on public.automatik;
create policy automatik_anlegen on public.automatik for insert to authenticated with check (public.ist_agentur(projekt_id));
drop policy if exists automatik_aendern on public.automatik;
create policy automatik_aendern on public.automatik for update to authenticated
  using (public.ist_agentur(projekt_id)) with check (public.ist_agentur(projekt_id));

-- ---------- Anfragen aus Formularen der Websites (Edge Function „formular“, seit Version 6) ----------
-- Anlegen nur über die Edge Function (service_role); Kunden lesen und markieren als gelesen, die Agentur darf löschen.
create table if not exists public.anfragen (
  id          uuid primary key default gen_random_uuid(),
  projekt_id  uuid not null references public.projekte(id) on delete cascade,
  formular    text not null default 'kontakt' check (formular in ('kontakt', 'anfrage', 'feedback')),
  felder      jsonb not null check (jsonb_typeof(felder) = 'object' and length(felder::text) <= 60000),
  seite_url   text not null default '' check (length(seite_url) <= 500),
  ip_hash     text not null default '' check (length(ip_hash) <= 64),   -- nur für die Begrenzung, keine IP-Adresse
  gelesen     boolean not null default false,
  erstellt_am timestamptz not null default now()
);
create index if not exists anfragen_projekt on public.anfragen(projekt_id, erstellt_am desc);
create index if not exists anfragen_absender on public.anfragen(ip_hash, erstellt_am desc);
alter table public.anfragen enable row level security;
drop policy if exists anfragen_lesen on public.anfragen;
create policy anfragen_lesen on public.anfragen for select to authenticated using (public.ist_mitglied(projekt_id));
drop policy if exists anfragen_gelesen on public.anfragen;
create policy anfragen_gelesen on public.anfragen for update to authenticated using (public.ist_mitglied(projekt_id)) with check (public.ist_mitglied(projekt_id));
revoke update on public.anfragen from authenticated;
grant update (gelesen) on public.anfragen to authenticated;
drop policy if exists anfragen_loeschen on public.anfragen;
create policy anfragen_loeschen on public.anfragen for delete to authenticated using (public.ist_agentur(projekt_id));

-- ---------- KI-Assistent im Editor: Tageszähler je Projekt (Edge Function „ki-assistent“) ----------
create table if not exists public.ki_nutzung (
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  tag        date not null default current_date,
  anzahl     integer not null default 0,
  primary key (projekt_id, tag)
);
alter table public.ki_nutzung enable row level security;
drop policy if exists ki_nutzung_lesen on public.ki_nutzung;
create policy ki_nutzung_lesen on public.ki_nutzung for select to authenticated using (public.ist_mitglied(projekt_id));
-- zählt eine Anfrage, wenn das Limit nicht erreicht ist; Ergebnis: verbleibende Anfragen oder -1
create or replace function public.ki_zaehlen(p uuid, grenze integer) returns integer
  language plpgsql security definer set search_path = public as
$$ declare n integer;
begin
  insert into public.ki_nutzung (projekt_id, tag, anzahl) values (p, current_date, 1)
  on conflict (projekt_id, tag) do update set anzahl = ki_nutzung.anzahl + 1 where ki_nutzung.anzahl < grenze
  returning anzahl into n;
  return case when n is null then -1 else grenze - n end;
end $$;
revoke all on function public.ki_zaehlen(uuid, integer) from public, anon, authenticated;
grant execute on function public.ki_zaehlen(uuid, integer) to service_role;

-- ---------- Fotos und Anhänge (Supabase Storage) ----------
-- Pfad: <projekt_id>/<zufall>-<dateiname>. Lesen und Hochladen nur für Projektmitglieder, Löschen nur für die Agentur.
create or replace function public.projekt_aus_pfad(pfad text) returns uuid
  language plpgsql immutable as
$$ begin return split_part(pfad, '/', 1)::uuid; exception when others then return null; end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    -- 26 MB für Videos (Video-Hintergrund im Editor); Fotos verkleinert der Browser vorher
    values ('anhaenge', 'anhaenge', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists anhaenge_lesen on storage.objects;
    create policy anhaenge_lesen on storage.objects for select to authenticated
      using (bucket_id = 'anhaenge' and public.ist_mitglied(public.projekt_aus_pfad(name)));
    drop policy if exists anhaenge_hochladen on storage.objects;
    create policy anhaenge_hochladen on storage.objects for insert to authenticated
      with check (bucket_id = 'anhaenge' and public.ist_mitglied(public.projekt_aus_pfad(name)));
    drop policy if exists anhaenge_loeschen on storage.objects;
    create policy anhaenge_loeschen on storage.objects for delete to authenticated
      using (bucket_id = 'anhaenge' and public.ist_agentur(public.projekt_aus_pfad(name)));
  end if;
end $$;

-- ---------- KI-Anbieter der Automatik (seit Version 5) ----------
-- Welche KI der Wächter nutzt: Claude Code auf dem PC (cli), Claude-API oder ChatGPT-API. Pflegt der Admin im Dashboard.
create table if not exists public.ki_einstellungen (
  id            boolean primary key default true check (id),   -- genau eine Zeile
  anbieter      text not null default 'cli' check (anbieter in ('cli', 'claude_api', 'openai_api')),
  modell_claude text not null default 'claude-sonnet-5-5' check (modell_claude ~ '^[A-Za-z0-9._:-]{1,100}$'),
  modell_openai text not null default 'gpt-5' check (modell_openai ~ '^[A-Za-z0-9._:-]{1,100}$'),
  geaendert_am  timestamptz not null default now()
);
insert into public.ki_einstellungen (id) values (true) on conflict do nothing;

-- API-Schlüssel liegen verschlüsselt im Supabase Vault. Hier steht nur, DASS einer da ist (und seine letzten 4 Zeichen).
create table if not exists public.ki_schluessel (
  anbieter     text primary key check (anbieter in ('claude_api', 'openai_api')),
  secret_id    uuid not null,
  endung       text not null default '' check (length(endung) <= 4),
  geaendert_am timestamptz not null default now()
);

-- Die Automatik = Agentur-Mitglied, das KEIN Admin ist. Nur sie bekommt Schlüssel im Klartext – nie ein Browser des Admins.
create or replace function public.ist_automatik() returns boolean
  language sql stable security definer set search_path = public as
$$ select not public.ist_admin() and exists (select 1 from public.mitglieder m where m.user_id = auth.uid() and m.rolle = 'agentur') $$;

create or replace function public.ki_schluessel_setzen(p_anbieter text, p_schluessel text) returns void
  language plpgsql security definer set search_path = public as
$$ declare alt uuid;
begin
  if not public.ist_admin() then raise exception 'Nur für Admins'; end if;
  if p_anbieter not in ('claude_api', 'openai_api') then raise exception 'Unbekannter Anbieter'; end if;
  p_schluessel := btrim(coalesce(p_schluessel, ''));
  if p_schluessel !~ '^[A-Za-z0-9_-]+$' or length(p_schluessel) not between 20 and 300 then raise exception 'Der Schlüssel sieht nicht gültig aus'; end if;
  select secret_id into alt from public.ki_schluessel where anbieter = p_anbieter;
  if alt is null then
    alt := vault.create_secret(p_schluessel, 'kf_ki_' || p_anbieter || '_' || substr(md5(random()::text), 1, 8), 'KI-Schlüssel der Automatik');
  else
    perform vault.update_secret(alt, p_schluessel);
  end if;
  insert into public.ki_schluessel (anbieter, secret_id, endung, geaendert_am) values (p_anbieter, alt, right(p_schluessel, 4), now())
    on conflict (anbieter) do update set secret_id = excluded.secret_id, endung = excluded.endung, geaendert_am = now();
end $$;

create or replace function public.ki_schluessel_loeschen(p_anbieter text) returns void
  language plpgsql security definer set search_path = public as
$$ declare alt uuid;
begin
  if not public.ist_admin() then raise exception 'Nur für Admins'; end if;
  delete from public.ki_schluessel where anbieter = p_anbieter returning secret_id into alt;
  if alt is not null then delete from vault.secrets where id = alt; end if;
  update public.ki_einstellungen set anbieter = 'cli', geaendert_am = now() where anbieter = p_anbieter;  -- ohne Schlüssel zurück zu Claude Code
end $$;

create or replace function public.ki_schluessel_holen(p_anbieter text) returns text
  language plpgsql stable security definer set search_path = public as
$$ declare s text;
begin
  if not public.ist_automatik() then raise exception 'Nur für die Automatik'; end if;
  select d.decrypted_secret into s from public.ki_schluessel k join vault.decrypted_secrets d on d.id = k.secret_id where k.anbieter = p_anbieter;
  return s;
end $$;

alter table public.ki_einstellungen enable row level security;
alter table public.ki_schluessel    enable row level security;
revoke all on public.ki_einstellungen, public.ki_schluessel from public, anon, authenticated;
grant select, update on public.ki_einstellungen to authenticated;
grant select on public.ki_schluessel to authenticated;
drop policy if exists ki_einstellungen_lesen on public.ki_einstellungen;
create policy ki_einstellungen_lesen on public.ki_einstellungen for select to authenticated using (public.ist_admin() or public.ist_automatik());
drop policy if exists ki_einstellungen_aendern on public.ki_einstellungen;
create policy ki_einstellungen_aendern on public.ki_einstellungen for update to authenticated using (public.ist_admin()) with check (public.ist_admin());
drop policy if exists ki_schluessel_lesen on public.ki_schluessel;
create policy ki_schluessel_lesen on public.ki_schluessel for select to authenticated using (public.ist_admin());
revoke all on function public.ist_automatik(), public.ki_schluessel_setzen(text, text), public.ki_schluessel_loeschen(text), public.ki_schluessel_holen(text) from public, anon;
grant execute on function public.ist_automatik(), public.ki_schluessel_setzen(text, text), public.ki_schluessel_loeschen(text), public.ki_schluessel_holen(text) to authenticated;

-- ---------- Live-Synchronisierung (Supabase Realtime) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.wuensche;   exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.kommentare; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.antworten;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.automatik;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.projekte;   exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.veroeffentlichungen; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.inhalte;    exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.anfragen;   exception when duplicate_object then null; end;
  end if;
end $$;

-- Schnittstelle sofort über neue Spalten informieren
notify pgrst, 'reload schema';
