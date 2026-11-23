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

const W = E.W, $ = (s) => document.querySelector(s);
const Q = new URLSearchParams(location.search), SITE = Q.get('site') || 'med';
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
  { id: 'house', name: '家', hint: '地面をなぞって床を描く。建物にくっつけると広がる。壁を押すと 壁→窓→扉' },
  { id: 'field', name: '畑', later: '畑の道具はこれから移します' },
  { id: 'tree', name: '木', later: '木の道具はこれから移します' },
  { id: 'water', name: '水', hint: '地面を押してタンクを置く。軒のそばなら雨どいがつき、屋根の雨が集まる' },
  { id: 'shed', name: '小屋', later: '小屋の道具はこれから移します' },
  { id: 'terrain', name: '地形', later: '地形の道具はこれから移します' },
  { id: 'erase', name: '消す', hint: '外したい物を押す（離れ・タンク・畑・木）' }
];
const TOUCH = matchMedia('(pointer: coarse)').matches;
const HINT_NEAR = TOUCH ? '物を押すと詳しく。作るのは下の道具で。1本指で回す・2本指で寄る' : '物を押すと詳しく。作るのは下の道具で。ドラッグで回す・ホイールで寄る';

async function boot() {
  const S = E.SITES[SITE];
  $('#where').textContent = `${S.name} · 土地を読みこみ中…`;
  let real = null;
  try { real = await loadRealPlot(S.lat0 ?? S.lat, S.lon0 ?? S.lon); E.applyReal(SITE, real); } catch (e) { console.warn('実データなし', e); }
  const s = E.newGame({ site: SITE, seed: 7, real }); s.world.site = SITE;
  s.known.push('heap', 'tank', 'mulch');
  // 試作の母屋：その土地の工法で建て替えたところから
  const w0 = s.world, d0 = W.cloneHouse(w0.house);
  Object.assign(d0, LOCAL[SITE] || LOCAL.med);
  let i = 0; for (const o of W.houseOuterEdges(d0)) { if (!d0.open[o.e] && i % 3 === 1) d0.open[o.e] = 'window'; i++; }
  W.buildHouse(s, d0);
  const cs = Object.keys(w0.house.cells).map(k => k.split(',').map(Number)), xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
  try { const bxx = Math.min(...xs) - 1, byy = Math.max(...ys) + 3; W.prefabBeds(s, [bxx, byy], [bxx + 6, byy + 3], 'hire'); } catch { /* 置けなければなし */ }

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
  $('#season').onclick = () => toast('季節を過ごすのは、次の段階でここから動くようにします');

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
    changed();
    const spent = cash0 - s.cash;
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(spent) : okMsg + (Math.abs(spent) > 0.05 ? `（${spent > 0 ? '−' : '+'}${yen(Math.abs(spent))}）` : ''));
    return null;
  };
  $('#undo').onclick = () => { if (G.draft) { setDraft(null); toast('下書きをやめた'); return; } if (!G.undo.length) return; G.redo.push(snap()); restore(G.undo.pop()); changed(); toast('取り消した'); };
  $('#redo').onclick = () => { if (!G.redo.length) return; G.undo.push(snap()); restore(G.redo.pop()); changed(); toast('やり直した'); };
  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#redo') : $('#undo')).click(); } if (e.key === 'Escape') { if (G.draft) setDraft(null); else { setTool(null); select(null); } } if (e.key === 'Enter' && G.draft) $('#draftYes').click(); });

  /* ---------- 壁を下げて中を見る ---------- */
  $('#cut').onclick = () => { stage.cut = !stage.cut; $('#cut').setAttribute('aria-pressed', String(stage.cut)); stage.rebuild(); toast(stage.cut ? '壁を下げた。家具と水まわりが見える' : '壁を戻した'); };

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
  function setTool(id) {
    if (G.draft && id !== 'house') setDraft(null);
    G.tool = id; for (const b of tools.children) b.classList.toggle('on', b.dataset.tool === id);
    if (id) select(null);
    // 家の道具では、1本指（左ボタン）はなぞる。回すのは2本指か右ボタン
    const c = v.controls, trace = id === 'house';
    c.mouseButtons = { LEFT: trace ? null : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: trace ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
    c.touches = { ONE: trace ? null : THREE.TOUCH.ROTATE, TWO: trace ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN };
    setHint();
  }
  function setHint() {
    const h = $('#hint');
    if (G.mode === 'map') h.innerHTML = `寄りたい所を押す · <a href="/">今の版へ</a>`;
    else if (G.tool) h.textContent = TOOLS.find(t => t.id === G.tool).hint + (G.tool === 'house' ? (TOUCH ? '（回すのは2本指）' : '（回すのは右ボタン）') : '');
    else h.textContent = HINT_NEAR;
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
  function showTrace(tr, e) {
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
  /* 下書き：なぞっただけでは建てない。写しの世界で試しに建てて、白い模型で見せ、［建てる］で本物に */
  const scratch = () => ({ ...s, world: JSON.parse(JSON.stringify(s.world)), cash: s.cash });
  // 写しの世界で、木を切って design を建てる。できた世界とお金、建った建物を返す
  function simulate(design, cuts) {
    const t = scratch();
    for (const [x, y] of cuts) { const err = W.cutTree(t, x, y); if (err) return { err }; }
    if (design.id && /^b\d+$/.test(design.id)) t.world.nextB = Math.max(t.world.nextB || 0, +design.id.slice(1));
    const err = W.buildBuilding(t, design); if (err) return { err };
    autoGutter(t);
    return { t, b: W.buildingById(t.world, W.bid(design)) };
  }
  function makeDraft(tr) {
    const D = draftFor(tr), w = s.world, good = D.out.filter((c, i) => D.st[i] === 'ok' || D.st[i] === 'tree');
    if (!good.length) { toast('ここには建てられない'); return; }
    const cuts = D.out.filter((c, i) => D.st[i] === 'tree');
    // 床の形を決める（木はもう切ったことにして）
    const t = scratch(); for (const [x, y] of cuts) W.cutTree(t, x, y);
    let d;
    if (D.base) d = W.cloneHouse(D.base);
    else { d = W.newAnnex(t.world, D.d.z, 'store'); Object.assign(d, LOCAL[SITE] || LOCAL.med); }
    const r = W.draftAddRect(t.world, d, D.xa, D.ya, D.xb, D.yb);
    if (!r.added) { toast('床を描けない（' + Object.keys(r.why).join('・') + '）'); return; }
    if (!D.base) { if (Object.keys(d.cells).length < 4) { toast('床は4m²（2×2m）より広く'); return; } autoOpen(d); }
    setDraft({ d, base: D.base ? W.bid(D.base) : null, cuts });
  }
  function setDraft(dr) {
    if (!dr) { G.draft = null; stage.draft = null; $('#draft').hidden = true; document.body.classList.remove('drafting'); stage.rebuild(); syncTop(); return; }
    const sim = simulate(dr.d, dr.cuts);
    G.draft = { ...dr, sim, cost: sim.err ? null : s.cash - sim.t.cash };
    stage.draft = { d: sim.b || dr.d, hideId: dr.base, cut: dr.cuts.map(c => c.join(',')) };
    stage.rebuild();
    const bx = W.roofBox(dr.d), n = Object.keys(dr.d.cells).length;
    const what = dr.base ? `${dr.base === 'main' ? '母屋' : '建物'}を広げる（床${n}m²に）` : `新しい建物 ${bx.X1 - bx.X0}×${bx.Y1 - bx.Y0}m`;
    $('#draftTxt').innerHTML = `<b>${what}</b> · ${sim.err ? `<span style="color:var(--bad)">${sim.err}</span>` : `約${yen(G.draft.cost)}`}${dr.cuts.length ? ` · 木とやぶを${dr.cuts.length}か所切る` : ''}<br><span class="s">まだ下書き。壁を押すと 壁→窓→扉、なぞり直すと形が変わる</span>`;
    $('#draftYes').disabled = !!sim.err;
    $('#draft').hidden = false; document.body.classList.add('drafting'); syncTop();
  }
  $('#draftNo').onclick = () => setDraft(null);
  $('#draftYes').onclick = () => {
    const D = G.draft; if (!D || D.sim.err) return;
    const fresh = simulate(D.d, D.cuts); if (fresh.err) { toast(fresh.err); return; }
    G.draft = null; stage.draft = null; $('#draft').hidden = true; document.body.classList.remove('drafting');
    act(() => { s.world = fresh.t.world; s.cash = fresh.t.cash; return null; }, D.base ? '床を広げた' : '建てた。押すと使い道を選べる');
  };
  // 下書きの壁を押す：壁→窓→扉
  function draftWallTap(p) {
    const D = G.draft; if (!D) return;
    const e = nearestEdge(D.d, p.point); if (!e) return;
    const d = W.cloneHouse(D.d), cur = d.open[e], next = !cur ? 'window' : cur === 'window' || cur === 'window2' ? 'door' : null;
    if (next) d.open[e] = next; else delete d.open[e];
    setDraft({ ...D, d });
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
  function nearestEdge(b, pt) {
    const px = pt.x, py = pt.z; let best = null, bd = 1e9;
    if (pt.y > b.z + W.HOUSE_H + 0.05) return null;
    for (const o of W.houseOuterEdges(b)) {
      const [t, r] = o.e.split(':'), [ex, ey] = r.split(',').map(Number);
      const [ax, ay, bx, by] = t === 'h' ? [ex, ey, ex + 1, ey] : [ex, ey, ex, ey + 1];
      const u = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      const dd = Math.hypot(px - (ax + (bx - ax) * u), py - (ay + (by - ay) * u)); if (dd < bd) { bd = dd; best = o; }
    }
    return best && bd <= 0.5 ? best.e : null;
  }
  // 壁を押す：壁→窓→扉→壁
  function wallTap(p) {
    const w = s.world, b = W.buildingById(w, p.id); if (!b) return;
    const e = nearestEdge(b, p.point); if (!e) { select(p); return; }
    const best = { e };
    const cur = b.open[best.e], next = !cur ? 'window' : cur === 'window' || cur === 'window2' ? 'door' : null;
    act(() => { const d = W.cloneHouse(b); const err = W.draftSetOpening(d, best.e, next); if (err) return err; return W.buildBuilding(s, d); }, next === 'window' ? '窓にした' : next === 'door' ? '扉にした' : '壁にした');
  }

  /* ---------- 水：タンク ---------- */
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
    const { x, y } = cellOf(g), w = s.world, before = catchM3();
    act(() => { const err = W.put(s, x, y, W.h(w, x, y), 'tank', 'hire'); if (err) return err; return autoGutter(); },
      (spent) => { const d = catchM3() - before; return d > 0 ? `タンクを置いた。屋根の雨が年 +${d}m³ 集まる（−${yen(spent)}）` : `タンクを置いた（−${yen(spent)}）。雨が入らない：建物の軒から1m以内に`; });
  }

  /* ---------- 消す ---------- */
  function erase(p) {
    const w = s.world; if (!p) return;
    if (p.kind === 'building') { if (p.id === 'main') { toast('母屋は消せない'); return; } act(() => W.removeBuilding(s, p.id), '建物を壊した'); return; }
    if (p.kind === 'tank') { act(() => W.remove(s, p.x, p.y, p.z), 'タンクを外した'); return; }
    if (p.kind === 'beds') { const { x, y } = cellOf(p.point); const z = Object.keys(w.blocks).map(k => k.split(',').map(Number)).find(([bx, by, bz]) => bx === x && by === y && w.blocks[`${bx},${by},${bz}`].t === 'bed'); if (!z) return; act(() => W.remove(s, x, y, z[2]), '畑を1マス外した'); return; }
    if (p.kind === 'trees') { const t = treeNear(p.point); if (!t) return; act(() => W.cutTree(s, t.cx, t.cy), `${W.CUT[t.kind]?.name || '木'}を切った。薪にとっておく`); return; }
    toast('外したい物を押す');
  }
  const treeNear = (pt) => { let best = null, bd = 1e9; for (const t of W.vegObjects(s.world)) { const dd = Math.hypot(t.x - pt.x, t.y - pt.z); if (dd < bd && dd < Math.max(1.2, t.r * 1.3)) { bd = dd; best = t; } } return best; };

  /* ---------- 押した物の横のカード ---------- */
  const card = $('#card');
  function selExists(sel) { const w = s.world; if (sel.kind === 'building') return !!W.buildingById(w, sel.id); if (sel.kind === 'tank') return !!w.blocks[`${sel.x},${sel.y},${sel.z}`]; if (sel.kind === 'tree') return W.vegObjects(w).some(t => t.cx === sel.t.cx && t.cy === sel.t.cy); if (sel.kind === 'beds') return true; return false; }
  function select(p) {
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
  const knows = (id) => !id || s.known.includes(id);
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
    const fixtures = use !== 'live' ? '' : `
      <div class="row"><span>トイレ</span>${seg('furn:toilet', [['toilet', '水洗'], ['ctoilet', 'コンポスト', !knows(W.FURN.ctoilet.learn)]], furnOf('toilet'))}</div>
      <div class="row"><span>シャワー</span>${seg('furn:shower', [['shower', 'ふつう'], ['shower2', '節水', !knows(W.FURN.shower2.learn)]], furnOf('shower'))}</div>
      <div class="row"><span>かまど</span>${seg('furn:stove', [['none', 'なし'], ['stove', '薪のかまど']], furnOf('stove') || 'none')}</div>`;
    return `<h3>${name}<span class="sub" style="margin:0">${U.name}</span><button class="x" data-act="close" aria-label="閉じる">×</button></h3>
      <p class="sub">${bx.X1 - bx.X0}×${bx.Y1 - bx.Y0}m · 床${n}m² · ${W.WALLS[b.wall].name}・${R.name}</p>
      ${id === 'main' ? '' : `<div class="row"><span>使い道</span>${seg('use', [['stay', '泊める'], ['store', 'しまう'], ['grow', '育てる']], use)}</div>`}
      <div class="row"><span>工法</span>${seg('method', [['local', 'この土地の工法'], ['ins', '断熱した', !knows('insulation')]], ins ? 'ins' : 'local')}</div>
      ${roofRow}${fixtures}${rain}
      <p class="note">${U.note}${!knows('insulation') ? ' 断熱は、季節を過ごして学ぶと選べる。' : ''}</p>`;
  }
  function renderCard() {
    const p = G.sel, w = s.world; if (!p) return;
    let html = '';
    if (p.kind === 'building') html = buildingCard(W.buildingById(w, p.id));
    else if (p.kind === 'tank') {
      const A = W.analyze(w, site(), s.persons.length), fed = A.fedKeys.includes(`${p.x},${p.y},${p.z}`);
      html = `<h3>雨水タンク<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">1m³（1,000L）</p>
        ${fed ? `<div class="flow">屋根の雨が入る。敷地のタンク全部で、屋根から年 <b>${Math.round(A.roofCatch * rainY / 1000)}m³</b> 集まる。</div>` : `<div class="flow warn">雨が入らない。建物の軒から1m以内に置くと、雨どいがついて屋根の雨が集まる。</div>`}
        <p class="note">［消す］で外せる。</p>`;
    } else if (p.kind === 'tree') {
      const c = W.CUT[p.t.kind] || {};
      html = `<h3>${c.name || '木'}<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">高さ約${Math.round(p.t.h)}m</p>
        <div class="flow">根が斜面の土と雨を止め、落ち葉が土を肥やす。日かげも作る。</div><p class="note">［消す］で切ると、薪とチップが${c.wood}m³とれる（${yen(c.cost)}）。</p>`;
    } else if (p.kind === 'beds') {
      const n = W.blocksOf(w, 'bed').length;
      html = `<h3>畑<button class="x" data-act="close" aria-label="閉じる">×</button></h3><p class="sub">段々の畑 · ${n}m²</p>
        <div class="flow">段ごとに平らにして、雨が土を流さないように。段の壁は今は土のまま（石垣はこれから）。</div><p class="note">畑の道具はこれから移します。</p>`;
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
  v.onFrame = placeCard;
  card.onclick = (e) => {
    const bt = e.target.closest('[data-act]'); if (!bt || bt.disabled) return;
    const [k, a, c] = bt.dataset.act.split(':'), w = s.world, p = G.sel;
    if (k === 'close') { select(null); return; }
    if (!p || p.kind !== 'building') return;
    const b = W.buildingById(w, p.id), d = W.cloneHouse(b);
    if (k === 'use') { act(() => { d.use = a; return W.buildBuilding(s, d); }, `使い道を「${W.USES[a].name}」に`); return; }
    if (k === 'method') { const L = LOCAL[SITE] || LOCAL.med; act(() => { if (a === 'ins') Object.assign(d, INSUL); else Object.assign(d, { wall: L.wall, roof: L.roof, finish: L.finish }); return W.buildBuilding(s, d); }, a === 'ins' ? '断熱した壁と屋根に' : 'この土地の工法に'); return; }
    if (k === 'pitch') { const i = W.PITCHES.findIndex(([q]) => Math.abs(q - (b.pitch || 0.3)) < 0.01), j = Math.max(0, Math.min(W.PITCHES.length - 1, (i < 0 ? 1 : i) + +a)); if (j === i) return; act(() => { d.pitch = W.PITCHES[j][0]; d.roofShape = d.roofShape && d.roofShape !== 'flat' ? d.roofShape : 'gable'; return W.buildBuilding(s, d); }, `屋根を${W.PITCHES[j][1]}傾きに`); return; }
    if (k === 'eaves') { const i = W.EAVE_STEPS.findIndex(q => Math.abs(q - W.eavesDepth(b)) < 0.01), j = Math.max(0, Math.min(W.EAVE_STEPS.length - 1, (i < 0 ? 1 : i) + +a)); if (j === i) return; act(() => { d.eaves = W.EAVE_STEPS[j]; return W.buildBuilding(s, d); }, `軒を${W.EAVE_STEPS[j]}mに`); return; }
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
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, trace: null };
    if (G.mode === 'near' && G.tool === 'house') {
      const n = ndcOf(e), p = stage.pick(n);
      if (!p || (p.kind !== 'building' && p.kind !== 'draft')) { const g = stage.groundAt(n); if (g) { down.trace = { a: cellOf(g), b: cellOf(g) }; canvas.setPointerCapture(e.pointerId); } }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || !down.trace || e.pointerId !== down.id) return;
    const g = stage.groundAt(ndcOf(e)); if (!g) return;
    const c = cellOf(g); if (c.x !== down.trace.b.x || c.y !== down.trace.b.y || !down.shown) { down.trace.b = c; down.shown = true; showTrace(down.trace, e); }
    else tip($('#tip').innerHTML, e.clientX, e.clientY);
  });
  const up = (e) => {
    if (Q.has('debug')) console.log('up', e.type, !!down, down && down.id, e.pointerId, down && !!down.trace);
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y), quick = performance.now() - d.t < 1500;
    if (d.trace) { hideTrace(); if (e.type === 'pointerup' && (d.trace.a.x !== d.trace.b.x || d.trace.a.y !== d.trace.b.y)) { makeDraft(d.trace); return; } }
    if (e.type === 'pointerup' && moved < 8 && quick) onTap(e);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function onTap(e) {
    const n = ndcOf(e), p = stage.pick(n);
    if (Q.has('debug')) console.log('tap', G.mode, G.tool, p && p.kind, p && p.id, p && p.point && [p.point.x.toFixed(2), p.point.y.toFixed(2), p.point.z.toFixed(2)].join(','));
    if (G.mode === 'map') { const g = stage.groundAt(n) || p?.point; if (g) flyNear(g); return; }
    if (G.tool === 'house') { if (p && p.kind === 'draft') draftWallTap(p); else if (p && p.kind === 'building') wallTap(p); else if (!G.draft) toast('地面をなぞって床を描く'); return; }
    if (p && p.kind === 'draft') { toast('下書き：［建てる］か［やめる］を押す'); return; }
    if (G.tool === 'water') { placeTank(p, n); return; }
    if (G.tool === 'erase') { erase(p); return; }
    select(p);
  }

  /* ---------- はじめ：地図から ---------- */
  $('#where').textContent = innerWidth > 640 ? `${S.name} · 4〜6月` : S.name;
  syncTop(); fitControls(); setTool(null);
  v.resize(); fitControls();
  v.lookAt(center, mapDist(), 50, 60); setMode('map');
  addEventListener('resize', () => { fitControls(); placeCard(); });
  v.start();
  window.__next = { s, E, v, stage, setHour, G, act, toScreen, select, setTool, flyNear, toMap, center, house: () => s.world.house };
}

/* 地球：東京からメデジンへ。昼と夜の境目は今の本物の太陽 */
async function bootGlobe() {
  const rings = await (await fetch('/data/land110.json')).json();
  const v = createView($('#c'), { keep: Q.has('shot') });
  v.setPalette({ ...PALETTES.med, sky: ['#D9DEDB', '#EFEADF'] });
  v.scene.fog = null; v.scene.environmentIntensity = 0.45; v.ao.enabled = false; v.dof.enabled = false; v.sun.castShadow = false;
  const med = E.SITES.med, taos = E.SITES.taos;
  const pins = [{ lat: 35.68, lon: 139.69, main: true, color: '#3F6E8C' }, { lat: Math.round(med.lat * 10) / 10, lon: Math.round(med.lon * 10) / 10, main: true }, { lat: Math.round(taos.lat * 10) / 10, lon: Math.round(taos.lon * 10) / 10 }];
  const globe = buildGlobe(rings, pins, [{ lat: 35.68, lon: 139.69 }, { lat: med.lat, lon: med.lon }]);
  v.scene.add(globe);
  const c = v.controls; c.enablePan = false; c.minDistance = 2.4; c.maxDistance = 7; c.minPolarAngle = 0.2; c.maxPolarAngle = Math.PI - 0.2; c.target.set(0, 0, 0); c.rotateSpeed = 0.5;
  v.camera.near = 0.05; v.camera.far = 50; v.camera.fov = 30; v.camera.updateProjectionMatrix();
  const ss = subsolar(new Date()), sd = ll(ss.lat, ss.lon).normalize();
  v.sun.position.copy(sd).multiplyScalar(10); v.sun.target.position.set(0, 0, 0); v.sun.color.set('#FFF1DE'); v.sun.intensity = 3.2;
  globe.userData.atm.material.uniforms.s.value.copy(sd);
  // 最初は東京の上から（出発地）。地球が画面に収まる距離に
  const fit = () => { const a = v.camera.aspect || 1, d = 1.3 / Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2)) / Math.min(1, a); return d; };
  v.resize(); v.camera.position.copy(ll(28, 160, 1).normalize().multiplyScalar(fit())); c.maxDistance = Math.max(7, fit() * 1.5); c.update();
  $('#where').textContent = '地球 · いまの太陽'; document.querySelector('.sun').style.display = 'none';
  for (const id of ['#cash', '#undo', '#redo']) $(id).style.display = 'none';
  $('#hint').innerHTML = '東京からメデジンへ。<a href="/next/">メデジンに降りる</a> · <a href="/">今の版へ</a>';
  v.start(); window.__next = { v };
}

if (Q.has('globe')) bootGlobe(); else boot();
