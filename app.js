/* =========================================================
   KajakTracker
   ========================================================= */


/* ---------------------------------------------------------
   Karte
   --------------------------------------------------------- */

const map = L.map('map', {
  zoomControl: false
}).setView([52.5, 10.0], 8);

L.control.zoom({
  position: 'bottomright'
}).addTo(map);


/* OpenStreetMap */

L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }
).addTo(map);


/* OpenSeaMap */

L.tileLayer(
  'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
  {
    maxZoom: 18,
    opacity: 0.9,
    attribution: 'Seezeichen &copy; OpenSeaMap'
  }
).addTo(map);


/* ---------------------------------------------------------
   Variablen
   --------------------------------------------------------- */

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

let line = L.polyline([], {
  color: '#147aa1',
  weight: 5
}).addTo(map);


/* ---------------------------------------------------------
   Hilfsfunktionen
   --------------------------------------------------------- */

const $ = id => document.getElementById(id);


const fmt = n =>
  n.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });


const fmtKm = m =>
  (m / 1000).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });


/* ---------------------------------------------------------
   Status
   --------------------------------------------------------- */

function setStatus(text, cls = 'idle') {

  $('status').textContent = text;

  $('status').className =
    'status ' + cls;
}


/* ---------------------------------------------------------
   Zeit
   --------------------------------------------------------- */

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
      (
        end -
        startedAt -
        accumulatedPause
      ) / 1000
    )
  );
}


function timerText(sec) {

  const h = Math.floor(sec / 3600);

  const m =
    Math.floor((sec % 3600) / 60);

  const s = sec % 60;

  return [h, m, s]
    .map(v =>
      String(v).padStart(2, '0')
    )
    .join(':');
}


/* ---------------------------------------------------------
   Anzeige aktualisieren
   --------------------------------------------------------- */

function updateUI() {

  $('timer').textContent =
    timerText(elapsedSeconds());


  $('distance').textContent =
    fmtKm(totalDistance) + ' km';


  $('speed').textContent =
    fmt(currentSpeed * 3.6) + ' km/h';


  $('maxSpeed').textContent =
    fmt(maxSpeed * 3.6) + ' km/h';


  $('points').textContent =
    track.length;


  const t = elapsedSeconds();


  $('average').textContent =
    t > 0
      ? fmt((totalDistance / t) * 3.6) + ' km/h'
      : '0,0 km/h';
}


/* ---------------------------------------------------------
   Strecke zurücksetzen
   --------------------------------------------------------- */

function resetTrack() {

  track = [];

  totalDistance = 0;

  maxSpeed = 0;

  currentSpeed = 0;

  lastPosition = null;

  line.setLatLngs([]);

  updateUI();
}


/* ---------------------------------------------------------
   GPS starten
   --------------------------------------------------------- */

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


/* ---------------------------------------------------------
   GPS stoppen
   --------------------------------------------------------- */

function stopGPS() {

  if (watchId !== null) {

    navigator.geolocation.clearWatch(
      watchId
    );

    watchId = null;
  }
}


/* ---------------------------------------------------------
   Neue GPS Position
   --------------------------------------------------------- */

function onPosition(pos) {

  const c = [
    pos.coords.latitude,
    pos.coords.longitude
  ];


  const acc =
    pos.coords.accuracy || 999;


  /* Ungenaue Position ignorieren */

  if (acc > 40) {
    return;
  }


  currentSpeed =
    Math.max(
      0,
      pos.coords.speed || 0
    );


  /* -------------------------------------------------------
     Nur während der Aufzeichnung Strecke speichern
     ------------------------------------------------------- */

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


      /* GPS-Sprünge vermeiden */

      if (
        d >= 2 &&
        d < 100
      ) {

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

      track.push({
        lat: c[0],
        lon: c[1],
        time: new Date().toISOString(),
        speed: currentSpeed
      });


      line.addLatLng(c);
    }


    maxSpeed =
      Math.max(
        maxSpeed,
        currentSpeed
      );
  }


  lastPosition = c;


  /* -------------------------------------------------------
     Positionsmarker
     ------------------------------------------------------- */

  if (!marker) {

    marker =
      L.marker(c)
        .addTo(map);

  } else {

    marker.setLatLng(c);
  }


  /* Karte auf Position zentrieren */

  map.setView(
    c,
    Math.max(map.getZoom(), 15),
    {
      animate: true
    }
  );


  updateUI();
}


/* ---------------------------------------------------------
   GPS Fehler
   --------------------------------------------------------- */

function onGeoError(err) {

  console.log(err);


  if (err.code === 1) {

    alert(
      'Standortzugriff wurde verweigert. Bitte in den iPhone-Einstellungen den Standort für Safari erlauben.'
    );
  }
}


/* ---------------------------------------------------------
   START
   --------------------------------------------------------- */

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


  $('startBtn').disabled = true;

  $('pauseBtn').disabled = false;

  $('stopBtn').disabled = false;


  startGPS();


  timerId =
    setInterval(
      updateUI,
      500
    );
}


/* ---------------------------------------------------------
   PAUSE / WEITER
   --------------------------------------------------------- */

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
  }


  updateUI();
}


/* ---------------------------------------------------------
   STOP
   --------------------------------------------------------- */

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

    clearInterval(timerId);

    timerId = null;
  }


  setStatus(
    'Fahrt beendet',
    'idle'
  );


  $('startBtn').disabled = false;

  $('pauseBtn').disabled = true;

  $('stopBtn').disabled = true;


  $('pauseBtn').textContent =
    'Ⅱ Pause';


  saveTrip();


  updateUI();
}


/* ---------------------------------------------------------
   Fahrt speichern
   --------------------------------------------------------- */

function saveTrip() {

  if (track.length < 2) {
    return;
  }


  const trips =
    JSON.parse(
      localStorage.getItem(
        'kajakTrips'
      ) || '[]'
    );


  trips.unshift({

    date:
      new Date().toISOString(),

    duration:
      elapsedSeconds(),

    distance:
      totalDistance,

    maxSpeed:
      maxSpeed,

    track:
      track

  });


  localStorage.setItem(
    'kajakTrips',
    JSON.stringify(
      trips.slice(0, 50)
    )
  );
}


/* ---------------------------------------------------------
   GPX Export
   --------------------------------------------------------- */

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


  const points =
    track
      .map(p =>
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
  xmlns="http://www.topografix.com/GPX/1/1">

  <trk>
    <name>Kajakfahrt ${new Date().toLocaleString('de-DE')}</name>

    <trkseg>
      ${points}
    </trkseg>

  </trk>

</gpx>`;


  const blob =
    new Blob(
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


  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}


/* ---------------------------------------------------------
   Buttons
   --------------------------------------------------------- */

$('startBtn').onclick =
  start;


$('pauseBtn').onclick =
  pause;


$('stopBtn').onclick =
  stop;


$('gpxBtn').onclick =
  exportGPX;


$('locationBtn').onclick =
  () => {

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


/* ---------------------------------------------------------
   Service Worker
   --------------------------------------------------------- */

if (
  'serviceWorker' in navigator
) {

  window.addEventListener(
    'load',
    () => {

      navigator.serviceWorker
        .register('sw.js')
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


/* ---------------------------------------------------------
   Startanzeige
   --------------------------------------------------------- */

updateUI();


/* Leaflet nach dem Laden korrekt dimensionieren */

setTimeout(
  () => map.invalidateSize(),
  300
);
