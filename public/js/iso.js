/* 斜め上から見下ろす3D（アイソメトリック）。カメラは固定。回転ボタンを押したときだけ短くなめらかに回る */
import { BLOCKS, N, h, at, WALLS, ROOFS, FLOORS, OPENINGS, FURN, FDIR, HOUSE_H, houseOuterEdges, furnCells } from './world.js';

const SIDE = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // +x, +y, -x, -y
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(Math.min(255, r * f)); g = Math.round(Math.min(255, g * f)); b = Math.round(Math.min(255, b * f));
  return `rgb(${r},${g},${b})`;
}
/* 太陽の向き（世界の座標：x＝東、y＝南、z＝上）。緯度・月・時刻から */
export function sunVector(lat, month, hour) {
  const doy = (month - 0.5) * 30.44, dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + doy) / 365);
  const phi = lat * Math.PI / 180, H = (hour - 12) * 15 * Math.PI / 180;
  const E = -Math.cos(dec) * Math.sin(H), Nn = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi), U = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(H) * Math.cos(phi);
  let v = [E, -Nn, Math.max(0.12, U)]; const l = Math.hypot(...v); v = v.map(c => c / l);
  return { dir: v, elev: Math.asin(Math.max(-1, Math.min(1, U))) * 180 / Math.PI, az: (Math.atan2(E, Nn) * 180 / Math.PI + 360) % 360 };
}
export const dirName = (az) => ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(az / 45) % 8];
const hex3 = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const SUNC = [1.0, 0.95, 0.84], SKYC = [0.80, 0.87, 1.0];
/* 日なたと日かげ：lam＝面と日差しの向きの合いぐあい、lit＝影にならない割合、ao＝くぼみの暗さ */
const BOUNCE = [1.0, 0.95, 0.80];   // 地面からの照り返し（側面だけ、少し暖かい色）
function lightRGB(rgb, lam, lit, ao = 1, side = false) {
  const d = Math.max(0, lam) * lit;
  return rgb.map((c, i) => Math.round(Math.min(255, c * ao * (SKYC[i] * 0.72 + SUNC[i] * 0.40 * d + (side ? BOUNCE[i] * 0.09 : 0)))));
}
function lightCol(hex, lam, lit, ao = 1, side = false) { const [r, g, b] = lightRGB(hex3(hex), lam, lit, ao, side); return `rgb(${r},${g},${b})`; }
const hash = (x, y, k = 0) => { let n = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
/* なめらかなむら（4マスごとの格子をなめらかにつなぐ）。マス目が見えないように */
function smooth(x, y, k = 0, S = 4) {
  const gx = x / S, gy = y / S, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, k), b = hash(ix + 1, iy, k), c = hash(ix, iy + 1, k), d = hash(ix + 1, iy + 1, k);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
/* 縁のゆらぎ：点の位置（0.25m刻み）で決まるので、となりのマスと同じ点は同じ高さになる */
const wob = (px, py) => hash(Math.round(px * 4) + 7919, Math.round(py * 4) - 104729, 5) - 0.5;
function grassColor(lv, maxLv, x, y) {   // 低い所は濃い緑、高い所は明るい草色。なめらかなむら
  const t = maxLv ? lv / maxLv : 0.5, a = [128, 170, 92], b = [176, 196, 118], j = (smooth(x, y, 3) - 0.5) * 18 + (hash(x, y) - 0.5) * 3;
  return `#${a.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (b[i] - v) * t + j))).toString(16).padStart(2, '0')).join('')}`;
}
function topColor(lv, lo, hi) {   // 見えている範囲の低い所（緑）→高い所（砂色）
  const t = hi > lo ? (lv - lo) / (hi - lo) : 0.5, a = [176, 200, 150], b = [236, 220, 178];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
function terrainColor(lv, maxLv) {
  const t = maxLv ? lv / maxLv : 0;
  const a = [178, 196, 150], b = [226, 214, 176];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/* 植生の形：林は3m四方に1本の木、やぶは2m四方に1つの茂み。場所と大きさは決まった乱数なので、だれが見ても同じ。
   木の種類：この辺りの山の林は、在来の広葉樹にマツとユーカリの植林がまじる */
const _veg = new WeakMap();
export function vegObjects(world) {
  const vg = world.veg; if (!vg) return [];
  let sig = vg.length; for (let i = 0; i < vg.length; i++) sig = (sig * 31 + vg[i]) | 0;
  const c = _veg.get(world); if (c && c.sig === sig) return c.list;
  const V = (x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? 0 : vg[y * N + x], used = new Set(), out = [];
  const add = (o) => { const k = o.cx + ',' + o.cy; if (used.has(k)) return; used.add(k); out.push(o); };
  for (let by = 0; by < N; by += 3) for (let bx = 0; bx < N; bx += 3) {
    const x = bx + Math.floor(hash(bx, by, 101) * 3), y = by + Math.floor(hash(bx, by, 102) * 3); if (x >= N || y >= N) continue;
    const cl = V(x, y), r1 = hash(x, y, 103), r2 = hash(x, y, 104), r3 = hash(x, y, 105), px = x + 0.3 + r2 * 0.4, py = y + 0.3 + r3 * 0.4;
    if ((cl === 10 || cl === 95) && r1 < 0.86) {
      const k = r2 < 0.25 ? 'pine' : r2 > 0.8 ? 'euca' : 'broad';
      add({ kind: k, cx: x, cy: y, x: px, y: py, h: k === 'pine' ? 6 + r3 * 3 : k === 'euca' ? 7 + r3 * 3 : 4.5 + r3 * 2.5, r: k === 'pine' ? 1.1 + r1 * 0.4 : k === 'euca' ? 1.2 + r1 * 0.5 : 1.5 + r1 * 0.8, s: hash(x, y, 106) });
    } else if (cl === 20 && r1 < 0.22) add({ kind: 'broad', cx: x, cy: y, x: px, y: py, h: 3 + r3 * 1.5, r: 1.0 + r1 * 0.9, s: hash(x, y, 106) });
  }
  for (let by = 0; by < N; by += 2) for (let bx = 0; bx < N; bx += 2) {
    const x = bx + (hash(bx, by, 111) > 0.5 ? 1 : 0), y = by + (hash(bx, by, 112) > 0.5 ? 1 : 0); if (x >= N || y >= N) continue;
    const cl = V(x, y), r1 = hash(x, y, 113), r2 = hash(x, y, 114);
    if (cl === 20 && r1 < 0.72) add({ kind: 'shrub', cx: x, cy: y, x: x + 0.25 + r2 * 0.5, y: y + 0.25 + hash(x, y, 115) * 0.5, h: 0.7 + r2 * 0.8, r: 0.45 + r1 * 0.5, s: r2 });
    else if ((cl === 10 || cl === 95) && r1 < 0.2) add({ kind: 'shrub', cx: x, cy: y, x: x + 0.5, y: y + 0.5, h: 0.5 + r2 * 0.5, r: 0.35 + r2 * 0.3, s: r2 });
  }
  _veg.set(world, { sig, list: out });
  return out;
}
/* 地面の色（植生ごと）。草地は低い所ほど濃い緑 */
function vegRGB(cl, lv, maxLv, x, y) {
  const t = maxLv ? lv / maxLv : 0.5, j = (smooth(x, y, 3) - 0.5) * 18 + (hash(x, y) - 0.5) * 4;
  const grass = [128 + 48 * t + j, 170 + 26 * t + j, 92 + 26 * t + j * 0.6];
  const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
  switch (cl) {
    case 10: case 95: return mix(grass, [98, 92, 56], 0.5).map(v => v + j * 0.3);
    case 20: return mix(grass, [158, 158, 86], 0.3);
    case 40: return [176 + j, 170 + j, 112 + j * 0.5];
    case 50: return [178 + j, 160 + j, 130 + j];
    case 60: return [186 + j, 162 + j, 124 + j];
    case 80: return [118 + j, 128 + j, 106 + j];
    case 90: return mix(grass, [92, 138, 102], 0.5);
    default: return grass;
  }
}
const toHex = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const tint = (hex, k) => toHex(hex3(hex).map(v => v * k));
const VEG_LIP = { 10: '#6F7F48', 95: '#6F7F48', 20: '#879A58', 40: '#A29E68', 50: null, 60: null, 80: null, 90: '#6E9460' };

export function createView(canvas, world, opt = {}) {
  const ctx = canvas.getContext('2d');
  const pick = document.createElement('canvas'), pctx = pick.getContext('2d', { willReadFrequently: true });
  // top：真上から見る / wallMode：'up' できあがり・'cut' 手前の壁を下げる・'down' 壁を全部下げる / house：描く家（設計中は下書き）/ base：いま建っている家
  const v = { world, top: false, wallMode: 'up', house: null, base: null, rect: null, ghostEdge: null, furnGhost: null, selFurn: -1, cx: opt.cx ?? 25, cy: opt.cy ?? 25, R: opt.R ?? 8, angle: 0, rot: 0, zoom: 1, hover: null, ghost: null, faces: [], dpr: Math.min(2, window.devicePixelRatio || 1), maxLv: Math.max(...world.H), lat: opt.lat ?? 35, month: opt.month ?? 3, hour: 10, sun: null };
  v.setSun = (lat, month, hour) => { v.lat = lat ?? v.lat; v.month = month ?? v.month; v.hour = hour ?? v.hour; v.sun = sunVector(v.lat, v.month, v.hour); };
  v.setSun();
  // 影：高さの地図（地面・置いたもの・家の、見えている高さ）に沿って、日差しの逆向きにたどる
  let occ = null, occX0 = 0, occY0 = 0, occW = 0, occMax = 0;
  function buildOcc(x0, x1, y0, y1, hs) {
    const M = 8; occX0 = Math.max(0, x0 - M); occY0 = Math.max(0, y0 - M); const xe = Math.min(N - 1, x1 + M), ye = Math.min(N - 1, y1 + M);
    occW = xe - occX0 + 1; const occH = ye - occY0 + 1; occ = new Float32Array(occW * occH); occMax = 0;
    for (let y = occY0; y <= ye; y++) for (let x = occX0; x <= xe; x++) occ[(y - occY0) * occW + (x - occX0)] = h(world, x, y);
    const up = (x, y, z) => { if (x < occX0 || y < occY0 || x > xe || y > ye) return; const i = (y - occY0) * occW + (x - occX0); if (z > occ[i]) occ[i] = z; };
    for (const k in world.blocks) { const [x, y, z] = k.split(',').map(Number), d = BLOCKS[world.blocks[k].t]; if (d.overlay || d.pit) continue; up(x, y, z + (d.kind === 'roof' ? 0.35 : d.kind === 'pv' ? 0.12 : d.kind === 'tree' ? 2.2 : 1)); }
    if (hs) { const top = v.wallMode === 'up' && !v.top ? HOUSE_H + 0.2 : 0.45; for (const k in hs.cells) { const [x, y] = k.split(',').map(Number); up(x, y, hs.z + top); } }
    // 木と茂み：葉の広がりのマスを、その高さまでふさぐ（林の下は日かげになる）
    for (const t of vegObjects(world)) {
      if (hs && hs.cells[`${t.cx},${t.cy}`]) continue;
      const top = h(world, t.cx, t.cy) + t.h, rr = t.kind === 'shrub' ? 0.5 : t.r * 0.85;
      for (let yy = Math.floor(t.y - rr); yy <= Math.floor(t.y + rr); yy++) for (let xx = Math.floor(t.x - rr); xx <= Math.floor(t.x + rr); xx++) if (Math.hypot(xx + 0.5 - t.x, yy + 0.5 - t.y) <= rr + 0.2) up(xx, yy, top);
    }
    for (let i = 0; i < occ.length; i++) occMax = Math.max(occMax, occ[i]);
  }
  function litAt(px, py, pz) {
    const [sx, sy, sz] = v.sun.dir; if (sz > 0.985) return 1;
    const step = 0.3, k = step / Math.max(0.05, Math.hypot(sx, sy));
    let x = px, y = py, z = pz; const cx0 = Math.floor(px), cy0 = Math.floor(py);
    for (let i = 0; i < 80; i++) {
      x += sx * k; y += sy * k; z += sz * k; if (z > occMax + 0.01) return 1;
      const fx = Math.floor(x), fy = Math.floor(y); if (fx === cx0 && fy === cy0) continue;   // 出発したマスは数えない
      const ix = fx - occX0, iy = fy - occY0; if (ix < 0 || iy < 0 || ix >= occW || iy * occW >= occ.length) return 1;
      if (occ[iy * occW + ix] > z + 0.02) return 0;
    }
    return 1;
  }
  function size() { const r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * v.dpr); canvas.height = Math.round(r.height * v.dpr); pick.width = canvas.width; pick.height = canvas.height; }
  function geom() {
    const W = canvas.width, H = canvas.height;
    if (v.top) { const s = Math.min(W, H) / (v.R * 2 + 1.5) * v.zoom; return { s, ox: W / 2, oy: H / 2 }; }
    const tw = Math.min(W / (v.R * 2.6), H / (v.R * 1.9)) * v.zoom;
    return { tw, th: tw / 2, bh: tw * 0.55, ox: W / 2, oy: H / 2 + tw * 1.2 };
  }
  function project(x, y, z, g) {
    const a = v.angle * Math.PI / 180, dx = x - v.cx - (v.top ? 0.5 : 0), dy = y - v.cy - (v.top ? 0.5 : 0);
    const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
    if (v.top) return [g.ox + rx * g.s, g.oy + ry * g.s, z];
    const zc = z - (world.H[v.cy * N + v.cx] || 0);
    return [g.ox + (rx - ry) * g.tw / 2, g.oy + (rx + ry) * g.th / 2 - zc * g.bh, rx + ry];
  }
  /* 1つの直方体を描く（x,y は左下の角、z は下の高さ、ht は高さ） */
  function box(list, x, y, z, ht, color, meta, alpha = 1, inset = 0) { rbox(list, x + inset, y + inset, x + 1 - inset, y + 1 - inset, z, ht, color, meta, alpha); }
  function rbox(list, x0, y0, x1, y1, z, ht, color, meta, alpha = 1) {
    const g = geom(), L = meta && meta.type !== 'ghost' && occ;
    const S = v.sun.dir;
    // 上の面：地面はなだらかにならした傾き（傾斜）で、日差しとの合いぐあいを決める
    const topLam = meta?.slope ? (meta.slope[0] * S[0] + meta.slope[1] * S[1] + meta.slope[2] * S[2]) : S[2];
    const topLit = !L ? 1 : meta.type === 'terrain' ? (litAt(x0 + 0.27, y0 + 0.27, z + ht + 0.01) + litAt(x0 + 0.73, y0 + 0.27, z + ht + 0.01) + litAt(x0 + 0.27, y0 + 0.73, z + ht + 0.01) + litAt(x0 + 0.73, y0 + 0.73, z + ht + 0.01)) / 4 : litAt((x0 + x1) / 2, (y0 + y1) / 2, z + ht + 0.01);
    const topFill = L ? lightCol(color, topLam, topLit, meta.ao ?? 1) : shade(color, 1.0);
    const a = v.angle * Math.PI / 180;
    const x = (x0 + x1) / 2 - 0.5, y = (y0 + y1) / 2 - 0.5;
    const P = (px, py, pz) => project(px, py, pz, g);
    const c = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
    const t = [P(x0, y0, z + ht), P(x1, y0, z + ht), P(x1, y1, z + ht), P(x0, y1, z + ht)];
    if (v.top) {   // 真上から：上の面だけ。高いものほど後に描く
      list.push({ depth: (z + ht) * 10 + (meta?.type === 'wall' ? 0.5 : 0) + (meta?.dbias || 0) * 0.1, draw: (cx, pc) => { poly(cx, t, pc ? pc(4) : topFill, alpha); if (!pc && meta?.decor) meta.decor(cx, t, g); }, meta });
      return;
    }
    const depth = P(x + 0.5, y + 0.5, z)[2];
    // 見える側面：回転後の法線が手前（+,+）を向く面
    const sides = [];
    for (let i = 0; i < 4; i++) {
      const [nx, ny] = SIDE[i];
      const rx = nx * Math.cos(a) - ny * Math.sin(a), ry = nx * Math.sin(a) + ny * Math.cos(a);
      if (rx + ry > 0.01) {
        const quad = i === 0 ? [1, 2] : i === 1 ? [2, 3] : i === 2 ? [3, 0] : [0, 1];
        let fill;
        if (L) {   // 側面：世界の向き（東西南北）で日差しを受ける。影は面の中ほどから調べる
          const lam = nx * S[0] + ny * S[1], mx = nx > 0 ? x1 + 0.03 : nx < 0 ? x0 - 0.03 : (x0 + x1) / 2, my = ny > 0 ? y1 + 0.03 : ny < 0 ? y0 - 0.03 : (y0 + y1) / 2;
          const lit = lam > 0 ? litAt(mx, my, z + Math.min(ht, 3) * 0.5) : 0;
          fill = lightCol(meta.side || color, lam, lit, 0.94, true);
        } else fill = shade(color, 0.72 + 0.12 * (rx - ry > 0 ? 1 : 0));
        sides.push({ pts: [c[quad[0]], c[quad[1]], t[quad[1]], t[quad[0]]], fill, face: i, q: quad });
      }
    }
    list.push({ depth: depth + z * 0.001 + ht * 0.0005 + (meta?.dbias || 0), draw: (cx, pc) => {
      for (const sd of sides) {
        poly(cx, sd.pts, pc ? pc(sd.face) : sd.fill, alpha);
        if (!pc && meta?.sideDecor) meta.sideDecor(cx, sd.pts, sd.face);
        if (!pc && meta?.lip) {   // 地面の側面：上に草のふち、1mごとに地層の線
          const [qa, qb] = sd.q, Pa = (zz) => P(qa === 0 || qa === 3 ? x0 : x1, qa === 0 || qa === 1 ? y0 : y1, zz), Pb = (zz) => P(qb === 0 || qb === 3 ? x0 : x1, qb === 0 || qb === 1 ? y0 : y1, zz);
          cx.globalAlpha = alpha; cx.fillStyle = meta.lip; cx.beginPath(); const A = Pa(z + ht), B = Pb(z + ht), C = Pb(z + ht - 0.16), D = Pa(z + ht - 0.16); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]); cx.lineTo(C[0], C[1]); cx.lineTo(D[0], D[1]); cx.closePath(); cx.fill();
          cx.strokeStyle = 'rgba(70,45,25,.16)'; cx.lineWidth = 1; for (let k = 1; k < ht; k++) { const E1 = Pa(z + ht - k), E2 = Pb(z + ht - k); cx.beginPath(); cx.moveTo(E1[0], E1[1]); cx.lineTo(E2[0], E2[1]); cx.stroke(); }
          cx.globalAlpha = 1;
        }
      }
      poly(cx, t, pc ? pc(4) : topFill, alpha);
      if (!pc && meta?.decor) meta.decor(cx, t, g);
    }, meta });
  }
  /* 地面の柱：上の面の縁は、下が見えている辺だけ少しゆらがせ、出っぱった角は丸く落とす */
  function terrainBox(list, x, y, z, ht, color, meta, open) {
    const g = geom(), P = (px, py, pz) => project(px, py, pz, g), top = z + ht, S = v.sun.dir;
    const C = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];        // 北西・北東・南東・南西の角
    const E = [[0, 1, 3], [1, 2, 0], [2, 3, 1], [3, 0, 2]];            // 辺（角a→角b、その辺の向き：0北 1東 2南 3西）
    const conv = C.map((_, i) => open[i] && open[(i + 3) % 4]);         // 角 i は、辺 i-1 と辺 i が両方見えていたら出っぱり
    const cz = (i) => top + wob(C[i][0], C[i][1]) * 0.05 - (conv[i] ? 0.11 : 0);
    const edgePts = (ei) => {
      const [a, b] = E[ei], pts = [];
      if (!open[ei]) return [[C[a][0], C[a][1], cz(a)], [C[b][0], C[b][1], cz(b)]];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4, px = C[a][0] + (C[b][0] - C[a][0]) * t, py = C[a][1] + (C[b][1] - C[a][1]) * t;
        let zz = i === 0 ? cz(a) : i === 4 ? cz(b) : top + wob(px, py) * 0.07;
        if (i === 1 && conv[a]) zz -= 0.04; if (i === 3 && conv[b]) zz -= 0.04;
        pts.push([px, py, zz]);
      }
      return pts;
    };
    const edges = [0, 1, 2, 3].map(edgePts);
    const topPoly = edges.flatMap(e => e.slice(0, -1)).map(([px, py, pz]) => P(px, py, pz));
    // 明るさ（rbox と同じ考え方）
    const lam = meta.slope[0] * S[0] + meta.slope[1] * S[1] + meta.slope[2] * S[2];
    // 影の境目をなめらかに：角（となりと共有）で日なたかを調べ、強く変わる向きにグラデーション
    const Lc = occ ? C.map(([px, py]) => (litAt(px + 0.001, py + 0.001, top + 0.02) + litAt(px - 0.001, py - 0.001, top + 0.02)) / 2) : [1, 1, 1, 1];
    const lit = (Lc[0] + Lc[1] + Lc[2] + Lc[3]) / 4;
    let topFill = lightCol(color, lam, lit, meta.ao ?? 1);
    const ddx = (Lc[1] + Lc[2]) - (Lc[0] + Lc[3]), ddy = (Lc[2] + Lc[3]) - (Lc[0] + Lc[1]);
    if (meta.corners) {   // 角ごとの色（となりのマスと共有）を対角にグラデーション：マス目の明るさの段差を消す
      const cc = meta.corners.map(([rgb, lm, ao2], i) => lightRGB(rgb, lm, Lc[i], ao2)), sum = (c) => c[0] + c[1] + c[2];
      const [ia, ib] = Math.abs(sum(cc[0]) - sum(cc[2])) >= Math.abs(sum(cc[1]) - sum(cc[3])) ? [0, 2] : [1, 3];
      const A = P(C[ia][0], C[ia][1], top), B = P(C[ib][0], C[ib][1], top), mid = [0, 1, 2].map(k => Math.round((cc[0][k] + cc[1][k] + cc[2][k] + cc[3][k]) / 4)), rs = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
      const gr = ctx.createLinearGradient(A[0], A[1], B[0], B[1]); gr.addColorStop(0, rs(cc[ia])); gr.addColorStop(0.5, rs(mid)); gr.addColorStop(1, rs(cc[ib]));
      topFill = gr;
    } else if (Math.abs(ddx) > 0.2 || Math.abs(ddy) > 0.2) {
      const alongX = Math.abs(ddx) >= Math.abs(ddy);
      const A = alongX ? P(x, y + 0.5, top) : P(x + 0.5, y, top), B = alongX ? P(x + 1, y + 0.5, top) : P(x + 0.5, y + 1, top);
      const la = alongX ? (Lc[0] + Lc[3]) / 2 : (Lc[0] + Lc[1]) / 2, lb = alongX ? (Lc[1] + Lc[2]) / 2 : (Lc[2] + Lc[3]) / 2;
      const gr = ctx.createLinearGradient(A[0], A[1], B[0], B[1]); gr.addColorStop(0, lightCol(color, lam, la, meta.ao ?? 1)); gr.addColorStop(1, lightCol(color, lam, lb, meta.ao ?? 1));
      topFill = gr;
    }
    // 見える側面：辺の向き（北東南西）→ 世界の法線
    const NRM = [[0, -1], [1, 0], [0, 1], [-1, 0]], a = v.angle * Math.PI / 180, sides = [];
    for (let ei = 0; ei < 4; ei++) {
      const [nx, ny] = NRM[ei], rx = nx * Math.cos(a) - ny * Math.sin(a), ry = nx * Math.sin(a) + ny * Math.cos(a);
      if (rx + ry <= 0.01) continue;
      const [ia, ib] = E[ei], ed = edges[ei];
      const pts = [P(C[ia][0], C[ia][1], z), P(C[ib][0], C[ib][1], z), ...ed.slice().reverse().map(([px, py, pz]) => P(px, py, pz))];
      const sl = nx * S[0] + ny * S[1], mx = x + 0.5 + nx * 0.53, my = y + 0.5 + ny * 0.53;
      const sLit = sl > 0 && occ ? litAt(mx, my, top - Math.min(ht, 3) * 0.5) : sl > 0 ? 1 : 0;
      // 内側の1段の段差は草の土手、敷地の切り口と高い崖・掘った所は土
      const bank = meta.lip && open[ei] && meta.drop && meta.drop[ei] === 1;
      const fill = lightCol(bank ? meta.bank : meta.side, sl, sLit, bank ? 0.9 : 0.94, true);
      // 草のふち：厚みも少しゆらす
      const lip = open[ei] && meta.lip ? [...ed.map(([px, py, pz]) => P(px, py, pz)), ...ed.slice().reverse().map(([px, py, pz]) => P(px, py, pz - 0.1 - (wob(px + 0.13, py - 0.07) + 0.5) * 0.12))] : null;
      const lipFill = lightCol(color, (Math.max(0, sl) + lam) / 2, (sLit + lit) / 2, 0.93, true);
      sides.push({ pts, fill, face: ei === 0 ? 3 : ei === 1 ? 0 : ei === 2 ? 1 : 2, lip, lipFill });
    }
    const depth = P(x + 0.5, y + 0.5, z)[2] + z * 0.001 + ht * 0.0005;
    list.push({ depth, draw: (cx, pc) => {
      for (const sd of sides) {
        poly(cx, sd.pts, pc ? pc(sd.face) : sd.fill, 1);
        if (!pc && sd.lip) poly(cx, sd.lip, sd.lipFill, 1);
      }
      poly(cx, topPoly, pc ? pc(4) : topFill, 1);
      if (!pc && meta.decor) meta.decor(cx, C.map((c, i) => P(c[0], c[1], cz(i))), g, { lam, lit });
    }, meta });
    if (v.hoverCell) {   // カーソルのまわりだけマス目を見せる
      const d = Math.hypot(v.hoverCell[0] - x, v.hoverCell[1] - y);
      if (d < 2.6) list.push({ depth: depth + 1e-6, draw: (cx, pc) => { if (pc) return; cx.globalAlpha = Math.max(0, 1 - d / 2.6) * (d < 0.5 ? 0.9 : 0.45); cx.strokeStyle = d < 0.5 ? '#FFFFFF' : 'rgba(255,255,255,.9)'; cx.lineWidth = (d < 0.5 ? 2 : 1) * v.dpr; cx.beginPath(); cx.moveTo(topPoly[0][0], topPoly[0][1]); for (const q of topPoly.slice(1)) cx.lineTo(q[0], q[1]); cx.closePath(); cx.stroke(); cx.globalAlpha = 1; } });
    }
  }
  function poly(cx, pts, fill, alpha) {
    cx.globalAlpha = alpha; cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath(); cx.fillStyle = fill; cx.fill();
    if (alpha === 1) { cx.strokeStyle = fill; cx.lineWidth = 1.1; cx.lineJoin = 'round'; cx.stroke(); }   // 線は見せない（となりの面とのすき間だけ埋める）
    cx.globalAlpha = 1;
  }
  function draw() {
    const list = [];
    const x0 = Math.max(0, v.cx - v.R), x1 = Math.min(N - 1, v.cx + v.R), y0 = Math.max(0, v.cy - v.R), y1 = Math.min(N - 1, v.cy + v.R);
    const floorLv = Math.max(0, (world.H[v.cy * N + v.cx] || 0) - 4);
    let lo = 1e9, hi = -1e9; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const g = h(world, x, y); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    const hsNow = v.house || world.house;
    buildOcc(x0, x1, y0, y1, hsNow);
    const H = (x, y) => { const g = h(world, x, y); return g > -99 ? g : h(world, Math.max(0, Math.min(N - 1, x)), Math.max(0, Math.min(N - 1, y))); };
    // 植生：家の床の下は草地あつかい。地面の色はとなりと少しまぜて、10m の境目をぼかす
    const vegAt = (x, y) => { const xx = Math.max(0, Math.min(N - 1, x)), yy = Math.max(0, Math.min(N - 1, y)); if (!world.veg || (hsNow && hsNow.cells[`${xx},${yy}`])) return 30; return world.veg[yy * N + xx]; };
    const rgbAt = (x, y) => vegRGB(vegAt(x, y), H(x, y), v.maxLv, x, y);
    const groundCol = (x, y) => { const a = rgbAt(x, y).map(c => c * 4); for (const [dx, dy] of SIDE) { const b = rgbAt(x + dx, y + dy); for (let i = 0; i < 3; i++) a[i] += b[i]; } return toHex(a.map(c => c / 8)); };
    // マスごとの下地：傾き（まわり5x5の段の平均の差）、日差しとの合いぐあい、くぼみ、色
    const S0 = v.sun.dir, infoMap = new Map();
    const info = (x, y) => {
      const k = x * 1000 + y; let r = infoMap.get(k); if (r) return r;
      const xx = Math.max(0, Math.min(N - 1, x)), yy = Math.max(0, Math.min(N - 1, y)), g = H(xx, yy);
      let gx = 0, gy = 0; for (let q = -2; q <= 2; q++) { gx += H(xx + 2, yy + q) - H(xx - 2, yy + q); gy += H(xx + q, yy + 2) - H(xx + q, yy - 2); }
      gx /= 20; gy /= 20; const nl = Math.hypot(gx, gy, 1), slope = [-gx / nl, -gy / nl, 1 / nl];
      let ao = 1; for (const [dx, dy] of SIDE) if (H(xx + dx, yy + dy) > g) ao -= 0.06;
      const dug = world.H0[yy * N + xx] - g > 0, col = dug ? '#9C7B57' : groundCol(xx, yy);
      r = { g, slope, ao, col, rgb: hex3(col), lam: slope[0] * S0[0] + slope[1] * S0[1] + slope[2] * S0[2] }; infoMap.set(k, r); return r;
    };
    const CORN = [[[-1, -1], [0, -1], [-1, 0], [0, 0]], [[0, -1], [1, -1], [0, 0], [1, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[-1, 0], [0, 0], [-1, 1], [0, 1]]];
    const corners = (x, y) => { const me = info(x, y); return CORN.map(cs => { let n = 0, rgb = [0, 0, 0], lam = 0, ao = 0; for (const [dx, dy] of cs) { const o = info(x + dx, y + dy); if (o.g !== me.g) continue; n++; rgb = rgb.map((c, i) => c + o.rgb[i]); lam += o.lam; ao += o.ao; } return [rgb.map(c => c / n), lam / n, ao / n]; }); };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const g = h(world, x, y), dug = world.H0[y * N + x] - g;
      const { slope, ao } = info(x, y);
      const cl = vegAt(x, y), col = info(x, y).col;
      const lip = dug > 0 ? null : cl in VEG_LIP ? VEG_LIP[cl] : 'rgb(118,158,86)';
      const meta = { type: 'terrain', x, y, z: g - 1, slope, ao, side: dug > 0 ? '#A8835C' : '#C29A6E', lip, decor: dug > 0 || v.top ? null : groundDecor(cl, x, y, col) };
      if (v.top) { box(list, x, y, floorLv, g - floorLv, col, meta); if (v.hoverCell && Math.hypot(v.hoverCell[0] - x, v.hoverCell[1] - y) < 0.5) rbox(list, x + 0.03, y + 0.03, x + 0.97, y + 0.97, g, 0.01, '#FFFFFF', { type: 'ghost' }, 0.35); }
      else {
        // 下が見えている辺（となりが低い・描く範囲の外）：0北 1東 2南 3西
        const open = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < x0 || nx > x1 || ny < y0 || ny > y1 || h(world, nx, ny) < g; });
        meta.drop = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < x0 || nx > x1 || ny < y0 || ny > y1 ? 99 : g - h(world, nx, ny); });
        meta.bank = '#' + hex3(col).map(c => Math.round(c * 0.86).toString(16).padStart(2, '0')).join('');
        meta.corners = corners(x, y);
        terrainBox(list, x, y, floorLv, g - floorLv, col, meta, open);
      }
    }
    if (v.top) {   // 真上から：段の境目に等高線、5mごとに太く
      const gg = geom();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const g = h(world, x, y);
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const nx = x + dx, ny = y + dy; if (nx > x1 || ny > y1) continue;
          const g2 = h(world, nx, ny); if (g2 === g) continue;
          const top = Math.max(g, g2), idx5 = (top + (world.base || 0)) % 5 === 0;
          const pA = dx ? project(nx, y, top, gg) : project(x, ny, top, gg), pB = dx ? project(nx, y + 1, top, gg) : project(x + 1, ny, top, gg);
          list.push({ depth: top * 10 + 0.05, draw: (cx, pc) => { if (pc) return; cx.strokeStyle = idx5 ? 'rgba(50,58,40,.85)' : 'rgba(60,70,50,.55)'; cx.lineWidth = (idx5 ? 2.4 : 1.3) * v.dpr; cx.beginPath(); cx.moveTo(pA[0], pA[1]); cx.lineTo(pB[0], pB[1]); cx.stroke(); } });
        }
      }
    }
    if (world.veg) {   // 木と茂み。家やカーソルの手前で見えなくするものは薄く
      const g = geom(), tg = [];
      if (v.hoverCell) { const [hx, hy] = v.hoverCell; tg.push(project(hx + 0.5, hy + 0.5, h(world, hx, hy), g)); }
      if (hsNow) for (const k in hsNow.cells) { const [hx, hy] = k.split(',').map(Number); tg.push(project(hx + 0.5, hy + 0.5, hsNow.z + 1.5, g)); }
      for (const t of vegObjects(world)) {
        if (t.cx < x0 || t.cx > x1 || t.cy < y0 || t.cy > y1 || (hsNow && hsNow.cells[`${t.cx},${t.cy}`])) continue;
        drawVeg(list, t, floorLv, tg);
      }
    }
    for (const k in world.blocks) {
      const [x, y, z] = k.split(',').map(Number);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const b = world.blocks[k]; drawBlock(list, x, y, z, b, BLOCKS[b.t], floorLv);
    }
    const hs = v.house || world.house, base = v.base;
    if (hs) drawHouse(list, hs, base, x0, x1, y0, y1, floorLv);
    if (v.rect) {
      const { xa, xb, ya, yb, ok } = v.rect, z = hs ? hs.z : 0;
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) rbox(list, x + 0.04, y + 0.04, x + 0.96, y + 0.96, Math.max(z, h(world, x, y)) + 0.02, 0.06, v.rect.mode === 'remove' ? '#D9534F' : ok(x, y) ? '#4C7BD9' : '#B9BDB8', { type: 'ghost' }, 0.55);
    }
    if (v.ghost) for (const gh of v.ghost.cells) box(list, gh[0], gh[1], gh[2], gh[3] ?? 1, v.ghost.ok ? '#F0A85A' : '#D9534F', { type: 'ghost' }, 0.5);
    list.sort((p, q) => p.depth - q.depth);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!v.top) { const gr = ctx.createLinearGradient(0, 0, 0, canvas.height); gr.addColorStop(0, '#D6E8F2'); gr.addColorStop(0.6, '#F1F3EC'); gr.addColorStop(1, '#F6F0E2'); ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    for (const it of list) it.draw(ctx);
    // 当たり判定用
    v.faces = [];
    pctx.clearRect(0, 0, pick.width, pick.height);
    for (const it of list) {
      if (!it.meta || it.meta.type === 'ghost' || it.meta.nopick) continue;
      it.draw(pctx, (face) => { const id = v.faces.length + 1; v.faces.push({ ...it.meta, face }); return `#${id.toString(16).padStart(6, '0')}`; });
    }
    // 北の印
    const g = geom(), nP = project(v.cx + 0.5, v.cy - v.R - 0.3, h(world, v.cx, Math.max(0, v.cy - v.R)), g);
    ctx.font = `${13 * v.dpr}px "Noto Sans JP", sans-serif`; ctx.fillStyle = '#1F2A2E'; ctx.fillText('北', nP[0] - 6 * v.dpr, nP[1] - 10 * v.dpr);
    // 太陽の方向の印（地面の中心から、日の来る方へ）
    const S = v.sun.dir, hl = Math.hypot(S[0], S[1]);
    if (hl > 0.05) {
      const c0 = project(v.cx + 0.5, v.cy + 0.5, h(world, v.cx, v.cy), g), c1 = project(v.cx + 0.5 + S[0] / hl, v.cy + 0.5 + S[1] / hl, h(world, v.cx, v.cy), g);
      let dx = c1[0] - c0[0], dy = c1[1] - c0[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const rr = Math.min(canvas.width, canvas.height) * 0.4, sx = canvas.width / 2 + dx * rr, sy = canvas.height / 2 + dy * rr * 0.8;
      ctx.fillStyle = 'rgba(255,196,80,.95)'; ctx.beginPath(); ctx.arc(sx, sy, 9 * v.dpr, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,40,.9)'; ctx.lineWidth = 2 * v.dpr; for (let i = 0; i < 8; i++) { const a2 = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a2) * 12 * v.dpr, sy + Math.sin(a2) * 12 * v.dpr); ctx.lineTo(sx + Math.cos(a2) * 16 * v.dpr, sy + Math.sin(a2) * 16 * v.dpr); ctx.stroke(); }
    }
  }
  /* ---------- 形の部品：球・円柱・接地の影 ---------- */
  const dep = (x, y, z, ht = 1) => { const g = geom(); return v.top ? (z + ht) * 10 : project(x + 0.5, y + 0.5, z, g)[2] + z * 0.001 + ht * 0.0005; };
  function sunScreen() { const g = geom(), S = v.sun.dir, a = project(v.cx, v.cy, 0, g), b = project(v.cx + S[0], v.cy + S[1], S[2], g); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  function sphere(list, wx, wy, wz, r, color, meta, d, alpha = 1, squash = 1) {
    const g = geom(), c = project(wx, wy, wz, g), R = r * (v.top ? g.s : g.tw * 0.72), lit = occ ? litAt(wx, wy, wz + r * 0.9) : 1, sd = sunScreen();
    list.push({ depth: d, meta, draw: (cx, pc) => {
      cx.beginPath(); cx.ellipse(c[0], c[1], R, R * squash, 0, 0, 7);
      if (pc) { cx.fillStyle = pc(4); cx.fill(); return; }
      const gr = cx.createRadialGradient(c[0] + sd[0] * R * 0.45, c[1] + sd[1] * R * 0.45 * squash, R * 0.08, c[0], c[1], R * 1.08);
      gr.addColorStop(0, lightCol(color, 1.0, lit, 1.05)); gr.addColorStop(0.55, lightCol(color, 0.55, lit)); gr.addColorStop(1, lightCol(color, 0.05, lit, 0.8));
      cx.globalAlpha = alpha; cx.fillStyle = gr; cx.fill(); cx.globalAlpha = 1;
    } });
  }
  function cylinder(list, wx, wy, wz, r, ht, color, meta, d, opt = {}) {
    const g = geom(), cb = project(wx, wy, wz, g), ct = project(wx, wy, wz + ht, g);
    const Rx = v.top ? r * g.s : r * g.tw / Math.SQRT2, Ry = v.top ? r * g.s : r * g.th / Math.SQRT2;
    const lit = occ ? litAt(wx, wy, wz + ht + 0.01) : 1, sd = sunScreen(), S = v.sun.dir;
    list.push({ depth: d, meta, draw: (cx, pc) => {
      if (!v.top) {
        cx.beginPath(); cx.moveTo(ct[0] - Rx, ct[1]); cx.lineTo(cb[0] - Rx, cb[1]); cx.ellipse(cb[0], cb[1], Rx, Ry, 0, Math.PI, 0, true); cx.lineTo(ct[0] + Rx, ct[1]); cx.ellipse(ct[0], ct[1], Rx, Ry, 0, 0, Math.PI, true); cx.closePath();
        if (pc) { cx.fillStyle = pc(0); cx.fill(); }
        else {
          const gr = cx.createLinearGradient(cb[0] - Rx, 0, cb[0] + Rx, 0), lt = sd[0] > 0;
          gr.addColorStop(0, lightCol(color, lt ? 0.05 : 0.9, lit, 0.85)); gr.addColorStop(lt ? 0.7 : 0.3, lightCol(color, 0.9, lit)); gr.addColorStop(1, lightCol(color, lt ? 0.9 : 0.05, lit, 0.85));
          cx.fillStyle = gr; cx.fill();
          if (opt.ribs) { cx.strokeStyle = 'rgba(60,70,80,.18)'; cx.lineWidth = 1.2 * v.dpr; for (const f of opt.ribs) { const yy = cb[1] + (ct[1] - cb[1]) * f; cx.beginPath(); cx.ellipse(cb[0], yy, Rx, Ry, 0, 0, Math.PI); cx.stroke(); } }
        }
      }
      cx.beginPath(); cx.ellipse(ct[0], ct[1], Rx, Ry, 0, 0, 7);
      cx.fillStyle = pc ? pc(4) : lightCol(opt.top || color, S[2], lit, 0.95); cx.fill();
      if (!pc && opt.lid) { cx.beginPath(); cx.ellipse(ct[0], ct[1], Rx * 0.45, Ry * 0.45, 0, 0, 7); cx.fillStyle = lightCol(opt.lid, S[2], lit); cx.fill(); }
    } });
  }
  /* 接地の影：物の下にやわらかい影。地面の上面のすぐ後に描く */
  function blob(list, wx, wy, wz, r, strength = 0.28, d) {
    if (v.top) return;
    const g = geom(), c = project(wx, wy, wz, g), Rx = r * g.tw / Math.SQRT2 * 1.1, Ry = r * g.th / Math.SQRT2 * 1.1;
    list.push({ depth: d, draw: (cx, pc) => { if (pc) return; cx.save(); cx.translate(c[0], c[1]); cx.scale(1, Ry / Rx); const gr = cx.createRadialGradient(0, 0, 0, 0, 0, Rx); gr.addColorStop(0, `rgba(30,35,20,${strength})`); gr.addColorStop(1, 'rgba(30,35,20,0)'); cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, Rx, 0, 7); cx.fill(); cx.restore(); } });
  }
  const terrainDepth = (x, y, floorLv) => { const g = geom(), gg = h(world, x, y); return project(x + 0.5, y + 0.5, floorLv, g)[2] + floorLv * 0.001 + (gg - floorLv) * 0.0005; };
  /* 置いたものを形で描く（タンクは円柱、木は丸い葉、畑は土と苗の列…） */
  function drawBlock(list, x, y, z, b, d, floorLv) {
    const meta = { type: 'block', x, y, z, b }, a = b.p ? 0.45 : 1, onGround = terrainDepth(x, y, floorLv) + 1e-5;
    if (d.kind === 'tank') { blob(list, x + 0.5, y + 0.5, z, 0.55, 0.3, onGround); cylinder(list, x + 0.5, y + 0.5, z, 0.42, 0.95, d.color, meta, dep(x, y, z, 1), { ribs: [0.33, 0.66], lid: '#8FA9C2', top: '#DCE9F5' }); return; }
    if (d.kind === 'tree') {
      blob(list, x + 0.5, y + 0.5, z, 0.75, 0.32, onGround);
      rbox(list, x + 0.45, y + 0.45, x + 0.55, y + 0.55, z, 1.2, '#7A5A3A', meta, a);
      const D = dep(x, y, z, 2.2), hh = hash(x, y, 9);
      sphere(list, x + 0.36, y + 0.6, z + 1.25, 0.36, '#4E8F5B', meta, D + 0.0001);
      sphere(list, x + 0.64, y + 0.4, z + 1.35, 0.36, '#57995F', meta, D + 0.0002);
      sphere(list, x + 0.5, y + 0.5, z + 1.7, 0.45, '#5FA066', meta, D + 0.0003);
      if (hh > 0.3) for (let i = 0; i < 4; i++) sphere(list, x + 0.3 + hash(x, y, 30 + i) * 0.4, y + 0.3 + hash(x, y, 40 + i) * 0.4, z + 1.3 + hash(x, y, 50 + i) * 0.5, 0.06, '#E8843A', meta, D + 0.0004 + i * 1e-5);
      return;
    }
    if (d.kind === 'hedge') {
      blob(list, x + 0.5, y + 0.5, z, 0.6, 0.25, onGround);
      rbox(list, x + 0.06, y + 0.06, x + 0.94, y + 0.94, z, 0.45, '#2F6139', meta, a);
      const D = dep(x, y, z, 1);
      [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].forEach(([px, py], i) => sphere(list, x + px, y + py, z + 0.55 + hash(x, y, 60 + i) * 0.12, 0.3, '#3C7445', meta, D + i * 1e-5));
      return;
    }
    if (d.kind === 'heap') { blob(list, x + 0.5, y + 0.5, z, 0.6, 0.3, onGround); sphere(list, x + 0.5, y + 0.5, z + 0.15, 0.48, '#8A6A42', { ...meta }, dep(x, y, z, 0.6), a, 0.72); return; }
    if (d.kind === 'coop') {
      blob(list, x + 0.5, y + 0.5, z, 0.65, 0.28, onGround);
      rbox(list, x + 0.12, y + 0.12, x + 0.88, y + 0.88, z, 0.6, '#E8C98A', { ...meta, sideDecor: (cx, p, face) => { if (face !== 1 && face !== 0) return; const m = (fx, fy) => [p[0][0] + (p[1][0] - p[0][0]) * fx + (p[3][0] - p[0][0]) * fy, p[0][1] + (p[1][1] - p[0][1]) * fx + (p[3][1] - p[0][1]) * fy]; const q = [m(0.4, 0), m(0.6, 0), m(0.6, 0.5), m(0.4, 0.5)]; cx.fillStyle = '#5A4030'; cx.beginPath(); cx.moveTo(q[0][0], q[0][1]); for (const r of q) cx.lineTo(r[0], r[1]); cx.fill(); } }, a);
      rbox(list, x + 0.05, y + 0.05, x + 0.95, y + 0.95, z + 0.6, 0.12, '#B5523B', meta, a);
      rbox(list, x + 0.2, y + 0.2, x + 0.8, y + 0.8, z + 0.72, 0.12, '#A84A35', meta, a);
      return;
    }
    if (d.kind === 'pump') { blob(list, x + 0.5, y + 0.5, z, 0.35, 0.25, onGround); rbox(list, x + 0.3, y + 0.3, x + 0.7, y + 0.7, z, 0.4, d.color, meta, a); cylinder(list, x + 0.5, y + 0.5, z + 0.4, 0.06, 0.35, '#8A9AA6', meta, dep(x, y, z, 0.8)); return; }
    if (d.kind === 'pv') {
      blob(list, x + 0.5, y + 0.5, z, 0.5, 0.22, onGround);
      rbox(list, x + 0.15, y + 0.2, x + 0.22, y + 0.27, z, 0.45, '#8A9AA6', meta, a); rbox(list, x + 0.78, y + 0.2, x + 0.85, y + 0.27, z, 0.45, '#8A9AA6', meta, a);
      rbox(list, x + 0.06, y + 0.12, x + 0.94, y + 0.9, z + 0.45, 0.06, '#30476B', { ...meta, decor: (cx, t) => { cx.strokeStyle = 'rgba(160,185,220,.55)'; cx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; cx.beginPath(); cx.moveTo(t[0][0] + (t[1][0] - t[0][0]) * f, t[0][1] + (t[1][1] - t[0][1]) * f); cx.lineTo(t[3][0] + (t[2][0] - t[3][0]) * f, t[3][1] + (t[2][1] - t[3][1]) * f); cx.stroke(); } for (let i = 1; i < 3; i++) { const f = i / 3; cx.beginPath(); cx.moveTo(t[0][0] + (t[3][0] - t[0][0]) * f, t[0][1] + (t[3][1] - t[0][1]) * f); cx.lineTo(t[1][0] + (t[2][0] - t[1][0]) * f, t[1][1] + (t[2][1] - t[1][1]) * f); cx.stroke(); } } }, a);
      return;
    }
    if (d.kind === 'bed') { rbox(list, x + 0.03, y + 0.03, x + 0.97, y + 0.97, z, 0.14, b.m ? '#A88A5A' : '#6E5034', { ...meta, decor: bedDecor(x, y, b) }, a); return; }
    if (d.kind === 'pond') { rbox(list, x, y, x + 1, y + 1, z, 0.85, '#5B9BD5', { ...meta, decor: waterDecor(x, y) }, 0.82); return; }
    const ht = d.overlay ? 0.14 : d.kind === 'roof' ? 0.35 : 1;
    const inset = d.kind === 'pillar' ? 0.38 : 0;
    box(list, x, y, z, ht, d.color, { ...meta, decor: decorFor(b, d) }, b.p ? 0.45 : 1, inset);
  }
  function bedDecor(x, y, b) {   // 畑：苗の列。石垣は縁の石、温室は白い覆い
    return (cx, t) => {
      const at = (fx, fy) => [t[0][0] + (t[1][0] - t[0][0]) * fx + (t[3][0] - t[0][0]) * fy, t[0][1] + (t[1][1] - t[0][1]) * fx + (t[3][1] - t[0][1]) * fy];
      const u = Math.abs(t[1][0] - t[0][0]) + Math.abs(t[3][0] - t[0][0]); if (u < 10 * v.dpr) return;
      cx.strokeStyle = 'rgba(60,40,25,.35)'; cx.lineWidth = 1; for (const fy of [0.33, 0.66]) { const A = at(0.08, fy), B = at(0.92, fy); cx.beginPath(); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]); cx.stroke(); }
      for (const fy of [0.2, 0.5, 0.8]) for (const fx of [0.2, 0.5, 0.8]) {
        const [px, py] = at(fx + (hash(x, y, fx * 10 + fy) - 0.5) * 0.08, fy), rr = (2.2 + hash(x, y, fy * 7 + fx) * 1.4) * v.dpr;
        cx.fillStyle = '#4F8F45'; cx.beginPath(); cx.arc(px - rr * 0.6, py - rr * 0.3, rr, 0, 7); cx.arc(px + rr * 0.6, py - rr * 0.3, rr, 0, 7); cx.fill();
        cx.fillStyle = '#76B25E'; cx.beginPath(); cx.arc(px, py - rr * 0.9, rr * 0.9, 0, 7); cx.fill();
      }
      if (b.s) { cx.fillStyle = '#9B988E'; for (let i = 0; i < 4; i++) for (const [fx, fy] of [[i / 4 + 0.12, 0.04], [i / 4 + 0.12, 0.96], [0.04, i / 4 + 0.12], [0.96, i / 4 + 0.12]]) { const [px, py] = at(fx, fy); cx.beginPath(); cx.ellipse(px, py, 3.4 * v.dpr, 2.2 * v.dpr, 0, 0, 7); cx.fill(); } }
      if (b.g) { cx.fillStyle = 'rgba(245,248,250,.45)'; cx.strokeStyle = 'rgba(255,255,255,.8)'; cx.lineWidth = 1.2 * v.dpr; const A = at(0, 0.5), B = at(1, 0.5); const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2 - 16 * v.dpr; cx.beginPath(); cx.moveTo(t[0][0], t[0][1]); cx.quadraticCurveTo(mx, my - 6 * v.dpr, t[1][0], t[1][1]); cx.lineTo(t[2][0], t[2][1]); cx.quadraticCurveTo(mx, my + 10 * v.dpr, t[3][0], t[3][1]); cx.closePath(); cx.fill(); cx.stroke(); }
    };
  }
  function waterDecor(x, y) {
    return (cx, t) => {
      const at = (fx, fy) => [t[0][0] + (t[1][0] - t[0][0]) * fx + (t[3][0] - t[0][0]) * fy, t[0][1] + (t[1][1] - t[0][1]) * fx + (t[3][1] - t[0][1]) * fy];
      const A = at(0, 0), B = at(1, 1), gr = cx.createLinearGradient(A[0], A[1], B[0], B[1]); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(30,70,120,.2)');
      cx.fillStyle = gr; cx.beginPath(); cx.moveTo(t[0][0], t[0][1]); for (const p of t) cx.lineTo(p[0], p[1]); cx.closePath(); cx.fill();
      cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = 1.2 * v.dpr; for (let i = 0; i < 2; i++) { const [px, py] = at(0.25 + hash(x, y, 70 + i) * 0.5, 0.25 + hash(x, y, 80 + i) * 0.5); cx.beginPath(); cx.ellipse(px, py, 6 * v.dpr, 2.5 * v.dpr, 0, Math.PI * 1.1, Math.PI * 1.9); cx.stroke(); }
    };
  }
  /* 家：床・壁（窓と扉つき）・屋根。設計中は新しい床を青く、なくなる床を赤く */
  function drawHouse(list, hs, base, x0, x1, y0, y1, floorLv) {
    const z = hs.z, Wm = WALLS[hs.wall], F = FLOORS[hs.floor], R = ROOFS[hs.roof];
    const inView = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    for (const k in hs.cells) {
      const [x, y] = k.split(',').map(Number); if (!inView(x, y)) continue;
      const isNew = base && !base.cells[k];
      rbox(list, x, y, x + 1, y + 1, z, 0.1, F.color, { type: 'floor', x, y, z, decor: floorDecor(hs.floor, x, y) }, 1);
      if (isNew) rbox(list, x + 0.06, y + 0.06, x + 0.94, y + 0.94, z + 0.1, 0.02, '#5B9BF0', { type: 'floor', x, y, z }, 0.5);
    }
    if (base) for (const k in base.cells) {
      if (hs.cells[k]) continue; const [x, y] = k.split(',').map(Number); if (!inView(x, y)) continue;
      rbox(list, x + 0.04, y + 0.04, x + 0.96, y + 0.96, base.z, 0.12, '#D9534F', { type: 'ghost' }, 0.45);
    }
    // 壁：手前の壁を下げるときは、外向きの法線がカメラを向く壁（手前の壁）を低く
    const ang = ((Math.round(v.angle / 90) * 90) % 360 + 360) % 360;
    const FRONT = { 0: ['e', 's'], 90: ['e', 'n'], 180: ['w', 'n'], 270: ['w', 's'] }[ang];
    const T = v.top ? 0.26 : 0.14, LOW = 0.45;
    for (const o of houseOuterEdges(hs)) {
      const [t, r] = o.e.split(':'); const [ex, ey] = r.split(',').map(Number);
      if (!inView(o.x, o.y)) continue;
      const op = hs.open[o.e], O = op ? OPENINGS[op] : null;
      const rect = t === 'h' ? [ex, ey - T / 2, ex + 1, ey + T / 2] : [ex - T / 2, ey, ex + T / 2, ey + 1];
      const meta = { type: 'wall', e: o.e, x: o.x, y: o.y, dir: o.dir, op };
      const full = v.wallMode === 'up' || (v.wallMode === 'cut' && !FRONT.includes(o.dir));
      const changed = base && (!base.cells[`${o.x},${o.y}`] || base.wall !== hs.wall || base.open[o.e] !== op);
      const alpha = 1;
      // 外の地面に、壁ぎわのやわらかい影
      const [ox, oy] = [o.x + (o.dir === 'e' ? 1 : o.dir === 'w' ? -1 : 0), o.y + (o.dir === 's' ? 1 : o.dir === 'n' ? -1 : 0)];
      if (!v.top && !hs.cells[`${ox},${oy}`]) {
        const gz = h(world, ox, oy), g = geom(), W2 = 0.42;
        const q = o.dir === 'n' ? [[ex, ey], [ex + 1, ey], [ex + 1, ey - W2], [ex, ey - W2]] : o.dir === 's' ? [[ex, ey], [ex + 1, ey], [ex + 1, ey + W2], [ex, ey + W2]] : o.dir === 'w' ? [[ex, ey], [ex, ey + 1], [ex - W2, ey + 1], [ex - W2, ey]] : [[ex, ey], [ex, ey + 1], [ex + W2, ey + 1], [ex + W2, ey]];
        const pq = q.map(([px, py]) => project(px, py, gz + 0.01, g));
        list.push({ depth: terrainDepth(ox, oy, floorLv) + 2e-5, draw: (cx, pc) => { if (pc) return; const A = [(pq[0][0] + pq[1][0]) / 2, (pq[0][1] + pq[1][1]) / 2], B = [(pq[2][0] + pq[3][0]) / 2, (pq[2][1] + pq[3][1]) / 2], gr = cx.createLinearGradient(A[0], A[1], B[0], B[1]); gr.addColorStop(0, 'rgba(30,35,20,.30)'); gr.addColorStop(1, 'rgba(30,35,20,0)'); cx.fillStyle = gr; cx.beginPath(); cx.moveTo(pq[0][0], pq[0][1]); for (const p of pq) cx.lineTo(p[0], p[1]); cx.closePath(); cx.fill(); } });
      }
      const seed = (ex * 73 + ey * 151 + (t === 'h' ? 7 : 0)) | 0, tex = (z0, z1) => wallTexture(hs.wall, z0, z1, seed);
      // 基礎：石を積んだ帯。外の地面が低ければ、そこまで下ろす
      if (!v.top) {
        const gz = hs.cells[`${ox},${oy}`] ? z : Math.min(z, h(world, ox, oy)), O2 = T / 2 + 0.06;   // 壁の中心線から外側だけ（家の中には出さない）
        const fr = o.dir === 'n' ? [ex - O2, ey - O2, ex + 1 + O2, ey] : o.dir === 's' ? [ex - O2, ey, ex + 1 + O2, ey + O2] : o.dir === 'w' ? [ex - O2, ey - O2, ex, ey + 1 + O2] : [ex, ey - O2, ex + O2, ey + 1 + O2];
        rbox(list, ...fr, gz - 0.05, z + 0.24 - gz + 0.05, '#A39C90', { type: 'found', nopick: true, sideDecor: stoneDecor(seed) }, 1);
      }
      if (v.top || !full) { rbox(list, ...rect, z, v.top ? HOUSE_H : LOW, O ? O.color : Wm.color, { ...meta, sideDecor: v.top || O ? null : tex(0, LOW) }, alpha); continue; }
      if (op === 'door') {
        rbox(list, ...rect, z, 2.1, O.color, { ...meta, sideDecor: doorDecor }, alpha); rbox(list, ...rect, z + 2.1, HOUSE_H - 2.1, Wm.color, { ...meta, sideDecor: tex(2.1, HOUSE_H) }, alpha);
        // 扉の前の踏み石
        if (!hs.cells[`${ox},${oy}`] && !v.top) { const gz = h(world, ox, oy), c0 = [o.x + 0.5 + (ox - o.x) * 0.72, o.y + 0.5 + (oy - o.y) * 0.72]; rbox(list, c0[0] - 0.3, c0[1] - 0.22 + (o.dir === 'e' || o.dir === 'w' ? -0.08 : 0), c0[0] + 0.3, c0[1] + 0.22, gz, 0.06, '#B7B2A6', { type: 'ghost' }, 1); }
      } else if (op) {
        rbox(list, ...rect, z, 0.9, Wm.color, { ...meta, sideDecor: tex(0, 0.9) }, alpha);
        rbox(list, ...rect, z + 0.9, 1.3, O.color, { ...meta, sideDecor: windowDecor(op) }, 1);
        rbox(list, ...rect, z + 2.2, HOUSE_H - 2.2, Wm.color, { ...meta, sideDecor: tex(2.2, HOUSE_H) }, alpha);
        // 窓台
        const SD = 0.1, sr = t === 'h' ? [ex + 0.12, ey - T / 2 - SD, ex + 0.88, ey + T / 2 + SD] : [ex - T / 2 - SD, ey + 0.12, ex + T / 2 + SD, ey + 0.88];
        rbox(list, ...sr, z + 0.86, 0.05, '#F2EEE4', meta, 1);
      }
      else rbox(list, ...rect, z, HOUSE_H, Wm.color, { ...meta, sideDecor: tex(0, HOUSE_H) }, alpha);
    }
    // 角の柱：となり合う壁の角のすき間をふさぐ見切り材
    const vtx = new Map();
    for (const o of houseOuterEdges(hs)) {
      const [t, r] = o.e.split(':'); const [ex, ey] = r.split(',').map(Number);
      for (const [px, py] of t === 'h' ? [[ex, ey], [ex + 1, ey]] : [[ex, ey], [ex, ey + 1]]) { const k = px + ',' + py, e = vtx.get(k) || { h: 0, v: 0, low: false }; e[t]++; if (!(v.wallMode === 'up' || (v.wallMode === 'cut' && !FRONT.includes(o.dir)))) e.low = true; vtx.set(k, e); }
    }
    const trim = hs.wall === 'board' ? '#8F6B47' : '#F3EEE3';
    for (const [k, e] of vtx) {
      if (!e.h || !e.v) continue; const [px, py] = k.split(',').map(Number); if (px < x0 - 1 || px > x1 + 1 || py < y0 - 1 || py > y1 + 1) continue;
      const P2 = T / 2 + 0.025; rbox(list, px - P2, py - P2, px + P2, py + P2, z, v.top ? HOUSE_H + 0.01 : e.low ? LOW + 0.01 : HOUSE_H, trim, { type: 'trim', nopick: true }, 1);
    }
    // 家具（屋根があるときは見えないので描かない）
    if (v.wallMode !== 'up' || v.top) {
      (hs.furn || []).forEach((f, i) => { if (i === v.selFurn && v.furnGhost) return; drawFurn(list, f, z, { type: 'furn', i, x: f.x, y: f.y }, i === v.selFurn ? 0.6 : 1); });
      if (v.furnGhost) drawFurn(list, v.furnGhost, z, { type: 'ghost' }, 0.55, v.furnGhost.ok ? null : '#D9534F');
    }
    if (v.ghostEdge) {
      const [t, r] = v.ghostEdge.e.split(':'); const [ex, ey] = r.split(',').map(Number), T2 = T + 0.08;
      const rect = t === 'h' ? [ex + 0.05, ey - T2 / 2, ex + 0.95, ey + T2 / 2] : [ex - T2 / 2, ey + 0.05, ex + T2 / 2, ey + 0.95];
      const col = v.ghostEdge.t === 'remove' ? '#D9534F' : OPENINGS[v.ghostEdge.t]?.color || '#F0A85A';
      rbox(list, ...rect, v.ghostEdge.t === 'window' || v.ghostEdge.t === 'window2' ? z + 0.9 : z, v.top ? HOUSE_H + 0.1 : v.ghostEdge.low ? LOW + 0.05 : v.ghostEdge.t === 'door' ? 2.1 : v.ghostEdge.t === 'remove' ? HOUSE_H : 1.3, col, { type: 'ghost' }, 0.7);
    }
    if (v.wallMode === 'up' && !v.top) {
      const cells = Object.keys(hs.cells).map(k => k.split(',').map(Number)).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      for (const [x, y] of cells) { if (!inView(x, y)) continue; rbox(list, x, y, x + 1, y + 1, z + HOUSE_H, 0.2, R.color, { type: 'roof', x, y, decor: roofDecor(hs.roof, x, y) }, 1); }
      for (const o of houseOuterEdges(hs)) {   // 軒：ふだんは少し、庇をつけると深く
        if (!inView(o.x, o.y)) continue;
        const [t, r] = o.e.split(':'); const [ex, ey] = r.split(',').map(Number), E2 = hs.eaves ? 0.5 : 0.16;
        const rect = o.dir === 'n' ? [ex, ey - E2, ex + 1, ey] : o.dir === 's' ? [ex, ey, ex + 1, ey + E2] : o.dir === 'w' ? [ex - E2, ey, ex, ey + 1] : [ex, ey, ex + E2, ey + 1];
        rbox(list, ...rect, z + HOUSE_H + 0.06, 0.14, R.color, { type: 'roof', x: o.x, y: o.y, decor: roofDecor(hs.roof, o.x, o.y) }, 1);
      }
      for (let i = 0; i < Math.min(hs.pv || 0, cells.length); i++) { const [x, y] = cells[i]; rbox(list, x + 0.08, y + 0.08, x + 0.92, y + 0.92, z + HOUSE_H + 0.2, 0.06, '#30476B', { type: 'roof', x, y }, 1); }
    }
  }
  const faceAt = (p, fx, fy) => [p[0][0] + (p[1][0] - p[0][0]) * fx + (p[3][0] - p[0][0]) * fy, p[0][1] + (p[1][1] - p[0][1]) * fx + (p[3][1] - p[0][1]) * fy];   // 面の中の位置（側面なら fx：横、fy：下→上。上面なら fx：x、fy：y）
  const quadOn = (cx, p, a0, b0, a1, b1, fill) => { const q = [faceAt(p, a0, b0), faceAt(p, a1, b0), faceAt(p, a1, b1), faceAt(p, a0, b1)]; cx.fillStyle = fill; cx.beginPath(); cx.moveTo(q[0][0], q[0][1]); for (const r of q) cx.lineTo(r[0], r[1]); cx.closePath(); cx.fill(); };
  const lineOn = (cx, A, B) => { cx.beginPath(); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]); cx.stroke(); };
  const tone = (t, k) => t > 0 ? `rgba(255,244,222,${(t * k).toFixed(3)})` : `rgba(60,36,16,${(-t * k).toFixed(3)})`;
  /* ---------- 木と茂み ---------- */
  function leafBall(list, wx, wy, wz, r, col, lit, d, alpha, seed) {   // 葉のかたまり：ふちを少しでこぼこに、日の側を明るく、葉の粒をのせる
    const g = geom(), c = project(wx, wy, wz, g), R = r * g.tw * 0.72, sd = sunScreen(); seed = Math.floor(seed);
    list.push({ depth: d, draw: (cx, pc) => {
      if (pc) return;
      cx.globalAlpha = alpha; cx.beginPath();
      for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rr = R * (0.88 + hash(seed, i % 16, 7) * 0.18), px = c[0] + Math.cos(a) * rr, py = c[1] + Math.sin(a) * rr; if (i) cx.lineTo(px, py); else cx.moveTo(px, py); }
      cx.closePath();
      const gr = cx.createRadialGradient(c[0] + sd[0] * R * 0.4, c[1] + sd[1] * R * 0.4 - R * 0.2, R * 0.1, c[0], c[1], R * 1.1);
      gr.addColorStop(0, lightCol(col, 1, lit, 1.12)); gr.addColorStop(0.55, lightCol(col, 0.55, lit)); gr.addColorStop(1, lightCol(col, 0.05, lit, 0.72));
      cx.fillStyle = gr; cx.fill();
      const hi = lightCol(col, 1, lit, 1.32), lo = lightCol(col, 0, lit, 0.6);
      for (let i = 0; i < 10; i++) {
        const a = hash(seed, i, 11) * Math.PI * 2, dd = Math.sqrt(hash(seed, i, 12)) * R * 0.78, f = Math.cos(a) * sd[0] + Math.sin(a) * sd[1] - 0.2 * Math.sin(a);
        cx.globalAlpha = alpha * 0.42; cx.fillStyle = f > 0 ? hi : lo; cx.beginPath(); cx.arc(c[0] + Math.cos(a) * dd, c[1] + Math.sin(a) * dd, R * (0.13 + hash(seed, i, 13) * 0.12), 0, 7); cx.fill();
      }
      cx.globalAlpha = 1;
    } });
  }
  function cone(list, wx, wy, wz, r, ht, col, lit, d, alpha) {   // マツの葉の段：先のとがった円すい、下のふちはぎざぎざ
    const g = geom(), cb = project(wx, wy, wz, g), ct = project(wx, wy, wz + ht, g), Rx = r * g.tw / Math.SQRT2, Ry = r * g.th / Math.SQRT2, sd = sunScreen();
    list.push({ depth: d, draw: (cx, pc) => {
      if (pc) return;
      cx.globalAlpha = alpha; cx.beginPath(); cx.moveTo(ct[0], ct[1]);
      for (let i = 0; i <= 12; i++) { const a = Math.PI - i / 12 * Math.PI, k = i % 2 ? 0.82 : 1; cx.lineTo(cb[0] + Math.cos(a) * Rx * k, cb[1] + Math.sin(a) * Ry * k + (i % 2 ? 0 : Ry * 0.35)); }
      cx.closePath();
      const gr = cx.createLinearGradient(cb[0] - Rx, 0, cb[0] + Rx, 0), lt = sd[0] > 0;
      gr.addColorStop(0, lightCol(col, lt ? 0.1 : 1, lit, lt ? 0.78 : 1.1)); gr.addColorStop(0.5, lightCol(col, 0.6, lit)); gr.addColorStop(1, lightCol(col, lt ? 1 : 0.1, lit, lt ? 1.1 : 0.78));
      cx.fillStyle = gr; cx.fill(); cx.globalAlpha = 1;
    } });
  }
  function drawVeg(list, t, floorLv, tg) {
    const g = geom(), z = h(world, t.cx, t.cy), S = v.sun.dir, hl = Math.hypot(S[0], S[1]) || 1, seed = Math.floor(t.s * 1e6);
    const off = t.r + 0.6, lit = occ ? litAt(t.x + S[0] / hl * off, t.y + S[1] / hl * off, z + t.h * 0.85) : 1;   // 葉の日なた：木の外の日の側から調べる（自分の葉で影にしない）
    const col = t.kind === 'pine' ? ['#3B5F3C', '#43683F'][seed % 2] : t.kind === 'euca' ? ['#7A9467', '#839C6C'][seed % 2] : t.kind === 'shrub' ? ['#5E8040', '#6A8A45', '#557A3C'][seed % 3] : ['#4D7A3E', '#55833F', '#467238', '#5E8A47'][seed % 4];
    if (v.top) {
      list.push({ depth: (z + t.h) * 10, draw: (cx, pc) => { if (pc) return; const c = project(t.x, t.y, z, g), R = t.r * g.s, gr = cx.createRadialGradient(c[0] - R * 0.3, c[1] - R * 0.3, R * 0.1, c[0], c[1], R); gr.addColorStop(0, lightCol(col, 1, lit, 1.12)); gr.addColorStop(1, lightCol(col, 0.2, lit, 0.8)); cx.globalAlpha = 0.7; cx.fillStyle = gr; cx.beginPath(); cx.arc(c[0], c[1], R, 0, 7); cx.fill(); cx.globalAlpha = 1; } });
      return;
    }
    const base = project(t.x, t.y, z, g), topP = project(t.x, t.y, z + t.h, g), Rs = t.r * g.tw * 0.8;
    let alpha = 1;   // 奥の家やカーソルを隠すなら薄く
    for (const p of tg) if (p[2] < base[2] - 0.3 && Math.abs(p[0] - base[0]) < Rs + g.tw * 0.3 && p[1] > topP[1] - Rs * 0.5 && p[1] < base[1] + g.th) { alpha = 0.28; break; }
    const d0 = terrainDepth(t.cx, t.cy, floorLv), b0 = base[2];
    const sub = (wx, wy, wz) => ((project(wx, wy, wz, g)[2] - b0) + (wz - z) * 0.8) * 0.02;   // 同じ木の中の前後
    blob(list, t.x, t.y, z, t.kind === 'shrub' ? t.r * 1.1 : t.r * 0.6, t.kind === 'shrub' ? 0.25 : 0.32, d0 + 1e-5);
    if (t.kind === 'shrub') {
      const D = d0 + 0.6;
      for (const [dx, dy, hz, rk] of [[-0.35, 0.15, 0.4, 0.6], [0.3, -0.2, 0.42, 0.62], [0, 0, 0.55, 0.85]]) { const wx = t.x + dx * t.r, wy = t.y + dy * t.r, wz = z + t.h * hz; leafBall(list, wx, wy, wz, t.r * rk, col, lit, D + sub(wx, wy, wz), alpha, seed + dx * 100 + 7); }
      return;
    }
    const D = d0 + 1.2, trunkH = t.kind === 'pine' ? t.h * 0.4 : t.kind === 'euca' ? t.h * 0.7 : t.h * 0.55, tr = t.kind === 'euca' ? 0.07 : 0.08 + t.r * 0.02;
    rbox(list, t.x - tr, t.y - tr, t.x + tr, t.y + tr, z, trunkH, t.kind === 'euca' ? '#C2B9A6' : '#6B4E33', { type: 'veg', nopick: true, dbias: 1.15 }, alpha);
    if (t.kind === 'pine') { for (let i = 0; i < 4; i++) cone(list, t.x, t.y, z + t.h * (0.22 + i * 0.17), t.r * (1 - i * 0.2), t.h * 0.3, col, lit, D + i * 0.002, alpha); return; }
    const n = t.kind === 'euca' ? 4 : 6, balls = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n + t.s) * Math.PI * 2, rr = t.r * (t.kind === 'euca' ? 0.5 : 0.42) * (0.8 + hash(seed, i, 3) * 0.4);
      balls.push([t.x + Math.cos(a) * rr, t.y + Math.sin(a) * rr, z + t.h * (0.58 + hash(seed, i, 4) * 0.18), t.r * (t.kind === 'euca' ? 0.42 : 0.56) * (0.85 + hash(seed, i, 5) * 0.3)]);
    }
    balls.push([t.x, t.y, z + t.h * 0.86, t.r * (t.kind === 'euca' ? 0.45 : 0.6)]);
    balls.forEach(([wx, wy, wz, r], i) => leafBall(list, wx, wy, wz, r, col, lit, D + sub(wx, wy, wz), alpha, seed + i * 17));
  }
  /* ---------- 地面の草と小物 ---------- */
  function bladesOn(cx, at, x, y, n, hMin, hMax, cols, M, clumps, k0) {   // 草の葉：株ごとにまとまって、少し風になびく。色ごとにまとめて塗る
    const paths = cols.map(() => new Path2D());
    for (let i = 0; i < n; i++) {
      const cI = Math.floor(hash(x, y, k0 + i) * clumps);
      const fx = Math.min(0.97, Math.max(0.03, hash(x, y, k0 + 40 + cI) + (hash(x, y, k0 + 80 + i) - 0.5) * 0.24)), fy = Math.min(0.98, Math.max(0.06, hash(x, y, k0 + 120 + cI) + (hash(x, y, k0 + 160 + i) - 0.5) * 0.24));
      const [bx, by] = at(fx, fy), hg = (hMin + hash(x, y, k0 + 200 + i) * (hMax - hMin)) * M, lean = (hash(x, y, k0 + 240 + i) - 0.4) * hg * 0.7, w = Math.max(0.7, 1.0 * v.dpr) * (0.8 + hash(x, y, k0 + 280 + i) * 0.6);
      const P = paths[i % cols.length];
      P.moveTo(bx - w, by); P.quadraticCurveTo(bx - w * 0.3 + lean * 0.25, by - hg * 0.55, bx + lean, by - hg); P.quadraticCurveTo(bx + w * 0.3 + lean * 0.25, by - hg * 0.5, bx + w, by); P.closePath();
    }
    cols.forEach((c, i) => { cx.fillStyle = c; cx.fill(paths[i]); });
  }
  function fern(cx, [px, py], len, cA, cB, x, y) {
    cx.lineWidth = Math.max(1, 1.1 * v.dpr); cx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.12 + i * 0.15), L = len * (0.7 + hash(x, y, 800 + i) * 0.4), ex = px + Math.cos(a) * L, ey = py + Math.sin(a) * L * 0.75, mx = px + Math.cos(a) * L * 0.5, my = py + Math.sin(a) * L * 0.5 - L * 0.25;
      cx.strokeStyle = i % 2 ? cA : cB; cx.beginPath(); cx.moveTo(px, py); cx.quadraticCurveTo(mx, my, ex, ey); cx.stroke();
      for (let k = 1; k < 5; k++) { const t = k / 5, qx = (1 - t) ** 2 * px + 2 * (1 - t) * t * mx + t * t * ex, qy = (1 - t) ** 2 * py + 2 * (1 - t) * t * my + t * t * ey, s = L * 0.15 * (1 - t * 0.6); cx.beginPath(); cx.moveTo(qx + Math.cos(a - 1.2) * s, qy + Math.sin(a - 1.2) * s); cx.lineTo(qx, qy); cx.lineTo(qx + Math.cos(a + 1.2) * s, qy + Math.sin(a + 1.2) * s); cx.stroke(); }
    }
    cx.lineCap = 'butt';
  }
  function groundDecor(cl, x, y, col) {
    const r1 = hash(x, y, 1), r2 = hash(x, y, 2), r3 = hash(x, y, 3);
    return (cx, p, g, lt) => {
      const at = (fx, fy) => faceAt(p, fx, fy);
      const u = Math.abs(p[1][0] - p[0][0]) + Math.abs(p[3][0] - p[0][0]); if (u < 12 * v.dpr) return;
      const lam = lt ? lt.lam : v.sun.dir[2], lit = lt ? lt.lit : 1, Lc = (hex, k = 1) => lightCol(hex, lam, lit, k), M = g.bh, fine = u > 36 * v.dpr;
      const dots = (n, cols, rMin, rMax, k0, sq = 0.6) => { for (let i = 0; i < n; i++) { const [px, py] = at(0.05 + hash(x, y, k0 + i) * 0.9, 0.05 + hash(x, y, k0 + 30 + i) * 0.9), rr = (rMin + hash(x, y, k0 + 60 + i) * (rMax - rMin)) * M; cx.fillStyle = cols[i % cols.length]; cx.beginPath(); cx.ellipse(px, py, rr, rr * sq, hash(x, y, k0 + 90 + i) * 3, 0, 7); cx.fill(); } };
      switch (cl) {
        case 10: case 95:   // 林の下：落ち葉・こけ・ときどきシダ
          dots(fine ? 14 : 7, [Lc('#8C6B3E'), Lc('#A57E48'), Lc('#6E6B3A'), Lc('#B38D55')], 0.035, 0.07, 300);
          if (r1 > 0.5) bladesOn(cx, at, x, y, fine ? 7 : 3, 0.04, 0.1, [Lc('#5E7A3C'), Lc('#6F8C45')], M, 2, 340);
          if (r2 > 0.7) fern(cx, at(0.3 + r3 * 0.4, 0.45 + r1 * 0.4), 0.3 * M, Lc('#4E7C3A'), Lc('#6A9848', 1.08), x, y);
          break;
        case 20:   // やぶのあいだ：背の高い草と穂
          bladesOn(cx, at, x, y, fine ? 18 : 9, 0.12, 0.32, [Lc('#7E9A4E', 0.85), Lc('#93AE57'), Lc('#B5B66A', 1.05)], M, 4, 400);
          if (fine) dots(5, [Lc('#E2D597', 1.1)], 0.012, 0.022, 450, 1);
          break;
        case 40:   // 畑のあと：うねと、まばらな草
          cx.lineWidth = 1.4 * v.dpr;
          for (let i = 0; i < 4; i++) { const fy = 0.16 + i * 0.22; cx.strokeStyle = 'rgba(80,60,30,.22)'; lineOn(cx, at(0, fy), at(1, fy)); cx.strokeStyle = 'rgba(255,245,210,.22)'; lineOn(cx, at(0, fy + 0.05), at(1, fy + 0.05)); }
          bladesOn(cx, at, x, y, fine ? 6 : 3, 0.04, 0.12, [Lc('#8FA756'), Lc('#A8B565')], M, 3, 500);
          break;
        case 50: case 60:   // 土：粒と小石
          dots(fine ? 10 : 5, [Lc('#9C8466'), Lc('#C9B18D')], 0.01, 0.02, 600, 1);
          if (r1 > 0.6) { const [px, py] = at(0.3 + r2 * 0.4, 0.3 + r3 * 0.4), rr = 0.07 * M; cx.fillStyle = Lc('#A39C90'); cx.beginPath(); cx.ellipse(px, py, rr, rr * 0.6, 0, 0, 7); cx.fill(); cx.fillStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.ellipse(px - rr * 0.3, py - rr * 0.25, rr * 0.4, rr * 0.2, 0, 0, 7); cx.fill(); }
          if (r3 > 0.7) bladesOn(cx, at, x, y, 3, 0.04, 0.08, [Lc('#8FA756')], M, 1, 650);
          break;
        case 80: { const [px, py] = at(0.5, 0.5); cx.fillStyle = 'rgba(200,225,240,.35)'; cx.beginPath(); cx.ellipse(px, py, 0.5 * M, 0.22 * M, 0, 0, 7); cx.fill(); break; }
        case 90:   // 湿地：アシとガマ
          bladesOn(cx, at, x, y, fine ? 12 : 6, 0.35, 0.7, [Lc('#557F45'), Lc('#6E9650')], M, 3, 700);
          if (r1 > 0.5) { const [px, py] = at(0.4 + r2 * 0.3, 0.5); cx.fillStyle = Lc('#7A5434'); cx.beginPath(); cx.ellipse(px + 0.1 * M, py - 0.6 * M, 0.05 * M, 0.14 * M, 0.15, 0, 7); cx.fill(); }
          break;
        default: {   // 牧草地：低く密な草。ところどころクローバー、まれに小さな花と小石
          bladesOn(cx, at, x, y, fine ? 34 : 14, 0.07, 0.17, [Lc(tint(col, 0.84)), Lc(tint(col, 1.14)), Lc(toHex(hex3(col).map((c, i) => c * 0.72 + [214, 206, 120][i] * 0.28)), 1.05)], M, 7, 200);
          if (fine && smooth(x, y, 9, 3) > 0.7) for (let i = 0; i < 2; i++) { const [px, py] = at(0.15 + hash(x, y, 900 + i) * 0.7, 0.2 + hash(x, y, 910 + i) * 0.7), rr = 0.022 * M; cx.fillStyle = Lc(tint(col, 0.9)); for (const [dx, dy] of [[-0.8, 0], [0.8, 0], [0, -0.9]]) { cx.beginPath(); cx.arc(px + dx * rr, py + dy * rr, rr, 0, 7); cx.fill(); } }
          if (r3 > 0.9) { const [px, py] = at(0.3 + r2 * 0.4, 0.3 + r1 * 0.4); cx.fillStyle = ['#F2E8A0', '#F7F4EE', '#E9A7B8', '#F1D36A'][Math.floor(r1 * 4)]; for (const [dx, dy] of [[0, 0], [3, 1], [-2, 2]]) { cx.beginPath(); cx.arc(px + dx * v.dpr, py + dy * v.dpr - 4 * v.dpr, 1.5 * v.dpr, 0, 7); cx.fill(); } }
          else if (r3 < 0.04) { const [px, py] = at(0.6, 0.5); cx.fillStyle = Lc('#A39C90'); cx.beginPath(); cx.ellipse(px, py, 0.05 * M, 0.03 * M, 0, 0, 7); cx.fill(); }
        }
      }
    };
  }
  /* ---------- 家の仕上げ ---------- */
  function wallTexture(kind, z0, z1, seed) {   // z0, z1：この部分の床からの高さ（m）。seed：壁ごとの板の色むら
    return (cx, p) => {
      const span = z1 - z0, fy = (zz) => (zz - z0) / span, Q = (a0, b0, a1, b1, f) => quadOn(cx, p, a0, b0, a1, b1, f);
      if (kind === 'board') {   // 縦の板張りと、継ぎ目をおさえる押し縁
        for (let i = 0; i < 5; i++) Q(i / 5, 0, (i + 1) / 5, 1, tone(hash(seed, i, 31) - 0.5, 0.34));
        cx.strokeStyle = 'rgba(90,55,25,.14)'; cx.lineWidth = 0.8 * v.dpr;
        for (let i = 0; i < 5; i++) { const f = (i + 0.35 + hash(seed, i, 32) * 0.3) / 5; lineOn(cx, faceAt(p, f, 0), faceAt(p, f + 0.012, 1)); }
        for (let i = 1; i < 5; i++) { const f = i / 5; Q(f - 0.022, 0, f + 0.014, 1, 'rgba(255,246,228,.30)'); Q(f + 0.014, 0, f + 0.03, 1, 'rgba(45,28,12,.26)'); }
        for (let i = 0; i < 2; i++) if (hash(seed, i, 37) > 0.55) { const k = faceAt(p, (Math.floor(hash(seed, i, 38) * 5) + 0.5) / 5, hash(seed, i, 39)); if (fy(0) <= 0 || true) { cx.fillStyle = 'rgba(90,55,25,.35)'; cx.beginPath(); cx.ellipse(k[0], k[1], 1.6 * v.dpr, 2.4 * v.dpr, 0, 0, 7); cx.fill(); } }
      } else if (kind === 'ins') {   // 横に重ねた下見板
        const B = 0.2;
        for (let k = Math.floor(z0 / B); k * B < z1; k++) {
          const a = Math.max(0, fy(k * B)), b = Math.min(1, fy((k + 1) * B)); if (b <= a) continue;
          Q(0, a, 1, b, tone(hash(seed, k, 33) - 0.5, 0.26));
          Q(0, a, 1, Math.min(b, a + 0.035 / span), 'rgba(50,32,14,.30)');
          Q(0, Math.max(a, b - 0.02 / span), 1, b, 'rgba(255,248,232,.26)');
        }
      } else {   // 厚い壁：しっくい仕上げのやわらかいむら
        const W = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
        for (let i = 0; i < 4; i++) { const [px, py] = faceAt(p, hash(seed, i, 34), hash(seed, i, 35)), rr = W * (0.2 + hash(seed, i, 36) * 0.25), gr = cx.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, `rgba(${i % 2 ? '255,250,238' : '150,125,90'},.18)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); cx.fillStyle = gr; cx.beginPath(); cx.arc(px, py, rr, 0, 7); cx.fill(); }
      }
      if (z0 < 0.6) { const A = faceAt(p, 0.5, fy(0)), B2 = faceAt(p, 0.5, fy(0.6)), gr = cx.createLinearGradient(A[0], A[1], B2[0], B2[1]); gr.addColorStop(0, 'rgba(70,50,30,.24)'); gr.addColorStop(1, 'rgba(70,50,30,0)'); Q(0, 0, 1, 1, gr); }   // 雨の跳ね返りで少し暗い足元
      if (z1 > HOUSE_H - 0.7) { const A = faceAt(p, 0.5, fy(HOUSE_H)), B2 = faceAt(p, 0.5, fy(HOUSE_H - 0.7)), gr = cx.createLinearGradient(A[0], A[1], B2[0], B2[1]); gr.addColorStop(0, 'rgba(25,25,30,.32)'); gr.addColorStop(1, 'rgba(25,25,30,0)'); Q(0, 0, 1, 1, gr); }   // 軒の下の影
    };
  }
  function stoneDecor(seed) {   // 基礎：石を積んだ帯
    return (cx, p) => {
      const Hh = Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1]), rows = Math.max(1, Math.round(Hh / (0.22 * geom().bh)));
      for (let r = 0; r < rows; r++) for (let k = -1; k < 6; k++) { const a0 = Math.max(0, (k + (r % 2) * 0.5) / 5), a1 = Math.min(1, (k + 1 + (r % 2) * 0.5) / 5); if (a1 <= a0) continue; quadOn(cx, p, a0, r / rows, a1, (r + 1) / rows, tone(hash(seed, r * 9 + k, 61) - 0.5, 0.36)); }
      cx.strokeStyle = 'rgba(55,50,45,.35)'; cx.lineWidth = 1 * v.dpr;
      for (let r = 1; r < rows; r++) lineOn(cx, faceAt(p, 0, r / rows), faceAt(p, 1, r / rows));
      for (let r = 0; r < rows; r++) for (let k = 0; k < 6; k++) { const f = (k + (r % 2) * 0.5) / 5; if (f > 0.02 && f < 0.98) lineOn(cx, faceAt(p, f, r / rows), faceAt(p, f, (r + 1) / rows)); }
    };
  }
  function windowDecor(op) {
    return (cx, p) => {
      const Q = (a0, b0, a1, b1, f) => quadOn(cx, p, a0, b0, a1, b1, f);
      Q(0.06, 0.0, 0.94, 1.0, '#EFE9DD');   // 枠
      const A = faceAt(p, 0.5, 0.94), B = faceAt(p, 0.5, 0.06), gr = cx.createLinearGradient(A[0], A[1], B[0], B[1]);
      gr.addColorStop(0, '#E3EFF6'); gr.addColorStop(0.45, op === 'window2' ? '#93B9D4' : '#A2C5DC'); gr.addColorStop(1, '#4F6E86');   // 空の映りこみ
      Q(0.13, 0.07, 0.87, 0.93, gr);
      Q(0.16, 0.1, 0.3, 0.88, 'rgba(236,222,190,.40)');   // 中のカーテン
      Q(0.13, 0.84, 0.87, 0.93, 'rgba(25,35,45,.28)'); Q(0.13, 0.07, 0.18, 0.93, 'rgba(25,35,45,.16)');   // 枠の奥の影
      Q(0.48, 0.07, 0.52, 0.93, '#EFE9DD'); if (op === 'window2') Q(0.13, 0.48, 0.87, 0.52, '#EFE9DD');
      cx.strokeStyle = 'rgba(255,255,255,.6)'; cx.lineWidth = 1.6 * v.dpr; lineOn(cx, faceAt(p, 0.57, 0.32), faceAt(p, 0.7, 0.76)); lineOn(cx, faceAt(p, 0.64, 0.26), faceAt(p, 0.73, 0.48));
    };
  }
  function doorDecor(cx, p) {   // 板の扉：縦の板、横の桟と筋かい、黒い取っ手
    const Q = (a0, b0, a1, b1, f) => quadOn(cx, p, a0, b0, a1, b1, f);
    for (let i = 0; i < 5; i++) Q(0.1 + i * 0.16, 0, 0.1 + (i + 1) * 0.16, 0.95, tone(hash(i, 7, 71) - 0.5, 0.3));
    cx.strokeStyle = 'rgba(30,18,8,.4)'; cx.lineWidth = 1 * v.dpr; for (let i = 1; i < 5; i++) lineOn(cx, faceAt(p, 0.1 + i * 0.16, 0), faceAt(p, 0.1 + i * 0.16, 0.95));
    Q(0.12, 0.15, 0.88, 0.21, 'rgba(255,232,195,.22)'); Q(0.12, 0.74, 0.88, 0.8, 'rgba(255,232,195,.22)');
    cx.strokeStyle = 'rgba(255,232,195,.2)'; cx.lineWidth = 3.2 * v.dpr; lineOn(cx, faceAt(p, 0.16, 0.22), faceAt(p, 0.84, 0.73));
    Q(0, 0, 0.1, 1, '#E6DCC6'); Q(0.9, 0, 1, 1, '#E6DCC6'); Q(0, 0.95, 1, 1, '#E6DCC6');   // 枠
    Q(0.1, 0, 0.9, 0.06, 'rgba(30,20,10,.25)');
    const k = faceAt(p, 0.79, 0.47); cx.fillStyle = '#2E2A26'; cx.beginPath(); cx.arc(k[0], k[1], 2.4 * v.dpr, 0, 7); cx.fill(); cx.fillStyle = 'rgba(255,255,255,.55)'; cx.beginPath(); cx.arc(k[0] - 0.7 * v.dpr, k[1] - 0.7 * v.dpr, 0.8 * v.dpr, 0, 7); cx.fill();
  }
  function floorDecor(t, x, y) {
    if (t === 'wood') return (cx, p) => {   // 幅20cmの板が5列。継ぎ目は列ごとにずれて、となりのマスとつながる
      cx.strokeStyle = 'rgba(95,62,30,.3)'; cx.lineWidth = 0.9 * v.dpr;
      for (let r = 0; r < 5; r++) {
        const row = y * 5 + r, off = hash(row, 0, 41) * 1.8, b0 = r / 5, b1 = (r + 1) / 5;
        for (let s = Math.floor((x - off) / 1.8); ; s++) {
          const xa = off + s * 1.8, a0 = Math.max(0, xa - x), a1 = Math.min(1, xa + 1.8 - x); if (a0 >= 1) break; if (a1 <= 0) continue;
          quadOn(cx, p, a0, b0, a1, b1, tone(hash(row, s, 42) - 0.5, 0.3));
          if (xa > x && xa < x + 1) lineOn(cx, faceAt(p, a0, b0), faceAt(p, a0, b1));
        }
        lineOn(cx, faceAt(p, 0, b1), faceAt(p, 1, b1));
      }
      cx.strokeStyle = 'rgba(120,80,40,.10)'; for (let i = 0; i < 4; i++) { const fy = (Math.floor(hash(x, y, 43 + i) * 5) + 0.3 + hash(x, y, 47 + i) * 0.4) / 5, a = hash(x, y, 51 + i) * 0.6; lineOn(cx, faceAt(p, a, fy), faceAt(p, a + 0.35, fy + 0.01)); }
    };
    return (cx, p) => {   // 土間：こてむらと粒、2mごとの目地
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) quadOn(cx, p, i / 2, j / 2, (i + 1) / 2, (j + 1) / 2, tone(smooth(x * 2 + i, y * 2 + j, 44, 3) - 0.5, 0.3));
      cx.fillStyle = 'rgba(80,75,65,.25)'; for (let i = 0; i < 6; i++) { const [px, py] = faceAt(p, hash(x, y, 60 + i), hash(x, y, 70 + i)); cx.beginPath(); cx.arc(px, py, 0.9 * v.dpr, 0, 7); cx.fill(); }
      cx.strokeStyle = 'rgba(70,65,58,.3)'; cx.lineWidth = 1 * v.dpr; if (x % 2 === 0) lineOn(cx, faceAt(p, 0, 0), faceAt(p, 0, 1)); if (y % 2 === 0) lineOn(cx, faceAt(p, 0, 0), faceAt(p, 1, 0));
    };
  }
  function roofDecor(t, x, y) {
    if (t === 'green') return (cx, p, g) => { const at = (fx, fy) => faceAt(p, fx, fy), u = Math.abs(p[1][0] - p[0][0]) + Math.abs(p[3][0] - p[0][0]); if (u < 10 * v.dpr) return; bladesOn(cx, at, x, y, 14, 0.04, 0.12, ['#5E8A45', '#79A253', '#94AE5E'], g.bh, 4, 950); if (hash(x, y, 960) > 0.7) { const [px, py] = at(0.5, 0.5); cx.fillStyle = '#F2E8A0'; cx.beginPath(); cx.arc(px, py - 3 * v.dpr, 1.6 * v.dpr, 0, 7); cx.fill(); } };
    return (cx, p) => {   // トタン：波の山と谷。古いトタンには少しさび
      cx.lineWidth = 1 * v.dpr;
      for (let i = 0; i < 12; i++) { const f = (i + 0.5) / 12; cx.strokeStyle = i % 2 ? 'rgba(255,255,255,.22)' : 'rgba(30,40,45,.22)'; lineOn(cx, faceAt(p, f, 0), faceAt(p, f, 1)); }
      if (t === 'tin' && hash(x, y, 52) > 0.55) { const [px, py] = faceAt(p, 0.2 + hash(x, y, 53) * 0.6, 0.2 + hash(x, y, 54) * 0.6), rr = Math.abs(p[1][0] - p[0][0]) * 0.35, gr = cx.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, 'rgba(168,104,52,.17)'); gr.addColorStop(1, 'rgba(168,104,52,0)'); cx.fillStyle = gr; cx.beginPath(); cx.arc(px, py, rr, 0, 7); cx.fill(); }
    };
  }
  /* ---------- 家具 ---------- */
  function drawFurn(outList, f, z, meta, alpha, tint2) {
    const list = [], mark = (bb) => { list[list.length - 1].bb = bb; };   // 部品をいったん集めて、あとで前後を決める
    // 向き r：fwd は頭→足の向き、side はその右。(a, b)＝頭からの距離・横の位置 → 世界の座標
    const [fx, fy] = FDIR[(f.r || 0) % 4], sx = -fy, sy = fx, L = FURN[f.t].d, g = geom();
    const ox = f.x + 0.5 - fx * 0.5, oy = f.y + 0.5 - fy * 0.5;
    const W = (a, b) => [ox + fx * a + sx * b, oy + fy * a + sy * b];
    // 箱。o.decor(cx, pt)：pt(fa, fb) は上面の中の位置（頭→足、左→右）
    const R = (a0, a1, b0, b1, z0, ht, col, o = {}) => {
      const p = W(a0, b0), q = W(a1, b1), X0 = Math.min(p[0], q[0]), X1 = Math.max(p[0], q[0]), Y0 = Math.min(p[1], q[1]), Y1 = Math.max(p[1], q[1]);
      const decor = o.decor && !tint2 ? (cx, t) => o.decor(cx, (fa, fb) => { const [wx, wy] = W(a0 + fa * (a1 - a0), b0 + fb * (b1 - b0)); return faceAt(t, (wx - X0) / (X1 - X0), (wy - Y0) / (Y1 - Y0)); }) : null;
      rbox(list, X0, Y0, X1, Y1, z0, ht, tint2 || col, { ...meta, decor }, o.al ?? alpha); mark([X0, X1, Y0, Y1, z0, z0 + ht]);
    };
    const Cy = (a, b, z0, r, ht, col, o = {}) => { const [wx, wy] = W(a, b); cylinder(list, wx, wy, z0, r, ht, tint2 || col, meta, 0, o); mark([wx - r, wx + r, wy - r, wy + r, z0, z0 + ht]); };
    const ln = (cx, A, B, c, w = 1) => { cx.strokeStyle = c; cx.lineWidth = w * v.dpr; lineOn(cx, A, B); };
    const fillQ = (cx, pt, a0, b0, a1, b1, c) => { const q = [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)]; cx.fillStyle = c; cx.beginPath(); cx.moveTo(q[0][0], q[0][1]); for (const r of q) cx.lineTo(r[0], r[1]); cx.closePath(); cx.fill(); };
    const grain = (cx, pt) => { for (const fb of [0.22, 0.47, 0.71]) ln(cx, pt(0.06, fb), pt(0.94, fb + 0.02), 'rgba(110,70,35,.16)'); };
    const b = z + 0.1, ctr = W(L / 2, 0);
    if (!tint2) blob(list, ctr[0], ctr[1], b, L === 2 ? 0.8 : 0.45, 0.22, dep(Math.floor(ctr[0]), Math.floor(ctr[1]), z, 0.1) + 1e-6);
    const leg = (a, c, top, col) => R(a - 0.03, a + 0.03, c - 0.03, c + 0.03, b, top, col);
    if (f.t === 'toilet') {
      R(0.04, 0.24, -0.2, 0.2, b, 0.8, '#F2F2EE');
      R(0.03, 0.25, -0.21, 0.21, b + 0.8, 0.035, '#FFFFFF');
      Cy(0.14, 0, b + 0.835, 0.03, 0.015, '#C9CED2');
      Cy(0.46, 0, b, 0.12, 0.28, '#ECECE8');
      Cy(0.48, 0, b + 0.28, 0.2, 0.12, '#F6F6F2', { top: '#FFFFFF', lid: '#BFD3DA' });
    } else if (f.t === 'ctoilet') {
      R(0.05, 0.72, -0.34, 0.34, b, 0.46, '#B98B58', { decor: (cx, pt) => { for (const fb of [0.25, 0.5, 0.75]) ln(cx, pt(0, fb), pt(1, fb), 'rgba(80,50,25,.25)'); const c = pt(0.55, 0.5), e = pt(0.55, 0.78), rr = Math.hypot(e[0] - c[0], e[1] - c[1]); cx.fillStyle = '#F4F1EA'; cx.beginPath(); cx.ellipse(c[0], c[1], rr, rr * 0.55, 0, 0, 7); cx.fill(); cx.fillStyle = '#3A2E24'; cx.beginPath(); cx.ellipse(c[0], c[1], rr * 0.6, rr * 0.33, 0, 0, 7); cx.fill(); } });
      Cy(0.86, 0.26, b, 0.1, 0.3, '#D8CDB8', { top: '#E3C995' });
      Cy(0.1, -0.26, b + 0.46, 0.035, 1.6, '#8A8F92');
    } else if (f.t === 'shower' || f.t === 'shower2') {
      R(0.04, 0.96, -0.46, 0.46, b, 0.06, FURN[f.t].color, { decor: (cx, pt) => { for (const k of [0.25, 0.5, 0.75]) { ln(cx, pt(k, 0.03), pt(k, 0.97), 'rgba(80,110,130,.22)'); ln(cx, pt(0.03, k), pt(0.97, k), 'rgba(80,110,130,.22)'); } const c = pt(0.5, 0.5); cx.fillStyle = '#7E8C94'; cx.beginPath(); cx.ellipse(c[0], c[1], 3 * v.dpr, 1.8 * v.dpr, 0, 0, 7); cx.fill(); } });
      Cy(0.12, 0.38, b + 0.06, 0.022, 1.92, '#B8C2C8');
      R(0.09, 0.15, 0.25, 0.35, b + 1.0, 0.1, '#9AA5AC');
      R(0.12, 0.38, 0.36, 0.4, b + 1.98, 0.035, '#B8C2C8');
      Cy(0.38, 0.38, b + 1.9, 0.08, 0.06, '#C9D2D7', { top: '#DDE5E9' });
      R(0.04, 0.96, -0.47, -0.43, b + 0.06, 1.9, '#D9ECF5', { al: Math.min(alpha, 0.32) });
      const towel = f.t === 'shower2' ? '#9FC7A8' : '#E8A79C';   // ガラスの上に掛けたタオル（外・上・内の3枚）
      R(0.3, 0.62, -0.5, -0.47, b + 1.66, 0.3, towel); R(0.3, 0.62, -0.5, -0.4, b + 1.96, 0.03, towel); R(0.3, 0.62, -0.43, -0.4, b + 1.7, 0.26, towel);
    } else if (f.t === 'bed') {
      const wood = '#A07850', woodD = '#7E5C3C';
      for (const [a, c] of [[0.1, -0.42], [0.1, 0.42], [L - 0.06, -0.42], [L - 0.06, 0.42]]) leg(a, c, 0.12, woodD);
      R(0.07, L - 0.02, -0.46, 0.46, b + 0.12, 0.18, wood, { decor: grain });
      R(0.0, 0.07, -0.47, -0.39, b, 0.84, woodD); R(0.0, 0.07, 0.39, 0.47, b, 0.84, woodD);
      R(0.0, 0.07, -0.47, 0.47, b + 0.84, 0.11, woodD);
      for (const k of [-0.24, -0.08, 0.08, 0.24]) R(0.018, 0.052, k - 0.055, k + 0.055, b + 0.3, 0.54, wood);
      R(0.08, 0.62, -0.42, 0.42, b + 0.3, 0.16, '#F3EFE6');
      R(0.62, L - 0.04, -0.45, 0.45, b + 0.3, 0.2, '#88AACB', { decor: (cx, pt) => {
        fillQ(cx, pt, 0, 0, 0.1, 1, '#FBFAF4');
        for (const k of [0.33, 0.66]) ln(cx, pt(0.1, k), pt(1, k), 'rgba(40,60,90,.16)');
        for (const k of [0.35, 0.6]) ln(cx, pt(k, 0.02), pt(k, 0.98), 'rgba(40,60,90,.12)');
        fillQ(cx, pt, 0.72, 0, 0.95, 1, '#D98E5A'); for (const k of [0.76, 0.91]) ln(cx, pt(k, 0), pt(k, 1), 'rgba(250,225,190,.8)', 1.4);
      } });
      R(0.12, 0.44, -0.3, 0.3, b + 0.46, 0.1, '#FFFFFF', { decor: (cx, pt) => { ln(cx, pt(0.5, 0.15), pt(0.5, 0.85), 'rgba(150,150,140,.35)'); const c = pt(0.35, 0.3); cx.fillStyle = 'rgba(255,255,255,.7)'; cx.beginPath(); cx.arc(c[0], c[1], 2.5 * v.dpr, 0, 7); cx.fill(); } });
    } else if (f.t === 'table') {
      const wood = '#B98B58', woodD = '#8E6A44';
      for (const [a, c] of [[0.56, -0.32], [0.56, 0.32], [1.44, -0.32], [1.44, 0.32]]) leg(a, c, 0.6, woodD);
      R(0.56, 1.44, -0.32, 0.32, b + 0.6, 0.09, woodD);
      R(0.5, 1.5, -0.38, 0.38, b + 0.69, 0.05, wood, { decor: grain });
      Cy(1.15, 0.18, b + 0.74, 0.05, 0.08, '#C0704A', { top: '#6B4A30' });
      { const [px, py] = W(1.15, 0.18); sphere(list, px, py, b + 0.9, 0.08, '#5E9A4C', meta, 0); mark([px - 0.08, px + 0.08, py - 0.08, py + 0.08, b + 0.82, b + 0.98]); }
      Cy(0.8, -0.12, b + 0.74, 0.08, 0.015, '#F4F1EA', { lid: '#E9E2D2' });
      const chair = (s) => {   // s=1：頭側（背もたれが外）、s=-1：足側
        const A = (a) => s > 0 ? a : L - a;
        const a0 = Math.min(A(0.06), A(0.44)), a1 = Math.max(A(0.06), A(0.44));
        for (const [a, c] of [[0.09, -0.17], [0.09, 0.17], [0.41, -0.17], [0.41, 0.17]]) leg(A(a), c, 0.42, woodD);
        R(a0, a1, -0.2, 0.2, b + 0.42, 0.04, wood);
        R(Math.min(A(0.1), A(0.4)), Math.max(A(0.1), A(0.4)), -0.17, 0.17, b + 0.46, 0.035, '#C8604A');
        const k0 = Math.min(A(0.06), A(0.1)), k1 = Math.max(A(0.06), A(0.1));
        R(k0, k1, -0.2, -0.16, b + 0.46, 0.38, woodD); R(k0, k1, 0.16, 0.2, b + 0.46, 0.38, woodD);
        R(k0, k1, -0.2, 0.2, b + 0.84, 0.1, wood); R(k0, k1, -0.04, 0.04, b + 0.46, 0.38, wood);
      };
      chair(1); chair(-1);
    }
    // 部品の前後：重ならない向き（回したあとの x・y、高さ）で、奥のもの・下のものを先に描く。家具全体は床のあと
    const an = v.angle * Math.PI / 180, ca = Math.cos(an), sa = Math.sin(an), E2 = 1e-4;
    const rot = (q) => { const xs = [], ys = []; for (const px of [q[0], q[1]]) for (const py of [q[2], q[3]]) { xs.push(px * ca - py * sa); ys.push(px * sa + py * ca); } return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), q[4], q[5]]; };
    const ps = list.map((it) => { const r = it.bb ? rot(it.bb) : null; return { it, r, d: r ? (r[0] + r[1] + r[2] + r[3]) / 2 + r[4] * 0.8 : -1e9 }; });
    let order;
    if (v.top) order = ps.slice().sort((p, q) => (p.r ? p.r[5] : -1e9) - (q.r ? q.r[5] : -1e9) || (p.r ? p.r[4] : 0) - (q.r ? q.r[4] : 0));
    else {
      const behind = (A, B) => A.r[1] <= B.r[0] + E2 || A.r[3] <= B.r[2] + E2 || A.r[5] <= B.r[4] + E2;
      const n = ps.length, indeg = new Array(n).fill(0), out = ps.map(() => []);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (!ps[i].r || !ps[j].r) { if (ps[i].r || ps[j].r) { const [a2, b2] = ps[i].r ? [j, i] : [i, j]; out[a2].push(b2); indeg[b2]++; } continue; }   // 床の影は先
        const ab = behind(ps[i], ps[j]), ba = behind(ps[j], ps[i]);
        if (ab && !ba) { out[i].push(j); indeg[j]++; } else if (ba && !ab) { out[j].push(i); indeg[i]++; }
      }
      order = []; const done = new Array(n).fill(false);
      for (let k = 0; k < n; k++) {
        let best = -1; for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (best < 0 || ps[i].d < ps[best].d)) best = i;
        if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || ps[i].d < ps[best].d)) best = i;   // 輪になったら近い順
        done[best] = true; order.push(ps[best]); for (const j of out[best]) indeg[j]--;
      }
    }
    const D = v.top ? (z + 0.1) * 10 + 0.05 : Math.max(...furnCells(f).map(([cx2, cy2]) => dep(cx2, cy2, z, 0.1))) + 0.02;
    outList.push({ depth: D, meta, draw: (cx, pc) => { for (const p of order) p.it.draw(cx, pc); } });
  }
  function decorFor(b, d) {
    if (d.kind === 'window') return (cx, t) => { cx.strokeStyle = '#2B6CB0'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo((t[0][0] + t[2][0]) / 2, t[0][1]); cx.stroke(); };
    if (d.kind === 'bed') return (cx, t) => { cx.strokeStyle = 'rgba(44,90,55,.55)'; cx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; cx.beginPath(); cx.moveTo(t[0][0] + (t[1][0] - t[0][0]) * f, t[0][1] + (t[1][1] - t[0][1]) * f); cx.lineTo(t[3][0] + (t[2][0] - t[3][0]) * f, t[3][1] + (t[2][1] - t[3][1]) * f); cx.stroke(); } if (b.s) { cx.strokeStyle = '#6B6A63'; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(t[0][0], t[0][1]); for (const p of t) cx.lineTo(p[0], p[1]); cx.closePath(); cx.stroke(); } if (b.m) { cx.fillStyle = 'rgba(185,147,90,.6)'; cx.fill(); } };
    if (d.kind === 'pv') return (cx, t) => { cx.strokeStyle = '#8FA6C8'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo((t[0][0] + t[1][0]) / 2, (t[0][1] + t[1][1]) / 2); cx.lineTo((t[3][0] + t[2][0]) / 2, (t[3][1] + t[2][1]) / 2); cx.stroke(); };
    if (d.kind === 'plant') return (cx, t) => { const mx = (t[0][0] + t[2][0]) / 2, my = (t[0][1] + t[2][1]) / 2; cx.strokeStyle = d.plant === 'reed' ? '#6E8B3D' : '#3F7D4E'; cx.lineWidth = 2; for (const o of [-6, 0, 6]) { cx.beginPath(); cx.moveTo(mx + o, my); cx.lineTo(mx + o * 1.4, my - 18 * v.dpr); cx.stroke(); } if (d.plant === 'canna') { cx.fillStyle = '#D9542C'; cx.beginPath(); cx.arc(mx, my - 18 * v.dpr, 3 * v.dpr, 0, 7); cx.fill(); } };
    if (d.kind === 'door') return (cx, t) => { cx.fillStyle = '#E8C98A'; const mx = (t[0][0] + t[2][0]) / 2, my = (t[0][1] + t[2][1]) / 2; cx.beginPath(); cx.arc(mx, my, 2 * v.dpr, 0, 7); cx.fill(); };
    return null;
  }
  v.size = size; v.draw = draw;
  v.screenOf = (x, y, z) => { const g = geom(), p = project(x, y, z, g), r = canvas.getBoundingClientRect(); return [r.left + p[0] / v.dpr, r.top + p[1] / v.dpr]; };
  v.pickAt = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect(), x = Math.round((clientX - r.left) * v.dpr), y = Math.round((clientY - r.top) * v.dpr);
    if (x < 0 || y < 0 || x >= pick.width || y >= pick.height) return null;
    const p = pctx.getImageData(x, y, 1, 1).data; if (p[3] < 250) return null;
    const id = (p[0] << 16) | (p[1] << 8) | p[2];
    return v.faces[id - 1] || null;
  };
  /* 回転：押したときだけ短くなめらかに */
  v.rotate = (dir) => {
    if (v.anim) return;
    const from = v.angle, to = from + dir * 90, t0 = performance.now(), ms = 320;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      v.angle = from + (to - from) * e; draw();
      if (t < 1) v.anim = requestAnimationFrame(step); else { v.angle = ((to % 360) + 360) % 360; v.anim = null; draw(); }
    };
    v.anim = requestAnimationFrame(step);
  };
  v.pan = (sx, sy) => {
    // 画面の上下左右に合わせて、地図のマスを動かす
    const a = v.angle * Math.PI / 180, rx = v.top ? sx : (sx + sy) / 2, ry = v.top ? sy : (sy - sx) / 2;
    const dx = Math.round((rx * Math.cos(a) + ry * Math.sin(a)) * 4), dy = Math.round((-rx * Math.sin(a) + ry * Math.cos(a)) * 4);
    v.cx = Math.max(0, Math.min(N - 1, v.cx + dx)); v.cy = Math.max(0, Math.min(N - 1, v.cy + dy)); draw();
  };
  size();
  return v;
}
