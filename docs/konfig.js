// Verbindung zu Supabase. Beides steht im Supabase-Dashboard unter „Project Settings → API“.
// Der „anon public“-Schlüssel ist öffentlich und darf hier stehen – geschützt wird über die Zugriffsregeln (RLS).
// NIEMALS den „service_role“-Schlüssel hier eintragen.
// Leer gelassen läuft alles im Demo-Modus (Daten nur im eigenen Browser).
window.KF_KONFIG = {
  url: "https://lewkthvhaamlqpntwauq.supabase.co",
  schluessel: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxld2t0aHZoYWFtbHFwbnR3YXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNDY4OTcsImV4cCI6MjEwNzkyMjg5N30.bZEozXoguD1_nnDbBQc6o1mRAmREyoTKIqfcNr4NguE",
  // Kunden können sich statt mit E-Mail mit einem Benutzernamen anmelden: „robin“ wird zu „robin@<benutzer_domain>“.
  // In Supabase den Benutzer daher mit genau dieser Adresse anlegen (z. B. robin@kunden.example.com).
  // example.com ist reserviert und empfängt nie E-Mails – „Passwort vergessen“ geht für diese Zugänge nicht, das Passwort setzt die Agentur zurück.
  benutzer_domain: "kunden.example.com",
  // GitHub-Konto für neue Websites: ohne Vorschau-Adresse legt die Automatik das Repo dort an (https://<konto>.github.io/<kurzname>/)
  github_konto: "michele4800",
};
