import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { GLOBAL } from './world/shaders.js';
import { makeDetailTexture } from './world/textures.js';
import { FIELDS, FARM, heightAt } from './world/layout.js';
import { buildTerrain, buildGrass, buildFarFields } from './world/terrain.js';
import { CropField } from './world/crops.js';
import { Environment } from './world/environment.js';
import { buildFarm } from './world/farm.js';
import { ParticleSystem } from './world/particles.js';
import { Combine } from './vehicle/combine.js';
import { Autopilot } from './vehicle/autopilot.js';
import { CameraRig } from './ui/cameraRig.js';
import { Hud } from './ui/hud.js';
import { FarmAudio } from './ui/audio.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => setTimeout(r, 20));
let __t0 = performance.now();
async function progress(p, text) {
  console.log(`[load] ${(performance.now() - __t0).toFixed(0)}ms → ${text}`);
  $('loadbar').style.width = `${p * 100}%`;
  $('loadtext').textContent = text;
  await nextFrame();
}

const QUALITY = {
  low: { pr: 1, lod: 24, shadow: 2048, grass: 12000, bloom: false },
  medium: { pr: 1.25, lod: 40, shadow: 4096, grass: 24000, bloom: true },
  high: { pr: 2, lod: 62, shadow: 4096, grass: 34000, bloom: true },
};

// 胶片调色：暖色、轻微褪色、暗角、颗粒（在 sRGB 输出之后执行）
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uStorm: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uStorm; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114));
      // 略降饱和 + 暖色偏移，营造尘土弥漫的年代感
      c = mix(vec3(l), c, 0.88 - uStorm * 0.25);
      c *= vec3(1.04, 1.0, 0.92);
      c = c * 0.96 + vec3(0.025, 0.02, 0.012);
      // 柔和 S 曲线
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.2, length(d * vec2(1.15, 1.0)));
      c *= mix(1.0 - uVignette, 1.0, vig);
      float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.3) * 100.0) - 0.5;
      c += g * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

async function init() {
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.medium.pr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 12000);
  camera.position.set(-60, 8, -30);

  await progress(0.05, '生成地表细节…');
  const detailTex = makeDetailTexture(256, 3, 0.4, 5, 6);
  const env = new Environment(scene, renderer);
  await progress(0.12, '塑造地形与道路…');
  buildTerrain(scene, detailTex);
  buildFarFields(scene);
  let grass = buildGrass(scene, QUALITY.medium.grass);

  const fields = [];
  const labels = { corn: '种植玉米', wheat: '播种小麦', soy: '种植大豆' };
  for (let i = 0; i < FIELDS.length; i++) {
    await progress(0.2 + i * 0.2, `${labels[FIELDS[i].crop]}（${FIELDS[i].name}）…`);
    fields.push(new CropField(FIELDS[i], scene, detailTex));
  }
  await progress(0.82, '建造农舍、谷仓与粮仓…');
  const farm = buildFarm(scene);
  await progress(0.9, '组装联合收割机…');
  const combine = new Combine(scene);
  combine.colliders = farm.colliders;
  const autopilot = new Autopilot(combine, fields);

  // 粒子
  const dust = new ParticleSystem(scene, { max: 2600, soft: 1 });
  const chaff = new ParticleSystem(scene, { max: 3500, soft: 0.25 });
  const grain = new ParticleSystem(scene, { max: 1800, soft: 0.3 });
  const smoke = new ParticleSystem(scene, { max: 500, soft: 1 });
  const motes = new ParticleSystem(scene, { max: 900, soft: 1, blending: THREE.AdditiveBlending });
  const stormPS = new ParticleSystem(scene, { max: 1600, soft: 1 });
  const allPS = [dust, chaff, grain, smoke, motes, stormPS];

  // 后期
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.16, 0.6, 5.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const rig = new CameraRig(camera, canvas, combine);
  rig.fields = fields;
  const hud = new Hud(fields);
  const audio = new FarmAudio();

  // ---------------- 状态 ----------------
  const state = {
    auto: true, lights: false, storm: false, sound: false, quality: 'medium',
    totals: { corn: 0, wheat: 0, soy: 0 },
    cutRate: 0,
  };
  const truckPos = { x: FARM.truck.x, z: FARM.truck.z };
  let truckLoad = 6500;
  farm.truck.setLoad(truckLoad, 'corn');
  // 卸粮时的谷物流（滚动贴图的半透明圆柱）
  const streamTex = new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    for (let i = 0; i < 900; i++) {
      const v = 160 + Math.random() * 95;
      x.fillStyle = `rgba(${v},${v * 0.8 | 0},${v * 0.3 | 0},${0.5 + Math.random() * 0.5})`;
      x.fillRect(Math.random() * 64, Math.random() * 256, 2 + Math.random() * 3, 3 + Math.random() * 5);
    }
    return c;
  })());
  streamTex.wrapS = streamTex.wrapT = THREE.RepeatWrapping;
  streamTex.colorSpace = THREE.SRGBColorSpace;
  const streamMat = new THREE.MeshStandardMaterial({ map: streamTex, transparent: true, opacity: 0.9, roughness: 0.8, depthWrite: false, color: '#ffffff' });
  const streamGeo = new THREE.CylinderGeometry(0.1, 0.17, 1, 10, 1, true);
  streamGeo.translate(0, -0.5, 0);
  const stream = new THREE.Mesh(streamGeo, streamMat);
  stream.visible = false;
  scene.add(stream);
  let truckCrop = 'corn';

  function applyQuality(q) {
    state.quality = q;
    const Q = QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pr));
    onResize();
    env.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (env.sun.shadow.map) { env.sun.shadow.map.dispose(); env.sun.shadow.map = null; }
    bloom.enabled = Q.bloom;
    scene.remove(grass);
    grass.geometry.dispose();
    grass = buildGrass(scene, Q.grass);
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w < 2 || h < 2) return; // 窗口最小化时跳过
    renderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const scale = (h * renderer.getPixelRatio()) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (const p of allPS) p.material.uniforms.uScale.value = scale;
  }
  window.addEventListener('resize', onResize);
  onResize();

  // ---------------- 输入 ----------------
  const keys = new Set();
  const manualKeys = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  function setAuto(on) {
    state.auto = on;
    if (on) { autopilot.engage(); hud.toast('自动驾驶已接管：规划作业路径'); }
    else { autopilot.disengage(); hud.toast('已切换为手动驾驶'); }
  }
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.code);
    if (manualKeys.includes(e.code) && state.auto) setAuto(false);
    switch (e.code) {
      case 'KeyP': setAuto(!state.auto); break;
      case 'KeyE': if (!state.auto) combine.headerDown = !combine.headerDown; break;
      case 'KeyH': combine.setHeader(combine.headerType === 'corn' ? 'grain' : 'corn'); hud.toast(combine.headerType === 'corn' ? '已换装玉米割台' : '已换装谷物割台（小麦 / 大豆）'); break;
      case 'KeyU': if (!state.auto) combine.unloadOut = !combine.unloadOut; break;
      case 'KeyL': toggleLights(); break;
      case 'KeyF': toggleStorm(); break;
      case 'KeyM': toggleSound(); break;
      case 'KeyC': {
        const modes = ['chase', 'cab', 'cinematic', 'free'];
        setCam(modes[(modes.indexOf(rig.mode) + 1) % modes.length]);
        break;
      }
      case 'KeyR': {
        combine.v = 0;
        combine.x = -30; combine.z = -10.5; combine.yaw = Math.PI / 2;
        if (state.auto) autopilot.replan();
        hud.toast('车辆已复位');
        break;
      }
      case 'Slash': $('help').classList.toggle('collapsed'); break;
      case 'KeyT': { const seq = [1, 2, 4, 8]; setSpeed(seq[(seq.indexOf(state.timeScale || 1) + 1) % seq.length]); hud.toast(`作业倍速 ${state.timeScale}×`); break; }
      case 'Digit1': setCam('chase'); break;
      case 'Digit2': setCam('cab'); break;
      case 'Digit3': setCam('cinematic'); break;
      case 'Digit4': setCam('free'); break;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  function setCam(m) {
    rig.setMode(m);
    document.querySelectorAll('#camSeg button').forEach((b) => b.classList.toggle('on', b.dataset.cam === m));
    onResize();
  }
  function toggleLights(force) {
    state.lights = force ?? !state.lights;
    combine.lightsOn = state.lights;
    $('btnLights').classList.toggle('on', state.lights);
  }
  function toggleStorm() {
    state.storm = !state.storm;
    env.setStorm(state.storm);
    $('btnStorm').classList.toggle('on', state.storm);
    hud.toast(state.storm ? '沙尘暴来袭…' : '沙尘暴正在散去');
  }
  function toggleSound() {
    state.sound = !state.sound;
    audio.setEnabled(state.sound);
    $('btnSound').classList.toggle('on', state.sound);
  }
  document.querySelectorAll('#camSeg button').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam)));
  document.querySelectorAll('#qualSeg button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#qualSeg button').forEach((x) => x.classList.toggle('on', x === b));
    applyQuality(b.dataset.q);
  }));
  function setSpeed(v) {
    state.timeScale = v;
    document.querySelectorAll('#speedSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.s === v));
  }
  document.querySelectorAll('#speedSeg button').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.s)));
  $('btnStorm').addEventListener('click', toggleStorm);
  $('btnLights').addEventListener('click', () => toggleLights());
  $('btnSound').addEventListener('click', toggleSound);
  $('btnReset').addEventListener('click', () => {
    for (const f of fields) f.reset();
    hud.toast('所有田块已重新种植');
    if (state.auto) autopilot.replan();
  });
  $('help').querySelector('.help-head').addEventListener('click', () => $('help').classList.toggle('collapsed'));
  const timeSlider = $('timeSlider');
  function timeLabel(e) {
    if (e < -1) return '夜晚';
    if (e < 4) return '黄昏';
    if (e < 14) return '傍晚';
    if (e < 30) return '午后';
    return '正午';
  }
  timeSlider.addEventListener('input', () => {
    const e = parseFloat(timeSlider.value);
    env.setElevation(e);
    $('timeLabel').textContent = timeLabel(e);
    const night = e < 2;
    if (night !== state.lights) toggleLights(night);
  });

  // ---------------- 主循环 ----------------
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let hudTimer = 0, texTimer = 0, mapTimer = 0;
  const dustColor = new THREE.Color('#a48c68');
  const chaffColors = { corn: new THREE.Color('#bba57a'), wheat: new THREE.Color('#e2cc8e'), soy: new THREE.Color('#b59c72') };
  const grainColors = { corn: new THREE.Color('#f0b830'), wheat: new THREE.Color('#d8aa5c'), soy: new THREE.Color('#e0c486') };
  const smokeColor = new THREE.Color('#5a554e');
  const moteColor = new THREE.Color('#fff2d8');
  const stormColor = new THREE.Color('#7e6244');
  const wind = GLOBAL.uWindDir.value;
  let lastCrop = 'corn';

  function trailerTop(x, z) {
    // 运粮车挂车区域（世界坐标，车身沿 x 轴）
    const tx0 = truckPos.x - 8.7, tx1 = truckPos.x + 2.3;
    if (x > tx0 && x < tx1 && Math.abs(z - truckPos.z) < 1.25) {
      return heightAt(x, z) + 1.6 + Math.min(1, truckLoad / farm.truck.capacity) * 1.6;
    }
    return heightAt(x, z);
  }

  function emitParticles(dt, cutCount) {
    const root = combine.root;
    root.updateMatrixWorld(true);
    const v = Math.abs(combine.v);
    const fwd = tmp2.set(Math.sin(combine.yaw), 0, Math.cos(combine.yaw));
    // 车轮扬尘
    const dustRate = v * 9 * (1 + env.storm);
    let n = dustRate * dt + Math.random();
    while (n-- >= 1) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const back = Math.random() < 0.5 ? -0.6 : -4.4;
      root.localToWorld(tmp.set(side * (1.4 + Math.random() * 0.4), 0.3, back));
      dust.emit(tmp.x, tmp.y, tmp.z,
        wind.x * 1.2 + (Math.random() - 0.5) * 1.2 - fwd.x * v * 0.2, 0.4 + Math.random() * 0.8, wind.y * 1.2 + (Math.random() - 0.5) * 1.2 - fwd.z * v * 0.2,
        { life: 3 + Math.random() * 3, size: 1.2 + Math.random(), grow: 1.6, color: dustColor, alpha: 0.16, drag: 0.5 });
    }
    // 秸秆碎屑（抛撒器）
    if (cutCount > 0 || state.cutRate > 5) {
      const rate = Math.min(420, state.cutRate * 2.2 + 30);
      let m = rate * dt + Math.random();
      const cc = chaffColors[lastCrop];
      const lx = Math.cos(combine.yaw), lz = -Math.sin(combine.yaw);
      root.localToWorld(tmp.copy(combine.parts.chaffOrigin));
      while (m-- >= 1) {
        const lat = (Math.random() - 0.5) * 9;
        const bv = 2 + Math.random() * 3;
        chaff.emit(tmp.x + (Math.random() - 0.5) * 0.8 * lx, tmp.y, tmp.z + (Math.random() - 0.5) * 0.8 * lz,
          -fwd.x * bv + lx * lat + wind.x * 0.6, 1 + Math.random() * 1.6, -fwd.z * bv + lz * lat + wind.y * 0.6,
          { life: 1.8 + Math.random() * 1.4, size: 0.07 + Math.random() * 0.08, color: cc, alpha: 0.95, drag: 1.4, gravity: 2.2 });
      }
      // 割台前方扬起的灰尘
      let k = (state.cutRate * 0.12) * dt + Math.random();
      const hdr = combine.headerInfo();
      while (k-- >= 1) {
        root.localToWorld(tmp.set((Math.random() - 0.5) * hdr.halfW * 2, 0.5 + Math.random(), hdr.zMax - 0.5));
        dust.emit(tmp.x, tmp.y, tmp.z, wind.x * 1.5 + fwd.x * v * 0.5, 0.6 + Math.random() * 0.6, wind.y * 1.5 + fwd.z * v * 0.5,
          { life: 3.5 + Math.random() * 2, size: 1.6 + Math.random() * 1.2, grow: 2.2, color: chaffColors[lastCrop], alpha: 0.13, drag: 0.6 });
        // 后方的大团尘雾
        root.localToWorld(tmp.set((Math.random() - 0.5) * 3, 1.2, -6.5));
        dust.emit(tmp.x, tmp.y, tmp.z, wind.x * 1.4 - fwd.x * 1.5, 0.3 + Math.random() * 0.5, wind.y * 1.4 - fwd.z * 1.5,
          { life: 4 + Math.random() * 3, size: 2.2 + Math.random() * 1.5, grow: 2.6, color: dustColor, alpha: 0.12, drag: 0.4 });
      }
    }
    // 尾气
    let s = (4 + combine.headerPos * 6 + v) * dt + Math.random();
    root.localToWorld(tmp.copy(combine.parts.exhaust));
    while (s-- >= 1) {
      smoke.emit(tmp.x, tmp.y, tmp.z, wind.x * 1.5 + (Math.random() - 0.5) * 0.3, 1.8 + Math.random(), wind.y * 1.5 + (Math.random() - 0.5) * 0.3,
        { life: 2.5 + Math.random() * 1.5, size: 0.35, grow: 1.4, color: smokeColor, alpha: 0.18, drag: 0.8 });
    }
  }

  function emitAmbient(dt) {
    // 空气中漂浮的尘埃（逆光闪烁）
    let n = 40 * dt + Math.random();
    while (n-- >= 1) {
      const r = 3 + Math.random() * 28, a = Math.random() * Math.PI * 2;
      const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
      const y = heightAt(x, z) + 0.5 + Math.random() * 5;
      motes.emit(x, y, z, wind.x * 0.6 + (Math.random() - 0.5) * 0.3, (Math.random() - 0.4) * 0.15, wind.y * 0.6 + (Math.random() - 0.5) * 0.3,
        { life: 5 + Math.random() * 5, size: 0.03 + Math.random() * 0.04, color: moteColor, alpha: 0.55, drag: 0.1 });
    }
    // 沙尘暴
    if (env.storm > 0.02) {
      let m = 110 * env.storm * dt + Math.random();
      while (m-- >= 1) {
        const r = 10 + Math.random() * 90, a = Math.random() * Math.PI * 2;
        const x = camera.position.x + Math.cos(a) * r - wind.x * 40, z = camera.position.z + Math.sin(a) * r - wind.y * 40;
        const y = heightAt(x, z) + Math.random() * 14;
        stormPS.emit(x, y, z, wind.x * (7 + Math.random() * 5), (Math.random() - 0.3) * 0.8, wind.y * (7 + Math.random() * 5),
          { life: 6 + Math.random() * 4, size: 7 + Math.random() * 9, grow: 2, color: stormColor, alpha: 0.22 * env.storm, drag: 0.05 });
      }
    }
  }

  function simCore(dt) {
    // 驾驶
    if (state.auto) {
      const cmd = autopilot.update(dt);
      combine.headerDown = cmd.headerDown;
      if (autopilot.state !== 'unloading' && autopilot.state !== 'leaveTruck') combine.unloadOut = autopilot.state === 'unloading';
      combine.drive(dt, cmd, true);
    } else {
      const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      combine.drive(dt, { throttle, steer, brake: keys.has('Space') }, false);
    }
    combine.beaconOn = state.auto || combine.headerDown;
    combine.update(dt);

    // 收割
    const res = combine.harvest(fields);
    if (res.crop) lastCrop = res.crop;
    state.cutRate += ((res.count / Math.max(dt, 1e-3)) - state.cutRate) * Math.min(1, dt * 3);

    // 卸粮
    const flow = combine.unload(dt);
    if (flow > 0) {
      const spout = combine.spoutWorld(tmp);
      const intoTruck = spout.x > truckPos.x - 9 && spout.x < truckPos.x + 2.6 && Math.abs(spout.z - truckPos.z) < 1.6;
      if (intoTruck) {
        truckLoad += flow;
        truckCrop = combine.tankCrop;
        state.totals[combine.tankCrop] += flow;
        farm.truck.setLoad(truckLoad, truckCrop);
      }
      let n = 160 * dt + Math.random();
      const gc = grainColors[combine.tankCrop];
      while (n-- >= 1) {
        grain.emit(spout.x + (Math.random() - 0.5) * 0.2, spout.y, spout.z + (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.5, -1.5 - Math.random(), (Math.random() - 0.5) * 0.5,
          { life: 2, size: 0.1 + Math.random() * 0.1, color: gc, alpha: 1, drag: 0.2, gravity: 9.8 });
        if (Math.random() < 0.15) {
          dust.emit(spout.x, spout.y - 2.5, spout.z, wind.x, 0.4, wind.y, { life: 2.5, size: 1.0, grow: 1.4, color: gc, alpha: 0.1, drag: 0.6 });
        }
      }
    }
    // 运粮车装满后换车
    if (truckLoad >= farm.truck.capacity && Math.hypot(combine.x - truckPos.x, combine.z - truckPos.z) > 35) {
      truckLoad = 0;
      farm.truck.setLoad(0);
      hud.toast('运粮车已满载驶离，新的空车已就位');
    }
    return { res, flow };
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    GLOBAL.uTime.value += dt;
    GLOBAL.uWindStrength.value = 1 + env.storm * 2.5;

    let res = { count: 0 }, flow = 0;
    const steps = state.timeScale || 1;
    for (let i = 0; i < steps; i++) {
      const r = simCore(dt);
      res = r.res; flow = r.flow;
    }
    // 谷物流
    stream.visible = flow > 0;
    if (flow > 0) {
      const sp = combine.spoutWorld(tmp);
      const bottom = trailerTop(sp.x, sp.z);
      stream.position.copy(sp);
      stream.scale.set(1, Math.max(0.3, sp.y - bottom), 1);
      streamTex.offset.y += dt * 2.5;
      streamMat.color.copy(grainColors[combine.tankCrop]).multiplyScalar(1.6);
    }
    emitParticles(dt, res.count);
    emitAmbient(dt);
    const sunK = Math.max(0.12, Math.min(1.2, env.sun.intensity / 2.6 + env.hemi.intensity * 0.5));
    for (const p of allPS) {
      p.material.uniforms.uLight.value.setScalar(sunK).multiply(new THREE.Color(1, 0.96, 0.9));
      p.update(dt, scene, p === grain ? trailerTop : p === chaff ? heightAt : null);
    }

    // 风车
    farm.windmill.wheel.rotation.z -= dt * (1.5 + env.storm * 5);

    // LOD 与地面贴图
    const lodDist = QUALITY[state.quality].lod;
    const focus = tmp.set(combine.x, combine.y, combine.z);
    for (const f of fields) f.updateLOD(camera.position, lodDist, focus, 75);
    texTimer -= dt;
    if (texTimer <= 0) { for (const f of fields) f.flushTexture(); texTimer = 0.2; }

    env.update(dt, focus);
    farm.porchLampMat.emissiveIntensity = env.isNight ? 4 : 0.2;
    rig.update(dt);

    audio.update({
      speed: combine.v, load: Math.min(1, state.cutRate / 250), threshing: combine.headerPos > 0.5,
      cutRate: state.cutRate, storm: env.storm, unloading: flow > 0, camDist: camera.position.distanceTo(combine.root.position),
    });

    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      hud.update(0.1, {
        auto: state.auto, headerType: combine.headerType, task: state.auto ? autopilot.task : manualTask(),
        speed: combine.v, headerPos: combine.headerPos, steer: combine.steer, cutRate: state.cutRate,
        unloadPos: combine.unloadPos, unloading: flow > 0, tank: combine.tank, capacity: combine.capacity,
        totals: state.totals, truckLoad, truckCap: farm.truck.capacity,
      });
    }
    mapTimer -= dt;
    if (mapTimer <= 0) { mapTimer = 0.15; hud.drawMap(combine, state.auto ? autopilot.path : null, autopilot.idx, truckPos); }

    grade.uniforms.uTime.value += dt;
    grade.uniforms.uStorm.value = env.storm;
    if (window.innerWidth > 1 && window.innerHeight > 1) composer.render();
    requestAnimationFrame(frame);
  }

  function manualTask() {
    if (combine.tankFill > 0.98) return '粮仓已满！驶到运粮车旁（车在左侧）按 U 卸粮';
    if (combine.unloadOut) return '卸粮搅龙已展开';
    if (combine.headerDown) return '割台已放下 · 驶入作物开始收割';
    return '按 E 放下割台，W/A/S/D 驾驶';
  }

  await progress(1, '准备就绪');
  // 预热一帧，编译着色器
  rig.setMode('chase');
  env.update(0.016, new THREE.Vector3(combine.x, combine.y, combine.z));
  for (const f of fields) f.updateLOD(camera.position, QUALITY.medium.lod, null, 0);
  if (window.innerWidth > 1 && window.innerHeight > 1) {
    renderer.compile(scene, camera);
    composer.render();
  }
  console.log(`[load] compiled ${(performance.now() - __t0).toFixed(0)}ms`);
  $('loading').classList.add('hidden');
  $('startBtn').classList.remove('hidden');
  $('startBtn').addEventListener('click', () => {
    $('intro').classList.add('fade');
    $('hud').classList.remove('hidden');
    setTimeout(() => $('intro').remove(), 1800);
    if (!state.sound) toggleSound();
    setAuto(true);
  });
  if (location.search.includes('skip')) $('startBtn').click();
  // 调试接口
  window.__farm = { simCore: (dt, n) => { for (let i = 0; i < n; i++) simCore(dt); }, THREE, combine, autopilot, fields, env, camera, rig, state, renderer, scene, setCam, farm, composer, bloom, grade };
  clock.start();
  requestAnimationFrame(frame);
}

init().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadtext');
  if (t) t.textContent = '加载失败：' + e.message;
});
