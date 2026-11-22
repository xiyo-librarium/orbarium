/* 線で描く地球儀（正射図法・canvas）。外部ライブラリなし */
let LAND = null;
export async function loadLand() {
  if (LAND) return LAND;
  const r = await fetch('data/land110.json'); LAND = await r.json(); return LAND;
}
const rad = Math.PI / 180;

export function createGlobe(canvas, opt = {}) {
  const ctx = canvas.getContext('2d');
  const g = { lon: opt.lon ?? 0, lat: opt.lat ?? 15, scale: 1, pins: [], hover: null, label: null, dpr: Math.min(2, window.devicePixelRatio || 1) };
  function size() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * g.dpr); canvas.height = Math.round(r.height * g.dpr);
  }
  function proj(lon, lat) {
    const R = g.R, l = (lon - g.lon) * rad, p = lat * rad, p0 = g.lat * rad;
    const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
    return { x: g.cx + R * Math.cos(p) * Math.sin(l), y: g.cy - R * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l)), v: cosc >= 0 };
  }
  function draw() {
    const W = canvas.width, H = canvas.height;
    g.cx = W / 2; g.cy = H / 2; g.R = Math.min(W, H) * 0.38 * g.scale;
    ctx.clearRect(0, 0, W, H);
    const ink = opt.ink || '#2a3330', faint = opt.faint || 'rgba(42,51,48,0.18)';
    // 外周
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, Math.PI * 2);
    ctx.fillStyle = opt.sea || 'rgba(255,255,255,0.35)'; ctx.fill();
    ctx.lineWidth = 1.2 * g.dpr; ctx.strokeStyle = ink; ctx.stroke();
    // 経緯線
    ctx.lineWidth = 0.6 * g.dpr; ctx.strokeStyle = faint;
    for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]));
    for (let lat = -60; lat <= 60; lat += 30) line(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]));
    // 陸：海岸線を等高線のように内側へ重ねる
    if (LAND) {
      ctx.strokeStyle = ink; ctx.lineWidth = 1 * g.dpr;
      for (const ring of LAND) line(ring);
    }
    // ピン
    for (const p of g.pins) {
      const q = proj(p.lon, p.lat); p._x = q.x; p._y = q.y; p._v = q.v;
      if (!q.v) continue;
      const on = g.hover === p || p.active;
      ctx.beginPath(); ctx.arc(q.x, q.y, (on ? 7 : 5) * g.dpr, 0, Math.PI * 2);
      ctx.fillStyle = p.done ? '#3F7D4E' : (p.color || '#B8641F'); ctx.fill();
      ctx.lineWidth = 2 * g.dpr; ctx.strokeStyle = '#FBFAF5'; ctx.stroke();
      if (on || p.always) { ctx.font = `${13 * g.dpr}px "Noto Sans JP", sans-serif`; ctx.fillStyle = ink; ctx.fillText(p.name, q.x + 10 * g.dpr, q.y - 8 * g.dpr); }
    }
    if (g.label) { const q = proj(g.label.lon, g.label.lat); if (q.v) { ctx.beginPath(); ctx.arc(q.x, q.y, 4 * g.dpr, 0, Math.PI * 2); ctx.fillStyle = '#B8641F'; ctx.fill(); ctx.font = `${14 * g.dpr}px "Noto Sans JP", sans-serif`; ctx.fillStyle = ink; ctx.fillText(g.label.text, q.x + 10 * g.dpr, q.y + 5 * g.dpr); } }
  }
  function line(pts) {
    let pen = false; ctx.beginPath();
    for (const [lon, lat] of pts) {
      const q = proj(lon, lat);
      if (q.v) { if (pen) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); pen = true; } else pen = false;
    }
    ctx.stroke();
  }
  g.draw = draw; g.size = size; g.proj = proj;
  g.pick = (cx, cy) => {
    const r = canvas.getBoundingClientRect(), x = (cx - r.left) * g.dpr, y = (cy - r.top) * g.dpr;
    let best = null, bd = 18 * g.dpr;
    for (const p of g.pins) { if (!p._v) continue; const d = Math.hypot(p._x - x, p._y - y); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  size();
  return g;
}

/* なめらかに回して近づく */
export function flyTo(g, to, ms, done) {
  const from = { lon: g.lon, lat: g.lat, scale: g.scale };
  let dl = to.lon - from.lon; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    g.lon = from.lon + dl * e; g.lat = from.lat + (to.lat - from.lat) * e;
    g.scale = from.scale + ((to.scale ?? from.scale) - from.scale) * Math.pow(e, 3);
    g.draw();
    if (t < 1) g.raf = requestAnimationFrame(step); else done && done();
  }
  g.raf = requestAnimationFrame(step);
}
