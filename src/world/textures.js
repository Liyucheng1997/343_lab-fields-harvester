import * as THREE from 'three';
import { createNoise2D, fbm, mulberry32 } from './noise.js';

// 所有贴图均为程序生成（Canvas），不依赖外部资源

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// 可平铺的灰度细节噪声（均值约 0.5）
export function makeDetailTexture(size = 256, seed = 3, contrast = 0.35, octaves = 5, freq = 8) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n = createNoise2D(seed);
  const rand = mulberry32(seed * 7 + 1);
  // 环面采样实现无缝平铺
  const R = freq / (2 * Math.PI);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
      const nx = Math.cos(a) * R, ny = Math.sin(a) * R;
      const nz = Math.cos(b) * R, nw = Math.sin(b) * R;
      // 用两个 2D 噪声组合近似 4D 环面噪声
      let v = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < octaves; o++) {
        v += amp * (n(nx * f + nz * f * 0.7, ny * f + nw * f * 0.7) * 0.5 + n(nz * f + 17.3, nw * f - nx * f * 0.3 + 5.1) * 0.5);
        norm += amp; amp *= 0.55; f *= 2;
      }
      v /= norm;
      const g = 0.5 + v * contrast + (rand() - 0.5) * 0.06;
      const i = (y * size + x) * 4;
      const c8 = Math.max(0, Math.min(255, g * 255));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c8;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

// 白色护墙板（横向搭接木板）
export function makeClapboardTexture() {
  const c = canvas(256, 512);
  const ctx = c.getContext('2d');
  const rand = mulberry32(11);
  const boards = 16;
  const bh = c.height / boards;
  for (let i = 0; i < boards; i++) {
    const y = i * bh;
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    const base = 232 + rand() * 10;
    g.addColorStop(0, `rgb(${base - 40},${base - 42},${base - 46})`);
    g.addColorStop(0.12, `rgb(${base},${base - 2},${base - 8})`);
    g.addColorStop(0.9, `rgb(${base - 6},${base - 8},${base - 14})`);
    g.addColorStop(1, `rgb(${base - 30},${base - 32},${base - 38})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, c.width, bh);
  }
  // 风化斑驳
  for (let i = 0; i < 1400; i++) {
    const x = rand() * c.width, y = rand() * c.height;
    ctx.fillStyle = `rgba(${120 + rand() * 40},${110 + rand() * 30},${90 + rand() * 20},${rand() * 0.08})`;
    ctx.fillRect(x, y, 1 + rand() * 6, 1 + rand() * 2);
  }
  return toTexture(c);
}

// 屋顶沥青瓦
export function makeShingleTexture() {
  const c = canvas(512);
  const ctx = c.getContext('2d');
  const rand = mulberry32(21);
  ctx.fillStyle = '#3a3836';
  ctx.fillRect(0, 0, 512, 512);
  const rows = 16, rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 16;
    for (let x = -32; x < 512; x += 32) {
      const v = 45 + rand() * 30;
      ctx.fillStyle = `rgb(${v + 4},${v},${v - 4})`;
      ctx.fillRect(x + off + 1, r * rh + 1, 30, rh - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + off + 1, r * rh + rh - 4, 30, 3);
    }
  }
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(${rand() * 255 > 128 ? 255 : 0},${rand() * 60},0,${rand() * 0.05})`;
    ctx.fillRect(rand() * 512, rand() * 512, 1, 1);
  }
  return toTexture(c);
}

// 砖块（烟囱）
export function makeBrickTexture() {
  const c = canvas(256);
  const ctx = c.getContext('2d');
  const rand = mulberry32(31);
  ctx.fillStyle = '#8c8276';
  ctx.fillRect(0, 0, 256, 256);
  const bh = 16, bw = 48;
  for (let y = 0; y < 256; y += bh) {
    const off = ((y / bh) % 2) * (bw / 2);
    for (let x = -bw; x < 256; x += bw) {
      const r = 120 + rand() * 50, g = 55 + rand() * 25, b = 40 + rand() * 20;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
    }
  }
  return toTexture(c);
}

// 谷仓竖向木板（风化）
export function makeBarnTexture() {
  const c = canvas(512);
  const ctx = c.getContext('2d');
  const rand = mulberry32(41);
  const n = createNoise2D(41);
  const bw = 32;
  for (let x = 0; x < 512; x += bw) {
    const tone = rand();
    for (let y = 0; y < 512; y += 2) {
      const grain = n(x * 0.05, y * 0.01) * 0.5 + n(x * 0.3, y * 0.05) * 0.25;
      const base = 0.55 + grain * 0.25 + tone * 0.15;
      // 褪色的红漆 + 灰木
      const peel = n(x * 0.02 + 3, y * 0.008) > 0.25 ? 1 : 0;
      const r = peel ? 120 * base + 30 : 150 * base + 20;
      const g = peel ? 110 * base + 25 : 60 * base + 15;
      const b = peel ? 95 * base + 20 : 50 * base + 12;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.fillRect(x, y, bw, 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, 0, 2, 512);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + 2, 0, 1, 512);
  }
  return toTexture(c);
}

// 瓦楞镀锌钢板（粮仓）
export function makeCorrugatedTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rand = mulberry32(51);
  for (let x = 0; x < 256; x++) {
    const v = 0.5 + 0.5 * Math.sin((x / 256) * Math.PI * 2 * 16);
    const l = 140 + v * 90;
    ctx.fillStyle = `rgb(${l},${l + 3},${l + 6})`;
    ctx.fillRect(x, 0, 1, 256);
  }
  for (let y = 0; y < 256; y += 64) {
    ctx.fillStyle = 'rgba(40,40,40,0.5)';
    ctx.fillRect(0, y, 256, 2);
  }
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(${130 + rand() * 60},${100 + rand() * 40},${70},${rand() * 0.12})`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 8);
  }
  return toTexture(c);
}

// 碎石土路
export function makeGravelTexture() {
  const c = canvas(512);
  const ctx = c.getContext('2d');
  const rand = mulberry32(61);
  const n = createNoise2D(61);
  const img = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const v = fbm(n, x / 40, y / 40, 4) * 0.5 + 0.5;
      const i = (y * 512 + x) * 4;
      img.data[i] = 150 + v * 40;
      img.data[i + 1] = 132 + v * 34;
      img.data[i + 2] = 104 + v * 28;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 9000; i++) {
    const l = 90 + rand() * 120;
    ctx.fillStyle = `rgba(${l},${l * 0.92},${l * 0.8},${0.4 + rand() * 0.5})`;
    const s = 1 + rand() * 3;
    ctx.beginPath();
    ctx.arc(rand() * 512, rand() * 512, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // 车辙
  for (const cx of [150, 362]) {
    const g = ctx.createLinearGradient(cx - 50, 0, cx + 50, 0);
    g.addColorStop(0, 'rgba(60,45,30,0)');
    g.addColorStop(0.5, 'rgba(60,45,30,0.22)');
    g.addColorStop(1, 'rgba(60,45,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 50, 0, 100, 512);
  }
  return toTexture(c);
}

// 谷粒堆
export function makeGrainTexture(r, g, b) {
  const c = canvas(256);
  const ctx = c.getContext('2d');
  const rand = mulberry32(71);
  ctx.fillStyle = `rgb(${r * 0.7},${g * 0.7},${b * 0.7})`;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const k = 0.75 + rand() * 0.35;
    ctx.fillStyle = `rgb(${Math.min(255, r * k)},${Math.min(255, g * k)},${b * k})`;
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 256, 2 + rand() * 1.5, 1.5 + rand(), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

// 草丛卡片（alpha）
export function makeGrassCardTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rand = mulberry32(81);
  ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x0 = 20 + rand() * 216;
    const h = 120 + rand() * 130;
    const lean = (rand() - 0.5) * 80;
    const dry = rand();
    const r = 110 + dry * 80, g = 105 + dry * 50, b = 50 + dry * 30;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(x0, 256);
    ctx.quadraticCurveTo(x0 + lean * 0.3, 256 - h * 0.6, x0 + lean, 256 - h);
    ctx.stroke();
    if (rand() < 0.25) {
      // 草穗
      ctx.fillStyle = `rgb(${r + 20},${g + 10},${b})`;
      ctx.beginPath();
      ctx.ellipse(x0 + lean, 256 - h, 3, 10, lean * 0.01, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(c, { repeat: false });
}

// 柔和圆形粒子
export function makeSoftDot() {
  const c = canvas(64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, { repeat: false });
}

// 田地状态画布（土壤底色 + 收割后的秸秆）
export function makeFieldCanvas(wMeters, hMeters, pxPerM, baseColor, rowAlongZ = true, seed = 5) {
  const c = canvas(Math.ceil(wMeters * pxPerM), Math.ceil(hMeters * pxPerM));
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, c.width, c.height);
  // 土壤斑块
  for (let i = 0; i < c.width * c.height * 0.02; i++) {
    const a = rand() * 0.12;
    ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,240,210,${a * 0.6})`;
    ctx.fillRect(rand() * c.width, rand() * c.height, 1 + rand() * 4, 1 + rand() * 4);
  }
  return c;
}
