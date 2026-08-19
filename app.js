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
).addTo(map);


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

let previousTracksVisible = false;
let navigationEnabled = false;
let navigationTarget = null;
let navigationRoute = null;
let navigationControlElements = {};
let locksVisible = false;
let weirsVisible = false;
let hazardLoadTimer = null;
let hazardAbortController = null;
let loadedHazardBounds = null;
let hazardFeatures = [];
let searchControlElements = {};
let mapMenuElements = {};
let lastSearchAt = 0;
let restaurantsVisible = false;
let restaurantFeatures = [];
let loadedRestaurantBounds = null;
let loadedRestaurantAt = 0;
let restaurantAbortController = null;

const HAZARD_MIN_ZOOM = 12;
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const RESTAURANT_OVERPASS_URLS = [
  ...OVERPASS_URLS,
  'https://overpass.private.coffee/api/interpreter'
];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const RESTAURANT_MIN_ZOOM = 14;
const RESTAURANT_WATER_DISTANCE_METERS = 30;
const RESTAURANT_REQUEST_TIMEOUT_MS = 12000;
const RESTAURANT_CACHE_MAX_AGE_MS = 3 * 60 * 1000;


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

const $ = id =>
  document.getElementById(id);


/* =========================================================
   KARTENMODUS
   ========================================================= */

let mapModeButtons = {};


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

function hazardLatLng(element) {
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? L.latLng(lat, lon) : null;
}

function hazardKind(element) {
  const tags = element.tags || {};
  if (tags.waterway === 'weir') return 'weir';
  if (tags.waterway === 'lock_gate' || tags.waterway === 'lock' || tags.lock === 'yes') {
    return 'lock';
  }
  return null;
}

function hazardPopup(feature) {
  const tags = feature.tags;
  const title = tags.name || (feature.kind === 'weir' ? 'Wehr' : 'Schleuse');
  const details = [
    tags.waterway && `Wasserweg-Typ: ${tags.waterway}`,
    tags.lock_name && `Schleuse: ${tags.lock_name}`,
    tags.operator && `Betreiber: ${tags.operator}`,
    tags.opening_hours && `Öffnungszeiten: ${tags.opening_hours}`,
    tags.description && `Hinweis: ${tags.description}`
  ].filter(Boolean);
  return `<strong>${escapeHtml(title)}</strong>${details.length
    ? `<br>${details.map(escapeHtml).join('<br>')}`
    : ''}<br><small>Daten: OpenStreetMap-Mitwirkende</small>`;
}

function renderHazards() {
  locksLayer.clearLayers();
  weirsLayer.clearLayers();
  if (map.getZoom() < HAZARD_MIN_ZOOM) return;

  const visibleBounds = map.getBounds().pad(0.05);
  const candidates = hazardFeatures
    .filter(feature => visibleBounds.contains(feature.latLng))
    .sort((a, b) => a.latLng.distanceTo(map.getCenter()) -
      b.latLng.distanceTo(map.getCenter()));
  const visibleFeatures = [
    ...candidates.filter(feature => feature.kind === 'lock').slice(0, 100),
    ...candidates.filter(feature => feature.kind === 'weir').slice(0, 100)
  ];

  visibleFeatures.forEach(feature => {
    if ((feature.kind === 'lock' && !locksVisible) ||
        (feature.kind === 'weir' && !weirsVisible)) return;
    const isWeir = feature.kind === 'weir';
    const icon = L.divIcon({
      className: 'hazardIconWrapper',
      html: `<span class="hazardIcon ${isWeir ? 'weirIcon' : 'lockIcon'}" aria-hidden="true">${isWeir ? '⚠️' : '🔒'}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    L.marker(feature.latLng, { icon, pane: 'hazardPane' })
      .bindPopup(hazardPopup(feature))
      .addTo(isWeir ? weirsLayer : locksLayer);
  });
}

function setHazardMessage(message, isError = false) {
  const status = searchControlElements.hazardStatus;
  if (!status) return;
  status.hidden = !locksVisible && !weirsVisible;
  status.textContent = message;
  status.classList.toggle('isError', isError);
}

function paddedMapBounds() {
  const bounds = map.getBounds();
  const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.3;
  const lonPad = (bounds.getEast() - bounds.getWest()) * 0.3;
  return L.latLngBounds(
    [bounds.getSouth() - latPad, bounds.getWest() - lonPad],
    [bounds.getNorth() + latPad, bounds.getEast() + lonPad]
  );
}

async function loadHazards() {
  if ((!locksVisible && !weirsVisible) || map.getZoom() < HAZARD_MIN_ZOOM) {
    renderHazards();
    if (locksVisible || weirsVisible) {
      setHazardMessage(`Schleusen/Wehre ab Zoom ${HAZARD_MIN_ZOOM}`);
    }
    return;
  }

  const visibleBounds = map.getBounds();
  if (loadedHazardBounds?.contains(visibleBounds)) {
    renderHazards();
    return;
  }

  const requestBounds = paddedMapBounds();
  const bbox = [requestBounds.getSouth(), requestBounds.getWest(),
    requestBounds.getNorth(), requestBounds.getEast()]
    .map(value => value.toFixed(6)).join(',');
  const query = `[out:json][timeout:20];(
    node["waterway"="lock_gate"](${bbox});
    way["waterway"="lock_gate"](${bbox});
    node["waterway"="lock"](${bbox});
    way["waterway"="lock"](${bbox});
    node["lock"="yes"](${bbox});
    way["lock"="yes"](${bbox});
    node["waterway"="weir"](${bbox});
    way["waterway"="weir"](${bbox});
  );out center tags;`;

  hazardAbortController?.abort();
  hazardAbortController = new AbortController();
  setHazardMessage('Schleusen und Wehre werden geladen …');

  try {
    let response;
    for (const url of OVERPASS_URLS) {
      response = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: hazardAbortController.signal
      });
      if (response.ok) break;
    }
    if (!response?.ok) throw new Error(`Overpass-HTTP ${response?.status || 0}`);
    const data = await response.json();
    const seen = new Set();
    const rawFeatures = (data.elements || []).flatMap(element => {
      const kind = hazardKind(element);
      const latLng = hazardLatLng(element);
      const key = `${element.type}/${element.id}`;
      if (!kind || !latLng || seen.has(key)) return [];
      seen.add(key);
      return [{ kind, latLng, tags: element.tags || {} }];
    });
    rawFeatures.sort((a, b) => Number(Boolean(b.tags.name || b.tags.lock_name)) -
      Number(Boolean(a.tags.name || a.tags.lock_name)));
    hazardFeatures = rawFeatures.filter((feature, index, features) =>
      !features.slice(0, index).some(other =>
        other.kind === feature.kind && other.latLng.distanceTo(feature.latLng) < 20
      )
    );
    loadedHazardBounds = requestBounds;
    renderHazards();
    setHazardMessage(
      `${hazardFeatures.filter(f => f.kind === 'lock').length} Schleusen, ` +
      `${hazardFeatures.filter(f => f.kind === 'weir').length} Wehre`
    );
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('OSM-Hindernisse konnten nicht geladen werden:', error);
    setHazardMessage('Schleusen/Wehre derzeit nicht verfügbar', true);
  }
}

function scheduleHazardLoad() {
  clearTimeout(hazardLoadTimer);
  hazardLoadTimer = setTimeout(loadHazards, 700);
}

function toggleHazard(kind) {
  if (kind === 'lock') locksVisible = !locksVisible;
  else weirsVisible = !weirsVisible;
  setToolButton('locks', locksVisible);
  setToolButton('weirs', weirsVisible);
  if (searchControlElements.hazardStatus) {
    searchControlElements.hazardStatus.hidden = !locksVisible && !weirsVisible;
  }
  renderHazards();
  scheduleHazardLoad();
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
  const query = searchControlElements.input.value.trim();
  if (query.length < 2) {
    setSearchMessage('Bitte mindestens 2 Zeichen eingeben.', true);
    return;
  }
  const wait = Math.max(0, 1000 - (Date.now() - lastSearchAt));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastSearchAt = Date.now();
  searchControlElements.submit.disabled = true;
  setSearchMessage('Suche …');
  try {
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
    renderSearchResults(results);
    setSearchMessage(results.length ? 'Suchergebnisse (© OpenStreetMap)' : 'Nichts gefunden.');
  } catch (error) {
    console.error('Kartensuche fehlgeschlagen:', error);
    setSearchMessage('Suche derzeit nicht verfügbar.', true);
  } finally {
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

function restaurantPopup(feature) {
  const tags = feature.tags;
  const address = [tags['addr:street'], tags['addr:housenumber'],
    tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  const details = [
    `Art: ${restaurantType(tags)}`,
    address && `Adresse: ${address}`,
    tags.opening_hours && `Öffnungszeiten: ${tags.opening_hours}`,
    tags.phone && `Telefon: ${tags.phone}`
  ].filter(Boolean).map(escapeHtml);
  let website = '';
  try {
    const url = new URL(tags.website || '');
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      website = `<br><a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">Website</a>`;
    }
  } catch (error) {
    /* Ungültige oder fehlende URL wird nicht angezeigt. */
  }
  return `<strong>${escapeHtml(tags.name || restaurantType(tags))}</strong>` +
    `<br>${details.join('<br>')}${website}` +
    '<br><button type="button" class="navigateRestaurantBtn">🧭 Dorthin navigieren</button>' +
    '<br><small>OSM-Nähe zu einem Gewässer; Erreichbarkeit nicht garantiert.</small>';
}

function navigateToRestaurant(feature) {
  setNavigationEnabled(true);
  navigationLayer.clearLayers();
  navigationTarget = feature.latLng;
  L.marker(navigationTarget)
    .addTo(navigationLayer)
    .bindPopup('Navigationsziel');
  navigationControlElements.start.disabled = false;
  navigationControlElements.stop.hidden = true;
  setNavigationMessage('Gaststätte als Ziel gewählt');
  startWaterNavigation();
}

function renderRestaurants() {
  restaurantsLayer.clearLayers();
  if (!restaurantsVisible) return;
  const visibleBounds = map.getBounds().pad(0.05);
  restaurantFeatures
    .filter(feature => visibleBounds.contains(feature.latLng))
    .slice(0, 100)
    .forEach(feature => {
      const icon = L.divIcon({
        className: 'restaurantIconWrapper',
        html: '<span class="restaurantIcon" aria-hidden="true">🍽</span>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      const restaurantMarker = L.marker(feature.latLng, { icon, pane: 'hazardPane' })
        .bindPopup(restaurantPopup(feature))
        .addTo(restaurantsLayer);
      restaurantMarker.on('popupopen', event => {
        const button = event.popup.getElement()?.querySelector('.navigateRestaurantBtn');
        if (button) button.onclick = () => navigateToRestaurant(feature);
      });
    });
}

function setRestaurantMessage(message, isError = false) {
  const status = searchControlElements.restaurantStatus;
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('isError', isError);
}

function distanceToWaterSegment(point, start, end) {
  const metersPerLon = 111320 * Math.cos(point.lat * Math.PI / 180);
  const toXY = coordinate => ({
    x: (Number(coordinate.lon) - point.lng) * metersPerLon,
    y: (Number(coordinate.lat) - point.lat) * 110540
  });
  const a = toXY(start);
  const b = toXY(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared))
    : 0;
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

function distanceToWaterGeometry(point, geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return Infinity;
  let minimum = Infinity;
  for (let index = 1; index < geometry.length; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToWaterSegment(point, geometry[index - 1], geometry[index])
    );
  }
  return minimum;
}

function geometrySegments(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 2) return [];
  return geometry.slice(1).map((end, index) => [geometry[index], end]);
}

function segmentsIntersect(a, b, c, d) {
  const cross = (start, end, point) =>
    (Number(end.lon) - Number(start.lon)) * (Number(point.lat) - Number(start.lat)) -
    (Number(end.lat) - Number(start.lat)) * (Number(point.lon) - Number(start.lon));
  const onSegment = (start, end, point) =>
    Number(point.lon) >= Math.min(Number(start.lon), Number(end.lon)) &&
    Number(point.lon) <= Math.max(Number(start.lon), Number(end.lon)) &&
    Number(point.lat) >= Math.min(Number(start.lat), Number(end.lat)) &&
    Number(point.lat) <= Math.max(Number(start.lat), Number(end.lat));
  const first = cross(a, b, c);
  const second = cross(a, b, d);
  const third = cross(c, d, a);
  const fourth = cross(c, d, b);
  if (((first < 0 && second > 0) || (first > 0 && second < 0)) &&
      ((third < 0 && fourth > 0) || (third > 0 && fourth < 0))) return true;
  return (first === 0 && onSegment(a, b, c)) ||
    (second === 0 && onSegment(a, b, d)) ||
    (third === 0 && onSegment(c, d, a)) ||
    (fourth === 0 && onSegment(c, d, b));
}

function pointInClosedGeometry(point, geometry) {
  if (!Array.isArray(geometry) || geometry.length < 4) return false;
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  if (Number(first.lat) !== Number(last.lat) || Number(first.lon) !== Number(last.lon)) {
    return false;
  }
  let inside = false;
  for (let index = 0, previous = geometry.length - 1;
    index < geometry.length; previous = index, index += 1) {
    const current = geometry[index];
    const prior = geometry[previous];
    const crossesLatitude = (Number(current.lat) > Number(point.lat)) !==
      (Number(prior.lat) > Number(point.lat));
    const crossingLongitude = (Number(prior.lon) - Number(current.lon)) *
      (Number(point.lat) - Number(current.lat)) /
      (Number(prior.lat) - Number(current.lat)) + Number(current.lon);
    if (crossesLatitude && Number(point.lon) < crossingLongitude) inside = !inside;
  }
  return inside;
}

function distanceBetweenGeometries(firstGeometry, secondGeometry) {
  const firstSegments = geometrySegments(firstGeometry);
  const secondSegments = geometrySegments(secondGeometry);
  if (!firstSegments.length || !secondSegments.length) return Infinity;
  if (pointInClosedGeometry(firstGeometry[0], secondGeometry) ||
      pointInClosedGeometry(secondGeometry[0], firstGeometry)) return 0;
  let minimum = Infinity;
  firstSegments.forEach(([firstStart, firstEnd]) => {
    secondSegments.forEach(([secondStart, secondEnd]) => {
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        minimum = 0;
        return;
      }
      minimum = Math.min(
        minimum,
        distanceToWaterSegment(L.latLng(firstStart.lat, firstStart.lon), secondStart, secondEnd),
        distanceToWaterSegment(L.latLng(firstEnd.lat, firstEnd.lon), secondStart, secondEnd),
        distanceToWaterSegment(L.latLng(secondStart.lat, secondStart.lon), firstStart, firstEnd),
        distanceToWaterSegment(L.latLng(secondEnd.lat, secondEnd.lon), firstStart, firstEnd)
      );
    });
  });
  return minimum;
}

function elementGeometries(element) {
  const geometries = [];
  if (Array.isArray(element.geometry)) geometries.push(element.geometry);
  (element.members || []).forEach(member => {
    if (Array.isArray(member.geometry)) geometries.push(member.geometry);
  });
  return geometries;
}

async function fetchRestaurantOverpass(query) {
  let lastError;
  for (const url of RESTAURANT_OVERPASS_URLS) {
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    restaurantAbortController.signal.addEventListener('abort', abortAttempt, { once: true });
    const timeoutId = setTimeout(abortAttempt, RESTAURANT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: attemptController.signal
      });
      if (response.ok) return response.json();
      lastError = new Error(`Overpass-HTTP ${response.status}`);
    } catch (error) {
      if (restaurantAbortController.signal.aborted) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
      restaurantAbortController.signal.removeEventListener('abort', abortAttempt);
    }
  }
  throw lastError || new Error('Keine Overpass-Instanz erreichbar');
}

async function loadWaterRestaurants(forceRefresh = false) {
  if (map.getZoom() < RESTAURANT_MIN_ZOOM) {
    setRestaurantMessage('Bitte weiter in die Karte hineinzoomen.', true);
    return;
  }
  restaurantsVisible = true;
  const visibleBounds = map.getBounds();
  const cacheIsFresh = Date.now() - loadedRestaurantAt <= RESTAURANT_CACHE_MAX_AGE_MS;
  if (!forceRefresh && restaurantFeatures.length && cacheIsFresh &&
      loadedRestaurantBounds?.contains(visibleBounds)) {
    renderRestaurants();
    setRestaurantMessage(
      restaurantFeatures.length
        ? `${restaurantFeatures.length} Gaststätten direkt am Wasser gefunden`
        : 'Keine Gaststätten innerhalb von 30 m zum Wasser gefunden.'
    );
    return;
  }

  const requestBounds = visibleBounds;
  const bbox = [requestBounds.getSouth(), requestBounds.getWest(),
    requestBounds.getNorth(), requestBounds.getEast()]
    .map(value => value.toFixed(6)).join(',');
  const query = `[out:json][timeout:20][maxsize:8388608];(
    node["amenity"~"^(restaurant|cafe|pub|biergarten|fast_food)$"](${bbox});
    way["amenity"~"^(restaurant|cafe|pub|biergarten|fast_food)$"](${bbox});
    relation["amenity"~"^(restaurant|cafe|pub|biergarten|fast_food)$"](${bbox});
    way["waterway"~"^(river|riverbank|stream|canal|drain)$"](${bbox});
    relation["waterway"~"^(river|riverbank|stream|canal|drain)$"](${bbox});
    way["natural"="water"](${bbox});
    relation["natural"="water"](${bbox});
  );out center geom tags;`;

  restaurantAbortController?.abort();
  restaurantAbortController = new AbortController();
  setRestaurantMessage('Gaststätten am Wasser werden geladen …');
  try {
    const data = await fetchRestaurantOverpass(query);
    const waterGeometries = (data.elements || [])
      .filter(element => !element.tags?.amenity)
      .flatMap(elementGeometries);
    const seen = new Set();
    const rawRestaurants = (data.elements || []).flatMap(element => {
      if (!element.tags?.amenity) return [];
      const latLng = hazardLatLng(element);
      const key = `${element.type}/${element.id}`;
      if (!latLng || seen.has(key)) return [];
      seen.add(key);
      const restaurantGeometries = elementGeometries(element);
      const waterDistance = waterGeometries.reduce((minimum, waterGeometry) => {
        const geometryDistance = restaurantGeometries.length
          ? restaurantGeometries.reduce((restaurantMinimum, restaurantGeometry) => Math.min(
            restaurantMinimum,
            distanceBetweenGeometries(restaurantGeometry, waterGeometry)
          ), Infinity)
          : distanceToWaterGeometry(latLng, waterGeometry);
        return Math.min(minimum, geometryDistance);
      }, Infinity);
      if (waterDistance > RESTAURANT_WATER_DISTANCE_METERS) return [];
      return [{ latLng, tags: element.tags || {}, waterDistance }];
    });
    restaurantFeatures = rawRestaurants.filter((feature, index, features) =>
      !features.slice(0, index).some(other =>
        other.tags.amenity === feature.tags.amenity &&
        (other.tags.name || '') === (feature.tags.name || '') &&
        other.latLng.distanceTo(feature.latLng) < 15
      )
    );
    loadedRestaurantBounds = restaurantFeatures.length ? requestBounds : null;
    loadedRestaurantAt = restaurantFeatures.length ? Date.now() : 0;
    renderRestaurants();
    setRestaurantMessage(
      restaurantFeatures.length
        ? `${restaurantFeatures.length} Gaststätten direkt am Wasser gefunden`
        : 'Keine Gaststätten innerhalb von 30 m zum Wasser gefunden.'
    );
  } catch (error) {
    if (error.name === 'AbortError') return;
    loadedRestaurantBounds = null;
    loadedRestaurantAt = 0;
    console.error('Gaststätten konnten nicht geladen werden:', error);
    setRestaurantMessage('Gaststätten konnten momentan nicht geladen werden.', true);
  }
}

function clearRestaurants() {
  restaurantsVisible = false;
  restaurantsLayer.clearLayers();
  setRestaurantMessage('Gaststätten ausgeblendet');
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
      if (container.hidden) closeSearchPanel();
      container.hidden = !container.hidden;
      menuButton.classList.toggle('isActive', !container.hidden);
      menuButton.setAttribute('aria-expanded', String(!container.hidden));
    });

    const tools = [
      ['previousTracks', '🟡 Bereits gefahrene Strecken', togglePreviousTracks],
      ['seamark', '⚓ OpenSeaMap', toggleSeamark],
      ['locks', '🔒 Schleusen', () => toggleHazard('lock')],
      ['weirs', '⚠️ Wehre', () => toggleHazard('weir')],
      ['navigation', '🧭 Navigation', () => setNavigationEnabled(!navigationEnabled)]
    ];

    tools.forEach(([name, text, handler]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.setAttribute('aria-pressed', 'false');
      L.DomEvent.on(button, 'click', handler);
      mapModeButtons[name] = button;
      container.appendChild(button);
    });

    const hazardStatus = document.createElement('div');
    hazardStatus.className = 'mapToolStatus';
    hazardStatus.hidden = true;
    container.appendChild(hazardStatus);
    searchControlElements.hazardStatus = hazardStatus;

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
    const restaurantActions = document.createElement('div');
    restaurantActions.className = 'restaurantActions';
    const restaurantLoad = document.createElement('button');
    restaurantLoad.type = 'button';
    restaurantLoad.textContent = '🍽 Gaststätten am Wasser';
    const restaurantClear = document.createElement('button');
    restaurantClear.type = 'button';
    restaurantClear.textContent = 'Ausblenden';
    restaurantActions.append(restaurantLoad, restaurantClear);
    const searchStatus = document.createElement('div');
    searchStatus.className = 'searchStatus';
    const restaurantStatus = document.createElement('div');
    restaurantStatus.className = 'restaurantStatus';
    const searchResults = document.createElement('div');
    searchResults.className = 'searchResults';
    searchRow.append(searchInput, searchSubmit);
    searchPanel.append(searchRow, restaurantActions, searchStatus,
      restaurantStatus, searchResults);
    wrapper.append(searchButton, searchPanel);

    searchControlElements = {
      ...searchControlElements,
      button: searchButton,
      panel: searchPanel,
      input: searchInput,
      submit: searchSubmit,
      searchStatus,
      restaurantStatus,
      results: searchResults
    };
    L.DomEvent.on(searchButton, 'click', () => {
      if (searchPanel.hidden) closeMapMenu();
      searchPanel.hidden = !searchPanel.hidden;
      searchButton.classList.toggle('isActive', !searchPanel.hidden);
      searchButton.setAttribute('aria-expanded', String(!searchPanel.hidden));
      if (!searchPanel.hidden) searchInput.focus();
    });
    L.DomEvent.on(searchSubmit, 'click', searchMap);
    L.DomEvent.on(restaurantLoad, 'click', () => loadWaterRestaurants(true));
    L.DomEvent.on(restaurantClear, 'click', clearRestaurants);
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
map.on('click', chooseNavigationTarget);
map.on('click', closeMapMenu);
map.on('click', closeSearchPanel);
map.on('moveend zoomend', scheduleHazardLoad);
map.on('moveend zoomend', renderRestaurants);
const initialOverlays = savedMapOverlays();
if (initialOverlays.seamark) seamark.addTo(map);
previousTracksVisible = Boolean(initialOverlays.previousTracks);
setToolButton('seamark', map.hasLayer(seamark));
setToolButton('previousTracks', previousTracksVisible);


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
