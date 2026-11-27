/* 見た目のきまり：つや消しの面、世界の位置で決まるゆらぎ（継ぎ目が出ない）、土地ごとの色 */
import * as THREE from 'three';

/* 3次元のなめらかな値ノイズ（GLSL）。fbm は 3 段。勾配は差分で */
const NOISE = /* glsl */`
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.07 + 13.1) + 0.15 * vnoise(p * 4.13 + 7.3); }
vec3 fbmGrad(vec3 p, float e){ float c = fbm(p); return vec3(fbm(p + vec3(e,0,0)) - c, fbm(p + vec3(0,e,0)) - c, fbm(p + vec3(0,0,e)) - c) / e; }
`;

/* つや消しの材料。o = { color, rough, vary（明るさのむら）, freq（むらの細かさ 1/m）, patch（別の色のむら）, patchAt（0〜1、大きいほど少ない）, bump（凹凸の強さ）, bumpFreq, vertexColors, emissive } */
export function matte(o = {}) {
  const m = new THREE.MeshStandardMaterial({ color: o.color ?? 0xffffff, roughness: o.rough ?? 0.95, metalness: 0, vertexColors: !!o.vertexColors, flatShading: !!o.flat });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (o.side) m.side = o.side;
  const U = {
    uVary: { value: o.vary ?? 0.08 }, uFreq: { value: o.freq ?? 1.3 },
    uPatch: { value: new THREE.Color(o.patch ?? o.color ?? 0xffffff) }, uPatchAt: { value: o.patch ? (o.patchAt ?? 0.62) : 2.0 },
    uBump: { value: o.bump ?? 0.0 }, uBumpFreq: { value: o.bumpFreq ?? 3.0 }, uSpec: { value: o.spec ?? 1.0 }
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWPos = ${o.local ? 'transformed' : '(modelMatrix * vec4(transformed, 1.0)).xyz'};   // local：物に貼りついたむら（回しても流れない）
      #endif`);
    sh.fragmentShader = `varying vec3 vWPos; uniform float uVary, uFreq, uPatchAt, uBump, uBumpFreq, uSpec; uniform vec3 uPatch;\n${NOISE}\n` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float n = fbm(vWPos * uFreq);
          diffuseColor.rgb *= 1.0 + uVary * (n - 0.5) * 2.0;
          float pm = smoothstep(uPatchAt, uPatchAt + 0.08, fbm(vWPos * uFreq * 0.55 + 31.7));
          diffuseColor.rgb = mix(diffuseColor.rgb, uPatch * (0.92 + 0.16 * n), pm); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uBump > 0.0) { vec3 gW = fbmGrad(vWPos * uBumpFreq, 0.07); vec3 gV = (viewMatrix * vec4(gW, 0.0)).xyz;
          normal = normalize(normal - uBump * (gV - dot(gV, normal) * normal)); }`)
      // 照り返しの強さ（spec）：葉や布のように、つやを抑えたいもの用
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColorBlended *= uSpec; material.specularF90 *= uSpec;`);
  };
  m.customProgramCacheKey = () => 'matte';
  return m;
}

/* 土地ごとの色（Dorfromantik の考え方：物は役割の色を持ち、土地ごとに入れ替える） */
export const PALETTES = {
  med: {
    sky: ['#C6D6D7', '#EEE9DC'], fog: '#E7E4D8', hemiSky: '#C9D9E0', hemiGround: '#9A8A62',
    ground: { 10: '#557A3C', 20: '#7E9A4C', 30: '#86A450', 40: '#9AA25A', 50: '#A49C8A', 60: '#B49C76', 80: '#6E8C95', 90: '#6F8F5E', 95: '#557A3C', 100: '#86A450' },
    soil: '#8A6A4A', soilDark: '#6C5038', grass: '#6F9440', grassTip: '#A8BC5C',
    leaf: ['#557F37', '#62893D', '#4F7633', '#6E9443'], pine: '#4B6A48', euca: '#7A8F66', trunk: '#5B4433', bark: '#BCB09A',
    plaster: '#C4A27C', plasterPatch: '#B38E66', lime: '#EDE6D8', limePatch: '#CDB79A', stone: '#A7A193', tile: '#B26A4B', wood: '#8A6440', glass: '#3E4A4A'
  },
  taos: {
    sky: ['#BFD2DD', '#F1E6D2'], fog: '#EDE3D0', hemiSky: '#C8D8E6', hemiGround: '#B0905E',
    ground: { 10: '#77805A', 20: '#A49A6A', 30: '#B4A77A', 40: '#B7AA76', 50: '#AFA190', 60: '#C4A57A', 80: '#7B95A0', 90: '#8E956A', 95: '#77805A', 100: '#B4A77A' },
    soil: '#9C7552', soilDark: '#7A5A3E', grass: '#A79F68', grassTip: '#C6BC86',
    leaf: ['#6E7F4E', '#7A8A55', '#66784A', '#828F5A'], pine: '#56684C', euca: '#87936E', trunk: '#5E4936', bark: '#B8AA92',
    plaster: '#C99E74', plasterPatch: '#B58A60', lime: '#EDE3D1', limePatch: '#CDB08C', stone: '#ADA392', tile: '#B26A4B', wood: '#7E5E40', glass: '#3E4A4A'
  },
  // ウブド：湿った空気、濃い緑、火山の赤茶の土
  ubud: {
    sky: ['#BFD0CF', '#ECE8DA'], fog: '#E2E4D6', hemiSky: '#C4D6D8', hemiGround: '#8A8A58',
    ground: { 10: '#46743A', 20: '#6E9A46', 30: '#7DA84C', 40: '#8DAE52', 50: '#A0988A', 60: '#AC9070', 80: '#62868C', 90: '#679253', 95: '#46743A', 100: '#7DA84C' },
    soil: '#7E5A3E', soilDark: '#5E412C', grass: '#62953C', grassTip: '#A3C25A',
    leaf: ['#4A7A32', '#578638', '#45702E', '#64923E'], pine: '#46664A', euca: '#6F8A5C', trunk: '#574231', bark: '#B6AA94',
    plaster: '#C0A07C', plasterPatch: '#AE8C66', lime: '#ECE5D6', limePatch: '#CCB89A', stone: '#9C9688', tile: '#B06A4C', wood: '#86603E', glass: '#3E4A4A'
  },
  // アレンテージョ：乾いた金色の草、くすんだ緑のコルクガシとオリーブ、黄土の土、石灰の白
  alen: {
    sky: ['#C3D4DE', '#F2E9D8'], fog: '#EEE6D4', hemiSky: '#C8D8E4', hemiGround: '#B49A62',
    ground: { 10: '#6E7650', 20: '#B4A468', 30: '#C2B072', 40: '#BEAA6E', 50: '#B2A492', 60: '#C9A878', 80: '#7896A0', 90: '#8E9266', 95: '#6E7650', 100: '#C2B072' },
    soil: '#A57A50', soilDark: '#82603E', grass: '#B3A466', grassTip: '#D3C48A',
    leaf: ['#5E6E46', '#68784C', '#56653F', '#727F52'], pine: '#52634A', euca: '#879170', trunk: '#4E3E30', bark: '#A49884',
    plaster: '#CDA67A', plasterPatch: '#B98F64', lime: '#F3EFE6', limePatch: '#DCD3C2', stone: '#B0A592', tile: '#B4684A', wood: '#7A5A3E', glass: '#3E4A4A'
  },
  // 八ヶ岳の麓：すこし青みの緑、カラマツ、黒い火山の土
  yama: {
    sky: ['#C2D3DF', '#EDEAE0'], fog: '#E3E5DE', hemiSky: '#C6D7E2', hemiGround: '#7E7A5C',
    ground: { 10: '#4C6E40', 20: '#7C944E', 30: '#86A056', 40: '#94A05C', 50: '#A09A8E', 60: '#A8987C', 80: '#6A8C98', 90: '#6A8C5E', 95: '#4C6E40', 100: '#86A056' },
    soil: '#5E4C3C', soilDark: '#43362B', grass: '#6E9046', grassTip: '#A6B862',
    leaf: ['#56783C', '#5F8142', '#4E6E38', '#6A8A46'], pine: '#4A6446', euca: '#7A8E68', trunk: '#584434', bark: '#B4AA98',
    plaster: '#BFA684', plasterPatch: '#AA906C', lime: '#EEE9DE', limePatch: '#CFC2AA', stone: '#A29E94', tile: '#5E6266', wood: '#7E5C40', glass: '#3E4A4A'
  }
};

/* 時刻の光。太陽が低いほど、日差しは金色からあかね色へ、空の光（影の色）は青く、地平は暖かい霞に。
   朝は淡くさわやかに（黄〜桃）、夕方は濃く（橙〜あかね）。高さ（度）ごとの色を、間はなめらかにつなぐ */
const TOD = {
  am: [
    { e: -18, sun: '#A9C0F2', k: 0.8, sky: '#3A4E8A', hor: '#2C3A64', gnd: '#1A2030', env: 0.42, top: '#0D1630' },
    { e: -6, sun: '#9FB0E4', k: 0.6, sky: '#5C74BC', hor: '#A99CC4', gnd: '#3E4260', env: 0.6, top: '#2E4580' },
    { e: 0, sun: '#FFA07C', k: 2.5, sky: '#8E9CCB', hor: '#F5C6B4', gnd: '#8A7262', env: 0.56, top: '#9FB1D2' },
    { e: 7, sun: '#FFBE8C', k: 3.0, sky: '#9DACD0', hor: '#F6D5BE', gnd: '#94806A', env: 0.58, top: '#AEC0D8' },
    { e: 18, sun: '#FFD8AA', k: 3.6, sky: '#AFBFD8', hor: '#F3E0CB', env: 0.58, top: '#B7C9DA' },
    { e: 34, sun: '#FFEBD0', k: 4.1, sky: '#BCCDDF', hor: '#EFE6D6', env: 0.58, top: '#BDD0DC' },
    { e: 60, sun: '#FFF6EA', k: 4.4, env: 0.6 }
  ],
  pm: [
    { e: -18, sun: '#A9C0F2', k: 0.8, sky: '#3A4E8A', hor: '#2C3A64', gnd: '#1A2030', env: 0.42, top: '#0D1630' },
    { e: -6, sun: '#9FB0E4', k: 0.6, sky: '#5A70B8', hor: '#BC97B4', gnd: '#40405E', env: 0.6, top: '#2C417C' },
    { e: 0, sun: '#FF7A44', k: 2.4, sky: '#7C86BA', hor: '#F2AA7C', gnd: '#8C6A52', env: 0.54, top: '#909EC6' },
    { e: 7, sun: '#FF9C58', k: 2.9, sky: '#8E99C2', hor: '#F4BF8E', gnd: '#957659', env: 0.57, top: '#A3B2D0' },
    { e: 18, sun: '#FFBF7E', k: 3.5, sky: '#A4B0CC', hor: '#F2D2A8', env: 0.58, top: '#B2C2D4' },
    { e: 34, sun: '#FFDBAE', k: 4.1, sky: '#BAC6D6', hor: '#F0DCBE', env: 0.58, top: '#BACBD6' },
    { e: 60, sun: '#FFF4E6', k: 4.4, env: 0.6 }
  ]
};
export function skyLight(P, elevDeg, am) {
  const K = am ? TOD.am : TOD.pm, e = Math.max(-18, elevDeg);
  let i = 0; while (i < K.length - 2 && e > K[i + 1].e) i++;
  const A = K[i], B = K[i + 1], t = Math.max(0, Math.min(1, (e - A.e) / (B.e - A.e))), s = t * t * (3 - 2 * t);
  const mix = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), s);
  // 空と地平の色は、日が高ければその土地の色。低いほど時刻の色を強く
  const w = 1 - Math.max(0, Math.min(1, e / 60)), ww = w * w * (3 - 2 * w), night = Math.max(0, Math.min(1, (2 - e) / 10));   // 日の入り前から明かりが灯りはじめる
  const tint = (key, base) => mix(A[key] ?? base, B[key] ?? base).lerp(new THREE.Color(base), 1 - ww);
  return {
    sun: mix(A.sun, B.sun), sunK: A.k + (B.k - A.k) * s, env: A.env + (B.env - A.env) * s,
    hemiSky: tint('sky', P.hemiSky), horizon: tint('hor', P.fog), hemiGround: tint('gnd', P.hemiGround),
    skyTop: tint('top', P.sky[0]), skyBottom: tint('hor', P.sky[1]), fog: tint('hor', P.fog), day: (1 - 0.45 * ww) * Math.max(0.15, Math.min(1, (e + 8) / 8)), exposure: (0.95 + 0.2 * ww) * (1 - 0.18 * night), night
  };
}

/* 葉の「透ける光」は昼の明るさに合わせる（夕方に葉だけ光って見えないように） */
export const glow = { mats: [], set(k) { for (const [m, base] of this.mats) m.emissiveIntensity = base * k; } };

/* 窓の明かり：日が沈むと家の中が灯る（ガラスを暖かく光らせる） */
const LAMP = new THREE.Color('#FFC16E');
export const lamps = { k: 0, mats: new Set(),
  add(m) { m.emissive = LAMP.clone(); m.emissiveIntensity = this.k * 1.8; this.mats.add(m); m.addEventListener('dispose', () => this.mats.delete(m)); },
  set(k) { this.k = k; for (const m of this.mats) m.emissiveIntensity = k * 1.8; } };

/* 同じ場所なら毎回同じ乱数 */
export function hash(x, y = 0, k = 0) { let n = (Math.floor(x * 73.1) * 374761393 + Math.floor(y * 91.7) * 668265263 + k * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
