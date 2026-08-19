const CENTER = [14.149, 51.835];
const BOUNDS = [[13.7128759639545, 51.5655066475027], [14.5851240360455, 52.1044933524973]];
const status = document.querySelector('#status');
const locateButton = document.querySelector('#locate');

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
const archiveUrl = new URL('data/spreewald-z10-15.pmtiles', location.href).href;

const style = {
  version: 8,
  glyphs: `${new URL('vendor/fonts/', location.href).href}{fontstack}/{range}.pbf`,
  sources: {
    spreewald: { type: 'vector', url: `pmtiles://${archiveUrl}`, attribution: '© OpenStreetMap contributors · © OpenMapTiles' }
  },
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
};

const map = new maplibregl.Map({
  container: 'map', style, center: CENTER, zoom: 11.3, minZoom: 10, maxZoom: 15,
  maxBounds: BOUNDS, attributionControl: false
});
window.offlineMap = map;
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

function circleGeoJSON(center, radiusKm, steps = 128) {
  const [lon, lat] = center;
  const latRadius = radiusKm / 111.32;
  const lonRadius = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  const coordinates = [];
  for (let i = 0; i <= steps; i++) {
    const angle = 2 * Math.PI * i / steps;
    coordinates.push([lon + lonRadius * Math.cos(angle), lat + latRadius * Math.sin(angle)]);
  }
  return { type: 'Feature', properties: { radius_km: radiusKm }, geometry: { type: 'Polygon', coordinates: [coordinates] } };
}

map.on('load', () => {
  map.addSource('test-area', { type: 'geojson', data: circleGeoJSON(CENTER, 30) });
  map.addLayer({ id: 'test-area-fill', type: 'fill', source: 'test-area', paint: { 'fill-color': '#176c5d', 'fill-opacity': .035 } });
  map.addLayer({ id: 'test-area-line', type: 'line', source: 'test-area', paint: { 'line-color': '#176c5d', 'line-width': 2, 'line-dasharray': [3, 2] } });
  status.textContent = 'PMTiles lokal geladen · Zoom 10–15 · 30-km-Bereich markiert';
});
map.on('error', event => { status.textContent = `Kartenfehler: ${event.error?.message || 'unbekannt'}`; });

let gpsMarker;
locateButton.addEventListener('click', () => {
  if (!navigator.geolocation) { status.textContent = 'Standortbestimmung wird nicht unterstützt.'; return; }
  locateButton.disabled = true;
  status.textContent = 'Standort wird bestimmt …';
  navigator.geolocation.getCurrentPosition(position => {
    const here = [position.coords.longitude, position.coords.latitude];
    if (!gpsMarker) {
      const element = document.createElement('div');
      element.className = 'gps-marker';
      gpsMarker = new maplibregl.Marker({ element }).setLngLat(here).addTo(map);
    } else gpsMarker.setLngLat(here);
    map.easeTo({ center: here, zoom: Math.max(map.getZoom(), 14) });
    status.textContent = `Standort ±${Math.round(position.coords.accuracy)} m`;
    locateButton.disabled = false;
  }, error => {
    status.textContent = `Standort nicht verfügbar: ${error.message}`;
    locateButton.disabled = false;
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
});
