const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../waterway-status.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function bounds(w = 0, e = 1) {
  return {w,e,contains:b => w <= b.w && e >= b.e,
    pad:p => bounds(w-(e-w)*p,e+(e-w)*p),
    getSouth:()=>0,getNorth:()=>1,getWest:()=>w,getEast:()=>e};
}
function setup(ignoreAbort = false) {
  let id = 0;
  const timers = new Map(), calls = [], events = {}, windowEvents = {}, nodes = [];
  const layer = {items:[],addTo(){return this;},clearLayers(){this.items=[];}};
  const map = {zoom:12,bounds:bounds(), getZoom(){return this.zoom;},getBounds(){return this.bounds;},
    getPane:()=>({style:{}}),_controlCorners:{bottomcenter:{}},on:(names,fn)=>names.split(' ').forEach(n=>events[n]=fn)};
  const navigator = {onLine:true};
  vm.runInNewContext(source, {
    map,navigator,window:{addEventListener:(n,fn)=>windowEvents[n]=fn},
    AbortController,DOMException,URLSearchParams,Date,console:{error(){}},waterwayRenderer:{},escapeHtml:s=>s,
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:i=>timers.delete(i),
    fetch:(url,options)=>new Promise((resolve,reject)=>{
      calls.push({url,options,resolve,reject});
      if (!ignoreAbort) options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));
    }),
    L:{layerGroup:()=>layer,polyline:(points,style)=>({points,style,bindPopup(){},addTo(l){l.items.push(this);}}),
      control:()=>({addTo(){this.onAdd();}}),DomEvent:{disableClickPropagation(){}},
      DomUtil:{create:()=>{const n={style:{},setAttribute(){}};nodes.push(n);return n;}}}
  });
  return {map,layer,calls,timers,navigator,events,windowEvents,
    status:()=>nodes.at(-1).textContent,
    async tick(ms){const t=[...timers].find(([,t])=>t.ms===ms);assert.ok(t,`timer ${ms}`);timers.delete(t[0]);t[1].fn();await flush();},
    async reply(i,data){calls[i].resolve({ok:true,json:async()=>data});await flush();},
    async move(b){map.bounds=b;events.moveend();await this.tick(650);}
  };
}
const data = (name='river') => ({elements:[{tags:{waterway:'river',name},geometry:[{lat:0,lon:0},{lat:1,lon:1}]}]});

test('small movements reuse an in-flight request and render blue in the waterway pane',async()=>{
  const s=setup();await s.tick(650);await s.move(bounds(.05,1.05));
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].options.signal.aborted,false);
  await s.reply(0,data());assert.equal(s.layer.items.length,1);
  assert.equal(s.layer.items[0].style.color,'#168bd2');assert.equal(s.layer.items[0].style.pane,'waterwayPane');
});
test('hanging endpoint times out and uses another server',async()=>{
  const s=setup();await s.tick(650);await s.tick(20000);
  assert.equal(s.calls.length,2);assert.notEqual(s.calls[0].url,s.calls[1].url);
  await s.reply(1,data());assert.equal(s.layer.items.length,1);
});
test('HTTP 200 runtime-error responses do not erase good lines; retries back off',async()=>{
  const s=setup();await s.tick(650);await s.reply(0,data());const old=s.layer.items[0];
  await s.move(bounds(5,6));
  for(let i=1;i<=3;i++)await s.reply(i,{elements:[],remark:'runtime error: timeout'});
  assert.equal(s.layer.items[0],old);assert.match(s.status(),/fehlgeschlagen/);
  await s.tick(4000);
  for(let i=4;i<=6;i++)await s.reply(i,{elements:[],remark:'runtime error'});
  assert.ok([...s.timers.values()].some(t=>t.ms===8000));
});
test('zooming out cancels loading and cannot repopulate hidden lines',async()=>{
  const s=setup();await s.tick(650);s.map.zoom=10;s.events.zoomend();await flush();
  assert.equal(s.calls[0].options.signal.aborted,true);await s.reply(0,data());
  assert.equal(s.layer.items.length,0);assert.match(s.status(),/heranzoomen/);
});
test('returning to loaded area cancels an obsolete request',async()=>{
  const s=setup();await s.tick(650);await s.reply(0,data());const old=s.layer.items[0];
  await s.move(bounds(5,6));await s.move(bounds());
  assert.equal(s.calls[1].options.signal.aborted,true);await s.reply(1,data('old viewport'));
  assert.equal(s.layer.items[0],old);
});
test('recent areas are reused without a new network request',async()=>{
  const s=setup();await s.tick(650);await s.reply(0,data());
  await s.move(bounds(5,6));await s.reply(1,data());await s.move(bounds());
  assert.equal(s.calls.length,2);assert.equal(s.layer.items.length,1);
});
test('offline retains existing lines and reconnect starts a fresh request',async()=>{
  const s=setup();await s.tick(650);await s.reply(0,data());
  s.navigator.onLine=false;s.windowEvents.offline();await flush();
  assert.equal(s.layer.items.length,1);assert.match(s.status(),/Offline/);
  await s.move(bounds(9,10));assert.equal(s.calls.length,1);
  s.navigator.onLine=true;s.windowEvents.online();await flush();assert.equal(s.calls.length,2);
});
test('malformed geometry cannot clear existing lines',async()=>{
  const s=setup();await s.tick(650);await s.reply(0,data());const old=s.layer.items[0];
  await s.move(bounds(5,6));const bad=data();bad.elements[0].geometry[1].lat=null;
  await s.reply(1,bad);assert.equal(s.layer.items[0],old);assert.match(s.status(),/fehlgeschlagen/);
});
test('valid empty result is accepted rather than endlessly retried',async()=>{
  const s=setup();await s.tick(650);await s.reply(0,{elements:[]});
  assert.equal(s.layer.items.length,0);assert.equal(s.timers.size,0);
  await s.move(bounds());assert.equal(s.calls.length,1);
});
test('obsolete failures cannot schedule retries for the new area',async()=>{
  const s=setup();await s.tick(650);await s.move(bounds(8,9));
  await s.reply(1,data());assert.equal(s.timers.size,0);assert.equal(s.calls.length,2);
});
test('late response from a cancelled request cannot overwrite current lines',async()=>{
  const s=setup(true);await s.tick(650);await s.move(bounds(8,9));await s.reply(1,data());
  const current=s.layer.items[0];await s.reply(0,{elements:[]});assert.equal(s.layer.items[0],current);
});
test('invalid JSON shape and HTTP errors fall back to the next endpoint',async()=>{
  const s=setup();await s.tick(650);await s.reply(0,null);
  s.calls[1].resolve({ok:false,status:429});await flush();await s.reply(2,data());
  assert.equal(s.calls.length,3);assert.equal(s.layer.items.length,1);
});
test('the next area starts with the last successful server',async()=>{
  const s=setup();await s.tick(650);await s.tick(20000);await s.reply(1,data());
  await s.move(bounds(8,9));assert.equal(s.calls[2].url,s.calls[1].url);
});
