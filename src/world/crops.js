import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { heightAt } from './layout.js';
import { patchPlantMaterial, makePlantDepthMaterial, addWorldDetail } from './shaders.js';
import { makeFieldCanvas } from './textures.js';

// ---------------------------------------------------------------------------
// 几何构建器
// ---------------------------------------------------------------------------
class GeoBuilder {
  constructor() { this.pos = []; this.col = []; this.idx = []; this.n = 0; }
  v(p, c) {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  // 沿路径生成带状面（叶片/茎秆），cross 为每个点的横向向量，widths 为半宽
  ribbon(points, cross, widths, colors, fold = 0, foldDirs = null) {
    const rows = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i], c = cross[i], w = widths[i], col = colors[i];
      const l = p.clone().addScaledVector(c, -w);
      const r = p.clone().addScaledVector(c, w);
      if (fold > 0 && foldDirs) {
        const m = p.clone().addScaledVector(foldDirs[i], fold * w);
        rows.push([this.v(l, col), this.v(m, col), this.v(r, col)]);
      } else {
        rows.push([this.v(l, col), this.v(r, col)]);
      }
    }
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if (a.length === 3) {
        this.quad(a[0], b[0], b[1], a[1]);
        this.quad(a[1], b[1], b[2], a[2]);
      } else {
        this.quad(a[0], b[0], b[1], a[1]);
      }
    }
  }
  // 锥形圆柱（茎秆）
  tube(p0, p1, r0, r1, sides, segs, c0, c1, bend = null) {
    const axis = p1.clone().sub(p0);
    const len = axis.length();
    axis.normalize();
    const tmp = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(axis, tmp).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const rings = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const center = p0.clone().addScaledVector(axis, len * t);
      if (bend) center.addScaledVector(bend, t * t);
      const r = r0 + (r1 - r0) * t;
      const col = c0.clone().lerp(c1, t);
      const ring = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const p = center.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
        ring.push(this.v(p, col));
      }
      rings.push(ring);
    }
    for (let s = 0; s < segs; s++) {
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        this.quad(rings[s][k], rings[s + 1][k], rings[s + 1][k2], rings[s][k2]);
      }
    }
  }
  build(upBias = 0.6) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // 法线向上偏移：植物整体受光更柔和，背面不发黑
    const n = g.attributes.normal;
    const v = new THREE.Vector3();
    for (let i = 0; i < n.count; i++) {
      v.fromBufferAttribute(n, i);
      if (v.y < 0) v.multiplyScalar(-1);
      v.y += upBias;
      v.normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

const C = (r, g, b) => new THREE.Color(r, g, b);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// 弯曲叶片：从 base 出发，水平方向 dir，起始仰角 e0，下垂 droop
function addLeaf(b, base, dir, length, width, e0, droop, segs, cBase, cTip, fold, twist = 0.3, tipDry = 0.25) {
  const pts = [], cross = [], widths = [], cols = [], folds = [];
  let p = base.clone();
  const side = new THREE.Vector3().crossVectors(UP, dir).normalize();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = e0 - droop * Math.pow(t, 1.4);
    const tangent = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(UP, Math.sin(a)).normalize();
    pts.push(p.clone());
    // 叶片横向轻微扭转
    const tw = twist * t;
    const cr = side.clone().multiplyScalar(Math.cos(tw)).addScaledVector(UP, Math.sin(tw) * 0.5).normalize();
    cross.push(cr);
    const wt = t < 0.12 ? 0.45 + (t / 0.12) * 0.55 : Math.pow(1 - (t - 0.12) / 0.88, 0.75);
    widths.push(Math.max(0.0015, width * wt));
    const k = t > 1 - tipDry ? (t - (1 - tipDry)) / tipDry : 0;
    cols.push(cBase.clone().lerp(cTip, Math.min(1, t * 0.4 + k * 0.9)));
    folds.push(new THREE.Vector3().crossVectors(tangent, cr).normalize().multiplyScalar(-1));
    p.addScaledVector(tangent, length / segs);
  }
  b.ribbon(pts, cross, widths, cols, fold, fold > 0 ? folds : null);
}

// ---------------------------------------------------------------------------
// 玉米
// ---------------------------------------------------------------------------
export function makeCornGeometry(hi = true, seed = 1) {
  const rnd = mulberry32(seed);
  const b = new GeoBuilder();
  const H = 2.15;
  // 茎秆
  b.tube(V(0, 0, 0), V(0, H, 0), 0.024, 0.009, hi ? 6 : 3, hi ? 6 : 1, C(0.36, 0.3, 0.14), C(0.3, 0.44, 0.13));
  if (hi) {
    // 支持根
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      b.tube(V(0, 0.16, 0), V(Math.cos(a) * 0.07, -0.02, Math.sin(a) * 0.07), 0.006, 0.004, 3, 1, C(0.45, 0.38, 0.2), C(0.4, 0.33, 0.18));
    }
  }
  // 叶片
  const nLeaves = hi ? 11 : 6;
  for (let i = 0; i < nLeaves; i++) {
    const f = i / (nLeaves - 1);
    const y = 0.22 + f * 1.65;
    const phi = i * Math.PI + (rnd() - 0.5) * 0.6 + i * 0.12;
    const dir = V(Math.cos(phi), 0, Math.sin(phi));
    const len = 0.6 + 0.42 * Math.sin(Math.PI * (0.15 + f * 0.8));
    const width = 0.045 + 0.03 * Math.sin(Math.PI * f);
    const dry = i < 2 ? 1 : 0;
    const cBase = dry ? C(0.5, 0.42, 0.24) : C(0.2, 0.34, 0.08);
    const cTip = dry ? C(0.58, 0.48, 0.28) : C(0.46, 0.5, 0.2);
    const e0 = 0.75 + rnd() * 0.35 + f * 0.25;
    const droop = (dry ? 2.4 : 1.5) + rnd() * 0.5 - f * 0.4;
    addLeaf(b, V(dir.x * 0.012, y, dir.z * 0.012), dir, len, width, e0, droop, hi ? 6 : 3, cBase, cTip, hi ? 0.35 : 0, 0.4, 0.3);
  }
  // 玉米穗（带苞叶）
  {
    const phi = rnd() * Math.PI * 2;
    const out = V(Math.cos(phi), 0, Math.sin(phi));
    const axis = out.clone().multiplyScalar(0.42).addScaledVector(UP, 0.9).normalize();
    const base = V(out.x * 0.02, 1.02, out.z * 0.02);
    const len = 0.25;
    const side = new THREE.Vector3().crossVectors(axis, UP).normalize();
    const w2 = new THREE.Vector3().crossVectors(axis, side).normalize();
    const radial = hi ? 7 : 4, segs = hi ? 6 : 2;
    const rings = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = 0.038 * Math.pow(Math.sin(Math.PI * Math.min(0.98, 0.12 + t * 0.88)), 0.55) * (1 - t * 0.35);
      const c = C(0.62, 0.6, 0.34).lerp(C(0.72, 0.64, 0.4), t);
      const ring = [];
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        const p = base.clone().addScaledVector(axis, len * t).addScaledVector(side, Math.cos(a) * r).addScaledVector(w2, Math.sin(a) * r);
        ring.push(b.v(p, c));
      }
      rings.push(ring);
    }
    for (let s = 0; s < segs; s++) for (let k = 0; k < radial; k++) {
      const k2 = (k + 1) % radial;
      b.quad(rings[s][k], rings[s + 1][k], rings[s + 1][k2], rings[s][k2]);
    }
    if (hi) {
      // 穗丝
      const tip = base.clone().addScaledVector(axis, len);
      addLeaf(b, tip, out, 0.08, 0.012, 0.6, 1.8, 2, C(0.55, 0.38, 0.2), C(0.45, 0.3, 0.16), 0, 0, 0);
      // 苞叶尖
      addLeaf(b, base.clone().addScaledVector(axis, len * 0.7), out.clone().negate(), 0.12, 0.018, 1.2, 1.2, 2, C(0.5, 0.55, 0.28), C(0.65, 0.6, 0.35), 0, 0.2, 0.5);
    }
  }
  // 雄穗
  {
    const top = V(0, H, 0);
    b.tube(top, V(0, H + 0.32, 0), 0.006, 0.002, 3, 2, C(0.65, 0.6, 0.35), C(0.78, 0.68, 0.42));
    const nb = hi ? 7 : 3;
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * Math.PI * 2 + rnd();
      const dir = V(Math.cos(a), 0, Math.sin(a));
      addLeaf(b, V(0, H + 0.04 + rnd() * 0.08, 0), dir, 0.2 + rnd() * 0.08, 0.008, 0.9, 1.9, hi ? 3 : 2, C(0.72, 0.64, 0.38), C(0.82, 0.7, 0.45), 0, 0.2, 0);
    }
  }
  return b.build(0.55);
}

// ---------------------------------------------------------------------------
// 小麦（一丛多株）
// ---------------------------------------------------------------------------
export function makeWheatGeometry(hi = true, seed = 2) {
  const rnd = mulberry32(seed);
  const b = new GeoBuilder();
  const n = hi ? 12 : 5;
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(rnd()) * 0.14;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 0.82 + rnd() * 0.18;
    const lean = V((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12);
    const face = rnd() * Math.PI;
    const cross = V(Math.cos(face), 0, Math.sin(face));
    const cStem0 = C(0.5, 0.41, 0.22), cStem1 = C(0.66, 0.54, 0.3);
    // 茎
    const segs = hi ? 3 : 1;
    const pts = [], crs = [], ws = [], cols = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      pts.push(V(x, h * t, z).addScaledVector(lean, t * t));
      crs.push(cross);
      ws.push(0.0055 * (1 - t * 0.4));
      cols.push(cStem0.clone().lerp(cStem1, t));
    }
    b.ribbon(pts, crs, ws, cols);
    // 麦穗：弯垂的纺锤体（两片交叉菱形）+ 麦芒
    const top = pts[pts.length - 1];
    const nod = V(lean.x * 2 + (rnd() - 0.5) * 0.3, 1, lean.z * 2 + (rnd() - 0.5) * 0.3).normalize();
    const hl = 0.085 + rnd() * 0.025;
    const cH0 = C(0.72, 0.58, 0.32), cH1 = C(0.8, 0.66, 0.38);
    const crossB = new THREE.Vector3().crossVectors(nod, cross).normalize();
    const planes = hi ? [cross, crossB] : [cross];
    for (const cr of planes) {
      const hp = [], hc = [], hw = [], hcol = [];
      const hs = hi ? 3 : 2;
      for (let s = 0; s <= hs; s++) {
        const t = s / hs;
        hp.push(top.clone().addScaledVector(nod, hl * t));
        hc.push(cr);
        hw.push(0.011 * Math.sin(Math.PI * (0.2 + t * 0.7)) + 0.002);
        hcol.push(cH0.clone().lerp(cH1, t));
      }
      b.ribbon(hp, hc, hw, hcol);
    }
    if (hi) {
      // 麦芒
      const tip = top.clone().addScaledVector(nod, hl);
      const awnDir = nod.clone().add(V(0, 0.4, 0)).normalize();
      b.ribbon([top.clone().addScaledVector(nod, hl * 0.5), tip.clone().addScaledVector(awnDir, 0.07)], [cross, cross], [0.008, 0.0015], [C(0.74, 0.62, 0.38), C(0.8, 0.7, 0.46)]);
    }
  }
  if (hi) {
    // 干枯叶片
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2;
      addLeaf(b, V(0, 0.25 + rnd() * 0.3, 0), V(Math.cos(a), 0, Math.sin(a)), 0.22, 0.008, 0.6, 2.2, 3, C(0.6, 0.5, 0.28), C(0.7, 0.6, 0.36), 0, 0.3, 0.4);
    }
  }
  return b.build(0.7);
}

// ---------------------------------------------------------------------------
// 大豆（成熟期：黄叶 + 豆荚）
// ---------------------------------------------------------------------------
export function makeSoyGeometry(hi = true, seed = 3) {
  const rnd = mulberry32(seed);
  const b = new GeoBuilder();
  const H = 0.72;
  const cStem0 = C(0.32, 0.24, 0.14), cStem1 = C(0.4, 0.31, 0.18);
  const cPod0 = C(0.36, 0.26, 0.15), cPod1 = C(0.48, 0.36, 0.2);
  const cLeaf0 = C(0.52, 0.42, 0.14), cLeaf1 = C(0.44, 0.32, 0.13);
  const stemTop = V((rnd() - 0.5) * 0.05, H, (rnd() - 0.5) * 0.05);
  b.tube(V(0, 0, 0), stemTop, 0.009, 0.004, hi ? 4 : 3, hi ? 3 : 1, cStem0, cStem1);
  const branches = [{ p0: V(0, 0, 0), p1: stemTop }];
  const nb = hi ? 5 : 3;
  for (let k = 0; k < nb; k++) {
    const a = (k / nb) * Math.PI * 2 + rnd() * 0.8;
    const y0 = 0.1 + rnd() * 0.25;
    const len = 0.28 + rnd() * 0.15;
    const dir = V(Math.cos(a) * 0.75, 0.8 + rnd() * 0.3, Math.sin(a) * 0.75).normalize();
    const p0 = stemTop.clone().multiplyScalar(y0 / H);
    const p1 = p0.clone().addScaledVector(dir, len);
    b.tube(p0, p1, 0.005, 0.0025, 3, hi ? 2 : 1, cStem0, cStem1, V(0, -0.04, 0));
    branches.push({ p0, p1 });
  }
  // 豆荚
  const nPods = hi ? 30 : 0;
  for (let i = 0; i < nPods; i++) {
    const br = branches[i % branches.length];
    const t = 0.25 + rnd() * 0.7;
    const p = br.p0.clone().lerp(br.p1, t);
    const a = rnd() * Math.PI * 2;
    const dir = V(Math.cos(a) * 0.6, -0.6 - rnd() * 0.4, Math.sin(a) * 0.6).normalize();
    const len = 0.045 + rnd() * 0.015;
    const cr = new THREE.Vector3().crossVectors(dir, UP).normalize();
    const cr2 = new THREE.Vector3().crossVectors(dir, cr).normalize();
    const col = cPod0.clone().lerp(cPod1, rnd());
    for (const c of [cr, cr2]) {
      b.ribbon([p, p.clone().addScaledVector(dir, len * 0.5), p.clone().addScaledVector(dir, len)], [c, c, c], [0.003, 0.0085, 0.002], [col, col, col]);
    }
  }
  // 叶片（三出复叶）
  const nl = hi ? 9 : 4;
  for (let i = 0; i < nl; i++) {
    const br = branches[i % branches.length];
    const p = br.p1.clone().lerp(br.p0, rnd() * 0.3);
    const yaw = rnd() * Math.PI * 2;
    const col = cLeaf0.clone().lerp(cLeaf1, rnd());
    const leaflets = hi ? 3 : 1;
    for (let k = 0; k < leaflets; k++) {
      const a = yaw + (k - 1) * 0.9;
      const dir = V(Math.cos(a), 0, Math.sin(a));
      addLeaf(b, p, dir, 0.09 + rnd() * 0.03, 0.03, 0.3 + rnd() * 0.3, 0.9 + rnd() * 0.8, hi ? 2 : 1, col, C(0.5, 0.4, 0.2), 0, 0.3, 0.4);
    }
  }
  if (!hi) {
    // 远景：交叉卡片模拟茂密株丛
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + 0.3;
      const cr = V(Math.cos(a), 0, Math.sin(a));
      b.ribbon([V(0, 0.05, 0), V(0, 0.4, 0), V(0, 0.68, 0)], [cr, cr, cr], [0.08, 0.17, 0.1], [C(0.32, 0.24, 0.14), C(0.42, 0.32, 0.18), C(0.5, 0.4, 0.17)]);
    }
  }
  return b.build(0.65);
}

// ---------------------------------------------------------------------------
// 作物田：实例化分块 + LOD + 收割状态
// ---------------------------------------------------------------------------
const CROP_DEF = {
  corn: {
    rowSpacing: 0.76, plantSpacing: 0.34, rowJitter: 0.04, plantJitter: 0.08,
    scale: [0.88, 1.12], plantH: 2.4, sway: 0.18, stubble: 0.32,
    yieldKgM2: 1.1, soil: '#56452f', straw: 'rgba(160,138,96,0.85)', strawSize: 1.7,
    tint: [0.85, 1.1], color: '#e6c34a',
  },
  wheat: {
    rowSpacing: 0.36, plantSpacing: 0.36, rowJitter: 0.1, plantJitter: 0.1,
    scale: [0.85, 1.12], plantH: 1.0, sway: 0.13, stubble: 0.14,
    yieldKgM2: 0.75, soil: '#8a703c', straw: 'rgba(214,190,128,0.9)', strawSize: 1.9,
    tint: [0.88, 1.08], color: '#d9b45a',
  },
  soy: {
    rowSpacing: 0.76, plantSpacing: 0.22, rowJitter: 0.05, plantJitter: 0.06,
    scale: [0.85, 1.15], plantH: 0.75, sway: 0.05, stubble: 0.1,
    yieldKgM2: 0.38, soil: '#5f4c34', straw: 'rgba(150,126,92,0.85)', strawSize: 1.8,
    tint: [0.85, 1.1], color: '#b89a5c',
  },
};

export const CROP_INFO = {
  corn: { name: '玉米', color: '#e8c547' },
  wheat: { name: '小麦', color: '#e0bb6a' },
  soy: { name: '大豆', color: '#b49660' },
};

const geoCache = {};
function getGeos(crop) {
  if (!geoCache[crop]) {
    const fn = crop === 'corn' ? makeCornGeometry : crop === 'wheat' ? makeWheatGeometry : makeSoyGeometry;
    geoCache[crop] = { hi: fn(true, 7), lo: fn(false, 7) };
  }
  return geoCache[crop];
}

export class CropField {
  constructor(def, scene, detailTex, chunkSize = 12) {
    this.def = def;
    this.crop = def.crop;
    this.cfg = CROP_DEF[def.crop];
    this.scene = scene;
    this.chunkSize = chunkSize;
    this.group = new THREE.Group();
    this.group.name = 'field_' + def.id;
    scene.add(this.group);

    const cfg = this.cfg;
    const geos = getGeos(def.crop);
    this.material = patchPlantMaterial(new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 0.92, metalness: 0, envMapIntensity: 0.6,
    }), { plantH: cfg.plantH, sway: cfg.sway, stubble: cfg.stubble });
    // 去掉背面法线翻转，叶片双面受光一致
    const prevCompile = this.material.onBeforeCompile;
    this.material.onBeforeCompile = (shader, r) => {
      prevCompile(shader, r);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(vNormal);`);
    };
    this.depthMaterial = makePlantDepthMaterial({ plantH: cfg.plantH, sway: cfg.sway, stubble: cfg.stubble });

    // ---- 生成植株位置 ----
    const rnd = mulberry32(def.id.length * 977 + 13);
    const w = def.maxX - def.minX, h = def.maxZ - def.minZ;
    const rows = Math.floor(w / cfg.rowSpacing);
    const perRow = Math.floor(h / cfg.plantSpacing);
    const total = rows * perRow;
    this.total = total;
    this.px = new Float32Array(total);
    this.pz = new Float32Array(total);
    this.cut = new Uint8Array(total);
    this.cutCount = 0;
    this.kgPerPlant = cfg.yieldKgM2 * cfg.rowSpacing * cfg.plantSpacing;

    const cx = Math.ceil(w / chunkSize), cz = Math.ceil(h / chunkSize);
    this.cx = cx; this.cz = cz;
    const chunkLists = Array.from({ length: cx * cz }, () => []);
    let k = 0;
    const x0 = def.minX + (w - (rows - 1) * cfg.rowSpacing) / 2;
    const z0 = def.minZ + (h - (perRow - 1) * cfg.plantSpacing) / 2;
    for (let r = 0; r < rows; r++) {
      for (let p = 0; p < perRow; p++) {
        const x = x0 + r * cfg.rowSpacing + (rnd() - 0.5) * 2 * cfg.rowJitter;
        const z = z0 + p * cfg.plantSpacing + (rnd() - 0.5) * 2 * cfg.plantJitter;
        // 偶尔缺苗，让田地更自然
        if (rnd() < 0.015) { this.px[k] = x; this.pz[k] = z; this.cut[k] = 2; k++; continue; }
        this.px[k] = x; this.pz[k] = z;
        const ci = Math.min(cx - 1, Math.floor((x - def.minX) / chunkSize));
        const cj = Math.min(cz - 1, Math.floor((z - def.minZ) / chunkSize));
        chunkLists[cj * cx + ci].push(k);
        k++;
      }
    }

    // ---- 构建分块实例网格 ----
    this.chunks = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3();
    const col = new THREE.Color();
    for (let j = 0; j < cz; j++) {
      for (let i = 0; i < cx; i++) {
        const list = chunkLists[j * cx + i];
        if (!list.length) continue;
        const n = list.length;
        const matAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16);
        const colAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
        const cutAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
        cutAttr.setUsage(THREE.DynamicDrawUsage);
        const localIndex = new Map();
        for (let a = 0; a < n; a++) {
          const id = list[a];
          localIndex.set(id, a);
          const x = this.px[id], z = this.pz[id];
          const sc = cfg.scale[0] + rnd() * (cfg.scale[1] - cfg.scale[0]);
          e.set((rnd() - 0.5) * 0.09, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.09, 'YXZ');
          q.setFromEuler(e);
          s.set(sc * (0.9 + rnd() * 0.2), sc, sc * (0.9 + rnd() * 0.2));
          t.set(x, heightAt(x, z) - 0.02, z);
          m4.compose(t, q, s);
          m4.toArray(matAttr.array, a * 16);
          const tint = cfg.tint[0] + rnd() * (cfg.tint[1] - cfg.tint[0]);
          col.setRGB(tint * (0.96 + rnd() * 0.08), tint, tint * (0.92 + rnd() * 0.1));
          col.toArray(colAttr.array, a * 3);
        }
        const mk = (base) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', base.attributes.position);
          g.setAttribute('normal', base.attributes.normal);
          g.setAttribute('color', base.attributes.color);
          g.setIndex(base.index);
          g.setAttribute('aCut', cutAttr);
          g.boundingBox = base.boundingBox;
          g.boundingSphere = base.boundingSphere;
          const mesh = new THREE.InstancedMesh(g, this.material, n);
          mesh.instanceMatrix = matAttr;
          mesh.instanceColor = colAttr;
          mesh.customDepthMaterial = this.depthMaterial;
          mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          mesh.matrixAutoUpdate = false;
          this.group.add(mesh);
          return mesh;
        };
        const hiMesh = mk(geos.hi);
        const loMesh = mk(geos.lo);
        hiMesh.castShadow = true;
        loMesh.castShadow = false;
        hiMesh.visible = false;
        this.chunks.push({
          list: Int32Array.from(list), localIndex, cutAttr, hiMesh, loMesh,
          minX: def.minX + i * chunkSize, maxX: def.minX + (i + 1) * chunkSize,
          minZ: def.minZ + j * chunkSize, maxZ: def.minZ + (j + 1) * chunkSize,
          cxw: def.minX + (i + 0.5) * chunkSize, czw: def.minZ + (j + 0.5) * chunkSize,
          dirty: false,
        });
      }
    }
    this.chunkGrid = new Array(cx * cz).fill(null);
    for (const ch of this.chunks) {
      const i = Math.floor((ch.cxw - def.minX) / chunkSize), j = Math.floor((ch.czw - def.minZ) / chunkSize);
      this.chunkGrid[j * cx + i] = ch;
    }
    // 统计真实株数（去掉缺苗）
    let missing = 0;
    for (let a = 0; a < total; a++) if (this.cut[a] === 2) missing++;
    this.alive = total - missing;

    this.buildGround(detailTex);
  }

  buildGround(detailTex) {
    const def = this.def, cfg = this.cfg;
    const w = def.maxX - def.minX, h = def.maxZ - def.minZ;
    this.ppm = 3;
    this.canvas = makeFieldCanvas(w, h, this.ppm, cfg.soil, true, def.id.length);
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const margin = 0.6;
    const geo = new THREE.PlaneGeometry(w + margin * 2, h + margin * 2, Math.ceil(w / 1.5), Math.ceil(h / 1.5));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const cxm = (def.minX + def.maxX) / 2, czm = (def.minZ + def.maxZ) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cxm, z = pos.getZ(i) + czm;
      pos.setXYZ(i, x, heightAt(x, z) + 0.035, z);
      uv.setXY(i, (x - def.minX) / w, 1 - (z - def.minZ) / h);
    }
    geo.computeVertexNormals();
    const mat = addWorldDetail(new THREE.MeshStandardMaterial({
      map: this.tex, roughness: 0.97, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), detailTex, 0.35, 0.9);
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    this.texDirty = false;
  }

  updateLOD(camPos, hiDist, shadowCenter, shadowRadius) {
    const hd2 = hiDist * hiDist;
    for (const ch of this.chunks) {
      const dx = camPos.x - ch.cxw, dz = camPos.z - ch.czw;
      const d2 = dx * dx + dz * dz;
      const hi = d2 < hd2;
      ch.hiMesh.visible = hi;
      ch.loMesh.visible = !hi;
      if (hi && shadowCenter) {
        const sx = shadowCenter.x - ch.cxw, sz = shadowCenter.z - ch.czw;
        ch.hiMesh.castShadow = sx * sx + sz * sz < shadowRadius * shadowRadius;
      }
    }
  }

  /**
   * 收割：frame = {ox, oz, fx, fz, lx, lz}（原点、前向、左向），
   * 割台在本地 z ∈ [zMin, zMax]、|x| ≤ halfW 的范围内的植株被割倒
   * 返回割倒株数
   */
  harvest(frame, halfW, zMin, zMax) {
    const def = this.def;
    // 包围盒
    const corners = [[-halfW, zMin], [halfW, zMin], [-halfW, zMax], [halfW, zMax]];
    let ax0 = Infinity, ax1 = -Infinity, az0 = Infinity, az1 = -Infinity;
    for (const [lx, lz] of corners) {
      const x = frame.ox + frame.lx * lx + frame.fx * lz;
      const z = frame.oz + frame.lz * lx + frame.fz * lz;
      ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); az0 = Math.min(az0, z); az1 = Math.max(az1, z);
    }
    if (ax1 < def.minX || ax0 > def.maxX || az1 < def.minZ || az0 > def.maxZ) return 0;
    const cs = this.chunkSize;
    const i0 = Math.max(0, Math.floor((ax0 - def.minX) / cs)), i1 = Math.min(this.cx - 1, Math.floor((ax1 - def.minX) / cs));
    const j0 = Math.max(0, Math.floor((az0 - def.minZ) / cs)), j1 = Math.min(this.cz - 1, Math.floor((az1 - def.minZ) / cs));
    let count = 0;
    const ctx = this.ctx, ppm = this.ppm;
    const sz = this.cfg.strawSize * Math.max(this.cfg.rowSpacing, this.cfg.plantSpacing) * ppm;
    ctx.fillStyle = this.cfg.straw;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const ch = this.chunkGrid[j * this.cx + i];
        if (!ch) continue;
        const list = ch.list;
        for (let a = 0; a < list.length; a++) {
          const id = list[a];
          if (this.cut[id]) continue;
          const dx = this.px[id] - frame.ox, dz = this.pz[id] - frame.oz;
          const lz = dx * frame.fx + dz * frame.fz;
          if (lz < zMin || lz > zMax) continue;
          const lx = dx * frame.lx + dz * frame.lz;
          if (lx < -halfW || lx > halfW) continue;
          this.cut[id] = 1;
          ch.cutAttr.array[a] = 1;
          ch.dirty = true;
          count++;
          const u = (this.px[id] - def.minX) * ppm, v = (this.pz[id] - def.minZ) * ppm;
          ctx.fillRect(u - sz / 2, v - sz / 2, sz, sz);
        }
      }
    }
    if (count) {
      this.cutCount += count;
      this.texDirty = true;
      for (const ch of this.chunks) if (ch.dirty) { ch.cutAttr.needsUpdate = true; ch.dirty = false; }
    }
    return count;
  }

  // 某点附近（半径 r）是否有未收割的作物
  standingAt(x, z, r = 0.8) {
    const def = this.def;
    if (x < def.minX - r || x > def.maxX + r || z < def.minZ - r || z > def.maxZ + r) return false;
    const cs = this.chunkSize;
    const i0 = Math.max(0, Math.floor((x - r - def.minX) / cs)), i1 = Math.min(this.cx - 1, Math.floor((x + r - def.minX) / cs));
    const j0 = Math.max(0, Math.floor((z - r - def.minZ) / cs)), j1 = Math.min(this.cz - 1, Math.floor((z + r - def.minZ) / cs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const ch = this.chunkGrid[j * this.cx + i];
      if (!ch) continue;
      for (const id of ch.list) {
        if (this.cut[id]) continue;
        const dx = this.px[id] - x, dz = this.pz[id] - z;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }

  flushTexture() {
    if (this.texDirty) { this.tex.needsUpdate = true; this.texDirty = false; }
  }

  get progress() { return this.cutCount / this.alive; }

  // 某条作业带（x 中心，半宽）的收割完成比例
  laneProgress(xc, halfW) {
    let tot = 0, done = 0;
    for (let a = 0; a < this.total; a++) {
      if (this.cut[a] === 2) continue;
      if (Math.abs(this.px[a] - xc) <= halfW) { tot++; if (this.cut[a]) done++; }
    }
    return tot ? done / tot : 1;
  }

  reset() {
    for (let a = 0; a < this.total; a++) if (this.cut[a] === 1) this.cut[a] = 0;
    for (const ch of this.chunks) { ch.cutAttr.array.fill(0); ch.cutAttr.needsUpdate = true; }
    this.cutCount = 0;
    const c2 = makeFieldCanvas(this.canvas.width / this.ppm, this.canvas.height / this.ppm, this.ppm, this.cfg.soil, true, this.def.id.length);
    this.ctx.drawImage(c2, 0, 0);
    this.tex.needsUpdate = true;
  }
}
