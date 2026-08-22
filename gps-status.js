/* =========================================================
   KAJAKTRACKER – GPS QUALITÄTSANZEIGE
   Version 1

   WICHTIG:
   - startet KEINEN eigenen GPS-Watcher
   - verwendet vorhandene watchPosition/getCurrentPosition Aufrufe
   - verändert Tracking nicht
   - verändert Navigation nicht
   - löscht keine GPS-Punkte
   ========================================================= */

(function () {
  'use strict';


  /* =========================================================
     EINSTELLUNGEN
     ========================================================= */

  const STALE_AFTER_MS =
    15000;

  const BAD_WARNING_AFTER_MS =
    5000;

  const GOOD_RESET_MS =
    3000;

  const SMOOTHING_FACTOR =
    0.35;


  /* =========================================================
     ZUSTAND
     ========================================================= */

  let lastFixTime =
    0;

  let lastAccuracy =
    null;

  let smoothedAccuracy =
    null;

  let currentLevel =
    'waiting';

  let badSince =
    null;

  let goodSince =
    null;

  let badWarningShown =
    false;

  let permissionDenied =
    false;

  let gpsBadge =
    null;

  let toastElement =
    null;


  /* =========================================================
     CSS
     ========================================================= */

  const style =
    document.createElement(
      'style'
    );


  style.textContent = `

    /* =====================================================
       HEADER GPS
       ===================================================== */

    header {
      position: relative;
    }


    .gpsQualityBadge {
      display: inline-flex;

      align-items: center;

      gap: 5px;

      min-height: 28px;

      padding:
        4px
        8px;

      margin-left: 7px;

      border-radius: 999px;

      background:
        rgba(255,255,255,.18);

      color: #ffffff;

      font-size: 12px;
      font-weight: 850;

      line-height: 1;

      white-space: nowrap;

      vertical-align: middle;

      transition:
        background .25s ease,
        color .25s ease;
    }


    .gpsQualityDot {
      width: 9px;
      height: 9px;

      min-width: 9px;

      border-radius: 50%;

      background: #d6dde0;

      box-shadow:
        0 0 0 2px
        rgba(255,255,255,.20);

      transition:
        background .25s ease;
    }


    /* Warten */

    .gpsQualityBadge.gpsWaiting
    .gpsQualityDot {
      background: #d6dde0;
    }


    /* Sehr gut */

    .gpsQualityBadge.gpsExcellent
    .gpsQualityDot {
      background: #31c86d;
    }


    /* Gut */

    .gpsQualityBadge.gpsGood
    .gpsQualityDot {
      background: #83c94e;
    }


    /* Mäßig */

    .gpsQualityBadge.gpsModerate
    .gpsQualityDot {
      background: #f0b429;
    }


    /* Schlecht */

    .gpsQualityBadge.gpsBad
    .gpsQualityDot {
      background: #e74b45;
    }


    /* GPS aus */

    .gpsQualityBadge.gpsOff
    .gpsQualityDot {
      background: #949fa4;
    }


    /* Veralteter Fix */

    .gpsQualityBadge.gpsStale
    .gpsQualityDot {
      background: #b5bdc1;
    }


    /* =====================================================
       TOAST
       ===================================================== */

    .gpsQualityToast {
      position: fixed;

      left: 50%;
      bottom:
        calc(
          22px +
          env(safe-area-inset-bottom)
        );

      z-index: 30000;

      transform:
        translateX(-50%)
        translateY(20px);

      width:
        min(
          calc(100% - 32px),
          430px
        );

      padding:
        12px
        15px;

      border-radius: 14px;

      background:
        rgba(24, 63, 85, .94);

      box-shadow:
        0 5px 20px
        rgba(0,0,0,.22);

      color: #ffffff;

      font-size: 14px;
      font-weight: 750;

      line-height: 1.35;

      text-align: center;

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


    @media (
      max-width: 420px
    ) {

      .gpsQualityBadge {
        min-height: 25px;

        padding:
          3px
          7px;

        margin-left: 5px;

        font-size: 11px;
      }


      .gpsQualityDot {
        width: 8px;
        height: 8px;

        min-width: 8px;
      }
    }

  `;


  document.head.appendChild(
    style
  );


  /* =========================================================
     BADGE ERZEUGEN
     ========================================================= */

  function createBadge() {

    if (
      gpsBadge
    ) {
      return gpsBadge;
    }


    const header =
      document.querySelector(
        'header'
      );


    const status =
      document.getElementById(
        'status'
      );


    if (
      !header
    ) {
      return null;
    }


    gpsBadge =
      document.createElement(
        'span'
      );


    gpsBadge.id =
      'gpsQuality';


    gpsBadge.className =
      'gpsQualityBadge gpsWaiting';


    gpsBadge.innerHTML = `

      <span
        class="gpsQualityDot"
        aria-hidden="true"
      ></span>

      <span
        class="gpsQualityText"
      >
        GPS …
      </span>

    `;


    gpsBadge.setAttribute(
      'aria-label',
      'GPS-Qualität'
    );


    /*
      Direkt neben "Bereit".
    */

    if (
      status &&
      status.parentNode
    ) {

      status.insertAdjacentElement(
        'afterend',
        gpsBadge
      );

    } else {

      header.appendChild(
        gpsBadge
      );
    }


    return gpsBadge;
  }


  /* =========================================================
     TOAST
     ========================================================= */

  function createToast() {

    if (
      toastElement
    ) {
      return;
    }


    toastElement =
      document.createElement(
        'div'
      );


    toastElement.className =
      'gpsQualityToast';


    document.body.appendChild(
      toastElement
    );
  }


  let toastTimer =
    null;


  function showToast(
    message
  ) {

    createToast();


    if (
      !toastElement
    ) {
      return;
    }


    toastElement.textContent =
      message;


    toastElement.classList.add(
      'visible'
    );


    if (
      toastTimer
    ) {

      clearTimeout(
        toastTimer
      );
    }


    toastTimer =
      setTimeout(
        function () {

          toastElement.classList.remove(
            'visible'
          );

        },
        3500
      );
  }


  /* =========================================================
     GLÄTTUNG
     ========================================================= */

  function smoothAccuracy(
    accuracy
  ) {

    if (
      !Number.isFinite(
        accuracy
      )
    ) {

      return null;
    }


    if (
      smoothedAccuracy ===
        null
    ) {

      smoothedAccuracy =
        accuracy;

      return smoothedAccuracy;
    }


    /*
      Große echte Verschlechterung
      schneller anzeigen.
    */

    if (
      accuracy >
      smoothedAccuracy + 25
    ) {

      smoothedAccuracy =
        (
          smoothedAccuracy * .25
        )
        +
        (
          accuracy * .75
        );

    } else {

      smoothedAccuracy =
        (
          smoothedAccuracy *
          (
            1 -
            SMOOTHING_FACTOR
          )
        )
        +
        (
          accuracy *
          SMOOTHING_FACTOR
        );
    }


    return smoothedAccuracy;
  }


  /* =========================================================
     HYSTERESE
     ========================================================= */

  function determineLevel(
    accuracy
  ) {

    if (
      !Number.isFinite(
        accuracy
      )
    ) {

      return 'waiting';
    }


    /*
      Hysterese:
      Grenzen hängen leicht vom
      vorherigen Zustand ab.
    */


    if (
      currentLevel ===
        'excellent'
    ) {

      if (
        accuracy <= 12
      ) {
        return 'excellent';
      }
    }


    if (
      currentLevel ===
        'good'
    ) {

      if (
        accuracy <= 22
        &&
        accuracy > 8
      ) {
        return 'good';
      }
    }


    if (
      currentLevel ===
        'moderate'
    ) {

      if (
        accuracy <= 43
        &&
        accuracy > 18
      ) {
        return 'moderate';
      }
    }


    if (
      currentLevel ===
        'bad'
    ) {

      if (
        accuracy > 35
      ) {
        return 'bad';
      }
    }


    /*
      Normalwerte
    */

    if (
      accuracy <= 10
    ) {

      return 'excellent';
    }


    if (
      accuracy <= 20
    ) {

      return 'good';
    }


    if (
      accuracy <= 40
    ) {

      return 'moderate';
    }


    return 'bad';
  }


  /* =========================================================
     BADGE AKTUALISIEREN
     ========================================================= */

  function updateBadge(
    level,
    accuracy
  ) {

    const badge =
      createBadge();


    if (
      !badge
    ) {
      return;
    }


    badge.className =
      'gpsQualityBadge';


    let cssClass =
      'gpsWaiting';


    let text =
      'GPS …';


    switch (
      level
    ) {

      case 'excellent':

        cssClass =
          'gpsExcellent';

        text =
          'GPS '
          +
          Math.round(
            accuracy
          )
          +
          ' m';

        break;


      case 'good':

        cssClass =
          'gpsGood';

        text =
          'GPS '
          +
          Math.round(
            accuracy
          )
          +
          ' m';

        break;


      case 'moderate':

        cssClass =
          'gpsModerate';

        text =
          'GPS '
          +
          Math.round(
            accuracy
          )
          +
          ' m';

        break;


      case 'bad':

        cssClass =
          'gpsBad';

        text =
          'GPS '
          +
          Math.round(
            accuracy
          )
          +
          ' m';

        break;


      case 'off':

        cssClass =
          'gpsOff';

        text =
          'GPS aus';

        break;


      case 'stale':

        cssClass =
          'gpsStale';

        text =
          'GPS …';

        break;


      default:

        cssClass =
          'gpsWaiting';

        text =
          'GPS …';

        break;
    }


    badge.classList.add(
      cssClass
    );


    const textElement =
      badge.querySelector(
        '.gpsQualityText'
      );


    if (
      textElement
    ) {

      textElement.textContent =
        text;
    }


    badge.title =
      level === 'stale'

        ?

        'Seit längerer Zeit kein neuer GPS-Fix.'

        :

        level === 'off'

          ?

          'GPS ist deaktiviert oder nicht erlaubt.'

          :

          Number.isFinite(
            accuracy
          )

            ?

            'Geschätzte GPS-Genauigkeit: '
            +
            Math.round(
              accuracy
            )
            +
            ' Meter'

            :

            'GPS-Position wird gesucht.';
  }


  /* =========================================================
     GUT / SCHLECHT ÜBERWACHEN
     ========================================================= */

  function processWarningState(
    level
  ) {

    const now =
      Date.now();


    if (
      level === 'bad'
    ) {

      goodSince =
        null;


      if (
        badSince === null
      ) {

        badSince =
          now;
      }


      if (
        !badWarningShown
        &&
        now - badSince >=
          BAD_WARNING_AFTER_MS
      ) {

        badWarningShown =
          true;


        showToast(
          'GPS-Signal schwach – Position kann ungenau sein.'
        );
      }


      return;
    }


    /*
      Nicht schlecht.
    */

    badSince =
      null;


    if (
      level === 'excellent'
      ||
      level === 'good'
    ) {

      if (
        goodSince === null
      ) {

        goodSince =
          now;
      }


      if (
        badWarningShown
        &&
        now - goodSince >=
          GOOD_RESET_MS
      ) {

        badWarningShown =
          false;


        /*
          Wieder-gut-Meldung bewusst
          nur einmal und dezent.
        */

        showToast(
          'GPS-Signal wieder gut.'
        );
      }

    } else {

      goodSince =
        null;
    }
  }


  /* =========================================================
     ERFOLGREICHER GPS-FIX
     ========================================================= */

  function handlePosition(
    position
  ) {

    if (
      !position ||
      !position.coords
    ) {
      return;
    }


    const accuracy =
      Number(
        position.coords.accuracy
      );


    if (
      !Number.isFinite(
        accuracy
      )
    ) {
      return;
    }


    permissionDenied =
      false;


    lastFixTime =
      Date.now();


    lastAccuracy =
      accuracy;


    const filtered =
      smoothAccuracy(
        accuracy
      );


    const newLevel =
      determineLevel(
        filtered
      );


    currentLevel =
      newLevel;


    updateBadge(
      newLevel,
      accuracy
    );


    processWarningState(
      newLevel
    );
  }


  /* =========================================================
     GPS-FEHLER
     ========================================================= */

  function handlePositionError(
    error
  ) {

    if (
      !error
    ) {
      return;
    }


    /*
      PERMISSION_DENIED = 1
    */

    if (
      Number(
        error.code
      ) === 1
    ) {

      permissionDenied =
        true;


      currentLevel =
        'off';


      updateBadge(
        'off',
        null
      );


      return;
    }


    /*
      Andere Fehler bedeuten nicht automatisch,
      dass GPS dauerhaft ausgeschaltet ist.
    */

    if (
      lastFixTime === 0
    ) {

      currentLevel =
        'waiting';


      updateBadge(
        'waiting',
        null
      );
    }
  }


  /* =========================================================
     WATCHPOSITION ABFANGEN

     WICHTIG:
     Wir starten KEINEN neuen Watcher.
     Wir erweitern nur den bestehenden Callback.
     ========================================================= */

  function installGeolocationHook() {

    if (
      !navigator.geolocation
    ) {

      currentLevel =
        'off';


      updateBadge(
        'off',
        null
      );


      return;
    }


    const geo =
      navigator.geolocation;


    /*
      Schutz vor mehrfacher Installation.
    */

    if (
      geo.__kajakGpsStatusInstalled
    ) {
      return;
    }


    const originalWatchPosition =
      geo.watchPosition
        .bind(
          geo
        );


    const originalGetCurrentPosition =
      geo.getCurrentPosition
        .bind(
          geo
        );


    /*
      Vorhandenes watchPosition erweitern.
    */

    geo.watchPosition =
      function (
        success,
        error,
        options
      ) {

        return originalWatchPosition(

          function (
            position
          ) {

            handlePosition(
              position
            );


            if (
              typeof success ===
                'function'
            ) {

              success(
                position
              );
            }
          },


          function (
            positionError
          ) {

            handlePositionError(
              positionError
            );


            if (
              typeof error ===
                'function'
            ) {

              error(
                positionError
              );
            }
          },


          options
        );
      };


    /*
      Auch vorhandene einzelne
      Positionsabfragen nutzen.
    */

    geo.getCurrentPosition =
      function (
        success,
        error,
        options
      ) {

        return originalGetCurrentPosition(

          function (
            position
          ) {

            handlePosition(
              position
            );


            if (
              typeof success ===
                'function'
            ) {

              success(
                position
              );
            }
          },


          function (
            positionError
          ) {

            handlePositionError(
              positionError
            );


            if (
              typeof error ===
                'function'
            ) {

              error(
                positionError
              );
            }
          },


          options
        );
      };


    try {

      Object.defineProperty(
        geo,
        '__kajakGpsStatusInstalled',
        {
          value: true,
          configurable: false,
          enumerable: false
        }
      );

    } catch (error) {

      geo.__kajakGpsStatusInstalled =
        true;
    }
  }


  /* =========================================================
     VERALTETEN FIX ERKENNEN
     ========================================================= */

  function checkStaleFix() {

    if (
      permissionDenied
    ) {

      updateBadge(
        'off',
        null
      );


      return;
    }


    if (
      lastFixTime === 0
    ) {

      updateBadge(
        'waiting',
        null
      );


      return;
    }


    const age =
      Date.now()
      -
      lastFixTime;


    if (
      age >
      STALE_AFTER_MS
    ) {

      currentLevel =
        'stale';


      updateBadge(
        'stale',
        null
      );


      /*
        Keine wiederholte Warnung.
        Nur Anzeige wird grau.
      */

      return;
    }
  }


  /* =========================================================
     SICHTBARKEIT

     Wenn iPhone aus Standby zurückkommt,
     darf kein alter grüner Status stehen bleiben.
     ========================================================= */

  document.addEventListener(
    'visibilitychange',
    function () {

      if (
        document.visibilityState ===
          'visible'
      ) {

        checkStaleFix();
      }
    }
  );


  /* =========================================================
     START
     ========================================================= */

  function startGpsQualityDisplay() {

    createBadge();


    updateBadge(
      'waiting',
      null
    );


    installGeolocationHook();


    /*
      Das ist KEIN GPS-Watcher.
      Es wird lediglich geprüft,
      wie alt der letzte bekannte Fix ist.
    */

    setInterval(
      checkStaleFix,
      2000
    );
  }


  /*
    Da diese Datei am Ende des BODY
    geladen wird, existiert der Header
    normalerweise bereits.
  */

  if (
    document.readyState ===
      'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      startGpsQualityDisplay,
      {
        once: true
      }
    );

  } else {

    startGpsQualityDisplay();
  }

})();
