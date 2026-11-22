// 自動テストプレイ：いくつかの作戦のボットにメデジンを遊ばせて、数字で点検する。
// 使い方: node tools/bots.mjs [年数=10] [シード数=20]
import * as E from '../public/js/engine.js';

const YEARS = +(process.argv[2] || 10), SEEDS = +(process.argv[3] || 20);

/* 置き場所を探す（左上から順に、条件に合う空き地） */
function spot(s, type, w, h, pref = {}) {
  const T = E.siteTerrain(s.site);
  let best = null;
  for (let y = 1; y + h <= E.PLOT - 1; y += 1) for (let x = 1; x + w <= E.PLOT - 1; x += 1) {
    const c = E.canPlace(s, { type, x, y, w, h }); if (!c.ok) continue;
    const r = T.rect({ x, y, w, h });
    let score = -r.slope;
    if (pref.high) score += r.elev * 2;
    if (pref.low) score -= r.elev * 2;
    if (pref.near) score -= Math.hypot(x - pref.near.x, y - pref.near.y) * 0.3;
    if (!best || score > best.score) best = { x, y, score };
  }
  return best;
}
function put(s, type, w, h, pref, extra = {}) {
  const p = spot(s, type, w, h, pref); if (!p) return s;
  const r = E.place(s, { type, x: p.x, y: p.y, w, h, ...extra });
  return r.error ? s : r.state;
}
const has = (s, t) => s.items.some(x => x.type === t);
const count = (s, t) => s.items.filter(x => x.type === t).length;

const STRATS = {
  /* 東京の暮らしをそのまま持ってくる：家だけ建てて週5で働く */
  tokyo: {
    week: ['work', 'work', 'work', 'work', 'work', 'rest', 'rest'],
    plan(s) { if (!has(s, 'house')) s = put(s, 'house', 4, 4, {}); return s; }
  },
  /* お金を貯めて設備を買う。畑は小さめ */
  money: {
    week: ['work', 'work', 'work', 'work', 'work', 'farm', 'rest'],
    plan(s) {
      if (!has(s, 'house')) s = put(s, 'house', 5, 4, {});
      const h = s.items.find(x => x.type === 'house');
      if (count(s, 'tank') < 2) s = put(s, 'tank', 2, 2, { high: true, near: h });
      if (!has(s, 'garden')) s = put(s, 'garden', 10, 8, { low: true });
      if (s.known.includes('offgrid') && count(s, 'pv') < 6 && s.cash > 80) { s = put(s, 'pv', 2, 1, { near: h }); s = put(s, 'pv', 2, 1, { near: h }); }
      if (s.known.includes('offgrid') && count(s, 'batt') < 2 && s.cash > 60) s = put(s, 'batt', 1, 1, { near: h });
      if (s.known.includes('heap') && !has(s, 'heap')) s = put(s, 'heap', 2, 2, { near: h });
      if (s.known.includes('deep') && h && h.depth < E.summarize(s).need) s = E.modify(s, h.id, { depth: E.summarize(s).need }).state;
      return s;
    }
  },
  /* 生き物との関係を優先：働く日を減らし、畑と工夫に時間を使う */
  life: {
    week: ['work', 'work', 'farm', 'farm', 'farm', 'farm', 'rest'],
    plan(s) {
      if (!has(s, 'house')) s = put(s, 'house', 4, 4, {});
      const h = s.items.find(x => x.type === 'house');
      if (count(s, 'tank') < 2 && s.cash > 30) s = put(s, 'tank', 2, 2, { high: true, near: h });
      const g = s.items.filter(x => x.type === 'garden');
      if (g.length < 2 && s.cash > 20) s = put(s, 'garden', 14, 10, { low: true });
      if (s.known.includes('heap') && count(s, 'heap') < 2) s = put(s, 'heap', 2, 2, { near: h });
      if (s.known.includes('toilet') && h && !h.mods.compostToilet) s = E.modify(s, h.id, { mods: { compostToilet: true } }).state;
      if (s.known.includes('saving') && h && !h.mods.saving) s = E.modify(s, h.id, { mods: { saving: true } }).state;
      if (s.known.includes('grey') && !has(s, 'grey')) s = put(s, 'grey', 3, 2, { near: h });
      for (const gg of s.items.filter(x => x.type === 'garden')) {
        if (s.known.includes('mulch') && !gg.mods.mulch) s = E.modify(s, gg.id, { mods: { mulch: true } }).state;
        if (s.known.includes('terrace') && !gg.mods.terrace) s = E.modify(s, gg.id, { mods: { terrace: true } }).state;
      }
      if (s.known.includes('hedge') && count(s, 'tree') < 10) for (let i = 0; i < 3; i++) s = put(s, 'tree', 1, 1, {});
      if (s.known.includes('hedge') && count(s, 'hedge') < 3) s = put(s, 'hedge', 6, 1, {});
      if (s.known.includes('offgrid') && count(s, 'pv') < 4 && s.cash > 60) s = put(s, 'pv', 2, 1, { near: h });
      if (s.known.includes('offgrid') && count(s, 'batt') < 1 && s.cash > 40) s = put(s, 'batt', 1, 1, { near: h });
      if (s.known.includes('deep') && h && h.depth < E.summarize(s).need) s = E.modify(s, h.id, { depth: E.summarize(s).need }).state;
      if (s.known.includes('chicken') && count(s, 'chicken') < 1 && s.cash > 20) s = put(s, 'chicken', 3, 2, { near: h });
      if (s.known.includes('pond') && count(s, 'pond') < 1 && s.cash > 30) s = put(s, 'pond', 4, 4, { low: true });
      return s;
    }
  },
  /* 何も知らないまま、思いつきで置く */
  random: {
    week: null,
    plan(s, r) {
      if (!has(s, 'house')) s = put(s, 'house', 5, 4, {});
      const kinds = Object.keys(E.ITEMS).filter(k => s.known.includes(k) || s.known.includes(E.ITEMS[k].learn) || E.ITEMS[k].learn === null);
      if (r() < 0.6) { const k = kinds[Math.floor(r() * kinds.length)]; const sz = E.ITEMS[k].size; if (k !== 'house') s = put(s, k, sz[0], sz[1], { near: { x: r() * 50, y: r() * 50 } }); }
      if (r() < 0.2) { const w = ['work', 'farm', 'rest']; s = E.clone(s); s.persons[0].week = s.persons[0].week.map((_, i) => i === 6 ? 'rest' : w[Math.floor(r() * 3)]); }
      return s;
    }
  }
};

function play(name, seed, foresight = false) {
  const st = STRATS[name], r = E.rng(seed * 31 + 7);
  let s = E.newGame({ seed });
  if (st.week) s.persons[0].week = st.week.slice();
  if (foresight) for (const f of E.foresight(s)) s = E.learn(s, f.id, 'foresight');
  const turns = [];
  let minCash = s.cash, broke = 0, quiet = 0, quietRun = 0, maxQuietRun = 0;
  for (let t = 0; t < YEARS * 4; t++) {
    s = st.plan(s, r);
    const { state, report } = E.advance(s);
    s = state;
    for (const l of report.learn) s = E.learn(s, l.id, l.why);
    minCash = Math.min(minCash, s.cash); if (s.cash < 0) broke++;
    const notable = report.events.filter(e => !['shared', 'replace'].includes(e.kind)).length + report.learn.length;
    if (!notable) { quiet++; quietRun++; maxQuietRun = Math.max(maxQuietRun, quietRun); } else quietRun = 0;
    const RR = E.relations(s); turns.push({ good: RR.nodes.filter(x => x.good === true && x.v > 0.15).length, cash: s.cash, rel: RR.score, ev: report.events.map(e => e.kind), learn: report.learn.map(x => x.id), ws: report.waterSelf, ps: report.powerSelf, fs: report.foodSelf, om: s.om });
  }
  const rel = E.relations(s);
  return { name, seed, cash: s.cash, minCash, broke, quiet, maxQuietRun, rel: rel.score, known: s.known.length, om: s.om, turns,
    ws: avg(turns.slice(-4), 'ws'), ps: avg(turns.slice(-4), 'ps'), fs: avg(turns.slice(-4), 'fs'), items: s.items.length };
}
const avg = (a, k) => a.reduce((x, y) => x + y[k], 0) / a.length;
const pct = (v) => (v * 100).toFixed(0) + '%';

const results = {};
for (const name of Object.keys(STRATS)) {
  results[name] = [];
  for (let seed = 1; seed <= SEEDS; seed++) results[name].push(play(name, seed));
}
// 先読みあり（life）
results['life+先読み'] = []; for (let seed = 1; seed <= SEEDS; seed++) results['life+先読み'].push(play('life', seed, true));

const evCount = {};
console.log(`\n== ${YEARS}年 × ${SEEDS}シード ==`);
console.log('作戦          所持金(末)  最低   赤字ターン  静かなターン 最長連続  関係の網  水   電気  食   土OM  学んだ数');
for (const [name, rs] of Object.entries(results)) {
  const m = (k) => rs.reduce((a, x) => a + x[k], 0) / rs.length;
  console.log(`${name.padEnd(12)} ${m('cash').toFixed(0).padStart(8)} ${m('minCash').toFixed(0).padStart(7)} ${m('broke').toFixed(1).padStart(8)} ${m('quiet').toFixed(1).padStart(10)} ${m('maxQuietRun').toFixed(1).padStart(8)} ${m('rel').toFixed(2).padStart(8)}  ${pct(m('ws')).padStart(4)} ${pct(m('ps')).padStart(4)} ${pct(m('fs')).padStart(4)} ${m('om').toFixed(1).padStart(4)} ${m('known').toFixed(1).padStart(6)}`);
  for (const r of rs) for (const t of r.turns) for (const e of t.ev) evCount[e] = (evCount[e] || 0) + 1 / rs.length / Object.keys(results).length;
}
console.log('\n出来事（1プレイあたりの平均回数）:', Object.entries(evCount).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' / '));
// 学ぶ時期
const lt = {};
for (const r of results.life) r.turns.forEach((t, i) => t.learn.forEach(id => { (lt[id] = lt[id] || []).push(i); }));
console.log('学んだ時期（life、ターン番号の中央値）:', Object.entries(lt).map(([k, v]) => `${k} ${v.sort((a, b) => a - b)[Math.floor(v.length / 2)]}(${v.length}/${SEEDS})`).join(' / '));
// 関係の網の推移（life と tokyo）
for (const name of ['tokyo', 'money', 'life']) {
  const rs = results[name]; const line = [];
  for (let y = 0; y < YEARS; y++) line.push((rs.reduce((a, r) => a + r.turns[y * 4 + 3].rel, 0) / rs.length).toFixed(1));
  console.log(`関係の網の推移 ${name.padEnd(6)}: ${line.join(' ')}`);
}
// 豊かな関係が8つに届くまで
for (const name of ['money', 'life', 'random']) {
  const hit = results[name].map(r => r.turns.findIndex(t => t.good >= 12)).filter(i => i >= 0).sort((a, b) => a - b);
  const g = results[name].map(r => r.turns[r.turns.length - 1].good);
  console.log(`豊かな関係12 ${name.padEnd(6)}: 到達 ${hit.length}/${SEEDS}・中央値 ${hit.length ? (hit[Math.floor(hit.length / 2)] / 4).toFixed(1) + '年' : '-'}・最後の数 平均${(g.reduce((a, b) => a + b, 0) / g.length).toFixed(1)}`);
}
// 機械判定
const checks = [];
const M = (n, k) => results[n].reduce((a, x) => a + x[k], 0) / results[n].length;
checks.push(['生き物優先が東京型より関係の網で上回る', M('life', 'rel') > M('tokyo', 'rel') + 1]);
checks.push(['お金優先だけが一番にならない（関係の網はlifeが上）', M('life', 'rel') > M('money', 'rel')]);
checks.push(['生き物優先でも破産しない（赤字ターン平均<1）', M('life', 'broke') < 1]);
checks.push(['静かなターンが続きすぎない（最長連続<4）', M('life', 'maxQuietRun') < 4]);
checks.push(['10年で学ぶ技術が8つ以上（life）', M('life', 'known') >= 11]);
checks.push(['東京型は関係の網が育たない', M('tokyo', 'rel') < 2.5]);
console.log('\n点検:'); for (const [t, ok] of checks) console.log(`${ok ? '  ✓' : '  ✗'} ${t}`);
process.exitCode = checks.every(c => c[1]) ? 0 : 1;
