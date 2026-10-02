import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { createNoise2D, fbm } from './noise.js';

// 天空、太阳、雾、远山、沙尘暴
const KEYS = [
  // elev(度), 雾色, 太阳色, 太阳强度, 天光强度, 曝光
  { e: -8, fog: '#1c2638', sun: '#8aa0d0', si: 0.0, hi: 0.32, exp: 0.75, hz: 0.12 },
  { e: -2, fog: '#4a4048', sun: '#ff7a3a', si: 0.25, hi: 0.32, exp: 0.66, hz: 0.25 },
  { e: 3, fog: '#c49470', sun: '#ff9a50', si: 1.8, hi: 0.6, exp: 0.55, hz: 0.9 },
  { e: 10, fog: '#d6c09c', sun: '#ffcf96', si: 2.8, hi: 0.85, exp: 0.52, hz: 1.35 },
  { e: 25, fog: '#d3cbb6', sun: '#fff0d8', si: 3.3, hi: 1.0, exp: 0.48, hz: 1.6 },
  { e: 60, fog: '#cdcdc4', sun: '#fffaf0', si: 3.6, hi: 1.1, exp: 0.44, hz: 1.75 },
];
const STORM_FOG = new THREE.Color('#9a7a58');

function sampleKeys(e) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  if (e < KEYS[0].e) { a = b = KEYS[0]; }
  if (e > KEYS[KEYS.length - 1].e) { a = b = KEYS[KEYS.length - 1]; }
  const t = a === b ? 0 : (e - a.e) / (b.e - a.e);
  return {
    fog: new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t),
    sun: new THREE.Color(a.sun).lerp(new THREE.Color(b.sun), t),
    si: a.si + (b.si - a.si) * t,
    hi: a.hi + (b.hi - a.hi) * t,
    exp: a.exp + (b.exp - a.exp) * t,
    hz: a.hz + (b.hz - a.hz) * t,
  };
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.elevation = 16;
    this.azimuth = 235;
    this.storm = 0;
    this.stormTarget = 0;

    // 天空
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 9;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.014;
    u.mieDirectionalG.value = 0.86;
    u.cloudCoverage.value = 0.3;
    u.cloudDensity.value = 0.32;
    u.cloudElevation.value = 0.6;
    // 限制太阳圆盘亮度，避免泛光把整个画面冲白
    // 地平线尘雾（HDR），与场景雾颜色一致，让天地自然融合
    this.hazeUniforms = {
      uHaze: { value: new THREE.Color() },
      uHazeAmt: { value: 0.75 },
      uHazeBase: { value: 0.18 },
    };
    const clampSun = (mat) => {
      Object.assign(mat.uniforms, this.hazeUniforms);
      mat.fragmentShader = 'uniform vec3 uHaze; uniform float uHazeAmt; uniform float uHazeBase;\n' + mat.fragmentShader.replace(
        'vec3 sundiscColor = ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 );',
        'vec3 sundiscColor = min( ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 ), vec3( 14.0 ) );')
        .replace('gl_FragColor = vec4( texColor, 1.0 );',
          `texColor = texColor / ( 1.0 + max( vec3( 0.0 ), texColor - 3.0 ) * 0.08 );
          float hzf = clamp( uHazeBase + pow( 1.0 - clamp( direction.y, 0.0, 1.0 ), 5.0 ) * uHazeAmt, 0.0, 1.0 );
          texColor = mix( texColor, uHaze, hzf );
          gl_FragColor = vec4( min( texColor, vec3( 9.0 ) ), 1.0 );`);
      mat.needsUpdate = true;
    };
    clampSun(this.sky.material);
    scene.add(this.sky);

    // 太阳
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xd8d4c8, 0x6a5a40, 0.6);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xcfb796, 0.0016);
    this.baseFogDensity = 0.0016;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    clampSun(this.envSky.material);
    this.envSky.material.uniforms.cloudCoverage.value = 0.3;
    this.envScene.add(this.envSky);
    this.envRT = null;
    this.envDirty = true;
    this.envTimer = 0;

    this.mountains = this.buildMountains();
    scene.add(this.mountains);
    this.stars = this.buildStars();
    scene.add(this.stars);
    this.moonDir = new THREE.Vector3(0.35, 0.75, 0.55).normalize();

    this.sunDir = new THREE.Vector3();
    this.apply();
  }

  buildMountains() {
    const n = createNoise2D(4242);
    const seg = 900, rings = 26;
    const geo = new THREE.BufferGeometry();
    const pos = [], col = [], idx = [];
    const r0 = 2600, r1 = 4200;
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      const r = r0 + (r1 - r0) * t;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        // 北面（-z）山脉更高，营造落基山脉般的远景
        const north = Math.max(0, -Math.sin(a)) * 0.75 + 0.25;
        const massif = Math.max(0, fbm(n, x / 2600 + 3, z / 2600, 3) * 0.5 + 0.55);
        const ridge = 1 - Math.abs(fbm(n, x / 1100, z / 1100, 4));
        const prof = Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.04));
        let h = (Math.pow(massif, 1.6) * 650 + Math.pow(ridge, 2.5) * 260) * north * prof;
        h += fbm(n, x / 260 + 7, z / 260, 3) * 25;
        h = Math.max(-20, h - 60);
        pos.push(x, h, z);
        const snow = THREE.MathUtils.smoothstep(h, 380, 620);
        const c = new THREE.Color('#5d6670').lerp(new THREE.Color('#e9edf0'), snow * 0.85);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i, b = a + seg + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
    this.mountainHaze = { color: { value: new THREE.Color('#cfb796') }, amount: { value: 0.72 } };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHaze = this.mountainHaze.color;
      shader.uniforms.uHazeAmt = this.mountainHaze.amount;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHaze; uniform float uHazeAmt; varying float vH;')
        .replace('#include <opaque_fragment>', `
          float hz = uHazeAmt * (1.0 - smoothstep(0.0, 900.0, vH) * 0.35);
          outgoingLight = mix(outgoingLight, uHaze, clamp(hz, 0.0, 1.0));
          #include <opaque_fragment>`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(30, -10, 40);
    mesh.renderOrder = -1;
    return mesh;
  }

  buildStars() {
    const n = 2600;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 0.95 + 0.05, th = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * r * 9000, u * 9000, Math.sin(th) * r * 9000], i * 3);
      const b = 0.4 + Math.pow(rnd(), 3) * 2.5;
      const tint = rnd();
      col.set([b * (0.85 + tint * 0.2), b * 0.92, b * (1.05 - tint * 0.15)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const p = new THREE.Points(g, this.starMat);
    p.frustumCulled = false;
    p.renderOrder = -2;
    return p;
  }

  setElevation(e) { this.elevation = e; this.apply(); }
  setStorm(on) { this.stormTarget = on ? 1 : 0; }

  apply() {
    const phi = THREE.MathUtils.degToRad(90 - this.elevation);
    const theta = THREE.MathUtils.degToRad(this.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    this.envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) {
      this.envSky.material.uniforms[k].value = u[k].value;
    }
    const k = sampleKeys(this.elevation);
    this.keys = k;
    this.envDirty = true;
    this.applyStorm();
  }

  applyStorm() {
    const k = this.keys;
    const s = this.storm;
    // 雾色使用 HDR 亮度，与天空地平线匹配
    const fog = k.fog.clone().multiplyScalar(k.hz).lerp(STORM_FOG.clone().multiplyScalar(Math.max(0.05, k.hz * 0.75)), s);
    this.scene.fog.color.copy(fog);
    this.hazeUniforms.uHaze.value.copy(fog);
    this.hazeUniforms.uHazeAmt.value = 0.75 + s * 0.25;
    this.hazeUniforms.uHazeBase.value = 0.16 + s * 0.84;
    this.scene.fog.density = this.baseFogDensity + s * 0.022;
    this.sun.color.copy(k.sun).lerp(new THREE.Color('#d0a070'), s * 0.6);
    // 夜间：太阳光改为冷色月光
    const night = THREE.MathUtils.smoothstep(-this.elevation, 0.5, 4);
    this.sun.intensity = k.si * (1 - s * 0.75) + night * 0.55 * (1 - s);
    if (night > 0) this.sun.color.lerp(new THREE.Color('#9fb4e0'), night);
    this.starMat.opacity = night * (1 - s);
    this.stars.visible = night > 0.01;
    this.hemi.intensity = k.hi * (1 - s * 0.3);
    this.hemi.color.copy(k.fog).lerp(new THREE.Color(0xffffff), 0.35);
    this.hemi.groundColor.set(0x6a5a40).multiplyScalar(Math.max(0.15, k.hi));
    this.renderer.toneMappingExposure = k.exp * (1 + s * 0.15);
    this.mountainHaze.color.value.copy(fog).lerp(new THREE.Color('#a9b6c2').multiplyScalar(k.hz), 0.25 * (1 - s));
    this.mountainHaze.amount.value = 0.66 + s * 0.34;
    this.sky.material.uniforms.turbidity.value = 9 + s * 11;
    this.sky.material.uniforms.rayleigh.value = 1.4 * (1 - s * 0.7);
    // 沙尘暴中天空被尘雾遮蔽（由 uHazeBase 完成）
  }

  get isNight() { return this.elevation < 1.5; }

  update(dt, focus) {
    if (Math.abs(this.storm - this.stormTarget) > 0.001) {
      this.storm += Math.sign(this.stormTarget - this.storm) * Math.min(Math.abs(this.stormTarget - this.storm), dt * 0.25);
      this.applyStorm();
    }
    this.sky.material.uniforms.time.value += dt;
    // 阴影相机跟随焦点
    const d = 220;
    const L = this.elevation < -0.5 ? this.moonDir : this.sunDir;
    this.sun.position.set(focus.x + L.x * d, focus.y + Math.max(0.15, L.y) * d, focus.z + L.z * d);
    this.stars.position.copy(focus);
    this.sun.target.position.copy(focus);
    // 为避免阴影抖动，按纹素对齐
    this.envTimer -= dt;
    if (this.envDirty && this.envTimer <= 0) {
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = Math.max(0.05, Math.min(0.7, this.keys.hi * 0.8));
      this.envDirty = false;
      this.envTimer = 0.4;
    }
  }
}
