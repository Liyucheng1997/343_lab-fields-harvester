import { CROP_INFO } from '../world/crops.js';
import { ROAD, LANE, FARM } from '../world/layout.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(fields) {
    this.fields = fields;
    this.el = {
      mode: $('modeChip'), crop: $('cropChip'), task: $('task'), speed: $('speed'),
      hdr: $('hdrState'), steer: $('steerDot'), feed: $('feedMeter'), unload: $('unloadState'),
      tankFill: $('tankFill'), tankText: $('tankText'), fieldList: $('fieldList'), totals: $('totals'),
      toast: $('toast'), map: $('minimap'),
    };
    this.el.fieldList.innerHTML = fields.map((f) => `
      <div class="fld">
        <div class="fld-top"><span>${f.def.name}</span><b id="fp_${f.def.id}">0%</b></div>
        <div class="fld-bar"><div id="fb_${f.def.id}" style="width:0;background:${CROP_INFO[f.crop].color}"></div></div>
      </div>`).join('');
    this.mapCtx = this.el.map.getContext('2d');
    this.toastTimer = 0;
    // 小地图范围
    this.view = { x0: -140, x1: 215, z0: -105, z1: 140 };
  }

  toast(msg, sec = 3) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    this.toastTimer = sec;
  }

  update(dt, s) {
    const e = this.el;
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) e.toast.classList.remove('show'); }
    e.mode.textContent = s.auto ? '自动驾驶' : '手动驾驶';
    e.mode.className = 'chip ' + (s.auto ? 'auto' : 'manual');
    e.crop.textContent = s.headerType === 'corn' ? '玉米割台 · 8 行' : '谷物割台 · 9.1 m';
    e.task.textContent = s.task;
    e.speed.textContent = (Math.abs(s.speed) * 3.6).toFixed(1);
    e.hdr.textContent = s.headerPos > 0.9 ? '作业位置' : s.headerPos < 0.1 ? '抬起' : '升降中…';
    e.steer.style.left = `${50 - (s.steer / 0.68) * 50}%`;
    e.feed.style.width = `${Math.min(100, s.cutRate / 3)}%`;
    e.unload.textContent = s.unloadPos > 0.95 ? (s.unloading ? '卸粮中' : '展开') : s.unloadPos < 0.05 ? '收起' : '摆动中…';
    const fill = s.tank / s.capacity;
    e.tankFill.style.width = `${fill * 100}%`;
    e.tankFill.classList.toggle('full', fill > 0.98);
    e.tankText.textContent = `${Math.round(s.tank)} / ${s.capacity} kg`;
    for (const f of this.fields) {
      const p = Math.min(100, f.progress * 100);
      $(`fp_${f.def.id}`).textContent = `${p.toFixed(1)}%`;
      $(`fb_${f.def.id}`).style.width = `${p}%`;
    }
    e.totals.innerHTML = Object.entries(s.totals).map(([k, v]) =>
      `<span>${CROP_INFO[k].name}</span><b>${(v / 1000).toFixed(2)} t</b>`).join('') +
      `<span>运粮车</span><b>${(s.truckLoad / 1000).toFixed(1)} / ${(s.truckCap / 1000).toFixed(0)} t</b>`;
  }

  drawMap(combine, path, pathIdx, truckPos) {
    const ctx = this.mapCtx;
    const W = this.el.map.width, H = this.el.map.height;
    const v = this.view;
    const sx = W / (v.x1 - v.x0), sz = H / (v.z1 - v.z0);
    const s = Math.min(sx, sz);
    const ox = (W - (v.x1 - v.x0) * s) / 2, oz = (H - (v.z1 - v.z0) * s) / 2;
    const X = (x) => ox + (x - v.x0) * s, Z = (z) => oz + (z - v.z0) * s;
    ctx.fillStyle = '#5b5a3c';
    ctx.fillRect(0, 0, W, H);
    // 道路
    ctx.fillStyle = '#9c8a68';
    ctx.fillRect(0, Z(ROAD.z - ROAD.width / 2), W, ROAD.width * s);
    ctx.fillRect(X(LANE.x - LANE.width / 2), Z(ROAD.z), LANE.width * s, (LANE.z1 - ROAD.z) * s);
    // 田块
    for (const f of this.fields) {
      const d = f.def;
      ctx.globalAlpha = 1;
      ctx.drawImage(f.canvas, X(d.minX), Z(d.minZ), (d.maxX - d.minX) * s, (d.maxZ - d.minZ) * s);
      // 未收割区域罩上作物颜色
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(X(d.minX), Z(d.minZ), (d.maxX - d.minX) * s, (d.maxZ - d.minZ) * s);
    }
    // 建筑
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(X(FARM.house.x - 5), Z(FARM.house.z - 4), 10 * s, 11 * s);
    ctx.fillStyle = '#8a4a3a';
    ctx.fillRect(X(FARM.barn.x - 11), Z(FARM.barn.z - 7), 22 * s, 14 * s);
    ctx.fillStyle = '#b8bcc0';
    for (const b of FARM.bins) { ctx.beginPath(); ctx.arc(X(b.x), Z(b.z), 4 * s, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(X(truckPos.x - 8.5), Z(truckPos.z - 1.3), 17 * s, 2.6 * s);
    // 规划路径
    if (path && path.length) {
      ctx.strokeStyle = 'rgba(127,209,139,0.85)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      const end = Math.min(path.length, pathIdx + 1400);
      for (let i = pathIdx; i < end; i += 2) {
        const p = path[i];
        if (i === pathIdx) ctx.moveTo(X(p.x), Z(p.z)); else ctx.lineTo(X(p.x), Z(p.z));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 收割机
    ctx.save();
    ctx.translate(X(combine.x), Z(combine.z));
    ctx.rotate(-combine.yaw + Math.PI);
    ctx.fillStyle = '#f0c040';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // 指北
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 11px Rajdhani, sans-serif';
    ctx.fillText('N', W - 14, 14);
  }
}
