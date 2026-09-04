// Geometry + 24山 data for the 室內 (floor-plan mapping) tool.
// All coordinates are in image pixels (SVG viewBox units). Angles in degrees.

// 24 mountains, clockwise from North (子 = 0°). Each spans 15°.
export const MOUNTAINS24 = [
  { c: '子', deg: 0 }, { c: '癸', deg: 15 }, { c: '丑', deg: 30 }, { c: '艮', deg: 45 },
  { c: '寅', deg: 60 }, { c: '甲', deg: 75 }, { c: '卯', deg: 90 }, { c: '乙', deg: 105 },
  { c: '辰', deg: 120 }, { c: '巽', deg: 135 }, { c: '巳', deg: 150 }, { c: '丙', deg: 165 },
  { c: '午', deg: 180 }, { c: '丁', deg: 195 }, { c: '未', deg: 210 }, { c: '坤', deg: 225 },
  { c: '申', deg: 240 }, { c: '庚', deg: 255 }, { c: '酉', deg: 270 }, { c: '辛', deg: 285 },
  { c: '戌', deg: 300 }, { c: '乾', deg: 315 }, { c: '亥', deg: 330 }, { c: '壬', deg: 345 },
];

// 8 trigrams with the bearing of their sector centre.
export const TRIGRAMS8 = [
  { c: '坎', sym: '☵', deg: 0, dir: '北' },
  { c: '艮', sym: '☶', deg: 45, dir: '東北' },
  { c: '震', sym: '☳', deg: 90, dir: '東' },
  { c: '巽', sym: '☴', deg: 135, dir: '東南' },
  { c: '離', sym: '☲', deg: 180, dir: '南' },
  { c: '坤', sym: '☷', deg: 225, dir: '西南' },
  { c: '兌', sym: '☱', deg: 270, dir: '西' },
  { c: '乾', sym: '☰', deg: 315, dir: '西北' },
];

// Mountain (子/午/…) whose 15° sector contains the given bearing.
export function mountainAt(bearing) {
  const b = ((bearing % 360) + 360) % 360;
  // each mountain centred at its deg; sector = deg-7.5 .. deg+7.5
  const idx = Math.round(b / 15) % 24;
  return MOUNTAINS24[idx];
}

export const norm360 = (d) => ((d % 360) + 360) % 360;

// Screen angle (0 = up/north, clockwise positive) of the vector p1 -> p2.
export function screenAngle(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return norm360((Math.atan2(dx, -dy) * 180) / Math.PI);
}

// 計算一個區域（多邊形點）從中心跨越哪些山（角度範圍）；單點則回傳所在山
export function coveredMountains(pts, center, rot) {
  const bs = pts.map((p) => norm360(screenAngle(center, p) - rot));
  if (!bs.length) return [];
  if (bs.length === 1) return [mountainAt(bs[0]).c];
  const mn = Math.min(...bs), mx = Math.max(...bs);
  const wrap = mx - mn > 180; // 跨正北
  return MOUNTAINS24.filter((m) => {
    if (!wrap) return mn <= m.deg + 7.5 && mx >= m.deg - 7.5; // 扇形與山區（±7.5°）有重疊
    return (m.deg + 7.5 >= mx) || (m.deg - 7.5 <= mn); // 跨 0° 的情況
  }).map((m) => m.c);
}

// Point on a circle. `saDeg` is a SCREEN angle (0 = up, clockwise).
export function polar(cx, cy, r, saDeg) {
  const a = (saDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

// ---------- polygon centre methods ----------

export function vertexAverage(pts) {
  const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
}

export function bboxCenter(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// Area-weighted centroid (best for irregular / L-shaped plans).
export function polygonCentroid(pts) {
  const A = signedArea(pts);
  if (Math.abs(A) < 1e-6) return vertexAverage(pts);
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const cross = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

function lineIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

// Intersection of the two diagonals. Uses the 4 pins when exactly 4 are given,
// otherwise the 4 extreme points (min/max X, min/max Y) form the quadrilateral.
export function diagonalCenter(pts) {
  let quad = pts;
  if (pts.length !== 4) {
    let minX = pts[0], maxX = pts[0], minY = pts[0], maxY = pts[0];
    for (const p of pts) {
      if (p.x < minX.x) minX = p;
      if (p.x > maxX.x) maxX = p;
      if (p.y < minY.y) minY = p;
      if (p.y > maxY.y) maxY = p;
    }
    quad = [minY, maxX, maxY, minX]; // top, right, bottom, left (roughly in order)
  }
  const hit = lineIntersect(quad[0], quad[2], quad[1], quad[3]);
  return hit || bboxCenter(pts);
}

export function pointInPolygon(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > pt.y) !== (b.y > pt.y) &&
        pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx, y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}

function minDistToEdges(p, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    d = Math.min(d, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  }
  return d;
}

// Pole of inaccessibility: the interior point farthest from every edge
// (centre of the largest inscribed circle). Grid search + one refinement pass.
export function poleOfInaccessibility(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const search = (x0, y0, x1, y1, n) => {
    let best = null, bestD = -1;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = { x: x0 + ((i + 0.5) * (x1 - x0)) / n, y: y0 + ((j + 0.5) * (y1 - y0)) / n };
        if (!pointInPolygon(p, pts)) continue;
        const d = minDistToEdges(p, pts);
        if (d > bestD) { bestD = d; best = p; }
      }
    }
    return { best, bestD };
  };
  let { best, bestD } = search(minX, minY, maxX, maxY, 36);
  if (!best) return polygonCentroid(pts);
  const cell = Math.max(maxX - minX, maxY - minY) / 36;
  const refined = search(best.x - cell, best.y - cell, best.x + cell, best.y + cell, 16);
  if (refined.best && refined.bestD > bestD) best = refined.best;
  return best;
}

// Resolve the centre for the chosen method.
export function resolveCenter(method, pins, manualCenter) {
  if (method === 'manual') return manualCenter || null;
  if (pins.length === 0) return null;
  if (pins.length < 3) return vertexAverage(pins);
  switch (method) {
    case 'bbox': return bboxCenter(pins);
    case 'diagonal': return diagonalCenter(pins);
    case 'pole': return poleOfInaccessibility(pins);
    case 'centroid':
    default: return polygonCentroid(pins);
  }
}
