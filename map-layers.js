/* =========================================================
   KAJAKTRACKER – KARTEN-LAYER
   Version 1

   Feste Darstellungsreihenfolge:
   1. Basiskarte
   2. OpenSeaMap / Wasserwege
   3. alte Tracks
   4. Live-Track (lila)
   5. Navigationsroute
   6. POIs
   7. GPS-Position
   8. Navigationsziel / Popup

   Diese Datei ändert nur die Darstellung der Kartenebenen.
   Tracking-, GPX- und Tourdaten bleiben unverändert.
   ========================================================= */

(function () {
  'use strict';

  if (typeof map === 'undefined' || typeof L === 'undefined') {
    console.error('KajakTracker Layer: Leaflet-Karte nicht verfügbar.');
    return;
  }

  function ensurePane(name, zIndex) {
    if (!map.getPane(name)) {
      map.createPane(name);
    }
    map.getPane(name).style.zIndex = String(zIndex);
  }

  ensurePane('waterwayPane', 410);
  ensurePane('historyTrackPane', 420);
  ensurePane('liveTrackPane', 430);
  ensurePane('navigationPane', 440);
  ensurePane('poiPane', 650);
  ensurePane('gpsPane', 660);
  ensurePane('navigationUiPane', 670);

  /* OpenSeaMap zwischen Basiskarte und Tracks. */
  if (typeof seamark !== 'undefined' && seamark) {
    const wasVisible = map.hasLayer(seamark);
    if (wasVisible) map.removeLayer(seamark);
    seamark.options.pane = 'waterwayPane';
    if (wasVisible) seamark.addTo(map);
  }

  /* Live-Track: korrektes Lila und eigenes Pane. */
  if (typeof line !== 'undefined' && line) {
    const wasVisible = map.hasLayer(line);
    if (wasVisible) map.removeLayer(line);
    line.options.pane = 'liveTrackPane';
    line.setStyle({
      color: '#8e44ad',
      weight: 5,
      opacity: 0.95
    });
    if (wasVisible) line.addTo(map);
  }

  /* Alte Tracks immer gelb und unter dem Live-Track. */
  if (typeof refreshPreviousTracks === 'function') {
    refreshPreviousTracks = function () {
      previousTracksLayer.clearLayers();
      if (!previousTracksVisible) return;

      getTrips().forEach(trip => {
        const latLngs = validTrackLatLngs(trip);
        if (latLngs.length < 2) return;

        L.polyline(latLngs, {
          color: '#ffd400',
          weight: 5,
          opacity: 0.72,
          interactive: false,
          pane: 'historyTrackPane'
        }).addTo(previousTracksLayer);
      });
    };

    refreshPreviousTracks();
  }

  /* Einzelne gespeicherte Fahrt ebenfalls gelb darstellen. */
  if (typeof viewTrip === 'function') {
    const originalViewTrip = viewTrip;

    viewTrip = function (id) {
      originalViewTrip(id);

      if (typeof tripMarkers === 'undefined' || !tripMarkers) return;

      tripMarkers.eachLayer(layer => {
        if (!(layer instanceof L.Polyline) || layer instanceof L.Polygon) return;

        tripMarkers.removeLayer(layer);
        layer.options.pane = 'historyTrackPane';
        layer.setStyle({
          color: '#ffd400',
          weight: 5,
          opacity: 0.78
        });
        layer.addTo(tripMarkers);
      });
    };
  }

  /* Navigationsroute in eigenes Pane verschieben. */
  if (typeof startWaterNavigation === 'function') {
    const originalStartWaterNavigation = startWaterNavigation;

    startWaterNavigation = async function () {
      await originalStartWaterNavigation();

      if (!navigationRoute || !navigationLayer.hasLayer(navigationRoute)) return;

      navigationLayer.removeLayer(navigationRoute);
      navigationRoute.options.pane = 'navigationPane';
      navigationRoute.setStyle({
        color: '#e52d27',
        weight: 6,
        opacity: 0.9
      });
      navigationRoute.addTo(navigationLayer);
    };

    if (typeof navigationControlElements !== 'undefined' && navigationControlElements.start) {
      L.DomEvent.off(
        navigationControlElements.start,
        'click',
        originalStartWaterNavigation
      );
      L.DomEvent.on(
        navigationControlElements.start,
        'click',
        startWaterNavigation
      );
    }
  }

  /* Freies Navigationsziel ganz nach oben. */
  if (typeof chooseNavigationTarget === 'function') {
    const originalChooseNavigationTarget = chooseNavigationTarget;

    map.off('click', originalChooseNavigationTarget);

    chooseNavigationTarget = function (event) {
      if (!navigationEnabled) return;

      navigationLayer.clearLayers();
      navigationRoute = null;
      navigationTarget = event.latlng;

      L.marker(navigationTarget, {
        pane: 'navigationUiPane'
      })
        .addTo(navigationLayer)
        .bindPopup('Navigationsziel')
        .openPopup();

      navigationControlElements.start.disabled = false;
      navigationControlElements.stop.hidden = true;
      setNavigationMessage('Ziel gewählt');
    };

    map.on('click', chooseNavigationTarget);
  }

  /* POI-Navigation: Zielmarker ebenfalls ganz oben. */
  if (typeof navigateToPoi === 'function') {
    navigateToPoi = function (feature) {
      setNavigationEnabled(true);
      navigationLayer.clearLayers();
      navigationTarget = feature.latLng;

      L.marker(navigationTarget, {
        pane: 'navigationUiPane'
      })
        .addTo(navigationLayer)
        .bindPopup('Navigationsziel');

      navigationControlElements.start.disabled = false;
      navigationControlElements.stop.hidden = true;
      setNavigationMessage(`${poiTypeName(feature)} als Ziel gewählt`);
      startWaterNavigation();
    };
  }

  /* POIs über Track und Navigationslinie. */
  if (typeof createPoiMarker === 'function') {
    createPoiMarker = function (feature) {
      if (feature.marker) return feature.marker;

      const config = POI_TYPES[feature.kind];
      const icon = L.divIcon({
        className: 'poiIconWrapper',
        html: `<span class="poiIcon poiIcon-${feature.kind}" aria-hidden="true">${config.icon}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      feature.marker = L.marker(feature.latLng, {
        icon,
        pane: 'poiPane'
      }).bindPopup(poiPopup(feature));

      if (config.navigable) {
        feature.marker.on('popupopen', event => {
          const button = event.popup.getElement()?.querySelector('.navigatePoiBtn');
          if (button) button.onclick = () => navigateToPoi(feature);
        });
      }

      return feature.marker;
    };

    /* Vorhandene Marker neu erzeugen, damit sie das neue Pane nutzen. */
    if (typeof poiFeatures !== 'undefined' && Array.isArray(poiFeatures)) {
      poiFeatures.forEach(feature => {
        if (feature.marker) {
          const config = POI_TYPES[feature.kind];
          if (config?.layer?.hasLayer(feature.marker)) {
            config.layer.removeLayer(feature.marker);
          }
          feature.marker = null;
        }
      });

      if (typeof updatePoiLayerContents === 'function') {
        updatePoiLayerContents();
      }
      if (typeof updatePoiLayerVisibility === 'function') {
        updatePoiLayerVisibility();
      }
    }
  }

  /* GPS-Marker über den POIs. */
  if (typeof onPosition === 'function') {
    const originalOnPosition = onPosition;

    onPosition = function (pos) {
      originalOnPosition(pos);

      if (!marker) return;

      if (marker.options.pane !== 'gpsPane') {
        const wasVisible = map.hasLayer(marker);
        if (wasVisible) map.removeLayer(marker);
        marker.options.pane = 'gpsPane';
        if (wasVisible) marker.addTo(map);
      }
    };
  }

  console.log('KajakTracker: Karten-Layer-Reihenfolge aktiv.');

})();
