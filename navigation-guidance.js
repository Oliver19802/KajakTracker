/* KajakTracker – visuelle und gesprochene Wasserweg-Navigationshinweise. */
(function () {
  'use strict';
  if (typeof map === 'undefined' || typeof L === 'undefined' || typeof startWaterNavigation !== 'function') return;

  const VOICE_KEY = 'kajakNavigationVoice';
  let voiceEnabled = localStorage.getItem(VOICE_KEY) !== 'false';
  let routeGuide = null;
  let active = false;
  let offRouteSpoken = false;
  let destinationSpoken = false;

  function speak(text) {
    if (!active || !voiceEnabled || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'de-DE'; utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }
  function primeIosSpeech() {
    if (!voiceEnabled || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance('Navigation wird gestartet.');
    utterance.lang = 'de-DE';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }
  function bearing(a, b) {
    const rad = value => value * Math.PI / 180, lat1 = rad(a[0]), lat2 = rad(b[0]), dl = rad(b[1] - a[1]);
    return (Math.atan2(Math.sin(dl) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dl)) * 180 / Math.PI + 360) % 360;
  }
  const delta = (a, b) => ((b - a + 540) % 360) - 180;
  const direction = value => ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'][Math.round(value / 45) % 8];
  function label(value) {
    const size = Math.abs(value); if (size < 28) return null;
    const side = value > 0 ? 'rechts' : 'links';
    return size < 55 ? `${side} halten` : size < 125 ? `${side} abbiegen` : `scharf ${side}`;
  }
  function build(points) {
    const cumulative = [0];
    for (let i = 1; i < points.length; i += 1) cumulative[i] = cumulative[i - 1] + L.latLng(points[i - 1]).distanceTo(points[i]);
    const maneuvers = []; let previous = -Infinity;
    for (let i = 2; i < points.length - 2; i += 1) {
      let before = i - 1, after = i + 1;
      while (before > 0 && cumulative[i] - cumulative[before] < 35) before -= 1;
      while (after < points.length - 1 && cumulative[after] - cumulative[i] < 35) after += 1;
      const text = label(delta(bearing(points[before], points[i]), bearing(points[i], points[after])));
      if (!text || cumulative[i] - previous < 90) continue;
      maneuvers.push({ distance: cumulative[i], text, far: false, near: false }); previous = cumulative[i];
    }
    let startIndex = 1; while (startIndex < points.length - 1 && cumulative[startIndex] < 50) startIndex += 1;
    return { points, cumulative, maneuvers, total: cumulative.at(-1), direction: direction(bearing(points[0], points[startIndex])) };
  }
  function progress(position) {
    if (!routeGuide) return null; const point = L.latLng(position); let best = null;
    for (let i = 1; i < routeGuide.points.length; i += 1) {
      const a = L.latLng(routeGuide.points[i - 1]), b = L.latLng(routeGuide.points[i]);
      const scale = Math.cos(point.lat * Math.PI / 180), ax = (a.lng - point.lng) * scale, ay = a.lat - point.lat, bx = (b.lng - point.lng) * scale, by = b.lat - point.lat;
      const length = (bx - ax) ** 2 + (by - ay) ** 2;
      const fraction = length ? Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / length)) : 0;
      const projected = L.latLng(a.lat + (b.lat - a.lat) * fraction, a.lng + (b.lng - a.lng) * fraction);
      const distance = point.distanceTo(projected), along = routeGuide.cumulative[i - 1] + (routeGuide.cumulative[i] - routeGuide.cumulative[i - 1]) * fraction;
      if (!best || distance < best.distance) best = { distance, along };
    }
    return best;
  }
  const distanceText = meters => meters >= 1000 ? `${fmtKm(meters)} km` : `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  function update(position) {
    if (!active || !routeGuide) return; const current = progress(position); if (!current) return;
    if (current.distance > 80) {
      setNavigationMessage('Route verlassen. Route neu berechnen.', true);
      if (!offRouteSpoken) { offRouteSpoken = true; speak('Route verlassen.'); }
      return;
    }
    offRouteSpoken = false;
    const next = routeGuide.maneuvers.find(item => item.distance > current.along + 10), remaining = routeGuide.total - current.along;
    if (!next) {
      setNavigationMessage(`◎ Ziel in ${distanceText(remaining)}`);
      if (remaining <= 100 && !destinationSpoken) { destinationSpoken = true; speak('Ziel in 100 Metern.'); }
      return;
    }
    const meters = next.distance - current.along;
    setNavigationMessage(`${next.text.includes('rechts') ? '↱' : '↰'} ${next.text} · ${distanceText(meters)}`);
    if (meters <= 220 && meters > 70 && !next.far) { next.far = true; speak(`In ${Math.round(meters / 10) * 10} Metern ${next.text}.`); }
    else if (meters <= 60 && !next.near) { next.near = true; speak(`In 50 Metern ${next.text}.`); }
  }

  const originalStart = startWaterNavigation;
  startWaterNavigation = async function () {
    await originalStart();
    if (!navigationRoute) return;
    const points = navigationRoute.getLatLngs().map(point => [point.lat, point.lng]);
    if (points.length < 2) return;
    routeGuide = build(points); active = true; offRouteSpoken = false; destinationSpoken = false;
    setNavigationMessage(`↑ Richtung ${routeGuide.direction} · ${fmtKm(routeGuide.total)} km`);
    speak(`Starte Richtung ${routeGuide.direction}.`);
  };
  if (navigationControlElements.start) {
    L.DomEvent.off(navigationControlElements.start, 'click', originalStart);
    L.DomEvent.on(navigationControlElements.start, 'click', () => {
      /* Auf iOS muss die erste Ausgabe direkt im Benutzer-Klick erfolgen.
         Die eigentliche Richtungsansage darf danach asynchron folgen. */
      primeIosSpeech();
      startWaterNavigation();
    });
    const voice = document.createElement('label'); voice.className = 'navigationVoice';
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = voiceEnabled;
    voice.append(toggle, document.createTextNode(' 🔊 Sprachansagen'));
    navigationControlElements.actions = navigationControlElements.start.parentElement;
    navigationControlElements.actions.before(voice);
    L.DomEvent.on(toggle, 'change', () => {
      voiceEnabled = toggle.checked;
      localStorage.setItem(VOICE_KEY, String(voiceEnabled));
      if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      else if (voiceEnabled) primeIosSpeech();
    });
  }
  const originalPosition = onPosition;
  onPosition = function (position) { originalPosition(position); update([position.coords.latitude, position.coords.longitude]); };
  const originalClear = clearNavigation;
  clearNavigation = function () { active = false; routeGuide = null; if ('speechSynthesis' in window) window.speechSynthesis.cancel(); originalClear(); };
  if (navigationControlElements.stop) {
    L.DomEvent.off(navigationControlElements.stop, 'click', originalClear);
    L.DomEvent.on(navigationControlElements.stop, 'click', clearNavigation);
  }

  const style = document.createElement('style');
  style.textContent = '.navigationVoice{display:flex;align-items:center;gap:5px;min-height:38px;padding:4px 8px;font-size:12px;font-weight:800}.navigationVoice input{width:22px;height:22px}';
  document.head.appendChild(style);
}());
