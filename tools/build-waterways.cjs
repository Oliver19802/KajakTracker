/* Convert an Osmium GeoJSON sequence into spatially indexed country packages. */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');
const STEP = 0.25;
const TAGS = ['waterway', 'name', 'canoe', 'boat', 'access', 'width'];
function cellsFor(geometry) {
  const xs = geometry.map(p => p.lon), ys = geometry.map(p => p.lat);
  const keys = [];
  for (let y = Math.floor(Math.min(...ys) / STEP); y <= Math.floor(Math.max(...ys) / STEP); y++) {
    for (let x = Math.floor(Math.min(...xs) / STEP); x <= Math.floor(Math.max(...xs) / STEP); x++) keys.push(`${y}:${x}`);
  }
  return keys;
}
function addFeature(tiles, feature, ordinal) {
  if (feature.geometry?.type !== 'LineString') return 0;
  const tags = Object.fromEntries(TAGS.filter(k => feature.properties?.[k] != null).map(k => [k, String(feature.properties[k])]));
  if (!['river', 'canal', 'stream', 'ditch'].includes(tags.waterway)) return 0;
  const access = ['canoe', 'boat', 'access'].map(key => String(tags[key] || '').toLowerCase());
  const blocked = access.some(value => ['no', 'private', 'customers'].includes(value));
  const allowed = access.slice(0, 2).some(value => ['yes', 'designated', 'permissive', 'official'].includes(value));
  if (!blocked && !allowed && !['river', 'canal'].includes(tags.waterway)) return 0;
  const coords = feature.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2 || coords.some(p => !Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) throw new Error('Invalid geometry');
  for (let start = 0; start < coords.length - 1; start += 63) {
    const geometry = coords.slice(start, start + 64).map(([lon, lat]) => ({ lat, lon }));
    const element = { id: `${feature.properties['@id'] || feature.id || ordinal}:${start}`, tags, geometry };
    for (const key of cellsFor(geometry)) {
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push(element);
    }
  }
  return 1;
}
async function build(input, country, output, sourceDate) {
  if (!['de', 'pl'].includes(country)) throw new Error('Unknown country');
  const tiles = new Map();
  let count = 0, ordinal = 0;
  for await (const line of readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })) {
    const text = line.replace(/^\x1e/, '').trim();
    if (text) count += addFeature(tiles, JSON.parse(text), ++ordinal);
  }
  if (!count || !tiles.size) throw new Error('Empty country package');
  fs.mkdirSync(path.join(output, country), { recursive: true });
  const parts = [];
  let batch = [], size = 0;
  function flush() {
    if (!batch.length) return;
    const json = JSON.stringify({ tiles: batch });
    const data = gzipSync(json, { level: 9 });
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');
    const file = `${country}/${sha256}.json.gz`;
    fs.writeFileSync(path.join(output, file), data);
    parts.push({ file, sha256, bytes: data.length, decodedBytes: Buffer.byteLength(json), cells: batch.map(tile => tile.key) });
    batch = []; size = 0;
  }
  for (const [key, elements] of [...tiles].sort(([a], [b]) => a.localeCompare(b))) {
    const tile = { key, elements };
    const bytes = Buffer.byteLength(JSON.stringify(tile));
    if (batch.length && size + bytes > 2 * 1024 * 1024) flush();
    batch.push(tile); size += bytes;
  }
  flush();
  const version = crypto.createHash('sha256').update(parts.map(p => p.sha256).join('')).digest('hex');
  const manifest = { schema: 1, country, label: country === 'de' ? 'Deutschland' : 'Polen', version,
    generatedAt: new Date().toISOString(), sourceDate, step: STEP, ways: count,
    attribution: '© OpenStreetMap contributors · ODbL 1.0 · Geofabrik',
    source: `https://download.geofabrik.de/europe/${country === 'de' ? 'germany' : 'poland'}.html`,
    bytes: parts.reduce((sum, p) => sum + p.bytes, 0), decodedBytes: parts.reduce((sum, p) => sum + p.decodedBytes, 0), parts };
  fs.writeFileSync(path.join(output, `${country}.json`), JSON.stringify(manifest));
  console.log(`${country}: ${count} ways, ${tiles.size} tiles, ${manifest.bytes} bytes`);
  return manifest;
}
module.exports = { cellsFor, addFeature, build };
if (require.main === module) build(...process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
