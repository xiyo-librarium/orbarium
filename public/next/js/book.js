/* ノートと季節の報告：めぐり・家計簿・予定・天気・ノート、メール、季節が過ぎたときの報告。
   文章と数字は今の版（engine / content）のものをそのまま使い、見た目だけ /next に合わせる */
import * as E from '/js/engine.js';
import { NOTES, LESSON, eventText, ATLAS, CHAPTER_END, LANDS, CLIMATE } from '/js/content.js';

export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const man = (v) => `${Math.round(v).toLocaleString('ja-JP')}万円`;
const pct = (v) => `${Math.round(v * 100)}%`;
export const GOAL = 10;   // この章の目標：豊かに関わる相手の数

/* 学んだときに、どこで使えるようになったか（/next の道具の名前で） */
export const MODHINT = {
  heap: '［小屋］で堆肥小屋が作れる', mulch: '［畑］で畑を押すとマルチが敷ける', greenhouse: '［畑］で畑を押すと覆い（小さな温室）がかけられる',
  hedge: '［木］で果樹と生け垣が植えられる', chicken: '［小屋］でニワトリ小屋が置ける', pond: '［水］で池が掘れる', grey: '［水］で排水の庭が作れる',
  toilet: '母屋のカードでコンポストトイレが選べる', saving: '母屋のカードで節水シャワーが選べる', insulation: '建物のカードで「断熱した」が選べる',
  terrace: '［地形］で段差に石垣が積める', offgrid: '母屋のカードで太陽光と蓄電池が足せる', deep: '母屋のカードで基礎を深くできる',
  catch: '離れの屋根も雨を集める。軒のそばにタンクを', bamboo: 'この土地の工法（竹と土壁）', earth: '土の壁', straw: 'わらの壁'
};

/* メール：差出人の丸いアイコン、名前と肩書き、宛先、日付、件名、本文、添付（ノート）、ボタン */
export function mailHTML(m, o = {}) {
  const mm = /^(.+?)（(.+)）$/.exec(m.from || ''), name = mm ? mm[1] : m.from, role = mm ? mm[2] : '';
  const hue = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const body = (Array.isArray(m.body) ? m.body : [m.body]).map(p => `<p>${esc(p)}</p>`).join('');
  return `<article class="mail${o.cls ? ' ' + o.cls : ''}">
    <div class="mail-top"><span>受信トレイ</span><span>${esc(o.date || '')}</span></div>
    <div class="mail-head"><span class="mail-av" style="--h:${hue}">${esc((name || '?').slice(0, 1))}</span>
      <div class="mail-who"><b>${esc(name)}</b>${role ? `<span>${esc(role)}</span>` : ''}<span class="to">宛先：あなた</span></div></div>
    <div class="mail-subj">${esc(m.subject)}</div><div class="mail-body">${body}</div>
    ${o.attach ? `<div class="mail-att"><b>${esc(o.attach.name)}</b>${o.attach.what ? `<span>${esc(o.attach.what)}</span>` : ''}</div>` : ''}
    ${o.actions ? `<div class="mail-act">${o.actions}</div>` : ''}</article>`;
}
export const mailDate = (s) => s ? `${s.year}年 ${E.SITES[s.site].quarters[s.q].split('・')[0]}` : '';
export const lessonMail = (l, date) => { const n = NOTES[l.id]; const m = (LESSON[l.why] || LESSON.intro)(n.name); return mailHTML(m, { cls: 'in', date, attach: { name: `ノート「${n.name}」`, what: MODHINT[l.id] || '使えるようになった' } }); };

/* めぐり：どの流れも 入口 → 備蓄 → 出口。色で「土地・人（ゆるい／きっちり）・共有・戻す・漏れる」を見分ける */
export const FCOL = { land: '#4E9A5C', land2: '#8CC08A', loose: '#C2B4EC', tight: '#7062C4', shared: '#4F86B8', ret: '#1F9C86', leak: '#BDB8AE', near: '#D08B3A', far: '#8E939C' };
const fmt = (x) => x >= 100 ? Math.round(x).toLocaleString() : x >= 10 ? x.toFixed(0) : x.toFixed(1);
const bar = (parts) => { const tot = parts.reduce((a, x) => a + x[2], 0); return tot > 0 ? parts.filter(x => x[2] > 0).map(x => `<i style="flex:${x[2]};background:${FCOL[x[0]]}" title="${esc(x[1])}"></i>`).join('') : '<i class="none"></i>'; };
export function flowCards(fs) {
  const leg = (parts) => { const tot = parts.reduce((a, x) => a + x[2], 0); return parts.filter(x => x[2] > 0 || x[0] === 'ret').map(x => `<span><i style="background:${FCOL[x[0]]}"></i>${esc(x[1])} <b>${tot ? Math.round(x[2] / tot * 100) : 0}%</b></span>`).join(''); };
  return fs.map(f => {
    const d = f.stock.days, stock = f.money ? `${Math.max(0, Math.round(d / 30))}か月分` : d >= 1 ? `${Math.round(d)}日分` : 'ほぼなし';
    return `<section class="fcard"><div class="fh"><b>${esc(f.name)}</b><span>1年あたり ${fmt(f.total)}${esc(f.unit)}</span></div>
      <div class="fstrip"><div class="fcol"><span class="k">入口</span><div class="fbar">${bar(f.inlet)}</div></div><span class="far">→</span>
        <div class="fstock"><span class="k">備蓄</span><b>${stock}</b><span>${esc(f.stock.label)}</span></div><span class="far">→</span>
        <div class="fcol"><span class="k">出口</span><div class="fbar">${bar(f.outlet)}</div></div></div>
      <div class="fleg"><span class="k">入口</span>${leg(f.inlet)}</div><div class="fleg"><span class="k">出口${f.outUnit ? `（${esc(f.outUnit)}）` : ''}</span>${leg(f.outlet)}</div>
      <p class="sm">${esc(f.tokyo)}</p></section>`;
  }).join('');
}
/* 季節の報告用：流れごとに 入口 → 出口 の細い帯と、土地から／戻す の割合 */
export function flowMini(fs) {
  const share = (parts, keys) => { const t = parts.reduce((a, x) => a + x[2], 0); return t > 0 ? parts.filter(x => keys.includes(x[0])).reduce((a, x) => a + x[2], 0) / t : 0; };
  const short = { water: '水', food: '食べもの', energy: 'エネルギー', money: 'お金' };
  return fs.map(f => {
    const a = f.money ? share(f.inlet, ['near']) : share(f.inlet, ['land', 'land2']), b = f.money ? share(f.outlet, ['near']) : share(f.outlet, ['ret']);
    const txt = f.money ? `近所から ${pct(a)}・へ ${pct(b)}` : f.id === 'energy' ? `土地から ${pct(a)}` : `土地から ${pct(a)}・戻す ${pct(b)}`;
    return `<div class="stat"><span>${short[f.id]}</span><div class="frow"><div class="fbar">${bar(f.inlet)}</div><em>→</em><div class="fbar">${bar(f.outlet)}</div></div><span>${txt}</span></div>`;
  }).join('');
}

/* ---------- ノートの各ページ ---------- */
export const TABS = [['web', 'めぐり'], ['book', '家計簿'], ['plan', '予定'], ['sky', '天気'], ['note', 'ノート']];
const KEY = [['land', '土地'], ['loose', '人・ゆるい'], ['tight', '人・きっちり'], ['shared', '共有の網'], ['ret', '戻す'], ['leak', '漏れる'], ['near', '近所'], ['far', '遠く']];
export function pageWeb(s) {
  const rel = E.relations(s), good = rel.nodes.filter(x => x.good === true && x.v > 0.15), first = !s.log.length;
  return `<p class="sm">水も食べものもエネルギーもお金も、どれも <b>入口 → 備蓄 → 出口</b> の形で流れている。入口が緑（土地）なほど自分の土地から来て、出口が青緑（戻す）なほど土地に返っている。</p>
    <div class="fkey">${KEY.map(([k, n]) => `<span><i style="background:${FCOL[k]}"></i>${n}</span>`).join('')}</div>
    ${first ? '<p class="sm"><b>東京のころ</b>（くらべるため）。季節を過ごすと、この土地の暮らしの流れに変わる。</p>' : ''}
    ${flowCards(first ? E.tokyoFlows() : E.flows(s))}
    <h3>担い手（流れを回す人と生き物）</h3>
    <div class="rows"><span>この章の目標</span><b>${good.length} / ${GOAL}</b></div><div class="meter"><i style="width:${Math.min(100, good.length / GOAL * 100)}%"></i></div>
    <div class="nodes">${rel.nodes.map(x => `<span class="${x.good === true && x.v > 0.15 ? 'on' : x.good === false && x.v > 0.15 ? 'bad' : ''}" title="${esc(x.why)}">${esc(x.name)}</span>`).join('')}</div>`;
}
export function pageBook(s) {
  const last = s.log[s.log.length - 1], T = E.tokyoYear(), year = s.log.slice(-4), k = year.length ? 4 / year.length : 0;
  const sum = (f) => year.reduce((a, x) => a + f(x), 0) * k;
  const me = { water: sum(x => (x.A.city + x.A.bottled) / 1000), power: sum(x => x.A.grid), food: sum(x => x.foodBought), sewer: sum(x => x.A.sewer / 1000) };
  const tk = { water: T.flows.water, power: T.flows.power, food: T.flows.food, sewer: T.flows.sewer };
  const row = (name, unit, a, b) => { const mx = Math.max(a, b, 1); return `<span>${name}</span><div class="bars"><i class="tk" style="width:${(a / mx * 100).toFixed(0)}%"></i><i class="me" style="width:${(b / mx * 100).toFixed(0)}%"></i></div><span class="num">${fmt(a)} → ${fmt(b)}${unit}</span>`; };
  let ledger = '<p class="sm">まだ季節を過ごしていない。</p>';
  if (last) {
    const m = last.money;
    const items = [['仮住まい', -(m.rent || 0)], ['外貨の仕事', m.income], ['野菜・電気・薪を売った', (m.sell || 0) + (m.woodSale || 0)], ['仕事の経費', -m.jobCost], ['そのほかの暮らし', -m.living], ['食べものを買った', -m.food], ['水を買った', -(m.water || 0)], ['電気を買った', -(m.power || 0)], ['手入れと修理', -((m.maint || 0) + (m.repair || 0))], ['設備の交換', -(m.replace || 0)]].filter(([, v]) => Math.abs(v || 0) >= 0.05);
    ledger = `<div class="rows">${items.map(([n, v]) => `<span>${n}</span><b class="${v < 0 ? 'neg' : ''}">${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}万円</b>`).join('')}<span><b>差し引き</b></span><b>${last.net >= 0 ? '+' : '−'}${Math.abs(last.net).toFixed(1)}万円</b></div>`;
  }
  return `<p class="sm">円の財布だけでなく、水・電気・食べもの・土の財布で暮らしを見る。</p>
    <h3>直前の3か月</h3>${ledger}
    <h3>外から買ったもの・外へ出したもの（1年あたり）</h3>
    <div class="legend"><span><i class="tk"></i>東京のとき</span><span><i class="me"></i>いま</span></div>
    ${year.length ? `<div class="cmp">${row('水を買った', 'm³', tk.water, me.water)}${row('電気を買った', 'kWh', tk.power, me.power)}${row('食べものを買った', 'kg', tk.food, me.food)}${row('下水に流した', 'm³', tk.sewer, me.sewer)}</div>` : '<p class="sm">季節を過ごすと、東京のときとくらべられる。</p>'}`;
}
export function pagePlan(s) {
  const care = E.careNeed(s), hand = E.hands(s), work = s.persons.reduce((a, p) => a + E.weekCount(p).work, 0);
  const lab = { work: '仕事', farm: '畑', build: '畑', rest: '休み' };
  return `<p class="sm">マスを押すと 仕事 → 畑 → 休み と変わる。東京では週5日、会社の仕事だった。</p>
    <div class="week"><span></span>${E.WEEKDAYS.map(d => `<span>${d}</span>`).join('')}
    ${s.persons.map((p, pi) => `<span class="who">${esc(p.name)}</span>${p.week.map((v, di) => `<button class="cell ${v === 'build' ? 'farm' : v}" data-cell="${pi},${di}" aria-label="${esc(p.name)} ${E.WEEKDAYS[di]}曜 ${lab[v]}">${lab[v]}</button>`).join('')}`).join('')}</div>
    <h3>畑と手入れ</h3><div class="meter${hand < care.total ? ' over' : ''}"><i style="width:${Math.min(100, care.total ? hand / care.total * 100 : 100)}%"></i></div>
    <div class="rows"><span>手入れに要る日数</span><b>週${care.total.toFixed(1)}日</b><span>畑に出る日</span><b>週${hand}日</b></div>
    <h3>外貨の仕事（東京の会社のリモート）</h3>
    <div class="rows"><span>週${work}日 × 日給${E.WAGE}万円</span><b>3か月で約${man(work * E.WAGE * 12)}</b><span>そのほかの暮らし</span><b>3か月で${man(E.LIVING * s.persons.length)}</b></div>`;
}
export function pageSky(s, canStudy) {
  const N = E.normals(s.site), site = E.SITES[s.site], maxR = Math.max(...N.map(c => Math.max(c.rain, c.et0 * 30)));
  const bars = N.map((c, m) => { const h = c.rain / maxR * 90, e = c.et0 * 30 * 0.85 / maxR * 90; return `<rect x="${m * 24 + 4}" y="${100 - h}" width="14" height="${h}" rx="2" fill="#9CC2E6"/><circle cx="${m * 24 + 11}" cy="${100 - e}" r="2.6" fill="#B8641F"/><text x="${m * 24 + 11}" y="114" font-size="8.5" text-anchor="middle" fill="#5E6A64">${m + 1}</text>`; }).join('');
  const ins = E.foresight(s).filter(f => !s.known.includes(f.id));
  const past = s.log.slice(-8).map(l => `<span>${l.y}年 ${site.quarters[l.q].split('・')[0]}${l.phase === 'nino' ? '（エルニーニョ）' : l.phase === 'nina' ? '（ラニーニャ）' : ''}</span><b>${Math.round(l.A.rain)}mm</b>`).join('');
  return `<p class="sm">${esc(site.sub || site.name)}。青い棒が月の雨、橙の点が畑から蒸発する水の目安。点が棒より上の月は、畑が乾く。</p>
    <svg class="sky" viewBox="0 0 290 120" role="img" aria-label="月ごとの雨と蒸発">${bars}</svg>
    <h3>これまでの記録</h3>${past ? `<div class="rows">${past}</div>` : '<p class="sm">まだ記録がない。</p>'}
    <h3>記録から気づけること（先読み）</h3><p class="sm">困る前に調べれば、ノートに書いておける。調べられるのは3か月に1つ。</p>
    ${ins.length ? ins.map(f => `<div class="insight"><span>${esc(f.text)}</span><button data-study="${f.id}" ${canStudy ? '' : 'disabled'}>調べる</button></div>`).join('') : '<p class="sm">いま気づけることは、もうノートにある。</p>'}`;
}
export function pageNote(s, atlasRead = []) {
  const all = ['house', 'tank', 'garden', ...E.TECH], read = ATLAS.filter(a => atlasRead.includes(a.id));
  return `<p class="sm">困ったことや、調べたことから学んだ技術。知らないものは、置けない。</p>
    ${all.map(id => {
      const n = NOTES[id], k = s.known.includes(id), l = s.learned.find(x => x.id === id);
      if (!n) return '';
      if (!k) return `<div class="note locked"><b>？？？</b><span>まだ知らない技術。この土地で何かに困ったとき、誰かが教えてくれるかもしれない。</span></div>`;
      return `<div class="note"><b>${esc(n.name)}</b><span>${esc(n.what)}</span><span>${esc(n.how)}</span><span class="meta">${esc(n.cost || '')}${l ? ` · ${l.how === 'foresight' ? '記録から先読み' : l.how === 'atlas' ? '図鑑から' : '教わった'}` : ''}${MODHINT[id] ? ` · ${esc(MODHINT[id])}` : ''}</span></div>`;
    }).join('')}
    <h3>世界の知恵（図鑑）</h3>${read.length ? read.map(a => `<div class="note"><b>${esc(a.name)} · ${esc(a.place)}</b><span>${esc(a.text)}</span></div>`).join('') : '<p class="sm">まだ読んでいない。地球儀の図鑑はこれから移す。</p>'}`;
}

/* ---------- 季節が過ぎたときの報告 ---------- */
function choiceHTML(c, f) {
  if (c === 'surplus') return `<div class="seg"><button class="${f.surplus !== 'sell' ? 'on' : ''}" data-choice="surplus:share">これからも分ける</button><button class="${f.surplus === 'sell' ? 'on' : ''}" data-choice="surplus:sell">これからは売る</button></div>`;
  if (c === 'pest') return `<div class="seg"><button class="${f.pestHand ? 'on' : ''}" data-choice="pest:hand">次は手で取る</button><button class="${!f.pestHand ? 'on' : ''}" data-choice="pest:none">様子を見る</button></div>`;
  return '';
}
export function chapterMail(s, rep) {
  const P = (x) => Math.round((x || 0) * 100), w = s.world;
  const heap = Object.values(w.blocks).some(b => b.t === 'heap'), ctoilet = !!(w.house && (w.house.furn || []).some(f => f.t === 'ctoilet'));
  return CHAPTER_END[s.site] ? CHAPTER_END[s.site]({ water: P(rep.waterSelf), food: P(rep.foodSelf), money: P(E.cycles(s)[3].closure), heap, ctoilet }) : null;
}
export const nextLands = (s) => Object.keys(LANDS).filter(k => k !== s.site);
// before：過ごす前、s：過ごした後、end：この季節で章の目標に届いたか
export function reportHTML(s, before, rep, lessons, end) {
  const site = E.SITES[s.site], phase = rep.phase === 'nino' ? 'エルニーニョの年（雨が少ない）' : rep.phase === 'nina' ? 'ラニーニャの年（雨が多い）' : '';
  const evs = rep.events.map(e => ({ e, t: eventText(e) }));
  const mails = lessons.map(l => lessonMail(l, mailDate(before))).join('');
  let endHTML = '';
  if (end) {
    const rel = E.relations(s), good = rel.nodes.filter(x => x.good === true && x.v > 0.15).map(x => x.name), more = nextLands(s).length > 0;
    const cm = more ? chapterMail(s, rep) : null;
    endHTML = (cm ? mailHTML(cm, { cls: 'in', date: mailDate(s) }) : '') + `<div class="ev good"><b>${esc(site.name)}で、めぐりができた（${(s.turn / 4).toFixed(1)}年）</b><span>東京では、水も食べものもエネルギーも、入口は遠くの網、出口は下水とごみだった。いまは ${good.length}の相手と豊かに関わっている：${esc(good.join('、'))}。</span>${more ? '<span class="k">学んだ技術と、所持金と、週の過ごし方は持っていける。置いたものは、この土地に残る。</span>' : ''}</div>`;
  }
  return `<header><h2>${rep.year}年 ${esc(site.quarters[rep.q])}が過ぎた</h2><span class="sm">雨 ${Math.round(rep.A.rain)}mm${phase ? ' · ' + phase : ''}</span></header>
    <div class="stats"><div class="stat"><span>所持金</span><b>${man(s.cash)}</b><span>${rep.net >= 0 ? '+' : '−'}${Math.abs(rep.net).toFixed(0)}万円</span></div>
      ${flowMini(E.flows(s, 1))}
      <div class="stat"><span>土の有機物</span><b>${rep.om.toFixed(2)}%</b><span>収穫 ${Math.round(rep.harvest + (rep.treeFood || 0))}kg</span></div></div>
    ${mails ? `<div class="mails">${mails}</div>` : ''}
    <div class="evs">${evs.length ? evs.map(({ t }) => `<div class="ev ${t.tone || ''}"><span class="k">出来事</span><b>${esc(t.title)}</b><span>${esc(t.body)}</span>${choiceHTML(t.choice, s.flags)}</div>`).join('') : '<div class="ev"><b>穏やかな3か月だった</b><span>大きな出来事はなかった。</span></div>'}</div>
    ${s.cash < 0 ? '<div class="ev bad"><b>お金が足りない</b><span>赤字になった。予定で外貨の仕事を増やすか、しばらく何も建てずに過ごそう。</span></div>' : ''}
    ${endHTML}`;
}

/* 着いたときの気候：気温の帯と雨、東京とくらべる */
export function climateHTML(s) {
  const S = E.SITES[s.site], C = CLIMATE[s.site], T = E.SITES.tokyo; if (!C) return '';
  const sum = (a) => a.reduce((x, y) => x + y, 0), avg = (a) => sum(a) / a.length, r1 = (x) => Math.round(x * 10) / 10;
  const lo = Math.min(...S.tmin), hi = Math.max(...S.tmax), rain = Math.round(sum(S.rain)), days = Math.round(sum(S.rainDays));
  const MO = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  // 図：雨（棒）と気温（朝の最低〜昼の最高の帯、平均の線）。点線は東京の平均気温
  const W2 = 560, H2 = 230, L = 34, R = 40, Tp = 14, B = 26, cw = (W2 - L - R) / 12;
  const tMin = Math.min(0, Math.floor(Math.min(...S.tmin, ...T.tmin) / 5) * 5), tMax = Math.ceil(Math.max(...S.tmax, ...T.tmax) / 5) * 5, rMax = Math.max(250, Math.ceil(Math.max(...S.rain, ...T.rain) / 50) * 50);
  const yT = (t) => Tp + (H2 - Tp - B) * (1 - (t - tMin) / (tMax - tMin)), yR = (r) => Tp + (H2 - Tp - B) * (1 - r / rMax), xM = (i) => L + cw * (i + 0.5);
  const band = [...S.tmax.map((t, i) => `${xM(i)},${yT(t)}`), ...S.tmin.map((_, i) => `${xM(11 - i)},${yT(S.tmin[11 - i])}`)].join(' ');
  const svg = `<svg class="clim" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="月ごとの気温と雨">
    ${[...Array((tMax - tMin) / 5 + 1)].map((_, k) => { const t = tMin + k * 5, y = yT(t); return `<line x1="${L}" x2="${W2 - R}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 6}" y="${y + 4}" class="ax" text-anchor="end">${t}℃</text>`; }).join('')}
    ${[0, rMax / 2, rMax].map(r => `<text x="${W2 - R + 6}" y="${yR(r) + 4}" class="ax rn">${r}mm</text>`).join('')}
    ${S.rain.map((r, i) => `<rect x="${xM(i) - cw * 0.32}" y="${yR(r)}" width="${cw * 0.64}" height="${yR(0) - yR(r)}" class="rb"><title>${i + 1}月 雨${Math.round(r)}mm</title></rect>`).join('')}
    <polygon points="${band}" class="tb"/>
    <polyline points="${S.tmean.map((t, i) => `${xM(i)},${yT(t)}`).join(' ')}" class="tm"/>
    <polyline points="${T.tmean.map((t, i) => `${xM(i)},${yT(t)}`).join(' ')}" class="tk"/>
    ${MO.map((m, i) => `<text x="${xM(i)}" y="${H2 - 8}" class="ax" text-anchor="middle">${m}月</text>`).join('')}
  </svg>
  <div class="clegend"><span><i class="k-tb"></i>${esc(S.name)}の気温（朝の最低〜昼の最高）</span><span><i class="k-tm"></i>平均</span><span><i class="k-tk"></i>東京の平均</span><span><i class="k-rb"></i>雨（月）</span></div>`;
  const stats = [['年の平均気温', `${r1(avg(S.tmean))}℃`, `東京 ${r1(avg(T.tmean))}℃`], ['朝の最低〜昼の最高', `${lo.toFixed(0)}〜${hi.toFixed(0)}℃`, `東京 ${Math.min(...T.tmin).toFixed(0)}〜${Math.max(...T.tmax).toFixed(0)}℃`], ['一年の雨', `${rain.toLocaleString()}mm`, `東京 ${Math.round(sum(T.rain)).toLocaleString()}mm`], ['雨の日', `年${days}日`, `東京 年${Math.round(sum(T.rainDays))}日`]];
  return `<div class="small">${esc(S.sub || '')}・標高${S.elev.toLocaleString()}m</div><h2>${esc(C.title)}</h2><p style="margin:0 0 8px">${esc(C.lead)}</p>
    <div class="cstats">${stats.map(([k, v2, t]) => `<div><span class="small">${esc(k)}</span><b>${esc(v2)}</b><span class="small">${esc(t)}</span></div>`).join('')}</div>
    ${svg}
    <dl class="cpoints">${C.points.map(([k, v2]) => `<dt>${esc(k)}</dt><dd>${esc(v2)}</dd>`).join('')}</dl>
    <p class="small" style="margin:6px 0 10px">${S.real ? '2014〜2023年の、この区画の実際の気象（Open-Meteo）から作った平年値。' : '実際の気象を取れなかったので、仮の平年値です。'}</p>
`;
}
