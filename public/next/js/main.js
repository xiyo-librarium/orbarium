/* Orbarium /next の試作：本物の土地に、バハレケの壁とテハの屋根の家を1軒。見た目を今の版とくらべるため */
import * as THREE from 'three';
import * as E from '/js/engine.js';
import { loadRealPlot } from '/js/realsite.js';
import { sunVector, dirName } from '/js/iso.js';
import { BLOCKS } from '/js/world.js';
import { PALETTES, matte, hash } from './look.js';
import { createView } from './view.js';
import { buildLand, buildTrees } from './land.js';
import { buildHouse } from './house.js';
import { buildGlobe, subsolar, ll } from './globe.js';

const $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search), SITE = Q.get('site') || 'med';

async function boot() {
  const S = E.SITES[SITE];
  $('#where').textContent = `${S.name} · 土地を読みこみ中…`;
  let real = null;
  try { real = await loadRealPlot(S.lat0 ?? S.lat, S.lon0 ?? S.lon); E.applyReal(SITE, real); } catch (e) { console.warn('実データなし', e); }
  let s = E.newGame({ site: SITE, seed: 7, real }); s.world.site = SITE;
  s.known.push('heap', 'tank', 'mulch');
  // 試作の家：その土地の工法で（メデジンは土壁とテハ、タオスはアドベと土の屋根）
  const w = s.world, d = E.W.cloneHouse(w.house);
  Object.assign(d, SITE === 'taos' ? { wall: 'adobe', roof: 'mud', floor: 'tierra', eaves: 0.16 } : { wall: 'bahareque', finish: 'earth', accent: 0, roof: 'teja', roofShape: 'gable', roofDir: 'ns', pitch: 0.5, eaves: 0.9, floor: 'baldosa' });
  let i = 0; for (const o of E.W.houseOuterEdges(d)) { if (!d.open[o.e] && i % 3 === 1) d.open[o.e] = 'window'; i++; }
  E.W.buildHouse(s, d);
  const cs = Object.keys(w.house.cells).map(k => k.split(',').map(Number)), xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
  try { const bxx = Math.min(...xs) - 1, byy = Math.max(...ys) + 3; E.W.prefabBeds(s, [bxx, byy], [bxx + 6, byy + 3], 'hire'); } catch { /* 置けなければなし */ }
  window.__next = { s, E };

  const P = PALETTES[SITE] || PALETTES.med, N = E.W.N;
  const v = createView($('#c'), { keep: new URLSearchParams(location.search).has('shot') });
  v.setPalette(P);
  const hs = w.house;
  const blockedCell = new Set(Object.keys(w.blocks).map(k => k.split(',').slice(0, 2).join(',')));
  const land = buildLand(w, N, P, { blocked: (x, y) => blockedCell.has(`${x},${y}`) });
  v.scene.add(land.group);
  const trees = buildTrees(E.W.vegObjects(w), land.at, P, { skip: (t) => hs.cells[`${t.cx},${t.cy}`] || blockedCell.has(`${t.cx},${t.cy}`) });
  v.scene.add(trees);
  v.scene.add(buildHouse(hs, P, land.at));
  v.scene.add(buildBlocks(w, land.at, P));

  const c = new THREE.Vector3((Math.min(...xs) + Math.max(...xs) + 1) / 2, hs.z + 1.5, (Math.min(...ys) + Math.max(...ys) + 1) / 2);
  v.focus.copy(c); v.span = 30;
  v.resize(); v.lookAt(c, 26 * (v.camera.aspect < 1 ? 1.35 : 1), 56, 60);   // 南東の斜め上から。縦長の画面は少し引く
  // 時刻：その土地の緯度と今の月から、本物の太陽の向き
  const month = 5;
  const setHour = (hr) => { const sv = sunVector(S.lat, month, hr); v.setSun(sv.dir, sv.elev); $('#hourTxt').textContent = `${Math.floor(hr)}:${String(Math.round((hr % 1) * 60)).padStart(2, '0')} · ${dirName(sv.az)}から${Math.round(sv.elev)}°`; };
  $('#hour').oninput = (e) => setHour(+e.target.value);
  setHour(+$('#hour').value);
  $('#where').textContent = `${S.name} · 4〜6月`;
  v.start();
  window.__next.v = v; window.__next.setHour = setHour;
}

/* 畑とタンク（この試作では形だけ） */
function buildBlocks(w, at, P) {
  const g = new THREE.Group(), soil = matte({ color: '#5E4530', vary: 0.18, freq: 3, bump: 0.8, bumpFreq: 5 }), rim = matte({ color: '#7A5A3C', vary: 0.12, freq: 4, bump: 0.4 });
  const leaf = matte({ color: '#ffffff', vary: 0.15, freq: 5, bump: 0.6, bumpFreq: 8 }); leaf.emissive = new THREE.Color('#25331C'); leaf.emissiveIntensity = 0.4;
  const plants = [], tanks = [], beds = [];
  for (const k in w.blocks) {
    const [x, y, z] = k.split(',').map(Number), b = w.blocks[k], D = BLOCKS[b.t]; if (!D) continue;
    if (D.kind === 'bed') {
      // 畑：斜面にそった土の盛り（四隅の高さを地面から取る）。継ぎ目のない1枚に
      beds.push([x, y]);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const px = x + 0.28 + i * 0.44, py = y + 0.28 + j * 0.44; plants.push([px, at(px, py) + 0.17, py, hash(x + i, y + j, 1)]); }
    } else if (D.kind === 'tank') tanks.push([x + 0.5, at(x + 0.5, y + 0.5), y + 0.5]);
  }
  if (beds.length) {
    const pos = [], q = 0.04, up = 0.1;
    for (const [x, y] of beds) {
      const C = [[x + q, y + q], [x + 1 - q, y + q], [x + 1 - q, y + 1 - q], [x + q, y + 1 - q]], top = C.map(([a, b]) => [a, at(a, b) + up, b]), bot = C.map(([a, b]) => [a, at(a, b) - 0.05, b]);
      pos.push(...top[0], ...top[3], ...top[1], ...top[1], ...top[3], ...top[2]);
      for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; pos.push(...top[k], ...top[j], ...bot[k], ...bot[k], ...top[j], ...bot[j]); }
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, soil); bm.receiveShadow = true; bm.castShadow = true; soil.side = THREE.DoubleSide; g.add(bm);
  }
  if (plants.length) { const geo = new THREE.IcosahedronGeometry(0.14, 1), m = new THREE.InstancedMesh(geo, leaf, plants.length), mt = new THREE.Matrix4(), c = new THREE.Color();
    plants.forEach(([x, y, z, r], i) => { mt.makeScale(1, 0.75, 1).setPosition(x, y, z); m.setMatrixAt(i, mt); m.setColorAt(i, c.set(r > 0.5 ? '#6E9A45' : '#7FA550')); }); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  for (const [x, y, z] of tanks) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 24), matte({ color: '#B4B6A6', vary: 0.06, freq: 2, rough: 0.7 })); m.position.set(x, y + 0.6, z); m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}

/* 地球：東京からメデジンへ。昼と夜の境目は今の本物の太陽 */
async function bootGlobe() {
  const rings = await (await fetch('/data/land110.json')).json();
  const v = createView($('#c'), { keep: Q.has('shot') });
  v.setPalette({ ...PALETTES.med, sky: ['#D9DEDB', '#EFEADF'] });
  v.scene.fog = null; v.scene.environmentIntensity = 0.45; v.ao.enabled = false; v.dof.enabled = false; v.sun.castShadow = false;
  const med = E.SITES.med, taos = E.SITES.taos;
  const pins = [{ lat: 35.68, lon: 139.69, main: true, color: '#3F6E8C' }, { lat: Math.round(med.lat * 10) / 10, lon: Math.round(med.lon * 10) / 10, main: true }, { lat: Math.round(taos.lat * 10) / 10, lon: Math.round(taos.lon * 10) / 10 }];
  const globe = buildGlobe(rings, pins, [{ lat: 35.68, lon: 139.69 }, { lat: med.lat, lon: med.lon }]);
  v.scene.add(globe);
  const c = v.controls; c.enablePan = false; c.minDistance = 2.4; c.maxDistance = 7; c.minPolarAngle = 0.2; c.maxPolarAngle = Math.PI - 0.2; c.target.set(0, 0, 0); c.rotateSpeed = 0.5;
  v.camera.near = 0.05; v.camera.far = 50; v.camera.fov = 30; v.camera.updateProjectionMatrix();
  const ss = subsolar(new Date()), sd = ll(ss.lat, ss.lon).normalize();
  v.sun.position.copy(sd).multiplyScalar(10); v.sun.target.position.set(0, 0, 0); v.sun.color.set('#FFF1DE'); v.sun.intensity = 3.2;
  globe.userData.atm.material.uniforms.s.value.copy(sd);
  // 最初は東京の上から（出発地）。地球が画面に収まる距離に
  const fit = () => { const a = v.camera.aspect || 1, d = 1.3 / Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2)) / Math.min(1, a); return d; };
  v.resize(); v.camera.position.copy(ll(28, 160, 1).normalize().multiplyScalar(fit())); c.maxDistance = Math.max(7, fit() * 1.5); c.update();
  $('#where').textContent = '地球 · いまの太陽'; document.querySelector('.sun').style.display = 'none';
  document.querySelector('.note').innerHTML = '東京からメデジンへ。<a href="/next/">メデジンに降りる</a> · <a href="/">今の版へ</a>';
  v.start(); window.__next = { v };
}

if (Q.has('globe')) bootGlobe(); else boot();
