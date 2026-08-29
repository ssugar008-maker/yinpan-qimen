// Auto-detect the floor-plan outline from the uploaded image (dark wall lines on a
// light background) so the centre methods respond immediately, before any pins are placed.
// Coordinates are returned in original image pixels.

export function analyzeFloorplan(img, done) {
  const MAX = 240; // downscale for speed
  const scale = Math.min(1, MAX / Math.max(img.w, img.h));
  const W = Math.max(1, Math.round(img.w * scale));
  const H = Math.max(1, Math.round(img.h * scale));
  const im = new Image();
  im.onload = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(im, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      const wall = new Uint8Array(W * H);
      let sx = 0, sy = 0, cnt = 0;
      let minX = W, minY = H, maxX = 0, maxY = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const bright = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (bright < 150) {
            wall[y * W + x] = 1;
            sx += x; sy += y; cnt++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (cnt < 20) { done(null); return; } // not enough wall detected

      const up = (p) => ({ x: p.x / scale, y: p.y / scale });
      const centroid = up({ x: sx / cnt, y: sy / cnt });
      const bbox = up({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
      // auto 對角：bounding-box 對角線交點（等同框心；精確四角請用加點）
      const diagonal = bbox;

      const pole = computePole(wall, W, H, minX, minY, maxX, maxY);
      done({ centroid, bbox, diagonal, pole: pole ? up(pole) : centroid });
    } catch (e) {
      done(null);
    }
  };
  im.onerror = () => done(null);
  im.src = img.url;
}

// Pole of inaccessibility from the wall mask: flood-fill the exterior, then find the
// interior cell farthest from any wall (multi-source BFS distance transform).
function computePole(wall, W, H, minX, minY, maxX, maxY) {
  const N = W * H;
  const exterior = new Uint8Array(N);
  const q = [];
  // exterior = non-wall reachable from the border
  for (let x = 0; x < W; x++) { pushIfOpen(0 * W + x); pushIfOpen((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { pushIfOpen(y * W + 0); pushIfOpen(y * W + (W - 1)); }
  function pushIfOpen(idx) {
    if (!wall[idx] && !exterior[idx]) { exterior[idx] = 1; q.push(idx); }
  }
  while (q.length) {
    const idx = q.pop();
    const x = idx % W, y = (idx / W) | 0;
    if (x > 0) pushIfOpen(idx - 1);
    if (x < W - 1) pushIfOpen(idx + 1);
    if (y > 0) pushIfOpen(idx - W);
    if (y < H - 1) pushIfOpen(idx + W);
  }

  // distance to nearest wall (BFS from wall cells), only meaningful for interior
  const dist = new Int32Array(N).fill(-1);
  const q2 = [];
  for (let idx = 0; idx < N; idx++) if (wall[idx]) { dist[idx] = 0; q2.push(idx); }
  let head = 0;
  while (head < q2.length) {
    const idx = q2[head++];
    const x = idx % W, y = (idx / W) | 0;
    const d = dist[idx] + 1;
    if (x > 0 && dist[idx - 1] < 0) { dist[idx - 1] = d; q2.push(idx - 1); }
    if (x < W - 1 && dist[idx + 1] < 0) { dist[idx + 1] = d; q2.push(idx + 1); }
    if (y > 0 && dist[idx - W] < 0) { dist[idx - W] = d; q2.push(idx - W); }
    if (y < H - 1 && dist[idx + W] < 0) { dist[idx + W] = d; q2.push(idx + W); }
  }

  // interior cell with max distance to wall
  let best = null, bestD = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = y * W + x;
      if (!wall[idx] && !exterior[idx] && dist[idx] > bestD) {
        bestD = dist[idx];
        best = { x, y };
      }
    }
  }
  return best;
}
