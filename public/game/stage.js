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
  const N = W.N, st = { land: null, trees: null, houses: null, blocks: null, ghost: null, gone: null, sig: {}, cut: false, draft: null, base: null };
  // 仮（まだ決めていない）物は設計図のように：素材の色を淡く透かして、青い線で縁どる。壊す物は青い点線だけ残す（st.base＝編集前の世界）
  const BLUE = new THREE.Color('#2F6FB8'), lineM = new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.85, depthTest: true });
  const dashM = new THREE.LineDashedMaterial({ color: BLUE, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.9 });
  const blueprint = (g) => {
    const made = new Map(), meshes = [];
    g.traverse(o => { if (o.isMesh && o.material) meshes.push(o); });
    for (const o of meshes) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      o.material = ms.map(m => { if (made.has(m)) return made.get(m); if (!m.visible) { made.set(m, m); return m; }
        const c = (m.color ? m.color.clone() : new THREE.Color('#ffffff')).lerp(new THREE.Color('#CFE2F5'), 0.45);
        const n = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, transparent: true, opacity: 0.62, vertexColors: !!m.vertexColors, emissive: new THREE.Color('#3E7BC4'), emissiveIntensity: 0.12, side: m.side });
        made.set(m, n); return n; });
      if (!Array.isArray(o.material) || o.material.length === 1) o.material = Array.isArray(o.material) ? o.material[0] : o.material;
      o.castShadow = false;
      if (!o.isInstancedMesh && o.geometry && o.geometry.attributes.position.count < 60000) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), lineM); l.raycast = () => {}; o.add(l); }
    }
  };
  const dashed = (g) => {
    const out = new THREE.Group(), meshes = []; g.updateMatrixWorld(true);
    g.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o.geometry && o.material && o.material.visible !== false) meshes.push(o); });
    for (const o of meshes) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), dashM); l.applyMatrix4(o.matrixWorld); l.computeLineDistances(); out.add(l); }
    dispose(g); return out;
  };
  // 下書き：白い模型のように描く（まだ建っていない）
  const ghostify = (g) => { const gm = new THREE.MeshStandardMaterial({ color: '#F3EFE6', roughness: 0.95, emissive: '#3A3630', emissiveIntensity: 0.08 });
    g.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); o.material = gm; if (o.isInstancedMesh) o.instanceColor = null; }); };
  const ray = new THREE.Raycaster();
  // 植えた果樹と生け垣（置いた物）。土地の木と同じ描き方で、少し小さく
  const planted = (w) => { const out = [], hedges = new Set(Object.keys(w.blocks).filter(k => w.blocks[k].t === 'hedge').map(k => k.split(',').slice(0, 2).join(','))); for (const k in w.blocks) { const t = w.blocks[k].t; if (t !== 'tree' && t !== 'hedge') continue; const [x, y, z] = k.split(',').map(Number);
    out.push(t === 'tree' ? { kind: 'fruit', planted: true, cx: x, cy: y, x: x + 0.5, y: y + 0.5, h: 3.2 + hash(x, y, 1) * 0.8, r: 1.0 + hash(x, y, 2) * 0.3, s: hash(x, y, 3) } : { kind: 'hedge', planted: true, cx: x, cy: y, x: x + 0.5, y: y + 0.5, h: 1.3, r: 0.6, s: hash(x, y, 3), nb: { e: hedges.has(`${x + 1},${y}`), w: hedges.has(`${x - 1},${y}`), s: hedges.has(`${x},${y + 1}`), n: hedges.has(`${x},${y - 1}`) } }); } return out; };
  const bedLevelOf = (w) => { const o = {}; for (const k in w.blocks) if (BLOCKS[w.blocks[k].t]?.kind === 'bed') { const [x, y, z] = k.split(',').map(Number); o[`${x},${y}`] = z; } return o; };
  const swap = (key, obj) => { if (st[key]) { v.scene.remove(st[key]); dispose(st[key]); } st[key] = obj; if (obj) v.scene.add(obj); };

  // 作り直す：地面（高さ・畑の段）／建物／木（植生・建物・置いた物）／畑とタンク
  st.rebuild = () => {
    const w = s.world, bs = W.buildings(w), lw = (st.draft && st.draft.landWorld) || w;   // 地形の下書きは、その地形で描く
    const blockedCell = new Set(Object.keys(lw.blocks).map(k => k.split(',').slice(0, 2).join(',')));
    const bedLevel = bedLevelOf(lw);
    const sigLand = JSON.stringify([Array.from(lw.H), bedLevel, w.H0 ? Array.from(w.H0).length : 0, [...blockedCell].sort(), bs.map(b => [Object.keys(b.cells), b.z])]);
    const bs0 = st.base ? W.buildings(st.base) : null, B0 = {}; if (bs0) for (const b of bs0) B0[W.bid(b)] = JSON.stringify(b);
    const sigBase = st.base ? JSON.stringify([bs0, st.base.blocks, Array.from(st.base.H)]).length + ':' + Object.keys(B0).join() : '';
    const sigHouse = JSON.stringify([bs, W.blocksOf(w, 'tank').map(t => [t.x, t.y, t.z]), st.cut, st.draft && st.draft.d && [st.draft.d, st.draft.hideId, st.draft.real], B0]);
    const fed = W.blocksOf(w, 'tank').length ? W.analyze(w, E.SITES[s.site], s.persons.length).fedKeys : [];   // 雨が入るタンク（水の窓を青く、つながりの管を描く）
    const sigBlocks = JSON.stringify(w.blocks) + sigLand.length + fed.join(' ') + JSON.stringify(bs.map(b => Object.keys(b.cells))) + (st.base ? JSON.stringify(st.base.blocks) : '');
    const cutCells = new Set(st.draft ? st.draft.cut : []);
    const sigTrees = JSON.stringify([w.veg, [...blockedCell].sort(), bs.map(b => [Object.keys(b.cells), b.z]), [...cutCells], st.draft && st.draft.d && Object.keys(st.draft.d.cells)]);
    let changed = false;
    if (sigLand !== st.sig.land) {
      // 浄化設備は、掘った穴を砂利と砂で埋めた高さで描き、砂利の色を塗る。池の底は泥の色
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
      for (const b of bs) { if (st.draft && W.bid(b) === st.draft.hideId) continue; const hg = buildHouse(b, P, st.at, { tanks, cut: st.cut, lat: E.SITES[s.site]?.lat, free: (x, y) => !W.buildingAt(w, x, y) && !Object.keys(w.blocks).some(k => k.startsWith(`${x},${y},`)) }); hg.userData.pick = { kind: 'building', id: W.bid(b) }; if (st.base && B0[W.bid(b)] !== JSON.stringify(b)) blueprint(hg); g.add(hg); }
      if (st.draft && st.draft.d) { const hg = buildHouse(st.draft.d, P, st.at, { tanks, cut: st.cut, lat: E.SITES[s.site]?.lat, free: (x, y) => !W.buildingAt(w, x, y) && !Object.keys(w.blocks).some(k => k.startsWith(`${x},${y},`)) });
        // 改築の下書きは本物の見た目で（押すと建物として扱う）。新しい建物の下書きは白い模型
        if (st.draft.real && st.draft.hideId) hg.userData.pick = { kind: 'building', id: st.draft.hideId }; else { ghostify(hg); hg.userData.pick = { kind: 'draft' }; } g.add(hg); }
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
    if (sigBlocks !== st.sig.blocks || changed) {
      const bo = { fed, lat: E.SITES[s.site]?.lat };
      if (!st.base) swap('blocks', buildBlocks(w, st.landObj, P, bo));
      else {
        const same = {}, nu = {}; for (const k in w.blocks) { const b0 = st.base.blocks[k]; (b0 && b0.t === w.blocks[k].t && JSON.stringify({ ...b0, at: 0 }) === JSON.stringify({ ...w.blocks[k], at: 0 }) ? same : nu)[k] = w.blocks[k]; }
        const g = new THREE.Group(); g.add(buildBlocks({ ...w, blocks: same }, st.landObj, P, bo));
        if (Object.keys(nu).length) { const gn = buildBlocks({ ...w, blocks: nu }, st.landObj, P, bo); blueprint(gn); g.add(gn); }
        swap('blocks', g);
      }
      st.sig.blocks = sigBlocks;
    }
    // 壊す・外す物（編集前にあって今ない）：青い点線で残す。地形を変えたマスは青い枠
    const sigGone = sigBase + JSON.stringify(bs.map(b => [W.bid(b), Object.keys(b.cells).length])) + JSON.stringify(Object.keys(w.blocks)) + sigLand.length;
    if (sigGone !== st.sig.gone) {
      let gg = null;
      if (st.base) {
        gg = new THREE.Group(); const ids = new Set(bs.map(b => W.bid(b)));
        for (const b0 of bs0) if (!ids.has(W.bid(b0))) gg.add(dashed(buildHouse(b0, P, st.at, { tanks: [], cut: false, lat: E.SITES[s.site]?.lat, free: () => true })));
        const gone = {}; for (const k in st.base.blocks) if (!w.blocks[k] || w.blocks[k].t !== st.base.blocks[k].t) gone[k] = st.base.blocks[k];
        if (Object.keys(gone).length) gg.add(dashed(buildBlocks({ ...st.base, blocks: gone }, st.landObj, P, { lat: E.SITES[s.site]?.lat })));
        const pts = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (w.H[y * N + x] === st.base.H[y * N + x] || W.buildingAt(w, x, y)) continue; const z = st.at(x + 0.5, y + 0.5) + 0.04, a = 0.06, b2 = 0.94;
          pts.push(x + a, z, y + a, x + b2, z, y + a, x + b2, z, y + a, x + b2, z, y + b2, x + b2, z, y + b2, x + a, z, y + b2, x + a, z, y + b2, x + a, z, y + a); }
        // 増えた床：青い太めの枠（どこが広がったか）
        { const had = new Set(); for (const b0 of bs0) for (const k in b0.cells) had.add(k);
          for (const b of bs) for (const k in b.cells) { if (had.has(k)) continue; const [x, y] = k.split(',').map(Number), z = b.z + 0.07;
            for (const a of [0.04, 0.1]) { const b2 = 1 - a; pts.push(x + a, z, y + a, x + b2, z, y + a, x + b2, z, y + a, x + b2, z, y + b2, x + b2, z, y + b2, x + a, z, y + b2, x + a, z, y + b2, x + a, z, y + a); } } }
        if (pts.length) { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); gg.add(new THREE.LineSegments(lg, lineM)); }
      }
      swap('gone', gg); st.sig.gone = sigGone;
    }
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
export function buildBlocks(w, land, P, bo = {}) {
  const at = land.at, g = new THREE.Group(), N0 = W.N;
  const leaf = matte({ color: '#ffffff', vary: 0.15, freq: 5, bump: 0.6, bumpFreq: 8, rough: 0.85, spec: 0.4 }); leaf.emissive = new THREE.Color('#25331C'); leaf.emissiveIntensity = 0.4;
  const plants = [], tanks = [], beds = [], heaps = [], coops = [], ponds = [], media = [], reeds = [], pumps = [], batts = [], settles = [], pvs = [];
  for (const k in w.blocks) {
    const [x, y, z] = k.split(',').map(Number), b = w.blocks[k], D = BLOCKS[b.t]; if (!D) continue;
    if (D.kind === 'bed') beds.push({ x, y, z, stone: !!(b.s || (w.stone && w.stone[`${x},${y}`])), mulch: !!b.m, cover: !!b.g });
    else if (D.kind === 'tank') tanks.push({ p: [x + 0.5, z, y + 0.5], x, y, z });
    else if (D.kind === 'batt') batts.push({ x, y, z });
    else if (D.kind === 'heap') heaps.push({ x, y, z });
    else if (D.kind === 'coop') coops.push({ x, y, z });
    else if (D.kind === 'pond') ponds.push({ x, y, z });
    else if (D.kind === 'media') media.push({ x, y, z, t: D.media });
    else if (D.kind === 'plant') reeds.push({ x, y, z, t: D.plant });
    else if (D.kind === 'pump') pumps.push({ x, y, z });
    else if (D.kind === 'settle') settles.push({ x, y, z });
    else if (D.kind === 'pv' && !W.buildingAt(w, x, y)) pvs.push({ x, y, z });
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
  // タンク：円筒にふたと帯。外を向いた面に水の窓（雨が入るタンクは青く水が見え、入らないタンクは空）。
  // 雨が入るタンクどうしがとなり合っていれば、足もとを管でつなぐ（低い方へ流れる）
  const fedSet = new Set(bo.fed || []), bsAll = W.buildings(w), tankKey = (t) => `${t.x},${t.y},${t.z}`;
  const outward = (t) => {   // いちばん近い建物から外への向き（縦横どちらか）
    let best = null; for (const b of bsAll) for (const k in b.cells) { const [cx, cy] = k.split(',').map(Number), d = Math.hypot(cx - t.x, cy - t.y); if (!best || d < best.d) best = { d, dx: t.x - cx, dy: t.y - cy }; }
    if (!best) return [0, 1]; return Math.abs(best.dx) >= Math.abs(best.dy) ? [Math.sign(best.dx) || 1, 0] : [0, Math.sign(best.dy) || 1];
  };
  const glassBg = matte({ color: '#E4E3D8', vary: 0.02, freq: 3, rough: 0.4 }), water = new THREE.MeshStandardMaterial({ color: '#4F8DB8', roughness: 0.3, emissive: '#1F4A66', emissiveIntensity: 0.25 }), pipeMat = matte({ color: '#8E918A', vary: 0.05, freq: 3, rough: 0.55 });
  const tankAt = new Map(tanks.map(t => [`${t.x},${t.y}`, t]));
  for (const t of tanks) {
    const [x, y, z] = t.p, m = new THREE.Group(), [ox, oy] = outward(t), fedT = fedSet.has(tankKey(t)), ang = Math.atan2(ox, oy);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 1.2, 28), tankMat); body.position.y = 0.6;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.08, 28), lidMat); lid.position.y = 1.24;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.515, 0.02, 6, 32), lidMat); band.rotation.x = Math.PI / 2; band.position.y = 0.45;
    const win = new THREE.Group(); win.rotation.y = ang;
    const bg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 0.03), glassBg); bg.position.set(0, 0.62, 0.535); win.add(bg);
    if (fedT) { const wv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.03), water); wv.position.set(0, 0.5, 0.55); win.add(wv); }
    m.add(body, lid, band, win); m.position.set(x, y, z); m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    m.userData.pick = { kind: 'tank', x: t.x, y: t.y, z: t.z }; g.add(m);
    // となりのタンクへ（東と南だけ見れば、組は一度ずつ）
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const u = tankAt.get(`${t.x + dx},${t.y + dy}`); if (!u || !fedT || !fedSet.has(tankKey(u)) || Math.abs(u.z - t.z) > 3) continue;
      // t.p は [東西, 高さ, 南北]。管は外を向いた側（並びに直角）を通す
      const [px, py] = dx ? [0, oy || 1] : [ox || 1, 0], off = 0.62, h1 = t.p[1] + 0.16, h2 = u.p[1] + 0.16;
      const P3 = (q, k, h) => new THREE.Vector3(q.p[0] + px * k, h, q.p[2] + py * k);
      const seg = (p1, p2) => { const d = p2.clone().sub(p1), L = d.length(); if (L < 0.02) return; const gg = new THREE.CylinderGeometry(0.045, 0.045, L, 10); gg.translate(0, L / 2, 0);
        gg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); gg.translate(p1.x, p1.y, p1.z); const mm = new THREE.Mesh(gg, pipeMat); mm.castShadow = true; g.add(mm); };
      seg(P3(t, 0.42, h1), P3(t, off, h1)); seg(P3(t, off, h1), P3(u, off, h2)); seg(P3(u, off, h2), P3(u, 0.42, h2));
    }
  }
  // 蓄電池：家の中の壁ぎわに立てる箱（表に小さな緑の灯りと、通気の筋）。壁のない所なら真ん中に
  { const cab = matte({ color: '#3B4245', vary: 0.04, freq: 4, rough: 0.55 }), face = matte({ color: '#4C5558', vary: 0.03, freq: 4, rough: 0.5 }), led = new THREE.MeshBasicMaterial({ color: '#7CF08A' });
    for (const bt of batts) {
      const bd = W.buildingAt(w, bt.x, bt.y), inB = (x, y) => bd && W.buildingAt(w, x, y) === bd;
      const side = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([dx, dy]) => !inB(bt.x + dx, bt.y + dy)) || [0, 0];
      const m = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.34), cab); body.position.y = 0.475;
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.8, 0.02), face); fr.position.set(0, 0.5, -0.175);
      const lt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), led); lt.position.set(0.18, 0.82, -0.19);
      m.add(body, fr, lt); for (let k = 0; k < 4; k++) { const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.015, 0.012), cab); v2.position.set(-0.04, 0.22 + k * 0.05, -0.19); m.add(v2); }
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), cab); cable.position.set(0.2, 1.0, 0.1); m.add(cable);   // 壁へ入る線
      m.rotation.y = Math.atan2(side[0], side[1]);   // 正面（-z）を部屋の内側へ（壁の反対）
      const off = side[0] || side[1] ? 0.5 - 0.1 - 0.17 - 0.03 : 0; m.position.set(bt.x + 0.5 + side[0] * off, bt.z, bt.y + 0.5 + side[1] * off);
      m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); m.userData.pick = { kind: 'batt', x: bt.x, y: bt.y, z: bt.z }; g.add(m);
    } }
  // 地面の太陽光：赤道の側へ傾けた架台に1枚（年の発電は engine で同じ傾き 0.4 として数える）
  if (pvs.length) { const eq = (bo.lat ?? 6) >= 0 ? 1 : -1, tilt = 0.4, panel = matte({ color: '#2B3B55', vary: 0.03, freq: 3, rough: 0.32, spec: 0.9 }), frame = matte({ color: '#A9AEB1', vary: 0.02, freq: 3, rough: 0.5 }), line = new THREE.MeshBasicMaterial({ color: '#8EA3C2' });
    for (const q of pvs) {
      const m = new THREE.Group(), pn = new THREE.Group(); pn.rotation.x = eq * tilt; pn.position.y = 0.78; m.add(pn);
      pn.add(new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.035, 1.28), frame));
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.02, 1.22), panel); face.position.y = 0.012; pn.add(face);
      for (const zz of [-0.2, 0.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.024, 0.012), line); l.position.set(0, 0.014, zz * 1.5); pn.add(l); }
      for (const xs of [-0.4, 0.4]) for (const zs of [-1, 1]) { const hgt = 0.78 - zs * eq * 0.46 * Math.tan(tilt); const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, hgt, 0.04), frame); post.position.set(xs, hgt / 2, zs * 0.46); m.add(post); }
      m.position.set(q.x + 0.5, q.z, q.y + 0.5);
      m.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); m.userData.pick = { kind: 'pvg', x: q.x, y: q.y, z: q.z }; g.add(m);
    } }
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
  // 浄化設備：掘った穴に砂利と砂を入れ、上にヨシやカンナ
  if (media.length) {   // 砂利の面は地面に塗ってある。押せるように、薄い当たりの板だけ置く
    const geos = []; const top = new Map(); for (const m of media) { const k = `${m.x},${m.y}`; if (!top.has(k) || top.get(k).z < m.z) top.set(k, m); }
    for (const m of top.values()) boxAt(geos, null, m.x + 0.5, m.y + 0.5, at(m.x + 0.5, m.y + 0.5) + 0.02, 1, 1, 0.02);
    const hit = mesh(geos, new THREE.MeshBasicMaterial({ visible: false })); hit.castShadow = hit.receiveShadow = false; g.add(pickAt(hit, 'filter'));
    // 微生物の働きは見えないので、水の色で見せる：家に近い入口は濁った茶、奥へ流れるほど澄んだ青。小さな泡は入口ほど多い
    const hc = w.house ? (() => { const ks = Object.keys(w.house.cells).map(k => k.split(',').map(Number)); return [ks.reduce((a, c) => a + c[0], 0) / ks.length, ks.reduce((a, c) => a + c[1], 0) / ks.length]; })() : [N0 / 2, N0 / 2];
    const cells = [...top.values()], ds = cells.map(m => Math.hypot(m.x + 0.5 - hc[0], m.y + 0.5 - hc[1])), d0 = Math.min(...ds), d1 = Math.max(...ds);
    const film = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.012, 0.98), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0, transparent: true, opacity: 0.8 }), cells.length);
    const bub = [], mt = new THREE.Matrix4(), c = new THREE.Color(), dirty = new THREE.Color('#5E4123'), clear = new THREE.Color('#3E8FC0');
    cells.forEach((m, i) => { const t = d1 > d0 ? (ds[i] - d0) / (d1 - d0) : 0.5, z = at(m.x + 0.5, m.y + 0.5) + 0.035;
      mt.makeTranslation(m.x + 0.5, z, m.y + 0.5); film.setMatrixAt(i, mt); film.setColorAt(i, c.copy(dirty).lerp(clear, t));
      const nb = Math.round(7 - t * 5); for (let k = 0; k < nb; k++) bub.push([m.x + 0.12 + hash(m.x, m.y, 200 + k) * 0.76, z + 0.012, m.y + 0.12 + hash(m.y, m.x, 230 + k) * 0.76, 0.6 + hash(k, m.x, 260) * 0.8]); });
    film.receiveShadow = true; g.add(pickAt(film, 'filter'));
    if (bub.length) { const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshStandardMaterial({ color: '#F4F8F6', roughness: 0.25, transparent: true, opacity: 0.85 }), bub.length);
      bub.forEach(([x, z, y, r], i) => { mt.makeScale(r, r * 0.7, r).setPosition(x, z, y); bm.setMatrixAt(i, mt); }); g.add(pickAt(bm, 'filter')); }
  }
  if (reeds.length) {
    const cone = new THREE.ConeGeometry(0.035, 1, 5); cone.translate(0, 0.5, 0);
    const list = []; for (const r of reeds) for (let k = 0; k < 22; k++) list.push([r.x + 0.1 + hash(r.x, r.y, 50 + k) * 0.8, at(r.x + 0.5, r.y + 0.5) - 0.05, r.y + 0.1 + hash(r.y, r.x, 70 + k) * 0.8, 0.7 + hash(r.x, k, 90) * 0.7, r.t, hash(k, r.y, 95)]);
    const rm = matte({ color: '#ffffff', vary: 0.15, freq: 4, rough: 0.8, spec: 0.4 }), im = new THREE.InstancedMesh(cone, rm, list.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    list.forEach(([x, z, y, hh, t, r], i) => { e.set((r - 0.5) * 0.3, r * 6, (hash(x, y, 3) - 0.5) * 0.3); q.setFromEuler(e); mt.compose(new THREE.Vector3(x, z, y), q, new THREE.Vector3(1, hh, 1)); im.setMatrixAt(i, mt); im.setColorAt(i, c.set(t === 'canna' && r > 0.7 ? '#C8562E' : r > 0.5 ? '#86A05A' : '#9AAE64')); });
    im.castShadow = true; g.add(pickAt(im, 'filter'));
  }
  if (pumps.length) {   // ポンプ：小さな箱に管
    const geos = [], pm = matte({ color: '#3A5F86', vary: 0.08, freq: 3, rough: 0.5 });
    for (const q of pumps) { boxAt(geos, null, q.x + 0.5, q.y + 0.5, q.z + 0.22, 0.45, 0.35, 0.44); boxAt(geos, null, q.x + 0.5, q.y + 0.5, q.z + 0.6, 0.06, 0.06, 0.4); boxAt(geos, null, q.x + 0.72, q.y + 0.5, q.z + 0.78, 0.5, 0.06, 0.06); }
    g.add(pickAt(mesh(geos, pm), 'pump'));
  }
  if (settles.length) {   // 沈殿槽：コンクリートの四角い槽にふた、入る管と出る管
    const geos = [], lid = [], cm = matte({ color: '#B7B4AA', vary: 0.1, freq: 4, bump: 0.3, bumpFreq: 9, rough: 0.9 }), lm = matte({ color: '#8E8B83', vary: 0.08, freq: 4 });
    for (const q of settles) { const cx = q.x + 0.5, cy = q.y + 0.5, z0 = at(cx, cy);
      boxAt(geos, null, cx, cy, z0 + 0.2, 0.86, 0.86, 0.44); boxAt(lid, null, cx, cy, z0 + 0.45, 0.7, 0.7, 0.06); boxAt(lid, null, cx - 0.12, cy, z0 + 0.5, 0.18, 0.06, 0.04);
      boxAt(geos, null, cx - 0.52, cy, z0 + 0.3, 0.2, 0.1, 0.1); boxAt(geos, null, cx + 0.52, cy, z0 + 0.22, 0.2, 0.1, 0.1); }
    const gg = new THREE.Group(); gg.add(mesh(geos, cm), mesh(lid, lm)); g.add(pickAt(gg, 'settle'));
  }
  return g;
}

