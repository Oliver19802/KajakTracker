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
).addTo(map);


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


/* Aktuelle Strecke */

let line = L.polyline(
  [],
  {
    color: '#147aa1',
    weight: 5
  }
).addTo(map);


/* =========================================================
   HILFSFUNKTIONEN
   ========================================================= */

const $ = id =>
  document.getElementById(id);


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

  maxSpeed = Number(activeTrip.maxSpeed) || 0;

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


  currentSpeed =
    Number.isFinite(reportedSpeed) &&
    reportedSpeed >= 0
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
          !(
            Number.isFinite(reportedSpeed) &&
            reportedSpeed >= 0
          ) &&
          previousPoint
        ) {

          const seconds =
            (
              new Date(pointTime) -
              new Date(previousPoint.time)
            ) / 1000;


          if (seconds > 0) {

            currentSpeed =
              d / seconds;
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
              trip.date
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


  /*
    Aktuelle Linie löschen.
  */

  line.setLatLngs([]);


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

  line.setLatLngs(
    latLngs
  );


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


/*
  Leaflet braucht manchmal nach dem
  Laden auf dem iPhone einen
  invalidateSize().
*/

setTimeout(
  () => map.invalidateSize(),
  500
);
