/* 斜め上から見下ろす3D（アイソメトリック）。カメラは固定。回転ボタンを押したときだけ短くなめらかに回る */
import { BLOCKS, N, h, at } from './world.js';

const SIDE = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // +x, +y, -x, -y
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(Math.min(255, r * f)); g = Math.round(Math.min(255, g * f)); b = Math.round(Math.min(255, b * f));
  return `rgb(${r},${g},${b})`;
}
function terrainColor(lv, maxLv) {
  const t = maxLv ? lv / maxLv : 0;
  const a = [178, 196, 150], b = [226, 214, 176];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function createView(canvas, world, opt = {}) {
  const ctx = canvas.getContext('2d');
  const pick = document.createElement('canvas'), pctx = pick.getContext('2d', { willReadFrequently: true });
  const v = { world, cx: opt.cx ?? 25, cy: opt.cy ?? 25, R: opt.R ?? 8, angle: 0, rot: 0, zoom: 1, hover: null, ghost: null, faces: [], dpr: Math.min(2, window.devicePixelRatio || 1), maxLv: Math.max(...world.H) };
  function size() { const r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * v.dpr); canvas.height = Math.round(r.height * v.dpr); pick.width = canvas.width; pick.height = canvas.height; }
  function geom() {
    const W = canvas.width, H = canvas.height;
    const tw = Math.min(W / (v.R * 2.6), H / (v.R * 1.9)) * v.zoom;
    return { tw, th: tw / 2, bh: tw * 0.55, ox: W / 2, oy: H / 2 + tw * 1.2 };
  }
  function project(x, y, z, g) {
    const a = v.angle * Math.PI / 180, dx = x - v.cx, dy = y - v.cy;
    const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
    const zc = z - (world.H[v.cy * N + v.cx] || 0);
    return [g.ox + (rx - ry) * g.tw / 2, g.oy + (rx + ry) * g.th / 2 - zc * g.bh, rx + ry];
  }
  /* 1つの直方体を描く（x,y は左下の角、z は下の高さ、ht は高さ） */
  function box(list, x, y, z, ht, color, meta, alpha = 1, inset = 0) {
    const g = geom();
    const a = v.angle * Math.PI / 180;
    const x0 = x + inset, y0 = y + inset, x1 = x + 1 - inset, y1 = y + 1 - inset;
    const P = (px, py, pz) => project(px, py, pz, g);
    const c = [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];
    const t = [P(x0, y0, z + ht), P(x1, y0, z + ht), P(x1, y1, z + ht), P(x0, y1, z + ht)];
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
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const g = h(world, x, y), dug = world.H0[y * N + x] - g;
      box(list, x, y, floorLv, g - floorLv, dug > 0 ? '#9C8A6E' : terrainColor(g, v.maxLv), { type: 'terrain', x, y, z: g - 1 });
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
    const g = geom(), nP = project(v.cx, v.cy - v.R - 0.5, h(world, v.cx, Math.max(0, v.cy - v.R)), g);
    ctx.font = `${13 * v.dpr}px "Noto Sans JP", sans-serif`; ctx.fillStyle = '#1F2A2E'; ctx.fillText('北', nP[0] - 6 * v.dpr, nP[1] - 10 * v.dpr);
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
    const a = v.angle * Math.PI / 180, rx = (sx + sy) / 2, ry = (sy - sx) / 2;
    const dx = Math.round((rx * Math.cos(a) + ry * Math.sin(a)) * 4), dy = Math.round((-rx * Math.sin(a) + ry * Math.cos(a)) * 4);
    v.cx = Math.max(0, Math.min(N - 1, v.cx + dx)); v.cy = Math.max(0, Math.min(N - 1, v.cy + dy)); draw();
  };
  size();
  return v;
}
