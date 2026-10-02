import * as THREE from 'three';

// 全局共享 uniform（风、时间）
export const GLOBAL = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStrength: { value: 1.0 },
};

/**
 * 作物材质：实例化 + 风吹摆动 + 收割后坍缩为茬。
 * 依赖实例属性 aCut（0 未割，1 已割）。
 */
export function patchPlantMaterial(material, { plantH = 1, sway = 0.1, stubble = 0.15 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = GLOBAL.uTime;
    shader.uniforms.uWindDir = GLOBAL.uWindDir;
    shader.uniforms.uWindStrength = GLOBAL.uWindStrength;
    shader.uniforms.uPlantH = { value: plantH };
    shader.uniforms.uSway = { value: sway };
    shader.uniforms.uStubble = { value: stubble };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aCut;
        uniform float uTime, uWindStrength, uPlantH, uSway, uStubble;
        uniform vec2 uWindDir;
        varying float vCutShade;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hN = clamp(transformed.y / uPlantH, 0.0, 1.4);
        vCutShade = 1.0;
        if (aCut > 0.5) {
          if (transformed.y > uStubble) {
            transformed.xz *= 0.06;
            transformed.y = uStubble + (transformed.y - uStubble) * 0.015;
          }
          hN = 0.0;
          vCutShade = 0.8;
        }
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
          float ph = dot(iPos.xz, vec2(0.37, 0.71));
          float wave = sin(dot(iPos.xz, uWindDir) * 0.11 - uTime * 1.5) * 0.5 + 0.5;
          float wave2 = sin(dot(iPos.xz, vec2(-uWindDir.y, uWindDir.x)) * 0.05 + uTime * 0.6) * 0.5 + 0.5;
          float gust = wave * wave * (0.6 + 0.4 * wave2);
          float flutter = sin(uTime * 2.7 + ph * 5.0) * 0.18 + sin(uTime * 4.9 + ph * 11.0) * 0.07;
          float bend = (gust + flutter + 0.25) * uWindStrength * uSway * hN * hN;
          vec3 wOff = vec3(uWindDir.x * bend, -abs(bend) * 0.3, uWindDir.y * bend);
          transformed += inverse(mat3(instanceMatrix)) * wOff;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vCutShade;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vCutShade;`);
  };
  material.customProgramCacheKey = () => `plant_${plantH}_${sway}_${stubble}`;
  return material;
}

export function makePlantDepthMaterial(opts) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  const p = { ...opts };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = GLOBAL.uTime;
    shader.uniforms.uWindDir = GLOBAL.uWindDir;
    shader.uniforms.uWindStrength = GLOBAL.uWindStrength;
    shader.uniforms.uPlantH = { value: p.plantH };
    shader.uniforms.uSway = { value: p.sway };
    shader.uniforms.uStubble = { value: p.stubble };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aCut;
        uniform float uTime, uWindStrength, uPlantH, uSway, uStubble;
        uniform vec2 uWindDir;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float hN = clamp(transformed.y / uPlantH, 0.0, 1.4);
        if (aCut > 0.5) {
          if (transformed.y > uStubble) { transformed.xz *= 0.06; transformed.y = uStubble; }
          hN = 0.0;
        }
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
          float wave = sin(dot(iPos.xz, uWindDir) * 0.11 - uTime * 1.5) * 0.5 + 0.5;
          float bend = (wave * wave + 0.25) * uWindStrength * uSway * hN * hN;
          transformed += inverse(mat3(instanceMatrix)) * vec3(uWindDir.x * bend, 0.0, uWindDir.y * bend);
        #endif`);
  };
  m.customProgramCacheKey = () => `plantdepth_${p.plantH}_${p.sway}_${p.stubble}`;
  return m;
}

/**
 * 世界坐标细节贴图（地面用）：叠加两层不同尺度的灰度噪声，消除平铺感。
 */
export function addWorldDetail(material, tex, scale = 0.25, strength = 1.0) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    shader.uniforms.uDetail = { value: tex };
    shader.uniforms.uDetailScale = { value: scale };
    shader.uniforms.uDetailStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec2 vDetailUv;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vDetailUv = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uDetail;
        uniform float uDetailScale, uDetailStrength;
        varying vec2 vDetailUv;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float d1 = texture2D(uDetail, vDetailUv * uDetailScale).r;
          float d2 = texture2D(uDetail, vDetailUv * uDetailScale * 0.173 + 0.31).r;
          float d3 = texture2D(uDetail, vDetailUv * uDetailScale * 3.7 + 0.71).r;
          float d = d1 * d2 * 4.0 * mix(1.0, d3 * 2.0, 0.5);
          diffuseColor.rgb *= mix(1.0, d, uDetailStrength);
        }`);
  };
  material.customProgramCacheKey = () => `detail_${scale}_${strength}`;
  return material;
}

/**
 * 车辆漆面积灰：越靠近地面灰尘越重，配合噪声。
 */
export function addDust(material, amount = 1.0, dustColor = new THREE.Color(0.55, 0.47, 0.36)) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDustColor = { value: dustColor };
    shader.uniforms.uDustAmount = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDustPos; varying vec3 vDustNormal;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vDustPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vDustNormal = mat3(modelMatrix) * objectNormal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uDustColor; uniform float uDustAmount;
        varying vec3 vDustPos; varying vec3 vDustNormal;
        float dHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float dNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(dHash(i+vec3(0,0,0)),dHash(i+vec3(1,0,0)),f.x), mix(dHash(i+vec3(0,1,0)),dHash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(dHash(i+vec3(0,0,1)),dHash(i+vec3(1,0,1)),f.x), mix(dHash(i+vec3(0,1,1)),dHash(i+vec3(1,1,1)),f.x),f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float n = dNoise(vDustPos * 2.3) * 0.6 + dNoise(vDustPos * 9.0) * 0.4;
          float groundY = vDustPos.y - (cameraPosition.y * 0.0);
          float low = 1.0 - smoothstep(0.0, 1.8, groundY - 0.0);
          float top = smoothstep(0.6, 1.0, normalize(vDustNormal + vec3(0.0, 1e-4, 0.0)).y) * 0.45;
          float dust = clamp((low * 0.85 + top) * (0.45 + n * 0.75) * uDustAmount, 0.0, 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor, dust);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, clamp((1.0 - smoothstep(0.0, 1.8, vDustPos.y)) * 0.8 * uDustAmount, 0.0, 1.0));`);
  };
  material.customProgramCacheKey = () => `dust_${amount}`;
  return material;
}
