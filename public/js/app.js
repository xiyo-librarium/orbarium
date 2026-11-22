import * as E from './engine.js';
import { NOTES, LESSON, eventText, ATLAS, PROLOGUE, INVITE, LANDS } from './content.js';
import { createGlobe, flyTo, loadLand } from './globe.js';
import { createView } from './iso.js';

const KEY = 'orbarium-v3';
const app = document.getElementById('app');
const G = { s: null, tool: null, ghost: null, sel: null, tab: 'web', drag: null, report: null, studied: -1, atlasRead: loadAtlasRead() };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const man = (v) => `${Math.round(v).toLocaleString('ja-JP')}万円`;
const pct = (v) => `${Math.round(v * 100)}%`;
let stopAnim = null;
function stop() { if (stopAnim) { stopAnim(); stopAnim = null; } }

function persist() { try { localStorage.setItem(KEY, E.save(G.s)); } catch (e) { /* 保存できない環境 */ } }
function restore() { try { const v = localStorage.getItem(KEY); return v ? E.load(v) : null; } catch { return null; } }
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
  window.onkeydown = (e) => { if (e.key === 'Escape' && G.cat) { G.cat = null; renderAll(); } };
  window.onresize = () => { if (document.getElementById('map2d')) renderMap(); };
}
function renderAll() { renderBar(); renderMap(); renderTools(); renderInspect(); renderTabs(); renderPanel(); renderClose(); }

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
const CAT = [
  { id: 'house', name: '家', hint: '' },
  { id: 'farm', name: '畑', hint: 'どこに畑をつくりますか？ 地図を押すと、その場所を拡大します。段々の地形はそのまま段々の畑になります。' },
  { id: 'other', name: 'その他', hint: 'タンク・ため池・排水の浄化・小屋・ポンプなど。地図を押すと、その場所を拡大します。水は高い所から低い所へ流れます。' }
];
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
    onCell: (x, y) => { const hs = G.s.world.house; if (!G.cat && hs && hs.cells[`${x},${y}`]) open3D(x, y, 'house'); else open3D(x, y, G.cat || 'other'); }, onHover: (p) => { G.hoverCell = p; renderInspect(); } });
}
function draw2D(wrap, w, o) {
  wrap.innerHTML = `<canvas id="map2d" aria-label="${esc(o.label)}"></canvas>${o.hint ? `<div class="hint">${o.hint}</div>` : ''}`;
  const cv = wrap.querySelector('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = wrap.getBoundingClientRect(), side = Math.max(120, Math.min(r.width, r.height) - 16);
  cv.style.width = side + 'px'; cv.style.height = side + 'px'; cv.width = side * dpr; cv.height = side * dpr;
  const ctx = cv.getContext('2d'), pad = 18 * dpr, c = (cv.width - pad * 2) / 50;
  const max = Math.max(...w.H);
  ctx.fillStyle = '#E3E5DC'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const lv = E.W.h(w, x, y), dug = w.H0[y * 50 + x] > lv;
    ctx.fillStyle = levelColor(lv, max, dug); ctx.fillRect(pad + x * c, pad + y * c, c + 0.5, c + 0.5);
  }
  ctx.strokeStyle = 'rgba(90,100,80,.55)'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const lv = E.W.h(w, x, y);
    if (x < 49 && E.W.h(w, x + 1, y) !== lv) { ctx.moveTo(pad + (x + 1) * c, pad + y * c); ctx.lineTo(pad + (x + 1) * c, pad + (y + 1) * c); }
    if (y < 49 && E.W.h(w, x, y + 1) !== lv) { ctx.moveTo(pad + x * c, pad + (y + 1) * c); ctx.lineTo(pad + (x + 1) * c, pad + (y + 1) * c); }
  }
  ctx.stroke();
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {
    const tb = topBlock(w, x, y); if (!tb) continue;
    const d = E.W.BLOCKS[tb.b.t];
    ctx.globalAlpha = tb.b.p ? 0.45 : 1;
    ctx.fillStyle = d.color;
    const ins = d.overlay ? 0.06 : d.kind === 'tank' || d.kind === 'tree' ? 0.15 : 0.02;
    if (d.kind === 'tank' || d.kind === 'tree') { ctx.beginPath(); ctx.arc(pad + (x + 0.5) * c, pad + (y + 0.5) * c, c * (0.5 - ins), 0, 7); ctx.fill(); }
    else ctx.fillRect(pad + (x + ins) * c, pad + (y + ins) * c, c * (1 - 2 * ins), c * (1 - 2 * ins));
    ctx.globalAlpha = 1;
  }
  if (w.house) {
    for (const k in w.house.cells) { const [x, y] = k.split(',').map(Number); ctx.globalAlpha = w.house.cells[k].p ? 0.5 : 1; ctx.fillStyle = '#E8A15A'; ctx.fillRect(pad + x * c, pad + y * c, c + 0.5, c + 0.5); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#8A4513'; ctx.lineWidth = 2 * dpr; ctx.beginPath();
    for (const o of E.W.houseOuterEdges(w.house, false)) { const [t, r2] = o.e.split(':'); const [ex, ey] = r2.split(',').map(Number); if (t === 'h') { ctx.moveTo(pad + ex * c, pad + ey * c); ctx.lineTo(pad + (ex + 1) * c, pad + ey * c); } else { ctx.moveTo(pad + ex * c, pad + ey * c); ctx.lineTo(pad + ex * c, pad + (ey + 1) * c); } }
    ctx.stroke();
  }
  ctx.fillStyle = '#4A544F'; ctx.font = `${10 * dpr}px "IBM Plex Mono", monospace`;
  for (let y = 4; y < 50; y += 10) for (let x = 4; x < 50; x += 10) ctx.fillText(String(E.W.h(w, x, y) + w.base) + 'm', pad + x * c, pad + y * c);
  ctx.strokeStyle = '#1F2A2E'; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(pad, pad, c * 50, c * 50); ctx.setLineDash([]);
  ctx.fillStyle = '#4A544F'; ctx.font = `${11 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillText(o.caption || '↑北　1マス=1m・1段=高さ1m', pad, pad - 5 * dpr);
  if (o.overlay) o.overlay(ctx, pad, c, dpr);
  const cell = (e) => { const b = cv.getBoundingClientRect(); const x = Math.floor(((e.clientX - b.left) * dpr - pad) / c), y = Math.floor(((e.clientY - b.top) * dpr - pad) / c); return x >= 0 && y >= 0 && x < 50 && y < 50 ? [x, y] : null; };
  if (o.onCell) cv.onclick = (e) => { const p = cell(e); if (p) o.onCell(p[0], p[1]); };
  if (o.onHover) cv.onmousemove = (e) => o.onHover(cell(e));
}
function hintText() {
  const s = G.s, S = E.summarize(s);
  if (G.cat) return CAT.find(c => c.id === G.cat).hint;
  if (S.pending > 0 && !s.persons.some(p => p.week.includes('build'))) return `自分で作っているものがあります（残り作業 ${S.pending.toFixed(0)}日）。右の［予定］で「作業」の日を入れると進みます。`;
  if (s.turn === 0 && s.site === 'med') return 'オレンジ色が、最初に置いてある中古のコンテナ（12m²）。下の［家］で広げたり壁を替えたり、［畑］［その他］で場所を選んで作ります。準備ができたら右下で3か月進めます。';
  return '';
}
function renderTools() {
  const SUB = { house: '広げる・壁を替える', farm: '場所を選んで拡大', other: '水・電気・小屋' };
  document.getElementById('tools').innerHTML = CAT.map(c => `<button class="cat3${G.cat === c.id ? ' on' : ''}" data-cat="${c.id}" aria-pressed="${G.cat === c.id}"><b>${c.name}</b><span>${SUB[c.id]}</span></button>`).join('');
  document.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
    const c = b.dataset.cat;
    if (c === 'house') { G.cat = null; const [x, y] = houseCenter(); open3D(x, y, 'house'); return; }
    G.cat = G.cat === c ? null : c; renderTools(); renderMap();
  });
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
const PALETTE = {
  farm: { tools: [['beds', '畑を広げる（2点を押す）'], ['stone', '石垣（段差のある畑を押す）', 'terrace'], ['mulch', 'マルチ（畑を押す）', 'mulch'], ['cover', '覆いをかけて温室に（畑を押す）', 'greenhouse']], blocks: ['bed', 'heap', 'tree'] },
  other: { tools: [['shed', '柱と屋根の小屋（2点）'], ['pond', 'ため池を掘る（2点）', 'pond'], ['filter', '排水の浄化の穴（2点）', 'grey'], ['dig', '掘る（1段）'], ['fill', '盛る（1段）'], ['level', '平らにする（2点）']], blocks: ['tank', 'pump', 'pv', 'coop', 'hedge', 'settle'] }
};
const MAT = { media: 'media_sand', plant: 'plant_reed', roof: 'roof_tin' };
function knownBlock(t) { const d = E.W.BLOCKS[t]; return !d.learn || G.s.known.includes(d.learn); }
function knownTech(id) { return !id || G.s.known.includes(id); }
function houseCenter() { const hs = G.s.world.house; if (!hs) return [25, 25]; const cs = Object.keys(hs.cells).map(k => k.split(',').map(Number)); return [Math.round(cs.reduce((a, c) => a + c[0], 0) / cs.length), Math.round(cs.reduce((a, c) => a + c[1], 0) / cs.length)]; }
function open3D(cx, cy, cat, o3 = {}) {
  const world = o3.world || G.s.world, ro = !!o3.readOnly;
  const ov = document.createElement('div'); ov.className = 'iso3d';
  ov.innerHTML = `<div class="iso-in" role="dialog" aria-modal="true" aria-label="3Dで作る">
    <div class="iso-stage"><canvas id="isoc"></canvas><canvas id="isomini" class="iso-mini" aria-label="全体の地図。枠がいま見ている場所。押すとそこへ移動"></canvas>
      <div class="iso-nav"><button class="btn" data-nav="rl" aria-label="左に回す">↺</button><button class="btn" data-nav="rr" aria-label="右に回す">↻</button><button class="btn" data-nav="zi" aria-label="拡大">＋</button><button class="btn" data-nav="zo" aria-label="縮小">−</button>
      <button class="btn" data-nav="u" aria-label="奥へ">↑</button><button class="btn" data-nav="d" aria-label="手前へ">↓</button><button class="btn" data-nav="l" aria-label="左へ">←</button><button class="btn" data-nav="r" aria-label="右へ">→</button></div>
      <div class="iso-tip" id="isotip"></div></div>
    <aside class="iso-side" id="isoside"></aside></div>`;
  document.body.appendChild(ov);
  const P = PALETTE[cat];
  const st = { cat, tool: cat === 'house' ? 'grow' : (P.tools.find(t => knownTech(t[2]))?.[0] || 'erase'), panel: 'ins', mode: 'self', a: null, msg: '' };
  const v = createView(document.getElementById('isoc'), world, { cx, cy, R: cat === 'house' ? 7 : 8 }); G.view = v; if (cat === 'house') v.zoom = 1.3;
  const mini = document.getElementById('isomini');
  const tip = document.getElementById('isotip');
  const drawMini = () => miniMap(mini, world, v);
  const side = () => ro ? renderReadOnlySide(close) : cat === 'house' ? renderHouseSide(st, v, close) : renderIsoSide(st, v, close);
  const redraw = () => { v.draw(); drawMini(); side(); };
  const close = () => { cancelAnimationFrame(v.anim); ov.remove(); window.removeEventListener('resize', onR); document.removeEventListener('keydown', onKey); if (!ro) { persist(); renderAll(); } };
  const onR = () => { v.size(); v.draw(); drawMini(); }; window.addEventListener('resize', onR);
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'q') v.rotate(-1); if (e.key === 'e') v.rotate(1); };
  document.addEventListener('keydown', onKey);
  ov.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const n = b.dataset.nav;
    if (n === 'rl') v.rotate(-1); if (n === 'rr') v.rotate(1);
    if (n === 'zi') { v.zoom = Math.min(2.2, v.zoom * 1.25); v.draw(); } if (n === 'zo') { v.zoom = Math.max(0.5, v.zoom / 1.25); v.draw(); }
    if (n === 'u') v.pan(0, -1); if (n === 'd') v.pan(0, 1); if (n === 'l') v.pan(-1, 0); if (n === 'r') v.pan(1, 0);
    drawMini();
  });
  mini.onclick = (e) => { const r = mini.getBoundingClientRect(); v.cx = Math.max(0, Math.min(49, Math.floor((e.clientX - r.left) / r.width * 50))); v.cy = Math.max(0, Math.min(49, Math.floor((e.clientY - r.top) / r.height * 50))); v.draw(); drawMini(); };
  const cv = document.getElementById('isoc');
  cv.addEventListener('mousemove', (e) => {
    const f = v.pickAt(e.clientX, e.clientY);
    v.ghost = ro ? null : (cat === 'house' ? houseGhost(st, f) : ghostFor(st, f)); v.draw();
    tip.textContent = f ? describeFace(f) : '';
  });
  cv.addEventListener('mouseleave', () => { v.ghost = null; v.draw(); tip.textContent = ''; });
  cv.addEventListener('click', (e) => { if (ro) return; const f = v.pickAt(e.clientX, e.clientY); if (!f) return; if (cat === 'house') houseAct(st, f); else act(st, f); v.ghost = null; redraw(); });
  st.redraw = redraw;
  v.size(); redraw();
}
function miniMap(cv, w, v) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), size = cv.getBoundingClientRect().width || 150;
  cv.width = size * dpr; cv.height = size * dpr;
  const ctx = cv.getContext('2d'), c = cv.width / 50, max = Math.max(...w.H);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) { ctx.fillStyle = levelColor(E.W.h(w, x, y), max, w.H0[y * 50 + x] > E.W.h(w, x, y)); ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5); }
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) { const tb = topBlock(w, x, y); if (tb) { ctx.fillStyle = E.W.BLOCKS[tb.b.t].color; ctx.fillRect(x * c, y * c, c, c); } }
  if (w.house) { ctx.fillStyle = '#B8641F'; for (const k in w.house.cells) { const [x, y] = k.split(',').map(Number); ctx.fillRect(x * c, y * c, c, c); } }
  ctx.strokeStyle = '#1F2A2E'; ctx.lineWidth = 2 * dpr; ctx.strokeRect((v.cx - v.R) * c, (v.cy - v.R) * c, (2 * v.R + 1) * c, (2 * v.R + 1) * c);
  ctx.fillStyle = '#1F2A2E'; ctx.font = `${10 * dpr}px "Noto Sans JP", sans-serif`; ctx.fillText('北↑', 3 * dpr, 11 * dpr);
}
function describeFace(f) {
  const w = G.view?.world || G.s.world;
  if (f.type === 'terrain') return `地面 · 標高 ${f.z + 1 + w.base}m${w.H0[f.y * 50 + f.x] - 1 > f.z ? '（掘った穴）' : ''}`;
  if (f.type === 'wall') return `${E.W.PANELS[f.wl.t].name}${f.wl.next ? ` → ${E.W.PANELS[f.wl.next].name}（作業待ち）` : ''}`;
  if (f.type === 'floor') return `床 · ${w.base + f.z}m`;
  if (f.type === 'roof') return `${E.W.ROOFS[w.house.roof].name}`;
  if (f.type === 'pv') return '屋根の太陽光パネル';
  const d = E.W.BLOCKS[f.b.t]; return `${d.name}${f.b.p ? '（作業待ち）' : ''} · 高さ ${f.z + w.base}m`;
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
  const T = st.tool;
  if (E.W.BLOCKS[T]) { const p = target(f, T); err = p ? E.W.put(s, ...p, T, st.mode) : 'ここには置けない'; }
  else if (T === 'erase') err = f.type === 'block' ? E.W.remove(s, f.x, f.y, f.z) : '外すものを押す';
  else if (T === 'dig') err = f.type === 'terrain' && f.face === 4 ? E.W.dig(s, f.x, f.y, st.mode) : '地面の上を押す';
  else if (T === 'fill') err = f.type === 'terrain' && f.face === 4 ? E.W.fill(s, f.x, f.y, st.mode) : '地面の上を押す';
  else if (['stone', 'mulch', 'cover'].includes(T)) err = f.type === 'block' && E.W.BLOCKS[f.b.t].kind === 'bed' ? E.W.toggleMark(s, f.x, f.y, f.z, { stone: 's', mulch: 'm', cover: 'g' }[T]) : '畑を押す';
  else if (RECT.includes(T)) {
    if (!['terrain', 'block'].includes(f.type)) return;
    if (!st.a) { st.a = [f.x, f.y]; st.msg = 'もう1つの角を押してください'; return; }
    const a = st.a, b = [f.x, f.y]; st.a = null;
    if (T === 'shed') err = E.W.prefabShed(s, a, b, MAT.roof, st.mode);
    if (T === 'beds') err = E.W.prefabBeds(s, a, b, st.mode);
    if (T === 'level') err = E.W.prefabLevel(s, a, b, st.mode);
    if (T === 'pond') err = E.W.prefabPit(s, a, b, 'pond', st.mode, 1);
    if (T === 'filter') err = E.W.prefabPit(s, a, b, MAT.media, st.mode, 1, MAT.plant);
  }
  st.msg = err || ''; persist();
}
/* 家の画面 */
function houseGhost(st, f) {
  if (!f) return null;
  const hs = G.s.world.house;
  if (st.tool === 'grow' && f.type === 'terrain' && f.face === 4) return { ok: Math.abs(f.z + 1 - hs.z) <= 1, cells: [[f.x, f.y, hs.z, 0.15]] };
  return null;
}
function houseAct(st, f) {
  const s = G.s; let err = null;
  if (st.tool === 'grow') err = f.type === 'terrain' && f.face === 4 ? E.W.addFloor(s, f.x, f.y, st.mode, st.panel === 'window' || st.panel === 'windowHi' || st.panel === 'door' ? 'wall' : st.panel) : '家のとなりの地面を押す';
  else if (st.tool === 'shrink') err = f.type === 'floor' ? E.W.removeFloor(s, f.x, f.y) : '床を押す';
  else if (st.tool === 'panel') err = f.type === 'wall' ? E.W.setWall(s, f.e, st.panel, st.mode) : '外壁を押す';
  else if (st.tool === 'pvroof') { if (f.type === 'roof') { if (!knownTech('offgrid')) err = '太陽光はまだ知らない'; else { const hs = s.world.house; hs.pv = hs.pv || {}; if (hs.pv[f.k]) err = 'もうある'; else { const price = E.W.blockPrice('pv', st.mode); if (price > s.cash) err = 'お金が足りない'; else { s.cash -= price; hs.pv[f.k] = 1; s.world.spent.far += 5.5; } } } } else err = '屋根を押す'; }
  st.msg = err || ''; persist();
}
function houseYearStats(hm) {
  const s = G.s, N = E.normals(s.site); let heat = 0, hot = 0, peak = -99;
  N.forEach((c, i) => { const r = E.B.houseDay(hm, { t: c.t, tmax: c.tmax, psh: c.psh }, s.persons.length); heat += r.heat * E.DAYS[i]; if (r.peak > E.B.HOT) hot += E.DAYS[i]; peak = Math.max(peak, r.peak); });
  return { heat, elec: heat / 2.6, hot, peak };
}
function renderHouseSide(st, v, close) {
  const s = G.s, S = E.summarize(s), el = document.getElementById('isoside'), hs = s.world.house, hm = S.houseM;
  const y = hm ? houseYearStats(hm) : null;
  const panelBtn = (k) => { const P = E.W.PANELS[k], ok = knownTech(P.learn); return `<button class="opt${st.panel === k && st.tool === 'panel' ? ' on' : ''}" data-panel="${k}" ${ok ? '' : 'disabled'}><i class="sw" style="background:${P.color}"></i>${ok ? P.name : '？ ' + P.name}<span class="pr">${(st.mode === 'self' ? P.cost : P.cost + P.labor * 1.5).toFixed(1)}</span></button>`; };
  const parts = hm ? [['壁', hm.parts.wall, '#C8A87A'], ['屋根', hm.parts.roof, '#8C9499'], ['床', hm.parts.floor, '#A39A8C'], ['窓', hm.parts.window, '#7FB0D8'], ['すきま', hm.parts.air, '#C9CDBF']] : [];
  el.innerHTML = `<header><h2>家</h2><button class="btn ghost" id="isox">地図に戻る</button></header>
    <div class="small">所持金 ${man(s.cash)} · 作業待ち ${S.pending.toFixed(0)}日</div>
    <div class="seg-o" role="group" aria-label="作り方"><button class="opt${st.mode === 'self' ? ' on' : ''}" data-mode="self">自分で作る（材料だけ・作業日）</button><button class="opt${st.mode === 'hire' ? ' on' : ''}" data-mode="hire">頼む（人件費・すぐ）</button></div>
    ${hm ? `<div class="stat2"><span>いまの家</span><b>${hm.A}m² · 熱の逃げやすさ ${hm.UA.toFixed(0)} W/K</b><div class="ua">${parts.map(([n, val, c]) => `<i style="width:${(val / hm.UA * 100).toFixed(1)}%;background:${c}" title="${n}"></i>`).join('')}</div><div class="legend">${parts.map(([n, val, c]) => `<span><i style="background:${c}"></i>${n} ${Math.round(val / hm.UA * 100)}%</span>`).join('')}</div>
      <span>${y.elec < 50 ? '暖房はほぼいらない' : `暖房 ${Math.round(y.elec).toLocaleString()}kWh/年`} · 暑すぎる日 ${y.hot}日/年（最高 約${y.peak.toFixed(0)}℃）${hm.condenseProne ? ' · <b class="ng">鋼板が残っていて結露する</b>' : ''}</span></div>` : ''}
    <div class="seg"><div class="seg-h"><b>床を広げる</b><span class="small">家のとなりの地面を押す。1段ちがえば掘るか盛ってそろえる</span></div><div class="seg-o"><button class="opt${st.tool === 'grow' ? ' on' : ''}" data-tool="grow">床を足す（1m²）</button><button class="opt${st.tool === 'shrink' ? ' on' : ''}" data-tool="shrink">床を減らす</button></div></div>
    <div class="seg"><div class="seg-h"><b>壁を替える</b><span class="small">選んでから外壁を押す。数字は1枚の値段（万円）</span></div><div class="seg-o blocks">${['wall', 'ins', 'thick', 'window', 'windowHi', 'door'].map(panelBtn).join('')}</div></div>
    <div class="seg"><div class="seg-h"><b>屋根</b><span class="small">家全体。雨を集める面にもなる</span></div><div class="seg-o">${['tin', 'tinins', 'green'].map(k => `<button class="opt${hs.roof === k ? ' on' : ''}" data-roof="${k}">${E.W.ROOFS[k].name}</button>`).join('')}<button class="opt${hs.eaves ? ' on' : ''}" data-eaves="1">庇${hs.eaves ? 'あり' : 'をつける（10万円）'}</button></div>
      <div class="seg-o"><button class="opt${v.showRoof ? '' : ' on'}" data-showroof="1">${v.showRoof ? '屋根と壁を下げて間取りを見る' : '屋根と壁を戻す'}</button>${knownTech('offgrid') ? `<button class="opt${st.tool === 'pvroof' ? ' on' : ''}" data-tool="pvroof">屋根に太陽光（屋根を押す）</button><button class="opt" data-batt="1">蓄電池を家に（${hs.batt || 0}台）</button>` : ''}</div></div>
    <div class="seg"><div class="seg-h"><b>床と設備</b></div><div class="seg-o">${['wood', 'slab'].map(k => `<button class="opt${hs.floor === k ? ' on' : ''}" data-floor="${k}">${E.W.FLOORS[k].name}</button>`).join('')}
      ${knownTech('toilet') ? `<button class="opt${s.world.mods.compostToilet ? ' on' : ''}" data-hm="compostToilet">コンポストトイレ${s.world.mods.compostToilet ? '' : '（30万円）'}</button>` : ''}
      ${knownTech('saving') ? `<button class="opt${s.world.mods.saving ? ' on' : ''}" data-hm="saving">節水の器具${s.world.mods.saving ? '' : '（8万円）'}</button>` : ''}
      <button class="opt" data-hm="depth">基礎 ${S.depth.toFixed(1)}m（要る深さ ${S.need.toFixed(1)}m）→ 0.3m深く</button></div></div>
    ${st.msg ? `<div class="iso-msg">${esc(st.msg)}</div>` : ''}
    ${S.diag.length ? `<div class="stat2"><span>気になるところ</span>${S.diag.map(d => `<div class="${d.lv === 'warn' ? 'ng' : 'small'}">${esc(d.text)}</div>`).join('')}</div>` : ''}
    <p class="small">回す ↺↻（Q・Eキー）／ 拡大 ＋−／ 移動 矢印か右上の小さな地図。</p>`;
  el.querySelector('#isox').onclick = close;
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; st.redraw(); });
  el.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { st.tool = b.dataset.tool; st.msg = ''; st.redraw(); });
  el.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => { st.tool = 'panel'; st.panel = b.dataset.panel; st.msg = '替えたい外壁を押してください'; st.redraw(); });
  el.querySelectorAll('[data-roof]').forEach(b => b.onclick = () => { st.msg = E.W.setRoof(G.s, b.dataset.roof, st.mode) || ''; persist(); st.redraw(); });
  el.querySelectorAll('[data-floor]').forEach(b => b.onclick = () => { st.msg = E.W.setFloorType(G.s, b.dataset.floor, st.mode) || ''; persist(); st.redraw(); });
  el.querySelectorAll('[data-eaves]').forEach(b => b.onclick = () => { if (!hs.eaves) { if (G.s.cash < 10) st.msg = 'お金が足りない'; else { G.s.cash -= 10; hs.eaves = true; } } persist(); st.redraw(); });
  el.querySelectorAll('[data-showroof]').forEach(b => b.onclick = () => { v.showRoof = !v.showRoof; st.redraw(); });
  el.querySelectorAll('[data-batt]').forEach(b => b.onclick = () => { const p = E.W.blockPrice('batt', st.mode); if (p > G.s.cash) st.msg = 'お金が足りない'; else { G.s.cash -= p; hs.batt = (hs.batt || 0) + 1; G.s.world.spent.far += 15; } persist(); st.redraw(); });
  el.querySelectorAll('[data-hm]').forEach(b => b.onclick = () => {
    const k = b.dataset.hm, m = G.s.world.mods, S2 = E.summarize(G.s);
    if (k === 'depth') { const c = Math.max(1, (S2.houseM?.A || 10) * 0.6); if (c > G.s.cash) st.msg = 'お金が足りない'; else { G.s.cash -= c; m.depth = Math.round(((m.depth || S2.need) + 0.3) * 10) / 10; } }
    else if (!m[k]) { const c = k === 'compostToilet' ? 30 : 8; if (c > G.s.cash) st.msg = 'お金が足りない'; else { G.s.cash -= c; m[k] = true; } }
    persist(); st.redraw();
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
function renderIsoSide(st, v, close) {
  const s = G.s, S = E.summarize(s), el = document.getElementById('isoside');
  const P = PALETTE[st.cat];
  const blk = (t) => { const d = E.W.BLOCKS[t], k = knownBlock(t); return `<button class="opt${st.tool === t ? ' on' : ''}" data-tool="${t}" ${k ? '' : 'disabled'}><i class="sw" style="background:${d.color}"></i>${k ? esc(d.name) : '？ ' + esc(d.name)}<span class="pr">${E.W.blockPrice(t, st.mode).toFixed(1)}</span></button>`; };
  const filterOpts = st.cat === 'other' && knownTech('grey') ? `<div class="seg"><div class="seg-h"><b>浄化の穴に入れる層</b></div><div class="seg-o">${['media_gravel', 'media_sand', 'media_char'].map(t => `<button class="opt${MAT.media === t ? ' on' : ''}" data-mat="media:${t}">${esc(E.W.BLOCKS[t].name)}</button>`).join('')}</div>
      ${S.filter ? `<div class="seg-h"><b>きれいになった水の行き先</b></div><div class="seg-o">${Object.entries(E.B.OUTS).map(([k, o]) => `<button class="opt${s.world.mods.out === k ? ' on' : ''}" data-out="${k}">${o.name}</button>`).join('')}</div>` : ''}</div>` : '';
  el.innerHTML = `<header><h2>${st.cat === 'farm' ? '畑' : 'その他'}</h2><button class="btn ghost" id="isox">地図に戻る</button></header>
    <div class="small">所持金 ${man(s.cash)} · 土の在庫 ${s.world.earth.toFixed(1)}m³ · 作業待ち ${S.pending.toFixed(0)}日</div>
    <div class="seg-o" role="group" aria-label="作り方"><button class="opt${st.mode === 'self' ? ' on' : ''}" data-mode="self">自分で作る（材料だけ・作業日）</button><button class="opt${st.mode === 'hire' ? ' on' : ''}" data-mode="hire">頼む（人件費・すぐ）</button></div>
    <div class="seg"><div class="seg-h"><b>まとめて作る</b></div><div class="seg-o">${P.tools.map(([k, n, l]) => `<button class="opt${st.tool === k ? ' on' : ''}" data-tool="${k}" ${knownTech(l) ? '' : 'disabled'}>${knownTech(l) ? n : '？ ' + n}</button>`).join('')}</div></div>
    ${filterOpts}
    <div class="seg"><div class="seg-h"><b>1つずつ置く</b><span class="small">数字は1つの値段（万円）</span></div><div class="seg-o blocks">${P.blocks.map(blk).join('')}<button class="opt${st.tool === 'erase' ? ' on' : ''}" data-tool="erase">外す</button></div></div>
    ${st.msg ? `<div class="iso-msg">${esc(st.msg)}</div>` : ''}
    <div class="stat2"><span>雨を集める屋根</span><b>${Math.round(S.A.roofCatch / 0.85)}m²（タンク${S.A.fedTanks}/${S.A.tanks}つにつながる）</b>${S.A.roofLost > 0.5 ? `<span class="ng">${Math.round(S.A.roofLost / 0.85)}m²ぶんはタンクにつながっていない</span>` : ''}</div>
    ${S.diag.length ? `<div class="stat2"><span>気になるところ</span>${S.diag.map(d => `<div class="${d.lv === 'warn' ? 'ng' : 'small'}">${esc(d.text)}</div>`).join('')}</div>` : ''}
    <p class="small">回す ↺↻（Q・Eキー）／ 拡大 ＋−／ 移動 矢印か右上の小さな地図。面を押すと、その面の外側に置きます。</p>`;
  el.querySelector('#isox').onclick = close;
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; st.redraw(); });
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
  const lab = { work: '仕事', farm: '畑', build: '作業', rest: '休み' };
  return `<div><h2>予定 · 週の過ごし方</h2><p class="small">マスを押すと 仕事 → 畑 → 作業 → 休み と変わる。「作業」は自分で建てるものを進める日。東京では週5日、会社の仕事だった。</p></div>
    <div class="week"><span></span>${E.WEEKDAYS.map(d => `<span>${d}</span>`).join('')}
    ${s.persons.map((p, pi) => `<span style="text-align:left">${esc(p.name)}</span>${p.week.map((v, di) => `<button class="cell ${v}" data-cell="${pi},${di}" aria-label="${esc(p.name)} ${E.WEEKDAYS[di]}曜 ${lab[v]}">${lab[v]}</button>`).join('')}`).join('')}</div>
    <h3>畑と手入れ</h3><div class="meter${hand < care.total ? ' over' : ''}"><i style="width:${Math.min(100, care.total ? hand / care.total * 100 : 100)}%"></i></div>
    <div class="rows"><span>手入れに要る日数</span><b class="num">週${care.total.toFixed(1)}日</b><span>畑に出る日</span><b class="num">週${hand}日</b></div>
    <h3>自分で作っているもの</h3>${(() => { const bd = s.persons.reduce((a, p) => a + E.weekCount(p).build, 0); const left = E.W.pendingDays(s.world); if (left <= 0) return '<p class="small">いまはない。3Dで「自分で作る」を選んで置いたものは、ここで進む。</p>'; return `<div class="rows"><span>残り作業</span><b class="num">${left.toFixed(0)}日${bd ? ` · 約${Math.ceil(left / (bd * 11))}季節` : ' · 止まっている'}</b></div>`; })()}
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
    const order = ['work', 'farm', 'build', 'rest'];
    const s = E.clone(G.s); const v = s.persons[pi].week[di];
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

window.__orb = { G, E, open3D };   // 自動テスト用
title();
