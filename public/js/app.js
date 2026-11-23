import * as E from './engine.js';
import { NOTES, LESSON, eventText, ATLAS, INVITE, LANDS } from './content.js';
import { createGlobe, flyTo, loadLand } from './globe.js';
import { createView, sunVector, dirName, vegObjects } from './iso.js';
import { loadRealPlot, mapsUrl } from './realsite.js';

const KEY = 'orbarium-v5';   // v5：人の家のない区画を選び直し、植生をのせた
const app = document.getElementById('app');
const G = { s: null, tool: null, ghost: null, sel: null, tab: 'web', drag: null, report: null, studied: -1, atlasRead: loadAtlasRead() };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const man = (v) => `${Math.round(v).toLocaleString('ja-JP')}万円`;
const pct = (v) => `${Math.round(v * 100)}%`;
let stopAnim = null;
function stop() { if (stopAnim) { stopAnim(); stopAnim = null; } }

function persist() { try { localStorage.setItem(KEY, E.save(G.s)); } catch (e) { /* 保存できない環境 */ } }
function restore() {
  try {
    const v = localStorage.getItem(KEY); const s = v ? E.load(v) : null;
    // 家具ができる前のセーブには、最初の家具を置いておく
    const hs = s?.world?.house; if (hs && !hs.furn) { hs.furn = []; E.W.autoFurnish(hs); }
    if (s?.world && !s.world.veg) s.world.veg = new Array(2500).fill(30);
    return s;
  } catch { return null; }
}
function loadAtlasRead() { try { return JSON.parse(localStorage.getItem(KEY + '-atlas') || '[]'); } catch { return []; } }
function saveAtlasRead() { try { localStorage.setItem(KEY + '-atlas', JSON.stringify(G.atlasRead)); } catch { } }

/* ================= タイトル ================= */
async function title() {
  stop();
  const saved = restore();
  app.innerHTML = `<main class="title"><canvas id="globe" aria-hidden="true"></canvas>
    <div class="title-card"><h1>Orbarium</h1><p>Choose a land. Close the loop.</p>
    <div class="row"><button class="btn primary" id="new">はじめから</button>${saved ? `<button class="btn" id="cont">つづきから（${saved.year}年）</button>` : ''}<button class="btn ghost" id="atlas">地球儀で学ぶ</button></div>
    <p class="small">地形・気候・植生は実在の場所のデータ（標高：AWS Terrain Tiles／気候：Open-Meteo／植生：© ESA WorldCover／建物と道：© OpenStreetMap contributors）</p></div></main>`;
  await loadLand();
  const g = createGlobe(document.getElementById('globe'), { lon: 140, lat: 20 });
  let run = true; const spin = () => { if (!run) return; g.lon -= 0.08; g.draw(); requestAnimationFrame(spin); }; spin();
  const onR = () => { g.size(); g.draw(); }; window.addEventListener('resize', onR);
  stopAnim = () => { run = false; window.removeEventListener('resize', onR); };
  document.getElementById('new').onclick = () => { if (!saved || confirmBox('今の暮らしを消して、はじめからにしますか？')) travel(E.SITES.tokyo, E.SITES.med, startGame, INVITE); };
  const c = document.getElementById('cont'); if (c) c.onclick = () => { G.s = saved; game(); };
  document.getElementById('atlas').onclick = () => atlas(() => title());
}
function confirmBox(msg) { return window.confirm(msg); }

async function travel(from = E.SITES.tokyo, to = E.SITES.med, after = startGame, story = null) {
  stop();
  const toKey = Object.keys(E.SITES).find(k => E.SITES[k] === to);
  if (toKey && toKey !== 'tokyo') G.realP = realPromise(toKey);
  app.innerHTML = `<div class="travel"><div class="cap" id="cap">${from.name ? `${esc(from.name)}から、${esc(to.name)}へ` : esc(to.name)}</div>${story ? `<div class="mailcard trip"><div class="small">メール · ${esc(story.from)}</div><b>${esc(story.subject)}</b><div>${esc(story.body)}</div></div>` : ''}<canvas id="tg" aria-hidden="true"></canvas><button class="btn skip" id="skip">とばす</button></div>`;
  await loadLand();
  const g = createGlobe(document.getElementById('tg'), { lon: from.lon, lat: from.lat });
  g.label = from.name ? { lon: from.lon, lat: from.lat, text: from.name } : null; g.draw();
  let done = false;
  const finish = () => { if (done) return; done = true; cancelAnimationFrame(g.raf); after(); };
  document.getElementById('skip').onclick = finish;
  setTimeout(() => {
    if (done) return;
    g.label = { lon: to.lon, lat: to.lat, text: to.name };
    flyTo(g, { lon: to.lon, lat: to.lat, scale: 1 }, 3200, () => {
      const cap = document.getElementById('cap'); if (!cap) return;
      cap.textContent = `${to.name}・標高${to.elev.toLocaleString()}m`;
      flyTo(g, { lon: to.lon, lat: to.lat, scale: 14 }, 1400, () => { document.querySelector('.travel')?.classList.add('fade-out'); setTimeout(finish, 500); });
    });
  }, 500);
}
function chooseLand() {
  const s = G.s;
  const opts = Object.entries(LANDS).filter(([k]) => k !== s.site);
  modal(`<h2>次の土地を選ぶ</h2><p class="small" style="margin:0">学んだ技術と、所持金と、週の過ごし方は持っていける。置いたものは持っていけない。</p>
    ${opts.map(([k, l]) => { const price = E.SITES[k].plotPrice; const ok = s.cash >= price; return `<div class="note"><b>${esc(l.name)}</b><span>${esc(l.text)}</span><span class="meta">${esc(l.note)} · 50m四方 ${man(price)}</span><button class="btn primary" data-m="go:${k}" ${ok ? '' : 'disabled'}>${ok ? 'ここに決める' : 'お金が足りない'}</button></div>`; }).join('')}
    <div class="note locked"><b>どこでも（準備中）</b><span>地球儀から好きな場所を選ぶモード。その土地の実際の天気と地形で始める。</span></div>
    <button class="btn ghost" data-m="close">まだここにいる</button>`, (m, close) => {
    if (m === 'close') return close();
    if (m.startsWith('go:')) {
      const k = m.slice(3); close();
      const from = E.SITES[s.site], to = E.SITES[k];
      const hist = [...(s.flags.history || []), { site: s.site, years: s.turn / 4, rel: E.relations(s).score }];
      travel(from, to, async () => {
        const real = await waitReal(G.realP || realPromise(k), to.name); G.realP = null;
        G.s = E.newGame({ site: k, seed: Math.floor(Math.random() * 1e6), cash: s.cash - to.plotPrice, persons: s.persons, known: s.known, learned: s.learned, year: s.year, flags: { history: hist }, real });
        G.s.q = s.q; G.tab = 'web'; G.cat = null; persist(); game();
      });
    }
  });
}
/* 実在の土地のデータを取りに行く（地球儀の移動中に裏で進める）。取れなければ null */
function realPromise(key, lat, lon) {
  const S = E.SITES[key]; if (!S || key === 'tokyo') return Promise.resolve(null);
  return loadRealPlot(lat ?? S.lat0 ?? S.lat, lon ?? S.lon0 ?? S.lon).then(r => { E.applyReal(key, r); return r; }).catch(e => { console.warn('実データを取れなかった', e); return null; });
}
async function waitReal(p, name) {
  let shown = null; const t = setTimeout(() => { shown = document.createElement('div'); shown.className = 'loading-real'; shown.innerHTML = `<div class="box"><b>${esc(name)}の土地の、実際の標高・気候・植生を取ってきて、人の家にかからない区画を探しています…</b><span class="small">標高：AWS Terrain Tiles ／ 気候：Open-Meteo（ERA5）</span></div>`; document.body.appendChild(shown); }, 300);
  try { return await p; } finally { clearTimeout(t); shown?.remove(); }
}
async function startGame() {
  const real = await waitReal(G.realP || realPromise('med'), 'メデジン'); G.realP = null;
  G.s = E.newGame({ seed: Math.floor(Math.random() * 1e6), real });
  G.tab = 'web'; G.cat = null; G.report = null;
  persist();
  game();
}

/* ================= ゲーム画面 ================= */
function game() {
  stop();
  app.innerHTML = `<div class="game">
    <header class="bar" id="bar"></header>
    <section class="left"><div class="mapzone"><div class="mapwrap" id="mapwrap"></div><div class="inspect idle" id="inspect" aria-live="polite"></div></div><div class="tools" id="tools" role="toolbar" aria-label="作るもの"></div></section>
    <section class="right"><nav class="tabs" id="tabs"></nav><div class="panel" id="panel"></div>
      <div class="closebar"><button class="btn primary" id="close"></button></div></section></div>`;
  document.getElementById('close').onclick = closeLaptop;
  renderAll();
  window.onresize = () => { if (document.getElementById('map2d')) renderMap(); };
}
function renderAll() { renderBar(); renderTools(); renderMap(); renderInspect(); renderTabs(); renderPanel(); renderClose(); }

function wallet(s, T) {
  if (!s) return `<div class="wallet"><div class="chip"><span>所持金</span><b>${man(300)}</b></div>
    <div class="chip empty"><span>タンクの水</span><b>—</b></div><div class="chip empty"><span>電池</span><b>—</b></div><div class="chip empty"><span>食料庫</span><b>—</b></div><div class="chip empty"><span>土</span><b>—</b></div></div>`;
  const S = E.summarize(s);
  const ch = (label, v, empty) => `<div class="chip${empty ? ' empty' : ''}"><span>${label}</span><b>${empty ? '—' : v}</b></div>`;
  return `<div class="wallet">${ch('所持金', man(s.cash))}${ch('タンクの水', `${(s.tank / 1000).toFixed(1)}/${S.tankCap / 1000}m³`, !S.tankCap)}${ch('電池', `${(s.batt / 1000).toFixed(1)}/${S.battKwh}kWh`, !S.battKwh)}${ch('食料庫', `${Math.round(s.food)}kg`, false)}${ch('土の有機物', `${s.om.toFixed(1)}%`, !S.gArea)}</div>`;
}
function renderBar() {
  const s = G.s, site = E.SITES[s.site];
  const place = s.site === 'tokyo' ? '' : ` · <a href="${mapsUrl(site.lat, site.lon)}" target="_blank" rel="noopener" title="この区画の中心をGoogleマップで開く">${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}</a>${s.real ? '' : ' <span class="ng" title="実データを取れなかったので、作り物の地形と仮の気候">（仮の地形）</span>'}`;
  document.getElementById('bar').innerHTML = `<div class="brand">Orbarium</div><div class="where">${esc(site.name)} · 区画50m四方${place}</div>
    <div class="when">${s.year}年 ${esc(site.quarters[s.q])}</div>${wallet(s)}
    <button class="menu" id="menu" aria-label="メニュー"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/></svg></button>`;
  document.getElementById('menu').onclick = menu;
}
function menu() {
  modal(`<h2>メニュー</h2><div style="display:flex;flex-direction:column;gap:8px">
    ${G.s.flags['done_' + G.s.site] != null ? '<button class="btn primary" data-m="next">次の土地を選ぶ</button>' : ''}<button class="btn" data-m="atlas">地球儀で学ぶ（図鑑）</button><button class="btn" data-m="src">この土地のデータの出典</button><button class="btn" data-m="title">タイトルへ（自動で保存）</button><button class="btn ghost" data-m="close">閉じる</button></div>`, (m, close) => {
    if (m === 'src') { close(); sources(); }
    if (m === 'atlas') { close(); atlas(() => game()); }
    if (m === 'next') { close(); chooseLand(); }
    if (m === 'title') { close(); title(); }
    if (m === 'close') close();
  });
}
/* この土地のデータの出典（植生・建物のデータは表示の義務がある） */
function sources() {
  const s = G.s, r = s.real, src = r?.src || {}, pk = r?.pick;
  const rows = r ? [['標高', src.dem], ['気候', src.climate], ['植生', src.lc || '取れなかったので、全部を草地にしています'], ['建物と道', src.osm || '取れなかった']] : [['地形と気候', '実データを取れなかったので、仮の地形と気候です']];
  const where = r ? `<p class="small">区画の中心：${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}${pk && pk.checked?.length ? `。人の家や道にかからない50m四方を、${esc(pk.checked.join('・'))}で探して選びました${pk.moved ? `（もとの地点から${esc(pk.dir)}へ約${pk.moved}m${pk.clear ? '' : '。完全に空いた所は見つからず、いちばん建物の少ない所'}）` : ''}。` : ''}</p>` : '';
  modal(`<h2>この土地のデータの出典</h2>${where}<dl class="src">${rows.map(([k, v2]) => `<dt>${esc(k)}</dt><dd>${esc(v2 || '')}</dd>`).join('')}</dl><div style="margin-top:12px"><button class="btn" data-m="close">閉じる</button></div>`, (m, close) => { if (m === 'close') close(); });
}
function modal(html, on) {
  const d = document.createElement('div'); d.className = 'modal'; d.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(d);
  const close = () => d.remove();
  d.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) on(b.dataset.m, close); else if (e.target === d) close(); });
  d.querySelector('button')?.focus();
}

/* ---------- 真上から見た段々の地図（canvas） ---------- */
function levelColor(lv, max, dug) {
  if (dug) return '#B5A487';
  const t = max ? lv / max : 0, a = [196, 210, 172], b = [236, 228, 200];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}
function topBlock(w, x, y) {
  let best = null;
  for (let z = E.W.h(w, x, y) - 3; z < E.W.h(w, x, y) + 8; z++) { const b = E.W.at(w, x, y, z); if (b) best = { b, z }; }
  return best;
}
function renderMap() {
  const s = G.s, wrap = document.getElementById('mapwrap');
  draw2D(wrap, s.world, { label: '敷地の地図。50m四方、1マス1m。色が濃いほど低い段。押すとその場所を3Dで拡大',
    onCell: (x, y) => openBuild(x, y), onHover: (p) => { G.hoverCell = p; renderInspect(); } });
}
/* 敷地を上から描く：段の色・等高線（1mごと、5mごとに太く）・置いたもの・家。labels で等高線に標高を書く */
function paintPlot(ctx, w, pad, c, dpr, labels) {
  const max = Math.max(...w.H), H = (x, y) => E.W.h(w, x, y);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) { ctx.fillStyle = levelColor(H(x, y), max, w.H0[y * 50 + x] > H(x, y)); ctx.fillRect(pad + x * c, pad + y * c, c + 0.5, c + 0.5); }
  // 斜面の日当たり：その土地・その季節の10時の日差しに向いた斜面を明るく、背を向けた斜面を暗く
  const site = E.SITES[G.s?.site || 'tokyo'], S = sunVector(site.lat, (G.s?.q ?? 1) * 3 + 2, 10).dir;
  const Hc = (x, y) => H(Math.max(0, Math.min(49, x)), Math.max(0, Math.min(49, y)));
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    let gx = 0, gy = 0; for (let k = -2; k <= 2; k++) { gx += Hc(x + 2, y + k) - Hc(x - 2, y + k); gy += Hc(x + k, y + 2) - Hc(x + k, y - 2); }
    gx /= 20; gy /= 20; const nl = Math.hypot(gx, gy, 1), lam = (-gx * S[0] - gy * S[1] + S[2]) / nl, d = lam - S[2];
    if (Math.abs(d) < 0.01) continue;
    ctx.fillStyle = d > 0 ? `rgba(255,236,190,${Math.min(0.35, d * 1.4)})` : `rgba(40,50,90,${Math.min(0.3, -d * 1.2)})`;
    ctx.fillRect(pad + x * c, pad + y * c, c + 0.5, c + 0.5);
  }
  // 植生：衛星から見た被覆（林・やぶ・畑のあと・土）を色で重ね、木と茂みは丸く
  if (w.veg) {
    const VT = { 30: 'rgba(150,188,104,.16)', 10: 'rgba(52,96,44,.42)', 95: 'rgba(52,96,44,.42)', 20: 'rgba(128,146,64,.32)', 40: 'rgba(206,192,120,.35)', 50: 'rgba(190,165,128,.5)', 60: 'rgba(196,166,122,.5)', 80: 'rgba(80,130,190,.5)', 90: 'rgba(70,140,130,.35)' };
    const inHouse = (x, y) => w.house && w.house.cells[`${x},${y}`];
    for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) { const f = VT[w.veg[y * 50 + x]]; if (!f || inHouse(x, y)) continue; ctx.fillStyle = f; ctx.fillRect(pad + x * c, pad + y * c, c + 0.5, c + 0.5); }
    for (const t of vegObjects(w)) {
      if (inHouse(t.cx, t.cy) || topBlock(w, t.cx, t.cy)) continue;
      const R = (t.kind === 'shrub' ? t.r : t.r * 0.9) * c, px = pad + t.x * c, py = pad + t.y * c;
      ctx.fillStyle = t.kind === 'shrub' ? 'rgba(84,120,52,.75)' : t.kind === 'pine' ? 'rgba(46,82,48,.8)' : t.kind === 'euca' ? 'rgba(104,136,92,.78)' : 'rgba(58,104,50,.78)';
      ctx.beginPath(); ctx.arc(px, py, R, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,230,.16)'; ctx.beginPath(); ctx.arc(px - R * 0.3, py - R * 0.3, R * 0.5, 0, 7); ctx.fill();
    }
  }
  const lines = (idx) => {
    ctx.beginPath();
    for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
      const lv = H(x, y);
      if (x < 49 && H(x + 1, y) !== lv && ((Math.max(lv, H(x + 1, y)) + w.base) % 5 === 0) === idx) { ctx.moveTo(pad + (x + 1) * c, pad + y * c); ctx.lineTo(pad + (x + 1) * c, pad + (y + 1) * c); }
      if (y < 49 && H(x, y + 1) !== lv && ((Math.max(lv, H(x, y + 1)) + w.base) % 5 === 0) === idx) { ctx.moveTo(pad + x * c, pad + (y + 1) * c); ctx.lineTo(pad + (x + 1) * c, pad + (y + 1) * c); }
    }
    ctx.stroke();
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(70,80,60,.62)'; ctx.lineWidth = Math.max(1, c * 0.09); lines(false);
  ctx.strokeStyle = 'rgba(60,66,48,.9)'; ctx.lineWidth = Math.max(1.5, c * 0.16); lines(true);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const tb = topBlock(w, x, y); if (!tb) continue;
    const d = E.W.BLOCKS[tb.b.t];
    ctx.globalAlpha = tb.b.p ? 0.45 : 1; ctx.fillStyle = d.color;
    const ins = d.overlay ? 0.06 : d.kind === 'tank' || d.kind === 'tree' ? 0.15 : 0.02;
    if (d.kind === 'tank' || d.kind === 'tree') { ctx.beginPath(); ctx.arc(pad + (x + 0.5) * c, pad + (y + 0.5) * c, c * (0.5 - ins), 0, 7); ctx.fill(); }
    else ctx.fillRect(pad + (x + ins) * c, pad + (y + ins) * c, c * (1 - 2 * ins), c * (1 - 2 * ins));
    ctx.globalAlpha = 1;
  }
  if (w.house) {
    ctx.fillStyle = '#E8A15A';
    for (const k in w.house.cells) { const [x, y] = k.split(',').map(Number); ctx.fillRect(pad + x * c, pad + y * c, c + 0.5, c + 0.5); }
    ctx.strokeStyle = '#8A4513'; ctx.lineWidth = Math.max(1.5, c * 0.14); ctx.beginPath();
    for (const o of E.W.houseOuterEdges(w.house)) {
      const [t, r2] = o.e.split(':'); const [ex, ey] = r2.split(',').map(Number);
      if (w.house.open[o.e] === 'door') continue;
      if (t === 'h') { ctx.moveTo(pad + ex * c, pad + ey * c); ctx.lineTo(pad + (ex + 1) * c, pad + ey * c); } else { ctx.moveTo(pad + ex * c, pad + ey * c); ctx.lineTo(pad + ex * c, pad + (ey + 1) * c); }
    }
    ctx.stroke();
  }
  if (!labels) return;
  // 等高線ごとに1つ、標高を書く（となりの線と重ならないよう、書く行をずらす）
  const levels = [...new Set(w.H)].sort((a, b) => a - b).slice(1), rows = [9, 21, 33, 45];
  ctx.font = `${Math.max(10, c * 0.78)}px "IBM Plex Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  levels.forEach((L, i) => {
    const idx = (L + w.base) % 5 === 0;
    for (const ry of idx ? [rows[i % 4], rows[(i + 2) % 4]] : [rows[i % 4]]) {
      let px = null, py = null;
      for (let dy = 0; dy < 6 && px == null; dy++) for (const yy of [ry + dy, ry - dy]) { if (yy < 0 || yy > 49) continue; for (let x = 0; x < 49; x++) { const a = H(x, yy), b = H(x + 1, yy); if (a !== b && Math.max(a, b) === L) { px = x + 1; py = yy + 0.5; break; } } if (px != null) break; }
      if (px == null) continue;
      const tx = pad + px * c, ty = pad + py * c, label = `${L + w.base}`;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(240,242,234,.95)'; ctx.strokeText(label, tx, ty);
      ctx.fillStyle = idx ? '#2E3A2A' : '#5A6452'; ctx.font = `${idx ? '600 ' : ''}${Math.max(10, c * 0.78)}px "IBM Plex Mono", monospace`; ctx.fillText(label, tx, ty);
    }
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function draw2D(wrap, w, o) {
  wrap.innerHTML = `<canvas id="map2d" aria-label="${esc(o.label)}"></canvas>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}`;
  const cv = wrap.querySelector('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = wrap.getBoundingClientRect(), side = Math.max(120, Math.min(r.width, r.height) - 16);
  cv.style.width = side + 'px'; cv.style.height = side + 'px'; cv.width = side * dpr; cv.height = side * dpr;
  const ctx = cv.getContext('2d'), pad = 18 * dpr, c = (cv.width - pad * 2) / 50;
  ctx.fillStyle = '#E3E5DC'; ctx.fillRect(0, 0, cv.width, cv.height);
  paintPlot(ctx, w, pad, c, dpr, true);
  ctx.strokeStyle = '#1F2A2E'; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(pad, pad, c * 50, c * 50); ctx.setLineDash([]);
  ctx.fillStyle = '#4A544F'; ctx.font = `${11 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillText(o.caption || `↑北　1マス=1m・1段=高さ1m${G.s?.real ? `・実際の標高（AWS Terrain Tiles）${G.s.real.lc ? '・植生 © ESA WorldCover' : ''}` : ''}`, pad, pad - 5 * dpr);
  if (o.overlay) o.overlay(ctx, pad, c, dpr);
  const cell = (e) => { const b = cv.getBoundingClientRect(); const x = Math.floor(((e.clientX - b.left) * dpr - pad) / c), y = Math.floor(((e.clientY - b.top) * dpr - pad) / c); return x >= 0 && y >= 0 && x < 50 && y < 50 ? [x, y] : null; };
  if (o.onCell) cv.onclick = (e) => { const p = cell(e); if (p) o.onCell(p[0], p[1]); };
  if (o.onHover) cv.onmousemove = (e) => o.onHover(cell(e));
}
function hintText() {
  const s = G.s, S = E.summarize(s);
  if (s.turn === 0 && s.site === 'med') return `${s.real ? `メデジン西部、サン・クリストバル地区の実在の山腹です。等高線は実際の標高、${s.world.veg && s.real.lc ? '木や草地は衛星から見た実際の植生、' : ''}気温と雨は2014〜2023年の実際の気象。${s.real.pick?.checked?.length ? '区画は、人の家や道にかからない50m四方を選んでいます。' : ''}` : '実際の標高と気候を取れなかったので、仮の地形で始めています（通信を確かめて、はじめからやり直すと取り直します）。'}オレンジ色が、ルシアの祖父母の小さな板壁の家（12m²、高さ3m。トイレ・シャワー・ベッド・テーブルつき）。地図を押すと拡大して、何を作るか選べます。`;
  return '';
}
/* 地図の下の帯：はじめは土地の説明（地図には重ねない。閉じられる）、ふだんは操作の一言 */
function renderTools() {
  const el = document.getElementById('tools'), hint = G.s.flags.welcomeClosed ? '' : hintText();
  if (!hint) { el.innerHTML = `<p class="tools-hint">地図を押すと、その場所を拡大します。拡大した先で、家・畑・水まわりなど何を作るか選べます。</p>`; return; }
  el.innerHTML = `<div class="welcome"><p>${hint}</p><button class="btn ghost" id="welcomex" aria-label="説明を閉じる">閉じる</button></div>`;
  document.getElementById('welcomex').onclick = () => { G.s.flags.welcomeClosed = 1; persist(); renderTools(); renderMap(); };
}
function renderInspect() {
  const el = document.getElementById('inspect'); if (!el) return;
  const s = G.s, w = s.world, S = E.summarize(s);
  const lines = [];
  if (G.hoverCell) { const [x, y] = G.hoverCell, tb = topBlock(w, x, y); lines.push(`(${x}, ${y}) · 標高 ${E.W.h(w, x, y) + w.base}m${w.H0[y * 50 + x] !== E.W.h(w, x, y) ? `（もとは${w.H0[y * 50 + x] + w.base}m）` : ''}${tb ? ' · ' + E.W.BLOCKS[tb.b.t].name : w.veg && !(w.house && w.house.cells[`${x},${y}`]) ? ' · ' + E.W.VEG_NAME[w.veg[y * 50 + x]] : ''}`); }
  const diag = S.diag.slice(0, 3).map(d => `<div class="${d.lv === 'warn' ? 'ng' : 'small'}">${d.lv === 'warn' ? '⚠ ' : ''}${esc(d.text)}</div>`).join('');
  if (!lines.length && !diag) { el.classList.add('idle'); el.innerHTML = ''; return; }
  el.classList.remove('idle');
  el.innerHTML = `<div>${lines.map(esc).join('<br>')}${diag}</div>`;
}
function alertBox(msg) { modal(`<p>${esc(msg)}</p><button class="btn" data-m="ok">OK</button>`, (m, c) => c()); }

/* ---------- 3D：押した場所を拡大して作る ---------- */
/* ==================== 拡大して作る（地図を押す → その場所で何を作るか選ぶ） ==================== */
/* ==================== 拡大した3D：設計図 → 見積もり → 頼む ====================
   家も畑も水まわりも、ここでいじるのは設計図（下書きの世界）。お金はかからない。
   下の［この設計で頼む］で、見積もりの額を払って近所の職人さんが作る。
   作り方：道具を選んで、地面を押す（1つ）か、なぞる（四角・並べる）。覚えていない作り方は出さない */
const CATS = [['house', '家'], ['farm', '畑・植栽'], ['water', '水'], ['gear', '小屋・設備'], ['land', '土地・木']];
// how：area＝なぞった四角 / point＝押して置く（なぞると並べる）/ mark＝畑に足す / cell＝1マスずつ（なぞると続けて）/ erase＝外す
const TOOLS = {
  farm: [
    { id: 'beds', how: 'area', name: '畑', block: 'bed', note: 'なぞった四角が畑になる。斜面なら等高線にそって細長く' },
    { id: 'mulch', how: 'mark', mark: 'm', name: 'マルチ', learn: 'mulch', price: 0.01, color: '#B9935A', note: '刈った草で畑を覆う。乾きにくく、草も生えにくい' },
    { id: 'cover', how: 'mark', mark: 'g', name: '温室の覆い', learn: 'greenhouse', price: 1.2, color: '#DDE8EC', note: '畑に覆いをかける。外より暖かく、冬も育つ' },
    { id: 'tree', how: 'point', block: 'tree', name: '果樹', note: '実がなり、根で斜面を押さえる。落ち葉は堆肥の材料に。なぞると並べて植える' },
    { id: 'hedge', how: 'point', block: 'hedge', note: 'なぞると並べて植える。風よけ・獣よけ' }
  ],
  water: [
    { id: 'tank', how: 'point', block: 'tank', note: '屋根の軒から1m以内に置くと雨が入る。入口（上）が軒より低ければ、家より高い所でもよい' },
    { id: 'gutter', how: 'gutter', name: '雨樋', color: '#A9B2B7', note: '屋根（家・小屋・堆肥小屋）を押すと、軒にといとたてどいをつける。ないと軒から落ちる雨の一部しかタンクに入らない。雨樋のある屋根なら、そのタンクのとなりや上につないだタンクにも雨が回る' },
    { id: 'pump', how: 'point', block: 'pump', note: 'タンクより高い畑へ水を送る（電気を使う）' },
    { id: 'pond', how: 'area', name: 'ため池', learn: 'pond', block: 'pond', note: 'なぞった所を1m掘って防水する。流れた雨を乾く季節までためる' },
    { id: 'filter', how: 'area', name: '排水の浄化の穴', learn: 'grey', block: 'media_sand', note: 'なぞった所を掘って層を入れ、植物を植える。台所や風呂の水をきれいに' },
    { id: 'settle', how: 'point', block: 'settle', note: '浄化の穴の前に。油や汚れを沈める' }
  ],
  gear: [
    { id: 'heap', how: 'area', name: '堆肥小屋', block: 'heap', note: 'なぞった列に、屋根つき・半屋外の堆肥の区画（1区画1m³）。生ごみ・し尿・ふんを落ち葉と混ぜて寝かせる。積む・寝かせる・使うの3区画がおすすめ' },
    { id: 'shed', how: 'area', name: '柱と屋根の小屋', block: 'roof_tin', note: 'なぞった四角に柱と屋根（2×2以上）。下は物置、屋根は雨を集める' },
    { id: 'pv', how: 'point', block: 'pv', note: '日当たりのよい地面か、小屋の屋根の上に' },
    { id: 'coop', how: 'point', block: 'coop', note: '残り物を食べて、卵とふんを返す' }
  ],
  land: [
    { id: 'cut', how: 'cut', name: '木を切る', note: '木や茂みを切る（なぞると続けて）。木のある所には何も作れない。切った木はとっておき、チップにして堆肥に混ぜ（おがくずを買わずにすむ）、残りは家に［薪のかまど］があれば料理と暖房の薪にする' },
    { id: 'stone', how: 'edge', name: '石垣', learn: 'terrace', price: E.W.STONE_PRICE, color: '#9B988E', note: '段差のふち（上の段のはし）をなぞると、段差の面を石で積む。ふちまで耕した畑から水と土が流れ落ちるのを、すき間から水を逃がしつつ留める。石の熱でそばの畑が暖まり、すき間の生き物が虫を食べる' },
    { id: 'dig', how: 'cell', name: '掘る（1段）', note: '押したマスを1段掘る。なぞると続けて。出た土はとっておく' },
    { id: 'fill', how: 'cell', name: '盛る（1段）', note: 'とってある土で1段盛る。足りない分は買う' },
    { id: 'level', how: 'area', name: '平らにする', note: 'なぞった四角を、まん中の高さにそろえる' }
  ]
};
const MOVE = { id: 'move', how: 'move', name: '動かす', note: 'タンク・ポンプ・太陽光・ニワトリ小屋・沈殿槽を押して持ち上げ、置きたい所を押す（手間賃だけ。上に積むこともできる）' };
const ERASE = { id: 'erase', how: 'erase', name: '外す', note: '押した（なぞった）ものを外す。この設計で置いたものなら取り消し' };
const MAT = { media: 'media_sand', plant: 'plant_reed', roof: 'roof_tin' };
const toolDef = (cat, id) => id === 'erase' ? ERASE : id === 'move' ? MOVE : (TOOLS[cat] || []).find(t => t.id === id);
const toolName = (t) => t.name || E.W.BLOCKS[t.block].name;
const toolLearn = (t) => t.learn !== undefined ? t.learn : t.block ? E.W.BLOCKS[t.block].learn : null;
function toolPrice(t) {   // 1マス・1つあたりの目安（万円）
  const P = (b) => E.W.blockPrice(b, 'hire'), D = E.W.DIG_LABOR * 1.5;
  if (t.price != null) return t.price;
  return { cut: null, gutter: null, move: E.W.MOVE_PRICE, heap: P('heap'), beds: P('bed'), pond: D + P('pond'), filter: D + P(MAT.media) + P(MAT.plant), shed: P(MAT.roof), dig: D, fill: E.W.FILL_LABOR * 1.5, level: null, erase: 0 }[t.id] ?? (t.block ? P(t.block) : null);
}
const toolUnit = (t) => t.id === 'heap' ? '1区画' : ({ area: '1m²', point: '1つ', mark: '1m²', cell: '1マス', erase: '', cut: '', edge: '1m²', move: '1回', gutter: '' })[t.how];
function knownTech(id) { return !id || G.s.known.includes(id); }
const clone = (x) => JSON.parse(JSON.stringify(x));
function houseCenter() { const hs = G.s.world.house; if (!hs) return [25, 25]; const cs = Object.keys(hs.cells).map(k => k.split(',').map(Number)); return [Math.round(cs.reduce((a, c) => a + c[0], 0) / cs.length), Math.round(cs.reduce((a, c) => a + c[1], 0) / cs.length)]; }
/* 地図で押した所にあるものから、最初に開く道具の棚を決める */
function catAt(w, x, y) {
  if (w.house && w.house.cells[`${x},${y}`]) return 'house';
  const tb = topBlock(w, x, y); if (!tb) return null;
  const k = E.W.BLOCKS[tb.b.t].kind;
  return ['bed', 'tree', 'hedge'].includes(k) ? 'farm' : ['tank', 'pump', 'pond', 'media', 'plant', 'settle'].includes(k) ? 'water' : ['roof', 'pillar', 'pv', 'coop', 'heap'].includes(k) ? 'gear' : null;
}
function open3D(cx, cy, cat, o3 = {}) { openBuild(cx, cy, { ...o3, cat }); }
function openHouse() { const [x, y] = houseCenter(); openBuild(x, y, { cat: 'house' }); }
function openBuild(cx, cy, o = {}) {
  const base = G.s.world, dw = clone(base), ds = { world: dw, cash: G.s.cash, turn: G.s.turn };
  const ov = document.createElement('div'); ov.className = 'iso3d';
  ov.innerHTML = `<div class="iso-in" role="dialog" aria-modal="true" aria-label="設計図">
    <div class="iso-stage"><canvas id="isoc"></canvas><div class="tilt" aria-hidden="true"></div><canvas id="isomini" class="iso-mini" aria-label="全体の地図。枠がいま見ている場所。押すとそこへ移動"></canvas>
      <div class="iso-views" role="group" aria-label="見え方"><button data-view="up" class="on" title="屋根までできあがった姿">できあがり</button><button data-view="cut" title="手前の壁だけ下げて、中と奥の壁を見る">中を見る</button><button data-view="down" title="壁を全部低くして、床と家具を見る">壁を下げる</button><button data-view="top" title="真上から（北が上、等高線つき）">真上から</button><button data-sun="1" class="sun"></button></div>
      <div class="iso-nav"><button class="btn" data-nav="rl" aria-label="左に回す">↺</button><button class="btn" data-nav="rr" aria-label="右に回す">↻</button><button class="btn" data-nav="zi" aria-label="拡大">＋</button><button class="btn" data-nav="zo" aria-label="縮小">−</button>
      <button class="btn" data-nav="u" aria-label="奥へ">↑</button><button class="btn" data-nav="d" aria-label="手前へ">↓</button><button class="btn" data-nav="l" aria-label="左へ">←</button><button class="btn" data-nav="r" aria-label="右へ">→</button></div>
      <div class="iso-tip" id="isotip"></div></div>
    <aside class="iso-side" id="isoside"></aside></div>`;
  document.body.appendChild(ov);
  const st = { cat: null, view: 'up', tool: null, msg: '', drag: null, sel: -1, spot: [cx, cy], dw, ds, undo: [], confirm: false };
  st.base = dw.house; st.draft = st.base ? E.W.cloneHouse(st.base) : null; st.tab = 'plan';
  const snap = () => JSON.stringify({ w: dw, cash: ds.cash, house: st.draft });
  const restore = (sn) => { const ob = JSON.parse(sn); for (const k of Object.keys(dw)) delete dw[k]; Object.assign(dw, ob.w); ds.cash = ob.cash; st.draft = ob.house; };
  st.origin = snap(); st.baseW = JSON.stringify(dw);
  st.houseDirty = () => !!st.draft && JSON.stringify(st.draft) !== JSON.stringify(st.base);
  st.worldDirty = () => JSON.stringify(dw) !== st.baseW;
  st.dirty = () => st.houseDirty() || st.worldDirty();
  st.edit = (fn) => { const before = snap(); const r = fn(st.draft); if (snap() !== before) st.undo.push(before); return r; };
  st.doUndo = () => { if (!st.undo.length) return; restore(st.undo.pop()); st.msg = ''; st.sel = -1; v.furnGhost = null; redraw(); };
  st.reset = () => { if (!st.dirty()) return; st.undo.push(snap()); restore(st.origin); st.msg = '設計をいまの姿に戻した'; st.sel = -1; v.furnGhost = null; redraw(); };
  st.commit = () => {
    const before = G.s.cash, hd = st.houseDirty();
    const trial = snap();
    if (hd) { const err = E.W.buildHouse(ds, st.draft); if (err) { restore(trial); st.msg = err; redraw(); return; } }
    const fresh = clone(dw); for (const k of Object.keys(G.s.world)) delete G.s.world[k]; Object.assign(G.s.world, fresh);
    G.s.cash = ds.cash;
    st.base = dw.house; st.draft = st.base ? E.W.cloneHouse(st.base) : null; st.undo = []; st.origin = snap(); st.baseW = JSON.stringify(dw);
    st.msg = `頼んだ！ ${Math.round(before - G.s.cash)}万円（人件費は近所の職人さんに）`; persist(); redraw();
  };
  const site = E.SITES[G.s.site], month = G.s.q * 3 + 2;
  const v = createView(document.getElementById('isoc'), dw, { cx, cy, R: 8, lat: site.lat, month }); G.view = v; G.build = st; G.house = st;
  const sunBtn = ov.querySelector('[data-sun]');
  const sunLabel = () => { const sv = v.sun; sunBtn.textContent = `☀ ${v.hour}時 · ${dirName(sv.az)}から${Math.round(sv.elev)}°`; sunBtn.title = `${month}月の${v.hour}時の日差し。押すと時刻が変わる（8・10・12・14・16時）`; };
  sunBtn.onclick = () => { const hs = [8, 10, 12, 14, 16]; v.setSun(null, null, hs[(hs.indexOf(v.hour) + 1) % hs.length]); sunLabel(); v.draw(); };
  sunLabel();
  const mini = document.getElementById('isomini'), tip = document.getElementById('isotip'), cv = document.getElementById('isoc');
  const setView = (vw) => {
    const wasTop = v.top; st.view = vw; v.top = vw === 'top'; v.wallMode = vw === 'top' ? 'down' : vw;
    if (v.top && !wasTop) { st.angle3d = v.angle; v.angle = 0; } else if (!v.top && wasTop) v.angle = st.angle3d ?? v.angle;
    ov.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x.dataset.view === vw));
  };
  const redraw = () => { v.house = st.draft; v.base = st.base; v.baseWorld = base; v.selFurn = st.cat === 'house' ? st.sel : -1; v.draw(); miniMap(mini, dw, v); renderBuildSide(st); };
  st.redraw = redraw;
  st.setCat = (cat) => {
    st.cat = cat; st.msg = ''; st.sel = -1; st.drag = null; st.held = null; v.rect = null; v.ghost = null; v.ghostEdge = null; v.furnGhost = null;
    if (cat === 'house') {
      st.tool = st.tab === 'open' ? 'window' : st.tab === 'furn' ? 'furn' : st.tab === 'plan' ? 'add' : null;
      const [hx, hy] = houseCenter(); v.cx = hx; v.cy = hy; v.R = 7; v.zoom = 1.25; if (!v.top) v.angle = houseAngle(st.base); if (st.view === 'up') setView('cut');
    } else {
      v.R = 8; st.tool = cat ? (TOOLS[cat].find(t => knownTech(toolLearn(t)))?.id || 'erase') : null;
      if (st.view === 'cut' || st.view === 'down') setView('up');
    }
    redraw();
  };
  const close = (force) => {
    if (!force && st.dirty()) { st.confirm = true; renderBuildSide(st); return; }
    cancelAnimationFrame(v.anim); ov.remove(); window.removeEventListener('resize', onR); document.removeEventListener('keydown', onKey); G.house = null; G.build = null; persist(); renderAll();
  };
  st.close = close;
  const onR = () => { v.size(); v.draw(); miniMap(mini, dw, v); }; window.addEventListener('resize', onR);
  const onKey = (e) => {
    if (e.key === 'Escape') { if (st.sel >= 0) { st.dropHeld(); return; } if (st.held) { st.held = null; renderBuildSide(st); return; } close(); }
    if (e.key === 'q') v.rotate(-1); if (e.key === 'e') v.rotate(1);
    if ((e.key === 'r' || e.key === 'R') && st.cat === 'house') { if (st.sel >= 0) st.rotateHeld(); else if (st.hoverFurn != null) st.rotateInPlace(st.hoverFurn); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { st.doUndo(); e.preventDefault(); }
  };
  document.addEventListener('keydown', onKey);
  // 家具：持ち上げる → 床を押して置く。持っている間は［回す］・Rキー・右クリックで向きを変える
  st.updateGhost = () => {
    if (st.sel < 0 || !st.hoverC) { v.furnGhost = null; return; }
    const fu = { ...st.draft.furn[st.sel], x: st.hoverC[0], y: st.hoverC[1], r: st.selR };
    v.furnGhost = { ...fu, ok: !E.W.furnProblem(st.draft, fu, st.sel) };
  };
  st.pickUp = (i) => { st.tab = 'furn'; st.tool = 'furn'; st.sel = i; st.selR = st.draft.furn[i].r || 0; st.hoverC = E.W.furnCells(st.draft.furn[i])[0]; st.updateGhost(); st.msg = `${E.W.FURN[st.draft.furn[i].t].name}を持っている。置きたい床を押す（向きは［回す］かRキー・右クリック）`; redraw(); };
  st.rotateHeld = () => { st.selR = (st.selR + 1) % 4; st.updateGhost(); v.draw(); renderBuildSide(st); };
  st.dropHeld = () => { st.sel = -1; v.furnGhost = null; st.msg = ''; redraw(); };
  st.rotateInPlace = (i) => { const err = st.edit(d => E.W.draftRotateFurn(d, i)); st.msg = err || `${E.W.FURN[st.draft.furn[i].t].name}を回した`; redraw(); };
  ov.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const n = b.dataset.nav;
    if (n === 'rl') v.rotate(-1); if (n === 'rr') v.rotate(1);
    if (n === 'zi') { v.zoom = Math.min(2.4, v.zoom * 1.25); v.draw(); } if (n === 'zo') { v.zoom = Math.max(0.5, v.zoom / 1.25); v.draw(); }
    if (n === 'u') v.pan(0, -1); if (n === 'd') v.pan(0, 1); if (n === 'l') v.pan(-1, 0); if (n === 'r') v.pan(1, 0);
    miniMap(mini, dw, v);
  });
  ov.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { setView(b.dataset.view); v.draw(); });
  mini.onclick = (e) => { const r = mini.getBoundingClientRect(); v.cx = Math.max(0, Math.min(49, Math.floor((e.clientX - r.left) / r.width * 50))); v.cy = Math.max(0, Math.min(49, Math.floor((e.clientY - r.top) / r.height * 50))); v.draw(); miniMap(mini, dw, v); };
  /* ---------- 押す・なぞる ---------- */
  const rectFrom = (a, b) => ({ xa: Math.min(a[0], b[0]), xb: Math.max(a[0], b[0]), ya: Math.min(a[1], b[1]), yb: Math.max(a[1], b[1]) });
  // 家
  const cellOf = (f) => !f ? null : (f.type === 'terrain' && f.face === 4) || f.type === 'floor' || f.type === 'furn' ? [f.x, f.y] : null;
  const okCell = (x, y) => !!st.draft.cells[`${x},${y}`] || !E.W.cellProblem(dw, st.draft, x, y);
  const isOpenTool = () => ['window', 'window2', 'door', 'unopen'].includes(st.tool);
  const isHouseFace = (f) => f && ['floor', 'wall', 'roof', 'furn'].includes(f.type);
  // 家のほか：押した面 → そのマス（側面でもそのマスの上）
  const cellAny = (f) => !f ? null : ['terrain', 'block', 'floor', 'furn', 'wall', 'roof', 'veg'].includes(f.type) ? [f.x, f.y] : null;
  const inDraftHouse = (x, y) => (st.draft && st.draft.cells[`${x},${y}`]) || (dw.house && dw.house.cells[`${x},${y}`]);
  const T = () => toolDef(st.cat, st.tool);
  /* 道具がねらうマス：木を切る・雨樋・動かす は指したもの。それ以外は木や家に隠れていても指した所の地面（段々の斜面でずれない）。
     ものを積む道具だけ、指したブロックの上面ならその上に */
  const aimAt = (e, f, t) => {
    if (!t || ['cut', 'gutter', 'move'].includes(t.how)) return { c: cellAny(f), f };
    if (t.how === 'point' && f && f.type === 'block' && f.face === 4 && !E.W.BLOCKS[f.b.t].overlay) return { c: [f.x, f.y], f };
    const c = v.groundAt(e.clientX, e.clientY); if (!c) return { c: cellAny(f), f };
    return { c, f: { type: 'terrain', x: c[0], y: c[1], face: 4, z: E.W.h(dw, c[0], c[1]) } };
  };
  const rectCells = (r) => { const out = []; for (let y = r.ya; y <= r.yb; y++) for (let x = r.xa; x <= r.xb; x++) out.push([x, y]); return out; };
  const pointZ = (f, x, y) => f && f.type === 'block' && f.face === 4 && f.x === x && f.y === y && !E.W.BLOCKS[f.b.t].overlay ? f.z + 1 : E.W.h(dw, x, y);
  const topAt = (x, y) => { let best = null; for (const k in dw.blocks) { const [bx, by, bz] = k.split(',').map(Number); if (bx === x && by === y && (!best || bz > best.z)) best = { x, y, z: bz, b: dw.blocks[k] }; } return best; };
  // 雨が入るか（タンク）：家（設計中）の軒から1m以内で、入口が軒より低い／小屋の屋根の隣で低い
  const feeds = (x, y, z) => {
    const hs = st.draft;
    if (hs && Object.keys(hs.cells).some(k => { const [hx, hy] = k.split(',').map(Number); return Math.max(Math.abs(hx - x), Math.abs(hy - y)) <= 1; })) return z < hs.z + E.W.HOUSE_H ? '家の屋根の雨が入る' : '軒より高いので、雨は入らない';
    for (const k in dw.blocks) { if (E.W.BLOCKS[dw.blocks[k].t].kind !== 'roof') continue; const [rx, ry, rz] = k.split(',').map(Number); if (Math.max(Math.abs(rx - x), Math.abs(ry - y)) <= 1 && z < rz) return '小屋の屋根の雨が入る'; }
    return null;
  };
  // 押したとき・なぞったときの見え方と、ひとこと
  const hoverInfo = (f) => {
    const t = T(), c = cellAny(f); if (!t || !c) return null;
    const [x, y] = c;
    if (t.how === 'point') {
      const z = pointZ(f, x, y), why = inDraftHouse(x, y) && z < (st.draft || dw.house).z + E.W.HOUSE_H ? '家の中' : E.W.canPut(dw, x, y, z, t.block);
      let say = why ? `置けない：${why}` : `${toolName(t)} · ${toolPrice(t).toFixed(1)}万円`;
      if (!why && t.block === 'tank') { const fd = feeds(x, y, z); say += fd ? ` · ✓ ${fd}` : ' · 屋根から離れていて雨は入らない'; }
      return { ghost: { ok: !why, cells: [[x, y, z, 1]] }, say };
    }
    if (t.how === 'mark') { const tb = topAt(x, y), ok = tb && E.W.BLOCKS[tb.b.t].kind === 'bed'; return { ghost: { ok, cells: [[x, y, E.W.h(dw, x, y), 0.18]] }, say: ok ? `${toolName(t)}を${tb.b[t.mark] ? '外す' : 'つける'}` : '畑の上を押す' }; }
    if (t.how === 'cell') { const g = E.W.h(dw, x, y), ok = !topAt(x, y) && !inDraftHouse(x, y); return { ghost: { ok, cells: [[x, y, g + (t.id === 'fill' ? 0 : -0.01), t.id === 'fill' ? 1 : 0.15]] }, say: ok ? `${toolName(t)} · ${toolPrice(t).toFixed(1)}万円` : '上に何かある' }; }
    if (t.how === 'erase' && !topAt(x, y) && dw.stone && dw.stone[`${x},${y}`]) return { ghost: { ok: true, cells: [[x, y, E.W.h(dw, x, y), 0.12]] }, say: '石垣を外す' };
    if (t.how === 'erase') { const tb = topAt(x, y), tree = tb && ['tree', 'hedge'].includes(E.W.BLOCKS[tb.b.t].kind) && base.blocks[`${x},${y},${tb.z}`]; return { ghost: tb ? { ok: !tree, cells: [[x, y, tb.z, 1.02]] } : null, say: !tb ? '外すものを押す' : tree ? '木は［土地・木］の［木を切る］で切る' : `${E.W.BLOCKS[tb.b.t].name}を外す` }; }
    if (t.how === 'edge') { const a = E.W.dropArea(dw, x, y), has = dw.stone && dw.stone[`${x},${y}`], g = E.W.h(dw, x, y); return { ghost: { ok: !!a && !has, cells: [[x, y, g, 0.12]] }, say: !a ? '段差のふちではない（上の段のはしを押す）' : has ? 'もう石垣がある' : `石垣 ${a}m² · ${(a * E.W.STONE_PRICE).toFixed(2)}万円${(() => { const tb = topAt(x, y); return tb && E.W.BLOCKS[tb.b.t].kind === 'bed' ? ' · ふちまで畑なので、流れ落ちる水と土が止まる' : ''; })()}` }; }
    if (t.how === 'gutter') {
      if (inDraftHouse(x, y)) { const d = st.draft; return { ghost: null, say: d.gutter ? '家にはもう雨樋がある' : `家に雨樋 · 軒${E.W.housePerimeter(d)}m · ${E.W.gutterPrice(E.W.housePerimeter(d)).toFixed(1)}万円` }; }
      const r = E.W.roofStructAt(dw, x, y); if (!r) return { ghost: null, say: '屋根を押す（家・小屋・堆肥小屋）' };
      return { ghost: null, say: r.gut ? 'もう雨樋がある（押すと外す）' : `${r.kind === 'heap' ? '堆肥小屋' : '小屋'}に雨樋 · 軒${r.perimeter}m · ${E.W.gutterPrice(r.perimeter).toFixed(1)}万円` };
    }
    if (t.how === 'move') {
      if (!st.held) { const tb = topAt(x, y), ok = tb && E.W.MOVABLE.includes(E.W.BLOCKS[tb.b.t].kind); return { ghost: tb ? { ok, cells: [[x, y, tb.z, 1.02]] } : null, say: !tb ? '動かすものを押す' : ok ? `${E.W.BLOCKS[tb.b.t].name}を持ち上げる` : 'これは動かせない' }; }
      const b = dw.blocks[st.held.join(',')], z = pointZ(f, x, y); delete dw.blocks[st.held.join(',')];
      const why = (x === st.held[0] && y === st.held[1] && z === st.held[2]) ? null : E.W.canPut(dw, x, y, z, b.t); dw.blocks[st.held.join(',')] = b;
      let say = why ? `置けない：${why}` : `ここへ動かす · ${E.W.MOVE_PRICE}万円`; if (!why && b.t === 'tank') { const fd = feeds(x, y, z); if (fd) say += ` · ✓ ${fd}`; }
      return { ghost: { ok: !why, cells: [[x, y, z, 1]] }, say };
    }
    if (t.how === 'cut') { const ci = E.W.cutInfo(dw, x, y), g = E.W.h(dw, x, y); return { ghost: ci ? { ok: true, cells: [[x, y, g, 0.2]] } : null, say: ci ? `${ci.name}を切る · ${ci.cost.toFixed(1)}万円 · 薪と材 ${ci.wood}m³` : '切る木がない（木の根元を押す）' }; }
    if (t.how === 'area') { const g = E.W.h(dw, x, y); return { ghost: { ok: !inDraftHouse(x, y), cells: [[x, y, g, 0.12]] }, say: `なぞって四角を決める（${toolName(t)}）` }; }
    return null;
  };
  // なぞった四角に作る
  const areaOk = (t) => (x, y) => !inDraftHouse(x, y) && (t.id === 'beds' || t.id === 'heap' ? !E.W.canPut(dw, x, y, E.W.h(dw, x, y), t.block) : t.id === 'pond' || t.id === 'filter' ? !topAt(x, y) : true);
  const applyArea = (t, a, b) => {
    const r = rectFrom(a, b);
    for (let y = r.ya; y <= r.yb; y++) for (let x = r.xa; x <= r.xb; x++) if (inDraftHouse(x, y)) return '家（設計中）と重なる';
    if (t.id === 'beds') return E.W.prefabBeds(ds, a, b, 'hire');
    if (t.id === 'heap') return E.W.prefabBays(ds, a, b, 'hire');
    if (t.id === 'pond') return E.W.prefabPit(ds, a, b, 'pond', 'hire', 1);
    if (t.id === 'filter') return E.W.prefabPit(ds, a, b, MAT.media, 'hire', 1, MAT.plant);
    if (t.id === 'shed') return E.W.prefabShed(ds, a, b, MAT.roof, 'hire');
    if (t.id === 'level') return E.W.prefabLevel(ds, a, b, 'hire');
    return null;
  };
  // この設計で置いたものを外すときは、払った分を戻す（取り消し）
  const unput = (x, y, z) => {
    const k = `${x},${y},${z}`, bk = dw.blocks[k]; if (!bk) return '何もない';
    const fresh = !base.blocks[k] || base.blocks[k].t !== bk.t;
    const err = E.W.remove(ds, x, y, z, fresh); if (err) return err;
    if (fresh) { const d = E.W.BLOCKS[bk.t], pr = E.W.blockPrice(bk.t, 'hire'); ds.cash += pr; dw.spent.local -= (d.local ? d.cost : 0) + d.labor * 1.5; dw.spent.far -= d.local ? 0 : d.cost; }
    if (dw.veg && base.veg && !topAt(x, y)) dw.veg[y * 50 + x] = base.veg[y * 50 + x];
    return null;
  };
  const applyAt = (t, f, x, y, state) => {
    if (t.how === 'point') { const z = pointZ(f, x, y); if (inDraftHouse(x, y) && z < (st.draft || dw.house).z + E.W.HOUSE_H) return '家の中'; return E.W.put(ds, x, y, z, t.block, 'hire'); }
    if (t.how === 'mark') {
      const tb = topAt(x, y); if (!tb || E.W.BLOCKS[tb.b.t].kind !== 'bed') return '畑の上をなぞる';
      if (state.want == null) state.want = !tb.b[t.mark];
      if (!!tb.b[t.mark] === state.want) return null;
      return E.W.toggleMark(ds, x, y, tb.z, t.mark);
    }
    if (t.how === 'cell') { if (inDraftHouse(x, y)) return '家の下は掘れない'; return t.id === 'dig' ? E.W.dig(ds, x, y, 'hire') : E.W.fill(ds, x, y, 'hire'); }
    if (t.how === 'erase') {
      const tb = topAt(x, y); if (tb) return unput(x, y, tb.z);
      const k = `${x},${y}`; if (dw.stone && dw.stone[k]) { if (!(base.stone && base.stone[k])) ds.cash += E.W.dropArea(dw, x, y) * E.W.STONE_PRICE; delete dw.stone[k]; return null; }
      return null;
    }
    if (t.how === 'cut') return E.W.cutTree(ds, x, y);
    if (t.how === 'edge') return E.W.buildStone(ds, x, y);
    if (t.how === 'gutter') {
      if (inDraftHouse(x, y)) { if (st.draft.gutter) return '家にはもう雨樋がある'; st.draft.gutter = true; return null; }
      const r = E.W.roofStructAt(dw, x, y); if (!r) return '屋根を押す（家・小屋・堆肥小屋）';
      if (r.gut) { const fresh = !r.blocks.every(b2 => base.blocks[`${b2.x},${b2.y},${b2.z}`]?.gut); for (const b2 of r.blocks) delete dw.blocks[`${b2.x},${b2.y},${b2.z}`].gut; if (fresh) ds.cash += E.W.gutterPrice(r.perimeter); return null; }
      return E.W.buildGutter(ds, x, y);
    }
    if (t.how === 'move') {
      if (!st.held) { const tb = topAt(x, y); if (!tb) return '動かすものを押す'; if (!E.W.MOVABLE.includes(E.W.BLOCKS[tb.b.t].kind)) return 'これは動かせない'; st.held = [x, y, tb.z]; st.msg = ''; return null; }
      const z = pointZ(f, x, y), from = st.held; if (x === from[0] && y === from[1] && z === from[2]) { st.held = null; return null; }
      if (inDraftHouse(x, y)) return '家の中';
      const err = E.W.moveBlock(ds, from, [x, y, z]); if (!err) st.held = null; return err;
    }
    return null;
  };
  cv.style.touchAction = 'none';
  cv.addEventListener('contextmenu', (e) => { if (st.cat === 'house' && st.sel >= 0) { e.preventDefault(); st.rotateHeld(); } });
  cv.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    const f0 = v.pickAt(e.clientX, e.clientY);
    if (st.cat === 'house') {
      if (f0 && f0.type === 'furn' && st.sel < 0 && !isOpenTool()) { st.pickUp(f0.i); st.justPicked = true; return; }
      if (!['add', 'remove'].includes(st.tool)) return;
      const c = cellOf(f0); if (!c) return;
      st.drag = { a: c, b: c }; cv.setPointerCapture(e.pointerId);
      v.rect = { ...rectFrom(c, c), mode: st.tool === 'remove' ? 'remove' : 'add', ok: okCell, house: true }; v.draw();
      return;
    }
    const t = T(), A = aimAt(e, f0, t), c = A.c; if (!t || !c) return;
    st.drag = { a: c, b: c, f: A.f, path: [c], seen: new Set([String(c)]) }; cv.setPointerCapture(e.pointerId);
    v.aim = [c];
    if (t.how === 'area') { v.rect = { ...rectFrom(c, c), mode: 'add', ok: areaOk(t) }; v.ghost = null; v.draw(); }
  });
  cv.addEventListener('pointermove', (e) => {
    const f = v.pickAt(e.clientX, e.clientY);
    const hc = f && ['terrain', 'floor', 'block', 'furn', 'veg'].includes(f.type) ? [f.x, f.y] : null, moved = String(hc) !== String(v.hoverCell);
    v.hoverCell = hc;
    if (!st.cat) { tip.textContent = f ? describeFace(f) : ''; cv.style.cursor = isHouseFace(f) ? 'pointer' : 'default'; if (moved) v.draw(); return; }
    cv.style.cursor = 'crosshair';
    if (st.cat !== 'house') {
      const t = T(); if (!t) return;
      const A = aimAt(e, f, t);
      if (st.drag) {
        const c = A.c; if (!c) return; st.drag.b = c;
        if (t.how === 'area') { const r = rectFrom(st.drag.a, c), n = (r.xb - r.xa + 1) * (r.yb - r.ya + 1), pr = toolPrice(t); v.rect = { ...r, mode: 'add', ok: areaOk(t) }; v.aim = rectCells(r); tip.textContent = `${toolName(t)} ${r.xb - r.xa + 1}×${r.yb - r.ya + 1}m${pr != null ? ` · 約${(n * pr).toFixed(1)}万円` : ''}`; v.draw(); return; }
        if (!st.drag.seen.has(String(c))) { st.drag.seen.add(String(c)); st.drag.path.push(c); }
        v.aim = st.drag.path;
        v.ghost = { ok: true, cells: st.drag.path.map(([x, y]) => [x, y, E.W.h(dw, x, y), t.how === 'point' ? 1 : t.how === 'cut' ? 0.2 : 0.15]) };
        tip.textContent = `${toolName(t)} ×${st.drag.path.length}${toolPrice(t) ? ` · 約${(st.drag.path.length * toolPrice(t)).toFixed(1)}万円` : ''}`; v.draw(); return;
      }
      const hi = hoverInfo(A.f); v.ghost = hi ? hi.ghost : null; v.aim = A.c ? [A.c] : null; tip.textContent = hi ? hi.say : A.f ? describeFace(A.f) : ''; v.draw(); return;
    }
    tip.textContent = f ? describeFace(f) : '';
    if (st.drag) { const c = cellOf(f); if (c) { st.drag.b = c; v.rect = { ...rectFrom(st.drag.a, c), mode: st.tool === 'remove' ? 'remove' : 'add', ok: okCell, house: true }; v.draw(); } return; }
    if (isOpenTool()) { v.ghostEdge = f && f.type === 'wall' ? { e: f.e, t: st.tool === 'unopen' ? 'remove' : st.tool, low: v.wallMode !== 'up' } : null; v.draw(); return; }
    st.hoverFurn = f && f.type === 'furn' ? f.i : null;
    if (st.tool === 'furn') { const c = cellOf(f); if (c) st.hoverC = c; st.updateGhost(); cv.style.cursor = st.sel >= 0 ? 'grabbing' : st.hoverFurn != null ? 'grab' : 'default'; v.draw(); return; }
    const c = cellOf(f); v.rect = c && ['add', 'remove'].includes(st.tool) ? { ...rectFrom(c, c), mode: st.tool === 'remove' ? 'remove' : 'add', ok: okCell, house: true } : null; v.draw();
  });
  cv.addEventListener('pointerleave', () => { if (!st.drag) { v.rect = null; v.ghostEdge = null; v.ghost = null; v.hoverCell = null; v.aim = null; v.draw(); tip.textContent = ''; } });
  cv.addEventListener('pointerup', (e) => {
    const f = v.pickAt(e.clientX, e.clientY);
    if (!st.cat) { if (isHouseFace(f)) { st.tab = 'plan'; st.setCat('house'); } return; }
    if (st.cat !== 'house') {
      const t = T(), dr = st.drag; st.drag = null; v.rect = null; v.ghost = null; v.aim = null;
      if (!t || !dr) return;
      const before = snap(); let err = null, n = 0;
      if (t.how === 'area') err = applyArea(t, dr.a, dr.b);
      else if (t.how === 'move' || t.how === 'gutter') { const r = applyAt(t, f || dr.f, dr.b[0], dr.b[1], {}); if (r) err = r; else n++; }
      else { const state = {}, f1 = dr.path.length === 1 ? aimAt(e, f, t).f || dr.f : null; for (const [x, y] of dr.path) { const r = applyAt(t, f1, x, y, state); if (r) err = err || r; else n++; } }
      if (snap() !== before) { st.undo.push(before); st.msg = err && n ? `一部は${err}` : ''; } else st.msg = err || '';
      redraw(); return;
    }
    if (isOpenTool()) {
      if (f && f.type === 'wall') { const t = st.tool === 'unopen' ? null : st.tool; st.msg = st.edit(d => E.W.draftSetOpening(d, f.e, t)) || ''; }
      else st.msg = '家の外壁を押してください';
      v.ghostEdge = null; redraw(); return;
    }
    if (e.button === 2) return;
    if (st.justPicked) { st.justPicked = false; return; }
    if (st.tool === 'furn') {
      if (st.sel < 0) { if (f && f.type === 'furn') st.pickUp(f.i); else { st.msg = '動かしたい家具を押す'; redraw(); } return; }
      const c = cellOf(f); if (!c) return;
      const i = st.sel, err = st.edit(d => E.W.draftMoveFurn(d, i, c[0], c[1], st.selR));
      if (err) st.msg = `置けない：${err}`; else { st.msg = '置いた'; st.sel = -1; v.furnGhost = null; }
      redraw(); return;
    }
    if (!st.drag) return;
    const { xa, xb, ya, yb } = rectFrom(st.drag.a, st.drag.b); st.drag = null; v.rect = null;
    if (st.tool === 'remove') { const r = st.edit(d => E.W.draftRemoveRect(d, xa, ya, xb, yb)); st.msg = r.removed ? `床を${r.removed}m²減らした` : 'そこに床はない'; }
    else {
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (!st.draft.cells[`${x},${y}`] && topAt(x, y)) { st.msg = 'ほかのもの（畑やタンク）と重なる。先に外す'; redraw(); return; }
      const r = st.edit(d => E.W.draftAddRect(dw, d, xa, ya, xb, yb)); const why = Object.entries(r.why).map(([k, n]) => `${k}（${n}マス）`).join('・'); st.msg = (r.added ? `床を${r.added}m²足した` : '床を足せなかった') + (why ? `。置けない所：${why}` : '');
    }
    redraw();
  });
  v.size();
  st.setCat(o.cat ?? catAt(dw, cx, cy));
}
function miniMap(cv, w, v) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), size = cv.getBoundingClientRect().width || 150;
  cv.width = size * dpr; cv.height = size * dpr;
  const ctx = cv.getContext('2d'), c = cv.width / 50;
  paintPlot(ctx, w, 0, c, dpr, false);
  ctx.strokeStyle = '#C2410C'; ctx.lineWidth = 2.5 * dpr; ctx.strokeRect((v.cx - v.R) * c, (v.cy - v.R) * c, (2 * v.R + 1) * c, (2 * v.R + 1) * c);
  ctx.fillStyle = 'rgba(31,42,46,.8)'; ctx.font = `${10 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillText('↑北', 3 * dpr, 12 * dpr);
}
function describeFace(f) {
  const w = G.view?.world || G.s.world, hs = G.house ? G.house.draft : w.house;
  if (f.type === 'terrain') return `地面 · 標高 ${f.z + 1 + w.base}m${w.H0[f.y * 50 + f.x] - 1 > f.z ? '（掘った穴）' : ''}${w.veg ? ' · ' + E.W.VEG_NAME[w.veg[f.y * 50 + f.x]] : ''}`;
  if (f.type === 'wall') return f.op ? `${E.W.OPENINGS[f.op].name}（${E.W.WALLS[hs.wall].name}）` : E.W.WALLS[hs.wall].name;
  if (f.type === 'floor') return `${E.W.FLOORS[hs.floor].name} · 床の段 ${w.base + hs.z}m`;
  if (f.type === 'roof') return E.W.ROOFS[hs.roof].name;
  if (f.type === 'furn') return E.W.FURN[hs.furn[f.i].t].name;
  if (f.type === 'block') { const d = E.W.BLOCKS[f.b.t]; return `${d.name} · 高さ ${f.z + w.base}m`; }
  if (f.type === 'veg') return `${E.W.CUT[f.kind].name}${f.kind === 'shrub' ? '' : 'の木'}（切らないと、ここには何も作れない）`;
  return '';
}
/* 設計で変わること（下書きの世界といまの世界の差）。値段は目安 */
function draftLines(base, dw) {
  const add = {}, rem = {}, marks = { s: 0, m: 0, g: 0 };
  for (const k in dw.blocks) { const b = dw.blocks[k], o = base.blocks[k]; if (!o || o.t !== b.t) add[b.t] = (add[b.t] || 0) + 1; else for (const m of ['s', 'm', 'g']) if (b[m] && !o[m]) marks[m]++; }
  for (const k in base.blocks) { const o = base.blocks[k], b = dw.blocks[k]; if (!b || b.t !== o.t) rem[o.t] = (rem[o.t] || 0) + 1; }
  let dig = 0, fil = 0; for (let i = 0; i < dw.H.length; i++) { const d = dw.H[i] - base.H[i]; if (d < 0) dig -= d; if (d > 0) fil += d; }
  const moved = {}; for (const t in add) if (rem[t] && E.W.MOVABLE.includes(E.W.BLOCKS[t].kind)) { const n = Math.min(add[t], rem[t]); moved[t] = n; add[t] -= n; rem[t] -= n; if (!add[t]) delete add[t]; if (!rem[t]) delete rem[t]; }
  let gutM = 0; const seenG = new Set();
  for (const k in dw.blocks) { const b = dw.blocks[k]; if (!b.gut || (base.blocks[k] && base.blocks[k].gut) || seenG.has(k)) continue; const [x, y] = k.split(',').map(Number), r = E.W.roofStructAt(dw, x, y); if (!r) continue; r.blocks.forEach(q => seenG.add(`${q.x},${q.y},${q.z}`)); gutM += r.perimeter; }
  const lines = [], unit = (t) => E.W.BLOCKS[t].overlay || E.W.BLOCKS[t].pit || E.W.BLOCKS[t].kind === 'roof' ? 'm²' : 'つ';
  for (const [t, n] of Object.entries(moved)) lines.push({ label: `動かす：${E.W.BLOCKS[t].name} ${n}つ`, cost: n * E.W.MOVE_PRICE });
  if (gutM) lines.push({ label: `雨樋 ＋${gutM}m`, cost: gutM * E.W.GUTTER_PRICE + E.W.DOWNPIPE_PRICE });
  for (const [t, n] of Object.entries(add)) lines.push({ label: `${E.W.BLOCKS[t].name} ＋${n}${unit(t)}`, cost: n * E.W.blockPrice(t, 'hire') });
  let sa = 0, sr = 0; for (const k in (dw.stone || {})) if (!(base.stone && base.stone[k])) { const [x, y] = k.split(',').map(Number); sa += E.W.dropArea(dw, x, y); }
  for (const k in (base.stone || {})) if (!(dw.stone && dw.stone[k])) sr++;
  if (sa) lines.push({ label: `石垣 ＋${sa}m²`, cost: sa * E.W.STONE_PRICE });
  if (sr) lines.push({ label: `外す：石垣 ${sr}か所`, cost: 0 });
  const MK = { s: ['石垣', 0.15], m: ['マルチ', 0.01], g: ['温室の覆い', 1.2] };
  for (const m of ['s', 'm', 'g']) if (marks[m]) lines.push({ label: `${MK[m][0]} ＋${marks[m]}m²`, cost: marks[m] * MK[m][1] });
  if (dig) lines.push({ label: `掘る ${dig}m³`, cost: dig * E.W.DIG_LABOR * 1.5 });
  if (fil) lines.push({ label: `盛る ${fil}m³`, cost: fil * E.W.FILL_LABOR * 1.5 });
  for (const [t, n] of Object.entries(rem)) if (!['tree', 'hedge'].includes(E.W.BLOCKS[t].kind)) lines.push({ label: `外す：${E.W.BLOCKS[t].name} ${n}${unit(t)}`, cost: 0 });
  // 木を切る：林の木・茂みと、植えた果樹・生け垣
  const now = new Set(E.W.vegObjects(dw).map(o => o.cx + ',' + o.cy)), cut = {};
  for (const o of E.W.vegObjects(base)) if (!now.has(o.cx + ',' + o.cy)) cut[o.kind] = (cut[o.kind] || 0) + 1;
  for (const t of ['tree', 'hedge']) if (rem[t]) cut[t] = (cut[t] || 0) + rem[t];
  const wood = (dw.wood || 0) - (base.wood || 0);
  for (const [k, n] of Object.entries(cut)) lines.push({ label: `木を切る：${E.W.CUT[k].name} ${n}本`, cost: n * E.W.CUT[k].cost });
  if (wood > 0.005) lines.push({ label: `とっておく薪と材 ＋${wood.toFixed(1)}m³`, cost: 0 });
  return lines;
}
/* ---------- 右（スマホでは下）の設計図の板 ---------- */
function renderBuildSide(st) {
  const s = G.s, el = document.getElementById('isoside'); if (!el) return;
  const cats = `<div class="cats" role="tablist" aria-label="作るもの">${CATS.map(([k, n]) => `<button role="tab" class="${st.cat === k ? 'on' : ''}" aria-selected="${st.cat === k}" data-cat="${k}" ${k === 'house' && !st.draft ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;
  let body = '';
  if (!st.cat) body = `<p class="small">上の［家・畑・水・小屋と設備・地形］から、作るものを選ぶ。3Dの家を押すと家の設計に入る。<br>設計図の上ではお金はかからない。下の［この設計で頼む］で、近所の職人さんが作る。</p>`;
  else if (st.cat === 'house') body = houseBody(st);
  else body = trayBody(st);
  el.innerHTML = `<header><h2>設計図</h2><button class="btn ghost" id="isox">地図に戻る</button></header>
    ${cats}<div class="h-body">${body}</div>
    ${st.msg ? `<div class="iso-msg">${esc(st.msg)}</div>` : ''}
    ${estimateBody(st)}`;
  el.querySelector('#isox').onclick = () => st.close();
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => st.setCat(b.dataset.cat));
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'undo') st.doUndo();
    if (a === 'reset') st.reset();
    if (a === 'build') st.commit();
    if (a === 'keep') { st.confirm = false; renderBuildSide(st); }
    if (a === 'discard') { st.confirm = false; st.close(true); }
  });
  if (st.cat === 'house') bindHouse(st, el);
  else if (st.cat) {
    el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { st.tool = b.dataset.tool; st.held = null; st.msg = ''; G.view.ghost = null; renderBuildSide(st); });
    el.querySelectorAll('[data-hcancel]').forEach(b => b.onclick = () => { st.held = null; st.msg = ''; renderBuildSide(st); });
    el.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => { const [k, t] = b.dataset.mat.split(':'); MAT[k] = t; renderBuildSide(st); });
    el.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { st.edit(() => { st.dw.mods.out = b.dataset.out; }); st.redraw(); });
  }
}
function trayBody(st) {
  const all = TOOLS[st.cat], known = all.filter(t => knownTech(toolLearn(t))), hidden = all.length - known.length, t = toolDef(st.cat, st.tool);
  const how = { area: 'なぞる', point: '押す・なぞると並べる', mark: '畑を押す・なぞる', cell: '押す・なぞる', erase: '押す・なぞる', cut: '木を押す・なぞる', edge: '段のふちをなぞる', gutter: '屋根を押す', move: '押して、置く所を押す' };
  const card = (tl) => { const pr = toolPrice(tl), col = tl.color || (tl.block ? E.W.BLOCKS[tl.block].color : '#D9534F'); return `<button class="tcard${st.tool === tl.id ? ' on' : ''}" data-tool="${tl.id}" aria-pressed="${st.tool === tl.id}"><i class="sw" style="background:${col}"></i><span><b>${esc(toolName(tl))}</b><span class="how">${how[tl.how]}</span></span><span class="pr">${pr ? `${pr.toFixed(pr < 1 ? 2 : 1)}<small>万円/${toolUnit(tl)}</small>` : ''}</span></button>`; };
  let opts = '';
  if (st.tool === 'filter') opts = `<div class="seg"><div class="seg-h"><b>入れる層</b></div><div class="seg-o">${['media_gravel', 'media_sand', 'media_char'].map(k => `<button class="opt${MAT.media === k ? ' on' : ''}" data-mat="media:${k}">${esc(E.W.BLOCKS[k].name)}</button>`).join('')}</div><div class="seg-h"><b>植える草</b></div><div class="seg-o">${['plant_reed', 'plant_canna'].map(k => `<button class="opt${MAT.plant === k ? ' on' : ''}" data-mat="plant:${k}">${esc(E.W.BLOCKS[k].name)}</button>`).join('')}</div></div>`;
  if (st.cat === 'water') { const S = E.summarize({ ...G.s, world: st.dw }); if (S.filter) opts += `<div class="seg"><div class="seg-h"><b>きれいになった水の行き先</b></div><div class="seg-o">${Object.entries(E.B.OUTS).map(([k, o]) => `<button class="opt${st.dw.mods.out === k ? ' on' : ''}" data-out="${k}">${o.name}</button>`).join('')}</div></div>`; }
  if (st.cat === 'land' && (st.dw.wood || 0) > 0.005) opts += `<p class="small">とってある木：${st.dw.wood.toFixed(1)}m³（堆肥のチップに使い、残りは${st.draft && st.draft.stove ? 'かまどの薪に' : '薪に。［家］の素材で「薪のかまど」をつけると使える'}）</p>`;
  const mv = ['water', 'gear'].includes(st.cat) ? card(MOVE) : '';
  if (st.held) opts += `<div class="held"><span>持っている：<b>${esc(E.W.BLOCKS[st.dw.blocks[st.held.join(',')]?.t]?.name || '')}</b>。置きたい所を押す</span><button class="btn ghost" data-hcancel="1">やめる</button></div>`;
  return `<div class="tcards">${known.map(card).join('')}${mv}${card(ERASE)}</div>
    ${t ? `<p class="small tnote">${esc(t.note)}</p>` : ''}${opts}
    ${hidden ? `<p class="small muted">まだ知らない作り方が、あと${hidden}つ。困りごとや図鑑から覚える。</p>` : ''}`;
}
function houseBody(st) {
  const s = G.s, d = st.draft, tabs = [['plan', '間取り'], ['open', '窓と扉'], ['mat', '素材'], ['furn', '家具']];
  let body = '';
  if (st.tab === 'plan') body = `
    <div class="seg-o"><button class="opt${st.tool === 'add' ? ' on' : ''}" data-htool="add">床を広げる</button><button class="opt${st.tool === 'remove' ? ' on' : ''}" data-htool="remove">床を減らす</button></div>
    <p class="small">${st.tool === 'add' ? '地面をなぞると、その四角が床になる（いまの床につながる所だけ）。1段ちがう地面は、掘るか盛ってそろえる。家の裏が見えないときは［真上から］。' : '床をなぞると、その四角を減らす。'}</p>
    <div class="rows"><span>床の広さ</span><b class="num">${Object.keys(st.base.cells).length}m²${Object.keys(d.cells).length !== Object.keys(st.base.cells).length ? ` → ${Object.keys(d.cells).length}m²` : ''}</b><span>高さ</span><b class="num">3m（床の段 ${d.z + s.world.base}m）</b></div>`;
  if (st.tab === 'open') body = `
    <p class="small">選んでから、家の外壁を押す。窓は日の来る側に向けると、寒い日に暖かい。</p>
    <div class="mcards">${Object.entries(E.W.OPENINGS).map(([k, O]) => matCard('htool', k, O, st.tool === k)).join('')}
      <button class="mcard small${st.tool === 'unopen' ? ' on' : ''}" data-htool="unopen"><i class="swatch" style="--c:#D9534F"></i><span class="mc-b"><b>外す</b><span class="note">窓や扉を押すと、ふつうの壁に戻す</span></span></button></div>`;
  if (st.tab === 'furn') {
    const groups = [['toilet', 'トイレ'], ['shower', 'シャワー'], ['bed', 'ベッド'], ['table', 'テーブルと椅子'], ['stove', '薪のかまど']];
    body = `<p class="small">3Dの家具を押すと持ち上がり、床を押すとそこに置く。持っている間は［回す］・Rキー・右クリックで向きが変わる。</p>
      ${st.sel >= 0 ? `<div class="held"><span>持っている：<b>${esc(E.W.FURN[d.furn[st.sel].t].name)}</b>（${['北', '西', '南', '東'][st.selR]}が奥）</span><button class="btn" data-frot="1">↻ 回す（R）</button><button class="btn ghost" data-fcancel="1">置くのをやめる</button></div>` : ''}
      ${groups.map(([g, gname]) => {
        const i = d.furn.findIndex(f => E.W.FURN[f.t].group === g); if (i < 0) return '';
        const kinds = Object.entries(E.W.FURN).filter(([, F]) => F.group === g && knownTech(F.learn));
        return `<h3>${gname} <button class="opt mini" data-fmove="${i}">${st.sel === i ? '持っている' : '動かす'}</button><button class="opt mini" data-frotin="${i}">↻ 回す</button></h3>
          ${kinds.length > 1 ? `<div class="mcards">${kinds.map(([k, F]) => `<button class="mcard${d.furn[i].t === k ? ' on' : ''}" data-fswap="${i}:${k}"><i class="swatch" style="--c:${F.color}"></i><span class="mc-b"><b>${esc(F.name)}</b><span class="note">${esc(F.note)}</span></span><span class="price">${F.cost}<small>万円</small></span></button>`).join('')}</div>` : `<p class="small" style="margin:0">${esc(E.W.FURN[d.furn[i].t].note)}</p>`}`;
      }).join('')}`;
  }
  if (st.tab === 'mat') body = `
    <h3>壁 <span class="small">家全体の壁を、この素材で張る</span></h3><div class="mcards">${Object.entries(E.W.WALLS).map(([k, M]) => matCard('wall', k, M, d.wall === k)).join('')}</div>
    <h3>屋根 <span class="small">雨を集める面にもなる</span></h3><div class="mcards">${Object.entries(E.W.ROOFS).map(([k, M]) => matCard('roof', k, M, d.roof === k)).join('')}</div>
    <h3>屋根の形 <span class="small">傾けると雨と雪が1つの向きに落ちる。雨樋とタンクはその軒に</span></h3>
    <div class="seg-o">${Object.entries(E.W.ROOF_SHAPES).map(([k, n]) => `<button class="opt${(d.roofShape || 'flat') === k ? ' on' : ''}" data-rshape="${k}">${n}</button>`).join('')}</div>
    ${(d.roofShape || 'flat') === 'mono' ? `<div class="seg-o"><span class="small">下がる向き</span>${[['n', '北'], ['e', '東'], ['s', '南'], ['w', '西']].map(([k, n]) => `<button class="opt${(d.roofDir || 's') === k ? ' on' : ''}" data-rdir="${k}">${n}へ</button>`).join('')}</div>` : ''}
    ${(d.roofShape || 'flat') === 'gable' ? `<div class="seg-o"><span class="small">下がる向き</span>${[['ns', '北と南'], ['ew', '東と西']].map(([k, n]) => `<button class="opt${(d.roofDir === 'ew' ? 'ew' : 'ns') === k ? ' on' : ''}" data-rdir="${k}">${n}へ</button>`).join('')}</div>` : ''}
    ${(d.roofShape || 'flat') !== 'flat' ? `<div class="seg-o"><span class="small">傾き</span>${E.W.PITCHES.map(([p2, n]) => `<button class="opt${(d.pitch || 0.3) === p2 ? ' on' : ''}" data-rpitch="${p2}">${n}（${Math.round(Math.atan(p2) * 180 / Math.PI)}°）</button>`).join('')}</div>` : ''}
    <div class="seg-o"><span class="step">軒の出 <button class="btn ghost" data-eave="-1" aria-label="短く">−</button><b>${E.W.eavesDepth(d).toFixed(1)}m</b><button class="btn ghost" data-eave="1" aria-label="長く">＋</button></span><span class="small">長いほど屋根が広く雨を集め、夏の日差しと壁の雨を防ぐ（屋根 ${Math.round(E.W.roofCatchArea(d))}m²）</span></div>
    <h3>床</h3><div class="mcards">${Object.entries(E.W.FLOORS).map(([k, M]) => matCard('floor', k, M, d.floor === k)).join('')}</div>
    <h3>そのほか</h3><div class="seg-o">
      <button class="opt${d.gutter ? ' on' : ''}" data-gutter="1">雨樋${d.gutter ? 'あり' : `をつける（軒${E.W.housePerimeter(d)}m · ${E.W.gutterPrice(E.W.housePerimeter(d)).toFixed(1)}万円。屋根の雨を全部タンクへ）`}</button>
      <button class="opt${d.stove ? ' on' : ''}" data-stove="1">薪のかまど${d.stove ? 'あり' : 'をつける'}（${E.W.STOVE_PRICE}万円。切った木で料理と暖房、電気が減る）</button>
      ${knownTech('offgrid') ? `<span class="step">屋根の太陽光 <button class="btn ghost" data-pv="-1" aria-label="減らす">−</button><b>${d.pv}枚</b><button class="btn ghost" data-pv="1" aria-label="増やす">＋</button></span><span class="step">蓄電池 <button class="btn ghost" data-batt="-1" aria-label="減らす">−</button><b>${d.batt}台</b><button class="btn ghost" data-batt="1" aria-label="増やす">＋</button></span>` : ''}
      <span class="step">基礎の深さ <button class="btn ghost" data-depth="-1" aria-label="浅く">−</button><b>${(d.eq.depth || E.summarize(s).depth).toFixed(1)}m</b><button class="btn ghost" data-depth="1" aria-label="深く">＋</button></span></div>`;
  const hidden = [...Object.values(E.W.WALLS), ...Object.values(E.W.ROOFS), ...Object.values(E.W.FLOORS), ...Object.values(E.W.OPENINGS), ...Object.values(E.W.FURN)].filter(M => !knownTech(M.learn)).length;
  return `<div class="h-tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" class="${st.tab === k ? 'on' : ''}" aria-selected="${st.tab === k}" data-tab3="${k}">${n}</button>`).join('')}</div>${body}
    ${hidden ? `<p class="small muted">まだ知らない素材や設備が、あと${hidden}つ。困りごとや図鑑から覚える。</p>` : ''}`;
}
function bindHouse(st, el) {
  el.querySelectorAll('[data-tab3]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab3; st.tool = st.tab === 'plan' ? 'add' : st.tab === 'open' ? 'window' : st.tab === 'furn' ? 'furn' : null; st.sel = -1; G.view.furnGhost = null; st.msg = ''; st.redraw(); });
  el.querySelectorAll('[data-htool]').forEach(b => b.onclick = () => { st.tool = b.dataset.htool; st.msg = ''; renderBuildSide(st); });
  el.querySelectorAll('[data-fmove]').forEach(b => b.onclick = () => st.pickUp(+b.dataset.fmove));
  el.querySelectorAll('[data-frot]').forEach(b => b.onclick = () => st.rotateHeld());
  el.querySelectorAll('[data-frotin]').forEach(b => b.onclick = () => st.rotateInPlace(+b.dataset.frotin));
  el.querySelectorAll('[data-fcancel]').forEach(b => b.onclick = () => st.dropHeld());
  el.querySelectorAll('[data-fswap]').forEach(b => b.onclick = () => { const [i, t] = b.dataset.fswap.split(':'); st.edit(dd => E.W.draftSwapFurn(dd, +i, t)); st.msg = ''; st.redraw(); });
  const set = (fn) => { st.edit(fn); st.msg = ''; st.redraw(); };
  el.querySelectorAll('[data-wall]').forEach(b => b.onclick = () => set(d => { d.wall = b.dataset.wall; }));
  el.querySelectorAll('[data-roof]').forEach(b => b.onclick = () => set(d => { d.roof = b.dataset.roof; }));
  el.querySelectorAll('[data-floor]').forEach(b => b.onclick = () => set(d => { d.floor = b.dataset.floor; }));
  el.querySelectorAll('[data-rshape]').forEach(b => b.onclick = () => set(d => { d.roofShape = b.dataset.rshape; if (d.roofShape === 'gable' && !['ns', 'ew'].includes(d.roofDir)) d.roofDir = 'ns'; if (d.roofShape === 'mono' && !['n', 'e', 's', 'w'].includes(d.roofDir)) d.roofDir = 's'; if (!d.pitch) d.pitch = 0.3; }));
  el.querySelectorAll('[data-rdir]').forEach(b => b.onclick = () => set(d => { d.roofDir = b.dataset.rdir; }));
  el.querySelectorAll('[data-rpitch]').forEach(b => b.onclick = () => set(d => { d.pitch = +b.dataset.rpitch; }));
  el.querySelectorAll('[data-eave]').forEach(b => b.onclick = () => set(d => { const st2 = E.W.EAVE_STEPS, cur = E.W.eavesDepth(d); let i = st2.findIndex(x => x >= cur - 1e-6); if (i < 0) i = st2.length - 1; d.eaves = st2[Math.max(0, Math.min(st2.length - 1, i + +b.dataset.eave))]; }));
  el.querySelectorAll('[data-stove]').forEach(b => b.onclick = () => { let err = null; st.edit(d => { if (d.stove) { d.stove = false; E.W.removeStove(d); } else { err = E.W.placeStove(d); if (!err) d.stove = true; } }); st.msg = err || (st.draft.stove ? 'かまどを置いた（家具タブで動かせる）' : ''); st.redraw(); });
  el.querySelectorAll('[data-gutter]').forEach(b => b.onclick = () => set(d => { d.gutter = !d.gutter; }));
  el.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => set(d => { d.pv = Math.max(st.base.pv, Math.min(Object.keys(d.cells).length, d.pv + +b.dataset.pv)); }));
  el.querySelectorAll('[data-batt]').forEach(b => b.onclick = () => set(d => { d.batt = Math.max(st.base.batt, Math.min(4, d.batt + +b.dataset.batt)); }));
  el.querySelectorAll('[data-depth]').forEach(b => b.onclick = () => set(d => { const cur = d.eq.depth || E.summarize(G.s).depth, min = st.base.eq.depth || E.summarize(G.s).depth; d.eq.depth = Math.round(Math.max(min, cur + 0.3 * +b.dataset.depth) * 10) / 10; }));
}
/* 見積もりと、いま → この設計。家・畑・水・電気をまとめて */
function estimateBody(st) {
  const s = G.s, dw = st.dw, hd = st.houseDirty(), wd = st.worldDirty(), dirty = hd || wd;
  const est = hd ? E.W.estimate(dw, st.base, st.draft) : null;
  const total = (s.cash - st.ds.cash) + (est ? est.total : 0);
  const local = ((dw.spent?.local || 0) - (s.world.spent?.local || 0)) + (est ? est.local : 0);
  const lines = wd ? draftLines(s.world, dw) : [];
  if (est) for (const l of est.lines) lines.push({ label: `家：${l.label}${l.unit ? ` ${l.n}${l.unit}` : ''}`, cost: l.cost });
  const S0 = E.summarize(s), S1 = dirty ? E.summarize({ ...s, world: { ...dw, house: st.draft || dw.house }, cash: st.ds.cash }) : S0;
  const cmp = (label, a, b, better) => a === b ? `<span>${label}</span><b class="num">${a}</b>` : `<span>${label}</span><b class="num">${a} → <em class="${better === undefined ? '' : better ? 'good' : 'ng'}">${b}</em></b>`;
  const rows = [];
  if (st.cat === 'house' || hd) {
    const site = E.SITES[s.site], m0 = E.W.houseModel(site, st.base, s.persons.length), m1 = E.W.houseModel(site, st.draft, s.persons.length);
    const y0 = m0 ? houseYearStats(m0) : null, y1 = m1 ? houseYearStats(m1) : null, heatTxt = (y) => !y ? '—' : y.elec < 50 ? 'ほぼいらない' : `${Math.round(y.elec).toLocaleString()}kWh`;
    rows.push(cmp('家の広さ', `${m0?.A ?? 0}m²`, `${m1?.A ?? 0}m²`), cmp('冬の暖房', heatTxt(y0), heatTxt(y1), y1 && y0 ? y1.elec <= y0.elec : undefined), cmp('暑すぎる日', y0 ? `${y0.hot}日/年` : '—', y1 ? `${y1.hot}日/年` : '—', y1 && y0 ? y1.hot <= y0.hot : undefined), cmp('屋根の裏の水滴', m0?.condenseProne ? 'つく' : 'つかない', m1?.condenseProne ? 'つく' : 'つかない', m1 ? !m1.condenseProne : undefined));
  }
  rows.push(cmp('タンクに入る屋根', `${Math.round(S0.A.roofCatch / 0.85)}m²`, `${Math.round(S1.A.roofCatch / 0.85)}m²`, S1.A.roofCatch >= S0.A.roofCatch), cmp('タンク', `${S0.tankCap / 1000}m³`, `${S1.tankCap / 1000}m³`, S1.tankCap >= S0.tankCap), cmp('畑', `${Math.round(S0.gArea)}m²`, `${Math.round(S1.gArea)}m²`, S1.gArea >= S0.gArea));
  if (S0.pvKw || S1.pvKw) rows.push(cmp('太陽光', `${S0.pvKw.toFixed(1)}kW`, `${S1.pvKw.toFixed(1)}kW`, S1.pvKw >= S0.pvKw));
  if (S0.pondCap || S1.pondCap) rows.push(cmp('ため池', `${S0.pondCap / 1000}m³`, `${S1.pondCap / 1000}m³`, S1.pondCap >= S0.pondCap));
  if (S0.A.risers || S1.A.risers) rows.push(cmp('ふちまで耕した段差', `${S0.A.risers - S0.A.stoneRisers}m²`, `${S1.A.risers - S1.A.stoneRisers}m²`, S1.A.risers - S1.A.stoneRisers <= S0.A.risers - S0.A.stoneRisers), cmp('石垣', `${Math.round(S0.wallArea)}m²`, `${Math.round(S1.wallArea)}m²`, S1.wallArea >= S0.wallArea));
  const cTxt = (C) => !C.load ? '—' : `${Math.round(Math.min(1, C.f) * 100)}%（${C.cap.toFixed(1)}/${C.load.toFixed(1)}m³）`;
  if (S0.compost.load || S1.compost.load || S0.compost.toilet || S1.compost.toilet) rows.push(cmp('堆肥でさばける', cTxt(S0.compost), cTxt(S1.compost), S1.compost.f >= S0.compost.f));
  const probs = [...(hd ? E.W.houseProblems(st.draft) : [])];
  if (dirty && total > s.cash + 1e-9) probs.push(`お金が足りない（あと${Math.ceil(total - s.cash)}万円）`);
  const was = new Set(S0.diag.map(d => d.text)), warn = dirty ? S1.diag.filter(d => d.lv === 'warn' && !was.has(d.text)).slice(0, 3) : [];
  const actions = st.confirm
    ? `<div class="h-act"><span class="small">頼んでいない設計があります。捨てて閉じますか？</span><button class="btn ghost" data-act="keep">設計を続ける</button><button class="btn" data-act="discard">捨てて閉じる</button></div>`
    : `<div class="h-act"><button class="btn ghost" data-act="undo" ${st.undo.length ? '' : 'disabled'}>元に戻す</button><button class="btn ghost" data-act="reset" ${dirty ? '' : 'disabled'}>やめる</button>
       <button class="btn primary" data-act="build" ${dirty && !probs.length ? '' : 'disabled'}>${dirty ? `この設計で頼む（${Math.round(total)}万円）` : '頼む（まだ変えていない）'}</button></div>`;
  return `<div class="stat2 h-est"><span>いま → この設計 <span class="small">所持金 ${man(s.cash)}</span></span>
      <div class="rows">${rows.join('')}</div>
      ${dirty ? `<div class="est-lines">${lines.map(l => `<span>${esc(l.label)}</span><b class="num">${l.cost ? `${l.cost.toFixed(1)}万円` : '—'}</b>`).join('')}<span><b>合計</b></span><b class="num">${total.toFixed(1)}万円</b><span class="small">うち近所に回るお金</span><b class="num small">${Math.max(0, local).toFixed(1)}万円</b></div>` : '<p class="small">まだ変えていない。道具を選んで地面を押す・なぞると、ここに見積もりが出る。</p>'}
      ${warn.map(d => `<div class="ng">${esc(d.text)}</div>`).join('')}${probs.map(p => `<div class="ng">${esc(p)}</div>`).join('')}</div>
    ${actions}`;
}
/* ==================== 家の熱の見積もり ==================== */
function houseAngle(hs) {
  if (!hs) return 0;
  const vis = { 0: ['e', 's'], 90: ['e', 'n'], 180: ['w', 'n'], 270: ['w', 's'] };
  let best = 0, bs = -1;
  for (const a of [0, 90, 180, 270]) {
    let sc = 0;
    for (const o of E.W.houseOuterEdges(hs)) { const t = hs.open[o.e]; if (t && vis[a].includes(o.dir)) sc += t === 'door' ? 1.5 : 1; }
    if (sc > bs) { bs = sc; best = a; }
  }
  return best;
}
function houseYearStats(hm) {
  const s = G.s, N = E.normals(s.site); let heat = 0, hot = 0, peak = -99;
  N.forEach((c, i) => { const r = E.B.houseDay(hm, { t: c.t, tmax: c.tmax, psh: c.psh }, s.persons.length); heat += r.heat * E.DAYS[i]; if (r.peak > E.B.HOT) hot += E.DAYS[i]; peak = Math.max(peak, r.peak); });
  return { heat, elec: heat / 2.6, hot, peak };
}
const dots = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
function matCard(kind, k, M, on, extra = '') {   // 覚えていない素材は出さない
  if (!knownTech(M.learn)) return '';
  const unit = kind === 'wall' ? '1m' : kind === 'htool' ? '1つ' : '1m²';
  return `<button class="mcard${on ? ' on' : ''}" data-${kind}="${k}" aria-pressed="${on}">
    <i class="swatch pat-${M.pat || (M.door ? 'door' : 'glass')}" style="--c:${M.color}"></i>
    <span class="mc-b"><b>${esc(M.name)}</b><span class="note">${esc(M.note)}</span>
      <span class="meters"><span>断熱 <em>${dots(M.warm || 1)}</em></span>${M.store ? `<span>熱をためる <em>${dots(M.store)}</em></span>` : ''}${M.catch ? `<span>雨を集める <em>${dots(Math.round(M.catch * 5))}</em></span>` : ''}${extra}</span></span>
    <span class="price">${M.cost}<small>万円/${unit}</small></span></button>`;
}

/* ---------- 右のダッシュボード ---------- */
const TABS = [['web', 'めぐり'], ['book', '家計簿'], ['plan', '予定'], ['sky', '天気'], ['note', 'ノート']];
function renderTabs() {
  const fresh = G.s.learned.some(l => l.turn === G.s.turn - 1);
  document.getElementById('tabs').innerHTML = TABS.map(([k, n]) => `<button class="tab${G.tab === k ? ' on' : ''}" data-tab="${k}">${n}${k === 'note' && fresh ? '<span class="dot" aria-label="新しい"></span>' : ''}</button>`).join('');
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { G.tab = b.dataset.tab; renderTabs(); renderPanel(); });
}
function renderPanel() {
  const el = document.getElementById('panel');
  el.innerHTML = ({ web: panelWeb, book: panelBook, plan: panelPlan, sky: panelSky, note: panelNote })[G.tab]();
  el.scrollTop = 0;
  bindPanel(el);
}
function webSVG(rel) {
  const nodes = rel.nodes, n = nodes.length, cx = 160, cy = 150, R = 112;
  const lines = [], dots = [];
  nodes.forEach((x, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n, px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
    const col = x.good === true ? '#3F7D4E' : x.good === false ? '#B8641F' : x.good === null ? '#6B7462' : '#9AA090';
    const v = Math.max(0, Math.min(1, x.v));
    lines.push(`<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="${col}" stroke-width="${(0.6 + 7 * v).toFixed(1)}" opacity="${(0.15 + 0.85 * v).toFixed(2)}" ${x.good === undefined ? 'stroke-dasharray="4 4"' : ''} stroke-linecap="round"/>`);
    const anchor = Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle';
    const tx = px + Math.cos(a) * 12, ty = py + Math.sin(a) * 12 + 4;
    dots.push(`<circle cx="${px}" cy="${py}" r="${(4 + 6 * v).toFixed(1)}" fill="${col}" opacity="${(0.25 + 0.75 * v).toFixed(2)}"/><text x="${tx}" y="${ty}" font-size="11" text-anchor="${anchor}" fill="#1F2A2E">${esc(x.name)}</text>`);
  });
  return `<svg class="web" viewBox="-50 0 420 300" role="img" aria-label="関係の網：${nodes.map(x => `${x.name} ${Math.round(x.v * 100)}`).join('、')}">${lines.join('')}${dots.join('')}<circle cx="${cx}" cy="${cy}" r="18" fill="#1F2A2E"/><text x="${cx}" y="${cy + 4}" font-size="11" text-anchor="middle" fill="#FBFAF5">あなた</text></svg>`;
}
function cycleSVG(cs) {
  const W = 420, H = 330, cells = [[105, 85], [315, 85], [105, 245], [315, 245]];
  const out = cs.map((c, i) => {
    const [cx, cy] = cells[i], r = 26 + 12 * Math.min(3, Math.log10(1 + c.flow));
    const cl = Math.max(0, Math.min(1, c.closure)), a0 = -Math.PI / 2, a1 = a0 + cl * 2 * Math.PI;
    const P = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = P(a0), [x1, y1] = P(a1);
    const arc = cl >= 0.999 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.color}" stroke-width="9"/>` : cl > 0.005 ? `<path d="M${x0} ${y0} A${r} ${r} 0 ${cl > 0.5 ? 1 : 0} 1 ${x1} ${y1}" fill="none" stroke="${c.color}" stroke-width="9" stroke-linecap="round"/>` : '';
    // 閉じていない分は、外へ抜けていく矢印
    const gap = cl < 0.999 ? `${cl <= 0.005 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#B9BDB0" stroke-width="3" stroke-dasharray="5 5"/>` : `<path d="M${x1} ${y1} A${r} ${r} 0 ${cl < 0.5 ? 1 : 0} 1 ${x0} ${y0}" fill="none" stroke="#B9BDB0" stroke-width="3" stroke-dasharray="5 5"/>`}<path d="M${cx + r * 0.75} ${cy - r - 4} l22 -14" stroke="#B9BDB0" stroke-width="2.5" marker-end="url(#ca)"/><text x="${cx + r * 0.75 + 24}" y="${cy - r - 18}" font-size="10" fill="#6B7462">遠くへ</text>` : '';
    return `<g>${gap}${arc}<text x="${cx}" y="${cy - 2}" font-size="14" font-weight="700" text-anchor="middle" fill="#1F2A2E">${c.name}</text><text x="${cx}" y="${cy + 15}" font-size="12" text-anchor="middle" fill="#4A544F">${Math.round(cl * 100)}% 地域で</text><text x="${cx}" y="${cy + r + 20}" font-size="10.5" text-anchor="middle" fill="#6B7462">流れる量 ${Math.round(c.flow).toLocaleString()}${c.unit}/年</text></g>`;
  }).join('');
  return `<svg class="web" viewBox="0 0 ${W} ${H}" role="img" aria-label="4つの輪：${cs.map(c => `${c.name} ${Math.round(c.closure * 100)}%`).join('、')}"><defs><marker id="ca" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L6 3L0 6z" fill="#B9BDB0"/></marker></defs>${out}</svg>`;
}
function cycleList(cs) {
  return cs.map(c => `<div class="note"><b style="color:${c.color}">${c.name}の輪 · 地域で ${Math.round(c.closure * 100)}%</b><span>${esc(c.note)}</span>
    <span class="meta">担い手：${c.parts.length ? esc(c.parts.join('、')) : 'まだいない'}</span>
    <span class="meta">${c.leaks.map(([n, v, u]) => `${esc(n)} ${Math.round(v).toLocaleString()}${u}`).join(' · ')}</span></div>`).join('');
}
function panelWeb() {
  const rel = E.relations(G.s), cs = E.cycles(G.s);
  const good = rel.nodes.filter(x => x.good === true && x.v > 0.15).length;
  return `<div><h2>めぐり</h2><p class="small">暮らしには、水・養分・エネルギー・お金の4つの輪が重なって流れている。色の弧は敷地と地域の中で閉じた割合、点線は遠くへ抜けていく分。お金の輪は消えない。外貨を稼ぐ、設備を更新する、近所と売り買いする。その流れ先が変わるだけ。</p></div>
    ${cycleSVG(cs)}
    <div><div class="rows"><span>担い手（輪を回す人と生き物）· この章の目標 ${GOAL}</span><b class="num">${good} / ${GOAL}</b></div><div class="meter"><i style="width:${Math.min(100, good / GOAL * 100)}%"></i></div></div>
    ${G.s.log.length ? '' : '<p class="small">3か月を過ごすと、輪に暮らしの結果が出ます。</p>'}
    ${cycleList(cs)}`;
}
function panelBook() {
  const s = G.s, last = s.log[s.log.length - 1], T = E.tokyoYear();
  const year = s.log.slice(-4), k = year.length ? 4 / year.length : 0;
  const sum = (f) => year.reduce((a, x) => a + f(x), 0) * k;
  const me = { water: sum(x => (x.A.city + x.A.bottled) / 1000), power: sum(x => x.A.grid), food: sum(x => x.foodBought), sewer: sum(x => x.A.sewer / 1000) };
  const tk = { water: T.flows.water, power: T.flows.power, food: T.flows.food, sewer: T.flows.sewer };
  const row = (name, unit, a, b) => { const mx = Math.max(a, b, 1); return `<span>${name}</span><div class="bars"><i class="tk" style="width:${(a / mx * 100).toFixed(0)}%"></i><i class="me" style="width:${(b / mx * 100).toFixed(0)}%"></i></div><span class="num">${Math.round(b).toLocaleString()}${unit}</span>`; };
  let ledger = '<p class="small">まだ3か月を過ごしていません。</p>';
  if (last) {
    const m = last.money;
    const items = [['仮住まい', -(m.rent || 0)], ['外貨の仕事', m.income], ['野菜・電気を売った', m.sell], ['仕事の経費', -m.jobCost], ['そのほかの暮らし', -m.living], ['食べものを買った', -m.food], ['水を買った', -m.water], ['電気を買った', -m.power], ['家の維持', -m.maint], ['設備の交換', -m.replace], ['修理', -m.repair], ['おがくずを買った', -(m.sawdust || 0)], ['木をチップに', -(m.chipper || 0)], ['薪を近所に売った', m.woodSale || 0], ['し尿の汲み取り', -(m.pumpout || 0)]].filter(x => Math.abs(x[1]) >= 0.05);
    ledger = `<div class="rows">${items.map(([n, v]) => `<span>${n}</span><b class="num${v < 0 ? ' neg' : ''}">${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}万円</b>`).join('')}<span class="tot">差し引き</span><b class="num tot">${last.net >= 0 ? '+' : '−'}${Math.abs(last.net).toFixed(1)}万円</b></div>`;
  }
  return `<div><h2>家計簿</h2><p class="small">円の財布だけでなく、水・電気・食べもの・土の財布で暮らしを見る。</p></div>
    <h3>直前の3か月</h3>${ledger}
    <h3>外から買ったもの・外へ出したもの（1年あたり）</h3>
    <div class="legend"><span><i style="background:#9AA090"></i>東京のとき</span><span><i style="background:var(--water)"></i>いま</span></div>
    ${year.length ? `<div class="cmp">${row('水を買った', 'm³', tk.water, me.water)}${row('電気を買った', 'kWh', tk.power, me.power)}${row('食べものを買った', 'kg', tk.food, me.food)}${row('下水に流した', 'm³', tk.sewer, me.sewer)}</div>` : '<p class="small">1年過ごすと東京と比べられます。</p>'}
    <h3>この1年のめぐり</h3>${year.length ? `<div class="rows"><span>屋根で集めた雨</span><b class="num">${Math.round(sum(x => x.A.harvest / 1000))}m³</b><span>畑から地下へ浸みた水</span><b class="num">${Math.round(sum(x => x.A.recharge))}m³</b><span>畑から流れ去った雨</span><b class="num">${Math.round(sum(x => x.A.runoff))}m³</b><span>近所に売った野菜</span><b class="num">${Math.round(sum(x => x.foodSold || 0))}kg</b></div>` : '<p class="small">—</p>'}`;
}
function panelPlan() {
  const s = G.s, care = E.careNeed(s), hand = E.hands(s);
  const work = s.persons.reduce((a, p) => a + E.weekCount(p).work, 0);
  const lab = { work: '仕事', farm: '畑', build: '畑', rest: '休み' };
  return `<div><h2>予定 · 週の過ごし方</h2><p class="small">マスを押すと 仕事 → 畑 → 休み と変わる。東京では週5日、会社の仕事だった。</p></div>
    <div class="week"><span></span>${E.WEEKDAYS.map(d => `<span>${d}</span>`).join('')}
    ${s.persons.map((p, pi) => `<span style="text-align:left">${esc(p.name)}</span>${p.week.map((v, di) => `<button class="cell ${v}" data-cell="${pi},${di}" aria-label="${esc(p.name)} ${E.WEEKDAYS[di]}曜 ${lab[v]}">${lab[v]}</button>`).join('')}`).join('')}</div>
    <h3>畑と手入れ</h3><div class="meter${hand < care.total ? ' over' : ''}"><i style="width:${Math.min(100, care.total ? hand / care.total * 100 : 100)}%"></i></div>
    <div class="rows"><span>手入れに要る日数</span><b class="num">週${care.total.toFixed(1)}日</b><span>畑に出る日</span><b class="num">週${hand}日</b></div>
    <h3>外貨の仕事（東京の会社のリモート）</h3>
    <div class="rows"><span>週${work}日 × 日給${E.WAGE}万円</span><b class="num">3か月で約${man(work * E.WAGE * 12)}</b><span>そのほかの暮らし</span><b class="num">3か月で${man(E.LIVING * s.persons.length)}</b></div>`;
}
function panelSky() {
  const s = G.s, N = E.normals(s.site), site = E.SITES[s.site];
  const maxR = Math.max(...N.map(c => Math.max(c.rain, c.et0 * 30)));
  const bars = N.map((c, m) => { const h = c.rain / maxR * 90, e = c.et0 * 30 * 0.85 / maxR * 90; return `<rect x="${m * 24 + 4}" y="${100 - h}" width="14" height="${h}" fill="#9CC2E6"/><circle cx="${m * 24 + 11}" cy="${100 - e}" r="2.5" fill="#B8641F"/><text x="${m * 24 + 11}" y="114" font-size="9" text-anchor="middle" fill="#6B7462">${m + 1}</text>`; }).join('');
  const ins = E.foresight(s).filter(f => !s.known.includes(f.id));
  const canStudy = G.studied !== s.turn;
  const past = s.log.slice(-8).map(l => `<span>${l.y}年 ${site.quarters[l.q].split('・')[0]}${l.phase === 'nino' ? '（エルニーニョ）' : l.phase === 'nina' ? '（ラニーニャ）' : ''}</span><b class="num">${Math.round(l.A.rain)}mm</b>`).join('');
  return `<div><h2>天気</h2><p class="small">${esc(site.sub)}。青い棒が月の雨、橙の点が畑から蒸発する水の目安。点が棒より上の月は、畑が乾く。</p></div>
    <svg viewBox="0 0 290 120" role="img" aria-label="月ごとの雨と蒸発">${bars}</svg>
    <h3>これまでの記録</h3>${past ? `<div class="rows">${past}</div>` : '<p class="small">まだ記録がありません。</p>'}
    <h3>記録から気づけること（先読み）</h3>
    <p class="small">困る前に調べれば、ノートに書いておける。調べられるのは3か月に1つ。</p>
    ${ins.length ? ins.map(f => `<div class="insight"><span>${esc(f.text)}</span><button class="btn" data-study="${f.id}" ${canStudy ? '' : 'disabled'}>調べる</button></div>`).join('') : '<p class="small">いま気づけることは、もうノートにあります。</p>'}
    <p class="small">天気は平年値をもとに、年ごとのゆらぎとエルニーニョ・ラニーニャを確率で重ねた試作です。停電と断水の回数は仮の値です。</p>`;
}
function panelNote() {
  const s = G.s;
  const all = ['house', 'tank', 'garden', ...E.TECH];
  const read = ATLAS.filter(a => G.atlasRead.includes(a.id));
  return `<div><h2>ノート</h2><p class="small">困ったことや、調べたことから学んだ技術。知らないものは、地図に置けない。</p></div>
    ${all.map(id => {
      const n = NOTES[id]; const k = s.known.includes(id);
      const l = s.learned.find(x => x.id === id);
      if (!k) return `<div class="note locked"><b>？？？</b><span>まだ知らない技術。この土地で何かに困ったとき、誰かが教えてくれるかもしれない。</span></div>`;
      const w = n.world ? ATLAS.find(a => a.id === n.world) : null;
      return `<div class="note"><b>${esc(n.name)}</b><span>${esc(n.what)}</span><span>${esc(n.how)}</span><span class="meta">${esc(n.cost)}${l ? ` · ${l.how === 'foresight' ? '記録から先読み' : l.how === 'atlas' ? '図鑑から' : '教わった'}` : ''}${w ? ` · 世界では：${esc(w.name)}（${esc(w.place)}）` : ''}</span></div>`;
    }).join('')}
    <h3>世界の知恵（図鑑）</h3>${read.length ? read.map(a => `<div class="note"><b>${esc(a.name)} · ${esc(a.place)}</b><span>${esc(a.text)}</span></div>`).join('') : '<p class="small">まだ読んでいない。</p>'}
    <button class="btn" data-atlas="1">地球儀で学ぶ</button>`;
}
function bindPanel(el) {
  el.querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
    const [pi, di] = b.dataset.cell.split(',').map(Number);
    const order = ['work', 'farm', 'rest'];
    const s = E.clone(G.s); const v = s.persons[pi].week[di] === 'build' ? 'farm' : s.persons[pi].week[di];
    s.persons[pi].week[di] = order[(order.indexOf(v) + 1) % 3];
    G.s = s; persist(); renderPanel(); renderInspect(); renderMap();
  });
  el.querySelectorAll('[data-study]').forEach(b => b.onclick = () => {
    G.s = E.learn(G.s, b.dataset.study, 'foresight'); G.studied = G.s.turn; persist();
    const n = NOTES[b.dataset.study]; showMail(LESSON.foresight(n.name), n);
    renderAll();
  });
  el.querySelectorAll('[data-atlas]').forEach(b => b.onclick = () => atlas(() => game()));
}
function showMail(m, n) {
  modal(`<div class="small">メール · ${esc(m.from)}</div><h2>${esc(m.subject)}</h2><p style="margin:0">${esc(m.body)}</p>${n ? `<div class="note"><b>ノート：${esc(n.name)}</b><span>${esc(n.what)}</span><span class="meta">${esc(n.cost)}</span></div>` : ''}<button class="btn primary" data-m="ok">ノートに書いた</button>`, (x, c) => c());
}

/* ---------- 季節を進める ---------- */
function renderClose() {
  const s = G.s, site = E.SITES[s.site];
  const b = document.getElementById('close');
  b.disabled = false;
  b.textContent = `ノートPCを閉じる → ${site.quarters[s.q].split('・')[0]}を過ごす`;
}
function closeLaptop() {
  const before = G.s;
  const { state, report } = E.advance(before);
  let s = state;
  const lessons = [];
  for (const l of report.learn) { s = E.learn(s, l.id, l.why); lessons.push(l); }
  G.s = s; G.report = report; G.cat = null; persist();
  wake(before, report, lessons);
}
function wake(before, rep, lessons) {
  const s = G.s, site = E.SITES[s.site];
  const d = document.createElement('div'); d.className = 'wake';
  const evs = rep.events.map(e => ({ e, t: eventText(e) }));
  const relB = E.relations(before).score, relA = E.relations(s).score;
  const mails = lessons.map(l => { const n = NOTES[l.id]; const m = (LESSON[l.why] || LESSON.intro)(n.name); return `<div class="card mail"><span class="k">メール · ${esc(m.from)}</span><b>${esc(m.subject)}</b><span>${esc(m.body)}</span><span class="k">ノートに「${esc(n.name)}」を書いた → ${MODHINT[l.id] || '地図に置けるようになった'}</span></div>`; }).join('');
  const phase = rep.phase === 'nino' ? 'エルニーニョの年（雨が少ない）' : rep.phase === 'nina' ? 'ラニーニャの年（雨が多い）' : '';
  const goodN = E.relations(s).nodes.filter(x => x.good === true && x.v > 0.15).length;
  const end = goodN >= GOAL && s.flags['done_' + s.site] == null;
  if (end) { G.s = E.clone(s); G.s.flags['done_' + s.site] = s.turn; persist(); }
  d.innerHTML = `<div class="laptop" id="lap"><div class="screen">
    <header><h2>${rep.year}年 ${esc(site.quarters[rep.q])}が過ぎた</h2><span class="small">雨 ${Math.round(rep.A.rain)}mm ${phase ? '· ' + phase : ''}</span></header>
    <div class="stats">
      <div class="stat"><span>所持金</span><b>${man(s.cash)}</b><span>${rep.net >= 0 ? '+' : '−'}${Math.abs(rep.net).toFixed(0)}万円</span></div>
      <div class="stat"><span>水を雨と排水で</span><b>${pct(rep.waterSelf)}</b></div>
      <div class="stat"><span>電気を太陽で</span><b>${pct(rep.powerSelf)}</b></div>
      <div class="stat"><span>食べものを畑で</span><b>${pct(rep.foodSelf)}</b><span>収穫 ${Math.round(rep.harvest + rep.treeFood)}kg</span></div>
      <div class="stat"><span>土の有機物</span><b>${rep.om.toFixed(2)}%</b></div>
      <div class="stat"><span>地域で回るお金</span><b>${Math.round(E.cycles(s)[3].closure * 100)}%</b><span>東京のとき 5%</span></div>
    </div>
    ${mails ? `<div class="cards">${mails}</div>` : ''}
    <div class="cards">${evs.length ? evs.map(({ e, t }) => `<div class="card ${t.tone}"><span class="k">出来事</span><b>${esc(t.title)}</b><span>${esc(t.body)}</span>${choiceHTML(t.choice)}</div>`).join('') : '<div class="card"><b>穏やかな3か月だった</b><span>大きな出来事はなかった。</span></div>'}</div>
    ${s.cash < 0 ? '<div class="card bad"><b>お金が足りない</b><span>赤字になった。予定で外貨の仕事を増やすか、しばらく何も建てずに過ごそう。</span></div>' : ''}
    ${end ? endHTML() : ''}
    <div style="display:flex;justify-content:flex-end;gap:8px">${end && Object.keys(LANDS).some(k => k !== s.site) ? '<button class="btn" id="nextland">次の土地を選ぶ</button>' : ''}<button class="btn primary" id="back">${end ? 'このまま続ける' : '開いて、計画に戻る'}</button></div>
  </div></div><div class="base"></div>`;
  document.body.appendChild(d);
  d.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => {
    const [k, v] = b.dataset.choice.split(':'); const t = E.clone(G.s);
    if (k === 'surplus') t.flags.surplus = v; if (k === 'pest') t.flags.pestHand = v === 'hand';
    G.s = t; persist();
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
  });
  const back = d.querySelector('#back'); back.focus();
  const nl = d.querySelector('#nextland'); if (nl) nl.onclick = () => { d.remove(); renderAll(); chooseLand(); };
  back.onclick = () => { d.remove(); renderAll(); };
}
function choiceHTML(c) {
  const f = G.s.flags;
  if (c === 'surplus') return `<div class="row"><button class="btn${f.surplus !== 'sell' ? ' sel' : ''}" data-choice="surplus:share">これからも分ける</button><button class="btn${f.surplus === 'sell' ? ' sel' : ''}" data-choice="surplus:sell">これからは売る</button></div>`;
  if (c === 'pest') return `<div class="row"><button class="btn${f.pestHand ? ' sel' : ''}" data-choice="pest:hand">次は手で取る</button><button class="btn${!f.pestHand ? ' sel' : ''}" data-choice="pest:none">様子を見る</button></div>`;
  return '';
}
function endHTML() {
  const rel = E.relations(G.s);
  const good = rel.nodes.filter(x => x.good === true && x.v > 0.15).map(x => x.name);
  const years = (G.s.turn / 4).toFixed(1), site = E.SITES[G.s.site];
  const more = Object.keys(LANDS).some(k => k !== G.s.site);
  return `<div class="card good"><b>${esc(site.name)}で、めぐりができた（${years}年）</b><span>東京では、4つの輪はどれも部屋の中で閉じず、遠くへ抜けていた。いまは ${good.length}の相手と豊かに関わっている：${esc(good.join('、'))}。</span><span class="k">${more ? '学んだことを持って、次の土地へ行ける。ここで続けてもいい。' : '地球儀から好きな土地を選ぶ章は準備中。ここで続けられる。'}</span></div>`;
}
const GOAL = 10;
const MODHINT = { toilet: '家の設定で足せる', saving: '家の設定で足せる', insulation: '3Dで断熱した壁・屋根・床・窓が置けるようになった', bamboo: '3Dで竹と土壁が置けるようになった', earth: '3Dで土嚢・古タイヤの壁が置けるようになった', straw: '3Dでわらの壁が置けるようになった', grey: '3Dの［水］で浄化の穴が掘れるようになった', mulch: '3Dの［畑］で畑を押すと敷ける', terrace: '3Dの［畑］で段差を押すと石垣を積める', deep: '3Dの［家］の設定で基礎を深くできる', catch: '3Dの［家］で柱と屋根の小屋を建て、軒の下にタンクを', pond: '3Dの［水］でため池が掘れるようになった', offgrid: '3Dの［電気］で置けるようになった', hedge: '3Dの［生き物］で置けるようになった', chicken: '3Dの［生き物］で置けるようになった', heap: '3Dの［畑］で置けるようになった', greenhouse: '3Dでガラス屋根が置ける。ガラスで囲った部屋に畑を作ると温室になる' };

/* ================= 図鑑（地球儀で学ぶ） ================= */
async function atlas(back) {
  stop();
  const ov = document.createElement('div'); ov.className = 'atlas';
  ov.innerHTML = `<canvas id="ag" aria-label="地球儀。ピンを押すと、その土地の暮らしの仕組みが読める"></canvas><aside id="aside"></aside>`;
  document.body.appendChild(ov);
  await loadLand();
  const cv = document.getElementById('ag'); const g = createGlobe(cv, { lon: -40, lat: 15 });
  g.pins = ATLAS.map(a => ({ ...a, done: G.atlasRead.includes(a.id) }));
  if (G.s) g.pins.push({ id: 'me', name: '自分の土地', lon: E.SITES[G.s.site].lon, lat: E.SITES[G.s.site].lat, color: '#1F2A2E', always: true });
  const aside = document.getElementById('aside');
  const list = () => {
    aside.innerHTML = `<h2>地球儀で学ぶ</h2><p class="small">世界の土地で、人が水・土・生き物とどう関わってきたか。地球儀を回して、ピンを押す。</p>
      <div class="list">${ATLAS.map(a => `<button data-a="${a.id}" class="${G.atlasRead.includes(a.id) ? 'done' : ''}">${esc(a.name)} <span class="small">${esc(a.place)}</span></button>`).join('')}</div>
      <button class="btn" id="aback">戻る</button>`;
    aside.querySelectorAll('[data-a]').forEach(b => b.onclick = () => open(ATLAS.find(a => a.id === b.dataset.a)));
    aside.querySelector('#aback').onclick = close;
  };
  const open = (a) => {
    g.pins.forEach(p => p.active = p.id === a.id);
    flyTo(g, { lon: a.lon, lat: Math.max(-50, Math.min(50, a.lat)), scale: 1.25 }, 900);
    const tech = a.tech && NOTES[a.tech];
    const canLearn = G.s && tech && !G.s.known.includes(a.tech);
    aside.innerHTML = `<div class="small">${esc(a.place)}</div><h2>${esc(a.name)}</h2><p style="margin:0">${esc(a.text)}</p>
      ${tech ? `<div class="note"><b>つながる技術：${esc(tech.name)}</b><span>${esc(tech.what)}</span></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="read">${G.atlasRead.includes(a.id) ? '読んだ' : 'ノートに書く'}</button><button class="btn" id="alist">一覧へ</button></div>
      ${canLearn ? `<p class="small">ノートに書くと、${esc(tech.name)}を自分の土地でも試せるようになる。</p>` : ''}`;
    aside.querySelector('#read').onclick = () => {
      if (!G.atlasRead.includes(a.id)) { G.atlasRead.push(a.id); saveAtlasRead(); }
      if (canLearn) { G.s = E.learn(G.s, a.tech, 'atlas'); persist(); }
      g.pins.forEach(p => { if (p.id === a.id) p.done = true; }); g.draw(); list();
    };
    aside.querySelector('#alist').onclick = list;
  };
  const close = () => { cancelAnimationFrame(g.raf); ov.remove(); window.removeEventListener('resize', onR); back(); };
  const onR = () => { g.size(); g.draw(); }; window.addEventListener('resize', onR);
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, lon: g.lon, lat: g.lat, moved: false }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; g.lon = drag.lon - dx * 0.35; g.lat = Math.max(-80, Math.min(80, drag.lat + dy * 0.35)); g.draw(); }
    else { const p = g.pick(e.clientX, e.clientY); if (p !== g.hover) { g.hover = p; g.draw(); cv.style.cursor = p ? 'pointer' : 'grab'; } }
  });
  cv.addEventListener('pointerup', (e) => { const m = drag && drag.moved; drag = null; if (!m) { const p = g.pick(e.clientX, e.clientY); if (p && p.id !== 'me') open(ATLAS.find(a => a.id === p.id)); } });
  list(); g.draw();
}

window.__orb = { G, E, open3D, openHouse, openBuild };   // 自動テスト用
title();
