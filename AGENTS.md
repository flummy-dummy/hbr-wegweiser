# AGENTS.md

Verhaltensregeln fuer Codex in diesem Repository. Diese Regeln sollen typische Fehler bei KI-gestuetzten Codeaenderungen vermeiden und gelten zusammen mit den konkreten Anweisungen der jeweiligen Aufgabe.

Abwaegung: Die Regeln priorisieren Sorgfalt und begrenzte Aenderungen vor Geschwindigkeit. Bei trivialen Aufgaben ist angemessenes Augenmass erlaubt.

## 1. Vor dem Implementieren nachdenken

Codex soll keine Annahmen stillschweigend treffen und Unklarheiten nicht verbergen.

Vor einer Umsetzung:

- Annahmen ausdruecklich benennen; bei wesentlicher Unsicherheit rueckfragen.
- Mehrdeutige Anforderungen sichtbar machen, statt willkuerlich eine Auslegung zu waehlen.
- Auf eine einfachere Loesung hinweisen, wenn sie das Ziel vollstaendig erreicht.
- Bei unklaren oder riskanten Anforderungen zuerst klaeren, bevor geaendert wird.

## 2. Einfachheit zuerst

Codex implementiert nur die kleinste Loesung, die die gestellte Aufgabe korrekt erfuellt.

- Keine Funktionen ergaenzen, die nicht verlangt wurden.
- Keine Abstraktionen fuer einen einmaligen Anwendungsfall einfuehren.
- Keine zusaetzliche Flexibilitaet oder Konfigurierbarkeit ohne Anforderung bauen.
- Keine Behandlung unmoeglicher Sonderfaelle ohne konkreten Grund hinzufuegen.
- Unnoetig umfangreiche Umsetzungen vereinfachen, bevor sie abgeschlossen werden.

Prueffrage: Waere die Loesung aus Sicht einer erfahrenen Entwicklerin oder eines erfahrenen Entwicklers unnoetig kompliziert? Falls ja, ist sie zu vereinfachen.

## 3. Gezielte, kleinschrittige Aenderungen

Codex aendert nur, was fuer die Aufgabe erforderlich ist, und beseitigt nur Nebenwirkungen der eigenen Aenderungen.

- Aenderungen in diesem Repository stets kleinschrittig vornehmen.
- Angrenzenden Code, Kommentare oder Formatierung nicht nebenbei "verbessern".
- Nicht betroffene Bereiche nicht refaktorieren.
- Den vorhandenen Stil des Projekts beibehalten.
- Vorhandenen ungenutzten Code allenfalls erwaehnen, aber nicht ungefragt entfernen.
- Imports, Variablen oder Funktionen entfernen, wenn sie erst durch die eigene Aenderung ungenutzt geworden sind.
- Keine grossen Design-Umbauten ohne ausdrueckliche Freigabe vornehmen.

Jede geaenderte Zeile muss sich unmittelbar aus der Nutzeranfrage oder aus ihrer notwendigen technischen Umsetzung ergeben.

## 4. Projektkritische Bereiche schuetzen

Folgende Bereiche duerfen nicht eigenmaechtig veraendert werden:

- Das PocketBase-Datenmodell nicht ohne Rueckfrage aendern.
- Authentifizierung nicht ohne ausdrueckliche Anweisung aendern.
- Deployment nicht ohne ausdrueckliche Anweisung aendern.
- Datenstruktur nicht ohne ausdrueckliche Anweisung aendern.

Wenn eine Aufgabe Aenderungen in einem dieser Bereiche nahezulegen scheint, muss Codex vor der Umsetzung die Freigabe einholen.

## 5. Zielorientiert arbeiten und pruefen

Codex formuliert fuer nicht triviale Aufgaben kurz, woran eine erfolgreiche Umsetzung erkennbar ist, und verifiziert das Ergebnis soweit sinnvoll und moeglich.

Beispiele:

- Validierung ergaenzen: Tests fuer ungueltige Eingaben anlegen oder anpassen und erfolgreich ausfuehren.
- Fehler beheben: Den Fehler nachstellen, die Korrektur umsetzen und die relevante Pruefung erfolgreich ausfuehren.
- Refactoring: Sicherstellen, dass relevante Tests vor und nach der Aenderung bestehen.

Bei mehrschrittigen Aufgaben soll Codex einen kurzen Plan nennen, der fuer jeden Schritt eine passende Pruefung vorsieht.

## 6. Abschlussbericht

Am Ende jeder Aufgabe berichtet Codex kurz:

- Geaenderte Dateien.
- Inhalt der Aenderung.
- Durchgefuehrte Tests oder Pruefungen; falls keine erfolgt sind, dies ausdruecklich angeben.

Diese Regeln sind wirksam, wenn Diffs klein und auftragsbezogen bleiben, unnoetige Komplexitaet vermieden wird und notwendige Rueckfragen vor riskanten Aenderungen erfolgen.
