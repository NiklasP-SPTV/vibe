# Datenschutz – Vibe (SPIEGEL-TV-Fork)

Diese Hinweise gelten für die Builds aus [NiklasP-SPTV/vibe](https://github.com/NiklasP-SPTV/vibe) ab Version 3.6.3.

## Was auf dem Rechner bleibt

- **Transkription:** Sie läuft vollständig lokal. Die Engine baut keine Verbindungen nach außen auf.
- **Material:** Audio, Video und Transkripte verlassen den Rechner nur, wenn eine der unten genannten Funktionen ausdrücklich genutzt wird.
- **Telemetrie:** Es gibt keine. Die Nutzungsstatistik ist ausgebaut, es werden keine Ereignisse, Kennungen, Dateinamen oder Fehlertexte gesendet.

## Was Verbindungen aufbaut

| Funktion | Ziel | Was übertragen wird |
| --- | --- | --- |
| Modell-Download | Hugging Face, GitHub | Nur die Anfrage nach der Modelldatei |
| Update-Prüfung | GitHub (dieser Fork) | Nur die Abfrage der aktuellen Version |
| Übersetzung (DeepL), nur bei Auswahl im Startdialog | DeepL | Alle Segmenttexte des Transkripts |
| Zusammenfassung und Fragen (KI), nur auf Anforderung | Anthropic, OpenAI oder ein selbst eingetragener Dienst | Das vollständige Transkript mit Sprechernamen |
| Online-Prüfung | 1.1.1.1, 8.8.8.8 | Ein Verbindungsversuch ohne Nutzdaten |

Vor der ersten Übertragung an einen KI-Dienst fragt die App nach. Automatische Zusammenfassungen laufen nur mit einem lokalen Modell (Ollama).

Für DeepL gilt: Nur mit einem Pro-Schlüssel verwenden. Mit einem Free-Schlüssel darf DeepL übermittelte Texte speichern.

## Fehlerberichte

Ein Fehlerbericht wird erst gesendet, wenn die Anwenderin oder der Anwender ihn selbst abschickt.

## Ansprechpartner

Niklas Prahl, SPIEGEL TV
