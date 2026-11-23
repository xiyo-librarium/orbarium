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
    uBump: { value: o.bump ?? 0.0 }, uBumpFreq: { value: o.bumpFreq ?? 3.0 }
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
        vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
    sh.fragmentShader = `varying vec3 vWPos; uniform float uVary, uFreq, uPatchAt, uBump, uBumpFreq; uniform vec3 uPatch;\n${NOISE}\n` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float n = fbm(vWPos * uFreq);
          diffuseColor.rgb *= 1.0 + uVary * (n - 0.5) * 2.0;
          float pm = smoothstep(uPatchAt, uPatchAt + 0.08, fbm(vWPos * uFreq * 0.55 + 31.7));
          diffuseColor.rgb = mix(diffuseColor.rgb, uPatch * (0.92 + 0.16 * n), pm); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uBump > 0.0) { vec3 gW = fbmGrad(vWPos * uBumpFreq, 0.07); vec3 gV = (viewMatrix * vec4(gW, 0.0)).xyz;
          normal = normalize(normal - uBump * (gV - dot(gV, normal) * normal)); }`);
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
    leaf: ['#557F37', '#62893D', '#4F7633', '#6E9443'], pine: '#4B6A48', trunk: '#5B4433',
    plaster: '#C4A27C', plasterPatch: '#B38E66', lime: '#EDE6D8', limePatch: '#CDB79A', stone: '#A7A193', tile: '#B26A4B', wood: '#8A6440', glass: '#3E4A4A'
  },
  taos: {
    sky: ['#BFD2DD', '#F1E6D2'], fog: '#EDE3D0', hemiSky: '#C8D8E6', hemiGround: '#B0905E',
    ground: { 10: '#77805A', 20: '#A49A6A', 30: '#B4A77A', 40: '#B7AA76', 50: '#AFA190', 60: '#C4A57A', 80: '#7B95A0', 90: '#8E956A', 95: '#77805A', 100: '#B4A77A' },
    soil: '#9C7552', soilDark: '#7A5A3E', grass: '#A79F68', grassTip: '#C6BC86',
    leaf: ['#6E7F4E', '#7A8A55', '#66784A', '#828F5A'], pine: '#56684C', trunk: '#5E4936',
    plaster: '#C99E74', plasterPatch: '#B58A60', lime: '#EDE3D1', limePatch: '#CDB08C', stone: '#ADA392', tile: '#B26A4B', wood: '#7E5E40', glass: '#3E4A4A'
  }
};

/* 太陽の色：低いほど金色（空気の層を長く通るため） */
export function sunColor(elevDeg) {
  const w = Math.max(0, Math.min(1, (elevDeg - 3) / 40));
  return new THREE.Color().setRGB(1.0, 0.72 + 0.22 * w, 0.48 + 0.38 * w);
}

/* 同じ場所なら毎回同じ乱数 */
export function hash(x, y = 0, k = 0) { let n = (Math.floor(x * 73.1) * 374761393 + Math.floor(y * 91.7) * 668265263 + k * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
