# Umsetzung des Prüfberichts zu Vibe 3.6.1

Stand 11.11.2026, Branch `dev`, Version 3.6.3. Grundlage ist die Sicherheitsprüfung vom 10.11.2026.

Umgesetzt ist Variante B: Der Fork-Betreiber härtet den Code. Jede Maßnahme ist ein eigener Commit, der die Befundnummer im Titel trägt (`git log --oneline main..dev`).

## Umgesetzt

| Befund | Maßnahme | Commit |
| --- | --- | --- |
| H1 Telemetrie | Aptabase-Plugin, Secrets und Einstellung entfernt; die App sendet keine Nutzungsdaten. | 4970707c |
| H2 FFmpeg | FFmpeg 9.0.2 mit SHA-256 gepinnt (`server/ffmpeg-pins.txt`); macOS von martin-riedl.de, Windows vom versionierten gyan.dev-Release. Jeder Aufruf von FFmpeg und ffprobe läuft mit `-protocol_whitelist file,pipe`. | 2158af46, 6610aeaf |
| M1 Härtung der Oberfläche | Tauri 2.12.5, damit ist CVE-2026-42184 behoben. Eine Content Security Policy ist gesetzt, `withGlobalTauri` ist aus, die Devtools sind nicht mehr im Release. | 906aa8b9, e878df6d |
| M2 Externe Bilder | KI-Antworten werden ohne Bilder und ohne klickbare Links gerendert. | ac85fec2 |
| M3 Cloud-KI | Das Menü zeigt den Anbieter an. Vor der ersten Übertragung je Dienst kommt eine Rückfrage. Automatische Zusammenfassung nur mit lokalem Modell. | 71ae6d89 |
| M5 Updater | Neuer Workflow „Promote Release“ zur Freigabe; er lässt nur Stände zu, die in `main` enthalten sind. Links und Datenschutzhinweis zeigen auf den Fork (`PRIVACY.md`). | f31ef96b, f855d589 |
| M6 Engine | Zufallsschlüssel pro Start, übergeben per Umgebungsvariable und Pflicht bei jeder Anfrage. Host-Header nur 127.0.0.1, localhost oder [::1]. Geprüft: ohne Schlüssel 401, fremder Host 421. | c77f9409 |
| M7 Downloads | Größe und SHA-256 für alle Modelle. yt-dlp nur mit dem Hash aus `SHA2-256SUMS`, nur http(s)-Links, Link nach `--`. Der allgemeine Download-Befehl ist entfernt. | 76783088, 8e0a4707 |
| M8 Temp und Logs | Die Engine räumt eigene Temp-Kopien auf. Burn-in-Videos werden beim Beenden gelöscht. Das Log enthält nur Warnungen und Fehler. | 0ebb6db3 |
| M9 Telefon-Übergabe | Abgeschaltet; die App startet sie nicht und blendet sie aus. | 4610ec2d |
| M10 Build-Kette | Actions auf Commit-SHAs gepinnt. Apple-Secrets nur im Build-Schritt. ggml-Bibliotheken mit SHA-256 geprüft (`server/ggml-libs.sha256`). Neuer Workflow „Audit“ (cargo audit, pnpm audit). | cd771fcc |
| M11 TLS | rustls-webpki 0.103.16, aws-lc-sys 0.47.0, rustls 0.23.46, webpki-roots 1.0.12. | da3e3655 |
| M10/M11 Abhängigkeiten | Erster Audit-Lauf: 21 Advisories in der App, 6 in der Engine, 24 hohe im Frontend. Alle drei Lockfiles semver-kompatibel aktualisiert, dadurch sind sie behoben. Build-Werkzeuge stehen jetzt unter devDependencies. | 7b609a26 |
| N3 Deep-Link | Nur noch https zu huggingface.co oder github.com; die Rückfrage zeigt die volle Adresse. | 85a03213 |
| N4 Fehlerberichte | Ziel ist der Fork; der Browser öffnet sich erst nach Klick auf „Melden“. | d81ef46b |
| N6 PATH | Mitgeliefertes FFmpeg vor dem aus dem PATH; das Arbeitsverzeichnis wird nicht mehr durchsucht. | 6610aeaf |
| N12 Tags | Engine-Releases werden am gebauten Commit getaggt. | 4f75fff3 |

Organisatorisch gilt die Branch-Policy (`BRANCHING.md`). Entwickelt wird auf `dev`, `main` ist geschützt und wird nur nach Absprache mit der IT per Pull Request geändert.

## Bewusst offen

| Befund | Grund |
| --- | --- |
| M1 Dateisystem-Scope | Eine Begrenzung auf Programm- und Projektordner würde Material auf Netzlaufwerken und externen Platten unbrauchbar machen. Das braucht eine Entscheidung, welche Ablageorte zugelassen sind. |
| M4 Signatur, Notarisierung | Braucht kostenpflichtige Zertifikate des Unternehmens; die Workflows sind vorbereitet. |
| M7 vc_redist | Der Windows-Installer lädt die VC++-Laufzeit von Microsoft. Empfehlung: zentral vorverteilen. |
| N1 API-Schlüssel im Klartext | Umstellung auf den Schlüsselbund des Betriebssystems ist größerer Umbau. |
| N8 Bundle-ID | Eine eigene ID verschiebt die Datenordner, also Modelle und Projekte, und braucht eine Migration. |
| zip 3.0.0 (Engine) | Build-Abhängigkeit von utoipa-swagger-ui. Sie entpackt beim Kompilieren die Swagger-Oberfläche, wird nicht ausgeliefert und verarbeitet keine Nutzerdateien. Behebung erst mit utoipa 6; bis dahin in `audit.yml` als Ausnahme begründet. |
| Hinweise auf nicht mehr gepflegte Crates | paste, zbus/zvariant (Linux): Es gibt kein Update, und sie haben keine bekannte Schwachstelle. |
| N2, N5, N7, N9 bis N11 | Niedrig, ohne Codeänderung behandelbar, wie im Bericht beschrieben. |

## Geprüft

- **Automatische Tests:** 146 Frontend-Tests, 64 App-Tests (Rust) und alle Engine-Tests laufen fehlerfrei.
- **Schwachstellen-Scan:** `cargo audit` meldet für die App keine Schwachstellen. Für die Engine bleibt nur die begründete zip-Ausnahme. `pnpm audit --prod` meldet keine bekannten Schwachstellen.
- **Debug-Build unter CSP (Windows):** Oberfläche, geöffnetes Transkript und Player funktionieren, auch nach dem Abhängigkeits-Update.
- **Echte Transkription:** über die Engine mit Schlüsselschutz, mit Nemotron-Sprechererkennung.
- **Engine-Zugriff per HTTP:** ohne Schlüssel 401, mit fremdem Host 421, die Dateiprobe aus dem Bericht wird abgewiesen.
