/* =========================================================
   KAJAKTRACKER – MODERNE TOURENANSICHT
   Version 7

   - Neueste Tour zuerst
   - Einheitlicher Titel: Tour TT.MM.JJJJ
   - Echtes Kajak-Bild
   - Moderne Tourenkarten
   - Detailansicht
   - Ort
   - Automatische Ortsermittlung im Hintergrund
   - Startpunkt der Tour für Ortsbestimmung
   - Orts-Cache
   - Bemerkung
   - Bearbeiten
   - GPX Export
   - Löschen

   WICHTIG:
   Trackpunkte, Entfernungen, Zeiten,
   Geschwindigkeiten und GPX-Daten werden NICHT verändert.

   Fahrtenspeicher:
   localStorage -> kajakTrips
   ========================================================= */

(function () {
  'use strict';


  /* =========================================================
     PRÜFUNG
     ========================================================= */

  if (typeof getTrips !== 'function') {

    console.error(
      'Tour-UI: getTrips() ist nicht verfügbar.'
    );

    return;
  }


  const STORAGE_KEY =
    typeof TRIPS_STORAGE_KEY !== 'undefined'
      ? TRIPS_STORAGE_KEY
      : 'kajakTrips';


  const LOCATION_CACHE_KEY =
    'kajakTripLocationCacheV1';


  const LOCATION_REQUEST_DELAY =
    1300;


  const locationRequests =
    new Map();


  let autoLocationRunning =
    false;


  let autoLocationRequested =
    false;


  /* =========================================================
     DESIGN
     ========================================================= */

  const style =
    document.createElement(
      'style'
    );


  style.textContent = `

    .tripsPanel {
      padding: 18px 14px 32px !important;
      background: #f7f9fa !important;
    }

    .tripsHeader {
      margin-bottom: 16px;
      padding: 0 2px;
    }

    .tripsHeader h2 {
      color: #183f55;
      font-size: 26px !important;
      font-weight: 900;
    }


    /* =====================================================
       TOURENKARTE
       ===================================================== */

    .tourListCard {
      display: grid;

      grid-template-columns:
        68px
        1fr
        26px;

      align-items: center;

      gap: 14px;

      width: 100%;

      margin: 0 0 14px;

      padding: 18px 15px;

      border: 1px solid #edf1f2;

      border-radius: 20px;

      background: #ffffff;

      box-shadow:
        0 3px 10px
        rgba(24, 63, 85, .10);

      color: #183f55;

      text-align: left;

      cursor: pointer;

      transition:
        transform .12s ease,
        box-shadow .12s ease;
    }


    .tourListCard:active {
      transform: scale(.985);

      box-shadow:
        0 2px 6px
        rgba(24, 63, 85, .10);
    }


    /* =====================================================
       KAJAK-BILD
       ===================================================== */

    .tourKayakIcon {
      display: block;

      width: 68px;
      height: 68px;

      overflow: hidden;

      border-radius: 18px;

      background: #e7f4f5;
    }


    .tourKayakIcon img {
      display: block;

      width: 100%;
      height: 100%;

      object-fit: cover;

      border-radius: 18px;
    }


    /* =====================================================
       TEXT
       ===================================================== */

    .tourListMain {
      display: block;
      min-width: 0;
    }


    .tourListTitle {
      display: block;

      margin-bottom: 6px;

      overflow: hidden;

      color: #183f55;

      font-size: 20px;
      font-weight: 900;

      line-height: 1.15;

      text-overflow: ellipsis;
      white-space: nowrap;
    }


    .tourListDate,
    .tourListDistance,
    .tourListLocation {
      display: flex;

      align-items: center;

      gap: 7px;

      margin-top: 4px;

      line-height: 1.35;
    }


    .tourListDate {
      color: #365f75;

      font-size: 14px;
      font-weight: 750;
    }


    .tourListDistance {
      color: #43a5ad;

      font-size: 16px;
      font-weight: 900;
    }


    .tourListLocation {
      color: #4d7783;

      font-size: 13px;
      font-weight: 750;
    }


    .tourListLocation.isLoading {
      color: #8aa0a8;
      font-style: italic;
    }


    .tourListNote {
      display: -webkit-box;

      margin-top: 7px;

      overflow: hidden;

      color: #69838d;

      font-size: 12px;
      font-weight: 650;

      line-height: 1.35;

      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }


    /* =====================================================
       ICONS
       ===================================================== */

    .tourMetaIcon {
      display: inline-grid;

      width: 19px;
      min-width: 19px;
      height: 19px;

      place-items: center;

      color: #08728b;
    }


    .tourMetaIcon svg {
      width: 18px;
      height: 18px;
    }


    .tourChevron {
      display: block;

      color: #165b78;

      font-size: 32px;
      font-weight: 400;

      line-height: 1;

      text-align: center;
    }


    /* =====================================================
       DETAIL
       ===================================================== */

    .tourDetail {
      position: fixed;

      inset: 0;

      z-index: 9999;

      overflow-y: auto;

      overscroll-behavior: contain;

      background: #f7f9fa;

      color: #183f55;

      -webkit-overflow-scrolling: touch;
    }


    .tourDetail[hidden] {
      display: none !important;
    }


    .tourDetailHeader {
      position: sticky;

      top: 0;

      z-index: 10000;

      display: grid;

      grid-template-columns:
        52px
        1fr
        52px;

      align-items: center;

      min-height: 72px;

      padding:
        max(
          10px,
          env(safe-area-inset-top)
        )
        10px
        10px;

      background: #56a8b3;

      color: white;
    }


    .tourDetailHeader button {
      display: grid;

      width: 48px;
      height: 48px;

      padding: 0;

      place-items: center;

      border: 0;

      background: transparent;

      color: white;

      font-size: 38px;

      cursor: pointer;
    }


    .tourDetailTitle {
      overflow: hidden;

      padding: 0 6px;

      color: white;

      font-size: 22px;
      font-weight: 900;

      text-align: center;

      text-overflow: ellipsis;
      white-space: nowrap;
    }


    .tourDetailMap {
      width: 100%;

      height: min(53vh, 470px);

      min-height: 310px;

      background: #dfe9e5;
    }


    .tourDetailBody {
      padding:
        18px
        14px
        calc(
          30px +
          env(safe-area-inset-bottom)
        );

      background: #f7f9fa;
    }


    /* =====================================================
       STATISTIK
       ===================================================== */

    .tourStatsCard {
      display: grid;

      grid-template-columns:
        1fr
        1fr;

      overflow: hidden;

      border: 1px solid #d9e8eb;

      border-radius: 21px;

      background: white;

      box-shadow:
        0 3px 10px
        rgba(24, 63, 85, .07);
    }


    .tourStat {
      padding: 20px 10px;

      text-align: center;
    }


    .tourStat:nth-child(odd) {
      border-right:
        1px solid #d9e8eb;
    }


    .tourStat:nth-child(n+3) {
      border-top:
        1px solid #d9e8eb;
    }


    .tourStatLabel {
      margin-bottom: 7px;

      color: #08728b;

      font-size: 13px;
      font-weight: 850;
    }


    .tourStatValue {
      color: #183f55;

      font-size: 25px;
      font-weight: 950;

      line-height: 1.15;
    }


    /* =====================================================
       INFO
       ===================================================== */

    .tourInfoCard {
      margin-top: 15px;

      padding: 18px;

      border: 1px solid #e1eaec;

      border-radius: 18px;

      background: white;

      box-shadow:
        0 3px 10px
        rgba(24, 63, 85, .07);
    }


    .tourInfoRow {
      display: flex;

      align-items: flex-start;

      gap: 12px;
    }


    .tourInfoIcon {
      display: grid;

      width: 34px;
      min-width: 34px;
      height: 34px;

      place-items: center;

      color: #08728b;
    }


    .tourInfoIcon svg {
      width: 27px;
      height: 27px;
    }


    .tourInfoContent {
      min-width: 0;
      flex: 1;
    }


    .tourInfoLabel {
      color: #4d7b86;

      font-size: 12px;
      font-weight: 800;
    }


    .tourInfoValue {
      margin-top: 2px;

      color: #183f55;

      font-size: 17px;
      font-weight: 900;

      overflow-wrap: anywhere;
    }


    .tourInfoSub {
      margin-top: 3px;

      color: #607c88;

      font-size: 13px;
      font-weight: 700;
    }


    /* =====================================================
       BEMERKUNG
       ===================================================== */

    .tourNoteCard {
      margin-top: 15px;

      padding: 18px;

      border: 1px solid #e1eaec;

      border-radius: 18px;

      background: white;

      box-shadow:
        0 3px 10px
        rgba(24, 63, 85, .07);
    }


    .tourNoteHeader {
      display: flex;

      align-items: center;

      gap: 10px;

      color: #183f55;

      font-size: 17px;
      font-weight: 900;
    }


    .tourNoteText {
      margin-top: 12px;

      color: #385866;

      font-size: 15px;
      font-weight: 600;

      line-height: 1.5;

      white-space: pre-wrap;

      overflow-wrap: anywhere;
    }


    .tourNoteText.isEmpty {
      color: #8aa0a8;

      font-style: italic;
      font-weight: 600;
    }


    /* =====================================================
       AKTIONEN
       ===================================================== */

    .tourActionCard {
      display: grid;

      grid-template-columns:
        1fr
        1fr;

      gap: 10px;

      margin-top: 16px;
    }


    .tourActionCard button {
      width: 100%;

      min-height: 52px;

      padding: 10px;

      border-radius: 15px;

      background: white;

      font-size: 14px;
      font-weight: 850;

      cursor: pointer;
    }


    .tourEditBtn,
    .tourExportBtn {
      border: 1.5px solid #56a8b3;

      color: #08728b;
    }


    .tourDeleteBtn {
      grid-column: 1 / -1;

      border: 1.5px solid #ef7772;

      color: #d33b35;
    }


    /* =====================================================
       BEARBEITEN
       ===================================================== */

    .tourEditOverlay {
      position: fixed;

      inset: 0;

      z-index: 20000;

      display: flex;

      align-items: center;
      justify-content: center;

      padding:
        max(
          18px,
          env(safe-area-inset-top)
        )
        18px
        max(
          18px,
          env(safe-area-inset-bottom)
        );

      background:
        rgba(12, 37, 49, .45);

      backdrop-filter:
        blur(4px);

      -webkit-backdrop-filter:
        blur(4px);
    }


    .tourEditOverlay[hidden] {
      display: none !important;
    }


    .tourEditDialog {
      width: min(
        100%,
        520px
      );

      max-height: 90vh;

      overflow-y: auto;

      padding: 20px;

      border-radius: 22px;

      background: white;

      box-shadow:
        0 15px 45px
        rgba(0, 0, 0, .22);
    }


    .tourEditTitle {
      color: #183f55;

      font-size: 22px;
      font-weight: 900;
    }


    .tourEditSubtitle {
      margin-top: 5px;
      margin-bottom: 18px;

      color: #66818b;

      font-size: 13px;
      font-weight: 650;
    }


    .tourEditField {
      display: block;

      margin-top: 15px;

      color: #315967;

      font-size: 13px;
      font-weight: 850;
    }


    .tourEditField input,
    .tourEditField textarea {
      display: block;

      width: 100%;

      margin-top: 7px;

      border:
        1px solid #b9d6db;

      border-radius: 13px;

      background: #ffffff;

      color: #183f55;

      font-family: inherit;

      font-size: 16px;

      outline: none;
    }


    .tourEditField input {
      height: 50px;

      padding: 0 13px;
    }


    .tourEditField textarea {
      min-height: 130px;

      padding: 12px 13px;

      resize: vertical;

      line-height: 1.45;
    }


    .tourEditCounter {
      margin-top: 5px;

      color: #789099;

      font-size: 11px;

      text-align: right;
    }


    .tourEditActions {
      display: grid;

      grid-template-columns:
        1fr
        1fr;

      gap: 10px;

      margin-top: 20px;
    }


    .tourEditActions button {
      min-height: 50px;

      border-radius: 13px;

      font-size: 15px;
      font-weight: 850;
    }


    .tourEditCancel {
      border:
        1px solid #c8dde1;

      background: #ffffff;

      color: #496974;
    }


    .tourEditSave {
      border: 0;

      background: #56a8b3;

      color: #ffffff;
    }


    /* =====================================================
       SMARTPHONE
       ===================================================== */

    @media (max-width: 420px) {

      .tourListCard {
        grid-template-columns:
          60px
          1fr
          22px;

        gap: 11px;

        padding: 16px 12px;
      }


      .tourKayakIcon {
        width: 60px;
        height: 60px;

        border-radius: 16px;
      }


      .tourKayakIcon img {
        border-radius: 16px;
      }


      .tourListTitle {
        font-size: 18px;
      }


      .tourListDate {
        font-size: 13px;
      }


      .tourListDistance {
        font-size: 15px;
      }


      .tourChevron {
        font-size: 28px;
      }


      .tourStatValue {
        font-size: 22px;
      }


      .tourActionCard {
        grid-template-columns: 1fr;
      }


      .tourDeleteBtn {
        grid-column: auto;
      }
    }

  `;


  document.head.appendChild(
    style
  );


  /* =========================================================
     ICONS
     ========================================================= */

  const calendarSvg = `
    <svg viewBox="0 0 24 24">

      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />

      <path
        d="
          M7 3v4
          M17 3v4
          M3 10h18
        "
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />

    </svg>
  `;


  const rulerSvg = `
    <svg viewBox="0 0 24 24">

      <rect
        x="3"
        y="7"
        width="18"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />

      <path
        d="
          M7 7v5
          M10 7v3
          M13 7v5
          M16 7v3
        "
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      />

    </svg>
  `;


  const pinSvg = `
    <svg viewBox="0 0 24 24">

      <path
        d="
          M12 21
          C12 21 5 14.7 5 9
          A7 7 0 0 1 19 9
          C19 14.7 12 21 12 21Z
        "
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />

      <circle
        cx="12"
        cy="9"
        r="2.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />

    </svg>
  `;


  const noteSvg = `
    <svg viewBox="0 0 24 24">

      <path
        d="
          M5 5H19
          M5 10H19
          M5 15H15
        "
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />

    </svg>
  `;


  /* =========================================================
     HILFSFUNKTIONEN
     ========================================================= */

  function sleep(
    milliseconds
  ) {

    return new Promise(
      function (resolve) {

        setTimeout(
          resolve,
          milliseconds
        );
      }
    );
  }


  function getTripStart(
    trip
  ) {

    return (
      trip.startedAt ||
      trip.startTime ||
      trip.date ||
      trip.timestamp ||
      null
    );
  }


  function dateValue(
    trip
  ) {

    const value =
      getTripStart(
        trip
      );


    if (!value) {
      return 0;
    }


    const date =
      new Date(
        value
      );


    return Number.isNaN(
      date.getTime()
    )
      ? 0
      : date.getTime();
  }


  function formatDateLong(
    value
  ) {

    const date =
      new Date(
        value
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return 'Datum unbekannt';
    }


    return date
      .toLocaleDateString(
        'de-DE',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }
      );
  }


  function formatDateShort(
    value
  ) {

    const date =
      new Date(
        value
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '';
    }


    return date
      .toLocaleDateString(
        'de-DE',
        {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }
      );
  }


  function formatClock(
    value
  ) {

    const date =
      new Date(
        value
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return '--:--';
    }


    return date
      .toLocaleTimeString(
        'de-DE',
        {
          hour: '2-digit',
          minute: '2-digit'
        }
      );
  }


  function formatDuration(
    seconds
  ) {

    const total =
      Math.max(
        0,
        Math.round(
          Number(seconds) || 0
        )
      );


    const hours =
      Math.floor(
        total / 3600
      );


    const minutes =
      Math.floor(
        (
          total % 3600
        ) / 60
      );


    const secs =
      total % 60;


    return (
      String(hours)
        .padStart(2, '0')
      +
      ':'
      +
      String(minutes)
        .padStart(2, '0')
      +
      ':'
      +
      String(secs)
        .padStart(2, '0')
    );
  }


  function formatKm(
    meters
  ) {

    return (
      (
        Math.max(
          0,
          Number(meters) || 0
        ) / 1000
      )
      .toFixed(2)
      .replace('.', ',')
      +
      ' km'
    );
  }


  function formatKmh(
    ms
  ) {

    return (
      (
        Math.max(
          0,
          Number(ms) || 0
        ) * 3.6
      )
      .toFixed(1)
      .replace('.', ',')
      +
      ' km/h'
    );
  }


  function tripAverage(
    trip
  ) {

    if (
      Number.isFinite(
        Number(
          trip.averageSpeed
        )
      )
    ) {
      return Number(
        trip.averageSpeed
      );
    }


    const duration =
      Number(
        trip.duration
      ) || 0;


    if (duration <= 0) {
      return 0;
    }


    return (
      Number(
        trip.distance
      ) || 0
    ) / duration;
  }


  function tripTitle(
    trip
  ) {

    const formatted =
      formatDateShort(
        getTripStart(
          trip
        )
      );


    return formatted
      ? 'Tour ' + formatted
      : 'Tour';
  }


  function tripLocation(
    trip
  ) {

    const value =
      String(
        trip.locationName ||
        ''
      ).trim();


    if (
      value &&
      value !==
        'Unbekannter Ort'
    ) {

      return value;
    }


    return 'Unbekannter Ort';
  }


  function tripNote(
    trip
  ) {

    return String(
      trip.note ||
      ''
    );
  }


  function tripEndTime(
    trip
  ) {

    const start =
      new Date(
        getTripStart(
          trip
        )
      );


    if (
      Number.isNaN(
        start.getTime()
      )
    ) {
      return null;
    }


    return new Date(

      start.getTime()

      +

      Math.max(
        0,
        Number(
          trip.duration
        ) || 0
      )

      * 1000
    );
  }


  function escapeHtml(
    value
  ) {

    return String(
      value
    )
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
      )
      .replace(
        /"/g,
        '&quot;'
      )
      .replace(
        /'/g,
        '&#039;'
      );
  }


  /* =========================================================
     ORTS-CACHE
     ========================================================= */

  function loadLocationCache() {

    try {

      const result =
        JSON.parse(
          localStorage.getItem(
            LOCATION_CACHE_KEY
          ) || '{}'
        );


      return (
        result &&
        typeof result ===
          'object'
      )
        ? result
        : {};

    } catch (error) {

      console.error(
        'Ortscache konnte nicht gelesen werden:',
        error
      );


      return {};
    }
  }


  function saveLocationCache(
    cache
  ) {

    try {

      localStorage.setItem(

        LOCATION_CACHE_KEY,

        JSON.stringify(
          cache
        )
      );

    } catch (error) {

      console.error(
        'Ortscache konnte nicht gespeichert werden:',
        error
      );
    }
  }


  /* =========================================================
     STARTPUNKT
     ========================================================= */

  function firstTrackPoint(
    trip
  ) {

    if (
      !trip ||
      !Array.isArray(
        trip.track
      )
    ) {

      return null;
    }


    return (
      trip.track.find(
        function (point) {

          return (
            Number.isFinite(
              Number(
                point.lat
              )
            )
            &&
            Number.isFinite(
              Number(
                point.lon
              )
            )
          );
        }
      )
      ||
      null
    );
  }


  function locationCacheKey(
    lat,
    lon
  ) {

    return (
      Number(lat)
        .toFixed(4)
      +
      ','
      +
      Number(lon)
        .toFixed(4)
    );
  }


  /* =========================================================
     NOMINATIM DATEN
     ========================================================= */

  function locationNameFromNominatim(
    data
  ) {

    const address =
      data &&
      data.address
        ? data.address
        : {};


    return (
      address.village
      ||
      address.town
      ||
      address.city
      ||
      address.hamlet
      ||
      address.municipality
      ||
      address.suburb
      ||
      address.city_district
      ||
      address.county
      ||
      ''
    );
  }


  /* =========================================================
     REVERSE GEOCODING
     ========================================================= */

  async function reverseGeocodeTrip(
    trip
  ) {

    const existing =
      String(
        trip.locationName ||
        ''
      ).trim();


    if (
      existing &&
      existing !==
        'Unbekannter Ort'
    ) {

      return existing;
    }


    const point =
      firstTrackPoint(
        trip
      );


    if (!point) {

      return 'Unbekannter Ort';
    }


    if (
      typeof navigator !==
        'undefined'
      &&
      navigator.onLine ===
        false
    ) {

      return 'Unbekannter Ort';
    }


    const lat =
      Number(
        point.lat
      );


    const lon =
      Number(
        point.lon
      );


    const cacheKey =
      locationCacheKey(
        lat,
        lon
      );


    const cache =
      loadLocationCache();


    if (
      cache[
        cacheKey
      ]
    ) {

      return cache[
        cacheKey
      ];
    }


    if (
      locationRequests.has(
        cacheKey
      )
    ) {

      return locationRequests.get(
        cacheKey
      );
    }


    const request =
      (async function () {

        try {

          let baseUrl =
            'https://nominatim.openstreetmap.org/reverse';


          if (
            typeof NOMINATIM_URL !==
              'undefined'
            &&
            NOMINATIM_URL
          ) {

            baseUrl =
              String(
                NOMINATIM_URL
              )
              .replace(
                /\/search\/?$/,
                '/reverse'
              );
          }


          const params =
            new URLSearchParams(
              {
                format:
                  'jsonv2',

                lat:
                  String(lat),

                lon:
                  String(lon),

                zoom:
                  '10',

                addressdetails:
                  '1',

                'accept-language':
                  'de'
              }
            );


          const response =
            await fetch(
              baseUrl
              +
              '?'
              +
              params.toString(),
              {
                headers: {
                  Accept:
                    'application/json'
                }
              }
            );


          if (!response.ok) {

            throw new Error(
              'Nominatim HTTP '
              +
              response.status
            );
          }


          const data =
            await response.json();


          const name =
            String(
              locationNameFromNominatim(
                data
              )
            ).trim();


          if (!name) {

            return 'Unbekannter Ort';
          }


          cache[
            cacheKey
          ] =
            name;


          saveLocationCache(
            cache
          );


          return name;

        } catch (error) {

          console.error(
            'Ort konnte nicht automatisch ermittelt werden:',
            error
          );


          return 'Unbekannter Ort';

        } finally {

          locationRequests.delete(
            cacheKey
          );
        }
      })();


    locationRequests.set(
      cacheKey,
      request
    );


    return request;
  }


  /* =========================================================
     METADATEN SPEICHERN
     ========================================================= */

  function updateTripMetadata(
    id,
    locationName,
    note
  ) {

    let trips;


    try {

      trips =
        JSON.parse(
          localStorage.getItem(
            STORAGE_KEY
          ) || '[]'
        );

    } catch (error) {

      console.error(
        'Fahrten konnten nicht gelesen werden:',
        error
      );


      return false;
    }


    if (
      !Array.isArray(
        trips
      )
    ) {

      return false;
    }


    const index =
      trips.findIndex(
        function (trip) {

          return (
            String(
              trip.id
            )
            ===
            String(
              id
            )
          );
        }
      );


    if (
      index < 0
    ) {

      return false;
    }


    trips[
      index
    ] = {

      ...trips[
        index
      ],

      locationName:
        String(
          locationName ||
          ''
        )
        .trim()
        .slice(
          0,
          120
        ),

      note:
        String(
          note ||
          ''
        )
        .slice(
          0,
          1000
        )
    };


    try {

      localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(
          trips
        )
      );


      return true;

    } catch (error) {

      console.error(
        'Fahrt konnte nicht gespeichert werden:',
        error
      );


      return false;
    }
  }


  /* =========================================================
     EINZELNEN ORT ERMITTELN
     ========================================================= */

  async function fillTripLocationIfMissing(
    trip,
    refreshList
  ) {

    if (!trip) {
      return false;
    }


    const existing =
      String(
        trip.locationName ||
        ''
      ).trim();


    if (
      existing &&
      existing !==
        'Unbekannter Ort'
    ) {

      return false;
    }


    const name =
      await reverseGeocodeTrip(
        trip
      );


    if (
      !name ||
      name ===
        'Unbekannter Ort'
    ) {

      return false;
    }


    const saved =
      updateTripMetadata(

        trip.id,

        name,

        tripNote(
          trip
        )
      );


    if (!saved) {

      return false;
    }


    if (
      refreshList !==
        false
    ) {

      modernRenderTrips(
        false
      );
    }


    if (
      detailRoot &&
      !detailRoot.hidden &&
      String(
        currentDetailId
      )
      ===
      String(
        trip.id
      )
    ) {

      const element =
        detailRoot.querySelector(
          '[data-field="location"]'
        );


      if (element) {

        element.textContent =
          name;
      }
    }


    return true;
  }


  /* =========================================================
     ALLE FEHLENDEN ORTE HINTERGRUND
     ========================================================= */

  function requestAutomaticLocations() {

    if (
      autoLocationRunning
    ) {

      autoLocationRequested =
        true;

      return;
    }


    /*
      Nicht sofort beim Rendern loslaufen,
      sondern kurz warten.
    */

    setTimeout(
      processAutomaticLocations,
      350
    );
  }


  async function processAutomaticLocations() {

    if (
      autoLocationRunning
    ) {

      autoLocationRequested =
        true;

      return;
    }


    if (
      typeof navigator !==
        'undefined'
      &&
      navigator.onLine ===
        false
    ) {

      return;
    }


    autoLocationRunning =
      true;


    autoLocationRequested =
      false;


    try {

      while (true) {

        const trips =
          getTrips();


        const trip =
          trips.find(
            function (item) {

              const location =
                String(
                  item.locationName ||
                  ''
                ).trim();


              return (
                (
                  !location
                  ||
                  location ===
                    'Unbekannter Ort'
                )
                &&
                firstTrackPoint(
                  item
                )
              );
            }
          );


        if (!trip) {
          break;
        }


        const before =
          String(
            trip.locationName ||
            ''
          );


        const changed =
          await fillTripLocationIfMissing(
            trip,
            false
          );


        /*
          Wenn nichts ermittelt werden konnte,
          diesen Eintrag für diesen Durchlauf
          nicht endlos erneut abfragen.
        */

        if (!changed) {

          const tripsNow =
            getTrips();


          const current =
            tripsNow.find(
              function (item) {

                return (
                  String(item.id)
                  ===
                  String(trip.id)
                );
              }
            );


          if (
            current &&
            String(
              current.locationName ||
              ''
            )
            === before
          ) {

            /*
              Die Tour erhält für diesen
              App-Lauf keine weitere Anfrage.
            */

            current.__skipAutoLocation =
              true;
          }
        }


        modernRenderTrips(
          false
        );


        await sleep(
          LOCATION_REQUEST_DELAY
        );


        /*
          Temporäre Skip-Markierungen sind
          nicht gespeichert, sondern nur in
          den gerade gelesenen Objekten.
          Deshalb zusätzlich prüfen, ob noch
          online.
        */

        if (
          typeof navigator !==
            'undefined'
          &&
          navigator.onLine ===
            false
        ) {

          break;
        }


        /*
          Verhindert, dass ein dauerhaft
          nicht auflösbarer Track endlos
          wiederholt wird.
        */

        const remaining =
          getTrips().filter(
            function (item) {

              const location =
                String(
                  item.locationName ||
                  ''
                ).trim();


              return (
                (
                  !location
                  ||
                  location ===
                    'Unbekannter Ort'
                )
                &&
                firstTrackPoint(
                  item
                )
              );
            }
          );


        if (!remaining.length) {
          break;
        }


        /*
          Wenn nur dieselbe nicht auflösbare
          Tour übrig ist, diesen Lauf beenden.
        */

        if (
          remaining.length === 1
          &&
          String(
            remaining[0].id
          )
          ===
          String(
            trip.id
          )
          &&
          !changed
        ) {

          break;
        }
      }

    } finally {

      autoLocationRunning =
        false;


      if (
        autoLocationRequested
      ) {

        autoLocationRequested =
          false;


        requestAutomaticLocations();
      }
    }
  }


  /* =========================================================
     DETAIL
     ========================================================= */

  let detailRoot =
    null;


  let detailMap =
    null;


  let detailTrackLayer =
    null;


  let detailStartMarker =
    null;


  let detailEndMarker =
    null;


  let currentDetailId =
    null;


  /* =========================================================
     BEARBEITEN DIALOG
     ========================================================= */

  let editOverlay =
    null;


  let editLocationInput =
    null;


  let editNoteInput =
    null;


  let editCounter =
    null;


  function ensureEditDialog() {

    if (
      editOverlay
    ) {

      return;
    }


    editOverlay =
      document.createElement(
        'div'
      );


    editOverlay.className =
      'tourEditOverlay';


    editOverlay.hidden =
      true;


    editOverlay.innerHTML = `

      <div
        class="tourEditDialog"
        role="dialog"
        aria-modal="true"
      >

        <div class="tourEditTitle">

          Tour bearbeiten

        </div>


        <div class="tourEditSubtitle">

          Ort und Bemerkung können geändert werden.
          Der GPS-Track bleibt unverändert.

        </div>


        <label class="tourEditField">

          Ort

          <input
            type="text"
            class="tourEditLocation"
            maxlength="120"
            autocomplete="off"
            placeholder="z. B. Leipe"
          >

        </label>


        <label class="tourEditField">

          Bemerkung

          <textarea
            class="tourEditNote"
            maxlength="1000"
            placeholder="Optional – z. B. schöne Runde durch die Fließe."
          ></textarea>

        </label>


        <div class="tourEditCounter">

          0 / 1000

        </div>


        <div class="tourEditActions">

          <button
            type="button"
            class="tourEditCancel"
          >

            Abbrechen

          </button>


          <button
            type="button"
            class="tourEditSave"
          >

            Speichern

          </button>

        </div>

      </div>
    `;


    document.body.appendChild(
      editOverlay
    );


    editLocationInput =
      editOverlay.querySelector(
        '.tourEditLocation'
      );


    editNoteInput =
      editOverlay.querySelector(
        '.tourEditNote'
      );


    editCounter =
      editOverlay.querySelector(
        '.tourEditCounter'
      );


    editNoteInput.addEventListener(
      'input',
      function () {

        editCounter.textContent =
          editNoteInput.value.length
          +
          ' / 1000';
      }
    );


    editOverlay
      .querySelector(
        '.tourEditCancel'
      )
      .addEventListener(
        'click',
        closeEditDialog
      );


    editOverlay
      .querySelector(
        '.tourEditSave'
      )
      .addEventListener(
        'click',
        saveEditDialog
      );


    editOverlay.addEventListener(
      'click',
      function (event) {

        if (
          event.target ===
          editOverlay
        ) {

          closeEditDialog();
        }
      }
    );
  }


  function openEditDialog(
    id
  ) {

    const trip =
      getTrips().find(
        function (item) {

          return (
            String(
              item.id
            )
            ===
            String(
              id
            )
          );
        }
      );


    if (!trip) {

      alert(
        'Die Tour wurde nicht gefunden.'
      );

      return;
    }


    ensureEditDialog();


    currentDetailId =
      String(
        trip.id
      );


    const location =
      tripLocation(
        trip
      );


    editLocationInput.value =
      location ===
        'Unbekannter Ort'
        ? ''
        : location;


    editNoteInput.value =
      tripNote(
        trip
      );


    editCounter.textContent =
      editNoteInput.value.length
      +
      ' / 1000';


    editOverlay.hidden =
      false;


    setTimeout(
      function () {

        editLocationInput.focus();

      },
      100
    );
  }


  function closeEditDialog() {

    if (
      editOverlay
    ) {

      editOverlay.hidden =
        true;
    }
  }


  function saveEditDialog() {

    if (
      !currentDetailId
    ) {

      return;
    }


    let location =
      editLocationInput.value
        .trim();


    if (!location) {

      location =
        'Unbekannter Ort';
    }


    const note =
      editNoteInput.value
        .slice(
          0,
          1000
        );


    if (
      !updateTripMetadata(
        currentDetailId,
        location,
        note
      )
    ) {

      alert(
        'Die Änderungen konnten nicht gespeichert werden.'
      );

      return;
    }


    closeEditDialog();


    modernRenderTrips();


    if (
      detailRoot &&
      !detailRoot.hidden
    ) {

      openDetail(
        currentDetailId
      );
    }
  }


  /* =========================================================
     DETAIL DOM
     ========================================================= */

  function ensureDetail() {

    if (
      detailRoot
    ) {

      return;
    }


    detailRoot =
      document.createElement(
        'section'
      );


    detailRoot.className =
      'tourDetail';


    detailRoot.hidden =
      true;


    detailRoot.innerHTML = `

      <header class="tourDetailHeader">

        <button
          type="button"
          class="tourBackBtn"
        >
          ‹
        </button>


        <div class="tourDetailTitle">

          Tour

        </div>


        <div></div>

      </header>


      <div
        id="tourDetailMap"
        class="tourDetailMap"
      ></div>


      <div class="tourDetailBody">


        <div class="tourStatsCard">

          <div class="tourStat">

            <div class="tourStatLabel">
              Distanz
            </div>

            <div
              class="tourStatValue"
              data-field="distance"
            ></div>

          </div>


          <div class="tourStat">

            <div class="tourStatLabel">
              Dauer
            </div>

            <div
              class="tourStatValue"
              data-field="duration"
            ></div>

          </div>


          <div class="tourStat">

            <div class="tourStatLabel">
              Ø Geschwindigkeit
            </div>

            <div
              class="tourStatValue"
              data-field="average"
            ></div>

          </div>


          <div class="tourStat">

            <div class="tourStatLabel">
              Max. Geschwindigkeit
            </div>

            <div
              class="tourStatValue"
              data-field="max"
            ></div>

          </div>

        </div>


        <div class="tourInfoCard">

          <div class="tourInfoRow">

            <div class="tourInfoIcon">
              ${calendarSvg}
            </div>

            <div class="tourInfoContent">

              <div class="tourInfoLabel">
                Datum
              </div>

              <div
                class="tourInfoValue"
                data-field="date"
              ></div>

              <div
                class="tourInfoSub"
                data-field="time"
              ></div>

            </div>

          </div>

        </div>


        <div class="tourInfoCard">

          <div class="tourInfoRow">

            <div class="tourInfoIcon">
              ${pinSvg}
            </div>

            <div class="tourInfoContent">

              <div class="tourInfoLabel">
                Ort
              </div>

              <div
                class="tourInfoValue"
                data-field="location"
              ></div>

            </div>

          </div>

        </div>


        <div class="tourNoteCard">

          <div class="tourNoteHeader">

            <span class="tourInfoIcon">
              ${noteSvg}
            </span>

            <span>
              Bemerkung
            </span>

          </div>

          <div
            class="tourNoteText"
            data-field="note"
          ></div>

        </div>


        <div class="tourActionCard">

          <button
            type="button"
            class="tourEditBtn"
          >
            ✎ Bearbeiten
          </button>


          <button
            type="button"
            class="tourExportBtn"
          >
            ⇩ GPX exportieren
          </button>


          <button
            type="button"
            class="tourDeleteBtn"
          >
            🗑 Tour löschen
          </button>

        </div>

      </div>
    `;


    document.body.appendChild(
      detailRoot
    );


    detailRoot
      .querySelector(
        '.tourBackBtn'
      )
      .addEventListener(
        'click',
        closeDetail
      );


    detailRoot
      .querySelector(
        '.tourEditBtn'
      )
      .addEventListener(
        'click',
        function () {

          if (
            currentDetailId
          ) {

            openEditDialog(
              currentDetailId
            );
          }
        }
      );


    detailRoot
      .querySelector(
        '.tourExportBtn'
      )
      .addEventListener(
        'click',
        function () {

          if (
            currentDetailId &&
            typeof exportSavedTrip ===
              'function'
          ) {

            exportSavedTrip(
              currentDetailId
            );
          }
        }
      );


    detailRoot
      .querySelector(
        '.tourDeleteBtn'
      )
      .addEventListener(
        'click',
        function () {

          if (
            !currentDetailId ||
            typeof deleteTrip !==
              'function'
          ) {

            return;
          }


          if (
            !confirm(
              'Möchtest du diese Tour wirklich löschen?'
            )
          ) {

            return;
          }


          deleteTrip(
            currentDetailId
          );


          closeDetail();


          modernRenderTrips();
        }
      );
  }


  /* =========================================================
     TOUR ÖFFNEN
     ========================================================= */

  function openDetail(
    id
  ) {

    const trip =
      getTrips().find(
        function (item) {

          return (
            String(
              item.id
            )
            ===
            String(
              id
            )
          );
        }
      );


    if (
      !trip ||
      !Array.isArray(
        trip.track
      ) ||
      trip.track.length < 2
    ) {

      alert(
        'Diese Fahrt enthält keine ausreichenden GPS-Daten.'
      );

      return;
    }


    ensureDetail();


    currentDetailId =
      String(
        trip.id
      );


    detailRoot
      .querySelector(
        '.tourDetailTitle'
      )
      .textContent =
        tripTitle(
          trip
        );


    detailRoot
      .querySelector(
        '[data-field="distance"]'
      )
      .textContent =
        formatKm(
          trip.distance
        );


    detailRoot
      .querySelector(
        '[data-field="duration"]'
      )
      .textContent =
        formatDuration(
          trip.duration
        );


    detailRoot
      .querySelector(
        '[data-field="average"]'
      )
      .textContent =
        formatKmh(
          tripAverage(
            trip
          )
        );


    detailRoot
      .querySelector(
        '[data-field="max"]'
      )
      .textContent =
        formatKmh(
          trip.maxSpeed
        );


    const start =
      getTripStart(
        trip
      );


    const end =
      tripEndTime(
        trip
      );


    detailRoot
      .querySelector(
        '[data-field="date"]'
      )
      .textContent =
        formatDateLong(
          start
        );


    detailRoot
      .querySelector(
        '[data-field="time"]'
      )
      .textContent =
        formatClock(
          start
        )
        +
        ' – '
        +
        (
          end
            ? formatClock(end)
            : '--:--'
        )
        +
        ' Uhr';


    detailRoot
      .querySelector(
        '[data-field="location"]'
      )
      .textContent =
        tripLocation(
          trip
        );


    const note =
      tripNote(
        trip
      );


    const noteElement =
      detailRoot.querySelector(
        '[data-field="note"]'
      );


    if (
      note.trim()
    ) {

      noteElement.textContent =
        note;

      noteElement.classList.remove(
        'isEmpty'
      );

    } else {

      noteElement.textContent =
        'Keine Bemerkung eingetragen.';

      noteElement.classList.add(
        'isEmpty'
      );
    }


    detailRoot.hidden =
      false;


    document.body.style.overflow =
      'hidden';


    requestAnimationFrame(
      function () {

        drawDetailMap(
          trip
        );
      }
    );
  }


  /* =========================================================
     DETAILKARTE
     ========================================================= */

  function drawDetailMap(
    trip
  ) {

    if (
      typeof L ===
      'undefined'
    ) {

      return;
    }


    if (
      !detailMap
    ) {

      detailMap =
        L.map(
          'tourDetailMap'
        );


      L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,

          attribution:
            '&copy; OpenStreetMap contributors'
        }
      )
      .addTo(
        detailMap
      );
    }


    if (
      detailTrackLayer
    ) {

      detailMap.removeLayer(
        detailTrackLayer
      );
    }


    if (
      detailStartMarker
    ) {

      detailMap.removeLayer(
        detailStartMarker
      );
    }


    if (
      detailEndMarker
    ) {

      detailMap.removeLayer(
        detailEndMarker
      );
    }


    const latLngs =
      trip.track

        .filter(
          function (point) {

            return (
              Number.isFinite(
                Number(
                  point.lat
                )
              )
              &&
              Number.isFinite(
                Number(
                  point.lon
                )
              )
            );
          }
        )

        .map(
          function (point) {

            return [
              Number(
                point.lat
              ),
              Number(
                point.lon
              )
            ];
          }
        );


    if (
      latLngs.length < 2
    ) {

      return;
    }


    detailTrackLayer =
      L.polyline(
        latLngs,
        {
          color:
            '#ff5733',

          weight:
            6,

          opacity:
            .96
        }
      )
      .addTo(
        detailMap
      );


    detailStartMarker =
      L.circleMarker(
        latLngs[0],
        {
          radius: 8,

          color:
            '#ffffff',

          weight: 4,

          fillColor:
            '#24ae59',

          fillOpacity: 1
        }
      )
      .addTo(
        detailMap
      );


    detailEndMarker =
      L.circleMarker(
        latLngs[
          latLngs.length - 1
        ],
        {
          radius: 8,

          color:
            '#ffffff',

          weight: 4,

          fillColor:
            '#ef4035',

          fillOpacity: 1
        }
      )
      .addTo(
        detailMap
      );


    detailMap.fitBounds(
      latLngs,
      {
        padding:
          [
            28,
            28
          ]
      }
    );


    setTimeout(
      function () {

        detailMap.invalidateSize();

      },
      100
    );
  }


  function closeDetail() {

    if (
      detailRoot
    ) {

      detailRoot.hidden =
        true;
    }


    document.body.style.overflow =
      '';


    currentDetailId =
      null;
  }


  /* =========================================================
     FAHRTENLISTE
     ========================================================= */

  function modernRenderTrips(
    requestLocations
  ) {

    const trips =
      getTrips()
        .slice()
        .sort(
          function (a, b) {

            return (
              dateValue(b)
              -
              dateValue(a)
            );
          }
        );


    const container =
      document.getElementById(
        'tripsList'
      );


    if (
      !container
    ) {

      return;
    }


    container.replaceChildren();


    if (
      !trips.length
    ) {

      const empty =
        document.createElement(
          'div'
        );


      empty.className =
        'noTrips';


      empty.textContent =
        'Noch keine gespeicherten Fahrten.';


      container.appendChild(
        empty
      );


      return;
    }


    trips.forEach(
      function (trip) {

        const start =
          getTripStart(
            trip
          );


        const end =
          tripEndTime(
            trip
          );


        const location =
          tripLocation(
            trip
          );


        const note =
          tripNote(
            trip
          );


        const card =
          document.createElement(
            'button'
          );


        card.type =
          'button';


        card.className =
          'tourListCard';


        card.innerHTML = `

          <span class="tourKayakIcon">

            <img
              src="kajak-tour-icon.png"
              alt=""
            >

          </span>


          <span class="tourListMain">

            <span class="tourListTitle">

              ${escapeHtml(
                tripTitle(
                  trip
                )
              )}

            </span>


            <span class="tourListDate">

              <span class="tourMetaIcon">
                ${calendarSvg}
              </span>


              <span>

                ${escapeHtml(
                  formatDateLong(
                    start
                  )
                )}

                ,

                ${escapeHtml(
                  formatClock(
                    start
                  )
                )}

                –

                ${escapeHtml(
                  end
                    ? formatClock(end)
                    : '--:--'
                )}

              </span>

            </span>


            <span class="tourListDistance">

              <span class="tourMetaIcon">
                ${rulerSvg}
              </span>


              <span>

                ${escapeHtml(
                  formatKm(
                    trip.distance
                  )
                )}

              </span>

            </span>


            <span
              class="tourListLocation ${
                location ===
                  'Unbekannter Ort'
                  ? 'isLoading'
                  : ''
              }"
            >

              <span class="tourMetaIcon">
                ${pinSvg}
              </span>


              <span>

                ${
                  location ===
                    'Unbekannter Ort'
                    ? 'Ort wird ermittelt …'
                    : escapeHtml(location)
                }

              </span>

            </span>


            ${
              note.trim()
                ?
                `
                  <span class="tourListNote">

                    ${escapeHtml(
                      note
                    )}

                  </span>
                `
                :
                ''
            }

          </span>


          <span class="tourChevron">
            ›
          </span>

        `;


        card.addEventListener(
          'click',
          function () {

            openDetail(
              trip.id
            );
          }
        );


        container.appendChild(
          card
        );
      }
    );


    if (
      requestLocations !==
        false
    ) {

      requestAutomaticLocations();
    }
  }


  /* =========================================================
     BESTEHENDE FUNKTIONEN
     ========================================================= */

  window.renderTrips =
    modernRenderTrips;


  window.viewTrip =
    openDetail;


  /* =========================================================
     ONLINE WIEDER VERFÜGBAR
     ========================================================= */

  window.addEventListener(
    'online',
    function () {

      requestAutomaticLocations();
    }
  );


  /* =========================================================
     START
     ========================================================= */

  modernRenderTrips();

})();
