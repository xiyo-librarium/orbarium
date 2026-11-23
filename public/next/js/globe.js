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

export function landTexture(rings, W = 2048) {
  const H = W / 2, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
  x.fillStyle = '#6F9C9E'; x.fillRect(0, 0, W, H);
  // 海：沿岸ほど少し明るい（浅瀬）
  x.lineJoin = 'round'; x.strokeStyle = 'rgba(140,186,182,.55)'; x.lineWidth = W / 260;
  const path = (ring) => { x.beginPath(); ring.forEach(([lo, la], i) => { if (i && Math.abs(lo - ring[i - 1][0]) > 180) { x.moveTo(X(lo), Y(la)); return; } i ? x.lineTo(X(lo), Y(la)) : x.moveTo(X(lo), Y(la)); }); x.closePath(); };
  for (const r of rings) { path(r); x.stroke(); }
  // 陸は別の紙に塗ってから重ねる（極の氷は陸の上だけ）
  const lc = document.createElement('canvas'); lc.width = W; lc.height = H; const lx = lc.getContext('2d');
  const lpath = (ring) => { lx.beginPath(); ring.forEach(([lo, la], i) => { if (i && Math.abs(lo - ring[i - 1][0]) > 180) { lx.moveTo(X(lo), Y(la)); return; } i ? lx.lineTo(X(lo), Y(la)) : lx.moveTo(X(lo), Y(la)); }); lx.closePath(); };
  const land = lx.createLinearGradient(0, 0, 0, H);   // 緯度で少しだけ色を変える（高緯度は淡く、熱帯はやや濃い）
  land.addColorStop(0, '#B7BE9C'); land.addColorStop(0.3, '#9FAF78'); land.addColorStop(0.5, '#8FA76A'); land.addColorStop(0.7, '#9FAF78'); land.addColorStop(1, '#B7BE9C');
  lx.fillStyle = land; for (const r of rings) { lpath(r); lx.fill(); }
  const ice = lx.createLinearGradient(0, 0, 0, H); ice.addColorStop(0, 'rgba(240,241,236,1)'); ice.addColorStop(0.13, 'rgba(240,241,236,.92)'); ice.addColorStop(0.19, 'rgba(240,241,236,0)'); ice.addColorStop(0.81, 'rgba(240,241,236,0)'); ice.addColorStop(0.86, 'rgba(240,241,236,.95)'); ice.addColorStop(1, 'rgba(240,241,236,1)');
  lx.globalCompositeOperation = 'source-atop'; lx.fillStyle = ice; lx.fillRect(0, 0, W, H);
  x.drawImage(lc, 0, 0); x.fillStyle = '#EEF0EA'; x.fillRect(0, Y(-79), W, H - Y(-79));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildGlobe(rings, pins = [], route = null) {
  const g = new THREE.Group();
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), matte({ vary: 0.06, freq: 9, bump: 0.06, bumpFreq: 30, rough: 1 }));
  earth.material.map = landTexture(rings); earth.material.needsUpdate = true; earth.castShadow = false; earth.receiveShadow = false; g.add(earth);
  // 大気：縁だけ薄く光る
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.035, 96, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, uniforms: { c: { value: new THREE.Color('#A9CBE0') }, s: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vW = normalize((modelMatrix * vec4(position,1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 c; uniform vec3 s; varying vec3 vN; varying vec3 vW; void main(){ float f = pow(1.0 - abs(vN.z), 2.2); float day = smoothstep(-0.35, 0.4, dot(vW, normalize(s))); gl_FragColor = vec4(c * f * (0.25 + 0.9 * day), f * 0.8); }'
  }));
  g.add(atm); g.userData.atm = atm;
  // 行き先と出発地の印
  for (const p of pins) {
    const pos = ll(p.lat, p.lon, 1.002), m = new THREE.Mesh(new THREE.SphereGeometry(p.main ? 0.016 : 0.011, 16, 12), new THREE.MeshStandardMaterial({ color: p.color || '#C9873A', roughness: 0.6, emissive: p.color || '#C9873A', emissiveIntensity: 0.35 }));
    m.position.copy(pos); g.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.028, 32), new THREE.MeshBasicMaterial({ color: p.color || '#C9873A', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.position.copy(ll(p.lat, p.lon, 1.003)); ring.lookAt(ll(p.lat, p.lon, 2)); g.add(ring);
  }
  // 飛ぶ道：大円にそった弧を、途中で少し持ち上げる
  if (route) {
    const a = ll(route[0].lat, route[0].lon), b = ll(route[1].lat, route[1].lon), ang = a.angleTo(b), pts = [];
    for (let i = 0; i <= 96; i++) { const t = i / 96, v = a.clone().multiplyScalar(Math.sin((1 - t) * ang)).add(b.clone().multiplyScalar(Math.sin(t * ang))).divideScalar(Math.sin(ang)); pts.push(v.normalize().multiplyScalar(1.006 + 0.07 * Math.sin(Math.PI * t))); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts), line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#B87A33', dashSize: 0.018, gapSize: 0.014, transparent: true, opacity: 0.9 }));
    line.computeLineDistances(); g.add(line);
  }
  return g;
}
