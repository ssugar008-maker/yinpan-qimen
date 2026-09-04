// 室內平面圖標注資料 → 供 AI 分析用（玄空分頁與室內分頁共用）
// 讀取室內分頁已存嘅平面圖、立極點、坐向、房間標注，並對照指定玄空盤計算各房間嘅宮位組合。
import { coveredMountains, mountainAt, norm360 } from './geometry.js';
import { PALACE_MOUNTAINS24, STAR24_INFO, star24MapBy, getStar24Method } from '../tianxing/stars24.js';
import { starPair, PALACE_GUA, PALACE_DIR, PALACE_WX } from '../xuankong/engine.js';

const STORE_KEY = 'mo_indoor_v1';

// 山 → 宮位（後天八卦）反查
const MOUNTAIN_TO_PALACE = {};
Object.entries(PALACE_MOUNTAINS24).forEach(([p, ms]) => ms.forEach((m) => { MOUNTAIN_TO_PALACE[m] = +p; }));

// 讀取室內分頁已存嘅佈局；未標房或未校準坐向 → null。坐向由 facingDeg 推算（與室內分頁一致）
export function loadIndoorLayout() {
  let saved = null;
  try { const raw = localStorage.getItem(STORE_KEY); saved = raw ? JSON.parse(raw) : null; } catch { return null; }
  if (!saved || !saved.img || !saved.center || saved.facingDeg == null) return null;
  if (!Array.isArray(saved.rooms) || !saved.rooms.length) return null;
  const faceM = mountainAt(norm360(saved.facingDeg)).c;
  const sitM = mountainAt(norm360(saved.facingDeg + 180)).c;
  return { ...saved, sitM, faceM }; // { img, center, rot, facingDeg, rooms, sitM, faceM, ... }
}

// 房間 → 對照 xkChart 嘅宮位組合分析
// 回傳 [{ type, mountains[], furniture[], palaces: [{ palace, palaceName, dir, wx, shan, xiang, flow, combo, ji, remedy, star, starJi, starGoverns }] }]
export function buildIndoorRooms(layout, xkChart, xkFlow) {
  if (!layout || !layout.center) return [];
  const center = layout.center;
  const rot = layout.rot || 0;
  // 天星坐山：優先用日照取向（starSit），否則跟羅盤坐山；排盤法跟全域設定
  const starSit = layout.starSit || layout.sitM;
  const method = layout.method || getStar24Method();
  const star24 = starSit ? star24MapBy(method, starSit) : null;
  return (layout.rooms || []).map((room) => {
    const pts = room.pts && room.pts.length ? room.pts : [{ x: room.x, y: room.y }];
    const mountains = coveredMountains(pts, center, rot);
    // 去重宮位（一宮可能跨多山）
    const seen = new Set();
    const palaces = [];
    mountains.forEach((mc) => {
      const p = MOUNTAIN_TO_PALACE[mc];
      if (!p || seen.has(p)) return;
      seen.add(p);
      const combo = xkChart ? starPair(xkChart.sG[p], xkChart.fG[p]) : null;
      const star = star24 ? star24[mc] : null;
      const starInfo = star ? (STAR24_INFO[star] || {}) : null;
      palaces.push({
        palace: p, palaceName: PALACE_GUA[p], dir: PALACE_DIR[p], wx: PALACE_WX[p],
        shan: xkChart ? xkChart.sG[p] : null, xiang: xkChart ? xkChart.fG[p] : null,
        flow: xkFlow ? xkFlow[p] : null,
        combo: combo ? combo.n : '', ji: combo ? combo.t : (starInfo.ji || '平'), remedy: combo ? (combo.r || '') : '',
        star, starJi: starInfo.ji || '', starGoverns: starInfo.governs || '',
      });
    });
    return { type: room.type, mountains, furniture: room.furniture || [], palaces };
  }).filter((r) => r.palaces.length);
}
