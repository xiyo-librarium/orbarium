/* Orbarium エンジン（純関数＋状態）。ブラウザでもnodeでも動く。
   1ターン＝3か月。中では1日ずつ回す。数字の根拠と「仮」の印は NOTES にまとめる。 */

import * as B from './build.js';
import * as W from './world.js';
export { B, W };
const VOX = W;   // advance() の中では W が天気の名前とぶつかるので別名

/* ---------- 乱数（種つき） ---------- */
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.normal = () => { let u = 0, v = 0; while (!u) u = f(); while (!v) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  f.poisson = (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= f(); } while (p > L); return k - 1; };
  f.int = (a0, b0) => a0 + Math.floor(f() * (b0 - a0 + 1));
  f.state = () => a;
  return f;
}

/* ---------- 暦 ---------- */
export const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MID = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/* ---------- 土地 ---------- */
export const SITES = {
  tokyo: {
    name: '東京', lat: 35.7, lon: 139.75, elev: 20,
    tmean: [5.4, 6.1, 9.4, 14.3, 18.8, 21.9, 25.7, 26.9, 23.3, 18.0, 12.5, 7.7],
    tmin: [1.2, 2.1, 5.0, 9.8, 14.6, 18.5, 22.4, 23.5, 20.3, 14.8, 8.8, 3.8],
    tmax: [9.8, 10.9, 14.2, 19.4, 23.6, 26.1, 29.9, 31.3, 27.5, 22.0, 16.7, 12.0],
    rain: [60, 56, 117, 125, 138, 168, 154, 168, 210, 198, 93, 58],
    rainDays: [5, 6, 10, 10, 11, 12, 11, 8, 11, 10, 7, 5],
    sunHours: [6.3, 5.9, 5.5, 5.9, 6.0, 4.3, 5.0, 6.1, 4.3, 4.3, 4.8, 5.8],
    terrain: 'tokyo'
  },
  med: {
    /* 市街から西へ約11km、サン・クリストバル地区の山腹（標高約1,800m）。谷底の市街（約1,480m）より300mほど高いので、
       気温は市街の平年値から約2℃下げてある。小さな沢の東側の斜面で、東（右）が上り */
    name: 'メデジン', sub: 'サン・クリストバルの山腹・北緯6度・標高約1,800m', lat: 6.28, lon: -75.64, elev: 1795,
    tmean: [20.8, 21.1, 21.2, 20.8, 21.0, 21.0, 21.1, 21.1, 20.9, 20.3, 20.2, 20.5],
    tmin: [15.7, 15.9, 16.2, 16.1, 16.1, 15.8, 15.6, 15.8, 15.8, 15.6, 15.7, 15.8],
    tmax: [26.0, 26.3, 26.1, 25.6, 25.9, 26.2, 26.6, 26.4, 26.0, 25.0, 24.8, 25.3],
    rain: [65, 80, 125, 160, 200, 160, 120, 150, 180, 210, 145, 95],
    rainDays: [12, 13, 17, 22, 23, 19, 17, 19, 22, 24, 21, 15],
    sunHours: [5.5, 5.5, 5.0, 4.0, 4.5, 5.5, 6.5, 6.0, 5.0, 4.5, 4.5, 5.0],
    quarters: ['1〜3月・乾いた季節', '4〜6月・雨の季節', '7〜9月・小さな乾季', '10〜12月・雨の季節'],
    /* 仮の値：停電・断水は年あたりの回数。エルニーニョの年は断水が増える */
    outage: { power: 1.6, water: 1.2, ninoWater: 2.5 },
    enso: { nino: 0.2, nina: 0.2, ninoRain: 0.7, ninaRain: 1.3 },
    soilOM: 2.2, quake: 0.02, frostDepth: 0, humid: true,
    terrain: 'med', plotPrice: 0
  },
  taos: {
    name: 'タオス', sub: '高地の砂漠・北緯36度・標高約2,100m', lat: 36.4, lon: -105.57, elev: 2130,
    tmean: [-2.7, 0.5, 4.6, 8.2, 12.8, 18.6, 20.9, 19.8, 16.3, 9.8, 3.2, -2.2],
    tmin: [-11.0, -7.0, -3.7, -0.8, 2.8, 8.6, 11.5, 10.7, 7.1, 0.2, -5.3, -10.2],
    tmax: [5.6, 8.0, 12.9, 17.2, 22.7, 28.7, 30.3, 29.0, 25.6, 19.4, 11.7, 5.8],
    rain: [17, 11, 18, 21, 31, 22, 39, 45, 35, 34, 22, 27],
    rainDays: [4, 4, 5, 5, 6, 6, 10, 11, 7, 5, 4, 5],
    sunHours: [7.2, 7.8, 8.4, 9.6, 10.4, 11.2, 9.8, 9.2, 8.9, 8.4, 7.3, 6.9],
    quarters: ['1〜3月・冬', '4〜6月・乾いた春', '7〜9月・夏の夕立', '10〜12月・冬の入り'],
    /* 仮の値。水道が来ていないので、水は運んでもらう */
    outage: { power: 0.8, water: 0, ninoWater: 0 }, haul: true,
    enso: { nino: 0.2, nina: 0.2, ninoRain: 1.15, ninaRain: 0.8 },
    soilOM: 1.0, frostDepth: 0.75,
    terrain: 'taos', plotPrice: 100
  }
};

/* ---------- 地形（50m四方・1mメッシュ） ---------- */
export const PLOT = 50;
export function terrain(key) {
  const n = PLOT + 1, z = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let e;
    if (key === 'med') {
      // サン・クリストバルの山腹。小さな沢へ向かって西（左）に下る斜面で、北東から南西へ浅い沢筋がある
      const d = (x - 0.55 * y - 6);
      e = 1788 + 0.24 * x + 0.9 * Math.sin(y / 8) + 0.004 * (y - 25) * (y - 25)
        - 1.6 * Math.exp(-(d * d) / 40);
    } else if (key === 'tokyo') {
      // 台地を小さな川が削った谷。川はいまは暗渠で、ゆるく曲がった道になっている（場所と向きはぼかしてある）
      const yc = 31 + 5 * Math.sin(x / 9) + 0.06 * x;
      const d = Math.abs(y - yc);
      e = 21 + 0.03 * x + 7 * Math.pow(Math.min(1, d / 17), 1.3) + 0.4 * Math.sin(x / 5 + y / 7);
    } else if (key === 'taos') {
      // 南（下）に向かって下るゆるい斜面。日当たりがいい
      e = 2128 + 0.09 * (50 - y) + 0.5 * Math.sin(x / 7) + 0.3 * Math.cos(y / 5);
    } else e = 20;
    z[y * n + x] = e;
  }
  const at = (x, y) => {
    x = Math.max(0, Math.min(PLOT, x)); y = Math.max(0, Math.min(PLOT, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(PLOT, x0 + 1), y1 = Math.min(PLOT, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const g = (i, j) => z[j * n + i];
    return g(x0, y0) * (1 - fx) * (1 - fy) + g(x1, y0) * fx * (1 - fy) + g(x0, y1) * (1 - fx) * fy + g(x1, y1) * fx * fy;
  };
  const slopeDeg = (x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) / 2, dy = (at(x, y + 1) - at(x, y - 1)) / 2;
    return Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI;
  };
  const rect = (r) => {
    let s = 0, e = 0, m = 0, lo = Infinity, hi = -Infinity;
    for (let y = r.y; y <= r.y + r.h; y++) for (let x = r.x; x <= r.x + r.w; x++) {
      const v = at(x, y); e += v; s += slopeDeg(x, y); m++; lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    return { elev: e / m, slope: s / m, drop: hi - lo };
  };
  return { n, z, at, slopeDeg, rect };
}

/* ---------- 値段と寿命（万円・年） ---------- */
export const MARKET = { water: 0.1, bottled: 0.5, power: 0.004, sellPower: 0.001, buyFood: 0.05, sellFood: 0.03 };
/* water: 1m³=1000円、bottled: 断水時の買い水 1m³=5000円、power: 1kWh=40円、food: 1kg=500円 */
export const WAGE = 1.2;          // 外貨の仕事（東京の会社のリモート） 手取り日給 万円
export const LIVING = 15;         // 食・水・電気以外の暮らし 1人3か月 万円
export const FOOD_NEED = 500;     // 1人1年 kg

/* 置けるもの。size は既定の大きさ（m）。learn が null なら最初から知っている */
export const ITEMS = {
  house: { name: '家', cost: (o) => B.houseModel(houseSpec(o), { lat: 0 }, 1).materials, labor: (o) => B.houseModel(houseSpec(o), { lat: 0 }, 1).labor, life: 60, size: [4, 4], learn: null, color: '#FBFAF5', design: true },
  tank: { name: '雨水タンク', cost: () => 8, life: 25, size: [2, 2], learn: null, cap: 3 },
  garden: { name: '畑', cost: (o) => o.w * o.h * 0.1, life: 0, size: [10, 8], resizable: true, learn: null },
  heap: { name: '堆肥場', cost: () => 5, life: 15, size: [2, 2], learn: 'heap' },
  grey: { name: '排水の浄化（バイオフィルター）', cost: (o) => B.filterModel(filterSpec(o), 120).materials, labor: (o) => B.filterModel(filterSpec(o), 120).labor, life: 20, size: [2, 2], learn: 'grey', design: true },
  pv: { name: '太陽光パネル', cost: () => 11, life: 25, size: [2, 1], learn: 'offgrid', kw: 0.4 },
  batt: { name: '蓄電池', cost: () => 15, life: 12, size: [1, 1], learn: 'offgrid', kwh: 5 },
  tree: { name: '果樹', cost: () => 0.5, life: 0, size: [1, 1], learn: 'hedge' },
  hedge: { name: '生け垣', cost: (o) => (o.w + o.h) * 0.2, life: 0, size: [6, 1], resizable: true, learn: 'hedge' },
  roof: { name: '集水屋根', cost: (o) => o.w * o.h * 0.6, labor: (o) => o.w * o.h * 0.3, life: 30, size: [5, 4], resizable: true, learn: 'catch' },
  gh: { name: '温室', cost: (o) => o.w * o.h * 1.0, labor: (o) => o.w * o.h * 0.3, life: 30, size: [6, 4], resizable: true, learn: 'greenhouse' },
  chicken: { name: 'ニワトリ小屋', cost: () => 10, life: 15, size: [3, 2], learn: 'chicken' },
  pond: { name: 'ため池', cost: (o) => o.w * o.h * 0.4, labor: (o) => o.w * o.h * 0.6, life: 0, size: [4, 3], resizable: true, learn: 'pond' }
};
export function houseSpec(o) { const sp = o.spec || B.legacySpec(o); return { ...sp, w: o.w, h: o.h }; }
export function filterSpec(o) { return { ...(o.spec || B.defaultFilter()), w: o.w, h: o.h }; }
export const done = (x) => !x.build || x.build.done >= x.build.need - 1e-9;
/* 頼むと人件費が上乗せされる。自分で作ると材料費だけ */
export function buildCost(x) {
  const def = ITEMS[x.type]; const mat = def.cost(x);
  if (!def.labor) return mat;
  return x.mode === 'self' ? mat : mat + def.labor(x) * B.HIRE;
}

/* 家と畑につけられる工夫 */
export const MODS = {
  compostToilet: { name: 'コンポストトイレ', on: 'house', cost: 30, learn: 'toilet' },
  saving: { name: '節水の器具', on: 'house', cost: 8, learn: 'saving' },
  ins: { name: '断熱', on: 'house', perM2: { std: 2, high: 5 }, learn: 'insulation' },
  mulch: { name: 'マルチ（地面を覆う）', on: 'garden', costPerM2: 0.01, learn: 'mulch' },
  terrace: { name: '石垣の段々畑', on: 'garden', costPerM2: 0.15, learn: 'terrace' }
};
export const FOUNDATION = { step: 0.3, min: 0.3, max: 3.0, costPerStep: 0.05 };   // 家の値段に対する割合

/* 断熱の段階（U値 W/m²K、換気回数 回/h） */
export const INS = {
  none: { name: 'なし', wall: 2.0, roof: 2.5, floor: 1.0, win: 5.8, ach: 1.0 },
  std: { name: 'ふつう', wall: 0.5, roof: 0.3, floor: 0.3, win: 2.3, ach: 0.5 },
  high: { name: '厚い', wall: 0.2, roof: 0.15, floor: 0.15, win: 1.0, ach: 0.3 }
};
export function envelope(floor, ins) {
  const A = Math.max(floor, 1), H = 2.5, wall = 4 * Math.sqrt(A) * H, win = 0.15 * A, V = A * H, I = INS[ins || 'none'];
  return { ua: Math.max(0, wall - win) * I.wall + A * I.roof + A * I.floor + win * I.win + 0.33 * V * I.ach, win, V };
}
/* 斜面と土地から、家に必要な基礎の深さ */
export function frostNeed(site) { const f = SITES[site].frostDepth || 0; return f ? Math.ceil(f / 0.3) * 0.3 : 0; }
export function depthNeed(site, slope) { return Math.max(requiredDepth(slope), frostNeed(site)); }
export function requiredDepth(slope) {
  return Math.min(3.0, Math.max(0.3, Math.ceil((0.3 + slope / 12 * 0.3) / 0.3) * 0.3));
}

/* ---------- 気候 ---------- */
function extraterrestrial(latDeg, J) {
  const phi = latDeg * Math.PI / 180;
  const dr = 1 + 0.033 * Math.cos(2 * Math.PI * J / 365);
  const delta = 0.409 * Math.sin(2 * Math.PI * J / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  const Ra = (24 * 60 / Math.PI) * 0.0820 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  return { Ra, N: 24 / Math.PI * ws };
}
export function normals(key) {
  const s = SITES[key];
  return s.tmean.map((t, m) => {
    const { Ra, N } = extraterrestrial(s.lat, MID[m]);
    const psh = Ra * (0.25 + 0.5 * s.sunHours[m] / N) / 3.6;
    const et0 = Math.max(0, 0.0023 * (t + 17.8) * Math.sqrt(Math.max(0, s.tmax[m] - s.tmin[m])) * Ra * 0.408);
    return { t, tmin: s.tmin[m], tmax: s.tmax[m], rain: s.rain[m], rainDays: s.rainDays[m], psh, et0 };
  });
}

/* 1年分の天気をつくる（月ごとに雨量をゆらし、雨の日を散らす） */
export function weatherYear(key, r, phase) {
  const s = SITES[key], N = normals(key), out = [];
  const en = s.enso || { ninoRain: 1, ninaRain: 1 };
  const yearMul = phase === 'nino' ? en.ninoRain : phase === 'nina' ? en.ninaRain : 1;
  const tAdd = phase === 'nino' ? 0.5 : phase === 'nina' ? -0.3 : 0;
  for (let m = 0; m < 12; m++) {
    const c = N[m], dm = DAYS[m];
    const mul = yearMul * Math.exp(0.32 * r.normal() - 0.05);
    const total = c.rain * mul;
    const days = Math.max(1, Math.min(dm, Math.round(c.rainDays * Math.sqrt(mul) + r.normal())));
    const wet = new Array(dm).fill(0);
    let k = 0; while (k < days) { const d = Math.floor(r() * dm); if (!wet[d]) { wet[d] = 1; k++; } }
    const w = wet.map(x => x ? -Math.log(1 - r() * 0.999) : 0), ws = w.reduce((a, b) => a + b, 0) || 1;
    const tAn = tAdd + 0.4 * r.normal();
    for (let d = 0; d < dm; d++) {
      const rain = total * w[d] / ws;
      out.push({ m, d, rain, t: c.t + tAn, et0: c.et0 * (rain > 1 ? 0.7 : 1.08) * (1 + 0.04 * tAn), psh: c.psh * (rain > 5 ? 0.55 : rain > 0 ? 0.85 : 1.12) });
    }
  }
  return out;
}
export function ensoPhase(key, r) {
  const e = SITES[key].enso; if (!e) return 'neutral';
  const x = r(); return x < e.nino ? 'nino' : x < e.nino + e.nina ? 'nina' : 'neutral';
}
/* この土地の「めったにない大雨」の目安（日雨量の上位1%）と、30日雨量の平年値 */
const extremeCache = {};
export function extremes(key) {
  if (extremeCache[key]) return extremeCache[key];
  const r = rng(12345), all = [], m30 = [];
  for (let y = 0; y < 60; y++) {
    const w = weatherYear(key, r, ensoPhase(key, r));
    for (let i = 0; i < w.length; i++) { if (w[i].rain > 0.5) all.push(w[i].rain); }
    let acc = 0; for (let i = 0; i < w.length; i++) { acc += w[i].rain; if (i >= 30) acc -= w[i - 30].rain; if (i >= 30) m30.push(acc); }
  }
  all.sort((a, b) => a - b); m30.sort((a, b) => a - b);
  return (extremeCache[key] = { p99: all[Math.floor(all.length * 0.99)], wet30: m30[Math.floor(m30.length * 0.9)] });
}

/* ---------- 家族の週 ---------- */
export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
export function weekCount(p) {
  return { work: p.week.filter(x => x === 'work').length, farm: p.week.filter(x => x === 'farm').length, build: p.week.filter(x => x === 'build').length, rest: p.week.filter(x => x === 'rest').length };
}

/* ---------- ゲーム状態 ---------- */
export function newGame(opt = {}) {
  const site = opt.site || 'med', seed = opt.seed ?? 1;
  const s = makeGame(site, seed, opt);
  if (site !== 'tokyo' && !opt.empty) {
    // 最初の家：中古のコンテナ（20ft）。斜面の上のほうの平らな段に、等高線に沿って長く置いてある
    const w = s.world, sp = W.findContainerSpot(w);
    if (sp) W.placeContainer(w, sp.x0, sp.y0, sp.rot, { z: sp.z, door: sp.door, win: sp.win });
    s.cash -= opt.containerCost ?? 60;
  }
  return s;
}
function makeGame(site, seed, opt) {
  return {
    v: 2, site, seed, year: opt.year || 2027, q: 0, turn: 0,
    world: W.makeWorld(siteTerrain(site)),
    cash: opt.cash ?? 300,
    persons: opt.persons || [{ name: 'あなた', week: ['work', 'work', 'work', 'work', 'work', 'farm', 'rest'] }],
    items: [],             // {id,type,x,y,w,h,depth?,mods:{}, built:turn}
    nextId: 1,
    known: opt.known ? [...opt.known] : ['house', 'tank', 'garden'],
    learned: opt.learned ? [...opt.learned] : [],           // 学んだ順の記録 {id, turn, how}
    pending: [],
    tank: 0, batt: 0, soil: null,
    om: SITES[site].soilOM || 2.0,
    food: 60, phase: null, rngState: seed * 7919 + 17,
    log: [], inbox: [],
    totals: { yearStart: null },
    flags: opt.flags ? { ...opt.flags } : {}
  };
}
export function clone(s) { return JSON.parse(JSON.stringify(s)); }

let _terrainCache = {};
export function siteTerrain(key) { return _terrainCache[key] || (_terrainCache[key] = terrain(SITES[key].terrain || key)); }

/* 置いたものの集計 */
const _anaCache = new WeakMap();
export function analyzeWorld(s) {
  const key = s.world; const sig = JSON.stringify([s.world.H, s.world.blocks, s.world.mods]).length + ':' + Object.keys(s.world.blocks).length + ':' + s.world.queue.length + ':' + s.world.H.reduce((a, b, i) => a + b * (i % 7 + 1), 0) + ':' + JSON.stringify(s.world.mods) + ':' + JSON.stringify(s.world.house) + ':' + Object.values(s.world.blocks).reduce((a, b) => a + (b.p ? 1 : 0) + (b.s ? 3 : 0) + (b.m ? 5 : 0), 0);
  const c = _anaCache.get(key); if (c && c.sig === sig && c.n === s.persons.length) return c.a;
  const a = W.analyze(s.world, SITES[s.site], s.persons.length);
  _anaCache.set(key, { sig, a, n: s.persons.length }); return a;
}
export function summarize(s) {
  const T = siteTerrain(s.site), w = s.world, A = analyzeWorld(s);
  const HM = A.house ? A.house.m : null;
  let hRect = null;
  if (A.house) { const cc = A.house.cells.map(k => k.split(',').map(Number)); const xs = cc.map(c => c[0]), ys = cc.map(c => c[1]); hRect = T.rect({ x: Math.min(...xs) - 1, y: Math.min(...ys) - 1, w: Math.max(...xs) - Math.min(...xs) + 2, h: Math.max(...ys) - Math.min(...ys) + 2 }); }
  const need = hRect ? Math.max(requiredDepth(hRect.slope), frostNeed(s.site)) : 0;
  const grey = 0.9 * (w.mods.saving ? 65 : 130) * s.persons.length;
  const bare = Math.max(0, A.risers - A.stoneRisers);
  return {
    A, house: A.house, houseM: HM, floor: HM ? HM.A : 0, roof: A.roofCatch / 0.85,
    compostToilet: !!w.mods.compostToilet, saving: !!w.mods.saving,
    depth: w.mods.depth || need, need, houseSlope: hRect ? hRect.slope : 0, slopeNeed: hRect ? requiredDepth(hRect.slope) : 0, frostNeed: frostNeed(s.site),
    ghArea: A.ghBeds, gArea: A.gArea, mulchArea: A.mulch, terraceArea: A.risers ? A.gArea * A.stoneRisers / A.risers : A.gArea,
    bareRisers: bare, risers: A.risers, tankCap: A.tankCap, tankGrav: A.tankGrav, pondGrav: A.pondGrav, pumps: A.pumps,
    filter: A.filter ? { ...A.filter, m: B.filterModel(A.filter.spec, grey) } : null,
    heap: A.heap, pvKw: A.pvKw, battKwh: A.battKwh, trees: A.trees, coops: A.coops,
    pondCap: A.pondCap, pondArea: A.pondArea, pondCatch: A.pondCatch, hedgeLen: A.hedge, wallLen: A.stoneRisers * 2 + A.greenRoof * 0.5,
    pending: W.pendingDays(w), diag: A.diag
  };
}
export function careNeed(s) {
  const S = summarize(s);
  return {
    garden: S.gArea / 400 + S.mulchArea / 1600 + S.ghArea / 300,
    fixed: (S.compostToilet ? 0.3 : 0) + S.heap * 0.15 + (S.filter ? 0.1 : 0) + S.trees * 0.01 + S.hedgeLen * 0.005 + S.coops * 0.25 + (S.pondArea ? 0.05 : 0),
    get total() { return this.garden + this.fixed; }
  };
}
export function hands(s) {
  return s.persons.reduce((a, p) => a + weekCount(p).farm, 0);
}

/* 窒素のめぐり（kg/年） */
export function nutrients(s) {
  const S = summarize(s), n = s.persons.length;
  const src = [
    ['コンポストトイレ', S.compostToilet ? 4.0 * n : 0],
    ['堆肥場', Math.min(S.heap, 2) * 1.0 * n],
    ['排水の浄化', S.filter && ['garden', 'pond'].includes(S.filter.spec.out) ? 0.4 * n : 0],
    ['ニワトリのふん', S.coops * 1.5]
  ];
  const supply = src.reduce((a, x) => a + x[1], 0), need = (S.gArea + S.ghArea) * 0.01;
  return { src, supply, need, nf: need > 0 ? Math.min(1, supply / need) : 0 };
}

/* ---------- 1ターン（3か月）を進める ---------- */
export function advance(state) {
  const s = clone(state);
  const r = rng(s.rngState);
  const site = SITES[s.site], S = summarize(s), n = s.persons.length;
  if (!s.phase || s.q === 0) { s.phase = ensoPhase(s.site, r); s.flags.weatherYear = null; }
  // 1年分の天気をターンの頭で決め、四半期ぶんを使う
  if (!s.flags.weatherYear || s.q === 0) s.flags.weatherYear = weatherYear(s.site, r, s.phase);
  const W = s.flags.weatherYear;
  const m0 = s.q * 3, days = W.filter(d => d.m >= m0 && d.m < m0 + 3);
  const ex = extremes(s.site);

  const care = careNeed(s), hand = hands(s);
  const careF = care.total > 0 ? Math.max(0, Math.min(1, (hand - care.fixed) / Math.max(1e-9, care.garden))) : 1;
  const nu = nutrients(s);
  const nf = nu.nf;
  const omF = Math.max(0.7, Math.min(1.25, 0.8 + 0.1 * (s.om - 2)));

  // 水の使い方（L/日）
  const pc = S.saving ? { clean: 65, toilet: 20 } : { clean: 130, toilet: 35 };
  const clean = pc.clean * n, toiletUse = S.compostToilet ? 0 : pc.toilet * n;
  const rawGrey = 0.9 * clean;
  const F = S.filter;
  let clogged = false;
  if (F && r() < F.m.clogQ) clogged = true;
  const reserve = Math.min(S.tankCap, 20 * (clean + toiletUse));

  // 畑の土の水（mm）
  const cap = Math.max(60, Math.min(170, 80 + 18 * (s.om - 2)));
  if (s.soil == null) s.soil = cap * 0.6;
  // 段々の畑：土留めのない段差から雨と土が流れる
  let runoffC = S.gArea ? Math.min(0.5, 0.05 + 0.6 * S.bareRisers / S.gArea) : 0.1;
  if (S.gArea) runoffC *= (1 - 0.3 * S.mulchArea / S.gArea);
  const evapF = S.gArea ? 1 - 0.15 * S.mulchArea / S.gArea : 1;

  const A = {
    rain: 0, harvest: 0, overflow: 0, tankUse: 0, city: 0, bottled: 0, waterCutDays: 0, waterCutShort: 0,
    greyUse: 0, greyOut: 0, sewer: 0, irr: 0, irrTank: 0, irrGrey: 0, irrCity: 0, pumpKwh: 0,
    et: 0, aet: 0, growth: 0, growDays: 0, runoff: 0, recharge: 0, soilMin: cap, tankMin: Infinity, tankEmptyDays: 0,
    pondIn: 0, irrPond: 0, pondMin: Infinity, treated: 0, greyPond: 0, greySoak: 0, hotDays: 0, condDays: 0, coldDays: 0, ghGrow: 0, ghDays: 0, ghShort: 0, heatKwh: 0, heatElec: 0, coldHouseDays: 0,
    load: 0, pv: 0, grid: 0, sold: 0, outDays: 0, outShort: 0, maxRain: 0, wet30Max: 0, dryStressDays: 0
  };
  // 出来事の発生（停電・断水）
  const qFrac = days.length / 365;
  const pOut = r.poisson((site.outage?.power || 0) * qFrac);
  const wRate = s.phase === 'nino' ? (site.outage?.ninoWater || 0) : (site.outage?.water || 0);
  const wOut = r.poisson(wRate * qFrac);
  const outPow = new Set(), outWat = new Set();
  for (let i = 0; i < pOut; i++) { const st = r.int(0, days.length - 1), len = r.int(1, 2); for (let k = 0; k < len; k++) outPow.add(st + k); }
  for (let i = 0; i < wOut; i++) { const st = r.int(0, days.length - 1), len = r.int(1, 4); for (let k = 0; k < len; k++) outWat.add(st + k); }

  const capT = S.tankCap;
  let pond = Math.min(s.pond || 0, S.pondCap);
  const HM = S.houseM;
  const tSwing = (m) => (site.tmax[m] - site.tmin[m]) / 2;
  let tank = Math.min(s.tank, capT), batt = Math.min(s.batt, S.battKwh * 1000) / 1000;
  const pumpHead = 4;   // ポンプで上げる高さ（m、配管の抵抗を含む目安）
  const tankShare = S.pumps ? 1 : S.tankGrav, pondShare = S.pumps ? 1 : S.pondGrav;
  let acc30 = []; let sum30 = 0; let landslideRisk = 0, bigRainDay = null;

  days.forEach((d, i) => {
    A.rain += d.rain; A.maxRain = Math.max(A.maxRain, d.rain);
    acc30.push(d.rain); sum30 += d.rain; if (acc30.length > 30) sum30 -= acc30.shift();
    A.wet30Max = Math.max(A.wet30Max, sum30);
    if (d.rain >= ex.p99) { const risk = Math.min(1, (d.rain / ex.p99 - 0.9) * (sum30 > ex.wet30 ? 1.6 : 0.8)); if (risk > landslideRisk) { landslideRisk = risk; bigRainDay = i; } }
    // 屋根の雨
    const h = d.rain * S.roof * 0.85; A.harvest += h;
    if (capT > 0) { tank += h; if (tank > capT) { A.overflow += tank - capT; tank = capT; } } else A.overflow += h;
    // 家の水
    const cut = outWat.has(i); if (cut) A.waterCutDays++;
    let tNeed = toiletUse, g = 0, untreated = rawGrey;
    if (F && (F.inGrav || S.pumps)) {
      const capD = (d.t < 10 ? F.m.capCold : F.m.capWarm) * (clogged ? 0.4 : 1);
      g = Math.min(rawGrey, capD); untreated = rawGrey - g; A.treated += g;
      if (F.spec.out === 'toilet' && F.m.okToilet && S.pumps) { const a = Math.min(g, tNeed); g -= a; tNeed -= a; A.greyUse += a; }
      if (F.spec.out === 'pond' && S.pondCap) { const a = Math.min(g, S.pondCap - pond); pond += a; g -= a; A.greyPond += a; }
      if (F.spec.out === 'soak' || (F.spec.out === 'pond' && !S.pondCap)) { A.recharge += g / 1000; A.greySoak += g; g = 0; }
      if (F.spec.out === 'toilet' && (!F.m.okToilet || !S.pumps)) { A.recharge += g / 1000; g = 0; }
    }
    const need = clean + tNeed;
    const fromTank = Math.min(tank, need); tank -= fromTank; A.tankUse += fromTank;
    const rest = need - fromTank;
    if (cut) { A.bottled += rest * 0.25; A.waterCutShort += rest; }    // 断水中は節約して1/4だけ買い水
    else A.city += rest;
    A.sewer += untreated + (S.compostToilet ? 0 : toiletUse);
    // 畑
    if (S.gArea > 0) {
      const inf = d.rain * (1 - runoffC);
      const ro = d.rain * runoffC * S.gArea;   // L
      A.runoff += ro / 1000;
      s.soil += inf;
      const cold = d.t < 5;
      const etc = d.et0 * 0.85 * evapF * (cold ? 0.3 : 1);

      // 乾いてきたら水やり
      if (s.soil < cap * 0.5) {
        let want = (cap * 0.7 - s.soil) * S.gArea;   // L
        const a = F && F.spec.out === 'garden' ? Math.min(g, want * (S.pumps ? 1 : F.outGrav)) : 0; g -= a; want -= a; A.irrGrey += a; if (a) A.greyUse += a;
        const fp = Math.min(pond, want * pondShare); pond -= fp; want -= fp; A.irrPond += fp; s.soil += fp / S.gArea; if (S.pumps && S.pondGrav < 1) A.pumpKwh += fp * (1 - S.pondGrav) / 1000 * 9.81 * pumpHead / 3600 / 0.5;
        let fromT = 0;
        if (capT > 0) { fromT = Math.min(Math.max(0, tank - reserve), want * tankShare); tank -= fromT; want -= fromT; A.irrTank += fromT; if (S.pumps && S.tankGrav < 1) A.pumpKwh += fromT * (1 - S.tankGrav) / 1000 * 9.81 * pumpHead / 3600 / 0.5; }
        s.soil += (a + fromT) / S.gArea;
        A.irr += a + fromT;
      }
      const stress = Math.max(0, Math.min(1, s.soil / (cap * 0.45)));
      const aet = Math.min(s.soil, etc * stress);
      s.soil -= aet; A.et += etc; A.aet += aet;
      if (stress < 0.6) A.dryStressDays++;
      if (s.soil > cap) { A.recharge += (s.soil - cap) * S.gArea / 1000; s.soil = cap; }
      A.soilMin = Math.min(A.soilMin, s.soil);
      A.growth += cold ? 0 : (etc > 0 ? aet / etc : 1); A.growDays++;
    }
    if (d.t < 5) A.coldDays++;
    // 温室：雨は入らない。外より12℃暖かく、蒸発は半分
    if (S.ghArea > 0) {
      const warm = d.t + 12 >= 5;
      let want = warm ? d.et0 * 0.85 * 0.5 * S.ghArea : 0;
      const w0 = want;
      const a = Math.min(g, want); g -= a; want -= a;
      const fp = Math.min(pond, want); pond -= fp; want -= fp;
      const ft = capT > 0 ? Math.min(tank, want) : 0; tank -= ft; want -= ft;
      A.ghGrow += warm ? (w0 > 0 ? 1 - want / w0 : 1) : 0; A.ghDays++;
      A.ghShort += want;
    }
    if (S.pondCap) {
      // 坂の上から流れてくる雨（地面に浸みなかった分）と、池に直接降る雨
      const inflow = d.rain * S.pondArea + d.rain * 0.25 * Math.max(0, S.pondCatch - S.pondArea);
      const take = Math.min(inflow, S.pondCap - pond); pond += take; A.pondIn += take;
      pond = Math.max(0, pond - d.et0 * 1.05 * S.pondArea); A.pondMin = Math.min(A.pondMin, pond);
    }
    if (g > 0) { A.recharge += g / 1000; A.greySoak += g; }   // 使い切れなかった処理水は地面に浸みる
    A.greyOut += g;
    A.tankMin = Math.min(A.tankMin, tank);
    if (capT > 0 && tank < 1) A.tankEmptyDays++;
    // 電気
    let heatKwh = 0;
    if (HM) {
      const tmax = d.t + tSwing(d.m), tmin = d.t - tSwing(d.m);
      const hd = B.houseDay(HM, { t: d.t, tmax, psh: d.psh }, n);
      heatKwh = hd.heat; A.heatKwh += heatKwh;
      if (hd.peak > B.HOT) A.hotDays++;
      if (HM.condenseProne && ((site.humid && tmin < 20) || tmin < 5)) A.condDays++;
    }
    const cop = Math.min(3.5, Math.max(1.8, 2.6 + 0.05 * d.t));
    const load = 2 + 1.0 * n + 0.6 * n + heatKwh / cop;
    A.heatElec += heatKwh / cop;
    const pv = S.pvKw * d.psh * 0.75;
    const dayL = load * 0.4, night = load * 0.6;
    const direct = Math.min(pv, dayL), sur = pv - direct;
    const room = S.battKwh - batt;
    const ch = Math.min(sur, room / 0.9); batt += ch * 0.9;
    const spill = sur - ch;
    const fromB = Math.min(batt, night); batt -= fromB;
    let short = (dayL - direct) + (night - fromB);
    if (outPow.has(i)) { A.outDays++; A.outShort += short; short = 0; }
    else { A.grid += short; A.sold += spill; }
    A.load += load; A.pv += pv;
  });
  A.load += A.pumpKwh; A.grid += A.pumpKwh;
  if (A.tankMin === Infinity) A.tankMin = 0;

  // 収穫（3か月分）
  let pest = false;
  const pestP = S.gArea ? Math.max(0.05, 0.28 - 0.03 * S.trees - 0.012 * S.hedgeLen) : 0;
  if (S.gArea && r() < pestP) pest = true;
  const growF = A.growDays ? A.growth / A.growDays : 0;
  const pestF = pest ? (s.flags.pestHand ? 0.92 : 0.8) : 1;
  const baseYield = 2.0 * (1 + 0.75 * nf);
  const ghF = A.ghDays ? A.ghGrow / A.ghDays : 0;
  const harvest = S.gArea * baseYield * (days.length / 365) * growF * careF * omF * pestF
    + S.ghArea * baseYield * 1.3 * (days.length / 365) * ghF * careF * omF;
  const treeFood = VOX.blocksOf(s.world, 'tree').reduce((a, x) => a + (s.turn - (x.b.at ?? 0) >= 8 ? 12 : 2), 0) * (days.length / 365);   // 果樹は植えて2年たつと実る
  const eat = FOOD_NEED * n * days.length / 365;
  let fox = false;
  if (S.coops && r() < Math.max(0.03, 0.14 - 0.006 * S.hedgeLen)) fox = true;
  const eggs = S.coops * 50 * (days.length / 365) * (fox ? 0.6 : 1) * Math.min(1, careF + 0.3);
  s.food += harvest + treeFood + eggs - eat;
  let foodBought = 0, foodShared = 0, foodSold = 0;
  if (s.food < 0) { foodBought = -s.food; s.food = 0; }
  const keep = FOOD_NEED * n * 0.25;
  if (s.food > keep) { foodSold = s.food - keep; s.food = keep; }   // 余りは近所の市場で売る

  // 土の有機物（％）
  const inputKg = (S.heap ? Math.min(S.heap, 2) * 60 * n : 0) * qFrac * 4 / 4
    + (S.compostToilet ? 30 * n * qFrac : 0)
    + S.mulchArea * 1.5 * qFrac
    + 0.3 * harvest + S.trees * 3 * qFrac + S.coops * 40 * qFrac;
  if (S.gArea > 0) {
    const gain = 0.3 * inputKg / S.gArea / 2.6;
    const decay = 0.035 * s.om * qFrac;
    const erosion = (A.runoff * 1000 / S.gArea) * 0.0004;
    s.om = Math.max(0.8, Math.min(8, s.om + gain - decay - erosion));
  }

  // お金
  const wk = s.persons.map(weekCount);
  const workDays = wk.reduce((a, x) => a + x.work, 0);
  const weeks = days.length / 7 * (48 / 52);
  const income = workDays * WAGE * weeks;
  const jobCost = wk.filter(x => x.work > 0).length * 1.0;
  const living = LIVING * n;
  const cWater = A.city / 1000 * (site.haul ? MARKET.bottled : MARKET.water) + A.bottled / 1000 * MARKET.bottled;
  const cPower = A.grid * MARKET.power + A.outShort * 0.03;   // 停電で使えなかった分は外食や氷で 1kWhあたり300円
  const sell = A.sold * MARKET.sellPower + foodSold * MARKET.sellFood;
  const cFood = foodBought * MARKET.buyFood;
  const houseCost = S.house ? Math.max(30, S.houseM.A * 6) : 0;
  const rent = S.house ? 0 : 4;   // 家ができるまでは仮住まい
  const maint = houseCost * 0.01 * qFrac;
  // 寿命の来た設備（ブロックごと）
  let replace = 0; const replaced = [];
  for (const k in s.world.blocks) {
    const b = s.world.blocks[k], d = VOX.BLOCKS[b.t]; if (!d.life || b.p || typeof d.life !== 'number') continue;
    const age = (s.turn - (b.at ?? 0)) / 4;
    if (age > 0 && Math.floor(age) !== Math.floor(age - 0.25) && Math.floor(age) % d.life === 0) { replace += d.cost; if (!replaced.includes(d.name)) replaced.push(d.name); }
  }
  // 出来事：土砂崩れ
  const events = [];
  let repair = 0;
  landslideRisk *= Math.min(1, S.houseSlope / 12);
  if (landslideRisk > 0.02 && S.house) {
    const short = Math.max(0, S.slopeNeed - S.depth);
    const protect = Math.min(0.6, S.terraceArea / 400 * 0.4 + (S.trees + S.hedgeLen / 3) * 0.02);
    const hit = r() < landslideRisk * (short > 0 ? 1 : 0.15) * (1 - protect);
    if (hit) {
      repair = short > 0 ? Math.round(houseCost * (0.08 + 0.12 * short / 0.3)) : Math.round(houseCost * 0.03);
      events.push({ kind: 'landslide', day: bigRainDay, sev: short > 0 ? 2 : 1, repair, short });
    } else if (short > 0) events.push({ kind: 'crack', day: bigRainDay, sev: 1, short });
  }
  if (S.house && S.frostNeed && A.coldDays > 20) {
    const short = Math.max(0, S.frostNeed - S.depth);
    if (short > 0 && r() < 0.6) { const rp = Math.round(houseCost * (0.05 + 0.1 * short / 0.3)); repair += rp; events.push({ kind: 'heave', repair: rp, short }); }
  }
  // 家の傷み：結露・雨・掃除
  if (HM && A.condDays > 30) { const rp = 3; repair += rp; if (s.flags.condYear !== s.year) { events.push({ kind: 'condensation', days: A.condDays, repair: rp }); s.flags.condYear = s.year; } }
  if (HM && HM.rotRisk > 0.2 && A.rain > 250 && r() < HM.rotRisk * 0.45) { const rp = Math.max(2, Math.round(houseCost * 0.04)); repair += rp; events.push({ kind: 'rot', repair: rp }); }
  if (clogged) { repair += 2; events.push({ kind: 'clog', repair: 2 }); }
  // 暑すぎる日：同じ年にはしつこく言わない（ひどいときだけ）
  if (HM && A.hotDays > 15 && s.flags.hotYear !== s.year) { events.push({ kind: 'overheat', days: A.hotDays }); s.flags.hotYear = s.year; }
  // 自分で作っているもの：週の「作業」の日で進む
  const buildDays = wk.reduce((a, x) => a + (x.build || 0), 0) * weeks;
  const pending0 = VOX.pendingDays(s.world);
  const pr = VOX.progress(s.world, buildDays);
  if (pending0 > 0 && pr.left <= 1e-9) events.push({ kind: 'built', names: ['作っていたもの'] });
  if (pending0 > 0 && buildDays < 0.5) events.push({ kind: 'stalled', names: ['作りかけのもの'] });
  const outflow = { income, sell, jobCost, living, water: cWater, power: cPower, food: cFood, maint, replace, repair, rent };
  const net = income + sell - jobCost - living - cWater - cPower - cFood - maint - replace - repair - rent;
  s.cash += net;

  if (A.outDays) events.push({ kind: 'blackout', days: A.outDays, covered: A.outShort < 0.5, short: A.outShort });
  if (S.gArea && A.coldDays > 30) events.push({ kind: 'frost', days: A.coldDays });
  if (A.heatKwh > 0 && A.heatElec * MARKET.power > 3 && (!HM || HM.UA > 60)) events.push({ kind: 'cold', cost: A.heatElec * MARKET.power });
  if (site.haul && A.city / 1000 * MARKET.bottled > 2) events.push({ kind: 'haul', m3: A.city / 1000, cost: A.city / 1000 * MARKET.bottled });
  if (A.waterCutDays) events.push({ kind: 'watercut', days: A.waterCutDays, bottled: A.bottled / 1000, covered: A.waterCutShort < 1 });
  if (A.tankEmptyDays > 10) events.push({ kind: 'tankempty', days: A.tankEmptyDays, haul: !!site.haul });
  if (A.dryStressDays > 25) events.push({ kind: 'dry', days: A.dryStressDays });
  if (A.runoff > 0 && S.gArea && A.runoff * 1000 / S.gArea > 110) events.push({ kind: 'erosion', mm: A.runoff * 1000 / S.gArea });
  if (pest) events.push({ kind: 'pest' });
  if (fox) events.push({ kind: 'fox' });
  if (S.gArea && nf < 0.5 && harvest > 0) events.push({ kind: 'lowN', nf });
  if (foodSold > 30) events.push({ kind: 'sold', kg: foodSold, yen: foodSold * MARKET.sellFood });
  if (replaced.length) events.push({ kind: 'replace', names: replaced, cost: replace });
  if (hand < care.total - 0.05 && S.gArea) events.push({ kind: 'overwork', need: care.total, have: hand });

  const rep = {
    year: s.year, q: s.q, phase: s.phase, label: site.quarters ? site.quarters[s.q] : `${s.q * 3 + 1}〜${s.q * 3 + 3}月`,
    days: days.length, A, harvest, treeFood, eggs, ghF, foodBought, foodShared, foodSold, eat, careF, nf, growF, omF, money: outflow, net,
    om: s.om, soil: s.soil, cap, runoffC, events, tankEnd: tank, battEnd: batt,
    waterSelf: (A.tankUse + A.greyUse) / Math.max(1, A.tankUse + A.greyUse + A.city + A.waterCutShort),
    buildDays, rent,
    powerSelf: A.load ? 1 - (A.grid + A.outShort) / A.load : 0,
    foodSelf: eat ? Math.min(1, (harvest + treeFood + eggs) / eat) : 0
  };
  const sp = s.world.spent || { local: 0, far: 0 }, sp0 = s.flags.spentPrev || { local: 0, far: 0 };
  rep.spent = { local: sp.local - sp0.local, far: sp.far - sp0.far }; s.flags.spentPrev = { ...sp };
  s.tank = tank; s.batt = batt * 1000; s.pond = pond;
  s.flags.sharedTotal = (s.flags.sharedTotal || 0) + foodShared;
  s.flags.dryCount = (s.flags.dryCount || 0) + (rep.events.some(e => e.kind === 'tankempty' || e.kind === 'erosion') ? 1 : 0);
  s.log.push(compact(rep));
  // きっかけ（学び）：気づきは溜めておき、1ターンに1つだけ教わる
  s.pending = s.pending || [];
  for (const l of triggers(s, rep)) if (!s.pending.some(p => p.id === l.id)) s.pending.push(l);
  // 暮らしが傷んでいるものから先に教わる
  const PRI = { insulation: 1, deep: 1, offgrid: 2, grey: 2, catch: 2, greenhouse: 2, terrace: 3, mulch: 3, hedge: 3, saving: 3 };
  s.pending.sort((a, b) => (PRI[a.id] ?? 4) - (PRI[b.id] ?? 4));
  if (s.turn === 0 && !s.known.includes('heap')) { s.pending = s.pending.filter(p => p.id !== 'heap'); s.pending.unshift({ id: 'heap', why: 'intro' }); }
  rep.learn = s.pending.length ? [s.pending.shift()] : [];
  // 次のターンへ
  s.turn++; s.q++; if (s.q >= 4) { s.q = 0; s.year++; }
  s.rngState = r.state();
  return { state: s, report: rep };
}
function compact(rep) {
  const A = rep.A;
  return { y: rep.year, q: rep.q, net: rep.net, ws: rep.waterSelf, ps: rep.powerSelf, fs: rep.foodSelf, om: rep.om, harvest: rep.harvest, ev: rep.events.map(e => e.kind), phase: rep.phase, money: rep.money,
    A: { rain: A.rain, city: A.city, harvest: A.harvest, grid: A.grid, sewer: A.sewer, runoff: A.runoff, recharge: A.recharge, bottled: A.bottled, tankUse: A.tankUse, greyUse: A.greyUse, irrTank: A.irrTank, irrGrey: A.irrGrey, irrPond: A.irrPond, load: A.load, pv: A.pv },
    foodBought: rep.foodBought, foodSold: rep.foodSold, foodShared: rep.foodShared, spent: rep.spent };
}

/* ---------- 学びのきっかけ ---------- */
export const TECH = ['heap', 'toilet', 'grey', 'saving', 'catch', 'mulch', 'terrace', 'offgrid', 'deep', 'hedge', 'chicken', 'pond', 'insulation', 'greenhouse'];
function triggers(s, rep) {
  const out = [], has = (id) => s.known.includes(id);
  const ev = (k) => rep.events.find(e => e.kind === k);
  if (!has('heap') && ev('lowN')) out.push({ id: 'heap', why: 'lowN' });
  if (!has('toilet') && has('heap') && s.turn >= 4) out.push({ id: 'toilet', why: 'sewer' });
  if (!has('grey') && (ev('tankempty') || ev('watercut'))) out.push({ id: 'grey', why: ev('tankempty') ? 'tankempty' : 'watercut' });
  if (!has('saving') && ev('watercut')) out.push({ id: 'saving', why: 'watercut' });
  if (!has('mulch') && ev('dry')) out.push({ id: 'mulch', why: 'dry' });
  if (!has('terrace') && (ev('erosion') || (ev('dry') && has('mulch')))) out.push({ id: 'terrace', why: ev('erosion') ? 'erosion' : 'dry' });
  if (!has('offgrid') && ev('blackout')) out.push({ id: 'offgrid', why: 'blackout' });
  if (!has('deep') && (ev('crack') || ev('landslide'))) out.push({ id: 'deep', why: ev('landslide') ? 'landslide' : 'crack' });
  if (!has('catch') && (ev('haul') || (ev('tankempty') && s.turn >= 3))) out.push({ id: 'catch', why: ev('haul') ? 'haul' : 'tankempty2' });
  if (!has('insulation') && (ev('cold') || ev('overheat') || ev('condensation'))) out.push({ id: 'insulation', why: ev('cold') ? 'cold' : ev('overheat') ? 'overheat' : 'condensation' });
  if (!has('greenhouse') && ev('frost')) out.push({ id: 'greenhouse', why: 'frost' });
  if (!has('deep') && ev('heave')) out.push({ id: 'deep', why: 'heave' });
  if (!has('hedge') && (ev('pest') || ev('fox'))) out.push({ id: 'hedge', why: ev('pest') ? 'pest' : 'fox' });
  if (!has('chicken') && (s.flags.sharedTotal || 0) >= 150) out.push({ id: 'chicken', why: 'gift' });
  if (!has('pond') && (has('terrace') || has('mulch')) && (s.flags.dryCount || 0) >= 3 && s.turn >= 6) out.push({ id: 'pond', why: 'pond' });
  return out;
}
export function learn(s, id, how) {
  if (s.known.includes(id)) return s;
  const t = clone(s);
  t.known.push(id); t.learned.push({ id, turn: s.turn, how });
  return t;
}
/* 「先読み」：天気の記録や図鑑から学べるもの */
export function foresight(s) {
  const site = SITES[s.site], out = [];
  if (site.outage?.power) out.push({ id: 'offgrid', text: `停電が年に${site.outage.power}回ほどある土地` });
  if (site.outage?.ninoWater) out.push({ id: 'grey', text: 'エルニーニョの年は雨が3割減り、断水が増える' });
  if (site.haul) out.push({ id: 'grey', text: '水道がなく、水は運んでもらうと1m³あたり5,000円' });
  const coldM = site.tmean.filter(t => t < 5).length;
  if (coldM) { out.push({ id: 'greenhouse', text: `平均気温が5℃を下回る月が${coldM}か月。そのあいだ外の畑は育たない` }); out.push({ id: 'insulation', text: `いちばん寒い月の平均 ${Math.min(...site.tmean)}℃。暖房の熱が逃げやすい` }); }
  if (site.frostDepth) out.push({ id: 'deep', text: `冬は地面が${site.frostDepth}mほどの深さまで凍る` });
  const N = normals(s.site); const dryQ = N.slice(6, 9).reduce((a, c) => a + c.rain - c.et0 * 30 * 0.85, 0);
  if (dryQ < 60) out.push({ id: 'mulch', text: '7〜9月は雨のわりに蒸発が多く、畑が乾きやすい' });
  if (!site.frostDepth) out.push({ id: 'deep', text: `この斜面で大雨（日${Math.round(extremes(s.site).p99)}mm以上）が続くと地盤が動く` });
  const seen = new Set(); return out.filter(x => !seen.has(x.id) && seen.add(x.id));
}

/* ---------- 関係の網 ---------- */
export function relations(s) {
  const S = summarize(s), last = s.log.slice(-4);
  const avg = (f) => last.length ? last.reduce((a, x) => a + f(x), 0) / last.length : 0;
  const ws = avg(x => x.ws), ps = avg(x => x.ps), fs = avg(x => x.fs);
  const shared = last.reduce((a, x) => a + (x.foodShared || 0), 0);
  const localYen = last.reduce((a, x) => a + (x.money?.sell || 0) + (x.money?.rent || 0) + (x.spent?.local || 0) + 0.5 * (x.money?.food || 0), 0);
  const runoff = last.reduce((a, x) => a + x.A.runoff, 0), recharge = last.reduce((a, x) => a + x.A.recharge, 0);
  const sewer = last.reduce((a, x) => a + x.A.sewer, 0) / 1000;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const care = careNeed(s), hand = hands(s);
  const tend = care.total ? clamp(hand / care.total) : 0;
  const nodes = [
    { id: 'rain', name: '雨', v: clamp(ws), good: true, why: `暮らしの水の${Math.round(ws * 100)}%を雨と排水でまかなった` },
    { id: 'sun', name: '太陽', v: clamp(ps), good: true, why: `電気の${Math.round(ps * 100)}%を太陽から` },
    { id: 'soil', name: '土', v: clamp((s.om - 1.5) / 4), good: s.om >= (SITES[s.site].soilOM || 2), why: `土の有機物 ${s.om.toFixed(1)}%（はじめ ${SITES[s.site].soilOM}%）` },
    { id: 'crops', name: '作物', v: clamp(fs) * (S.gArea ? 1 : 0), good: true, why: `食べものの${Math.round(fs * 100)}%を畑から` },
    { id: 'worms', name: 'ミミズと微生物', v: clamp((S.heap ? 0.35 : 0) + (S.compostToilet ? 0.25 : 0) + (S.mulchArea / Math.max(1, S.gArea)) * 0.4) * tend, good: true, why: '堆肥とマルチが土の中の生き物を養う' },
    { id: 'insects', name: '虫（受粉と天敵）', v: clamp(S.hedgeLen / 30 + S.trees / 12 + (S.gArea ? 0.1 : 0)), good: true, why: '生け垣と果樹が花と隠れ家になる' },
    { id: 'birds', name: '鳥', v: clamp(S.trees / 10 + S.hedgeLen / 40), good: true, why: '木が増えると鳥がとまる' },
    { id: 'hens', name: 'ニワトリ', v: clamp(S.coops * 0.6 * tend), good: true, why: S.coops ? '残り物を食べ、卵とふんを返してくれる' : 'まだいない' },
    { id: 'frogs', name: 'カエルとトンボ', v: clamp(S.pondArea / 15 + (S.filter ? S.filter.m.life : 0)), good: true, why: S.pondArea || S.filter ? 'ため池やバイオフィルターの水辺に生き物が集まる' : '水辺がない' },
    { id: 'lizards', name: 'トカゲと苔', v: clamp(S.wallLen / 60), good: true, why: '石垣のすき間が住みかになる' },
    { id: 'neighbors', name: '近所の人', v: clamp(localYen / 40), good: true, why: localYen > 0.5 ? `この1年、近所とのやりとり ${Math.round(localYen)}万円（野菜を売る・工事を頼む・材料を買う）` : 'まだ付き合いは薄い' },
    { id: 'friend', name: '友人', v: s.site === 'med' ? 0.5 : 0.2, good: true, why: s.site === 'med' ? '土地を貸してくれた' : 'メデジンから時々メールが来る' },
    { id: 'river', name: '下流の川', v: clamp((sewer * 0.6 + runoff * 0.15) / 40), good: false, why: `下水 ${sewer.toFixed(0)}m³・畑から流れた雨 ${runoff.toFixed(0)}m³` },
    { id: 'ground', name: '地下の水', v: clamp(recharge / 150), good: true, why: `畑から地下へ浸みた水 ${recharge.toFixed(0)}m³` },
    { id: 'money', name: 'お金', v: clamp(1 - (ws + ps + fs) / 3), good: null, why: '買って済ませている割合' }
  ];
  const score = nodes.filter(x => x.good === true).reduce((a, x) => a + x.v, 0) - nodes.filter(x => x.good === false).reduce((a, x) => a + x.v, 0);
  return { nodes, score };
}

/* ---------- めぐり（orb）：暮らしを複数の循環の重ね合わせとして見る ----------
   direct = 自分の手で回している度合い。残りはお金を通して、遠くのどこかで回っている */
export const ORBS = [
  { id: 'water', name: '水のめぐり', color: '#2B6CB0', members: ['rain', 'ground', 'river'] },
  { id: 'energy', name: '光と熱のめぐり', color: '#C08A1E', members: ['sun'] },
  { id: 'soil', name: '土と養分のめぐり', color: '#8A6A42', members: ['soil', 'worms'] },
  { id: 'food', name: '食のめぐり', color: '#3F7D4E', members: ['crops', 'hens'] },
  { id: 'life', name: '生き物のめぐり', color: '#2E8B7A', members: ['insects', 'birds', 'lizards', 'frogs'] },
  { id: 'social', name: '人のめぐり', color: '#A0527A', members: ['neighbors', 'friend'] }
];
export function orbs(s) {
  const rel = relations(s), N = Object.fromEntries(rel.nodes.map(x => [x.id, x]));
  const avg = (ids) => ids.reduce((a, id) => a + (N[id]?.v || 0), 0) / ids.length;
  const direct = {
    water: N.rain.v * 0.75 + N.ground.v * 0.25,
    energy: N.sun.v,
    soil: avg(['soil', 'worms']),
    food: Math.min(1, N.crops.v * 0.8 + N.hens.v * 0.2),
    life: avg(['insects', 'birds', 'lizards', 'frogs']),
    social: avg(['neighbors', 'friend'])
  };
  const list = ORBS.map(o => ({ ...o, direct: Math.max(0, Math.min(1, direct[o.id])), hurt: Math.max(0, ...o.members.map(id => N[id].good === false ? N[id].v : 0)), nodes: o.members.map(id => N[id]) }));
  const D = Object.fromEntries(list.map(o => [o.id, o.direct]));
  const S = summarize(s);
  const links = [
    ['water', 'food', S.gArea ? Math.min(D.water, D.food) : 0, '雨と排水で畑を育てる'],
    ['soil', 'food', Math.min(D.soil, D.food), '堆肥が実りになり、残りが土に還る'],
    ['food', 'social', N.neighbors.v, '採れた野菜を分ける'],
    ['life', 'food', Math.min(D.life, D.food), '虫が受粉し、天敵が害虫を食べる'],
    ['water', 'soil', Math.min(N.ground.v, D.soil), '雨が土に浸み、地下へ還る'],
    ['water', 'life', N.frogs.v, 'ため池に水の生き物が集まる'],
    ['energy', 'water', S.pvKw && S.tankCap ? Math.min(D.energy, D.water) * 0.6 : 0, '太陽の電気でポンプを回す']
  ].filter(l => l[2] > 0.05).map(([a, b, v, why]) => ({ a, b, v, why }));
  return { money: N.money.v, orbs: list, links };
}
/* ---------- 4つの輪：水・養分・エネルギー・お金 ----------
   どの暮らしにも4つとも流れている。違うのは、輪が敷地と地域の中で閉じる割合。
   closure = 地域で回った割合（0〜1）、flow = 1年に流れる量 */
export function cycles(s) {
  const last = s.log.slice(-4), k = last.length ? 4 / last.length : 0;
  const sum = (f) => last.reduce((a, x) => a + (f(x) || 0), 0) * k;
  const R = relations(s), Nn = Object.fromEntries(R.nodes.map(x => [x.id, x]));
  const part = (ids) => ids.map(id => Nn[id]).filter(x => x && x.v > 0.15).map(x => x.name);
  const S = summarize(s), n = s.persons.length;
  // 水（m³）
  const use = sum(x => x.A.tankUse + x.A.greyUse + x.A.city + x.A.bottled + x.A.irrTank + x.A.irrGrey + x.A.irrPond) / 1000;
  const loc = sum(x => x.A.tankUse + x.A.greyUse + x.A.irrTank + x.A.irrGrey + x.A.irrPond) / 1000;
  const sewer = sum(x => x.A.sewer) / 1000, runoff = sum(x => x.A.runoff), rech = sum(x => x.A.recharge);
  const wSup = use ? loc / use : 0, wRet = rech + sewer + runoff ? rech / (rech + sewer + runoff) : 0;
  // 養分（窒素 kg）
  const nu = nutrients(s), Nout = 5.4 * n, back = Math.min(Nout, nu.supply);
  const fs = last.length ? sum(x => x.fs) / 4 : 0;
  // エネルギー（kWh）
  const load = sum(x => x.A.load), grid = sum(x => x.A.grid);
  const ps = load ? Math.max(0, 1 - grid / load) : 0;
  // お金（万円）：近所と遠く
  const m = (f) => sum(x => f(x.money || {}));
  const inFar = m(x => x.income), inLoc = m(x => x.sell);
  const outLoc = m(x => (x.rent || 0) + 0.5 * (x.food || 0) + 0.2 * (x.living || 0) + 0.5 * (x.maint || 0) + 0.5 * (x.repair || 0)) + sum(x => x.spent?.local || 0);
  const outFar = m(x => (x.jobCost || 0) + 0.5 * (x.food || 0) + 0.8 * (x.living || 0) + (x.water || 0) + (x.power || 0) + 0.5 * (x.maint || 0) + (x.replace || 0) + 0.5 * (x.repair || 0)) + sum(x => x.spent?.far || 0);
  const mTot = inFar + inLoc + outLoc + outFar;
  return [
    { id: 'water', name: '水', color: '#2B6CB0', unit: 'm³', flow: use, closure: 0.5 * wSup + 0.5 * wRet,
      parts: part(['rain', 'ground', 'frogs']), leaks: [['下水へ', sewer, 'm³'], ['畑から流れ出た雨', runoff, 'm³']], note: `使う水の${Math.round(wSup * 100)}%を雨と排水から。出ていく水の${Math.round(wRet * 100)}%を地面に返した` },
    { id: 'nutrient', name: '養分', color: '#8A6A42', unit: 'kg N', flow: Nout + nu.need, closure: 0.5 * fs + 0.5 * (Nout ? back / Nout : 0),
      parts: part(['soil', 'worms', 'crops', 'hens', 'insects', 'birds']), leaks: [['下水・ごみへ', Math.max(0, Nout - back), 'kg N']], note: `食べものの${Math.round(fs * 100)}%を畑から。し尿と生ごみの養分の${Math.round(Nout ? back / Nout * 100 : 0)}%を土に返した` },
    { id: 'energy', name: 'エネルギー', color: '#C08A1E', unit: 'kWh', flow: load, closure: ps,
      parts: part(['sun']).concat(S.houseM && S.houseM.massLv >= 2 ? ['土の壁（熱を溜める）'] : []), leaks: [['買った電気', grid, 'kWh']], note: `電気の${Math.round(ps * 100)}%を太陽から。設備の更新にはお金が要る` },
    { id: 'money', name: 'お金', color: '#6B7462', unit: '万円', flow: mTot / 2, closure: mTot ? (inLoc + outLoc) / mTot : 0,
      parts: (inLoc + outLoc > 1 ? ['近所の人'] : []).concat(inFar > 0 ? ['遠くの会社（外貨）'] : []), leaks: [['遠くへ払った', outFar, '万円'], ['遠くから稼いだ', inFar, '万円']], note: `お金の流れの${Math.round(mTot ? (inLoc + outLoc) / mTot * 100 : 0)}%が近所の中で回った` }
  ];
}
export function tokyoCycles() {
  const T = tokyoYear();
  return [
    { id: 'water', name: '水', color: '#2B6CB0', unit: 'm³', flow: T.flows.water, closure: 0, parts: [], leaks: [['下水へ', T.flows.sewer, 'm³']], note: 'どこかのダムから来て、処理場から海へ。この部屋の中では1滴も回らない' },
    { id: 'nutrient', name: '養分', color: '#8A6A42', unit: 'kg N', flow: 5.4, closure: 0, parts: [], leaks: [['下水・ごみへ', 5.4, 'kg N']], note: '食べものはどこかの畑から。し尿と生ごみの養分は処理場と清掃工場へ' },
    { id: 'energy', name: 'エネルギー', color: '#C08A1E', unit: 'kWh', flow: T.flows.power, closure: 0, parts: [], leaks: [['買った電気', T.flows.power, 'kWh']], note: 'どこかの発電所から。熱は空へ逃げる' },
    { id: 'money', name: 'お金', color: '#6B7462', unit: '万円', flow: T.income, closure: 0.05, parts: ['会社', '大家さん'], leaks: [['遠くへ払った', T.spend, '万円'], ['遠くから稼いだ', T.income, '万円']], note: '会社から給料が入り、家賃・水道・電気・食費として出ていく' }
  ];
}

/* 東京：すべてがお金を通している */
export function tokyoOrbs() {
  const mk = (id, via) => ({ ...ORBS.find(o => o.id === id), direct: 0.02, via });
  return {
    money: 1, links: [],
    orbs: [
      mk('water', '水道料金 → どこかのダムと処理場'), mk('energy', '電気料金 → どこかの発電所'), mk('soil', '（関わりなし）生ごみは清掃工場へ'),
      mk('food', '食費 → スーパー → どこかの畑'), mk('life', '（関わりなし）'), mk('social', '給料と家賃 → 会社と大家さん')
    ]
  };
}

/* ---------- 東京の1年（序章） ---------- */
export function tokyoYear() {
  const n = 1, workDays = 5;
  const income = workDays * WAGE * 48;
  const rent = 8 * 12;
  const water = (130 + 35) * 365 / 1000;          // m³
  const power = (2 + 1.6) * 365 + 300;            // kWh（冷暖房ぶんを足す）
  const food = FOOD_NEED;
  const cost = {
    rent, water: water * MARKET.water, power: power * MARKET.power, food: food * MARKET.buyFood,
    living: LIVING * 4, commute: 10
  };
  const spend = Object.values(cost).reduce((a, b) => a + b, 0);
  return { income, cost, spend, save: income - spend, flows: { water, power, food, sewer: water, garbage: 180 } };
}

/* 東京の街：段々の谷に建物が詰まっている。あなたの部屋は賃貸の3階 */
export function tokyoWorld() {
  const w = W.makeWorld(siteTerrain('tokyo'));
  const put = (x, y, z, t) => { w.blocks[`${x},${y},${z}`] = { t, at: 0 }; };
  const road = new Set();
  // 暗渠の道（谷底に沿って曲がる）と、谷を横切る坂道
  for (let x = 0; x < 50; x++) { const yc = Math.round(31 + 5 * Math.sin(x / 9) + 0.06 * x); for (const dy of [0, 1]) road.add(`${x},${yc + dy}`); }
  for (let y = 0; y < 50; y++) for (const x of [22, 23]) road.add(`${x},${y}`);
  for (const k of road) { const [x, y] = k.split(',').map(Number); if (y >= 0 && y < 50) put(x, y, W.h(w, x, y), 'asphalt'); }
  // 建物：小さな区画ごとに、地面を平らにして積む
  const lots = [];
  for (let by = 2; by < 48; by += 8) for (let bx = 1; bx < 48; bx += 7) lots.push([bx, by]);
  let mine = null;
  for (const [bx, by] of lots) {
    const cells = [];
    for (let y = by; y < by + 6; y++) for (let x = bx; x < bx + 5; x++) if (x < 50 && y < 50 && !road.has(`${x},${y}`)) cells.push([x, y]);
    if (cells.length < 20) continue;
    const z0 = Math.max(...cells.map(([x, y]) => W.h(w, x, y)));
    const floors = 2 + ((bx * 7 + by * 3) % 4);
    const isMine = !mine && bx >= 15 && by >= 18 && by <= 26;
    for (const [x, y] of cells) { w.H[y * 50 + x] = z0; for (let k = 0; k < (isMine ? 4 : floors); k++) put(x, y, z0 + k, isMine && k === 2 && x === bx + 1 && y === by + 1 ? 'myroom' : 'concrete'); }
    if (isMine) mine = { x: bx + 1, y: by + 1, z: z0 + 2 };
  }
  w.mine = mine;
  return w;
}

/* ---------- 保存（文字列） ---------- */
export function save(s) { const t = clone(s); delete t.flags.weatherYear; return JSON.stringify(t); }
export function load(str) { try { return JSON.parse(str); } catch { return null; } }

/* ---------- 置く・外す ---------- */
export function canPlace(s, x) {
  const T = siteTerrain(s.site);
  if (x.x < 0 || x.y < 0 || x.x + x.w > PLOT || x.y + x.h > PLOT) return { ok: false, why: '敷地の外' };
  for (const o of s.items) if (o.id !== x.id && x.x < o.x + o.w && o.x < x.x + x.w && x.y < o.y + o.h && o.y < x.y + x.h) return { ok: false, why: `${ITEMS[o.type].name}と重なる` };
  const rr = T.rect(x);
  if (rr.slope > 45) return { ok: false, why: '45°より急で置けない' };
  if (x.type === 'house' && s.items.some(o => o.type === 'house' && o.id !== x.id)) return { ok: false, why: '家はひとつ' };
  return { ok: true, slope: rr.slope, elev: rr.elev };
}
export function place(s, x) {
  const c = canPlace(s, x); if (!c.ok) return { state: s, error: c.why };
  const cost = itemCost(x);
  if (cost > s.cash + 1e-9) return { state: s, error: 'お金が足りない' };
  const t = clone(s);
  const it = { type: x.type, x: x.x, y: x.y, w: x.w, h: x.h, id: t.nextId++, built: t.turn, mods: x.mods || {} };
  if (x.depth) it.depth = x.depth;
  if (x.spec) it.spec = JSON.parse(JSON.stringify(x.spec));
  if (ITEMS[x.type].labor) { it.mode = x.mode || 'hire'; if (it.mode === 'self') it.build = { need: Math.max(0.5, ITEMS[x.type].labor(it)), done: 0 }; }
  if (it.type === 'house' && !it.depth) it.depth = depthNeed(s.site, c.slope);
  t.items.push(it); t.cash -= cost;
  return { state: t, cost, item: it };
}
export function removeItem(s, id) {
  const t = clone(s); t.items = t.items.filter(x => x.id !== id); return t;   // 払ったお金は戻らない
}
/* 設計を変える（家・浄化設備）。費用は増えた分。自分でやるなら材料だけで、作業日がかかる */
export function remodelCost(it, spec, mode) {
  const def = ITEMS[it.type]; const next = { ...it, spec };
  const dm = Math.max(0, def.cost(next) - def.cost(it)), dl = Math.max(0, def.labor(next) - def.labor(it));
  return { money: mode === 'self' ? dm : dm + dl * B.HIRE, labor: dl };
}
export function remodel(s, id, spec, mode) {
  const t = clone(s), it = t.items.find(x => x.id === id); if (!it) return { state: s, error: 'ない' };
  const c = remodelCost(it, spec, mode);
  if (c.money > t.cash + 1e-9) return { state: s, error: 'お金が足りない' };
  t.cash -= c.money;
  if (mode === 'self' && c.labor > 0.2 && done(it)) it.remodel = { spec: JSON.parse(JSON.stringify(spec)), need: c.labor, done: 0 };
  else { it.spec = JSON.parse(JSON.stringify(spec)); if (it.build) it.build.need = Math.max(it.build.done, ITEMS[it.type].labor(it)); }
  return { state: t, cost: c.money };
}
/* 工夫を後からつける。費用は差分 */
export function modify(s, id, change) {
  const t = clone(s), it = t.items.find(x => x.id === id); if (!it) return { state: s, error: 'ない' };
  const before = itemCost(it);
  const next = { ...it, mods: { ...it.mods, ...(change.mods || {}) }, depth: change.depth ?? it.depth, x: change.x ?? it.x, y: change.y ?? it.y, w: change.w ?? it.w, h: change.h ?? it.h };
  if (change.w != null || change.h != null || change.x != null || change.y != null) {
    if (next.w < 1 || next.h < 1) return { state: s, error: 'これより小さくできない' };
    const c = canPlace(s, next); if (!c.ok) return { state: s, error: c.why };
  }
  let cost = Math.max(0, itemCost(next) - before);
  if (change.depth != null && change.depth > it.depth) cost *= 2;      // 後から基礎を深くすると2倍
  if (cost > t.cash + 1e-9) return { state: s, error: 'お金が足りない' };
  Object.assign(it, next); t.cash -= cost;
  return { state: t, cost };
}
