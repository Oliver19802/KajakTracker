/* =========================================================
   KAJAKTRACKER – BEFAHRBARKEIT VON WASSERWEGEN
   Grün durchgezogen: befahrbar
   Rot gestrichelt: nicht befahrbar / gesperrt
   ========================================================= */

(function () {
  'use strict';

  if (typeof map === 'undefined' || typeof L === 'undefined') return;

  const MIN_ZOOM = 11;
  const RELOAD_DISTANCE_METERS = 6000;
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

    for (const url of OVERPASS_URLS) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          signal
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        lastError = error;
      }
    }

    throw lastError || new Error('Wasserwege konnten nicht geladen werden');
  }

  async function loadWaterways(force = false) {
    if (map.getZoom() < MIN_ZOOM) {
      layer.clearLayers();
      loadedBounds = null;
      return;
    }

    /* Bei einem kurzen Netzausfall bleiben bereits geladene Linien sichtbar. */
    if (!navigator.onLine) return;

    const visibleBounds = map.getBounds();
    if (!force && loadedBounds && loadedBounds.contains(visibleBounds)) return;

    if (controller) controller.abort();
    controller = new AbortController();
    const currentRequest = ++requestNumber;
    const requestBounds = visibleBounds.pad(0.45);
    const bbox = [
      requestBounds.getSouth(),
      requestBounds.getWest(),
      requestBounds.getNorth(),
      requestBounds.getEast()
    ].join(',');

    const query = `[out:json][timeout:35];
way["waterway"~"^(river|canal|stream|ditch)$"](${bbox});
out tags geom;`;

    try {
      const data = await requestOverpass(query, controller.signal);
      if (currentRequest !== requestNumber) return;

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
      loadedBounds = requestBounds;
      clearTimeout(retryTimer);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Wasserweg-Markierung fehlgeschlagen:', error);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => loadWaterways(true), 4000);
      }
    }
  }

  function scheduleLoad() {
    clearTimeout(timer);
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
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  legend.addTo(map);

  map.on('moveend zoomend', scheduleLoad);
  window.addEventListener('online', () => loadWaterways(true));
  scheduleLoad();
})();
