/* 工房：家と排水の浄化設備を設計する画面 */
import * as E from './engine.js';
const B = E.B;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const man = (v) => `${Math.round(v).toLocaleString('ja-JP')}万円`;

/* 1年の平年値で性能を見積もる */
function houseYear(m, siteKey, n) {
  const site = E.SITES[siteKey], N = E.normals(siteKey);
  let heat = 0, hot = 0, peak = -99, cond = 0;
  N.forEach((c, i) => {
    const r = B.houseDay(m, { t: c.t, tmax: c.tmax, psh: c.psh }, n);
    heat += r.heat * E.DAYS[i]; if (r.peak > B.HOT) hot += E.DAYS[i]; peak = Math.max(peak, r.peak);
    if (m.condenseProne && ((site.humid && c.tmin < 20) || c.tmin < 5)) cond += E.DAYS[i];
  });
  const cop = 2.6;
  return { heat, elec: heat / cop, yen: heat / cop * E.MARKET.power, hot, peak, cond };
}

/* 共通：選択肢の列 */
function seg(label, key, opts, cur, help) {
  return `<div class="seg"><div class="seg-h"><b>${esc(label)}</b>${help ? `<span class="small">${esc(help)}</span>` : ''}</div><div class="seg-o" role="group" aria-label="${esc(label)}">${opts.map(o => `<button class="opt${String(cur) === String(o.v) ? ' on' : ''}" data-k="${key}" data-v="${esc(o.v)}" ${o.locked ? 'disabled' : ''} aria-pressed="${String(cur) === String(o.v)}" title="${esc(o.title || '')}">${esc(o.locked ? '？ ' + o.label : o.label)}</button>`).join('')}</div></div>`;
}

/* ================= 家 ================= */
function houseSVG(spec, m) {
  // 断面図：左が北、右が南。1m = 40px
  const k = 40, W = Math.max(m.fw, m.fh), H = m.H, base = 270, x0 = 70, x1 = x0 + W * k;
  const st = B.STRUCTS[spec.struct], steel = !!st.steel;
  const wt = steel ? 6 : spec.struct === 'tire' ? 34 : spec.struct === 'straw' ? 22 : spec.struct === 'earthbag' ? 18 : 10;
  const insT = Math.min(26, spec.wallMm / 8), roofT = Math.min(30, spec.roofMm / 10), floorT = Math.min(16, spec.floorMm / 10);
  const out = spec.place === 'outside' && steel;
  const wallCol = { wood: '#C8A87A', container20: '#7E8C96', container40: '#7E8C96', bamboo: '#C9B27A', earthbag: '#B08A5B', tire: '#5E5A55', straw: '#E2C66B' }[spec.struct];
  const floorY = spec.floor === 'raised' ? base - 24 : base;
  const top = floorY - H * k;
  const ev = B.EAVES[spec.eaves].depth * k;
  const winH = Math.max(14, Math.min(H * k * 0.7, (spec.winPct / 30) * H * k * 0.8));
  const lat = Math.abs(E.SITES[window.__site || 'med'].lat || 0);
  const sunW = 90 - lat - 23.4, sunS = 90 - lat + 23.4;   // 冬至と夏至の南中高度
  const ray = (deg, col, lab) => { const r = deg * Math.PI / 180, len = 150; const sx = x1 + 40 + Math.cos(r) * len, sy = top + 30 - Math.sin(r) * len; return `<line x1="${sx}" y1="${sy}" x2="${x1 + 40}" y2="${top + 30}" stroke="${col}" stroke-width="2" stroke-dasharray="5 4"/><text x="${sx - 6}" y="${sy - 4}" font-size="11" fill="${col}" text-anchor="end">${lab} ${Math.round(deg)}°</text>`; };
  let walls = '';
  const wall = (x, side) => {
    const insX = side === 'L' ? (out ? x - insT : x + wt) : (out ? x + wt : x - insT);
    return `<rect x="${x}" y="${top}" width="${wt}" height="${floorY - top}" fill="${wallCol}" stroke="#1F2A2E" stroke-width="1"/>` +
      (insT ? `<rect x="${insX}" y="${top}" width="${insT}" height="${floorY - top}" fill="#F3D9DD" stroke="#B8838C" stroke-width=".8"/>` : '');
  };
  walls += wall(x0, 'L') + wall(x1 - wt, 'R');
  // 窓（南＝右の壁）
  const wy = top + (floorY - top) * 0.25;
  walls += `<rect x="${x1 - wt - 1}" y="${wy}" width="${wt + 2}" height="${winH}" fill="#CFE1F2" stroke="#2B6CB0" stroke-width="1.2"/>`;
  if (spec.south < 90) walls += `<rect x="${x0 - 1}" y="${wy}" width="${wt + 2}" height="${winH * (1 - spec.south / 100)}" fill="#CFE1F2" stroke="#2B6CB0" stroke-width="1.2"/>`;
  // 屋根
  const roofCol = spec.roof === 'green' ? '#5E9C5A' : '#8C9499';
  const rt = top - (steel ? 0 : 18);
  const roof = `<path d="M${x0 - ev} ${top + (steel ? 0 : 6)} L${x0 + (x1 - x0) / 2} ${rt} L${x1 + ev} ${top + (steel ? 0 : 6)}" fill="none" stroke="${roofCol}" stroke-width="${spec.roof === 'green' ? 9 : 4}" stroke-linejoin="round"/>` +
    (roofT ? `<rect x="${x0 + wt}" y="${top}" width="${x1 - x0 - 2 * wt}" height="${roofT}" fill="#F3D9DD" stroke="#B8838C" stroke-width=".8"/>` : '');
  // 床と基礎
  let floor = spec.floor === 'slab'
    ? `<rect x="${x0}" y="${base - 12}" width="${x1 - x0}" height="12" fill="#A39A8C" stroke="#1F2A2E" stroke-width="1"/>`
    : `<rect x="${x0}" y="${floorY - 6}" width="${x1 - x0}" height="6" fill="#C8A87A" stroke="#1F2A2E" stroke-width="1"/>` + [0.15, 0.5, 0.85].map(f => `<rect x="${x0 + (x1 - x0) * f - 3}" y="${floorY}" width="6" height="${base - floorY}" fill="#8C7B63"/>`).join('');
  if (floorT) floor += `<rect x="${x0 + wt}" y="${(spec.floor === 'slab' ? base - 12 : floorY - 6) - floorT}" width="${x1 - x0 - 2 * wt}" height="${floorT}" fill="#F3D9DD" stroke="#B8838C" stroke-width=".8"/>`;
  const berm = spec.struct === 'tire' ? `<path d="M${x0 - 60} ${base} Q${x0 - 20} ${top + 10} ${x0} ${top + 20} L${x0} ${base}Z" fill="#B59A74" opacity=".7"/><text x="${x0 - 50}" y="${base - 30}" font-size="11" fill="#5E4A30">北の土盛り</text>` : '';
  const corrug = steel ? Array.from({ length: Math.floor(H * k / 8) }, (_, i) => `<line x1="${x0}" y1="${top + i * 8}" x2="${x0 + wt}" y2="${top + i * 8}" stroke="#5E6A72" stroke-width=".6"/>`).join('') : '';
  const ground = `<rect x="0" y="${base}" width="${x1 + 200}" height="60" fill="#D9CFBF"/><line x1="0" y1="${base}" x2="${x1 + 200}" y2="${base}" stroke="#7F6F57" stroke-width="1.5"/>`;
  const wide = x1 + 210;
  return `<svg viewBox="0 0 ${wide} 340" role="img" aria-label="家の断面図。${esc(st.name)}、壁の断熱${spec.wallMm}mm、屋根の断熱${spec.roofMm}mm" class="xsec">
    <text x="10" y="18" font-size="12" fill="#4A544F">断面（左が北・右が南）</text>
    ${ray(sunW, '#B8641F', '冬至の太陽')}${ray(Math.min(89, sunS), '#C08A1E', '夏至の太陽')}
    ${ground}${berm}${floor}${walls}${corrug}${roof}
    <text x="${(x0 + x1) / 2}" y="${(top + floorY) / 2}" font-size="13" text-anchor="middle" fill="#1F2A2E">${m.A.toFixed(0)}m²</text>
    ${insT || roofT || floorT ? `<rect x="10" y="300" width="12" height="10" fill="#F3D9DD" stroke="#B8838C"/><text x="26" y="309" font-size="11" fill="#4A544F">断熱材</text>` : ''}
    <rect x="90" y="300" width="12" height="10" fill="${wallCol}" stroke="#1F2A2E"/><text x="106" y="309" font-size="11" fill="#4A544F">${esc(st.name)}</text>
    ${ev ? `<text x="${x1 + ev}" y="${top - 6}" font-size="11" fill="#4A544F" text-anchor="end">庇 ${B.EAVES[spec.eaves].depth}m</text>` : ''}
  </svg>`;
}
function houseControls(spec, ctx) {
  const known = (id) => !id || ctx.known.includes(id);
  const ins = known('insulation');
  const st = B.STRUCTS[spec.struct];
  const lock = ctx.remodel;
  let h = '';
  h += seg('骨組み', 'struct', Object.entries(B.STRUCTS).map(([v, o]) => ({ v, label: o.name, locked: !known(o.learn) || (lock && v !== spec.struct) })), spec.struct, lock ? '改修では変えられない' : '');
  h += `<p class="small note-s">${esc(st.note)}</p>`;
  if (!st.fixed) h += seg('広さ', 'size', [[3, 3], [4, 4], [5, 4], [6, 5], [8, 6]].map(([w, hh]) => ({ v: `${w}x${hh}`, label: `${w * hh}m²`, locked: lock })), `${spec.w}x${spec.h}`);
  h += seg('壁の断熱（厚さ）', 'wallMm', [0, 50, 100, 150, 200].map(v => ({ v, label: v ? `${v}mm` : 'なし', locked: v > 0 && !ins })), spec.wallMm, ins ? '' : '断熱はまだ知らない');
  if (spec.wallMm || spec.roofMm || spec.floorMm) h += seg('断熱材', 'ins', Object.entries(B.INSUL).map(([v, o]) => ({ v, label: o.name, locked: !ins })), spec.ins);
  if (st.steel && spec.wallMm) h += seg('断熱の位置', 'place', [{ v: 'inside', label: '内側' }, { v: 'outside', label: '外側（外断熱）' }], spec.place, '鋼板は外から包むと結露しない');
  h += seg('屋根', 'roof', [{ v: 'tin', label: 'トタン（雨をよく集める）' }, { v: 'green', label: '草屋根（涼しい・生き物）' }], spec.roof);
  h += seg('屋根の断熱', 'roofMm', [0, 100, 200, 300].map(v => ({ v, label: v ? `${v}mm` : 'なし', locked: v > 0 && !ins })), spec.roofMm);
  h += seg('床', 'floor', [{ v: 'raised', label: '高床（木）' }, { v: 'slab', label: '土間（熱を溜める）' }], spec.floor);
  h += seg('床の断熱', 'floorMm', [0, 50, 100, 150].map(v => ({ v, label: v ? `${v}mm` : 'なし', locked: v > 0 && !ins })), spec.floorMm);
  h += seg('窓の量（床面積に対して）', 'winPct', [5, 10, 15, 20, 25, 30].map(v => ({ v, label: `${v}%` })), spec.winPct);
  h += seg('南向きの窓', 'south', [0, 50, 90].map(v => ({ v, label: v === 0 ? '向きは気にしない' : v === 50 ? '半分を南に' : 'ほとんど南に' })), spec.south, Math.abs(E.SITES[ctx.site].lat) < 15 ? '赤道に近いので、向きの差は小さい' : '冬の低い日差しを入れる');
  h += seg('ガラス', 'glazing', Object.entries(B.GLAZING).map(([v, o]) => ({ v, label: o.name, locked: !known(o.learn) })), spec.glazing);
  h += seg('庇（ひさし）', 'eaves', Object.entries(B.EAVES).map(([v, o]) => ({ v, label: o.name })), spec.eaves, '夏の日差しと雨から壁を守る');
  h += seg('すきま', 'air', Object.entries(B.AIR).map(([v, o]) => ({ v, label: o.name, locked: !known(o.learn) })), spec.air);
  return h;
}
function houseStats(spec, ctx) {
  const m = B.houseModel(spec, E.SITES[ctx.site], ctx.n), y = houseYear(m, ctx.site, ctx.n);
  const parts = [['壁', m.parts.wall, '#C8A87A'], ['屋根', m.parts.roof, '#8C9499'], ['床', m.parts.floor, '#A39A8C'], ['窓', m.parts.window, '#7FB0D8'], ['すきま', m.parts.air, '#C9CDBF']];
  const bar = parts.map(([n, v, c]) => `<i style="width:${(v / m.UA * 100).toFixed(1)}%;background:${c}" title="${n}"></i>`).join('');
  const risk = (v, good, bad) => v ? `<b class="ng">${bad}</b>` : `<span class="ok">${good}</span>`;
  return { m, y, html: `
    <div class="stat2"><span>熱の逃げやすさ</span><b>${m.UA.toFixed(0)} W/K</b><div class="ua">${bar}</div><div class="legend">${parts.map(([n, v, c]) => `<span><i style="background:${c}"></i>${n} ${Math.round(v / m.UA * 100)}%</span>`).join('')}</div></div>
    <div class="stat2"><span>冬の暖房（ヒートポンプの電気）</span><b>${Math.round(y.elec).toLocaleString()} kWh/年</b><span>${y.yen < 0.5 ? 'ほぼ要らない' : `約${man(y.yen)}/年`}</span></div>
    <div class="stat2"><span>暑すぎる日（室温${B.HOT}℃超）</span><b>${y.hot}日/年</b><span>いちばん暑い日の室温 約${y.peak.toFixed(0)}℃</span></div>
    <div class="stat2"><span>熱を溜める力</span><b>${m.mass.name}</b><span>重いほど昼の熱を夜に回せる</span></div>
    <div class="stat2"><span>結露</span>${risk(m.condenseProne, '心配なし', `冷えた鋼板に結露（年${y.cond}日ほど）`)}</div>
    <div class="stat2"><span>雨での傷み</span>${risk(m.rotRisk > 0.2, '心配なし', '壁が雨で傷みやすい。庇を深く')}</div>` };
}

/* ================= 排水の浄化 ================= */
function filterSVG(spec, fm) {
  const k = 60, L = spec.w * k, D = spec.depth * k * 1.6, x0 = 150, top = 120;
  const layers = spec.media === 'gravel' ? [['粗い砂利', '#A5A29A', 1]] : spec.media === 'sand' ? [['粗い砂利', '#A5A29A', 0.35], ['細かい砂利', '#BDB8AC', 0.25], ['砂', '#E2D3A6', 0.4]] : [['粗い砂利', '#A5A29A', 0.3], ['細かい砂利', '#BDB8AC', 0.2], ['炭', '#3A3A3A', 0.15], ['砂', '#E2D3A6', 0.35]];
  let y = top + D, bands = '';
  for (const [n, c, f] of layers) { const h = D * f; y -= h; bands += `<rect x="${x0}" y="${y}" width="${L}" height="${h}" fill="${c}"/><text x="${x0 + L + 8}" y="${y + h / 2 + 4}" font-size="11" fill="#4A544F">${n}</text>`; }
  const plants = spec.plants === 'none' ? '' : Array.from({ length: Math.max(2, Math.round(spec.w * 2.5)) }, (_, i) => { const px = x0 + 12 + i * (L - 24) / Math.max(1, Math.round(spec.w * 2.5) - 1); return `<path d="M${px} ${top} q-6 -30 -2 -${spec.plants === 'reed' ? 58 : 40} M${px} ${top} q6 -24 10 -${spec.plants === 'reed' ? 50 : 34}" stroke="${spec.plants === 'reed' ? '#6E8B3D' : '#4E8F5B'}" stroke-width="2.5" fill="none"/>${spec.plants === 'canna' ? `<circle cx="${px + 9}" cy="${top - 36}" r="4" fill="#D9542C"/>` : ''}`; }).join('');
  const pre = spec.pre === 'none' ? '' : `<rect x="40" y="${top - 6}" width="50" height="${spec.pre === 'settle' ? 54 : 30}" fill="#DCE6EE" stroke="#2B6CB0"/><text x="65" y="${top + (spec.pre === 'settle' ? 64 : 40)}" font-size="10" text-anchor="middle" fill="#2B6CB0">${spec.pre === 'settle' ? '沈殿槽' : '油とり'}</text>`;
  const out = B.OUTS[spec.out].name;
  return `<svg viewBox="0 0 ${x0 + L + 180} ${top + D + 70}" class="xsec" role="img" aria-label="バイオフィルターの断面図。${spec.w}×${spec.h}m、深さ${spec.depth}m">
    <text x="10" y="18" font-size="12" fill="#4A544F">断面（家の排水 → 前処理 → 層を通って → ${esc(out)}）</text>
    <rect x="0" y="${top}" width="${x0 + L + 180}" height="${D + 70}" fill="#D9CFBF"/><line x1="0" y1="${top}" x2="${x0 + L + 180}" y2="${top}" stroke="#7F6F57" stroke-width="1.5"/>
    <path d="M0 ${top - 40} H30" stroke="#6B7462" stroke-width="5"/><text x="2" y="${top - 48}" font-size="11" fill="#4A544F">家から</text>
    ${pre}<path d="M${spec.pre === 'none' ? 30 : 90} ${top - 20} H${x0 + 8} V${top + 6}" stroke="#6B7462" stroke-width="4" fill="none"/>
    <rect x="${x0 - 3}" y="${top}" width="${L + 6}" height="${D + 3}" fill="#30404A"/>
    ${bands}${plants}
    <path d="M${x0 + L} ${top + D - 10} H${x0 + L + 60}" stroke="#2B6CB0" stroke-width="4" marker-end="url(#fa)"/>
    <defs><marker id="fa" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6z" fill="#2B6CB0"/></marker></defs>
    <text x="${x0 + L + 66}" y="${top + D - 6}" font-size="12" fill="#2B6CB0">${esc(out)}</text>
    <text x="${x0 + L / 2}" y="${top + D + 22}" font-size="12" text-anchor="middle" fill="#1F2A2E">${spec.w}×${spec.h}m · 深さ${spec.depth}m · 掘る土 ${(spec.w * spec.h * spec.depth).toFixed(1)}m³</text>
  </svg>`;
}
function filterControls(spec, ctx, fm) {
  let h = '';
  h += seg('大きさ', 'fsize', [[1, 2], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4]].map(([w, hh]) => ({ v: `${w}x${hh}`, label: `${w}×${hh}m（${w * hh}m²）`, locked: ctx.remodel })), `${spec.w}x${spec.h}`, ctx.remodel ? '改修では変えられない' : '人工湿地は1人あたり1m²ほどが目安');
  h += seg('深さ', 'depth', [0.4, 0.6, 0.8].map(v => ({ v, label: `${v}m` })), spec.depth);
  h += seg('層', 'media', Object.entries(B.MEDIA).map(([v, o]) => ({ v, label: o.name })), spec.media);
  h += `<p class="small note-s">${esc(B.MEDIA[spec.media].note)}</p>`;
  h += seg('植物', 'plants', Object.entries(B.PLANTS).map(([v, o]) => ({ v, label: o.name })), spec.plants, '根が層に空気を送り、詰まりにくくする');
  h += seg('前処理', 'pre', Object.entries(B.PRE).map(([v, o]) => ({ v, label: o.name })), spec.pre, '先に油や汚れを落とすほど、層が長持ちする');
  h += seg('きれいになった水の行き先', 'out', Object.entries(B.OUTS).map(([v, o]) => ({ v, label: o.name, locked: (o.need && fm.quality < o.need) || (v === 'pond' && !ctx.known.includes('pond')) })), spec.out);
  return h;
}
function filterStats(spec, ctx) {
  const grey = 0.9 * (ctx.saving ? 65 : 130) * ctx.n;
  const fm = B.filterModel(spec, grey);
  const stars = '★★★'.slice(0, fm.quality) + '☆☆☆'.slice(0, 3 - fm.quality);
  return { fm, html: `
    <div class="stat2"><span>出る排水（台所・風呂・洗濯）</span><b>${Math.round(grey)} L/日</b><span>${ctx.n}人${ctx.saving ? '・節水の器具あり' : ''}</span></div>
    <div class="stat2"><span>処理できる量</span><b>${Math.round(fm.capWarm)} L/日</b><span>寒い日（10℃未満）は ${Math.round(fm.capCold)} L/日</span></div>
    <div class="stat2"><span>余裕</span>${fm.load <= 0.8 ? `<span class="ok">ゆとりあり（${Math.round(fm.load * 100)}%）</span>` : fm.load <= 1 ? `<b class="ng">ぎりぎり（${Math.round(fm.load * 100)}%）</b>` : `<b class="ng">あふれる（${Math.round(fm.load * 100)}%）。残りは下水へ</b>`}</div>
    <div class="stat2"><span>詰まりやすさ</span><b>${Math.round(fm.clogQ * 100)}% / 3か月</b><span>詰まると掃除に2万円、その間は4割しか流れない</span></div>
    <div class="stat2"><span>水のきれいさ</span><b>${stars}</b><span>${fm.quality >= 2 ? 'トイレの流し水に使える' : '畑の地中か、地下へ'}</span></div>` };
}

/* ================= 画面 ================= */
/* opts: { type, item?, s, onDone(spec, mode) } */
export function openShop(opts) {
  const s = opts.s, item = opts.item, remodel = !!item;
  window.__site = s.site;
  const S = E.summarize(s);
  const ctx = { site: s.site, known: s.known, n: s.persons.length, remodel, saving: S.saving };
  let spec = item ? JSON.parse(JSON.stringify(opts.type === 'house' ? E.houseSpec(item) : E.filterSpec(item))) : (opts.type === 'house' ? B.defaultSpec('wood') : B.defaultFilter());
  let mode = 'hire';
  const weeklyBuild = s.persons.reduce((a, p) => a + E.weekCount(p).build, 0);
  const d = document.createElement('div'); d.className = 'shop';
  document.body.appendChild(d);
  const close = () => { d.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const render = () => {
    let stats, ctrl, svg, cost;
    if (opts.type === 'house') {
      const st = B.STRUCTS[spec.struct]; if (st.fixed) { spec.w = st.fixed[0]; spec.h = st.fixed[1]; }
      const hs = houseStats(spec, ctx); stats = hs.html; ctrl = houseControls(spec, ctx); svg = houseSVG(spec, hs.m);
      cost = remodel ? E.remodelCost(item, spec, mode) : { money: mode === 'self' ? hs.m.materials : hs.m.hire, labor: hs.m.labor };
      cost.mat = hs.m.materials; cost.hireAll = hs.m.hire; cost.laborAll = hs.m.labor;
    } else {
      const fs = filterStats(spec, ctx); stats = fs.html; ctrl = filterControls(spec, ctx, fs.fm); svg = filterSVG(spec, fs.fm);
      if (spec.out === 'toilet' && !fs.fm.okToilet) spec.out = 'garden';
      cost = remodel ? E.remodelCost(item, spec, mode) : { money: mode === 'self' ? fs.fm.materials : fs.fm.hire, labor: fs.fm.labor };
      cost.mat = fs.fm.materials; cost.hireAll = fs.fm.hire; cost.laborAll = fs.fm.labor;
    }
    const weeks = weeklyBuild ? Math.ceil(cost.labor / (weeklyBuild * 11)) : null;
    const title = opts.type === 'house' ? (remodel ? '家を改修する' : '家を設計する') : (remodel ? 'バイオフィルターを作り直す' : 'バイオフィルターを設計する');
    const selfNote = cost.labor < 0.2 ? '作業はほとんど要らない' : weeklyBuild ? `作業 ${cost.labor.toFixed(0)}日 → 今の予定（週${weeklyBuild}日）で約${weeks}季節` : `作業 ${cost.labor.toFixed(0)}日。予定に「作業」の日を入れると進む`;
    d.innerHTML = `<div class="shop-in" role="dialog" aria-modal="true" aria-label="${title}">
      <header><h2>${title}</h2><span class="small">所持金 ${man(s.cash)}</span><button class="btn ghost" id="sx">やめる</button></header>
      <div class="shop-body"><div class="shop-draw">${svg}<div class="stats2">${stats}</div></div><div class="shop-ctrl">${ctrl}</div></div>
      <footer>
        <div class="modes" role="group" aria-label="作り方">
          <button class="mode${mode === 'hire' ? ' on' : ''}" data-mode="hire" aria-pressed="${mode === 'hire'}"><b>頼む</b><span>${remodel ? '' : `材料${man(cost.mat)}＋人件費 · `}すぐ完成</span><span class="num">${man(mode === 'hire' ? cost.money : (remodel ? E.remodelCost(item, spec, 'hire').money : cost.hireAll))}</span></button>
          <button class="mode${mode === 'self' ? ' on' : ''}" data-mode="self" aria-pressed="${mode === 'self'}"><b>自分で作る</b><span>${selfNote}</span><span class="num">${man(mode === 'self' ? cost.money : (remodel ? E.remodelCost(item, spec, 'self').money : cost.mat))}</span></button>
        </div>
        <button class="btn primary" id="ok" ${cost.money > s.cash + 1e-9 ? 'disabled' : ''}>${cost.money > s.cash + 1e-9 ? 'お金が足りない' : remodel ? 'この設計で改修する' : 'この設計で地図に置く'}</button>
      </footer></div>`;
    d.querySelector('#sx').onclick = close;
    d.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; render(); });
    d.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k, v = b.dataset.v;
      if (k === 'size' || k === 'fsize') { const [w, h] = v.split('x').map(Number); spec.w = w; spec.h = h; }
      else if (['wallMm', 'roofMm', 'floorMm', 'winPct', 'south', 'depth'].includes(k)) spec[k] = Number(v);
      else spec[k] = v;
      if (k === 'struct' && !B.STRUCTS[v].fixed && (spec.w < 3)) { spec.w = 4; spec.h = 4; }
      const sc = d.querySelector('.shop-ctrl').scrollTop; render(); d.querySelector('.shop-ctrl').scrollTop = sc;
    });
    d.querySelector('#ok').onclick = () => { close(); opts.onDone(spec, mode); };
  };
  render();
  d.querySelector('#sx').focus();
}
