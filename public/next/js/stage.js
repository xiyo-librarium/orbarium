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
  const N = W.N, st = { land: null, trees: null, houses: null, blocks: null, ghost: null, sig: {}, cut: false, draft: null };
  // 下書き：白い模型のように描く（まだ建っていない）
  const ghostify = (g) => { const gm = new THREE.MeshStandardMaterial({ color: '#F3EFE6', roughness: 0.95, emissive: '#3A3630', emissiveIntensity: 0.08 });
    g.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); o.material = gm; if (o.isInstancedMesh) o.instanceColor = null; }); };
  const ray = new THREE.Raycaster();
  // 植えた果樹と生け垣（置いた物）。土地の木と同じ描き方で、少し小さく
  const planted = (w) => { const out = []; for (const k in w.blocks) { const t = w.blocks[k].t; if (t !== 'tree' && t !== 'hedge') continue; const [x, y, z] = k.split(',').map(Number);
    out.push(t === 'tree' ? { kind: 'fruit', planted: true, cx: x, cy: y, x: x + 0.5, y: y + 0.5, h: 3.2 + hash(x, y, 1) * 0.8, r: 1.0 + hash(x, y, 2) * 0.3, s: hash(x, y, 3) } : { kind: 'hedge', planted: true, cx: x, cy: y, x: x + 0.5, y: y + 0.5, h: 1.3, r: 0.6, s: hash(x, y, 3) }); } return out; };
  const bedLevelOf = (w) => { const o = {}; for (const k in w.blocks) if (BLOCKS[w.blocks[k].t]?.kind === 'bed') { const [x, y, z] = k.split(',').map(Number); o[`${x},${y}`] = z; } return o; };
  const swap = (key, obj) => { if (st[key]) { v.scene.remove(st[key]); dispose(st[key]); } st[key] = obj; if (obj) v.scene.add(obj); };

  // 作り直す：地面（高さ・畑の段）／建物／木（植生・建物・置いた物）／畑とタンク
  st.rebuild = () => {
    const w = s.world, bs = W.buildings(w), lw = (st.draft && st.draft.landWorld) || w;   // 地形の下書きは、その地形で描く
    const blockedCell = new Set(Object.keys(lw.blocks).map(k => k.split(',').slice(0, 2).join(',')));
    const bedLevel = bedLevelOf(lw);
    const sigLand = JSON.stringify([Array.from(lw.H), bedLevel, w.H0 ? Array.from(w.H0).length : 0, [...blockedCell].sort(), bs.map(b => [Object.keys(b.cells), b.z])]);
    const sigHouse = JSON.stringify([bs, W.blocksOf(w, 'tank').map(t => [t.x, t.y, t.z]), st.cut, st.draft && st.draft.d && [st.draft.d, st.draft.hideId]]);
    const sigBlocks = JSON.stringify(w.blocks) + sigLand.length;
    const cutCells = new Set(st.draft ? st.draft.cut : []);
    const sigTrees = JSON.stringify([w.veg, [...blockedCell].sort(), bs.map(b => [Object.keys(b.cells), b.z]), [...cutCells], st.draft && st.draft.d && Object.keys(st.draft.d.cells)]);
    let changed = false;
    if (sigLand !== st.sig.land) {
      // 排水の庭は、掘った穴を砂利と砂で埋めた高さで描き、砂利の色を塗る。池の底は泥の色
      const Hr = Array.from(lw.H), paint = {};
      for (const k in lw.blocks) { const D = BLOCKS[lw.blocks[k].t]; if (!D) continue; const [x, y, z] = k.split(',').map(Number);
        if (D.kind === 'media') { Hr[y * N + x] = Math.max(Hr[y * N + x], z + 1); paint[`${x},${y}`] = '#B9AE90'; }
        else if (D.kind === 'pond') paint[`${x},${y}`] = '#6E6650'; }
      const basin = {}; for (const k in lw.blocks) if (BLOCKS[lw.blocks[k].t]?.kind === 'pond') { const [x, y, z] = k.split(',').map(Number); basin[`${x},${y}`] = { b: z + 0.05, wl: z + 0.72 }; }
      const land = buildLand({ ...lw, H: Hr }, N, P, { paint: (x, y) => paint[`${x},${y}`] || null, basin: (x, y) => basin[`${x},${y}`] || null, blocked: (x, y) => blockedCell.has(`${x},${y}`) || !!W.buildingAt(w, x, y), flat: (x, y) => bedLevel[`${x},${y}`] ?? W.buildingAt(w, x, y)?.z ?? null });   // 畑と建物の床の下は平らに
      land.group.children[0].userData.ground = true;
      st.at = land.at; st.ground = land.ground; st.landObj = land; swap('land', land.group); st.sig.land = sigLand; changed = true;
    }
    if (sigHouse !== st.sig.house || changed) {
      const g = new THREE.Group();
      const tanks = W.blocksOf(w, 'tank').map(t => ({ x: t.x, y: t.y, z: t.z }));
      for (const b of bs) { if (st.draft && W.bid(b) === st.draft.hideId) continue; const hg = buildHouse(b, P, st.at, { tanks, cut: st.cut }); hg.userData.pick = { kind: 'building', id: W.bid(b) }; g.add(hg); }
      if (st.draft && st.draft.d) { const hg = buildHouse(st.draft.d, P, st.at, { tanks, cut: st.cut }); ghostify(hg); hg.userData.pick = { kind: 'draft' }; g.add(hg); }
      swap('houses', g); st.sig.house = sigHouse;
    }
    if (sigTrees !== st.sig.trees || changed) {
      // 建物に枝がかかる木は、建てるときに切ったことにする（屋根を突き抜けないように）
      const hcs = bs.flatMap(b => Object.keys(b.cells).map(k => k.split(',').map(Number)));
      const nearHouse = (t) => t.kind !== 'shrub' && hcs.some(([x, y]) => Math.hypot(Math.max(x - t.x, 0, t.x - x - 1), Math.max(y - t.y, 0, t.y - y - 1)) < t.r * 1.1);
      const dc = st.draft && st.draft.d ? Object.keys(st.draft.d.cells).map(k => k.split(',').map(Number)) : [];
      const nearDraft = (t) => t.kind !== 'shrub' && dc.some(([x, y]) => Math.hypot(Math.max(x - t.x, 0, t.x - x - 1), Math.max(y - t.y, 0, t.y - y - 1)) < t.r * 1.1);
      const tg = buildTrees([...W.vegObjects(w), ...planted(w)], st.at, P, { skip: (t) => !t.planted && (!!W.buildingAt(w, t.cx, t.cy) || blockedCell.has(`${t.cx},${t.cy}`) || nearHouse(t) || cutCells.has(`${t.cx},${t.cy}`) || nearDraft(t)) });
      tg.userData.pick = { kind: 'trees' }; swap('trees', tg); st.sig.trees = sigTrees;
    }
    if (sigBlocks !== st.sig.blocks || changed) { swap('blocks', buildBlocks(w, st.landObj, P)); st.sig.blocks = sigBlocks; }
    // 下書きの置き物（畑・木・小屋・池…）：白い模型で
    const sigGhost = JSON.stringify(st.draft && st.draft.blocks ? [Object.keys(st.draft.blocks), st.draft.real] : null) + sigLand;
    if (sigGhost !== st.sig.ghost) {
      let gg = null;
      if (st.draft && st.draft.blocks) {
        const gw = { blocks: st.draft.blocks, stone: {} };
        gg = new THREE.Group(); gg.add(buildBlocks(gw, st.landObj, P));
        const pl = planted(gw); if (pl.length) gg.add(buildTrees(pl, st.at, P));
        if (!st.draft.real) ghostify(gg); gg.traverse(o => { if (o.userData.pick) o.userData.pick = { kind: 'draft' }; }); gg.userData.pick = { kind: 'draft' };
      }
      swap('ghost', gg); st.sig.ghost = sigGhost;
    }
    v.req();
  };

  // 当たり判定：画面の点（-1〜1）から、いちばん手前の物と、地面の点
  const pickOf = (o) => { while (o) { if (o.userData && o.userData.pick) return o.userData.pick; if (o.userData && o.userData.ground) return { kind: 'ground' }; o = o.parent; } return null; };
  st.pick = (ndc) => {
    ray.setFromCamera(ndc, v.camera);
    const objs = [st.houses, st.ghost, st.blocks, st.trees, st.land].filter(Boolean);
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
  const plants = [], tanks = [], beds = [], heaps = [], coops = [], ponds = [], media = [], reeds = [];
  for (const k in w.blocks) {
    const [x, y, z] = k.split(',').map(Number), b = w.blocks[k], D = BLOCKS[b.t]; if (!D) continue;
    if (D.kind === 'bed') beds.push({ x, y, z, stone: !!(b.s || (w.stone && w.stone[`${x},${y}`])), mulch: !!b.m, cover: !!b.g });
    else if (D.kind === 'tank') tanks.push({ p: [x + 0.5, z, y + 0.5], x, y, z });
    else if (D.kind === 'heap') heaps.push({ x, y, z });
    else if (D.kind === 'coop') coops.push({ x, y, z });
    else if (D.kind === 'pond') ponds.push({ x, y, z });
    else if (D.kind === 'media') media.push({ x, y, z, t: D.media });
    else if (D.kind === 'plant') reeds.push({ x, y, z, t: D.plant });
  }
  const pickAt = (m, kind, extra = {}) => { m.userData.pick = { kind, ...extra }; return m; };
  if (beds.length) {
    const q = 0.08, up = 0.16, n = 4, parts = [], top = new THREE.Color('#6B4C33'), low = new THREE.Color('#4A3424'), stoneC = new THREE.Color(P.stone), c = new THREE.Color();
    const boards = [], covers = [], straw = new THREE.Color('#BFA061');
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
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const u = i / n, v = j / n; tp.push(x0 + (x1 - x0) * u, H(u, v), y0 + (y1 - y0) * v); c.copy(b.mulch ? straw : top).multiplyScalar(0.95 + 0.1 * hash(b.x * 5 + i, b.y * 5 + j, 3)); tc.push(c.r, c.g, c.b); }
      if (b.cover) covers.push([(x0 + x1) / 2, L + up, (y0 + y1) / 2, x1 - x0]);   // 覆い：半円のトンネル
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
    if (covers.length) {   // 透ける覆い（ビニールの小さなトンネル）と骨
      const film = new THREE.MeshStandardMaterial({ color: '#F4F6F2', roughness: 0.35, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
      const cg = new THREE.CylinderGeometry(0.4, 0.4, 1, 16, 1, true, 0, Math.PI); cg.rotateZ(Math.PI / 2);
      const cm = new THREE.InstancedMesh(cg, film, covers.length), mt2 = new THREE.Matrix4();
      covers.forEach(([x, y, z, L], i) => { mt2.makeScale(L, 0.9, 1).setPosition(x, y, z); cm.setMatrixAt(i, mt2); });
      cm.renderOrder = 3; g.add(cm);
    }
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
  const wood = matte({ color: P.wood, vary: 0.2, freq: 4, bump: 0.4, bumpFreq: 9 }), tin = matte({ color: '#9AA09F', vary: 0.08, freq: 2, rough: 0.6 });
  const boxAt = (arr, mat, cx, cy, cz, sx, sy, sz, rx = 0) => { const gg = new THREE.BoxGeometry(sx, sz, sy); if (rx) gg.rotateX(rx); gg.translate(cx, cz, cy); arr.push(gg); };
  const mesh = (geos, mat) => { const m = new THREE.Mesh(mergeGeometries(geos.map(x => { const n2 = x.index ? x.toNonIndexed() : x; if (n2.getAttribute('uv')) n2.deleteAttribute('uv'); return n2; })), mat); m.castShadow = m.receiveShadow = true; return m; };
  // 堆肥小屋：板をすかして張った3面の囲いに、片流れのトタン屋根。中に寝かせた堆肥の山
  if (heaps.length) {
    const hs = new Set(heaps.map(h => `${h.x},${h.y}`)), wg = [], rg = [], pile = [];
    for (const h of heaps) {
      const { x, y, z } = h, slats = (x0, y0, x1, y1, hgt = 1.0) => { for (let k = 0; k < 4; k++) boxAt(wg, wood, (x0 + x1) / 2, (y0 + y1) / 2, z + 0.12 + k * (hgt - 0.1) / 4, Math.abs(x1 - x0) + 0.04, Math.abs(y1 - y0) + 0.04, 0.14); };
      slats(x + 0.05, y + 0.05, x + 0.95, y + 0.05);   // 奥（北）
      slats(x + 0.05, y + 0.05, x + 0.05, y + 0.95);   // 西
      if (!hs.has(`${x + 1},${y}`)) slats(x + 0.95, y + 0.05, x + 0.95, y + 0.95);
      boxAt(wg, wood, x + 0.5, y + 0.95, z + 0.15, 0.9, 0.04, 0.3);   // 手前の低い板
      for (const [px, py, hh] of [[x + 0.05, y + 0.05, 2.25], [x + 0.95, y + 0.05, 2.25], [x + 0.05, y + 0.95, 1.95], [x + 0.95, y + 0.95, 1.95]]) boxAt(wg, wood, px, py, z + hh / 2, 0.08, 0.08, hh);
      boxAt(rg, tin, x + 0.5, y + 0.5, z + 2.12, 1.12, 1.25, 0.03, 0.27);
      pile.push([x + 0.5, z + 0.18, y + 0.52, hash(x, y, 4)]);
    }
    g.add(pickAt(mesh(wg, wood), 'heap'), pickAt(mesh(rg, tin), 'heap'));
    const pg = new THREE.IcosahedronGeometry(1, 2), pm = matte({ color: '#5A4130', vary: 0.25, freq: 6, bump: 1.2, bumpFreq: 9 }), im = new THREE.InstancedMesh(pg, pm, pile.length), mt = new THREE.Matrix4();
    pile.forEach(([x, y, z, r], i) => { mt.makeScale(0.42, 0.34 + 0.08 * r, 0.38).setPosition(x, y, z); im.setMatrixAt(i, mt); }); im.castShadow = im.receiveShadow = true; g.add(pickAt(im, 'heap'));
  }
  // ニワトリ小屋：短い脚の上の小屋、切妻のトタン屋根、はしご板。そばに数羽
  if (coops.length) {
    const cg = [], rg = [], hens = [];
    for (const c of coops) {
      const { x, y, z } = c, cx = x + 0.5, cy = y + 0.5;
      for (const [a, b] of [[-0.33, -0.28], [0.33, -0.28], [-0.33, 0.28], [0.33, 0.28]]) boxAt(cg, wood, cx + a, cy + b, z + 0.2, 0.06, 0.06, 0.4);
      boxAt(cg, wood, cx, cy, z + 0.72, 0.78, 0.66, 0.64);
      boxAt(cg, wood, cx, cy + 0.55, z + 0.2, 0.18, 0.5, 0.03, 0.75);   // はしご板
      boxAt(rg, tin, cx, cy - 0.2, z + 1.15, 0.92, 0.48, 0.03, -0.62); boxAt(rg, tin, cx, cy + 0.2, z + 1.15, 0.92, 0.48, 0.03, 0.62);
      for (let k = 0; k < 3; k++) hens.push([cx + (hash(x, y, 20 + k) - 0.5) * 1.4, z, cy + 0.6 + hash(x, y, 30 + k) * 0.6, hash(x, y, 40 + k) * 6.28]);
    }
    g.add(pickAt(mesh(cg, wood), 'coop'), pickAt(mesh(rg, tin), 'coop'));
    const body = new THREE.SphereGeometry(1, 12, 9), hm = matte({ color: '#F3EEE2', vary: 0.05, freq: 5, rough: 0.8 }), cm = matte({ color: '#C8452F' });
    const bi = new THREE.InstancedMesh(body, hm, hens.length), ci = new THREE.InstancedMesh(body, cm, hens.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    hens.forEach(([x, z, y, a], i) => { e.set(0, a, 0); q.setFromEuler(e); mt.compose(new THREE.Vector3(x, z + 0.14, y), q, new THREE.Vector3(0.16, 0.12, 0.1)); bi.setMatrixAt(i, mt);
      mt.compose(new THREE.Vector3(x + Math.cos(a) * 0.13, z + 0.25, y - Math.sin(a) * 0.13), q, new THREE.Vector3(0.035, 0.04, 0.02)); ci.setMatrixAt(i, mt); });
    bi.castShadow = true; g.add(bi, ci);
  }
  // ため池：掘った穴にためた水。水面は元の地面より少し下
  if (ponds.length) {
    // 水面：底から0.72m（地面は底まで掘り、ふちは土手にしてある）
    const pos = []; for (const q of ponds) { const h = q.z + 0.72; pos.push(q.x, h, q.y, q.x, h, q.y + 1, q.x + 1, h, q.y, q.x + 1, h, q.y, q.x, h, q.y + 1, q.x + 1, h, q.y + 1); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.computeVertexNormals();
    const wm = new THREE.MeshStandardMaterial({ color: '#4F8088', roughness: 0.12, transparent: true, opacity: 0.88 });
    const pm = new THREE.Mesh(pg, wm); pm.receiveShadow = true; g.add(pickAt(pm, 'pond'));
  }
  // 排水の庭：掘った穴に砂利と砂を入れ、上にヨシやカンナ
  if (media.length) {   // 砂利の面は地面に塗ってある。押せるように、薄い当たりの板だけ置く
    const geos = []; const top = new Map(); for (const m of media) { const k = `${m.x},${m.y}`; if (!top.has(k) || top.get(k).z < m.z) top.set(k, m); }
    for (const m of top.values()) boxAt(geos, null, m.x + 0.5, m.y + 0.5, at(m.x + 0.5, m.y + 0.5) + 0.02, 1, 1, 0.02);
    const hit = mesh(geos, new THREE.MeshBasicMaterial({ visible: false })); hit.castShadow = hit.receiveShadow = false; g.add(pickAt(hit, 'filter'));
  }
  if (reeds.length) {
    const cone = new THREE.ConeGeometry(0.035, 1, 5); cone.translate(0, 0.5, 0);
    const list = []; for (const r of reeds) for (let k = 0; k < 22; k++) list.push([r.x + 0.1 + hash(r.x, r.y, 50 + k) * 0.8, at(r.x + 0.5, r.y + 0.5) - 0.05, r.y + 0.1 + hash(r.y, r.x, 70 + k) * 0.8, 0.7 + hash(r.x, k, 90) * 0.7, r.t, hash(k, r.y, 95)]);
    const rm = matte({ color: '#ffffff', vary: 0.15, freq: 4, rough: 0.8, spec: 0.4 }), im = new THREE.InstancedMesh(cone, rm, list.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    list.forEach(([x, z, y, hh, t, r], i) => { e.set((r - 0.5) * 0.3, r * 6, (hash(x, y, 3) - 0.5) * 0.3); q.setFromEuler(e); mt.compose(new THREE.Vector3(x, z, y), q, new THREE.Vector3(1, hh, 1)); im.setMatrixAt(i, mt); im.setColorAt(i, c.set(t === 'canna' && r > 0.7 ? '#C8562E' : r > 0.5 ? '#86A05A' : '#9AAE64')); });
    im.castShadow = true; g.add(pickAt(im, 'filter'));
  }
  return g;
}

