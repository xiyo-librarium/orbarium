/* 舞台：計算の世界（s.world）から、地面・木・建物・畑とタンクを生やす。
   変わった部分だけ作り直す（署名をくらべる）。押した物を知るための当たり判定もここ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as E from '/js/engine.js';
import { BLOCKS } from '/js/world.js';
import { matte, hash } from './look.js';
import { buildLand, buildTrees } from './land.js';
import { buildHouse } from './house.js';

const W = E.W;
function dispose(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose()); }); }

export function createStage(v, s, P) {
  const N = W.N, st = { land: null, trees: null, houses: null, blocks: null, sig: {} };
  const ray = new THREE.Raycaster();
  const bedLevelOf = (w) => { const o = {}; for (const k in w.blocks) if (BLOCKS[w.blocks[k].t]?.kind === 'bed') { const [x, y, z] = k.split(',').map(Number); o[`${x},${y}`] = z; } return o; };
  const swap = (key, obj) => { if (st[key]) { v.scene.remove(st[key]); dispose(st[key]); } st[key] = obj; if (obj) v.scene.add(obj); };

  // 作り直す：地面（高さ・畑の段）／建物／木（植生・建物・置いた物）／畑とタンク
  st.rebuild = () => {
    const w = s.world, bs = W.buildings(w);
    const blockedCell = new Set(Object.keys(w.blocks).map(k => k.split(',').slice(0, 2).join(',')));
    const bedLevel = bedLevelOf(w);
    const sigLand = JSON.stringify([Array.from(w.H), bedLevel, w.H0 ? Array.from(w.H0).length : 0, [...blockedCell].sort(), bs.map(b => Object.keys(b.cells))]);
    const sigHouse = JSON.stringify([bs, W.blocksOf(w, 'tank').map(t => [t.x, t.y, t.z])]);
    const sigBlocks = JSON.stringify(w.blocks) + sigLand.length;
    const sigTrees = JSON.stringify([w.veg, [...blockedCell].sort(), bs.map(b => [Object.keys(b.cells), b.z])]);
    let changed = false;
    if (sigLand !== st.sig.land) {
      const land = buildLand(w, N, P, { blocked: (x, y) => blockedCell.has(`${x},${y}`) || !!W.buildingAt(w, x, y), flat: (x, y) => bedLevel[`${x},${y}`] ?? null });
      land.group.children[0].userData.ground = true;
      st.at = land.at; st.ground = land.ground; st.landObj = land; swap('land', land.group); st.sig.land = sigLand; changed = true;
    }
    if (sigHouse !== st.sig.house || changed) {
      const g = new THREE.Group();
      const tanks = W.blocksOf(w, 'tank').map(t => ({ x: t.x, y: t.y, z: t.z }));
      for (const b of bs) { const hg = buildHouse(b, P, st.at, { tanks }); hg.userData.pick = { kind: 'building', id: W.bid(b) }; g.add(hg); }
      swap('houses', g); st.sig.house = sigHouse;
    }
    if (sigTrees !== st.sig.trees || changed) {
      // 建物に枝がかかる木は、建てるときに切ったことにする（屋根を突き抜けないように）
      const hcs = bs.flatMap(b => Object.keys(b.cells).map(k => k.split(',').map(Number)));
      const nearHouse = (t) => t.kind !== 'shrub' && hcs.some(([x, y]) => Math.hypot(Math.max(x - t.x, 0, t.x - x - 1), Math.max(y - t.y, 0, t.y - y - 1)) < t.r * 1.1);
      const tg = buildTrees(W.vegObjects(w), st.at, P, { skip: (t) => !!W.buildingAt(w, t.cx, t.cy) || blockedCell.has(`${t.cx},${t.cy}`) || nearHouse(t) });
      tg.userData.pick = { kind: 'trees' }; swap('trees', tg); st.sig.trees = sigTrees;
    }
    if (sigBlocks !== st.sig.blocks || changed) { swap('blocks', buildBlocks(w, st.landObj, P)); st.sig.blocks = sigBlocks; }
    v.req();
  };

  // 当たり判定：画面の点（-1〜1）から、いちばん手前の物と、地面の点
  const pickOf = (o) => { while (o) { if (o.userData && o.userData.pick) return o.userData.pick; if (o.userData && o.userData.ground) return { kind: 'ground' }; o = o.parent; } return null; };
  st.pick = (ndc) => {
    ray.setFromCamera(ndc, v.camera);
    const objs = [st.houses, st.blocks, st.trees, st.land].filter(Boolean);
    const hits = ray.intersectObjects(objs, true);
    for (const h of hits) { const p = pickOf(h.object); if (!p) continue; return { ...p, point: h.point.clone(), normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null }; }
    return null;
  };
  st.groundAt = (ndc) => {
    ray.setFromCamera(ndc, v.camera);
    const h = st.land && ray.intersectObject(st.land.children[0], false)[0];
    return h ? h.point.clone() : null;
  };
  return st;
}

/* 畑とタンク（この試作では形だけ）。
   畑は段々：上の面はその段の高さで平ら（少し盛り上がる）、ふちに板。下り側は段差の土の壁（石垣があれば石） */
export function buildBlocks(w, land, P) {
  const at = land.at, g = new THREE.Group();
  const leaf = matte({ color: '#ffffff', vary: 0.15, freq: 5, bump: 0.6, bumpFreq: 8, rough: 0.85, spec: 0.4 }); leaf.emissive = new THREE.Color('#25331C'); leaf.emissiveIntensity = 0.4;
  const plants = [], tanks = [], beds = [];
  for (const k in w.blocks) {
    const [x, y, z] = k.split(',').map(Number), b = w.blocks[k], D = BLOCKS[b.t]; if (!D) continue;
    if (D.kind === 'bed') beds.push({ x, y, z, stone: !!(b.s || (w.stone && w.stone[`${x},${y}`])) });
    else if (D.kind === 'tank') tanks.push({ p: [x + 0.5, z, y + 0.5], x, y, z });
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
    bm.receiveShadow = true; bm.castShadow = true; bm.userData.pick = { kind: 'beds' }; g.add(bm);
    const bg = new THREE.BoxGeometry(1, 1, 1), bmat = matte({ color: P.wood, vary: 0.2, freq: 4, bump: 0.3, bumpFreq: 9 }), im = new THREE.InstancedMesh(bg, bmat, boards.length), mt = new THREE.Matrix4();
    boards.forEach(([x, y, z, sx, sy, sz], i) => { mt.makeScale(sx, sy, sz).setPosition(x, y, z); im.setMatrixAt(i, mt); });
    im.castShadow = im.receiveShadow = true; g.add(im);
  }
  if (plants.length) { const geo = new THREE.IcosahedronGeometry(0.14, 2), m = new THREE.InstancedMesh(geo, leaf, plants.length), mt = new THREE.Matrix4(), c = new THREE.Color();
    plants.forEach(([x, y, z, r], i) => { mt.makeScale(1, 0.75, 1).setPosition(x, y, z); m.setMatrixAt(i, mt); m.setColorAt(i, c.set(r > 0.5 ? '#6E9A45' : '#7FA550')); }); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  const tankMat = matte({ color: '#B4B6A6', vary: 0.06, freq: 2, rough: 0.7 }), lidMat = matte({ color: '#8E9286', vary: 0.06, freq: 3 });
  for (const t of tanks) {   // タンク：円筒にふたと帯。押せるように場所を覚えておく
    const [x, y, z] = t.p, m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 1.2, 28), tankMat); body.position.y = 0.6;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.08, 28), lidMat); lid.position.y = 1.24;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.515, 0.02, 6, 32), lidMat); band.rotation.x = Math.PI / 2; band.position.y = 0.45;
    m.add(body, lid, band); m.position.set(x, y, z); m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    m.userData.pick = { kind: 'tank', x: t.x, y: t.y, z: t.z }; g.add(m);
  }
  return g;
}

