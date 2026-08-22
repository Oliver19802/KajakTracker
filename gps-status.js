/* =========================================================
   KAJAKTRACKER – GPS STATUS
   Version 3

   - KEIN zusätzlicher GPS-Watcher
   - nutzt die GPS-Abfragen der bestehenden App
   - Meter
   - 4 Signalbalken
   - Textqualität
   - schwaches GPS wird gewarnt
   ========================================================= */

(function () {
  'use strict';


  const STALE_AFTER_MS =
    15000;


  const BAD_WARNING_AFTER_MS =
    5000;


  const SMOOTHING =
    0.35;


  let lastFixTime =
    0;


  let filteredAccuracy =
    null;


  let warningSince =
    null;


  let warningShown =
    false;


  let permissionDenied =
    false;


  let badge =
    null;


  let toast =
    null;


  let toastTimer =
    null;


  /* =========================================================
     BADGE
     ========================================================= */

  function createBadge() {

    if (
      badge
    ) {
      return badge;
    }


    let slot =
      document.getElementById(
        'gpsHeaderSlot'
      );


    if (!slot) {

      const header =
        document.querySelector(
          'header'
        );


      if (!header) {
        return null;
      }


      slot =
        document.createElement(
          'div'
        );


      slot.id =
        'gpsHeaderSlot';


      slot.className =
        'gpsHeaderSlot';


      header.appendChild(
        slot
      );
    }


    badge =
      document.createElement(
        'div'
      );


    badge.id =
      'gpsQuality';


    badge.className =
      'gpsQualityBadge gpsWaiting';


    badge.innerHTML = `

      <div class="gpsQualityHeader">

        <span class="gpsWord">
          GPS
        </span>

        <span
          class="gpsMeters"
        >
          …
        </span>

      </div>


      <div
        class="gpsBars"
        aria-hidden="true"
      >

        <span class="gpsBar"></span>

        <span class="gpsBar"></span>

        <span class="gpsBar"></span>

        <span class="gpsBar"></span>

      </div>


      <div
        class="gpsQualityLabel"
      >

        Suche …

      </div>

    `;


    slot.appendChild(
      badge
    );


    return badge;
  }


  /* =========================================================
     TOAST
     ========================================================= */

  function createToast() {

    if (
      toast
    ) {
      return;
    }


    toast =
      document.createElement(
        'div'
      );


    toast.className =
      'gpsQualityToast';


    document.body.appendChild(
      toast
    );
  }


  function showToast(
    message
  ) {

    createToast();


    toast.textContent =
      message;


    toast.classList.add(
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

          toast.classList.remove(
            'visible'
          );

        },
        3500
      );
  }


  /* =========================================================
     GPS LEVEL
     ========================================================= */

  function getLevel(
    accuracy
  ) {

    if (
      accuracy <= 10
    ) {
      return {
        name:
          'excellent',

        css:
          'gpsExcellent',

        label:
          'Sehr gut'
      };
    }


    if (
      accuracy <= 20
    ) {
      return {
        name:
          'good',

        css:
          'gpsGood',

        label:
          'Gut'
      };
    }


    if (
      accuracy <= 40
    ) {
      return {
        name:
          'moderate',

        css:
          'gpsModerate',

        label:
          'Mäßig'
      };
    }


    return {
      name:
        'bad',

      css:
        'gpsBad',

      label:
        'Schwach'
    };
  }


  /* =========================================================
     ANZEIGE
     ========================================================= */

  function render(
    level,
    accuracy
  ) {

    const element =
      createBadge();


    if (!element) {
      return;
    }


    element.className =
      'gpsQualityBadge ' +
      level.css;


    const meters =
      element.querySelector(
        '.gpsMeters'
      );


    const label =
      element.querySelector(
        '.gpsQualityLabel'
      );


    meters.textContent =
      Number.isFinite(
        accuracy
      )
        ? Math.round(
            accuracy
          ) + ' m'
        : '…';


    label.textContent =
      level.label;
  }


  /* =========================================================
     POSITION
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


    if (
      filteredAccuracy ===
        null
    ) {

      filteredAccuracy =
        accuracy;

    } else {

      filteredAccuracy =
        filteredAccuracy
        *
        (
          1 -
          SMOOTHING
        )
        +
        accuracy
        *
        SMOOTHING;
    }


    const level =
      getLevel(
        filteredAccuracy
      );


    render(
      level,
      accuracy
    );


    /* Warnung */

    if (
      level.name ===
        'bad'
    ) {

      if (
        warningSince ===
          null
      ) {

        warningSince =
          Date.now();
      }


      if (
        !warningShown
        &&
        Date.now()
        -
        warningSince
        >=
        BAD_WARNING_AFTER_MS
      ) {

        warningShown =
          true;


        showToast(
          'GPS-Signal schwach – Position kann ungenau sein.'
        );
      }

    } else {

      warningSince =
        null;


      if (
        level.name ===
          'excellent'
        ||
        level.name ===
          'good'
      ) {

        warningShown =
          false;
      }
    }
  }


  /* =========================================================
     GPS FEHLER
     ========================================================= */

  function handleError(
    error
  ) {

    if (!error) {
      return;
    }


    if (
      Number(
        error.code
      ) === 1
    ) {

      permissionDenied =
        true;


      render(
        {
          css:
            'gpsOff',

          label:
            'GPS aus'
        },
        null
      );


      return;
    }


    if (
      lastFixTime === 0
    ) {

      render(
        {
          css:
            'gpsWaiting',

          label:
            'Suche …'
        },
        null
      );
    }
  }


  /* =========================================================
     GEOLOCATION HOOK
     ========================================================= */

  function installHook() {

    if (
      !navigator.geolocation
    ) {

      render(
        {
          css:
            'gpsOff',

          label:
            'GPS aus'
        },
        null
      );


      return;
    }


    const geo =
      navigator.geolocation;


    if (
      geo.__kajakGpsQualityHook
    ) {
      return;
    }


    const originalWatch =
      geo.watchPosition
        .bind(
          geo
        );


    const originalGet =
      geo.getCurrentPosition
        .bind(
          geo
        );


    geo.watchPosition =
      function (
        success,
        error,
        options
      ) {

        return originalWatch(

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
            gpsError
          ) {

            handleError(
              gpsError
            );


            if (
              typeof error ===
                'function'
            ) {

              error(
                gpsError
              );
            }
          },


          options
        );
      };


    geo.getCurrentPosition =
      function (
        success,
        error,
        options
      ) {

        return originalGet(

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
            gpsError
          ) {

            handleError(
              gpsError
            );


            if (
              typeof error ===
                'function'
            ) {

              error(
                gpsError
              );
            }
          },


          options
        );
      };


    try {

      Object.defineProperty(
        geo,
        '__kajakGpsQualityHook',
        {
          value:
            true
        }
      );

    } catch (error) {

      geo.__kajakGpsQualityHook =
        true;
    }
  }


  /* =========================================================
     ALTER FIX
     ========================================================= */

  function staleCheck() {

    if (
      permissionDenied
    ) {
      return;
    }


    if (
      lastFixTime === 0
    ) {

      render(
        {
          css:
            'gpsWaiting',

          label:
            'Suche …'
        },
        null
      );


      return;
    }


    if (
      Date.now()
      -
      lastFixTime
      >
      STALE_AFTER_MS
    ) {

      render(
        {
          css:
            'gpsStale',

          label:
            'Kein Fix'
        },
        null
      );
    }
  }


  /* =========================================================
     START
     ========================================================= */

  function start() {

    createBadge();


    render(
      {
        css:
          'gpsWaiting',

        label:
          'Suche …'
      },
      null
    );


    installHook();


    setInterval(
      staleCheck,
      2000
    );
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
