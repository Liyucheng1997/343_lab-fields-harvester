import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addDust } from '../world/shaders.js';
import { makeGrainTexture } from '../world/textures.js';

// ---------------------------------------------------------------------------
// 材质
// ---------------------------------------------------------------------------
function makeMaterials() {
  const M = {};
  M.green = addDust(new THREE.MeshPhysicalMaterial({ color: '#285a24', roughness: 0.45, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.35 }), 1.0);
  M.greenDark = addDust(new THREE.MeshPhysicalMaterial({ color: '#1d441b', roughness: 0.5, metalness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.4 }), 1.1);
  M.greenDS = addDust(new THREE.MeshPhysicalMaterial({ color: '#285a24', roughness: 0.45, metalness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.35, side: THREE.DoubleSide }), 1.0);
  M.yellowDS = addDust(new THREE.MeshPhysicalMaterial({ color: '#d9a218', roughness: 0.42, metalness: 0.1, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide }), 1.1);
  M.yellow = addDust(new THREE.MeshPhysicalMaterial({ color: '#d9a218', roughness: 0.42, metalness: 0.1, clearcoat: 0.55, clearcoatRoughness: 0.3 }), 1.1);
  M.black = addDust(new THREE.MeshStandardMaterial({ color: '#1e2120', roughness: 0.6, metalness: 0.4 }), 1.2);
  M.dark = addDust(new THREE.MeshStandardMaterial({ color: '#34393a', roughness: 0.55, metalness: 0.5 }), 1.0);
  M.steel = new THREE.MeshStandardMaterial({ color: '#a9aeb2', roughness: 0.32, metalness: 0.9 });
  M.chrome = new THREE.MeshStandardMaterial({ color: '#e0e4e8', roughness: 0.12, metalness: 1.0 });
  M.rubber = addDust(new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.93, metalness: 0 }), 1.6, new THREE.Color(0.42, 0.35, 0.26));
  M.glass = new THREE.MeshPhysicalMaterial({
    color: '#253238', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.32,
    envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1,
  });
  M.mirror = new THREE.MeshStandardMaterial({ color: '#ccd', roughness: 0.02, metalness: 1 });
  M.seat = new THREE.MeshStandardMaterial({ color: '#202224', roughness: 0.85 });
  M.interior = new THREE.MeshStandardMaterial({ color: '#2b2e30', roughness: 0.8 });
  M.screen = new THREE.MeshStandardMaterial({ color: '#0a1a22', emissive: '#3aa0d8', emissiveIntensity: 1.2, roughness: 0.3 });
  M.lamp = new THREE.MeshStandardMaterial({ color: '#fffef5', emissive: '#fff4d8', emissiveIntensity: 0.0, roughness: 0.2 });
  M.lampHousing = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.4, metalness: 0.6 });
  M.amber = new THREE.MeshStandardMaterial({ color: '#ff9a20', emissive: '#ff8a10', emissiveIntensity: 0.2, roughness: 0.3, transparent: true, opacity: 0.9 });
  M.red = new THREE.MeshStandardMaterial({ color: '#b01010', emissive: '#ff1a10', emissiveIntensity: 0.3, roughness: 0.3 });
  M.white = new THREE.MeshStandardMaterial({ color: '#e8e8e4', roughness: 0.35, metalness: 0.1 });
  M.grille = new THREE.MeshStandardMaterial({ color: '#121414', roughness: 0.7, metalness: 0.6 });
  M.sensorLens = new THREE.MeshPhysicalMaterial({ color: '#05070a', roughness: 0.05, metalness: 0.3, clearcoat: 1 });
  M.lidarBand = new THREE.MeshStandardMaterial({ color: '#101820', emissive: '#103040', emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.4 });
  M.grainCorn = new THREE.MeshStandardMaterial({ map: makeGrainTexture(232, 178, 40), roughness: 0.75 });
  M.grainWheat = new THREE.MeshStandardMaterial({ map: makeGrainTexture(214, 170, 92), roughness: 0.8 });
  M.grainSoy = new THREE.MeshStandardMaterial({ map: makeGrainTexture(218, 190, 120), roughness: 0.8 });
  M.decal = makeDecalMaterial();
  M.blackDS = addDust(new THREE.MeshStandardMaterial({ color: '#1e2120', roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }), 1.2);
  M.warning = makeWarningMaterial();
  return M;
}

function makeWarningMaterial() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c21b'; ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 128, 10); ctx.fillRect(0, 86, 128, 10);
  ctx.beginPath(); ctx.moveTo(64, 18); ctx.lineTo(100, 78); ctx.lineTo(28, 78); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2c21b'; ctx.font = 'bold 40px Arial'; ctx.textAlign = 'center'; ctx.fillText('!', 64, 72);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
}

function makeDecalMaterial() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);
  ctx.fillStyle = '#e4ad1a';
  ctx.font = 'bold 120px "Arial Black", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('ENDURANCE', 30, 105);
  ctx.fillStyle = '#f2f2ea';
  ctx.font = 'bold 42px Arial, sans-serif';
  ctx.fillText('AUTONOMOUS  HARVESTER  ·  E9', 36, 200);
  ctx.fillStyle = '#e4ad1a';
  ctx.fillRect(30, 168, 960, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
}

// ---------------------------------------------------------------------------
// 几何工具
// ---------------------------------------------------------------------------
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const box = (w, h, d, mat, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p);
const rbox = (w, h, d, r, mat, x, y, z, p) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z, p);

function cylX(r, len, mat, x, y, z, p, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(Math.PI / 2);
  return mesh(g, mat, x, y, z, p);
}
function cylZ(r, len, mat, x, y, z, p, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  return mesh(g, mat, x, y, z, p);
}
function tube(points, r, mat, p, seg = 32, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((a) => new THREE.Vector3(...a)), false, 'catmullrom', 0.1);
  return mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), mat, 0, 0, 0, p);
}
// 两点之间的圆柱
function rod(a, b, r, mat, p, seg = 8) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.rotateX(Math.PI / 2);
  const m = mesh(g, mat, va.x, va.y, va.z, p);
  m.lookAt(p ? p.localToWorld(vb.clone()) : vb);
  return m;
}
// 螺旋叶片（绞龙）
function helixGeometry(len, pitch, r0, r1, handed = 1, steps = 28) {
  const turns = len / pitch;
  const n = Math.ceil(turns * steps);
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = handed * t * turns * Math.PI * 2;
    const x = -len / 2 + t * len;
    pos.push(x, Math.cos(a) * r0, Math.sin(a) * r0, x, Math.cos(a) * r1, Math.sin(a) * r1);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// 轮胎（带人字形花纹）
// ---------------------------------------------------------------------------
function makeWheel(M, R, W, rimR, lugs, side) {
  const g = new THREE.Group();
  // 胎体
  const prof = [
    [rimR - 0.01, -W * 0.4], [rimR + 0.05, -W * 0.5], [R - 0.2, -W * 0.52], [R - 0.08, -W * 0.47],
    [R - 0.04, -W * 0.36], [R - 0.035, 0], [R - 0.04, W * 0.36], [R - 0.08, W * 0.47], [R - 0.2, W * 0.52],
    [rimR + 0.05, W * 0.5], [rimR - 0.01, W * 0.4],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tireGeo = new THREE.LatheGeometry(prof, 56);
  tireGeo.rotateZ(Math.PI / 2);
  // 花纹块
  const lugGeos = [];
  const lugBase = new THREE.BoxGeometry(W * 0.5, 0.075, 0.1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < lugs; i++) {
    for (const s of [-1, 1]) {
      const a = (i / lugs) * Math.PI * 2 + (s > 0 ? Math.PI / lugs : 0);
      const lg = lugBase.clone();
      // 人字形：沿径向轴倾斜
      lg.applyMatrix4(m4.makeRotationY(s * 0.5));
      lg.applyMatrix4(m4.makeTranslation(s * W * 0.24, R - 0.02, 0));
      lg.applyMatrix4(m4.makeRotationX(a));
      lugGeos.push(lg);
    }
  }
  const lugGeo = mergeGeometries(lugGeos);
  mesh(tireGeo, M.rubber, 0, 0, 0, g);
  mesh(lugGeo, M.rubber, 0, 0, 0, g);
  // 轮辋
  const rimProf = [
    [0.05, side * W * 0.05], [rimR * 0.35, side * W * 0.12], [rimR * 0.55, side * W * 0.08], [rimR * 0.62, side * W * 0.18],
    [rimR * 0.9, side * W * 0.22], [rimR, side * W * 0.4], [rimR, -side * W * 0.4], [rimR * 0.97, -side * W * 0.42],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const rimGeo = new THREE.LatheGeometry(rimProf, 40);
  rimGeo.rotateZ(Math.PI / 2);
  mesh(rimGeo, M.yellowDS, 0, 0, 0, g);
  // 轮毂与螺栓
  cylX(rimR * 0.28, W * 0.32, M.dark, side * W * 0.12, 0, 0, g, 16);
  cylX(rimR * 0.12, W * 0.14, M.steel, side * W * 0.3, 0, 0, g, 12);
  const boltGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6);
  boltGeo.rotateZ(Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    mesh(boltGeo, M.steel, side * W * 0.29, Math.cos(a) * rimR * 0.21, Math.sin(a) * rimR * 0.21, g, false);
  }
  // 轮辋上的减重孔（深色圆片）
  const holeGeo = new THREE.CircleGeometry(0.06, 12);
  holeGeo.rotateY(side * Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    mesh(holeGeo, M.black, side * (W * 0.19 + 0.005), Math.cos(a) * rimR * 0.48, Math.sin(a) * rimR * 0.48, g, false);
  }
  return g;
}

// ---------------------------------------------------------------------------
// 谷物割台（小麦 / 大豆）
// ---------------------------------------------------------------------------
function makeGrainHeader(M) {
  const g = new THREE.Group();
  const W = 9.1, hw = W / 2;
  const bottom = -0.62;
  // 底板
  box(W - 0.1, 0.04, 1.8, M.dark, 0, bottom + 0.02, 0.95, g);
  // 后墙（略后倾）
  const back = box(W - 0.1, 1.15, 0.07, M.green, 0, bottom + 0.6, 0.02, g);
  back.rotation.x = -0.14;
  // 顶梁
  cylX(0.09, W - 0.1, M.green, 0, 0.55, -0.06, g);
  // 后部加强筋
  for (let i = -5; i <= 5; i++) {
    if (Math.abs(i) < 1) continue;
    box(0.05, 1.1, 0.1, M.greenDark, i * 0.82, bottom + 0.62, -0.06, g).rotation.x = -0.14;
  }
  // 喂入口框
  box(1.5, 0.95, 0.12, M.black, 0, -0.15, -0.08, g);
  // 端板
  const shape = new THREE.Shape();
  shape.moveTo(-0.1, bottom);
  shape.lineTo(2.0, bottom);
  shape.lineTo(2.85, bottom + 0.12);
  shape.lineTo(2.1, bottom + 0.32);
  shape.lineTo(1.25, 0.15);
  shape.lineTo(0.35, 0.62);
  shape.lineTo(-0.1, 0.62);
  shape.closePath();
  const endGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
  endGeo.rotateY(-Math.PI / 2);
  mesh(endGeo, M.green, hw + 0.03, 0, 0, g);
  mesh(endGeo, M.green, -hw + 0.03, 0, 0, g);
  // 分禾器尖
  const tipGeo = new THREE.ConeGeometry(0.09, 0.9, 10);
  tipGeo.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const t = mesh(tipGeo, M.yellow, s * hw, bottom + 0.15, 2.7, g);
    t.rotation.x = 0.12;
    t.scale.set(0.6, 1, 1);
    // 端部反光片
    box(0.02, 0.12, 0.25, M.red, s * (hw + 0.06), 0.2, 0.5, g);
  }
  // 割刀梁 + 护刃器
  box(W, 0.05, 0.1, M.steel, 0, bottom + 0.02, 1.88, g);
  const guardGeo = new THREE.ConeGeometry(0.02, 0.13, 4);
  guardGeo.rotateX(Math.PI / 2);
  const nGuards = Math.floor(W / 0.076);
  const guards = new THREE.InstancedMesh(guardGeo, M.steel, nGuards);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nGuards; i++) {
    m4.makeTranslation(-hw + 0.04 + i * 0.076, bottom + 0.03, 1.98);
    guards.setMatrixAt(i, m4);
  }
  guards.castShadow = true;
  g.add(guards);
  // 中央搅龙
  const augerG = new THREE.Group();
  augerG.position.set(0, bottom + 0.32, 0.58);
  g.add(augerG);
  cylX(0.2, W - 0.4, M.greenDark, 0, 0, 0, augerG, 24);
  const half = (W - 1.8) / 2;
  mesh(helixGeometry(half, 0.6, 0.2, 0.31, 1), M.steel, -0.9 - half / 2, 0, 0, augerG);
  mesh(helixGeometry(half, 0.6, 0.2, 0.31, -1), M.steel, 0.9 + half / 2, 0, 0, augerG);
  // 拨指
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const f = cylX(0.012, 0.01, M.steel, 0, 0, 0, augerG);
    f.geometry = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6);
    f.position.set(-0.6 + (i % 4) * 0.4, Math.cos(a) * 0.3, Math.sin(a) * 0.3);
    f.rotation.x = a;
  }
  // 拨禾轮
  const reel = new THREE.Group();
  reel.position.set(0, 0.6, 1.62);
  g.add(reel);
  const RR = 0.66;
  cylX(0.07, W - 0.5, M.greenDark, 0, 0, 0, reel, 16);
  for (const sx of [-hw + 0.35, -hw / 2, 0, hw / 2, hw - 0.35]) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const sp = box(0.04, RR, 0.05, M.green, sx, Math.cos(a) * RR / 2, Math.sin(a) * RR / 2, reel);
      sp.rotation.x = a;
    }
    const hub = cylX(0.14, 0.12, M.green, sx, 0, 0, reel, 12);
    hub.castShadow = false;
  }
  const tineGeo = new THREE.CylinderGeometry(0.008, 0.006, 0.28, 5);
  tineGeo.translate(0, -0.14, 0);
  const tinesPerBat = 58;
  const tines = new THREE.InstancedMesh(tineGeo, M.black, tinesPerBat * 6);
  let ti = 0;
  const q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const by = Math.cos(a) * RR, bz = Math.sin(a) * RR;
    cylX(0.028, W - 0.5, M.yellow, 0, by, bz, reel, 10);
    for (let i = 0; i < tinesPerBat; i++) {
      p.set(-hw + 0.3 + i * ((W - 0.6) / (tinesPerBat - 1)), by, bz);
      // 弹齿大致朝外并向后倾
      q.setFromEuler(new THREE.Euler(a + Math.PI + 0.35, 0, 0));
      m4.compose(p, q, s);
      tines.setMatrixAt(ti++, m4);
    }
  }
  tines.castShadow = true;
  reel.add(tines);
  // 拨禾轮支臂 + 油缸
  for (const sx of [-hw + 0.12, 0.0, hw - 0.12]) {
    const arm = box(0.1, 0.12, 1.75, M.green, sx, 0.6, 0.8, g);
    arm.rotation.x = -0.02;
    if (sx !== 0) {
      rod([sx, -0.2, 0.05], [sx, 0.52, 0.95], 0.045, M.chrome, g);
      rod([sx, -0.2, 0.05], [sx, 0.15, 0.48], 0.06, M.black, g);
    }
  }
  return { group: g, reel, augers: [augerG], halfW: hw, zMin: 4.6, zMax: 6.2 };
}

// ---------------------------------------------------------------------------
// 玉米割台（8 行）
// ---------------------------------------------------------------------------
function snoutGeometry(len, halfW, height, drop) {
  const nu = 18, nv = 12;
  const pos = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const w = halfW * Math.pow(1 - u, 0.55) + 0.006;
    const h = height * Math.pow(1 - u, 0.8) + 0.01;
    const yc = -drop * Math.pow(u, 1.25);
    const z = u * len;
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * Math.PI;
      pos.push(Math.cos(v) * w, yc + Math.sin(v) * h, z);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeCornHeader(M) {
  const g = new THREE.Group();
  const rows = 8, sp = 0.76;
  const W = rows * sp, hw = W / 2;
  const bottom = -0.62;
  // 槽体
  box(W + 0.3, 0.05, 1.1, M.dark, 0, bottom + 0.05, 0.5, g);
  const back = box(W + 0.3, 1.0, 0.08, M.green, 0, bottom + 0.55, 0.0, g);
  back.rotation.x = -0.1;
  cylX(0.09, W + 0.3, M.green, 0, 0.42, -0.04, g);
  box(1.5, 0.9, 0.12, M.black, 0, -0.18, -0.09, g);
  // 横向搅龙
  const augerG = new THREE.Group();
  augerG.position.set(0, bottom + 0.3, 0.5);
  g.add(augerG);
  cylX(0.17, W, M.greenDark, 0, 0, 0, augerG, 20);
  const half = (W - 1.4) / 2;
  mesh(helixGeometry(half, 0.5, 0.17, 0.27, 1), M.steel, -0.7 - half / 2, 0, 0, augerG);
  mesh(helixGeometry(half, 0.5, 0.17, 0.27, -1), M.steel, 0.7 + half / 2, 0, 0, augerG);
  // 行单元：摘穗板、拉茎辊（暗色缝）、链条拨齿
  const lugGeo = new THREE.BoxGeometry(0.03, 0.04, 0.05);
  const chainLugs = [];
  for (let r = 0; r < rows; r++) {
    const x = -hw + sp / 2 + r * sp;
    box(0.05, 0.06, 1.7, M.black, x, bottom + 0.1, 1.55, g);
    for (const s of [-1, 1]) {
      box(0.16, 0.03, 1.6, M.dark, x + s * 0.12, bottom + 0.14, 1.55, g);
    }
    const lugs = new THREE.InstancedMesh(lugGeo, M.yellow, 24);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const s = i % 2 ? 1 : -1;
      m4.makeTranslation(x + s * 0.045, bottom + 0.18, 0.75 + (i >> 1) * 0.14);
      lugs.setMatrixAt(i, m4);
    }
    g.add(lugs);
    chainLugs.push(lugs);
    // 齿轮箱
    box(0.22, 0.22, 0.3, M.greenDark, x, bottom + 0.2, 0.6, g);
  }
  // 分禾护罩（9 个，端部两个更宽）
  for (let i = 0; i <= rows; i++) {
    const x = -hw + i * sp;
    const outer = i === 0 || i === rows;
    const geo = snoutGeometry(outer ? 2.6 : 2.55, outer ? 0.34 : 0.28, outer ? 0.42 : 0.33, 0.48);
    const sn = mesh(geo, M.greenDS, x, bottom + 0.62, 0.55, g);
    // 护罩尖端
    const tip = mesh(new THREE.SphereGeometry(0.03, 10, 6), M.yellow, x, bottom + 0.15, 0.55 + (outer ? 2.6 : 2.55), g);
    tip.scale.set(1, 0.7, 2);
    if (outer) {
      // 外侧挡板
      const sideShape = new THREE.Shape();
      sideShape.moveTo(0, 0); sideShape.lineTo(1.6, 0); sideShape.lineTo(0.6, 0.75); sideShape.lineTo(0, 0.75); sideShape.closePath();
      const sg = new THREE.ExtrudeGeometry(sideShape, { depth: 0.04, bevelEnabled: false });
      sg.rotateY(-Math.PI / 2);
      mesh(sg, M.green, x + (i === 0 ? -0.15 : 0.19), bottom + 0.05, 0.1, g);
    }
  }
  // 后部护罩
  const hood = rbox(W + 0.2, 0.32, 0.65, 0.08, M.green, 0, bottom + 0.6, 0.55, g);
  hood.rotation.x = 0.08;
  // 反光片
  for (const s of [-1, 1]) box(0.02, 0.12, 0.25, M.red, s * (hw + 0.25), bottom + 0.6, 0.6, g);
  return { group: g, reel: null, augers: [augerG], halfW: hw + 0.3, zMin: 4.2, zMax: 6.6, chainLugs };
}

// ---------------------------------------------------------------------------
// 收割机整机
// ---------------------------------------------------------------------------
export function buildCombine() {
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'combine';
  const body = new THREE.Group(); // 车身（随地形俯仰滚转）
  root.add(body);
  const parts = { M, root, body };

  const FR = 1.02, FW = 0.78, RR = 0.74, RW = 0.56;
  const trackF = 1.6, trackR = 1.4, wheelBase = 3.9;
  parts.dims = { FR, RR, trackF, trackR, wheelBase };

  // ---- 车轮 ----
  parts.frontWheels = [];
  for (const s of [1, -1]) {
    const w = makeWheel(M, FR, FW, 0.66, 26, s);
    w.position.set(s * trackF, FR, 0);
    body.add(w);
    parts.frontWheels.push(w);
    // 终传动
    cylX(0.24, 0.35, M.black, s * (trackF - 0.45), FR, 0, body, 16);
  }
  parts.rearPivots = [];
  parts.rearWheels = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * trackR, RR, -wheelBase);
    body.add(pivot);
    const w = makeWheel(M, RR, RW, 0.46, 22, s);
    pivot.add(w);
    parts.rearPivots.push(pivot);
    parts.rearWheels.push(w);
    // 转向节
    box(0.2, 0.35, 0.25, M.black, -s * 0.38, 0.05, 0, pivot);
  }
  // 后桥
  box(trackR * 2 - 0.9, 0.24, 0.3, M.black, 0, RR + 0.02, -wheelBase, body);
  box(0.4, 0.5, 0.4, M.black, 0, RR + 0.3, -wheelBase, body);
  // 转向油缸
  rod([-0.4, RR - 0.05, -wheelBase + 0.25], [0.95, RR - 0.05, -wheelBase + 0.18], 0.035, M.chrome, body);
  // 前桥壳
  box(trackF * 2 - 1.2, 0.5, 0.62, M.black, 0, FR, 0, body);

  // ---- 机身 ----
  const lower = rbox(2.3, 1.55, 6.0, 0.1, M.green, 0, 1.6, -2.2, body);
  const upper = rbox(3.34, 1.06, 6.25, 0.12, M.green, 0, 2.86, -2.5, body);
  // 机身下沿深色裙板
  box(2.32, 0.2, 5.6, M.black, 0, 0.9, -2.4, body);
  // 黄色腰线
  for (const s of [1, -1]) {
    box(0.012, 0.07, 6.0, M.yellow, s * 1.672, 2.42, -2.5, body);
    // 侧板分缝
    for (const z of [0.4, -2.5, -3.6, -4.95]) box(0.012, 0.95, 0.018, M.black, s * 1.672, 2.88, z, body);
    for (const z of [-1.2, -2.8, -4.2]) box(0.012, 1.3, 0.018, M.black, s * 1.152, 1.6, z, body);
    // 检修门把手
    for (const z of [-2.75, -3.85, 0.2]) box(0.03, 0.04, 0.18, M.steel, s * 1.685, 2.9, z, body);
    // 散热百叶（右侧）/ 旋转滤网（左侧）
    if (s < 0) {
      for (let i = 0; i < 9; i++) box(0.03, 0.05, 1.8, M.grille, s * 1.68, 2.52 + i * 0.075, -4.55, body);
    }
    // 侧面贴花
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), M.decal);
    decal.position.set(s * 1.675, 2.88, -1.05);
    decal.scale.setScalar(0.92);
    decal.rotation.y = s * Math.PI / 2;
    body.add(decal);
    // 下机身检修板与铰链
    box(0.015, 0.9, 1.1, M.greenDark, s * 1.155, 1.55, -3.6, body);
  }
  // 旋转滤网（左侧发动机进气）
  const screen = new THREE.Group();
  screen.position.set(1.69, 2.86, -4.55);
  body.add(screen);
  const scrDisk = cylX(0.46, 0.05, M.grille, 0, 0, 0, screen, 32);
  scrDisk.castShadow = false;
  for (let k = 0; k < 6; k++) {
    const sp = box(0.03, 0.9, 0.04, M.steel, 0.03, 0, 0, screen);
    sp.rotation.x = (k / 6) * Math.PI;
  }
  const scrRing = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 8, 32), M.yellow);
  scrRing.rotation.y = Math.PI / 2;
  screen.add(scrRing);
  parts.screen = screen;

  // ---- 车身细节：挡泥板、反光片、警示标签、检修盖、底盘纵梁 ----
  {
    // 前轮挡泥板（半圆弧）
    for (const s of [1, -1]) {
      const fender = new THREE.Mesh(new THREE.CylinderGeometry(FR + 0.12, FR + 0.12, FW + 0.16, 28, 1, true, Math.PI * 0.1, Math.PI * 0.58), M.blackDS);
      fender.rotation.z = Math.PI / 2;
      fender.position.set(s * trackF, FR, 0);
      fender.castShadow = true;
      body.add(fender);
      // 后轮挡泥板
      const rf = new THREE.Mesh(new THREE.CylinderGeometry(RR + 0.1, RR + 0.1, RW + 0.14, 24, 1, true, Math.PI * 0.15, Math.PI * 0.7), M.greenDS);
      rf.rotation.z = Math.PI / 2;
      rf.position.set(s * trackR, RR, -wheelBase);
      rf.castShadow = true;
      body.add(rf);
      // 侧面反光片：前琥珀色、后红色
      box(0.02, 0.09, 0.22, M.amber, s * 1.68, 2.5, 0.35, body);
      box(0.02, 0.09, 0.22, M.red, s * 1.68, 2.5, -5.4, body);
      // 警示标签
      const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), M.warning);
      warn.position.set(s * 1.153, 1.95, 0.45);
      warn.rotation.y = s * Math.PI / 2;
      body.add(warn);
      const warn2 = warn.clone();
      warn2.position.set(s * 1.676, 3.2, -4.0);
      body.add(warn2);
      // 下机身检修盖与锁扣
      for (const z of [-0.5, -2.0]) {
        box(0.02, 0.75, 1.1, M.greenDark, s * 1.16, 1.45, z, body);
        for (const dz of [-0.4, 0.4]) box(0.04, 0.06, 0.08, M.dark, s * 1.175, 1.82, z + dz, body);
      }
      // 底盘纵梁
      box(0.16, 0.24, 6.4, M.black, s * 0.85, 0.82, -2.3, body);
      // 筛箱调节手柄
      rod([s * 1.17, 1.15, -4.6], [s * 1.3, 1.35, -4.6], 0.025, M.yellow, body);
      // 左侧发动机下方长格栅 / 右侧燃油箱与加油口
      if (s > 0) {
        for (let i = 0; i < 6; i++) box(0.03, 0.04, 1.2, M.grille, s * 1.165, 1.2 + i * 0.07, -3.3, body);
      } else {
        rbox(0.5, 0.75, 1.4, 0.08, M.black, s * 1.38, 1.15, -1.6, body);
        mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 14), M.yellow, s * 1.38, 1.56, -1.15, body);
        // 加油踏板
        box(0.4, 0.04, 0.3, M.dark, s * 1.45, 0.75, -1.0, body);
      }
    }
    // 过桥液压软管
    for (const s of [1, -1]) {
      tube([[s * 0.35, 2.15, 0.6], [s * 0.6, 1.9, 1.6], [s * 0.72, 1.3, 2.9], [s * 0.78, 0.9, 3.6]], 0.025, M.rubber, body, 20, 6);
    }
    // 机身顶部步道防滑板与栏杆（发动机舱旁）
    box(0.5, 0.03, 2.4, M.dark, -1.35, 3.39, -4.2, body);
    rod([-1.62, 3.4, -5.4], [-1.62, 4.2, -5.4], 0.02, M.yellow, body);
    rod([-1.62, 3.4, -3.1], [-1.62, 4.2, -3.1], 0.02, M.yellow, body);
    rod([-1.62, 4.2, -5.4], [-1.62, 4.2, -3.1], 0.02, M.yellow, body);
    // 粮仓前部支撑与灯
    for (const s of [1, -1]) {
      box(0.18, 0.12, 0.12, M.lampHousing, s * 1.55, 4.2, 0.48, body);
      box(0.14, 0.08, 0.02, M.lamp, s * 1.55, 4.2, 0.55, body).castShadow = false;
    }
  }

  // ---- 发动机舱与尾部 ----
  rbox(2.9, 0.7, 2.6, 0.12, M.green, 0, 3.66, -4.3, body);
  // 顶部格栅
  for (let i = 0; i < 12; i++) box(2.4, 0.03, 0.06, M.grille, 0, 4.02, -5.3 + i * 0.17, body);
  // 排气管
  const stack = mesh(new THREE.CylinderGeometry(0.1, 0.11, 1.05, 16), M.black, -1.0, 4.45, -3.45, body);
  const stackCap = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.22, 16, 1, true), M.steel, -1.0, 4.98, -3.45, body);
  stackCap.rotation.x = 0.35;
  parts.exhaust = new THREE.Vector3(-1.0, 5.1, -3.4);
  // 空滤预滤器
  mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 20), M.black, -0.45, 4.2, -3.45, body);
  mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 20), M.yellow, -0.45, 4.43, -3.45, body);
  // 尾部面板与尾灯
  rbox(3.2, 1.2, 0.2, 0.06, M.green, 0, 2.95, -5.65, body);
  for (const s of [1, -1]) {
    box(0.22, 0.14, 0.05, M.red, s * 1.3, 2.75, -5.77, body);
    box(0.22, 0.1, 0.05, M.amber, s * 1.3, 2.95, -5.77, body);
    box(0.25, 0.13, 0.08, M.lampHousing, s * 1.0, 3.35, -5.77, body);
    const rl = box(0.2, 0.09, 0.02, M.lamp, s * 1.0, 3.35, -5.82, body);
    rl.castShadow = false;
  }
  // 尾部爬梯（通往发动机舱顶）
  for (const s of [1, -1]) rod([s * 0.25, 2.4, -5.8], [s * 0.25, 4.05, -5.72], 0.02, M.dark, body);
  for (let i = 0; i < 5; i++) box(0.5, 0.025, 0.06, M.dark, 0, 2.5 + i * 0.36, -5.79, body);
  // 秸秆粉碎机罩 + 抛撒盘
  rbox(2.1, 0.8, 1.0, 0.08, M.greenDark, 0, 1.25, -5.7, body);
  box(2.0, 0.08, 0.6, M.black, 0, 0.82, -6.15, body);
  parts.spreaders = [];
  for (const s of [1, -1]) {
    const sp = new THREE.Group();
    sp.position.set(s * 0.48, 0.72, -6.2);
    body.add(sp);
    mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 24), M.black, 0, 0, 0, sp);
    for (let k = 0; k < 6; k++) {
      const v = box(0.4, 0.1, 0.03, M.dark, 0, 0.05, 0, sp);
      v.rotation.y = (k / 6) * Math.PI * 2;
      v.position.set(Math.cos(v.rotation.y) * 0.2, 0.05, -Math.sin(v.rotation.y) * 0.2);
    }
    parts.spreaders.push({ g: sp, dir: s });
  }
  parts.chaffOrigin = new THREE.Vector3(0, 0.9, -6.3);

  // ---- 粮仓 ----
  const tank = new THREE.Group();
  tank.position.set(0, 3.36, -1.25);
  body.add(tank);
  const TL = 3.4, TB = 2.9, TT = 3.5, TH = 1.0;
  // 侧壁（外倾）
  for (const s of [1, -1]) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([
      s * TB / 2, 0, -TL / 2, s * TB / 2, 0, TL / 2, s * TT / 2, TH, TL / 2, s * TT / 2, TH, -TL / 2,
    ], 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    sg.computeVertexNormals();
    mesh(sg, M.greenDS, 0, 0, 0, tank);
    // 加强筋
    for (const z of [-1.1, 0, 1.1]) {
      const rib = box(0.06, 1.02, 0.06, M.greenDark, s * ((TB + TT) / 4 + 0.04), 0.5, z, tank);
      rib.rotation.z = -s * Math.atan2((TT - TB) / 2, TH);
    }
  }
  // 前后壁（梯形）
  for (const s of [1, -1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-TB / 2, 0); shape.lineTo(TB / 2, 0); shape.lineTo(TT / 2, TH); shape.lineTo(-TT / 2, TH); shape.closePath();
    const fg = new THREE.ShapeGeometry(shape);
    mesh(fg, M.greenDS, 0, 0, s * TL / 2, tank);
  }
  // 粮仓观察窗（面向驾驶室）
  const tw = mesh(new THREE.PlaneGeometry(0.9, 0.42), M.glass, 0, 0.55, TL / 2 + 0.01, tank, false);
  box(0.96, 0.05, 0.03, M.black, 0, 0.78, TL / 2 + 0.01, tank);
  box(0.96, 0.05, 0.03, M.black, 0, 0.32, TL / 2 + 0.01, tank);
  // 上沿延伸板（深色）+ 黄色包边
  const ext = new THREE.Group();
  ext.position.y = TH;
  tank.add(ext);
  for (const s of [1, -1]) {
    const e = box(0.04, 0.42, TL + 0.1, M.dark, s * (TT / 2 + 0.1), 0.18, 0, ext);
    e.rotation.z = -s * 0.45;
    box(0.06, 0.06, TL + 0.12, M.yellow, s * (TT / 2 + 0.2), 0.38, 0, ext);
    const fe = box(TT + 0.4, 0.42, 0.04, M.dark, 0, 0.18, s * (TL / 2 + 0.08), ext);
    fe.rotation.x = s * 0.35;
  }
  // 粮堆
  const heapGeo = new THREE.PlaneGeometry(TT - 0.1, TL - 0.1, 20, 20);
  heapGeo.rotateX(-Math.PI / 2);
  const hp = heapGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i) / ((TT - 0.1) / 2), z = hp.getZ(i) / ((TL - 0.1) / 2);
    const h = Math.max(0, 1 - 0.55 * x * x - 0.45 * z * z - 0.08 * Math.sin(x * 5 + z * 3));
    hp.setY(i, h * 0.45);
  }
  heapGeo.computeVertexNormals();
  const heap = mesh(heapGeo, M.grainCorn, 0, 0.05, 0, tank, false);
  heap.visible = false;
  parts.heap = heap;
  parts.tank = tank;
  // 粮仓底部到机身的过渡
  box(TB, 0.08, TL, M.dark, 0, 0.02, 0, tank);

  // ---- 卸粮搅龙 ----
  const ua = new THREE.Group();
  ua.position.set(1.85, 3.95, -2.85);
  body.add(ua);
  // 竖直段
  mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 16), M.green, 1.85, 3.35, -2.85, body);
  mesh(new THREE.SphereGeometry(0.24, 16, 12), M.green, 0, 0, 0, ua);
  const augerTube = new THREE.Group();
  ua.add(augerTube);
  augerTube.rotation.x = -0.06;
  cylZ(0.17, 6.7, M.green, 0, 0, 3.35, augerTube, 18);
  // 管箍
  for (let i = 1; i < 6; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 18), M.greenDark);
    ring.position.set(0, 0, i * 1.1);
    augerTube.add(ring);
  }
  // 出粮口
  const spout = mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.55, 16), M.green, 0, -0.28, 6.65, augerTube);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16), M.yellow, 0, -0.58, 6.65, augerTube);
  // 搅龙拉索支架
  rod([0, 0.15, 0.1], [0, 0.55, 2.8], 0.025, M.dark, augerTube);
  rod([0, 0.55, 2.8], [0, 0.18, 5.6], 0.025, M.dark, augerTube);
  // 收起支架（驾驶室前方）
  box(0.12, 0.6, 0.12, M.black, 1.85, 3.55, 3.2, body);
  parts.unloadPivot = ua;
  parts.spoutLocal = new THREE.Vector3(0, -0.65, 6.65);
  parts.augerTube = augerTube;

  // ---- 驾驶室 ----
  const cab = new THREE.Group();
  cab.position.set(0, 3.08, 1.45);
  body.add(cab);
  parts.cab = cab;
  // 平台
  box(3.0, 0.1, 2.5, M.dark, 0, -0.02, 0.15, cab);
  // 平台下方支撑
  box(2.0, 0.9, 1.2, M.green, 0, -0.5, -0.4, cab);
  // 驾驶室底座
  rbox(1.95, 0.25, 1.95, 0.05, M.green, 0, 0.12, 0, cab);
  // 玻璃
  const cabW = 1.86, cabH = 1.85, cabD = 1.85;
  const yb = 0.25, yt = yb + cabH;
  const zb = cabD / 2, zt = cabD / 2 + 0.28; // 前挡风玻璃上沿前倾
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute([
    -cabW / 2, yb, zb, cabW / 2, yb, zb, cabW / 2 + 0.06, yt, zt, -cabW / 2 - 0.06, yt, zt,
  ], 3));
  front.setIndex([0, 1, 2, 0, 2, 3]);
  front.computeVertexNormals();
  mesh(front, M.glass, 0, 0, 0, cab, false);
  for (const s of [1, -1]) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([
      s * cabW / 2, yb, -cabD / 2, s * cabW / 2, yb, zb, s * (cabW / 2 + 0.06), yt, zt, s * (cabW / 2 + 0.06), yt, -cabD / 2,
    ], 3));
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    sg.computeVertexNormals();
    mesh(sg, M.glass, 0, 0, 0, cab, false);
  }
  // 后墙：下半实体、上半玻璃
  box(cabW, 0.9, 0.06, M.green, 0, yb + 0.45, -cabD / 2, cab);
  mesh(new THREE.PlaneGeometry(cabW, cabH - 0.9), M.glass, 0, yb + 0.9 + (cabH - 0.9) / 2, -cabD / 2 + 0.01, cab, false);
  // 立柱
  for (const sx of [1, -1]) {
    rod([sx * cabW / 2, yb, zb], [sx * (cabW / 2 + 0.06), yt, zt], 0.045, M.black, cab);
    rod([sx * cabW / 2, yb, -cabD / 2], [sx * (cabW / 2 + 0.06), yt, -cabD / 2], 0.045, M.black, cab);
    // 门框
    rod([sx * cabW / 2, yb, 0.0], [sx * (cabW / 2 + 0.03), yt, 0.05], 0.022, M.black, cab);
    // 门把手
    box(0.04, 0.03, 0.18, M.steel, sx * (cabW / 2 + 0.03), yb + 1.0, 0.25, cab);
  }
  box(cabW + 0.12, 0.06, 0.06, M.black, 0, yb + 0.02, zb, cab);
  box(cabW + 0.12, 0.05, 0.05, M.black, 0, yt, zt, cab);
  // 雨刮
  const wiper = rod([0.25, yb + 0.08, zb + 0.03], [-0.25, yb + 1.3, zb + 0.22], 0.012, M.black, cab);
  parts.wiper = wiper;
  // 车顶
  const roof = rbox(2.25, 0.3, 2.45, 0.1, M.green, 0, yt + 0.12, 0.12, cab);
  box(2.1, 0.06, 2.3, M.white, 0, yt + 0.29, 0.12, cab);
  // 前沿工作灯组
  parts.lamps = [];
  for (let i = 0; i < 6; i++) {
    const x = -0.9 + i * 0.36;
    box(0.26, 0.13, 0.1, M.lampHousing, x, yt + 0.12, 1.36, cab);
    const l = box(0.22, 0.1, 0.02, M.lamp, x, yt + 0.12, 1.42, cab);
    l.castShadow = false;
  }
  for (const s of [1, -1]) {
    box(0.26, 0.13, 0.1, M.lampHousing, s * 0.75, yt + 0.12, -1.13, cab);
    box(0.22, 0.1, 0.02, M.lamp, s * 0.75, yt + 0.12, -1.19, cab).castShadow = false;
  }
  // 警示灯（琥珀色）
  parts.beacons = [];
  for (const s of [1, -1]) {
    mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.06, 16), M.black, s * 0.95, yt + 0.32, -0.9, cab);
    const bm = M.amber.clone();
    const b = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.16, 16), bm, s * 0.95, yt + 0.43, -0.9, cab, false);
    parts.beacons.push(b);
  }
  // 自动驾驶套件：GNSS 天线罩、激光雷达、摄像头组、毫米波雷达
  const auto = new THREE.Group();
  auto.position.set(0, yt + 0.32, 0);
  cab.add(auto);
  box(0.9, 0.05, 0.3, M.black, 0, 0.0, 0.0, auto);
  const dome = mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.white, 0, 0.03, 0, auto);
  dome.scale.y = 0.55;
  mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 24), M.dark, 0, 0.03, 0, auto);
  const lidarBase = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 12), M.black, 0.6, 0.12, 0.6, auto);
  const lidar = new THREE.Group();
  lidar.position.set(0.6, 0.3, 0.6);
  auto.add(lidar);
  mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 24), M.lidarBand, 0, 0, 0, lidar);
  mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.025, 24), M.dark, 0, 0.07, 0, lidar);
  box(0.04, 0.05, 0.02, M.sensorLens, 0, 0, 0.1, lidar);
  parts.lidar = lidar;
  const lidar2 = lidar.clone();
  lidar2.position.x = -0.6;
  auto.add(lidar2);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 12), M.black, -0.6, 0.12, 0.6, auto);
  parts.lidar2 = lidar2;
  // 前置摄像头条
  box(1.3, 0.12, 0.14, M.black, 0, -0.03, 1.28, auto);
  for (const x of [-0.45, -0.15, 0.15, 0.45]) {
    const lens = cylZ(0.035, 0.03, M.sensorLens, x, -0.03, 1.36, auto, 14);
    lens.castShadow = false;
  }
  // 雷达
  box(0.24, 0.14, 0.06, M.white, 0, -1.6, 2.08, auto).position.set(0, -2.95, 1.6);
  // 天线
  rod([-0.85, 0, -0.9], [-0.85, 0.9, -0.95], 0.008, M.black, auto);

  // 后视镜
  for (const s of [1, -1]) {
    const arm = tube([[s * 0.95, yb + 1.55, 0.95], [s * 1.35, yb + 1.6, 1.05], [s * 1.55, yb + 1.45, 1.15]], 0.022, M.black, cab, 16, 6);
    const mirror = rbox(0.12, 0.42, 0.24, 0.03, M.black, s * 1.6, yb + 1.2, 1.15, cab);
    const glass = mesh(new THREE.PlaneGeometry(0.2, 0.36), M.mirror, s * 1.6, yb + 1.2, 1.02, cab, false);
    glass.rotation.y = Math.PI + s * 0.3;
    // 侧摄像头
    cylZ(0.03, 0.06, M.sensorLens, s * 1.6, yb + 1.45, 1.2, cab, 12);
  }
  // 内饰
  const seat = new THREE.Group();
  seat.position.set(0.1, yb, -0.2);
  cab.add(seat);
  rbox(0.55, 0.14, 0.55, 0.05, M.seat, 0, 0.5, 0, seat);
  rbox(0.55, 0.75, 0.14, 0.05, M.seat, 0, 0.92, -0.25, seat);
  rbox(0.38, 0.22, 0.1, 0.04, M.seat, 0, 1.4, -0.27, seat);
  box(0.12, 0.4, 0.12, M.black, 0, 0.22, 0, seat);
  // 右侧扶手控制台 + 多功能手柄
  rbox(0.16, 0.15, 0.7, 0.03, M.interior, 0.4, 0.62, 0.05, seat);
  mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 10), M.black, 0.4, 0.78, 0.3, seat);
  mesh(new THREE.SphereGeometry(0.045, 12, 8), M.black, 0.4, 0.88, 0.3, seat);
  // 显示屏
  const scr = box(0.3, 0.22, 0.02, M.screen, 0.62, 1.15, 0.55, seat);
  scr.rotation.y = -0.6;
  scr.rotation.x = -0.2;
  // 转向柱与方向盘
  rod([0.0, 0.2, 0.75], [0.0, 1.0, 0.55], 0.04, M.interior, seat);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24), M.black);
  wheel.position.set(0, 1.02, 0.54);
  wheel.rotation.x = -1.15;
  seat.add(wheel);
  parts.steeringWheel = wheel;
  // 仪表台
  rbox(1.4, 0.2, 0.35, 0.04, M.interior, -0.1, 0.35, 0.95, seat);

  // 平台扶手
  const railPts = [[-1.45, 0.05, 1.35], [-1.45, 1.0, 1.35], [1.0, 1.0, 1.35]];
  for (const s of [1, -1]) {
    rod([s * 1.45, 0.05, 1.35], [s * 1.45, 1.05, 1.35], 0.025, M.dark, cab);
    rod([s * 1.45, 0.05, -0.9], [s * 1.45, 1.05, -0.9], 0.025, M.dark, cab);
    rod([s * 1.45, 1.05, 1.35], [s * 1.45, 1.05, -0.9], 0.025, M.dark, cab);
    rod([s * 1.45, 0.55, 1.35], [s * 1.45, 0.55, -0.9], 0.018, M.dark, cab);
  }
  rod([-1.45, 1.05, 1.35], [-1.0, 1.05, 1.35], 0.025, M.dark, cab);
  rod([1.45, 1.05, 1.35], [1.0, 1.05, 1.35], 0.025, M.dark, cab);
  void railPts;

  // ---- 爬梯（左前） ----
  {
    const top = [1.55, 3.05, 1.6], bot = [1.55, 0.35, 2.75];
    for (const dx of [-0.24, 0.24]) {
      rod([top[0] + dx, top[1], top[2]], [bot[0] + dx, bot[1], bot[2]], 0.025, M.dark, body);
      // 扶手
      rod([top[0] + dx, top[1] + 1.0, top[2] - 0.1], [bot[0] + dx, bot[1] + 1.0, bot[2]], 0.02, M.dark, body);
      rod([bot[0] + dx, bot[1], bot[2]], [bot[0] + dx, bot[1] + 1.0, bot[2]], 0.02, M.dark, body);
    }
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8;
      box(0.46, 0.035, 0.18, M.black, top[0], top[1] + (bot[1] - top[1]) * t, top[2] + (bot[2] - top[2]) * t, body);
    }
  }

  // ---- 过桥（倾斜输送槽）+ 割台 ----
  const feeder = new THREE.Group();
  feeder.position.set(0, 2.0, 0.75);
  body.add(feeder);
  rbox(1.45, 1.0, 3.05, 0.06, M.green, 0, -0.5, 1.5, feeder);
  for (const s of [1, -1]) {
    box(0.012, 0.8, 2.6, M.greenDark, s * 0.73, -0.5, 1.5, feeder);
    // 观察口
    box(0.02, 0.3, 0.5, M.black, s * 0.735, -0.4, 1.1, feeder);
  }
  // 过桥底部链耙（暗色）
  box(1.3, 0.06, 2.9, M.black, 0, -1.02, 1.5, feeder);
  // 过桥前端适配器
  box(1.6, 1.15, 0.18, M.dark, 0, -0.52, 3.05, feeder);
  const headerMount = new THREE.Group();
  headerMount.position.set(0, -0.5, 3.12);
  feeder.add(headerMount);
  parts.feeder = feeder;
  parts.headerMount = headerMount;
  // 升降油缸
  parts.liftCyl = [];
  for (const s of [1, -1]) {
    const barrel = mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 12), M.black, 0, 0, 0, body);
    const rodm = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 10), M.chrome, 0, 0, 0, body);
    parts.liftCyl.push({ barrel, rod: rodm, base: new THREE.Vector3(s * 0.55, 1.05, -0.15), tip: new THREE.Vector3(s * 0.55, -1.0, 1.6) });
  }

  parts.headers = { grain: makeGrainHeader(M), corn: makeCornHeader(M) };
  for (const h of Object.values(parts.headers)) headerMount.add(h.group);
  parts.headers.grain.group.visible = false;

  // ---- 夜间灯光 ----
  const spots = [];
  for (const s of [1, -1]) {
    const sl = new THREE.SpotLight(0xfff2dd, 0, 90, 0.62, 0.5, 1.2);
    sl.position.set(s * 0.6, 5.3, 2.7);
    sl.target.position.set(s * 1.5, 0, 14);
    body.add(sl);
    body.add(sl.target);
    spots.push(sl);
  }
  parts.spots = spots;

  root.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  return parts;
}
