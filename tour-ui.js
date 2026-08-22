/* =========================================================
   KAJAKTRACKER – MODERNE TOURENANSICHT
   Version 5

   - Neueste Tour zuerst
   - Einheitlicher Titel: Tour TT.MM.JJJJ
   - Echtes Kajak-Bild
   - Moderne Tourenkarten
   - Detailansicht
   - Ort
   - Bemerkung
   - Bearbeiten
   - GPX Export
   - Löschen

   WICHTIG:
   Die vorhandenen Trackpunkte, Entfernungen, Zeiten,
   Geschwindigkeiten und GPX-Daten werden NICHT verändert.

   Speicher bleibt:
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


  /* =========================================================
     DESIGN
     ========================================================= */

  const style =
    document.createElement(
      'style'
    );


  style.textContent = `

    /* =====================================================
       FAHRTENLISTE
       ===================================================== */

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
       KLEINE ICONS
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
       DETAILANSICHT
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


    /* =====================================================
       HEADER DETAIL
       ===================================================== */

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


    /* =====================================================
       KARTE
       ===================================================== */

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
       INFORMATIONS-KARTEN
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


    .tourEditBtn {
      border: 1.5px solid #56a8b3;

      color: #08728b;
    }


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
       BEARBEITEN-DIALOG
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


    .tourEditField input:focus,
    .tourEditField textarea:focus {
      border-color: #56a8b3;

      box-shadow:
        0 0 0 3px
        rgba(86, 168, 179, .14);
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

    @media (
      max-width: 420px
    ) {

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
     SVG ICONS
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
          M5 5
          H19
          M5 10
          H19
          M5 15
          H15
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


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return 0;
    }


    return date.getTime();
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

      return (
        'Datum unbekannt'
      );
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

      String(
        hours
      ).padStart(
        2,
        '0'
      )

      +

      ':'

      +

      String(
        minutes
      ).padStart(
        2,
        '0'
      )

      +

      ':'

      +

      String(
        secs
      ).padStart(
        2,
        '0'
      )
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
        )

        /

        1000
      )

      .toFixed(
        2
      )

      .replace(
        '.',
        ','
      )

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
        )

        *

        3.6
      )

      .toFixed(
        1
      )

      .replace(
        '.',
        ','
      )

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


    if (
      duration <= 0
    ) {
      return 0;
    }


    return (

      (
        Number(
          trip.distance
        ) || 0
      )

      /

      duration
    );
  }


  /* =========================================================
     EINHEITLICHER TOURNAME
     ========================================================= */

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
      ? (
          'Tour ' +
          formatted
        )
      : 'Tour';
  }


  /* =========================================================
     ORT
     ========================================================= */

  function tripLocation(
    trip
  ) {

    const own =
      String(
        trip.locationName ||
        ''
      ).trim();


    if (own) {
      return own;
    }


    /*
      Alte und GPX-importierte Fahrten
      bleiben gültig.

      Automatische Ortsermittlung bauen
      wir später in die Aufzeichnung ein.
    */

    return (
      'Unbekannter Ort'
    );
  }


  /* =========================================================
     BEMERKUNG
     ========================================================= */

  function tripNote(
    trip
  ) {

    return String(
      trip.note ||
      ''
    );
  }


  /* =========================================================
     ENDE DER TOUR
     ========================================================= */

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


    const duration =
      Math.max(
        0,
        Number(
          trip.duration
        ) || 0
      );


    return new Date(

      start.getTime()

      +

      duration * 1000
    );
  }


  /* =========================================================
     HTML ESCAPEN
     ========================================================= */

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
     FAHRT SICHER AKTUALISIEREN

     Ändert NUR:
     - locationName
     - note
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


    /*
      WICHTIG:

      Alle bestehenden Felder bleiben erhalten.

      Insbesondere:
      track
      distance
      duration
      maxSpeed
      averageSpeed
      startedAt
      date
    */

    trips[index] = {

      ...trips[index],

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
     DETAILANSICHT
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
     BEARBEITEN-DIALOG
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
        aria-label="Tour bearbeiten"
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


    editNoteInput
      .addEventListener(
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


    editOverlay
      .addEventListener(
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


    editLocationInput.value =

      trip.locationName

        ?

        String(
          trip.locationName
        )

        :

        '';


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

    if (!editOverlay) {
      return;
    }


    editOverlay.hidden =
      true;
  }


  function saveEditDialog() {

    if (
      !currentDetailId
    ) {
      return;
    }


    let locationName =
      editLocationInput.value
        .trim();


    const note =
      editNoteInput.value
        .slice(
          0,
          1000
        );


    if (!locationName) {

      locationName =
        'Unbekannter Ort';
    }


    const saved =
      updateTripMetadata(

        currentDetailId,

        locationName,

        note
      );


    if (!saved) {

      alert(
        'Die Änderungen konnten nicht gespeichert werden.'
      );

      return;
    }


    closeEditDialog();


    modernRenderTrips();


    /*
      Detailansicht mit aktualisierten
      Daten neu aufbauen.
    */

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
     DETAIL-DOM
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


        <!-- Datum -->

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
              >

                Datum

              </div>

              <div
                class="tourInfoSub"
                data-field="time"
              >

                Uhrzeit

              </div>

            </div>

          </div>

        </div>


        <!-- Ort -->

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
              >

                Unbekannter Ort

              </div>

            </div>

          </div>

        </div>


        <!-- Bemerkung -->

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


        <!-- Aktionen -->

        <div class="tourActionCard">


          <button
            type="button"
            class="tourEditBtn"
          >

            ✎ &nbsp; Bearbeiten

          </button>


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


    /* Zurück */

    detailRoot
      .querySelector(
        '.tourBackBtn'
      )

      .addEventListener(
        'click',
        closeDetail
      );


    /* Bearbeiten */

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


    /* GPX */

    detailRoot
      .querySelector(
        '.tourExportBtn'
      )

      .addEventListener(
        'click',
        function () {

          if (
            !currentDetailId
          ) {
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


    /* Löschen */

    detailRoot
      .querySelector(
        '.tourDeleteBtn'
      )

      .addEventListener(
        'click',
        function () {

          if (
            !currentDetailId
          ) {
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


    if (!trip) {

      alert(
        'Die Tour wurde nicht gefunden.'
      );

      return;
    }


    if (
      !Array.isArray(
        trip.track
      )

      ||

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


    /* Titel */

    detailRoot
      .querySelector(
        '.tourDetailTitle'
      )
      .textContent =
        tripTitle(
          trip
        );


    /* Statistik */

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


    /* Datum */

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
            ? formatClock(
                end
              )
            : '--:--'
        )

        +

        ' Uhr';


    /* Ort */

    detailRoot
      .querySelector(
        '[data-field="location"]'
      )
      .textContent =
        tripLocation(
          trip
        );


    /* Bemerkung */

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
     KARTE ZEICHNEN
     ========================================================= */

  function drawDetailMap(
    trip
  ) {

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

      ).addTo(
        detailMap
      );
    }


    /* Alten Track entfernen */

    if (
      detailTrackLayer
    ) {

      detailMap.removeLayer(
        detailTrackLayer
      );


      detailTrackLayer =
        null;
    }


    /* Startmarker entfernen */

    if (
      detailStartMarker
    ) {

      detailMap.removeLayer(
        detailStartMarker
      );


      detailStartMarker =
        null;
    }


    /* Endmarker entfernen */

    if (
      detailEndMarker
    ) {

      detailMap.removeLayer(
        detailEndMarker
      );


      detailEndMarker =
        null;
    }


    /* Koordinaten */

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


    /* Track */

    detailTrackLayer =
      L.polyline(
        latLngs,
        {
          color:
            '#ff5733',

          weight:
            6,

          opacity:
            .96,

          lineCap:
            'round',

          lineJoin:
            'round'
        }
      )
      .addTo(
        detailMap
      );


    /* Start */

    detailStartMarker =
      L.circleMarker(
        latLngs[0],
        {
          radius: 8,

          weight: 4,

          color:
            '#ffffff',

          fillColor:
            '#24ae59',

          fillOpacity:
            1
        }
      )
      .addTo(
        detailMap
      );


    /* Ende */

    detailEndMarker =
      L.circleMarker(
        latLngs[
          latLngs.length - 1
        ],
        {
          radius: 8,

          weight: 4,

          color:
            '#ffffff',

          fillColor:
            '#ef4035',

          fillOpacity:
            1
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

    if (
      !detailRoot
    ) {
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
      Nur Kopie sortieren.

      Gespeicherte Reihenfolge/Daten
      werden nicht verändert.
    */

    const trips =
      getTrips()

        .slice()

        .sort(
          function (
            a,
            b
          ) {

            return (

              dateValue(
                b
              )

              -

              dateValue(
                a
              )
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


    /* Keine Fahrten */

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


    /* Karten */

    trips.forEach(
      function (
        trip
      ) {

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


        card.dataset.id =
          String(
            trip.id
          );


        card.innerHTML = `

          <!-- Bild -->

          <span class="tourKayakIcon">

            <img
              src="kajak-tour-icon.png"
              alt=""
            >

          </span>


          <!-- Text -->

          <span class="tourListMain">


            <!-- Titel -->

            <span class="tourListTitle">

              ${escapeHtml(
                tripTitle(
                  trip
                )
              )}

            </span>


            <!-- Datum -->

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


            <!-- Entfernung -->

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


            <!-- Ort -->

            <span class="tourListLocation">

              <span class="tourMetaIcon">

                ${pinSvg}

              </span>

              <span>

                ${escapeHtml(
                  location
                )}

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


          <!-- Pfeil -->

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
     BESTEHENDE ANZEIGEFUNKTIONEN ERSETZEN
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
