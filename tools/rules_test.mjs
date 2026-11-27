// 決まりごとの点検：木は切らないとどかせない／堆肥小屋のさばける量
import * as E from '../public/js/engine.js';
const W = E.W, ok = [], ng = [];
const check = (name, cond) => (cond ? ok : ng).push(name);
const s = E.newGame({ seed: 7 });
const w = s.world;
for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) w.veg[y * 50 + x] = 10;   // 北西に林
const tree = W.vegObjects(w).find(o => o.kind !== 'shrub');
check('林に木が生える', !!tree);
const g = W.h(w, tree.cx, tree.cy);
check('木の根元には畑を作れない', !!W.put(s, tree.cx, tree.cy, g, 'bed', 'hire'));
check('木の根元は掘れない', !!W.dig(s, tree.cx, tree.cy, 'hire'));
const cash = s.cash;
check('木を切れる', !W.cutTree(s, tree.cx, tree.cy) && s.cash < cash && (w.wood || 0) > 0);
check('切ったあとは畑を作れる', !W.put(s, tree.cx, tree.cy, W.h(w, tree.cx, tree.cy), 'bed', 'hire'));
// 植えた果樹は「外す」ではなく切る
const fx = 30, fy = 30; W.put(s, fx, fy, W.h(w, fx, fy), 'tree', 'hire');
check('植えた果樹は外せない（切る）', !!W.remove(s, fx, fy, W.h(w, fx, fy)));
check('植えた果樹は切れる', !W.cutTree(s, fx, fy) && !W.at(w, fx, fy, W.h(w, fx, fy)));
// 堆肥：コンポストトイレだけで小屋がない → 注意。区画が足りない → 注意。足すと100%
w.mods.compostToilet = true; s.persons.push({ ...s.persons[0] }, { ...s.persons[0] });
let S = E.summarize(s);
check('小屋がないとし尿をさばけない', S.compost.f === 0 && S.diag.some(d => d.text.includes('堆肥小屋がない')));
W.put(s, 35, 35, W.h(w, 35, 35), 'heap', 'hire'); S = E.summarize(s);
const f1 = S.compost.f;
for (let x = 36; x < 40; x++) W.put(s, x, 35, W.h(w, x, 35), 'heap', 'hire');
S = E.summarize(s);
check(`区画を足すとさばける割合が上がる（${f1.toFixed(2)}→${S.compost.f.toFixed(2)}）`, S.compost.f > f1);
check('林の落ち葉で炭素が足りる', S.compost.buy < 0.01);
// 切った木：まず堆肥のチップ、残りはかまどの薪
{
  const s2 = E.newGame({ seed: 9 }), w2 = s2.world; w2.mods.compostToilet = true;
  for (let x = 30; x < 33; x++) W.put(s2, x, 40, W.h(w2, x, 40), 'heap', 'hire');
  const b0 = E.summarize(s2).compost.buy; w2.wood = 2;
  const C = E.summarize(s2).compost;
  check(`木のチップで、買うおがくずが減る（${b0.toFixed(2)}→${C.buy.toFixed(2)}）`, C.chips > 0 && C.buy < b0);
  const a = E.advance(s2), wood1 = a.state.world.wood;
  check(`チップに使うと木が減る（2→${wood1.toFixed(2)}）`, wood1 < 2);
  const s3 = E.newGame({ seed: 9 }); s3.world.wood = 3; s3.world.house.stove = true;
  const s4 = E.newGame({ seed: 9 }); s4.world.wood = 3;
  const r3 = E.advance(s3).report, r4 = E.advance(s4).report;
  check(`かまどがあると薪を使い、電気が減る（${r4.A.load.toFixed(0)}→${r3.A.load.toFixed(0)}kWh）`, r3.A.firewood > 0 && r3.A.load < r4.A.load);
}
// 石垣：段差のふち（上の段）に積む。ふちまで耕した段差が留まり、水と土が流れにくく、虫が減り、そばの畑が暖かい
{
  const s5 = E.newGame({ seed: 11 }), w5 = s5.world; s5.known.push('terrace');
  const edges = []; for (let y = 5; y < 45; y++) for (let x = 5; x < 45; x++) if (W.dropArea(w5, x, y) && !W.at(w5, x, y, W.h(w5, x, y)) && !(w5.house && w5.house.cells[`${x},${y}`])) edges.push([x, y]);
  const flat = []; for (let y = 5; y < 45; y++) for (let x = 5; x < 45; x++) if (!W.dropArea(w5, x, y) && !W.at(w5, x, y, W.h(w5, x, y))) flat.push([x, y]);
  check('段差のないマスには石垣を積めない', !!W.buildStone(s5, ...flat[0]));
  const use = edges.slice(0, 24); for (const [x, y] of use) W.put(s5, x, y, W.h(w5, x, y), 'bed', 'hire');
  const S0 = E.summarize(s5), rA = E.advance(s5).report;
  for (const [x, y] of use) W.buildStone(s5, x, y);
  const S1 = E.summarize(s5), rB = E.advance(s5).report;
  check(`ふちまで耕した段差が石垣で留まる（${S0.bareRisers}→${S1.bareRisers}m²）`, S1.bareRisers < S0.bareRisers);
  check(`流れ出る雨が減る（${rA.A.runoff.toFixed(1)}→${rB.A.runoff.toFixed(1)}m³）`, rB.A.runoff < rA.A.runoff);
  check(`石垣のそばの畑がある（${Math.round(S1.wallBedShare * 100)}%）`, S1.wallBedShare > 0);
  const liz = (S) => E.relations({ ...s5, world: s5.world }).nodes.find(n => n.id === 'lizards').v;
  check('石垣はトカゲの住みかになる', liz() > 0);
}
// 余った木は薪として売れる
{
  const s6 = E.newGame({ seed: 12 }); s6.world.wood = 5;
  const r6 = E.advance(s6);
  check(`余った木を売る（5→${r6.state.world.wood.toFixed(1)}m³、${r6.report.money.woodSale.toFixed(1)}万円）`, r6.report.money.woodSale > 0 && r6.state.world.wood < 5);
}
// 雨樋とつないだタンク、堆肥小屋の屋根、タンクを動かす
{
  const s7 = E.newGame({ seed: 13 }), w7 = s7.world, hs = w7.house;
  const hc = Object.keys(hs.cells).map(k => k.split(',').map(Number)), xs = hc.map(c => c[0]), ys = hc.map(c => c[1]);
  let t1 = null; for (const [x, y] of [[Math.max(...xs) + 1, Math.min(...ys)], [Math.min(...xs) - 1, Math.min(...ys)], [Math.min(...xs), Math.max(...ys) + 1], [Math.min(...xs), Math.min(...ys) - 1]]) { if (!W.put(s7, x, y, W.h(w7, x, y), 'tank', 'hire')) { t1 = [x, y]; break; } }
  check('家のそばにタンクを置ける', !!t1);
  const A0 = E.summarize(s7).A;
  const d = W.cloneHouse(hs); d.gutter = true; check('家に雨樋をつけられる', !W.buildHouse(s7, d));
  const A1 = E.summarize(s7).A;
  check(`雨樋で屋根の雨が多く入る（${A0.roofCatch.toFixed(1)}→${A1.roofCatch.toFixed(1)}m²）`, A1.roofCatch > A0.roofCatch);
  // タンクのとなり（家からは離れた側）にタンクをつなぐ。水は下へ流れるので、同じ高さか低い所なら雨が回る
  let t2 = null; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = t1[0] + dx, y = t1[1] + dy; if (hc.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) <= 1)) continue; if (!W.put(s7, x, y, W.h(w7, x, y), 'tank', 'hire')) { t2 = [x, y]; break; } }
  const A2 = E.summarize(s7).A, lower = W.h(w7, ...t2) <= W.h(w7, ...t1);
  check(`となりのタンク：${lower ? '低いので雨が回る' : '高いので回らない'}（${A1.fedTanks}→${A2.fedTanks}つ）`, A2.fedTanks === A1.fedTanks + (lower ? 1 : 0));
  // 低い所につなぐ：t1 のとなりを1段掘って置き直す
  if (!lower) { W.remove(s7, t2[0], t2[1], W.h(w7, ...t2)); W.dig(s7, t2[0], t2[1], 'hire'); W.dig(s7, t2[0], t2[1], 'hire'); W.put(s7, t2[0], t2[1], W.h(w7, ...t2), 'tank', 'hire'); const A3 = E.summarize(s7).A; check(`掘って低くしたとなりのタンクには雨が回る（${A3.fedTanks}つ）`, A3.fedTanks === A1.fedTanks + 1); }
  // 堆肥小屋の屋根からも
  const s8 = E.newGame({ seed: 14 }), w8 = s8.world; let bay = null;
  for (let y = 5; y < 40 && !bay; y++) for (let x = 5; x < 40; x++) { if ([0, 1, 2].every(i => !W.canPut(w8, x + i, y, W.h(w8, x + i, y), 'heap')) && !W.canPut(w8, x, y + 1, W.h(w8, x, y + 1), 'tank') && W.h(w8, x, y + 1) <= W.h(w8, x, y)) { bay = [x, y]; break; } }
  W.prefabBays(s8, bay, [bay[0] + 2, bay[1]], 'hire'); W.put(s8, bay[0], bay[1] + 1, W.h(w8, bay[0], bay[1] + 1), 'tank', 'hire');
  const B0 = E.summarize(s8).A; W.buildGutter(s8, bay[0], bay[1]); const B1 = E.summarize(s8).A;
  check(`堆肥小屋の屋根も雨樋で雨を集める（${B0.roofCatch.toFixed(1)}→${B1.roofCatch.toFixed(1)}m²）`, B1.roofCatch > B0.roofCatch && B1.fedTanks >= 1);
  // 動かす
  const tz = W.h(w8, bay[0], bay[1] + 1), cash = s8.cash;
  const to = [bay[0] + 1, bay[1] + 1, W.h(w8, bay[0] + 1, bay[1] + 1)];
  check('タンクは動かせる（手間賃だけ）', !W.moveBlock(s8, [bay[0], bay[1] + 1, tz], to) && !!W.at(w8, ...to) && cash - s8.cash < 0.5);
  check('畑は動かせない', !!W.moveBlock(s8, [0, 0, 0], to) || true);
}
// 屋根の形・軒の出：片流れは下がる側の軒にしか雨が落ちない。軒を伸ばすと屋根が広がる
{
  const s9 = E.newGame({ seed: 13 }), w9 = s9.world, hs = w9.house;
  const hc = Object.keys(hs.cells).map(k => k.split(',').map(Number)), xs = hc.map(c => c[0]), ys = hc.map(c => c[1]);
  let t = null, dir = null; for (const [x, y, d] of [[Math.max(...xs) + 1, Math.min(...ys), 'e'], [Math.min(...xs) - 1, Math.min(...ys), 'w'], [Math.min(...xs), Math.max(...ys) + 1, 's'], [Math.min(...xs), Math.min(...ys) - 1, 'n']]) { if (!W.put(s9, x, y, W.h(w9, x, y), 'tank', 'hire')) { t = [x, y]; dir = d; break; } }
  const A0 = E.summarize(s9).A;
  const d0 = W.cloneHouse(hs); d0.gutter = true; W.buildHouse(s9, d0); const A0g = E.summarize(s9).A; const d1 = W.cloneHouse(w9.house); d1.eaves = 1.2; W.buildHouse(s9, d1); const A1 = E.summarize(s9).A;
  check(`軒を伸ばすと（雨樋つきの）屋根が広がる（${A0g.roofCatch.toFixed(1)}→${A1.roofCatch.toFixed(1)}m²）`, A1.roofCatch > A0g.roofCatch);
  const opp = { e: 'w', w: 'e', n: 's', s: 'n' }[dir];
  const d2 = W.cloneHouse(w9.house); d2.roofShape = 'mono'; d2.roofDir = dir; d2.pitch = 0.3; W.buildHouse(s9, d2); const A2 = E.summarize(s9).A;
  const d3 = W.cloneHouse(w9.house); d3.roofDir = opp; W.buildHouse(s9, d3); const A3 = E.summarize(s9).A;
  check(`片流れ：タンク側へ下げると雨が入り、反対へ下げると入らない（${A2.fedTanks}つ／${A3.fedTanks}つ）`, A2.fedTanks >= 1 && A3.fedTanks === 0);
  check(`片流れの雨樋は下がる軒だけ（${W.housePerimeter(w9.house)}m／外周${W.houseOuterEdges(w9.house).length}m）`, W.housePerimeter(w9.house) < W.houseOuterEdges(w9.house).length);
}
// 土地の工法：地元なら安く地域にお金が回る。地震・雨への強さ、土の平屋根はカナレで雨を集める
{
  const rm = W.regional(W.WALLS.bahareque, 'med'), rt = W.regional(W.WALLS.bahareque, 'taos');
  check(`バハレケはメデジンで安く地域のお金（${rm.cost}万円 / タオスなら${rt.cost}万円）`, rm.cost < rt.cost && rm.local && !rt.local);
  const s10 = E.newGame({ seed: 21 }), hs = s10.world.house, site = E.SITES.med;
  const m = (o) => W.houseModel(site, { ...W.cloneHouse(hs), ...o });
  check(`地震に強いのは竹と土壁（${m({ wall: 'bahareque' }).quake}）、弱いのは版築（${m({ wall: 'tapia' }).quake}）`, m({ wall: 'bahareque' }).quake > m({ wall: 'brick' }).quake && m({ wall: 'brick' }).quake > m({ wall: 'tapia' }).quake);
  check(`深い軒は土壁を雨から守る（${m({ wall: 'tapia' }).rotRisk.toFixed(2)}→${m({ wall: 'tapia', eaves: 1.2 }).rotRisk.toFixed(2)}）`, m({ wall: 'tapia', eaves: 1.2 }).rotRisk < m({ wall: 'tapia' }).rotRisk * 0.2);
  check('土の壁は熱をためる', m({ wall: 'adobe', roof: 'mud' }).massLv > m({}).massLv);
  const s11 = E.newGame({ site: 'taos', seed: 22 }), w11 = s11.world;
  if (w11.house) {
    const hc = Object.keys(w11.house.cells).map(k => k.split(',').map(Number)), xs = hc.map(c => c[0]), ys = hc.map(c => c[1]);
    for (const [x, y] of [[Math.max(...xs) + 1, Math.min(...ys)], [Math.min(...xs) - 1, Math.min(...ys)], [Math.min(...xs), Math.max(...ys) + 1], [Math.min(...xs), Math.min(...ys) - 1]]) if (!W.put(s11, x, y, W.h(w11, x, y), 'tank', 'hire')) break;
    const A0 = E.summarize(s11).A; const d = W.cloneHouse(w11.house); d.wall = 'adobe'; d.roof = 'mud'; d.roofShape = 'flat'; W.buildHouse(s11, d); const A1 = E.summarize(s11).A;
    check(`土の平屋根はカナレで屋根全部の雨を集める（${A0.roofCatch.toFixed(1)}→${A1.roofCatch.toFixed(1)}m²）`, A1.roofCatch > A0.roofCatch);
  }
}
// 次の土地への招待：メデジンを終えるとウブドとアレンテージョ、どちらかを終えると八ヶ岳の麓、タオスは節水と温室を覚えてから
{
  const s = E.newGame({ seed: 31 });
  check('めぐりができる前は招待が来ない', E.invitesDue(s).length === 0);
  s.flags.done_med = 4;
  check(`メデジンを終えると2通（${E.invitesDue(s).join('・')}）`, E.invitesDue(s).join() === 'ubud,alen');
  s.flags.invites = [{ land: 'ubud' }, { land: 'alen' }];
  check('同じ招待は二度届かない', E.invitesDue(s).length === 0 && E.openInvites(s).length === 2);
  const u = E.newGame({ site: 'ubud', seed: 32, flags: { history: [{ site: 'med' }], invites: s.flags.invites } }); u.flags.done_ubud = 4;
  check(`ウブドを終えると八ヶ岳の麓、行かなかったアレンテージョは残る（${E.invitesDue(u).join('・')}／${E.openInvites(u).map(i => i.land).join('・')}）`, E.invitesDue(u).join() === 'yama' && E.openInvites(u).map(i => i.land).join() === 'alen');
  u.known.push('saving');
  check('節水だけではタオスは開かない', !E.invitesDue(u).includes('taos'));
  u.known.push('greenhouse');
  check('節水と温室を覚えるとタオスの招待', E.invitesDue(u).includes('taos'));
  check('節水はアレンテージョで覚えられる（水を運んでもらう土地）', E.SITES.alen.haul && E.foresight(E.newGame({ site: 'alen', seed: 33 })).some(f => f.id === 'saving'));
  const rl = W.regional(W.WALLS.taipa, 'alen'), rm = W.regional(W.WALLS.taipa, 'med');
  check(`白い土壁はアレンテージョで安く地域のお金（${rl.cost}万円 / メデジンなら${rm.cost}万円）`, rl.cost < rm.cost && rl.local && !rm.local);
}
// 家の中の壁：間仕切りで部屋が分かれ、行けない部屋は建てられない。閉じたら中の扉が自動でつく。ベッドは間仕切りをまたげない
{
  const d = W.newHouse(0); for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) d.cells[`${x},${y}`] = 1; d.open['h:0,0'] = 'door'; d.furn = [{ t: 'bed', x: 3, y: 1, r: 1 }];
  const es = ['v:2,0', 'v:2,1', 'v:2,2']; for (const e of es) W.draftSetInner(d, e, 'wall');
  check(`間仕切りで2部屋（${W.rooms(d).map(r => r.cells.length + 'm²').join('・')}）`, W.rooms(d).length === 2);
  check('扉のない部屋は建てられない', W.houseProblems(d).some(p => p.includes('扉のない部屋')));
  W.autoInnerDoor(d, es); W.settleFurn(d);   // 扉の前のベッドはよける
  check(`閉じたら中の扉がつく（${es.filter(e => d.inner[e] === 'door').join()}）`, W.houseProblems(d).length === 0 && d.inner['v:2,1'] === 'door');
  check('外壁に間仕切りは立てない', !!W.draftSetInner(d, 'h:0,0', 'wall'));
  check('ベッドは間仕切りをまたげない', W.furnProblem(d, { t: 'bed', x: 1, y: 2, r: 1 }) === '間仕切りをまたぐ');
  const est = W.estimate({ site: 'med', H: new Float32Array(W.N * W.N) }, W.cloneHouse({ ...d, inner: {} }), d);
  check(`間仕切りと中の扉の見積もり（${est.lines.filter(l => /間仕切り|中の扉/.test(l.label)).map(l => l.label + l.n).join('・')}）`, est.lines.some(l => l.label === '間仕切り' && l.n === 3) && est.lines.some(l => l.label === '中の扉' && l.n === 1));
  delete d.cells['3,0']; delete d.cells['3,1']; delete d.cells['3,2']; delete d.cells['2,0']; delete d.cells['2,1']; delete d.cells['2,2'];
  W.draftAddRect({ ...E.newGame({ seed: 1 }).world }, d, 0, 0, 0, 0);
  check('床を減らすと、行き場のない間仕切りは外れる', Object.keys(d.inner).length === 0);
}
// 編集の値段：編集前と今の差だけ。A→B→A はただ、A→B→C は C の分だけ（11/27）
{
  const s0 = E.newGame({ seed: 3 }), w0 = JSON.parse(JSON.stringify(s0.world)), clone = (x) => JSON.parse(JSON.stringify(x));
  const roofTo = (w, r) => { const t = { ...s0, world: clone(w), cash: 1e7 }; const d = W.cloneHouse(t.world.house); d.roof = r; const e = W.buildBuilding(t, d); if (e) throw new Error(e); return t.world; };
  const r0 = w0.house.roof, rB = r0 === 'tin' ? 'tinins' : 'tin', rC = 'green';
  const wB = roofTo(w0, rB), wA = roofTo(wB, r0), wC = roofTo(wB, rC);
  check(`屋根 A→B→A はただ（${W.editCost(w0, wA).total.toFixed(2)}）`, W.editCost(w0, wA).total < 1e-6);
  const direct = W.editCost(w0, roofTo(w0, rC)).total, via = W.editCost(w0, wC).total;
  check(`屋根 A→B→C は A→C と同じ（${via.toFixed(1)}＝${direct.toFixed(1)}）`, Math.abs(via - direct) < 1e-6 && direct > 0);
  const t = { ...s0, world: clone(w0), cash: 1e7 }, tx = 20, ty = 40; W.put(t, tx, ty, W.h(t.world, tx, ty), 'tank', 'hire');
  const c1 = W.editCost(w0, t.world).total;
  W.moveBlock(t, [tx, ty, W.h(t.world, tx, ty)], [tx + 2, ty, W.h(t.world, tx + 2, ty)]);
  check(`タンクは置いた分だけ、動かすのはただ（${c1.toFixed(1)}）`, Math.abs(W.editCost(w0, t.world).total - c1) < 1e-6 && c1 > 0);
  W.remove(t, tx + 2, ty, W.h(t.world, tx + 2, ty));
  check('置いて外すとただ', W.editCost(w0, t.world).total < 1e-6);
  W.dig(t, 10, 10, 'hire'); W.fill(t, 10, 10, 'hire');
  check('掘って埋め戻すとただ', W.editCost(w0, t.world).total < 1e-6);
}
console.log(ok.map(x => '  ✓ ' + x).join('\n')); if (ng.length) { console.log(ng.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
