/* Orbarium /next の試作：本物の土地に、バハレケの壁とテハの屋根の家を1軒。見た目を今の版とくらべるため */
import * as THREE from 'three';
import * as E from '/js/engine.js';
import { loadRealPlot } from '/js/realsite.js';
import { sunVector, dirName } from '/js/iso.js';
import { BLOCKS } from '/js/world.js';
import { PALETTES, matte, hash } from './look.js';
import { createView } from './view.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  // 畑は段々に：畑のマスは、その畑の高さで平らに
  const bedLevel = {}; for (const k in w.blocks) if (BLOCKS[w.blocks[k].t]?.kind === 'bed') { const [x, y, z] = k.split(',').map(Number); bedLevel[`${x},${y}`] = z; }
  const land = buildLand(w, N, P, { blocked: (x, y) => blockedCell.has(`${x},${y}`), flat: (x, y) => bedLevel[`${x},${y}`] ?? null });
  v.scene.add(land.group);
  // 家に枝がかかる木は、建てるときに切ったことにする（屋根を突き抜けないように）
  const hcs = Object.keys(hs.cells).map(k => k.split(',').map(Number));
  const nearHouse = (t) => t.kind !== 'shrub' && hcs.some(([x, y]) => Math.hypot(Math.max(x - t.x, 0, t.x - x - 1), Math.max(y - t.y, 0, t.y - y - 1)) < t.r * 1.1);
  const trees = buildTrees(E.W.vegObjects(w), land.at, P, { skip: (t) => hs.cells[`${t.cx},${t.cy}`] || blockedCell.has(`${t.cx},${t.cy}`) || nearHouse(t) });
  v.scene.add(trees);
  v.scene.add(buildHouse(hs, P, land.at));
  v.scene.add(buildBlocks(w, land, P));

  const c = new THREE.Vector3((Math.min(...xs) + Math.max(...xs) + 1) / 2, hs.z + 1.5, (Math.min(...ys) + Math.max(...ys) + 1) / 2);
  v.focus.copy(c); v.span = 30;
  v.resize(); v.lookAt(c, 26 * (v.camera.aspect < 1 ? 1.35 : 1), 56, 60);   // 南東の斜め上から。縦長の画面は少し引く
  // 時刻：その土地の緯度と今の月から、本物の太陽の向き
  const month = 5;
  const setHour = (hr) => { const sv = sunVector(S.lat, month, hr); v.setSun(sv.dir, sv.elev, hr < 12); $('#hourTxt').textContent = `${Math.floor(hr)}:${String(Math.round((hr % 1) * 60)).padStart(2, '0')} · ${dirName(sv.az)}から${Math.round(sv.elev)}°`; };
  $('#hour').oninput = (e) => setHour(+e.target.value);
  setHour(+$('#hour').value);
  $('#where').textContent = `${S.name} · 4〜6月`;
  v.start();
  window.__next.v = v; window.__next.setHour = setHour;
}

/* 畑とタンク（この試作では形だけ）。
   畑は段々：上の面はその段の高さで平ら（少し盛り上がる）、ふちに板。下り側は段差の土の壁（石垣があれば石） */
function buildBlocks(w, land, P) {
  const at = land.at, g = new THREE.Group();
  const leaf = matte({ color: '#ffffff', vary: 0.15, freq: 5, bump: 0.6, bumpFreq: 8, rough: 0.85, spec: 0.4 }); leaf.emissive = new THREE.Color('#25331C'); leaf.emissiveIntensity = 0.4;
  const plants = [], tanks = [], beds = [];
  for (const k in w.blocks) {
    const [x, y, z] = k.split(',').map(Number), b = w.blocks[k], D = BLOCKS[b.t]; if (!D) continue;
    if (D.kind === 'bed') beds.push({ x, y, z, stone: !!(b.s || (w.stone && w.stone[`${x},${y}`])) });
    else if (D.kind === 'tank') tanks.push([x + 0.5, at(x + 0.5, y + 0.5), y + 0.5]);
  }
  if (beds.length) {
    const q = 0.08, up = 0.16, n = 4, parts = [], top = new THREE.Color('#6B4C33'), low = new THREE.Color('#4A3424'), stoneC = new THREE.Color(P.stone), c = new THREE.Color();
    const boards = [];
    const lv = {}; for (const b of beds) lv[`${b.x},${b.y}`] = b;
    const pathC = new THREE.Color(P.grass).lerp(new THREE.Color(P.soil), 0.55);
    const quad = (A, B, C, D, cA, cB, cC, cD) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...C, ...B, ...D, ...C], 3)); g.setAttribute('color', new THREE.Float32BufferAttribute([cA, cB, cC, cB, cD, cC].flatMap(c => [c.r, c.g, c.b]), 3)); g.computeVertexNormals(); parts.push(g); };
    for (const b of beds) {
      const L = b.z, x0 = b.x + q, x1 = b.x + 1 - q, y0 = b.y + q, y1 = b.y + 1 - q;
      // 段の台：マスいっぱいの平らな面（通路）と、下り側の土の壁（となりも同じ高さ以上の段なら壁は要らない）
      const T = L - 0.01, bot = Math.min(at(b.x, b.y), at(b.x + 1, b.y), at(b.x, b.y + 1), at(b.x + 1, b.y + 1), L) - 0.6;
      c.copy(pathC).multiplyScalar(0.94 + 0.12 * hash(b.x, b.y, 7));
      quad([b.x, T, b.y], [b.x, T, b.y + 1], [b.x + 1, T, b.y], [b.x + 1, T, b.y + 1], c, c, c, c);   // 上向き
      const wallTop = b.stone ? stoneC.clone().multiplyScalar(0.95) : top.clone().multiplyScalar(0.9), wallBot = b.stone ? stoneC.clone().multiplyScalar(0.7) : low;
      for (const [dx, dy, A, B] of [[0, -1, [b.x + 1, b.y], [b.x, b.y]], [1, 0, [b.x + 1, b.y + 1], [b.x + 1, b.y]], [0, 1, [b.x, b.y + 1], [b.x + 1, b.y + 1]], [-1, 0, [b.x, b.y], [b.x, b.y + 1]]]) {
        const nb = lv[`${b.x + dx},${b.y + dy}`]; if (nb && nb.z >= L) continue;
        quad([B[0], T, B[1]], [A[0], T, A[1]], [B[0], bot, B[1]], [A[0], bot, A[1]], wallTop, wallTop, wallBot, wallBot);   // 外向き
      }
      // 畑の盛り：上の面は 4×4 の格子でゆるく盛る。側面は台の面まで
      const crown = (u, v) => 0.04 * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2);
      const H = (u, v) => L + up + crown(u, v);
      const tp = [], tc = [], ti = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const u = i / n, v = j / n; tp.push(x0 + (x1 - x0) * u, H(u, v), y0 + (y1 - y0) * v); c.copy(top).multiplyScalar(0.95 + 0.1 * hash(b.x * 5 + i, b.y * 5 + j, 3)); tc.push(c.r, c.g, c.b); }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, bb = a + 1, d = a + n + 1, e = d + 1; ti.push(a, d, bb, bb, d, e); }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); tg.setIndex(ti); tg.computeVertexNormals(); parts.push(tg.toNonIndexed());
      const side = top.clone().multiplyScalar(0.8);
      for (const [A, B] of [[[x1, y0], [x0, y0]], [[x1, y1], [x1, y0]], [[x0, y1], [x1, y1]], [[x0, y0], [x0, y1]]]) quad([B[0], L + up, B[1]], [A[0], L + up, A[1]], [B[0], T - 0.02, B[1]], [A[0], T - 0.02, A[1]], side, side, low, low);
      // ふちの板（4 辺）
      const bw = 0.035, bh = 0.2, by = L + up - 0.08;
      boards.push([(x0 + x1) / 2, by, y0, x1 - x0 + bw, bh, bw], [(x0 + x1) / 2, by, y1, x1 - x0 + bw, bh, bw], [x0, by, (y0 + y1) / 2, bw, bh, y1 - y0 - bw], [x1, by, (y0 + y1) / 2, bw, bh, y1 - y0 - bw]);
      // 作物：盛りの上に 2×2
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const u = 0.27 + i * 0.46, v = 0.27 + j * 0.46; plants.push([x0 + (x1 - x0) * u, H(u, v) + 0.07, y0 + (y1 - y0) * v, hash(b.x + i, b.y + j, 1)]); }
    }
    const bm = new THREE.Mesh(mergeGeometries(parts), matte({ color: '#ffffff', vertexColors: true, vary: 0.18, freq: 3, bump: 0.8, bumpFreq: 5 }));
    bm.receiveShadow = true; bm.castShadow = true; g.add(bm);
    const bg = new THREE.BoxGeometry(1, 1, 1), bmat = matte({ color: P.wood, vary: 0.2, freq: 4, bump: 0.3, bumpFreq: 9 }), im = new THREE.InstancedMesh(bg, bmat, boards.length), mt = new THREE.Matrix4();
    boards.forEach(([x, y, z, sx, sy, sz], i) => { mt.makeScale(sx, sy, sz).setPosition(x, y, z); im.setMatrixAt(i, mt); });
    im.castShadow = im.receiveShadow = true; g.add(im);
  }
  if (plants.length) { const geo = new THREE.IcosahedronGeometry(0.14, 2), m = new THREE.InstancedMesh(geo, leaf, plants.length), mt = new THREE.Matrix4(), c = new THREE.Color();
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
