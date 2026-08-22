/* =========================================================
   KAJAKTRACKER – DASHBOARD UI
   Version 1

   Optische Anpassung an das gewünschte Design.

   WICHTIG:
   - keine Änderung der GPS-Aufzeichnung
   - keine Änderung der Tourdaten
   - keine Änderung am GPX-Import
   - keine Änderung an Navigation oder Offlinekarten
   ========================================================= */

(function () {
  'use strict';


  /* =========================================================
     CSS
     ========================================================= */

  const style = document.createElement('style');

  style.textContent = `

    :root {
      --kt-dark: #073b5c;
      --kt-dark2: #00547a;
      --kt-blue: #087d9a;
      --kt-teal: #079ba0;
      --kt-green: #98df27;
      --kt-light: #f5f8fa;
      --kt-text: #183f55;
      --kt-orange: #f7a000;
      --kt-red: #ef2529;
    }


    /* =====================================================
       HEADER
       ===================================================== */

    header {
      position: relative !important;

      display: grid !important;

      grid-template-columns:
        82px
        minmax(0, 1fr)
        105px !important;

      align-items: center !important;

      gap: 10px !important;

      min-height: 98px !important;

      padding:
        max(10px, env(safe-area-inset-top))
        12px
        11px !important;

      background:
        linear-gradient(
          135deg,
          #08769b 0%,
          #045479 48%,
          #073b5c 100%
        ) !important;

      box-shadow:
        0 3px 14px
        rgba(0, 42, 67, .28);

      overflow: visible !important;
    }


    /* Altes Text-Logo ausblenden */

    header .title {
      display: none !important;
    }


    /* =====================================================
       LOGO
       ===================================================== */

    .ktHeaderLogoWrap {
      display: flex;

      align-items: center;

      justify-content: flex-start;
    }


    .ktHeaderLogo {
      display: block;

      width: 76px;
      height: 76px;

      object-fit: cover;

      border-radius: 18px;

      box-shadow:
        0 4px 14px
        rgba(0, 0, 0, .28);
    }


    /* =====================================================
       STATUS MIT LIVE-DATEN
       ===================================================== */

    .ktRecordingPanel {
      display: flex;

      flex-direction: column;

      align-items: center;

      justify-content: center;

      min-width: 0;

      min-height: 72px;

      padding:
        8px
        12px;

      border:
        1px solid
        rgba(126, 235, 218, .48);

      border-radius: 28px;

      background:
        linear-gradient(
          180deg,
          rgba(0, 78, 101, .82),
          rgba(0, 52, 78, .86)
        );

      box-shadow:
        inset 0 1px 0
        rgba(255,255,255,.10),
        0 0 16px
        rgba(36, 221, 195, .13);
    }


    .ktRecordingTop {
      display: flex;

      align-items: center;

      justify-content: center;

      gap: 9px;

      min-width: 0;
    }


    .ktRecordingDot {
      width: 18px;
      height: 18px;

      min-width: 18px;

      border: 3px solid #ffffff;

      border-radius: 50%;

      background: #9ade2c;

      box-shadow:
        0 0 0 3px
        rgba(151, 223, 39, .20);
    }


    .ktRecordingPanel.paused
    .ktRecordingDot {
      background: #f7a000;
    }


    .ktRecordingPanel.idle
    .ktRecordingDot {
      background: #b5c0c5;
    }


    .ktRecordingPanel.stopped
    .ktRecordingDot {
      background: #ef4545;
    }


    header .status {
      position: static !important;

      display: block !important;

      width: auto !important;
      max-width: 100% !important;

      margin: 0 !important;

      padding: 0 !important;

      border: 0 !important;

      background: transparent !important;

      box-shadow: none !important;

      color: #ffffff !important;

      font-size: 15px !important;
      font-weight: 900 !important;

      line-height: 1.1 !important;

      text-align: center !important;

      white-space: nowrap !important;

      overflow: hidden !important;

      text-overflow: ellipsis !important;
    }


    .ktRecordingMeta {
      display: flex;

      align-items: center;

      justify-content: center;

      flex-wrap: wrap;

      gap: 5px;

      margin-top: 6px;

      color:
        rgba(255,255,255,.86);

      font-size: 11px;

      font-weight: 750;

      line-height: 1.1;
    }


    .ktMetaSeparator {
      color: #9ade2c;

      font-weight: 900;
    }


    /* =====================================================
       GPS BEREICH
       ===================================================== */

    .gpsHeaderSlot {
      display: flex;

      align-items: center;

      justify-content: flex-end;
    }


    .gpsQualityBadge {
      display: flex;

      flex-direction: column;

      align-items: center;

      justify-content: center;

      width: 100px;

      min-height: 74px;

      padding:
        7px
        8px;

      border:
        1px solid
        rgba(255,255,255,.38);

      border-radius: 17px;

      background:
        rgba(2, 67, 94, .56);

      box-shadow:
        inset 0 1px 0
        rgba(255,255,255,.08);

      color: #ffffff;
    }


    .gpsQualityHeader {
      display: flex;

      align-items: center;

      justify-content: space-between;

      gap: 5px;

      width: 100%;
    }


    .gpsWord {
      color: #ffffff;

      font-size: 13px;

      font-weight: 900;
    }


    .gpsMeters {
      color: #b4ec32;

      font-size: 13px;

      font-weight: 950;

      white-space: nowrap;
    }


    .gpsBars {
      display: flex;

      align-items: flex-end;

      justify-content: center;

      gap: 3px;

      height: 29px;

      margin-top: 5px;
    }


    .gpsBar {
      width: 8px;

      border-radius:
        3px
        3px
        1px
        1px;

      background:
        rgba(255,255,255,.18);
    }


    .gpsBar:nth-child(1) {
      height: 9px;
    }


    .gpsBar:nth-child(2) {
      height: 15px;
    }


    .gpsBar:nth-child(3) {
      height: 21px;
    }


    .gpsBar:nth-child(4) {
      height: 28px;
    }


    .gpsQualityLabel {
      margin-top: 4px;

      color: #b4ec32;

      font-size: 11px;

      font-weight: 900;

      white-space: nowrap;
    }


    .gpsExcellent .gpsBar {
      background: #a4e82d;
    }


    .gpsGood .gpsBar:nth-child(-n+3) {
      background: #a4e82d;
    }


    .gpsModerate .gpsBar:nth-child(-n+2) {
      background: #ffd34c;
    }


    .gpsBad .gpsBar:nth-child(1) {
      background: #ff5a52;
    }


    .gpsWaiting .gpsBar,
    .gpsStale .gpsBar,
    .gpsOff .gpsBar {
      background:
        rgba(255,255,255,.20);
    }


    .gpsModerate .gpsMeters,
    .gpsModerate .gpsQualityLabel {
      color: #ffd34c;
    }


    .gpsBad .gpsMeters,
    .gpsBad .gpsQualityLabel {
      color: #ff716a;
    }


    .gpsWaiting .gpsMeters,
    .gpsWaiting .gpsQualityLabel,
    .gpsStale .gpsMeters,
    .gpsStale .gpsQualityLabel,
    .gpsOff .gpsMeters,
    .gpsOff .gpsQualityLabel {
      color: #d4dde1;
    }


    /* =====================================================
       KARTE
       ===================================================== */

    #map {
      border-radius: 0 !important;
    }


    /* =====================================================
       PANEL
       ===================================================== */

    .panel {
      margin:
        12px
        10px
        0 !important;

      padding:
        14px !important;

      border-radius:
        22px !important;

      background:
        #ffffff !important;

      box-shadow:
        0 4px 16px
        rgba(24, 63, 85, .13) !important;
    }


    /* =====================================================
       GROSSEN TIMER AUSBLENDEN

       Der Timer erscheint jetzt im Header.
       ===================================================== */

    .panel > .timer {
      display: none !important;
    }


    /* =====================================================
       STATISTIK
       ===================================================== */

    .stats {
      display: grid !important;

      grid-template-columns:
        repeat(5, minmax(0, 1fr)) !important;

      gap: 0 !important;

      width: 100%;

      margin: 0 !important;

      padding:
        5px
        0 !important;

      border-radius: 18px;

      background: #ffffff;
    }


    .stats > div {
      position: relative;

      display: flex !important;

      flex-direction: column;

      align-items: center;

      justify-content: center;

      min-width: 0;

      min-height: 89px;

      padding:
        8px
        5px !important;

      text-align: center;
    }


    .stats > div:not(:last-child)::after {
      content: "";

      position: absolute;

      top: 13px;
      right: 0;
      bottom: 13px;

      width: 1px;

      background: #dfe5e8;
    }


    .stats > div::before {
      display: block;

      margin-bottom: 4px;

      color: #087d9a;

      font-size: 24px;

      font-weight: 900;

      line-height: 1;
    }


    .stats > div:nth-child(1)::before {
      content: "●";
      font-size: 18px;
    }


    .stats > div:nth-child(2)::before {
      content: "◴";
    }


    .stats > div:nth-child(3)::before {
      content: "◴";
    }


    .stats > div:nth-child(4)::before {
      content: "◴";
    }


    .stats > div:nth-child(5)::before {
      content: "⌁";
    }


    .stats span {
      color: #50626c !important;

      font-size: 11px !important;

      font-weight: 700 !important;

      line-height: 1.15 !important;

      white-space: normal;
    }


    .stats strong {
      display: block;

      margin-top: 5px;

      color: #17252d !important;

      font-size: 18px !important;

      font-weight: 950 !important;

      line-height: 1.05 !important;

      white-space: nowrap;
    }


    /* =====================================================
       START / PAUSE / STOP
       ===================================================== */

    .buttons {
      display: grid !important;

      grid-template-columns:
        repeat(3, minmax(0, 1fr)) !important;

      gap: 9px !important;

      margin-top:
        14px !important;

      padding:
        10px !important;

      border-radius:
        18px;

      background:
        #f8fafb;

      box-shadow:
        inset 0 0 0 1px
        #edf0f1;
    }


    .buttons button {
      min-height:
        57px !important;

      border: 0 !important;

      border-radius:
        14px !important;

      color:
        #ffffff !important;

      font-size:
        15px !important;

      font-weight:
        900 !important;

      box-shadow:
        0 3px 7px
        rgba(0,0,0,.13);

      transition:
        transform .12s ease,
        filter .12s ease;
    }


    .buttons button:active {
      transform:
        scale(.98);
    }


    #startBtn {
      background:
        linear-gradient(
          180deg,
          #08a6a3,
          #058789
        ) !important;
    }


    #pauseBtn {
      background:
        linear-gradient(
          180deg,
          #ffac00,
          #f09200
        ) !important;
    }


    #stopBtn {
      background:
        linear-gradient(
          180deg,
          #f43538,
          #eb2228
        ) !important;
    }


    .buttons button:disabled {
      opacity: .38 !important;

      filter:
        grayscale(.15);
    }


    /* =====================================================
       SEKUNDÄRE BUTTONS
       ===================================================== */

    .secondaryButtons {
      display: grid !important;

      grid-template-columns:
        repeat(3, minmax(0, 1fr)) !important;

      gap: 9px !important;

      margin-top:
        12px !important;

      padding:
        10px !important;

      border-radius:
        18px;

      background:
        #f8fafb;

      box-shadow:
        inset 0 0 0 1px
        #edf0f1;
    }


    .secondaryButtons button {
      min-height:
        52px !important;

      padding:
        7px
        5px !important;

      border:
        1.5px solid
        #087d9a !important;

      border-radius:
        13px !important;

      background:
        #ffffff !important;

      color:
        #08708b !important;

      font-size:
        13px !important;

      font-weight:
        850 !important;
    }


    /* =====================================================
       GPS TOAST
       ===================================================== */

    .gpsQualityToast {
      position: fixed;

      left: 50%;

      bottom:
        calc(
          20px +
          env(safe-area-inset-bottom)
        );

      z-index: 30000;

      transform:
        translateX(-50%)
        translateY(16px);

      width:
        min(
          calc(100% - 30px),
          420px
        );

      padding:
        11px
        14px;

      border-radius:
        13px;

      background:
        rgba(7, 59, 92, .95);

      color: white;

      box-shadow:
        0 4px 16px
        rgba(0,0,0,.24);

      font-size:
        13px;

      font-weight:
        750;

      text-align:
        center;

      opacity: 0;

      pointer-events: none;

      transition:
        opacity .25s ease,
        transform .25s ease;
    }


    .gpsQualityToast.visible {
      opacity: 1;

      transform:
        translateX(-50%)
        translateY(0);
    }


    /* =====================================================
       SMARTPHONE
       ===================================================== */

    @media (max-width: 500px) {

      header {
        grid-template-columns:
          66px
          minmax(0, 1fr)
          88px !important;

        gap: 7px !important;

        min-height:
          88px !important;

        padding-left:
          8px !important;

        padding-right:
          8px !important;
      }


      .ktHeaderLogo {
        width: 62px;
        height: 62px;

        border-radius: 15px;
      }


      .ktRecordingPanel {
        min-height: 60px;

        padding:
          6px
          7px;

        border-radius:
          22px;
      }


      .ktRecordingDot {
        width: 13px;
        height: 13px;

        min-width: 13px;

        border-width: 2px;
      }


      header .status {
        font-size:
          12px !important;
      }


      .ktRecordingMeta {
        gap: 3px;

        margin-top: 5px;

        font-size: 9px;
      }


      .gpsQualityBadge {
        width: 84px;

        min-height: 61px;

        padding:
          5px
          6px;

        border-radius:
          14px;
      }


      .gpsWord,
      .gpsMeters {
        font-size: 10px;
      }


      .gpsBars {
        height: 22px;

        margin-top: 3px;
      }


      .gpsBar {
        width: 6px;
      }


      .gpsBar:nth-child(1) {
        height: 7px;
      }


      .gpsBar:nth-child(2) {
        height: 11px;
      }


      .gpsBar:nth-child(3) {
        height: 16px;
      }


      .gpsBar:nth-child(4) {
        height: 21px;
      }


      .gpsQualityLabel {
        margin-top: 2px;

        font-size: 9px;
      }


      .panel {
        margin:
          9px
          7px
          0 !important;

        padding:
          9px !important;

        border-radius:
          18px !important;
      }


      .stats > div {
        min-height: 77px;

        padding:
          6px
          2px !important;
      }


      .stats > div::before {
        font-size: 19px;
      }


      .stats span {
        font-size:
          9px !important;
      }


      .stats strong {
        font-size:
          14px !important;
      }


      .buttons {
        gap: 6px !important;

        margin-top:
          9px !important;

        padding:
          7px !important;
      }


      .buttons button {
        min-height:
          50px !important;

        padding:
          5px
          3px !important;

        font-size:
          12px !important;
      }


      .secondaryButtons {
        gap: 6px !important;

        margin-top:
          8px !important;

        padding:
          7px !important;
      }


      .secondaryButtons button {
        min-height:
          47px !important;

        padding:
          5px
          3px !important;

        font-size:
          10px !important;
      }
    }


    @media (max-width: 365px) {

      header {
        grid-template-columns:
          57px
          minmax(0, 1fr)
          79px !important;
      }


      .ktHeaderLogo {
        width: 54px;
        height: 54px;
      }


      .gpsQualityBadge {
        width: 76px;
      }


      .stats strong {
        font-size:
          12px !important;
      }


      .stats span {
        font-size:
          8px !important;
      }
    }

  `;


  document.head.appendChild(
    style
  );


  /* =========================================================
     HEADER AUFBAUEN
     ========================================================= */

  function buildHeader() {

    const header =
      document.querySelector(
        'header'
      );


    const status =
      document.getElementById(
        'status'
      );


    if (
      !header ||
      !status
    ) {
      return;
    }


    if (
      document.getElementById(
        'ktHeaderLogo'
      )
    ) {
      return;
    }


    /* Logo */

    const logoWrap =
      document.createElement(
        'div'
      );


    logoWrap.className =
      'ktHeaderLogoWrap';


    logoWrap.innerHTML = `

      <img
        id="ktHeaderLogo"
        class="ktHeaderLogo"
        src="kajaktracker-logo.png"
        alt="KajakTracker"
      >

    `;


    /* Recording Panel */

    const recordingPanel =
      document.createElement(
        'div'
      );


    recordingPanel.id =
      'ktRecordingPanel';


    recordingPanel.className =
      'ktRecordingPanel idle';


    const recordingTop =
      document.createElement(
        'div'
      );


    recordingTop.className =
      'ktRecordingTop';


    const dot =
      document.createElement(
        'span'
      );


    dot.className =
      'ktRecordingDot';


    /*
      Status wird aus seinem bisherigen
      Platz herausgenommen und hier eingebaut.
    */

    recordingTop.appendChild(
      dot
    );


    recordingTop.appendChild(
      status
    );


    const meta =
      document.createElement(
        'div'
      );


    meta.className =
      'ktRecordingMeta';


    meta.innerHTML = `

      <span id="ktHeaderTime">
        00:00:00
      </span>

      <span class="ktMetaSeparator">
        •
      </span>

      <span id="ktHeaderDistance">
        0,00 km
      </span>

      <span class="ktMetaSeparator">
        •
      </span>

      <span id="ktHeaderPoints">
        0 Punkte
      </span>

    `;


    recordingPanel.appendChild(
      recordingTop
    );


    recordingPanel.appendChild(
      meta
    );


    /* GPS Slot */

    let gpsSlot =
      document.getElementById(
        'gpsHeaderSlot'
      );


    if (!gpsSlot) {

      gpsSlot =
        document.createElement(
          'div'
        );


      gpsSlot.id =
        'gpsHeaderSlot';


      gpsSlot.className =
        'gpsHeaderSlot';
    }


    header.prepend(
      logoWrap
    );


    header.appendChild(
      recordingPanel
    );


    header.appendChild(
      gpsSlot
    );
  }


  /* =========================================================
     LIVE HEADER DATEN
     ========================================================= */

  function copyLiveValues() {

    const timer =
      document.getElementById(
        'timer'
      );


    const distance =
      document.getElementById(
        'distance'
      );


    const points =
      document.getElementById(
        'points'
      );


    const headerTime =
      document.getElementById(
        'ktHeaderTime'
      );


    const headerDistance =
      document.getElementById(
        'ktHeaderDistance'
      );


    const headerPoints =
      document.getElementById(
        'ktHeaderPoints'
      );


    if (
      timer &&
      headerTime
    ) {

      headerTime.textContent =
        timer.textContent;
    }


    if (
      distance &&
      headerDistance
    ) {

      headerDistance.textContent =
        distance.textContent;
    }


    if (
      points &&
      headerPoints
    ) {

      const value =
        points.textContent.trim();


      headerPoints.textContent =
        value +
        (
          value === '1'
            ? ' Punkt'
            : ' Punkte'
        );
    }
  }


  /* =========================================================
     STATUSFARBE
     ========================================================= */

  function updateRecordingState() {

    const status =
      document.getElementById(
        'status'
      );


    const panel =
      document.getElementById(
        'ktRecordingPanel'
      );


    if (
      !status ||
      !panel
    ) {
      return;
    }


    const text =
      status.textContent
        .trim()
        .toLowerCase();


    panel.classList.remove(
      'idle',
      'recording',
      'paused',
      'stopped'
    );


    if (
      text.includes(
        'pause'
      )
    ) {

      panel.classList.add(
        'paused'
      );

      return;
    }


    if (
      text.includes(
        'läuft'
      )
      ||
      text.includes(
        'aufzeichnung'
      )
      ||
      text.includes(
        'fahrt'
      )
    ) {

      panel.classList.add(
        'recording'
      );

      return;
    }


    if (
      text.includes(
        'beendet'
      )
      ||
      text.includes(
        'gestoppt'
      )
    ) {

      panel.classList.add(
        'stopped'
      );

      return;
    }


    panel.classList.add(
      'idle'
    );
  }


  /* =========================================================
     ÄNDERUNGEN BEOBACHTEN
     ========================================================= */

  function installObservers() {

    const values = [
      document.getElementById(
        'timer'
      ),
      document.getElementById(
        'distance'
      ),
      document.getElementById(
        'points'
      ),
      document.getElementById(
        'status'
      )
    ];


    const observer =
      new MutationObserver(
        function () {

          copyLiveValues();

          updateRecordingState();
        }
      );


    values.forEach(
      function (element) {

        if (!element) {
          return;
        }


        observer.observe(
          element,
          {
            childList: true,
            subtree: true,
            characterData: true
          }
        );
      }
    );
  }


  /* =========================================================
     START
     ========================================================= */

  function start() {

    buildHeader();

    copyLiveValues();

    updateRecordingState();

    installObservers();
  }


  if (
    document.readyState ===
      'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      start,
      {
        once: true
      }
    );

  } else {

    start();
  }

})();
