// fetus3d.js
// Visor 3D del feto (three.js alojado en /vendor, sin terceros). Se carga solo al abrir "3D".
// Un único renderer persistente: el contenedor se recrea en cada render() y aquí se reengancha el canvas.
// Modelo estilizado generado por ordenador: PENDIENTE DE REVISIÓN (vera-backlog#41).

export const FETUS_MIN_WEEK = 8;

let THREE = null, loading = null, failed = false;
let renderer, scene, camera, pivot, particles, mats, placentaGeo, worker, container = null;
const cache = {}, pending = {}, waiters = {}, geoCache = {};
const view = { yaw: 0.35, pitch: -0.12, tYaw: 0.35, tPitch: -0.12, dist: 6, tDist: 6, zoom: 1, dragging: false, lx: 0, ly: 0, idle: 0, pinch: 0 };
let current = 20, content = null, running = false, reduce = false;

function loadThree() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/three.min.js', import.meta.url).href;
    s.onload = () => resolve(window.THREE);
    s.onerror = () => reject(new Error('three'));
    document.head.appendChild(s);
  });
  return loading;
}

function webgl() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch { return false; }
}

const RES = () => (Math.min(window.innerWidth, window.innerHeight) < 500 ? 84 : 100);

function done(w, m) {
  delete pending[w];
  cache[w] = m;
  (waiters[w] || []).forEach((f) => f(m));
  delete waiters[w];
  prefetch();
}
function request(w, cb) {
  if (cache[w]) { cb && cb(cache[w]); return; }
  if (cb) (waiters[w] = waiters[w] || []).push(cb);
  if (pending[w]) return;
  pending[w] = true;
  worker.postMessage({ w, res: RES() });
}
function prefetch() {
  if (Object.keys(pending).length) return;
  for (let d = 1; d <= 6; d++) {
    for (const w of [current + d, current - d]) {
      if (w >= FETUS_MIN_WEEK && w <= 40 && !cache[w]) { request(w); return; }
    }
  }
}

function init() {
  reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  worker = new Worker(new URL('./fetus-worker.js', import.meta.url));
  worker.onmessage = (e) => done(e.data.w, e.data.m);
  worker.onerror = () => { failed = true; if (container) container.dataset.state = 'error'; };

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  scene.add(new THREE.AmbientLight(0xFFE6DA, 0.3));
  scene.add(new THREE.HemisphereLight(0xFFE8DC, 0x4A1A30, 0.55));
  const key = new THREE.DirectionalLight(0xFFE0CC, 1.15); key.position.set(2.5, 4, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xF0C8D8, 0.35); fill.position.set(-4, -1, 3); scene.add(fill);
  const rim = new THREE.PointLight(0xFF6F8E, 1.6, 30); rim.position.set(-3, 2, -4); scene.add(rim);

  mats = {
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.55, emissive: new THREE.Color('#5A1418') }),
    placenta: new THREE.MeshStandardMaterial({ color: 0x8E2E3C, roughness: 0.75 }),
    jelly: new THREE.MeshPhysicalMaterial({ color: 0xEADCE4, roughness: 0.25, clearcoat: 0.6, transparent: true, opacity: 0.62, depthWrite: false }),
    artery: new THREE.MeshStandardMaterial({ color: 0xA2384F, roughness: 0.5 }),
    vein: new THREE.MeshStandardMaterial({ color: 0x5B4A8C, roughness: 0.5 }),
    sacBack: new THREE.MeshStandardMaterial({ color: 0xF3C9C9, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false }),
    sacFront: new THREE.MeshStandardMaterial({ color: 0xFFE2DC, transparent: true, opacity: 0.06, roughness: 0.1, depthWrite: false }),
  };
  pivot = new THREE.Group(); scene.add(pivot);

  const n = 280, ppos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, sq = Math.sqrt(1 - u * u), r = Math.cbrt(Math.random()) * 0.95;
    ppos[i * 3] = sq * Math.cos(th) * r; ppos[i * 3 + 1] = u * r; ppos[i * 3 + 2] = sq * Math.sin(th) * r;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xFFE9E2, size: 0.02, transparent: true, opacity: 0.5, depthWrite: false }));
  pivot.add(particles);

  const geo = new THREE.SphereGeometry(1, 40, 30), pa = geo.attributes.position;
  for (let k = 0; k < pa.count; k++) {
    const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k);
    const nse = 1 + 0.06 * Math.sin(x * 9) * Math.sin(y * 11) + 0.04 * Math.sin(z * 13 + x * 5);
    pa.setXYZ(k, x * nse, y * nse, z * nse);
  }
  geo.computeVertexNormals();
  placentaGeo = geo;

  // Gestos: arrastrar para girar, rueda / pellizco para acercar
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const start = (x, y) => { view.dragging = true; view.lx = x; view.ly = y; const h = container && container.querySelector('.fetus-hint'); if (h) h.style.opacity = 0; };
  const drag = (x, y) => {
    if (!view.dragging) return;
    view.tYaw += (x - view.lx) * 0.01;
    view.tPitch = Math.max(-1.2, Math.min(1.2, view.tPitch + (y - view.ly) * 0.008));
    view.lx = x; view.ly = y; view.idle = 0;
  };
  const stop = () => { view.dragging = false; };
  el.addEventListener('mousedown', (e) => start(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => drag(e.clientX, e.clientY));
  window.addEventListener('mouseup', stop);
  el.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = Math.max(0.55, Math.min(1.6, view.zoom * (1 + e.deltaY * 0.001))); view.idle = 0; }, { passive: false });
  const pd = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) { view.dragging = false; view.pinch = pd(e.touches); } else start(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 2 && view.pinch) {
      const d = pd(e.touches);
      view.zoom = Math.max(0.55, Math.min(1.6, view.zoom * view.pinch / d));
      view.pinch = d; view.idle = 0;
    } else drag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  el.addEventListener('touchend', (e) => { if (e.touches.length < 2) view.pinch = 0; if (!e.touches.length) stop(); });
}

const smoothS = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function fetusGeometry(w, m) {
  if (geoCache[w]) return geoCache[w];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.colNat, 3));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.userData = { fetus: true };
  geoCache[w] = g;
  return g;
}

function buildCord(a, b, rc, seed) {
  const g = new THREE.Group(), pts = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10, q = a.clone().lerp(b, t), amp = Math.sin(t * Math.PI) * rc * 9;
    q.x += Math.sin(t * 8 + seed) * amp * 0.6;
    q.y += Math.cos(t * 6 + seed) * amp * 0.4;
    q.z += Math.sin(t * Math.PI) * rc * 10;
    pts.push(q);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 120, rc, 12, false), mats.jelly));
  const frames = curve.computeFrenetFrames(240, false), turns = curve.getLength() / (rc * 7);
  [[0, mats.artery], [2.1, mats.artery], [4.2, mats.vein]].forEach((v) => {
    const hp = [];
    for (let k = 0; k <= 240; k++) {
      const t = k / 240, ang = t * turns * Math.PI * 2 + v[0], p = curve.getPointAt(t);
      const off = frames.normals[k].clone().multiplyScalar(Math.cos(ang) * rc * 0.5).add(frames.binormals[k].clone().multiplyScalar(Math.sin(ang) * rc * 0.5));
      hp.push(p.add(off));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 240, rc * (v[1] === mats.vein ? 0.42 : 0.3), 6, false), v[1]));
  });
  return g;
}

function show(w, m) {
  const e = m.e;
  mats.skin.emissiveIntensity = 0.32 * e + 0.03;
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(fetusGeometry(w, m), mats.skin);
  const cx = (m.bmin[0] + m.bmax[0]) / 2, cy = (m.bmin[1] + m.bmax[1]) / 2, cz = (m.bmin[2] + m.bmax[2]) / 2;
  mesh.position.set(-cx, -cy, -cz);
  const inner = new THREE.Group(); inner.rotation.y = -Math.PI * 0.4; inner.add(mesh);
  const outer = new THREE.Group(); outer.rotation.z = Math.PI * smoothS(28, 34, w); outer.add(inner);
  root.add(outer);

  const ext = Math.hypot(m.bmax[0] - m.bmin[0], m.bmax[1] - m.bmin[1], m.bmax[2] - m.bmin[2]);
  const fr = ext * 0.5 * 0.82, sacR = fr * (1.12 + 1.1 * e);

  const dir = new THREE.Vector3(-0.5, 0.55, -0.65).normalize();
  const placenta = new THREE.Mesh(placentaGeo, mats.placenta);
  placenta.position.copy(dir.clone().multiplyScalar(sacR * 0.93));
  placenta.lookAt(0, 0, 0);
  placenta.scale.set(sacR * 0.42, sacR * 0.42, sacR * 0.06);
  root.add(placenta);

  root.updateMatrixWorld(true);
  const belly = new THREE.Vector3(m.belly[0], m.belly[1], m.belly[2]);
  mesh.localToWorld(belly); root.worldToLocal(belly);
  root.add(buildCord(belly, placenta.position.clone().multiplyScalar(0.95), fr * 0.028, w * 0.7));

  const sacGeo = new THREE.SphereGeometry(sacR, 56, 40);
  root.add(new THREE.Mesh(sacGeo, mats.sacBack)); root.add(new THREE.Mesh(sacGeo, mats.sacFront));

  if (content) {
    pivot.remove(content);
    content.traverse((o) => {
      if (o.geometry && o.geometry !== placentaGeo && !(o.geometry.userData && o.geometry.userData.fetus)) o.geometry.dispose();
    });
  }
  content = root;
  pivot.add(root);
  particles.scale.setScalar(sacR);
  view.tDist = (fr * 3.5 + (sacR - fr) * 1.25) * 1.18;
  if (container) container.dataset.state = 'ready';
}

function resize() {
  if (!container) return;
  const w = container.clientWidth || 320, h = container.clientHeight || 340;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function loop() {
  if (!container || !container.isConnected) { running = false; return; }
  view.idle++;
  if (!reduce && !view.dragging && view.idle > 150) view.tYaw += 0.002;
  view.yaw += (view.tYaw - view.yaw) * 0.1;
  view.pitch += (view.tPitch - view.pitch) * 0.1;
  view.dist += (view.tDist * view.zoom - view.dist) * 0.08;
  pivot.rotation.set(view.pitch, view.yaw, 0);
  if (!reduce) particles.rotation.y += 0.0005;
  camera.position.set(0, 0, view.dist);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// Engancha el visor en `el` (creado por render()) y muestra la semana indicada.
export async function mountFetus(el, week) {
  container = el;
  const w = Math.min(40, Math.max(FETUS_MIN_WEEK, week));
  el.dataset.state = 'loading';
  if (failed || !webgl()) { el.dataset.state = 'error'; return; }
  try {
    if (!THREE) THREE = await loadThree();
    if (!renderer) init();
  } catch { failed = true; el.dataset.state = 'error'; return; }
  if (container !== el) return;
  el.prepend(renderer.domElement);
  resize();
  current = w;
  if (cache[w]) show(w, cache[w]);
  else request(w, (m) => { if (current === w && container === el) show(w, m); });
  if (!running) { running = true; requestAnimationFrame(loop); }
  prefetch();
}
