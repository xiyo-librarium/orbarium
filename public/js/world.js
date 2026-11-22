/* キューブの世界：地形の段（1m）とブロック。
   ここから「家」「屋根とタンク」「畑」「池」「浄化」を読み取り、高さとつながりの制約を出す。 */

export const N = 50;
const K = (x, y, z) => `${x},${y},${z}`;
const P = (k) => k.split(',').map(Number);
export const idx = (x, y) => y * N + x;

/* ---------- ブロックの種類 ----------
   kind: wall / window / door / roof / pillar / floor / tank / pump / bed / tree / hedge / heap / coop / pv / batt / pond / media / plant / settle
   u: 熱貫流率 W/m²K（1面=1m²）、mass: 熱を溜める段階、cost: 材料（万円）、labor: 作業日、learn: 知っている必要のある技術 */
export const BLOCKS = {
  wall_wood: { name: '木の壁', kind: 'wall', u: 1.6, mass: 0, cost: 0.8, labor: 0.8, color: '#C8A87A', learn: null },
  wall_woodins: { name: '断熱した木の壁', kind: 'wall', u: 0.28, mass: 0, cost: 1.3, labor: 1.0, color: '#D9B98E', learn: 'insulation' },
  wall_bamboo: { local: true, name: '竹と土壁', kind: 'wall', u: 2.2, mass: 1, cost: 0.4, labor: 1.0, color: '#C9B27A', learn: 'bamboo', rot: 1 },
  wall_earthbag: { local: true, name: '土嚢の壁', kind: 'wall', u: 1.4, mass: 2, cost: 0.3, labor: 1.5, earth: 0.5, color: '#B08A5B', learn: 'earth' },
  wall_tire: { local: true, name: '古タイヤと土の壁', kind: 'wall', u: 0.6, mass: 3, cost: 0.35, labor: 2.0, earth: 0.6, color: '#5E5A55', learn: 'earth' },
  wall_straw: { local: true, name: 'わらの壁', kind: 'wall', u: 0.14, mass: 1, cost: 0.6, labor: 1.0, color: '#E2C66B', learn: 'straw', rot: 1.5 },
  wall_steel: { name: 'コンテナの鋼板', kind: 'wall', u: 5.0, mass: 0, cost: 0, labor: 0, color: '#7E8C96', steel: true, prefabOnly: true },
  wall_steelout: { name: '外断熱した鋼板', kind: 'wall', u: 0.33, mass: 0, cost: 0, labor: 0, color: '#9FB0BA', prefabOnly: true },
  wall_steelin: { name: '内断熱した鋼板', kind: 'wall', u: 0.35, mass: 0, cost: 0, labor: 0, color: '#8C9AA3', steel: true, inner: true, prefabOnly: true },
  window_single: { name: '窓（1枚ガラス）', kind: 'window', u: 5.8, g: 0.85, cost: 3, labor: 0.5, color: '#CFE1F2', learn: null },
  window_double: { name: '窓（2枚ガラス）', kind: 'window', u: 2.8, g: 0.75, cost: 5, labor: 0.5, color: '#BBD6EE', learn: null },
  window_lowe: { name: '窓（Low-E）', kind: 'window', u: 1.6, g: 0.6, cost: 7, labor: 0.5, color: '#A7CBEA', learn: 'insulation' },
  window_triple: { name: '窓（3枚ガラス）', kind: 'window', u: 0.9, g: 0.5, cost: 10, labor: 0.6, color: '#93BFE5', learn: 'insulation' },
  door: { name: '扉', kind: 'door', u: 2.0, cost: 3, labor: 0.5, color: '#8C6A45', learn: null },
  roof_tin: { name: 'トタン屋根', kind: 'roof', u: 2.4, absorb: 0.7, catch: 0.85, cost: 0.5, labor: 0.3, color: '#8C9499', learn: null },
  roof_tinins: { name: '断熱したトタン屋根', kind: 'roof', u: 0.25, absorb: 0.7, catch: 0.85, cost: 1.0, labor: 0.5, color: '#A3ABAF', learn: 'insulation' },
  roof_green: { name: '草屋根', kind: 'roof', u: 1.6, absorb: 0.25, catch: 0.35, cost: 1.5, labor: 0.6, color: '#6FA45F', learn: null, life: 'green' },
  roof_steel: { name: 'コンテナの屋根', kind: 'roof', u: 5.0, absorb: 0.7, catch: 0.85, cost: 0, labor: 0, color: '#7E8C96', prefabOnly: true },
  roof_glass: { name: 'ガラス屋根', kind: 'roof', u: 2.8, absorb: 0.1, catch: 0.85, g: 0.75, cost: 4, labor: 0.5, color: '#C6E0EF', learn: 'greenhouse' },
  pillar: { name: '柱', kind: 'pillar', cost: 0.3, labor: 0.2, color: '#8C6A45', learn: null },
  floor_wood: { name: '木の床', kind: 'floor', u: 1.0, mass: 0, cost: 0.5, labor: 0.3, color: '#D7B98A', learn: null, overlay: true },
  floor_slab: { name: '土間', kind: 'floor', u: 1.2, mass: 2, cost: 1.0, labor: 0.5, color: '#A39A8C', learn: null, overlay: true },
  floor_ins: { name: '断熱した床', kind: 'floor', u: 0.3, mass: 0, cost: 1.0, labor: 0.4, color: '#E3CFA8', learn: 'insulation', overlay: true },
  tank: { name: '雨水タンク 1m³', kind: 'tank', cap: 1000, cost: 2.7, labor: 0.2, life: 25, color: '#CFE1F2', learn: null },
  pump: { name: 'ポンプ', kind: 'pump', cost: 5, labor: 0.3, life: 10, color: '#3A5F86', learn: null },
  bed: { local: true, name: '畑', kind: 'bed', cost: 0.1, labor: 0.05, color: '#8DB872', learn: null, overlay: true },
  tree: { local: true, name: '果樹', kind: 'tree', cost: 0.5, labor: 0.1, color: '#4E8F5B', learn: 'hedge' },
  hedge: { local: true, name: '生け垣', kind: 'hedge', cost: 0.2, labor: 0.1, color: '#2C5A37', learn: 'hedge' },
  heap: { local: true, name: '堆肥の山', kind: 'heap', cost: 5, labor: 0.5, life: 15, color: '#8A6A42', learn: 'heap' },
  coop: { name: 'ニワトリ小屋', kind: 'coop', cost: 10, labor: 2, life: 15, color: '#E8C98A', learn: 'chicken' },
  pv: { name: '太陽光パネル 0.2kW', kind: 'pv', kw: 0.2, cost: 5.5, labor: 0.2, life: 25, color: '#30476B', learn: 'offgrid' },
  batt: { name: '蓄電池 5kWh', kind: 'batt', kwh: 5, cost: 15, labor: 0.2, life: 12, color: '#3A3F42', learn: 'offgrid' },
  pond: { name: 'ため池（防水した穴）', kind: 'pond', cost: 0.4, labor: 0.2, color: '#5B9BD5', learn: 'pond', pit: true },
  media_gravel: { name: '砂利の層', kind: 'media', media: 'gravel', cost: 0.8, labor: 0.3, color: '#A5A29A', learn: 'grey', pit: true },
  media_sand: { name: '砂利＋砂の層', kind: 'media', media: 'sand', cost: 0.9, labor: 0.3, color: '#E2D3A6', learn: 'grey', pit: true },
  media_char: { name: '砂利＋砂＋炭の層', kind: 'media', media: 'char', cost: 1.5, labor: 0.35, color: '#55524C', learn: 'grey', pit: true },
  plant_reed: { local: true, name: 'ヨシ', kind: 'plant', plant: 'reed', cost: 0.2, labor: 0.05, color: '#8AA05A', learn: 'grey', overlay: true },
  plant_canna: { local: true, name: 'カンナ', kind: 'plant', plant: 'canna', cost: 0.2, labor: 0.05, color: '#D9542C', learn: 'grey', overlay: true },
  concrete: { name: 'コンクリートの建物', kind: 'wall', u: 2.0, cost: 0, labor: 0, color: '#B9BDBF', prefabOnly: true },
  myroom: { name: 'あなたの部屋（30m²の賃貸）', kind: 'wall', u: 2.0, cost: 0, labor: 0, color: '#F2C14E', prefabOnly: true },
  asphalt: { name: 'アスファルトの道', kind: 'road', cost: 0, labor: 0, color: '#8E9399', overlay: true, prefabOnly: true },
  settle: { name: '沈殿槽', kind: 'settle', cost: 6, labor: 1, color: '#DCE6EE', learn: 'grey' }
};
const ENCLOSE = new Set(['wall', 'window', 'door', 'roof']);
const SOLID = new Set(['wall', 'window', 'door', 'roof', 'pillar', 'tank', 'pump', 'heap', 'coop', 'batt', 'settle', 'tree', 'hedge']);
export const DIG_LABOR = 0.6, FILL_LABOR = 0.4, EARTH_PRICE = 0.3;

/* ---------- 世界をつくる ---------- */
export function makeWorld(T) {
  let lo = Infinity;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) lo = Math.min(lo, T.at(x + 0.5, y + 0.5));
  const base = Math.floor(lo);
  const H = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H.push(Math.floor(T.at(x + 0.5, y + 0.5) - base));
  return { base, H, H0: H.slice(), blocks: {}, queue: [], debt: 0, earth: 0, spent: { local: 0, far: 0 }, mods: { compostToilet: false, saving: false, depth: 0, out: 'garden' } };
}
export const h = (w, x, y) => (x < 0 || y < 0 || x >= N || y >= N) ? -99 : w.H[idx(x, y)];
export const at = (w, x, y, z) => w.blocks[K(x, y, z)];
export const active = (b) => b && !b.p;
export function blocksOf(w, kind, all = false) {
  const out = [];
  for (const k in w.blocks) { const b = w.blocks[k]; if ((all || active(b)) && BLOCKS[b.t].kind === kind) { const [x, y, z] = P(k); out.push({ x, y, z, b }); } }
  return out;
}

/* ---------- 置く・外す・掘る・盛る ---------- */
export function canPut(w, x, y, z, t) {
  const d = BLOCKS[t];
  if (x < 0 || y < 0 || x >= N || y >= N) return '敷地の外';
  const g = h(w, x, y);
  if (z < g) return '地面の中';
  if (at(w, x, y, z)) return 'もう何かある';
  if (d.overlay && z !== g) return d.kind === 'bed' ? '畑は地面の上に' : '床や植物は地面の上に';
  if (d.overlay && d.kind === 'plant') { const below = at(w, x, y, z - 1); if (!below || BLOCKS[below.t].kind !== 'media') return 'ヨシやカンナは、浄化の層の上に植える'; }
  if (d.pit && z >= w.H0[idx(x, y)]) return '掘った穴の中にしか置けない（先に掘る）';
  if (d.kind === 'roof' || d.kind === 'pv') {
    // 屋根は柱か壁で支える：真下か隣の屋根につながっていること
    if (d.kind === 'roof' && !supported(w, x, y, z)) return '屋根は柱か壁の上、または隣の屋根につなげる';
  }
  if (!d.overlay && !d.pit && z > g) {
    const below = at(w, x, y, z - 1);
    const hang = d.kind === 'roof' || d.kind === 'pv';
    if (!hang && (!below || BLOCKS[below.t].overlay)) return '下に支えがない';
  }
  return null;
}
function supported(w, x, y, z) {
  const below = at(w, x, y, z - 1);
  if (below && ['wall', 'pillar', 'window', 'door', 'tank'].includes(BLOCKS[below.t].kind)) return true;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(w, x + dx, y + dy, z); if (n && BLOCKS[n.t].kind === 'roof') return true; }
  return false;
}
export function blockPrice(t, mode) { const d = BLOCKS[t]; return mode === 'self' ? d.cost : d.cost + d.labor * 1.5; }
/* お金がどこへ行くか：近所の人を頼めば地域に、工場の材料は遠くへ */
function spend(w, local, far) { w.spent = w.spent || { local: 0, far: 0 }; w.spent.local += local; w.spent.far += far; }
/* 置く。s は状態（cash, turn）。mode: 'self' | 'hire' */
export function put(s, x, y, z, t, mode, extra = {}) {
  const w = s.world, d = BLOCKS[t];
  const why = canPut(w, x, y, z, t); if (why) return why;
  let price = blockPrice(t, mode);
  const earthNeed = d.earth || 0;
  let buyEarth = 0;
  if (earthNeed) { const have = Math.min(w.earth, earthNeed); buyEarth = earthNeed - have; price += buyEarth * EARTH_PRICE; }
  if (price > s.cash + 1e-9) return 'お金が足りない';
  s.cash -= price; if (earthNeed) w.earth = Math.max(0, w.earth - earthNeed);
  spend(w, (d.local ? d.cost : 0) + (mode === 'self' ? 0 : d.labor * 1.5) + buyEarth * EARTH_PRICE, d.local ? 0 : d.cost);
  const b = { t, at: s.turn, ...extra };
  if (mode === 'self' && d.labor > 0) { b.p = d.labor; w.queue.push(K(x, y, z)); }
  w.blocks[K(x, y, z)] = b;
  return null;
}
export function remove(s, x, y, z) {
  const w = s.world, k = K(x, y, z), b = w.blocks[k]; if (!b) return '何もない';
  const above = at(w, x, y, z + 1);
  if (above && !BLOCKS[b.t].overlay && BLOCKS[above.t].kind !== 'roof') return '上に乗っているものを先に外す';
  delete w.blocks[k]; w.queue = w.queue.filter(q => q !== k);
  // 床や畑は地面に乗っているだけ。土を使った壁を壊すと土が戻る
  if (BLOCKS[b.t].earth) w.earth += BLOCKS[b.t].earth * 0.8;
  return null;
}
export function dig(s, x, y, mode) {
  const w = s.world, g = h(w, x, y);
  if (at(w, x, y, g)) return '上に何かある';
  if (g <= 0) return 'これ以上は掘れない（岩盤）';
  if (w.H0[idx(x, y)] - g >= 3) return '3mより深くは掘れない';
  const price = mode === 'self' ? 0 : DIG_LABOR * 1.5;
  if (price > s.cash + 1e-9) return 'お金が足りない';
  s.cash -= price; spend(w, price, 0); if (mode === 'self') w.debt += DIG_LABOR;
  w.H[idx(x, y)] = g - 1; w.earth += 1;
  return null;
}
export function fill(s, x, y, mode) {
  const w = s.world, g = h(w, x, y);
  if (at(w, x, y, g)) return '上に何かある';
  if (g - w.H0[idx(x, y)] >= 2) return '2mより高くは盛れない';
  const buy = w.earth >= 1 ? 0 : (1 - w.earth) * EARTH_PRICE;
  const price = buy + (mode === 'self' ? 0 : FILL_LABOR * 1.5);
  if (price > s.cash + 1e-9) return 'お金が足りない';
  s.cash -= price; spend(w, price, 0); if (mode === 'self') w.debt += FILL_LABOR;
  w.earth = Math.max(0, w.earth - 1);
  w.H[idx(x, y)] = g + 1;
  return null;
}
/* 畑の工夫（石垣・マルチ）はブロックの印 */
export function toggleMark(s, x, y, z, mark) {
  const b = at(s.world, x, y, z); if (!b || BLOCKS[b.t].kind !== 'bed') return '畑を選ぶ';
  const price = mark === 's' ? 0.15 : 0.01;
  if (!b[mark] && price > s.cash) return 'お金が足りない';
  if (!b[mark]) { s.cash -= price; spend(s.world, mark === 's' ? price : 0, mark === 's' ? 0 : price); }
  b[mark] = b[mark] ? 0 : 1; return null;
}

/* ---------- ひな形（まとめて置く） ---------- */
function rect(x0, y0, x1, y1) { return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }; }
export function levelInfo(w, r) {
  const hs = []; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) hs.push(h(w, x, y));
  const lo = Math.min(...hs), hi = Math.max(...hs);
  return { lo, hi, flat: lo === hi, cells: hs.length };
}
/* 部屋：四角い床の上に壁2段＋屋根。南（下側）に窓、北（上側）に扉 */
export function prefabRoom(s, a, b, mats, mode) {
  const w = s.world, r = rect(a[0], a[1], b[0], b[1]);
  if (r.x1 - r.x0 < 2 || r.y1 - r.y0 < 2) return '部屋は3×3マス以上';
  const L = levelInfo(w, r); if (!L.flat) return `床が平らでない（${L.lo}〜${L.hi}段）。先に「平らにする」で掘るか盛る`;
  const z = L.lo;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) for (let k = 0; k <= 2; k++) if (at(w, x, y, z + k)) return 'ほかのものと重なる';
  const cost = estimateRoom(r, mats, mode);
  if (cost > s.cash + 1e-9) return `お金が足りない（${Math.round(cost)}万円）`;
  const midX = Math.floor((r.x0 + r.x1) / 2);
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1;
    if (edge) {
      for (let k = 0; k < 2; k++) {
        let t = mats.wall;
        const corner = (x === r.x0 || x === r.x1) && (y === r.y0 || y === r.y1);
        if (!corner && y === r.y1 && k === 1 && (x - r.x0) % 2 === 1) t = mats.window;     // 南の窓
        if (!corner && y === r.y0 && x === midX && k === 0) t = 'door';                    // 北の扉
        if (!corner && y === r.y0 && x === midX && k === 1) t = mats.wall;
        put(s, x, y, z + k, t, mode);
      }
    } else put(s, x, y, z, mats.floor, mode);
  }
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) put(s, x, y, z + 2, mats.roof, mode);
  return null;
}
export function estimateRoom(r, mats, mode) {
  const nx = r.x1 - r.x0 + 1, ny = r.y1 - r.y0 + 1, per = 2 * (nx + ny) - 4, win = Math.floor((nx - 2) / 2);
  return (per * 2 - win - 1) * blockPrice(mats.wall, mode) + win * blockPrice(mats.window, mode) + blockPrice('door', mode) + (nx - 2) * (ny - 2) * blockPrice(mats.floor, mode) + nx * ny * blockPrice(mats.roof, mode);
}
/* 小屋：四隅に柱2段＋屋根（雨を集める） */
export function prefabShed(s, a, b, roof, mode) {
  const w = s.world, r = rect(a[0], a[1], b[0], b[1]);
  if (r.x1 - r.x0 < 1 || r.y1 - r.y0 < 1) return '小屋は2×2マス以上';
  const L = levelInfo(w, r);
  const top = L.hi + 2;
  const corners = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]];
  for (const [x, y] of corners) { const g = h(w, x, y); for (let z = g; z < top; z++) if (at(w, x, y, z)) return 'ほかのものと重なる'; }
  for (const [x, y] of corners) { const g = h(w, x, y); for (let z = g; z < top; z++) put(s, x, y, z, 'pillar', mode); }
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!at(w, x, y, top)) put(s, x, y, top, roof, mode);
  return null;
}
export function prefabBeds(s, a, b, mode) {
  const w = s.world, r = rect(a[0], a[1], b[0], b[1]); let n = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { if (!put(s, x, y, h(w, x, y), 'bed', mode)) n++; }
  return n ? null : '置ける場所がない';
}
export function prefabLevel(s, a, b, mode) {
  const w = s.world, r = rect(a[0], a[1], b[0], b[1]);
  const hs = []; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) hs.push(h(w, x, y));
  hs.sort((p, q) => p - q); const target = hs[Math.floor(hs.length / 2)];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    let g = h(w, x, y), guard = 0;
    while (g > target && guard++ < 4) { if (dig(s, x, y, mode)) break; g = h(w, x, y); }
    while (g < target && guard++ < 8) { if (fill(s, x, y, mode)) break; g = h(w, x, y); }
  }
  return null;
}
export function prefabPit(s, a, b, fillT, mode, depth = 1, top = null) {
  const w = s.world, r = rect(a[0], a[1], b[0], b[1]);
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    for (let k = 0; k < depth; k++) dig(s, x, y, mode);
    const g = h(w, x, y);
    for (let k = 0; k < depth; k++) put(s, x, y, g + k, fillT, mode);
    if (top) put(s, x, y, g + depth, top, mode);
  }
  return null;
}
/* コンテナ：6×3マス・高さ3段の箱。ins: none / inside / outside */
export function prefabContainer(s, a, rot, ins, mode) {
  const w = s.world, [x0, y0] = a, wx = rot ? 3 : 6, wy = rot ? 6 : 3;
  const r = { x0, y0, x1: x0 + wx - 1, y1: y0 + wy - 1 };
  if (r.x1 >= N || r.y1 >= N) return '敷地の外';
  const L = levelInfo(w, r); if (!L.flat) return `地面が平らでない（${L.lo}〜${L.hi}段）。先に「平らにする」`;
  const z = L.lo;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) for (let k = 0; k <= 2; k++) if (at(w, x, y, z + k)) return 'ほかのものと重なる';
  const wallT = ins === 'outside' ? 'wall_steelout' : ins === 'inside' ? 'wall_steelin' : 'wall_steel';
  const roofT = ins === 'none' ? 'roof_steel' : 'roof_tinins';
  const cost = 60 + (ins === 'outside' ? 40 : ins === 'inside' ? 15 : 0) + (mode === 'self' ? 0 : 25);
  if (cost > s.cash + 1e-9) return `お金が足りない（${cost}万円）`;
  s.cash -= cost; spend(w, mode === 'self' ? 0 : 25, cost - (mode === 'self' ? 0 : 25));
  const labor = 15 + (ins === 'outside' ? 10 : ins === 'inside' ? 4 : 0);
  const mid = Math.floor((rot ? r.y0 + r.y1 : r.x0 + r.x1) / 2);
  const first = Object.keys(w.blocks).length;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1;
    if (edge) for (let k = 0; k < 2; k++) {
      let t = wallT;
      const end = rot ? (y === r.y1) : (x === r.x1);
      const corner = (x === r.x0 || x === r.x1) && (y === r.y0 || y === r.y1);
      if (!corner && end && k === 0) t = 'door';
      if (!corner && ((rot ? x === r.x1 : y === r.y1)) && k === 1 && ((rot ? y : x) === mid)) t = 'window_double';
      w.blocks[K(x, y, z + k)] = { t, at: s.turn, g: 'c' };
    } else w.blocks[K(x, y, z)] = { t: 'floor_wood', at: s.turn, g: 'c' };
    w.blocks[K(x, y, z + 2)] = { t: roofT, at: s.turn, g: 'c' };
  }
  if (mode === 'self') { const keys = Object.keys(w.blocks).slice(first); const per = labor / keys.length; for (const k of keys) { w.blocks[k].p = per; w.queue.push(k); } }
  return null;
}

/* ---------- 読み取り ---------- */
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
/* 囲われた空気（家の中）を探す */
export function interiors(w) {
  const enc = [];
  for (const k in w.blocks) { const b = w.blocks[k]; if (active(b) && ENCLOSE.has(BLOCKS[b.t].kind)) enc.push(P(k)); }
  if (!enc.length) return [];
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const [x, y, z] of enc) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
  x0--; y0--; x1++; y1++; z1++; z0 = Math.max(0, z0 - 1);
  const free = (x, y, z) => {
    if (z < h(w, x, y)) return false;
    const b = at(w, x, y, z);
    return !b || !active(b) || !ENCLOSE.has(BLOCKS[b.t].kind);
  };
  const seen = new Set(), out = new Set(), stack = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    if (x === x0 || x === x1 || y === y0 || y === y1 || z === z1) if (free(x, y, z)) { const k = K(x, y, z); if (!seen.has(k)) { seen.add(k); stack.push([x, y, z]); } }
  }
  while (stack.length) {
    const [x, y, z] = stack.pop(); out.add(K(x, y, z));
    for (const [dx, dy, dz] of D6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < x0 || ny < y0 || nz < z0 || nx > x1 || ny > y1 || nz > z1) continue;
      const k = K(nx, ny, nz); if (seen.has(k)) continue;
      if (free(nx, ny, nz)) { seen.add(k); stack.push([nx, ny, nz]); }
    }
  }
  // 中の空気：外から届かない空きマス。つながりごとにまとめる
  const inner = [];
  for (let x = x0 + 1; x < x1; x++) for (let y = y0 + 1; y < y1; y++) for (let z = z0; z < z1; z++) {
    if (free(x, y, z) && !out.has(K(x, y, z)) && z >= h(w, x, y)) inner.push([x, y, z]);
  }
  const set = new Set(inner.map(c => K(...c))), done = new Set(), groups = [];
  for (const c of inner) {
    const k0 = K(...c); if (done.has(k0)) continue;
    const g = [], st = [c]; done.add(k0);
    while (st.length) { const [x, y, z] = st.pop(); g.push([x, y, z]); for (const [dx, dy, dz] of D6) { const k = K(x + dx, y + dy, z + dz); if (set.has(k) && !done.has(k)) { done.add(k); st.push([x + dx, y + dy, z + dz]); } } }
    groups.push(g);
  }
  return groups;
}
/* 家の熱の性質（build.js の houseDay に渡せる形） */
export function houseFromVoxels(w, cells, site) {
  const inside = new Set(cells.map(c => K(...c)));
  const floorXY = new Set(cells.map(([x, y]) => `${x},${y}`));
  const A = floorXY.size;
  let UA = 0, wall = 0, uWallSum = 0, roofA = 0, uRoofSum = 0, absorbSum = 0, Aw = 0, winGain = 0, massSum = 0, massN = 0, steelIn = false, rot = 0, rotN = 0, ground = 0;
  const latF = Math.min(1, Math.abs(site.lat || 0) / 35), south = (site.lat || 0) >= 0 ? 1 : -1;
  const parts = { wall: 0, roof: 0, floor: 0, window: 0, air: 0 };
  const wallCols = new Set();
  for (const [x, y, z] of cells) {
    for (const [dx, dy, dz] of D6) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (inside.has(K(nx, ny, nz))) continue;
      if (nz < h(w, nx, ny)) {   // 地面に接する面
        if (dz === -1) { const fl = at(w, x, y, z); const fd = fl && active(fl) && BLOCKS[fl.t].kind === 'floor' ? BLOCKS[fl.t] : { u: 1.5, mass: 2 }; UA += fd.u * 0.6; parts.floor += fd.u * 0.6; massSum += fd.mass; massN++; }
        else { UA += 0.4; parts.wall += 0.4; massSum += 3; massN++; ground++; }
        continue;
      }
      const b = at(w, nx, ny, nz); if (!b || !active(b)) continue;
      const d = BLOCKS[b.t];
      if (d.kind === 'floor' || d.overlay) continue;
      UA += d.u || 2;
      if (d.kind === 'roof') { roofA++; uRoofSum += d.u; absorbSum += d.absorb ?? 0.7; parts.roof += d.u; if (d.g) { Aw += 1; winGain += d.g * (0.6 + 0.4 * (1 - latF)); } }
      else if (d.kind === 'window') {
        Aw++; parts.window += d.u;
        const facing = dy === south ? 1 : dy === -south ? 0.2 : 0.55;   // 南向きほど冬の日射が入る
        winGain += d.g * (latF * facing + (1 - latF) * 0.5);
      } else { wall++; uWallSum += d.u; parts.wall += d.u; massSum += d.mass ?? 0; massN++; if (d.steel && !d.outside) steelIn = true; if (d.rot) { rot += d.rot; rotN++; } wallCols.add(`${nx},${ny}`); }
    }
  }
  const V = cells.length;
  const ach = 0.6;
  parts.air = 0.33 * V * ach; UA += parts.air;
  const massLv = Math.max(0, Math.min(3, Math.round(massN ? massSum / massN : 0)));
  // 庇：壁の外側1マスに屋根が張り出しているか
  let eaves = 0, per = 0;
  for (const c of wallCols) {
    const [x, y] = c.split(',').map(Number); per++;
    let top = -1; for (let z = h(w, x, y); z < h(w, x, y) + 8; z++) { const b = at(w, x, y, z); if (b && BLOCKS[b.t].kind === 'roof') { top = z; break; } }
    if (top < 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (floorXY.has(`${x + dx},${y + dy}`) || wallCols.has(`${x + dx},${y + dy}`)) continue; const o = at(w, x + dx, y + dy, top); if (o && BLOCKS[o.t].kind === 'roof') { eaves++; break; } }
  }
  const eavesShare = per ? eaves / per : 0;
  const MASS = [{ eta: 0.5, damp: 0.3, name: '軽い' }, { eta: 0.7, damp: 0.5, name: 'ふつう' }, { eta: 0.85, damp: 0.7, name: '重い' }, { eta: 0.92, damp: 0.82, name: 'とても重い' }];
  return {
    A, V, UA, parts, wallNet: wall, uWall: wall ? uWallSum / wall : 1.6, roofA, uRoof: roofA ? uRoofSum / roofA : 2.4, absorb: roofA ? absorbSum / roofA : 0.7,
    Aw, winFactor: Aw ? winGain / Aw : 0, mass: MASS[massLv], massLv, eavesShade: 0.6 * eavesShare, rainGuard: 0.9 * eavesShare, ventAch: 2 + 40 * Math.min(0.3, Aw / Math.max(1, A)),
    condenseProne: steelIn, rotRisk: rotN ? (rot / rotN) * (1 - 0.9 * eavesShare) : 0, earthFaces: ground, floorZ: Math.min(...cells.map(c => c[2]))
  };
}
/* 雨の流れる向き（8方向で一番低い隣へ） */
export function flowAccum(w) {
  const acc = new Float32Array(N * N).fill(1), order = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) order.push([x, y]);
  order.sort((a, b) => h(w, b[0], b[1]) - h(w, a[0], a[1]));
  const to = new Int32Array(N * N).fill(-1);
  for (const [x, y] of order) {
    let best = null, bh = h(w, x, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nh = h(w, x + dx, y + dy); if (nh === -99) continue;
      if (nh < bh || (nh === bh && best === null && false)) { bh = nh; best = [x + dx, y + dy]; }
    }
    if (best) { to[idx(x, y)] = idx(best[0], best[1]); acc[idx(best[0], best[1])] += acc[idx(x, y)]; }
  }
  return { acc, to };
}

/* ---------- 全部まとめて読む：シミュレーションと画面に渡す ---------- */
export function analyze(w, site, persons = 1) {
  const diag = [];
  const groups = interiors(w);
  // 一番大きい囲いを家とする。畑が中にあってガラスの多い囲いは温室
  let house = null, ghBeds = 0, gh = [];
  for (const g of groups) {
    const bedsIn = g.filter(([x, y, z]) => { const b = at(w, x, y, z); return b && active(b) && BLOCKS[b.t].kind === 'bed'; }).length;
    const m = houseFromVoxels(w, g, site);
    if (bedsIn > 0 && m.Aw >= 0.3 * (m.wallNet + m.roofA + m.Aw)) { ghBeds += bedsIn; gh.push(g); continue; }
    if (!house || g.length > house.cells.length) house = { cells: g, m };
  }
  if (!groups.length && Object.values(w.blocks).some(b => BLOCKS[b.t].kind === 'wall' && active(b))) diag.push({ lv: 'warn', text: '壁はあるが、屋根と壁で囲われた部屋がまだない' });
  if (house) {
    const hasDoor = house.cells.some(([x, y, z]) => D6.some(([dx, dy, dz]) => { const b = at(w, x + dx, y + dy, z + dz); return b && BLOCKS[b.t].kind === 'door'; }));
    if (!hasDoor) diag.push({ lv: 'warn', text: '家に扉がない' });
  }
  // 屋根とタンク：屋根のつながりごとに、軒の隣か下にある低いタンクへ雨が入る
  const roofs = blocksOf(w, 'roof'), tanks = blocksOf(w, 'tank');
  const roofSet = new Map(roofs.map(r => [K(r.x, r.y, r.z), r]));
  const comp = [], seenR = new Set();
  for (const r of roofs) {
    const k0 = K(r.x, r.y, r.z); if (seenR.has(k0)) continue;
    const c = [], st = [r]; seenR.add(k0);
    while (st.length) { const q = st.pop(); c.push(q); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) { const k = K(q.x + dx, q.y + dy, q.z + dz); if (roofSet.has(k) && !seenR.has(k)) { seenR.add(k); st.push(roofSet.get(k)); } } }
    comp.push(c);
  }
  const fedTanks = new Set(); let roofCatch = 0, roofLost = 0;
  const roofComps = comp.map(c => {
    const exposed = c.filter(r => !at(w, r.x, r.y, r.z + 1) || BLOCKS[at(w, r.x, r.y, r.z + 1).t].kind === 'pv');
    const area = exposed.reduce((a, r) => a + BLOCKS[r.b.t].catch, 0);
    const minZ = Math.min(...c.map(r => r.z));
    const my = tanks.filter(t => t.z < minZ && c.some(r => Math.max(Math.abs(r.x - t.x), Math.abs(r.y - t.y)) <= 1));
    my.forEach(t => fedTanks.add(K(t.x, t.y, t.z)));
    if (my.length) roofCatch += area; else roofLost += area;
    return { n: c.length, area, tanks: my.length };
  });
  if (roofLost > 0.5) diag.push({ lv: 'warn', text: `屋根${Math.round(roofLost)}m²ぶんの雨がタンクに入っていない（タンクは屋根の軒の隣か下に、屋根より低く置く）` });
  const unfed = tanks.filter(t => !fedTanks.has(K(t.x, t.y, t.z)));
  if (unfed.length) diag.push({ lv: 'warn', text: `雨の入らないタンクが${unfed.length}つある（屋根の軒の隣・下へ）` });
  const fed = tanks.filter(t => fedTanks.has(K(t.x, t.y, t.z)));
  const tankBase = fed.length ? Math.min(...fed.map(t => t.z)) : null;
  // 畑
  const beds = blocksOf(w, 'bed');
  const bedSet = new Set(beds.map(b => `${b.x},${b.y}`));
  let risers = 0, stoneRisers = 0;
  for (const b of beds) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nh = h(w, b.x + dx, b.y + dy); if (nh === -99) continue;
    if (nh < b.z) { risers += b.z - nh; if (b.b.s) stoneRisers += b.z - nh; }
  }
  const outBeds = beds.filter(b => !groups.some(g => g.some(c => c[0] === b.x && c[1] === b.y)));
  const gArea = outBeds.length;
  const bedMaxZ = beds.length ? Math.max(...beds.map(b => b.z)) : null;
  const pumps = blocksOf(w, 'pump').length;
  const gravShare = (srcZ) => beds.length && srcZ != null ? beds.filter(b => srcZ - b.z >= 1).length / beds.length : 0;
  const tankGrav = gravShare(tankBase);
  if (beds.length && fed.length && tankGrav < 1) diag.push({ lv: pumps ? 'info' : 'warn', text: pumps ? `畑の${Math.round((1 - tankGrav) * 100)}%はタンクより高い。ポンプで送る（電気を使う）` : `畑の${Math.round((1 - tankGrav) * 100)}%はタンクより高く、水が届かない（ポンプを置くか、タンクを高い段へ）` });
  // 池：防水した穴。坂の上から雨が集まる
  const ponds = blocksOf(w, 'pond');
  const pondCells = new Set(ponds.map(p => idx(p.x, p.y)));
  let pondCatch = 0;
  if (ponds.length) { const { acc } = flowAccum(w); const tops = new Set(); for (const p of ponds) tops.add(idx(p.x, p.y)); for (const i of tops) pondCatch += acc[i]; }
  const pondTop = ponds.length ? Math.max(...ponds.map(p => p.z)) + 1 : null;
  const pondGrav = gravShare(pondTop);
  if (ponds.length && beds.length && pondGrav < 1) diag.push({ lv: pumps ? 'info' : 'warn', text: pumps ? `池の水は、畑の${Math.round((1 - pondGrav) * 100)}%へはポンプで上げる` : `池が畑より低い。池の水を畑に回すにはポンプが要る` });
  // 浄化：掘った穴の層＋上の植物
  const media = blocksOf(w, 'media');
  let filter = null;
  if (media.length) {
    const cols = new Map(); for (const m of media) { const k = `${m.x},${m.y}`; cols.set(k, (cols.get(k) || []).concat(m)); }
    const kinds = media.map(m => BLOCKS[m.b.t].media);
    const mediaT = kinds.includes('char') ? 'char' : kinds.includes('sand') ? 'sand' : 'gravel';
    const plants = blocksOf(w, 'plant');
    const plantT = plants.length ? BLOCKS[plants[0].b.t].plant : 'none';
    const settles = blocksOf(w, 'settle');
    const top = Math.max(...media.map(m => m.z)) + 1, bottom = Math.min(...media.map(m => m.z));
    const depth = Math.min(1, media.length / cols.size) * 0.8;
    const area = cols.size;
    const spec = { w: area, h: 1, depth, media: mediaT, plants: plantT, pre: settles.length ? 'settle' : 'none', out: w.mods.out || 'garden' };
    const houseFloor = house ? house.m.floorZ : null;
    const inGrav = houseFloor != null && houseFloor >= top - 0;
    const outGrav = beds.length ? beds.filter(b => bottom - b.z >= 0).length / beds.length : 0;
    filter = { spec, top, bottom, inGrav, outGrav, plantsN: plants.length };
    if (!inGrav && !pumps) diag.push({ lv: 'warn', text: '浄化の層が家の床より高い。排水が流れ込まない（低い場所に掘るか、ポンプ）' });
    if (spec.out === 'garden' && outGrav < 1 && !pumps) diag.push({ lv: 'warn', text: `きれいになった水が、畑の${Math.round((1 - outGrav) * 100)}%へは届かない（浄化より高い）` });
    if (spec.out === 'toilet' && !pumps) diag.push({ lv: 'warn', text: 'トイレへ回すにはポンプが要る（浄化は家より低い）' });
  }
  const count = (kind) => blocksOf(w, kind).length;
  return {
    groups, house, gh, ghBeds, roofComps, roofCatch, roofLost, tanks: tanks.length, fedTanks: fed.length, tankCap: fed.length * 1000, tankBase,
    beds: beds.length, gArea, bedMaxZ, risers, stoneRisers, mulch: beds.filter(b => b.b.m).length, bedSet,
    tankGrav, pondGrav, pumps, ponds: ponds.length, pondCap: ponds.length * 1000, pondArea: new Set(ponds.map(p => `${p.x},${p.y}`)).size, pondCatch, pondTop,
    filter, pvKw: count('pv') * BLOCKS.pv.kw, battKwh: count('batt') * BLOCKS.batt.kwh, heap: count('heap'), coops: count('coop'), trees: count('tree'), hedge: count('hedge'),
    greenRoof: roofs.filter(r => r.b.t === 'roof_green').length, diag
  };
}

/* ---------- 自分で作っている分を進める（作業日） ---------- */
export function progress(w, days) {
  let pool = days;
  const d0 = Math.min(pool, w.debt); w.debt -= d0; pool -= d0;
  const done = [];
  while (pool > 1e-9 && w.queue.length) {
    const k = w.queue[0], b = w.blocks[k];
    if (!b || !b.p) { w.queue.shift(); continue; }
    const use = Math.min(pool, b.p); b.p -= use; pool -= use;
    if (b.p <= 1e-9) { delete b.p; w.queue.shift(); done.push(b.t); }
  }
  return { done, left: w.debt + w.queue.reduce((a, k) => a + (w.blocks[k]?.p || 0), 0) };
}
export function pendingDays(w) { return w.debt + w.queue.reduce((a, k) => a + (w.blocks[k]?.p || 0), 0); }
