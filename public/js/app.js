import * as E from './engine.js';
import { NOTES, LESSON, eventText, ATLAS, PROLOGUE, INVITE, LANDS } from './content.js';
import { createGlobe, flyTo, loadLand } from './globe.js';
import { createView, sunVector, dirName } from './iso.js';

const KEY = 'orbarium-v4';
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
    <p class="small">気候と地形はメデジンの平年値をもとにした試作です</p></div></main>`;
  await loadLand();
  const g = createGlobe(document.getElementById('globe'), { lon: 140, lat: 20 });
  let run = true; const spin = () => { if (!run) return; g.lon -= 0.08; g.draw(); requestAnimationFrame(spin); }; spin();
  const onR = () => { g.size(); g.draw(); }; window.addEventListener('resize', onR);
  stopAnim = () => { run = false; window.removeEventListener('resize', onR); };
  document.getElementById('new').onclick = () => { if (!saved || confirmBox('今の暮らしを消して、はじめからにしますか？')) travel({ lon: 60, lat: 20, name: '' }, E.SITES.tokyo, prologue); };
  const c = document.getElementById('cont'); if (c) c.onclick = () => { G.s = saved; game(); };
  document.getElementById('atlas').onclick = () => atlas(() => title());
}
function confirmBox(msg) { return window.confirm(msg); }

/* ================= 序章：東京（見るだけ。ほかの土地と同じ画面） ================= */
const TOKYO_TABS = [['web', 'めぐり'], ['book', '家計簿'], ['plan', '予定'], ['sky', '天気'], ['note', 'ノート']];
function prologue() {
  stop();
  const T = E.tokyoYear();
  let i = 0, tab = 'web';
  app.innerHTML = `<div class="game">
    <header class="bar"><div class="brand">Orbarium</div><div class="where">東京・30m²の賃貸 · 3階</div><div class="when">2026年 秋</div>${wallet(null, T)}</header>
    <section class="left"><div class="mapzone">${tokyoMap()}</div><div class="story" id="story" aria-live="polite"></div></section>
    <section class="right"><nav class="tabs" id="ttabs"></nav><div class="panel" id="tpanel"></div></section></div>`;
  const tabs = () => {
    document.getElementById('ttabs').innerHTML = TOKYO_TABS.map(([k, n]) => `<button class="tab${tab === k ? ' on' : ''}" data-tt="${k}">${n}</button>`).join('');
    document.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { tab = b.dataset.tt; tabs(); });
    document.getElementById('tpanel').innerHTML = tokyoPanel(T, tab);
  };
  tabs();
  const story = document.getElementById('story');
  const show = () => {
    if (i < PROLOGUE.length) {
      story.innerHTML = `<div>${esc(PROLOGUE[i])}</div><div class="row"><button class="btn" id="skip">とばす</button><button class="btn" id="next">次へ</button></div>`;
      document.getElementById('next').onclick = () => { i++; show(); };
      document.getElementById('skip').onclick = () => { i = PROLOGUE.length; show(); };
    } else {
      story.innerHTML = `<div class="mailcard"><div class="small">メール · ${esc(INVITE.from)}</div><b>${esc(INVITE.subject)}</b><div>${esc(INVITE.body)}</div></div><div class="row"><button class="btn" id="go">300万円を持って、行ってみる</button></div>`;
      document.getElementById('go').onclick = () => travel(E.SITES.tokyo, E.SITES.med, startGame);
    }
  };
  show();
  drawTokyo();
  window.onresize = () => { if (document.getElementById('tmap')) drawTokyo(); };
}
function tokyoMap() { return `<div class="mapwrap" id="tmap" style="height:100%"></div>`; }
function drawTokyo() {
  const tw = E.tokyoWorld(), m = tw.mine;
  draw2D(document.getElementById('tmap'), tw, {
    label: '東京の部屋のまわり。台地を小さな川が削った谷で、川はいまは暗渠の道になっている。水・電気・食べものは外から届き、下水とごみは外へ消える',
    caption: '↑北　谷の地形（場所はぼかしてある）・1段=高さ1m',
    onCell: () => open3D(m.x, m.y, 'house', { world: tw, readOnly: true }),
    overlay: (ctx, pad, c, dpr) => {
      const P = (x, y) => [pad + x * c, pad + y * c], me = P(m.x + 0.5, m.y + 0.5);
      const arrow = (from, to, col, text, tx, ty) => {
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5 * dpr; ctx.setLineDash([7 * dpr, 4 * dpr]);
        ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke(); ctx.setLineDash([]);
        const a = Math.atan2(to[1] - from[1], to[0] - from[0]), L = 9 * dpr;
        ctx.beginPath(); ctx.moveTo(...to); ctx.lineTo(to[0] - L * Math.cos(a - 0.4), to[1] - L * Math.sin(a - 0.4)); ctx.lineTo(to[0] - L * Math.cos(a + 0.4), to[1] - L * Math.sin(a + 0.4)); ctx.fill();
        ctx.font = `700 ${12 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillStyle = 'rgba(251,250,245,.85)'; const w = ctx.measureText(text).width; ctx.fillRect(tx - 3 * dpr, ty - 13 * dpr, w + 6 * dpr, 17 * dpr); ctx.fillStyle = col; ctx.fillText(text, tx, ty);
      };
      arrow(P(-0.5, m.y - 6), me, '#2B6CB0', '水道 ← どこかのダム', ...P(0.5, m.y - 7));
      arrow(P(m.x - 4, -0.5), me, '#C08A1E', '電気 ← どこかの発電所', ...P(m.x - 3, 2));
      arrow(P(m.x + 10, 50.5), me, '#3F7D4E', '食べもの ← どこかの畑', ...P(m.x + 4, 48.5));
      arrow(me, P(50.5, m.y + 8), '#8A4513', '下水 → 処理場の先の川', ...P(31, m.y + 11));
      ctx.font = `700 ${12 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillStyle = '#1F2A2E'; ctx.fillText('あなたの部屋（3階）', me[0] + 8 * dpr, me[1] - 6 * dpr);
      ctx.font = `${11 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillStyle = '#5E4A30'; ctx.fillText('暗渠になった川（いまは道）', ...P(2, 30));
    }
  });
}
function tokyoPanel(T, tab) {
  const c = T.cost;
  if (tab === 'book') return `<div><h2>家計簿 · 東京の1年</h2><p class="small">財布は円の一つだけ。水も電気も食べものも、円で買う。</p></div>
  <div class="rows"><span>給料（会社で週5日）</span><b class="num">+${man(T.income)}</b>
  <span>家賃</span><b class="num neg">−${man(c.rent)}</b><span>食べもの ${T.flows.food}kg</span><b class="num neg">−${man(c.food)}</b>
  <span>水道 ${Math.round(T.flows.water)}m³</span><b class="num neg">−${man(c.water)}</b><span>電気 ${Math.round(T.flows.power).toLocaleString()}kWh</span><b class="num neg">−${man(c.power)}</b>
  <span>そのほかの暮らし・通勤</span><b class="num neg">−${man(c.living + c.commute)}</b><span class="tot">残る</span><b class="num tot">+${man(T.save)}</b></div>
  <h3>外から買ったもの・外へ出したもの</h3><div class="rows"><span>水を買った</span><b class="num">${Math.round(T.flows.water)}m³</b><span>電気を買った</span><b class="num">${Math.round(T.flows.power).toLocaleString()}kWh</b><span>食べものを買った</span><b class="num">${T.flows.food}kg</b><span>下水に流した</span><b class="num">${Math.round(T.flows.sewer)}m³</b><span>ごみに出した</span><b class="num">${T.flows.garbage}kg</b></div>`;
  if (tab === 'plan') return `<div><h2>予定 · 週の過ごし方</h2><p class="small">変えられない。平日は会社、週末は休み。</p></div>
    <div class="week"><span></span>${E.WEEKDAYS.map(d => `<span>${d}</span>`).join('')}<span style="text-align:left">あなた</span>${['work', 'work', 'work', 'work', 'work', 'rest', 'rest'].map(v => `<button class="cell ${v}" disabled>${v === 'work' ? '会社' : '休み'}</button>`).join('')}</div>
    <p class="small">外貨（円）を稼ぐ日が5日、ほかは休む日。土や水や生き物に手をかける日はない。</p>`;
  if (tab === 'sky') return `<div><h2>天気</h2><p class="small">東京の雨は年に1,500mmほど。でも、この部屋の暮らしには関係しない。雨が降っても降らなくても、水道から同じ水が来る。屋根に降った雨は、そのまま側溝から下水へ流れていく。</p></div>`;
  if (tab === 'note') return `<div><h2>ノート</h2><p class="small">まだ何も書いていない。</p></div>${['家', '雨水タンク', '畑'].map(() => `<div class="note locked"><b>？？？</b><span>まだ知らない。</span></div>`).join('')}`;
  return `<div><h2>めぐり</h2><p class="small">この部屋にも、水・養分・エネルギー・お金の4つの輪が流れている。流れる量は少なくない。でも、どの輪もこの部屋と近所の中ではほとんど閉じず、遠くへ抜けていく。</p></div>
  ${cycleSVG(E.tokyoCycles())}${cycleList(E.tokyoCycles())}`;
}

/* ================= 地球儀で移動 ================= */
async function travel(from = E.SITES.tokyo, to = E.SITES.med, after = startGame) {
  stop();
  app.innerHTML = `<div class="travel"><div class="cap" id="cap">${from.name ? `${esc(from.name)}から、${esc(to.name)}へ` : esc(to.name)}</div><canvas id="tg" aria-hidden="true"></canvas><button class="btn skip" id="skip">とばす</button></div>`;
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
      cap.textContent = to.key === 'tokyo' || to === E.SITES.tokyo ? '東京・30m²の賃貸' : `${to.name}・標高${to.elev.toLocaleString()}m`;
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
      travel(from, to, () => {
        G.s = E.newGame({ site: k, seed: Math.floor(Math.random() * 1e6), cash: s.cash - to.plotPrice, persons: s.persons, known: s.known, learned: s.learned, year: s.year, flags: { history: hist } });
        G.s.q = s.q; G.tab = 'web'; G.cat = null; persist(); game();
      });
    }
  });
}
function startGame() {
  G.s = E.newGame({ seed: Math.floor(Math.random() * 1e6) });
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
  document.getElementById('bar').innerHTML = `<div class="brand">Orbarium</div><div class="where">${esc(site.name)} · 区画50m四方</div>
    <div class="when">${s.year}年 ${esc(site.quarters[s.q])}</div>${wallet(s)}
    <button class="menu" id="menu" aria-label="メニュー"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 6h14M3 10h14M3 14h14"/></svg></button>`;
  document.getElementById('menu').onclick = menu;
}
function menu() {
  modal(`<h2>メニュー</h2><div style="display:flex;flex-direction:column;gap:8px">
    ${G.s.flags['done_' + G.s.site] != null ? '<button class="btn primary" data-m="next">次の土地を選ぶ</button>' : ''}<button class="btn" data-m="atlas">地球儀で学ぶ（図鑑）</button><button class="btn" data-m="title">タイトルへ（自動で保存）</button><button class="btn ghost" data-m="close">閉じる</button></div>`, (m, close) => {
    if (m === 'atlas') { close(); atlas(() => game()); }
    if (m === 'next') { close(); chooseLand(); }
    if (m === 'title') { close(); title(); }
    if (m === 'close') close();
  });
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
  const hint = hintText();
  draw2D(wrap, s.world, { label: '敷地の地図。50m四方、1マス1m。色が濃いほど低い段。押すとその場所を3Dで拡大', hint,
    onCell: (x, y) => { const hs = G.s.world.house; openBuild(x, y, { cat: hs && hs.cells[`${x},${y}`] ? 'house' : null }); }, onHover: (p) => { G.hoverCell = p; renderInspect(); } });
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
  ctx.fillStyle = '#4A544F'; ctx.font = `${11 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillText(o.caption || '↑北　1マス=1m・1段=高さ1m', pad, pad - 5 * dpr);
  if (o.overlay) o.overlay(ctx, pad, c, dpr);
  const cell = (e) => { const b = cv.getBoundingClientRect(); const x = Math.floor(((e.clientX - b.left) * dpr - pad) / c), y = Math.floor(((e.clientY - b.top) * dpr - pad) / c); return x >= 0 && y >= 0 && x < 50 && y < 50 ? [x, y] : null; };
  if (o.onCell) cv.onclick = (e) => { const p = cell(e); if (p) o.onCell(p[0], p[1]); };
  if (o.onHover) cv.onmousemove = (e) => o.onHover(cell(e));
}
function hintText() {
  const s = G.s, S = E.summarize(s);
  if (s.turn === 0 && s.site === 'med') return 'オレンジ色が、前の持ち主が建てた小さな板壁の家（12m²、高さ3m。トイレ・シャワー・ベッド・テーブルつき）。地図を押すとその場所を拡大して、何を作るか選べます。準備ができたら右下で3か月進めます。';
  return '';
}
function renderTools() {
  document.getElementById('tools').innerHTML = `<p class="tools-hint">地図を押すと、その場所を拡大します。拡大した先で、家・畑・水まわりなど何を作るか選べます。</p>`;
}
function renderInspect() {
  const el = document.getElementById('inspect'); if (!el) return;
  const s = G.s, w = s.world, S = E.summarize(s);
  const lines = [];
  if (G.hoverCell) { const [x, y] = G.hoverCell, tb = topBlock(w, x, y); lines.push(`(${x}, ${y}) · 標高 ${E.W.h(w, x, y) + w.base}m${w.H0[y * 50 + x] !== E.W.h(w, x, y) ? `（もとは${w.H0[y * 50 + x] + w.base}m）` : ''}${tb ? ' · ' + E.W.BLOCKS[tb.b.t].name : ''}`); }
  const diag = S.diag.slice(0, 3).map(d => `<div class="${d.lv === 'warn' ? 'ng' : 'small'}">${d.lv === 'warn' ? '⚠ ' : ''}${esc(d.text)}</div>`).join('');
  if (!lines.length && !diag) { el.classList.add('idle'); el.innerHTML = ''; return; }
  el.classList.remove('idle');
  el.innerHTML = `<div>${lines.map(esc).join('<br>')}${diag}</div>`;
}
function alertBox(msg) { modal(`<p>${esc(msg)}</p><button class="btn" data-m="ok">OK</button>`, (m, c) => c()); }

/* ---------- 3D：押した場所を拡大して作る ---------- */
/* ==================== 拡大して作る（地図を押す → その場所で何を作るか選ぶ） ==================== */
const BUILD = [
  { id: 'house', name: '家', sub: '間取り・窓と扉・素材・家具。設計して、見積もりを見てから建てる', color: '#E8A15A' },
  { id: 'farm', name: '畑', sub: '畑を広げる・石垣・マルチ・温室・堆肥・木', color: '#7FB069' },
  { id: 'water', name: '水まわり', sub: '雨水タンク・ポンプ・ため池・排水の浄化', color: '#7FB2DA' },
  { id: 'other', name: 'そのほか', sub: '小屋・太陽光・ニワトリ・生け垣・掘る・盛る・平らにする', color: '#B8A98A' }
];
const PALETTE = {
  farm: { tools: [['beds', '畑を広げる（2点を押す）'], ['stone', '石垣（段差のある畑を押す）', 'terrace'], ['mulch', 'マルチ（畑を押す）', 'mulch'], ['cover', '覆いをかけて温室に（畑を押す）', 'greenhouse']], blocks: ['bed', 'heap', 'tree'] },
  water: { tools: [['pond', 'ため池を掘る（2点）', 'pond'], ['filter', '排水の浄化の穴（2点）', 'grey']], blocks: ['tank', 'pump', 'settle'] },
  other: { tools: [['shed', '柱と屋根の小屋（2点）'], ['dig', '掘る（1段）'], ['fill', '盛る（1段）'], ['level', '平らにする（2点）']], blocks: ['pv', 'coop', 'hedge'] }
};
const MAT = { media: 'media_sand', plant: 'plant_reed', roof: 'roof_tin' };
function knownBlock(t) { const d = E.W.BLOCKS[t]; return !d.learn || G.s.known.includes(d.learn); }
function knownTech(id) { return !id || G.s.known.includes(id); }
function houseCenter() { const hs = G.s.world.house; if (!hs) return [25, 25]; const cs = Object.keys(hs.cells).map(k => k.split(',').map(Number)); return [Math.round(cs.reduce((a, c) => a + c[0], 0) / cs.length), Math.round(cs.reduce((a, c) => a + c[1], 0) / cs.length)]; }
function open3D(cx, cy, cat, o3 = {}) { openBuild(cx, cy, { ...o3, cat }); }
function openHouse() { const [x, y] = houseCenter(); openBuild(x, y, { cat: 'house' }); }
function openBuild(cx, cy, o = {}) {
  const world = o.world || G.s.world, ro = !!o.readOnly;
  const ov = document.createElement('div'); ov.className = 'iso3d';
  ov.innerHTML = `<div class="iso-in" role="dialog" aria-modal="true" aria-label="拡大して作る">
    <div class="iso-stage"><canvas id="isoc"></canvas><canvas id="isomini" class="iso-mini" aria-label="全体の地図。枠がいま見ている場所。押すとそこへ移動"></canvas>
      <div class="iso-views" role="group" aria-label="見え方">${ro ? '' : `<button data-view="up" class="on" title="屋根までできあがった姿">できあがり</button><button data-view="cut" title="手前の壁だけ下げて、中と奥の壁を見る">中を見る</button><button data-view="down" title="壁を全部低くして、床と家具を見る">壁を下げる</button><button data-view="top" title="真上から（北が上、等高線つき）">真上から</button>`}<button data-sun="1" class="sun"></button></div>
      <div class="iso-nav"><button class="btn" data-nav="rl" aria-label="左に回す">↺</button><button class="btn" data-nav="rr" aria-label="右に回す">↻</button><button class="btn" data-nav="zi" aria-label="拡大">＋</button><button class="btn" data-nav="zo" aria-label="縮小">−</button>
      <button class="btn" data-nav="u" aria-label="奥へ">↑</button><button class="btn" data-nav="d" aria-label="手前へ">↓</button><button class="btn" data-nav="l" aria-label="左へ">←</button><button class="btn" data-nav="r" aria-label="右へ">→</button></div>
      <div class="iso-tip" id="isotip"></div></div>
    <aside class="iso-side" id="isoside"></aside></div>`;
  document.body.appendChild(ov);
  const st = { cat: null, view: 'up', tool: null, a: null, msg: '', drag: null, sel: -1, spot: [cx, cy] };
  const site = E.SITES[ro ? 'tokyo' : G.s.site], month = ro ? 5 : G.s.q * 3 + 2;
  const v = createView(document.getElementById('isoc'), world, { cx, cy, R: 8, lat: site.lat, month }); G.view = v; G.build = st;
  const sunBtn = ov.querySelector('[data-sun]');
  const sunLabel = () => { if (!sunBtn) return; const sv = v.sun; sunBtn.textContent = `☀ ${v.hour}時 · ${dirName(sv.az)}から${Math.round(sv.elev)}°`; sunBtn.title = `${month}月の${v.hour}時の日差し。押すと時刻が変わる（8・10・12・14・16時）`; };
  if (sunBtn) sunBtn.onclick = () => { const hs = [8, 10, 12, 14, 16]; v.setSun(null, null, hs[(hs.indexOf(v.hour) + 1) % hs.length]); sunLabel(); v.draw(); };
  sunLabel();
  const mini = document.getElementById('isomini'), tip = document.getElementById('isotip'), cv = document.getElementById('isoc');
  const houseDirty = () => st.cat === 'house' && JSON.stringify(st.draft) !== JSON.stringify(st.base);
  const setView = (vw) => {
    const wasTop = v.top; st.view = vw; v.top = vw === 'top'; v.wallMode = vw === 'top' ? 'down' : vw;
    if (v.top && !wasTop) { st.angle3d = v.angle; v.angle = 0; } else if (!v.top && wasTop) v.angle = st.angle3d ?? v.angle;
    ov.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x.dataset.view === vw));
  };
  const side = () => ro ? renderReadOnlySide(close) : !st.cat ? renderBuildMenu(st) : st.cat === 'house' ? renderHouseDesign(st) : renderIsoSide(st);
  const redraw = () => { v.house = st.cat === 'house' ? st.draft : null; v.base = st.cat === 'house' ? st.base : null; v.selFurn = st.cat === 'house' ? st.sel : -1; v.draw(); miniMap(mini, world, v); side(); };
  st.redraw = redraw;
  st.setCat = (cat, force) => {
    if (!force && houseDirty() && cat !== 'house') { st.confirm = cat || '__menu'; side(); return; }
    st.confirm = null; st.cat = cat; st.msg = ''; st.a = null; st.sel = -1; v.rect = null; v.ghost = null; v.ghostEdge = null; v.furnGhost = null;
    if (cat === 'house') {
      st.base = world.house; st.draft = E.W.cloneHouse(st.base); st.undo = []; st.tab = st.tab || 'plan'; st.tool = 'add'; G.house = st;
      const [hx, hy] = houseCenter(); v.cx = hx; v.cy = hy; v.R = 7; v.zoom = 1.25; if (!v.top) v.angle = houseAngle(st.base); setView('cut');
    } else {
      G.house = null; st.draft = null; st.base = null; v.R = 8;
      if (cat) st.tool = PALETTE[cat].tools.find(t => knownTech(t[2]))?.[0] || PALETTE[cat].blocks.find(knownBlock) || 'erase';
      if (st.view === 'cut' || st.view === 'down') setView('up');
    }
    redraw();
  };
  const close = (force) => {
    if (!force && houseDirty()) { st.confirm = '__close'; side(); return; }
    cancelAnimationFrame(v.anim); ov.remove(); window.removeEventListener('resize', onR); document.removeEventListener('keydown', onKey); G.house = null; G.build = null; if (!ro) { persist(); renderAll(); }
  };
  st.close = close;
  const onR = () => { v.size(); v.draw(); miniMap(mini, world, v); }; window.addEventListener('resize', onR);
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'q') v.rotate(-1); if (e.key === 'e') v.rotate(1); if (st.cat === 'house' && (e.ctrlKey || e.metaKey) && e.key === 'z') { st.doUndo(); e.preventDefault(); } };
  document.addEventListener('keydown', onKey);
  st.doUndo = () => { if (!st.undo.length) return; st.draft = st.undo.pop(); st.msg = ''; st.sel = -1; v.furnGhost = null; redraw(); };
  st.edit = (fn) => { const before = E.W.cloneHouse(st.draft); const r = fn(st.draft); if (JSON.stringify(before) !== JSON.stringify(st.draft)) st.undo.push(before); return r; };
  ov.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const n = b.dataset.nav;
    if (n === 'rl') v.rotate(-1); if (n === 'rr') v.rotate(1);
    if (n === 'zi') { v.zoom = Math.min(2.4, v.zoom * 1.25); v.draw(); } if (n === 'zo') { v.zoom = Math.max(0.5, v.zoom / 1.25); v.draw(); }
    if (n === 'u') v.pan(0, -1); if (n === 'd') v.pan(0, 1); if (n === 'l') v.pan(-1, 0); if (n === 'r') v.pan(1, 0);
    miniMap(mini, world, v);
  });
  ov.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { setView(b.dataset.view); v.draw(); });
  mini.onclick = (e) => { const r = mini.getBoundingClientRect(); v.cx = Math.max(0, Math.min(49, Math.floor((e.clientX - r.left) / r.width * 50))); v.cy = Math.max(0, Math.min(49, Math.floor((e.clientY - r.top) / r.height * 50))); v.draw(); miniMap(mini, world, v); };
  // 押す・なぞる
  const cellOf = (f) => !f ? null : (f.type === 'terrain' && f.face === 4) || f.type === 'floor' || f.type === 'furn' ? [f.x, f.y] : null;
  const rectFrom = (a, b) => ({ xa: Math.min(a[0], b[0]), xb: Math.max(a[0], b[0]), ya: Math.min(a[1], b[1]), yb: Math.max(a[1], b[1]) });
  const okCell = (x, y) => !!st.draft.cells[`${x},${y}`] || !E.W.cellProblem(world, st.draft, x, y);
  const isOpenTool = () => ['window', 'window2', 'door', 'unopen'].includes(st.tool);
  const isHouseFace = (f) => f && ['floor', 'wall', 'roof', 'furn'].includes(f.type);
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => {
    if (ro || st.cat !== 'house' || !['add', 'remove'].includes(st.tool)) return;
    const c = cellOf(v.pickAt(e.clientX, e.clientY)); if (!c) return;
    st.drag = { a: c, b: c }; cv.setPointerCapture(e.pointerId);
    v.rect = { ...rectFrom(c, c), mode: st.tool === 'remove' ? 'remove' : 'add', ok: okCell }; v.draw();
  });
  cv.addEventListener('pointermove', (e) => {
    const f = v.pickAt(e.clientX, e.clientY);
    tip.textContent = f ? describeFace(f) : '';
    const hc = f && ['terrain', 'floor', 'block', 'furn'].includes(f.type) ? [f.x, f.y] : null, moved = String(hc) !== String(v.hoverCell);
    v.hoverCell = hc;
    if (ro || !st.cat) { if (!ro) cv.style.cursor = isHouseFace(f) ? 'pointer' : 'default'; if (moved) v.draw(); return; }
    cv.style.cursor = 'crosshair';
    if (st.cat !== 'house') { v.ghost = ghostFor(st, f); v.draw(); return; }
    if (st.drag) { const c = cellOf(f); if (c) { st.drag.b = c; v.rect = { ...rectFrom(st.drag.a, c), mode: st.tool === 'remove' ? 'remove' : 'add', ok: okCell }; v.draw(); } return; }
    if (isOpenTool()) { v.ghostEdge = f && f.type === 'wall' ? { e: f.e, t: st.tool === 'unopen' ? 'remove' : st.tool, low: v.wallMode !== 'up' } : null; v.draw(); return; }
    if (st.tool === 'furn') { const c = cellOf(f); if (st.sel >= 0 && c) { const fu = { ...st.draft.furn[st.sel], x: c[0], y: c[1], r: st.selR }; v.furnGhost = { ...fu, ok: !E.W.furnProblem(st.draft, fu, st.sel) }; } else v.furnGhost = null; v.draw(); return; }
    const c = cellOf(f); v.rect = c ? { ...rectFrom(c, c), mode: st.tool === 'remove' ? 'remove' : 'add', ok: okCell } : null; v.draw();
  });
  cv.addEventListener('pointerleave', () => { if (!st.drag) { v.rect = null; v.ghostEdge = null; v.ghost = null; v.hoverCell = null; v.draw(); tip.textContent = ''; } });
  cv.addEventListener('pointerup', (e) => {
    if (ro) return;
    const f = v.pickAt(e.clientX, e.clientY);
    if (!st.cat) { if (isHouseFace(f)) st.setCat('house'); return; }
    if (st.cat !== 'house') { if (!f) return; act(st, f); v.ghost = null; redraw(); return; }
    if (isOpenTool()) {
      if (f && f.type === 'wall') { const t = st.tool === 'unopen' ? null : st.tool; st.msg = st.edit(d => E.W.draftSetOpening(d, f.e, t)) || ''; }
      else st.msg = '家の外壁を押してください';
      v.ghostEdge = null; redraw(); return;
    }
    if (st.tool === 'furn') {
      if (st.sel < 0) { if (f && f.type === 'furn') { st.sel = f.i; st.selR = st.draft.furn[f.i].r || 0; st.msg = `${E.W.FURN[st.draft.furn[f.i].t].name}を置く場所の床を押す（［回す］で向きを変える）`; } else st.msg = '動かしたい家具を押す'; redraw(); return; }
      const c = cellOf(f); if (!c) return;
      const err = st.edit(d => E.W.draftMoveFurn(d, st.sel, c[0], c[1], st.selR));
      if (err) st.msg = `置けない：${err}`; else { st.msg = '動かした（設計の上だけ）'; st.sel = -1; v.furnGhost = null; }
      redraw(); return;
    }
    if (!st.drag) return;
    const { xa, xb, ya, yb } = rectFrom(st.drag.a, st.drag.b); st.drag = null; v.rect = null;
    if (st.tool === 'remove') { const r = st.edit(d => E.W.draftRemoveRect(d, xa, ya, xb, yb)); st.msg = r.removed ? `床を${r.removed}m²減らした（設計の上だけ）` : 'そこに床はない'; }
    else { const r = st.edit(d => E.W.draftAddRect(world, d, xa, ya, xb, yb)); const why = Object.entries(r.why).map(([k, n]) => `${k}（${n}マス）`).join('・'); st.msg = (r.added ? `床を${r.added}m²足した（設計の上だけ）` : '床を足せなかった') + (why ? `。置けない所：${why}` : ''); }
    redraw();
  });
  v.size();
  if (o.cat && !ro) st.setCat(o.cat); else redraw();
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
  if (f.type === 'terrain') return `地面 · 標高 ${f.z + 1 + w.base}m${w.H0[f.y * 50 + f.x] - 1 > f.z ? '（掘った穴）' : ''}`;
  if (f.type === 'wall') return f.op ? `${E.W.OPENINGS[f.op].name}（${E.W.WALLS[hs.wall].name}）` : E.W.WALLS[hs.wall].name;
  if (f.type === 'floor') return `${E.W.FLOORS[hs.floor].name} · 床の段 ${w.base + hs.z}m`;
  if (f.type === 'roof') return E.W.ROOFS[hs.roof].name;
  if (f.type === 'furn') return E.W.FURN[hs.furn[f.i].t].name;
  const d = E.W.BLOCKS[f.b.t]; return `${d.name}${f.b.p ? '（作業待ち）' : ''} · 高さ ${f.z + w.base}m`;
}
function sideHeader(st, title) {
  return `<header>${st.cat ? `<button class="btn ghost back" data-back="1" aria-label="作るものを選び直す">←</button>` : ''}<h2>${title}</h2><button class="btn ghost" id="isox">地図に戻る</button></header>`;
}
function bindHeader(st, el) {
  el.querySelector('#isox').onclick = () => st.close();
  const b = el.querySelector('[data-back]'); if (b) b.onclick = () => st.setCat(null);
}
function renderBuildMenu(st) {
  const s = G.s, el = document.getElementById('isoside'), [x, y] = st.spot;
  el.innerHTML = `${sideHeader(st, 'ここに何を作る？')}
    <div class="small">押した場所：標高 ${E.W.h(s.world, x, y) + s.world.base}m · 所持金 ${man(s.cash)}。作るものは近所の職人さんに頼む。</div>
    <div class="bcards">${BUILD.map(c => `<button class="bcard" data-cat="${c.id}"><i style="background:${c.color}"></i><span><b>${c.name}</b><span>${c.sub}</span></span></button>`).join('')}</div>
    <p class="small">3Dの家を押しても、家の設計に入ります。回す ↺↻（Q・Eキー）／ 拡大 ＋−／ 移動 矢印か右上の小さな地図。</p>`;
  bindHeader(st, el);
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => st.setCat(b.dataset.cat));
}
const SIDE6 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function target(f, t) {
  const w = G.s.world, d = E.W.BLOCKS[t];
  if (!f || !['terrain', 'block'].includes(f.type)) return null;
  if (d && (d.overlay || d.pit)) {
    if (f.type === 'terrain' && f.face === 4) return [f.x, f.y, f.z + 1];
    if (f.type === 'block' && f.face === 4 && d.kind === 'plant') return [f.x, f.y, f.z + 1];
    return null;
  }
  if (f.face === 4) return [f.x, f.y, f.z + 1];
  const [dx, dy] = SIDE6[f.face];
  if (f.type === 'terrain') return [f.x + dx, f.y + dy, E.W.h(w, f.x + dx, f.y + dy)];
  return [f.x + dx, f.y + dy, f.z];
}
const RECT = ['shed', 'beds', 'pond', 'filter', 'level'];
function ghostFor(st, f) {
  if (!f) return null;
  const w = G.s.world;
  if (E.W.BLOCKS[st.tool]) { const p = target(f, st.tool); if (!p) return null; return { ok: !E.W.canPut(w, ...p, st.tool), cells: [[p[0], p[1], p[2], E.W.BLOCKS[st.tool].overlay ? 0.15 : 1]] }; }
  if (RECT.includes(st.tool) && st.a) {
    const x0 = Math.min(st.a[0], f.x), x1 = Math.max(st.a[0], f.x), y0 = Math.min(st.a[1], f.y), y1 = Math.max(st.a[1], f.y), cells = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y, E.W.h(w, x, y), 0.2]);
    return { ok: true, cells };
  }
  if (st.tool === 'dig' || st.tool === 'fill') return f.type === 'terrain' && f.face === 4 ? { ok: true, cells: [[f.x, f.y, f.z + (st.tool === 'fill' ? 1 : 0), st.tool === 'fill' ? 1 : 0.15]] } : null;
  if (st.tool === 'erase' && f.type === 'block') return { ok: true, cells: [[f.x, f.y, f.z, 1.02]] };
  return null;
}
function act(st, f) {
  const s = G.s; let err = null;
  const T = st.tool, mode = 'hire';
  if (E.W.BLOCKS[T]) { const p = target(f, T); err = p ? E.W.put(s, ...p, T, mode) : 'ここには置けない'; }
  else if (T === 'erase') err = f.type === 'block' ? E.W.remove(s, f.x, f.y, f.z) : '外すものを押す';
  else if (T === 'dig') err = f.type === 'terrain' && f.face === 4 ? E.W.dig(s, f.x, f.y, mode) : '地面の上を押す';
  else if (T === 'fill') err = f.type === 'terrain' && f.face === 4 ? E.W.fill(s, f.x, f.y, mode) : '地面の上を押す';
  else if (['stone', 'mulch', 'cover'].includes(T)) err = f.type === 'block' && E.W.BLOCKS[f.b.t].kind === 'bed' ? E.W.toggleMark(s, f.x, f.y, f.z, { stone: 's', mulch: 'm', cover: 'g' }[T]) : '畑を押す';
  else if (RECT.includes(T)) {
    if (!['terrain', 'block'].includes(f.type)) return;
    if (!st.a) { st.a = [f.x, f.y]; st.msg = 'もう1つの角を押してください'; return; }
    const a = st.a, b = [f.x, f.y]; st.a = null;
    if (T === 'shed') err = E.W.prefabShed(s, a, b, MAT.roof, mode);
    if (T === 'beds') err = E.W.prefabBeds(s, a, b, mode);
    if (T === 'level') err = E.W.prefabLevel(s, a, b, mode);
    if (T === 'pond') err = E.W.prefabPit(s, a, b, 'pond', mode, 1);
    if (T === 'filter') err = E.W.prefabPit(s, a, b, MAT.media, mode, 1, MAT.plant);
  }
  st.msg = err || ''; persist();
}

/* ==================== 家の設計（設計図 → 見積もり → 建てる） ==================== */
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
function matCard(kind, k, M, on, extra = '') {
  const ok = knownTech(M.learn);
  const unit = kind === 'wall' ? '1m' : kind === 'open' ? '1つ' : '1m²';
  return `<button class="mcard${on ? ' on' : ''}" data-${kind}="${k}" ${ok ? '' : 'disabled'} aria-pressed="${on}">
    <i class="swatch pat-${M.pat || (M.door ? 'door' : 'glass')}" style="--c:${M.color}"></i>
    <span class="mc-b"><b>${ok ? esc(M.name) : '？ ' + esc(M.name)}</b><span class="note">${ok ? esc(M.note) : '「断熱」を学ぶと使える'}</span>
      <span class="meters"><span>断熱 <em>${dots(M.warm || 1)}</em></span>${M.store ? `<span>熱をためる <em>${dots(M.store)}</em></span>` : ''}${M.catch ? `<span>雨を集める <em>${dots(Math.round(M.catch * 5))}</em></span>` : ''}${extra}</span></span>
    <span class="price">${M.cost}<small>万円/${unit}</small></span></button>`;
}
function renderHouseDesign(st) {
  const s = G.s, el = document.getElementById('isoside'), d = st.draft, site = E.SITES[s.site];
  const known = (k) => knownTech(k);
  const est = E.W.estimate(s.world, st.base, d), probs = E.W.houseProblems(d);
  const m0 = E.W.houseModel(site, st.base, s.persons.length), m1 = E.W.houseModel(site, d, s.persons.length);
  const y0 = m0 ? houseYearStats(m0) : null, y1 = m1 ? houseYearStats(m1) : null;
  const dirty = JSON.stringify(d) !== JSON.stringify(st.base);
  const cmp = (label, a, b, better) => { const same = a === b; return `<span>${label}</span><b class="num">${a}${same ? '' : ` → <em class="${better === undefined ? '' : better ? 'good' : 'ng'}">${b}</em>`}</b>`; };
  const heatTxt = (y) => !y ? '—' : y.elec < 50 ? 'ほぼいらない' : `${Math.round(y.elec).toLocaleString()}kWh`;
  const tabs = [['plan', '間取り'], ['open', '窓と扉'], ['mat', '素材'], ['furn', '家具']];
  let body = '';
  if (st.tab === 'plan') body = `
    <div class="seg-o"><button class="opt${st.tool === 'add' ? ' on' : ''}" data-tool="add">床を広げる</button><button class="opt${st.tool === 'remove' ? ' on' : ''}" data-tool="remove">床を減らす</button></div>
    <p class="small">${st.tool === 'add' ? '地面をなぞると、その四角が床になる（いまの床につながる所だけ）。1段ちがう地面は、掘るか盛ってそろえる。家の裏が見えないときは［真上から］。' : '床をなぞると、その四角を減らす。'}</p>
    <div class="rows"><span>床の広さ</span><b class="num">${Object.keys(st.base.cells).length}m²${Object.keys(d.cells).length !== Object.keys(st.base.cells).length ? ` → ${Object.keys(d.cells).length}m²` : ''}</b><span>高さ</span><b class="num">3m（床の段 ${d.z + s.world.base}m）</b></div>`;
  if (st.tab === 'open') body = `
    <p class="small">選んでから、家の外壁を押す。窓は南（日の来る側）に向けると冬に暖かい。</p>
    <div class="mcards">${Object.entries(E.W.OPENINGS).map(([k, O]) => matCard('tool', k, O, st.tool === k)).join('')}
      <button class="mcard small${st.tool === 'unopen' ? ' on' : ''}" data-tool="unopen"><i class="swatch" style="--c:#D9534F"></i><span class="mc-b"><b>外す</b><span class="note">窓や扉を押すと、ふつうの壁に戻す</span></span></button></div>`;
  if (st.tab === 'furn') {
    const groups = [['toilet', 'トイレ'], ['shower', 'シャワー'], ['bed', 'ベッド'], ['table', 'テーブルと椅子']];
    body = `<p class="small">家具を押してから床を押すと動かせる（設計の上だけ、お金はかからない）。トイレとシャワーは種類を替えられる。</p>
      ${st.sel >= 0 ? `<div class="seg-o"><span class="small">いま動かしている：<b>${esc(E.W.FURN[d.furn[st.sel].t].name)}</b></span><button class="opt" data-frot="1">回す</button><button class="opt" data-fcancel="1">やめる</button></div>` : ''}
      ${groups.map(([g, gname]) => {
        const i = d.furn.findIndex(f => E.W.FURN[f.t].group === g); if (i < 0) return '';
        const kinds = Object.entries(E.W.FURN).filter(([, F]) => F.group === g);
        return `<h3>${gname} <button class="opt mini" data-fmove="${i}">${st.sel === i ? '動かし中…' : '動かす'}</button></h3>
          ${kinds.length > 1 ? `<div class="mcards">${kinds.map(([k, F]) => { const ok = knownTech(F.learn); return `<button class="mcard${d.furn[i].t === k ? ' on' : ''}" data-fswap="${i}:${k}" ${ok ? '' : 'disabled'}><i class="swatch" style="--c:${F.color}"></i><span class="mc-b"><b>${ok ? esc(F.name) : '？ ' + esc(F.name)}</b><span class="note">${ok ? esc(F.note) : '学ぶと使える'}</span></span><span class="price">${F.cost}<small>万円</small></span></button>`; }).join('')}</div>` : `<p class="small" style="margin:0">${esc(E.W.FURN[d.furn[i].t].note)}</p>`}`;
      }).join('')}`;
  }
  if (st.tab === 'mat') body = `
    <h3>壁 <span class="small">家全体の壁を、この素材で張る</span></h3><div class="mcards">${Object.entries(E.W.WALLS).map(([k, M]) => matCard('wall', k, M, d.wall === k)).join('')}</div>
    <h3>屋根 <span class="small">雨を集める面にもなる</span></h3><div class="mcards">${Object.entries(E.W.ROOFS).map(([k, M]) => matCard('roof', k, M, d.roof === k)).join('')}</div>
    <h3>床</h3><div class="mcards">${Object.entries(E.W.FLOORS).map(([k, M]) => matCard('floor', k, M, d.floor === k)).join('')}</div>
    <h3>そのほか</h3><div class="seg-o">
      <button class="opt${d.eaves ? ' on' : ''}" data-eaves="1">庇${d.eaves ? 'あり' : 'をつける'}（夏の日差しと雨を防ぐ）</button>
      ${known('offgrid') ? `<span class="step">屋根の太陽光 <button class="btn ghost" data-pv="-1" aria-label="減らす">−</button><b>${d.pv}枚</b><button class="btn ghost" data-pv="1" aria-label="増やす">＋</button></span><span class="step">蓄電池 <button class="btn ghost" data-batt="-1" aria-label="減らす">−</button><b>${d.batt}台</b><button class="btn ghost" data-batt="1" aria-label="増やす">＋</button></span>` : ''}
      <span class="step">基礎の深さ <button class="btn ghost" data-depth="-1" aria-label="浅く">−</button><b>${(d.eq.depth || E.summarize(s).depth).toFixed(1)}m</b><button class="btn ghost" data-depth="1" aria-label="深く">＋</button></span></div>`;
  const actions = st.confirm
    ? `<div class="h-act"><span class="small">建てていない設計があります。捨てますか？</span><button class="btn ghost" data-act="keep">設計を続ける</button><button class="btn" data-act="discard">捨てる</button></div>`
    : `<div class="h-act"><button class="btn ghost" data-act="undo" ${st.undo.length ? '' : 'disabled'}>元に戻す</button><button class="btn ghost" data-act="reset" ${dirty ? '' : 'disabled'}>やめる</button>
       <button class="btn primary" data-act="build" ${dirty && !probs.length && est.total <= s.cash ? '' : 'disabled'}>${dirty ? `この設計で建てる（${Math.round(est.total)}万円）` : '建てる（変更なし）'}</button></div>`;
  el.innerHTML = `${sideHeader(st, '家の設計')}
    <div class="small">設計図の上では、お金はかからない。下の［建てる］で、見積もりの額を払って近所の職人さんが建てる。所持金 ${man(s.cash)}</div>
    <div class="h-tabs" role="tablist">${tabs.map(([k, n]) => `<button role="tab" class="${st.tab === k ? 'on' : ''}" aria-selected="${st.tab === k}" data-tab3="${k}">${n}</button>`).join('')}</div>
    <div class="h-body">${body}</div>
    ${st.msg ? `<div class="iso-msg">${esc(st.msg)}</div>` : ''}
    <div class="stat2 h-est"><span>いま → この設計</span>
      <div class="rows">${cmp('広さ', `${m0?.A ?? 0}m²`, `${m1?.A ?? 0}m²`)}
      ${cmp('冬の暖房', heatTxt(y0), heatTxt(y1), y1 && y0 ? y1.elec <= y0.elec : undefined)}
      ${cmp('暑すぎる日', y0 ? `${y0.hot}日/年` : '—', y1 ? `${y1.hot}日/年` : '—', y1 && y0 ? y1.hot <= y0.hot : undefined)}
      ${cmp('屋根の裏の水滴', m0?.condenseProne ? 'つく' : 'つかない', m1?.condenseProne ? 'つく' : 'つかない', m1 ? !m1.condenseProne : undefined)}
      ${cmp('雨を集める屋根', `${Math.round((m0?.A || 0) * E.W.ROOFS[st.base.roof].catch)}m²`, `${Math.round((m1?.A || 0) * E.W.ROOFS[d.roof].catch)}m²`)}</div>
      ${dirty ? `<div class="est-lines">${est.lines.map(l => `<span>${esc(l.label)}${l.unit ? ` ${l.n}${l.unit}` : ''}</span><b class="num">${l.cost.toFixed(1)}万円</b>`).join('')}<span><b>合計</b></span><b class="num">${est.total.toFixed(1)}万円</b><span class="small">うち近所に回るお金</span><b class="num small">${est.local.toFixed(1)}万円</b></div>` : '<p class="small">まだ変えていない。</p>'}
      ${probs.map(p => `<div class="ng">${esc(p)}</div>`).join('')}${dirty && est.total > s.cash ? `<div class="ng">お金が足りない（あと${Math.ceil(est.total - s.cash)}万円）</div>` : ''}</div>
    ${actions}`;
  bindHeader(st, el);
  el.querySelectorAll('[data-tab3]').forEach(b => b.onclick = () => { st.tab = b.dataset.tab3; st.tool = st.tab === 'plan' ? 'add' : st.tab === 'open' ? 'window' : st.tab === 'furn' ? 'furn' : null; st.sel = -1; G.view.furnGhost = null; st.msg = ''; st.redraw(); });
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { st.tool = b.dataset.tool; st.msg = ''; renderHouseDesign(st); });
  el.querySelectorAll('[data-fmove]').forEach(b => b.onclick = () => { const i = +b.dataset.fmove; st.tool = 'furn'; st.sel = i; st.selR = d.furn[i].r || 0; st.msg = `${E.W.FURN[d.furn[i].t].name}を置く場所の床を押す`; st.redraw(); });
  el.querySelectorAll('[data-frot]').forEach(b => b.onclick = () => { st.selR = st.selR ? 0 : 1; const f = d.furn[st.sel]; if (E.W.FURN[f.t].d > 1 && !E.W.furnProblem(d, { ...f, r: st.selR }, st.sel)) { st.edit(dd => E.W.draftMoveFurn(dd, st.sel, f.x, f.y, st.selR)); } st.redraw(); });
  el.querySelectorAll('[data-fcancel]').forEach(b => b.onclick = () => { st.sel = -1; G.view.furnGhost = null; st.msg = ''; st.redraw(); });
  el.querySelectorAll('[data-fswap]').forEach(b => b.onclick = () => { const [i, t] = b.dataset.fswap.split(':'); st.edit(dd => E.W.draftSwapFurn(dd, +i, t)); st.msg = ''; st.redraw(); });
  const set = (fn) => { st.edit(fn); st.msg = ''; st.redraw(); };
  el.querySelectorAll('[data-wall]').forEach(b => b.onclick = () => set(d => { d.wall = b.dataset.wall; }));
  el.querySelectorAll('[data-roof]').forEach(b => b.onclick = () => set(d => { d.roof = b.dataset.roof; }));
  el.querySelectorAll('[data-floor]').forEach(b => b.onclick = () => set(d => { d.floor = b.dataset.floor; }));
  el.querySelectorAll('[data-eaves]').forEach(b => b.onclick = () => set(d => { d.eaves = !d.eaves; }));
  el.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => set(d => { d.pv = Math.max(st.base.pv, Math.min(Object.keys(d.cells).length, d.pv + +b.dataset.pv)); }));
  el.querySelectorAll('[data-batt]').forEach(b => b.onclick = () => set(d => { d.batt = Math.max(st.base.batt, Math.min(4, d.batt + +b.dataset.batt)); }));
  el.querySelectorAll('[data-depth]').forEach(b => b.onclick = () => set(d => { const cur = d.eq.depth || E.summarize(G.s).depth, min = st.base.eq.depth || E.summarize(G.s).depth; d.eq.depth = Math.round(Math.max(min, cur + 0.3 * +b.dataset.depth) * 10) / 10; }));
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'undo') st.doUndo();
    if (a === 'reset') { st.undo.push(E.W.cloneHouse(st.draft)); st.draft = E.W.cloneHouse(st.base); st.msg = '設計をいまの家に戻した'; st.redraw(); }
    if (a === 'keep') { st.confirm = null; renderHouseDesign(st); }
    if (a === 'discard') { const next = st.confirm; st.confirm = null; st.draft = E.W.cloneHouse(st.base); if (next === '__close') st.close(true); else st.setCat(next === '__menu' ? null : next, true); }
    if (a === 'build') {
      const cost = E.W.estimate(G.s.world, st.base, st.draft).total;
      const err = E.W.buildHouse(G.s, st.draft);
      if (err) st.msg = err;
      else { st.base = G.s.world.house; st.draft = E.W.cloneHouse(st.base); st.undo = []; st.sel = -1; st.msg = `建てた！（${Math.round(cost)}万円。人件費は近所の職人さんに）`; persist(); }
      st.redraw();
    }
  });
}

function renderReadOnlySide(close) {
  const el = document.getElementById('isoside');
  el.innerHTML = `<header><h2>東京の部屋</h2><button class="btn ghost" id="isox">戻る</button></header>
    <p style="margin:0">谷の斜面に建つ賃貸の3階、30m²。黄色いキューブがあなたの部屋。</p>
    <div class="stat2"><span>この部屋でできること</span><b>ほとんどない</b><span>壁も屋根も床も大家さんのもの。屋根の雨は側溝から下水へ。土は建物と道の下。</span></div>
    <p class="small">回す ↺↻ ／ 拡大 ＋− ／ 移動 矢印。見るだけ。</p>`;
  el.querySelector('#isox').onclick = close;
}
function renderIsoSide(st) {
  const s = G.s, S = E.summarize(s), el = document.getElementById('isoside');
  const P = PALETTE[st.cat];
  const blk = (t) => { const d = E.W.BLOCKS[t], k = knownBlock(t); return `<button class="opt${st.tool === t ? ' on' : ''}" data-tool="${t}" ${k ? '' : 'disabled'}><i class="sw" style="background:${d.color}"></i>${k ? esc(d.name) : '？ ' + esc(d.name)}<span class="pr">${E.W.blockPrice(t, st.mode).toFixed(1)}</span></button>`; };
  const filterOpts = st.cat === 'water' && knownTech('grey') ? `<div class="seg"><div class="seg-h"><b>浄化の穴に入れる層</b></div><div class="seg-o">${['media_gravel', 'media_sand', 'media_char'].map(t => `<button class="opt${MAT.media === t ? ' on' : ''}" data-mat="media:${t}">${esc(E.W.BLOCKS[t].name)}</button>`).join('')}</div>
      ${S.filter ? `<div class="seg-h"><b>きれいになった水の行き先</b></div><div class="seg-o">${Object.entries(E.B.OUTS).map(([k, o]) => `<button class="opt${s.world.mods.out === k ? ' on' : ''}" data-out="${k}">${o.name}</button>`).join('')}</div>` : ''}</div>` : '';
  el.innerHTML = `${sideHeader(st, BUILD.find(c => c.id === st.cat).name)}
    <div class="small">所持金 ${man(s.cash)} · 土の在庫 ${s.world.earth.toFixed(1)}m³ · 作るのは近所の人に頼む</div>
    <div class="seg"><div class="seg-h"><b>まとめて作る</b></div><div class="seg-o">${P.tools.map(([k, n, l]) => `<button class="opt${st.tool === k ? ' on' : ''}" data-tool="${k}" ${knownTech(l) ? '' : 'disabled'}>${knownTech(l) ? n : '？ ' + n}</button>`).join('')}</div></div>
    ${filterOpts}
    <div class="seg"><div class="seg-h"><b>1つずつ置く</b><span class="small">数字は1つの値段（万円）</span></div><div class="seg-o blocks">${P.blocks.map(blk).join('')}<button class="opt${st.tool === 'erase' ? ' on' : ''}" data-tool="erase">外す</button></div></div>
    ${st.msg ? `<div class="iso-msg">${esc(st.msg)}</div>` : ''}
    ${st.cat === 'water' ? `<div class="stat2"><span>雨を集める屋根</span><b>${Math.round(S.A.roofCatch / 0.85)}m²（タンク${S.A.fedTanks}/${S.A.tanks}つにつながる）</b>${S.A.roofLost > 0.5 ? `<span class="ng">${Math.round(S.A.roofLost / 0.85)}m²ぶんはタンクにつながっていない</span>` : ''}</div>` : ''}
    ${S.diag.length ? `<div class="stat2"><span>気になるところ</span>${S.diag.map(d => `<div class="${d.lv === 'warn' ? 'ng' : 'small'}">${esc(d.text)}</div>`).join('')}</div>` : ''}
    <p class="small">回す ↺↻（Q・Eキー）／ 拡大 ＋−／ 移動 矢印か右上の小さな地図。面を押すと、その面の外側に置きます。</p>`;
  bindHeader(st, el);
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { st.tool = b.dataset.tool; st.a = null; st.msg = RECT.includes(st.tool) ? '1つ目の角を押してください' : ''; st.redraw(); });
  el.querySelectorAll('[data-mat]').forEach(b => b.onclick = () => { const [k, t] = b.dataset.mat.split(':'); MAT[k] = t; st.redraw(); });
  el.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { G.s.world.mods.out = b.dataset.out; persist(); st.redraw(); });
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
    const items = [['仮住まい', -(m.rent || 0)], ['外貨の仕事', m.income], ['野菜・電気を売った', m.sell], ['仕事の経費', -m.jobCost], ['そのほかの暮らし', -m.living], ['食べものを買った', -m.food], ['水を買った', -m.water], ['電気を買った', -m.power], ['家の維持', -m.maint], ['設備の交換', -m.replace], ['修理', -m.repair]].filter(x => Math.abs(x[1]) >= 0.05);
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
