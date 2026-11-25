/* 地球：土地と同じ描き方（つや消し・本物の太陽）で、とても遠くから見た土地として。
   陸は海岸線のデータから塗り、昼と夜の境目は今この時刻の本物の太陽から。縁に薄い大気。飛ぶ道は点線の弧 */
import * as THREE from 'three';
import { matte } from './look.js';

/* three の球の貼り方に合わせた向き：経度0が +x、東経90が −z */
export const ll = (lat, lon, r = 1) => { const p = lat * Math.PI / 180, l = lon * Math.PI / 180; return new THREE.Vector3(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l)); };

/* 太陽の真下の点（緯度・経度）：日付から赤緯、世界時から経度 */
export function subsolar(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0), doy = (date - start) / 864e5;
  const dec = 23.44 * Math.sin(2 * Math.PI * (284 + doy) / 365);
  const ut = date.getUTCHours() + date.getUTCMinutes() / 60;
  return { lat: dec, lon: ((12 - ut) * 15 + 540) % 360 - 180 };
}

/* 海・陸・陸の型の3枚：海は浅瀬が少し明るい、陸は緯度で色を少し変えて極の氷をのせる。型は陸だけ白 */
export function globeTextures(rings, W = 4096, desk = false) {
  const H = W / 2, X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
  const canvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const path = (x, ring) => { x.beginPath(); ring.forEach(([lo, la], i) => { if (i && Math.abs(lo - ring[i - 1][0]) > 180) { x.moveTo(X(lo), Y(la)); return; } i ? x.lineTo(X(lo), Y(la)) : x.moveTo(X(lo), Y(la)); }); x.closePath(); };
  const [sc, sx] = canvas(); sx.fillStyle = '#6F9C9E'; sx.fillRect(0, 0, W, H);
  if (!desk) { sx.lineJoin = 'round'; sx.strokeStyle = 'rgba(140,186,182,.55)'; sx.lineWidth = W / 260; for (const r of rings) { path(sx, r); sx.stroke(); } }
  const [lc, lx] = canvas();
  const land = lx.createLinearGradient(0, 0, 0, H);
  land.addColorStop(0, '#B7BE9C'); land.addColorStop(0.3, '#9FAF78'); land.addColorStop(0.5, '#8FA76A'); land.addColorStop(0.7, '#9FAF78'); land.addColorStop(1, '#B7BE9C');
  lx.fillStyle = land; for (const r of rings) { path(lx, r); lx.fill(); }
  const ice = lx.createLinearGradient(0, 0, 0, H); ice.addColorStop(0, 'rgba(240,241,236,1)'); ice.addColorStop(0.13, 'rgba(240,241,236,.92)'); ice.addColorStop(0.19, 'rgba(240,241,236,0)'); ice.addColorStop(0.81, 'rgba(240,241,236,0)'); ice.addColorStop(1, 'rgba(240,241,236,1)');
  lx.globalCompositeOperation = 'source-atop'; lx.fillStyle = ice; lx.fillRect(0, 0, W, H); lx.globalCompositeOperation = 'source-over';
  lx.fillStyle = '#EEF0EA'; lx.fillRect(0, Y(-79), W, H - Y(-79));   // 南極は全部氷
  const [mc, mx] = canvas(); mx.fillStyle = '#000'; mx.fillRect(0, 0, W, H); mx.fillStyle = '#fff'; for (const r of rings) { path(mx, r); mx.fill(); } mx.fillRect(0, Y(-79), W, H - Y(-79));
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { sea: tex(sc, true), land: tex(lc, true), mask: tex(mc, false) };
}

/* 地球全体の標高（AWS Terrain Tiles、土地の画面と同じデータ。z=3 の 64 枚）から、陸の起伏の法線の画像（正距円筒）を作る。
   陸だけ、高さはほぼそのままの割合で（低い所を持ち上げすぎない）。紙粘土らしく少しならす */
export async function loadRelief(z = 3, W = 2048) {
  const N = 2 ** z, S = N * 256, mc = document.createElement('canvas'); mc.width = mc.height = S; const mx = mc.getContext('2d');
  await Promise.all(Array.from({ length: N * N }, (_, k) => new Promise((res) => {
    const x = k % N, y = Math.floor(k / N), im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { mx.drawImage(im, x * 256, y * 256); res(); }; im.onerror = () => res();
    im.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  })));
  const md = mx.getImageData(0, 0, S, S).data, H = W / 2, h = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    const lat = Math.max(-85, Math.min(85, 90 - (j + 0.5) / H * 180)) * Math.PI / 180;
    const my = Math.min(S - 1, Math.max(0, Math.floor((1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2 * S)));
    for (let i = 0; i < W; i++) {
      const q = (my * S + Math.min(S - 1, Math.floor((i + 0.5) / W * S))) * 4, e = md[q] * 256 + md[q + 1] + md[q + 2] / 256 - 32768;
      h[j * W + i] = e > 0 ? Math.min(1, Math.pow(e / 5200, 0.9)) : 0;   // 低い平地まで持ち上げると、海岸で崖になる（アマゾンの河口が丸く盛り上がって見えた）
    }
  }
  // 少しならす（紙粘土らしく、段差を消す）：横・縦に3回ずつ
  const tmp = new Float32Array(W * H);
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const r = j * W; tmp[r + i] = (h[r + (i + W - 1) % W] + h[r + i] + h[r + (i + 1) % W]) / 3; }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) h[j * W + i] = (tmp[Math.max(0, j - 1) * W + i] + tmp[j * W + i] + tmp[Math.min(H - 1, j + 1) * W + i]) / 3;
  }
  // 傾きから法線の画像を作る（凹凸＝bump と違い、寄っても薄まらない）。東西の間隔は緯度で縮むので割り戻す
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H; const ox = oc.getContext('2d'), od = ox.createImageData(W, H), K = W / 64 * 0.7;
  for (let j = 0; j < H; j++) {
    const cl = Math.max(0.2, Math.cos((90 - (j + 0.5) / H * 180) * Math.PI / 180));
    for (let i = 0; i < W; i++) {
      const dx = (h[j * W + (i + 1) % W] - h[j * W + (i + W - 1) % W]) / 2 / cl * K, dy = (h[Math.max(0, j - 1) * W + i] - h[Math.min(H - 1, j + 1) * W + i]) / 2 * K;
      const nl = Math.hypot(dx, dy, 1), o = (j * W + i) * 4;
      od.data[o] = Math.round((-dx / nl * 0.5 + 0.5) * 255); od.data[o + 1] = Math.round((-dy / nl * 0.5 + 0.5) * 255); od.data[o + 2] = Math.round((1 / nl * 0.5 + 0.5) * 255); od.data[o + 3] = 255;
    }
  }
  ox.putImageData(od, 0, 0);
  const tex = new THREE.CanvasTexture(oc); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4; return tex;
}

/* 住んだ所から色づく：はじめは紙のような灰色。住んだ所（lived：{lat, lon, years}）のまわりだけ本当の色に。
   住んだ年が長いほど広く（9°＋1年3°、28°まで）。ふちは少しにじませる */
function colorize(m, lived, paper = '#E6E1D5', ref = 0.3, glow = null) {
  const L = lived.slice(0, 8), U = { uLP: { value: Array.from({ length: 8 }, (_, i) => { const q = L[i]; if (!q) return new THREE.Vector4(0, 0, 0, 0); const d = ll(q.lat, q.lon).normalize(), r = Math.min(28, 9 + 3 * (q.years || 0)) * Math.PI / 180; return new THREE.Vector4(d.x, d.y, d.z, r); }) }, uLN: { value: L.length }, uPaper: { value: new THREE.Color(paper) }, uRef: { value: ref }, uGlow: { value: glow ?? 1 }, uDesk: { value: glow == null ? 0 : 1 } };
  m.userData.lp = U.uLP.value.map(v4 => v4.clone()); m.userData.uLP = U.uLP;   // 地球儀の上の向き（回したら setSpin で回す）
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform vec4 uLP[8]; uniform int uLN; uniform vec3 uPaper; uniform float uRef; uniform float uGlow; uniform float uDesk;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', `
      { vec3 gN = normalize(vWPos); float col = 0.0;
        for (int i = 0; i < 8; i++) { if (i >= uLN) break; float a = acos(clamp(dot(gN, uLP[i].xyz), -1.0, 1.0)) + 0.05 * (fbm(gN * 7.0) - 0.5);
          col = max(col, 1.0 - smoothstep(uLP[i].w * 0.55, uLP[i].w, a)); }
        float g = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 mono = uPaper * clamp(0.82 + 0.35 * (g / uRef - 1.0), 0.6, 1.12);   // 紙の色に、もとの明るさの違い（浅瀬・氷）を少しだけ残す
        vec3 real = diffuseColor.rgb;
        if (uDesk > 0.5) {   // 机の地球儀：はじめは暗く沈んだ色。遊ぶほど明るく、住んだ所はいちばん鮮やかに
          mono *= 0.34 + 0.66 * uGlow;
          float rg = dot(real, vec3(0.299, 0.587, 0.114)); real = mix(vec3(rg), real, 0.55 + 0.45 * uGlow) * (0.62 + 0.38 * uGlow);
        }
        diffuseColor.rgb = mix(mono, real, col); }
      #include <alphamap_fragment>`);
  };
  m.customProgramCacheKey = () => 'matte-globe-' + L.length + (glow == null ? '' : '-desk');
  return m;
}

/* 虫ピン：地球に刺した細い鋼の針と、つやのある丸い頭（樹脂に透明な上塗り）。針の付け根に小さな座金。少しずつ傾けて刺す */
const steel = new THREE.MeshStandardMaterial({ color: '#E2E5E7', metalness: 1.0, roughness: 0.2, envMapIntensity: 1.4 });
const PIN_H = 0.082;   // 地面から頭の中心まで
function insectPin(p, seat = 1) {
  const g = new THREE.Group(), color = p.color || '#C9873A', main = !!p.main, R = main ? 0.0155 : 0.0118;
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, PIN_H + 0.01, 10), steel); needle.position.y = (PIN_H - 0.01) / 2 - 0.004;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0012, 0.012, 10), steel); tip.rotation.x = Math.PI; tip.position.y = -0.014;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0024, 0.0035, 16), steel); collar.position.y = PIN_H - R * 0.92;
  const headMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.25, sheenColor: new THREE.Color(color).offsetHSL(0, -0.2, 0.25), envMapIntensity: 1.1 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(R, 36, 24), headMat); head.position.y = PIN_H;
  head.userData.pin = p; needle.userData.pin = p;
  g.add(needle, tip, collar, head);
  const n = ll(p.lat, p.lon).normalize(), h = Math.sin((p.lat * 12.9898 + p.lon * 78.233)) * 43758.5453, rnd = h - Math.floor(h);
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(rnd * 6.28), 0, Math.sin(rnd * 6.28)), 0.1 + rnd * 0.12);   // 少し傾ける
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(tilt);
  g.position.copy(n.clone().multiplyScalar(seat)); g.userData.pin = p; g.userData.dir = n;
  return g;
}
/* ピンの影：刺した所の小さな暗がりと、太陽の反対へのびる頭の影（ぼかした楕円を地面に貼る） */
let shadowTex = null;
function pinShadow(pin, sun) {
  if (!shadowTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); shadowTex = new THREE.CanvasTexture(c); }
  const n = pin.userData.dir, grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55, color: '#000' });
  const decal = (center, along, len, wid, op) => {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const t = along.clone().normalize(), b = new THREE.Vector3().crossVectors(t, n).normalize();
    const M = new THREE.Matrix4().makeBasis(t, n, b).scale(new THREE.Vector3(len, 1, wid)).setPosition(center);
    geo.applyMatrix4(M); const m = new THREE.Mesh(geo, op === 1 ? mat : mat.clone()); if (op !== 1) m.material.opacity = 0.55 * op; m.renderOrder = 3; grp.add(m);
  };
  const any = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), tAny = new THREE.Vector3().crossVectors(n, any);
  decal(n.clone().multiplyScalar(1.0058), tAny, 0.012, 0.012, 1);   // 刺した所
  const up = sun ? n.dot(sun) : 0;
  if (sun && up > 0.05) {   // 昼の側だけ：頭の影
    const away = sun.clone().sub(n.clone().multiplyScalar(up)).negate(); const L = Math.min(0.16, PIN_H * Math.sqrt(1 - up * up) / up);
    if (away.lengthSq() > 1e-6) { away.normalize(); decal(n.clone().multiplyScalar(1.0059).add(away.clone().multiplyScalar(L * 0.5)), away, L + 0.014, 0.008, 0.8); decal(n.clone().multiplyScalar(1.006).add(away.clone().multiplyScalar(L)), away, 0.026, 0.024, 0.9); }
  }
  return grp;
}

export function buildGlobe(rings, pins = [], route = null, opt = {}) {
  const desk = opt.desk !== false, glow = desk ? (opt.glow ?? 0) : null, g = new THREE.Group(), T = globeTextures(rings, 4096, desk), lived = opt.lived || [];
  // 海：なめらかで少しつやがある。陸：紙粘土のようなつや消しで、海より少しだけ盛り上がる。
  // 机の地球儀（試験中）：海も塗った紙のようなつや消しで、刷毛むらだけ。陸はもう少しでこぼこ
  // 机の地球儀：むらは地球儀に貼りつける（local。回しても流れない）。陸の起伏は作り物のむらではなく実際の標高（setRelief）
  const sea = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), colorize(desk ? matte({ vary: 0.05, freq: 7, rough: 1, spec: 0.12, local: true }) : matte({ vary: 0.03, freq: 5, rough: 0.42, spec: 0.8 }), lived, desk ? '#9FA7A6' : '#B4BCBC', 0.29, glow));
  sea.material.map = T.sea; sea.material.needsUpdate = true; g.add(sea);
  const landM = colorize(desk ? matte({ vary: 0.07, freq: 11, rough: 1, spec: 0.2, local: true }) : matte({ vary: 0.09, freq: 11, bump: 0.16, bumpFreq: 26, rough: 1, spec: 0.35 }), lived, '#EAE5D8', 0.31, glow);
  landM.map = T.land; landM.alphaMap = T.mask; landM.alphaTest = 0.5; landM.needsUpdate = true;
  const landMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0045, 192, 96), landM); g.add(landMesh);
  g.userData.earth = sea;
  // 大気：縁だけ薄く光る
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color('#A9CBE0') }, s: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vW = normalize((modelMatrix * vec4(position,1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform vec3 s; varying vec3 vN; varying vec3 vW; void main(){ float f = pow(1.0 - abs(vN.z), 2.2); float day = smoothstep(-0.35, 0.4, dot(vW, normalize(s))); gl_FragColor = vec4(c * f * (0.25 + 0.9 * day), f * 0.8); }'
  }));
  g.add(atm); g.userData.atm = atm; atm.visible = !desk;
  // 実際の標高の起伏（loadRelief の結果）を陸に。あとから届いたらふっと出す
  g.userData.setRelief = (tex, scale = 1) => { landM.normalMap = tex; landM.normalScale.set(scale, scale); landM.needsUpdate = true; opt.req?.(); };   // 机の地球儀には大気の光る縁はない
  // 地球儀そのものを軸のまわりに回す（机の地球儀の寄り方）。色づきは世界の向きで計算しているので、住んだ所の向きも一緒に回す
  g.userData.setSpin = (a) => {
    g.rotation.y = a; if (desk) return;   // 机の地球儀は色づきも地球儀に貼りついている
    const Y = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    for (const mat of [sea.material, landM]) { const U2 = mat.userData.lp, live = mat.userData.uLP; if (!U2 || !live) continue;
      U2.forEach((v4, i) => { tmp.set(v4.x, v4.y, v4.z).applyAxisAngle(Y, a); live.value[i].set(tmp.x, tmp.y, tmp.z, v4.w); }); }
  };
  // 印：虫ピン。g.userData.pins に覚えておき、刺す動き（stick）に使う
  g.userData.pins = pins.map(p => { const m = insectPin(p, p.hidden ? 1.35 : 1); m.visible = !p.hidden; g.add(m); const sh = pinShadow(m, opt.sun); sh.visible = !p.hidden; m.userData.shadow = sh; g.add(sh); return m; });
  g.userData.stick = (pin, ms = 650, done) => {   // 上から刺さる
    const dir = pin.userData.dir, t0 = performance.now(); pin.visible = true;
    const step = () => { const u = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - u, 3); pin.position.copy(dir).multiplyScalar(1.35 - 0.35 * e); if (opt.req) opt.req(); if (u < 1) requestAnimationFrame(step); else { if (pin.userData.shadow) pin.userData.shadow.visible = true; if (opt.req) opt.req(); if (done) done(); } };
    step();
  };
  if (route) g.add(routeLine(route));
  return g;
}

/* 飛ぶ道：大円にそった弧を、途中で少し持ち上げる点線 */
export function routeLine(route) {
  const a = ll(route[0].lat, route[0].lon), b = ll(route[1].lat, route[1].lon), ang = a.angleTo(b), pts = [];
  for (let i = 0; i <= 96; i++) { const t = i / 96, v = a.clone().multiplyScalar(Math.sin((1 - t) * ang)).add(b.clone().multiplyScalar(Math.sin(t * ang))).divideScalar(Math.sin(ang)); pts.push(v.normalize().multiplyScalar(1.008 + 0.07 * Math.sin(Math.PI * t))); }
  const geo = new THREE.BufferGeometry().setFromPoints(pts), line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#B87A33', dashSize: 0.018, gapSize: 0.014, transparent: true, opacity: 0.9 }));
  line.computeLineDistances(); return line;
}
