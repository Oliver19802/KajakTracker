/* =========================================================
   KAJAKTRACKER – MODERNE TOURENANSICHT
   Ändert nur die Darstellung gespeicherter Fahrten.
   Die vorhandene Speicherung (kajakTrips), GPX-Import,
   Aufzeichnung und GPX-Export bleiben unverändert.
   ========================================================= */

(function () {
  'use strict';

  if (typeof getTrips !== 'function') {
    console.error('Tour-UI: getTrips() ist nicht verfügbar.');
    return;
  }

  const style = document.createElement('style');

  style.textContent = `
    .tripsPanel {
      padding: 18px 14px 28px !important;
      background: #f7f9fa !important;
    }

    .tripsHeader {
      margin-bottom: 14px;
      padding: 0 2px;
    }

    .tripsHeader h2 {
      font-size: 26px !important;
      color: #183f55;
    }

    .tourListCard {
      display: grid;
      grid-template-columns: 64px 1fr 28px;
      align-items: center;
      gap: 13px;
      width: 100%;
      margin: 0 0 12px;
      padding: 17px 15px;
      border: 0;
      border-radius: 18px;
      background: #fff;
      box-shadow: 0 3px 10px rgba(24, 63, 85, .13);
      color: #183f55;
      text-align: left;
      cursor: pointer;
    }

    .tourListCard:active {
      transform: scale(.995);
    }

    .tourRouteIcon {
      display: grid;
      width: 64px;
      height: 64px;
      place-items: center;
      border-radius: 18px;
      background: #e4f2f3;
      color: #56a8b3;
    }

    .tourRouteIcon svg {
      width: 42px;
      height: 42px;
    }

    .tourListMain {
      min-width: 0;
    }

    .tourListTitle {
      margin-bottom: 6px;
      overflow: hidden;
      color: #183f55;
      font-size: 19px;
      font-weight: 900;
      line-height: 1.15;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tourListDate,
    .tourListDistance {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 4px;
      color: #365f75;
      font-size: 14px;
      font-weight: 750;
    }

    .tourListDistance {
      color: #56a8b3;
      font-size: 16px;
      font-weight: 900;
    }

    .tourChevron {
      color: #245a75;
      font-size: 30px;
      font-weight: 400;
      line-height: 1;
    }

    .tourDetail {
      position: fixed;
      inset: 0;
      z-index: 9999;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: #f8fafb;
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
      grid-template-columns: 48px 1fr 48px;
      align-items: center;
      min-height: 74px;
      padding: max(10px, env(safe-area-inset-top)) 12px 10px;
      background: #56a8b3;
      color: #fff;
    }

    .tourDetailHeader button {
      display: grid;
      width: 46px;
      height: 46px;
      padding: 0;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #fff;
      font-size: 34px;
      font-weight: 400;
    }

    .tourDetailTitle {
      overflow: hidden;
      padding: 0 8px;
      font-size: 22px;
      font-weight: 900;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tourDetailMap {
      width: 100%;
      height: min(54vh, 460px);
      min-height: 310px;
      background: #dfe9e5;
    }

    .tourDetailBody {
      margin-top: -1px;
      padding: 16px 14px calc(28px + env(safe-area-inset-bottom));
      background: #f8fafb;
    }

    .tourStatsCard,
    .tourDateCard,
    .tourActionCard {
      border: 1px solid #d9e8eb;
      border-radius: 20px;
      background: #fff;
      box-shadow: 0 3px 10px rgba(24, 63, 85, .08);
    }

    .tourStatsCard {
      display: grid;
      grid-template-columns: 1fr 1fr;
      overflow: hidden;
    }

    .tourStat {
      padding: 18px 12px;
      text-align: center;
    }

    .tourStat:nth-child(odd) {
      border-right: 1px solid #d9e8eb;
    }

    .tourStat:nth-child(n+3) {
      border-top: 1px solid #d9e8eb;
    }

    .tourStatLabel {
      margin-bottom: 5px;
      color: #4b8793;
      font-size: 13px;
      font-weight: 850;
    }

    .tourStatValue {
      color: #183f55;
      font-size: 25px;
      font-weight: 950;
      line-height: 1.1;
    }

    .tourDateCard {
      margin-top: 14px;
      padding: 17px 18px;
      color: #183f55;
      font-size: 17px;
      font-weight: 850;
      line-height: 1.45;
    }

    .tourDateCard small {
      display: block;
      margin-top: 4px;
      color: #5d7885;
      font-size: 13px;
      font-weight: 700;
    }

    .tourActionCard {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 14px;
      padding: 12px;
    }

    .tourActionCard button {
      min-height: 48px;
      border: 1px solid #b9d6db;
      background: #fff;
      color: #183f55;
      font-size: 14px;
    }

    .tourActionCard .tourDeleteBtn {
      border-color: #e8b8b6;
      color: #c03935;
    }

    @media (max-width: 420px) {
      .tourListCard {
        grid-template-columns: 56px 1fr 24px;
        gap: 11px;
        padding: 15px 12px;
      }

      .tourRouteIcon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
      }

      .tourRouteIcon svg {
        width: 36px;
        height: 36px;
      }

      .tourListTitle {
        font-size: 18px;
      }

      .tourListDate {
        font-size: 13px;
      }
    }
  `;

  document.head.appendChild(style);

  const routeSvg = `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M12 15 C18 9, 34 18, 45 13 C52 10, 54 15, 47 19
           C37 24, 19 18, 15 26 C10 36, 30 32, 43 34
           C53 36, 53 43, 44 46 C34 50, 18 43, 12 50"
        fill="none"
        stroke="currentColor"
        stroke-width="4.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;

  function formatDateLong(dateString) {
    const d = new Date(dateString);

    if (Number.isNaN(d.getTime())) {
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

  function formatClock(dateString) {
    const d = new Date(dateString);

    if (Number.isNaN(d.getTime())) {
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
    const s =
      Math.max(
        0,
        Math.round(
          Number(seconds) || 0
        )
      );

    const h =
      Math.floor(
        s / 3600
      );

    const m =
      Math.floor(
        (s % 3600) / 60
      );

    const sec =
      s % 60;

    return (
      String(h).padStart(2, '0') +
      ':' +
      String(m).padStart(2, '0') +
      ':' +
      String(sec).padStart(2, '0')
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

    return duration > 0
      ? (
          Number(
            trip.distance
          ) || 0
        ) / duration
      : 0;
  }

  function tripTitle(trip) {
    if (
      trip.title &&
      String(
        trip.title
      ).trim()
    ) {
      return String(
        trip.title
      ).trim();
    }

    const d =
      new Date(
        trip.startedAt ||
        trip.date
      );

    if (
      Number.isNaN(
        d.getTime()
      )
    ) {
      return 'Kajaktour';
    }

    return (
      'Tour ' +
      d.toLocaleDateString(
        'de-DE'
      )
    );
  }

  function tripEndTime(trip) {
    const start =
      new Date(
        trip.startedAt ||
        trip.date
      );

    if (
      Number.isNaN(
        start.getTime()
      )
    ) {
      return null;
    }

    return new Date(
      start.getTime() +
      (
        Math.max(
          0,
          Number(
            trip.duration
          ) || 0
        ) *
        1000
      )
    );
  }

  function escapeTourHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let detailRoot = null;
  let detailMap = null;
  let detailTrackLayer = null;
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
        class="tourDetailMap"
        id="tourDetailMap"
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

          <div data-field="date">
            Datum
          </div>

          <small data-field="time">
            Uhrzeit
          </small>

        </div>

        <div class="tourActionCard">

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
            Löschen
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
        () => {

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
        () => {

          if (
            !currentDetailId
          ) {
            return;
          }

          if (
            typeof deleteTrip ===
            'function'
          ) {

            deleteTrip(
              currentDetailId
            );

            closeDetail();

            renderTrips();
          }
        }
      );
  }

  function openDetail(id) {
    const trip =
      getTrips().find(
        item =>
          String(item.id) ===
          String(id)
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
          trip.startedAt ||
          trip.date
        );

    detailRoot
      .querySelector(
        '[data-field="time"]'
      )
      .textContent =
        formatClock(
          trip.startedAt ||
          trip.date
        ) +
        ' – ' +
        (
          end
            ? formatClock(
                end.toISOString()
              )
            : '--:--'
        ) +
        ' Uhr';

    detailRoot.hidden =
      false;

    document.body.style.overflow =
      'hidden';

    requestAnimationFrame(
      () => {

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

        if (
          detailTrackLayer
        ) {

          detailMap.removeLayer(
            detailTrackLayer
          );
        }

        const latLngs =
          trip.track

            .filter(
              p =>
                Number.isFinite(
                  Number(
                    p.lat
                  )
                ) &&
                Number.isFinite(
                  Number(
                    p.lon
                  )
                )
            )

            .map(
              p => [
                Number(
                  p.lat
                ),
                Number(
                  p.lon
                )
              ]
            );

        detailTrackLayer =
          L.polyline(
            latLngs,
            {
              color: '#ff5a35',
              weight: 6,
              opacity: .95,
              lineCap: 'round',
              lineJoin: 'round'
            }
          )
          .addTo(
            detailMap
          );

        if (
          latLngs.length
        ) {

          L.circleMarker(
            latLngs[0],
            {
              radius: 7,
              weight: 3,
              color: '#ffffff',
              fillColor: '#2b9a62',
              fillOpacity: 1
            }
          )
          .addTo(
            detailMap
          );

          L.circleMarker(
            latLngs[
              latLngs.length - 1
            ],
            {
              radius: 7,
              weight: 3,
              color: '#ffffff',
              fillColor: '#d84343',
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
                26,
                26
              ]
            }
          );
        }

        detailMap.invalidateSize();
      }
    );
  }

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

  function modernRenderTrips() {
    const trips =
      getTrips();

    const container =
      document.getElementById(
        'tripsList'
      );

    if (!container) {
      return;
    }

    container.replaceChildren();

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

    trips.forEach(
      trip => {

        const start =
          trip.startedAt ||
          trip.date;

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
          <span class="tourRouteIcon">
            ${routeSvg}
          </span>

          <span class="tourListMain">

            <span class="tourListTitle">
              ${escapeTourHtml(
                tripTitle(
                  trip
                )
              )}
            </span>

            <span class="tourListDate">

              <span>
                ▣
              </span>

              <span>
                ${escapeTourHtml(
                  formatDateLong(
                    start
                  )
                )},
                ${escapeTourHtml(
                  formatClock(
                    start
                  )
                )}
                –
                ${escapeTourHtml(
                  end
                    ? formatClock(
                        end.toISOString()
                      )
                    : '--:--'
                )}
              </span>

            </span>

            <span class="tourListDistance">

              <span>
                ▱
              </span>

              <span>
                ${escapeTourHtml(
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
          () => {

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

  window.renderTrips =
    modernRenderTrips;

  window.viewTrip =
    openDetail;

  modernRenderTrips();

})();
