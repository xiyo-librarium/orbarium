/* 工房：家と排水の浄化設備の設計モデル（純関数）
   数字は目安。根拠のある値（断熱材の熱伝導率、ガラスのU値、人工湿地の1人あたり面積など）と、
   ゲームのための仮の値（費用・作業日数）がある。 */

export const HIRE = 1.5;   // 人を頼むときの日当（万円）

/* 骨組み。uWall/uRoof は断熱なしの熱貫流率（W/m²K、表面の抵抗込み） */
export const STRUCTS = {
  wood: { name: '木造', learn: null, uWall: 1.6, uRoof: 2.4, mass: 1, costM2: 7, laborM2: 2.5, rot: 0.3,
    note: 'ふつうの骨組み。壁の中に断熱材を入れやすい。' },
  container20: { name: 'コンテナ 20ft', learn: null, fixed: [6, 3], area: 14.6, height: 2.4, uWall: 5.0, uRoof: 5.0, mass: 0, cost: 60, labor: 15, steel: true, rot: 0,
    note: '中古コンテナを改造。安くて早いが、鋼板は熱をよく通す。内側に繊維の断熱材を入れると、冷えた鋼板に結露する。外から包むのがよい。' },
  container40: { name: 'コンテナ 40ft', learn: null, fixed: [12, 3], area: 29.7, height: 2.4, uWall: 5.0, uRoof: 5.0, mass: 0, cost: 90, labor: 25, steel: true, rot: 0,
    note: '20ftの倍の長さ。性質は同じ。' },
  bamboo: { name: '竹と土壁（バハレケ）', learn: 'bamboo', uWall: 2.2, uRoof: 2.4, mass: 1, costM2: 4, laborM2: 3, rot: 1,
    note: '竹の骨組みに土を塗る、コロンビアの伝統的なつくり。安くて地震に強いが、雨に当たると傷む。深い庇が要る。' },
  earthbag: { name: '土嚢', learn: 'earth', uWall: 1.4, uRoof: 2.4, mass: 2, costM2: 3, laborM2: 5, rot: 0.2,
    note: '袋に土を詰めて積む。材料はほぼ足もとの土。重くて熱を溜める。手間はかかる。' },
  tire: { name: '古タイヤと土（アースシップ）', learn: 'earth', uWall: 0.6, uRoof: 2.4, mass: 3, costM2: 3.5, laborM2: 7, rot: 0,
    note: '古タイヤに土を突き固めて積み、北側を土で埋める。とても重く、熱を溜める。叩き固める手間が大きい。' },
  straw: { name: 'わらのブロック', learn: 'straw', uWall: 0.14, uRoof: 2.4, mass: 1, costM2: 6, laborM2: 3.5, rot: 1.5,
    note: 'わらを固めたブロックを積み、土を塗る。壁そのものが厚い断熱になる。濡れると腐るので、庇と足もとの水はけが命。' }
};
/* 断熱材。lambda は熱伝導率（W/mK）、cost は壁1m²・厚さ100mmあたり（万円） */
export const INSUL = {
  glasswool: { name: 'グラスウール', lambda: 0.040, cost: 0.3, fibrous: true },
  cellulose: { name: 'セルロース（新聞紙）', lambda: 0.040, cost: 0.35, fibrous: true },
  wool: { name: '羊毛', lambda: 0.040, cost: 0.6, fibrous: true },
  eps: { name: '発泡スチロール板', lambda: 0.036, cost: 0.4, fibrous: false }
};
export const GLAZING = {
  single: { name: '1枚ガラス', u: 5.8, g: 0.85, cost: 3 },
  double: { name: '2枚ガラス', u: 2.8, g: 0.75, cost: 5 },
  lowe: { name: '2枚・Low-E', u: 1.6, g: 0.6, cost: 7, learn: 'insulation' },
  triple: { name: '3枚ガラス', u: 0.9, g: 0.5, cost: 10, learn: 'insulation' }
};
export const AIR = { leaky: { name: 'すきま風', ach: 1.2, cost: 0 }, normal: { name: 'ふつう', ach: 0.6, cost: 0 }, tight: { name: '気密', ach: 0.3, cost: 0.5, learn: 'insulation' } };
export const EAVES = { none: { name: 'なし', depth: 0, cost: 0, shade: 0, rain: 0 }, short: { name: '短い（50cm）', depth: 0.5, cost: 0.25, shade: 0.3, rain: 0.5 }, deep: { name: '深い（1.2m）', depth: 1.2, cost: 0.5, shade: 0.6, rain: 0.9 } };
export const MASS = [{ eta: 0.5, damp: 0.3, name: '軽い' }, { eta: 0.7, damp: 0.5, name: 'ふつう' }, { eta: 0.85, damp: 0.7, name: '重い' }, { eta: 0.92, damp: 0.82, name: 'とても重い' }];

export function defaultSpec(struct = 'wood') {
  return { struct, w: 4, h: 4, ins: 'glasswool', wallMm: 0, roofMm: 0, floorMm: 0, place: 'inside', roof: 'tin', floor: 'raised', glazing: 'double', winPct: 15, south: 50, eaves: 'short', air: 'normal' };
}
/* 昔のセーブ（断熱の段階だけ）から設計図をつくる */
export function legacySpec(house) {
  const s = defaultSpec('wood'); s.w = house.w; s.h = house.h;
  const lv = house.mods?.ins || 'none';
  if (lv === 'std') { s.wallMm = 100; s.roofMm = 150; s.floorMm = 100; s.glazing = 'double'; s.air = 'normal'; }
  if (lv === 'high') { s.wallMm = 200; s.roofMm = 300; s.floorMm = 150; s.glazing = 'triple'; s.air = 'tight'; }
  if (lv === 'none') { s.glazing = 'single'; s.air = 'leaky'; }
  return s;
}

/* 家の性能。site は {lat, tmean, tmin, tmax, rain, humid, ...}、n は人数 */
export function houseModel(spec, site, n = 1) {
  const st = STRUCTS[spec.struct] || STRUCTS.wood;
  const [fw, fh] = st.fixed || [spec.w, spec.h];
  const A = st.area || fw * fh, H = st.height || 2.5;
  const P = 2 * (fw + fh), wallGross = P * H, Aw = A * spec.winPct / 100, wallNet = Math.max(0, wallGross - Aw), roofA = A * 1.1, V = A * H;
  const ins = INSUL[spec.ins] || INSUL.glasswool;
  const addR = (mm) => (mm / 1000) / ins.lambda;
  const uWall = 1 / (1 / st.uWall + addR(spec.wallMm));
  const uRoofBase = spec.roof === 'green' ? 1 / (1 / st.uRoof + 0.3) : st.uRoof;
  const uRoof = 1 / (1 / uRoofBase + addR(spec.roofMm));
  const uFloorBase = spec.floor === 'slab' ? 1.2 : 1.0;
  const uFloor = 1 / (1 / uFloorBase + addR(spec.floorMm));
  const gl = GLAZING[spec.glazing] || GLAZING.double, air = AIR[spec.air] || AIR.normal, ev = EAVES[spec.eaves] || EAVES.none;
  const ach = st.steel ? Math.min(air.ach, 0.6) : air.ach;
  const parts = { wall: uWall * wallNet, roof: uRoof * roofA, floor: uFloor * A, window: gl.u * Aw, air: 0.33 * V * ach };
  const UA = Object.values(parts).reduce((a, b) => a + b, 0);
  let massLv = st.mass + (spec.floor === 'slab' ? 1 : 0) + (spec.roof === 'green' ? 0 : 0);
  massLv = Math.min(3, massLv);
  const mass = MASS[massLv];
  const latF = Math.min(1, Math.abs(site.lat || 0) / 35);
  const winFactor = gl.g * (0.25 + 0.5 * (spec.south / 100) * latF + 0.25 * (1 - latF));
  const absorb = spec.roof === 'green' ? 0.25 : 0.7;
  // 費用と手間
  const insCost = (wallNet * spec.wallMm + roofA * spec.roofMm + A * spec.floorMm) / 100 * ins.cost;
  let materials = (st.cost ?? st.costM2 * A) + insCost + Aw * gl.cost + P * ev.cost + (spec.floor === 'slab' ? A * 1.0 : 0) + (spec.roof === 'green' ? roofA * 1.5 : 0) + A * air.cost;
  if (st.steel && spec.place === 'outside' && spec.wallMm > 0) materials += wallNet * 0.8;   // 外断熱は外装材ぶん高い
  let labor = (st.labor ?? st.laborM2 * A) + (wallNet * spec.wallMm + roofA * spec.roofMm + A * spec.floorMm) / 100 * 0.04 + Aw * 0.5 + (spec.roof === 'green' ? roofA * 0.3 : 0) + (spec.floor === 'slab' ? A * 0.5 : 0) + P * (ev.depth ? 0.3 : 0);
  if (st.steel && spec.place === 'outside' && spec.wallMm > 0) labor += wallNet * 0.15;
  // 結露：鋼板の内側に繊維の断熱材、または断熱なし
  const condenseProne = !!st.steel && (spec.wallMm === 0 || (spec.place !== 'outside' && ins.fibrous));
  return {
    A, H, fw, fh, P, wallNet, Aw, roofA, V, uWall, uRoof, uFloor, UA, parts, mass, massLv, winFactor, absorb, ach,
    eavesShade: ev.shade, rainGuard: ev.rain, ventAch: 2 + 40 * spec.winPct / 100, rotRisk: st.rot * (1 - ev.rain), condenseProne,
    materials, labor, hire: materials + labor * HIRE, fixed: !!st.fixed
  };
}
/* 1日の熱。t（平均）、tmax、psh（日射 kWh/m²）から暖房の熱と、昼の室温の山を出す */
export function houseDay(m, d, n) {
  const internalW = 100 * n + 3 * m.A;
  const winSolar = m.Aw * d.psh * m.winFactor;                              // kWh/日
  const loss = m.UA * (18 - d.t) * 24 / 1000;
  const heat = Math.max(0, loss - m.mass.eta * (winSolar + internalW * 24 / 1000));
  // 夏の室温：屋根と壁が日射で焼ける分（相当外気温）と窓の日射。窓を開けて風を通す前提
  const roofSolar = m.roofA * d.psh * m.absorb * m.uRoof / 25;
  const wallSolar = m.wallNet * d.psh * 0.25 * 0.6 * m.uWall / 25;
  const solarW = (winSolar * (1 - m.eavesShade) + roofSolar + wallSolar) * 1000 / 24;
  const uaV = m.UA + 0.33 * m.V * m.ventAch;
  const tmax = d.tmax ?? d.t + 5;
  const mean = d.t + (solarW + internalW) / uaV;
  const peak = mean + (1 - m.mass.damp) * ((tmax - d.t) + 1.5 * solarW / uaV);
  return { heat, peak, winSolar, roofSolar };
}
export const HOT = 31;   // 室温がこれを超える日は「暑すぎる日」

/* ---------- 排水のバイオフィルター（人工湿地） ---------- */
export const MEDIA = {
  gravel: { name: '砂利だけ', hlr: 120, quality: 1, clog: 0, cost: 0.8, note: '水はよく通るが、きれいになりきらない。畑の地中に回すならよい。' },
  sand: { name: '砂利＋砂', hlr: 70, quality: 2, clog: 0.1, cost: 0.9, note: '砂の層で細かい汚れまでこし取る。トイレに回せる。前処理がないと詰まりやすい。' },
  char: { name: '砂利＋砂＋炭', hlr: 70, quality: 3, clog: 0.1, cost: 1.5, note: '炭が匂いと色を吸う。いちばんきれい。' }
};
export const PLANTS = { none: { name: 'なし', bonus: 0 }, reed: { name: 'ヨシ', bonus: 0.04, life: 0.2 }, canna: { name: 'カンナ', bonus: 0.03, life: 0.15 } };
export const PRE = { none: { name: 'なし', keep: 1, cost: 0 }, grease: { name: '油とり', keep: 0.8, cost: 2 }, settle: { name: '沈殿槽（1日ぶん）', keep: 0.55, cost: 6 } };
export const OUTS = { garden: { name: '畑へ' }, toilet: { name: 'トイレの流し水へ', need: 2 }, pond: { name: 'ため池へ' }, soak: { name: '地下へ浸みこませる' } };
export function defaultFilter() { return { w: 2, h: 2, depth: 0.6, media: 'sand', plants: 'reed', pre: 'settle', out: 'garden' }; }

export function filterModel(spec, greyLd) {
  const md = MEDIA[spec.media] || MEDIA.gravel, pl = PLANTS[spec.plants] || PLANTS.none, pre = PRE[spec.pre] || PRE.none;
  const area = spec.w * spec.h, vol = area * spec.depth;
  const df = spec.depth <= 0.4 ? 0.7 : spec.depth >= 0.8 ? 1.2 : 1;
  const hyd = area * md.hlr * df;                                   // L/日
  const cod = 400 * pre.keep;                                       // mg/L（台所を含む排水）
  const orgWarm = area * 60 / cod * 1000, orgCold = area * 20 / cod * 1000;   // L/日（有機物の負荷 g/m²/日）
  const capWarm = Math.min(hyd, orgWarm), capCold = Math.min(hyd, orgCold);
  const load = greyLd / Math.max(1, capWarm);
  const clogQ = Math.max(0.01, 0.02 + 0.3 * Math.max(0, load - 0.8) + md.clog * (spec.pre === 'none' ? 1.2 : 0.3) + (spec.pre === 'none' ? 0.04 : 0) - pl.bonus);
  const quality = md.quality;
  const lining = (area + 2 * (spec.w + spec.h) * spec.depth) * 0.3;
  const materials = lining + vol * md.cost + area * (spec.plants === 'none' ? 0 : 0.2) + pre.cost + 3;
  const labor = vol * 0.6 + vol * 0.3 + 2 + (spec.pre === 'settle' ? 2 : 0);
  return { area, vol, hyd, capWarm, capCold, load, clogQ, quality, life: pl.life || 0, materials, labor, hire: materials + labor * HIRE, okToilet: quality >= 2 };
}
