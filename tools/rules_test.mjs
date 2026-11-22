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
console.log(ok.map(x => '  ✓ ' + x).join('\n')); if (ng.length) { console.log(ng.map(x => '  ✗ ' + x).join('\n')); process.exit(1); }
