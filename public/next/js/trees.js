/* 木：一本ずつ形が違う。幹と枝の骨組みを先に作り、枝先に葉のかたまりを付ける。
   形は場所から決まる乱数で選ぶので、同じ木はいつ見ても同じ形。 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { matte, hash, glow } from './look.js';

const coarse = matchMedia('(pointer: coarse)').matches;
const UP = new THREE.Vector3(0, 1, 0);

/* 葉のかたまり：丸いふくらみを少し崩す。崩し方は 2 通り（同じ形が並ばないように） */
function blobGeo(detail, variant) {
  let g = new THREE.IcosahedronGeometry(1, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.getAttribute('position'), v = new THREE.Vector3(), o = variant * 1.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.08 * Math.sin(v.x * 3.7 + v.y * 2.3 + o) * Math.cos(v.z * 3.1 - v.x * 1.9 + o) + 0.04 * Math.sin(v.y * 7.3 + v.z * 6.1 + o * 2);
    v.multiplyScalar(n); v.y *= variant ? 0.78 : 0.88; if (v.y < 0) v.y *= 0.82;   // 下側は少し平たく（枝に乗っている感じ）
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // 法線を球の向きに半分寄せる：ふくらみの陰影がやわらかくなる
  const nm = g.getAttribute('normal'), w = new THREE.Vector3();
  for (let i = 0; i < nm.count; i++) { v.fromBufferAttribute(p, i).normalize(); w.fromBufferAttribute(nm, i).lerp(v, 0.5).normalize(); nm.setXYZ(i, w.x, w.y, w.z); }
  return g;
}

/* 針葉樹の段：円すいの縁を少し波打たせ、裾を広げる */
function tierGeo(variant) {
  const g = new THREE.ConeGeometry(1, 1, 18, 3, true); g.translate(0, 0.5, 0);
  const p = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    const k = 1 + 0.1 * Math.sin(a * 5 + variant * 2.1) + 0.06 * Math.sin(a * 9 + 1.3 + variant);
    const droop = v.y < 0.05 ? -0.08 * (0.5 + 0.5 * Math.sin(a * 7 + variant)) : 0;   // 裾が少し垂れる
    p.setXYZ(i, v.x * k, v.y + droop, v.z * k);
  }
  g.computeVertexNormals(); return g;
}

/* 葉の影：葉のかたまりは日の光を少し通し、ところどころ丸く抜ける（木漏れ日）。
   影を作るときだけ、日の向きから見た模様で穴をあける。模様はかたまりごとに固定（時刻を動かしても踊らない）。
   ・丸い穴：かたまりの 3 割ほど。光の筋が地面に丸い日だまりを落とす
   ・小さな抜け：さらに 1〜2 割。ぼかすと「薄い影」になる */
function dappleDepth() {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec2 vL; varying vec3 vC;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
        mat4 mI = modelMatrix * instanceMatrix;
      #else
        mat4 mI = modelMatrix;
      #endif
      vec3 wP = (mI * vec4(transformed, 1.0)).xyz, wC = (mI * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vL = (mat3(viewMatrix) * (wP - wC)).xy; vC = wC;`);
    sh.fragmentShader = `varying vec2 vL; varying vec3 vC;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float spots(vec2 p) { vec2 i = floor(p), f = fract(p); float d = 9.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), o = vec2(h21(i + g), h21(i + g + 17.3));
          d = min(d, length(g + o - f) / (0.16 + 0.2 * h21(i + g + 5.1))); }
        return d; }
      ` + sh.fragmentShader.replace('void main() {', `void main() {
        vec2 sp = vL * 1.8 + vec2(h21(vC.xz), h21(vC.zx + 3.7)) * 40.0;
        if (spots(sp) < 1.0) discard;
        if (spots(sp * 3.1 + 11.0) < 0.85) discard;`);
  };
  return m;
}

export function buildTrees(list, at, P, opt = {}) {
  const group = new THREE.Group();
  const big = [blobGeo(coarse ? 2 : 3, 0), blobGeo(coarse ? 2 : 3, 1)], small = [blobGeo(2, 0), blobGeo(2, 1)];
  const tiers = [tierGeo(0), tierGeo(1)];
  const woodGeo = new THREE.CylinderGeometry(0.62, 1, 1, 7, 1); woodGeo.translate(0, 0.5, 0);
  const B = { big: [[], []], small: [[], []], tier: [[], []], wood: [], fruit: [] };
  const col = new THREE.Color(), tmp = new THREE.Color();

  for (const t of list) {
    if (opt.skip && opt.skip(t)) continue;
    const r = (k) => hash(t.x, t.y, 200 + k), z = at(t.x, t.y), base = new THREE.Vector3(t.x, z, t.y);
    // この木の色：パレットの葉色に、黄み・青み・明るさの揺らぎを足す
    const leafOf = (hex) => { col.set(hex); const u = r(1); if (u < 0.3) col.lerp(tmp.set('#9AA54C'), 0.22 * (1 - u / 0.3)); else if (u > 0.75) col.lerp(tmp.set('#365F45'), 0.25 * (u - 0.75) / 0.25); return col.multiplyScalar(0.9 + 0.16 * r(2)).getHex(); };
    const blob = (pos, s, c, k = 1, sm = false) => {
      const rp = (j) => hash(pos.x * 7.3 + pos.y * 3.1, pos.z * 5.7, j);   // かたまりごとの乱数
      const v = rp(1) > 0.5 ? 1 : 0, q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rp(2) - 0.5) * 0.4, rp(3) * 6.28, (rp(4) - 0.5) * 0.4));
      const sc = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s * (0.92 + 0.16 * rp(5)), s * (0.86 + 0.14 * rp(6)), s * (0.92 + 0.16 * rp(7)));
      (sm || sc.x < 0.55 ? B.small : B.big)[v].push({ p: pos.clone(), q, s: sc, c, k });
    };
    const wood = (a, b, rad, c = P.trunk) => { const d = b.clone().sub(a), L = d.length(); if (L < 0.05) return; B.wood.push({ p: a.clone(), q: new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), s: new THREE.Vector3(rad, L, rad), c, k: 0.9 + 0.2 * r(50) }); };

    if (t.kind === 'shrub') {
      // 茂み：1〜3 個のかたまりが寄り合う。横に広いもの、こんもりしたもの
      const c = leafOf(P.leaf[Math.floor(r(3) * 4)]), n = 1 + Math.floor(r(4) * 3), R = t.r;
      for (let i = 0; i < n; i++) {
        const a = r(5 + i) * 6.28, d = i ? R * (0.45 + 0.25 * r(8 + i)) : 0, s = R * (i ? 0.62 + 0.2 * r(11 + i) : 1);
        blob(base.clone().add(new THREE.Vector3(Math.cos(a) * d, t.h * (i ? 0.32 : 0.42), Math.sin(a) * d)), [s * 1.05, t.h * (i ? 0.45 : 0.62), s], c, i ? 0.95 : 1);
      }
      continue;
    }

    // 傾き：少しだけ、木ごとに違う向きへ
    const la = r(6) * 6.28, lean = (t.kind === 'pine' ? 0.05 : t.kind === 'euca' ? 0.08 : 0.13) * r(7), L = new THREE.Vector3(Math.sin(lean) * Math.cos(la), Math.cos(lean), Math.sin(lean) * Math.sin(la));
    const trunkR = Math.max(0.09, t.r * (t.kind === 'euca' ? 0.08 : 0.11));

    if (t.kind === 'pine') {
      // 針葉樹：段の数・太さ・ずれを木ごとに変える。幹は根元だけ見せる
      const n = 3 + Math.floor(r(8) * 3), H = t.h, c = leafOf(P.pine), slim = 0.8 + 0.35 * r(9);
      wood(base, base.clone().addScaledVector(L, H * 0.5), trunkR);
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1), y0 = H * (0.22 + 0.56 * f), rad = t.r * slim * (1.1 - 0.75 * f) * (0.9 + 0.2 * r(10 + k)), th = Math.min(H * (0.56 / (n - 1)) * (1.75 - 0.35 * f) + (k === n - 1 ? H * 0.06 : 0), rad * 2.6);   // 細すぎる槍にならないように
        const off = new THREE.Vector3((r(14 + k) - 0.5) * 0.12 * t.r, 0, (r(18 + k) - 0.5) * 0.12 * t.r);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, L).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((r(22 + k) - 0.5) * 0.12, r(26 + k) * 6.28, (r(30 + k) - 0.5) * 0.12)));
        B.tier[k % 2].push({ p: base.clone().addScaledVector(L, y0).add(off), q, s: new THREE.Vector3(rad, th, rad), c, k: 0.88 + 0.16 * f });
      }
      continue;
    }

    if (t.kind === 'euca') {
      // ユーカリ：白っぽい細い幹がまっすぐ高く、葉は上の方にまばらな房
      const H = t.h, fork = base.clone().addScaledVector(L, H * (0.5 + 0.1 * r(8))), c = leafOf(P.euca ?? P.leaf[0]), bark = P.bark ?? '#B8AC94';
      wood(base, fork, trunkR, bark);
      const nb = 3 + Math.floor(r(9) * 2);
      for (let i = 0; i < nb; i++) {
        const a = la + i / nb * 6.28 + r(10 + i) * 1.2, out = t.r * (0.35 + 0.4 * r(14 + i)), up = H * (0.12 + 0.3 * r(18 + i));
        const e = fork.clone().add(new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out));
        wood(fork, e, trunkR * 0.5, bark);
        const s = t.r * (0.36 + 0.14 * r(22 + i));
        blob(e, [s, s * 1.25, s], c, 0.95 + 0.1 * r(26 + i));
        if (r(30 + i) > 0.3) blob(fork.clone().lerp(e, 0.55).add(new THREE.Vector3((r(34 + i) - 0.5) * s, s * 0.2, (r(38 + i) - 0.5) * s)), s * 0.7, c, 0.92, true);   // 枝の途中にも房
      }
      blob(fork.clone().addScaledVector(L, H * 0.42), [t.r * 0.42, t.r * 0.5, t.r * 0.42], c, 1.05);
      if (r(42) > 0.4) { const e = base.clone().addScaledVector(L, H * 0.38).add(new THREE.Vector3(Math.cos(la + 2) * t.r * 0.35, 0, Math.sin(la + 2) * t.r * 0.35)); wood(base.clone().addScaledVector(L, H * 0.3), e, trunkR * 0.4, bark); blob(e, t.r * 0.3, c, 0.92, true); }
      continue;
    }

    if (t.kind === 'hedge') {
      // 生け垣：刈りこんだ低い茂み。となりも生け垣なら、あいだを茂みでつないで一本の垣根に（列の上は平らに刈る）
      const c = leafOf(P.pine), nb = t.nb || {}, row = nb.e || nb.w || nb.n || nb.s, hh = row ? t.h * 0.92 : t.h;
      if (!row) { for (let i = 0; i < 2; i++) { const a = r(5 + i) * 6.28, d = i ? 0.22 : 0; blob(base.clone().add(new THREE.Vector3(Math.cos(a) * d, t.h * (i ? 0.62 : 0.48), Math.sin(a) * d)), [0.66, t.h * (i ? 0.42 : 0.52), 0.66], c, i ? 1.08 : 1); } continue; }
      const alongX = (nb.e || nb.w) && !(nb.n || nb.s), alongY = (nb.n || nb.s) && !(nb.e || nb.w), sx = alongY ? 0.5 : 0.6, sz = alongX ? 0.5 : 0.6;
      blob(base.clone().add(new THREE.Vector3(0, hh * 0.5, 0)), [sx, hh * 0.5, sz], c, 1);
      for (const [k, dx, dz] of [['e', 0.5, 0], ['s', 0, 0.5]]) if (nb[k]) blob(base.clone().add(new THREE.Vector3(dx, hh * 0.5 + (r(7 + dx * 3) - 0.5) * 0.06, dz)), [dx ? 0.55 : sx, hh * 0.49, dz ? 0.55 : sz], c, 1.03);
      continue;
    }
    // 広葉樹：形を 4 つから選ぶ（丸い・横に広い・縦に長い・二股）。植えた果樹は丸く小さく、実がなる
    const fruit = t.kind === 'fruit';
    const u = r(11), form = fruit ? 'round' : u < 0.34 ? 'round' : u < 0.6 ? 'spread' : u < 0.8 ? 'tall' : 'twin';
    const R = t.r * (form === 'spread' ? 1.18 : form === 'tall' ? 0.8 : 1), Rv = R * (form === 'spread' ? 0.62 : form === 'tall' ? 1.2 : 0.85);
    const H = t.h * (form === 'tall' ? 1.12 : form === 'spread' ? 0.9 : 1), c0 = leafOf(P.leaf[Math.floor(r(3) * 4)]);
    const forkH = H * (form === 'twin' ? 0.28 : form === 'spread' ? 0.42 : 0.36) + 0.25 * r(12);
    const fork = base.clone().addScaledVector(L, forkH);
    wood(base, fork, trunkR);
    const crowns = form === 'twin' ? [0, 1].map(i => { const a = la + 1.4 + i * 3.1 + (r(13 + i) - 0.5) * 0.6; return { c: fork.clone().add(new THREE.Vector3(Math.cos(a) * R * 0.48, H - forkH - Rv * 0.9 - i * 0.5 * r(15), Math.sin(a) * R * 0.48)), R: R * 0.72, Rv: Rv * 0.85 }; })
      : [{ c: base.clone().addScaledVector(L, H - Rv), R, Rv }];
    for (const [ci, cr] of crowns.entries()) {
      if (form === 'twin') wood(fork, cr.c, trunkR * 0.72);
      const from = form === 'twin' ? cr.c.clone().addScaledVector(UP, -cr.Rv * 0.4) : fork;
      const nb = form === 'tall' ? 3 : form === 'spread' ? 4 + Math.floor(r(16) * 2) : form === 'twin' ? 2 + Math.floor(r(16 + ci) * 2) : 3 + Math.floor(r(16) * 2), a0 = r(17 + ci) * 6.28;
      // 中の詰め物：少し暗く、外の房のすき間を埋める
      blob(cr.c, [cr.R * 0.72, cr.Rv * 0.72, cr.R * 0.72], c0, 0.84);
      for (let i = 0; i < nb; i++) {
        const a = a0 + i / nb * 6.28 + (r(20 + i + ci * 9) - 0.5) * 1.1, out = cr.R * (0.42 + 0.26 * r(24 + i + ci * 9));
        const dy = cr.Rv * ((form === 'tall' ? (i / (nb - 1 || 1)) * 1.1 - 0.55 : -0.25) + 0.45 * r(28 + i + ci * 9));
        const e = cr.c.clone().add(new THREE.Vector3(Math.cos(a) * out, dy, Math.sin(a) * out));
        wood(from, from.clone().lerp(e, 0.82), trunkR * 0.5);
        const s = cr.R * (form === 'spread' ? 0.5 : 0.58) * (1 + 0.28 * r(32 + i + ci * 9)), lit = 0.94 + 0.12 * (dy / cr.Rv + 0.5);
        blob(e, [s, s * (cr.Rv / cr.R) * 1.05, s], c0, lit);
        const ns = r(36 + i + ci * 9) < 0.55 ? 0 : 1;   // 房のわきの小さなふくらみ（半分くらいの房に 1 つ）
        for (let j = 0; j < ns; j++) { const b = a + (r(40 + j + i * 3) - 0.5) * 2.2, d = s * (0.7 + 0.2 * r(44 + j)); blob(e.clone().add(new THREE.Vector3(Math.cos(b) * d, (r(48 + j + i) - 0.6) * s * 0.8, Math.sin(b) * d)), s * (0.42 + 0.14 * r(52 + j + i)), c0, lit * 0.97, true); }
      }
      blob(cr.c.clone().addScaledVector(UP, cr.Rv * 0.42), [cr.R * 0.58, cr.Rv * 0.6, cr.R * 0.58], c0, 1.08);   // てっぺん（日が当たって明るい）
      if (fruit) {   // 実：冠のまわりに小さな玉
        const fc = ['#E08A2E', '#D9B23A', '#C8452F'][Math.floor(r(60) * 3)], nf = 7 + Math.floor(r(61) * 5);
        for (let k = 0; k < nf; k++) { const a = r(62 + k) * 6.28, el = (r(80 + k) - 0.35) * 1.2, rr = 0.92;
          B.fruit.push({ p: cr.c.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(el) * cr.R * rr, Math.sin(el) * cr.Rv * rr, Math.sin(a) * Math.cos(el) * cr.R * rr)), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1).multiplyScalar(0.075 + 0.02 * r(100 + k)), c: fc, k: 0.9 + 0.2 * r(120 + k) }); }
      }
    }
  }

  // 葉：凹凸を付けず、つやもほとんど無し。光を少し通すので、日かげ側を自分の色でわずかに光らせる
  const leafMat = matte({ color: '#ffffff', vary: 0.12, freq: 0.7, rough: 0.85, spec: 0.3 });
  leafMat.emissive = new THREE.Color('#3A4A22'); leafMat.emissiveIntensity = 0.42;
  glow.mats.push([leafMat, 0.42]);
  const woodMat = matte({ color: '#ffffff', vary: 0.2, freq: 3, bump: 0.6, bumpFreq: 6, spec: 0.5 });
  const inst = (geo, mat, items) => {
    if (!items.length) return;
    const m = new THREE.InstancedMesh(geo, mat, items.length), mt = new THREE.Matrix4(), c = new THREE.Color();
    items.forEach((it, i) => { mt.compose(it.p, it.q, it.s); m.setMatrixAt(i, mt); m.setColorAt(i, c.set(it.c).multiplyScalar(it.k ?? 1)); });
    if (mat === leafMat) m.customDepthMaterial = leafDepth;
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  };
  const leafDepth = dappleDepth();
  B.big.forEach((items, v) => inst(big[v], leafMat, items));
  B.small.forEach((items, v) => inst(small[v], leafMat, items));
  B.tier.forEach((items, v) => inst(tiers[v], leafMat, items));
  inst(woodGeo, woodMat, B.wood);
  if (B.fruit.length) { const fm = matte({ color: '#ffffff', vary: 0.1, freq: 6, rough: 0.55 }); fm.emissive = new THREE.Color('#3A2410'); fm.emissiveIntensity = 0.25; inst(new THREE.IcosahedronGeometry(1, 1), fm, B.fruit); }
  return group;
}
