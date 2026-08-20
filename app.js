/* =========================================================
   KAJAKTRACKER
   GPS-Aufzeichnung + Fahrtenverwaltung
   ========================================================= */


/* =========================================================
   KARTE
   ========================================================= */

const map = L.map('map', {
  zoomControl: false
}).setView([52.5, 10.0], 8);

L.control.zoom({
  position: 'bottomright'
}).addTo(map);


/* OpenStreetMap */

const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,

    attribution:
      '&copy; OpenStreetMap contributors'
  }
);

if (navigator.onLine) osm.addTo(map);


/* OpenSeaMap */

const seamark = L.tileLayer(
  'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
  {
    maxZoom: 18,
    opacity: 0.9,

    attribution:
      'Seezeichen &copy; OpenSeaMap'
  }
);


/* =========================================================
   VARIABLEN
   ========================================================= */

let watchId = null;

let timerId = null;

let startedAt = null;

let pausedAt = null;

let accumulatedPause = 0;

let state = 'idle';

let lastPosition = null;

let track = [];

let totalDistance = 0;

let maxSpeed = 0;

let currentSpeed = 0;

let marker = null;

/* Marker einer ausgewählten, gespeicherten Fahrt. */
let tripMarkers = L.layerGroup().addTo(map);

let selectedTripId = null;

const TRIPS_STORAGE_KEY = 'kajakTrips';

const ACTIVE_TRIP_STORAGE_KEY = 'kajakActiveTrip';

/* Kompatibilität mit der bereits begonnenen Kartenmodus-Erweiterung. */
const MAP_MODE_STORAGE_KEY = 'kajakMapMode';

const MAP_OVERLAYS_STORAGE_KEY = 'kajakMapOverlays';

/* 50 km/h in m/s: darüber liegende Werte sind GPS-Ausreißer. */
const MAX_VALID_SPEED = 50 / 3.6;


/* Aktuelle Strecke */

let line = L.polyline(
  [],
  {
    color: '#147aa1',
    weight: 5
  }
).addTo(map);

const previousTracksLayer = L.layerGroup().addTo(map);
const navigationLayer = L.layerGroup().addTo(map);

map.createPane('hazardPane');
map.getPane('hazardPane').style.zIndex = 650;

const locksLayer = L.layerGroup().addTo(map);
const weirsLayer = L.layerGroup().addTo(map);
const searchLayer = L.layerGroup().addTo(map);
const restaurantsLayer = L.layerGroup().addTo(map);
const toiletsLayer = L.layerGroup().addTo(map);
const campingLayer = L.layerGroup().addTo(map);
const slipwaysLayer = L.layerGroup().addTo(map);

let previousTracksVisible = false;
let navigationEnabled = false;
let navigationTarget = null;
let navigationRoute = null;
let navigationControlElements = {};
let locksVisible = false;
let weirsVisible = false;
let hazardFeatures = [];
let searchControlElements = {};
let mapMenuElements = {};
let poiControlElements = {};
let lastSearchAt = 0;
let searchInFlight = false;
const searchResultCache = new Map();
const POI_STATE_KEY = 'kajakPoiVisibility';
const POI_MIN_ZOOM = 13;
const POI_REQUEST_TIMEOUT_MS = 45000;
const POI_RADIUS_METERS = 30000;
const POI_RELOAD_DISTANCE_METERS = 15000;
const POI_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const POI_DB_NAME = 'kajaktracker-pois';
const POI_DB_VERSION = 1;
const POI_STORE_NAME = 'areas';
const POI_CURRENT_AREA_KEY = 'current';
const POI_REGION_INDEX_URL = 'poi-data/regions.json';
const SPREEWALD_POI_URL = 'offline-test/data/spreewald-pois.json';
const SPREEWALD_POI_BOUNDS = L.latLngBounds(
  [51.5655066, 13.7128759],
  [52.1044933, 14.5851240]
);
const POI_TYPES = {
  lock: { label: 'Schleusen', icon: '🔒', layer: locksLayer, selectors: [['waterway', 'lock_gate'], ['waterway', 'lock'], ['lock', 'yes']] },
  weir: { label: 'Wehre', icon: '⚠️', layer: weirsLayer, selectors: [['waterway', 'weir']] },
  restaurant: { label: 'Gaststätten', icon: '🍽', layer: restaurantsLayer, selectors: [['amenity', 'restaurant|cafe|pub|biergarten|fast_food', true]], navigable: true },
  toilets: { label: 'Toiletten', icon: '🚻', layer: toiletsLayer, selectors: [['amenity', 'toilets']], navigable: true },
  camping: { label: 'Campingplätze', icon: '🏕', layer: campingLayer, selectors: [['tourism', 'camp_site|caravan_site', true]], navigable: true },
  slipway: { label: 'Slipways / Anlegestellen', icon: '🛶', layer: slipwaysLayer, selectors: [['leisure', 'slipway'], ['canoe', 'put_in|launch', true], ['waterway', 'access_point']], navigable: true }
};
let poiEnabled = loadPoiState();
let poiFeatures = [];
let loadedPoiCenter = null;
let loadedPoiRadius = 0;
let loadedPoiAt = 0;
let loadedPoiTypeKey = '';
let poiLoadTimer = null;
let poiAbortController = null;
let poiRestorePromise = null;
let poiLoadInFlight = false;
let loadedPoiSource = '';
let poiRegions = [];
let poiRegionsPromise = null;
let activePoiRegionIds = [];
const regionalPoiMemory = new Map();
const regionalPoiLoads = new Map();
let spreewaldPoiFeatures = [];
let spreewaldPoiPromise = null;
let wasInSpreewaldPoiArea = false;

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_MIN_INTERVAL_MS = 1000;
const NOMINATIM_CACHE_MAX_AGE_MS = 10 * 60 * 1000;


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

const $ = id =>
  document.getElementById(id);


/* =========================================================
   KARTENMODUS
   ========================================================= */

let mapModeButtons = {};

const offlineMapManager = window.createOfflineMapManager({
  map,
  onlineLayer: osm,
  mapModeButtons
});


function setMapMode(mode, save = true) {

  const selectedMode =
    mode === 'seamark'
      ? 'seamark'
      : 'map';


  if (selectedMode === 'seamark') {

    if (!map.hasLayer(seamark)) {

      seamark.addTo(map);
    }

  } else if (map.hasLayer(seamark)) {

    map.removeLayer(seamark);
  }


  Object.entries(mapModeButtons)
    .forEach(([buttonMode, button]) => {

      const isActive =
        buttonMode === selectedMode;


      button.classList.toggle(
        'isActive',
        isActive
      );

      button.setAttribute(
        'aria-pressed',
        String(isActive)
      );
    });


  if (save) {

    try {

      localStorage.setItem(
        MAP_MODE_STORAGE_KEY,
        selectedMode
      );

    } catch (e) {

      console.error(
        'Fehler beim Speichern des Kartenmodus:',
        e
      );
    }
  }
}


function savedMapMode() {

  try {

    return localStorage.getItem(
      MAP_MODE_STORAGE_KEY
    );

  } catch (e) {

    console.error(
      'Fehler beim Laden des Kartenmodus:',
      e
    );

    return 'map';
  }
}


function addMapModeControl() {

  const control =
    L.control({
      position: 'topright'
    });


  control.onAdd = () => {

    const container =
      L.DomUtil.create(
        'div',
        'mapModeControl'
      );


    const mapButton =
      document.createElement(
        'button'
      );

    mapButton.type = 'button';

    mapButton.textContent = '🗺 Karte';

    mapButton.setAttribute(
      'aria-label',
      'Straßenkarte anzeigen'
    );


    const seamarkButton =
      document.createElement(
        'button'
      );

    seamarkButton.type = 'button';

    seamarkButton.textContent = '⚓ Seekarte';

    seamarkButton.setAttribute(
      'aria-label',
      'Seekarte mit Seezeichen anzeigen'
    );


    mapModeButtons = {
      map: mapButton,
      seamark: seamarkButton
    };


    L.DomEvent.on(
      mapButton,
      'click',
      () => setMapMode('map')
    );

    L.DomEvent.on(
      seamarkButton,
      'click',
      () => setMapMode('seamark')
    );


    container.appendChild(
      mapButton
    );

    container.appendChild(
      seamarkButton
    );


    L.DomEvent.disableClickPropagation(
      container
    );

    L.DomEvent.disableScrollPropagation(
      container
    );

    return container;
  };


  control.addTo(map);
}


function saveMapOverlays() {
  try {
    localStorage.setItem(
      MAP_OVERLAYS_STORAGE_KEY,
      JSON.stringify({
        seamark: map.hasLayer(seamark),
        previousTracks: previousTracksVisible
      })
    );
  } catch (e) {
    console.error('Fehler beim Speichern der Kartenebenen:', e);
  }
}

function savedMapOverlays() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(MAP_OVERLAYS_STORAGE_KEY) || '{}'
    );
    return saved && typeof saved === 'object' ? saved : {};
  } catch (e) {
    console.error('Fehler beim Laden der Kartenebenen:', e);
    return {};
  }
}

function setToolButton(name, active) {
  const button = mapModeButtons[name];
  if (!button) return;
  button.classList.toggle('isActive', active);
  button.setAttribute('aria-pressed', String(active));
}

function toggleSeamark() {
  if (!navigator.onLine && !map.hasLayer(seamark)) {
    window.showMapMessage('OpenSeaMap benötigt eine Internetverbindung.', true);
    return;
  }
  if (map.hasLayer(seamark)) map.removeLayer(seamark);
  else seamark.addTo(map);
  setToolButton('seamark', map.hasLayer(seamark));
  saveMapOverlays();
}

function validTrackLatLngs(trip) {
  if (!trip || !Array.isArray(trip.track)) return [];
  return trip.track
    .filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)))
    .map(p => [Number(p.lat), Number(p.lon)]);
}

function refreshPreviousTracks() {
  previousTracksLayer.clearLayers();
  if (!previousTracksVisible) return;

  getTrips().forEach(trip => {
    const latLngs = validTrackLatLngs(trip);
    if (latLngs.length < 2) return;
    L.polyline(latLngs, {
      color: '#ffd400',
      weight: 5,
      opacity: 0.72,
      interactive: false
    }).addTo(previousTracksLayer);
  });
}

function togglePreviousTracks() {
  previousTracksVisible = !previousTracksVisible;
  setToolButton('previousTracks', previousTracksVisible);
  refreshPreviousTracks();
  saveMapOverlays();
}

function setNavigationMessage(message, isError = false) {
  const status = navigationControlElements.status;
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('isError', isError);
}

function clearNavigation() {
  navigationLayer.clearLayers();
  navigationTarget = null;
  navigationRoute = null;
  setNavigationMessage('Ziel auf der Karte antippen');
  if (navigationControlElements.start) {
    navigationControlElements.start.disabled = true;
    navigationControlElements.stop.hidden = true;
  }
}

function setNavigationEnabled(enabled) {
  navigationEnabled = enabled;
  setToolButton('navigation', enabled);
  if (!enabled) clearNavigation();
  if (navigationControlElements.panel) {
    navigationControlElements.panel.hidden = !enabled;
  }
}

function routeDistanceMeters(coordinates) {
  let distance = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    distance += L.latLng(coordinates[i - 1]).distanceTo(coordinates[i]);
  }
  return distance;
}

async function startWaterNavigation() {
  if (!navigator.onLine) {
    setNavigationMessage('Navigation benötigt eine Internetverbindung.', true);
    return;
  }
  if (!navigationTarget) return;

  const routeFrom = lastPosition || (marker && marker.getLatLng());
  if (!routeFrom) {
    setNavigationMessage('Aktueller Standort ist noch nicht verfügbar.', true);
    navigator.geolocation.getCurrentPosition(onPosition, onGeoError, {
      enableHighAccuracy: true
    });
    return;
  }

  const start = Array.isArray(routeFrom)
    ? { lat: routeFrom[0], lng: routeFrom[1] }
    : routeFrom;
  const params = new URLSearchParams({
    lonlats: `${start.lng},${start.lat}|${navigationTarget.lng},${navigationTarget.lat}`,
    profile: 'river',
    alternativeidx: '0',
    format: 'geojson'
  });

  setNavigationMessage('Wasserweg-Route wird berechnet …');
  navigationControlElements.start.disabled = true;

  try {
    /* Öffentlicher BRouter-Dienst mit dem Wasserwegprofil "river". */
    const response = await fetch(`https://brouter.de/brouter?${params}`);
    if (!response.ok) throw new Error(`Routing-HTTP ${response.status}`);

    const geojson = await response.json();
    const feature = geojson.type === 'FeatureCollection'
      ? geojson.features?.[0]
      : geojson;
    const geometry = feature?.geometry;
    if (!geometry || geometry.type !== 'LineString' || geometry.coordinates.length < 2) {
      throw new Error('Keine Wasserweg-Geometrie empfangen');
    }

    const latLngs = geometry.coordinates.map(c => [Number(c[1]), Number(c[0])]);
    if (latLngs.some(c => !Number.isFinite(c[0]) || !Number.isFinite(c[1]))) {
      throw new Error('Ungültige Routendaten');
    }

    navigationRoute = L.polyline(latLngs, {
      color: '#e52d27',
      weight: 6,
      opacity: 0.9,
      interactive: false
    }).addTo(navigationLayer);
    navigationRoute.bringToFront();

    const reportedDistance = Number(feature.properties?.['track-length']);
    const distance = Number.isFinite(reportedDistance)
      ? reportedDistance
      : routeDistanceMeters(latLngs);
    const routeHasWeir = warnAboutRouteWeirs(latLngs);
    setNavigationMessage(
      `Wasserweg-Route: ${fmtKm(distance)} km` +
      (routeHasWeir ? ' · Achtung: Wehr auf/nahe der Route' : ''),
      routeHasWeir
    );
    navigationControlElements.stop.hidden = false;
    map.fitBounds(navigationRoute.getBounds(), { padding: [30, 30] });
  } catch (error) {
    console.error('Wasserweg-Routing fehlgeschlagen:', error);
    setNavigationMessage(
      'Keine Wasserweg-Route gefunden. Kein Straßenrouting als Ersatz.',
      true
    );
  } finally {
    navigationControlElements.start.disabled = !navigationTarget;
  }
}

function chooseNavigationTarget(event) {
  if (!navigationEnabled) return;
  navigationLayer.clearLayers();
  navigationRoute = null;
  navigationTarget = event.latlng;
  L.marker(navigationTarget)
    .addTo(navigationLayer)
    .bindPopup('Navigationsziel')
    .openPopup();
  navigationControlElements.start.disabled = false;
  navigationControlElements.stop.hidden = true;
  setNavigationMessage('Ziel gewählt');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadPoiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(POI_STATE_KEY) || '{}');
    return Object.fromEntries(Object.keys(POI_TYPES).map(type => [type, saved[type] === true]));
  } catch (error) {
    return Object.fromEntries(Object.keys(POI_TYPES).map(type => [type, false]));
  }
}

function savePoiState() {
  localStorage.setItem(POI_STATE_KEY, JSON.stringify(poiEnabled));
}

function openPoiDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(POI_DB_NAME, POI_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(POI_STORE_NAME)) {
        database.createObjectStore(POI_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('POI-IndexedDB konnte nicht geöffnet werden'));
  });
}

async function readStoredPoiRecord(id) {
  const database = await openPoiDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(POI_STORE_NAME, 'readonly');
      const request = transaction.objectStore(POI_STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function readStoredPoiArea() {
  return readStoredPoiRecord(POI_CURRENT_AREA_KEY);
}

async function storePoiRecord(record) {
  const database = await openPoiDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(POI_STORE_NAME, 'readwrite');
      transaction.objectStore(POI_STORE_NAME).put(record);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function storePoiArea() {
  const record = {
    id: POI_CURRENT_AREA_KEY,
    center: { lat: loadedPoiCenter.lat, lng: loadedPoiCenter.lng },
    radius: loadedPoiRadius,
    timestamp: loadedPoiAt,
    types: loadedPoiTypeKey ? loadedPoiTypeKey.split(',') : [],
    pois: poiFeatures.map(feature => ({
      kind: feature.kind,
      lat: feature.latLng.lat,
      lon: feature.latLng.lng,
      tags: feature.tags
    }))
  };
  await storePoiRecord(record);
}

function storedPoiFeatures(pois) {
  const offlineTypeNames = {
    locks: 'lock',
    weirs: 'weir',
    restaurants: 'restaurant',
    toilets: 'toilets',
    camping: 'camping',
    slipways: 'slipway'
  };
  return (Array.isArray(pois) ? pois : []).flatMap(poi => {
    const kind = poi.kind || offlineTypeNames[poi.type] || poi.type;
    const lat = Number(poi.lat);
    const lon = Number(poi.lon ?? poi.lng);
    if (!POI_TYPES[kind] || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const tags = { ...(poi.tags || {}) };
    ['name', 'opening_hours', 'website', 'phone', 'operator', 'access', 'fee'].forEach(field => {
      if (poi[field] && !tags[field]) tags[field] = poi[field];
    });
    return [{ kind, latLng: L.latLng(lat, lon), tags }];
  });
}

function pointInPoiRing(point, coordinates) {
  let inside = false;
  for (let index = 0, previous = coordinates.length - 1; index < coordinates.length;
      previous = index++) {
    const [x1, y1] = coordinates[index];
    const [x2, y2] = coordinates[previous];
    if ((y1 > point.lat) !== (y2 > point.lat) &&
        point.lng < (x2 - x1) * (point.lat - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function poiRegionContains(region, point) {
  const latLng = L.latLng(point);
  const [west, south, east, north] = region.bbox;
  if (latLng.lng < west || latLng.lng > east || latLng.lat < south || latLng.lat > north) return false;
  const inOuterRing = region.rings.some(ring => !ring.hole && pointInPoiRing(latLng, ring.coordinates));
  const inHole = region.rings.some(ring => ring.hole && pointInPoiRing(latLng, ring.coordinates));
  return inOuterRing && !inHole;
}

function poiRegionBoundaryDistanceSquared(region, point) {
  const latLng = L.latLng(point);
  const longitudeScale = Math.cos(latLng.lat * Math.PI / 180);
  let minimum = Infinity;
  region.rings.forEach(ring => {
    const coordinates = ring.coordinates;
    for (let index = 0, previous = coordinates.length - 1; index < coordinates.length;
        previous = index++) {
      const [startLng, startLat] = coordinates[previous];
      const [endLng, endLat] = coordinates[index];
      const vectorLng = (endLng - startLng) * longitudeScale;
      const vectorLat = endLat - startLat;
      const pointLng = (latLng.lng - startLng) * longitudeScale;
      const pointLat = latLng.lat - startLat;
      const lengthSquared = vectorLng * vectorLng + vectorLat * vectorLat;
      const position = lengthSquared ? Math.max(0, Math.min(1,
        (pointLng * vectorLng + pointLat * vectorLat) / lengthSquared)) : 0;
      const deltaLng = pointLng - position * vectorLng;
      const deltaLat = pointLat - position * vectorLat;
      minimum = Math.min(minimum, deltaLng * deltaLng + deltaLat * deltaLat);
    }
  });
  return minimum;
}

function poiRegionAt(point) {
  if (!point) return null;
  const candidates = poiRegions.filter(region => poiRegionContains(region, point));
  if (candidates.length < 2) return candidates[0] || null;
  return candidates.sort((left, right) =>
    poiRegionBoundaryDistanceSquared(right, point) - poiRegionBoundaryDistanceSquared(left, point))[0];
}

function visiblePoiRegions() {
  if (map.getZoom() < POI_MIN_ZOOM) return [];
  const bounds = map.getBounds().pad(0.05);
  const samples = [bounds.getNorthWest(), bounds.getNorthEast(), bounds.getSouthWest(),
    bounds.getSouthEast(), bounds.getCenter()];
  return poiRegions.filter(region => {
    const [west, south, east, north] = region.bbox;
    if (east < bounds.getWest() || west > bounds.getEast() || north < bounds.getSouth() ||
        south > bounds.getNorth()) return false;
    if (samples.some(point => poiRegionContains(region, point))) return true;
    return region.rings.some(ring => !ring.hole && ring.coordinates.some(([lng, lat]) =>
      bounds.contains([lat, lng])));
  });
}

function currentPoiRegion() {
  const center = map.getCenter();
  const centerRegion = poiRegionAt(center);
  if (centerRegion) return centerRegion;
  if (!lastPosition || center.distanceTo(L.latLng(lastPosition)) > POI_RADIUS_METERS) return null;
  return poiRegionAt(lastPosition);
}

async function loadPoiRegions() {
  try {
    const response = await fetch(POI_REGION_INDEX_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    poiRegions = (data.regions || []).filter(region => region.id && region.package && region.version);
    return true;
  } catch (error) {
    console.error('POI-Regionsgrenzen konnten nicht geladen werden:', error);
    return false;
  }
}

function storedRegionalPois(features) {
  return features.map(feature => ({
    kind: feature.kind,
    lat: feature.latLng.lat,
    lon: feature.latLng.lng,
    tags: feature.tags
  }));
}

async function parseRegionalPoiResponse(response) {
  const compressed = await response.arrayBuffer();
  const bytes = new Uint8Array(compressed);
  if (bytes[0] === 0x5b || bytes[0] === 0x7b) {
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  if (typeof DecompressionStream !== 'function') {
    throw new Error('GZIP wird von diesem Browser nicht unterstützt');
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

async function loadRegionalPoiFeatures(region) {
  if (regionalPoiMemory.has(region.id)) return regionalPoiMemory.get(region.id);
  if (regionalPoiLoads.has(region.id)) return regionalPoiLoads.get(region.id);
  const loading = (async () => {
    const key = `region:${region.id}`;
    const stored = await readStoredPoiRecord(key);
    if (stored?.version === region.version && Array.isArray(stored.pois)) {
      const features = storedPoiFeatures(stored.pois);
      regionalPoiMemory.set(region.id, features);
      return features;
    }
    if (!navigator.onLine) throw new Error(`${region.label}-POIs wurden noch nicht heruntergeladen`);
    setPoiMessage(`${region.label}-POIs werden einmalig geladen …`);
    const response = await fetch(region.package);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const features = storedPoiFeatures(await parseRegionalPoiResponse(response));
    await storePoiRecord({
      id: key,
      regionId: region.id,
      version: region.version,
      timestamp: Date.now(),
      pois: storedRegionalPois(features)
    });
    regionalPoiMemory.set(region.id, features);
    return features;
  })();
  regionalPoiLoads.set(region.id, loading);
  try {
    return await loading;
  } finally {
    regionalPoiLoads.delete(region.id);
  }
}

function setRegionalPoiLoadedMessage(primaryRegion, regionCount) {
  const neighbors = regionCount - 1;
  setPoiMessage(neighbors ? `${primaryRegion.label}-POIs und ${neighbors} Nachbarregion${neighbors > 1 ? 'en' : ''} lokal geladen.` :
    `${primaryRegion.label}-POIs lokal geladen.`);
}

async function activateRegionalPois() {
  await poiRegionsPromise;
  const primaryRegion = currentPoiRegion();
  if (!primaryRegion) {
    activePoiRegionIds = [];
    return false;
  }
  const regions = [primaryRegion, ...visiblePoiRegions()]
    .filter((region, index, all) => all.findIndex(candidate => candidate.id === region.id) === index);
  activePoiRegionIds = regions.map(region => region.id);
  if (!activePoiTypes().length) return true;
  const intendedSource = `regions:${regions.map(region => region.id).sort().join(',')}`;
  if (loadedPoiSource === intendedSource && regions.every(region => regionalPoiMemory.has(region.id))) {
    updatePoiLayerContents();
    updatePoiLayerVisibility();
    setRegionalPoiLoadedMessage(primaryRegion, regions.length);
    return true;
  }
  const results = await Promise.allSettled(regions.map(region => loadRegionalPoiFeatures(region)));
  if (currentPoiRegion()?.id !== primaryRegion.id) return true;
  const primaryResult = results[0];
  if (primaryResult.status === 'rejected') {
    if (primaryRegion.id === 'brandenburg' && inSpreewaldPoiArea() && await activateSpreewaldPois()) {
      setPoiMessage('Spreewald-POIs als Fallback geladen.');
      return true;
    }
    console.error(`${primaryRegion.label}-POIs konnten nicht geladen werden:`, primaryResult.reason);
    setPoiMessage(`${primaryRegion.label}-POIs sind offline noch nicht gespeichert.`, true);
    return true;
  }
  const loadedRegions = regions.filter((region, index) => results[index].status === 'fulfilled');
  results.forEach((result, index) => {
    if (result.status === 'rejected' && index > 0) {
      console.warn(`${regions[index].label}-POIs der Nachbarregion konnten nicht geladen werden:`, result.reason);
    }
  });
  const seen = new Set();
  const features = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
    .filter(feature => {
      const key = `${feature.kind}:${feature.latLng.lat.toFixed(6)}:${feature.latLng.lng.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const source = `regions:${loadedRegions.map(region => region.id).sort().join(',')}`;
  if (loadedPoiSource !== source) {
    const [west, south, east, north] = primaryRegion.bbox;
    applyPoiDataset(features, [(south + north) / 2, (west + east) / 2], 0,
        Date.now(), Object.keys(POI_TYPES), source);
  } else {
    updatePoiLayerContents();
    updatePoiLayerVisibility();
  }
  setRegionalPoiLoadedMessage(primaryRegion, loadedRegions.length);
  return true;
}

function inSpreewaldPoiArea() {
  const gpsInside = lastPosition && SPREEWALD_POI_BOUNDS.contains(L.latLng(lastPosition));
  return Boolean(gpsInside || SPREEWALD_POI_BOUNDS.contains(map.getCenter()));
}

async function loadSpreewaldPois() {
  try {
    const response = await fetch(SPREEWALD_POI_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pois = await response.json();
    spreewaldPoiFeatures = storedPoiFeatures(pois);
    return true;
  } catch (error) {
    console.error('Lokale Spreewald-POIs konnten nicht geladen werden:', error);
    return false;
  }
}

async function activateSpreewaldPois() {
  await spreewaldPoiPromise;
  if (!inSpreewaldPoiArea()) return false;
  if (!spreewaldPoiFeatures.length) {
    setPoiMessage('Lokale Spreewald-POIs sind nicht verfügbar.', true);
    return true;
  }
  if (loadedPoiSource !== 'spreewald') {
    applyPoiDataset(spreewaldPoiFeatures, SPREEWALD_POI_BOUNDS.getCenter(), POI_RADIUS_METERS,
      Date.now(), Object.keys(POI_TYPES), 'spreewald');
  } else {
    updatePoiLayerContents();
    updatePoiLayerVisibility();
  }
  setPoiMessage('Lokale Spreewald-POIs geladen.');
  return true;
}

function poiLatLng(element) {
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return L.latLng(lat, lon);
  const coordinates = elementGeometries(element).flat();
  if (!coordinates.length) return null;
  const latitudes = coordinates.map(coordinate => Number(coordinate.lat)).filter(Number.isFinite);
  const longitudes = coordinates.map(coordinate => Number(coordinate.lon)).filter(Number.isFinite);
  if (!latitudes.length || !longitudes.length) return null;
  return L.latLng(
    (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  );
}

function poiKind(element) {
  const tags = element.tags || {};
  if (tags.waterway === 'weir') return 'weir';
  if (tags.waterway === 'lock_gate' || tags.waterway === 'lock' || tags.lock === 'yes') {
    return 'lock';
  }
  if (/^(restaurant|cafe|pub|biergarten|fast_food)$/.test(tags.amenity || '')) return 'restaurant';
  if (tags.amenity === 'toilets') return 'toilets';
  if (/^(camp_site|caravan_site)$/.test(tags.tourism || '')) return 'camping';
  if (tags.leisure === 'slipway' || /^(put_in|launch)$/.test(tags.canoe || '') ||
      tags.waterway === 'access_point') return 'slipway';
  return null;
}

function poiTypeName(feature) {
  const tags = feature.tags;
  if (feature.kind === 'restaurant') return restaurantType(tags);
  if (feature.kind === 'camping') return tags.tourism === 'caravan_site' ? 'Wohnmobilstellplatz' : 'Campingplatz';
  if (feature.kind === 'slipway') return tags.leisure === 'slipway' ? 'Slipway' : 'Einsetz-/Anlegestelle';
  return { lock: 'Schleuse', weir: 'Wehr', toilets: 'Toilette' }[feature.kind] || POI_TYPES[feature.kind].label;
}

function safeWebsite(value) {
  try {
    const url = new URL(value || '');
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (error) {
    return '';
  }
}

function poiPopup(feature) {
  const tags = feature.tags;
  const type = poiTypeName(feature);
  const title = tags.name || tags.lock_name || type;
  const address = [tags['addr:street'], tags['addr:housenumber'], tags['addr:postcode'],
    tags['addr:city']].filter(Boolean).join(' ');
  const details = [
    `Typ: ${type}`,
    address && `Adresse: ${address}`,
    tags.operator && `Betreiber: ${tags.operator}`,
    tags.opening_hours && `Öffnungszeiten: ${tags.opening_hours}`,
    (tags.phone || tags['contact:phone']) && `Telefon: ${tags.phone || tags['contact:phone']}`,
    tags.description && `Beschreibung: ${tags.description}`,
    tags.fee && `Gebühr: ${tags.fee}`,
    tags.access && `Zugang: ${tags.access}`,
    tags.canoe && `Kanu-Zugang: ${tags.canoe}`
  ].filter(Boolean);
  const website = safeWebsite(tags.website || tags['contact:website']);
  const navigation = POI_TYPES[feature.kind].navigable
    ? '<br><button type="button" class="navigatePoiBtn">🧭 Dorthin navigieren</button>'
    : '';
  return `<strong>${escapeHtml(title)}</strong>${details.length
    ? `<br>${details.map(escapeHtml).join('<br>')}`
    : ''}${website ? `<br><a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}` +
    `${navigation}<br><small>Daten: OpenStreetMap-Mitwirkende</small>`;
}

function navigateToPoi(feature) {
  setNavigationEnabled(true);
  navigationLayer.clearLayers();
  navigationTarget = feature.latLng;
  L.marker(navigationTarget).addTo(navigationLayer).bindPopup('Navigationsziel');
  navigationControlElements.start.disabled = false;
  navigationControlElements.stop.hidden = true;
  setNavigationMessage(`${poiTypeName(feature)} als Ziel gewählt`);
  startWaterNavigation();
}

function createPoiMarker(feature) {
  if (feature.marker) return feature.marker;
  const config = POI_TYPES[feature.kind];
  const icon = L.divIcon({
    className: 'poiIconWrapper',
    html: `<span class="poiIcon poiIcon-${feature.kind}" aria-hidden="true">${config.icon}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
  feature.marker = L.marker(feature.latLng, { icon, pane: 'hazardPane' }).bindPopup(poiPopup(feature));
  if (config.navigable) feature.marker.on('popupopen', event => {
    const button = event.popup.getElement()?.querySelector('.navigatePoiBtn');
    if (button) button.onclick = () => navigateToPoi(feature);
  });
  return feature.marker;
}

function rebuildPoiLayers(features = poiFeatures) {
  Object.values(POI_TYPES).forEach(config => config.layer.clearLayers());
  updatePoiLayerContents();
  updatePoiLayerVisibility();
}

function updatePoiLayerContents() {
  if (map.getZoom() < POI_MIN_ZOOM) return;
  const visibleBounds = map.getBounds().pad(0.05);
  Object.entries(POI_TYPES).forEach(([kind, config]) => {
    const visibleFeatures = poiFeatures
      .filter(feature => feature.kind === kind && visibleBounds.contains(feature.latLng))
      .sort((a, b) => a.latLng.distanceTo(map.getCenter()) - b.latLng.distanceTo(map.getCenter()))
      .slice(0, 100);
    const visibleMarkers = new Set(visibleFeatures.map(createPoiMarker));
    config.layer.eachLayer(marker => {
      if (!visibleMarkers.has(marker)) config.layer.removeLayer(marker);
    });
    visibleMarkers.forEach(marker => {
      if (!config.layer.hasLayer(marker)) config.layer.addLayer(marker);
    });
  });
}

function updatePoiLayerVisibility() {
  Object.entries(POI_TYPES).forEach(([kind, config]) => {
    const shouldShow = poiEnabled[kind] && map.getZoom() >= POI_MIN_ZOOM;
    if (shouldShow && !map.hasLayer(config.layer)) config.layer.addTo(map);
    if (!shouldShow && map.hasLayer(config.layer)) map.removeLayer(config.layer);
  });
}

function setPoiMessage(message, isError = false) {
  const status = poiControlElements.status;
  if (!status) return;
  status.hidden = !Object.values(poiEnabled).some(Boolean);
  status.textContent = message;
  status.classList.toggle('isError', isError);
}

function activePoiTypes() {
  return Object.keys(POI_TYPES).filter(type => poiEnabled[type]);
}

function poiOverpassQuery(types, center) {
  const area = `around:${POI_RADIUS_METERS},${center.lat.toFixed(6)},${center.lng.toFixed(6)}`;
  const clauses = types.flatMap(type => POI_TYPES[type].selectors.map(([key, value, regex]) =>
    `nwr["${key}"${regex ? '~' : '='}"${regex ? `^(${value})$` : value}"](${area});`
  ));
  return `[out:json][timeout:45][maxsize:67108864];(${clauses.join('')});out body geom center qt;`;
}

async function fetchPoiOverpass(query) {
  let lastError;
  for (const url of OVERPASS_URLS) {
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    poiAbortController.signal.addEventListener('abort', abortAttempt, { once: true });
    const timeoutId = setTimeout(abortAttempt, POI_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: attemptController.signal });
      if (response.ok) return response.json();
      lastError = new Error(`Overpass-HTTP ${response.status}`);
    } catch (error) {
      if (poiAbortController.signal.aborted) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
      poiAbortController.signal.removeEventListener('abort', abortAttempt);
    }
  }
  throw lastError || new Error('Keine Overpass-Instanz erreichbar');
}

function applyPoiDataset(features, center, radius, timestamp, types, source = 'overpass') {
  poiFeatures = features;
  hazardFeatures = features.filter(feature => feature.kind === 'lock' || feature.kind === 'weir');
  loadedPoiCenter = L.latLng(center);
  loadedPoiRadius = radius;
  loadedPoiAt = timestamp;
  loadedPoiTypeKey = [...types].sort().join(',');
  loadedPoiSource = source;
  rebuildPoiLayers(features);
  return source;
}

async function restorePoisFromIndexedDb() {
  try {
    const stored = await readStoredPoiArea();
    if (!stored?.center || !stored?.timestamp) return false;
    applyPoiDataset(storedPoiFeatures(stored.pois), stored.center,
      Number(stored.radius) || POI_RADIUS_METERS, Number(stored.timestamp), stored.types || [], 'indexeddb');
    if (activePoiTypes().length) setPoiMessage('Gespeicherte POIs geladen.');
    return true;
  } catch (error) {
    console.warn('Gespeicherte POIs konnten nicht geladen werden:', error);
    return false;
  }
}

async function applyOfflinePois(pois, metadata = {}) {
  const features = storedPoiFeatures(pois);
  const types = [...new Set(features.map(feature => feature.kind))];
  const center = metadata.center || poiLoadCenter();
  const timestamp = Date.parse(metadata.generatedAt) || Date.now();
  applyPoiDataset(features, center, Number(metadata.radiusKm) * 1000 || POI_RADIUS_METERS,
    timestamp, types, 'offline-file');
  await storePoiArea();
  if (activePoiTypes().length) setPoiMessage('Offline-POIs geladen.');
}

window.loadKajakTrackerOfflinePois = applyOfflinePois;
window.addEventListener('kajaktracker:offline-pois', event => {
  applyOfflinePois(event.detail?.pois, event.detail?.metadata).catch(error =>
    console.error('Offline-POIs konnten nicht übernommen werden:', error));
});

function poiLoadCenter() {
  return lastPosition ? L.latLng(lastPosition[0], lastPosition[1]) : map.getCenter();
}

async function loadPois(forceRefresh = false) {
  await poiRestorePromise;
  if (await activateRegionalPois()) return;
  if (await activateSpreewaldPois()) return;
  if (poiLoadInFlight && !forceRefresh) return;
  const types = activePoiTypes();
  if (!types.length) {
    poiAbortController?.abort();
    updatePoiLayerVisibility();
    return;
  }
  const center = poiLoadCenter();
  const loadedTypes = new Set(loadedPoiTypeKey ? loadedPoiTypeKey.split(',') : []);
  const missingTypes = types.filter(type => !loadedTypes.has(type));
  const cacheIsFresh = Date.now() - loadedPoiAt <= POI_CACHE_MAX_AGE_MS;
  const gpsMovedTooFar = Boolean(lastPosition && loadedPoiCenter &&
    loadedPoiCenter.distanceTo(L.latLng(lastPosition[0], lastPosition[1])) > POI_RELOAD_DISTANCE_METERS);
  const fixedLocalSource = loadedPoiSource === 'spreewald' || loadedPoiSource.startsWith('regions:');
  if (!forceRefresh && !fixedLocalSource && cacheIsFresh && loadedPoiCenter &&
      !gpsMovedTooFar && !missingTypes.length) {
    updatePoiLayerVisibility();
    return;
  }
  if (!navigator.onLine) {
    updatePoiLayerVisibility();
    setPoiMessage(poiFeatures.length ? 'Gespeicherte POIs werden offline verwendet.' :
      'POIs benötigen für die erste Abfrage eine Internetverbindung.', !poiFeatures.length);
    return;
  }
  const refreshArea = forceRefresh || fixedLocalSource || !cacheIsFresh ||
    !loadedPoiCenter || gpsMovedTooFar;
  const requestedTypes = refreshArea ? types : missingTypes;
  poiAbortController?.abort();
  poiAbortController = new AbortController();
  poiLoadInFlight = true;
  setPoiMessage('POIs werden für 30 km geladen …');
  try {
    const requestCenter = refreshArea ? center : loadedPoiCenter;
    const data = await fetchPoiOverpass(poiOverpassQuery(requestedTypes, requestCenter));
    const seen = new Set();
    const downloadedFeatures = (data.elements || []).flatMap(element => {
      const kind = poiKind(element);
      const latLng = poiLatLng(element);
      const key = `${element.type}/${element.id}`;
      if (!kind || !requestedTypes.includes(kind) || !latLng || seen.has(key)) return [];
      seen.add(key);
      return [{ kind, latLng, tags: element.tags || {} }];
    });
    const combined = refreshArea ? downloadedFeatures : poiFeatures.concat(downloadedFeatures);
    const features = combined.filter((feature, index, all) => !all.slice(0, index)
      .some(other => other.kind === feature.kind && other.latLng.distanceTo(feature.latLng) < 20));
    const storedTypes = refreshArea ? requestedTypes : [...new Set([...loadedTypes, ...requestedTypes])];
    applyPoiDataset(features, requestCenter, POI_RADIUS_METERS, Date.now(), storedTypes);
    await storePoiArea();
    setPoiMessage('POIs offline zwischengespeichert.');
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('POIs konnten nicht geladen werden:', error);
    setPoiMessage('POIs sind derzeit nicht verfügbar.', true);
  } finally {
    poiLoadInFlight = false;
  }
}

function schedulePoiLoad() {
  clearTimeout(poiLoadTimer);
  poiLoadTimer = setTimeout(loadPois, 700);
}

function togglePoi(kind) {
  poiEnabled[kind] = !poiEnabled[kind];
  locksVisible = poiEnabled.lock;
  weirsVisible = poiEnabled.weir;
  savePoiState();
  const button = poiControlElements.buttons?.[kind];
  button?.classList.toggle('isActive', poiEnabled[kind]);
  button?.setAttribute('aria-pressed', String(poiEnabled[kind]));
  updatePoiLayerContents();
  updatePoiLayerVisibility();
  if (poiEnabled[kind]) {
    schedulePoiLoad();
  } else {
    if (!activePoiTypes().length) setPoiMessage('');
  }
}

function warnAboutRouteWeirs(latLngs) {
  if (!weirsVisible || !hazardFeatures.length) return false;
  return hazardFeatures
    .filter(feature => feature.kind === 'weir')
    .some(feature => latLngs.some(point => feature.latLng.distanceTo(point) <= 150));
}

function setSearchMessage(message, isError = false) {
  const status = searchControlElements.searchStatus;
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('isError', isError);
}

function closeMapMenu() {
  if (!mapMenuElements.panel) return;
  mapMenuElements.panel.hidden = true;
  mapMenuElements.button.classList.remove('isActive');
  mapMenuElements.button.setAttribute('aria-expanded', 'false');
}

function closeSearchPanel() {
  if (!searchControlElements.panel) return;
  searchControlElements.panel.hidden = true;
  searchControlElements.button.classList.remove('isActive');
  searchControlElements.button.setAttribute('aria-expanded', 'false');
}

function closePoiPanel() {
  if (!poiControlElements.panel) return;
  poiControlElements.panel.hidden = true;
  poiControlElements.button.classList.remove('isActive');
  poiControlElements.button.setAttribute('aria-expanded', 'false');
}

function renderSearchResults(results) {
  const list = searchControlElements.results;
  list.replaceChildren();
  results.forEach(result => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'searchResult';
    button.textContent = result.display_name;
    button.addEventListener('click', () => {
      const lat = Number(result.lat);
      const lon = Number(result.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      searchLayer.clearLayers();
      L.marker([lat, lon]).addTo(searchLayer)
        .bindPopup(escapeHtml(result.display_name))
        .openPopup();
      if (Array.isArray(result.boundingbox) && result.boundingbox.length === 4) {
        map.fitBounds([
          [Number(result.boundingbox[0]), Number(result.boundingbox[2])],
          [Number(result.boundingbox[1]), Number(result.boundingbox[3])]
        ], { maxZoom: 15 });
      } else map.setView([lat, lon], 13);
      list.replaceChildren();
      setSearchMessage('');
      closeSearchPanel();
    });
    list.appendChild(button);
  });
}

async function searchMap() {
  if (!navigator.onLine) {
    setSearchMessage('Ortssuche benötigt eine Internetverbindung.', true);
    return;
  }
  const query = searchControlElements.input.value.trim();
  if (query.length < 2) {
    setSearchMessage('Bitte mindestens 2 Zeichen eingeben.', true);
    return;
  }
  if (searchInFlight) return;

  const cacheKey = query.toLocaleLowerCase('de');
  const cached = searchResultCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt <= NOMINATIM_CACHE_MAX_AGE_MS) {
    renderSearchResults(cached.results);
    setSearchMessage(cached.results.length
      ? 'Suchergebnisse (© OpenStreetMap)'
      : 'Nichts gefunden.');
    return;
  }
  if (cached) searchResultCache.delete(cacheKey);

  searchInFlight = true;
  searchControlElements.submit.disabled = true;
  setSearchMessage('Suche …');
  try {
    const wait = Math.max(0,
      NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastSearchAt));
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    lastSearchAt = Date.now();
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '5',
      addressdetails: '1',
      'accept-language': 'de'
    });
    const response = await fetch(`${NOMINATIM_URL}?${params}`);
    if (!response.ok) throw new Error(`Nominatim-HTTP ${response.status}`);
    const data = await response.json();
    const results = Array.isArray(data) ? data : [];
    searchResultCache.set(cacheKey, { results, savedAt: Date.now() });
    renderSearchResults(results);
    setSearchMessage(results.length ? 'Suchergebnisse (© OpenStreetMap)' : 'Nichts gefunden.');
  } catch (error) {
    console.error('Kartensuche fehlgeschlagen:', error);
    setSearchMessage('Suche derzeit nicht verfügbar.', true);
  } finally {
    searchInFlight = false;
    searchControlElements.submit.disabled = false;
  }
}

function restaurantType(tags) {
  return {
    restaurant: 'Restaurant',
    cafe: 'Café',
    pub: 'Pub',
    biergarten: 'Biergarten',
    fast_food: 'Imbiss'
  }[tags.amenity] || 'Gastronomie';
}

function elementGeometries(element) {
  const geometries = [];
  if (Array.isArray(element.geometry)) geometries.push(element.geometry);
  (element.members || []).forEach(member => {
    if (Array.isArray(member.geometry)) geometries.push(member.geometry);
  });
  return geometries;
}

function addMapToolsControl() {
  const control = L.control({ position: 'topright' });
  control.onAdd = () => {
    const wrapper = L.DomUtil.create('div', 'mapMenuControl');
    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'mapMenuButton';
    menuButton.textContent = '☰';
    menuButton.setAttribute('aria-label', 'Kartenfunktionen öffnen');
    menuButton.setAttribute('aria-expanded', 'false');
    wrapper.appendChild(menuButton);

    const container = document.createElement('div');
    container.className = 'mapToolsControl';
    container.hidden = true;
    wrapper.appendChild(container);

    mapMenuElements = { button: menuButton, panel: container };
    L.DomEvent.on(menuButton, 'click', () => {
      if (container.hidden) { closeSearchPanel(); closePoiPanel(); }
      container.hidden = !container.hidden;
      menuButton.classList.toggle('isActive', !container.hidden);
      menuButton.setAttribute('aria-expanded', String(!container.hidden));
    });

    const tools = [
      ['previousTracks', '🟡 Bereits gefahrene Strecken', togglePreviousTracks],
      ['seamark', '⚓ OpenSeaMap', toggleSeamark],
      ['navigation', '🧭 Navigation', () => setNavigationEnabled(!navigationEnabled)]
    ];

    offlineMapManager.init(container);

    tools.forEach(([name, text, handler]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-pressed', 'false');
      L.DomEvent.on(button, 'click', handler);
      mapModeButtons[name] = button;
      container.appendChild(button);
    });

    const panel = document.createElement('div');
    panel.className = 'navigationPanel';
    panel.hidden = true;
    const status = document.createElement('div');
    status.className = 'navigationStatus';
    status.textContent = 'Ziel auf der Karte antippen';
    const actions = document.createElement('div');
    actions.className = 'navigationActions';
    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.textContent = 'Navigation starten';
    startButton.disabled = true;
    L.DomEvent.on(startButton, 'click', startWaterNavigation);
    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.textContent = 'Beenden';
    stopButton.hidden = true;
    L.DomEvent.on(stopButton, 'click', clearNavigation);
    actions.append(startButton, stopButton);
    panel.append(status, actions);
    container.appendChild(panel);
    navigationControlElements = {
      panel,
      status,
      start: startButton,
      stop: stopButton
    };

    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
    return wrapper;
  };
  control.addTo(map);
}

function addPoiControl() {
  const control = L.control({ position: 'bottomleft' });
  control.onAdd = () => {
    const wrapper = L.DomUtil.create('div', 'poiControl');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'poiMenuButton';
    button.textContent = '📍';
    button.setAttribute('aria-label', 'POI-Menü öffnen');
    button.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('div');
    panel.className = 'poiPanel';
    panel.hidden = true;
    const buttons = {};
    Object.entries(POI_TYPES).forEach(([kind, config]) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = `${config.icon} ${config.label}`;
      item.setAttribute('aria-pressed', String(poiEnabled[kind]));
      item.classList.toggle('isActive', poiEnabled[kind]);
      L.DomEvent.on(item, 'click', () => togglePoi(kind));
      panel.appendChild(item);
      buttons[kind] = item;
    });
    const status = document.createElement('div');
    status.className = 'poiStatus';
    status.hidden = !activePoiTypes().length;
    panel.appendChild(status);
    wrapper.append(panel, button);
    poiControlElements = { wrapper, button, panel, buttons, status };
    L.DomEvent.on(button, 'click', () => {
      if (panel.hidden) {
        closeMapMenu();
        closeSearchPanel();
      }
      panel.hidden = !panel.hidden;
      button.classList.toggle('isActive', !panel.hidden);
      button.setAttribute('aria-expanded', String(!panel.hidden));
    });
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
    return wrapper;
  };
  control.addTo(map);
}

function addSearchControl() {
  const control = L.control({ position: 'topleft' });
  control.onAdd = () => {
    const wrapper = L.DomUtil.create('div', 'mapSearchControl');
    const searchButton = document.createElement('button');
    searchButton.type = 'button';
    searchButton.className = 'mapSearchButton';
    searchButton.textContent = '🔍';
    searchButton.setAttribute('aria-label', 'Kartensuche öffnen');
    searchButton.setAttribute('aria-expanded', 'false');

    const searchPanel = document.createElement('div');
    searchPanel.className = 'searchPanel';
    searchPanel.hidden = true;
    const searchRow = document.createElement('div');
    searchRow.className = 'searchRow';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Ort, Fluss oder Gewässer';
    searchInput.setAttribute('aria-label', 'Kartensuche');
    const searchSubmit = document.createElement('button');
    searchSubmit.type = 'button';
    searchSubmit.textContent = 'Suchen';
    const searchStatus = document.createElement('div');
    searchStatus.className = 'searchStatus';
    const searchResults = document.createElement('div');
    searchResults.className = 'searchResults';
    searchRow.append(searchInput, searchSubmit);
    searchPanel.append(searchRow, searchStatus, searchResults);
    wrapper.append(searchButton, searchPanel);

    searchControlElements = {
      ...searchControlElements,
      button: searchButton,
      panel: searchPanel,
      input: searchInput,
      submit: searchSubmit,
      searchStatus,
      results: searchResults
    };
    L.DomEvent.on(searchButton, 'click', () => {
      if (searchPanel.hidden) { closeMapMenu(); closePoiPanel(); }
      searchPanel.hidden = !searchPanel.hidden;
      searchButton.classList.toggle('isActive', !searchPanel.hidden);
      searchButton.setAttribute('aria-expanded', String(!searchPanel.hidden));
      if (!searchPanel.hidden) searchInput.focus();
    });
    L.DomEvent.on(searchSubmit, 'click', searchMap);
    L.DomEvent.on(searchInput, 'keydown', event => {
      if (event.key === 'Enter') searchMap();
    });
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
    return wrapper;
  };
  control.addTo(map);
}

addMapToolsControl();
addSearchControl();
addPoiControl();
map.on('click', chooseNavigationTarget);
map.on('click', closeMapMenu);
map.on('click', closeSearchPanel);
map.on('click', closePoiPanel);
map.on('moveend zoomend', () => {
  updatePoiLayerContents();
  updatePoiLayerVisibility();
  if (!activePoiTypes().length) return;
  const previousRegionIds = activePoiRegionIds;
  activateRegionalPois().then(handled => {
    if (handled) return;
    const insideSpreewald = inSpreewaldPoiArea();
    if (insideSpreewald) activateSpreewaldPois();
    else if (previousRegionIds.length || wasInSpreewaldPoiArea) schedulePoiLoad();
    wasInSpreewaldPoiArea = insideSpreewald;
  });
});
const initialOverlays = savedMapOverlays();
if (initialOverlays.seamark && navigator.onLine) seamark.addTo(map);
previousTracksVisible = Boolean(initialOverlays.previousTracks);
setToolButton('seamark', map.hasLayer(seamark));
setToolButton('previousTracks', previousTracksVisible);
locksVisible = poiEnabled.lock;
weirsVisible = poiEnabled.weir;
poiRegionsPromise = loadPoiRegions();
spreewaldPoiPromise = loadSpreewaldPois();
poiRestorePromise = restorePoisFromIndexedDb();
wasInSpreewaldPoiArea = inSpreewaldPoiArea();
if (activePoiTypes().length) schedulePoiLoad();

window.addEventListener('offline', () => {
  if (map.hasLayer(seamark)) map.removeLayer(seamark);
  setToolButton('seamark', false);
});


/* Zahl deutsch formatieren */

const fmt = n =>
  Number(n).toLocaleString(
    'de-DE',
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }
  );


/* Meter -> Kilometer */

const fmtKm = m =>
  (Number(m) / 1000).toLocaleString(
    'de-DE',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );


/* Sekunden -> HH:MM:SS */

function timerText(sec) {

  const h =
    Math.floor(sec / 3600);

  const m =
    Math.floor((sec % 3600) / 60);

  const s =
    sec % 60;

  return [
    h,
    m,
    s
  ]
    .map(v =>
      String(v).padStart(2, '0')
    )
    .join(':');
}


/* Durchschnittsgeschwindigkeit in m/s. */

function averageSpeed(distance, duration) {

  return duration > 0
    ? distance / duration
    : 0;
}


function sanitizeSpeed(speed) {

  const value = Number(speed);

  return Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_VALID_SPEED
      ? value
      : 0;
}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus(
  text,
  cls = 'idle'
) {

  $('status').textContent = text;

  $('status').className =
    'status ' + cls;
}


/* =========================================================
   ZEIT
   ========================================================= */

function elapsedSeconds() {

  if (!startedAt) {
    return 0;
  }

  let end;

  if (state === 'recording') {

    end = Date.now();

  } else {

    end =
      pausedAt ||
      Date.now();
  }

  return Math.max(
    0,
    Math.floor(
      (
        end -
        startedAt -
        accumulatedPause
      ) / 1000
    )
  );
}


/* =========================================================
   BENUTZEROBERFLÄCHE
   ========================================================= */

function updateUI() {

  $('timer').textContent =
    timerText(elapsedSeconds());


  $('distance').textContent =
    fmtKm(totalDistance) +
    ' km';


  $('speed').textContent =
    fmt(currentSpeed * 3.6) +
    ' km/h';


  $('maxSpeed').textContent =
    fmt(maxSpeed * 3.6) +
    ' km/h';


  $('points').textContent =
    track.length;


  const t =
    elapsedSeconds();


  $('average').textContent =
    t > 0
      ? fmt(
          (totalDistance / t) * 3.6
        ) + ' km/h'
      : '0,0 km/h';
}


/* =========================================================
   TRACK ZURÜCKSETZEN
   ========================================================= */

function resetTrack() {

  track = [];

  totalDistance = 0;

  maxSpeed = 0;

  currentSpeed = 0;

  lastPosition = null;

  line.setLatLngs([]);

  tripMarkers.clearLayers();

  selectedTripId = null;

  updateUI();
}


/* =========================================================
   LAUFENDE FAHRT ZWISCHENSPEICHERN
   ========================================================= */

function saveActiveTrip() {

  if (!startedAt || state === 'idle') {
    return;
  }

  const activeTrip = {
    startedAt,
    elapsed: elapsedSeconds(),
    track,
    totalDistance,
    maxSpeed,
    currentSpeed,
    lastPosition
  };

  try {

    localStorage.setItem(
      ACTIVE_TRIP_STORAGE_KEY,
      JSON.stringify(activeTrip)
    );

  } catch (e) {

    console.error(
      'Fehler beim Zwischenspeichern der Fahrt:',
      e
    );
  }
}


function clearActiveTrip() {

  localStorage.removeItem(
    ACTIVE_TRIP_STORAGE_KEY
  );
}


function restoreActiveTrip() {

  let activeTrip;

  try {

    activeTrip = JSON.parse(
      localStorage.getItem(
        ACTIVE_TRIP_STORAGE_KEY
      ) || 'null'
    );

  } catch (e) {

    console.error(
      'Fehler beim Laden der zwischengespeicherten Fahrt:',
      e
    );

    clearActiveTrip();

    return;
  }

  if (!activeTrip || !Array.isArray(activeTrip.track)) {
    return;
  }

  track = activeTrip.track;

  totalDistance = Number(activeTrip.totalDistance) || 0;

  maxSpeed =
    sanitizeSpeed(
      activeTrip.maxSpeed
    );

  currentSpeed = 0;

  lastPosition = activeTrip.lastPosition || null;

  startedAt =
    Date.now() -
    (Math.max(0, Number(activeTrip.elapsed) || 0) * 1000);

  pausedAt = Date.now();

  accumulatedPause = 0;

  state = 'paused';

  line.setLatLngs(
    track.map(
      p => [p.lat, p.lon]
    )
  );

  setStatus(
    'Unterbrochene Fahrt',
    'paused'
  );

  $('startBtn').disabled = true;

  $('pauseBtn').disabled = false;

  $('stopBtn').disabled = false;

  $('pauseBtn').textContent = '▶ Weiter';
}


/* =========================================================
   GPS STARTEN
   ========================================================= */

function startGPS() {

  if (!navigator.geolocation) {

    alert(
      'Dieses iPhone unterstützt keine Standortbestimmung im Browser.'
    );

    return;
  }


  watchId =
    navigator.geolocation.watchPosition(
      onPosition,
      onGeoError,
      {
        enableHighAccuracy: true,

        maximumAge: 2000,

        timeout: 15000
      }
    );
}


/* =========================================================
   GPS STOPPEN
   ========================================================= */

function stopGPS() {

  if (watchId !== null) {

    navigator.geolocation.clearWatch(
      watchId
    );

    watchId = null;
  }
}


/* =========================================================
   GPS POSITION
   ========================================================= */

function onPosition(pos) {

  const c = [
    pos.coords.latitude,
    pos.coords.longitude
  ];


  const acc =
    pos.coords.accuracy || 999;


  /*
    Schlechte GPS-Werte ignorieren.
  */

  if (acc > 40) {
    return;
  }


  const reportedSpeed =
    pos.coords.speed;


  const hasValidReportedSpeed =
    Number.isFinite(reportedSpeed) &&
    reportedSpeed >= 0 &&
    reportedSpeed <= MAX_VALID_SPEED;


  currentSpeed =
    hasValidReportedSpeed
      ? reportedSpeed
      : 0;


  /*
    Nur während der Aufzeichnung
    Strecke speichern.
  */

  if (state === 'recording') {

    if (lastPosition) {

      const p1 =
        L.latLng(
          lastPosition[0],
          lastPosition[1]
        );


      const p2 =
        L.latLng(
          c[0],
          c[1]
        );


      const d =
        p1.distanceTo(p2);


      /*
        Kleine GPS-Sprünge ignorieren.
      */

      if (
        d >= 2 &&
        d < 100
      ) {

        const previousPoint =
          track[track.length - 1];

        const pointTime =
          new Date(
            pos.timestamp || Date.now()
          ).toISOString();


        /*
          iPhones liefern die GPS-Geschwindigkeit nicht immer.
          In diesem Fall aus Distanz und Zeit berechnen.
        */

        if (
          !hasValidReportedSpeed &&
          previousPoint
        ) {

          const seconds =
            (
              new Date(pointTime) -
              new Date(previousPoint.time)
            ) / 1000;


          if (seconds >= 2) {

            const calculatedSpeed =
              d / seconds;


            if (calculatedSpeed <= MAX_VALID_SPEED) {

              currentSpeed =
                calculatedSpeed;
            }
          }
        }

        totalDistance += d;


        track.push({
          lat: c[0],

          lon: c[1],

          time:
            pointTime,

          speed:
            currentSpeed
        });


        line.addLatLng(c);
      }

    } else {

      /*
        Erster Punkt.
      */

      track.push({
        lat: c[0],

        lon: c[1],

        time:
          new Date().toISOString(),

        speed:
          currentSpeed
      });


      line.addLatLng(c);
    }


    maxSpeed =
      Math.max(
        maxSpeed,
        currentSpeed
      );


    saveActiveTrip();
  }


  lastPosition = c;

  if (activePoiTypes().length) activateRegionalPois().then(handled => {
    if (handled) return;
    if (inSpreewaldPoiArea()) activateSpreewaldPois();
    else if (!poiLoadInFlight && loadedPoiCenter &&
        loadedPoiCenter.distanceTo(L.latLng(c)) > POI_RELOAD_DISTANCE_METERS) schedulePoiLoad();
  });


  /*
    Standortmarker
  */

  if (!marker) {

    marker =
      L.marker(c)
        .addTo(map);

  } else {

    marker.setLatLng(c);
  }


  /*
    Karte auf Position bewegen.
  */

  map.setView(
    c,
    Math.max(
      map.getZoom(),
      15
    ),
    {
      animate: true
    }
  );


  updateUI();
}


/* =========================================================
   GPS FEHLER
   ========================================================= */

function onGeoError(err) {

  console.log(
    'GPS Fehler:',
    err
  );


  if (err.code === 1) {

    alert(
      'Standortzugriff wurde verweigert. ' +
      'Bitte in den iPhone-Einstellungen den Standortzugriff für Safari erlauben.'
    );
  }
}


/* =========================================================
   AUFZEICHNUNG STARTEN
   ========================================================= */

function start() {

  resetTrack();


  startedAt =
    Date.now();


  pausedAt = null;

  accumulatedPause = 0;

  state = 'recording';


  setStatus(
    'Aufzeichnung läuft',
    'recording'
  );


  $('startBtn').disabled =
    true;

  $('pauseBtn').disabled =
    false;

  $('stopBtn').disabled =
    false;


  saveActiveTrip();


  startGPS();


  timerId =
    setInterval(
      updateUI,
      500
    );
}


/* =========================================================
   PAUSE / WEITER
   ========================================================= */

function pause() {

  if (state === 'recording') {

    state = 'paused';

    pausedAt =
      Date.now();

    currentSpeed = 0;


    setStatus(
      'Pausiert',
      'paused'
    );


    $('pauseBtn').textContent =
      '▶ Weiter';


    stopGPS();

    saveActiveTrip();

  }

  else if (state === 'paused') {

    accumulatedPause +=
      Date.now() -
      pausedAt;


    pausedAt = null;

    state = 'recording';


    setStatus(
      'Aufzeichnung läuft',
      'recording'
    );


    $('pauseBtn').textContent =
      'Ⅱ Pause';


    startGPS();


    if (!timerId) {

      timerId =
        setInterval(
          updateUI,
          500
        );
    }

    saveActiveTrip();
  }


  updateUI();
}


/* =========================================================
   AUFZEICHNUNG STOPPEN
   ========================================================= */

function stop() {

  if (state === 'paused') {

    accumulatedPause +=
      Date.now() -
      pausedAt;
  }


  state = 'idle';

  currentSpeed = 0;


  stopGPS();


  if (timerId) {

    clearInterval(
      timerId
    );

    timerId = null;
  }


  setStatus(
    'Fahrt beendet',
    'idle'
  );


  $('startBtn').disabled =
    false;

  $('pauseBtn').disabled =
    true;

  $('stopBtn').disabled =
    true;


  $('pauseBtn').textContent =
    'Ⅱ Pause';


  /*
    Fahrt speichern.
  */

  saveTrip();

  clearActiveTrip();


  updateUI();
}


/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function getTrips() {

  try {

    const trips = JSON.parse(
      localStorage.getItem(
        TRIPS_STORAGE_KEY
      ) || '[]'
    );


    return Array.isArray(trips)
      ? trips.map(
          trip => ({
            ...trip,
            startedAt:
              trip.startedAt ||
              trip.date,
            maxSpeed:
              sanitizeSpeed(
                trip.maxSpeed
              )
          })
        )
      : [];

  } catch (e) {

    console.error(
      'Fehler beim Laden der Fahrten:',
      e
    );

    return [];
  }
}


/* =========================================================
   FAHRT SPEICHERN
   ========================================================= */

function saveTrip() {

  /*
    Eine Fahrt ohne Strecke
    wird nicht gespeichert.
  */

  if (track.length < 2) {

    alert(
      'Die Fahrt wurde nicht gespeichert, da noch keine ausreichende Strecke aufgezeichnet wurde.'
    );

    return;
  }


  const trips =
    getTrips();


  const duration =
    elapsedSeconds();


  const trip = {

    id:
      Date.now().toString(),

    /* Datum und Uhrzeit des Fahrtbeginns. */
    startedAt:
      new Date(startedAt).toISOString(),

    /* Für bereits vorhandene Daten und Abwärtskompatibilität. */
    date:
      new Date(startedAt).toISOString(),

    duration:
      duration,

    distance:
      totalDistance,

    maxSpeed:
      maxSpeed,

    averageSpeed:
      averageSpeed(
        totalDistance,
        duration
      ),

    track:
      track
  };


  trips.unshift(trip);


  /*
    Maximal 100 Fahrten speichern.
  */

  localStorage.setItem(
    TRIPS_STORAGE_KEY,
    JSON.stringify(
      trips.slice(0, 100)
    )
  );


  renderTrips();

  refreshPreviousTracks();


  console.log(
    'Fahrt gespeichert:',
    trip
  );
}


/* =========================================================
   DATUM FORMATIEREN
   ========================================================= */

function formatDate(dateString) {

  const d =
    new Date(dateString);


  return d.toLocaleString(
    'de-DE',
    {
      dateStyle: 'medium',
      timeStyle: 'short'
    }
  );
}


/* =========================================================
   GESPEICHERTE FAHRTEN ANZEIGEN
   ========================================================= */

function renderTrips() {

  const trips =
    getTrips();


  const container =
    $('tripsList');


  container.innerHTML = '';


  if (trips.length === 0) {

    container.innerHTML =
      `
      <div class="noTrips">
        Noch keine gespeicherten Fahrten.
      </div>
      `;

    return;
  }


  trips.forEach(
    (trip, index) => {

      const card =
        document.createElement(
          'div'
        );


      card.className =
        'tripCard';


      card.innerHTML =
        `
        <div class="tripTop">

          <div>

            <div class="tripTitle">
              Fahrt ${trips.length - index}
            </div>

            <div class="tripDate">
              ${formatDate(trip.startedAt)}
            </div>

          </div>

        </div>


        <div class="tripStats">

          <div>
            <span>Entfernung</span>
            <strong>
              ${fmtKm(trip.distance)} km
            </strong>
          </div>

          <div>
            <span>Dauer</span>
            <strong>
              ${timerText(trip.duration)}
            </strong>
          </div>

          <div>
            <span>Ø Tempo</span>
            <strong>
              ${fmt(
                (Number.isFinite(trip.averageSpeed)
                  ? trip.averageSpeed
                  : averageSpeed(
                      trip.distance,
                      trip.duration
                    )) * 3.6
              )} km/h
            </strong>
          </div>

          <div>
            <span>Max</span>
            <strong>
              ${fmt(trip.maxSpeed * 3.6)} km/h
            </strong>
          </div>

        </div>


        <div class="tripActions">

          <button
            class="viewTripBtn"
            data-id="${trip.id}"
          >
            Karte
          </button>

          <button
            class="exportTripBtn"
            data-id="${trip.id}"
          >
            GPX
          </button>

          <button
            class="deleteTripBtn"
            data-id="${trip.id}"
          >
            Löschen
          </button>

        </div>
        `;


      container.appendChild(
        card
      );
    }
  );


  /*
    Buttons aktivieren.
  */

  container
    .querySelectorAll(
      '.viewTripBtn'
    )
    .forEach(btn => {

      btn.addEventListener(
        'click',
        () => {

          viewTrip(
            btn.dataset.id
          );
        }
      );
    });


  container
    .querySelectorAll(
      '.exportTripBtn'
    )
    .forEach(btn => {

      btn.addEventListener(
        'click',
        () => {

          exportSavedTrip(
            btn.dataset.id
          );
        }
      );
    });


  container
    .querySelectorAll(
      '.deleteTripBtn'
    )
    .forEach(btn => {

      btn.addEventListener(
        'click',
        () => {

          deleteTrip(
            btn.dataset.id
          );
        }
      );
    });
}


/* =========================================================
   GESPEICHERTE FAHRT ANZEIGEN
   ========================================================= */

function viewTrip(id) {

  const trips =
    getTrips();


  const trip =
    trips.find(
      t => t.id === id
    );


  if (!trip) {

    alert(
      'Fahrt nicht gefunden.'
    );

    return;
  }


  if (
    !trip.track ||
    trip.track.length < 2
  ) {

    alert(
      'Diese Fahrt enthält keine ausreichenden GPS-Daten.'
    );

    return;
  }


  selectedTripId = id;


  /* Marker der zuvor ausgewählten Fahrt entfernen. */

  tripMarkers.clearLayers();

  /* Eine laufende Aufzeichnung bleibt als eigene blaue Linie sichtbar. */
  if (state === 'idle') {
    line.setLatLngs([]);
  }


  /*
    Koordinaten für Leaflet.
  */

  const latLngs =
    trip.track.map(
      p => [
        p.lat,
        p.lon
      ]
    );


  /*
    Neue Linie erzeugen.
  */

  L.polyline(
    latLngs,
    {
      color: '#147aa1',
      weight: 5
    }
  ).addTo(tripMarkers);


  /*
    Start-/Endpunkt anzeigen.
  */

  if (marker) {

    map.removeLayer(
      marker
    );

    marker = null;
  }


  /*
    Startmarker.
  */

  L.marker(
    latLngs[0]
  )
    .addTo(tripMarkers)
    .bindPopup(
      'Start'
    );


  /* Zielmarker. */

  L.marker(
    latLngs[latLngs.length - 1]
  )
    .addTo(tripMarkers)
    .bindPopup(
      'Ziel'
    );


  /*
    Karte passend auf Strecke zoomen.
  */

  const bounds =
    L.latLngBounds(
      latLngs
    );


  map.fitBounds(
    bounds,
    {
      padding: [
        30,
        30
      ]
    }
  );


  /*
    Statistik oben anzeigen.
  */

  $('timer').textContent =
    timerText(
      trip.duration
    );


  $('distance').textContent =
    fmtKm(
      trip.distance
    ) + ' km';


  $('speed').textContent =
    '0,0 km/h';


  $('average').textContent =
    fmt(
      (Number.isFinite(trip.averageSpeed)
        ? trip.averageSpeed
        : averageSpeed(
            trip.distance,
            trip.duration
          )) * 3.6
    ) + ' km/h';


  $('maxSpeed').textContent =
    fmt(
      trip.maxSpeed * 3.6
    ) + ' km/h';


  $('points').textContent =
    trip.track.length;


  setStatus(
    'Fahrt angezeigt',
    'idle'
  );


  /*
    Karte nach oben scrollen.
  */

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });


  /*
    Leaflet nach Größenänderung
    neu berechnen.
  */

  setTimeout(
    () => map.invalidateSize(),
    300
  );
}


/* =========================================================
   GESPEICHERTE FAHRT ALS GPX EXPORTIEREN
   ========================================================= */

function exportSavedTrip(id) {

  const trips =
    getTrips();


  const trip =
    trips.find(
      t => t.id === id
    );


  if (!trip) {

    alert(
      'Fahrt nicht gefunden.'
    );

    return;
  }


  if (
    !trip.track ||
    trip.track.length < 2
  ) {

    alert(
      'Diese Fahrt enthält keine GPS-Daten.'
    );

    return;
  }


  const esc =
    s =>
      String(s)
        .replace(
          /&/g,
          '&amp;'
        )
        .replace(
          /</g,
          '&lt;'
        )
        .replace(
          />/g,
          '&gt;'
        );


  const points =
    trip.track
      .map(
        p =>
          `
          <trkpt
            lat="${p.lat}"
            lon="${p.lon}"
          >
            <time>
              ${esc(p.time)}
            </time>
          </trkpt>
          `
      )
      .join('');


  const gpx =
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx
  version="1.1"
  creator="KajakTracker"
  xmlns="http://www.topografix.com/GPX/1/1"
>
  <trk>
    <name>
      Kajakfahrt ${formatDate(trip.startedAt)}
    </name>

    <trkseg>
      ${points}
    </trkseg>
  </trk>
</gpx>`;


  const blob =
    new Blob(
      [gpx],
      {
        type:
          'application/gpx+xml'
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      'a'
    );


  a.href = url;

  a.download =
    'kajakfahrt-' +
    trip.id +
    '.gpx';


  document.body.appendChild(a);

  a.click();

  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );
}


/* =========================================================
   AKTUELLE FAHRT ALS GPX EXPORTIEREN
   ========================================================= */

function exportGPX() {

  if (track.length < 2) {

    alert(
      'Noch keine aufgezeichnete Strecke vorhanden.'
    );

    return;
  }


  const esc =
    s =>
      String(s)
        .replace(
          /&/g,
          '&amp;'
        )
        .replace(
          /</g,
          '&lt;'
        )
        .replace(
          />/g,
          '&gt;'
        );


  const points =
    track
      .map(
        p =>
          `<trkpt lat="${p.lat}" lon="${p.lon}">
            <time>${esc(p.time)}</time>
          </trkpt>`
      )
      .join('');


  const gpx =
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx
  version="1.1"
  creator="KajakTracker"
  xmlns="http://www.topografix.com/GPX/1/1"
>
  <trk>
    <name>
      Kajakfahrt ${new Date().toLocaleString('de-DE')}
    </name>

    <trkseg>
      ${points}
    </trkseg>

  </trk>
</gpx>`;


  const blob =
    new Blob(
      [gpx],
      {
        type:
          'application/gpx+xml'
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const a =
    document.createElement(
      'a'
    );


  a.href = url;

  a.download =
    'kajakfahrt.gpx';


  document.body.appendChild(a);

  a.click();

  a.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );
}


/* =========================================================
   FAHRT LÖSCHEN
   ========================================================= */

function deleteTrip(id) {

  const trips =
    getTrips();


  const trip =
    trips.find(
      t => t.id === id
    );


  if (!trip) {
    return;
  }


  const ok =
    confirm(
      'Diese Fahrt wirklich löschen?'
    );


  if (!ok) {
    return;
  }


  const newTrips =
    trips.filter(
      t => t.id !== id
    );


  localStorage.setItem(
    TRIPS_STORAGE_KEY,
    JSON.stringify(
      newTrips
    )
  );


  if (selectedTripId === id) {

    tripMarkers.clearLayers();

    selectedTripId = null;
  }


  renderTrips();

  refreshPreviousTracks();
}


/* =========================================================
   ALLE FAHRTEN LÖSCHEN
   ========================================================= */

function clearAllTrips() {

  const trips =
    getTrips();


  if (trips.length === 0) {

    return;
  }


  const ok =
    confirm(
      'Wirklich ALLE gespeicherten Fahrten löschen?'
    );


  if (!ok) {
    return;
  }


  localStorage.removeItem(
    TRIPS_STORAGE_KEY
  );

  tripMarkers.clearLayers();

  selectedTripId = null;


  renderTrips();

  refreshPreviousTracks();
}


/* =========================================================
   STANDORT BUTTON
   ========================================================= */

$('locationBtn').onclick =
  () => {

    if (lastPosition) {

      map.setView(
        lastPosition,
        16
      );

      return;
    }


    navigator.geolocation.getCurrentPosition(
      onPosition,
      onGeoError,
      {
        enableHighAccuracy: true
      }
    );
  };


/* =========================================================
   BUTTONS
   ========================================================= */

$('startBtn').onclick =
  start;


$('pauseBtn').onclick =
  pause;


$('stopBtn').onclick =
  stop;


$('gpxBtn').onclick =
  exportGPX;


$('clearTripsBtn').onclick =
  clearAllTrips;


/* =========================================================
   SERVICE WORKER
   ========================================================= */

if (
  'serviceWorker' in navigator
) {

  window.addEventListener(
    'load',
    () => {

      navigator.serviceWorker
        .register('sw.js')
        .then(
          () =>
            console.log(
              'Service Worker registriert'
            )
        )
        .catch(
          err =>
            console.log(
              'Service Worker Fehler:',
              err
            )
        );
    }
  );
}


/* =========================================================
   START
   ========================================================= */

restoreActiveTrip();

updateUI();

renderTrips();

refreshPreviousTracks();


/*
  Leaflet braucht manchmal nach dem
  Laden auf dem iPhone einen
  invalidateSize().
*/

setTimeout(
  () => map.invalidateSize(),
  500
);
