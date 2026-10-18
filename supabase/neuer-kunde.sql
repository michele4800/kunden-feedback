-- Neuen Kunden anlegen. Vorher in Supabase → Authentication → Users die Benutzer anlegen
-- („Add user“ → E-Mail + Passwort, „Auto Confirm User“ an). Dann hier die Platzhalter ersetzen und im SQL Editor ausführen.

do $$
declare
  p uuid;
begin
  insert into public.projekte (slug, name, vorschau_url)
  values ('huehnerhof-schneider', 'Hühnerhof Schneider', 'https://michele4800.github.io/huehnerhof-schneider-entwurf/')
  on conflict (slug) do update set name = excluded.name, vorschau_url = excluded.vorschau_url
  returning id into p;

  -- Mitglieder: E-Mail-Adressen müssen in Authentication → Users existieren
  insert into public.mitglieder (projekt_id, user_id, rolle, anzeigename)
  select p, u.id, x.rolle, x.name
  from (values
    ('kunde@beispiel.de',          'kunde',   'Robin (Hühnerhof)'),
    ('du@deine-agentur.de',        'agentur', 'Michele'),
    ('automatik@deine-domain.de',  'agentur', 'Michele (Automatik)')
  ) as x(email, rolle, name)
  join auth.users u on lower(u.email) = lower(x.email)
  on conflict (projekt_id, user_id) do update set rolle = excluded.rolle, anzeigename = excluded.anzeigename;

  insert into public.automatik (projekt_id, modus) values (p, 'mit_freigabe')
  on conflict (projekt_id) do nothing;

  -- Fragen an den Kunden (optional)
  if not exists (select 1 from public.fragen where projekt_id = p) then
    insert into public.fragen (projekt_id, reihenfolge, frage, hilfe, art, optionen) values
      (p, 1, 'Welcher Stil gefällt euch?', 'Eine Mischung ist auch möglich – dann bitte im Wunsch beschreiben.', 'auswahl', '["Entwurf 1 – Eröffnung","Entwurf 2 – Kräftig","Entwurf 3 – Erzählend","Mischung"]'),
      (p, 2, 'Fährt der Hofbus nach der Eröffnung weiter wie bisher?', 'Falls nicht: neue Zeiten oder Orte.', 'text', '[]'),
      (p, 3, 'Wochenmarkt Böblingen (mittwochs): von wann bis wann?', '', 'text', '[]'),
      (p, 4, 'Gibt es im neuen Hofladen Kartenzahlung?', '', 'auswahl', '["Ja","Nein","Noch offen"]'),
      (p, 5, 'Stimmt das Sortiment? Was fehlt, was gibt es nicht mehr?', 'Bisher: Eier, Eierlikör, Äpfel und Birnen, Nudeln, Linsen, Mehl, Honig, Marmelade, Brot, Wurst, Fleisch, Käse, Obst und Gemüse, Wein, Eis', 'text', '[]'),
      (p, 6, 'Was gibt es im Hofcafé?', 'z. B. Kaffee, Kuchen, Frühstück', 'text', '[]'),
      (p, 7, 'Dürfen wir eure Instagram-Fotos verwenden?', '', 'auswahl', '["Ja, alle","Nur bestimmte","Nein, wir schicken eigene"]'),
      (p, 8, 'Wer soll im Impressum stehen?', '', 'auswahl', '["Hühnerhof Schneider","Die GmbH","Beide"]'),
      (p, 9, 'USt-IdNr. der GmbH', '', 'text', '[]');
  end if;
end $$;
