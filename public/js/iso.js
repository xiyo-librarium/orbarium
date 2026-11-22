/* 斜め上から見下ろす3D（アイソメトリック）。カメラは固定。回転ボタンを押したときだけ短くなめらかに回る */
import { BLOCKS, N, h, at, WALLS, ROOFS, FLOORS, OPENINGS, FURN, HOUSE_H, houseOuterEdges, furnCells } from './world.js';

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
function lightCol(hex, lam, lit, ao = 1, side = false) {
  const [r, g, b] = hex3(hex), d = Math.max(0, lam) * lit;
  const k = (c, i) => Math.round(Math.min(255, c * ao * (SKYC[i] * 0.72 + SUNC[i] * 0.40 * d + (side ? BOUNCE[i] * 0.09 : 0))));
  return `rgb(${k(r, 0)},${k(g, 1)},${k(b, 2)})`;
}
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
      list.push({ depth: (z + ht) * 10 + (meta?.type === 'wall' ? 0.5 : 0), draw: (cx, pc) => { poly(cx, t, pc ? pc(4) : topFill, alpha); if (!pc && meta?.decor) meta.decor(cx, t, g); }, meta });
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
    list.push({ depth: depth + z * 0.001 + ht * 0.0005, draw: (cx, pc) => {
      for (const sd of sides) {
        poly(cx, sd.pts, pc ? pc(sd.face) : sd.fill, alpha);
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
    if (Math.abs(ddx) > 0.2 || Math.abs(ddy) > 0.2) {
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
      const fill = lightCol(meta.side, sl, sLit, 0.94, true);
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
      if (!pc && meta.decor) meta.decor(cx, C.map((c, i) => P(c[0], c[1], cz(i))), g);
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
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const g = h(world, x, y), dug = world.H0[y * N + x] - g;
      // なだらかにならした傾き（まわり5x5の段の平均の差）
      let gx = 0, gy = 0; for (let k = -2; k <= 2; k++) { gx += H(x + 2, y + k) - H(x - 2, y + k); gy += H(x + k, y + 2) - H(x + k, y - 2); }
      gx /= 20; gy /= 20; const nl = Math.hypot(gx, gy, 1), slope = [-gx / nl, -gy / nl, 1 / nl];
      let ao = 1; for (const [dx, dy] of SIDE) if (H(x + dx, y + dy) > g) ao -= 0.06;
      const col = dug > 0 ? '#9C7B57' : grassColor(g, v.maxLv, x, y);
      const meta = { type: 'terrain', x, y, z: g - 1, slope, ao, side: dug > 0 ? '#A8835C' : '#C29A6E', lip: dug > 0 ? null : 'rgb(118,158,86)', decor: dug > 0 || v.top ? null : grassDecor(x, y) };
      if (v.top) { box(list, x, y, floorLv, g - floorLv, col, meta); if (v.hoverCell && Math.hypot(v.hoverCell[0] - x, v.hoverCell[1] - y) < 0.5) rbox(list, x + 0.03, y + 0.03, x + 0.97, y + 0.97, g, 0.01, '#FFFFFF', { type: 'ghost' }, 0.35); }
      else {
        // 下が見えている辺（となりが低い・描く範囲の外）：0北 1東 2南 3西
        const open = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < x0 || nx > x1 || ny < y0 || ny > y1 || h(world, nx, ny) < g; });
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
    for (const k in world.blocks) {
      const [x, y, z] = k.split(',').map(Number);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const b = world.blocks[k], d = BLOCKS[b.t];
      const ht = d.overlay ? 0.14 : d.kind === 'roof' ? 0.35 : d.kind === 'pv' ? 0.12 : d.kind === 'pond' ? 0.9 : 1;
      const inset = d.kind === 'tank' ? 0.12 : d.kind === 'tree' ? 0.15 : d.kind === 'pillar' ? 0.36 : d.kind === 'hedge' ? 0.05 : 0;
      const zz = d.kind === 'roof' ? z : z;
      const meta = { type: 'block', x, y, z, b, decor: decorFor(b, d) };
      box(list, x, y, zz, ht, d.color, meta, b.p ? 0.45 : d.kind === 'pond' ? 0.85 : 1, inset);
    }
    const hs = v.house || world.house, base = v.base;
    if (hs) drawHouse(list, hs, base, x0, x1, y0, y1);
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
      if (!it.meta || it.meta.type === 'ghost') continue;
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
  /* 家：床・壁（窓と扉つき）・屋根。設計中は新しい床を青く、なくなる床を赤く */
  function drawHouse(list, hs, base, x0, x1, y0, y1) {
    const z = hs.z, Wm = WALLS[hs.wall], F = FLOORS[hs.floor], R = ROOFS[hs.roof];
    const inView = (x, y) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
    for (const k in hs.cells) {
      const [x, y] = k.split(',').map(Number); if (!inView(x, y)) continue;
      const isNew = base && !base.cells[k];
      rbox(list, x, y, x + 1, y + 1, z, 0.1, F.color, { type: 'floor', x, y, z, decor: floorDecor(hs.floor) }, 1);
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
      if (!inView(ex, ey)) continue;
      const op = hs.open[o.e], O = op ? OPENINGS[op] : null;
      const rect = t === 'h' ? [ex, ey - T / 2, ex + 1, ey + T / 2] : [ex - T / 2, ey, ex + T / 2, ey + 1];
      const meta = { type: 'wall', e: o.e, x: o.x, y: o.y, dir: o.dir, op };
      const full = v.wallMode === 'up' || (v.wallMode === 'cut' && !FRONT.includes(o.dir));
      const changed = base && (!base.cells[`${o.x},${o.y}`] || base.wall !== hs.wall || base.open[o.e] !== op);
      const alpha = 1;
      if (v.top || !full) { rbox(list, ...rect, z, v.top ? HOUSE_H : LOW, O ? O.color : Wm.color, meta, alpha); continue; }
      if (op === 'door') { rbox(list, ...rect, z, 2.1, O.color, meta, alpha); rbox(list, ...rect, z + 2.1, HOUSE_H - 2.1, Wm.color, meta, alpha); }
      else if (op) { rbox(list, ...rect, z, 0.9, Wm.color, meta, alpha); rbox(list, ...rect, z + 0.9, 1.3, O.color, meta, 0.85); rbox(list, ...rect, z + 2.2, HOUSE_H - 2.2, Wm.color, meta, alpha); }
      else rbox(list, ...rect, z, HOUSE_H, Wm.color, { ...meta, decor: changed ? null : null }, alpha);
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
      for (const [x, y] of cells) { if (!inView(x, y)) continue; rbox(list, x, y, x + 1, y + 1, z + HOUSE_H, 0.2, R.color, { type: 'roof', x, y, decor: roofDecor(hs.roof) }, 0.95); }
      if (hs.eaves) for (const o of houseOuterEdges(hs)) {
        const [t, r] = o.e.split(':'); const [ex, ey] = r.split(',').map(Number), E2 = 0.45;
        const rect = o.dir === 'n' ? [ex, ey - E2, ex + 1, ey] : o.dir === 's' ? [ex, ey, ex + 1, ey + E2] : o.dir === 'w' ? [ex - E2, ey, ex, ey + 1] : [ex, ey, ex + E2, ey + 1];
        rbox(list, ...rect, z + HOUSE_H, 0.12, R.color, { type: 'roof', x: o.x, y: o.y }, 0.95);
      }
      for (let i = 0; i < Math.min(hs.pv || 0, cells.length); i++) { const [x, y] = cells[i]; rbox(list, x + 0.08, y + 0.08, x + 0.92, y + 0.92, z + HOUSE_H + 0.2, 0.06, '#30476B', { type: 'roof', x, y }, 1); }
    }
  }
  function drawFurn(list, f, z, meta, alpha, tint) {
    const cs = furnCells(f), X0 = Math.min(...cs.map(c => c[0])), X1 = Math.max(...cs.map(c => c[0])) + 1, Y0 = Math.min(...cs.map(c => c[1])), Y1 = Math.max(...cs.map(c => c[1])) + 1;
    const c = (col) => tint || col, b = z + 0.1, long = (X1 - X0) > (Y1 - Y0);
    if (f.t === 'toilet') { rbox(list, X0 + 0.3, Y0 + 0.28, X0 + 0.7, Y0 + 0.75, b, 0.42, c('#F2F2EE'), meta, alpha); rbox(list, X0 + 0.28, Y0 + 0.12, X0 + 0.72, Y0 + 0.3, b, 0.8, c('#E6E6E0'), meta, alpha); }
    else if (f.t === 'ctoilet') { rbox(list, X0 + 0.2, Y0 + 0.2, X0 + 0.8, Y0 + 0.8, b, 0.45, c('#B98B58'), meta, alpha); rbox(list, X0 + 0.3, Y0 + 0.3, X0 + 0.7, Y0 + 0.7, b + 0.45, 0.04, c('#F2F2EE'), meta, alpha); rbox(list, X0 + 0.65, Y0 + 0.65, X0 + 0.85, Y0 + 0.85, b, 0.3, c('#D9C49A'), meta, alpha); }
    else if (f.t === 'shower' || f.t === 'shower2') { rbox(list, X0 + 0.06, Y0 + 0.06, X0 + 0.94, Y0 + 0.94, b, 0.06, c(FURN[f.t].color), meta, alpha); rbox(list, X0 + 0.08, Y0 + 0.08, X0 + 0.16, Y0 + 0.16, b, 2.0, c('#9AA4A8'), meta, alpha); rbox(list, X0 + 0.08, Y0 + 0.08, X0 + 0.4, Y0 + 0.4, b + 1.95, 0.06, c('#9AA4A8'), meta, alpha); }
    else if (f.t === 'bed') {
      rbox(list, X0 + 0.08, Y0 + 0.08, X1 - 0.08, Y1 - 0.08, b, 0.3, c('#8B6B48'), meta, alpha);
      rbox(list, X0 + 0.12, Y0 + 0.12, X1 - 0.12, Y1 - 0.12, b + 0.3, 0.14, c('#F4F1E8'), meta, alpha);
      if (long) { rbox(list, X0 + 0.2, Y0 + 0.2, X0 + 0.55, Y1 - 0.2, b + 0.44, 0.08, c('#FFFFFF'), meta, alpha); rbox(list, X0 + 0.9, Y0 + 0.14, X1 - 0.14, Y1 - 0.14, b + 0.44, 0.05, c('#7FA7C9'), meta, alpha); }
      else { rbox(list, X0 + 0.2, Y0 + 0.2, X1 - 0.2, Y0 + 0.55, b + 0.44, 0.08, c('#FFFFFF'), meta, alpha); rbox(list, X0 + 0.14, Y0 + 0.9, X1 - 0.14, Y1 - 0.14, b + 0.44, 0.05, c('#7FA7C9'), meta, alpha); }
    } else if (f.t === 'table') {
      if (long) { rbox(list, X0 + 0.5, Y0 + 0.2, X1 - 0.5, Y1 - 0.2, b, 0.68, c('#9C7148'), meta, alpha); rbox(list, X0 + 0.45, Y0 + 0.15, X1 - 0.45, Y1 - 0.15, b + 0.68, 0.06, c('#B98B58'), meta, alpha);
        rbox(list, X0 + 0.1, Y0 + 0.3, X0 + 0.42, Y1 - 0.3, b, 0.45, c('#C9A47A'), meta, alpha); rbox(list, X1 - 0.42, Y0 + 0.3, X1 - 0.1, Y1 - 0.3, b, 0.45, c('#C9A47A'), meta, alpha); }
      else { rbox(list, X0 + 0.2, Y0 + 0.5, X1 - 0.2, Y1 - 0.5, b, 0.68, c('#9C7148'), meta, alpha); rbox(list, X0 + 0.15, Y0 + 0.45, X1 - 0.15, Y1 - 0.45, b + 0.68, 0.06, c('#B98B58'), meta, alpha);
        rbox(list, X0 + 0.3, Y0 + 0.1, X1 - 0.3, Y0 + 0.42, b, 0.45, c('#C9A47A'), meta, alpha); rbox(list, X0 + 0.3, Y1 - 0.42, X1 - 0.3, Y1 - 0.1, b, 0.45, c('#C9A47A'), meta, alpha); }
    }
  }
  function grassDecor(x, y) {   // 草むら・ときどき小さな花・小石
    const r1 = hash(x, y, 1), r2 = hash(x, y, 2), r3 = hash(x, y, 3);
    return (cx, p) => {
      const at = (fx, fy) => [p[0][0] + (p[1][0] - p[0][0]) * fx + (p[3][0] - p[0][0]) * fy, p[0][1] + (p[1][1] - p[0][1]) * fx + (p[3][1] - p[0][1]) * fy];
      const u = Math.abs(p[1][0] - p[0][0]) + Math.abs(p[3][0] - p[0][0]);
      if (u < 14 * v.dpr) return;
      cx.strokeStyle = 'rgba(70,110,50,.55)'; cx.lineWidth = Math.max(1, 0.9 * v.dpr);
      const n = 2 + Math.floor(r1 * 3);
      for (let i = 0; i < n; i++) { const [px, py] = at(hash(x, y, 10 + i), hash(x, y, 20 + i)), hgt = (3 + r2 * 3) * v.dpr; cx.beginPath(); cx.moveTo(px - 1.5 * v.dpr, py); cx.lineTo(px - 2.5 * v.dpr, py - hgt); cx.moveTo(px, py); cx.lineTo(px, py - hgt * 1.2); cx.moveTo(px + 1.5 * v.dpr, py); cx.lineTo(px + 2.5 * v.dpr, py - hgt); cx.stroke(); }
      if (r3 > 0.86) { const [px, py] = at(0.3 + r2 * 0.4, 0.3 + r1 * 0.4); cx.fillStyle = ['#F2E8A0', '#F5F2EE', '#E9A7B8', '#B9A7E6'][Math.floor(r1 * 4)]; for (const [dx, dy] of [[0, 0], [3, 1], [-2, 2]]) { cx.beginPath(); cx.arc(px + dx * v.dpr, py + dy * v.dpr - 2 * v.dpr, 1.6 * v.dpr, 0, 7); cx.fill(); } }
      else if (r3 < 0.07) { const [px, py] = at(0.6, 0.5); cx.fillStyle = 'rgba(150,145,135,.9)'; cx.beginPath(); cx.ellipse(px, py, 3 * v.dpr, 1.8 * v.dpr, 0, 0, 7); cx.fill(); }
    };
  }
  function floorDecor(t) {
    if (t === 'wood') return (cx, p) => { cx.strokeStyle = 'rgba(120,85,45,.35)'; cx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; cx.beginPath(); cx.moveTo(p[0][0] + (p[1][0] - p[0][0]) * f, p[0][1] + (p[1][1] - p[0][1]) * f); cx.lineTo(p[3][0] + (p[2][0] - p[3][0]) * f, p[3][1] + (p[2][1] - p[3][1]) * f); cx.stroke(); } };
    return (cx, p) => { cx.fillStyle = 'rgba(80,75,65,.18)'; for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.55], [0.45, 0.8]]) { const x = p[0][0] + (p[1][0] - p[0][0]) * fx + (p[3][0] - p[0][0]) * fy, y = p[0][1] + (p[1][1] - p[0][1]) * fx + (p[3][1] - p[0][1]) * fy; cx.beginPath(); cx.arc(x, y, 1.5 * v.dpr, 0, 7); cx.fill(); } };
  }
  function roofDecor(t) {
    if (t === 'green') return (cx, p) => { cx.fillStyle = 'rgba(60,110,50,.5)'; for (const [fx, fy] of [[0.25, 0.3], [0.6, 0.2], [0.4, 0.65], [0.8, 0.7]]) { const x = p[0][0] + (p[1][0] - p[0][0]) * fx + (p[3][0] - p[0][0]) * fy, y = p[0][1] + (p[1][1] - p[0][1]) * fx + (p[3][1] - p[0][1]) * fy; cx.beginPath(); cx.arc(x, y, 2 * v.dpr, 0, 7); cx.fill(); } };
    return (cx, p) => { cx.strokeStyle = 'rgba(40,50,55,.25)'; cx.lineWidth = 1; for (let i = 1; i < 5; i++) { const f = i / 5; cx.beginPath(); cx.moveTo(p[0][0] + (p[3][0] - p[0][0]) * f, p[0][1] + (p[3][1] - p[0][1]) * f); cx.lineTo(p[1][0] + (p[2][0] - p[1][0]) * f, p[1][1] + (p[2][1] - p[1][1]) * f); cx.stroke(); } };
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
