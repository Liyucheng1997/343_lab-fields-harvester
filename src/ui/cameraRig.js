import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { heightAt } from '../world/layout.js';

// 相机：跟随 / 驾驶室 / 电影 / 自由
export class CameraRig {
  constructor(camera, dom, combine) {
    this.camera = camera;
    this.dom = dom;
    this.combine = combine;
    this.mode = 'chase';
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 160;
    this.controls.screenSpacePanning = false;
    this.lastTarget = new THREE.Vector3();
    this.idle = 0;
    this.controls.addEventListener('start', () => { this.idle = 0; this.dragging = true; });
    this.controls.addEventListener('end', () => { this.dragging = false; });
    // 驾驶室视角鼠标观察
    this.lookYaw = 0; this.lookPitch = -0.12;
    let down = false, px = 0, py = 0;
    dom.addEventListener('pointerdown', (e) => { down = true; px = e.clientX; py = e.clientY; });
    window.addEventListener('pointerup', () => { down = false; });
    window.addEventListener('pointermove', (e) => {
      if (!down || this.mode !== 'cab') return;
      this.lookYaw -= (e.clientX - px) * 0.004;
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - (e.clientY - py) * 0.003, -1.1, 0.6);
      px = e.clientX; py = e.clientY;
    });
    this.shot = 0; this.shotTime = 0;
    this.shotData = null;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.eyeLocal = new THREE.Vector3(0.1, 4.62, 1.25);
    this.fields = [];
  }

  setMode(mode) {
    this.mode = mode;
    const c = this.combine;
    const target = this.tmp.set(c.x, c.y + 2.5, c.z);
    this.controls.enabled = mode === 'chase' || mode === 'free';
    if (mode === 'chase' || mode === 'free') {
      if (this.camera.position.distanceTo(target) > 120 || this.prevMode === 'cab' || this.prevMode === 'cinematic' || !this.prevMode) {
        const back = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
        const side = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
        this.camera.position.copy(target).addScaledVector(back, 17).addScaledVector(side, 9).add(new THREE.Vector3(0, 6.5, 0));
      }
      this.controls.target.copy(target);
      this.lastTarget.copy(target);
      this.camera.fov = 50;
    }
    if (mode === 'cab') { this.lookYaw = 0; this.lookPitch = -0.12; this.camera.fov = 68; }
    if (mode === 'cinematic') { this.shot = -1; this.shotTime = 999; this.camera.fov = 38; }
    this.camera.near = mode === 'cab' ? 0.05 : 0.1;
    this.camera.updateProjectionMatrix();
    document.body.classList.toggle('cinema', mode === 'cinematic');
    this.prevMode = mode;
  }

  update(dt) {
    const c = this.combine;
    const cam = this.camera;
    if (this.mode === 'chase') {
      const target = this.tmp.set(c.x, c.y + 2.5, c.z);
      const delta = this.tmp2.copy(target).sub(this.lastTarget);
      cam.position.add(delta);
      this.controls.target.copy(target);
      this.lastTarget.copy(target);
      // 一段时间无操作后自动转到车后方
      this.idle += dt;
      if (this.idle > 3 && !this.dragging && Math.abs(c.v) > 0.4) {
        const off = cam.position.clone().sub(target);
        const r = Math.hypot(off.x, off.z);
        const cur = Math.atan2(off.x, off.z);
        const want = c.yaw + Math.PI + (c.v < 0 ? Math.PI : 0) + 0.45;
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + d * Math.min(1, dt * 0.6);
        off.x = Math.sin(na) * r; off.z = Math.cos(na) * r;
        cam.position.copy(target).add(off);
      }
      this.controls.update();
      this.keepAboveGround();
    } else if (this.mode === 'free') {
      this.controls.update();
      this.keepAboveGround();
    } else if (this.mode === 'cab') {
      const body = c.parts.body;
      body.updateMatrixWorld();
      const eye = body.localToWorld(this.tmp.copy(this.eyeLocal));
      cam.position.copy(eye);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.lookPitch, this.lookYaw, 0, 'YXZ'));
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const wq = new THREE.Quaternion();
      body.getWorldQuaternion(wq);
      fwd.applyQuaternion(wq);
      cam.up.set(0, 1, 0);
      cam.lookAt(eye.clone().add(fwd));
    } else if (this.mode === 'cinematic') {
      this.updateCinematic(dt);
    }
  }

  keepAboveGround() {
    const cam = this.camera;
    const g = heightAt(cam.position.x, cam.position.z) + 1.2;
    if (cam.position.y < g) cam.position.y = g;
  }

  updateCinematic(dt) {
    const c = this.combine;
    const cam = this.camera;
    this.shotTime += dt;
    const fwd = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const left = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const pos = new THREE.Vector3(c.x, c.y, c.z);
    const durations = [9, 8, 10, 8, 9];
    if (this.shot < 0 || this.shotTime > durations[this.shot % durations.length]) {
      this.shot = (this.shot + 1) % durations.length;
      this.shotTime = 0;
      // 每个镜头开始时记录固定机位
      const s = {};
      if (this.shot === 0) {
        // 低机位：收割机迎面驶来（机位选在已收割/无作物的位置，避免被叶片遮挡）
        const ahead = 30 + Math.max(0, c.v) * 4;
        let chosen = null;
        for (const off of [-7.5, 7.5, -11, 11, -15, 15]) {
          const p = pos.clone().addScaledVector(fwd, ahead).addScaledVector(left, off);
          if (!this.fields.some((f) => f.standingAt(p.x, p.z, 1.2))) { chosen = p; break; }
        }
        s.pos = chosen || pos.clone().addScaledVector(fwd, ahead).addScaledVector(left, 8);
        s.pos.y = heightAt(s.pos.x, s.pos.z) + (chosen ? 1.3 : 3.4);
        s.fov = 34;
      } else if (this.shot === 1) {
        // 侧面跟拍：选择没有作物遮挡的一侧
        const free = (side) => { const p = pos.clone().addScaledVector(left, side * 16); return !this.fields.some((f) => f.standingAt(p.x, p.z, 1.5)); };
        s.side = free(1) ? 1 : free(-1) ? -1 : 1;
        s.h = free(s.side) ? 2.2 : 4.6;
      } else if (this.shot === 2) {
        s.angle = Math.atan2(-fwd.x, -fwd.z);
        s.fov = 40;
      } else if (this.shot === 4) {
        // 远景长焦
        s.pos = pos.clone().addScaledVector(left, 70).addScaledVector(fwd, 20);
        s.pos.y = heightAt(s.pos.x, s.pos.z) + 2.0;
        s.fov = 22;
      }
      this.shotData = s;
    }
    const s = this.shotData;
    const look = pos.clone().add(new THREE.Vector3(0, 2.2, 0));
    let fov = 38;
    switch (this.shot) {
      case 0:
        cam.position.copy(s.pos);
        fov = s.fov;
        look.y = c.y + 2.6;
        break;
      case 1: {
        // 侧面跟拍
        const p = pos.clone().addScaledVector(left, 16 * s.side).addScaledVector(fwd, 4 - this.shotTime * 0.4);
        p.y = c.y + s.h;
        cam.position.lerp(p, this.shotTime < 0.05 ? 1 : Math.min(1, dt * 3));
        fov = 42;
        break;
      }
      case 2: {
        // 高空航拍环绕
        const a = s.angle + this.shotTime * 0.06;
        const p = pos.clone().add(new THREE.Vector3(Math.sin(a) * 55, 42, Math.cos(a) * 55));
        cam.position.lerp(p, this.shotTime < 0.05 ? 1 : Math.min(1, dt * 2));
        fov = s.fov;
        break;
      }
      case 3: {
        // 后轮低机位：秸秆抛撒
        const p = pos.clone().addScaledVector(fwd, -14).addScaledVector(left, -1.2);
        p.y = c.y + 1.6;
        cam.position.lerp(p, this.shotTime < 0.05 ? 1 : Math.min(1, dt * 3));
        look.addScaledVector(fwd, -2);
        fov = 46;
        break;
      }
      case 4:
        cam.position.copy(s.pos);
        fov = s.fov;
        break;
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // 镜头轻微手持晃动
    const t = performance.now() * 0.001;
    look.x += Math.sin(t * 0.7) * 0.15; look.y += Math.sin(t * 0.9) * 0.08;
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
  }
}
