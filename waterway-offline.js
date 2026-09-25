(function () {
  'use strict';
  const BASE = 'https://raw.githubusercontent.com/Oliver19802/KajakTracker/waterway-data/';
  const COUNTRIES = { de: 'Deutschland', pl: 'Polen' };
  const done = tx => new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Speichern fehlgeschlagen'));
  });
  function validateManifest(m, country) {
    if (!m || m.schema !== 1 || m.country !== country || m.step !== 0.25 ||
        !/^[a-f0-9]{64}$/.test(m.version) || !Number.isFinite(Date.parse(m.generatedAt)) ||
        !Array.isArray(m.parts) || !m.parts.length || m.parts.length > 2000) throw new Error('Ungültiges Länderpaket');
    const cells = new Set();
    let bytes = 0;
    for (const p of m.parts) {
      if (!/^[a-f0-9]{64}$/.test(p.sha256) || p.file !== `${country}/${p.sha256}.json` ||
          !Number.isSafeInteger(p.bytes) || p.bytes < 1 || p.bytes > 32 * 1024 * 1024 ||
          !Array.isArray(p.cells) || !p.cells.length) throw new Error('Ungültiger Paketabschnitt');
      for (const key of p.cells) {
        if (!/^-?\d+:-?\d+$/.test(key) || cells.has(key)) throw new Error('Ungültiges Kachelverzeichnis');
        cells.add(key);
      }
      bytes += p.bytes;
    }
    if (bytes !== m.bytes || bytes > 1024 * 1024 * 1024) throw new Error('Ungültige Paketgröße');
    return m;
  }
  function validatePart(part, expected) {
    if (!part || !Array.isArray(part.tiles) || part.tiles.length !== expected.cells.length) throw new Error('Unvollständiger Paketabschnitt');
    const remaining = new Set(expected.cells);
    for (const tile of part.tiles) {
      if (!remaining.delete(tile.key) || !Array.isArray(tile.elements)) throw new Error('Ungültige Kachel');
      for (const way of tile.elements) {
        if (!way || typeof way.id !== 'string' || !way.tags || !Array.isArray(way.geometry) || way.geometry.length < 2 ||
            way.geometry.some(p => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) throw new Error('Ungültige Wasserweg-Geometrie');
      }
    }
    return part;
  }
  class OfflineWaterways {
    constructor(dbName = 'kajaktracker-country-waterways') {
      this.installed = []; this.busy = false; this.controller = null;
      this.ready = this.open(dbName).catch(error => { this.error = error; });
    }
    async open(name) {
      this.db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('countries', { keyPath: 'country' });
          r.result.createObjectStore('tiles', { keyPath: 'id' }).createIndex('revision', 'revision');
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(new Error('Offline-Speicher blockiert'));
      });
      this.db.onversionchange = () => { this.db.close(); this.error = new Error('Bitte Seite neu laden'); };
      await this.reload();
    }
    async reload() {
      const tx = this.db.transaction('countries', 'readonly');
      const complete = done(tx), r = tx.objectStore('countries').getAll();
      await complete; this.installed = r.result;
    }
    async fetchFile(url, signal) {
      const attempt = new AbortController();
      const abort = () => attempt.abort();
      if (signal.aborted) abort();
      signal.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 90000);
      try {
        const response = await fetch(url, { signal: attempt.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 404 ? 'Länderpaket wird noch vorbereitet' : `Downloadfehler (${response.status})`);
        return await response.arrayBuffer();
      } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
    }
    async removeRevision(revision) {
      if (!revision) return;
      const tx = this.db.transaction('tiles', 'readwrite'), complete = done(tx);
      const r = tx.objectStore('tiles').index('revision').openCursor(IDBKeyRange.only(revision));
      r.onsuccess = () => { const cursor = r.result; if (cursor) { cursor.delete(); cursor.continue(); } };
      await complete;
    }
    async download(country, progress) {
      await this.ready;
      if (this.error) throw this.error;
      if (!COUNTRIES[country] || this.busy) throw new Error('Ein Download läuft bereits');
      this.busy = true;
      this.controller = new AbortController();
      const signal = this.controller.signal;
      const revision = `${country}:${crypto.randomUUID()}`;
      let promoted = false;
      try {
        progress('Paketinformationen werden geladen …');
        const manifest = validateManifest(JSON.parse(new TextDecoder().decode(await this.fetchFile(`${BASE}${country}.json`, signal))), country);
        const old = this.installed.find(item => item.country === country);
        const space = await navigator.storage?.estimate?.();
        if (space?.quota && space.quota - (space.usage || 0) < manifest.bytes * 2 + 10 * 1024 * 1024) throw new Error('Nicht genügend Gerätespeicher für das neue Paket');
        let received = 0;
        for (const expected of manifest.parts) {
          const bytes = await this.fetchFile(BASE + expected.file, signal);
          if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
          if (bytes.byteLength !== expected.bytes) throw new Error('Unvollständiger Download');
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
          if (hash !== expected.sha256) throw new Error('Prüfsumme stimmt nicht');
          const part = validatePart(JSON.parse(new TextDecoder().decode(bytes)), expected);
          const tx = this.db.transaction('tiles', 'readwrite'), complete = done(tx);
          for (const tile of part.tiles) tx.objectStore('tiles').put({ ...tile, id: `${revision}:${tile.key}`, revision });
          await complete;
          received += bytes.byteLength;
          progress(`${COUNTRIES[country]}: ${Math.round(received / manifest.bytes * 100)} % · ${(manifest.bytes / 1024 / 1024).toFixed(1)} MB`);
        }
        if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
        const tx = this.db.transaction('countries', 'readwrite'), complete = done(tx);
        tx.objectStore('countries').put({ country, revision, version: manifest.version, generatedAt: manifest.generatedAt,
          sourceDate: manifest.sourceDate, bytes: manifest.bytes, cells: manifest.parts.flatMap(p => p.cells) });
        await complete; promoted = true;
        await this.reload();
        window.dispatchEvent(new Event('kajak:waterways-offline'));
        if (old) await this.removeRevision(old.revision).catch(console.warn);
        progress(`${COUNTRIES[country]} ist offline verfügbar`);
      } finally {
        if (!promoted) await this.removeRevision(revision).catch(console.warn);
        this.busy = false; this.controller = null;
      }
    }
    async query(bounds) {
      await this.ready;
      if (this.error) throw this.error;
      if (!this.installed.length) return null;
      const keys = [];
      const tx = this.db.transaction('tiles', 'readonly'), complete = done(tx);
      for (const pack of this.installed) {
        const cells = new Set(pack.cells);
        for (let y = Math.floor(bounds.getSouth() * 4); y <= Math.floor(bounds.getNorth() * 4); y++) {
          for (let x = Math.floor(bounds.getWest() * 4); x <= Math.floor(bounds.getEast() * 4); x++) {
            const key = `${y}:${x}`;
            if (cells.has(key)) keys.push(tx.objectStore('tiles').get(`${pack.revision}:${key}`));
          }
        }
      }
      await complete;
      const unique = new Map();
      for (const request of keys) {
        if (!request.result) throw new Error('Offline-Paket unvollständig. Bitte erneut herunterladen.');
        for (const way of request.result.elements) unique.set(way.id, way);
      }
      return { elements: [...unique.values()], label: this.installed.map(p => `${COUNTRIES[p.country]} (${new Date(p.sourceDate || p.generatedAt).toLocaleDateString('de-DE')})`).join(', ') };
    }
  }
  window.KajakOfflineWaterways = OfflineWaterways;
  window.KajakWaterwayPackageValidation = { validateManifest, validatePart };
  if (typeof map === 'undefined' || typeof L === 'undefined') return;
  const service = new OfflineWaterways();
  window.kajakOfflineWaterways = service;
  const control = L.control({ position: 'topright' });
  control.onAdd = () => {
    const box = L.DomUtil.create('details', 'waterwayPackages');
    box.style.cssText = 'background:white;color:#183f55;border-radius:10px;padding:8px;max-width:min(270px,calc(100vw - 90px));max-height:45vh;overflow:auto;margin-right:50px;font:12px/1.4 system-ui;box-shadow:0 1px 6px #0003';
    const summary = document.createElement('summary'); summary.textContent = 'Wasserwege offline'; box.append(summary);
    const info = document.createElement('p'); info.textContent = 'Einmal laden, danach ohne Nachladen nutzen. Hintergrundkarte separat speichern.'; box.append(info);
    const installed = document.createElement('p'); box.append(installed);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); box.append(status);
    const buttons = [];
    const update = () => {
      installed.textContent = service.installed.length ? service.installed.map(p => `${COUNTRIES[p.country]} · Stand ${new Date(p.sourceDate || p.generatedAt).toLocaleDateString('de-DE')}`).join(' / ') : 'Noch kein Länderpaket gespeichert';
      for (const [country, button] of buttons) { button.disabled = service.busy; button.textContent = `${COUNTRIES[country]} ${service.installed.some(p => p.country === country) ? 'aktualisieren' : 'herunterladen'}`; }
    };
    for (const country of Object.keys(COUNTRIES)) {
      const button = document.createElement('button'); button.type = 'button'; button.style.cssText = 'display:block;font:inherit;padding:7px;margin:4px 0;width:100%;min-height:34px';
      buttons.push([country, button]); box.append(button);
      button.onclick = async () => {
        if (!navigator.onLine) { status.textContent = 'Zum Herunterladen bitte Internet verbinden'; return; }
        buttons.forEach(([, b]) => { b.disabled = true; });
        cancel.hidden = false;
        try { await service.download(country, text => { status.textContent = text; }); }
        catch (error) { status.textContent = error.name === 'AbortError' ? 'Download abgebrochen; vorhandenes Paket bleibt erhalten' : error.message; }
        finally { cancel.hidden = true; update(); }
      };
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Download abbrechen'; cancel.hidden = true;
    cancel.onclick = () => service.controller?.abort(); box.append(cancel);
    const credit = document.createElement('a'); credit.href = 'https://www.openstreetmap.org/copyright'; credit.textContent = '© OpenStreetMap · ODbL · Geofabrik'; box.append(credit);
    L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box);
    service.ready.then(() => { update(); if (service.error) status.textContent = 'Offline-Speicher nicht verfügbar'; });
    update(); return box;
  };
  control.addTo(map);
})();
