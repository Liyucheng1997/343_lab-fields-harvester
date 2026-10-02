import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, FARM, ROAD, FIELDS } from './layout.js';
import { mulberry32, createNoise2D } from './noise.js';
import { addDust } from './shaders.js';
import {
  makeClapboardTexture, makeShingleTexture, makeBrickTexture, makeBarnTexture,
  makeCorrugatedTexture, makeGrainTexture,
} from './textures.js';

function mk(geo, mat, x = 0, y = 0, z = 0, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const box = (w, h, d, mat, x, y, z, p, s) => mk(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p, s);

// 人字形屋顶棱柱
function gableGeometry(w, d, h, overhang = 0.4) {
  const W = w / 2 + overhang, D = d / 2 + overhang;
  const shape = new THREE.Shape();
  shape.moveTo(-W, 0); shape.lineTo(0, h); shape.lineTo(W, 0); shape.lineTo(W - 0.12, -0.04); shape.lineTo(0, h - 0.18); shape.lineTo(-W + 0.12, -0.04); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: D * 2, bevelEnabled: false });
  g.translate(0, 0, -D);
  return g;
}
// 山墙三角
function gableEndGeometry(w, h) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  // 让 UV 与墙面比例一致
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 3.2);
  return g;
}

function makeWindow(mats, w, h, parent, x, y, z, rotY = 0, shutters = true) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  box(w + 0.2, h + 0.2, 0.08, mats.trim, 0, 0, 0.02, g);
  const glass = mk(new THREE.PlaneGeometry(w, h), mats.windowGlass, 0, 0, 0.065, g, false);
  // 窗格
  box(0.04, h, 0.03, mats.trim, 0, 0, 0.08, g, false);
  box(w, 0.04, 0.03, mats.trim, 0, 0, 0.08, g, false);
  box(w + 0.32, 0.07, 0.14, mats.trim, 0, -h / 2 - 0.12, 0.06, g);
  if (shutters) {
    for (const s of [-1, 1]) {
      const sh = box(w * 0.45, h + 0.1, 0.04, mats.shutter, s * (w / 2 + w * 0.26), 0, 0.03, g);
      for (let i = 0; i < 6; i++) box(w * 0.4, 0.02, 0.02, mats.shutterDark, 0, -h / 2 + 0.1 + i * (h / 6), 0.025, sh, false);
    }
  }
  void glass;
  return g;
}

// ---------------------------------------------------------------------------
// 农舍（两层白色护墙板，环绕门廊）
// ---------------------------------------------------------------------------
function buildHouse(mats) {
  const g = new THREE.Group();
  const W = 10, D = 8, H1 = 3.0, H2 = 2.8;
  const wallH = H1 + H2;
  const clap = mats.clap;
  // 基础
  box(W + 0.3, 0.6, D + 0.3, mats.stone, 0, 0.3, 0, g);
  // 墙体
  const walls = box(W, wallH, D, clap, 0, 0.6 + wallH / 2, 0, g);
  void walls;
  // 层间腰线
  box(W + 0.06, 0.14, D + 0.06, mats.trim, 0, 0.6 + H1, 0, g);
  // 墙角板
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.16, wallH, 0.16, mats.trim, sx * W / 2, 0.6 + wallH / 2, sz * D / 2, g);
  // 屋顶
  const roofH = 3.0;
  const roof = mk(gableGeometry(W, D, roofH, 0.45), mats.shingle, 0, 0.6 + wallH, 0, g);
  roof.rotation.y = Math.PI / 2;
  // 让屋脊沿 x 方向：旋转后宽度对应 D
  roof.geometry = gableGeometry(D, W, roofH, 0.45);
  // 山墙
  for (const s of [-1, 1]) {
    const ge = mk(gableEndGeometry(D, roofH), clap, s * W / 2, 0.6 + wallH, 0, g);
    ge.rotation.y = s * Math.PI / 2;
    // 山墙小窗
    makeWindow(mats, 0.7, 0.9, g, s * (W / 2 + 0.01), 0.6 + wallH + 1.0, 0, s * Math.PI / 2, false);
  }
  // 屋脊
  box(W + 0.95, 0.12, 0.2, mats.shingleDark, 0, 0.6 + wallH + roofH - 0.05, 0, g);
  // 烟囱
  box(0.9, 4.6, 0.9, mats.brick, 2.6, 0.6 + wallH + 1.3, -1.5, g);
  box(1.05, 0.15, 1.05, mats.stone, 2.6, 0.6 + wallH + 3.65, -1.5, g);
  // 窗户（正面 +z）
  for (const x of [-3.2, 3.2]) {
    makeWindow(mats, 0.95, 1.5, g, x, 0.6 + 1.6, D / 2 + 0.01);
    makeWindow(mats, 0.95, 1.4, g, x, 0.6 + H1 + 1.4, D / 2 + 0.01);
  }
  makeWindow(mats, 0.95, 1.4, g, 0, 0.6 + H1 + 1.4, D / 2 + 0.01);
  // 背面与侧面
  for (const x of [-3, 0.5, 3.4]) {
    makeWindow(mats, 0.95, 1.5, g, x, 0.6 + 1.6, -D / 2 - 0.01, Math.PI);
    makeWindow(mats, 0.95, 1.4, g, x, 0.6 + H1 + 1.4, -D / 2 - 0.01, Math.PI);
  }
  for (const s of [-1, 1]) for (const z of [-2, 2]) {
    makeWindow(mats, 0.95, 1.5, g, s * (W / 2 + 0.01), 0.6 + 1.6, z, s * Math.PI / 2);
    makeWindow(mats, 0.95, 1.4, g, s * (W / 2 + 0.01), 0.6 + H1 + 1.4, z, s * Math.PI / 2);
  }
  // 前门（纱门）
  box(1.15, 2.25, 0.1, mats.trim, 0, 0.6 + 1.13, D / 2 + 0.02, g);
  box(0.95, 2.1, 0.06, mats.door, 0, 0.6 + 1.08, D / 2 + 0.06, g);
  mk(new THREE.PlaneGeometry(0.7, 0.9), mats.windowGlass, 0, 0.6 + 1.5, D / 2 + 0.1, g, false);
  mk(new THREE.SphereGeometry(0.04, 8, 6), mats.brass, 0.35, 0.6 + 1.05, D / 2 + 0.12, g, false);

  // ---- 门廊 ----
  const PD = 2.6;
  const porch = new THREE.Group();
  porch.position.set(0, 0, D / 2);
  g.add(porch);
  box(W + 1.2, 0.18, PD, mats.porchFloor, 0, 0.62, PD / 2, porch);
  box(W + 1.2, 0.5, 0.1, mats.trim, 0, 0.35, PD, porch);
  // 台阶
  for (let i = 0; i < 3; i++) box(2.2, 0.2, 0.32, mats.porchFloor, 0, 0.1 + i * 0.2, PD + 0.85 - i * 0.3, porch);
  // 立柱
  const colGeo = new THREE.CylinderGeometry(0.1, 0.12, 2.6, 12);
  for (const x of [-5.4, -3.4, -1.3, 1.3, 3.4, 5.4]) {
    mk(colGeo, mats.trim, x, 0.71 + 1.3, PD - 0.18, porch);
    box(0.3, 0.12, 0.3, mats.trim, x, 0.75, PD - 0.18, porch);
    box(0.3, 0.12, 0.3, mats.trim, x, 3.3, PD - 0.18, porch);
  }
  // 门廊屋顶（单坡）
  const pr = box(W + 1.6, 0.14, PD + 0.6, mats.shingle, 0, 3.55, PD / 2 + 0.05, porch);
  pr.rotation.x = 0.16;
  box(W + 1.5, 0.3, 0.12, mats.trim, 0, 3.32, PD - 0.15, porch);
  // 栏杆
  const balGeo = new THREE.BoxGeometry(0.045, 0.75, 0.045);
  const bals = [];
  const m4 = new THREE.Matrix4();
  for (let x = -5.3; x <= 5.3; x += 0.14) {
    if (Math.abs(x) < 1.3) continue;
    bals.push(balGeo.clone().applyMatrix4(m4.makeTranslation(x, 0.71 + 0.4, PD - 0.18)));
  }
  for (const s of [-1, 1]) for (let z = 0.2; z < PD - 0.2; z += 0.14) bals.push(balGeo.clone().applyMatrix4(m4.makeTranslation(s * 5.4, 0.71 + 0.4, z)));
  mk(mergeGeometries(bals), mats.trim, 0, 0, 0, porch);
  for (const s of [-1, 1]) {
    box(4.1, 0.08, 0.12, mats.trim, s * 3.35, 1.55, PD - 0.18, porch);
    box(0.12, 0.08, PD, mats.trim, s * 5.4, 1.55, PD / 2, porch);
  }
  // 门廊家具：两把椅子与小桌
  for (const x of [-2.6, -1.8]) {
    const ch = new THREE.Group();
    ch.position.set(x, 0.71, 1.2);
    ch.rotation.y = 0.3 + x * 0.1;
    porch.add(ch);
    box(0.55, 0.06, 0.5, mats.wood, 0, 0.45, 0, ch);
    box(0.55, 0.6, 0.06, mats.wood, 0, 0.75, -0.25, ch);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, 0.45, 0.05, mats.wood, sx * 0.24, 0.22, sz * 0.22, ch);
  }
  box(0.5, 0.05, 0.5, mats.wood, -2.2, 0.71 + 0.55, 1.9, porch);
  box(0.08, 0.55, 0.08, mats.wood, -2.2, 0.71 + 0.27, 1.9, porch);
  // 门廊灯
  const lamp = mk(new THREE.SphereGeometry(0.12, 12, 8), mats.porchLamp, 0.9, 2.7, 0.15, porch, false);
  void lamp;
  // 屋檐排水沟
  for (const s of [-1, 1]) box(W + 1, 0.1, 0.12, mats.trim, 0, 0.6 + wallH - 0.05, s * (D / 2 + 0.5), g);
  return g;
}

// ---------------------------------------------------------------------------
// 谷仓（复折式屋顶）
// ---------------------------------------------------------------------------
function buildBarn(mats) {
  const g = new THREE.Group();
  const W = 14, D = 22, H = 5;
  box(W + 0.2, 0.4, D + 0.2, mats.stone, 0, 0.2, 0, g);
  box(W, H, D, mats.barn, 0, 0.4 + H / 2, 0, g);
  // 复折式屋顶截面
  const roofShape = new THREE.Shape();
  const hw = W / 2 + 0.4;
  roofShape.moveTo(-hw, 0);
  roofShape.lineTo(-hw * 0.62, 3.0);
  roofShape.lineTo(0, 4.6);
  roofShape.lineTo(hw * 0.62, 3.0);
  roofShape.lineTo(hw, 0);
  roofShape.lineTo(hw - 0.2, 0);
  roofShape.lineTo(hw * 0.62 - 0.15, 2.85);
  roofShape.lineTo(0, 4.4);
  roofShape.lineTo(-hw * 0.62 + 0.15, 2.85);
  roofShape.lineTo(-hw + 0.2, 0);
  roofShape.closePath();
  const rg = new THREE.ExtrudeGeometry(roofShape, { depth: D + 0.8, bevelEnabled: false });
  rg.translate(0, 0, -(D + 0.8) / 2);
  mk(rg, mats.metalRoof, 0, 0.4 + H, 0, g);
  // 山墙封板
  const endShape = new THREE.Shape();
  endShape.moveTo(-W / 2, 0); endShape.lineTo(-W / 2 * 0.62, 3.0); endShape.lineTo(0, 4.5); endShape.lineTo(W / 2 * 0.62, 3.0); endShape.lineTo(W / 2, 0); endShape.closePath();
  const eg = new THREE.ShapeGeometry(endShape);
  const uv = eg.attributes.uv, ps = eg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) / W + 0.5, ps.getY(i) / H);
  for (const s of [-1, 1]) {
    const e = mk(eg, mats.barn, 0, 0.4 + H, s * D / 2, g);
    if (s < 0) e.rotation.y = Math.PI;
    // 大门（带 X 形撑）
    const door = new THREE.Group();
    door.position.set(0, 0.4, s * (D / 2 + 0.06));
    if (s < 0) door.rotation.y = Math.PI;
    g.add(door);
    for (const dx of [-1.9, 1.9]) {
      box(3.6, 4.2, 0.1, mats.barnDoor, dx, 2.1, 0, door);
      box(3.6, 0.18, 0.08, mats.trim, dx, 0.1, 0.07, door);
      box(3.6, 0.18, 0.08, mats.trim, dx, 4.1, 0.07, door);
      box(0.18, 4.2, 0.08, mats.trim, dx - 1.7, 2.1, 0.07, door);
      box(0.18, 4.2, 0.08, mats.trim, dx + 1.7, 2.1, 0.07, door);
      const diag = Math.hypot(3.4, 4.0);
      const a = Math.atan2(4.0, 3.4);
      for (const sgn of [-1, 1]) {
        const b = box(diag, 0.16, 0.06, mats.trim, dx, 2.1, 0.1, door);
        b.rotation.z = sgn * a;
      }
    }
    // 滑轨
    box(8.5, 0.12, 0.12, mats.dark, 0, 4.5, 0.1, door);
    // 草料阁楼门
    box(2.0, 1.8, 0.08, mats.barnDoor, 0, 6.6, 0.0, door);
    box(2.2, 0.12, 0.1, mats.trim, 0, 7.55, 0.05, door);
    box(2.2, 0.12, 0.1, mats.trim, 0, 5.65, 0.05, door);
    box(0.4, 0.3, 1.0, mats.dark, 0, 8.4, 0.5, door);
  }
  // 屋顶通风帽
  for (const z of [-6, 0, 6]) {
    box(1.0, 0.9, 1.0, mats.metalRoof, 0, 0.4 + H + 4.8, z, g);
    const cap = mk(new THREE.ConeGeometry(0.85, 0.6, 4), mats.metalRoof, 0, 0.4 + H + 5.55, z, g);
    cap.rotation.y = Math.PI / 4;
  }
  // 侧窗
  for (const s of [-1, 1]) for (const z of [-7, 0, 7]) {
    box(0.08, 1.0, 1.2, mats.trim, s * (W / 2 + 0.03), 3.2, z, g);
    mk(new THREE.PlaneGeometry(1.0, 0.8), mats.windowGlass, s * (W / 2 + 0.08), 3.2, z, g, false).rotation.y = s * Math.PI / 2;
  }
  return g;
}

// ---------------------------------------------------------------------------
// 镀锌钢粮仓
// ---------------------------------------------------------------------------
function buildBin(mats, r = 4, h = 8) {
  const g = new THREE.Group();
  mk(new THREE.CylinderGeometry(r + 0.3, r + 0.4, 0.4, 32), mats.stone, 0, 0.2, 0, g);
  mk(new THREE.CylinderGeometry(r, r, h, 48, 1, true), mats.corrugated, 0, 0.4 + h / 2, 0, g);
  const roof = mk(new THREE.ConeGeometry(r + 0.25, r * 0.55, 48, 1, true), mats.binRoof, 0, 0.4 + h + r * 0.275, 0, g);
  void roof;
  mk(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 16), mats.binRoof, 0, 0.4 + h + r * 0.55 + 0.1, 0, g);
  mk(new THREE.ConeGeometry(0.7, 0.4, 16), mats.binRoof, 0, 0.4 + h + r * 0.55 + 0.55, 0, g);
  // 爬梯 + 护笼
  const lad = new THREE.Group();
  lad.position.set(0, 0, r + 0.15);
  g.add(lad);
  for (const s of [-1, 1]) box(0.05, h + 0.8, 0.05, mats.steelM, s * 0.22, 0.4 + (h + 0.8) / 2, 0, lad);
  for (let y = 1; y < h + 1; y += 0.32) box(0.44, 0.03, 0.03, mats.steelM, 0, y, 0, lad, false);
  for (let y = 3; y < h + 1; y += 0.9) {
    const ring = mk(new THREE.TorusGeometry(0.38, 0.02, 4, 16, Math.PI), mats.steelM, 0, y, 0.0, lad, false);
    ring.rotation.x = Math.PI / 2;
  }
  // 检修门
  box(1.0, 1.2, 0.1, mats.steelM, 0.0, 1.2, -r - 0.02, g).rotation.y = 0;
  // 通风机
  const fan = mk(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 20), mats.steelM, r + 0.6, 1.0, 0, g);
  fan.rotation.z = Math.PI / 2;
  return g;
}

// ---------------------------------------------------------------------------
// 皮卡（七十年代风格）
// ---------------------------------------------------------------------------
function buildPickup(mats) {
  const g = new THREE.Group();
  const paint = mats.truckPaint;
  const rb = (w, h, d, r, mat, x, y, z) => mk(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z, g);
  rb(1.95, 0.55, 5.2, 0.08, paint, 0, 0.82, 0);
  // 发动机盖
  rb(1.85, 0.32, 1.7, 0.08, paint, 0, 1.18, 1.65);
  // 驾驶室
  rb(1.85, 0.8, 1.55, 0.12, paint, 0, 1.45, 0.2);
  // 车窗
  const glass = mats.windowGlass;
  const ws = mk(new THREE.PlaneGeometry(1.6, 0.55), glass, 0, 1.55, 0.99, g, false);
  ws.rotation.x = -0.35;
  for (const s of [-1, 1]) {
    const sw = mk(new THREE.PlaneGeometry(1.0, 0.45), glass, s * 0.93, 1.55, 0.2, g, false);
    sw.rotation.y = s * Math.PI / 2;
  }
  mk(new THREE.PlaneGeometry(1.4, 0.4), glass, 0, 1.58, -0.56, g, false).rotation.y = Math.PI;
  // 货厢
  for (const s of [-1, 1]) rb(0.08, 0.5, 2.3, 0.03, paint, s * 0.93, 1.32, -1.45);
  rb(1.95, 0.5, 0.08, 0.03, paint, 0, 1.32, -2.58);
  box(1.8, 0.05, 2.3, mats.dark, 0, 1.1, -1.45, g);
  // 货厢里的旧木箱
  box(0.6, 0.45, 0.5, mats.wood, 0.3, 1.35, -1.8, g);
  // 前格栅与保险杠
  box(1.6, 0.35, 0.05, mats.chrome, 0, 0.95, 2.6, g);
  for (let i = 0; i < 5; i++) box(1.5, 0.025, 0.03, mats.dark, 0, 0.83 + i * 0.06, 2.62, g, false);
  box(2.0, 0.16, 0.14, mats.chrome, 0, 0.62, 2.65, g);
  box(2.0, 0.16, 0.14, mats.chrome, 0, 0.62, -2.65, g);
  for (const s of [-1, 1]) {
    const hl = mk(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 16), mats.headlight, s * 0.68, 0.98, 2.62, g, false);
    hl.rotation.x = Math.PI / 2;
    box(0.12, 0.2, 0.04, mats.tailRed, s * 0.88, 1.25, -2.62, g, false);
    // 后视镜
    box(0.06, 0.15, 0.12, mats.chrome, s * 1.05, 1.55, 0.85, g);
  }
  // 轮胎
  for (const sx of [-1, 1]) for (const z of [1.65, -1.55]) {
    const w = mk(new THREE.CylinderGeometry(0.4, 0.4, 0.28, 20), mats.rubber, sx * 0.88, 0.4, z, g);
    w.rotation.z = Math.PI / 2;
    const hub = mk(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 16), mats.chrome, sx * 0.89, 0.4, z, g, false);
    hub.rotation.z = Math.PI / 2;
    // 轮拱
    box(0.12, 0.12, 1.0, mats.dark, sx * 0.95, 0.88, z, g, false);
  }
  return g;
}

// ---------------------------------------------------------------------------
// 运粮半挂车
// ---------------------------------------------------------------------------
function buildGrainTruck(mats) {
  const g = new THREE.Group();
  const cabPaint = mats.semiPaint;
  const rb = (w, h, d, r, mat, x, y, z, p = g) => mk(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z, p);
  // 牵引车（车头朝 +z）
  const tz = 5.2;
  box(1.0, 0.3, 6.5, mats.dark, 0, 0.85, tz - 0.6, g);
  rb(2.4, 2.0, 2.0, 0.15, cabPaint, 0, 2.15, tz + 0.3);
  rb(2.3, 1.2, 1.9, 0.15, cabPaint, 0, 1.55, tz + 2.1);
  rb(2.35, 0.9, 1.4, 0.12, cabPaint, 0, 2.7, tz - 0.9);
  const ws = mk(new THREE.PlaneGeometry(2.1, 0.85), mats.windowGlass, 0, 2.62, tz + 1.31, g, false);
  ws.rotation.x = -0.15;
  for (const s of [-1, 1]) {
    mk(new THREE.PlaneGeometry(1.0, 0.7), mats.windowGlass, s * 1.21, 2.6, tz + 0.5, g, false).rotation.y = s * Math.PI / 2;
    // 排气烟囱
    mk(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 12), mats.chrome, s * 1.25, 2.9, tz - 0.75, g);
    // 油箱
    const ft = mk(new THREE.CylinderGeometry(0.33, 0.33, 1.3, 20), mats.chrome, s * 1.05, 0.8, tz - 0.2, g);
    ft.rotation.x = Math.PI / 2;
    // 大灯
    box(0.35, 0.2, 0.05, mats.headlight, s * 0.85, 1.55, tz + 3.07, g, false);
    box(0.12, 0.35, 0.3, mats.chrome, s * 1.3, 2.5, tz + 1.3, g);
  }
  box(1.4, 0.9, 0.05, mats.chrome, 0, 1.6, tz + 3.06, g);
  box(2.4, 0.3, 0.25, mats.chrome, 0, 0.75, tz + 3.1, g);
  // 牵引车车轮
  for (const z of [tz + 2.0, tz - 1.4, tz - 2.7]) for (const s of [-1, 1]) {
    const w = mk(new THREE.CylinderGeometry(0.52, 0.52, z > tz ? 0.32 : 0.62, 20), mats.rubber, s * 1.0, 0.52, z, g);
    w.rotation.z = Math.PI / 2;
    const hub = mk(new THREE.CylinderGeometry(0.28, 0.28, z > tz ? 0.34 : 0.64, 14), mats.steelM, s * 1.0, 0.52, z, g, false);
    hub.rotation.z = Math.PI / 2;
  }
  // 挂车（漏斗底粮斗）
  const tr = new THREE.Group();
  tr.position.set(0, 0, -3.2);
  g.add(tr);
  const L = 11, Wd = 2.5, Ht = 1.9;
  // 斗壁
  for (const s of [-1, 1]) box(0.06, Ht, L, mats.alu, s * Wd / 2, 1.5 + Ht / 2, 0, tr);
  for (const s of [-1, 1]) box(Wd, Ht, 0.06, mats.alu, 0, 1.5 + Ht / 2, s * L / 2, tr);
  // 加强立柱
  for (let i = -5; i <= 5; i++) for (const s of [-1, 1]) box(0.05, Ht, 0.08, mats.steelM, s * (Wd / 2 + 0.04), 1.5 + Ht / 2, i, tr, false);
  // 漏斗
  for (const z of [-2.6, 2.6]) {
    const hop = mk(new THREE.CylinderGeometry(1.2, 0.35, 1.1, 4, 1, true), mats.alu, 0, 1.0, z, tr);
    hop.rotation.y = Math.PI / 4;
    hop.scale.set(1.45, 1, 1.9);
  }
  box(Wd, 0.1, L, mats.dark, 0, 1.45, 0, tr);
  // 篷布卷轴
  mk(new THREE.CylinderGeometry(0.08, 0.08, L, 10), mats.tarp, 0, 1.5 + Ht + 0.12, 0, tr).rotation.x = Math.PI / 2;
  box(0.1, 0.5, 0.1, mats.steelM, 0, 1.5 + Ht + 0.1, -L / 2, tr);
  box(0.1, 0.5, 0.1, mats.steelM, 0, 1.5 + Ht + 0.1, L / 2, tr);
  // 挂车车轮
  for (const z of [-4.0, -5.3]) for (const s of [-1, 1]) {
    const w = mk(new THREE.CylinderGeometry(0.52, 0.52, 0.62, 20), mats.rubber, s * 1.0, 0.52, z, tr);
    w.rotation.z = Math.PI / 2;
  }
  box(2.4, 0.15, 0.1, mats.tailRed, 0, 1.3, -L / 2 - 0.05, tr, false);
  // 粮堆
  const heapGeo = new THREE.PlaneGeometry(Wd - 0.1, L - 0.1, 10, 30);
  heapGeo.rotateX(-Math.PI / 2);
  const hp = heapGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i) / ((Wd - 0.1) / 2), z = hp.getZ(i) / ((L - 0.1) / 2);
    const peaks = Math.max(0, 1 - x * x * 0.6 - Math.pow(Math.sin(z * Math.PI * 1.5), 2) * 0.35 - z * z * 0.2);
    hp.setY(i, peaks * 0.5);
  }
  heapGeo.computeVertexNormals();
  const heap = mk(heapGeo, mats.grain, 0, 1.55, 0, tr, false);
  heap.visible = false;
  const api = {
    group: g,
    capacity: 24000,
    load: 0,
    setLoad(kg, crop) {
      this.load = kg;
      const f = Math.min(1, kg / this.capacity);
      heap.visible = f > 0.005;
      heap.position.y = 1.55 + f * Ht * 0.92 - 0.25;
      heap.scale.y = 0.4 + f;
      if (crop) heap.material = mats.grains[crop];
    },
  };
  return api;
}

// ---------------------------------------------------------------------------
// 风车（抽水）
// ---------------------------------------------------------------------------
function buildWindmill(mats) {
  const g = new THREE.Group();
  const H = 12;
  const legs = [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]];
  for (const [x, z] of legs) {
    const leg = mk(new THREE.CylinderGeometry(0.05, 0.07, H + 0.3, 6), mats.steelM, x / 2, H / 2, z / 2, g);
    leg.rotation.z = -x * 0.05; leg.rotation.x = z * 0.05;
  }
  for (let y = 1.5; y < H; y += 2.2) {
    const s = 1.4 * (1 - y / H * 0.75);
    for (let k = 0; k < 4; k++) {
      const b = box(s * 2, 0.04, 0.04, mats.steelM, 0, y, 0, g, false);
      b.rotation.y = (k * Math.PI) / 2;
      b.position.set(Math.sin((k * Math.PI) / 2) * s, y, Math.cos((k * Math.PI) / 2) * s);
    }
  }
  const head = new THREE.Group();
  head.position.set(0, H + 0.4, 0);
  g.add(head);
  box(0.4, 0.4, 0.8, mats.steelM, 0, 0, 0, head);
  // 尾舵
  box(0.04, 1.0, 1.8, mats.steelM, 0, 0.2, -1.5, head);
  box(0.03, 0.03, 1.6, mats.steelM, 0, 0, -0.8, head);
  const wheel = new THREE.Group();
  wheel.position.set(0, 0, 0.5);
  head.add(wheel);
  for (let i = 0; i < 18; i++) {
    const blade = box(0.32, 1.3, 0.02, mats.steelM, 0, 0, 0, wheel, false);
    const a = (i / 18) * Math.PI * 2;
    blade.position.set(Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0);
    blade.rotation.z = -a;
    blade.rotation.y = 0.4;
  }
  const ring = mk(new THREE.TorusGeometry(1.7, 0.03, 4, 32), mats.steelM, 0, 0, 0, wheel, false);
  void ring;
  // 水箱
  mk(new THREE.CylinderGeometry(2.2, 2.2, 0.9, 28), mats.corrugated, 4.0, 0.45, 1.0, g);
  return { group: g, wheel, head };
}

// ---------------------------------------------------------------------------
// 树木（白杨防风林）：枝干 + 叶片卡片簇，全部合并为两个网格
// ---------------------------------------------------------------------------
function makeLeafTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(77);
  for (let i = 0; i < 90; i++) {
    const x = 20 + rnd() * 216, y = 20 + rnd() * 216;
    const r = 9 + rnd() * 12;
    const dx = x - 128, dy = y - 128;
    if (dx * dx + dy * dy > 118 * 118) continue;
    const g = 70 + rnd() * 60, rr = g * (0.75 + rnd() * 0.3), b = g * (0.35 + rnd() * 0.2);
    ctx.fillStyle = `rgb(${rr | 0},${g | 0},${b | 0})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,35,15,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function treeGeometries(rnd, scale, x0, y0, z0, leafGeos, woodGeos) {
  const h = (8 + rnd() * 5) * scale;
  const m4 = new THREE.Matrix4();
  const trunk = new THREE.CylinderGeometry(0.16 * scale, 0.38 * scale, h * 0.62, 9, 3);
  trunk.translate(0, h * 0.31, 0);
  // 树干轻微弯曲
  const tp = trunk.attributes.position;
  const bend = (rnd() - 0.5) * 0.5;
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + Math.pow(tp.getY(i) / h, 2) * bend * scale);
  trunk.applyMatrix4(m4.makeTranslation(x0, y0, z0));
  woodGeos.push(trunk);
  // 主枝
  const crownY = h * 0.62;
  const nb = 4 + Math.floor(rnd() * 3);
  const clusters = [];
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rnd() * 0.6;
    const len = (2.0 + rnd() * 1.6) * scale;
    const y = crownY * (0.65 + rnd() * 0.35);
    const dir = new THREE.Vector3(Math.cos(a) * 0.7, 0.75 + rnd() * 0.4, Math.sin(a) * 0.7).normalize();
    const br = new THREE.CylinderGeometry(0.05 * scale, 0.13 * scale, len, 6);
    br.translate(0, len / 2, 0);
    br.applyMatrix4(m4.makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)));
    br.applyMatrix4(m4.makeTranslation(x0 + bend * scale * 0.4, y0 + y, z0));
    woodGeos.push(br);
    clusters.push(new THREE.Vector3(x0 + dir.x * len, y0 + y + dir.y * len, z0 + dir.z * len));
  }
  clusters.push(new THREE.Vector3(x0 + bend * scale, y0 + h * 0.92, z0));
  clusters.push(new THREE.Vector3(x0, y0 + h * 0.75, z0));
  // 叶片卡片
  const center = new THREE.Vector3(x0, y0 + h * 0.72, z0);
  const quad = new THREE.PlaneGeometry(1, 1);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const cl of clusters) {
    const rad = (1.6 + rnd() * 1.0) * scale;
    const n = 34;
    for (let k = 0; k < n; k++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, rr = Math.cbrt(rnd()) * rad;
      const sxy = Math.sqrt(1 - u * u);
      p.set(cl.x + Math.cos(th) * sxy * rr, cl.y + u * rr * 0.8, cl.z + Math.sin(th) * sxy * rr);
      e.set(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI);
      q.setFromEuler(e);
      const s = (1.1 + rnd() * 0.9) * scale;
      sc.set(s, s, s);
      const g = quad.clone().applyMatrix4(m4.compose(p, q, sc));
      // 法线指向树冠外侧：柔和的体积感光照
      const nrm = g.attributes.normal;
      const pos = g.attributes.position;
      for (let i = 0; i < nrm.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(center).normalize();
        v.y += 0.35;
        v.normalize();
        nrm.setXYZ(i, v.x, v.y, v.z);
      }
      // 顶点色：树冠内部更暗
      const shade = 0.55 + 0.45 * Math.min(1, p.distanceTo(cl) / rad) + (p.y - center.y) / (h * 2);
      const col = new Float32Array(nrm.count * 3).fill(Math.min(1.15, shade));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      leafGeos.push(g);
    }
  }
}

function buildTrees(mats, list) {
  const leafGeos = [], woodGeos = [];
  for (const t of list) treeGeometries(t.rnd, t.scale, t.x, t.y, t.z, leafGeos, woodGeos);
  const group = new THREE.Group();
  const leafTex = makeLeafTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 });
  const leaves = mk(mergeGeometries(leafGeos), leafMat, 0, 0, 0, group);
  leaves.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5 });
  mk(mergeGeometries(woodGeos), mats.bark, 0, 0, 0, group);
  return group;
}

// ---------------------------------------------------------------------------
// 电线杆与电线
// ---------------------------------------------------------------------------
function buildPowerLine(mats, group) {
  const poles = [];
  for (let x = -420; x <= 460; x += 45) poles.push(new THREE.Vector3(x, 0, ROAD.z - 7));
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.17, 9, 8);
  const armGeo = new THREE.BoxGeometry(2.4, 0.12, 0.12);
  const insGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6);
  const poleMeshes = [], armMeshes = [], insMeshes = [];
  const m4 = new THREE.Matrix4();
  const rnd = mulberry32(9);
  for (const p of poles) {
    p.y = heightAt(p.x, p.z);
    const lean = (rnd() - 0.5) * 0.03;
    poleMeshes.push(poleGeo.clone().applyMatrix4(m4.makeRotationZ(lean)).applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, p.y + 4.5, p.z)));
    armMeshes.push(armGeo.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, p.y + 8.4, p.z)));
    for (const dz of [-1.0, 0, 1.0]) insMeshes.push(insGeo.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(p.x, p.y + 8.6, p.z + dz)));
  }
  mk(mergeGeometries(poleMeshes), mats.pole, 0, 0, 0, group);
  mk(mergeGeometries(armMeshes), mats.pole, 0, 0, 0, group);
  mk(mergeGeometries(insMeshes), mats.insulator, 0, 0, 0, group, false);
  // 下垂电线
  const pts = [];
  for (const dz of [-1.0, 0, 1.0]) {
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], b = poles[i + 1];
      const segs = 12;
      for (let s = 0; s < segs; s++) {
        for (const t of [s / segs, (s + 1) / segs]) {
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t + 8.7 - Math.sin(Math.PI * t) * 0.9;
          pts.push(x, y, a.z + dz);
        }
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8 })));
}

// 木栅栏
function buildFence(mats, group, points, spacing = 3) {
  const postGeo = new THREE.BoxGeometry(0.12, 1.3, 0.12);
  const geos = [];
  const railGeos = [];
  const rnd = mulberry32(17);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(L / spacing));
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = heightAt(x, z);
      const m = new THREE.Matrix4().makeRotationZ((rnd() - 0.5) * 0.08).premultiply(new THREE.Matrix4().makeTranslation(x, y + 0.6, z));
      geos.push(postGeo.clone().applyMatrix4(m));
      if (k < n) {
        const x2 = a.x + (b.x - a.x) * ((k + 0.5) / n), z2 = a.z + (b.z - a.z) * ((k + 0.5) / n);
        const y2 = heightAt(x2, z2);
        for (const hy of [0.55, 1.05]) {
          const rg = new THREE.BoxGeometry(0.05, 0.1, L / n + 0.1);
          rg.applyMatrix4(new THREE.Matrix4().makeRotationY(ang));
          rg.applyMatrix4(new THREE.Matrix4().makeTranslation(x2, y2 + hy, z2));
          railGeos.push(rg);
        }
      }
    }
  }
  mk(mergeGeometries(geos), mats.fenceWood, 0, 0, 0, group);
  mk(mergeGeometries(railGeos), mats.fenceWood, 0, 0, 0, group);
}

// ---------------------------------------------------------------------------
export function buildFarm(scene, envTex) {
  const group = new THREE.Group();
  group.name = 'farm';
  const clapTex = makeClapboardTexture();
  clapTex.repeat.set(2, 1.6);
  const shingleTex = makeShingleTexture();
  shingleTex.repeat.set(0.35, 0.35);
  const brickTex = makeBrickTexture();
  brickTex.repeat.set(1, 4);
  const barnTex = makeBarnTexture();
  barnTex.repeat.set(4, 1);
  const corrTex = makeCorrugatedTexture();
  corrTex.repeat.set(6, 2);
  const roofTex = makeCorrugatedTexture();
  roofTex.repeat.set(0.4, 3);
  roofTex.rotation = Math.PI / 2;

  const mats = {
    clap: new THREE.MeshStandardMaterial({ map: clapTex, roughness: 0.85 }),
    trim: new THREE.MeshStandardMaterial({ color: '#efede6', roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ color: '#7d766b', roughness: 0.95 }),
    shingle: new THREE.MeshStandardMaterial({ map: shingleTex, roughness: 0.92 }),
    shingleDark: new THREE.MeshStandardMaterial({ color: '#2c2b2a', roughness: 0.9 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 }),
    windowGlass: new THREE.MeshPhysicalMaterial({ color: '#1b2226', roughness: 0.08, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.5 }),
    shutter: new THREE.MeshStandardMaterial({ color: '#3c4a46', roughness: 0.8 }),
    shutterDark: new THREE.MeshStandardMaterial({ color: '#2a3431', roughness: 0.8 }),
    door: new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c8a050', metalness: 1, roughness: 0.3 }),
    porchFloor: new THREE.MeshStandardMaterial({ color: '#8c8478', roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#7a6248', roughness: 0.85 }),
    porchLamp: new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffcf80', emissiveIntensity: 0.2 }),
    barn: new THREE.MeshStandardMaterial({ map: barnTex, roughness: 0.92 }),
    barnDoor: new THREE.MeshStandardMaterial({ map: barnTex, roughness: 0.92, color: '#d8d0c8' }),
    metalRoof: new THREE.MeshStandardMaterial({ map: roofTex, color: '#8a8a88', roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6, metalness: 0.5 }),
    corrugated: new THREE.MeshStandardMaterial({ map: corrTex, roughness: 0.4, metalness: 0.75, side: THREE.DoubleSide }),
    binRoof: new THREE.MeshStandardMaterial({ color: '#b9bcbd', roughness: 0.4, metalness: 0.75, side: THREE.DoubleSide }),
    steelM: new THREE.MeshStandardMaterial({ color: '#8d9294', roughness: 0.5, metalness: 0.8 }),
    truckPaint: addDust(new THREE.MeshPhysicalMaterial({ color: '#4d6b7a', roughness: 0.55, metalness: 0.3, clearcoat: 0.3 }), 1.1),
    semiPaint: addDust(new THREE.MeshPhysicalMaterial({ color: '#8f2a1f', roughness: 0.35, metalness: 0.3, clearcoat: 0.8 }), 0.8),
    chrome: new THREE.MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.1, metalness: 1 }),
    alu: addDust(new THREE.MeshStandardMaterial({ color: '#c6cacc', roughness: 0.35, metalness: 0.85 }), 0.9),
    tarp: new THREE.MeshStandardMaterial({ color: '#2a3a2a', roughness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.95 }),
    headlight: new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff2c8', emissiveIntensity: 0.3 }),
    tailRed: new THREE.MeshStandardMaterial({ color: '#a01010', emissive: '#ff2010', emissiveIntensity: 0.4 }),
    pole: new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.95 }),
    insulator: new THREE.MeshStandardMaterial({ color: '#d8dccf', roughness: 0.3 }),
    fenceWood: new THREE.MeshStandardMaterial({ color: '#8a7a64', roughness: 0.95 }),
    bark: new THREE.MeshStandardMaterial({ color: '#4e4438', roughness: 1 }),
    foliage: ['#4f5a2c', '#5d6532', '#6b6a36', '#47522a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true })),
    grain: new THREE.MeshStandardMaterial({ map: makeGrainTexture(232, 178, 40), roughness: 0.8 }),
  };
  mats.grains = {
    corn: mats.grain,
    wheat: new THREE.MeshStandardMaterial({ map: makeGrainTexture(214, 170, 92), roughness: 0.8 }),
    soy: new THREE.MeshStandardMaterial({ map: makeGrainTexture(218, 190, 120), roughness: 0.8 }),
  };
  void envTex;

  const colliders = [];
  const place = (obj, x, z, rot = 0, sink = 0.1) => {
    obj.position.set(x, heightAt(x, z) - sink, z);
    obj.rotation.y = rot;
    group.add(obj);
    return obj;
  };

  // 农舍（正面朝南，望向玉米地）
  const house = place(buildHouse(mats), FARM.house.x, FARM.house.z, FARM.house.rot);
  colliders.push({ x: FARM.house.x, z: FARM.house.z, r: 6.5 }, { x: FARM.house.x, z: FARM.house.z + 4.5, r: 5.5 });
  void house;
  place(buildBarn(mats), FARM.barn.x, FARM.barn.z, FARM.barn.rot + Math.PI / 2);
  for (const dx of [-7, 0, 7]) colliders.push({ x: FARM.barn.x + dx, z: FARM.barn.z, r: 7.5 });
  FARM.bins.forEach((b, i) => {
    place(buildBin(mats, i === 1 ? 4.2 : 3.6, i === 1 ? 9 : 7.5), b.x, b.z, i * 0.7);
    colliders.push({ x: b.x, z: b.z, r: 4.4 });
  });
  place(buildPickup(mats), FARM.pickup.x, FARM.pickup.z, FARM.pickup.rot, 0);
  colliders.push({ x: FARM.pickup.x, z: FARM.pickup.z, r: 2.6 });
  const truck = buildGrainTruck(mats);
  place(truck.group, FARM.truck.x, FARM.truck.z, FARM.truck.rot, 0);
  for (const dx of [-5, 0, 5]) colliders.push({ x: FARM.truck.x + dx, z: FARM.truck.z, r: 1.6 });
  const windmill = buildWindmill(mats);
  place(windmill.group, FARM.windmill.x, FARM.windmill.z, 0.6);
  colliders.push({ x: FARM.windmill.x, z: FARM.windmill.z, r: 2 });

  // 防风林（农场北侧）与零星树木
  const rnd = mulberry32(33);
  const nTree = createNoise2D(5);
  const treeList = [];
  for (let x = -170; x < 150; x += 6 + rnd() * 5) {
    const z = -98 + nTree(x / 40, 0) * 6 + rnd() * 4;
    treeList.push({ x, z, y: heightAt(x, z) - 0.1, scale: 0.9 + rnd() * 0.5, rnd });
  }
  for (const [x, z] of [[-48, -40], [-50, -60], [-18, -64], [-60, -46], [70, -40], [-130, 10], [-128, 60], [-134, 34]]) {
    treeList.push({ x, z, y: heightAt(x, z) - 0.1, scale: 1.05 + rnd() * 0.3, rnd });
    colliders.push({ x, z, r: 1.2 });
  }
  group.add(buildTrees(mats, treeList));

  // 电线杆
  buildPowerLine(mats, group);
  // 院子栅栏
  buildFence(mats, group, [
    { x: -52, z: -31 }, { x: -30, z: -31 },
  ]);
  buildFence(mats, group, [
    { x: -22, z: -31 }, { x: -10, z: -31 }, { x: -10, z: -44 },
  ]);
  buildFence(mats, group, [{ x: -52, z: -31 }, { x: -52, z: -78 }, { x: -20, z: -80 }]);
  // 田边铁丝网桩（玉米地西侧）
  {
    const f = FIELDS[0];
    const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6);
    const ps = [];
    for (let z = f.minZ - 12; z < f.maxZ + 14; z += 4) {
      const x = f.minX - 22;
      ps.push(postGeo.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(x, heightAt(x, z) + 0.6, z)));
    }
    mk(mergeGeometries(ps), mats.fenceWood, 0, 0, 0, group);
  }
  // 邮箱
  {
    const mb = new THREE.Group();
    box(0.1, 1.1, 0.1, mats.wood, 0, 0.55, 0, mb);
    const m = mk(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 14, 1, false, 0, Math.PI), mats.steelM, 0, 1.15, 0, mb);
    m.rotation.z = Math.PI / 2; m.rotation.y = Math.PI / 2;
    box(0.36, 0.18, 0.5, mats.steelM, 0, 1.06, 0, mb);
    box(0.03, 0.2, 0.08, mats.tailRed, 0.2, 1.25, 0.1, mb);
    place(mb, -29.5, ROAD.z - 4.6, 0, 0);
  }
  // 干草卷
  {
    const hayMat = new THREE.MeshStandardMaterial({ map: makeGrainTexture(190, 165, 105), roughness: 1 });
    const hay = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 20);
    for (const [x, z, r] of [[26, -48, 0.3], [27.8, -47.4, 0.2], [26.9, -46.1, 1.1], [-8, -76, 0.4], [-6.3, -76.4, 0.1]]) {
      const h = mk(hay, hayMat, x, heightAt(x, z) + 0.72, z, group);
      h.rotation.z = Math.PI / 2; h.rotation.y = r;
      colliders.push({ x, z, r: 1 });
    }
  }

  scene.add(group);
  return { group, colliders, truck, windmill, porchLampMat: mats.porchLamp, headlightMats: [mats.headlight] };
}
