import { dubinsPath, sampleDubins } from './dubins.js';
import { UNLOAD_POSE, PARK_POSE } from '../world/layout.js';

const TURN_R = 6.5;
const STEP = 0.5;

const CROP_SPEED = { corn: 2.3, wheat: 2.7, soy: 2.8 };
const TRANSIT_SPEED = 4.8;
const TURN_SPEED = 2.1;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Autopilot {
  constructor(combine, fields) {
    this.combine = combine;
    this.fields = fields; // CropField[]
    this.path = [];
    this.idx = 0;
    this.state = 'idle';
    this.task = '待命';
    this.fieldIndex = 0;
    this.currentField = null;
    this.laneInfo = { cur: 0, total: 0 };
    this.unloadTimer = 0;
    this.active = false;
    this.unloadThreshold = 0.72;
  }

  engage() {
    this.active = true;
    this.replan();
  }

  disengage() {
    this.active = false;
    this.state = 'idle';
    this.task = '手动驾驶';
    this.path = [];
  }

  pose() {
    const c = this.combine;
    return { x: c.x, z: c.z, yaw: c.yaw };
  }

  nextUnfinishedField() {
    for (let i = 0; i < this.fields.length; i++) {
      const f = this.fields[i];
      if (f.progress < 0.985) return f;
    }
    return null;
  }

  replan() {
    const c = this.combine;
    if (c.tankFill >= this.unloadThreshold) { this.planUnload(); return; }
    const f = this.nextUnfinishedField();
    if (f) this.planField(f);
    else this.planPark();
  }

  // ---------------- 路径构建 ----------------
  fieldNear(p, margin = 14) {
    for (const cf of this.fields) {
      const d = cf.def;
      if (p.x > d.minX - margin && p.x < d.maxX + margin && p.z > d.minZ - margin && p.z < d.maxZ + margin) return d;
    }
    return null;
  }

  // 生成绕田边的中间位姿
  routePoses(from, to) {
    const poses = [from];
    const isSouth = (p, d) => p.z > (d.minZ + d.maxZ) / 2;
    const fFrom = this.fieldNear(from);
    const fTo = this.fieldNear(to);
    let cur = from;
    if (fFrom && isSouth(from, fFrom) && !(fTo === fFrom && isSouth(to, fFrom))) {
      const goEast = to.x > (fFrom.minX + fFrom.maxX) / 2;
      const sx = goEast ? fFrom.maxX + 12 : fFrom.minX - 12;
      poses.push({ x: sx, z: fFrom.maxZ + 5, yaw: Math.PI });
      poses.push({ x: sx, z: fFrom.minZ - 6, yaw: Math.PI });
      cur = poses[poses.length - 1];
    }
    if (fTo && isSouth(to, fTo) && !(fFrom === fTo && isSouth(cur, fTo))) {
      const goEast = cur.x > (fTo.minX + fTo.maxX) / 2;
      const sx = goEast ? fTo.maxX + 12 : fTo.minX - 12;
      poses.push({ x: sx, z: fTo.minZ - 6, yaw: 0 });
      poses.push({ x: sx, z: fTo.maxZ + 5, yaw: 0 });
    }
    poses.push(to);
    return poses;
  }

  appendDubins(path, a, b, spd = TRANSIT_SPEED) {
    const dp = dubinsPath(a, b, TURN_R);
    if (!dp) { this.appendLine(path, a, b, false, spd); return; }
    const pts = sampleDubins(dp, STEP);
    for (let i = path.length ? 1 : 0; i < pts.length; i++) {
      const p = pts[i];
      path.push({ x: p.x, z: p.z, cut: false, spd: p.curved ? TURN_SPEED : spd });
    }
  }

  appendLine(path, a, b, cut, spd, lane = -1) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / STEP));
    for (let i = path.length ? 1 : 0; i <= n; i++) {
      const t = i / n;
      path.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, cut, spd, lane });
    }
  }

  appendRoute(path, from, to) {
    const poses = this.routePoses(from, to);
    for (let i = 0; i < poses.length - 1; i++) this.appendDubins(path, poses[i], poses[i + 1]);
  }

  planField(cf) {
    const c = this.combine;
    const d = cf.def;
    this.currentField = cf;
    c.setHeader(d.header);
    const hdr = c.headerInfo();
    const W = hdr.halfW * 2;
    const s = W - 0.6;
    const fw = d.maxX - d.minX;
    const n = Math.max(1, Math.ceil((fw - W) / s) + 1);
    // 作业带均匀分布（间距 ≤ 割幅 - 重叠）
    const span = fw - W + 0.6;
    const step = n > 1 ? span / (n - 1) : 0;
    const lanes = [];
    for (let i = 0; i < n; i++) {
      const x = n > 1 ? d.minX + W / 2 - 0.3 + i * step : (d.minX + d.maxX) / 2;
      const prog = cf.laneProgress(x, Math.max(step, 1) / 2);
      if (prog < 0.97) lanes.push({ x, i });
    }
    if (!lanes.length) {
      cf.cutCount = Math.max(cf.cutCount, Math.ceil(cf.alive * 0.99));
      this.replan();
      return;
    }
    const p0 = this.pose();
    // 从离收割机较近的一端开始
    if (Math.abs(lanes[lanes.length - 1].x - p0.x) < Math.abs(lanes[0].x - p0.x)) lanes.reverse();
    let southward = p0.z < (d.minZ + d.maxZ) / 2;
    const path = [];
    path.push({ x: p0.x, z: p0.z, cut: false, spd: TRANSIT_SPEED });
    const laneSpd = CROP_SPEED[cf.crop];
    let prevEnd = p0;
    lanes.forEach((ln, k) => {
      const start = southward ? { x: ln.x, z: d.minZ - 6, yaw: 0 } : { x: ln.x, z: d.maxZ + 6, yaw: Math.PI };
      const end = southward ? { x: ln.x, z: d.maxZ - 3.2, yaw: 0 } : { x: ln.x, z: d.minZ + 3.2, yaw: Math.PI };
      if (k === 0) this.appendRoute(path, prevEnd, start);
      else this.appendDubins(path, prevEnd, start, TURN_SPEED);
      // 入田前 3 米降下割台
      this.appendLine(path, start, end, true, laneSpd, k);
      prevEnd = end;
      southward = !southward;
    });
    this.path = path;
    this.idx = 0;
    this.state = 'harvest';
    this.laneTotal = lanes.length;
    this.lanesDoneBefore = n - lanes.length;
    this.laneCount = n;
    this.task = `前往${d.name}`;
  }

  planUnload() {
    const path = [];
    const p0 = this.pose();
    path.push({ x: p0.x, z: p0.z, cut: false, spd: TRANSIT_SPEED });
    const pre = { x: UNLOAD_POSE.x - 22, z: UNLOAD_POSE.z, yaw: UNLOAD_POSE.yaw };
    this.appendRoute(path, p0, pre);
    this.appendLine(path, pre, UNLOAD_POSE, false, 2.2);
    path[path.length - 1].stop = true;
    this.path = path;
    this.idx = 0;
    this.state = 'toUnload';
    this.task = '粮仓将满，前往运粮车卸粮';
  }

  planAfterUnload() {
    // 先向前驶出运粮车区域
    const path = [];
    const p0 = this.pose();
    const out = { x: UNLOAD_POSE.x + 16, z: UNLOAD_POSE.z, yaw: UNLOAD_POSE.yaw };
    this.appendLine(path, p0, out, false, 3);
    const f = this.nextUnfinishedField();
    this.combine.unloadOut = false;
    if (!f) { this.path = path; this.idx = 0; this.state = 'toPark'; this.after = 'park'; return; }
    this.path = path;
    this.idx = 0;
    this.state = 'leaveTruck';
    this.task = '卸粮完成，返回田间';
  }

  planPark() {
    const path = [];
    const p0 = this.pose();
    path.push({ x: p0.x, z: p0.z, cut: false, spd: TRANSIT_SPEED });
    this.appendRoute(path, p0, PARK_POSE);
    path[path.length - 1].stop = true;
    this.path = path;
    this.idx = 0;
    this.state = 'toPark';
    this.task = '全部作物收割完成，返回农场';
  }

  // ---------------- 每帧 ----------------
  update(dt) {
    const c = this.combine;
    const out = { speed: 0, steer: 0, headerDown: false, unload: false };
    if (!this.active) return out;

    if (this.state === 'unloading') {
      out.unload = true;
      this.unloadTimer += dt;
      this.task = `卸粮中… ${Math.round(c.tank)} kg`;
      if (c.tank <= 0.5 && this.unloadTimer > 2) this.planAfterUnload();
      return out;
    }
    if (this.state === 'done') { this.task = '作业完成 · 待命'; return out; }
    if (!this.path.length) return out;

    // 最近点
    const path = this.path;
    let best = this.idx, bestD = Infinity;
    const end = Math.min(path.length - 1, this.idx + 60);
    for (let i = this.idx; i <= end; i++) {
      const dx = path[i].x - c.x, dz = path[i].z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    this.idx = best;
    const cur = path[best];

    // 收割时在作业带末端检查粮仓
    if (this.state === 'harvest') {
      if (cur.lane !== undefined && cur.lane >= 0) {
        this.task = `${this.currentField.def.name} · 第 ${this.lanesDoneBefore + cur.lane + 1}/${this.laneCount} 趟`;
      }
      if (!cur.cut && best > 4 && path[best - 4].cut && c.tankFill >= this.unloadThreshold) {
        this.planUnload();
        return out;
      }
    }

    // 预瞄点
    const Ld = 3.2 + Math.abs(c.v) * 0.7;
    let gi = best, acc = 0;
    while (gi < path.length - 1 && acc < Ld) {
      acc += Math.hypot(path[gi + 1].x - path[gi].x, path[gi + 1].z - path[gi].z);
      gi++;
    }
    const goal = path[gi];
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    const lx = Math.cos(c.yaw), lz = -Math.sin(c.yaw);
    const gx = goal.x - c.x, gz = goal.z - c.z;
    const fwd = gx * fx + gz * fz, lat = gx * lx + gz * lz;
    const alpha = Math.atan2(lat, fwd);
    const dist = Math.max(1, Math.hypot(gx, gz));
    const kappa = (2 * Math.sin(alpha)) / dist;
    out.steer = Math.atan(kappa * c.wheelBase);

    // 速度：取前方一段的最低限速，接近终点减速
    let spd = Infinity;
    for (let i = best; i < Math.min(path.length, best + 18); i++) spd = Math.min(spd, path[i].spd);
    const remain = (path.length - 1 - best) * STEP + Math.hypot(path[path.length - 1].x - c.x, path[path.length - 1].z - c.z) * 0.0;
    const last = path[path.length - 1];
    if (last.stop || this.state === 'leaveTruck') spd = Math.min(spd, Math.sqrt(2 * 0.7 * Math.max(0, remain - 0.3)) + 0.05);
    // 偏离过大时减速
    if (Math.abs(alpha) > 0.6) spd = Math.min(spd, 1.6);
    out.speed = spd;
    // 割台：当前点或前方 2 米需要收割则放下
    const ahead = path[Math.min(path.length - 1, best + 4)];
    out.headerDown = cur.cut || ahead.cut;

    // 到达终点
    const dEnd = Math.hypot(last.x - c.x, last.z - c.z);
    if (best >= path.length - 2 || (dEnd < 1.0 && best > path.length - 10)) {
      this.onPathEnd(out);
    }
    return out;
  }

  onPathEnd(out) {
    const c = this.combine;
    switch (this.state) {
      case 'harvest': {
        // 本块田完成，进入下一块
        const f = this.nextUnfinishedField();
        if (c.tankFill > 0.35) this.planUnload();
        else if (f) this.planField(f);
        else this.planPark();
        break;
      }
      case 'toUnload':
        if (Math.abs(c.v) < 0.15) {
          this.state = 'unloading';
          this.unloadTimer = 0;
          c.unloadOut = true;
        }
        out.speed = 0;
        break;
      case 'leaveTruck': {
        const f = this.nextUnfinishedField();
        if (f) this.planField(f); else this.planPark();
        break;
      }
      case 'toPark':
        out.speed = 0;
        if (this.after === 'park') { this.after = null; this.planPark(); break; }
        this.state = 'done';
        this.task = '作业完成 · 待命';
        break;
    }
  }
}

export { wrapAngle };
