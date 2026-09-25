const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { addFeature, build } = require('../tools/build-waterways.cjs');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../waterway-offline.js'),'utf8'),context);
const { validateManifest, validatePart } = context.window.KajakWaterwayPackageValidation;
const feature = { type:'Feature',id:'way/123',properties:{waterway:'river',canoe:'yes',access:'private',name:'Testfluss'},geometry:{type:'LineString',coordinates:[[13.24,52.1],[13.26,52.1]]} };
test('geometry crossing a grid boundary is present in both cells with matching IDs and access tags',()=>{
  const tiles=new Map();assert.equal(addFeature(tiles,feature,1),1);assert.equal(tiles.size,2);
  const values=[...tiles.values()];assert.equal(values[0][0].id,values[1][0].id);
  assert.equal(values[0][0].tags.access,'private');assert.equal(values[0][0].tags.canoe,'yes');
});
test('long waterways split with shared endpoints and no gaps',()=>{
  const f=structuredClone(feature);f.geometry.coordinates=Array.from({length:130},(_,i)=>[13.1+i*.0001,52.1]);
  const tiles=new Map();addFeature(tiles,f,1);const ways=[...tiles.values()][0];
  assert.equal(ways.length,3);assert.deepEqual(ways[0].geometry.at(-1),ways[1].geometry[0]);
  assert.deepEqual(ways[1].geometry.at(-1),ways[2].geometry[0]);
});
test('package omits only streams and ditches which the map would never draw',()=>{
  const tiles=new Map();const f=structuredClone(feature);f.properties={waterway:'ditch'};
  assert.equal(addFeature(tiles,f,1),0);f.properties.canoe='yes';assert.equal(addFeature(tiles,f,1),1);
  f.properties={waterway:'stream',access:'no'};assert.equal(addFeature(tiles,f,1),1);
});
test('generated package passes the client validators and exact checksums',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kajak-waterway-test-'));
  try {
    const input=path.join(dir,'source.jsonseq');fs.writeFileSync(input,'\x1e'+JSON.stringify(feature)+'\n');
    const m=await build(input,'de',dir,'2026-09-25T00:00:00Z');validateManifest(m,'de');
    for(const p of m.parts){const bytes=fs.readFileSync(path.join(dir,p.file));assert.equal(bytes.length,p.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),p.sha256);const decoded=gunzipSync(bytes);assert.equal(decoded.length,p.decodedBytes);validatePart(JSON.parse(decoded),p);}
    const bad=structuredClone(m);bad.parts[0].file='../escape.json';assert.throws(()=>validateManifest(bad,'de'));
    const duplicate=structuredClone(m);duplicate.parts[0].cells.push(duplicate.parts[0].cells[0]);assert.throws(()=>validateManifest(duplicate,'de'));
    assert.throws(()=>validatePart({tiles:[]},m.parts[0]));
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
