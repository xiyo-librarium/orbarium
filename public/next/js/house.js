/* 家：床の形・高さ・屋根（形・傾き・軒の出）・開口・工法のデータから、その場で形を生やす。
   壁は辺ごとの箱だが、模様と凹凸は世界の位置で決まるので継ぎ目は出ない。角は丸い柱で落とす。
   瓦は1枚ずつ（同じ形を数百枚、位置・傾き・焼き色を少しずつずらす） */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { matte, hash } from './look.js';
import { HOUSE_H, roofZ, roofBox, eavesDepth, houseOuterEdges, drainDirs, ACCENTS, WALLS, ROOFS, furnCells, FDIR as W_FDIR, pvLayout } from '/js/world.js';

const T = 0.2;   // 壁の厚さ
const DV = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

export function buildHouse(hs, P, at, opt = {}) {
  const group = new THREE.Group();
  const parts = new Map();   // 材料ごとに形を集めて、最後に1つにまとめる（描く回数を減らす）
  const add = (mat, geo) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(geo); };
  // 世界の座標（x 東, y 南, z 上）で箱を置く
  const box = (mat, cx, cy, cz, sx, sy, sz, rot = 0) => { const g = new THREE.BoxGeometry(sx, sz, sy); if (rot) g.rotateY(rot); g.translate(cx, cz, cy); add(mat, g); };
  const cyl = (mat, cx, cy, z0, r, hgt, seg = 14) => { const g = new THREE.CylinderGeometry(r, r, hgt, seg); g.translate(cx, z0 + hgt / 2, cy); add(mat, g); };

  // 白い土壁（タイパ）は石灰の白。腰の帯（band の高さ）は白い線なしの塗り分け。色はその工法の色から
  const M = WALLS[hs.wall] || WALLS.board, earth = hs.wall === 'bahareque' && hs.finish !== 'lime', lime = (hs.wall === 'bahareque' && hs.finish === 'lime') || hs.wall === 'taipa';
  const AC = M.accents || ACCENTS, BAND = M.band || 0.9;
  const accentHex = M.accent ? AC[(hs.accent ?? 0) % AC.length][0] : (M.frame || '#D9CFBC');
  const wallMat = earth ? matte({ color: P.plaster, vary: 0.07, freq: 0.9, patch: P.plasterPatch, patchAt: 0.66, bump: 0.45, bumpFreq: 1.8 })
    : hs.wall === 'taipa' ? matte({ color: P.lime, vary: 0.03, freq: 1.3, patch: P.limePatch, patchAt: 0.84, bump: 0.16, bumpFreq: 2.4 })   // 毎年塗り重ねた石灰：なめらかで、うっすらむら
    : lime ? matte({ color: P.lime, vary: 0.05, freq: 1.0, patch: P.limePatch, patchAt: 0.74, bump: 0.45, bumpFreq: 2.0 })
    : matte({ color: M.color || '#C9A47A', vary: 0.12, freq: 2.5, bump: 0.3, bumpFreq: 5 });
  const accentMat = matte({ color: accentHex, vary: 0.04, freq: 1.5, bump: 0.12, bumpFreq: 2.5 });
  const trimMat = matte({ color: P.lime, vary: 0.04, freq: 2, bump: 0.2 });
  const woodMat = matte({ color: P.wood, vary: 0.16, freq: 4, bump: 0.5, bumpFreq: 8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: P.glass, roughness: 0.18, metalness: 0.0, envMapIntensity: 1.4 });
  const floorMat = matte({ color: '#B0664A', vary: 0.12, freq: 3 });
  const mortarMat = matte({ color: '#8F897D', vary: 0.1, freq: 3, bump: 0.6, bumpFreq: 6 });

  const z = hs.z, H = HOUSE_H, bx = roofBox(hs), E = eavesDepth(hs), drains = drainDirs(hs), cut = !!opt.cut, CUT = 1.05;
  const has = (x, y) => !!hs.cells[`${x},${y}`];
  const RZ = (px, py) => z + roofZ(hs, px, py, bx) + 0.15;   // 屋根の面（壁の上より少し上に乗せる）
  const cells = Object.keys(hs.cells).map(k => k.split(',').map(Number));

  // 床
  for (const [x, y] of cells) box(floorMat, x + 0.5, y + 0.5, z - 0.05, 1, 1, 0.1);

  // 壁：辺ごと。窓は 0.9〜2.2m、扉は 0〜2.1m
  const edges = houseOuterEdges(hs), edgeDir = new Map(edges.map(o => [o.e, o.dir]));
  // 同じ壁の線で、となりの辺も同じ開口か（窓がつづけば横長の窓、扉がならべば両開き）
  const sameNb = (t, ex, ey, dir, op, k) => { const key = t === 'h' ? `h:${ex + k},${ey}` : `v:${ex},${ey + k}`, o2 = hs.open[key];
    if (edgeDir.get(key) !== dir || !o2) return false; return op === 'door' ? o2 === 'door' : o2 !== 'door'; };
  for (const o of edges) {
    const [t, r] = o.e.split(':'), [ex, ey] = r.split(',').map(Number), along = t === 'h';
    const [nx, ny] = DV[o.dir], op = hs.open[o.e], lo = !!op && sameNb(t, ex, ey, o.dir, op, -1), hi = !!op && sameNb(t, ex, ey, o.dir, op, 1);
    const cx = along ? ex + 0.5 : ex, cy = along ? ey : ey + 0.5, sx = along ? 1 : T, sy = along ? T : 1;
    const piece = (z0, z1) => box(wallMat, cx, cy, z + (z0 + z1) / 2, sx, sy, z1 - z0);
    if (cut) {   // 壁を下げた見え方：腰の高さで切る。扉は開口だけ、窓は窓台まで
      if (op === 'door') doorStep(cx, cy, along, nx, ny);
      else if (op === 'window' || op === 'window2') { piece(0, 0.9); box(accentMat, cx + nx * 0.06, cy + ny * 0.06, z + 0.935, along ? 0.96 : T + 0.16, along ? T + 0.16 : 0.96, 0.07); }
      else piece(0, CUT);
    }
    else if (op === 'door') { piece(2.1, H); door(cx, cy, along, nx, ny, lo, hi); }
    else if (op === 'window' || op === 'window2') { piece(0, 0.9); piece(2.2, H); win(cx, cy, along, nx, ny, op, lo, hi); }
    else piece(0, H);
    // 腰壁（ソカロ）：外側に 3cm 出た色の帯と、上の白い線
    if (M.accent && op !== 'door') {
      const ox = cx + nx * (T / 2 + 0.015), oy = cy + ny * (T / 2 + 0.015);
      box(accentMat, ox, oy, z + BAND / 2, along ? 1 : 0.03, along ? 0.03 : 1, BAND);
      if (!M.band) box(trimMat, cx + nx * (T / 2 + 0.025), cy + ny * (T / 2 + 0.025), z + 0.915, along ? 1 : 0.05, along ? 0.05 : 1, 0.03);
    }
    // 妻壁：屋根が壁より高い辺は、屋根の線まで壁をのばす（両端は角を覆うよう少し長く）
    const p0 = along ? [ex, ey] : [ex, ey], p1 = along ? [ex + 1, ey] : [ex, ey + 1];
    const r0 = RZ(p0[0], p0[1]) - z, r1 = RZ(p1[0], p1[1]) - z;
    if (!cut && Math.max(r0, r1) > H + 0.25) gable(p0, p1, r0, r1, along);
  }
  function gable(p0, p1, r0, r1, along) {
    const ext = T / 2, L = 1 + 2 * ext, k = (r1 - r0);
    const shape = new THREE.Shape([new THREE.Vector2(0, H), new THREE.Vector2(L, H), new THREE.Vector2(L, r1 + k * ext - 0.16), new THREE.Vector2(0, r0 - k * ext - 0.16)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    g.translate(-ext, 0, -T / 2);
    if (along) g.translate(p0[0], z, p0[1]); else { g.rotateY(-Math.PI / 2); g.translate(p0[0], z, p0[1]); }
    add(wallMat, g);
  }
  // 窓：となりも窓なら枠を端までのばし、つなぎ目は細い桟1本（ひと続きの横長の窓）。となりが壁なら、すき間を壁で埋める
  function win(cx, cy, along, nx, ny, op, lo = false, hi = false) {
    const fw = 0.06, z0 = z + 0.9, z1 = z + 2.2, d = T + 0.03, mid = (z0 + z1) / 2, ux = along ? 1 : 0, uy = along ? 0 : 1;
    const fb = (du, dzc, w, hgt, dep, mat = accentMat, out = 0) => box(mat, cx + ux * du + nx * out, cy + uy * du + ny * out, dzc, along ? w : dep, along ? dep : w, hgt);
    const a = lo ? -0.5 : -0.44, b = hi ? 0.5 : 0.44, c = (a + b) / 2, Lw = b - a;
    if (!lo) { fb(a + fw / 2, mid, fw, z1 - z0, d); fb(-0.47, mid, 0.06, z1 - z0, T, wallMat); } else fb(-0.5, mid, 0.05, z1 - z0, d);   // 縦の枠（つなぎ目は細く、こちらだけが描く）
    if (!hi) { fb(b - fw / 2, mid, fw, z1 - z0, d); fb(0.47, mid, 0.06, z1 - z0, T, wallMat); }
    fb(c, z1 - fw / 2, Lw, fw, d);                                                                       // 上の枠
    const sa = lo ? -0.5 : -0.48, sb = hi ? 0.5 : 0.48; fb((sa + sb) / 2, z0 + 0.035, sb - sa, 0.07, T + 0.16, accentMat, 0.06);   // 窓台（つづけば一本）
    const ga = lo ? -0.5 : a + fw, gb = hi ? 0.5 : b - fw;
    fb((ga + gb) / 2, mid, gb - ga, z1 - z0 - fw - 0.07, 0.02, glassMat, -0.02);                           // ガラス（少し奥）
    fb(0, mid, 0.035, z1 - z0 - fw - 0.07, 0.05, accentMat, 0.01);                                        // 縦の桟
    for (const f of op === 'window2' ? [0.36, 0.64] : [0.58]) fb((ga + gb) / 2, z0 + 0.07 + (z1 - z0 - fw - 0.07) * f, gb - ga, 0.035, 0.05, accentMat, 0.01);
    if (!lo) fb(a + fw + 0.12, mid, 0.2, z1 - z0 - fw - 0.12, 0.02, trimMat, -0.07);                      // 中のカーテン（窓の列の端に）
    if (!hi && lo) fb(b - fw - 0.12, mid, 0.2, z1 - z0 - fw - 0.12, 0.02, trimMat, -0.07);
  }
  // 扉：となりも扉なら、あいだの柱をなくして両開きに（取っ手は合わせ目の側）
  function door(cx, cy, along, nx, ny, lo = false, hi = false) {
    const ux = along ? 1 : 0, uy = along ? 0 : 1, fb = (du, dzc, w, hgt, dep, mat, out = 0) => box(mat, cx + ux * du + nx * out, cy + uy * du + ny * out, dzc, along ? w : dep, along ? dep : w, hgt);
    if (!lo) fb(-0.45, z + 1.05, 0.07, 2.1, T + 0.04, woodMat); if (!hi) fb(0.45, z + 1.05, 0.07, 2.1, T + 0.04, woodMat);
    const la = lo ? -0.5 : -0.485, lb = hi ? 0.5 : 0.485; fb((la + lb) / 2, z + 2.06, lb - la, 0.08, T + 0.04, woodMat);
    const pa = lo ? -0.47 : -0.33, n = lo || hi ? 6 : 5; for (let k = 0; k < n; k++) fb(pa + k * 0.155 + (hi && !lo ? 0.02 : 0), z + 1.01, 0.145, 2.0, 0.05, accentMat, 0.02);   // 縦の板
    fb(0, z + 0.45, lo || hi ? 0.94 : 0.82, 0.08, 0.04, accentMat, 0.05); fb(0, z + 1.6, lo || hi ? 0.94 : 0.82, 0.08, 0.04, accentMat, 0.05);
    fb(lo ? -0.38 : hi ? 0.38 : 0.3, z + 1.0, 0.04, 0.04, 0.04, matte({ color: '#2A2522' }), 0.08);
    doorStep(cx, cy, along, nx, ny);
  }
  function doorStep(cx, cy, along, nx, ny) { box(mortarMat, cx + nx * 0.55, cy + ny * 0.55, Math.min(z, at(cx + nx * 0.55, cy + ny * 0.55)) + 0.02, along ? 0.8 : 0.5, along ? 0.5 : 0.8, 0.12); }   // 踏み石
  // 出っぱった角：丸い柱で角を落とす（腰壁の角も丸く）
  for (const [x, y] of cells) for (const [px, py, a, b] of [[x, y, [-1, 0], [0, -1]], [x + 1, y, [1, 0], [0, -1]], [x, y + 1, [-1, 0], [0, 1]], [x + 1, y + 1, [1, 0], [0, 1]]]) {
    if (has(x + a[0], y + a[1]) || has(x + b[0], y + b[1])) continue;
    cyl(wallMat, px, py, z, T / 2, (cut ? CUT : H) + 0.001);
    if (M.accent) { cyl(accentMat, px, py, z, T / 2 + 0.03, BAND); if (!M.band) cyl(trimMat, px, py, z + 0.9, T / 2 + 0.04, 0.03); }
  }

  // 基礎：石を積んだ帯。地面より下まで
  const stones = [];
  for (const o of edges) {
    const [t, r] = o.e.split(':'), [ex, ey] = r.split(',').map(Number), along = t === 'h', [nx, ny] = DV[o.dir];
    const cx = along ? ex + 0.5 : ex, cy = along ? ey : ey + 0.5, g0 = Math.min(at(cx + nx * 0.3, cy + ny * 0.3), at(cx, cy)) - 0.35;
    box(mortarMat, cx + nx * 0.02, cy + ny * 0.02, (g0 + z) / 2, along ? 1 + T : T + 0.04, along ? T + 0.04 : 1 + T, z - g0);
    for (let row = 0, zt = z; zt > g0; row++) {
      const hgt = 0.15 + 0.08 * hash(ex * 3 + row, ey, 1); let u = -0.5 - T / 2 + (row % 2) * 0.13;
      while (u < 0.5 + T / 2) { const L = 0.22 + 0.2 * hash(ex + u * 7, ey + row, 2); const uc = Math.min(u + L / 2, 0.5 + T / 2 - 0.02);
        stones.push({ x: cx + (along ? uc : 0) + nx * (T / 2 + 0.02), y: cy + (along ? 0 : uc) + ny * (T / 2 + 0.02), z: zt - hgt / 2, sx: along ? L - 0.025 : 0.12, sy: along ? 0.12 : L - 0.025, sz: hgt - 0.025, s: hash(cx + u, cy + row, 3) });
        u += L; }
      zt -= hgt;
    }
  }
  if (stones.length) {
    const sg = new RoundedBoxGeometry(1, 1, 1, 2, 0.18), sm = new THREE.InstancedMesh(sg, matte({ color: '#ffffff', vary: 0.18, freq: 4, bump: 1.1, bumpFreq: 7 }), stones.length);
    const mt = new THREE.Matrix4(), c = new THREE.Color(), base = new THREE.Color(P.stone), q = new THREE.Quaternion(), e = new THREE.Euler();
    stones.forEach((s, i) => { e.set((s.s - 0.5) * 0.08, 0, (hash(s.x, s.y, 4) - 0.5) * 0.08); q.setFromEuler(e); mt.compose(new THREE.Vector3(s.x, s.z, s.y), q, new THREE.Vector3(s.sx, s.sz, s.sy)); sm.setMatrixAt(i, mt); sm.setColorAt(i, c.copy(base).multiplyScalar(0.82 + 0.3 * s.s).lerp(new THREE.Color(s.s > 0.8 ? '#B9A88C' : '#9C9A94'), 0.3)); });
    sm.castShadow = sm.receiveShadow = true; group.add(sm);
  }

  // 屋根（壁を下げた見え方では、屋根の代わりに家具）
  if (cut) furniture(); else roof();
  // 家具：寝台・食卓・トイレ・シャワー・かまど。中が見えたときだけ
  function furniture() {
    const white = matte({ color: '#EFEDE6', vary: 0.04, freq: 3, rough: 0.6 }), cloth = matte({ color: '#D9D2C2', vary: 0.08, freq: 4, bump: 0.3, bumpFreq: 9 });
    const blanket = matte({ color: '#C08A4E', vary: 0.12, freq: 3, bump: 0.25, bumpFreq: 8 }), brick = matte({ color: '#A85F45', vary: 0.18, freq: 5, bump: 0.6, bumpFreq: 8 });
    const water = new THREE.MeshStandardMaterial({ color: '#9FC3CC', roughness: 0.25, transparent: true, opacity: 0.55 });
    for (const f of hs.furn || []) {
      const cs = furnCells(f), xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
      const X0 = Math.min(...xs), X1 = Math.max(...xs) + 1, Y0 = Math.min(...ys), Y1 = Math.max(...ys) + 1;
      // 壁ぎわの辺は、壁の厚み（内へ 0.1m）とすき間のぶん内側へ寄せ、形もそのぶん縮める
      const wall = (dx, dy) => cs.some(([x, y]) => !has(x + dx, y + dy)), G = T / 2 + 0.04, g0 = 0.02;
      const iw = wall(-1, 0) ? G : g0, ie = wall(1, 0) ? G : g0, inn = wall(0, -1) ? G : g0, is = wall(0, 1) ? G : g0;
      const mx = (X0 + iw + X1 - ie) / 2, my = (Y0 + inn + Y1 - is) / 2, kx = (X1 - X0 - iw - ie) / (X1 - X0), ky = (Y1 - Y0 - inn - is) / (Y1 - Y0);
      const fb = (mat, dx, dy, z0, sx, sy, sz) => box(mat, mx + dx * kx, my + dy * ky, z + z0 + sz / 2, sx * kx, sy * ky, sz);
      const long = cs.length > 1 && cs[0][0] !== cs[1][0];   // 2マスの家具が東西に長いか
      const B = (mat, da, dl, z0, sw, sl, sz) => fb(mat, long ? dl : da, long ? da : dl, z0, long ? sl : sw, long ? sw : sl, sz);   // da・sw＝横、dl・sl＝長さの向き
      const D = W_FDIR[(f.r || 0) % 4], head = cs.length > 1 ? [cs[0][0] - cs[1][0], cs[0][1] - cs[1][1]] : [-D[0], -D[1]];
      if (f.t === 'bed') { B(woodMat, 0, 0, 0, 0.98, 1.96, 0.3); B(cloth, 0, 0, 0.3, 0.9, 1.88, 0.14); B(blanket, 0, -0.25 * (long ? head[0] : head[1]), 0.44, 0.92, 1.2, 0.06); fb(white, head[0] * 0.74, head[1] * 0.74, 0.45, 0.36, 0.36, 0.1); }
      else if (f.t === 'table') {   // 長い向きにテーブル、両端に椅子
        B(woodMat, 0, 0, 0.72, 0.78, 1.1, 0.05); for (const [a, b2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(woodMat, a * 0.33, b2 * 0.48, 0, 0.06, 0.06, 0.72);
        for (const sgn of [-1, 1]) { B(woodMat, 0, sgn * 0.74, 0, 0.42, 0.38, 0.45); B(woodMat, 0, sgn * 0.92, 0.45, 0.42, 0.05, 0.45); }
      }
      else if (f.t === 'toilet') { fb(white, -head[0] * 0.06, -head[1] * 0.06, 0, 0.4, 0.4, 0.4); fb(white, head[0] * 0.3, head[1] * 0.3, 0.2, head[0] ? 0.18 : 0.42, head[0] ? 0.42 : 0.18, 0.5); }
      else if (f.t === 'ctoilet') { fb(woodMat, 0, 0, 0, 0.6, 0.6, 0.46); fb(woodMat, 0, 0, 0.46, 0.52, 0.52, 0.04); fb(cloth, -head[1] * 0.37, head[0] * 0.37, 0, head[1] ? 0.14 : 0.3, head[1] ? 0.3 : 0.14, 0.4); }
      else if (f.t === 'shower' || f.t === 'shower2') {   // ガラスは壁のない辺にだけ
        fb(white, 0, 0, 0, 0.94, 0.94, 0.06);
        if (!wall(1, 0)) fb(water, 0.46, 0, 0.06, 0.02, 0.94, 1.1); if (!wall(-1, 0)) fb(water, -0.46, 0, 0.06, 0.02, 0.94, 1.1);
        if (!wall(0, 1)) fb(water, 0, 0.46, 0.06, 0.94, 0.02, 1.1); if (!wall(0, -1)) fb(water, 0, -0.46, 0.06, 0.94, 0.02, 1.1);
      }
      else if (f.t === 'stove') { fb(brick, 0, 0, 0, 0.82, 0.7, 0.8); fb(matte({ color: '#3A332E' }), 0, 0, 0.8, 0.6, 0.46, 0.03); cyl(brick, mx + head[0] * 0.22 * kx, my + head[1] * 0.22 * ky, z + 0.8, 0.11, 1.4, 10); }
    }
  }
  // 屋根の形（家のマスを外へ E だけ広げた形）の中か。m＞0 は外のふちから m 以上内側か
  //（前はマスごとに m を引いていたので、マスの境目ごとに瓦が抜けて溝になっていた。軒の出で格子がずれるので溝の位置も変わっていた）
  function inRoof(px, py, m = 0) {
    if (m > 0) return inRoof(px, py) && inRoof(px + m, py) && inRoof(px - m, py) && inRoof(px, py + m) && inRoof(px, py - m);
    for (const [x, y] of cells) {
      const x0 = x - (has(x - 1, y) ? 0 : E), x1 = x + 1 + (has(x + 1, y) ? 0 : E), y0 = y - (has(x, y - 1) ? 0 : E), y1 = y + 1 + (has(x, y + 1) ? 0 : E);
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return true;
    }
    return false;
  }
  function roof() {
    const X0 = bx.X0 - E, X1 = bx.X1 + E, Y0 = bx.Y0 - E, Y1 = bx.Y1 + E, shape = hs.roofShape || 'flat', p = shape === 'flat' ? 0 : (hs.pitch || 0.3);
    const ridgeAlongX = shape === 'gable' && hs.roofDir !== 'ew';
    // 屋根の下地：0.5m の格子（棟の線を必ず含める）で、上面と下面
    const xs = new Set([X0, X1]), ys = new Set([Y0, Y1]);
    for (let v = Math.ceil(X0 * 2) / 2; v < X1; v += 0.5) xs.add(v); for (let v = Math.ceil(Y0 * 2) / 2; v < Y1; v += 0.5) ys.add(v);
    if (shape === 'gable') { if (ridgeAlongX) ys.add((bx.Y0 + bx.Y1) / 2); else xs.add((bx.X0 + bx.X1) / 2); }
    const XS = [...xs].sort((a, b) => a - b), YS = [...ys].sort((a, b) => a - b);
    const deck = (off, flip) => { const pos = [], idx = [], W = XS.length;
      for (const yy of YS) for (const xx of XS) pos.push(xx, RZ(xx, yy) + off, yy);
      for (let j = 0; j < YS.length - 1; j++) for (let i = 0; i < W - 1; i++) {
        const cxm = (XS[i] + XS[i + 1]) / 2, cym = (YS[j] + YS[j + 1]) / 2; if (!inRoof(cxm, cym)) continue;
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
    const tin = hs.roof === 'tin' || hs.roof === 'tinins', tile = ROOFS[hs.roof]?.pat === 'teja';
    const deckMat = tin ? matte({ color: '#8E979C', vary: 0.1, freq: 2, rough: 0.6 }) : matte({ color: '#6E4636', vary: 0.1, freq: 2 });
    add(deckMat, deck(tin ? 0 : -0.12, false)); add(woodMat, deck(tin ? -0.06 : -0.18, true));
    // 鼻隠し：外周の板（屋根の線にそう）
    const fascia = (pts) => { const pos = []; for (let k = 0; k < pts.length - 1; k++) { const [ax, ay] = pts[k], [bx2, by2] = pts[k + 1], za = RZ(ax, ay), zb = RZ(bx2, by2);
      pos.push(ax, za - 0.02, ay, ax, za - 0.17, ay, bx2, zb - 0.02, by2, bx2, zb - 0.02, by2, ax, za - 0.17, ay, bx2, zb - 0.17, by2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); add(woodMat, g); };
    const seg = (a, b) => { const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2)); return Array.from({ length: n + 1 }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); };
    const ridgeMid = ridgeAlongX ? (bx.Y0 + bx.Y1) / 2 : (bx.X0 + bx.X1) / 2;
    const withRidge = (a, b) => { const pts = seg(a, b); if (shape !== 'gable') return pts; const k = ridgeAlongX ? 1 : 0; if ((a[k] - ridgeMid) * (b[k] - ridgeMid) < 0) { pts.push(ridgeAlongX ? [a[0], ridgeMid] : [ridgeMid, a[1]]); pts.sort((p1, p2) => (p1[k] - a[k]) * Math.sign(b[k] - a[k]) - (p2[k] - a[k]) * Math.sign(b[k] - a[k])); } return pts; };
    fascia(withRidge([X0, Y1], [X1, Y1])); fascia(withRidge([X1, Y1], [X1, Y0])); fascia(withRidge([X1, Y0], [X0, Y0])); fascia(withRidge([X0, Y0], [X0, Y1]));
    if (hs.gutter) gutters(X0, X1, Y0, Y1);
    if (hs.pv) panels(X0, X1, Y0, Y1, p, shape, ridgeAlongX, tile ? 0.2 : tin ? 0.08 : 0.14);
    if (tin || shape === 'flat' || !tile) return;
    tiles(X0, X1, Y0, Y1, p, shape, ridgeAlongX);
  }
  // 雨どい：雨が落ちる軒にそって半円の樋。いちばん近いタンクへたてどいを下ろす
  // 太陽光パネル：赤道を向いた屋根の面から並べる（北半球なら南の面）。入りきらなければ次の面へ。
  // 平らな屋根は、赤道へ少し傾けた架台に、影がかからないよう列をあけて並べる。1枚 0.2kW（約1m²）
  function panels(X0, X1, Y0, Y1, p, shape, ridgeAlongX, lift) {
    const glass = new THREE.MeshStandardMaterial({ color: '#1E2F45', roughness: 0.2, metalness: 0.2, envMapIntensity: 1.3 });
    const frame = matte({ color: '#B7BBBD', vary: 0.03, freq: 3, rough: 0.5 }), line = matte({ color: '#3A4D66', vary: 0.02, freq: 3, rough: 0.4 });
    const eq = (opt.lat ?? 6) >= 0 ? [0, 1] : [0, -1], flat = shape === 'flat';
    let planes = shape === 'gable' ? (ridgeAlongX ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) : shape === 'mono' ? [DV[hs.roofDir || 's']] : [eq];
    planes = planes.slice().sort((A, B) => (B[0] * eq[0] + B[1] * eq[1]) - (A[0] * eq[0] + A[1] * eq[1]));
    const PW = 0.86, PL = 1.16, GAP = 0.05, ridge = ridgeAlongX ? (bx.Y0 + bx.Y1) / 2 : (bx.X0 + bx.X1) / 2;
    const put = (geo, M, mat) => { geo.applyMatrix4(M); add(mat, geo); };
    // 1枚：中心 (px,py)、高さ h、下りの向き (dx,dy) と傾き tl、横 pw・縦 pl。legs＝足もとの高さを返す関数（架台の脚）
    const panel = (px, py, h, dx, dy, tl, pw, pl, legs) => {
      const D = new THREE.Vector3(dx, -tl, dy).normalize(), U = new THREE.Vector3(-dy, 0, dx), N = new THREE.Vector3().crossVectors(D, U);
      if (N.y < 0) { U.negate(); N.crossVectors(D, U); }
      const M = new THREE.Matrix4().makeBasis(U, N, D).setPosition(px, h, py);
      put(new THREE.BoxGeometry(pw, 0.035, pl), M, frame);
      const gl = new THREE.BoxGeometry(pw - 0.05, 0.02, pl - 0.05); gl.translate(0, 0.012, 0); put(gl, M, glass);
      const across = pl >= pw;   // セルの区切りは長い辺を3つに
      for (const t of [-1 / 3, 1 / 3]) { const ln = across ? new THREE.BoxGeometry(pw - 0.06, 0.004, 0.012) : new THREE.BoxGeometry(0.012, 0.004, pl - 0.06); ln.translate(across ? 0 : t * (pw - 0.05), 0.024, across ? t * (pl - 0.05) : 0); put(ln, M, line); }
      if (!legs) return;
      const ux = -dy, uy = dx, cosT = 1 / Math.sqrt(1 + tl * tl);
      for (const k of [-0.42, 0.42]) for (const sgn of [-1, 1]) {   // 4本の脚：パネルの裏から足もとへ
        const qx = px + dx * k * pl * cosT + ux * sgn * pw * 0.4, qy = py + dy * k * pl * cosT + uy * sgn * pw * 0.4, top = h - k * pl * tl * cosT - 0.02, g0 = legs(qx, qy);
        if (top - g0 > 0.03) box(frame, qx, qy, (top + g0) / 2, 0.04, 0.04, top - g0);
      }
    };
    // 並べ方は計算の側（world.pvLayout）と同じ：どの面に何枚か、縦置きか横置きか
    const layout = pvLayout(hs, opt.lat ?? 6); let left = layout.filter(q => q.ground).reduce((a, q) => a + q.n, 0);
    for (const q of layout) {
      if (q.ground) continue;
      const { dx, dy, L } = q, ux = -dy, uy = dx, cs = [[X0, Y0], [X1, Y1], [X0, Y1], [X1, Y0]];
      const us = cs.map(([a, b]) => a * ux + b * uy), ws = cs.map(([a, b]) => a * dx + b * dy), mg = flat ? 0.2 : 0.3;
      const uMin = Math.min(...us) + mg, uMax = Math.max(...us) - mg, wMin = (shape === 'gable' ? ridge * (dx + dy) : Math.min(...ws)) + 0.25, wMax = Math.max(...ws) - mg;
      const tl = flat ? 0.22 : p, m = q.n, rUsed = Math.ceil(m / L.cols), w0 = (wMin + wMax) / 2 - (rUsed * L.step - L.rg) / 2;
      for (let r = 0; r < rUsed; r++) {
        const inRow = Math.min(L.cols, m - r * L.cols), u0 = (uMin + uMax) / 2 - (inRow * (L.pw + GAP) - GAP) / 2;
        for (let c = 0; c < inRow; c++) {
          const u = u0 + c * (L.pw + GAP) + L.pw / 2, w2 = w0 + r * L.step + L.pl / 2, px = u * ux + w2 * dx, py = u * uy + w2 * dy;
          if (![[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a1, b1]) => inRoof(px + (ux * a1 * L.pw / 2 + dx * b1 * L.pl / 2) * 1.1, py + (uy * a1 * L.pw / 2 + dy * b1 * L.pl / 2) * 1.1, 0))) continue;   // L字の家の欠けた所
          if (flat) panel(px, py, RZ(px, py) + 0.3, dx, dy, tl, L.pw, L.pl, (qx, qy) => RZ(qx, qy));
          else panel(px, py, RZ(px, py) + lift, dx, dy, p, L.pw, L.pl, null);
        }
      }
    }
    // 屋根に乗りきらない分は、赤道側の地面に架台で並べる（傾けて、列は影がかからないようあける）
    if (left > 0) {
      const [ex, ey] = eq, ux = -ey, uy = ex, tl = 0.55, base = ey > 0 ? Y1 + 1.0 : Y0 - 1.0, cx0 = (bx.X0 + bx.X1) / 2, perRow = Math.max(3, Math.round((bx.X1 - bx.X0 + 2) / (PW + GAP)));
      for (let r = 0, k = 0; left > 0 && r < 8; r++) for (let c = 0; c < perRow && left > 0; c++, k++) {
        const u = (c - (perRow - 1) / 2) * (PW + GAP), w2 = r * (PL + 1.3) + PL / 2, px = cx0 + u * ux + ex * 0 + 0, py = base + ey * w2 + uy * u * 0;
        const qx = cx0 + u, qy = base + ey * w2; if (opt.free && !opt.free(Math.floor(qx), Math.floor(qy))) continue;
        panel(qx, qy, at(qx, qy) + 0.75, ex, ey, tl, PW, PL, (x2, y2) => at(x2, y2)); left--;
      }
    }
  }
  // 計算の側と同じ決まり：雨が落ちる軒の家のマスから1マス以内、入口が軒より低いタンクに、この屋根の雨が入る
  function gutters(X0, X1, Y0, Y1) {
    const gm = matte({ color: '#8E918A', vary: 0.05, freq: 3, rough: 0.55 }), o = 0.08, rr = 0.06;
    const pipe = (a, b, r) => { const d = b.clone().sub(a), L = d.length(); if (L < 0.02) return; const g = new THREE.CylinderGeometry(r, r, L, 10); g.translate(0, L / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); add(gm, g);
      const j = new THREE.SphereGeometry(r * 1.15, 10, 8); j.translate(b.x, b.y, b.z); add(gm, j); };   // 継ぎ目は丸く
    const V = (x, y, h) => new THREE.Vector3(x, h, y);
    const sh = hs.roofShape || 'flat', eaveZ = z + H + (sh === 'flat' ? 0 : -(hs.pitch || 0.3) * E) + 0.01;
    const dcells = edges.filter(e => drains.includes(e.dir)).map(e => [e.x, e.y]);
    const direct = (opt.tanks || []).filter(t => t.z < eaveZ && dcells.some(([x, y]) => Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) <= 1));
    // 軒ごとの樋（端から端へ）
    const runs = drains.map(dir => {
      const [nx, ny] = DV[dir], A = dir === 'n' ? [X0, Y0] : dir === 's' ? [X0, Y1] : dir === 'w' ? [X0, Y0] : [X1, Y0], B = dir === 'n' ? [X1, Y0] : dir === 's' ? [X1, Y1] : dir === 'w' ? [X0, Y1] : [X1, Y1];
      const a = V(A[0] + nx * o, A[1] + ny * o, RZ(A[0], A[1]) - 0.17), b = V(B[0] + nx * o, B[1] + ny * o, RZ(B[0], B[1]) - 0.17);
      pipe(a, b, rr); return { dir, a, b, tanks: [] };
    });
    const onRun = (r, px, py) => { const dx = r.b.x - r.a.x, dy = r.b.z - r.a.z, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2), m = 0.15 / L;
      const u = Math.max(m, Math.min(1 - m, ((px - r.a.x) * dx + (py - r.a.z) * dy) / L2)); return new THREE.Vector3().lerpVectors(r.a, r.b, u); };
    const dist2 = (q, px, py) => (q.x - px) ** 2 + (q.z - py) ** 2;
    // タンクごとに、いちばん近い軒の樋からたてどいを下ろす（雨が入るタンクには全部）
    const far = [];
    for (const t of direct) {
      const cx = t.x + 0.5, cy = t.y + 0.5; let best = null;
      for (const r of runs) { const q = onRun(r, cx, cy), d = dist2(q, cx, cy); if (!best || d < best.d) best = { r, q, d }; }
      best.r.tanks.push(t);
      if (Math.sqrt(best.d) > 0.95) { far.push({ t, q: best.q }); continue; }   // 樋から遠いタンク：地面の管で回す（下で）
      const tz = t.z + 1.32, bot = V(best.q.x, best.q.z, tz + 0.22), into = V(cx + (best.q.x - cx) * 0.35, cy + (best.q.z - cy) * 0.35, tz);
      pipe(best.q, bot, 0.04); pipe(bot, into, 0.04);
    }
    // タンクのない軒：角でたてどいを下ろし、地面にそって家のまわりを回り、いちばん近いタンクへ（タンクがなければ地面へ）
    const R = [bx.X0 - 0.28, bx.X1 + 0.28, bx.Y0 - 0.28, bx.Y1 + 0.28];
    const around = (p, q) => {   // 家を囲む四角の上を、短い向きに回る道
      const per = 2 * (R[1] - R[0]) + 2 * (R[3] - R[2]);
      const pos = (x, y) => { const cx2 = Math.max(R[0], Math.min(R[1], x)), cy2 = Math.max(R[2], Math.min(R[3], y));
        const ds = [[Math.abs(cy2 - R[2]), 0], [Math.abs(cx2 - R[1]), 1], [Math.abs(cy2 - R[3]), 2], [Math.abs(cx2 - R[0]), 3]].sort((m1, m2) => m1[0] - m2[0])[0][1];
        const W1 = R[1] - R[0], H1 = R[3] - R[2];
        return ds === 0 ? cx2 - R[0] : ds === 1 ? W1 + (cy2 - R[2]) : ds === 2 ? W1 + H1 + (R[1] - cx2) : 2 * W1 + H1 + (R[3] - cy2); };
      const ptAt = (sv) => { const W1 = R[1] - R[0], H1 = R[3] - R[2]; sv = ((sv % per) + per) % per;
        return sv <= W1 ? [R[0] + sv, R[2]] : sv <= W1 + H1 ? [R[1], R[2] + sv - W1] : sv <= 2 * W1 + H1 ? [R[1] - (sv - W1 - H1), R[3]] : [R[0], R[3] - (sv - 2 * W1 - H1)]; };
      let s0 = pos(p[0], p[1]), s1 = pos(q[0], q[1]), fwd = ((s1 - s0) % per + per) % per; const dirS = fwd <= per / 2 ? 1 : -1, len = dirS > 0 ? fwd : per - fwd;
      const pts = [p, ptAt(s0)]; for (let k = 0.5; k < len; k += 0.5) pts.push(ptAt(s0 + dirS * k)); pts.push(ptAt(s1), q); return pts;
    };
    const groundTo = (top, tgt) => {   // たてどいを地面まで下ろし、家のまわりを地面にそってタンクの足もとへ
      const g0 = at(top.x, top.z) + 0.07; pipe(top, V(top.x, top.z, g0), 0.04); if (!tgt) return;
      const cx = tgt.x + 0.5, cy = tgt.y + 0.5, path = around([top.x, top.z], [cx, cy]);
      const last = path[path.length - 2], dl = Math.hypot(cx - last[0], cy - last[1]) || 1; path[path.length - 1] = [cx + (last[0] - cx) / dl * 0.55, cy + (last[1] - cy) / dl * 0.55];
      let prev = V(top.x, top.z, g0);
      for (const [x2, y2] of path.slice(1)) { const nx2 = V(x2, y2, at(x2, y2) + 0.07); if (nx2.distanceTo(prev) > 0.05) { pipe(prev, nx2, 0.04); prev = nx2; } }
    };
    { const byQ = new Map(); for (const f of far) { const k = `${f.q.x.toFixed(1)},${f.q.z.toFixed(1)}`, d = dist2(f.q, f.t.x + 0.5, f.t.y + 0.5); if (!byQ.has(k) || d < byQ.get(k).d) byQ.set(k, { ...f, d }); }
      for (const f of byQ.values()) groundTo(f.q, f.t); }   // 同じ角から出る管は1本（となりのタンクは足もとの管でつながる）
    for (const r of runs) {
      if (r.tanks.length) continue;
      const tgt = direct.length ? direct.map(t => ({ t, d: Math.min(dist2(r.a, t.x + 0.5, t.y + 0.5), dist2(r.b, t.x + 0.5, t.y + 0.5)) })).sort((m1, m2) => m1.d - m2.d)[0].t : null;
      const top = tgt ? (dist2(r.a, tgt.x + 0.5, tgt.y + 0.5) < dist2(r.b, tgt.x + 0.5, tgt.y + 0.5) ? r.a.clone().lerp(r.b, 0.04) : r.b.clone().lerp(r.a, 0.04)) : r.a.clone().lerp(r.b, 0.04);
      groundTo(top, tgt);
    }
  }
  function tiles(X0, X1, Y0, Y1, p, shape, ridgeAlongX) {
    // 1枚の瓦：半円の殻を 42cm 押し出す（厚み 1.5cm、縁が光る）
    const r = 0.105, sh = new THREE.Shape(); sh.absarc(0, 0, r, 0, Math.PI, false); sh.absarc(0, 0, r - 0.016, Math.PI, 0, true);
    const tg = new THREE.ExtrudeGeometry(sh, { depth: 0.42, bevelEnabled: false, curveSegments: 9 }); tg.translate(0, 0, -0.21);
    const list = [], step = 0.2, rowL = 0.34, ang = Math.atan(p);
    const planes = shape === 'gable' ? (ridgeAlongX ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) : shape === 'mono' ? [DV[hs.roofDir || 's']] : [];
    const ridge = ridgeAlongX ? (bx.Y0 + bx.Y1) / 2 : (bx.X0 + bx.X1) / 2;
    for (const [dx, dy] of planes) {
      const ux = -dy, uy = dx;   // 列の並ぶ向き（流れに直角）
      const uMin = Math.min(X0 * ux + Y0 * uy, X1 * ux + Y1 * uy), uMax = Math.max(X0 * ux + Y0 * uy, X1 * ux + Y1 * uy);
      const wHi = shape === 'gable' ? ridge * (dx + dy) : Math.min(...[[X0, Y0], [X1, Y1]].map(([a, b]) => a * dx + b * dy)), wLo = Math.max(...[[X0, Y0], [X1, Y1]].map(([a, b]) => a * dx + b * dy));
      for (let col = 0, u = uMin + step / 2; u < uMax; col++, u += step / 2) {
        const cap = col % 2 === 1;
        for (let row = 0, w = wHi + (shape === 'gable' ? 0.03 : 0.05) + rowL / 2; w < wLo + 0.06; row++, w += rowL) {
          const px = u * ux + w * dx, py = u * uy + w * dy; if (!inRoof(px, py, 0.04)) continue;
          const s = hash(col * 1.7 + dx, row * 2.3 + dy, 7);
          list.push({ px, py, dx, dy, ux, uy, cap, s, z: RZ(px, py) + (cap ? 0.035 : -0.035), lip: 0.035 + 0.015 * s });
        }
      }
    }
    const mesh = new THREE.InstancedMesh(tg, matte({ color: '#ffffff', vary: 0.06, freq: 3, bump: 0.18, bumpFreq: 7, rough: 0.85 }), list.length + 64);
    const mt = new THREE.Matrix4(), c = new THREE.Color(), base = new THREE.Color(P.tile), moss = new THREE.Color('#6B6A45'), pale = new THREE.Color('#C98B66'), dark = new THREE.Color('#7E4632');
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), Q = new THREE.Matrix4();
    let n = 0;
    for (const t of list) {
      // 瓦の向き：Z＝流れの下る向き（傾きを含む）、Y＝屋根の面の法線、X＝列の向き。下の端を少し持ち上げて段を作る
      Z.set(t.dx, -Math.tan(ang) + (t.cap ? -0.06 : -0.1), t.dy).normalize(); X.set(t.ux, 0, t.uy).normalize(); Y.crossVectors(X, Z).normalize(); X.crossVectors(Y, Z).normalize();
      if (!t.cap) { X.negate(); Y.negate(); }   // 谷の瓦は伏せずに上向きの溝
      Q.makeBasis(X, Y, Z);
      const jit = (hash(t.px, t.py, 8) - 0.5) * 0.012;
      mt.copy(Q).setPosition(t.px + t.ux * jit, t.z, t.py + t.uy * jit); if (!t.cap) mt.scale(new THREE.Vector3(1.04, 0.7, 1));
      mesh.setMatrixAt(n, mt);
      c.copy(base).lerp(t.s > 0.5 ? pale : dark, Math.abs(t.s - 0.5) * 0.6); if (Math.abs(Math.sin(t.px * 12.9898 + t.py * 78.233) * 43758.5453) % 1 < 0.04) c.lerp(moss, 0.3);
      mesh.setColorAt(n++, c);
    }
    // 棟：棟にそって大きめの瓦を伏せる
    if (shape === 'gable') { const a0 = ridgeAlongX ? X0 : Y0, a1 = ridgeAlongX ? X1 : Y1;
      for (let a = a0 + 0.2; a < a1 - 0.1 && n < list.length + 64; a += 0.36) { const px = ridgeAlongX ? a : ridge, py = ridgeAlongX ? ridge : a;
        Z.set(ridgeAlongX ? 1 : 0, -0.04, ridgeAlongX ? 0 : 1).normalize(); Y.set(0, 1, 0); X.crossVectors(Y, Z).normalize(); Y.crossVectors(Z, X).normalize(); Q.makeBasis(X, Y, Z);
        mt.copy(Q).setPosition(px, RZ(px, py) + 0.05, py); mt.scale(new THREE.Vector3(1.35, 1.2, 1)); mesh.setMatrixAt(n, mt); mesh.setColorAt(n++, c.copy(base).multiplyScalar(0.92)); } }
    mesh.count = n; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }

  for (const [mat, geos] of parts) { const m = new THREE.Mesh(mergeGeometries(geos.map(g => { const n = g.index ? g.toNonIndexed() : g; if (n.getAttribute('uv')) n.deleteAttribute('uv'); if (!n.getAttribute('normal')) n.computeVertexNormals(); n.clearGroups(); return n; })), mat); m.castShadow = m.receiveShadow = true; group.add(m); }
  return group;
}
