// ============================================================
// KajakTracker
// GPS-Tracker für Kajakfahrten
// ============================================================

// ------------------------------------------------------------
// Karte initialisieren
// ------------------------------------------------------------

const map = L.map('map', {
  zoomControl: false,
  attributionControl: true
}).setView([52.5, 10.0], 8);

L.control.zoom({
  position: 'bottomright'
}).addTo(map);


// ------------------------------------------------------------
// OpenStreetMap
// ------------------------------------------------------------

const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }
).addTo(map);


// ------------------------------------------------------------
// OpenSeaMap
// ------------------------------------------------------------

const seamark = L.tileLayer(
  'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
  {
    maxZoom: 18,
    opacity: 0.9,
    attribution: 'Seezeichen &copy; OpenSeaMap'
  }
).addTo(map);


// ------------------------------------------------------------
// Karten-Größe korrigieren
// ------------------------------------------------------------

// Wichtig für iPhone / Safari / Flexbox.
// Leaflet muss wissen, wie groß der Kartenbereich
// tatsächlich nach dem Laden ist.

function resizeMap() {
  setTimeout(() => {
    map.invalidateSize(true);
  }, 100);
}

window.addEventListener('load', resizeMap);
window.addEventListener('resize', resizeMap);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeMap);
}


// ------------------------------------------------------------
// Variablen
// ------------------------------------------------------------

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


// ------------------------------------------------------------
// Track-Linie
// ------------------------------------------------------------

let line = L.polyline([], {
  color: '#147aa1',
  weight: 5,
  opacity: 0.9
}).addTo(map);


// ------------------------------------------------------------
// Hilfsfunktionen
// ------------------------------------------------------------

const $ = id => document.getElementById(id);


const fmt = n => {
  return Number(n).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
};


const fmtKm = m => {
  return (Number(m) / 1000).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};


// ------------------------------------------------------------
// Status
// ------------------------------------------------------------

function setStatus(text, cls = 'idle') {

  const status = $('status');

  if (!status) return;

  status.textContent = text;
  status.className = 'status ' + cls;
}


// ------------------------------------------------------------
// Zeit
// ------------------------------------------------------------

function elapsedSeconds() {

  if (!startedAt) {
    return 0;
  }

  const end =
    state === 'recording'
      ? Date.now()
      : (pausedAt || Date.now());

  return Math.max(
    0,
    Math.floor(
      (end - startedAt - accumulatedPause) / 1000
    )
  );
}


// ------------------------------------------------------------
// Timer formatieren
// ------------------------------------------------------------

function timerText(sec) {

  const h = Math.floor(sec / 3600);

  const m = Math.floor(
    (sec % 3600) / 60
  );

  const s = sec % 60;

  return [
    h,
    m,
    s
  ]
    .map(v => String(v).padStart(2, '0'))
    .join(':');
}


// ------------------------------------------------------------
// Benutzeroberfläche aktualisieren
// ------------------------------------------------------------

function updateUI() {

  if ($('timer')) {
    $('timer').textContent =
      timerText(elapsedSeconds());
  }


  if ($('distance')) {
    $('distance').textContent =
      fmtKm(totalDistance) + ' km';
  }


  if ($('speed')) {
    $('speed').textContent =
      fmt(currentSpeed * 3.6) + ' km/h';
  }


  if ($('maxSpeed')) {
    $('maxSpeed').textContent =
      fmt(maxSpeed * 3.6) + ' km/h';
  }


  if ($('points')) {
    $('points').textContent =
      track.length;
  }


  const t = elapsedSeconds();


  if ($('avgSpeed')) {

    $('avgSpeed').textContent =
      t > 0
        ? fmt((totalDistance / t) * 3.6) + ' km/h'
        : '0,0 km/h';
  }
}


// ------------------------------------------------------------
// Track zurücksetzen
// ------------------------------------------------------------

function resetTrack() {

  track = [];

  totalDistance = 0;
  maxSpeed = 0;
  currentSpeed = 0;

  lastPosition = null;

  line.setLatLngs([]);

  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }

  updateUI();
}


// ------------------------------------------------------------
// GPS starten
// ------------------------------------------------------------

function startGPS() {

  if (!navigator.geolocation) {

    alert(
      'Dieses iPhone unterstützt keine Standortbestimmung im Browser.'
    );

    return;
  }


  watchId = navigator.geolocation.watchPosition(
    onPosition,
    onGeoError,
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000
    }
  );
}


// ------------------------------------------------------------
// GPS stoppen
// ------------------------------------------------------------

function stopGPS() {

  if (watchId !== null) {

    navigator.geolocation.clearWatch(
      watchId
    );

    watchId = null;
  }
}


// ------------------------------------------------------------
// GPS Position
// ------------------------------------------------------------

function onPosition(pos) {

  const c = [
    pos.coords.latitude,
    pos.coords.longitude
  ];


  const acc =
    pos.coords.accuracy || 999;


  // Ungenaue GPS-Positionen ignorieren
  if (acc > 40) {
    return;
  }


  // Geschwindigkeit
  currentSpeed = Math.max(
    0,
    pos.coords.speed || 0
  );


  // ----------------------------------------------------------
  // Während der Aufzeichnung
  // ----------------------------------------------------------

  if (state === 'recording') {

    if (lastPosition) {

      const p1 = L.latLng(
        lastPosition[0],
        lastPosition[1]
      );

      const p2 = L.latLng(
        c[0],
        c[1]
      );


      const d =
        p1.distanceTo(p2);


      // Nur sinnvolle GPS-Bewegungen übernehmen
      if (d >= 2 && d < 100) {

        totalDistance += d;


        track.push({
          lat: c[0],
          lon: c[1],
          time: new Date().toISOString(),
          speed: currentSpeed
        });


        line.addLatLng(c);
      }

    } else {

      // Erster Punkt
      track.push({
        lat: c[0],
        lon: c[1],
        time: new Date().toISOString(),
        speed: currentSpeed
      });


      line.addLatLng(c);
    }


    // Höchstgeschwindigkeit
    maxSpeed = Math.max(
      maxSpeed,
      currentSpeed
    );
  }


  // Letzte Position speichern
  lastPosition = c;


  // ----------------------------------------------------------
  // Positionsmarker
  // ----------------------------------------------------------

  if (!marker) {

    marker = L.marker(c).addTo(map);

  } else {

    marker.setLatLng(c);
  }


  // Karte auf aktuelle Position bewegen
  map.setView(
    c,
    Math.max(map.getZoom(), 15),
    {
      animate: true
    }
  );


  updateUI();
}


// ------------------------------------------------------------
// GPS Fehler
// ------------------------------------------------------------

function onGeoError(err) {

  console.log(
    'GPS Fehler:',
    err
  );


  if (err.code === 1) {

    alert(
      'Standortzugriff wurde verweigert. ' +
      'Bitte in den iPhone-Einstellungen den Standort ' +
      'für Safari erlauben.'
    );
  }

  else if (err.code === 2) {

    console.log(
      'Position konnte nicht ermittelt werden.'
    );
  }

  else if (err.code === 3) {

    console.log(
      'Zeitüberschreitung bei der GPS-Abfrage.'
    );
  }
}


// ------------------------------------------------------------
// Fahrt starten
// ------------------------------------------------------------

function start() {

  resetTrack();


  startedAt = Date.now();

  pausedAt = null;

  accumulatedPause = 0;

  state = 'recording';


  setStatus(
    'Aufzeichnung läuft',
    'recording'
  );


  if ($('startBtn')) {
    $('startBtn').disabled = true;
  }


  if ($('pauseBtn')) {
    $('pauseBtn').disabled = false;
  }


  if ($('stopBtn')) {
    $('stopBtn').disabled = false;
  }


  startGPS();


  if (timerId) {
    clearInterval(timerId);
  }


  timerId = setInterval(
    updateUI,
    500
  );


  resizeMap();
}


// ------------------------------------------------------------
// Pause / Weiter
// ------------------------------------------------------------

function pause() {

  // ----------------------------------------------------------
  // Aufzeichnung pausieren
  // ----------------------------------------------------------

  if (state === 'recording') {

    state = 'paused';

    pausedAt = Date.now();

    currentSpeed = 0;


    setStatus(
      'Pausiert',
      'paused'
    );


    if ($('pauseBtn')) {

      $('pauseBtn').textContent =
        '▶ Weiter';
    }


    stopGPS();
  }


  // ----------------------------------------------------------
  // Aufzeichnung fortsetzen
  // ----------------------------------------------------------

  else if (state === 'paused') {

    accumulatedPause +=
      Date.now() - pausedAt;


    pausedAt = null;

    state = 'recording';


    setStatus(
      'Aufzeichnung läuft',
      'recording'
    );


    if ($('pauseBtn')) {

      $('pauseBtn').textContent =
        'Ⅱ Pause';
    }


    startGPS();
  }


  updateUI();
}


// ------------------------------------------------------------
// Fahrt stoppen
// ------------------------------------------------------------

function stop() {

  if (state === 'paused' && pausedAt) {

    accumulatedPause +=
      Date.now() - pausedAt;

    pausedAt = null;
  }


  state = 'idle';

  currentSpeed = 0;


  stopGPS();


  if (timerId) {

    clearInterval(timerId);

    timerId = null;
  }


  setStatus(
    'Fahrt beendet',
    'idle'
  );


  if ($('startBtn')) {
    $('startBtn').disabled = false;
  }


  if ($('pauseBtn')) {
    $('pauseBtn').disabled = true;
    $('pauseBtn').textContent = 'Ⅱ Pause';
  }


  if ($('stopBtn')) {
    $('stopBtn').disabled = true;
  }


  saveTrip();

  updateUI();
}


// ------------------------------------------------------------
// Fahrt speichern
// ------------------------------------------------------------

function saveTrip() {

  if (track.length < 2) {
    return;
  }


  let trips = [];


  try {

    trips = JSON.parse(
      localStorage.getItem('kajakTrips') || '[]'
    );

  } catch (e) {

    console.log(
      'Fehler beim Lesen der gespeicherten Fahrten:',
      e
    );

    trips = [];
  }


  trips.unshift({

    date: new Date().toISOString(),

    duration: elapsedSeconds(),

    distance: totalDistance,

    maxSpeed: maxSpeed,

    track: track

  });


  localStorage.setItem(
    'kajakTrips',
    JSON.stringify(
      trips.slice(0, 50)
    )
  );
}


// ------------------------------------------------------------
// GPX Export
// ------------------------------------------------------------

function exportGPX() {

  if (track.length < 2) {

    alert(
      'Noch keine aufgezeichnete Strecke vorhanden.'
    );

    return;
  }


  const esc = s =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');


  const points = track
    .map(p => {

      return `
<trkpt lat="${p.lat}" lon="${p.lon}">
  <time>${esc(p.time)}</time>
</trkpt>`;

    })
    .join('');


  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx
  version="1.1"
  creator="KajakTracker"
  xmlns="http://www.topografix.com/GPX/1/1">

<trk>
  <name>Kajakfahrt ${esc(
    new Date().toLocaleString('de-DE')
  )}</name>

  <trkseg>
    ${points}
  </trkseg>

</trk>

</gpx>`;


  const blob = new Blob(
    [gpx],
    {
      type: 'application/gpx+xml'
    }
  );


  const url =
    URL.createObjectURL(blob);


  const a =
    document.createElement('a');


  a.href = url;

  a.download =
    'kajakfahrt.gpx';


  document.body.appendChild(a);

  a.click();

  document.body.removeChild(a);


  setTimeout(() => {

    URL.revokeObjectURL(url);

  }, 1000);
}


// ------------------------------------------------------------
// Event-Handler
// ------------------------------------------------------------

if ($('startBtn')) {

  $('startBtn').onclick = start;
}


if ($('pauseBtn')) {

  $('pauseBtn').onclick = pause;
}


if ($('stopBtn')) {

  $('stopBtn').onclick = stop;
}


if ($('exportBtn')) {

  $('exportBtn').onclick = exportGPX;
}


if ($('locateBtn')) {

  $('locateBtn').onclick = () => {

    if (lastPosition) {

      map.setView(
        lastPosition,
        16
      );

    } else {

      navigator.geolocation.getCurrentPosition(
        onPosition,
        onGeoError,
        {
          enableHighAccuracy: true
        }
      );
    }
  };
}


// ------------------------------------------------------------
// Service Worker
// ------------------------------------------------------------

if ('serviceWorker' in navigator) {

  window.addEventListener(
    'load',
    () => {

      navigator.serviceWorker
        .register('sw.js')
        .then(() => {

          console.log(
            'Service Worker registriert'
          );

        })
        .catch(err => {

          console.log(
            'Service Worker Fehler:',
            err
          );
        });
    }
  );
}


// ------------------------------------------------------------
// Initialisierung
// ------------------------------------------------------------

updateUI();


// Leaflet nach dem ersten Rendern neu berechnen lassen
setTimeout(() => {

  map.invalidateSize(true);

}, 300);


// Noch einmal nach kurzer Verzögerung,
// wichtig insbesondere bei Safari/iPhone
setTimeout(() => {

  map.invalidateSize(true);

}, 1000);
