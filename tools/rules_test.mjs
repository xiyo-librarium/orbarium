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
console.log(ok.map(x => '  ✓ ' + x).join('\n')); if (ng.length) { console.log(ng.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
