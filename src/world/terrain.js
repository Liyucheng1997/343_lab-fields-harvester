import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise2D, fbm, mulberry32 } from './noise.js';
import { heightAt, fieldAt, isOnRoad, ROAD, LANE, FARM } from './layout.js';
import { addWorldDetail, patchPlantMaterial, makePlantDepthMaterial } from './shaders.js';
import { makeGravelTexture, makeGrassCardTexture } from './textures.js';

const CENTER = { x: 35, z: 10 };

export function buildTerrain(scene, detailTex) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const n = createNoise2D(99);

  // ---- 近景高精度地形 ----
  const size = 1000, segs = 320;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cDry = new THREE.Color('#8f8458'), cGreen = new THREE.Color('#6c6c3c'), cDirt = new THREE.Color('#8a7452'), cPale = new THREE.Color('#a89a6e');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + CENTER.x, z = pos.getZ(i) + CENTER.z;
    const y = heightAt(x, z);
    pos.setXYZ(i, x, y, z);
    const a = fbm(n, x / 60, z / 60, 3) * 0.5 + 0.5;
    const b = fbm(n, x / 13 + 40, z / 13, 2) * 0.5 + 0.5;
    tmp.copy(cDry).lerp(cGreen, a * 0.7).lerp(cPale, Math.max(0, b - 0.55) * 1.5);
    // 田埂与路边裸土
    const f = fieldAt(x, z, 4);
    if (f && !fieldAt(x, z, 0)) tmp.lerp(cDirt, 0.55);
    if (isOnRoad(x, z, 3)) tmp.lerp(cDirt, 0.45);
    // 院子里踩实的土
    const dh = Math.hypot(x - FARM.house.x, z - FARM.house.z + 4);
    if (dh < 26) tmp.lerp(cDirt, (1 - dh / 26) * 0.5);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = addWorldDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 }), detailTex, 0.22, 1.0);
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- 远景低精度地形（内部区域下沉，避免与近景重叠） ----
  const ogeo = new THREE.PlaneGeometry(9000, 9000, 180, 180);
  ogeo.rotateX(-Math.PI / 2);
  const op = ogeo.attributes.position;
  const ocol = new Float32Array(op.count * 3);
  for (let i = 0; i < op.count; i++) {
    const x = op.getX(i) + CENTER.x, z = op.getZ(i) + CENTER.z;
    let y = heightAt(x, z);
    if (Math.abs(x - CENTER.x) < size / 2 - 2 && Math.abs(z - CENTER.z) < size / 2 - 2) y -= 3;
    op.setXYZ(i, x, y, z);
    const a = fbm(n, x / 300, z / 300, 3) * 0.5 + 0.5;
    tmp.copy(cDry).lerp(cGreen, a * 0.6);
    ocol[i * 3] = tmp.r; ocol[i * 3 + 1] = tmp.g; ocol[i * 3 + 2] = tmp.b;
  }
  ogeo.setAttribute('color', new THREE.BufferAttribute(ocol, 3));
  ogeo.computeVertexNormals();
  const outer = new THREE.Mesh(ogeo, addWorldDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), detailTex, 0.05, 0.8));
  outer.receiveShadow = false;
  group.add(outer);

  // ---- 道路 ----
  group.add(buildRoads());

  scene.add(group);
  return group;
}

function roadStrip(points, width, tex, segLen = 2) {
  // points: 中心线折线 [{x,z}]
  const verts = [], uvs = [], idx = [];
  let dist = 0;
  const across = 6;
  const sampled = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(L / segLen));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      sampled.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / L, dz: (b.z - a.z) / L });
    }
  }
  const last = points[points.length - 1], prev = points[points.length - 2];
  const Ll = Math.hypot(last.x - prev.x, last.z - prev.z);
  sampled.push({ x: last.x, z: last.z, dx: (last.x - prev.x) / Ll, dz: (last.z - prev.z) / Ll });
  for (let i = 0; i < sampled.length; i++) {
    const p = sampled[i];
    if (i > 0) dist += Math.hypot(p.x - sampled[i - 1].x, p.z - sampled[i - 1].z);
    const nx = -p.dz, nz = p.dx;
    for (let k = 0; k <= across; k++) {
      const t = k / across - 0.5;
      const x = p.x + nx * t * width, z = p.z + nz * t * width;
      // 路面中间略微拱起
      const crown = 0.05 * (1 - (2 * t) * (2 * t));
      verts.push(x, heightAt(x, z) + 0.06 + crown, z);
      uvs.push(k / across, dist / (width * 1.2));
    }
  }
  for (let i = 0; i < sampled.length - 1; i++) {
    for (let k = 0; k < across; k++) {
      const a = i * (across + 1) + k, b = a + across + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildRoads() {
  const group = new THREE.Group();
  const tex = makeGravelTexture();
  // 路缘渐隐 alpha
  const ac = document.createElement('canvas');
  ac.width = 64; ac.height = 4;
  const actx = ac.getContext('2d');
  const grad = actx.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, '#000'); grad.addColorStop(0.16, '#fff'); grad.addColorStop(0.84, '#fff'); grad.addColorStop(1, '#000');
  actx.fillStyle = grad; actx.fillRect(0, 0, 64, 4);
  const alpha = new THREE.CanvasTexture(ac);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, alphaMap: alpha, transparent: true, roughness: 0.95, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const main = new THREE.Mesh(roadStrip([{ x: -480, z: ROAD.z }, { x: 520, z: ROAD.z }], ROAD.width + 1.5, tex), mat);
  main.receiveShadow = true;
  group.add(main);
  const lane = new THREE.Mesh(roadStrip([{ x: LANE.x, z: ROAD.z }, { x: LANE.x, z: LANE.z1 }], LANE.width + 1, tex), mat);
  lane.receiveShadow = true;
  group.add(lane);
  // 通往农舍和谷仓的车道
  const drive = new THREE.Mesh(roadStrip([{ x: -26, z: ROAD.z }, { x: -27, z: -36 }, { x: -24, z: -44 }, { x: -6, z: -52 }, { x: 12, z: -58 }], 4.5, tex), mat);
  drive.receiveShadow = true;
  group.add(drive);
  const drive2 = new THREE.Mesh(roadStrip([{ x: 22, z: ROAD.z }, { x: 30, z: -40 }, { x: 46, z: -46 }], 4.5, tex), mat);
  drive2.receiveShadow = true;
  group.add(drive2);
  group.renderOrder = 1;
  return group;
}

// 草丛：实例化交叉面片 + 风吹
export function buildGrass(scene, count = 26000) {
  const tex = makeGrassCardTexture();
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], nor = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const cx = Math.cos(a) * 0.45, cz = Math.sin(a) * 0.45;
    const base = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, 0.62, cz, -cx, 0.62, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  const cutAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  geo.setAttribute('aCut', cutAttr);
  const mat = patchPlantMaterial(new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9,
  }), { plantH: 0.62, sway: 0.16, stubble: 0.1 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.customDepthMaterial = makePlantDepthMaterial({ plantH: 0.62, sway: 0.16, stubble: 0.1 });
  const rnd = mulberry32(5);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 8) {
    tries++;
    // 更多草丛分布在田边与路边
    let x, z;
    if (rnd() < 0.55) {
      const r = 30 + rnd() * 320, a = rnd() * Math.PI * 2;
      x = CENTER.x + Math.cos(a) * r; z = CENTER.z + Math.sin(a) * r;
    } else {
      x = -130 + rnd() * 340; z = -90 + rnd() * 230;
    }
    if (fieldAt(x, z, 0.5)) continue;
    if (isOnRoad(x, z, 0.3)) continue;
    // 避开运粮车停车与卸粮区域
    if (Math.abs(x) < 14 && z > -22 && z < -2) continue;
    const near = fieldAt(x, z, 6) || isOnRoad(x, z, 4);
    if (!near && rnd() < 0.7) continue;
    const sc = 0.35 + rnd() * 0.55 + (near ? 0.25 : 0);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    s.set(sc, sc * (0.8 + rnd() * 0.5), sc);
    t.set(x, heightAt(x, z) - 0.03, z);
    m.compose(t, q, s);
    mesh.setMatrixAt(placed, m);
    const dry = rnd();
    col.setRGB(1.0 + dry * 0.25, 0.98 + dry * 0.15, 0.85 + dry * 0.1);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// 远景作物田（替身）：顶面冠层贴图 + 侧面茎秆剪影，营造一望无际的玉米地
// ---------------------------------------------------------------------------
function canopyTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(kind === 'corn' ? 101 : 202);
  const base = kind === 'corn' ? '#2f4a18' : kind === 'wheat' ? '#9a7c40' : '#6a5434';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const n = kind === 'corn' ? 1600 : 3000;
  for (let i = 0; i < n; i++) {
    const x = rnd() * 256, y = rnd() * 256;
    let col;
    if (kind === 'corn') { const g = 60 + rnd() * 70; col = `rgba(${g * 0.75 | 0},${g | 0},${g * 0.35 | 0},0.8)`; }
    else if (kind === 'wheat') { const g = 140 + rnd() * 70; col = `rgba(${g | 0},${g * 0.82 | 0},${g * 0.48 | 0},0.7)`; }
    else { const g = 80 + rnd() * 60; col = `rgba(${g | 0},${g * 0.8 | 0},${g * 0.55 | 0},0.7)`; }
    ctx.strokeStyle = col;
    ctx.lineWidth = kind === 'corn' ? 2 + rnd() * 2 : 1 + rnd();
    const a = rnd() * Math.PI * 2, l = kind === 'corn' ? 6 + rnd() * 10 : 2 + rnd() * 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  // 行间阴影
  const rows = kind === 'corn' ? 8 : 16;
  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect((r / rows) * 256, 0, 256 / rows * 0.25, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function stalkSideTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(kind === 'corn' ? 303 : 404);
  ctx.clearRect(0, 0, 512, 128);
  const count = kind === 'corn' ? 34 : 120;
  for (let i = 0; i < count; i++) {
    const x = rnd() * 512;
    const top = kind === 'corn' ? 4 + rnd() * 14 : 6 + rnd() * 10;
    const g = kind === 'corn' ? 50 + rnd() * 50 : 130 + rnd() * 60;
    const col = kind === 'corn' ? `rgb(${g * 0.75 | 0},${g | 0},${g * 0.35 | 0})` : `rgb(${g | 0},${g * 0.8 | 0},${g * 0.45 | 0})`;
    ctx.strokeStyle = col;
    ctx.lineWidth = kind === 'corn' ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, 128); ctx.lineTo(x + (rnd() - 0.5) * 6, top); ctx.stroke();
    if (kind === 'corn') {
      for (let k = 0; k < 6; k++) {
        const y = 30 + k * 15 + rnd() * 8;
        const dir = rnd() < 0.5 ? -1 : 1;
        ctx.lineWidth = 3 + rnd() * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dir * 14, y - 12, x + dir * (20 + rnd() * 10), y + 6); ctx.stroke();
      }
    } else {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x, top, 2.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildFarFields(scene) {
  const group = new THREE.Group();
  group.name = 'farFields';
  const kinds = {
    corn: { h: 2.4, top: canopyTexture('corn'), side: stalkSideTexture('corn'), rep: 7 },
    wheat: { h: 0.95, top: canopyTexture('wheat'), side: stalkSideTexture('wheat'), rep: 5 },
  };
  const blocks = [
    // [kind, x0, x1, z0, z1]
    ['corn', -150, 230, 150, 560],
    ['corn', -560, -160, -10, 520],
    ['wheat', 240, 620, -10, 300],
    ['corn', 240, 620, 315, 620],
    ['corn', -620, -175, -420, -40],
    ['wheat', -175, 160, -460, -125],
    ['corn', 160, 620, -440, -40],
    ['corn', -150, 230, 575, 1000],
    ['wheat', -580, -160, 535, 1000],
  ];
  const tops = { corn: [], wheat: [] }, sides = { corn: [], wheat: [] };
  const cell = 8;
  for (const [kind, x0, x1, z0, z1] of blocks) {
    const K = kinds[kind];
    // 顶面
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + (z0 + z1) / 2;
      p.setXYZ(i, x, heightAt(x, z) + K.h, z);
      uv.setXY(i, x / K.rep, z / K.rep);
    }
    g.computeVertexNormals();
    tops[kind].push(g);
    // 侧面（四边）
    const edges = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
    const pos = [], uvs = [], idx = [];
    for (const [ax, az, bx, bz] of edges) {
      const L = Math.hypot(bx - ax, bz - az);
      const segs = Math.ceil(L / 4);
      const base = pos.length / 3;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = heightAt(x, z);
        pos.push(x, y - 0.3, z, x, y + K.h + 0.15, z);
        uvs.push((t * L) / (K.h * 4), 0, (t * L) / (K.h * 4), 1);
        if (k < segs) { const a = base + k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    sg.setIndex(idx);
    sg.computeVertexNormals();
    sides[kind].push(sg);
  }
  for (const kind of Object.keys(kinds)) {
    const K = kinds[kind];
    if (!tops[kind].length) continue;
    const topMesh = new THREE.Mesh(mergeGeometries(tops[kind]), new THREE.MeshStandardMaterial({ map: K.top, roughness: 0.95 }));
    topMesh.receiveShadow = true;
    group.add(topMesh);
    const sideMesh = new THREE.Mesh(mergeGeometries(sides[kind]), new THREE.MeshStandardMaterial({ map: K.side, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 }));
    group.add(sideMesh);
  }
  scene.add(group);
  return group;
}
