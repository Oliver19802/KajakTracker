# Offline-Wasserwege Deutschland und Polen

Der Workflow `build-waterways.yml` lädt die Geofabrik-Länderextrakte, filtert mit Osmium die Linien `river`, `canal`, `stream`, `ditch` und exportiert Geometrie sowie OSM-Tags. `build-waterways.cjs` zerlegt lange Linien ohne Lücken in maximal 64 Punkte und ordnet sie einem 0,25-Grad-Raster zu. Jeder Abschnitt behält eine stabile OSM-ID; an Raster- und Ländergrenzen werden doppelte Abschnitte beim Anzeigen zusammengeführt.

Die Daten werden getrennt vom Anwendungscode im Branch `waterway-data` veröffentlicht. Die App liest die Manifeste `de.json` und `pl.json` dort über raw.githubusercontent.com. Unveränderliche Paketabschnitte tragen ihre SHA-256-Prüfsumme im Dateinamen. Ältere Abschnitte bleiben erhalten, damit bereits laufende Downloads nach einer Veröffentlichung weiter funktionieren.

Der erste Build startet bei Änderungen des Generators oder des Workflows auf `main`. Spätere Datenaktualisierungen können in GitHub Actions über „Run workflow“ gestartet werden. Es gibt keinen automatischen Zeitplan. Erst wenn beide Länder erfolgreich gebaut wurden, wird der Datenbranch aktualisiert.

In der Karte unter „Wasserwege offline“ Deutschland bzw. Polen herunterladen. Das vollständige Paket wird in IndexedDB gespeichert, aber erst nach Prüfung aller Dateilängen, Prüfsummen und Kacheln aktiviert. Ein Update benötigt vorübergehend Platz für altes und neues Paket. Fehler oder Abbruch erhalten das vorhandene Paket. Die Schaltfläche zum Aktualisieren lädt auch eine unveränderte Version erneut und kann damit einen beschädigten Gerätespeicher reparieren.

Sobald ein Länderpaket installiert ist, werden die Wasserweglinien ausschließlich aus den installierten Paketen gelesen; auch außerhalb dieser Länder wird nicht automatisch auf Overpass zurückgegriffen. Es werden nur die Kacheln des sichtbaren Ausschnitts aus IndexedDB gelesen. Es gibt keine zeitgesteuerte Aktualisierung. Ohne Länderpaket bleibt der bisherige Onlineabruf aktiv.

Die Hintergrundkarte muss separat offline gespeichert werden. Länderpakete speichern Geometrie und Zugangsangaben zum angegebenen Datenstand, keine aktuellen amtlichen Sperrungen. Browserdaten dürfen nicht gelöscht werden, wenn die Pakete erhalten bleiben sollen; Browser können Speicher unter Platzdruck selbst bereinigen. Lokale Vorschau und öffentliche Website haben getrennte Gerätespeicher.

Quellen und Lizenz: © OpenStreetMap contributors, ODbL 1.0, Datenaufbereitung Geofabrik. https://www.openstreetmap.org/copyright

Tests:

```
node --test tests/waterway-loading.test.cjs tests/waterway-packages.test.cjs worker/test/index.test.js
```

Zusätzlich im lokalen Browser `/tests/waterway-storage.html` öffnen. Die dort verwendete temporäre Testdatenbank ist vom Anwendungsspeicher getrennt und wird danach gelöscht.
