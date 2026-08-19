# Offline-Karten-PoC Burg (Spreewald)

Stand: 2026-08-19. Die produktiven Dateien `index.html`, `app.js`, `style.css`,
`sw.js` und `manifest.json` wurden nicht verändert.

## Datensatz

- Quelle: Geofabrik `brandenburg-latest.osm.pbf`
- Mittelpunkt: 51,835 N / 14,149 E
- Radius: 30 km
- Bounding Box: 13,7128759 / 51,5655066 / 14,5851240 / 52,1044933
- Ausschnitt: `data/spreewald-30km.osm.pbf`, 27.008.437 Bytes (25,757 MiB)
- Vektorkarte: PMTiles v3, OpenMapTiles 3.16
- Datei: `data/spreewald-z10-15.pmtiles`, 33.356.774 Bytes (31,811 MiB)
- Zoom: 10–15
- adressierte Tiles: 8.541
- Tile-Einträge: 8.522
- unterschiedliche Tile-Inhalte: 8.510

SHA-256:

- PBF: `68D3A0DCCF50BECF8A0D960EA1435430851C79EEEE16A974D05BFF4246FD8FF2`
- PMTiles: `E2A91702CACDDA6392F75E3604390B355E57E8E02F9E571344AA586D2FEA672C`

## Kajak-relevante OSM-Objekte

Gezählt wurden Nodes, Ways und Relations im erzeugten PBF. Schleusen entsprechen
der bereits produktiv verwendeten Vereinigung aus `waterway=lock_gate`,
`waterway=lock` oder `lock=yes`.

| Kategorie | Gesamt | Nodes | Ways | Relations |
|---|---:|---:|---:|---:|
| Schleusen | 191 | 22 | 169 | 0 |
| Wehre | 1.828 | 1.636 | 192 | 0 |
| Restaurants | 408 | 281 | 127 | 0 |
| Cafés | 102 | 76 | 26 | 0 |
| Pubs | 46 | 37 | 9 | 0 |
| Biergärten | 22 | 16 | 6 | 0 |
| Fast Food | 163 | 124 | 39 | 0 |
| `canoe=put_in` | 3 | 2 | 1 | 0 |
| Slipways | 34 | 28 | 6 | 0 |
| Toiletten | 178 | 125 | 53 | 0 |
| Campingplätze | 56 | 18 | 38 | 0 |
| Caravanplätze | 20 | 6 | 14 | 0 |

## Browser-Test

- MapLibre und PMTiles-Bibliothek werden lokal aus `vendor/` geladen.
- PMTiles wird per HTTP-Range vom lokalen Testserver gelesen.
- Wasser, Wasserwege, Straßen/Wege, Gebäude, Landnutzung und Namen werden dargestellt.
- Der 30-km-Bereich ist als gestrichelter Kreis markiert.
- Verschieben und mehrfaches Zoomen wurden im Browser ohne Konsolenfehler getestet.
- Mobile Prüfung bei 390 × 844 px war erfolgreich.
- Die Testdateien enthalten keine URLs zu OSM-, OpenSeaMap- oder OpenFreeMap-Tiles
  und keine sonstigen externen Laufzeit-URLs.
- GPS verwendet ausschließlich `navigator.geolocation`; es ist nicht an eine
  Kartenverbindung gekoppelt. Eine echte Standortfreigabe wurde im automatisierten
  Test nicht erteilt.

Start:

```powershell
./offline-test/serve.ps1
```

Danach `http://127.0.0.1:8765/` öffnen.

## Git-Schutz

`data/`, `tools/` und `work/` sind durch `offline-test/.gitignore` ausgeschlossen.
Damit werden insbesondere Brandenburg-PBF, Ausschnitt, PMTiles, Java/Osmosis,
Planetiler, temporäre XML-Dateien und Build-Caches nicht versioniert.
