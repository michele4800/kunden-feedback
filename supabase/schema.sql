-- Kunden-Feedback: Datenbankschema für Supabase (Postgres).
-- Einmalig im Supabase-Dashboard unter „SQL Editor“ ausführen. Das Skript ist wiederholbar (idempotent).
--
-- Rollen je Projekt:
--   kunde   – sieht nur sein Projekt, trägt Wünsche, Kommentare und Antworten ein, bearbeitet eigene offene Wünsche
--   agentur – sieht das Projekt, setzt Status und Priorität, antwortet, pflegt Fragen
-- Projekte und Mitglieder werden nur im Dashboard (bzw. mit neuer-kunde.sql) angelegt – nie aus dem Browser.

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
  bearbeiter   text not null default '' check (length(bearbeiter) <= 120),   -- z. B. „Claude (Automatik)“ oder „Agentur“
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

-- ---------- Hilfsfunktionen (security definer, damit RLS-Prüfungen nicht rekursiv werden) ----------
create or replace function public.ist_mitglied(p uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.mitglieder m where m.projekt_id = p and m.user_id = auth.uid()) $$;

create or replace function public.ist_agentur(p uuid) returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.mitglieder m where m.projekt_id = p and m.user_id = auth.uid() and m.rolle = 'agentur') $$;

revoke all on function public.ist_mitglied(uuid) from public, anon;
revoke all on function public.ist_agentur(uuid) from public, anon;
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

-- ---------- Zugriffsregeln (Row Level Security) ----------
alter table public.projekte   enable row level security;
alter table public.mitglieder enable row level security;
alter table public.wuensche   enable row level security;
alter table public.kommentare enable row level security;
alter table public.fragen     enable row level security;
alter table public.antworten  enable row level security;
alter table public.automatik  enable row level security;

-- Nicht angemeldete Besucher (anon) bekommen gar nichts
revoke all on public.projekte, public.mitglieder, public.wuensche, public.kommentare, public.fragen, public.antworten, public.automatik from anon;
grant select on public.projekte, public.mitglieder to authenticated;
grant select, insert, update, delete on public.wuensche, public.kommentare, public.fragen, public.antworten to authenticated;
grant select, insert, update on public.automatik to authenticated;

drop policy if exists projekte_lesen on public.projekte;
create policy projekte_lesen on public.projekte for select to authenticated using (public.ist_mitglied(id));

drop policy if exists mitglieder_lesen on public.mitglieder;
create policy mitglieder_lesen on public.mitglieder for select to authenticated using (public.ist_mitglied(projekt_id));

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

-- ---------- Fotos und Anhänge (Supabase Storage) ----------
-- Pfad: <projekt_id>/<zufall>-<dateiname>. Lesen und Hochladen nur für Projektmitglieder, Löschen nur für die Agentur.
create or replace function public.projekt_aus_pfad(pfad text) returns uuid
  language plpgsql immutable as
$$ begin return split_part(pfad, '/', 1)::uuid; exception when others then return null; end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('anhaenge', 'anhaenge', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
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

-- ---------- Live-Synchronisierung (Supabase Realtime) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.wuensche;   exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.kommentare; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.antworten;  exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.automatik;  exception when duplicate_object then null; end;
  end if;
end $$;
