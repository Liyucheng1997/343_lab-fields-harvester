import * as THREE from 'three';
import { buildCombine } from './combineModel.js';
import { heightAt } from '../world/layout.js';

const MAX_STEER = 0.68;

export class Combine {
  constructor(scene) {
    this.parts = buildCombine();
    this.root = this.parts.root;
    scene.add(this.root);
    const d = this.parts.dims;
    this.wheelBase = d.wheelBase;
    this.x = -30; this.z = -10.5; this.yaw = Math.PI / 2;
    this.y = 0; this.pitch = 0; this.roll = 0;
    this.v = 0;
    this.steer = 0;
    this.headerType = 'corn';
    this.headerDown = false;
    this.headerPos = 0; // 0 抬起 → 1 放下
    this.unloadOut = false;
    this.unloadPos = 0;
    this.tank = 0;
    this.capacity = 2600; // kg（游戏尺度）
    this.tankCrop = 'corn';
    this.lightsOn = false;
    this.threshing = true;
    this.wheelAngleF = 0; this.wheelAngleR = 0;
    this.reelAngle = 0;
    this.time = 0;
    this.cutRate = 0; // 株/秒（平滑）
    this.kgRate = 0;
    this.colliders = [];
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector3();
    this.setHeader('corn');
    this.syncTransform(0, true);
  }

  get tankFill() { return this.tank / this.capacity; }

  setHeader(type) {
    this.headerType = type;
    for (const [k, h] of Object.entries(this.parts.headers)) h.group.visible = k === type;
  }

  headerInfo() { return this.parts.headers[this.headerType]; }

  frame() {
    return {
      ox: this.x, oz: this.z,
      fx: Math.sin(this.yaw), fz: Math.cos(this.yaw),
      lx: Math.cos(this.yaw), lz: -Math.sin(this.yaw),
    };
  }

  // 驾驶：manual = {throttle, steer, brake}，auto = {speed, steer}
  drive(dt, cmd, auto) {
    let accel = 0;
    const maxFwd = this.headerPos > 0.5 ? 3.6 : 7.5;
    if (auto) {
      const err = cmd.speed - this.v;
      accel = THREE.MathUtils.clamp(err * 1.4, -2.5, 1.0);
      const st = THREE.MathUtils.clamp(cmd.steer, -MAX_STEER, MAX_STEER);
      this.steer += THREE.MathUtils.clamp(st - this.steer, -1.3 * dt, 1.3 * dt);
    } else {
      if (cmd.throttle > 0) accel = this.v < 0 ? 3.0 : 1.1 * (1 - Math.max(0, this.v) / maxFwd);
      else if (cmd.throttle < 0) accel = this.v > 0 ? -3.0 : -0.8 * (1 + this.v / 2.2);
      else accel = -Math.sign(this.v) * Math.min(Math.abs(this.v) / dt, 0.6);
      if (cmd.brake) accel = -Math.sign(this.v) * Math.min(Math.abs(this.v) / dt, 4.5);
      const target = cmd.steer * MAX_STEER * (1 - Math.min(0.5, Math.abs(this.v) / 16));
      const rate = cmd.steer !== 0 ? 1.1 : 1.6;
      this.steer += THREE.MathUtils.clamp(target - this.steer, -rate * dt, rate * dt);
    }
    this.v += accel * dt;
    if (!auto) this.v = THREE.MathUtils.clamp(this.v, -2.2, maxFwd);
    // 后轮转向自行车模型：参考点在前桥
    const omega = (this.v * Math.tan(this.steer)) / this.wheelBase;
    this.yaw += omega * dt;
    this.x += Math.sin(this.yaw) * this.v * dt;
    this.z += Math.cos(this.yaw) * this.v * dt;
    this.collide();
  }

  collide() {
    // 简单的建筑碰撞（圆形碰撞体，收割机近似为前后两个圆）
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const off of [1.5, -3.2]) {
      const cx = this.x + fx * off, cz = this.z + fz * off;
      for (const c of this.colliders) {
        const dx = cx - c.x, dz = cz - c.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + 2.2;
        if (d < minD && d > 1e-3) {
          const push = minD - d;
          this.x += (dx / d) * push; this.z += (dz / d) * push;
          this.v *= 0.5;
        }
      }
    }
    this.x = THREE.MathUtils.clamp(this.x, -420, 470);
    this.z = THREE.MathUtils.clamp(this.z, -380, 420);
  }

  syncTransform(dt, snap = false) {
    const d = this.parts.dims;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    const h = (a, b) => heightAt(this.x + fx * b + lx * a, this.z + fz * b + lz * a);
    const hFL = h(d.trackF, 0), hFR = h(-d.trackF, 0);
    const hRL = h(d.trackR, -d.wheelBase), hRR = h(-d.trackR, -d.wheelBase);
    const yF = (hFL + hFR) / 2, yR = (hRL + hRR) / 2;
    const pitch = Math.atan2(yF - yR, d.wheelBase);
    const roll = Math.atan2((hFL + hRL) / 2 - (hFR + hRR) / 2, d.trackF + d.trackR);
    const k = snap ? 1 : 1 - Math.exp(-dt * 8);
    this.y += (yF - this.y) * k;
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
    const r = this.root;
    r.position.set(this.x, this.y, this.z);
    r.rotation.order = 'YXZ';
    r.rotation.set(-this.pitch, this.yaw, this.roll);
    // 发动机怠速的细微抖动
    const vib = 0.004 + (this.threshing ? 0.004 : 0);
    this.parts.body.position.y = Math.sin(this.time * 61) * vib * 0.5;
    this.parts.body.rotation.z = Math.sin(this.time * 47) * vib * 0.1;
  }

  // 收割
  harvest(fields) {
    if (this.headerPos < 0.82 || !this.threshing) return { count: 0, kg: 0, crop: null };
    const hdr = this.headerInfo();
    const fr = this.frame();
    let count = 0, kg = 0, crop = null;
    for (const f of fields) {
      const n = f.harvest(fr, hdr.halfW, hdr.zMin, hdr.zMax);
      if (n) {
        count += n;
        // 割台不匹配时损失增加
        const eff = (f.crop === 'corn') === (this.headerType === 'corn') ? 1 : 0.7;
        kg += n * f.kgPerPlant * eff;
        crop = f.crop;
      }
    }
    if (kg > 0) {
      const space = this.capacity - this.tank;
      this.tank += Math.min(space, kg);
      this.tankCrop = crop;
    }
    return { count, kg, crop };
  }

  // 卸粮：返回本帧卸出的 kg
  unload(dt) {
    if (this.unloadPos < 0.97 || this.tank <= 0) return 0;
    const flow = Math.min(this.tank, 320 * dt);
    this.tank -= flow;
    return flow;
  }

  spoutWorld(target) {
    return this.parts.augerTube.localToWorld(target.copy(this.parts.spoutLocal));
  }

  update(dt) {
    this.time += dt;
    const P = this.parts;
    // 割台升降
    const hTarget = this.headerDown ? 1 : 0;
    this.headerPos += THREE.MathUtils.clamp(hTarget - this.headerPos, -dt * 0.8, dt * 0.8);
    const theta = 0.02 + this.headerPos * 0.255;
    P.feeder.rotation.x = theta;
    P.headerMount.rotation.x = -theta;
    // 升降油缸
    P.feeder.updateMatrix();
    for (const c of P.liftCyl) {
      const tip = c.tip.clone().applyMatrix4(P.feeder.matrix);
      const base = c.base;
      const dir = tip.clone().sub(base);
      const len = dir.length();
      const mid1 = base.clone().addScaledVector(dir, 0.3);
      const mid2 = base.clone().addScaledVector(dir, 0.75);
      c.barrel.position.copy(mid1);
      c.barrel.scale.set(1, len * 0.6, 1);
      c.barrel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      c.rod.position.copy(mid2);
      c.rod.scale.set(1, len * 0.5, 1);
      c.rod.quaternion.copy(c.barrel.quaternion);
    }
    // 车轮
    this.wheelAngleF += (this.v * dt) / P.dims.FR;
    for (const w of P.frontWheels) w.rotation.x = this.wheelAngleF;
    const vRear = this.v / Math.max(0.2, Math.cos(this.steer));
    this.wheelAngleR += (vRear * dt) / P.dims.RR;
    for (const w of P.rearWheels) w.rotation.x = this.wheelAngleR;
    for (const p of P.rearPivots) p.rotation.y = -this.steer;
    P.steeringWheel.rotation.z = this.steer * 4;
    // 作业部件
    const work = this.threshing ? 1 : 0;
    const hdr = this.headerInfo();
    if (hdr.reel) {
      const reelSpeed = work * (1.2 + Math.max(0, this.v) * 0.9);
      hdr.reel.rotation.x += reelSpeed * dt;
    }
    for (const a of hdr.augers) a.rotation.x -= work * 7 * dt;
    for (const s of P.spreaders) s.g.rotation.y += s.dir * work * 14 * dt;
    P.screen.rotation.x += work * 2.5 * dt;
    P.lidar.rotation.y += 12 * dt;
    P.lidar2.rotation.y -= 12 * dt;
    // 卸粮搅龙
    const uTarget = this.unloadOut ? 1 : 0;
    this.unloadPos += THREE.MathUtils.clamp(uTarget - this.unloadPos, -dt * 0.45, dt * 0.45);
    const ue = this.unloadPos * this.unloadPos * (3 - 2 * this.unloadPos);
    P.unloadPivot.rotation.y = ue * 1.5;
    P.augerTube.rotation.x = -0.06 - ue * 0.12;
    // 粮堆
    const fill = this.tankFill;
    P.heap.visible = fill > 0.01;
    P.heap.position.y = 0.05 + fill * 0.9;
    P.heap.scale.set(0.6 + fill * 0.4, 0.3 + fill * 0.9, 0.6 + fill * 0.4);
    P.heap.material = this.tankCrop === 'corn' ? P.M.grainCorn : this.tankCrop === 'wheat' ? P.M.grainWheat : P.M.grainSoy;
    // 警示灯：自动驾驶或作业时闪烁
    const beaconOn = this.beaconOn;
    P.beacons.forEach((b, i) => {
      const ph = Math.sin(this.time * 7 + i * Math.PI);
      b.material.emissiveIntensity = beaconOn ? (ph > 0.2 ? 6 : 0.3) : 0.15;
    });
    // 灯光
    const lamp = this.lightsOn ? 4 : 0.0;
    P.M.lamp.emissiveIntensity = lamp;
    for (const s of P.spots) s.intensity = this.lightsOn ? 260 : 0;
    P.M.red.emissiveIntensity = this.lightsOn ? 3 : 0.3;
    this.syncTransform(dt);
  }
}
