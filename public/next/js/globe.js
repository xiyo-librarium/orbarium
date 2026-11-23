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
export function globeTextures(rings, W = 4096) {
  const H = W / 2, X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
  const canvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const path = (x, ring) => { x.beginPath(); ring.forEach(([lo, la], i) => { if (i && Math.abs(lo - ring[i - 1][0]) > 180) { x.moveTo(X(lo), Y(la)); return; } i ? x.lineTo(X(lo), Y(la)) : x.moveTo(X(lo), Y(la)); }); x.closePath(); };
  const [sc, sx] = canvas(); sx.fillStyle = '#6F9C9E'; sx.fillRect(0, 0, W, H);
  sx.lineJoin = 'round'; sx.strokeStyle = 'rgba(140,186,182,.55)'; sx.lineWidth = W / 260; for (const r of rings) { path(sx, r); sx.stroke(); }
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

/* 住んだ所から色づく：はじめは紙のような灰色。住んだ所（lived：{lat, lon, years}）のまわりだけ本当の色に。
   住んだ年が長いほど広く（9°＋1年3°、28°まで）。ふちは少しにじませる */
function colorize(m, lived, paper = '#E6E1D5', ref = 0.3) {
  const L = lived.slice(0, 8), U = { uLP: { value: Array.from({ length: 8 }, (_, i) => { const q = L[i]; if (!q) return new THREE.Vector4(0, 0, 0, 0); const d = ll(q.lat, q.lon).normalize(), r = Math.min(28, 9 + 3 * (q.years || 0)) * Math.PI / 180; return new THREE.Vector4(d.x, d.y, d.z, r); }) }, uLN: { value: L.length }, uPaper: { value: new THREE.Color(paper) }, uRef: { value: ref } };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r); Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform vec4 uLP[8]; uniform int uLN; uniform vec3 uPaper; uniform float uRef;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', `
      { vec3 gN = normalize(vWPos); float col = 0.0;
        for (int i = 0; i < 8; i++) { if (i >= uLN) break; float a = acos(clamp(dot(gN, uLP[i].xyz), -1.0, 1.0)) + 0.05 * (fbm(gN * 7.0) - 0.5);
          col = max(col, 1.0 - smoothstep(uLP[i].w * 0.55, uLP[i].w, a)); }
        float g = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 mono = uPaper * clamp(0.82 + 0.35 * (g / uRef - 1.0), 0.6, 1.12);   // 紙の色に、もとの明るさの違い（浅瀬・氷）を少しだけ残す
        diffuseColor.rgb = mix(mono, diffuseColor.rgb, col); }
      #include <alphamap_fragment>`);
  };
  m.customProgramCacheKey = () => 'matte-globe-' + L.length;
  return m;
}

/* 虫ピン：地球に刺した細い針と丸い頭。少しずつ傾けて刺す */
function insectPin(p, seat = 1) {
  const g = new THREE.Group(), color = p.color || '#C9873A', main = !!p.main;
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0022, 0.09, 8), new THREE.MeshStandardMaterial({ color: '#C9CDD0', metalness: 0.8, roughness: 0.3 }));
  needle.position.y = 0.045 - 0.012;
  const head = new THREE.Mesh(new THREE.SphereGeometry(main ? 0.017 : 0.013, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.0, envMapIntensity: 1.2 }));
  head.position.y = 0.09 - 0.012; head.userData.pin = p; needle.userData.pin = p;
  g.add(needle, head);
  const n = ll(p.lat, p.lon).normalize(), h = Math.sin((p.lat * 12.9898 + p.lon * 78.233)) * 43758.5453, rnd = h - Math.floor(h);
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(rnd * 6.28), 0, Math.sin(rnd * 6.28)), 0.12 + rnd * 0.12);   // 少し傾ける
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(tilt);
  g.position.copy(n.multiplyScalar(seat)); g.userData.pin = p; g.userData.dir = ll(p.lat, p.lon).normalize();
  return g;
}

export function buildGlobe(rings, pins = [], route = null, opt = {}) {
  const g = new THREE.Group(), T = globeTextures(rings), lived = opt.lived || [];
  // 海：なめらかで少しつやがある。陸：紙粘土のようなつや消しで、海より少しだけ盛り上がる
  const sea = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), colorize(matte({ vary: 0.03, freq: 5, rough: 0.42, spec: 0.8 }), lived, '#B4BCBC', 0.29));
  sea.material.map = T.sea; sea.material.needsUpdate = true; g.add(sea);
  const landM = colorize(matte({ vary: 0.09, freq: 11, bump: 0.16, bumpFreq: 26, rough: 1, spec: 0.35 }), lived, '#EAE5D8', 0.31);
  landM.map = T.land; landM.alphaMap = T.mask; landM.alphaTest = 0.5; landM.needsUpdate = true;
  const landMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0045, 192, 96), landM); g.add(landMesh);
  g.userData.earth = sea;
  // 大気：縁だけ薄く光る
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color('#A9CBE0') }, s: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vW = normalize((modelMatrix * vec4(position,1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform vec3 s; varying vec3 vN; varying vec3 vW; void main(){ float f = pow(1.0 - abs(vN.z), 2.2); float day = smoothstep(-0.35, 0.4, dot(vW, normalize(s))); gl_FragColor = vec4(c * f * (0.25 + 0.9 * day), f * 0.8); }'
  }));
  g.add(atm); g.userData.atm = atm;
  // 印：虫ピン。g.userData.pins に覚えておき、刺す動き（stick）に使う
  g.userData.pins = pins.map(p => { const m = insectPin(p, p.hidden ? 1.35 : 1); m.visible = !p.hidden; g.add(m); return m; });
  g.userData.stick = (pin, ms = 650, done) => {   // 上から刺さる
    const dir = pin.userData.dir, t0 = performance.now(); pin.visible = true;
    const step = () => { const u = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - u, 3); pin.position.copy(dir).multiplyScalar(1.35 - 0.35 * e); if (opt.req) opt.req(); if (u < 1) requestAnimationFrame(step); else if (done) done(); };
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
