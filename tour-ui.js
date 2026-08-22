/* =========================================================
   KAJAKTRACKER – MODERNE TOURENANSICHT
   Version 3

   - Neueste Tour zuerst
   - Einheitliche Namen: Tour TT.MM.JJJJ
   - Kajak-Symbol
   - Moderne Tourenkarten
   - Detailansicht
   - GPX Export
   - Löschen

   Die eigentliche Aufzeichnung und der GPX-Import
   werden NICHT verändert.
   ========================================================= */

(function () {
  'use strict';

  if (typeof getTrips !== 'function') {
    console.error('Tour-UI: getTrips() ist nicht verfügbar.');
    return;
  }


  /* =========================================================
     DESIGN
     ========================================================= */

  const style = document.createElement('style');

  style.textContent = `

    /* ---------- Tourenbereich ---------- */

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


    /* ---------- Tour Karte ---------- */

    .tourListCard {
      display: grid;
      grid-template-columns: 68px 1fr 26px;
      align-items: center;

      gap: 14px;

      width: 100%;

      margin: 0 0 14px;
      padding: 18px 15px;

      border: 1px solid #edf1f2;
      border-radius: 20px;

      background: #ffffff;

      box-shadow:
        0 3px 10px rgba(24, 63, 85, .10);

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
        0 2px 6px rgba(24, 63, 85, .10);
    }


    /* ---------- Kajak Symbol ---------- */

    .tourKayakIcon {
      display: grid;

      width: 68px;
      height: 68px;

      place-items: center;

      border-radius: 18px;

      background:
        linear-gradient(
          145deg,
          #e9f6f7,
          #dceff1
        );

      color: #08728b;
    }

    .tourKayakIcon svg {
      width: 48px;
      height: 48px;
      display: block;
    }


    /* ---------- Text ---------- */

    .tourListMain {
      display: block;
      min-width: 0;
    }

    .tourListTitle {
      display: block;

      margin-bottom: 7px;

      overflow: hidden;

      color: #183f55;

      font-size: 20px;
      font-weight: 900;

      line-height: 1.15;

      text-overflow: ellipsis;
      white-space: nowrap;
    }


    /* ---------- Datum ---------- */

    .tourListDate {
      display: flex;
      align-items: center;

      gap: 7px;

      margin-top: 4px;

      color: #365f75;

      font-size: 14px;
      font-weight: 750;

      line-height: 1.35;
    }


    /* ---------- Entfernung ---------- */

    .tourListDistance {
      display: flex;
      align-items: center;

      gap: 7px;

      margin-top: 5px;

      color: #43a5ad;

      font-size: 16px;
      font-weight: 900;

      line-height: 1.3;
    }


    /* ---------- Kleine Icons ---------- */

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


    /* ---------- Pfeil rechts ---------- */

    .tourChevron {
      display: block;

      color: #165b78;

      font-size: 32px;
      font-weight: 400;

      line-height: 1;

      text-align: center;
    }


    /* =========================================================
       DETAILANSICHT
       ========================================================= */

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


    /* ---------- Kopf ---------- */

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
        max(10px, env(safe-area-inset-top))
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


    /* ---------- Karte ---------- */

    .tourDetailMap {
      width: 100%;

      height: min(53vh, 470px);

      min-height: 310px;

      background: #dfe9e5;
    }


    /* ---------- Inhalt ---------- */

    .tourDetailBody {
      padding:
        18px
        14px
        calc(30px + env(safe-area-inset-bottom));

      background: #f7f9fa;
    }


    /* ---------- Statistik ---------- */

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
        0 3px 10px rgba(24, 63, 85, .07);
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


    /* ---------- Datum Detail ---------- */

    .tourDateCard {
      margin-top: 15px;

      padding: 18px;

      border: 1px solid #e1eaec;

      border-radius: 18px;

      background: white;

      box-shadow:
        0 3px 10px rgba(24, 63, 85, .07);

      color: #183f55;

      font-size: 17px;
      font-weight: 850;

      line-height: 1.45;
    }

    .tourDateRow {
      display: flex;

      align-items: center;

      gap: 12px;
    }

    .tourDateBigIcon {
      display: grid;

      width: 36px;
      height: 36px;

      place-items: center;

      color: #08728b;
    }

    .tourDateBigIcon svg {
      width: 28px;
      height: 28px;
    }

    .tourDateText small {
      display: block;

      margin-top: 3px;

      color: #607c88;

      font-size: 13px;
      font-weight: 700;
    }


    /* ---------- Beschreibung ---------- */

    .tourDescriptionCard {
      margin-top: 15px;

      padding: 18px;

      border: 1px solid #e1eaec;

      border-radius: 18px;

      background: white;

      box-shadow:
        0 3px 10px rgba(24, 63, 85, .07);
    }

    .tourDescriptionTitle {
      display: flex;

      align-items: center;

      gap: 10px;

      color: #183f55;

      font-size: 17px;
      font-weight: 900;
    }

    .tourDescriptionText {
      margin-top: 12px;

      color: #183f55;

      font-size: 15px;
      font-weight: 650;
    }


    /* ---------- Aktionen ---------- */

    .tourActionCard {
      display: grid;

      gap: 11px;

      margin-top: 16px;
    }

    .tourActionCard button {
      width: 100%;

      min-height: 54px;

      border-radius: 15px;

      background: white;

      font-size: 15px;
      font-weight: 850;

      cursor: pointer;
    }

    .tourExportBtn {
      border: 1.5px solid #56a8b3;

      color: #08728b;
    }

    .tourDeleteBtn {
      border: 1.5px solid #ef7772;

      color: #d33b35;
    }


    /* ---------- Smartphone ---------- */

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

      .tourKayakIcon svg {
        width: 43px;
        height: 43px;
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
    }

  `;

  document.head.appendChild(style);


  /* =========================================================
     KAJAK ICON
     ========================================================= */

  const kayakSvg = `
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
    >

      <!-- Paddler Kopf -->
      <circle
        cx="30"
        cy="20"
        r="4.5"
        fill="currentColor"
      />

      <!-- Körper -->
      <path
        d="
          M30 25
          C27 28 25 32 24 36
          L34 37
          C35 33 35 29 33 26
          Z
        "
        fill="currentColor"
      />

      <!-- Arm -->
      <path
        d="
          M30 27
          L39 22
        "
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
      />

      <!-- Paddel Stange -->
      <path
        d="
          M17 45
          L47 15
        "
        fill="none"
        stroke="currentColor"
        stroke-width="3.5"
        stroke-linecap="round"
      />

      <!-- Paddel Blatt oben -->
      <path
        d="
          M45 17
          C47 12 51 10 54 11
          C55 14 53 18 49 21
          Z
        "
        fill="currentColor"
      />

      <!-- Paddel Blatt unten -->
      <path
        d="
          M19 43
          C16 47 12 49 9 48
          C8 45 10 41 14 39
          Z
        "
        fill="currentColor"
      />

      <!-- Kajak -->
      <path
        d="
          M8 41
          C18 44 26 45 34 44
          C43 43 50 40 57 37
          C54 44 47 49 37 51
          C25 53 15 49 8 41
          Z
        "
        fill="currentColor"
      />

      <!-- Aussparung / Cockpit -->
      <ellipse
        cx="31"
        cy="43"
        rx="7"
        ry="2.4"
        fill="#e5f3f4"
      />

    </svg>
  `;


  /* =========================================================
     KLEINE ICONS
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
        d="M7 3v4M17 3v4M3 10h18"
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
        d="M7 7v5M10 7v3M13 7v5M16 7v3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      />
    </svg>
  `;


  /* =========================================================
     FORMATIERUNG
     ========================================================= */

  function getTripStart(trip) {
    return (
      trip.startedAt ||
      trip.startTime ||
      trip.date ||
      trip.timestamp ||
      null
    );
  }


  function dateValue(trip) {

    const value =
      getTripStart(trip);

    if (!value) {
      return 0;
    }

    const d =
      new Date(value);

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return 0;
    }

    return d.getTime();
  }


  function formatDateLong(value) {

    const d =
      new Date(value);

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return 'Datum unbekannt';
    }

    return d.toLocaleDateString(
      'de-DE',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }
    );
  }


  function formatDateShort(value) {

    const d =
      new Date(value);

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return '';
    }

    return d.toLocaleDateString(
      'de-DE',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }
    );
  }


  function formatClock(value) {

    const d =
      new Date(value);

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return '--:--';
    }

    return d.toLocaleTimeString(
      'de-DE',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    );
  }


  function formatDuration(seconds) {

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
        (total % 3600) / 60
      );

    const secs =
      total % 60;

    return (
      String(hours).padStart(2, '0') +
      ':' +
      String(minutes).padStart(2, '0') +
      ':' +
      String(secs).padStart(2, '0')
    );
  }


  function formatKm(meters) {

    return (
      (
        Math.max(
          0,
          Number(meters) || 0
        ) / 1000
      )
        .toFixed(2)
        .replace('.', ',') +
      ' km'
    );
  }


  function formatKmh(ms) {

    return (
      (
        Math.max(
          0,
          Number(ms) || 0
        ) * 3.6
      )
        .toFixed(1)
        .replace('.', ',') +
      ' km/h'
    );
  }


  function tripAverage(trip) {

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


  /* =========================================================
     EINHEITLICHER TOURENNAME
     ========================================================= */

  function tripTitle(trip) {

    const start =
      getTripStart(trip);

    const formatted =
      formatDateShort(start);

    if (!formatted) {
      return 'Tour';
    }

    return (
      'Tour ' +
      formatted
    );
  }


  /* =========================================================
     ENDE DER TOUR BERECHNEN
     ========================================================= */

  function tripEndTime(trip) {

    const start =
      new Date(
        getTripStart(trip)
      );

    if (
      Number.isNaN(
        start.getTime()
      )
    ) {
      return null;
    }

    const duration =
      Math.max(
        0,
        Number(
          trip.duration
        ) || 0
      );

    return new Date(
      start.getTime() +
      duration * 1000
    );
  }


  function escapeHtml(value) {

    return String(value)

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
     DETAILANSICHT
     ========================================================= */

  let detailRoot = null;

  let detailMap = null;

  let detailTrackLayer = null;

  let detailStartMarker = null;

  let detailEndMarker = null;

  let currentDetailId = null;


  function ensureDetail() {

    if (detailRoot) {
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
          aria-label="Zurück"
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
            >
              0,00 km
            </div>

          </div>


          <div class="tourStat">

            <div class="tourStatLabel">
              Dauer
            </div>

            <div
              class="tourStatValue"
              data-field="duration"
            >
              00:00:00
            </div>

          </div>


          <div class="tourStat">

            <div class="tourStatLabel">
              Ø Geschwindigkeit
            </div>

            <div
              class="tourStatValue"
              data-field="average"
            >
              0,0 km/h
            </div>

          </div>


          <div class="tourStat">

            <div class="tourStatLabel">
              Max. Geschwindigkeit
            </div>

            <div
              class="tourStatValue"
              data-field="max"
            >
              0,0 km/h
            </div>

          </div>


        </div>


        <div class="tourDateCard">

          <div class="tourDateRow">

            <div class="tourDateBigIcon">
              ${calendarSvg}
            </div>

            <div class="tourDateText">

              <div data-field="date">
                Datum
              </div>

              <small data-field="time">
                Uhrzeit
              </small>

            </div>

          </div>

        </div>


        <div class="tourDescriptionCard">

          <div class="tourDescriptionTitle">

            <span>
              ☰
            </span>

            <span>
              Beschreibung
            </span>

          </div>

          <div
            class="tourDescriptionText"
            data-field="description"
          >
            Tour
          </div>

        </div>


        <div class="tourActionCard">

          <button
            type="button"
            class="tourExportBtn"
          >
            ⇩ &nbsp; GPX exportieren
          </button>

          <button
            type="button"
            class="tourDeleteBtn"
          >
            🗑 &nbsp; Tour löschen
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
        '.tourExportBtn'
      )
      .addEventListener(
        'click',
        function () {

          if (!currentDetailId) {
            return;
          }

          if (
            typeof exportSavedTrip ===
            'function'
          ) {

            exportSavedTrip(
              currentDetailId
            );

          } else {

            alert(
              'GPX-Export ist für diese Tour nicht verfügbar.'
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

          if (!currentDetailId) {
            return;
          }

          if (
            typeof deleteTrip !==
            'function'
          ) {
            return;
          }

          const ok =
            confirm(
              'Möchtest du diese Tour wirklich löschen?'
            );

          if (!ok) {
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

  function openDetail(id) {

    const trip =
      getTrips().find(
        function (item) {

          return (
            String(item.id) ===
            String(id)
          );
        }
      );


    if (!trip) {

      alert(
        'Die Tour wurde nicht gefunden.'
      );

      return;
    }


    if (
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


    const title =
      tripTitle(trip);


    detailRoot
      .querySelector(
        '.tourDetailTitle'
      )
      .textContent =
        title;


    detailRoot
      .querySelector(
        '[data-field="description"]'
      )
      .textContent =
        title;


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
        ) +
        ' – ' +
        (
          end
            ? formatClock(end)
            : '--:--'
        ) +
        ' Uhr';


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
     KARTE ZEICHNEN
     ========================================================= */

  function drawDetailMap(trip) {

    if (
      typeof L ===
      'undefined'
    ) {

      console.error(
        'Leaflet ist nicht geladen.'
      );

      return;
    }


    if (!detailMap) {

      detailMap =
        L.map(
          'tourDetailMap',
          {
            zoomControl: true,
            attributionControl: true
          }
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


    if (detailTrackLayer) {

      detailMap.removeLayer(
        detailTrackLayer
      );

      detailTrackLayer =
        null;
    }


    if (detailStartMarker) {

      detailMap.removeLayer(
        detailStartMarker
      );

      detailStartMarker =
        null;
    }


    if (detailEndMarker) {

      detailMap.removeLayer(
        detailEndMarker
      );

      detailEndMarker =
        null;
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
              ) &&
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


    /* Roter / orangefarbener Track */

    detailTrackLayer =
      L.polyline(
        latLngs,
        {
          color: '#ff5733',

          weight: 6,

          opacity: .96,

          lineCap: 'round',

          lineJoin: 'round'
        }
      )
      .addTo(
        detailMap
      );


    /* Startpunkt */

    detailStartMarker =
      L.circleMarker(
        latLngs[0],
        {
          radius: 8,

          weight: 4,

          color: '#ffffff',

          fillColor: '#24ae59',

          fillOpacity: 1
        }
      )
      .addTo(
        detailMap
      );


    /* Endpunkt */

    detailEndMarker =
      L.circleMarker(
        latLngs[
          latLngs.length - 1
        ],
        {
          radius: 8,

          weight: 4,

          color: '#ffffff',

          fillColor: '#ef4035',

          fillOpacity: 1
        }
      )
      .addTo(
        detailMap
      );


    detailMap.fitBounds(
      L.latLngBounds(
        latLngs
      ),
      {
        padding: [
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


  /* =========================================================
     DETAIL SCHLIESSEN
     ========================================================= */

  function closeDetail() {

    if (!detailRoot) {
      return;
    }


    detailRoot.hidden =
      true;


    document.body.style.overflow =
      '';


    currentDetailId =
      null;
  }


  /* =========================================================
     TOURENLISTE
     ========================================================= */

  function modernRenderTrips() {

    /*
       WICHTIG:
       slice() erstellt nur eine Kopie.
       Die gespeicherten Daten selbst werden NICHT verändert.
    */

    const trips =
      getTrips()
        .slice()
        .sort(
          function (a, b) {

            return (
              dateValue(b) -
              dateValue(a)
            );
          }
        );


    const container =
      document.getElementById(
        'tripsList'
      );


    if (!container) {
      return;
    }


    container.replaceChildren();


    /* Keine Fahrten */

    if (!trips.length) {

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


    /* Touren erzeugen */

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


        const card =
          document.createElement(
            'button'
          );


        card.type =
          'button';


        card.className =
          'tourListCard';


        card.dataset.id =
          String(
            trip.id
          );


        card.innerHTML = `

          <span class="tourKayakIcon">

            ${kayakSvg}

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
                    ? formatClock(
                        end
                      )
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
  }


  /* =========================================================
     BESTEHENDE FUNKTION ERSETZEN
     ========================================================= */

  window.renderTrips =
    modernRenderTrips;


  window.viewTrip =
    openDetail;


  /* =========================================================
     START
     ========================================================= */

  modernRenderTrips();

})();
