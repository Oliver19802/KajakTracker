# KajakTracker Offline Map Worker

Der Worker ist die geschützte Schnittstelle zwischen der öffentlichen KajakTracker-Pages-App, GitHub Actions und Cloudflare R2. Die produktive App ist noch nicht angebunden.

## Architektur

1. `POST /offline-map/build` validiert Koordinaten und Zugangscode.
2. Der Worker erzeugt eine eindeutige `jobId` und startet ausschließlich `Oliver19802/KajakTracker/.github/workflows/build-offline-map.yml` auf `main`.
3. Der Workflow trägt die `jobId` in `run-name` und `map_name`. Dadurch wird niemals ein unsicherer „letzter Run“ zugeordnet.
4. Nach dem Build lädt GitHub Actions die drei Dateien optional unter `offline-maps/{jobId}/` nach R2 und erzeugt weiterhin das normale GitHub Artifact.
5. Der Worker liest Metadaten aus R2 und streamt Dateien. R2 verarbeitet `Range`-Anfragen, sodass der vorhandene 512-KiB-Downloader später direkt weiterverwendet werden kann.

## Endpoints

- `POST /offline-map/build`
- `GET /offline-map/status/:jobId`
- `GET /offline-map/meta/:jobId`
- `GET|HEAD /offline-map/file/:jobId/offline-map.pmtiles`
- `GET|HEAD /offline-map/file/:jobId/offline-pois.json`
- `GET|HEAD /offline-map/file/:jobId/offline-map.json`

Alle Endpoints verlangen `Authorization: Bearer <BUILD_ACCESS_TOKEN>`. Erlaubte Browser-Origin ist ausschließlich `https://oliver19802.github.io`. Für lokale Tests kann `ALLOW_LOCALHOST` vorübergehend auf `true` gesetzt werden.

## Cloudflare einrichten

Voraussetzungen: Cloudflare-Konto mit aktivierter R2-Nutzung, Node.js und Wrangler 4.36 oder neuer.

```sh
cd worker
npm install
npx wrangler r2 bucket create kajaktracker-offline-maps
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put BUILD_ACCESS_TOKEN
npx wrangler deploy
```

`GITHUB_TOKEN` ist ein Fine-Grained Personal Access Token, ausschließlich für das Repository `KajakTracker`:

- Actions: Read and write
- Contents: Read-only

`BUILD_ACCESS_TOKEN` ist ein unabhängiger, zufälliger Zugangscode für die private App-Nutzung. Er ist kein GitHub- oder Cloudflare-Token. Beide Werte dürfen weder in Wrangler-Konfiguration, Repository, Browser-Logs noch Worker-Antworten geschrieben werden.

Nach dem Deploy zeigt Wrangler die Worker-URL an. Diese wird erst bei der späteren App-Anbindung benötigt.

## R2-Upload aus GitHub Actions

In Cloudflare unter **R2 → Manage R2 API Tokens** einen Object Read & Write Token erstellen, auf den Bucket `kajaktracker-offline-maps` beschränken. Anschließend im GitHub-Repository unter **Settings → Secrets and variables → Actions** setzen:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET` mit Wert `kajaktracker-offline-maps`

Ohne diese vier Secrets überspringt der Workflow ausschließlich den R2-Upload und stellt weiterhin sein GitHub Artifact bereit. R2-Zugangsdaten gelangen niemals in die Pages-App.

## Aufbewahrung und Kostenkontrolle

Im R2-Bucket eine Lifecycle-Regel für Präfix `offline-maps/` einrichten, die Objekte nach zwei Tagen löscht. Damit bleiben serverseitige Karten nicht unbegrenzt gespeichert; lokal auf dem iPhone gespeicherte Karten sind davon unabhängig.

Die Wrangler-Konfiguration begrenzt Builds auf zwei Versuche pro IP und Minute. Zusätzlich lehnt der Worker einen neuen Build ab, solange bereits ein Workflow-Run wartet oder läuft. Die Rate-Limiting-API ist absichtlich nur Missbrauchsschutz und keine exakte Abrechnung.

## Tests

```sh
cd worker
npm test
npm run check
```

Die Tests verwenden ausschließlich lokale GitHub-/R2-Mocks. Ein echter End-to-End-Test benötigt zuerst den Worker-Deploy sowie die oben genannten Cloudflare- und GitHub-Secrets.
