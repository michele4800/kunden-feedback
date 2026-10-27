' Startet waechter-starten.cmd ohne sichtbares Fenster (0) und wartet (True), solange der Waechter laeuft.
' So kann das Fenster nicht versehentlich geschlossen werden; die Aufgabenplanung sieht die Aufgabe als "laeuft".
' Ausgaben stehen im Logbuch waechter\waechter.log.
Set fso = CreateObject("Scripting.FileSystemObject")
ordner = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "cmd.exe /c """ & ordner & "\waechter-starten.cmd""", 0, True
