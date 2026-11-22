/* 斜め上から見下ろす3D（アイソメトリック）。カメラは固定。回転ボタンを押したときだけ短くなめらかに回る */
import { BLOCKS, N, h, at, WALLS, ROOFS, FLOORS, OPENINGS, HOUSE_H, houseOuterEdges } from './world.js';

const SIDE = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // +x, +y, -x, -y
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(Math.min(255, r * f)); g = Math.round(Math.min(255, g * f)); b = Math.round(Math.min(255, b * f));
  return `rgb(${r},${g},${b})`;
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
  const v = { world, top: false, wallMode: 'up', house: null, base: null, rect: null, ghostEdge: null, cx: opt.cx ?? 25, cy: opt.cy ?? 25, R: opt.R ?? 8, angle: 0, rot: 0, zoom: 1, hover: null, ghost: null, faces: [], dpr: Math.min(2, window.devicePixelRatio || 1), maxLv: Math.max(...world.H) };
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
    const g = geom();
    const a = v.angle * Math.PI / 180;
    const x = (x0 + x1) / 2 - 0.5, y = (y0 + y1) / 2 - 0.5;
    const P = (px, py, pz) => project(px, py, pz, g);
    const c = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
    const t = [P(x0, y0, z + ht), P(x1, y0, z + ht), P(x1, y1, z + ht), P(x0, y1, z + ht)];
    if (v.top) {   // 真上から：上の面だけ。高いものほど後に描く
      list.push({ depth: (z + ht) * 10 + (meta?.type === 'wall' ? 0.5 : 0), draw: (cx, pc) => { poly(cx, t, pc ? pc(4) : shade(color, 1.0), alpha); if (!pc && meta?.decor) meta.decor(cx, t, g); }, meta });
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
        sides.push({ pts: [c[quad[0]], c[quad[1]], t[quad[1]], t[quad[0]]], f: 0.72 + 0.12 * (rx - ry > 0 ? 1 : 0), face: i });
      }
    }
    list.push({ depth: depth + z * 0.001 + ht * 0.0005, draw: (cx, pc) => {
      for (const sd of sides) poly(cx, sd.pts, pc ? pc(sd.face) : shade(color, sd.f), alpha);
      poly(cx, t, pc ? pc(4) : shade(color, 1.0), alpha);
      if (!pc && meta?.decor) meta.decor(cx, t, g);
    }, meta });
  }
  function poly(cx, pts, fill, alpha) {
    cx.globalAlpha = alpha; cx.beginPath(); cx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i][0], pts[i][1]); cx.closePath(); cx.fillStyle = fill; cx.fill();
    if (alpha === 1 && !fill.startsWith('#0')) { cx.strokeStyle = 'rgba(31,42,46,.18)'; cx.lineWidth = 1; cx.stroke(); }
    cx.globalAlpha = 1;
  }
  function draw() {
    const list = [];
    const x0 = Math.max(0, v.cx - v.R), x1 = Math.min(N - 1, v.cx + v.R), y0 = Math.max(0, v.cy - v.R), y1 = Math.min(N - 1, v.cy + v.R);
    const floorLv = Math.max(0, (world.H[v.cy * N + v.cx] || 0) - 4);
    let lo = 1e9, hi = -1e9; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const g = h(world, x, y); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const g = h(world, x, y), dug = world.H0[y * N + x] - g;
      box(list, x, y, floorLv, g - floorLv, dug > 0 ? '#9C8A6E' : v.top ? topColor(g, lo, hi) : terrainColor(g, v.maxLv), { type: 'terrain', x, y, z: g - 1 });
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
