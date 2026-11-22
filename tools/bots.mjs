// 自動テストプレイ：作戦ごとのボットにキューブの世界で遊ばせ、数字で点検する。
// 使い方: node tools/bots.mjs [年数=10] [シード数=10]
import * as E from '../public/js/engine.js';
const W = E.W;
const YEARS = +(process.argv[2] || 10), SEEDS = +(process.argv[3] || 10);

/* 平らな n×m の場所を探す（高い順・低い順） */
function flats(w, n, m, pref = 'high') {
  const out = [];
  for (let y = 1; y + m < 49; y++) for (let x = 1; x + n < 49; x++) {
    const L = W.levelInfo(w, { x0: x, y0: y, x1: x + n - 1, y1: y + m - 1 }); if (!L.flat) continue;
    let free = true;
    for (let yy = y - 1; yy <= y + m && free; yy++) for (let xx = x - 1; xx <= x + n && free; xx++) for (let z = W.h(w, xx, yy) - 2; z < W.h(w, xx, yy) + 4; z++) if (W.at(w, xx, yy, z)) { free = false; break; }
    if (free) out.push([x, y, L.lo]);
  }
  out.sort((a, b) => pref === 'high' ? b[2] - a[2] : a[2] - b[2]);
  return out;
}
function room(s, mats, mode, n = 6) {
  const f = flats(s.world, n, n, 'high')[0]; if (!f) return null;
  if (W.prefabRoom(s, [f[0], f[1]], [f[0] + n - 1, f[1] + n - 1], mats, mode)) return null;
  s.flags.home = { x: f[0], y: f[1], n, z: f[2] };
  return s.flags.home;
}
function tanks(s, k, mode) {
  const hm = s.flags.home; if (!hm) return;
  const w = s.world; let placed = 0;
  for (let i = 1; i < hm.n - 1 && placed < k; i++) for (const [x, y] of [[hm.x + i, hm.y + hm.n], [hm.x - 1, hm.y + i], [hm.x + hm.n, hm.y + i]]) {
    if (placed >= k) break;
    const z = W.h(w, x, y); if (W.at(w, x, y, z)) continue;
    if (!W.put(s, x, y, z, 'tank', mode)) placed++;
  }
}
function beds(s, area, mode) {
  const hm = s.flags.home, w = s.world; let best = null;
  for (let y = 1; y + area[1] < 49; y++) for (let x = 1; x + area[0] < 49; x++) {
    let ok = true, below = 0;
    for (let yy = y; yy < y + area[1] && ok; yy++) for (let xx = x; xx < x + area[0]; xx++) { if (W.at(w, xx, yy, W.h(w, xx, yy)) || W.at(w, xx, yy, W.h(w, xx, yy) + 1)) { ok = false; break; } if (hm && W.h(w, xx, yy) < hm.z) below++; }
    if (!ok) continue;
    const score = below - (hm ? Math.hypot(x - hm.x, y - hm.y) * 0.5 : 0);
    if (!best || score > best.score) best = { x, y, score };
  }
  if (best) W.prefabBeds(s, [best.x, best.y], [best.x + area[0] - 1, best.y + area[1] - 1], mode);
}
function single(s, t, mode, near) {
  const w = s.world, hm = s.flags.home;
  for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = (near ? near[0] : hm.x) + dx, y = (near ? near[1] : hm.y) + dy; if (x < 0 || y < 0 || x > 49 || y > 49) continue;
    if (!W.put(s, x, y, W.h(w, x, y), t, mode)) return true;
  }
  return false;
}
const count = (s, t) => Object.values(s.world.blocks).filter(b => b.t === t).length;
function setBuild(s) {
  const busy = W.pendingDays(s.world) > 0.5, wk = s.persons[0].week;
  if (busy && !wk.includes('build')) { const i = wk.indexOf('farm'); if (i >= 0) wk[i] = 'build'; }
  if (!busy && wk.includes('build')) wk[wk.indexOf('build')] = 'farm';
}

const STRATS = {
  tokyo: { week: ['work', 'work', 'work', 'work', 'work', 'rest', 'rest'], plan(s) { if (!s.flags.home) room(s, { wall: 'wall_wood', window: 'window_double', floor: 'floor_wood', roof: 'roof_tin' }, 'hire'); } },
  money: {
    week: ['work', 'work', 'work', 'work', 'work', 'farm', 'rest'],
    plan(s) {
      if (!s.flags.home) { room(s, { wall: 'wall_wood', window: 'window_double', floor: 'floor_wood', roof: 'roof_tin' }, 'hire'); tanks(s, 3, 'hire'); beds(s, [8, 6], 'hire'); }
      const hm = s.flags.home; if (!hm) return;
      if (s.known.includes('offgrid') && count(s, 'pv') < 4 && s.cash > 80) for (let i = 1; i < 5; i++) W.put(s, hm.x + i, hm.y + 1, hm.z + 3, 'pv', 'hire');
      if (s.known.includes('offgrid') && count(s, 'batt') < 1 && s.cash > 40) single(s, 'batt', 'hire', [hm.x + 2, hm.y + 2]);
      if (s.known.includes('heap') && !count(s, 'heap')) single(s, 'heap', 'hire');
      if (!count(s, 'pump') && s.cash > 30) single(s, 'pump', 'hire');
    }
  },
  life: {
    week: ['work', 'work', 'farm', 'farm', 'farm', 'farm', 'rest'],
    plan(s) {
      const cold = s.site === 'taos', K = (t) => s.known.includes(t);
      if (!s.flags.home) {
        const mats = { wall: cold && K('earth') ? 'wall_earthbag' : K('bamboo') ? 'wall_bamboo' : 'wall_wood', window: cold && K('insulation') ? 'window_lowe' : 'window_double', floor: cold ? 'floor_slab' : 'floor_wood', roof: cold && K('insulation') ? 'roof_tinins' : 'roof_tin' };
        room(s, mats, 'self'); tanks(s, 4, 'self'); beds(s, [12, 10], 'self');
      }
      setBuild(s);
      const hm = s.flags.home; if (!hm) return;
      if (K('heap') && count(s, 'heap') < 2) single(s, 'heap', 'self', [hm.x - 4, hm.y + 8]);
      for (const k in s.world.blocks) {
        const b = s.world.blocks[k]; if (b.t !== 'bed') continue; const [x, y, z] = k.split(',').map(Number);
        if (K('terrace') && !b.s && s.cash > 5 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = W.h(s.world, x + dx, y + dy); return n > -99 && n < z; })) W.toggleMark(s, x, y, z, 's');
        if (K('mulch') && !b.m && s.cash > 5) W.toggleMark(s, x, y, z, 'm');
      }
      if (K('toilet') && !s.world.mods.compostToilet && s.cash > 40) { s.cash -= 30; s.world.mods.compostToilet = true; }
      if (K('saving') && !s.world.mods.saving && s.cash > 20) { s.cash -= 8; s.world.mods.saving = true; }
      if (K('grey') && !count(s, 'media_sand') && s.cash > 25) { const fx = hm.x + hm.n + 1, fy = hm.y + hm.n + 1; W.prefabPit(s, [fx, fy], [fx + 1, fy + 1], 'media_sand', 'self', 1, 'plant_reed'); }
      if (K('catch') && count(s, 'pillar') < 4 && s.cash > 30) { const f = flats(s.world, 4, 3, 'high')[0]; if (f) { W.prefabShed(s, [f[0], f[1]], [f[0] + 3, f[1] + 2], 'roof_tin', 'self'); for (let i = 0; i < 3; i++) W.put(s, f[0] + i, f[1] + 3, W.h(s.world, f[0] + i, f[1] + 3), 'tank', 'self'); } }
      if (K('offgrid') && count(s, 'pv') < 6 && s.cash > 50) for (let i = 1; i < hm.n - 1 && count(s, 'pv') < 6; i++) W.put(s, hm.x + i, hm.y + 2, hm.z + 3, 'pv', 'self');
      if (K('offgrid') && count(s, 'batt') < 1 && s.cash > 30) single(s, 'batt', 'self', [hm.x + 2, hm.y + 2]);
      if (K('hedge') && count(s, 'tree') < 10) for (let i = 0; i < 3; i++) single(s, 'tree', 'self', [hm.x - 2, hm.y - 2]);
      if (K('hedge') && count(s, 'hedge') < 12) for (let i = 0; i < 4; i++) single(s, 'hedge', 'self', [hm.x + hm.n + 2, hm.y - 2]);
      if (K('chicken') && !count(s, 'coop') && s.cash > 20) single(s, 'coop', 'self', [hm.x - 3, hm.y]);
      if (K('pond') && !count(s, 'pond') && s.cash > 20) { const lo = flats(s.world, 3, 3, 'low')[0]; if (lo) W.prefabPit(s, [lo[0], lo[1]], [lo[0] + 2, lo[1] + 2], 'pond', 'self', 1); }
      if (!count(s, 'pump') && s.cash > 20 && E.summarize(s).tankGrav < 0.8) single(s, 'pump', 'self');
    }
  },
  random: {
    week: null,
    plan(s, r) {
      if (!s.flags.home) room(s, { wall: 'wall_wood', window: 'window_single', floor: 'floor_wood', roof: 'roof_tin' }, 'hire');
      const types = Object.keys(W.BLOCKS).filter(t => !W.BLOCKS[t].prefabOnly && (!W.BLOCKS[t].learn || s.known.includes(W.BLOCKS[t].learn)));
      for (let i = 0; i < 4; i++) { const t = types[Math.floor(r() * types.length)], x = Math.floor(r() * 50), y = Math.floor(r() * 50); W.put(s, x, y, W.h(s.world, x, y), t, r() < 0.5 ? 'self' : 'hire'); }
      if (r() < 0.2) { const ws = ['work', 'farm', 'build', 'rest']; s.persons[0].week = s.persons[0].week.map((_, i) => i === 6 ? 'rest' : ws[Math.floor(r() * 4)]); }
    }
  }
};

function play(name, seed, site = 'med') {
  const st = STRATS[name], r = E.rng(seed * 31 + 7);
  let s = site === 'med' ? E.newGame({ seed }) : E.newGame({ seed, site, cash: 400, known: ['house', 'tank', 'garden', 'heap', 'toilet', 'grey', 'mulch', 'terrace', 'offgrid', 'hedge', 'saving', 'chicken', 'pond', 'catch', 'bamboo'] });
  if (st.week) s.persons[0].week = st.week.slice();
  const turns = []; let minCash = s.cash, broke = 0, quiet = 0, run = 0, maxRun = 0;
  for (let t = 0; t < YEARS * 4; t++) {
    st.plan(s, r);
    const { state, report } = E.advance(s); s = state;
    for (const l of report.learn) s = E.learn(s, l.id, l.why);
    minCash = Math.min(minCash, s.cash); if (s.cash < 0) broke++;
    const notable = report.events.filter(e => !['sold', 'replace', 'built'].includes(e.kind)).length + report.learn.length;
    if (!notable) { quiet++; run++; maxRun = Math.max(maxRun, run); } else run = 0;
    const R = E.relations(s), C = E.cycles(s);
    turns.push({ good: R.nodes.filter(x => x.good === true && x.v > 0.15).length, cash: s.cash, ev: report.events.map(e => e.kind), learn: report.learn.map(x => x.id), cyc: C.map(c => c.closure) });
  }
  const S = E.summarize(s), last = turns[turns.length - 1];
  return { name, seed, cash: s.cash, minCash, broke, quiet, maxRun, good: last.good, cyc: last.cyc, house: !!S.house, known: s.known.length, turns, diag: S.diag.length };
}
const results = {};
for (const n of Object.keys(STRATS)) { results[n] = []; for (let sd = 1; sd <= SEEDS; sd++) results[n].push(play(n, sd)); }
for (const n of ['tokyo', 'life']) { results['taos:' + n] = []; for (let sd = 1; sd <= SEEDS; sd++) results['taos:' + n].push(play(n, sd, 'taos')); }
const M = (n, k) => results[n].reduce((a, x) => a + (typeof k === 'function' ? k(x) : x[k]), 0) / results[n].length;
console.log(`\n== ${YEARS}年 × ${SEEDS}シード（キューブの世界）==`);
console.log('作戦          所持金末  最低  赤字T  静かT 最長  担い手  家   水   養分  エネ  お金  学んだ');
for (const n of Object.keys(results)) console.log(`${n.padEnd(12)} ${M(n, 'cash').toFixed(0).padStart(7)} ${M(n, 'minCash').toFixed(0).padStart(5)} ${M(n, 'broke').toFixed(1).padStart(5)} ${M(n, 'quiet').toFixed(1).padStart(6)} ${M(n, 'maxRun').toFixed(1).padStart(4)} ${M(n, 'good').toFixed(1).padStart(6)} ${(M(n, x => x.house ? 1 : 0) * 100).toFixed(0).padStart(3)}% ${[0, 1, 2, 3].map(i => (M(n, x => x.cyc[i]) * 100).toFixed(0).padStart(4) + '%').join(' ')} ${M(n, 'known').toFixed(1).padStart(5)}`);
const evc = {}; for (const rs of Object.values(results)) for (const r of rs) for (const t of r.turns) for (const e of t.ev) evc[e] = (evc[e] || 0) + 1 / rs.length / Object.keys(results).length;
console.log('\n出来事（1プレイ平均）:', Object.entries(evc).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' / '));
for (const n of ['money', 'life', 'taos:life']) { const hit = results[n].map(r => r.turns.findIndex(t => t.good >= 10)).filter(i => i >= 0).sort((a, b) => a - b); console.log(`担い手10 ${n.padEnd(9)}: ${hit.length}/${SEEDS}・中央値 ${hit.length ? (hit[Math.floor(hit.length / 2)] / 4).toFixed(1) + '年' : '-'}`); }
const checks = [
  ['生き物優先は東京型より担い手が多い', M('life', 'good') > M('tokyo', 'good') + 3],
  ['生き物優先はお金優先より担い手が多い', M('life', 'good') > M('money', 'good')],
  ['生き物優先は破産しない', M('life', 'broke') < 1],
  ['生き物優先の家は建つ（自分で作っても）', M('life', x => x.house ? 1 : 0) > 0.9],
  ['お金の輪は消えない（生き物優先でも地域内100%にならない）', M('life', x => x.cyc[3]) < 0.95],
  ['静かな季節が続きすぎない（最長<5）', M('life', 'maxRun') < 5],
  ['タオスの生き物優先は破産しない', M('taos:life', 'broke') < 1]
];
console.log('\n点検:'); for (const [t, ok] of checks) console.log(`${ok ? '  ✓' : '  ✗'} ${t}`);
process.exitCode = checks.every(c => c[1]) ? 0 : 1;
