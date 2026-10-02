import * as THREE from 'three';

// 通用粒子系统（尘土、秸秆碎屑、谷粒流、尾气）
export class ParticleSystem {
  constructor(scene, { max = 2000, blending = THREE.NormalBlending, sizeAtten = 300, fog = true, soft = 1.0 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: sizeAtten },
        fogColor: { value: new THREE.Color() },
        fogDensity: { value: 0 },
        uSoft: { value: soft },
        uLight: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: /* glsl */`
        attribute float size;
        attribute vec4 color;
        uniform float uScale;
        varying vec4 vColor;
        varying float vFogDepth;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mv.z;
          gl_PointSize = size * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 fogColor;
        uniform float fogDensity;
        uniform float uSoft;
        uniform vec3 uLight;
        varying vec4 vColor;
        varying float vFogDepth;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c) * 2.0;
          if (d > 1.0) discard;
          float a = mix(1.0 - step(0.85, d), pow(1.0 - d, 1.6), uSoft);
          vec3 col = vColor.rgb * uLight;
          float f = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          col = mix(col, fogColor, f);
          gl_FragColor = vec4(col, vColor.a * a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.tmpColor = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, { life = 2, size = 1, grow = 0, color = 0xffffff, alpha = 1, drag = 0.5, gravity = 0 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = color.isColor ? color : this.tmpColor.set(color);
    this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = 0;
    this.alpha0[i] = alpha;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.grav[i] = gravity;
  }

  update(dt, scene, groundFn) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      v[i * 3] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k - this.grav[i] * dt; v[i * 3 + 2] *= k;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (groundFn && this.grav[i] > 0) {
        const g = groundFn(p[i * 3], p[i * 3 + 2]);
        if (p[i * 3 + 1] < g) { p[i * 3 + 1] = g; v[i * 3] *= 0.3; v[i * 3 + 1] = 0; v[i * 3 + 2] *= 0.3; this.life[i] = Math.min(this.life[i], 0.5); }
      }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      // 淡入淡出
      const fade = Math.min(1, (1 - t) * 8) * Math.min(1, t * 2.2);
      this.col[i * 4 + 3] = this.alpha0[i] * Math.max(0, fade);
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    if (scene.fog) {
      this.material.uniforms.fogColor.value.copy(scene.fog.color);
      this.material.uniforms.fogDensity.value = scene.fog.density;
    }
  }
}
