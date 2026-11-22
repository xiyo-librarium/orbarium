import * as E from './engine.js';
import { NOTES, LESSON, eventText, ATLAS, PROLOGUE, INVITE, LANDS } from './content.js';
import { createGlobe, flyTo, loadLand } from './globe.js';
import { openShop } from './shop.js';

const KEY = 'orbarium-v1';
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
    <section class="left"><div class="mapwrap">${tokyoMap()}</div><div class="story" id="story" aria-live="polite"></div></section>
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
}
function tokyoMap() {
  // ほかの土地と同じ50m四方・1mマスの地図。真ん中に賃貸マンション、その3階の30m²があなたの部屋
  const arr = (x1, y1, x2, y2, t, c, tx, ty, anchor = 'start') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width=".3" marker-end="url(#ah)" stroke-dasharray=".9 .5"/><text x="${tx}" y="${ty}" font-size="1.15" fill="${c}" text-anchor="${anchor}">${t}</text>`;
  const units = [];
  for (let k = 0; k < 4; k++) units.push(`<rect x="${17 + k * 5}" y="20" width="5" height="6" fill="${k === 1 ? '#FBFAF5' : '#D8DBCF'}" stroke="${k === 1 ? '#1F2A2E' : '#9AA090'}" stroke-width="${k === 1 ? 0.25 : 0.08}"/>`);
  return `<svg viewBox="-2.5 -2.5 55 55" role="img" aria-label="東京の部屋。水・電気・食べものはお金を払うと外から来て、下水とごみは外へ消える">
    <defs><marker id="ah" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="context-stroke"/></marker>
      <pattern id="g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="rgba(31,42,46,.07)" stroke-width=".04"/></pattern>
      <pattern id="g5" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="rgba(31,42,46,.16)" stroke-width=".06"/></pattern></defs>
    <rect x="-2.5" y="-2.5" width="55" height="55" fill="#E3E5DC"/>
    <rect x="0" y="0" width="50" height="50" fill="#EDEFE6"/>
    <rect x="0" y="40" width="50" height="6" fill="#CFD2C6"/><text x="1" y="43.5" font-size="1.1" fill="#6B7462">道路（地面はアスファルト。雨は側溝へ）</text>
    <rect x="3" y="3" width="10" height="14" fill="#D8DBCF" stroke="#9AA090" stroke-width=".08"/><rect x="36" y="4" width="12" height="16" fill="#D8DBCF" stroke="#9AA090" stroke-width=".08"/>
    <rect x="3" y="27" width="9" height="10" fill="#D8DBCF" stroke="#9AA090" stroke-width=".08"/><rect x="37" y="26" width="11" height="12" fill="#D8DBCF" stroke="#9AA090" stroke-width=".08"/>
    <rect x="15" y="18" width="24" height="10" fill="#C9CDBF" stroke="#7F8A72" stroke-width=".12"/>${units.join('')}
    <text x="24.5" y="23.4" font-size="1.05" text-anchor="middle" fill="#1F2A2E" font-weight="700">あなたの部屋</text><text x="24.5" y="24.9" font-size=".9" text-anchor="middle" fill="#1F2A2E">30m²・3階</text>
    <rect x="0" y="0" width="50" height="50" fill="url(#g1)"/><rect x="0" y="0" width="50" height="50" fill="url(#g5)"/>
    <rect x="0" y="0" width="50" height="50" fill="none" stroke="#1F2A2E" stroke-width=".18" stroke-dasharray="1 .6"/>
    <text x="0" y="-0.8" font-size="1.1" fill="#4A544F">↑北　平らな住宅地　1マス=1m</text>
    ${arr(-2.5, 21, 21.6, 21, '水道 ← 払うと届く：どこかのダム', '#2B6CB0', 0.3, 20.2)}
    ${arr(27.4, 22, 52.5, 22, '下水 → 処理場の先の川', '#8A4513', 51, 21.2, 'end')}
    ${arr(23, -2.5, 23, 19.6, '電気 ← 払うと届く：どこかの発電所', '#C08A1E', 23.6, 1.5)}
    ${arr(25, 52.5, 25, 26.4, '食べもの ← 払うと届く：どこかの畑', '#3F7D4E', 25.6, 49.2)}
    ${arr(23.5, 26.4, 14, 52.5, 'ごみ → 清掃工場', '#6B7462', 13.4, 49.2, 'end')}
  </svg>`;
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
  return `<div><h2>めぐり</h2><p class="small">暮らしを、いくつもの「めぐり」の重なりとして見る。円の大きさは自分の手で回している度合い。灰色の大きな円は、お金のめぐり。</p></div>
  ${orbSVG(E.tokyoOrbs())}
  <p class="small">いまは、どのめぐりも小さな点のまま、お金の円の中に閉じこもっている。水も、光と熱も、食も、人とのつながりも、ぜんぶ円を払うことでしか関われていない。</p>
  <div class="nodes">${E.tokyoOrbs().orbs.map(o => `<div class="node"><i class="d" style="background:${o.color}"></i><b>${esc(o.name)}</b><span class="w">${esc(o.via)}</span></div>`).join('')}</div>`;
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
        G.s.q = s.q; G.tab = 'web'; G.sel = null; G.tool = null; persist(); game();
      });
    }
  });
}
function startGame() {
  G.s = E.newGame({ seed: Math.floor(Math.random() * 1e6) });
  G.tab = 'web'; G.sel = null; G.tool = null; G.report = null;
  persist();
  game();
}

/* ================= ゲーム画面 ================= */
function game() {
  stop();
  app.innerHTML = `<div class="game">
    <header class="bar" id="bar"></header>
    <section class="left"><div class="mapzone"><div class="mapwrap" id="mapwrap"></div><div class="inspect" id="inspect" aria-live="polite"></div></div><div class="tools" id="tools" role="toolbar" aria-label="置くもの"></div></section>
    <section class="right"><nav class="tabs" id="tabs"></nav><div class="panel" id="panel"></div>
      <div class="closebar"><button class="btn primary" id="close"></button></div></section></div>`;
  document.getElementById('close').onclick = closeLaptop;
  renderAll();
  window.onkeydown = (e) => {
    if (e.key === 'r' || e.key === 'R') rotate();
    if (e.key === 'Escape') { G.tool = null; G.ghost = null; G.sel = null; renderAll(); }
  };
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

/* ---------- 地図 ---------- */
let contourCache = {};
function contours(key) {
  if (contourCache[key]) return contourCache[key];
  const T = E.siteTerrain(key), n = T.n, z = T.z;
  let lo = Infinity, hi = -Infinity; for (const v of z) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const minor = [], major = [], labels = [];
  for (let lv = Math.ceil(lo); lv <= Math.floor(hi); lv += 1) {
    const segs = [];
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      const a = z[y * n + x], b = z[y * n + x + 1], c = z[(y + 1) * n + x + 1], d = z[(y + 1) * n + x];
      const pts = [];
      const e = (p, q, x1, y1, x2, y2) => { if ((p < lv) !== (q < lv)) { const t = (lv - p) / (q - p); pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]); } };
      e(a, b, x, y, x + 1, y); e(b, c, x + 1, y, x + 1, y + 1); e(d, c, x, y + 1, x + 1, y + 1); e(a, d, x, y, x, y + 1);
      if (pts.length >= 2) segs.push(`M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}L${pts[1][0].toFixed(2)} ${pts[1][1].toFixed(2)}`);
      if (pts.length === 4) segs.push(`M${pts[2][0].toFixed(2)} ${pts[2][1].toFixed(2)}L${pts[3][0].toFixed(2)} ${pts[3][1].toFixed(2)}`);
    }
    (lv % 5 === 0 ? major : minor).push(segs.join(''));
    if (lv % 5 === 0) { const yy = 46; let best = null; for (let x = 0; x < n - 1; x++) { const a = z[yy * n + x], b = z[yy * n + x + 1]; if ((a < lv) !== (b < lv)) best = x + (lv - a) / (b - a); } if (best != null) labels.push([best, yy, lv]); }
  }
  return (contourCache[key] = { minor: minor.join(''), major: major.join(''), labels });
}
const COLORS = { house: '#FBFAF5', tank: '#CFE1F2', garden: '#CFE3C9', heap: '#B08A5B', grey: '#9CCFC4', pv: '#30476B', batt: '#3A3F42', tree: '#4E8F5B', hedge: '#2C5A37', chicken: '#E8C98A', pond: '#7FB0D8', gh: '#EAF2E4', roof: '#D9D4C7' };
function itemSVG(x, ghost) {
  if (!ghost && x.build && x.build.done < x.build.need) {
    const p = x.build.done / x.build.need, sel = G.sel === x.id;
    return `<g data-id="${x.id}"><rect x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" fill="url(#hatch)" stroke="${sel ? '#B8641F' : '#8A6A42'}" stroke-width="${sel ? 0.22 : 0.14}" stroke-dasharray=".5 .3"/><rect x="${x.x}" y="${x.y + x.h - 0.35}" width="${x.w * p}" height=".35" fill="#B8641F"/><text x="${x.x + x.w / 2}" y="${x.y + x.h / 2 + 0.4}" font-size="${Math.min(1.1, Math.max(0.7, x.w / 5))}" text-anchor="middle" fill="#5E4A30" pointer-events="none">工事中 ${Math.round(p * 100)}%</text></g>`;
  }
  const sel = G.sel === x.id, cls = ghost ? 'ghost' : '';
  const op = ghost ? ' opacity=".75"' : '';
  const stroke = ghost ? (ghost.ok ? '#B8641F' : '#C0392B') : (sel ? '#B8641F' : '#1F2A2E');
  const dash = ghost || sel ? ' stroke-dasharray=".5 .35"' : '';
  const sw = sel || ghost ? 0.22 : 0.12;
  const base = `data-id="${x.id || ''}" class="${cls}"${op}`;
  const label = (t, dy = 0) => `<text x="${x.x + x.w / 2}" y="${x.y + x.h / 2 + 0.45 + dy}" font-size="${Math.min(1.3, Math.max(0.8, x.w / 4))}" text-anchor="middle" fill="#1F2A2E" pointer-events="none">${t}</text>`;
  switch (x.type) {
    case 'tank': return `<g ${base}><circle cx="${x.x + x.w / 2}" cy="${x.y + x.h / 2}" r="${x.w / 2 - 0.1}" fill="${COLORS.tank}" stroke="${ghost ? stroke : sel ? stroke : '#2B6CB0'}" stroke-width="${sw}"${dash}/>${label('水')}</g>`;
    case 'tree': return `<g ${base}><circle cx="${x.x + 0.5}" cy="${x.y + 0.5}" r=".62" fill="${COLORS.tree}" stroke="${stroke}" stroke-width="${sw * 0.6}"${dash}/></g>`;
    case 'garden': {
      const m = x.mods || {};
      let extra = '';
      if (m.terrace) for (let yy = x.y + 1.5; yy < x.y + x.h; yy += 2) extra += `<line x1="${x.x}" y1="${yy}" x2="${x.x + x.w}" y2="${yy}" stroke="#7D776B" stroke-width=".28"/>`;
      if (m.mulch) extra += `<rect x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" fill="url(#mulch)" pointer-events="none"/>`;
      return `<g ${base}><rect x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" fill="url(#rows)" stroke="${ghost || sel ? stroke : '#3F7D4E'}" stroke-width="${sw}"${dash}/>${extra}${label(`畑 ${x.w * x.h}m²`)}</g>`;
    }
    default: {
      const fill = COLORS[x.type];
      const dark = ['pv', 'batt', 'hedge'].includes(x.type);
      const t = { house: '家', heap: '堆肥', grey: '植物セル', pv: '', batt: '', hedge: '', chicken: 'ニワトリ', pond: 'ため池', gh: `温室 ${x.w * x.h}m²`, roof: `集水屋根 ${x.w * x.h}m²` }[x.type] ?? '';
      return `<g ${base}><rect x="${x.x}" y="${x.y}" width="${x.w}" height="${x.h}" rx="${x.type === 'hedge' ? 0.4 : 0.05}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>${t ? label(t) : ''}${x.type === 'house' && x.mods?.compostToilet ? label('トイレ堆肥', 1.2) : ''}${dark && x.type === 'pv' ? `<line x1="${x.x + x.w / 2}" y1="${x.y}" x2="${x.x + x.w / 2}" y2="${x.y + x.h}" stroke="#8FA6C8" stroke-width=".08"/>` : ''}</g>`;
    }
  }
}
function flowsSVG(s) {
  const S = E.summarize(s), out = [];
  const c = (it) => [it.x + it.w / 2, it.y + it.h / 2];
  const tanks = s.items.filter(x => x.type === 'tank'), gardens = s.items.filter(x => x.type === 'garden');
  if (S.house && tanks.length) { const [a, b] = c(S.house), [p, q] = c(tanks[0]); out.push(`<line x1="${a}" y1="${b}" x2="${p}" y2="${q}" stroke="#2B6CB0" stroke-width=".18" stroke-dasharray=".6 .4" opacity=".8"/>`); }
  if (tanks.length && gardens.length) {
    const [a, b] = c(tanks[0]), [p, q] = c(gardens[0]); const grav = S.gravity >= 1.5;
    out.push(`<line x1="${a}" y1="${b}" x2="${p}" y2="${q}" stroke="${grav ? '#2B6CB0' : '#B8641F'}" stroke-width=".22" stroke-dasharray=".8 .5"/>`);
    out.push(`<text x="${(a + p) / 2 + 0.6}" y="${(b + q) / 2}" font-size=".95" fill="${grav ? '#2B6CB0' : '#8A4513'}">${grav ? '重力で給水' : 'ポンプで給水'}</text>`);
  }
  const heap = s.items.find(x => x.type === 'heap');
  if (heap && gardens.length) { const [a, b] = c(heap), [p, q] = c(gardens[0]); out.push(`<line x1="${a}" y1="${b}" x2="${p}" y2="${q}" stroke="#8A6A42" stroke-width=".2" stroke-dasharray=".5 .4"/>`); }
  const grey = s.items.find(x => x.type === 'grey');
  if (grey && S.house) { const [a, b] = c(S.house), [p, q] = c(grey); out.push(`<line x1="${a}" y1="${b}" x2="${p}" y2="${q}" stroke="#2E8B7A" stroke-width=".18" stroke-dasharray=".5 .4"/>`); }
  return out.join('');
}
function renderMap() {
  const s = G.s, C = contours(s.site);
  const ghost = G.ghost ? itemSVG(G.ghost, { ok: G.ghost.ok }) : '';
  const hint = G.sel || G.ghost ? '' : hintText();
  document.getElementById('mapwrap').innerHTML = `<svg id="map" viewBox="-2.5 -2.5 55 55" role="application" aria-label="敷地の地図。50m四方、1マス1m">
    <defs>
      <pattern id="g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="rgba(31,42,46,.07)" stroke-width=".04"/></pattern>
      <pattern id="g5" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M5 0H0V5" fill="none" stroke="rgba(31,42,46,.16)" stroke-width=".06"/></pattern>
      <pattern id="rows" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#DCEBD6"/><rect y=".55" width="1" height=".3" fill="#A9CBA0"/></pattern>
      <pattern id="hatch" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="1" fill="#F2E8D8"/><line x1="0" y1="0" x2="0" y2="1" stroke="#C9A46A" stroke-width=".25"/></pattern>
      <pattern id="mulch" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><circle cx=".3" cy=".3" r=".12" fill="#B9935A"/><circle cx=".9" cy=".85" r=".1" fill="#B9935A"/></pattern>
    </defs>
    <rect x="-2.5" y="-2.5" width="55" height="55" fill="#EDEFE6"/>
    <path d="${C.minor}" stroke="#A3AC96" stroke-width=".07" fill="none"/>
    <path d="${C.major}" stroke="#7F8A72" stroke-width=".14" fill="none"/>
    ${C.labels.map(([x, y, v]) => `<text x="${x + 0.3}" y="${y - 0.3}" font-size=".9" fill="#6B7462">${v}m</text>`).join('')}
    <rect x="0" y="0" width="50" height="50" fill="url(#g1)"/><rect x="0" y="0" width="50" height="50" fill="url(#g5)"/>
    <rect x="0" y="0" width="50" height="50" fill="none" stroke="#1F2A2E" stroke-width=".18" stroke-dasharray="1 .6"/>
    <text x="0" y="-0.8" font-size="1.1" fill="#4A544F">↑北　${s.site === 'taos' ? '南へ下るゆるい斜面' : '西へ下る斜面'}　1マス=1m</text>
    <g id="flows">${flowsSVG(s)}</g>
    <g id="items">${s.items.map(x => itemSVG(x)).join('')}</g>
    <g id="ghost" pointer-events="none">${ghost}</g>
    <rect id="hit" x="0" y="0" width="50" height="50" fill="transparent" style="cursor:${G.tool ? 'crosshair' : 'default'}"/>
  </svg>${hint ? `<div class="hint">${hint}</div>` : ''}`;
  const svg = document.getElementById('map');
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointerleave', () => { if (!G.drag && G.ghost) { G.ghost = null; drawGhost(); } });
}
function hintText() {
  const s = G.s, S = E.summarize(s);
  const anyHouse = s.items.some(x => x.type === 'house');
  if (!anyHouse && G.tool === 'house') return '設計した家を、地図を押して置きます。斜面がゆるい場所ほど基礎が浅くてすみます（Rで向きを変える）。';
  if (!anyHouse) return 'まず［家］を押して、家を設計します。骨組み・断熱・窓・屋根を決めると、暑さ寒さと費用がその場でわかります。';
  const building = s.items.filter(x => x.build && x.build.done < x.build.need);
  if (building.length && !s.persons.some(p => p.week.includes('build'))) return `${E.ITEMS[building[0].type].name}を自分で作っています。右の［予定］で「作業」の日を入れると進みます。それまでは仮住まい（3か月4万円）。`;
  if (!s.items.some(x => x.type === 'tank')) return '［雨水タンク］を置きます。畑より高い場所に置くと、ポンプなしで水が届きます。';
  if (!s.items.some(x => x.type === 'garden')) return '［畑］は押すと10×8mで置けます。押したまま引っぱると広さを決められ、置いたあとも選んで広げられます。400m²で週1日の手入れ。';
  if (s.turn === 0) return '準備ができたら、右下の［ノートPCを閉じる］で3か月進みます。右の［予定］で、週に何日畑に出るかも決められます。';
  return '';
}
function svgPoint(e) {
  const svg = document.getElementById('map'); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function ghostAt(px, py, still) {
  const def = E.ITEMS[G.tool]; let [w, h] = G.toolSize || def.size;
  let x = Math.floor(px - w / 2 + 0.5), y = Math.floor(py - h / 2 + 0.5);
  if (G.drag && !still) {
    const x0 = G.drag.x, y0 = G.drag.y, x1 = Math.floor(px), y1 = Math.floor(py);
    if (G.tool === 'hedge') { if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) { x = Math.min(x0, x1); y = y0; w = Math.abs(x1 - x0) + 1; h = 1; } else { x = x0; y = Math.min(y0, y1); w = 1; h = Math.abs(y1 - y0) + 1; } }
    else { x = Math.min(x0, x1); y = Math.min(y0, y1); w = Math.max(2, Math.abs(x1 - x0) + 1); h = Math.max(2, Math.abs(y1 - y0) + 1); }
  }
  const g = { type: G.tool, x, y, w, h, mods: {} };
  if (G.pendingSpec && E.ITEMS[G.tool].design) { g.spec = G.pendingSpec; g.mode = G.pendingMode; }
  else if (E.ITEMS[G.tool].labor) g.mode = 'hire';
  if (G.tool === 'house') { const T = E.siteTerrain(G.s.site); g.depth = E.depthNeed(G.s.site, T.rect(g).slope); }
  const c = E.canPlace(G.s, g); g.ok = c.ok; g.why = c.why; g.cost = E.itemCost(g);
  if (g.ok && g.cost > G.s.cash) { g.ok = false; g.why = 'お金が足りない'; }
  return g;
}
function onMove(e) {
  if (!G.tool) return;
  const p = svgPoint(e);
  if (G.drag && (Math.floor(p.x) !== G.drag.x || Math.floor(p.y) !== G.drag.y)) G.drag.moved = true;
  G.ghost = G.drag && !G.drag.moved ? ghostAt(p.x, p.y, true) : ghostAt(p.x, p.y); drawGhost(); renderInspect();
}
function onDown(e) {
  const p = svgPoint(e);
  if (!G.tool) {
    const t = e.target.closest('[data-id]'); const id = t ? +t.dataset.id : null;
    if (!id) { // 地図の空き：一番上のものを探す
      const hit = [...G.s.items].reverse().find(x => p.x >= x.x && p.x <= x.x + x.w && p.y >= x.y && p.y <= x.y + x.h);
      G.sel = hit ? hit.id : null;
    } else G.sel = id;
    renderMap(); renderInspect(); return;
  }
  if (E.ITEMS[G.tool].resizable) { G.drag = { x: Math.floor(p.x), y: Math.floor(p.y), moved: false }; try { document.getElementById('map').setPointerCapture(e.pointerId); } catch { } G.ghost = ghostAt(p.x, p.y, true); drawGhost(); }
}
function onUp(e) {
  if (!G.tool) return;
  const p = svgPoint(e);
  // ドラッグせずに押しただけなら、見えている既定の大きさで置く
  G.ghost = G.drag && G.drag.moved ? ghostAt(p.x, p.y) : ghostAt(p.x, p.y, true); G.drag = null;
  const g = G.ghost;
  if (!g.ok) { renderInspect(); return; }
  const r = E.place(G.s, g);
  if (r.error) { renderInspect(); return; }
  G.s = r.state; persist();
  const placed = r.item;
  if (E.ITEMS[g.type].design) G.pendingSpec = null;
  if (g.type === 'house') { G.tool = G.s.items.some(x => x.type === 'tank') ? null : 'tank'; G.toolSize = null; }
  else if (g.type === 'grey') { G.tool = null; G.sel = placed.id; }
  else if (g.type === 'tank' && !E.summarize(G.s).gArea) { G.tool = 'garden'; G.toolSize = null; }
  else if (g.type === 'garden' && G.s.turn === 0 && !G.s.items.some(x => x.type === 'garden' && x.id !== placed.id)) { G.tool = null; G.sel = placed.id; }
  G.ghost = null;
  renderAll();
}
function drawGhost() { const el = document.getElementById('ghost'); if (el) el.innerHTML = G.ghost ? itemSVG(G.ghost, { ok: G.ghost.ok }) : ''; }
function rotate() {
  if (!G.tool) return; const def = E.ITEMS[G.tool]; const [w, h] = G.toolSize || def.size; G.toolSize = [h, w];
  if (G.ghost) { const gx = G.ghost.x + G.ghost.w / 2, gy = G.ghost.y + G.ghost.h / 2; G.ghost = ghostAt(gx, gy); drawGhost(); renderInspect(); }
}

/* ---------- 道具 ---------- */
function known(type) { const d = E.ITEMS[type]; return d.learn === null || G.s.known.includes(d.learn); }
function renderTools() {
  const types = Object.keys(E.ITEMS).filter(known);
  const houseBuilt = G.s.items.some(x => x.type === 'house');
  document.getElementById('tools').innerHTML = types.map(t => {
    const d = E.ITEMS[t]; const dis = t === 'house' && houseBuilt;
    return `<button class="tool${G.tool === t ? ' on' : ''}" data-t="${t}" ${dis ? 'disabled' : ''} aria-pressed="${G.tool === t}"><i class="sw" style="background:${COLORS[t]}"></i>${t === 'grey' ? '排水の浄化' : d.name}${d.design ? '<span class="dz">設計</span>' : ''}</button>`;
  }).join('') + `<button class="tool" id="rot" ${G.tool ? '' : 'disabled'} aria-label="向きを変える（R）">向き↻</button>`;
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    const t = b.dataset.t;
    if (E.ITEMS[t].design && G.tool !== t) {
      openShop({ type: t, s: G.s, onDone: (spec, mode) => {
        const st = t === 'house' ? E.B.STRUCTS[spec.struct] : null;
        G.tool = t; G.pendingSpec = spec; G.pendingMode = mode; G.toolSize = st?.fixed ? [...st.fixed] : [spec.w, spec.h]; G.sel = null; G.ghost = null; renderAll();
      } });
      return;
    }
    G.tool = G.tool === t ? null : t; G.toolSize = null; G.pendingSpec = null; G.sel = null; G.ghost = null; renderAll();
  });
  document.getElementById('rot').onclick = rotate;
}

/* ---------- 選んだもの・置こうとしているもの ---------- */
function renderInspect() {
  const el = document.getElementById('inspect'); const s = G.s, T = E.siteTerrain(s.site), S = E.summarize(s);
  if (G.ghost) {
    el.classList.remove('idle');
    const g = G.ghost, r = T.rect(g);
    const lines = [`${g.w}×${g.h}m · 標高 ${r.elev.toFixed(1)}m · 傾き ${r.slope.toFixed(0)}°`];
    if (g.type === 'house') lines.push(`基礎の深さ ${g.depth.toFixed(1)}m が要る（${E.SITES[s.site].frostDepth ? '凍る深さと斜面' : '斜面が急なほど深い'}）`);
    if (g.type === 'tank' && S.gArea) { const d = r.elev - S.gElev; lines.push(d >= 1.5 ? `畑より${d.toFixed(1)}m高い → 重力で水が届く` : `畑より高くない（${d.toFixed(1)}m） → ポンプが要る`); }
    if (E.ITEMS[g.type].resizable) lines.push(G.drag && G.drag.moved ? 'はなすと置く' : '押すとこの大きさで置く。押したまま引っぱると広さを決められる');
    if (g.type === 'garden') { lines.push(`手入れ 週${(g.w * g.h / 400).toFixed(2)}日`); if (S.tankCap) { const d = S.tElev - r.elev; lines.push(d >= 1.5 ? `タンクより${d.toFixed(1)}m低い → 重力で水が届く` : 'タンクより低くない → ポンプが要る'); } }
    el.innerHTML = `<div><h3>${E.ITEMS[g.type].name}を置く</h3>${lines.map(esc).join('<br>')}</div><div><b class="num">${man(g.cost)}</b><br>${g.ok ? '<span class="ok">置ける</span>' : `<span class="ng">${esc(g.why || '')}</span>`}</div>`;
    return;
  }
  const it = s.items.find(x => x.id === G.sel);
  if (!it) {
    const care = E.careNeed(s);
    el.classList.add('idle');
    el.innerHTML = `<div><h3>敷地</h3>置いたもの ${s.items.length}つ · 手入れ 週${care.total.toFixed(1)}日 / 畑に出る日 週${E.hands(s)}日</div><div class="small">地図のものを押すと、くわしく見たり工夫を足したりできます</div>`;
    return;
  }
  el.classList.remove('idle');
  const r = T.rect(it), d = E.ITEMS[it.type];
  const info = [`${it.w}×${it.h}m · 標高 ${r.elev.toFixed(1)}m · 傾き ${r.slope.toFixed(0)}° · ${s.year - Math.floor((s.turn - it.built) / 4)}年から`];
  const acts = [];
  if (it.type === 'house') {
    info.push(`基礎 ${it.depth.toFixed(1)}m（要る深さ ${S.need.toFixed(1)}m${S.frostNeed ? `・凍る深さ ${S.frostNeed.toFixed(1)}m` : ''}）`);
    if (it.depth < 3) acts.push(`<button class="btn" data-act="deep">基礎を0.3m深く（${man(Math.max(0.1, E.ITEMS.house.cost(it) * E.FOUNDATION.costPerStep * 2))}）</button>`);
    for (const k of ['compostToilet', 'saving']) if (G.s.known.includes(E.MODS[k].learn) && !it.mods[k]) acts.push(`<button class="btn" data-act="mod:${k}">${E.MODS[k].name}をつける（${man(E.MODS[k].cost)}）</button>`);
    for (const k of ['compostToilet', 'saving']) if (it.mods[k]) info.push(`${E.MODS[k].name}つき`);
    const sp = E.houseSpec(it), hm = E.B.houseModel(sp, E.SITES[G.s.site], G.s.persons.length);
    info.push(`${E.B.STRUCTS[sp.struct].name} · 壁の断熱 ${sp.wallMm ? sp.wallMm + 'mm' : 'なし'} · 屋根 ${sp.roofMm ? sp.roofMm + 'mm' : 'なし'} · 熱の逃げやすさ ${hm.UA.toFixed(0)}W/K`);
    acts.unshift(`<button class="btn primary" data-act="design">設計を見る・改修する</button>`);
  }
  if (it.type === 'grey') {
    const sp = E.filterSpec(it), fm = E.B.filterModel(sp, 0.9 * 130 * G.s.persons.length);
    info.push(`${E.B.MEDIA[sp.media].name} · 植物 ${E.B.PLANTS[sp.plants].name} · 前処理 ${E.B.PRE[sp.pre].name} → ${E.B.OUTS[sp.out].name}`);
    info.push(`処理できる量 ${Math.round(fm.capWarm)}L/日 · 詰まりやすさ ${Math.round(fm.clogQ * 100)}%/3か月`);
    acts.unshift(`<button class="btn primary" data-act="design">設計を見る・作り直す</button>`);
  }
  if (it.build && it.build.done < it.build.need) info.unshift(`自分で作っている途中：${Math.round(it.build.done / it.build.need * 100)}%（残り作業 ${(it.build.need - it.build.done).toFixed(0)}日）`);
  if (it.remodel) info.unshift(`改修中：${Math.round(it.remodel.done / it.remodel.need * 100)}%（残り作業 ${(it.remodel.need - it.remodel.done).toFixed(0)}日）`);
  if (it.type === 'garden') {
    const a = it.w * it.h;
    for (const k of ['mulch', 'terrace']) {
      if (it.mods[k]) info.push(`${E.MODS[k].name}`);
      else if (G.s.known.includes(E.MODS[k].learn)) acts.push(`<button class="btn" data-act="mod:${k}">${E.MODS[k].name}（${man(Math.max(1, a * E.MODS[k].costPerM2))}）</button>`);
    }
    info.push(`手入れ 週${(a / 400).toFixed(2)}日`);
  }
  if (d.resizable) {
    for (const [k, lab] of [['w', '東西'], ['h', '南北']]) {
      acts.push(`<button class="btn" data-act="size:${k}:-1" aria-label="${lab}を1m縮める">${lab}−1m</button><button class="btn" data-act="size:${k}:1" aria-label="${lab}を1m広げる">${lab}＋1m</button>`);
    }
  }
  if (it.type === 'tank' && S.gArea) { const dd = r.elev - S.gElev; info.push(dd >= 1.5 ? `畑より${dd.toFixed(1)}m高い：重力で給水` : `畑より高くない：ポンプで給水`); }
  if (d.life) info.push(`寿命 ${d.life}年`);
  acts.push(`<button class="btn ghost" data-act="remove">撤去（お金は戻らない）</button>`);
  el.innerHTML = `<button class="x" data-act="close" aria-label="閉じる">×</button><div><h3>${d.name}</h3>${info.map(esc).join('<br>')}</div><div class="acts">${acts.join('')}</div>`;
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act; let r2;
    if (a === 'close') { G.sel = null; renderMap(); renderInspect(); return; }
    if (a === 'remove') { if (!confirmBox(`${d.name}を撤去しますか？`)) return; G.s = E.removeItem(G.s, it.id); G.sel = null; }
    else if (a === 'deep') { r2 = E.modify(G.s, it.id, { depth: Math.round((it.depth + 0.3) * 10) / 10 }); }
    else if (a.startsWith('mod:')) { r2 = E.modify(G.s, it.id, { mods: { [a.slice(4)]: true } }); }
    else if (a === 'design') {
      openShop({ type: it.type, item: it, s: G.s, onDone: (spec, mode) => { const r3 = E.remodel(G.s, it.id, spec, mode); if (r3.error) { alertBox(r3.error); return; } G.s = r3.state; persist(); renderAll(); } });
      return;
    }
    else if (a.startsWith('size:')) { const [, k, dv] = a.split(':'); r2 = E.modify(G.s, it.id, { [k]: it[k] + Number(dv) }); }
    if (r2) { if (r2.error) { alertBox(r2.error); return; } G.s = r2.state; }
    persist(); renderAll();
  });
}
function alertBox(msg) { modal(`<p>${esc(msg)}</p><button class="btn" data-m="ok">OK</button>`, (m, c) => c()); }

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
function orbSVG(o) {
  const W = 380, H = 330, cx = W / 2, cy = H / 2 + 6;
  const Rm = 36 + 84 * Math.max(0, Math.min(1, o.money));
  const n = o.orbs.length, pos = {};
  const circles = o.orbs.map((orb, i) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n, d = orb.direct;
    const r = 7 + 52 * Math.sqrt(d);
    const dist = (1 - d) * Rm * 0.55 + d * (Rm * 0.35 + 70 + r * 0.5);
    const x = cx + dist * Math.cos(a), y = cy + dist * Math.sin(a);
    pos[orb.id] = { x, y, r, a };
    return { orb, x, y, r, a };
  });
  const links = o.links.map(l => { const A = pos[l.a], B = pos[l.b]; return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="#1F2A2E" stroke-opacity="${(0.08 + 0.25 * l.v).toFixed(2)}" stroke-width="${(2 + 14 * l.v).toFixed(1)}" stroke-linecap="round"/>`; }).join('');
  const body = circles.map(({ orb, x, y, r }) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${orb.color}" fill-opacity="${(0.22 + 0.25 * orb.direct).toFixed(2)}" stroke="${orb.color}" stroke-width="1.5"/>${orb.hurt > 0.15 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 4).toFixed(1)}" fill="none" stroke="#B8641F" stroke-width="${(1 + 3 * orb.hurt).toFixed(1)}" stroke-dasharray="3 3"/>` : ''}`).join('');
  const labels = circles.map(({ orb, x, y, r, a }) => {
    const out = r < 26, lx = out ? x + Math.cos(a) * (r + 8) : x, ly = out ? y + Math.sin(a) * (r + 8) + 4 : y + 4;
    const anchor = out ? (Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle') : 'middle';
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11" text-anchor="${anchor}" fill="#1F2A2E">${esc(orb.name.replace('のめぐり', ''))} ${Math.round(orb.direct * 100)}%</text>`;
  }).join('');
  return `<svg class="web" viewBox="-30 0 ${W + 60} ${H}" role="img" aria-label="めぐりの重なり。お金 ${Math.round(o.money * 100)}%、${o.orbs.map(x => `${x.name} ${Math.round(x.direct * 100)}%`).join('、')}">
    <circle cx="${cx}" cy="${cy}" r="${Rm.toFixed(1)}" fill="#6B7462" fill-opacity=".13" stroke="#6B7462" stroke-width="1.5" stroke-dasharray="5 4"/>
    ${links}${body}${labels}
    <text x="${cx}" y="${cy - 2}" font-size="11" text-anchor="middle" fill="#4A544F">お金の</text><text x="${cx}" y="${cy + 12}" font-size="11" text-anchor="middle" fill="#4A544F">めぐり ${Math.round(o.money * 100)}%</text></svg>`;
}
function panelWeb() {
  const rel = E.relations(G.s), ob = E.orbs(G.s);
  const good = rel.nodes.filter(x => x.good === true && x.v > 0.15).length;
  const sorted = [...rel.nodes].sort((a, b) => b.v - a.v);
  return `<div><h2>めぐり</h2><p class="small">暮らしを、いくつもの「めぐり」の重なりとして見る。色の円が自分の手で回しているめぐり、灰色の点線の円がお金のめぐり。お金の円の中にあるものは、まだお金を通してしか関われていない。円をつなぐ太い帯は、めぐり同士がつながっているところ。橙の点線は、そのめぐりの先で何かを傷めている印。</p></div>
    ${orbSVG(ob)}
    <div><div class="rows"><span>豊かな関係（この章の目標 ${GOAL}）</span><b class="num">${good} / ${GOAL}</b></div><div class="meter"><i style="width:${Math.min(100, good / GOAL * 100)}%"></i></div></div>
    <div class="rows"><span>お金のめぐり（東京のとき 100%）</span><b class="num">${Math.round(ob.money * 100)}%</b></div>
    ${G.s.log.length ? '' : '<p class="small">3か月を過ごすと、網に暮らしの結果が出ます。</p>'}
    ${ob.links.length ? `<h3>つながっているめぐり</h3><div class="nodes">${ob.links.map(l => `<div class="node"><i class="d" style="background:#1F2A2E;opacity:${0.3 + 0.7 * l.v}"></i><b>${esc(E.ORBS.find(x => x.id === l.a).name.replace('のめぐり', ''))}×${esc(E.ORBS.find(x => x.id === l.b).name.replace('のめぐり', ''))}</b><span class="w">${esc(l.why)}</span></div>`).join('')}</div>` : ''}
    <h3>関わっている相手</h3>
    ${ob.orbs.map(o => `<div class="nodes"><div class="small" style="color:${o.color};font-weight:700">${esc(o.name)} ${Math.round(o.direct * 100)}%</div>${o.nodes.map(x => `<div class="node"><i class="d" style="background:${x.good === false ? '#B8641F' : o.color};opacity:${0.3 + 0.7 * x.v}"></i><b>${esc(x.name)}</b><span class="w">${esc(x.why)}</span></div>`).join('')}</div>`).join('')}
    <div class="nodes"><div class="small" style="font-weight:700">お金のめぐり ${Math.round(ob.money * 100)}%</div><div class="node"><i class="d" style="background:#6B7462"></i><b>お金</b><span class="w">暮らしに要るものを、買って済ませている割合</span></div></div>`;
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
    <h3>この1年のめぐり</h3>${year.length ? `<div class="rows"><span>屋根で集めた雨</span><b class="num">${Math.round(sum(x => x.A.harvest / 1000))}m³</b><span>畑から地下へ浸みた水</span><b class="num">${Math.round(sum(x => x.A.recharge))}m³</b><span>畑から流れ去った雨</span><b class="num">${Math.round(sum(x => x.A.runoff))}m³</b><span>近所に分けた野菜</span><b class="num">${Math.round(sum(x => x.foodShared))}kg</b></div>` : '<p class="small">—</p>'}`;
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
    <h3>自分で作っているもの</h3>${(() => { const bd = s.persons.reduce((a, p) => a + E.weekCount(p).build, 0); const list = s.items.filter(x => (x.build && x.build.done < x.build.need) || x.remodel); if (!list.length) return '<p class="small">いまはない。家や浄化設備を「自分で作る」と、ここに並ぶ。</p>'; return list.map(x => { const b = x.remodel || x.build, left = b.need - b.done; return `<div><div class="rows"><span>${esc(E.ITEMS[x.type].name)}${x.remodel ? 'の改修' : ''}</span><b class="num">${Math.round(b.done / b.need * 100)}% · 残り${left.toFixed(0)}日${bd ? ` · 約${Math.ceil(left / (bd * 11))}季節` : ' · 止まっている'}</b></div><div class="meter"><i style="width:${b.done / b.need * 100}%;background:var(--warn)"></i></div></div>`; }).join(''); })()}
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
  const s = G.s, site = E.SITES[s.site], has = s.items.some(x => x.type === 'house');
  const b = document.getElementById('close');
  b.disabled = !has;
  b.textContent = has ? `ノートPCを閉じる → ${site.quarters[s.q].split('・')[0]}を過ごす` : '家を置くと、季節を進められる';
}
function closeLaptop() {
  const before = G.s;
  const { state, report } = E.advance(before);
  let s = state;
  const lessons = [];
  for (const l of report.learn) { s = E.learn(s, l.id, l.why); lessons.push(l); }
  G.s = s; G.report = report; G.tool = null; G.ghost = null; persist();
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
      <div class="stat"><span>お金のめぐり</span><b>${Math.round(E.orbs(s).money * 100)}%</b><span>東京のとき 100%</span></div>
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
  return `<div class="card good"><b>${esc(site.name)}で、めぐりができた（${years}年）</b><span>東京では、どのめぐりもお金の円の中にあった。いまは ${good.length}の相手と豊かに関わっている：${esc(good.join('、'))}。</span><span class="k">${more ? '学んだことを持って、次の土地へ行ける。ここで続けてもいい。' : '地球儀から好きな土地を選ぶ章は準備中。ここで続けられる。'}</span></div>`;
}
const GOAL = 12;
const MODHINT = { toilet: '家を選ぶと工夫として足せる', saving: '家を選ぶと工夫として足せる', insulation: '家を選び「設計を見る・改修する」で断熱を選べる', bamboo: '家を設計するとき骨組みに選べる', earth: '家を設計するとき骨組みに選べる', straw: '家を設計するとき骨組みに選べる', grey: '［排水の浄化］を押すと設計できる', deep: '家を選ぶと基礎を深くできる', mulch: '畑を選ぶと工夫として足せる', terrace: '畑を選ぶと工夫として足せる' };

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

title();
