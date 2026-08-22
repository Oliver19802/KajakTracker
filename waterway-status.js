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

  if (!map.getPane('waterwayStatusPane')) {
    map.createPane('waterwayStatusPane');
  }
  map.getPane('waterwayStatusPane').style.zIndex = '425';
  map.getPane('waterwayStatusPane').style.pointerEvents = 'auto';

  const layer = L.layerGroup().addTo(map);
  let lastCenter = null;
  let timer = null;
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

  function lineStyle(navigable) {
    return navigable
      ? {
          color: '#13a85b',
          weight: 5,
          opacity: 0.85,
          pane: 'waterwayStatusPane'
        }
      : {
          color: '#e32636',
          weight: 5,
          opacity: 0.95,
          dashArray: '10 9',
          lineCap: 'butt',
          pane: 'waterwayStatusPane'
        };
  }

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

  async function loadWaterways() {
    if (!navigator.onLine || map.getZoom() < MIN_ZOOM) {
      layer.clearLayers();
      return;
    }

    const center = map.getCenter();
    if (lastCenter && lastCenter.distanceTo(center) < RELOAD_DISTANCE_METERS) return;

    if (controller) controller.abort();
    controller = new AbortController();
    const currentRequest = ++requestNumber;
    const bounds = map.getBounds().pad(0.25);
    const bbox = [
      bounds.getSouth(),
      bounds.getWest(),
      bounds.getNorth(),
      bounds.getEast()
    ].join(',');

    const query = `[out:json][timeout:25];
way["waterway"~"^(river|canal|stream|ditch)$"](${bbox});
out tags geom;`;

    try {
      const data = await requestOverpass(query, controller.signal);
      if (currentRequest !== requestNumber) return;

      const nextLayers = [];
      (data.elements || []).forEach(way => {
        if (!Array.isArray(way.geometry) || way.geometry.length < 2) return;

        const navigable = isNavigable(way.tags || {});
        const explicitlyBlocked = isBlocked(way.tags || {});

        /* Kleine, nicht ausdrücklich freigegebene Bäche und Gräben
           werden nicht pauschal als befahrbar markiert. */
        if (!navigable && !explicitlyBlocked) return;

        const latLngs = way.geometry.map(point => [point.lat, point.lon]);
        const polyline = L.polyline(latLngs, lineStyle(navigable));
        polyline.bindPopup(popupText(way.tags || {}, navigable));
        nextLayers.push(polyline);
      });

      layer.clearLayers();
      nextLayers.forEach(item => item.addTo(layer));
      lastCenter = center;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Wasserweg-Markierung fehlgeschlagen:', error);
      }
    }
  }

  function scheduleLoad() {
    clearTimeout(timer);
    timer = setTimeout(loadWaterways, 500);
  }

  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function () {
    const box = L.DomUtil.create('div', 'waterwayStatusLegend');
    box.style.cssText =
      'background:rgba(255,255,255,.94);padding:7px 9px;border-radius:8px;' +
      'box-shadow:0 1px 6px rgba(0,0,0,.25);font:12px/1.35 system-ui,sans-serif;color:#183f55';
    box.innerHTML =
      '<div><span style="display:inline-block;width:24px;border-top:4px solid #13a85b;margin-right:6px;vertical-align:middle"></span>Befahrbar</div>' +
      '<div><span style="display:inline-block;width:24px;border-top:4px dashed #e32636;margin-right:6px;vertical-align:middle"></span>Nicht befahrbar</div>';
    L.DomEvent.disableClickPropagation(box);
    return box;
  };
  legend.addTo(map);

  map.on('moveend zoomend', scheduleLoad);
  window.addEventListener('online', scheduleLoad);
  scheduleLoad();
})();