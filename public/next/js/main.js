/* Orbarium /next：地図⇄近く、下の道具、押した物の横のカード、取り消し・やり直し。
   計算の世界（engine / world）はそのまま使い、見た目と操作だけを作り直す */
import * as THREE from 'three';
import * as E from '/js/engine.js';
import { loadRealPlot } from '/js/realsite.js';
import { sunVector, dirName } from '/js/iso.js';
import { PALETTES } from './look.js';
import { createView } from './view.js';
import { createStage } from './stage.js';
import { buildGlobe, subsolar, ll } from './globe.js';
import * as BK from './book.js';
import { ATLAS, NOTES, INVITE, LAND_INVITE } from '/js/content.js';

const W = E.W, $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search);
// 開き方：proto＝見た目の試作（?shot・?proto）、play＝遊ぶ（?play、?play&new=med で新しく）、それ以外は地球（はじまり・旅・図鑑）
const MODE = Q.has('globe') || Q.has('travel') ? 'globe' : Q.has('shot') || Q.has('proto') ? 'proto' : Q.has('play') ? 'play' : 'globe';
const CARRY = 'orbarium-next-carry', ATLAS_READ = 'orbarium-next-atlas';
let SITE = Q.get('site') || 'med';
const loadSave = () => { try { const v0 = localStorage.getItem('orbarium-next-1'); return v0 ? E.load(v0) : null; } catch { return null; } };
const atlasRead = () => { try { return JSON.parse(localStorage.getItem(ATLAS_READ) || '[]'); } catch { return []; } };
const yen = (n) => `${Math.round(n * 10) / 10}万円`.replace('.0万', '万');

/* その土地で新しく建てるときの工法。断熱したものは「断熱した壁」と「断熱したトタン屋根」 */
const LOCAL = {
  med: { wall: 'bahareque', finish: 'earth', accent: 0, roof: 'teja', roofShape: 'gable', roofDir: 'ns', pitch: 0.5, eaves: 0.9, floor: 'baldosa' },
  taos: { wall: 'adobe', roof: 'mud', roofShape: 'flat', floor: 'tierra', eaves: 0.16 }
};
const INSUL = { wall: 'ins', roof: 'tinins' };

/* 道具：6つと消しゴム。まだ移していない道具は並べるだけ */
const ICON = {
  house: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  field: '<path d="M3 18c3-2 6-2 9 0s6 2 9 0"/><path d="M3 13c3-2 6-2 9 0s6 2 9 0"/><path d="M3 8c3-2 6-2 9 0s6 2 9 0"/>',
  tree: '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21"/>',
  water: '<path d="M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11z"/>',
  shed: '<path d="M3 10l18-5v15H3z"/><path d="M9 20v-6h6v6"/>',
  terrain: '<path d="M2 19l6-8 4 5 3-4 7 7z"/>',
  erase: '<path d="M14.5 4.5l5 5-9 9H6l-3-3z"/><path d="M9.5 18.5H21"/>'
};
const TOOLS = [
  { id: 'house', name: '家', hint: '地面をなぞって床を描く。建物にくっつけると広がる。壁を押すと窓や扉を選べる' },
  { id: 'field', name: '畑', hint: '地面をなぞって畑を作る（段々になる）。畑を押すたびに 裸地→マルチ→覆い' },
  { id: 'tree', name: '木', subs: [['tree', '果樹'], ['hedge', '生け垣']], hint: '押すと植える、なぞると並べる。ある木を押すと詳しく' },
  { id: 'water', name: '水', subs: [['tank', 'タンク'], ['pond', '池'], ['filter', '排水の庭'], ['pump', 'ポンプ']],
    hints: { tank: '地面を押してタンクを置く。軒のそばなら雨どいがつき、屋根の雨が集まる', pond: 'なぞって池を掘る。斜面の水が集まる低い所がいい', filter: 'なぞって排水の庭を作る。台所やシャワーの水を砂と草でこして畑へ', pump: '押してポンプを置く。タンクや池より高い畑へ水を送る（電気を使う）' } },
  { id: 'shed', name: '小屋', subs: [['heap', '堆肥小屋'], ['coop', 'ニワトリ小屋']],
    hints: { heap: 'なぞって堆肥小屋の区画を並べる（1区画1m³）。畑の近くがいい', coop: '押してニワトリ小屋を置く' } },
  { id: 'terrain', name: '地形', subs: [['up', '上げる'], ['down', '下げる'], ['level', '平らに'], ['stone', '石垣']],
    hints: { up: 'なぞった所を1段（1m）上げる。盛る土は、とっておいた土から', down: 'なぞった所を1段（1m）下げる。出た土はとっておく', level: 'なぞった四角を、まん中の高さにそろえる', stone: '段差のふち（上の段）をなぞると、段差の面を石で積む。畑の土が流れなくなる' } },
  { id: 'erase', name: '消す', hint: '外したい物を押す（建物・タンク・畑・木・小屋・池）' }
];
// 種類ごとに要る知識（ノートにないものは選べない）
const SUBLEARN = { tree: { tree: 'hedge', hedge: 'hedge' }, water: { tank: null, pond: 'pond', filter: 'grey', pump: null }, shed: { heap: 'heap', coop: 'chicken' }, terrain: { up: null, down: null, level: null, stone: 'terrace' } };
const SAVE = 'orbarium-next-1';
const TOUCH = matchMedia('(pointer: coarse)').matches;
const HINT_NEAR = TOUCH ? '物を押すと詳しく。壁を押すと窓や扉に。1本指で回す・2本指で寄る' : '物を押すと詳しく。壁を押すと窓や扉に。ドラッグで回す・ホイールで寄る';
const HINT_CUT = TOUCH ? '家具を押すと回す・種類。家具を引きずると動く。壁を押すと窓や扉に' : '家具を押すと回す・種類。家具をドラッグすると動く。壁を押すと窓や扉に';

async function boot() {
  // どの土地で、どこから始めるか
  let saved = null, carry = null;
  if (MODE === 'play') {
    if (Q.get('new')) { SITE = Q.get('new'); try { carry = JSON.parse(localStorage.getItem(CARRY) || 'null'); } catch { carry = null; } if (carry && carry.to !== SITE) carry = null; }
    else { saved = loadSave(); if (!saved) { location.replace('/next/'); return; } SITE = saved.site; }
  }
  const S = E.SITES[SITE];
  $('#where').textContent = `${S.name} · 土地を読みこみ中…`;
  let real = null;
  if (!saved) { try { real = await loadRealPlot(S.lat0 ?? S.lat, S.lon0 ?? S.lon); E.applyReal(SITE, real); } catch (e) { console.warn('実データなし', e); } }
  const fresh = !saved;
  const s = saved || E.newGame({ site: SITE, seed: MODE === 'proto' ? 7 : Math.floor(Math.random() * 1e6), real,
    ...(carry ? { cash: carry.cash, persons: carry.persons, known: carry.known, learned: carry.learned, year: carry.year, flags: { history: carry.history } } : {}) });
  s.world.site = SITE;
  if (carry) { s.q = carry.q; localStorage.removeItem(CARRY); }
  if (MODE === 'proto') {
  // 見た目の試作：母屋をその土地の工法で建て替え、畑を少し
  const w0 = s.world, d0 = W.cloneHouse(w0.house);
  Object.assign(d0, LOCAL[SITE] || LOCAL.med);
  let i = 0; for (const o of W.houseOuterEdges(d0)) { if (!d0.open[o.e] && i % 3 === 1) d0.open[o.e] = 'window'; i++; }
  W.buildHouse(s, d0);
  const cs = Object.keys(w0.house.cells).map(k => k.split(',').map(Number)), xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
  try { const bxx = Math.min(...xs) - 1, byy = Math.max(...ys) + 3; W.prefabBeds(s, [bxx, byy], [bxx + 6, byy + 3], 'hire'); } catch { /* 置けなければなし */ }
  }
  const persist = () => { if (MODE !== 'play') return; try { localStorage.setItem(SAVE, E.save(s)); } catch { /* 保存できない */ } };

  const P = PALETTES[SITE] || PALETTES.med, N = W.N;
  const v = createView($('#c'), { keep: Q.has('shot') });
  v.setPalette(P);
  const stage = createStage(v, s, P);
  stage.rebuild();

  const rainY = S.rain.reduce((a, b) => a + b, 0);   // 年の雨（mm）
  const hMid = s.world.H.reduce((a, b) => a + b, 0) / s.world.H.length;
  const center = new THREE.Vector3(N / 2, hMid, N / 2);
  v.focus.copy(center); v.span = 36;   // 影は敷地全体に

  /* ---------- 地図⇄近く ---------- */
  const G = { mode: null, tool: null, sel: null, undo: [], redo: [], draft: null };
  const portrait = () => v.camera.aspect < 1;
  const nearDist = () => 26 * (portrait() ? 1.4 : 1);
  const mapDist = () => 118 / Math.min(1, v.camera.aspect * 1.15);
  const setMode = (m) => {
    if (m === G.mode) return; G.mode = m;
    $('#toMap').hidden = m !== 'near'; $('#tools').hidden = m !== 'near'; $('#season').hidden = m !== 'map';
    if (m === 'map') { setTool(null); select(null); if (G.draft) setDraft(null); }
    setHint();
  };
  const fitControls = () => { v.controls.maxDistance = mapDist() * 1.15; v.controls.minDistance = 9; };
  v.controls.addEventListener('change', () => { setMode(v.distance() > Math.max(55, mapDist() * 0.55) ? 'map' : 'near'); });
  const toMap = () => { select(null); v.flyTo(center, mapDist(), 50); };
  const flyNear = (p) => v.flyTo(new THREE.Vector3(p.x, p.y, p.z), nearDist(), 54);
  $('#toMap').onclick = toMap;
  $('#season').onclick = () => runSeason();

  /* ---------- 時刻 ---------- */
  const month = 5;
  const setHour = (hr) => { const sv = sunVector(S.lat, month, hr); v.setSun(sv.dir, sv.elev, hr < 12); $('#hourTxt').textContent = `${Math.floor(hr)}:${String(Math.round((hr % 1) * 60)).padStart(2, '0')} · ${dirName(sv.az)}から${Math.round(sv.elev)}°`; };
  $('#hour').oninput = (e) => setHour(+e.target.value);
  setHour(+$('#hour').value);

  /* ---------- 取り消し・やり直し ---------- */
  const snap = () => JSON.stringify({ world: s.world, cash: s.cash });
  const restore = (j) => { const o = JSON.parse(j); s.world = o.world; s.cash = o.cash; };
  const syncTop = () => {
    $('#cash').textContent = `${innerWidth > 640 ? '所持金 ' : ''}${innerWidth > 640 ? yen(s.cash) : Math.round(s.cash) + '万円'}`;
    $('#undo').disabled = !G.undo.length && !G.draft; $('#redo').disabled = !G.redo.length;
  };
  const changed = () => { stage.rebuild(); syncTop(); if (G.sel) { if (!selExists(G.sel)) select(null); else renderCard(); } };
  // 変える：失敗したら元に戻して理由を出す。成功したら取り消しに積む
  const act = (fn, okMsg) => {
    const before = snap(), cash0 = s.cash; let err;
    try { err = fn(); } catch (e) { console.error(e); err = 'うまくいかなかった'; }
    if (err) { restore(before); stage.rebuild(); syncTop(); toast(err); return err; }
    G.undo.push(before); if (G.undo.length > 60) G.undo.shift(); G.redo = [];
    changed(); persist();
    const spent = cash0 - s.cash;
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(spent) : okMsg + (Math.abs(spent) > 0.05 ? `（${spent > 0 ? '−' : '+'}${yen(Math.abs(spent))}）` : ''));
    return null;
  };
  $('#undo').onclick = () => { if (G.draft) { setDraft(null); toast('下書きをやめた'); return; } if (!G.undo.length) return; G.redo.push(snap()); restore(G.undo.pop()); changed(); persist(); toast('取り消した'); };
  $('#redo').onclick = () => { if (!G.redo.length) return; G.undo.push(snap()); restore(G.redo.pop()); changed(); persist(); toast('やり直した'); };
  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#redo') : $('#undo')).click(); } if (e.key === 'Escape') { if (G.draft) setDraft(null); else { setTool(null); select(null); } } if (e.key === 'Enter' && G.draft) $('#draftYes').click(); });

  /* ---------- 壁を下げて中を見る ---------- */
  const setCut = (on) => { stage.cut = on; $('#cut').setAttribute('aria-pressed', String(on)); if (!on) selectFurn(null); stage.rebuild(); setHint(); if (PK) renderPick(); toast(on ? (TOUCH ? '壁を下げた。家具は押すと回す・引きずると動く' : '壁を下げた。家具は押すと回す・ドラッグで動く') : '壁を戻した'); };
  $('#cut').onclick = () => setCut(!stage.cut);

  /* ---------- 短いお知らせ・指のそばの予告 ---------- */
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
  const tip = (html, x, y) => { const t = $('#tip'); if (!html) { t.hidden = true; return; } t.innerHTML = html; t.hidden = false; const hw = t.offsetWidth / 2 + 8; t.style.left = Math.max(hw, Math.min(innerWidth - hw, x)) + 'px'; t.style.top = Math.max(t.offsetHeight + 70, y - (TOUCH ? 40 : 0)) + 'px'; };

  /* ---------- 道具 ---------- */
  const tools = $('#tools');
  tools.innerHTML = TOOLS.map(t => `<button data-tool="${t.id}" class="${t.later ? 'later' : ''}" aria-label="${t.name}"><svg viewBox="0 0 24 24">${ICON[t.id]}</svg>${t.name}</button>`).join('');
  tools.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; const T = TOOLS.find(t => t.id === b.dataset.tool);
    if (T.later) { toast(T.later); return; }
    setTool(G.tool === T.id ? null : T.id);
  };
  G.sub = { tree: 'tree', water: 'tank', shed: 'heap', terrain: 'up' };
  const subsEl = $('#subs');
  const knows = (id) => !id || s.known.includes(id);
  const subOK = (t, k) => knows(SUBLEARN[t]?.[k]);
  subsEl.onclick = (e) => { const b = e.target.closest('button'); if (!b || !G.tool) return; if (!subOK(G.tool, b.dataset.sub)) { toast('まだ知らない。季節を過ごすうちに、誰かが教えてくれるかもしれない'); return; } G.sub[G.tool] = b.dataset.sub; if (G.draft) setDraft(null); renderSubs(); setHint(); };
  function renderSubs() {
    const T = TOOLS.find(t => t.id === G.tool);
    if (!T || !T.subs) { subsEl.hidden = true; return; }
    subsEl.innerHTML = T.subs.map(([k, label]) => `<button data-sub="${k}" class="${G.sub[T.id] === k ? 'on' : ''}${subOK(T.id, k) ? '' : ' locked'}">${subOK(T.id, k) ? '' : '🔒'}${label}</button>`).join(''); subsEl.hidden = false;
  }
  // なぞる道具：1本指（左ボタン）はなぞる。回すのは2本指か右ボタン
  const traces = (id) => !!id && id !== 'erase';
  function setTool(id) {
    const T0 = id && TOOLS.find(t => t.id === id);
    if (T0 && T0.subs && !subOK(id, G.sub[id])) { const k = T0.subs.find(([q]) => subOK(id, q)); if (!k) { toast(`${T0.name}の道具は、まだ知らない。季節を過ごすうちに教わる`); return; } G.sub[id] = k[0]; }
    if (G.draft && id !== G.tool) setDraft(null);
    G.tool = id; for (const b of tools.children) b.classList.toggle('on', b.dataset.tool === id);
    if (id) select(null);
    const c = v.controls, trace = traces(id);
    c.mouseButtons = { LEFT: trace ? null : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: trace ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
    c.touches = { ONE: trace ? null : THREE.TOUCH.ROTATE, TWO: trace ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN };
    renderSubs(); setHint();
  }
  function setHint() {
    const h = $('#hint');
    if (G.mode === 'map') { h.innerHTML = `寄りたい所を押す · <a href="/">今の版へ</a>`; return; }
    const T = G.tool && TOOLS.find(t => t.id === G.tool);
    if (!T) { h.textContent = stage.cut ? HINT_CUT : HINT_NEAR; return; }
    h.textContent = (T.hints ? T.hints[G.sub[T.id]] : T.hint) + (traces(T.id) ? (TOUCH ? '（回すのは2本指）' : '（回すのは右ボタン）') : '');
  }

  /* ---------- 画面の点 ⇄ 世界 ---------- */
  const canvas = $('#c');
  const ndcOf = (e) => { const r = canvas.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  const toScreen = (p) => { const q = p.clone().project(v.camera), r = canvas.getBoundingClientRect(); return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height, behind: q.z > 1 }; };
  const cellOf = (p) => ({ x: Math.floor(p.x), y: Math.floor(p.z) });

  /* ---------- 家：なぞって床を描く ---------- */
  const prevMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const prev = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 0.06, 0.92), prevMat, 900); prev.count = 0; prev.renderOrder = 5; prev.frustumCulled = false; v.scene.add(prev);
  const rectCells = (tr) => { const out = []; const xa = Math.min(tr.a.x, tr.b.x), xb = Math.max(tr.a.x, tr.b.x), ya = Math.min(tr.a.y, tr.b.y), yb = Math.max(tr.a.y, tr.b.y); for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (x >= 0 && y >= 0 && x < N && y < N) out.push([x, y]); return { out, xa, xb, ya, yb }; };
  // なぞった範囲のとなりにある建物は広げる。なければ新しい建物（離れ）
  const baseFor = (cells) => { const w = s.world, cnt = new Map(); for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = W.buildingAt(w, x + dx, y + dy); if (b) cnt.set(b, (cnt.get(b) || 0) + 1); } let best = null, bn = 0; for (const [b, n] of cnt) if (n > bn) { best = b; bn = n; } return best; };
  const draftFor = (tr) => {
    const w = s.world, { out, xa, xb, ya, yb } = rectCells(tr), base = baseFor(out);
    const hs = out.map(([x, y]) => W.h(w, x, y)).sort((a, b) => a - b);
    const d = base ? W.cloneHouse(base) : Object.assign(W.newHouse(hs[Math.floor(hs.length / 2)] ?? 0), LOCAL[SITE] || LOCAL.med, { id: 'new', use: 'store' });
    const st = out.map(([x, y]) => { if (W.buildingAt(w, x, y) === base && base) return 'have'; const p = W.cellProblem(w, d, x, y); return !p ? 'ok' : (p === '木がある' || p === 'やぶがある') ? 'tree' : p; });
    return { out, st, d, base, xa, xb, ya, yb };
  };
  const COL = { ok: new THREE.Color('#7FB069'), tree: new THREE.Color('#D9B44A'), have: new THREE.Color('#BFB7A3'), bad: new THREE.Color('#C9634A') };
  const TRACE_COL = { field: '#9C7A55', tree: '#7FB069', pond: '#6FA3B5', filter: '#CDBE95', heap: '#A07A4E', up: '#E2D7B8', down: '#7E6A55', level: '#C9B98F' };
  function showTrace(tr, e) {
    if (G.tool !== 'house') return showTraceSimple(tr, e);
    const D = draftFor(tr), m = new THREE.Matrix4(), w = s.world;
    prev.count = Math.min(900, D.out.length);
    D.out.slice(0, 900).forEach(([x, y], i) => { const z = Math.max(stage.at(x + 0.5, y + 0.5), W.h(w, x, y)) + 0.08; m.makeTranslation(x + 0.5, z, y + 0.5); prev.setMatrixAt(i, m); prev.setColorAt(i, COL[D.st[i]] || COL.bad); });
    prev.instanceMatrix.needsUpdate = true; if (prev.instanceColor) prev.instanceColor.needsUpdate = true; v.req();
    const ok = D.st.filter(t => t === 'ok' || t === 'tree').length, trees = D.st.filter(t => t === 'tree').length, bad = {};
    D.st.forEach(t => { if (!COL[t]) bad[t] = (bad[t] || 0) + 1; });
    let cost = 0; { const d = W.cloneHouse(D.d); for (let i = 0; i < D.out.length; i++) if (D.st[i] === 'ok' || D.st[i] === 'tree') { d.cells[D.out[i].join(',')] = 1; if (D.st[i] === 'tree') cost += W.cutInfo(w, ...D.out[i])?.cost || 0; }
      if (!D.base && ok) autoOpen(d); cost += W.estimate(w, D.base, d).total; }
    const lines = [`${D.xb - D.xa + 1}×${D.yb - D.ya + 1}m · ${D.base ? (D.base === w.house ? '母屋を' : '建物を') + `${ok}m²広げる` : `新しい建物 ${ok}m²`}${ok ? ` · 約${yen(cost)}` : ''}`];
    if (trees) lines.push(`木とやぶを${trees}か所切る`);
    const bads = Object.entries(bad).map(([k, n]) => `${k}（${n}）`); if (bads.length) lines.push(`<span class="bad">建てられない：${bads.join('・')}</span>`);
    if (e) tip(lines.join('<br>'), e.clientX, e.clientY);
  }
  const hideTrace = () => { prev.count = 0; v.req(); tip(null); };
  function showTraceSimple(tr, e) {
    const sub = G.sub[G.tool], cells = G.tool === 'tree' ? lineCells(tr, sub === 'tree' ? 2 : 1) : rectCells(tr).out, w = s.world, m = new THREE.Matrix4(), col = new THREE.Color(TRACE_COL[G.tool === 'field' ? 'field' : G.tool === 'tree' ? 'tree' : sub] || '#cccccc');
    prev.count = Math.min(900, cells.length);
    cells.slice(0, 900).forEach(([x, y], i) => { m.makeTranslation(x + 0.5, Math.max(stage.at(x + 0.5, y + 0.5), W.h(w, x, y)) + 0.08, y + 0.5); prev.setMatrixAt(i, m); prev.setColorAt(i, W.buildingAt(w, x, y) ? COL.bad : col); });
    prev.instanceMatrix.needsUpdate = true; if (prev.instanceColor) prev.instanceColor.needsUpdate = true; v.req();
    const { xa, xb, ya, yb } = rectCells(tr);
    tip(G.tool === 'tree' ? `${cells.length}本 · 離すと下書き` : `${xb - xa + 1}×${yb - ya + 1}m · 離すと下書き`, e.clientX, e.clientY);
  }
  /* ---------- 流れの予告：1年を試しに過ごして、今とくらべる ---------- */
  // 建てる時に一度だけ払うお金は数えない（毎年の流れだけをくらべる）
  const yearFlows = (st) => { let t = { ...st, flags: { ...st.flags, spentPrev: { ...(st.world.spent || { local: 0, far: 0 }) } } }; for (let k = 0; k < 4; k++) t = E.advance(t).state; return E.flows(t, 4); };
  let fCache = { sig: null, f: null };
  const flowsNow = () => { const sig = snap(); if (fCache.sig !== sig) fCache = { sig, f: yearFlows(s) }; return fCache.f; };
  const FLOWS = [   // 流れ・入口か出口か・項目・名前・単位・小さすぎて言わない幅・増えると良いか（1）悪いか（−1）
    ['food', 'inlet', 'land', 'とれる食べもの', 'kg', 3, 1], ['food', 'inlet', 'tight', '買う食べもの', 'kg', 3, -1],
    ['water', 'inlet', 'land', '雨水', 'm³', 0.5, 1], ['water', 'inlet', 'land2', '排水の使い回し', 'm³', 0.5, 1], ['water', 'inlet', 'shared', '水道', 'm³', 0.5, -1], ['water', 'outlet', 'leak', '流れ去る水', 'm³', 1, -1],
    ['food', 'outlet', 'ret', '畑に戻す養分', 'kgN', 0.1, 1], ['food', 'outlet', 'leak', '下水・ごみへの養分', 'kgN', 0.1, -1],
    ['energy', 'inlet', 'land2', '薪', 'kWh', 30, 1], ['energy', 'inlet', 'shared', '電力網', 'kWh', 30, -1],
    ['money', 'inlet', 'near', '近所から', '万円', 0.5, 1], ['money', 'outlet', 'near', '近所へ', '万円', 0.5, 0], ['money', 'outlet', 'far', '遠くへ', '万円', 0.5, -1]
  ];
  function flowDelta(A, B, max = 4) {
    const get = (F, id, side, key) => { const f = F.find(x => x.id === id); const r = f && f[side].find(x => x[0] === key); return r ? r[2] : 0; };
    const out = [];
    for (const [id, side, key, label, unit, th, good] of FLOWS) {
      const d = get(B, id, side, key) - get(A, id, side, key); if (Math.abs(d) < th) continue;
      const v = Math.abs(d) >= 10 ? Math.round(Math.abs(d)) : Math.round(Math.abs(d) * 10) / 10;
      out.push({ html: `<span class="${good === 0 ? '' : d * good > 0 ? 'up' : 'down'}">${label} ${d > 0 ? '+' : '−'}${v}${unit}</span>`, text: `${label} ${d > 0 ? '+' : '−'}${v}${unit}` });
      if (out.length >= max) break;
    }
    return out;
  }
  const flowHTML = (A, B) => { const d = flowDelta(A, B); return d.length ? `<span class="flowline">1年で：${d.map(x => x.html).join('')}</span>` : '<span class="flowline">流れはほとんど変わらない</span>'; };
  const flowText = (A, B) => { const d = flowDelta(A, B, 3); return d.length ? ' · 1年で ' + d.map(x => x.text).join('、') : ''; };
  // すぐ置く物（タンク・木1本・小屋1つ）：置いたら1年の流れの変わり方を出す
  const actFlow = (fn, label) => { const A = flowsNow(); return act(fn, (spent) => `${label}${spent >= 0.05 ? `（−${yen(spent)}）` : ''}${flowText(A, yearFlows(s))}`); };

  /* ---------- 下書き：なぞっただけでは置かない。写しの世界で試しに置いて模型で見せ、［建てる］で本物に ---------- */
  const scratch = () => ({ ...s, world: JSON.parse(JSON.stringify(s.world)), cash: s.cash });
  // dr = { what, apply(t) → 理由 or null, house?: {d, hideId}, cuts?, land?: 地形が変わるか, real?: 模型でなく本物の見た目, note?, ok? }
  function setDraft(dr) {
    if (!dr) { G.draft = null; stage.draft = null; $('#draft').hidden = true; document.body.classList.remove('drafting'); prev.count = 0; stage.rebuild(); syncTop(); return; }
    const t = scratch(); let err = null;
    try { err = dr.apply(t); } catch (e) { console.error(e); err = 'うまくいかなかった'; }
    const nb = {}; if (!err) for (const k in t.world.blocks) if (JSON.stringify(s.world.blocks[k]) !== JSON.stringify(t.world.blocks[k])) nb[k] = t.world.blocks[k];
    G.draft = { ...dr, t: err ? null : t, err, cost: err ? 0 : s.cash - t.cash };
    stage.draft = { d: dr.house ? (err ? dr.house.d : W.buildingById(t.world, W.bid(dr.house.d)) || dr.house.d) : null, hideId: dr.house ? dr.house.hideId : null,
      cut: (dr.cuts || []).map(c => c.join(',')), blocks: dr.house ? null : nb, landWorld: dr.land && !err ? t.world : null, real: !!dr.real };
    if (!dr.land) prev.count = 0;
    stage.rebuild();
    const fl = err ? '' : flowHTML(flowsNow(), yearFlows(t));
    $('#draftTxt').innerHTML = `<b>${dr.what}</b> · ${err ? `<span style="color:var(--bad)">${err}</span>` : `約${yen(G.draft.cost)}`}${dr.cuts && dr.cuts.length ? ` · 木とやぶを${dr.cuts.length}か所切る` : ''}<br><span class="s">${fl}${dr.note ? '<br>' + dr.note : ''}</span>`;
    $('#draftYes').disabled = !!err; $('#draftYes').textContent = dr.ok || '建てる';
    $('#draft').hidden = false; document.body.classList.add('drafting'); syncTop();
  }
  $('#draftNo').onclick = () => setDraft(null);
  $('#draftYes').onclick = () => {
    const D = G.draft; if (!D || D.err) return;
    const t = scratch(); const err = D.apply(t); if (err) { toast(err); return; }
    setDraft(null);
    act(() => { s.world = t.world; s.cash = t.cash; return null; }, D.done || '置いた');
  };

  /* 家の下書き */
  function houseDraft(d, base, cuts) {
    const bx = W.roofBox(d), n = Object.keys(d.cells).length;
    return { what: base ? `${base === 'main' ? '母屋' : '建物'}を広げる（床${n}m²に）` : `新しい建物 ${bx.X1 - bx.X0}×${bx.Y1 - bx.Y0}m`, house: { d, hideId: base }, cuts, kind: 'house',
      note: '壁を押すと窓や扉を選べる。なぞり直すと形が変わる', done: base ? '床を広げた' : '建てた。押すと使い道を選べる',
      apply: (t) => { for (const [x, y] of cuts) { const err = W.cutTree(t, x, y); if (err) return err; }
        if (d.id && /^b\d+$/.test(d.id)) t.world.nextB = Math.max(t.world.nextB || 0, +d.id.slice(1));
        const err = W.buildBuilding(t, d); if (err) return err; autoGutter(t); return null; } };
  }
  function makeHouseDraft(tr) {
    const D = draftFor(tr), good = D.out.filter((c, i) => D.st[i] === 'ok' || D.st[i] === 'tree');
    if (!good.length) { toast('ここには建てられない'); return; }
    const cuts = D.out.filter((c, i) => D.st[i] === 'tree');
    const t = scratch(); for (const [x, y] of cuts) W.cutTree(t, x, y);   // 床の形は、木を切ったことにして決める
    let d;
    if (D.base) d = W.cloneHouse(D.base);
    else { d = W.newAnnex(t.world, D.d.z, 'store'); Object.assign(d, LOCAL[SITE] || LOCAL.med); }
    const r = W.draftAddRect(t.world, d, D.xa, D.ya, D.xb, D.yb);
    if (!r.added) { toast('床を描けない（' + Object.keys(r.why).join('・') + '）'); return; }
    if (!D.base) { if (Object.keys(d.cells).length < 4) { toast('床は4m²（2×2m）より広く'); return; } autoOpen(d); }
    setDraft(houseDraft(d, D.base ? W.bid(D.base) : null, cuts));
  }
  // 下書きの壁を押す：その場に選択肢
  function draftWallTap(p) {
    const D = G.draft; if (!D || !D.house) return;
    const e = nearestEdge(D.house.d, p.point, p.normal, stage.cut); if (!e) { toast('外壁を押すと、窓や扉を選べる'); return; }
    openPick({ draft: true, e });
  }

  /* 畑・小屋・池・地形の下書き（なぞった四角の中のマス） */
  const vegCut = (t, x, y) => (W.vegAt(t.world, x, y) ? W.cutTree(t, x, y) : null);
  function rectDraft(tr) {
    const { out, xa, xb, ya, yb } = rectCells(tr), a = [xa, ya], b = [xb, yb], w = s.world, sub = G.sub[G.tool], nx = xb - xa + 1, ny = yb - ya + 1;
    const cuts = out.filter(([x, y]) => W.vegAt(w, x, y) && !W.buildingAt(w, x, y));
    const each = (t, fn) => { let n = 0, why = null; for (const [x, y] of out) { if (W.buildingAt(t.world, x, y)) { why = why || '建物がある'; continue; } const e = fn(x, y); if (e) why = why || e; else n++; } return n ? null : (why || '置ける場所がない'); };
    if (G.tool === 'field') return { what: `畑 ${nx}×${ny}m`, cuts, done: '畑を作った', note: '畑を押すと 裸地→マルチ→覆い',
      apply: (t) => each(t, (x, y) => { if (W.blocksOf(t.world, 'bed').some(q => q.x === x && q.y === y)) return 'もう畑'; const c = vegCut(t, x, y); if (c) return c; return W.put(t, x, y, W.h(t.world, x, y), 'bed', 'hire'); }) };
    if (G.tool === 'shed' && sub === 'heap') return { what: `堆肥小屋 ${out.length}区画`, cuts, done: '堆肥小屋を建てた',
      apply: (t) => each(t, (x, y) => { const c = vegCut(t, x, y); if (c) return c; return W.put(t, x, y, W.h(t.world, x, y), 'heap', 'hire'); }) };
    if (G.tool === 'water' && (sub === 'pond' || sub === 'filter')) return { what: sub === 'pond' ? `池 ${nx}×${ny}m（深さ1m）` : `排水の庭 ${nx}×${ny}m`, cuts, land: true, real: true, done: sub === 'pond' ? '池を掘った' : '排水の庭を作った',
      note: sub === 'pond' ? '掘った土はとっておく（盛るのに使う）' : '台所やシャワーの排水が、砂利と砂と草の根を通ってきれいになる',
      apply: (t) => { for (const [x, y] of out) { const c = vegCut(t, x, y); if (c) return c; } return W.prefabPit(t, a, b, sub === 'pond' ? 'pond' : 'media_sand', 'hire', 1, sub === 'pond' ? null : 'plant_reed'); } };
    if (G.tool === 'terrain' && sub === 'stone') return { what: `石垣 ${nx}×${ny}m の段差`, cuts: [], land: true, real: true, ok: '積む', done: '石垣を積んだ', note: '段差の面を石で留める。すき間がトカゲや虫の住みかになる',
      apply: (t) => each(t, (x, y) => W.dropArea(t.world, x, y) ? W.buildStone(t, x, y) : '段差がない') };
    if (G.tool === 'terrain') return { what: `地形を${sub === 'up' ? '1段上げる' : sub === 'down' ? '1段下げる' : '平らにする'} ${nx}×${ny}m`, cuts, land: true, real: true, ok: '変える', done: '地形を変えた',
      note: sub === 'down' ? '掘った土はとっておく' : sub === 'up' ? '盛る土は、とっておいた土から（なければ買う）' : 'まん中の高さにそろえる',
      apply: (t) => { for (const [x, y] of out) { const c = vegCut(t, x, y); if (c) return c; }
        if (sub === 'level') return W.prefabLevel(t, a, b, 'hire');
        if (sub === 'stone') return each(t, (x, y) => W.dropArea(t.world, x, y) ? W.buildStone(t, x, y) : '段差がない');
        return each(t, (x, y) => sub === 'up' ? W.fill(t, x, y, 'hire') : W.dig(t, x, y, 'hire')); } };
    return null;
  }
  // 木を並べる：なぞった線にそって（果樹は2mおき、生け垣は1mおき）
  function lineCells(tr, step) { const out = [], n = Math.max(Math.abs(tr.b.x - tr.a.x), Math.abs(tr.b.y - tr.a.y)); for (let k = 0; k <= n; k += step) { const u = n ? k / n : 0; out.push([Math.round(tr.a.x + (tr.b.x - tr.a.x) * u), Math.round(tr.a.y + (tr.b.y - tr.a.y) * u)]); } return out; }
  function treeDraft(tr) {
    const sub = G.sub.tree, cells = lineCells(tr, sub === 'tree' ? 2 : 1), w = s.world;
    return { what: `${sub === 'tree' ? '果樹' : '生け垣'}を${cells.length}本`, done: sub === 'tree' ? '果樹を植えた' : '生け垣を植えた', ok: '植える',
      note: sub === 'tree' ? '実がなり、落ち葉が堆肥になる。根が斜面の土を止める' : '風よけと目かくし。刈った枝葉が堆肥になる',
      apply: (t) => { let n = 0, why = null; for (const [x, y] of cells) { if (W.vegAt(t.world, x, y)) { why = why || '木がある'; continue; } const e = W.put(t, x, y, W.h(t.world, x, y), sub, 'hire'); if (e) why = why || e; else n++; } return n ? null : (why || '植えられない'); } };
  }
  // 畑の印：裸地→マルチ→覆い→裸地（覆いは小さな温室）
  const bedAt = (w, x, y) => W.blocksOf(w, 'bed').find(q => q.x === x && q.y === y);
  const bedState = (b) => b.b.g ? 'cover' : b.b.m ? 'mulch' : 'bare';
  const BED_NAME = { bare: '裸地', mulch: 'マルチ（刈り草で覆う）', cover: '覆い（小さな温室）' }, BED_LEARN = { bare: null, mulch: 'mulch', cover: 'greenhouse' };
  const nextBed = (st) => { const order = ['bare', 'mulch', 'cover']; let i = order.indexOf(st); for (let k = 0; k < 3; k++) { i = (i + 1) % 3; if (knows(BED_LEARN[order[i]])) return order[i]; } return 'bare'; };
  function cycleBeds(cells, st) { const to = nextBed(st); if (to === st) { toast('マルチも覆いも、まだ知らない'); return; } bedMarks(cells, to); }
  function setBed(t, b, to) { const want = { m: to === 'mulch' ? 1 : 0, g: to === 'cover' ? 1 : 0 }; for (const k of ['m', 'g']) if (!!b.b[k] !== !!want[k]) { const e = W.toggleMark(t, b.x, b.y, b.z, k); if (e) return e; } return null; }
  function bedMarks(cells, to) {
    actFlow(() => { let n = 0; for (const [x, y] of cells) { const b = bedAt(s.world, x, y); if (!b) continue; const e = setBed(s, b, to); if (e) return e; n++; } return n ? null : '畑がない'; }, `畑を${BED_NAME[to]}に`);
  }
  // 新しい建物の扉と窓：扉は母屋に向いた辺のまん中、窓は長い辺に間をあけて
  function autoOpen(d) {
    const w = s.world, outs = W.houseOuterEdges(d), mh = w.house;
    const mc = mh ? (() => { const bx = W.roofBox(mh); return [(bx.X0 + bx.X1) / 2, (bx.Y0 + bx.Y1) / 2]; })() : [N / 2, N / 2];
    const mid = (o) => { const [t, r] = o.e.split(':'), [ex, ey] = r.split(',').map(Number); return t === 'h' ? [ex + 0.5, ey] : [ex, ey + 0.5]; };
    let best = null, bd = 1e9; for (const o of outs) { const [mx, my] = mid(o), dd = Math.hypot(mx - mc[0], my - mc[1]); if (dd < bd) { bd = dd; best = o; } }
    if (best) d.open[best.e] = 'door';
    outs.forEach((o, i) => { if (o !== best && i % 3 === 1) d.open[o.e] = 'window'; });
  }
  // 軒のそばにタンクがあれば雨どいをつける（雨どいを選ぶ道具はない）
  function autoGutter(st = s) {
    const w = st.world, tanks = W.blocksOf(w, 'tank');
    for (const b of W.buildings(w)) {
      if (b.gutter || W.ROOFS[b.roof]?.canales) continue;
      const near = W.drainEdges(b).some(o => tanks.some(t => Math.max(Math.abs(t.x - o.x), Math.abs(t.y - o.y)) <= 1 && t.z < b.z + W.HOUSE_H));
      if (!near) continue;
      const d = W.cloneHouse(b); d.gutter = true; const err = W.buildBuilding(st, d); if (err) return err;
    }
    return null;
  }
  // 押した点にいちばん近い外壁の辺（50cm 以内）
  // 押した所が外壁か：壁の線の外側（または外を向いた面）で、壁の厚み・腰壁・窓台の出っぱりの中、高さが壁の範囲。
  // 床や家具（壁の内側）、屋根、足もとの石は除く
  function nearestEdge(b, pt, normal, any = false) {
    if (!normal || pt.y < b.z - 0.05 || pt.y > b.z + W.HOUSE_H + 0.05) return null;
    const px = pt.x, py = pt.z; let best = null, bd = 1e9;
    for (const o of W.houseOuterEdges(b)) {
      const [t, r] = o.e.split(':'), [ex, ey] = r.split(',').map(Number);
      const [ax, ay, bx, by] = t === 'h' ? [ex, ey, ex + 1, ey] : [ex, ey, ex, ey + 1];
      const u = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2); if (u < -0.05 || u > 1.05) continue;
      const [ox, oy] = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[o.dir];
      const sd = (px - ax) * ox + (py - ay) * oy;   // 壁の線から外へどれだけ
      const facing = normal.x * ox + normal.z * oy >= 0.5, outside = sd >= -0.02 && pt.y > b.z + 0.3;
      if (Math.abs(sd) > (any ? 0.125 : 0.27) || !(any || facing || outside)) continue;
      if (Math.abs(sd) < bd) { bd = Math.abs(sd); best = o; }
    }
    return best ? best.e : null;
  }
  // 壁を押す：その場に［壁｜窓｜二重窓｜扉］。外れたところ（床・屋根）は建物のカード
  function wallTap(p) {
    const b = W.buildingById(s.world, p.id); if (!b) return;
    const e = nearestEdge(b, p.point, p.normal, stage.cut);
    if (!e) { if (stage.cut) { const h = furnHit(p); if (h) { selectFurn(h); return; } } select(p); return; }
    openPick({ id: p.id, e });
  }

  /* ---------- 壁の選択肢：Tiny Glade や The Sims のように、押した壁のそばに出す。
     1回押せば決まる（取り消せる）。扉で家具がじゃまなら、家具のほうをよける ---------- */
  const OPTS = [['', '壁', '熱が逃げにくい。光も風も入らない'], ['window', '窓', W.OPENINGS.window.note], ['window2', '二重窓', W.OPENINGS.window2.note], ['door', '扉', W.OPENINGS.door.note]];
  const pk = document.createElement('div'); pk.className = 'pick'; pk.hidden = true; document.body.appendChild(pk);
  const markMat = new THREE.MeshBasicMaterial({ color: 0xF0B84A, transparent: true, opacity: 0.5, depthWrite: false });
  const wallMark = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), markMat); wallMark.visible = false; wallMark.renderOrder = 6; v.scene.add(wallMark);
  let PK = null;
  const pkHouse = () => PK && (PK.draft ? G.draft?.house?.d : W.buildingById(s.world, PK.id));
  const edgeMid = (b, e) => { const [t, r] = e.split(':'), [ex, ey] = r.split(',').map(Number), along = t === 'h'; return { along, x: along ? ex + 0.5 : ex, y: along ? ey : ey + 0.5 }; };
  function openPick(o) { select(null); selectFurn(null); PK = o; renderPick(); }
  function closePick() { PK = null; pk.hidden = true; wallMark.visible = false; v.req(); }
  function pickOptions(b, e) {
    const cur = b.open[e] || '';
    return OPTS.map(([t, name, note]) => {
      const o = { t, name, note, cur: cur === t };
      if (t && W.OPENINGS[t].learn && !knows(W.OPENINGS[t].learn)) { o.lock = true; return o; }
      if (o.cur) return o;
      const d = W.cloneHouse(b); W.draftSetOpening(d, e, t || null); const st = W.settleFurn(d); o.moved = st.moved;
      const pr = W.houseProblems(d); if (pr.length) { o.why = pr[0].replace('（出入りできない）', ''); return o; }
      if (!PK.draft) { const tt = scratch(); const err = W.buildBuilding(tt, d); if (err) o.why = err; else o.cost = s.cash - tt.cash; }
      return o;
    });
  }
  function renderPick() {
    const b = pkHouse(); if (!b || !W.houseOuterEdges(b).some(x => x.e === PK.e)) { closePick(); return; }
    const opts = pickOptions(b, PK.e), cur = opts.find(o => o.cur) || opts[0];
    const price = (o) => o.cur ? 'いま' : o.lock ? '🔒 まだ' : o.why ? '選べない' : PK.draft ? '' : Math.abs(o.cost) < 0.05 ? '0円' : (o.cost > 0 ? '−' : '+') + yen(Math.abs(o.cost));
    pk.innerHTML = `<div class="pick-h"><b>この壁</b><span class="sub">${PK.draft ? '下書き' : W.WALLS[b.wall].name}</span><button class="x" data-p="x" aria-label="閉じる">×</button></div>
      <div class="pick-o">${opts.map(o => `<button data-p="${o.t || 'wall'}" class="${o.cur ? 'on' : ''}" ${o.lock || o.why ? 'disabled' : ''} title="${BK.esc(o.why || o.note)}"><i class="op op-${o.t || 'wall'}"></i><b>${o.name}</b><span>${price(o)}</span></button>`).join('')}</div>
      <p class="pick-n">${BK.esc(cur.note)}${opts.filter(o => o.why && !o.lock).map(o => `<br><span class="bad">${o.name}：${BK.esc(o.why)}</span>`).join('')}${opts.find(o => o.t === 'door' && !o.cur && o.moved?.length && !o.why) ? `<br>扉にすると、${opts.find(o => o.t === 'door').moved.join('・')}を近くへよける` : ''}</p>
      ${PK.draft ? '' : '<button class="pick-more" data-p="more">建物ぜんたい（工法・屋根・設備）</button>'}`;
    pk.hidden = false;
    const m = edgeMid(b, PK.e), h = stage.cut ? 1.12 : W.HOUSE_H + 0.04;
    wallMark.scale.set(m.along ? 1.04 : 0.32, h, m.along ? 0.32 : 1.04); wallMark.position.set(m.x, b.z + h / 2, m.y); wallMark.visible = true; v.req();
    placePick();
  }
  function placePick() {
    if (pk.hidden || !PK) return; const b = pkHouse(); if (!b) return;
    if (innerWidth <= 640) { pk.style.left = pk.style.top = ''; return; }
    const m = edgeMid(b, PK.e), a = toScreen(new THREE.Vector3(m.x, b.z + (stage.cut ? 1.1 : W.HOUSE_H), m.y)), w2 = pk.offsetWidth, h2 = pk.offsetHeight;
    let y = a.y - h2 - 18; if (y < 64) y = a.y + 40; y = Math.min(innerHeight - h2 - 120, Math.max(64, y));
    pk.style.left = Math.max(10, Math.min(innerWidth - w2 - 10, a.x - w2 / 2)) + 'px'; pk.style.top = y + 'px';
  }
  pk.onclick = (ev) => {
    const bt = ev.target.closest('[data-p]'); if (!bt || bt.disabled || !PK) return;
    const k = bt.dataset.p;
    if (k === 'x') { closePick(); return; }
    if (k === 'more') { const id = PK.id; closePick(); select({ kind: 'building', id }); return; }
    const t = k === 'wall' ? null : k, name = OPTS.find(o => o[0] === (t || ''))[1];
    if (PK.draft) {
      const D = G.draft, d = W.cloneHouse(D.house.d); W.draftSetOpening(d, PK.e, t); const st = W.settleFurn(d);
      setDraft(houseDraft(d, D.house.hideId, D.cuts)); if (st.moved.length) toast(`${st.moved.join('・')}をよけた`); renderPick(); return;
    }
    let moved = [];
    act(() => { const b = W.buildingById(s.world, PK.id), d = W.cloneHouse(b); const err = W.draftSetOpening(d, PK.e, t); if (err) return err; moved = W.settleFurn(d).moved; return W.buildBuilding(s, d); },
      (spent) => `${name}にした${moved.length ? `。${moved.join('・')}をよけた` : ''}${Math.abs(spent) > 0.05 ? `（${spent > 0 ? '−' : '+'}${yen(Math.abs(spent))}）` : ''}`);
    renderPick();
  };

  /* ---------- 家具：壁を下げているときに、押すと選ぶ（回す・種類）、引きずると動く ---------- */
  const fbar = document.createElement('div'); fbar.className = 'pick furnbar'; fbar.hidden = true; document.body.appendChild(fbar);
  const fmarkG = new THREE.Group(); fmarkG.renderOrder = 6; v.scene.add(fmarkG);
  const fmGeo = new THREE.BoxGeometry(0.94, 0.05, 0.94), fmOk = new THREE.MeshBasicMaterial({ color: 0x7FB069, transparent: true, opacity: 0.4, depthWrite: false }),
    fmBad = new THREE.MeshBasicMaterial({ color: 0xD0584A, transparent: true, opacity: 0.55, depthWrite: false }), fmSel = new THREE.MeshBasicMaterial({ color: 0xF0B84A, transparent: true, opacity: 0.5, depthWrite: false });
  function showFoot(cells, z, mat, frame = false) {
    fmarkG.clear(); const inC = (x, y) => cells.some(c => c[0] === x && c[1] === y);
    if (!frame) { for (const [x, y] of cells) { const m = new THREE.Mesh(fmGeo, mat); m.scale.y = 9; m.position.set(x + 0.5, z + 0.23, y + 0.5); m.renderOrder = 6; fmarkG.add(m); } }   // 置く先：家具の高さくらいの半透明の箱
    else for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // 選んだ家具は、まわりを縁どる
      if (inC(x + dx, y + dy)) continue; const m = new THREE.Mesh(fmGeo, mat);
      m.scale.set(dx ? 0.07 : 1.06, 1.6, dy ? 0.07 : 1.06); m.position.set(x + 0.5 + dx * 0.47, z + 0.04, y + 0.5 + dy * 0.47); m.renderOrder = 6; fmarkG.add(m);
    }
    v.req();
  }
  // 押した点の下の家具（壁を下げているときだけ）
  function furnHit(p) {
    if (!stage.cut || !p || p.kind !== 'building') return null;
    const b = W.buildingById(s.world, p.id); if (!b || p.point.y > b.z + 1.3) return null;
    const c = cellOf(p.point), i = (b.furn || []).findIndex(f => W.furnCells(f).some(([x, y]) => x === c.x && y === c.y));
    return i < 0 ? null : { id: p.id, i, cell: c };
  }
  let FS = null;   // 選んでいる家具 { id, i }
  function selectFurn(h) {
    FS = h ? { id: h.id, i: h.i } : null;
    if (!FS) { fbar.hidden = true; fmarkG.clear(); v.req(); return; }
    closePick(); select(null); renderFurn();
  }
  function renderFurn() {
    const b = FS && W.buildingById(s.world, FS.id), f = b?.furn?.[FS.i]; if (!f) { selectFurn(null); return; }
    const F = W.FURN[f.t], alts = Object.entries(W.FURN).filter(([k, x]) => x.group === F.group && k !== f.t && k !== 'stove');
    fbar.innerHTML = `<div class="pick-h"><b>${F.name}</b><button class="x" data-f="x" aria-label="閉じる">×</button></div>
      <div class="pick-o">${F.d > 1 || f.t !== 'shower' ? '<button data-f="rot"><i class="op op-rot"></i><b>回す</b><span>90°</span></button>' : ''}
      ${[[f.t, F], ...alts].length > 1 ? [[f.t, F], ...alts].map(([k, x]) => `<button data-f="t:${k}" class="${k === f.t ? 'on' : ''}" ${x.learn && !knows(x.learn) ? 'disabled' : ''}><b>${x.name.replace('トイレ', '').replace('シャワー', '') || x.name}</b><span>${k === f.t ? 'いま' : x.learn && !knows(x.learn) ? '🔒 まだ' : x.cost ? '−' + yen(x.cost) : '0円'}</span></button>`).join('') : ''}</div>
      <p class="pick-n">${BK.esc(F.note)}<br>${TOUCH ? '引きずると動く' : 'ドラッグすると動く'}（緑は置ける・赤は置けない）</p>`;
    fbar.hidden = false; showFoot(W.furnCells(f), b.z, fmSel, true); placeFbar();
  }
  function placeFbar() {
    if (fbar.hidden || !FS) return; const b = W.buildingById(s.world, FS.id), f = b?.furn?.[FS.i]; if (!f) return;
    if (innerWidth <= 640) { fbar.style.left = fbar.style.top = ''; return; }
    // 家具を隠さないよう、画面に映る家具の外側（上、だめなら下、だめなら横）に置く
    const pts = []; for (const [x, y] of W.furnCells(f)) for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (const h of [0, 1]) pts.push(toScreen(new THREE.Vector3(x + ox, b.z + h, y + oy)));
    const L = Math.min(...pts.map(q => q.x)), R = Math.max(...pts.map(q => q.x)), T0 = Math.min(...pts.map(q => q.y)), B0 = Math.max(...pts.map(q => q.y)), w2 = fbar.offsetWidth, h2 = fbar.offsetHeight;
    let x = (L + R) / 2 - w2 / 2, y = T0 - h2 - 14;
    if (y < 64) { y = B0 + 14; if (y + h2 > innerHeight - 120) { y = (T0 + B0) / 2 - h2 / 2; x = R + 16 + w2 < innerWidth - 10 ? R + 16 : L - 16 - w2; } }
    fbar.style.left = Math.max(10, Math.min(innerWidth - w2 - 10, x)) + 'px'; fbar.style.top = Math.max(64, Math.min(innerHeight - h2 - 120, y)) + 'px';
  }
  fbar.onclick = (ev) => {
    const bt = ev.target.closest('[data-f]'); if (!bt || bt.disabled || !FS) return;
    const k = bt.dataset.f, { id, i } = FS;
    if (k === 'x') { selectFurn(null); return; }
    if (k === 'rot') act(() => { const d = W.cloneHouse(W.buildingById(s.world, id)); const err = W.draftRotateFurn(d, i, 1); if (err) return err; return W.buildBuilding(s, d); }, '回した');
    else if (k.startsWith('t:')) { const t = k.slice(2); act(() => { const d = W.cloneHouse(W.buildingById(s.world, id)); const err = W.draftSwapFurn(d, i, t); if (err) return err; return W.buildBuilding(s, d); }, `${W.FURN[t].name}に`); }
    if (FS) renderFurn();
  };
  // 引きずって動かす：家具の上で押したときだけ、視点を回す代わりに家具をつかむ（The Sims・あつ森と同じ）
  let FD = null; const ray = new THREE.Raycaster(), plane = new THREE.Plane();
  const floorCell = (e, z) => { ray.setFromCamera(ndcOf(e), v.camera); plane.set(new THREE.Vector3(0, 1, 0), -z); const q = ray.ray.intersectPlane(plane, new THREE.Vector3()); return q ? cellOf(q) : null; };
  canvas.addEventListener('pointerdown', (e) => {
    if (FD && FD.pid !== e.pointerId) { FD = null; FS ? renderFurn() : fmarkG.clear(); return; }   // 2本目の指：つかむのをやめて、視点に任せる
    if (e.button !== 0 || G.mode !== 'near' || !stage.cut || G.draft || (G.tool && G.tool !== 'house')) return;
    const p = stage.pick(ndcOf(e)); if (!p || p.kind !== 'building') return;
    const b = W.buildingById(s.world, p.id); if (nearestEdge(b, p.point, p.normal, true)) return;
    const h = furnHit(p); if (!h) return;
    e.stopImmediatePropagation(); canvas.setPointerCapture(e.pointerId);
    const f = b.furn[h.i]; FD = { ...h, pid: e.pointerId, x: e.clientX, y: e.clientY, ts: e.timeStamp, dx: h.cell.x - f.x, dy: h.cell.y - f.y, z: b.z, drag: false, to: null };
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (!FD || e.pointerId !== FD.pid) return; e.stopImmediatePropagation();
    if (!FD.drag && Math.hypot(e.clientX - FD.x, e.clientY - FD.y) < 8) return;
    if (!FD.drag) { FD.drag = true; fbar.hidden = true; closePick(); select(null); }
    const c = floorCell(e, FD.z); if (!c) return;
    const b = W.buildingById(s.world, FD.id), f = b.furn[FD.i], g = { ...f, x: c.x - FD.dx, y: c.y - FD.dy };
    if (FD.to && FD.to.x === g.x && FD.to.y === g.y) return;
    const why = W.furnProblem(b, g, FD.i); FD.to = { x: g.x, y: g.y, why };
    showFoot(W.furnCells(g), b.z, why ? fmBad : fmOk);
    if (why) tip(why, e.clientX, e.clientY); else $('#tip').hidden = true;
  }, { capture: true });
  const fup = (e) => {
    if (!FD || e.pointerId !== FD.pid) return; e.stopImmediatePropagation();
    const d0 = FD; FD = null; $('#tip').hidden = true;
    if (!d0.drag) { if (e.type === 'pointerup') selectFurn(d0); return; }
    const b = W.buildingById(s.world, d0.id), f = b.furn[d0.i];
    if (!d0.to || (d0.to.x === f.x && d0.to.y === f.y) || e.type !== 'pointerup') { selectFurn(d0); return; }
    if (d0.to.why) { toast(`ここには置けない：${d0.to.why}`); selectFurn(d0); return; }
    act(() => { const d = W.cloneHouse(b); const err = W.draftMoveFurn(d, d0.i, d0.to.x, d0.to.y, f.r || 0); if (err) return err; return W.buildBuilding(s, d); }, `${W.FURN[f.t].name}を動かした`);
    selectFurn(d0);
  };
  canvas.addEventListener('pointerup', fup, { capture: true }); canvas.addEventListener('pointercancel', fup, { capture: true });

  /* ---------- 水：タンク ---------- */
  // 雨が入らない理由を、そのタンクの場所から具体的に
  const DIRN = { n: '北', s: '南', e: '東', w: '西' };
  function tankWhy(t, A) {
    const w = s.world, K = (o) => `${o.x},${o.y},${o.z}`, cheb = (x, y) => Math.max(Math.abs(x - t.x), Math.abs(y - t.y));
    for (const b of W.buildings(w)) {
      const cells = Object.keys(b.cells).map(k => k.split(',').map(Number)); if (!cells.some(([x, y]) => cheb(x, y) <= 1)) continue;
      const sh = b.roofShape || 'flat', eave = b.z + W.HOUSE_H + (sh === 'flat' ? 0 : -(b.pitch || 0.3) * W.eavesDepth(b)) + 0.01;
      if (t.z >= eave) return 'タンクの入口が軒より高い（建物より高い地面にある）。もっと低い所に置く。';
      if (!W.drainEdges(b).some(o => cheb(o.x, o.y) <= 1)) return `この壁の上は屋根の三角の側（妻側）で、雨が落ちてこない。雨は${W.drainDirs(b).map(d => DIRN[d]).join('と')}の軒へ流れる。そちらの軒の下か、雨の入るタンクのとなりに置く。`;
    }
    const nb = W.blocksOf(w, 'tank').filter(o => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) === 1 && Math.abs(o.z - t.z) <= 3), fedNb = nb.filter(o => A.fedKeys.includes(K(o)));
    if (fedNb.length && fedNb.every(o => o.z < t.z)) return 'となりのタンクより地面が高い。水は低い方へしか流れないので、同じ高さか低い所に置く。';
    if (fedNb.length) return 'となりのタンクの屋根に雨どいがない。雨どいがあれば、となり合うタンクに水が回る。';
    return '建物の軒から1mより遠い。軒の下（雨が落ちる側）か、雨の入るタンクのとなりに置く。';
  }
  const site = () => E.SITES[SITE];
  const catchM3 = () => Math.round(W.analyze(s.world, site(), s.persons.length).roofCatch * rainY / 1000);
  function placeTank(p, n) {
    let g = null;
    if (p && p.kind === 'building') {   // 軒を押したら、その軒の下に置く
      const c = cellOf(p.point), b = W.buildingById(s.world, p.id);
      if (b && b.cells[`${c.x},${c.y}`]) { toast('建物の中には置けない。軒の下の地面に'); return; }
      g = new THREE.Vector3(p.point.x, 0, p.point.z);
    } else g = stage.groundAt(n) || p?.point;
    if (!g) return;
    const { x, y } = cellOf(g), w = s.world, before = catchM3(), A = flowsNow(), z0 = W.h(w, x, y);
    act(() => { const err = W.put(s, x, y, W.h(w, x, y), 'tank', 'hire'); if (err) return err; return autoGutter(); },
      (spent) => {
        const d = catchM3() - before, A2 = W.analyze(s.world, site(), s.persons.length), t = W.blocksOf(s.world, 'tank').find(o => o.x === x && o.y === y && o.z === z0);
        if (d > 0) return `タンクを置いた。屋根の雨が年 +${d}m³ 集まる（−${yen(spent)}）${flowText(A, yearFlows(s))}`;
        if (t && A2.fedKeys.includes(`${t.x},${t.y},${t.z}`)) return `タンクを置いた（−${yen(spent)}）。雨が入る。屋根の雨はもう集まっているので、ためられる量が1m³ふえる（雨の多い季節にあふれにくい）`;
        return `タンクを置いた（−${yen(spent)}）。雨が入らない：${t ? tankWhy(t, A2) : ''}`;
      });
  }

  /* ---------- 消す ---------- */
  function erase(p) {
    const w = s.world; if (!p) return;
    if (p.kind === 'building') { if (p.id === 'main') { toast('母屋は消せない'); return; } act(() => W.removeBuilding(s, p.id), '建物を壊した'); return; }
    if (p.kind === 'tank') { act(() => W.remove(s, p.x, p.y, p.z), 'タンクを外した'); return; }
    if (p.kind === 'beds') { const { x, y } = cellOf(p.point); const z = Object.keys(w.blocks).map(k => k.split(',').map(Number)).find(([bx, by, bz]) => bx === x && by === y && w.blocks[`${bx},${by},${bz}`].t === 'bed'); if (!z) return; act(() => W.remove(s, x, y, z[2]), '畑を1マス外した'); return; }
    if (p.kind === 'trees') { const t = treeNear(p.point); if (!t) return; act(() => W.cutTree(s, t.cx, t.cy), `${t.planted ? (t.kind === 'hedge' ? '生け垣' : '果樹') : W.CUT[t.kind]?.name || '木'}を切った。薪にとっておく`); return; }
    if (['heap', 'coop', 'pond', 'filter'].includes(p.kind)) {
      const { x, y } = cellOf(p.point), kinds = p.kind === 'filter' ? ['media', 'plant'] : [p.kind];
      const ks = Object.keys(w.blocks).filter(k => { const [bx, by] = k.split(',').map(Number); return bx === x && by === y && kinds.includes(W.BLOCKS[w.blocks[k].t].kind); }).sort((a2, b2) => +b2.split(',')[2] - +a2.split(',')[2]);
      if (!ks.length) return;
      act(() => { for (const k of ks) { const [bx, by, bz] = k.split(',').map(Number); const e = W.remove(s, bx, by, bz, true); if (e) return e; } return null; }, { heap: '堆肥小屋を1区画外した', coop: 'ニワトリ小屋を外した', pond: '池を1マス外した', filter: '排水の庭を1マス外した' }[p.kind]); return;
    }
    toast('外したい物を押す');
  }
  const plantedOf = (w) => W.blocksOf(w, 'tree').map(q => ({ kind: 'tree', planted: true, cx: q.x, cy: q.y, x: q.x + 0.5, y: q.y + 0.5, h: 3.4, r: 1.1 })).concat(W.blocksOf(w, 'hedge').map(q => ({ kind: 'hedge', planted: true, cx: q.x, cy: q.y, x: q.x + 0.5, y: q.y + 0.5, h: 1.3, r: 0.6 })));
  const treeNear = (pt) => { let best = null, bd = 1e9; for (const t of [...W.vegObjects(s.world), ...plantedOf(s.world)]) { const dd = Math.hypot(t.x - pt.x, t.y - pt.z); if (dd < bd && dd < Math.max(1.2, t.r * 1.3)) { bd = dd; best = t; } } return best; };

  /* ---------- 押した物の横のカード ---------- */
  const card = $('#card');
  const blocksAtCell = (w, x, y, kinds) => Object.keys(w.blocks).filter(k => { const [bx, by] = k.split(',').map(Number); return bx === x && by === y && kinds.includes(W.BLOCKS[w.blocks[k].t].kind); });
  function selExists(sel) { const w = s.world; if (sel.kind === 'building') return !!W.buildingById(w, sel.id); if (sel.kind === 'tank') return !!w.blocks[`${sel.x},${sel.y},${sel.z}`];
    if (sel.kind === 'tree') return [...W.vegObjects(w), ...plantedOf(w)].some(t => t.cx === sel.t.cx && t.cy === sel.t.cy);
    if (sel.kind === 'beds') return W.blocksOf(w, 'bed').length > 0;
    if (['heap', 'coop', 'pond', 'filter'].includes(sel.kind)) { const q = cellOf(sel.point); return blocksAtCell(w, q.x, q.y, sel.kind === 'filter' ? ['media', 'plant'] : [sel.kind]).length > 0; }
    return false; }
  function select(p) {
    if (p && p.kind !== 'ground') { closePick(); selectFurn(null); }
    if (!p || p.kind === 'ground') { G.sel = null; card.hidden = true; document.body.classList.remove('carded'); v.focusPoint = null; v.req(); return; }
    if (p.kind === 'trees') { const t = treeNear(p.point); if (!t) { select(null); return; } p = { kind: 'tree', t }; }
    G.sel = p; renderCard(); v.focusPoint = anchorOf(p); v.req();
  }
  function anchorOf(p) {
    const w = s.world;
    if (p.kind === 'building') { const b = W.buildingById(w, p.id), bx = W.roofBox(b); return new THREE.Vector3((bx.X0 + bx.X1) / 2, b.z + W.HOUSE_H, (bx.Y0 + bx.Y1) / 2); }
    if (p.kind === 'tank') return new THREE.Vector3(p.x + 0.5, p.z + 1.3, p.y + 0.5);
    if (p.kind === 'tree') return new THREE.Vector3(p.t.x, stage.at(p.t.x, p.t.y) + p.t.h * 0.7, p.t.y);
    return p.point.clone();
  }
  const seg = (act0, items, cur) => `<div class="seg">${items.map(([k, label, dis]) => `<button data-act="${act0}:${k}" class="${k === cur ? 'on' : ''}" ${dis ? 'disabled title="まだ知らない"' : ''}>${label}</button>`).join('')}</div>`;
  function buildingCard(b) {
    const w = s.world, id = W.bid(b), n = Object.keys(b.cells).length, bx = W.roofBox(b);
    const use = id === 'main' ? 'live' : (b.use || 'store'), U = W.USES[use];
    const name = id === 'main' ? '母屋' : use === 'stay' ? '離れ' : use === 'grow' ? '温室' : '倉庫';
    const ins = b.wall === INSUL.wall, L = LOCAL[SITE] || LOCAL.med, R = W.ROOFS[b.roof];
    const A = W.analyze(w, site(), s.persons.length), bb = A.byBuilding?.[id] || { area: 0, got: 0, tanks: 0 };
    const m3 = Math.round(bb.area * rainY / 1000), got = Math.round(bb.got * rainY / 1000);
    const rain = bb.got > 0 && bb.gut ? `<div class="flow">屋根で年 <b>${m3}m³</b> の雨を受け、雨どいからタンクへ。</div>`
      : bb.tanks ? `<div class="flow warn">タンクには軒から落ちる分だけ（年 <b>${got}m³</b>）。屋根全体なら <b>${m3}m³</b>。</div>`
      : `<div class="flow warn">屋根で年 <b>${m3}m³</b> の雨を受けるが、タンクがないので地面へ流れる。［水］で軒のそばにタンクを置く。</div>`;
    const pi = W.PITCHES.findIndex(([p]) => Math.abs(p - (b.pitch || 0.3)) < 0.01), ei = W.EAVE_STEPS.findIndex(e => Math.abs(e - W.eavesDepth(b)) < 0.01);
    const roofRow = R.flat ? `<div class="row"><span>屋根</span><div>${R.name}・平ら</div></div>`
      : `<div class="row"><span>屋根の傾き</span><div class="step"><button data-act="pitch:-1">−</button><b>${W.PITCHES[Math.max(0, pi)][1]}</b><button data-act="pitch:1">＋</button></div></div>
         <div class="row"><span>軒の出</span><div class="step"><button data-act="eaves:-1">−</button><b>${W.eavesDepth(b).toFixed(1)}m</b><button data-act="eaves:1">＋</button></div></div>`;
    const furnOf = (g) => b.furn?.find(f => W.FURN[f.t].group === g)?.t;
    const step = (k, label, val) => `<div class="row"><span>${label}</span><div class="step"><button data-act="${k}:-1">−</button><b>${val}</b><button data-act="${k}:1">＋</button></div></div>`;
    const power = id !== 'main' ? '' : (knows('offgrid') ? step('pv', '太陽光', `${b.pv || 0}枚（${((b.pv || 0) * W.BLOCKS.pv.kw).toFixed(1)}kW）`) + step('batt', '蓄電池', `${b.batt || 0}台（${(b.batt || 0) * W.BLOCKS.batt.kwh}kWh）`) : '')
      + (knows('deep') ? step('deep', '基礎', `${(b.eq?.depth || 0.3).toFixed(1)}m`) : '');
    const fixtures = use !== 'live' ? '' : `
      <div class="row"><span>トイレ</span>${seg('furn:toilet', [['toilet', '水洗'], ['ctoilet', 'コンポスト', !knows(W.FURN.ctoilet.learn)]], furnOf('toilet'))}</div>
      <div class="row"><span>シャワー</span>${seg('furn:shower', [['shower', 'ふつう'], ['shower2', '節水', !knows(W.FURN.shower2.learn)]], furnOf('shower'))}</div>
      <div class="row"><span>かまど</span>${seg('furn:stove', [['none', 'なし'], ['stove', '薪のかまど']], furnOf('stove') || 'none')}</div>`;
    return `<h3>${name}<span class="sub" style="margin:0">${U.name}</span><button class="x" data-act="close" aria-label="閉じる">×</button></h3>
      <p class="sub">${bx.X1 - bx.X0}×${bx.Y1 - bx.Y0}m · 床${n}m² · ${W.WALLS[b.wall].name}・${R.name}</p>
      ${id === 'main' ? '' : `<div class="row"><span>使い道</span>${seg('use', [['stay', '泊める'], ['store', 'しまう'], ['grow', '育てる']], use)}</div>`}
      <div class="row"><span>工法</span>${seg('method', [['local', 'この土地の工法'], ['ins', '断熱した', !knows('insulation')]], ins ? 'ins' : 'local')}</div>
      <div class="row"><span>中</span><div><button class="wide" data-act="inside">${stage.cut ? '壁を戻す' : '中を見る・家具を動かす'}</button></div></div>
      ${roofRow}${fixtures}${power}${rain}
      <p class="note">${U.note}${!knows('insulation') ? ' 断熱は、季節を過ごして学ぶと選べる。' : ''}</p>`;
  }
  function renderCard() {
    const p = G.sel, w = s.world; if (!p) return;
    let html = '';
    if (p.kind === 'building') html = buildingCard(W.buildingById(w, p.id));
    else if (p.kind === 'tank') {
      const A = W.analyze(w, site(), s.persons.length), fed = A.fedKeys.includes(`${p.x},${p.y},${p.z}`);
      html = `<h3>雨水タンク<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">1m³（1,000L）</p>
        ${fed ? `<div class="flow">屋根の雨が入る（水の窓が青い）。敷地のタンク全部で、屋根から年 <b>${Math.round(A.roofCatch * rainY / 1000)}m³</b> 集まる。</div>` : `<div class="flow warn">雨が入らない（水の窓が空）。${tankWhy(p, A)}</div>`}
        <p class="note">雨どいのある軒のそばのタンクには、それぞれたてどいが下りる。となり合うタンクは足もとの管でつながり、水は同じ高さか低い方へ回る。［消す］で外せる。</p>`;
    } else if (p.kind === 'tree') {
      const c = W.CUT[p.t.planted ? p.t.kind : p.t.kind] || {}, name = p.t.planted ? (p.t.kind === 'hedge' ? '生け垣' : '果樹') : c.name || '木';
      const what = p.t.planted ? (p.t.kind === 'hedge' ? '風よけと目かくし。刈った枝葉は堆肥に。' : '実がなる。落ち葉は堆肥に、根は斜面の土を止める。') : '根が斜面の土と雨を止め、落ち葉が土を肥やす。日かげも作る。';
      html = `<h3>${name}<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">高さ約${Math.round(p.t.h)}m</p>
        <div class="flow">${what}</div>
        <div class="row"><span>切る</span><div class="seg"><button data-act="cut">切って薪にする（${yen(c.cost || 0.3)}）</button></div></div>
        <p class="note">切ると薪とチップが${c.wood ?? 0.1}m³とれる。チップは堆肥に、薪はかまどに。</p>`;
    } else if (p.kind === 'beds') {
      const bs = W.blocksOf(w, 'bed'), n = bs.length, m = bs.filter(b => b.b.m && !b.b.g).length, cv = bs.filter(b => b.b.g).length, S = E.summarize(s);
      const lv = new Set(bs.map(b => b.z)).size, nu = E.nutrients(s);
      html = `<h3>畑<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">段々の畑 · ${n}m²（${lv}段）· マルチ${m} · 覆い${cv}</p>
        <div class="flow">段ごとに平らにして、雨が土を流さないように。${S.bareRisers ? `土のままの段差が${Math.round(S.bareRisers)}m²あり、大雨で土が流れる。` : ''}</div>
        <div class="flow ${nu.nf < 0.7 ? 'warn' : ''}">養分（窒素）：畑が要る年 <b>${nu.need.toFixed(1)}kg</b>、戻せる分 <b>${nu.supply.toFixed(1)}kg</b>。${nu.nf < 0.7 ? '足りない分は収穫が減る。堆肥小屋やコンポストトイレで戻す。' : ''}</div>
        <p class="note">［畑］の道具で畑を押すと 裸地→マルチ→覆い。マルチは乾きと草を防ぎ、覆いは寒い季節も育つ。</p>`;
    } else if (p.kind === 'heap') {
      const S = E.summarize(s), C = S.compost;
      html = `<h3>堆肥小屋<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">${C.bays}区画（1区画1m³）</p>
        <div class="flow ${C.f < 0.999 ? 'warn' : ''}">年に <b>${C.load.toFixed(1)}m³</b> 入り、<b>${C.cap.toFixed(1)}m³</b> さばける。${C.f < 0.999 ? '入る量に区画が足りない。' : ''}生ごみ・ふん・し尿を、落ち葉${C.chips ? 'や木のチップ' : ''}と混ぜて寝かせ、畑へ戻す。</div>
        ${C.buy > 0.05 ? `<p class="note">落ち葉が足りない分、おがくずを年${C.buy.toFixed(1)}m³ 買う。</p>` : ''}<p class="note">屋根の雨も、そばにタンクがあれば集まる。</p>`;
    } else if (p.kind === 'coop') {
      html = `<h3>ニワトリ小屋<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">数羽</p>
        <div class="flow">卵がとれる。ふんと敷きわらは堆肥小屋へ（なければ畑に直接、効きは弱い）。草や虫、くず野菜を食べる。</div><p class="note">世話の手間が少しかかる。</p>`;
    } else if (p.kind === 'pond') {
      const S = E.summarize(s);
      html = `<h3>ため池<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">${S.pondArea}m² · ${S.pondCap / 1000}m³</p>
        <div class="flow">斜面を流れる雨が集まる。乾いた季節に畑へ回す。${S.pondGrav < 1 && S.gArea ? '畑より低いので、上げるにはポンプが要る。' : ''}</div><p class="note">低い所、水の筋が集まる所ほどよくたまる。</p>`;
    } else if (p.kind === 'filter') {
      const S = E.summarize(s), F = S.filter;
      html = `<h3>排水の庭<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">${F ? F.spec.w : 0}m² · 砂利と砂の層にヨシ</p>
        <div class="flow ${F && F.m.load > 1 ? 'warn' : ''}">台所やシャワーの水が、砂と根を通ってきれいになり、畑へ戻る。${F ? `1日 <b>${Math.round(F.m.capWarm)}L</b> までさばける（入るのは約${Math.round(0.9 * (S.saving ? 65 : 130) * s.persons.length)}L）。` : ''}</div>
        ${F && !F.inGrav ? '<p class="note">家の床より高いので、排水が流れこまない。低い所に。</p>' : ''}`;
    }
    card.innerHTML = html; card.hidden = !html; document.body.classList.toggle('carded', !!html); placeCard();
  }
  function placeCard() {
    if (card.hidden || !G.sel || innerWidth <= 640) return;
    const a = toScreen(anchorOf(G.sel)), cw = card.offsetWidth, ch = card.offsetHeight;
    let x = a.x + 34; if (x + cw > innerWidth - 10) x = a.x - 34 - cw; x = Math.max(10, x);
    const y = Math.max(108, Math.min(innerHeight - ch - 130, a.y - ch * 0.35));
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
  v.onFrame = () => { placeCard(); placePick(); placeFbar(); };
  card.onclick = (e) => {
    const bt = e.target.closest('[data-act]'); if (!bt || bt.disabled) return;
    const [k, a, c] = bt.dataset.act.split(':'), w = s.world, p = G.sel;
    if (k === 'inside') { const on = !stage.cut, id = p.id; setCut(on); if (on) { const b0 = W.buildingById(w, id), bx = W.roofBox(b0); select(null); v.flyTo(new THREE.Vector3((bx.X0 + bx.X1) / 2, b0.z, (bx.Y0 + bx.Y1) / 2), Math.max(9, (bx.X1 - bx.X0 + bx.Y1 - bx.Y0) * 1.1), 52, 700); } else renderCard(); return; }
    if (k === 'close') { select(null); return; }
    if (k === 'cut' && p && p.kind === 'tree') { const t = p.t; act(() => W.cutTree(s, t.cx, t.cy), '切った。薪とチップにとっておく'); return; }
    if (!p || p.kind !== 'building') return;
    const b = W.buildingById(w, p.id), d = W.cloneHouse(b);
    if (k === 'use') { act(() => { d.use = a; return W.buildBuilding(s, d); }, `使い道を「${W.USES[a].name}」に`); return; }
    if (k === 'method') { const L = LOCAL[SITE] || LOCAL.med; act(() => { if (a === 'ins') Object.assign(d, INSUL); else Object.assign(d, { wall: L.wall, roof: L.roof, finish: L.finish }); return W.buildBuilding(s, d); }, a === 'ins' ? '断熱した壁と屋根に' : 'この土地の工法に'); return; }
    if (k === 'pitch') { const i = W.PITCHES.findIndex(([q]) => Math.abs(q - (b.pitch || 0.3)) < 0.01), j = Math.max(0, Math.min(W.PITCHES.length - 1, (i < 0 ? 1 : i) + +a)); if (j === i) return; act(() => { d.pitch = W.PITCHES[j][0]; d.roofShape = d.roofShape && d.roofShape !== 'flat' ? d.roofShape : 'gable'; return W.buildBuilding(s, d); }, `屋根を${W.PITCHES[j][1]}傾きに`); return; }
    if (k === 'eaves') { const i = W.EAVE_STEPS.findIndex(q => Math.abs(q - W.eavesDepth(b)) < 0.01), j = Math.max(0, Math.min(W.EAVE_STEPS.length - 1, (i < 0 ? 1 : i) + +a)); if (j === i) return; act(() => { d.eaves = W.EAVE_STEPS[j]; return W.buildBuilding(s, d); }, `軒を${W.EAVE_STEPS[j]}mに`); return; }
    if (k === 'pv' || k === 'batt' || k === 'deep') {
      act(() => {
        if (k === 'pv') d.pv = Math.max(0, Math.min(Object.keys(d.cells).length, (d.pv || 0) + +a));
        if (k === 'batt') d.batt = Math.max(0, Math.min(6, (d.batt || 0) + +a));
        if (k === 'deep') { d.eq = d.eq || { depth: 0 }; d.eq.depth = Math.max(0.3, Math.min(3, Math.round(((d.eq.depth || 0.3) + 0.3 * +a) * 10) / 10)); }
        return W.buildBuilding(s, d);
      }, (spent) => (k === 'pv' ? `太陽光を${d.pv}枚に` : k === 'batt' ? `蓄電池を${d.batt}台に` : `基礎を${d.eq?.depth}mに`) + (spent > 0.05 ? `（−${yen(spent)}）` : ''));
      return;
    }
    if (k === 'furn') {
      act(() => {
        if (a === 'stove') { if (c === 'stove') { const err = W.placeStove(d); if (err) return err; d.stove = true; } else { W.removeStove(d); d.stove = false; } }
        else { const i = d.furn.findIndex(f => W.FURN[f.t].group === a); if (i < 0) return 'その設備がない'; const err = W.draftSwapFurn(d, i, c); if (err) return err; }
        return W.buildBuilding(s, d);
      }, `${W.FURN[c]?.name || 'かまどなし'}に`);
    }
  };

  /* ---------- 押す・なぞる ---------- */
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (down && down.id !== e.pointerId) { if (down.trace) hideTrace(); down = null; return; }   // 2本目の指：回す・寄るに任せる
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, ts: e.timeStamp, id: e.pointerId, trace: null };
    if (G.mode === 'near' && traces(G.tool)) {
      const n = ndcOf(e), p = stage.pick(n), sub = G.sub[G.tool];
      const noTrace = !p ? false : ['building', 'draft', 'tank'].includes(p.kind) || (G.tool === 'tree' && p.kind === 'trees');
      const tapOnly = (G.tool === 'water' && (sub === 'tank' || sub === 'pump')) || (G.tool === 'shed' && sub === 'coop');
      if (!noTrace && !tapOnly) { const g = stage.groundAt(n); if (g) { down.trace = { a: cellOf(g), b: cellOf(g) }; canvas.setPointerCapture(e.pointerId); } }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || !down.trace || e.pointerId !== down.id) return;
    const g = stage.groundAt(ndcOf(e)); if (!g) return;
    const c = cellOf(g); if (c.x !== down.trace.b.x || c.y !== down.trace.b.y || !down.shown) { down.trace.b = c; down.shown = true; showTrace(down.trace, e); }
    else tip($('#tip').innerHTML, e.clientX, e.clientY);
  });
  const up = (e) => {
    if (Q.has('debug')) console.log('up', e.type, !!down, down && down.id, e.pointerId, down && !!down.trace, down && Math.round(e.timeStamp - down.ts));
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y), quick = e.timeStamp - d.ts < 500;   // 長押しは押したことにしない
    if (d.trace) { hideTrace(); if (e.type === 'pointerup' && (d.trace.a.x !== d.trace.b.x || d.trace.a.y !== d.trace.b.y)) { traced(d.trace); return; } }
    if (e.type === 'pointerup' && moved < 8 && quick) onTap(e);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // 長押しのメニューを出さない
  function onTap(e) {
    const n = ndcOf(e), p = stage.pick(n);
    if (Q.has('debug')) console.log('tap', G.mode, G.tool, p && p.kind, p && p.id, p && p.point && [p.point.x.toFixed(2), p.point.y.toFixed(2), p.point.z.toFixed(2)].join(','));
    if (G.mode === 'map') { const g = stage.groundAt(n) || p?.point; if (g) flyNear(g); return; }
    if (G.tool === 'house') { if (p && p.kind === 'draft') draftWallTap(p); else if (p && p.kind === 'building') wallTap(p); else { closePick(); selectFurn(null); if (!G.draft) toast('地面をなぞって床を描く'); } return; }
    if (p && p.kind === 'draft') { toast('下書き：［建てる］か［やめる］を押す'); return; }
    if (!G.tool && p && p.kind === 'building') { wallTap(p); return; }
    closePick(); selectFurn(null);
    const sub = G.sub[G.tool], g = stage.groundAt(n), c = g ? cellOf(g) : null, one = c ? { a: c, b: c } : null;
    if (G.tool === 'water' && sub === 'tank') { placeTank(p, n); return; }
    if (G.tool === 'water' && sub === 'pump') { if (c) actFlow(() => W.put(s, c.x, c.y, W.h(s.world, c.x, c.y), 'pump', 'hire'), 'ポンプを置いた'); return; }
    if (G.tool === 'erase') { erase(p); return; }
    if (G.tool === 'field') {
      if (p && p.kind === 'beds') { const q = cellOf(p.point), b = bedAt(s.world, q.x, q.y); if (b) { cycleBeds([[q.x, q.y]], bedState(b)); return; } }
      if (one) setDraft(rectDraft(one)); return;
    }
    if (G.tool === 'tree') {
      if (p && p.kind === 'trees') { select(p); return; }
      if (!c) return; if (W.vegAt(s.world, c.x, c.y)) { toast('木があるので植えられない'); return; }
      actFlow(() => W.put(s, c.x, c.y, W.h(s.world, c.x, c.y), sub, 'hire'), sub === 'tree' ? '果樹を植えた' : '生け垣を植えた'); return;
    }
    if (G.tool === 'shed' && sub === 'coop') {
      if (!c) return; actFlow(() => { const e2 = vegCut(s, c.x, c.y); if (e2) return e2; return W.put(s, c.x, c.y, W.h(s.world, c.x, c.y), 'coop', 'hire'); }, 'ニワトリ小屋を置いた'); return;
    }
    if (G.tool && one) { const dr = rectDraft(one); if (dr) { setDraft(dr); return; } }
    select(p);
  }
  // なぞり終わり：道具ごとに下書きへ
  function traced(tr) {
    if (G.tool === 'house') { makeHouseDraft(tr); return; }
    if (G.tool === 'field') { const b = bedAt(s.world, tr.a.x, tr.a.y); if (b) { cycleBeds(rectCells(tr).out, bedState(b)); return; } }
    if (G.tool === 'tree') { setDraft(treeDraft(tr)); return; }
    const dr = rectDraft(tr); if (dr) setDraft(dr);
  }

  /* ---------- 季節を過ごす：3か月を進め、報告を出す ---------- */
  const seasonLabel = () => { const q = E.SITES[s.site].quarters[s.q]; $('#season').textContent = `${q.split('・')[0]}を過ごす`; $('#where').textContent = innerWidth > 640 ? `${S.name} · ${E.SITES[s.site].quarters[s.q]}` : S.name; };
  function runSeason() {
    if (G.draft) setDraft(null);
    const before = E.clone(s);
    const { state, report } = E.advance(s);
    let ns = state; const lessons = [];
    for (const l of report.learn) { ns = E.learn(ns, l.id, l.why); lessons.push(l); }
    const goodN = E.relations(ns).nodes.filter(x => x.good === true && x.v > 0.15).length;
    const end = goodN >= BK.GOAL && ns.flags['done_' + ns.site] == null;
    if (end) ns.flags['done_' + ns.site] = ns.turn;
    for (const k of Object.keys(s)) delete s[k]; Object.assign(s, ns);   // 同じ入れ物のまま中身を入れ替える（舞台や道具が s を見ている）
    G.undo = []; G.redo = []; fCache = { sig: null, f: null };
    changed(); persist(); seasonLabel();
    showReport(before, report, lessons, end);
  }
  function showReport(before, rep, lessons, end) {
    const more = end && BK.nextLands(s).length, cm = more ? BK.chapterMail(s, rep) : null;
    $('#reportBody').innerHTML = BK.reportHTML(s, before, rep, lessons, end);
    $('#reportAct').innerHTML = (cm ? `<button id="rNext">${BK.esc(cm.go)}</button>` : '') + `<button class="yes" id="rBack">${cm ? BK.esc(cm.stay) : '土地に戻る'}</button>`;
    $('#report').hidden = false; $('#rBack').focus();
    $('#rBack').onclick = () => { $('#report').hidden = true; };
    if ($('#rNext')) $('#rNext').onclick = () => {
      const to = BK.nextLands(s)[0], price = E.SITES[to].plotPrice || 0;
      if (s.cash < price) { toast(`お金が足りない（土地は${BK.man(price)}）`); return; }
      if (MODE !== 'play') { toast('試作の画面では、次の土地へは行かない'); return; }
      localStorage.setItem(CARRY, JSON.stringify({ from: s.site, to, cash: s.cash - price, persons: s.persons, known: s.known, learned: s.learned, year: s.year, q: s.q,
        history: [...(s.flags.history || []), { site: s.site, years: s.turn / 4, rel: E.relations(s).score }] }));
      location.href = `/next/?travel=${to}`;
    };
    $('#reportBody').querySelectorAll('[data-choice]').forEach(b2 => b2.onclick = () => {
      const [k, v2] = b2.dataset.choice.split(':'); if (k === 'surplus') s.flags.surplus = v2; if (k === 'pest') s.flags.pestHand = v2 === 'hand'; persist();
      b2.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b2));
    });
  }

  /* ---------- ノート：めぐり・家計簿・予定・天気・ノート ---------- */
  G.tab = 'web'; G.studied = -1;
  const openBook = (tab) => { if (tab) G.tab = tab; renderBook(); $('#sheet').hidden = false; };
  function renderBook() {
    $('#tabs').innerHTML = BK.TABS.map(([k, n]) => `<button data-tab="${k}" class="${G.tab === k ? 'on' : ''}">${n}</button>`).join('');
    const body = $('#sheetBody');
    body.innerHTML = G.tab === 'web' ? BK.pageWeb(s) : G.tab === 'book' ? BK.pageBook(s) : G.tab === 'plan' ? BK.pagePlan(s) : G.tab === 'sky' ? BK.pageSky(s, G.studied !== s.turn) : BK.pageNote(s, atlasRead()) + (MODE === 'play' ? '<p><a href="/next/?globe=atlas&from=play">地球儀の図鑑を開く</a></p>' : '');
    body.scrollTop = 0;
  }
  $('#bookBtn').onclick = () => openBook();
  $('#sheetX').onclick = () => { $('#sheet').hidden = true; };
  $('#sheet').onclick = (e) => { if (e.target.id === 'sheet') $('#sheet').hidden = true; };
  $('#tabs').onclick = (e) => { const b2 = e.target.closest('[data-tab]'); if (!b2) return; G.tab = b2.dataset.tab; renderBook(); };
  $('#sheetBody').onclick = (e) => {
    const c = e.target.closest('[data-cell]');
    if (c) { const [pi, di] = c.dataset.cell.split(',').map(Number), order = ['work', 'farm', 'rest'], v0 = s.persons[pi].week[di] === 'build' ? 'farm' : s.persons[pi].week[di];
      s.persons[pi].week[di] = order[(order.indexOf(v0) + 1) % 3]; fCache = { sig: null, f: null }; persist(); const top = $('#sheetBody').scrollTop; renderBook(); $('#sheetBody').scrollTop = top; return; }
    const st = e.target.closest('[data-study]');
    if (st && !st.disabled) {
      const id = st.dataset.study, ns = E.learn(s, id, 'foresight'); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, ns);
      G.studied = s.turn; persist(); renderBook();
      $('#reportBody').innerHTML = BK.lessonMail({ id, why: 'foresight' }, BK.mailDate(s)); $('#reportAct').innerHTML = '<button class="yes" id="rBack">ノートに書いた</button>';
      $('#report').hidden = false; $('#rBack').onclick = () => { $('#report').hidden = true; };
    }
  };

  /* ---------- はじめ：地図から ---------- */
  seasonLabel();
  syncTop(); fitControls(); setTool(null);
  v.resize(); fitControls();
  v.lookAt(center, mapDist(), 50, 60); setMode('map');
  addEventListener('resize', () => { fitControls(); placeCard(); });
  if (MODE === 'play') {
    $('#where').style.cursor = 'pointer'; $('#where').title = 'はじめの画面へ'; $('#where').onclick = () => { location.href = '/next/'; };
    if (fresh) { persist(); history.replaceState(null, '', '/next/?play'); $('#reportBody').innerHTML = BK.climateHTML(s); $('#reportAct').innerHTML = '<button class="yes" id="rBack">この土地で暮らしを始める</button>'; $('#report').hidden = false; $('#rBack').onclick = () => { $('#report').hidden = true; }; }
  }
  v.start();
  window.__next = { s, E, v, stage, setHour, G, act, toScreen, select, setTool, flyNear, toMap, center, house: () => s.world.house, traced, setDraft, flowsNow, runSeason, openBook, setSub: (t, k) => { G.sub[t] = k; renderSubs(); setHint(); } };
}

/* 地球：はじまり（題名）、旅（招いてくれた人のメールを読んで［行く］→ 飛ぶ）、図鑑（ピンを押して読む）。
   昼と夜の境目は今の本物の太陽。印は町の単位（細かい位置は出さない） */
async function bootGlobe(mode = 'title') {
  const rings = await (await fetch('/data/land110.json')).json();
  const v = createView($('#c'), { keep: Q.has('shot') });
  v.setPalette({ ...PALETTES.med, sky: ['#D9DEDB', '#EFEADF'] });
  v.scene.fog = null; v.scene.environmentIntensity = 0.45; v.ao.enabled = false; v.dof.enabled = false; v.sun.castShadow = false;
  for (const id of ['#cash', '#undo', '#redo', '#bookBtn', '#cut', '#toMap']) $(id).style.display = 'none';
  document.querySelector('.sun').style.display = 'none';
  const round = (x) => Math.round(x * 10) / 10, at = (k) => ({ lat: round(E.SITES[k].lat), lon: round(E.SITES[k].lon), name: E.SITES[k].name });
  const saved = mode === 'title' || mode === 'atlas' ? loadSave() : null;
  let carry = null; try { carry = JSON.parse(localStorage.getItem(CARRY) || 'null'); } catch { carry = null; }
  const toKey = mode === 'travel' ? Q.get('travel') : null, fromKey = mode === 'travel' ? (carry && carry.from) || 'med' : null;
  // 印と飛ぶ道
  const home = { ...at('tokyo'), main: true, color: '#3F6E8C' };
  let pins = [home, { ...at('med'), main: true }, { ...at('taos') }], route = [at('tokyo'), at('med')];
  if (mode === 'travel') { pins = [{ ...at(fromKey), main: true, color: '#3F6E8C' }, { ...at(toKey), main: true }]; route = [at(fromKey), at(toKey)]; }
  if (mode === 'atlas') { const read = atlasRead(); pins = ATLAS.map(a => ({ lat: a.lat, lon: a.lon, id: a.id, color: read.includes(a.id) ? '#4F7A52' : '#C9873A' })); if (saved) pins.push({ ...at(saved.site), main: true, color: '#3F6E8C', id: 'me' }); route = null; }
  const globe = buildGlobe(rings, pins, route);
  v.scene.add(globe);
  const c = v.controls; c.enablePan = false; c.minDistance = 2.4; c.maxDistance = 7; c.minPolarAngle = 0.2; c.maxPolarAngle = Math.PI - 0.2; c.target.set(0, 0, 0); c.rotateSpeed = 0.5;
  v.camera.near = 0.05; v.camera.far = 50; v.camera.fov = 30; v.camera.updateProjectionMatrix();
  const ss = subsolar(new Date()), sd = ll(ss.lat, ss.lon).normalize();
  v.sun.position.copy(sd).multiplyScalar(10); v.sun.target.position.set(0, 0, 0); v.sun.color.set('#FFF1DE'); v.sun.intensity = 3.2;
  globe.userData.atm.material.uniforms.s.value.copy(sd);
  const fit = () => { const a = v.camera.aspect || 1; return 1.3 / Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2)) / Math.min(1, a); };
  const look = (lat, lon, d = fit()) => { v.camera.position.copy(ll(lat, lon, 1).normalize().multiplyScalar(d)); v.camera.lookAt(0, 0, 0); c.update(); v.req(); };
  // 縦長の画面：下にカードが来るので、地球を少し上に寄せる
  const lift = () => { const r = $('#c').getBoundingClientRect(), w = r.width, h = r.height; if (w / h < 0.8) v.camera.setViewOffset(w, h, 0, h * 0.15, w, h); else v.camera.clearViewOffset(); v.camera.updateProjectionMatrix(); v.req(); };
  v.resize(); lift(); addEventListener('resize', () => setTimeout(lift, 0)); c.maxDistance = Math.max(7, fit() * 1.5);
  const hint = $('#hint');
  // 飛ぶ：大円にそって向きを移し、途中で少し引いて、最後に寄る
  const fly = (A, B, ms, done) => {
    const a = ll(A.lat, A.lon, 1).normalize(), b = ll(B.lat, B.lon, 1).normalize(), ang = Math.max(1e-4, a.angleTo(b)), d0 = v.camera.position.length(), t0 = performance.now();
    c.enabled = false; c.autoRotate = false; c.minDistance = 1.2; c.enableDamping = false;
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / ms), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const dir = a.clone().multiplyScalar(Math.sin((1 - e) * ang)).add(b.clone().multiplyScalar(Math.sin(e * ang))).divideScalar(Math.sin(ang)).normalize();
      const dist = u < 0.75 ? d0 * (1 + 0.22 * Math.sin(Math.PI * Math.min(1, e / 0.9))) : d0 * (1 - 0.55 * (u - 0.75) / 0.25);
      v.camera.position.copy(dir.multiplyScalar(dist)); v.camera.lookAt(0, 0, 0); v.req();
      if (u < 1) requestAnimationFrame(step); else done();
    };
    step();
  };
  const fadeTo = (url) => { const f = document.createElement('div'); f.className = 'fade'; document.body.appendChild(f); requestAnimationFrame(() => f.classList.add('on')); setTimeout(() => location.replace(url), 650); };
  // 旅：出発地の上でメールを読み、［行く］で飛ぶ。着いた土地のデータは、読んでいるあいだに裏で取ってくる
  const travel = (from, to, mail, url) => {
    look(E.SITES[from].lat, E.SITES[from].lon);
    const S2 = E.SITES[to]; loadRealPlot(S2.lat0 ?? S2.lat, S2.lon0 ?? S2.lon).catch(() => null);
    $('#where').textContent = `${E.SITES[from].name}`;
    const box = document.createElement('div'); box.className = 'trip';
    box.innerHTML = BK.mailHTML(mail, { date: '今朝', actions: `<button class="yes" id="go">${BK.esc(mail.go)}</button>` });
    document.body.appendChild(box); hint.textContent = '';
    $('#go').onclick = () => { box.remove(); $('#where').textContent = `${E.SITES[from].name}から、${S2.name}へ`; fly(E.SITES[from], S2, 3600, () => { $('#where').textContent = `${S2.name}・標高${S2.elev.toLocaleString()}m`; fadeTo(url); }); };
  };
  if (mode === 'travel') {
    const price = E.SITES[toKey]?.plotPrice || 0;
    travel(fromKey, toKey, LAND_INVITE[toKey] ? LAND_INVITE[toKey](BK.man(price)) : { from: 'ノート', subject: '次の土地へ', body: [''], go: '行く' }, `/next/?play&new=${toKey}`);
  } else if (mode === 'atlas') {
    look(15, -40);
    $('#where').textContent = '地球儀で学ぶ';
    const card = document.createElement('div'); card.className = 'atlas-card'; document.body.appendChild(card);
    const back = Q.get('from') === 'play' && saved ? '/next/?play' : '/next/';
    const list = () => {
      const read = atlasRead();
      card.innerHTML = `<b>世界の知恵</b><p class="small">世界の土地で、人が水・土・生き物とどう関わってきたか。地球儀を回して、印を押す。</p>
        <div class="list">${ATLAS.map(a => `<button data-a="${a.id}" class="${read.includes(a.id) ? 'done' : ''}">${BK.esc(a.name)} <span class="small">${BK.esc(a.place)}</span></button>`).join('')}</div>
        <div class="acts"><button id="aback">戻る</button></div>`;
      card.querySelectorAll('[data-a]').forEach(b => b.onclick = () => open(ATLAS.find(a => a.id === b.dataset.a)));
      $('#aback').onclick = () => { location.href = back; };
    };
    const open = (a) => {
      look(Math.max(-50, Math.min(50, a.lat)), a.lon, fit() * 0.85);
      const tech = a.tech && NOTES[a.tech], read = atlasRead(), canLearn = saved && tech && !saved.known.includes(a.tech);
      card.innerHTML = `<div class="small">${BK.esc(a.place)}</div><b>${BK.esc(a.name)}</b><p>${BK.esc(a.text)}</p>
        ${tech ? `<div class="note"><b>つながる技術：${BK.esc(tech.name)}</b><span>${BK.esc(tech.what)}</span></div>` : ''}
        ${canLearn ? `<p class="small">ノートに書くと、${BK.esc(tech.name)}を自分の土地でも試せるようになる。</p>` : ''}
        <div class="acts"><button class="yes" id="read">${read.includes(a.id) ? '読んだ' : 'ノートに書く'}</button><button id="alist">一覧へ</button></div>`;
      $('#read').onclick = () => {
        const r2 = atlasRead(); if (!r2.includes(a.id)) { r2.push(a.id); localStorage.setItem(ATLAS_READ, JSON.stringify(r2)); }
        if (canLearn) { const ns = E.learn(saved, a.tech, 'atlas'); Object.assign(saved, ns); try { localStorage.setItem('orbarium-next-1', E.save(saved)); } catch { /* 保存できない */ } }
        list();
      };
      $('#alist').onclick = list;
    };
    // 印を押す
    const ray = new THREE.Raycaster(), cv = $('#c'); let downAt = null;
    cv.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', (e) => {
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
      const r = cv.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), v.camera);
      const h = ray.intersectObjects(globe.children, false).find(x => x.object.userData.pin); if (h && h.object.userData.pin.id && h.object.userData.pin.id !== 'me') open(ATLAS.find(a => a.id === h.object.userData.pin.id));
    });
    hint.textContent = '印を押すと、その土地の知恵が読める';
    list();
  } else {
    // はじまり：ゆっくり回る地球に題名。つづきから／はじめから／図鑑
    look(28, 160); c.autoRotate = true; c.autoRotateSpeed = 0.35;
    $('#where').textContent = '地球 · いまの太陽';
    const card = document.createElement('div'); card.className = 'title-card';
    card.innerHTML = `<h1>Orbarium</h1><p>本物の土地で、水・食べもの・エネルギー・お金をめぐらせる</p>
      <div class="btns">${saved ? `<button class="yes" id="cont">つづきから（${saved.year}年・${BK.esc(E.SITES[saved.site].name)}）</button>` : ''}<button class="${saved ? '' : 'yes'}" id="newg">はじめから</button><button id="atl">地球儀で学ぶ</button></div>
      <p class="src">地形・気候・植生は実在の場所のデータ（標高：AWS Terrain Tiles／気候：Open-Meteo／植生：© ESA WorldCover／建物と道：© OpenStreetMap contributors） · <a href="/">今の版へ</a></p>`;
    document.body.appendChild(card); hint.textContent = '';
    if (saved) $('#cont').onclick = () => { location.href = '/next/?play'; };
    $('#atl').onclick = () => { location.href = '/next/?globe=atlas'; };
    $('#newg').onclick = () => {
      if (saved && !confirm('はじめからやり直しますか？（今の暮らしは消える）')) return;
      card.remove(); localStorage.removeItem(CARRY);
      travel('tokyo', 'med', INVITE, '/next/?play&new=med');
    };
  }
  v.start(); window.__next = { v, mode };
}

if (MODE === 'globe') bootGlobe(Q.get('globe') === 'atlas' ? 'atlas' : Q.get('travel') ? 'travel' : 'title'); else boot();
