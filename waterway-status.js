/* =========================================================
   KAJAKTRACKER – BEFAHRBARKEIT VON WASSERWEGEN
   Blau durchgezogen: befahrbar
   Rot gestrichelt: nicht befahrbar / gesperrt
   ========================================================= */

(function () {
  'use strict';

  if (typeof map === 'undefined' || typeof L === 'undefined') return;

  const MIN_ZOOM = 11;
  const REQUEST_TIMEOUT_MS = 20000;
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const cachedAreas = [];
  const OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  if (!map.getPane('waterwayPane')) {
    map.createPane('waterwayPane');
  }
  map.getPane('waterwayPane').style.zIndex = '410';
  map.getPane('waterwayPane').style.pointerEvents = 'auto';

  const layer = L.layerGroup().addTo(map);
  let blockedWaterways = [];
  let loadedBounds = null;
  let timer = null;
  let retryTimer = null;
  let controller = null;
  let requestNumber = 0;
  let pendingBounds = null;
  let loadedAt = 0;
  let failures = 0;
  let statusElement = null;
  let preferredEndpoint = 0;
  let offlineView = 0;

  function setStatus(message) {
    if (statusElement) statusElement.textContent = message;
  }

  function cancelRequest() {
    ++requestNumber;
    if (controller) controller.abort();
    controller = null;
    pendingBounds = null;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function accessValue(tags) {
    return String(
      tags.canoe || tags.boat || tags.access || ''
    ).toLowerCase();
  }

  function isBlocked(tags) {
    const values = [
      tags.canoe,
      tags.boat,
      tags.access
    ].map(value => String(value || '').toLowerCase());

    return values.some(value =>
      value === 'no' ||
      value === 'private' ||
      value === 'customers'
    );
  }

  function isNavigable(tags) {
    if (isBlocked(tags)) return false;

    const allowed = ['yes', 'designated', 'permissive', 'official'];
    const canoe = String(tags.canoe || '').toLowerCase();
    const boat = String(tags.boat || '').toLowerCase();

    if (allowed.includes(canoe) || allowed.includes(boat)) return true;

    return tags.waterway === 'river' || tags.waterway === 'canal';
  }

  function waterwayWeight(tags) {
    const typeWeights = {
      river: 8,
      canal: 6,
      stream: 3,
      ditch: 2
    };
    let weight = typeWeights[tags.waterway] || 3;

    /* Wenn OpenStreetMap eine Breite in Metern enthält,
       wird sie zusätzlich für die Liniendicke berücksichtigt. */
    const widthText = String(tags.width || '').replace(',', '.');
    const widthMeters = Number.parseFloat(widthText);
    if (Number.isFinite(widthMeters)) {
      weight = Math.max(weight, Math.min(10, 2 + widthMeters / 4));
    }

    return weight;
  }

  function lineStyle(tags, navigable) {
    const weight = waterwayWeight(tags);

    return navigable
      ? {
          color: '#168bd2',
          weight,
          opacity: 0.9,
          pane: 'waterwayPane',
          renderer: waterwayRenderer
        }
      : {
          color: '#e32636',
          weight: Math.max(3, weight),
          opacity: 0.95,
          dashArray: weight >= 6 ? '14 10' : '9 8',
          lineCap: 'butt',
          pane: 'waterwayPane',
          renderer: waterwayRenderer
        };
  }

  function orientation(a, b, c) {
    return (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
  }

  function segmentsIntersect(a, b, c, d) {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    const epsilon = 1e-12;
    const onSegment = (start, point, end) =>
      point[0] >= Math.min(start[0], end[0]) - epsilon && point[0] <= Math.max(start[0], end[0]) + epsilon &&
      point[1] >= Math.min(start[1], end[1]) - epsilon && point[1] <= Math.max(start[1], end[1]) + epsilon;
    if (Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB)) return true;
    return (Math.abs(abC) <= epsilon && onSegment(a, c, b)) ||
      (Math.abs(abD) <= epsilon && onSegment(a, d, b)) ||
      (Math.abs(cdA) <= epsilon && onSegment(c, a, d)) ||
      (Math.abs(cdB) <= epsilon && onSegment(c, b, d));
  }

  function pointToSegmentMeters(point, start, end) {
    const origin = L.latLng(point);
    const scale = Math.cos(origin.lat * Math.PI / 180);
    const ax = (start[1] - origin.lng) * scale;
    const ay = start[0] - origin.lat;
    const bx = (end[1] - origin.lng) * scale;
    const by = end[0] - origin.lat;
    const length = (bx - ax) ** 2 + (by - ay) ** 2;
    const fraction = length ? Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / length)) : 0;
    return origin.distanceTo([start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction]);
  }

  window.kajakRouteUsesBlockedWaterway = function (routePoints) {
    if (!Array.isArray(routePoints) || routePoints.length < 2) return false;
    for (const blocked of blockedWaterways) {
      for (let routeIndex = 1; routeIndex < routePoints.length; routeIndex += 1) {
        const routeStart = routePoints[routeIndex - 1];
        const routeEnd = routePoints[routeIndex];
        for (let blockedIndex = 1; blockedIndex < blocked.length; blockedIndex += 1) {
          const blockedStart = blocked[blockedIndex - 1];
          const blockedEnd = blocked[blockedIndex];
          if (segmentsIntersect(routeStart, routeEnd, blockedStart, blockedEnd) ||
              pointToSegmentMeters(routeStart, blockedStart, blockedEnd) <= 20 ||
              pointToSegmentMeters(blockedStart, routeStart, routeEnd) <= 20) return true;
        }
      }
    }
    return false;
  };

  function popupText(tags, navigable) {
    const name = tags.name || 'Wasserweg';
    const status = navigable ? 'Befahrbar' : 'Nicht befahrbar / gesperrt';
    const access = accessValue(tags);

    return '<strong>' + escapeHtml(name) + '</strong><br>' +
      status +
      (access ? '<br>Zugang: ' + escapeHtml(access) : '') +
      '<br><small>Einstufung nach OpenStreetMap-Angaben. Beschilderung vor Ort beachten.</small>';
  }

  async function requestOverpass(query, signal) {
    let lastError = null;

    for (let offset = 0; offset < OVERPASS_URLS.length; offset += 1) {
      const endpointIndex = (preferredEndpoint + offset) % OVERPASS_URLS.length;
      const url = OVERPASS_URLS[endpointIndex];
      if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError');
      const attempt = new AbortController();
      const abortAttempt = () => attempt.abort();
      signal.addEventListener('abort', abortAttempt, { once: true });
      const timeout = setTimeout(abortAttempt, REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          signal: attempt.signal
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        // Overpass may return HTTP 200 with partial results and a runtime error.
        if (!data || data.remark || !Array.isArray(data.elements)) {
          throw new Error(data?.remark || 'Ungültige Wasserweg-Antwort');
        }
        preferredEndpoint = endpointIndex;
        return data;
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abortAttempt);
      }
    }

    throw lastError || new Error('Wasserwege konnten nicht geladen werden');
  }

  async function loadWaterways(force = false) {
    const view = ++offlineView;
    if (map.getZoom() < MIN_ZOOM) {
      cancelRequest();
      layer.clearLayers();
      blockedWaterways = [];
      loadedBounds = null;
      setStatus('Für Wasserwege näher heranzoomen');
      return;
    }

    if (window.kajakOfflineWaterways) {
      // Always consult the device before any online request, including retries.
      await window.kajakOfflineWaterways.ready;
      if (view !== offlineView) return;
      if (window.kajakOfflineWaterways.installed.length) {
        cancelRequest();
        try {
          const data = await window.kajakOfflineWaterways.query(map.getBounds());
          if (view !== offlineView) return;
          renderWaterways(data);
          loadedBounds = null;
          setStatus(data.elements.length ? `Offline · ${data.label}` : 'Keine gespeicherten Wasserwege in diesem Ausschnitt');
        } catch (error) {
          if (view === offlineView) setStatus('Offline-Paket nicht lesbar · bitte erneut herunterladen');
          console.error('Offline-Wasserwege:', error);
        }
        return;
      }
    }

    /* Bei einem kurzen Netzausfall bleiben bereits geladene Linien sichtbar. */
    const visibleBounds = map.getBounds();
    if (!force && loadedBounds && loadedBounds.contains(visibleBounds) &&
        Date.now() - loadedAt < CACHE_TTL_MS) {
      if (pendingBounds && !pendingBounds.contains(visibleBounds)) cancelRequest();
      setStatus(navigator.onLine ? 'Wasserwege geladen' : 'Offline · zuletzt geladene Wasserwege');
      return;
    }
    // A small pan within the running query must not restart that query.
    if (pendingBounds && pendingBounds.contains(visibleBounds)) return;

    cancelRequest();
    const cached = cachedAreas.find(entry => entry.bounds.contains(visibleBounds) &&
      (!navigator.onLine || Date.now() - entry.time < CACHE_TTL_MS));
    if (cached && !force) {
      renderWaterways(cached.data);
      loadedBounds = cached.bounds;
      loadedAt = cached.time;
      setStatus(navigator.onLine ? 'Wasserwege geladen' : 'Offline · zuletzt geladene Wasserwege');
      return;
    }
    if (!navigator.onLine) {
      setStatus('Offline · Wasserwege hier möglicherweise unvollständig');
      return;
    }
    controller = new AbortController();
    const signal = controller.signal;
    const currentRequest = ++requestNumber;
    // Modest prefetch margin: 0.45 almost quadrupled the visible query area.
    const requestBounds = visibleBounds.pad(0.15);
    pendingBounds = requestBounds;
    setStatus('Wasserwege werden geladen …');
    const bbox = [
      requestBounds.getSouth(),
      requestBounds.getWest(),
      requestBounds.getNorth(),
      requestBounds.getEast()
    ].join(',');

    const query = `[out:json][timeout:15];
way["waterway"~"^(river|canal|stream|ditch)$"](${bbox});
out tags geom;`;

    try {
      const data = await requestOverpass(query, signal);
      if (currentRequest !== requestNumber || signal.aborted) return;
      // Do not let a completed old viewport replace the current map.
      if (!requestBounds.contains(map.getBounds())) {
        scheduleLoad();
        return;
      }
      renderWaterways(data);
      loadedBounds = requestBounds;
      loadedAt = Date.now();
      cachedAreas.unshift({ bounds: requestBounds, data, time: loadedAt });
      cachedAreas.splice(6);
      failures = 0;
      setStatus('Wasserwege geladen');
    } catch (error) {
      if (currentRequest !== requestNumber || signal.aborted) return;
      console.error('Wasserweg-Markierung fehlgeschlagen:', error);
      setStatus('Laden fehlgeschlagen · erneuter Versuch folgt');
      const delay = Math.min(60000, 4000 * 2 ** Math.min(failures++, 4));
      retryTimer = setTimeout(() => { retryTimer = null; loadWaterways(true); }, delay);
    } finally {
      if (currentRequest === requestNumber) {
        controller = null;
        pendingBounds = null;
      }
    }
  }

  function renderWaterways(data) {
    const nextLayers = [];
    const nextBlockedWaterways = [];
    (data.elements || []).forEach(way => {
      if (!Array.isArray(way.geometry) || way.geometry.length < 2) return;

      const tags = way.tags || {};
      const navigable = isNavigable(tags);
      const explicitlyBlocked = isBlocked(tags);

      /* Kleine, nicht ausdrücklich freigegebene Bäche und Gräben
         werden nicht pauschal als befahrbar markiert. */
      if (!navigable && !explicitlyBlocked) return;

      if (way.geometry.some(point => !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon))) {
        throw new Error('Ungültige Wasserweg-Geometrie');
      }
      const latLngs = way.geometry.map(point => [point.lat, point.lon]);
      if (explicitlyBlocked) nextBlockedWaterways.push(latLngs);
      const polyline = L.polyline(latLngs, lineStyle(tags, navigable));
      polyline.bindPopup(popupText(tags, navigable));
      nextLayers.push(polyline);
    });

    /* Erst nach einem vollständigen Abruf austauschen. So entsteht
       beim Nachladen kein leerer oder nur teilweise geladener Zustand. */
    layer.clearLayers();
    nextLayers.forEach(item => item.addTo(layer));
    blockedWaterways = nextBlockedWaterways;
    if (typeof navigationRoute !== 'undefined' && navigationRoute &&
        typeof clearNavigation === 'function') {
      const activeRoutePoints = navigationRoute.getLatLngs().map(point => [point.lat, point.lng]);
      if (window.kajakRouteUsesBlockedWaterway(activeRoutePoints)) {
        clearNavigation();
        setNavigationMessage('Navigation beendet: Route führt über einen gesperrten Wasserweg.', true);
      }
    }
  }

  function scheduleLoad() {
    clearTimeout(timer);
    if (map.getZoom() < MIN_ZOOM) { loadWaterways(); return; }
    timer = setTimeout(() => loadWaterways(false), 650);
  }

  /* Leaflet bietet standardmäßig nur Ecken für Bedienelemente.
     Deshalb wird eine eigene Position unten mittig angelegt. */
  if (!map._controlCorners.bottomcenter) {
    const bottomCenter = L.DomUtil.create(
      'div',
      'leaflet-bottom leaflet-center',
      map._controlContainer
    );
    bottomCenter.style.left = '50%';
    bottomCenter.style.transform = 'translateX(-50%)';
    bottomCenter.style.pointerEvents = 'none';
    map._controlCorners.bottomcenter = bottomCenter;
  }

  const legend = L.control({ position: 'bottomcenter' });
  legend.onAdd = function () {
    const box = L.DomUtil.create('div', 'waterwayStatusLegend');
    box.style.cssText =
      'background:rgba(255,255,255,.94);padding:7px 9px;border-radius:8px;' +
      'box-shadow:0 1px 6px rgba(0,0,0,.25);font:12px/1.35 system-ui,sans-serif;color:#183f55;' +
      'pointer-events:auto;margin-bottom:10px;white-space:nowrap';
    box.innerHTML =
      '<div><span style="display:inline-block;width:24px;border-top:5px solid #168bd2;margin-right:6px;vertical-align:middle"></span>Befahrbar</div>' +
      '<div><span style="display:inline-block;width:24px;border-top:4px dashed #e32636;margin-right:6px;vertical-align:middle"></span>Nicht befahrbar</div>';
    statusElement = L.DomUtil.create('div', 'waterwayLoadStatus', box);
    statusElement.setAttribute('role', 'status');
    statusElement.style.cssText = 'font-size:11px;white-space:normal;max-width:240px;margin-top:3px';
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  legend.addTo(map);

  map.on('moveend zoomend', scheduleLoad);
  window.addEventListener('online', () => loadWaterways(true));
  window.addEventListener('offline', () => { cancelRequest(); loadWaterways(); });
  window.addEventListener('kajak:waterways-offline', () => { cancelRequest(); loadWaterways(); });
  scheduleLoad();
})();
