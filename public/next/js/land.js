/* 土地：本物の標高（1m の段）を、描くときだけなだらかな斜面にする。草・木・畑 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { matte, hash } from './look.js';

/* 座標：world.x＝東 → three.x、world.y＝南 → three.z、高さ → three.y */
export function landHeights(world, N) {
  const H = (x, y) => world.H[Math.max(0, Math.min(N - 1, y)) * N + Math.max(0, Math.min(N - 1, x))];
  // マスの中心はそのマスの高さ、間は双一次でつなぐ（1m の段が、なめらかな斜面になる）
  const at = (px, py) => {
    const fx = px - 0.5, fy = py - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = H(x0, y0), b = H(x0 + 1, y0), c = H(x0, y0 + 1), d = H(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  return { H, at };
}

export function buildLand(world, N, P, opt = {}) {
  const group = new THREE.Group(), { H, at } = landHeights(world, N);
  const veg = (x, y) => world.veg ? world.veg[Math.max(0, Math.min(N - 1, y)) * N + Math.max(0, Math.min(N - 1, x))] : 30;
  const hs = world.house, inHouse = (x, y) => !!(hs && hs.cells[`${x},${y}`]);
  let lo = 1e9; for (let i = 0; i < N * N; i++) lo = Math.min(lo, world.H[i]);
  const base = lo - 3;

  // 地面：0.5m ごとの格子、頂点の色は植生から（となりと混ぜて境目をぼかす）
  const S = 2, M = N * S, pos = [], col = [], idx = [], c = new THREE.Color(), c2 = new THREE.Color();
  const groundCol = (px, py) => {
    const x = Math.floor(px), y = Math.floor(py); c.set(0, 0, 0); let n = 0;
    for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) { c2.set(P.ground[veg(x + dx + (px % 1 > 0.5 ? 1 : 0), y + dy + (py % 1 > 0.5 ? 1 : 0))] || P.ground[30]); c.r += c2.r; c.g += c2.g; c.b += c2.b; n++; }
    c.multiplyScalar(1 / n);
    const dug = world.H0 && world.H0[Math.min(N - 1, y) * N + Math.min(N - 1, x)] > world.H[Math.min(N - 1, y) * N + Math.min(N - 1, x)];
    if (dug) c.lerp(c2.set(P.soil), 0.8);
    return c;
  };
  for (let j = 0; j <= M; j++) for (let i = 0; i <= M; i++) {
    const px = i / S, py = j / S; pos.push(px, at(px, py), py); const g = groundCol(px, py); col.push(g.r, g.g, g.b);
  }
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) { const a = j * (M + 1) + i, b = a + 1, d = a + M + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.setIndex(idx); gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, matte({ vertexColors: true, vary: 0.1, freq: 0.9, bump: 0.25, bumpFreq: 1.6 }));
  ground.receiveShadow = true; group.add(ground);

  // 区画の切り口：土の側面（地層の帯）
  const side = [], sideCol = [], soil = new THREE.Color(P.soil), soilD = new THREE.Color(P.soilDark);
  const edge = (pts) => { for (let k = 0; k < pts.length - 1; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], h0 = at(x0, y0), h1 = at(x1, y1);
    side.push(x0, h0, y0, x0, base, y0, x1, h1, y1, x1, h1, y1, x0, base, y0, x1, base, y1);
    for (const hh of [h0, base, h1, h1, base, base]) { const t = Math.max(0, Math.min(1, (h0 - hh) / 6)); const cc = soil.clone().lerp(soilD, t); sideCol.push(cc.r, cc.g, cc.b); } } };
  const line = (fn) => Array.from({ length: M + 1 }, (_, k) => fn(k / S));
  edge(line(t => [t, N])); edge(line(t => [N, N - t])); edge(line(t => [N - t, 0])); edge(line(t => [0, t]));
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(sideCol, 3)); sg.computeVertexNormals();
  const sides = new THREE.Mesh(sg, matte({ vertexColors: true, vary: 0.16, freq: 3.2, bump: 0.7, bumpFreq: 5.5, side: THREE.DoubleSide })); sides.receiveShadow = true; group.add(sides);

  // 草：株ごとに 5 枚の葉。草地と畑のまわりだけ、家の下は除く
  const blade = (ang, lean, hgt) => { const g = new THREE.BufferGeometry(), w = 0.025, ca = Math.cos(ang), sa = Math.sin(ang);
    const v = [-w * ca, 0, -w * sa, w * ca, 0, w * sa, lean * -sa, hgt, lean * ca]; g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1, 1, 1], 3)); g.computeVertexNormals(); return g; };
  const tuft = mergeGeometries([0, 1, 2, 3, 4].map(k => blade(k * 1.26, 0.04 + 0.03 * (k % 2), 0.16 + 0.06 * (k % 3)).translate(Math.cos(k * 2.4) * 0.04, 0, Math.sin(k * 2.4) * 0.04)));
  // 葉は上を向けた法線で（細い板が光で黒く抜けないように）
  const nrm = tuft.getAttribute('normal'); for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const spots = [], dens = opt.grass ?? 2.6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = veg(x, y); if (inHouse(x, y) || ![20, 30, 40, 90, 100].includes(v)) continue;
    if (opt.blocked && opt.blocked(x, y)) continue;
    const n = Math.floor(dens * (v === 30 ? 1.2 : 0.8) + hash(x, y, 3));
    for (let k = 0; k < n; k++) { const px = x + hash(x, y, 10 + k), py = y + hash(x, y, 40 + k); spots.push([px, py, hash(x, y, 70 + k)]); }
  }
  const grass = new THREE.InstancedMesh(tuft, matte({ color: '#ffffff', vertexColors: true, vary: 0.25, freq: 0.6, rough: 1 }), spots.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), tp = new THREE.Vector3(), gc = new THREE.Color(), tip = new THREE.Color(P.grassTip), gbase = new THREE.Color(P.grass);
  spots.forEach(([px, py, r], i) => { e.set(0, r * 6.28, 0); q.setFromEuler(e); const s = 0.8 + r * 0.9; sc.set(s, s * (0.8 + 0.5 * hash(px, py, 5)), s); tp.set(px, at(px, py) - 0.02, py); mtx.compose(tp, q, sc); grass.setMatrixAt(i, mtx); grass.setColorAt(i, gc.copy(gbase).lerp(tip, hash(px, py, 6) * 0.6)); });
  grass.receiveShadow = true; group.add(grass);

  return { group, at, H, base };
}

/* 木：幹と、でこぼこした葉のかたまり（1つの形を大きさと色を変えて使い回す） */
export function buildTrees(list, at, P, opt = {}) {
  const group = new THREE.Group();
  // 葉のかたまり：丸みのある小さなふくらみ。法線は球の向きに寄せて、ふんわり見せる
  const blobGeo = new THREE.IcosahedronGeometry(1, 2), p = blobGeo.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.07 * Math.sin(v.x * 4.1 + v.y * 2.7) * Math.cos(v.z * 3.3 - v.x * 1.7) + 0.035 * Math.sin(v.y * 8 + v.z * 7); v.multiplyScalar(n); v.y *= 0.84; p.setXYZ(i, v.x, v.y, v.z); }
  blobGeo.computeVertexNormals();
  { const nm = blobGeo.getAttribute('normal'), w2 = new THREE.Vector3(); for (let i = 0; i < nm.count; i++) { v.fromBufferAttribute(p, i).normalize(); w2.fromBufferAttribute(nm, i).lerp(v, 0.55).normalize(); nm.setXYZ(i, w2.x, w2.y, w2.z); } }
  const coneGeo = new THREE.ConeGeometry(1, 1, 9, 1, false); coneGeo.translate(0, 0.5, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 7); trunkGeo.translate(0, 0.5, 0);
  const blobs = [], cones = [], trunks = [];
  for (const t of list) {
    const z = at(t.x, t.y), s = t.s ?? 0.5, seed = Math.floor(s * 1e6);
    if (opt.skip && opt.skip(t)) continue;
    if (t.kind === 'shrub') { const r = t.r * 1.05; blobs.push({ p: [t.x, z + t.h * 0.42, t.y], s: [r, t.h * 0.62, r], c: P.leaf[seed % 4], k: 0.92 }); continue; }
    trunks.push({ p: [t.x, z, t.y], s: [Math.max(0.09, t.r * 0.1), t.h * (t.kind === 'pine' ? 0.55 : 0.62), Math.max(0.09, t.r * 0.1)] });
    if (t.kind === 'pine') { for (let k = 0; k < 4; k++) { const f = 1 - k * 0.22; cones.push({ p: [t.x, z + t.h * (0.25 + k * 0.17), t.y], s: [t.r * f, t.h * 0.42, t.r * f], c: P.pine }); } continue; }
    const top = z + t.h * 0.66, R = t.r, n = 4 + Math.floor(s * 3);
    blobs.push({ p: [t.x, top, t.y], s: [R * 0.95, R * 0.9, R * 0.95], c: P.leaf[seed % 4], k: 1 });
    for (let k = 0; k < n; k++) { const a = k / n * 6.28 + s * 3, rr = R * (0.55 + 0.2 * hash(t.x, k, 2)); blobs.push({ p: [t.x + Math.cos(a) * rr, top - R * (0.15 + 0.25 * hash(t.y, k, 3)), t.y + Math.sin(a) * rr], s: Array(3).fill(R * (0.48 + 0.18 * hash(t.x, t.y, k))), c: P.leaf[(seed + k) % 4], k: 0.95 + 0.1 * hash(k, t.x, 4) }); }
  }
  const leafMat = matte({ color: '#ffffff', vary: 0.2, freq: 1.8, bump: 0.35, bumpFreq: 7, rough: 0.9 });
  // 葉は光を少し通す：日かげ側が真っ黒に沈まないよう、自分の色で少し光らせる
  leafMat.emissive = new THREE.Color('#2E3A22'); leafMat.emissiveIntensity = 0.35;
  const inst = (geo, mat, items, colorOf) => { const m = new THREE.InstancedMesh(geo, mat, items.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    items.forEach((it, i) => { e.set(0, hash(it.p[0], it.p[2], 9) * 6.28, 0); q.setFromEuler(e); mt.compose(new THREE.Vector3(...it.p), q, new THREE.Vector3(...it.s)); m.setMatrixAt(i, mt); if (colorOf) m.setColorAt(i, c.set(colorOf(it)).multiplyScalar(it.k ?? 1)); });
    m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
  if (blobs.length) inst(blobGeo, leafMat, blobs, it => it.c);
  if (cones.length) inst(coneGeo, leafMat, cones, it => it.c);
  if (trunks.length) inst(trunkGeo, matte({ color: P.trunk, vary: 0.2, freq: 3, bump: 0.6, bumpFreq: 6 }), trunks);
  return group;
}
