/* 描く仕組み：太陽1つ（本物の向き）＋空と地面の光（環境）、やわらかい影、すき間の暗がり（GTAO）、
   空気の遠近（霧）。動かしたときだけ描き直す */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { skyLight, glow } from './look.js';

export function createView(canvas, opt = {}) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opt.keep });
  renderer.setPixelRatio(Math.min(mobile ? 2 : 2, devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.minPolarAngle = THREE.MathUtils.degToRad(24); controls.maxPolarAngle = THREE.MathUtils.degToRad(68);   // 真上と真横は見せない
  controls.minDistance = 10; controls.maxDistance = 150; controls.screenSpacePanning = false;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  // 空：上は少し青く、地平は暖かい霞
  const sky = (top, bottom) => { const c = document.createElement('canvas'); c.width = 2; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top); g.addColorStop(0.75, bottom); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, 2, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // 環境の光：空・地平・地面の3色の球を焼いて、すべての面のやわらかい明るさに使う
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envFrom = (top, horizon, ground) => { const s = new THREE.Scene(), geo = new THREE.SphereGeometry(10, 32, 16);
    const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { a: { value: new THREE.Color(top) }, b: { value: new THREE.Color(horizon) }, c: { value: new THREE.Color(ground) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 a,b,c; varying vec3 vP; void main(){ float y = vP.y; vec3 col = y > 0.0 ? mix(b, a, pow(y, 0.6)) : mix(b, c, pow(-y, 0.4)); gl_FragColor = vec4(col, 1.0); }' });
    s.add(new THREE.Mesh(geo, mat)); const rt = pmrem.fromScene(s, 0.04); geo.dispose(); mat.dispose(); return rt; };

  const sun = new THREE.DirectionalLight(0xffffff, 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 5; sun.shadow.blurSamples = 12;
  scene.add(sun, sun.target);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 1, 1, undefined, { radius: 0.9, distanceExponent: 1.6, thickness: 2.5, scale: 1.25, samples: mobile ? 8 : 16, distanceFallOff: 1, screenSpaceRadius: false });
  ao.blendIntensity = 0.9;
  composer.addPass(ao);
  // ピント：見ている所（回す中心）に合わせ、奥ほどぼかす。手前も少しだけ
  const dof = new BokehPass(scene, camera, { focus: 26, aperture: 0.0006, maxblur: 0.015 });
  composer.addPass(dof);
  composer.addPass(new OutputPass());

  const v = { renderer, scene, camera, controls, sun, ao, dof, need: true, focus: new THREE.Vector3(25, 0, 25), span: 30 };
  let envRT = null, envWant = null;
  const setEnv = (top, horizon, ground) => { if (envRT) envRT.dispose(); envRT = envFrom(top, horizon, ground); scene.environment = envRT.texture; };
  v.setPalette = (P) => {
    v.P = P;
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = sky(P.sky[0], P.sky[1]);
    setEnv(P.hemiSky, P.fog, P.hemiGround); scene.environmentIntensity = 0.6;
    scene.fog = new THREE.Fog(P.fog, 90, 260);
    v.req();
  };
  // 太陽：世界の向き（x 東, y 南, z 上）→ three（x, 上, z）
  // 時刻の色：日差しの色と強さ、空の光（影の色）、空と霞。朝と夕方で色味を変える
  v.setSun = (dir, elevDeg, am = true) => {
    const d = new THREE.Vector3(dir[0], Math.max(0.05, dir[2]), dir[1]).normalize();
    const L = skyLight(v.P, elevDeg, am);
    sun.color.copy(L.sun); sun.intensity = L.sunK;
    scene.environmentIntensity = L.env; envWant = L;   // 環境の光は次に描く前に焼き直す（スライダーを動かしている間も1回/コマ）
    if (scene.fog) scene.fog.color.copy(L.fog);
    renderer.toneMappingExposure = L.exposure;   // 朝夕は少し明るめに写す（目が慣れるのと同じ）
    glow.set(L.day);
    sun.target.position.copy(v.focus); sun.position.copy(v.focus).addScaledVector(d, 80);
    const cam = sun.shadow.camera; cam.left = -v.span; cam.right = v.span; cam.top = v.span; cam.bottom = -v.span; cam.near = 20; cam.far = 170; cam.updateProjectionMatrix();
    v.req();
  };
  v.lookAt = (target, dist = 34, polar = 58, azim = 45) => {
    controls.target.copy(target);
    const p = THREE.MathUtils.degToRad(polar), a = THREE.MathUtils.degToRad(azim);
    camera.position.set(target.x + dist * Math.sin(p) * Math.cos(a), target.y + dist * Math.cos(p), target.z + dist * Math.sin(p) * Math.sin(a));
    controls.update(); v.req();
  };
  v.resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); v.req(); };
  v.req = () => { v.need = true; };
  v.render = () => {
    if (envWant) { const L = envWant; envWant = null; setEnv(L.hemiSky, L.horizon, L.hemiGround);
      if (scene.background?.isTexture) scene.background.dispose();
      scene.background = sky('#' + L.skyTop.getHexString(), '#' + L.skyBottom.getHexString()); }
    if (dof.enabled) { const f = camera.position.distanceTo(controls.target); dof.uniforms.focus.value = f; dof.uniforms.aperture.value = (v.blur ?? 0.016) / f; }
    composer.render(); v.lastDraw = performance.now();
  };
  controls.addEventListener('change', v.req);
  addEventListener('resize', v.resize);
  const loop = () => { requestAnimationFrame(loop); const moving = controls.update(); if (v.need || moving) { v.need = false; v.render(); } };
  v.start = () => { v.resize(); loop(); };
  return v;
}
