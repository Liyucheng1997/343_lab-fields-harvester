import { createNoise2D, fbm } from './noise.js';

// 世界坐标：x 向东，z 向南，y 向上。单位：米
const noise = createNoise2D(1977);
const noise2 = createNoise2D(2014);

export const FIELDS = [
  {
    id: 'corn', name: '玉米地', crop: 'corn',
    minX: -112, maxX: -12, minZ: 8, maxZ: 118,
    header: 'corn',
  },
  {
    id: 'wheat', name: '小麦地', crop: 'wheat',
    minX: 12, maxX: 92, minZ: 8, maxZ: 98,
    header: 'grain',
  },
  {
    id: 'soy', name: '大豆地', crop: 'soy',
    minX: 116, maxX: 186, minZ: 8, maxZ: 98,
    header: 'grain',
  },
];

export const ROAD = { z: -24, width: 7 }; // 东西向主路
export const LANE = { x: 0, width: 4, z0: -20, z1: 125 }; // 玉米地与小麦地之间的南北向田间小路

export const FARM = {
  house: { x: -34, z: -52, rot: 0.08 },
  barn: { x: 12, z: -66, rot: -0.05 },
  bins: [{ x: 38, z: -54 }, { x: 47, z: -54 }, { x: 56, z: -54 }],
  pickup: { x: -20, z: -38, rot: 1.9 },
  truck: { x: 0, z: -17, rot: Math.PI / 2 }, // 运粮车，车身沿 x 轴
  windmill: { x: -62, z: -70 },
};

// 卸粮时收割机停车姿态（运粮车在收割机左侧）
export const UNLOAD_POSE = { x: 0, z: -9.2, yaw: Math.PI / 2 };
export const PARK_POSE = { x: 52, z: -36, yaw: Math.PI / 2 };

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function heightAt(x, z) {
  const r = Math.hypot(x - 30, z - 40);
  let h = fbm(noise, x / 110, z / 110, 3) * 0.7;
  h += fbm(noise2, x / 22, z / 22, 2) * 0.06;
  const hills = smoothstep(260, 750, r);
  if (hills > 0) {
    h += hills * (fbm(noise, x / 420 + 10, z / 420 - 4, 4) * 0.5 + 0.55) * 32;
  }
  // 道路处略微压平
  const dRoad = Math.abs(z - ROAD.z);
  if (dRoad < 10) h = h * (0.6 + 0.4 * smoothstep(3, 10, dRoad)) - 0.05 * (1 - smoothstep(3.5, 5, dRoad));
  return h;
}

export function fieldAt(x, z, margin = 0) {
  for (const f of FIELDS) {
    if (x >= f.minX - margin && x <= f.maxX + margin && z >= f.minZ - margin && z <= f.maxZ + margin) return f;
  }
  return null;
}

export function isOnRoad(x, z, extra = 0) {
  if (Math.abs(z - ROAD.z) < ROAD.width / 2 + extra) return true;
  if (Math.abs(x - LANE.x) < LANE.width / 2 + extra && z > LANE.z0 && z < LANE.z1) return true;
  return false;
}
