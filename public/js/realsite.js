/* 実在の土地のデータを、遊んでいるブラウザから取ってくる。
   標高：AWS Terrain Tiles（Terrarium 形式の PNG、ズーム15）。コロンビアでは元のデータが約30m間隔なので、
         50m四方の区画では「本当の傾きと向き」が出て、細かい起伏はなめらかになる。
   気候：Open-Meteo の過去の気象（ERA5 再解析、2014〜2023年の日ごとの値）から月ごとの平年値を作る。
         Open-Meteo は区画の標高に合わせて気温を補正する。 */
const Z = 15, TILE = 256;
const tileUrl = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
const M_PER_DEG = 111320;

function lonToPx(lon) { return (lon + 180) / 360 * TILE * 2 ** Z; }
function latToPx(lat) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * TILE * 2 ** Z; }

async function withTimeout(p, ms) {
  let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); });
  try { return await Promise.race([p, to]); } finally { clearTimeout(t); }
}
async function tilePixels(x, y) {
  const r = await fetch(tileUrl(x, y), { mode: 'cors' });
  if (!r.ok) throw new Error(`tile ${r.status}`);
  const bmp = await createImageBitmap(await r.blob());
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
}
/* 区画の中心 (lat, lon) のまわり、(n+1)×(n+1) 点の標高（1m間隔、北が上）。z[y*(n+1)+x] */
export async function fetchDem(lat, lon, n = 50) {
  const pts = [], need = new Map(), mx = M_PER_DEG * Math.cos(lat * Math.PI / 180);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const la = lat - (j - n / 2) / M_PER_DEG, lo = lon + (i - n / 2) / mx;
    const px = lonToPx(lo) - 0.5, py = latToPx(la) - 0.5;
    pts.push([px, py]);
    for (const [ax, ay] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const tx = Math.floor((Math.floor(px) + ax) / TILE), ty = Math.floor((Math.floor(py) + ay) / TILE); need.set(`${tx},${ty}`, [tx, ty]); }
  }
  const tiles = new Map();
  await Promise.all([...need.values()].map(async ([tx, ty]) => tiles.set(`${tx},${ty}`, await tilePixels(tx, ty))));
  const elev = (gx, gy) => { const tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE), d = tiles.get(`${tx},${ty}`); const i = ((gy - ty * TILE) * TILE + (gx - tx * TILE)) * 4; return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768; };
  const z = new Float32Array((n + 1) * (n + 1));
  pts.forEach(([px, py], k) => {
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    z[k] = elev(x0, y0) * (1 - fx) * (1 - fy) + elev(x0 + 1, y0) * fx * (1 - fy) + elev(x0, y0 + 1) * (1 - fx) * fy + elev(x0 + 1, y0 + 1) * fx * fy;
  });
  return z;
}
/* 月ごとの平年値：気温（平均・最高・最低）、雨の量、雨の日（1mm以上）、日照時間 */
export async function fetchClimate(lat, lon, elev) {
  const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}${elev != null ? `&elevation=${Math.round(elev)}` : ''}&start_date=2014-01-01&end_date=2023-12-31&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=auto`;
  const r = await fetch(u); if (!r.ok) throw new Error(`climate ${r.status}`);
  const d = (await r.json()).daily;
  const acc = Array.from({ length: 12 }, () => ({ n: 0, t: 0, tx: 0, tn: 0, p: 0, wet: 0, sun: 0 })), years = new Set();
  d.time.forEach((day, i) => {
    const m = +day.slice(5, 7) - 1, a = acc[m]; years.add(day.slice(0, 4));
    if (d.temperature_2m_mean[i] == null) return;
    a.n++; a.t += d.temperature_2m_mean[i]; a.tx += d.temperature_2m_max[i]; a.tn += d.temperature_2m_min[i];
    const p = d.precipitation_sum[i] || 0; a.p += p; if (p >= 1) a.wet++; a.sun += (d.sunshine_duration[i] || 0) / 3600;
  });
  const Y = years.size || 1, r1 = (v) => Math.round(v * 10) / 10;
  return {
    tmean: acc.map(a => r1(a.t / a.n)), tmax: acc.map(a => r1(a.tx / a.n)), tmin: acc.map(a => r1(a.tn / a.n)),
    rain: acc.map(a => Math.round(a.p / Y)), rainDays: acc.map(a => Math.round(a.wet / Y)), sunHours: acc.map(a => r1(a.sun / a.n)),
    years: '2014〜2023年'
  };
}
/* 両方そろえて返す（同じ場所はブラウザに覚えておく）。取れなければ例外 */
export async function loadRealPlot(lat, lon, ms = 9000) {
  const key = `orb-real-${lat.toFixed(5)},${lon.toFixed(5)}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.z && c.climate) return c; } catch { /* なし */ }
  const z = await withTimeout(fetchDem(lat, lon), ms);
  const mid = z[Math.floor(z.length / 2)];
  const climate = await withTimeout(fetchClimate(lat, lon, mid), ms);
  const out = { lat, lon, z: Array.from(z, v => Math.round(v * 100) / 100), climate, src: { dem: 'AWS Terrain Tiles（Mapzen、Terrarium z15）', climate: `Open-Meteo（ERA5再解析、${climate.years}）` } };
  try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* 容量なし */ }
  return out;
}
export const mapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}`;
