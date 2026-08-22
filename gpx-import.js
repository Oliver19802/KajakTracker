/* =========================================================
   KAJAKTRACKER – GPX IMPORT
   ========================================================= */

(function () {

  const importButton =
    document.getElementById('gpxImportBtn');

  const fileInput =
    document.getElementById('gpxImportInput');


  if (!importButton || !fileInput) {

    console.error(
      'GPX-Import: Bedienelemente fehlen.'
    );

    return;
  }


  /* =======================================================
     HILFSFUNKTIONEN
     ======================================================= */

  function xmlItems(parent, name) {

    return Array.from(
      parent.getElementsByTagNameNS(
        '*',
        name
      )
    );
  }


  function xmlText(parent, name) {

    const element =
      xmlItems(parent, name)[0];

    return element
      ? String(element.textContent || '').trim()
      : '';
  }


  function numberValue(value) {

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : null;
  }


  function parseTime(value) {

    if (!value) {
      return null;
    }

    const ms =
      Date.parse(value);

    if (!Number.isFinite(ms)) {
      return null;
    }

    return new Date(ms)
      .toISOString();
  }


  /* =======================================================
     DISTANZ
     ======================================================= */

  function distanceMeters(a, b) {

    const R =
      6371000;

    const rad =
      value =>
        value * Math.PI / 180;


    const lat1 =
      rad(a.lat);

    const lat2 =
      rad(b.lat);

    const dLat =
      rad(b.lat - a.lat);

    const dLon =
      rad(b.lon - a.lon);


    const h =
      Math.sin(dLat / 2) ** 2 +

      Math.cos(lat1) *
      Math.cos(lat2) *

      Math.sin(dLon / 2) ** 2;


    return (
      2 *
      R *
      Math.asin(
        Math.sqrt(h)
      )
    );
  }


  /* =======================================================
     GPX-PUNKTE LESEN
     ======================================================= */

  function parsePoints(nodes) {

    return nodes

      .map(node => {

        const lat =
          numberValue(
            node.getAttribute('lat')
          );

        const lon =
          numberValue(
            node.getAttribute('lon')
          );


        if (
          lat === null ||
          lon === null
        ) {

          return null;
        }


        let speed =
          numberValue(
            xmlText(
              node,
              'speed'
            )
          );


        if (
          speed === null ||
          speed < 0 ||
          speed > 50
        ) {

          speed = null;
        }


        return {

          lat,

          lon,

          time:
            parseTime(
              xmlText(
                node,
                'time'
              )
            ),

          speed
        };

      })

      .filter(Boolean);
  }


  /* =======================================================
     STATISTIK BERECHNEN
     ======================================================= */

  function calculateStats(points) {

    let distance = 0;

    let maxSpeed = 0;


    for (
      let i = 1;
      i < points.length;
      i++
    ) {

      const previous =
        points[i - 1];

      const current =
        points[i];


      const segment =
        distanceMeters(
          previous,
          current
        );


      /*
        Sehr große GPS-Sprünge ignorieren.
      */

      if (
        Number.isFinite(segment) &&
        segment >= 0 &&
        segment < 5000
      ) {

        distance += segment;


        /*
          Geschwindigkeit aus Zeit und Strecke
          berechnen, falls GPX keine enthält.
        */

        if (
          current.speed === null &&
          previous.time &&
          current.time
        ) {

          const seconds =

            (
              Date.parse(current.time) -
              Date.parse(previous.time)
            ) / 1000;


          if (seconds > 0) {

            const calculatedSpeed =
              segment / seconds;


            if (
              calculatedSpeed >= 0 &&
              calculatedSpeed <= 50
            ) {

              current.speed =
                calculatedSpeed;
            }
          }
        }
      }


      if (
        Number.isFinite(
          current.speed
        )
      ) {

        maxSpeed =
          Math.max(
            maxSpeed,
            current.speed
          );
      }
    }


    const times =
      points

        .map(
          p =>
            p.time
              ? Date.parse(p.time)
              : NaN
        )

        .filter(
          Number.isFinite
        );


    let startedAt =
      new Date()
        .toISOString();

    let duration = 0;


    if (times.length) {

      const first =
        Math.min(...times);

      const last =
        Math.max(...times);


      startedAt =
        new Date(first)
          .toISOString();


      duration =
        Math.max(
          0,
          Math.round(
            (last - first) / 1000
          )
        );
    }


    const averageSpeed =

      duration > 0

        ? distance / duration

        : 0;


    return {

      distance,

      duration,

      maxSpeed,

      averageSpeed,

      startedAt
    };
  }


  /* =======================================================
     EINDEUTIGE ID
     ======================================================= */

  function makeId(
    fileName,
    startedAt,
    pointCount
  ) {

    const text =
      fileName +
      startedAt +
      pointCount;


    let hash =
      0;


    for (
      let i = 0;
      i < text.length;
      i++
    ) {

      hash =
        (
          (hash << 5) -
          hash +
          text.charCodeAt(i)
        ) | 0;
    }


    return (
      'gpx-' +
      Math.abs(hash)
        .toString(36)
    );
  }


  /* =======================================================
     GPX DATEI LESEN
     ======================================================= */

  function parseGPX(
    text,
    fileName
  ) {

    const parser =
      new DOMParser();


    const xml =
      parser.parseFromString(
        text,
        'application/xml'
      );


    if (
      xmlItems(
        xml,
        'parsererror'
      ).length
    ) {

      throw new Error(
        'Ungültige GPX-Datei.'
      );
    }


    let pointNodes =
      xmlItems(
        xml,
        'trkpt'
      );


    /*
      Falls GPX nur eine Route enthält.
    */

    if (!pointNodes.length) {

      pointNodes =
        xmlItems(
          xml,
          'rtept'
        );
    }


    const points =
      parsePoints(
        pointNodes
      );


    if (
      points.length < 2
    ) {

      throw new Error(
        'Keine ausreichenden GPS-Punkte gefunden.'
      );
    }


    const stats =
      calculateStats(
        points
      );


    const trackName =
      xmlText(
        xml,
        'name'
      ) ||

      fileName
        .replace(
          /\.gpx$/i,
          ''
        );


    return {

      id:
        makeId(
          fileName,
          stats.startedAt,
          points.length
        ),


      startedAt:
        stats.startedAt,


      date:
        stats.startedAt,


      duration:
        stats.duration,


      distance:
        stats.distance,


      maxSpeed:
        stats.maxSpeed,


      averageSpeed:
        stats.averageSpeed,


      title:
        trackName,


      imported:
        true,


      importedFrom:
        'GPX',


      sourceFile:
        fileName,


      track:
        points.map(
          p => ({

            lat:
              p.lat,

            lon:
              p.lon,

            time:
              p.time,

            speed:
              Number.isFinite(
                p.speed
              )
                ? p.speed
                : 0

          })
        )
    };
  }


  /* =======================================================
     FAHRT SPEICHERN
     ======================================================= */

  function saveTrip(
    importedTrip
  ) {

    const trips =
      getTrips();


    const exists =
      trips.some(
        trip =>
          trip.id ===
          importedTrip.id
      );


    if (exists) {

      return false;
    }


    trips.unshift(
      importedTrip
    );


    localStorage.setItem(

      TRIPS_STORAGE_KEY,

      JSON.stringify(
        trips.slice(
          0,
          100
        )
      )
    );


    renderTrips();

    refreshPreviousTracks();


    return true;
  }


  /* =======================================================
     DATEIEN IMPORTIEREN
     ======================================================= */

  async function importFiles(
    files
  ) {

    let imported = 0;

    let skipped = 0;

    const errors = [];


    for (
      const file of files
    ) {

      try {

        const text =
          await file.text();


        const trip =
          parseGPX(
            text,
            file.name
          );


        const saved =
          saveTrip(
            trip
          );


        if (saved) {

          imported++;


          /*
            Zuletzt importierte Fahrt
            direkt auf Karte anzeigen.
          */

          viewTrip(
            trip.id
          );

        } else {

          skipped++;
        }


      } catch (error) {

        console.error(
          'GPX Import Fehler:',
          error
        );


        errors.push(
          file.name +
          ': ' +
          error.message
        );
      }
    }


    let message =

      imported +
      (
        imported === 1
          ? ' Tour importiert.'
          : ' Touren importiert.'
      );


    if (skipped) {

      message +=

        '\n' +

        skipped +

        ' bereits vorhandene Tour(en) übersprungen.';
    }


    if (errors.length) {

      message +=

        '\n\nFehler:\n' +

        errors.join('\n');
    }


    alert(
      message
    );
  }


  /* =======================================================
     BUTTON
     ======================================================= */

  importButton
    .addEventListener(
      'click',
      () => {

        if (
          typeof state !==
            'undefined' &&
          state !== 'idle'
        ) {

          alert(
            'Bitte zuerst die laufende Fahrt beenden.'
          );

          return;
        }


        fileInput.click();
      }
    );


  fileInput
    .addEventListener(
      'change',
      async () => {

        const files =
          Array.from(
            fileInput.files || []
          );


        fileInput.value =
          '';


        if (!files.length) {
          return;
        }


        await importFiles(
          files
        );
      }
    );

})();
