(function () {
  'use strict';

  const DB_NAME = 'kajaktracker-offline-maps';
  const DB_VERSION = 1;
  const MAP_STORE = 'maps';
  const CHUNK_STORE = 'chunks';
  const MAP_ID = 'spreewald';
  const DOWNLOAD_ID = `${MAP_ID}:download`;
  const CHUNK_SIZE = 512 * 1024;
  const EXPECTED_SIZE = 33356774;
  const MAX_CHUNK_ATTEMPTS = 3;
  const STORAGE_RESERVE = 20 * 1024 * 1024;
  const MAP_URL = 'offline-test/data/spreewald-z10-15.pmtiles';
  const CENTER = [14.149, 51.835];
  const BOUNDS = [[51.5655066, 13.7128759], [52.1044933, 14.5851240]];

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB-Fehler'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB-Transaktion abgebrochen'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB-Transaktion fehlgeschlagen'));
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(MAP_STORE)) {
          database.createObjectStore(MAP_STORE, { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains(CHUNK_STORE)) {
          const chunks = database.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
          chunks.createIndex('byRevision', 'revisionKey', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offline-Speicher konnte nicht geöffnet werden'));
    });
  }

  async function getMetadata(database) {
    const tx = database.transaction(MAP_STORE, 'readonly');
    return requestResult(tx.objectStore(MAP_STORE).get(MAP_ID));
  }

  async function getDownloadMetadata(database) {
    const tx = database.transaction(MAP_STORE, 'readonly');
    return requestResult(tx.objectStore(MAP_STORE).get(DOWNLOAD_ID));
  }

  async function putMapRecord(database, record) {
    const tx = database.transaction(MAP_STORE, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(MAP_STORE).put(record);
    await done;
  }

  async function commitDownloadedMap(database, record) {
    const tx = database.transaction(MAP_STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(MAP_STORE);
    store.put(record);
    store.delete(DOWNLOAD_ID);
    await done;
  }

  async function putChunk(database, revision, index, data) {
    const revisionKey = `${MAP_ID}:${revision}`;
    const tx = database.transaction(CHUNK_STORE, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(CHUNK_STORE).put({
      key: `${revisionKey}:${index}`,
      revisionKey,
      index,
      data
    });
    await done;
  }

  async function getChunk(database, revision, index) {
    const tx = database.transaction(CHUNK_STORE, 'readonly');
    return requestResult(tx.objectStore(CHUNK_STORE).get(`${MAP_ID}:${revision}:${index}`));
  }

  async function countRevisionChunks(database, revision) {
    const tx = database.transaction(CHUNK_STORE, 'readonly');
    const revisionKey = `${MAP_ID}:${revision}`;
    return requestResult(tx.objectStore(CHUNK_STORE).index('byRevision').count(IDBKeyRange.only(revisionKey)));
  }

  async function deleteRevision(database, revision) {
    if (!revision) return;
    const revisionKey = `${MAP_ID}:${revision}`;
    const tx = database.transaction(CHUNK_STORE, 'readwrite');
    const done = transactionDone(tx);
    const index = tx.objectStore(CHUNK_STORE).index('byRevision');
    await new Promise((resolve, reject) => {
      const cursorRequest = index.openKeyCursor(IDBKeyRange.only(revisionKey));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) { resolve(); return; }
        tx.objectStore(CHUNK_STORE).delete(cursor.primaryKey);
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
    await done;
  }

  async function deleteMap(database) {
    const metadata = await getMetadata(database);
    if (metadata?.revision) await deleteRevision(database, metadata.revision);
    const download = await getDownloadMetadata(database);
    if (download?.revision && download.revision !== metadata?.revision) await deleteRevision(database, download.revision);
    const tx = database.transaction(MAP_STORE, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(MAP_STORE).delete(MAP_ID);
    tx.objectStore(MAP_STORE).delete(DOWNLOAD_ID);
    await done;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '–';
    return `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  }

  function concat(parts, totalLength) {
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.byteLength;
    }
    return output;
  }

  class IndexedDbPmtilesSource {
    constructor(database, metadata) {
      this.database = database;
      this.metadata = metadata;
      this.key = `indexeddb-${MAP_ID}-${metadata.revision}`;
    }

    getKey() { return this.key; }

    async getBytes(offset, length) {
      const { chunkSize, chunkCount, revision } = this.metadata;
      if (offset < 0 || length < 0 || offset + length > this.metadata.size) {
        throw new Error('Ungültiger PMTiles-Bereich');
      }
      const first = Math.floor(offset / chunkSize);
      const last = Math.floor((offset + length - 1) / chunkSize);
      const tx = this.database.transaction(CHUNK_STORE, 'readonly');
      const store = tx.objectStore(CHUNK_STORE);
      const requests = [];
      for (let index = first; index <= last; index++) {
        if (index >= chunkCount) throw new Error('Offline-Karte ist unvollständig');
        requests.push(requestResult(store.get(`${MAP_ID}:${revision}:${index}`)));
      }
      const parts = [];
      for (const record of await Promise.all(requests)) {
        if (!record?.data) throw new Error('Offline-Kartenblock fehlt');
        parts.push(new Uint8Array(record.data));
      }
      const combinedLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
      const combined = concat(parts, combinedLength);
      const startInFirst = offset - first * chunkSize;
      return { data: combined.slice(startInFirst, startInFirst + length).buffer };
    }
  }

  const OFFLINE_STYLE = sourceUrl => ({
    version: 8,
    glyphs: `${new URL('offline-test/vendor/fonts/', document.baseURI).href}{fontstack}/{range}.pbf`,
    sources: { spreewald: { type: 'vector', url: sourceUrl, attribution: '© OpenStreetMap contributors · © OpenMapTiles' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e8eadf' } },
      { id: 'landcover', type: 'fill', source: 'spreewald', 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'class'], 'wood', '#b9d3ad', 'grass', '#cfe1b6', 'farmland', '#e4dfb9', '#d7dfc6'], 'fill-opacity': .75 } },
      { id: 'landuse', type: 'fill', source: 'spreewald', 'source-layer': 'landuse', paint: { 'fill-color': ['match', ['get', 'class'], 'residential', '#e6ded5', 'cemetery', '#c9ddc3', 'hospital', '#ead4d2', '#ddd9c9'], 'fill-opacity': .65 } },
      { id: 'park', type: 'fill', source: 'spreewald', 'source-layer': 'park', paint: { 'fill-color': '#bedbb1', 'fill-opacity': .55 } },
      { id: 'water', type: 'fill', source: 'spreewald', 'source-layer': 'water', paint: { 'fill-color': '#8bc7df' } },
      { id: 'waterways', type: 'line', source: 'spreewald', 'source-layer': 'waterway', paint: { 'line-color': '#5aaaca', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, .7, 15, 2.4] } },
      { id: 'road-casing', type: 'line', source: 'spreewald', 'source-layer': 'transportation', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#c3bcb0', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 5.5] } },
      { id: 'roads', type: 'line', source: 'spreewald', 'source-layer': 'transportation', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': ['match', ['get', 'class'], 'path', '#f7f1db', 'track', '#e9dfc2', 'motorway', '#f0a5a0', '#fffdf8'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, .6, 15, 3.2] } },
      { id: 'buildings', type: 'fill', source: 'spreewald', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#c9b9aa', 'fill-outline-color': '#ad9b8b' } },
      { id: 'road-names', type: 'symbol', source: 'spreewald', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name']], 'text-font': ['Open Sans Semibold'], 'text-size': 11 }, paint: { 'text-color': '#605d58', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } },
      { id: 'place-names', type: 'symbol', source: 'spreewald', 'source-layer': 'place', layout: { 'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name']], 'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 15] }, paint: { 'text-color': '#293833', 'text-halo-color': '#f7f7ef', 'text-halo-width': 1.5 } }
    ]
  });

  function createLeafletMapLibreLayer(archive) {
    const protocol = new pmtiles.Protocol();
    protocol.add(archive);
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return L.Layer.extend({
      getAttribution() { return '© OpenStreetMap contributors · © OpenMapTiles'; },
      onAdd(leafletMap) {
        this._leafletMap = leafletMap;
        this._container = L.DomUtil.create('div', 'offlineMapLibreLayer', leafletMap.getContainer());
        this._mapLibre = new maplibregl.Map({
          container: this._container,
          style: OFFLINE_STYLE(`pmtiles://${archive.source.getKey()}`),
          center: [leafletMap.getCenter().lng, leafletMap.getCenter().lat],
          zoom: leafletMap.getZoom(),
          minZoom: 10,
          maxZoom: 15,
          attributionControl: false,
          interactive: false,
          fadeDuration: 0
        });
        this._sync = () => {
          const center = leafletMap.getCenter();
          this._mapLibre.resize();
          this._mapLibre.jumpTo({ center: [center.lng, center.lat], zoom: leafletMap.getZoom(), bearing: 0, pitch: 0 });
        };
        leafletMap.on('move zoom resize', this._sync);
        this._mapLibre.on('load', this._sync);
      },
      onRemove(leafletMap) {
        leafletMap.off('move zoom resize', this._sync);
        this._mapLibre?.remove();
        this._container?.remove();
        maplibregl.removeProtocol('pmtiles');
      }
    });
  }

  function showMapMessage(message, isError = false) {
    let toast = document.querySelector('.mapMessageToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'mapMessageToast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('isError', isError);
    toast.hidden = false;
    clearTimeout(showMapMessage.timer);
    showMapMessage.timer = setTimeout(() => { toast.hidden = true; }, 5000);
  }
  window.showMapMessage = showMapMessage;

  window.createOfflineMapManager = function ({ map, onlineLayer, mapModeButtons }) {
    let database;
    let metadata;
    let offlineLayer;
    let activeMode = 'online';
    let downloadRunning = false;
    const elements = {};
    const originalMinZoom = map.getMinZoom();
    const originalMaxZoom = map.getMaxZoom();

    const insideBounds = latLng => latLng.lat >= BOUNDS[0][0] && latLng.lat <= BOUNDS[1][0] && latLng.lng >= BOUNDS[0][1] && latLng.lng <= BOUNDS[1][1];

    async function savePreferredMode(mode) {
      if (!metadata?.complete) return;
      metadata = { ...metadata, preferredMode: mode };
      const tx = database.transaction(MAP_STORE, 'readwrite');
      const done = transactionDone(tx);
      tx.objectStore(MAP_STORE).put(metadata);
      await done;
    }

    function setStatus(text, error = false) {
      if (!elements.status) return;
      elements.status.textContent = text;
      elements.status.classList.toggle('isError', error);
    }

    function updatePanel() {
      const available = Boolean(metadata?.complete && metadata.size > 0);
      elements.download.hidden = available;
      elements.available.hidden = !available;
      elements.actions.hidden = !available;
      elements.offlineMode.hidden = !available;
      if (available) {
        elements.details.textContent = `Zuletzt gespeichert: ${new Date(metadata.savedAt).toLocaleString('de-DE')} · ${formatBytes(metadata.size)}`;
        elements.panel.dataset.storedBytes = String(metadata.size);
        elements.panel.dataset.chunkCount = String(metadata.chunkCount);
        elements.panel.dataset.persistence = metadata.persistenceGranted === true ? 'granted' : metadata.persistenceGranted === false ? 'denied' : 'unsupported';
        elements.panel.dataset.downloadMethod = metadata.downloadMethod || 'legacy';
      } else {
        elements.details.textContent = 'Noch nicht auf diesem Gerät gespeichert.';
        delete elements.panel.dataset.storedBytes;
        delete elements.panel.dataset.chunkCount;
        delete elements.panel.dataset.persistence;
        delete elements.panel.dataset.downloadMethod;
      }
      elements.download.disabled = downloadRunning;
      elements.update.disabled = downloadRunning;
      elements.remove.disabled = downloadRunning;
      elements.onlineMode.classList.toggle('isActive', activeMode === 'online');
      elements.offlineMode.classList.toggle('isActive', activeMode === 'offline');
      mapModeButtons.offlineMap?.classList.toggle('isActive', activeMode === 'offline');
    }

    async function activateOffline(save = true) {
      if (!metadata?.complete) { setStatus('Offline-Karte ist noch nicht gespeichert.', true); return false; }
      if (!insideBounds(map.getCenter())) {
        if (save) {
          map.setView([CENTER[1], CENTER[0]], MIN_ZOOM);
        } else {
        setStatus('Für diesen Bereich ist keine Offline-Karte gespeichert.', true);
        showMapMessage('Für diesen Bereich ist keine Offline-Karte gespeichert.', true);
        return false;
        }
      }
      try {
        if (map.hasLayer(onlineLayer)) map.removeLayer(onlineLayer);
        if (offlineLayer && map.hasLayer(offlineLayer)) map.removeLayer(offlineLayer);
        const source = new IndexedDbPmtilesSource(database, metadata);
        const archive = new pmtiles.PMTiles(source);
        const LayerClass = createLeafletMapLibreLayer(archive);
        offlineLayer = new LayerClass();
        offlineLayer.addTo(map);
        map.setMinZoom(10); map.setMaxZoom(15); map.setMaxBounds(BOUNDS);
        if (map.getZoom() < 10) map.setZoom(10);
        if (map.getZoom() > 15) map.setZoom(15);
        activeMode = 'offline';
        if (save) {
          localStorage.setItem('kajakBaseMap', 'offline');
          savePreferredMode('offline').catch(error => console.warn('Kartenmodus konnte nicht gespeichert werden:', error));
        }
        setStatus('Offline-Karte wird aus dem Gerätespeicher verwendet.');
        updatePanel();
        return true;
      } catch (error) {
        console.error('Offline-Karte konnte nicht aktiviert werden:', error);
        setStatus('Offline-Karte konnte nicht geöffnet werden.', true);
        return false;
      }
    }

    function activateOnline(save = true) {
      if (offlineLayer && map.hasLayer(offlineLayer)) map.removeLayer(offlineLayer);
      map.setMaxBounds(null); map.setMinZoom(originalMinZoom); map.setMaxZoom(originalMaxZoom);
      if (!map.hasLayer(onlineLayer) && navigator.onLine) onlineLayer.addTo(map);
      activeMode = 'online';
      if (save) {
        localStorage.setItem('kajakBaseMap', 'online');
        savePreferredMode('online').catch(error => console.warn('Kartenmodus konnte nicht gespeichert werden:', error));
      }
      setStatus(navigator.onLine ? 'Online-Karte aktiv.' : 'Keine Internetverbindung.');
      updatePanel();
    }

    async function storageIsSufficient() {
      if (!navigator.storage?.estimate) return true;
      const estimate = await navigator.storage.estimate();
      if (!Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) return true;
      return estimate.quota - estimate.usage >= EXPECTED_SIZE + STORAGE_RESERVE;
    }

    function mapUrl() {
      const url = new URL(MAP_URL, document.baseURI);
      if (url.origin !== location.origin) throw new Error('Offline-Karten-URL hat nicht denselben Ursprung');
      return url;
    }

    function updateDownloadProgress(received, total) {
      const percent = Math.min(100, Math.round(received / total * 100));
      setStatus(`Offline-Karte wird geladen … ${formatBytes(received)} / ${formatBytes(total)} · ${percent} %`);
    }

    function expectedChunkLength(index) {
      return Math.min(CHUNK_SIZE, EXPECTED_SIZE - index * CHUNK_SIZE);
    }

    async function inspectStoredChunks(revision) {
      const chunkCount = Math.ceil(EXPECTED_SIZE / CHUNK_SIZE);
      const complete = new Set();
      let storedBytes = 0;
      for (let index = 0; index < chunkCount; index++) {
        const record = await getChunk(database, revision, index);
        if (record?.data?.byteLength === expectedChunkLength(index)) {
          complete.add(index);
          storedBytes += record.data.byteLength;
        }
      }
      return { complete, storedBytes };
    }

    async function downloadRangeBlock(revision, index) {
      const chunkCount = Math.ceil(EXPECTED_SIZE / CHUNK_SIZE);
      const start = index * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, EXPECTED_SIZE) - 1;
      const expectedLength = end - start + 1;
      let lastError;
      for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
        let response;
        let receivedBytes = 0;
        let contentRange = null;
        try {
          response = await fetch(mapUrl(), {
            cache: 'no-store',
            headers: { Range: `bytes=${start}-${end}` }
          });
          contentRange = response.headers.get('Content-Range');
          if (response.status !== 206) throw new Error(`HTTP ${response.status} statt 206`);
          const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange || '');
          if (!match || Number(match[1]) !== start || Number(match[2]) !== end || Number(match[3]) !== EXPECTED_SIZE) {
            throw new Error(`Content-Range ungültig: ${contentRange || 'fehlt'}`);
          }
          const buffer = await response.arrayBuffer();
          receivedBytes = buffer.byteLength;
          if (receivedBytes !== expectedLength) throw new Error(`${receivedBytes} statt ${expectedLength} Bytes empfangen`);
          await putChunk(database, revision, index, buffer);
          return receivedBytes;
        } catch (error) {
          lastError = error;
          console.warn('Offline-Range-Block fehlgeschlagen:', {
            block: index + 1,
            blockCount: chunkCount,
            startByte: start,
            endByte: end,
            receivedBytes,
            attempt,
            httpStatus: response?.status ?? 0,
            contentRange,
            error: error?.message
          });
        }
      }
      const error = new Error(`Offline-Download fehlgeschlagen bei Block ${index + 1} von ${chunkCount}.`);
      error.cause = lastError;
      error.block = { index, start, end };
      throw error;
    }

    async function verifyDownloadedRevision(revision) {
      const expectedChunkCount = Math.ceil(EXPECTED_SIZE / CHUNK_SIZE);
      const storedChunkCount = await countRevisionChunks(database, revision);
      if (storedChunkCount !== expectedChunkCount) {
        throw new Error(`Chunk-Prüfung fehlgeschlagen: ${storedChunkCount} von ${expectedChunkCount}`);
      }
      let storedBytes = 0;
      for (let index = 0; index < expectedChunkCount; index++) {
        const chunk = await getChunk(database, revision, index);
        const expectedLength = expectedChunkLength(index);
        if (!chunk?.data || chunk.data.byteLength !== expectedLength) throw new Error(`Block ${index + 1} ist unvollständig`);
        storedBytes += chunk.data.byteLength;
      }
      if (storedBytes !== EXPECTED_SIZE) throw new Error(`Größenprüfung fehlgeschlagen: ${storedBytes} Bytes`);
      const first = await getChunk(database, revision, 0);
      const last = await getChunk(database, revision, expectedChunkCount - 1);
      if (!first?.data || !last?.data) throw new Error('Erster oder letzter Offline-Kartenblock fehlt');
      const expectedLastSize = EXPECTED_SIZE - (expectedChunkCount - 1) * CHUNK_SIZE;
      if (first.data.byteLength !== CHUNK_SIZE || last.data.byteLength !== expectedLastSize) {
        throw new Error('Gespeicherte Chunkgrößen sind ungültig');
      }
      const header = new Uint8Array(first.data, 0, 8);
      const magic = String.fromCharCode(...header.subarray(0, 7));
      if (magic !== 'PMTiles' || header[7] !== 3) throw new Error('PMTiles-v3-Header ist ungültig');
      return { storedBytes, chunkCount: storedChunkCount };
    }

    async function downloadMap() {
      if (downloadRunning) return;
      downloadRunning = true;
      updatePanel();
      const oldMetadata = metadata;
      let downloadMetadata;
      let revision;
      const progress = { received: 0, chunkIndex: 0 };
      let persistenceGranted = null;
      let phase = 'Speicherprüfung';
      try {
        if (!(await storageIsSufficient())) throw new Error('Nicht genügend Speicher für die Offline-Karte.');
        if (navigator.storage?.persist) {
          try { persistenceGranted = await navigator.storage.persist(); } catch (error) { console.warn('Persistenter Speicher nicht verfügbar:', error); }
        }
        downloadMetadata = await getDownloadMetadata(database);
        const compatible = downloadMetadata?.size === EXPECTED_SIZE && downloadMetadata?.chunkSize === CHUNK_SIZE;
        revision = compatible ? downloadMetadata.revision : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        if (downloadMetadata?.revision && !compatible) await deleteRevision(database, downloadMetadata.revision);
        if (!compatible) {
          downloadMetadata = { id: DOWNLOAD_ID, revision, size: EXPECTED_SIZE, chunkSize: CHUNK_SIZE, chunkCount: Math.ceil(EXPECTED_SIZE / CHUNK_SIZE), complete: false };
          await putMapRecord(database, downloadMetadata);
        }
        phase = 'Range-Download';
        const stored = await inspectStoredChunks(revision);
        progress.received = stored.storedBytes;
        progress.chunkIndex = stored.complete.size;
        updateDownloadProgress(progress.received, EXPECTED_SIZE);
        for (let index = 0; index < downloadMetadata.chunkCount; index++) {
          if (stored.complete.has(index)) continue;
          progress.received += await downloadRangeBlock(revision, index);
          progress.chunkIndex++;
          updateDownloadProgress(progress.received, EXPECTED_SIZE);
        }
        phase = 'Vollständigkeitsprüfung';
        const verified = await verifyDownloadedRevision(revision);
        const newMetadata = { id: MAP_ID, revision, size: verified.storedBytes, savedAt: new Date().toISOString(), chunkSize: CHUNK_SIZE, chunkCount: verified.chunkCount, complete: true, persistenceGranted, preferredMode: oldMetadata?.preferredMode || 'online', downloadMethod: 'range' };
        await commitDownloadedMap(database, newMetadata);
        metadata = newMetadata;
        if (oldMetadata?.revision && oldMetadata.revision !== revision) await deleteRevision(database, oldMetadata.revision);
        setStatus('✅ Offline verfügbar');
        showMapMessage('Spreewald-Karte ist jetzt offline verfügbar.');
      } catch (error) {
        console.error('Offline-Download fehlgeschlagen:', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          phase,
          receivedBytes: progress.received,
          storedChunks: progress.chunkIndex
        });
        metadata = oldMetadata;
        const errorName = error?.name || 'Fehler';
        const errorMessage = error?.message || 'Offline-Karte konnte nicht vollständig gespeichert werden.';
        setStatus(`Offline-Download fehlgeschlagen: ${errorName} – ${errorMessage}`, true);
        showMapMessage(errorMessage, true);
      } finally {
        downloadRunning = false;
        updatePanel();
      }
    }

    async function removeMap() {
      if (!metadata || !confirm('Offline-Karte Spreewald wirklich löschen?')) return;
      if (activeMode === 'offline') activateOnline();
      await deleteMap(database);
      metadata = undefined;
      setStatus('Offline-Daten wurden gelöscht.');
      updatePanel();
    }

    function buildPanel(container) {
      const openButton = document.createElement('button');
      openButton.type = 'button'; openButton.textContent = '⬇️ Offline-Karte'; openButton.setAttribute('aria-expanded', 'false');
      container.appendChild(openButton); mapModeButtons.offlineMap = openButton;
      const panel = document.createElement('section'); panel.className = 'offlineMapPanel'; panel.hidden = true;
      panel.innerHTML = '<strong>Offline-Karte</strong><div>Spreewald</div><small>Radius: ca. 30 km · Zoom: 10–15 · Download: ca. 32 MB</small>';
      const modeActions = document.createElement('div'); modeActions.className = 'offlineModeActions';
      const onlineMode = document.createElement('button'); onlineMode.type = 'button'; onlineMode.textContent = '🌐 Online-Karte';
      const offlineMode = document.createElement('button'); offlineMode.type = 'button'; offlineMode.textContent = '📴 Offline Spreewald';
      modeActions.append(onlineMode, offlineMode);
      const available = document.createElement('div'); available.className = 'offlineAvailable'; available.textContent = '✅ Offline verfügbar';
      const details = document.createElement('small'); details.className = 'offlineDetails';
      const status = document.createElement('div'); status.className = 'offlineStatus'; status.setAttribute('aria-live', 'polite');
      const download = document.createElement('button'); download.type = 'button'; download.textContent = '⬇️ Offline verfügbar machen';
      const actions = document.createElement('div'); actions.className = 'offlineDataActions';
      const update = document.createElement('button'); update.type = 'button'; update.textContent = '↻ Aktualisieren';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '🗑 Offline-Daten löschen';
      actions.append(update, remove); panel.append(modeActions, available, details, status, download, actions); container.appendChild(panel);
      Object.assign(elements, { openButton, panel, onlineMode, offlineMode, available, details, status, download, actions, update, remove });
      const onButton = (button, handler) => button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        handler();
      });
      onButton(openButton, () => { panel.hidden = !panel.hidden; openButton.setAttribute('aria-expanded', String(!panel.hidden)); });
      onButton(onlineMode, () => activateOnline());
      onButton(offlineMode, () => activateOffline());
      onButton(download, downloadMap);
      onButton(update, downloadMap);
      onButton(remove, removeMap);
    }

    async function init(container) {
      buildPanel(container);
      try {
        database = await openDatabase();
        metadata = await getMetadata(database);
        setStatus(metadata?.complete ? '✅ Offline verfügbar' : 'Noch nicht gespeichert.');
        updatePanel();
        if (metadata?.complete && (metadata.preferredMode === 'offline' || localStorage.getItem('kajakBaseMap') === 'offline')) {
          if (!insideBounds(map.getCenter())) map.setView([CENTER[1], CENTER[0]], MIN_ZOOM);
          await activateOffline(false);
        } else if (!navigator.onLine) {
          autoFallback();
        }
      } catch (error) {
        console.error('Offline-Speicher konnte nicht initialisiert werden:', error);
        setStatus('Offline-Speicher ist in diesem Browser nicht verfügbar.', true);
      }
    }

    async function autoFallback() {
      if (metadata?.complete && insideBounds(map.getCenter())) await activateOffline(false);
      else {
        if (map.hasLayer(onlineLayer)) map.removeLayer(onlineLayer);
        setStatus('Für diesen Bereich ist keine Offline-Karte gespeichert.', true);
        showMapMessage('Für diesen Bereich ist keine Offline-Karte gespeichert.', true);
      }
    }

    window.addEventListener('offline', autoFallback);
    window.addEventListener('online', () => { if (activeMode === 'online' && !map.hasLayer(onlineLayer)) onlineLayer.addTo(map); setStatus('Internetverbindung wieder verfügbar.'); });
    map.on('moveend', () => { if (!navigator.onLine && activeMode !== 'offline') autoFallback(); });

    return { init, activateOffline, activateOnline, getMetadata: () => metadata, getMode: () => activeMode };
  };
})();
