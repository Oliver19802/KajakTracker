/* KajakTracker – Auswahl- und Mehrfachexport gespeicherter Touren. */
(function () {
  'use strict';

  const button = document.getElementById('gpxBtn');
  if (!button || typeof getTrips !== 'function') return;

  const style = document.createElement('style');
  style.textContent = `
    .gpxExportDialog{width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:0;border:0;border-radius:18px;color:#183f55;box-shadow:0 12px 45px #0005}
    .gpxExportDialog::backdrop{background:#0a1f2a8f}.gpxExportDialog form{display:grid;gap:12px;padding:16px}.gpxExportDialog h2{margin:0;font-size:20px}
    .gpxExportTools,.gpxExportActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gpxExportTools button,.gpxExportActions button{min-height:46px;font-size:13px}
    .gpxExportList{display:grid;max-height:min(430px,50dvh);overflow-y:auto;border:1px solid #c8dde1;border-radius:12px}.gpxExportItem{display:flex;min-height:58px;align-items:center;gap:10px;padding:9px 11px;cursor:pointer}
    .gpxExportItem+.gpxExportItem{border-top:1px solid #c8dde1}.gpxExportItem input{width:23px;height:23px;flex:none}.gpxExportItem strong,.gpxExportItem small{display:block;overflow-wrap:anywhere}.gpxExportItem small{margin-top:3px;color:#5f8189}.gpxExportStatus{min-height:20px;margin:0;color:#b52c27;font-size:13px;font-weight:700}
    @media(max-width:480px){.gpxExportTools{grid-template-columns:1fr}.gpxExportDialog form{padding:13px}}
  `;
  document.head.appendChild(style);

  const dialog = document.createElement('dialog');
  dialog.className = 'gpxExportDialog';
  dialog.setAttribute('aria-labelledby', 'gpxExportTitle');
  dialog.innerHTML = `<form method="dialog"><h2 id="gpxExportTitle">Touren als GPX exportieren</h2><div class="gpxExportTools"><button type="button" data-action="all">Alle auswählen</button><button type="button" data-action="none">Auswahl aufheben</button></div><div class="gpxExportList"></div><p class="gpxExportStatus" role="status"></p><div class="gpxExportActions"><button type="button" data-action="cancel">Abbrechen</button><button type="button" class="primary" data-action="export">Exportieren</button></div></form>`;
  document.body.appendChild(dialog);

  const list = dialog.querySelector('.gpxExportList');
  const status = dialog.querySelector('.gpxExportStatus');
  const xmlEscape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const tripName = trip => String(trip.locationName || trip.placeName || trip.name || trip.gpxName || 'Unbekannter Ort').trim() || 'Unbekannter Ort';
  const safeName = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Tour';
  const validPoints = trip => Array.isArray(trip.track) ? trip.track.filter(point => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))) : [];

  function trackXml(trip) {
    const points = validPoints(trip).map(point => {
      const time = point.time && !Number.isNaN(Date.parse(point.time)) ? `<time>${xmlEscape(new Date(point.time).toISOString())}</time>` : '';
      return `<trkpt lat="${Number(point.lat)}" lon="${Number(point.lon)}">${time}</trkpt>`;
    }).join('');
    return `<trk><name>${xmlEscape(tripName(trip))}</name><trkseg>${points}</trkseg></trk>`;
  }

  function download(selected) {
    const exportable = selected.filter(trip => validPoints(trip).length >= 2);
    if (!exportable.length) return false;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="KajakTracker" xmlns="http://www.topografix.com/GPX/1/1">${exportable.map(trackXml).join('')}</gpx>`;
    const date = new Date(exportable[0].startedAt || exportable[0].date || Date.now());
    const datePart = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
    const filename = exportable.length === 1 ? `KajakTracker_${safeName(tripName(exportable[0]))}_${datePart}.gpx` : `KajakTracker_${exportable.length}_Touren_${datePart}.gpx`;
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  }

  function open() {
    const trips = getTrips().slice().sort((a, b) => new Date(b.startedAt || b.date || 0) - new Date(a.startedAt || a.date || 0));
    list.innerHTML = '';
    trips.forEach(trip => {
      const item = document.createElement('label'); item.className = 'gpxExportItem';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = String(trip.id);
      const text = document.createElement('span');
      const date = new Date(trip.startedAt || trip.date); const dateText = Number.isNaN(date.getTime()) ? 'Datum unbekannt' : date.toLocaleDateString('de-DE');
      text.innerHTML = `<strong>${xmlEscape(tripName(trip))}</strong><small>${dateText} · ${fmtKm(Number(trip.distance) || 0)} km</small>`;
      item.append(checkbox, text); list.appendChild(item);
    });
    if (!trips.length) list.innerHTML = '<div class="noTrips">Noch keine gespeicherten Touren.</div>';
    status.textContent = '';
    dialog.showModal();
  }

  button.onclick = open;
  dialog.querySelector('[data-action="all"]').onclick = () => list.querySelectorAll('input').forEach(input => { input.checked = true; });
  dialog.querySelector('[data-action="none"]').onclick = () => list.querySelectorAll('input').forEach(input => { input.checked = false; });
  dialog.querySelector('[data-action="cancel"]').onclick = () => dialog.close();
  dialog.querySelector('[data-action="export"]').onclick = () => {
    const ids = new Set(Array.from(list.querySelectorAll('input:checked'), input => input.value));
    const selected = getTrips().filter(trip => ids.has(String(trip.id)));
    if (!selected.length) { status.textContent = 'Bitte mindestens eine Tour auswählen.'; return; }
    if (download(selected)) dialog.close(); else status.textContent = 'Die Auswahl enthält keine exportierbaren GPS-Daten.';
  };
}());
