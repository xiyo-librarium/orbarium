/* 実在の土地のデータを、遊んでいるブラウザから取ってくる。
   標高：AWS Terrain Tiles（Terrarium 形式の PNG、ズーム15）。コロンビアでは元のデータが約30m間隔なので、
         50m四方の区画では「本当の傾きと向き」が出て、細かい起伏はなめらかになる。
   気候：Open-Meteo の過去の気象（ERA5 再解析、2014〜2023年の日ごとの値）から月ごとの平年値を作る。
   植生：ESA WorldCover 2021（10m、CC BY 4.0）。Microsoft Planetary Computer 経由、だめなら Terrascope の WMS。
   建物と道：OpenStreetMap（Overpass API、ODbL）。
   区画の選び方：決まった地点のまわり（半径およそ250m）から、建物・舗装・道・水がなく、急すぎない50m四方を探して、
   いちばん近い所にする。人の家の上に区画を置かないため。だれが遊んでも同じデータなら同じ場所になる。 */
const M_PER_DEG = 111320, T = 256;
const lonPx = (lon, z) => (lon + 180) / 360 * T * 2 ** z;
const latPx = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * T * 2 ** z; };
const PC = 'https://planetarycomputer.microsoft.com/api';

async function withTimeout(p, ms) {
  let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); });
  try { return await Promise.race([p, to]); } finally { clearTimeout(t); }
}
async function image(url) {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 80)}`);
  const bmp = await createImageBitmap(await r.blob());
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
  return { d: ctx.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
}
/* 範囲 box（s,w,n,e）をおおうタイルを取り、ズーム z の画素座標で読めるようにする。lenient：取れないタイルは空のまま */
async function mosaic(z, url, box, lenient = false) {
  const tx0 = Math.floor(lonPx(box.w, z) / T), tx1 = Math.floor(lonPx(box.e, z) / T), ty0 = Math.floor(latPx(box.n, z) / T), ty1 = Math.floor(latPx(box.s, z) / T);
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 16) throw new Error('too many tiles');
  const tiles = new Map(), jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const j = image(url(z, tx, ty)).then(im => tiles.set(`${tx},${ty}`, im));
    jobs.push(lenient ? j.catch(() => null) : j);
  }
  await Promise.all(jobs);
  if (!tiles.size) throw new Error('no tiles');
  return (gx, gy) => {
    const tx = Math.floor(gx / T), ty = Math.floor(gy / T), im = tiles.get(`${tx},${ty}`); if (!im) return null;
    const k = im.w / T, ix = Math.min(im.w - 1, Math.floor((gx - tx * T) * k)), iy = Math.min(im.h - 1, Math.floor((gy - ty * T) * k)), o = (iy * im.w + ix) * 4;
    return [im.d[o], im.d[o + 1], im.d[o + 2], im.d[o + 3]];
  };
}
/* 標高：Terrarium（R*256 + G + B/256 − 32768）を、まわり4画素でなめらかに */
async function demSource(box) {
  const Z = 15, get = await mosaic(Z, (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, box);
  const e = (gx, gy) => { const p = get(gx, gy); if (!p) throw new Error('dem gap'); return p[0] * 256 + p[1] + p[2] / 256 - 32768; };
  return (lat, lon) => {
    const px = lonPx(lon, Z) - 0.5, py = latPx(lat, Z) - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    return e(x0, y0) * (1 - fx) * (1 - fy) + e(x0 + 1, y0) * fx * (1 - fy) + e(x0, y0 + 1) * (1 - fx) * fy + e(x0 + 1, y0 + 1) * fx * fy;
  };
}
/* 土地の被覆（WorldCover の11分類）。値がそのまま入った画像でも、色を塗った画像でも読めるように */
const WC_COL = [[10, 0x006400], [20, 0xffbb22], [30, 0xffff4c], [40, 0xf096ff], [50, 0xfa0000], [60, 0xb4b4b4], [70, 0xf0f0f0], [80, 0x0064c8], [90, 0x0096a0], [95, 0x00cf75], [100, 0xfae6a0]];
const WC_RAW = new Set(WC_COL.map(c => c[0]));
export function wcClass(p) {
  if (!p || p[3] < 128) return 0;
  const [r, g, b] = p;
  if (r === g && g === b && WC_RAW.has(r)) return r;
  let best = 0, bd = 1e9;
  for (const [c, hx] of WC_COL) { const d = (r - (hx >> 16)) ** 2 + (g - ((hx >> 8) & 255)) ** 2 + (b - (hx & 255)) ** 2; if (d < bd) { bd = d; best = c; } }
  return bd < 3000 ? best : 0;
}
async function landcoverSource(box) {
  try {   // 1) Planetary Computer：STAC で 2021 年の版を探し、そのタイルを値のまま
    const q = await fetch(`${PC}/stac/v1/search?collections=esa-worldcover&bbox=${box.w},${box.s},${box.e},${box.n}&limit=10`);
    if (!q.ok) throw new Error(`stac ${q.status}`);
    const feats = (await q.json()).features || [], item = feats.find(f => /2021/.test(f.id)) || feats[0];
    if (!item) throw new Error('no worldcover item');
    const Z = 16, get = await mosaic(Z, (z, x, y) => `${PC}/data/v1/item/tiles/WebMercatorQuad/${z}/${x}/${y}@1x?collection=esa-worldcover&item=${encodeURIComponent(item.id)}&assets=map&format=png&resampling=nearest`, box, true);
    return { at: (lat, lon) => wcClass(get(Math.floor(lonPx(lon, Z)), Math.floor(latPx(lat, Z)))), via: 'Microsoft Planetary Computer' };
  } catch (e) { console.warn('WorldCover（Planetary Computer）を取れなかった', e); }
  // 2) Terrascope の WMS：色を塗った1枚の画像（緯度経度そのままの格子）
  const W = 360, H = 360;
  const im = await image(`https://services.terrascope.be/wms/v2?service=WMS&version=1.3.0&request=GetMap&layers=WORLDCOVER_2021_MAP&styles=&crs=EPSG:4326&bbox=${box.s},${box.w},${box.n},${box.e}&width=${W}&height=${H}&format=image/png&transparent=true`);
  return { at: (lat, lon) => { const ix = Math.floor((lon - box.w) / (box.e - box.w) * im.w), iy = Math.floor((box.n - lat) / (box.n - box.s) * im.h); if (ix < 0 || iy < 0 || ix >= im.w || iy >= im.h) return 0; const o = (iy * im.w + ix) * 4; return wcClass([im.d[o], im.d[o + 1], im.d[o + 2], im.d[o + 3]]); }, via: 'Terrascope' };
}
/* OpenStreetMap の建物と道（形つき） */
async function osmFeatures(box) {
  const bb = `${box.s},${box.w},${box.n},${box.e}`;
  const q = `[out:json][timeout:20];(way["building"](${bb});relation["building"](${bb});way["highway"](${bb}););out geom;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Error(`overpass ${r.status}`);
  const out = [];
  for (const el of (await r.json()).elements || []) {
    const tags = el.tags || {};
    const geoms = el.geometry ? [el.geometry] : (el.members || []).filter(m => m.geometry).map(m => m.geometry);
    for (const g of geoms) out.push({ kind: tags.building ? 'building' : 'highway', hw: tags.highway || '', pts: g.map(p => [p.lat, p.lon]) });
  }
  return out;
}
const TRAIL = new Set(['footway', 'path', 'track', 'steps', 'bridleway', 'cycleway', 'pedestrian']);

/* 区画を選ぶ。lat0, lon0：決まった地点。返り値：中心と、どれだけ動いたか、何で確かめたか */
function pickPlot(lat0, lon0, dem, lc, osm) {
  const G = 4, RS = 320, NG = RS * 2 / G, mx = M_PER_DEG * Math.cos(lat0 * Math.PI / 180);
  const ll = (e, n) => [lat0 + n / M_PER_DEG, lon0 + e / mx];          // 東・北（m）→ 緯度経度
  const cell = (lat, lon) => [((lon - lon0) * mx) / G + NG / 2, (-(lat - lat0) * M_PER_DEG) / G + NG / 2];   // → 格子（i 東向き、j 南向き）
  const built = new Uint8Array(NG * NG), road = new Uint8Array(NG * NG), water = new Uint8Array(NG * NG), tree = new Uint8Array(NG * NG);
  const mark = (a, i, j) => { i = Math.floor(i); j = Math.floor(j); if (i >= 0 && j >= 0 && i < NG && j < NG) a[j * NG + i] = 1; };
  if (lc) for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    const [la, lo] = ll((i + 0.5 - NG / 2) * G, -(j + 0.5 - NG / 2) * G), c = lc.at(la, lo), k = j * NG + i;
    if (c === 50) built[k] = 1; if (c === 80) water[k] = 1; if (c === 10) tree[k] = 1;
  }
  if (osm) for (const f of osm) {
    const ps = f.pts.map(([la, lo]) => cell(la, lo));
    if (f.kind === 'building') {   // 建物：形をおおう四角ごと
      const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
      for (let j = Math.floor(Math.min(...ys)); j <= Math.floor(Math.max(...ys)); j++) for (let i = Math.floor(Math.min(...xs)); i <= Math.floor(Math.max(...xs)); i++) mark(built, i, j);
    } else if (!TRAIL.has(f.hw)) {   // 車の通る道：線にそって
      for (let s = 1; s < ps.length; s++) { const [a, b] = [ps[s - 1], ps[s]], L = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * G) + 1; for (let t = 0; t <= L; t++) mark(road, a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L); }
    }
  }
  const integ = (a) => { const W1 = NG + 1, I = new Float64Array(W1 * W1); for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) I[(j + 1) * W1 + i + 1] = a[j * NG + i] + I[j * W1 + i + 1] + I[(j + 1) * W1 + i] - I[j * W1 + i]; return (e0, n0, e1, n1) => { const i0 = Math.max(0, Math.floor(e0 / G + NG / 2)), i1 = Math.min(NG, Math.ceil(e1 / G + NG / 2)), j0 = Math.max(0, Math.floor(-n1 / G + NG / 2)), j1 = Math.min(NG, Math.ceil(-n0 / G + NG / 2)); if (i1 <= i0 || j1 <= j0) return 0; return I[j1 * W1 + i1] - I[j0 * W1 + i1] - I[j1 * W1 + i0] + I[j0 * W1 + i0]; }; };
  const B = integ(built), Rd = integ(road), Wt = integ(water), Tr = integ(tree);
  const win = (f, e, n, m) => f(e - 25 - m, n - 25 - m, e + 25 + m, n + 25 + m);
  let best = null, fallback = null;
  for (let n = -256; n <= 256; n += G) for (let e = -256; e <= 256; e += G) {
    const dist = Math.hypot(e, n); if (dist > 256) continue;
    const near = win(B, e, n, 12), around = win(B, e, n, 36), rd = win(Rd, e, n, -2), wt = win(Wt, e, n, 0), tf = win(Tr, e, n, 0) / (50 / G) ** 2;
    let z; try { z = [[-25, -25], [25, -25], [-25, 25], [25, 25], [0, 0]].map(([de, dn]) => dem(...ll(e + de, n + dn))); } catch { continue; }
    const sx = ((z[1] + z[3]) - (z[0] + z[2])) / 100, sy = ((z[2] + z[3]) - (z[0] + z[1])) / 100, slope = Math.hypot(sx, sy), rough = Math.abs(z[4] - (z[0] + z[1] + z[2] + z[3]) / 4);
    const score = dist / 100 + Math.max(0, slope - 0.2) * 12 + around * 0.05 + Math.max(0, tf - 0.6) * 4 + rough * 0.05;
    const ok = near === 0 && rd === 0 && wt <= 2;
    if (ok && (!best || score < best.score)) best = { e, n, score, slope, dist };
    const bad = near * 10 + rd * 5 + wt;
    if (!fallback || bad < fallback.bad || (bad === fallback.bad && score < fallback.score)) fallback = { e, n, score, slope, dist, bad };
  }
  const p = best || fallback, [lat, lon] = ll(p.e, p.n);
  const dirs = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'], dir = p.dist < 2 ? '' : dirs[Math.round(((Math.atan2(p.e, p.n) * 180 / Math.PI) + 360) % 360 / 45) % 8];
  return { lat, lon, moved: Math.round(p.dist), dir, clear: !!best, slope: Math.round(p.slope * 100) };
}
/* 区画の中心のまわり、(n+1)×(n+1) 点の標高（1m間隔、北が上）。z[y*(n+1)+x] */
function demGrid(dem, lat, lon, n = 50) {
  const mx = M_PER_DEG * Math.cos(lat * Math.PI / 180), z = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) z[j * (n + 1) + i] = dem(lat - (j - n / 2) / M_PER_DEG, lon + (i - n / 2) / mx);
  return z;
}
/* 1m ごとの被覆。10m の境目がカクカクしないよう、調べる位置を少しゆらす */
function lcGrid(lc, lat, lon, n = 50) {
  const mx = M_PER_DEG * Math.cos(lat * Math.PI / 180), out = new Array(n * n);
  const jit = (i, j, k) => { let h = (i * 374761393 + j * 668265263 + k * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (((h ^ (h >>> 16)) >>> 0) / 4294967295 - 0.5) * 4; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = lc.at(lat - (j + 0.5 - n / 2 + jit(i, j, 1)) / M_PER_DEG, lon + (i + 0.5 - n / 2 + jit(i, j, 2)) / mx) || 30;
  return out;
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
/* 全部そろえて返す（同じ場所はブラウザに覚えておく）。標高か気候が取れなければ例外 */
export async function loadRealPlot(lat0, lon0, ms = 12000) {
  const key = `orb-real3-${lat0.toFixed(5)},${lon0.toFixed(5)}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.z && c.climate) return c; } catch { /* なし */ }
  const mx = M_PER_DEG * Math.cos(lat0 * Math.PI / 180), R = 330 / M_PER_DEG, Rx = 330 / mx;
  const box = { s: lat0 - R, n: lat0 + R, w: lon0 - Rx, e: lon0 + Rx };
  const [dem, lc, osm] = await Promise.all([
    withTimeout(demSource(box), ms),
    withTimeout(landcoverSource(box), ms).catch(e => { console.warn('植生を取れなかった', e); return null; }),
    withTimeout(osmFeatures(box), ms).catch(e => { console.warn('建物と道を取れなかった', e); return null; })
  ]);
  const checked = [lc && 'WorldCover', osm && 'OpenStreetMap'].filter(Boolean);
  const pick = checked.length ? pickPlot(lat0, lon0, dem, lc, osm) : { lat: lat0, lon: lon0, moved: 0, dir: '', clear: false };
  const z = demGrid(dem, pick.lat, pick.lon), mid = z[Math.floor(z.length / 2)];
  const climate = await withTimeout(fetchClimate(pick.lat, pick.lon, mid), ms);
  const out = {
    lat: pick.lat, lon: pick.lon, z: Array.from(z, v => Math.round(v * 100) / 100), climate, lc: lc ? lcGrid(lc, pick.lat, pick.lon) : null,
    pick: { ...pick, lat0, lon0, checked },
    src: {
      dem: 'AWS Terrain Tiles（Mapzen、Terrarium z15）', climate: `Open-Meteo（ERA5再解析、${climate.years}）`,
      lc: lc ? `© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium（${lc.via} 経由）` : null,
      osm: osm ? '建物と道：© OpenStreetMap contributors（ODbL）' : null
    }
  };
  if (checked.length) try { localStorage.setItem(key, JSON.stringify(out)); } catch { /* 容量なし */ }   // 空き地を確かめられたときだけ覚える
  return out;
}
export const mapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}`;
