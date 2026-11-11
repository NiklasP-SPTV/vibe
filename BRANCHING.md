# Branches und Freigabe

Gilt seit 11.11.2026 bis zu einer anderen Absprache mit der IT.

## Die zwei Branches

| Branch | Inhalt | Wer ändert ihn |
| --- | --- | --- |
| `dev` | Laufende Entwicklung: neue Funktionen, Korrekturen, Übernahmen aus dem Original-Projekt | Fork-Betreiber |
| `main` | Der von der IT freigegebene Stand | Nur per Pull Request von `dev`, nach Absprache mit der IT |

Neue Arbeit beginnt immer auf `dev`. Größere Vorhaben dürfen auf einem eigenen Branch entstehen, der von `dev` abzweigt und wieder in `dev` zurückgeführt wird. Nach dem Merge wird er gelöscht.

`main` ist geschützt. Direkte Pushes, Force-Pushes und das Löschen sind gesperrt, Änderungen kommen nur über einen Pull Request.

## Ablauf eines Releases

1. **Entwickeln und testen** auf `dev`, mit Version und Changelog (`i18n/changelog/<version>.md`).
2. **Engine bauen**, falls sich `server/` geändert hat: Workflow „Release Server“ auf `dev`, mit neuem Tag `server-v…-sptv.N`. Danach `.server-version` anpassen.
3. **App bauen**: Workflow „Release“ auf `dev`, ohne Signierung. Das Ergebnis ist ein Prerelease. Installierte Apps bekommen es nicht als Update angeboten.
4. **Eigener Test** des Prereleases durch den Fork-Betreiber.
5. **Freigabe durch die IT**: Pull Request `dev` → `main`. Ob die IT jedes Release selbst prüft, wird noch geklärt.
6. **Merge** nach der Freigabe.
7. **Veröffentlichen**: Workflow „Promote Release“ mit der Versionsnummer. Er bricht ab, wenn der Stand des Releases nicht in `main` enthalten ist. Erst danach bieten installierte Apps das Update an.

## Original-Projekt

Änderungen aus [thewh1teagle/vibe](https://github.com/thewh1teagle/vibe) werden auf `dev` übernommen (Cherry-Pick oder Merge) und laufen dann denselben Weg.
