// Verbindung zu Supabase. Beides steht im Supabase-Dashboard unter „Project Settings → API“.
// Der „anon public“-Schlüssel ist öffentlich und darf hier stehen – geschützt wird über die Zugriffsregeln (RLS).
// NIEMALS den „service_role“-Schlüssel hier eintragen.
// Leer gelassen läuft alles im Demo-Modus (Daten nur im eigenen Browser).
window.KF_KONFIG = {
  url: "",
  schluessel: "",
};
