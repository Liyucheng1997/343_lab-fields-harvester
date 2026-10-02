// Dubins 曲线：最短前进路径（给定最小转弯半径）
// 位姿 {x, z, yaw}，yaw：前向 = (sin yaw, cos yaw)
const TWO_PI = Math.PI * 2;
const mod2pi = (a) => a - TWO_PI * Math.floor(a / TWO_PI);

const WORDS = {
  LSL(a, b, d, sa, sb, ca, cb, cab) {
    const tmp0 = d + sa - sb;
    const p2 = 2 + d * d - 2 * cab + 2 * d * (sa - sb);
    if (p2 < 0) return null;
    const tmp1 = Math.atan2(cb - ca, tmp0);
    return [mod2pi(tmp1 - a), Math.sqrt(p2), mod2pi(b - tmp1)];
  },
  RSR(a, b, d, sa, sb, ca, cb, cab) {
    const tmp0 = d - sa + sb;
    const p2 = 2 + d * d - 2 * cab + 2 * d * (sb - sa);
    if (p2 < 0) return null;
    const tmp1 = Math.atan2(ca - cb, tmp0);
    return [mod2pi(a - tmp1), Math.sqrt(p2), mod2pi(tmp1 - b)];
  },
  LSR(a, b, d, sa, sb, ca, cb, cab) {
    const p2 = -2 + d * d + 2 * cab + 2 * d * (sa + sb);
    if (p2 < 0) return null;
    const p = Math.sqrt(p2);
    const tmp0 = Math.atan2(-ca - cb, d + sa + sb) - Math.atan2(-2, p);
    return [mod2pi(tmp0 - a), p, mod2pi(tmp0 - mod2pi(b))];
  },
  RSL(a, b, d, sa, sb, ca, cb, cab) {
    const p2 = -2 + d * d + 2 * cab - 2 * d * (sa + sb);
    if (p2 < 0) return null;
    const p = Math.sqrt(p2);
    const tmp0 = Math.atan2(ca + cb, d - sa - sb) - Math.atan2(2, p);
    return [mod2pi(a - tmp0), p, mod2pi(b - tmp0)];
  },
  RLR(a, b, d, sa, sb, ca, cb, cab) {
    const tmp0 = (6 - d * d + 2 * cab + 2 * d * (sa - sb)) / 8;
    if (Math.abs(tmp0) > 1) return null;
    const phi = Math.atan2(ca - cb, d - sa + sb);
    const p = mod2pi(TWO_PI - Math.acos(tmp0));
    const t = mod2pi(a - phi + mod2pi(p / 2));
    return [t, p, mod2pi(a - b - t + mod2pi(p))];
  },
  LRL(a, b, d, sa, sb, ca, cb, cab) {
    const tmp0 = (6 - d * d + 2 * cab + 2 * d * (sb - sa)) / 8;
    if (Math.abs(tmp0) > 1) return null;
    const phi = Math.atan2(ca - cb, d + sa - sb);
    const p = mod2pi(TWO_PI - Math.acos(tmp0));
    const t = mod2pi(-a - phi + p / 2);
    return [t, p, mod2pi(mod2pi(b) - a - t + mod2pi(p))];
  },
};

// 数学坐标：X = 世界 x, Y = 世界 z, θ = π/2 - yaw
function toMath(p) { return { x: p.x, y: p.z, th: Math.PI / 2 - p.yaw }; }

export function dubinsPath(from, to, rho) {
  const q0 = toMath(from), q1 = toMath(to);
  const dx = q1.x - q0.x, dy = q1.y - q0.y;
  const D = Math.hypot(dx, dy);
  const d = D / rho;
  const theta = mod2pi(Math.atan2(dy, dx));
  const a = mod2pi(q0.th - theta), b = mod2pi(q1.th - theta);
  const sa = Math.sin(a), sb = Math.sin(b), ca = Math.cos(a), cb = Math.cos(b), cab = Math.cos(a - b);
  let best = null;
  for (const [name, fn] of Object.entries(WORDS)) {
    const r = fn(a, b, d, sa, sb, ca, cb, cab);
    if (!r) continue;
    const len = r[0] + r[1] + r[2];
    if (!best || len < best.len) best = { name, params: r, len };
  }
  if (!best) return null;
  return { q0, rho, ...best, length: best.len * rho };
}

function segment(t, qi, type) {
  const st = Math.sin(qi.th), ct = Math.cos(qi.th);
  if (type === 'L') return { x: qi.x + Math.sin(qi.th + t) - st, y: qi.y - Math.cos(qi.th + t) + ct, th: qi.th + t };
  if (type === 'R') return { x: qi.x - Math.sin(qi.th - t) + st, y: qi.y + Math.cos(qi.th - t) - ct, th: qi.th - t };
  return { x: qi.x + ct * t, y: qi.y + st * t, th: qi.th };
}

// 采样为点列 [{x, z, yaw, curved}]
export function sampleDubins(path, step = 0.5) {
  const out = [];
  const types = path.name.split('');
  const p = path.params;
  const rho = path.rho;
  const total = path.len;
  const n = Math.max(2, Math.ceil(path.length / step));
  // 段终点（归一化空间）
  const qStart = { x: 0, y: 0, th: path.q0.th };
  const q1 = segment(p[0], qStart, types[0]);
  const q2 = segment(p[1], q1, types[1]);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * total;
    let q, type;
    if (t < p[0]) { q = segment(t, qStart, types[0]); type = types[0]; }
    else if (t < p[0] + p[1]) { q = segment(t - p[0], q1, types[1]); type = types[1]; }
    else { q = segment(t - p[0] - p[1], q2, types[2]); type = types[2]; }
    out.push({ x: q.x * rho + path.q0.x, z: q.y * rho + path.q0.y, yaw: Math.PI / 2 - q.th, curved: type !== 'S' });
  }
  return out;
}
