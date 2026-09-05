import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  MOUNTAINS24, TRIGRAMS8, mountainAt, norm360, screenAngle, polar, resolveCenter, coveredMountains, coveredMountainsDetailed,
} from './geometry.js';
import { analyzeFloorplan } from './analyze.js';
import { star24MapBy, analyze24, STAR24_INFO, PALACE_MOUNTAINS24, STAR24_METHODS, setStar24Method } from '../tianxing/stars24.js';
import { useStar24Method } from '../tianxing/useStar24Method.js';
import { setStarFace } from '../tianxing/useStarFace.js';
import { xuanKongChart, annualChart, starPair, PALACE_GUA, PALACE_DIR, PALACE_WX, GRID, STAR_NAME, STAR_WX, remedyText, lifeGua, bazhai, GUA_NAME, EAST4, BAZHAI_GOOD } from '../xuankong/engine.js';
import { buildIndoorRooms } from './layoutData.js';

// 山 → 宮位（後天八卦）反查
const MOUNTAIN_TO_PALACE = {};
Object.entries(PALACE_MOUNTAINS24).forEach(([p, ms]) => ms.forEach((m) => { MOUNTAIN_TO_PALACE[m] = +p; }));
import CompassOverlay, { HaloText } from './CompassOverlay.jsx';
import { aiInterpret } from '../ai.js';
import { useCloudStore } from '../cloud.js';
import AiText from '../AiText.jsx';

const STORE_KEY = 'mo_indoor_v1';

const CENTER_METHODS = [
  { v: 'centroid', l: '⊕ 重心', hint: '面積加權重心，不規則 / L 形最準' },
  { v: 'bbox', l: '⬜ 邊界', hint: '外接矩形中心，接近方形適用' },
  { v: 'diagonal', l: '✕ 對角', hint: '四角形兩對角線交點（取四個極端角）' },
  { v: 'pole', l: '◉ 內切', hint: '最大內切圓心，離所有牆最遠的點' },
  { v: 'manual', l: '👆 手動', hint: '直接在圖上點一下定中心' },
];

const ROOM_TYPES = ['睡房', '主人房', '小孩房', '書房', '客廳', '飯廳', '廚房', '廁所', '浴室', '大門', '玄關', '神位', '露台', '走廊', '通道', '儲物房', '樓梯', '其他'];
const FEATURE_ICON = { 床: '🛏', 灶頭: '🔥', 廁所: '🚽', 門: '🚪', 窗: '🪟' };
const FEATURE_TYPES = Object.keys(FEATURE_ICON);

// 常用家具（五行）：標房時可一拼加入分析
const COMMON_FURNITURE = [
  { n: '床', wx: '木' }, { n: '床頭櫃', wx: '木' }, { n: '衣櫃', wx: '木' }, { n: '書桌', wx: '木' }, { n: '書櫃', wx: '木' },
  { n: '沙發', wx: '土' }, { n: '茶几', wx: '土' }, { n: '電視', wx: '火' }, { n: '電腦', wx: '火' }, { n: '檯燈', wx: '火' },
  { n: '魚缸', wx: '水' }, { n: '加濕器', wx: '水' }, { n: '鏡子', wx: '金' }, { n: '金屬架', wx: '金' }, { n: '植物', wx: '木' },
  { n: '冷氣', wx: '金' }, { n: '音響', wx: '火' }, { n: '保險箱', wx: '金' }, { n: '水晶', wx: '土' }, { n: '鹽燈', wx: '土' },
];

// （coveredMountains 已移至 geometry.js 共用）
// 依房間類型＋所在宮位（玄空組合／天星）給出吉凶與建議
function roomAdvice(info, type) {
  if (!info) return null;
  const ji = info.xk ? info.xk.combo.t : (info.starInfo ? info.starInfo.ji : '平');
  const isBad = ji === '凶' || ji === '大凶' || ji === '半凶';
  const isGood = ji === '吉' || ji === '半吉';
  const facts = [];
  if (info.xk) facts.push(`玄空 山${info.xk.shan}・向${info.xk.xiang}${info.xk.flow ? `・流年${info.xk.flow}` : ''}「${info.xk.combo.n}」`);
  if (info.star) facts.push(`天星「${info.star}」${info.starInfo.governs || ''}`);
  let advice;
  if (type === '廁所') advice = isBad ? '廁所壓凶位，正合「以污制凶」，可；保持乾淨。' : '廁所宜壓凶位；此宮偏吉，廁所在此略洩吉氣，宜保持乾淨通風。';
  else if (type === '廚房') advice = isBad ? '廚房火旺於凶位，注意火喉安全；可放黃色／陶瓷洩化。' : '廚房在吉位，火助旺氣，利家人食祿健康。';
  else if (['睡房', '主人房', '小孩房'].includes(type)) advice = isBad ? '睡房在凶位，久卧不利健康，宜化解或考慮調房。' : '睡房在吉位，利休息健康，床頭宜靠吉方。';
  else if (type === '大門') advice = isBad ? '大門納凶氣，宜保持明亮、放地氈／植物化解。' : '大門納吉氣，宜明亮整潔，可催旺。';
  else if (type === '書房') advice = isBad ? '書房在凶位，讀書易分心；宜放文昌塔／植物化解。' : '書房在吉位，利讀書功名，書桌宜朝向吉方。';
  else if (type === '神位') advice = isBad ? '神位忌在凶位，宜移至吉方清淨處。' : '神位在吉位，清淨安穩，宜。';
  else advice = isBad ? '此宮偏凶，宜靜不宜動，可作儲物／通道。' : '此宮偏吉，宜多用、宜明亮。';
  if (isBad && info.xk && info.xk.combo.r) advice += ` 化解：${info.xk.combo.r}。`;
  return { ji, isBad, isGood, facts, advice };
}

// 家具與宮位五行的配合分析
const WX_KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const WX_SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
function furnitureNote(room, infos) {
  const furn = (room.furniture || []).map((n) => COMMON_FURNITURE.find((f) => f.n === n)).filter(Boolean);
  if (!furn.length || !infos.length || !infos[0].palace) return '';
  const palWx = PALACE_WX[infos[0].palace];
  const list = furn.map((f) => `${f.n}（${f.wx}）`).join('、');
  const bad = furn.filter((f) => WX_KE[f.wx] === palWx);
  const good = furn.filter((f) => WX_SHENG[f.wx] === palWx || f.wx === palWx);
  let note = `家具五行：${list}（宮屬${palWx}）。`;
  if (bad.length) note += ` ⚠ ${bad.map((f) => f.n).join('、')}屬${[...new Set(bad.map((f) => f.wx))].join('')}剋${palWx}宮，宜留意或化解。`;
  if (good.length) note += ` ✓ ${good.map((f) => f.n).join('、')}與宮位相合。`;
  return note;
}

function loadStore() {
  try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function compressImage(file, cb) {
  const img = new Image();
  img.onload = () => {
    const MAX = 1500;
    let { width, height } = img;
    const scale = Math.min(1, MAX / Math.max(width, height));
    width = Math.round(width * scale); height = Math.round(height * scale);
    const cv = document.createElement('canvas');
    cv.width = width; cv.height = height;
    cv.getContext('2d').drawImage(img, 0, 0, width, height);
    cb({ url: cv.toDataURL('image/jpeg', 0.85), w: width, h: height });
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => cb(null);
  img.src = URL.createObjectURL(file);
}

export default function Indoor({ onGotoXuanKong, chartLib }) {
  const saved = useRef(loadStore()).current;
  const [img, setImg] = useState(saved?.img || null);
  const [pins, setPins] = useState(saved?.pins || []);
  const [centerMethod, setCenterMethod] = useState(saved?.centerMethod || 'centroid');
  const [manualCenter, setManualCenter] = useState(saved?.manualCenter || null);
  const [mode, setMode] = useState('pin');
  const [refLine, setRefLine] = useState(saved?.refLine || null);
  const [refDegree, setRefDegree] = useState(saved?.refDegree ?? '');
  const [rot, setRot] = useState(saved?.rot || 0);
  const [decl, setDecl] = useState(saved?.decl ?? 0);
  const [showCompass, setShowCompass] = useState(saved?.showCompass ?? true);
  const [opacity, setOpacity] = useState(saved?.opacity ?? 0.9);
  const [compassSize, setCompassSize] = useState(saved?.compassSize ?? 1);
  const [layers, setLayers] = useState({ mountains: true, trigrams: true, degrees: false, extend: true, stars24: false, ...(saved?.layers || {}) });
  const [selectedPin, setSelectedPin] = useState(null);
  const [auto, setAuto] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [rooms, setRooms] = useState(saved?.rooms || []); // 房間標注 [{x,y,type} 或 {pts,type}]
  const [features, setFeatures] = useState(saved?.features || []); // 家具/門標注 [{type:'床/灶頭/廁所/門/窗', x, y, dir(圖像角)}]
  const [selRoom, setSelRoom] = useState(null);
  const [roomSubMode, setRoomSubMode] = useState('point'); // 標房：point 單點 / area 區域
  const [areaDraft, setAreaDraft] = useState([]); // 區域描點中
  const [mtnPickerIdx, setMtnPickerIdx] = useState(null); // 邊間房開緊「手動指定山」picker
  const [delVertexMode, setDelVertexMode] = useState(false); // 刪頂點模式（揀中嘅區域房）
  const [featureType, setFeatureType] = useState('床'); // 標家具模式：要放嘅類型
  const [selFeature, setSelFeature] = useState(null); // 揀中嘅家具/門（微調方向用）
  // 天星向首（日照最強方向）：starFaceDeg＝光位度數；sunMode＝☀ 點光位模式
  const [starFaceDeg, setStarFaceDeg] = useState(saved?.starFaceDeg ?? null);
  const [sunMode, setSunMode] = useState(false);
  // 放大標房：zoom 倍數（1–4），canvas 變 scrollable
  const [zoom, setZoom] = useState(1);

  const svgRef = useRef(null);
  const drag = useRef({ idx: null, downPt: null, moved: false });
  const [refStart, setRefStart] = useState(null);

  // run wall auto-detection whenever a new image is loaded
  useEffect(() => {
    if (!img) { setAuto(null); return; }
    analyzeFloorplan(img, setAuto);
  }, [img]);

  // persist（合併寫入，保留 center/facingDeg 等由另一 effect 儲存的欄位）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORE_KEY, JSON.stringify({
        ...obj, img, pins, centerMethod, manualCenter, refLine, refDegree, rot, decl,
        showCompass, opacity, compassSize, layers, rooms, starFaceDeg, features,
      }));
    } catch {}
  }, [img, pins, centerMethod, manualCenter, refLine, refDegree, rot, decl, showCompass, opacity, compassSize, layers, rooms, starFaceDeg, features]);

  // centre resolution: pins (>=3) win, otherwise fall back to image auto-detection
  const center = useMemo(() => {
    if (centerMethod === 'manual') return manualCenter;
    if (pins.length >= 3) return resolveCenter(centerMethod, pins, manualCenter);
    if (auto) {
      switch (centerMethod) {
        case 'bbox': return auto.bbox;
        case 'diagonal': return auto.diagonal;
        case 'pole': return auto.pole;
        default: return auto.centroid;
      }
    }
    if (pins.length > 0) return resolveCenter(centerMethod, pins, manualCenter);
    return null;
  }, [centerMethod, pins, manualCenter, auto]);

  const centerSource = centerMethod === 'manual' ? '手動' : pins.length >= 3 ? `多邊形（${pins.length} 點）` : auto ? '自動偵測牆壁' : null;

  const unit = img ? Math.min(img.w, img.h) : 1000;
  const PIN_R = unit * 0.02;
  const HIT_R = unit * 0.07;

  // radius that just clears the plan (to the farthest corner), scaled by the size slider
  const extR = useMemo(() => {
    if (!img || !center) return unit;
    const corners = [{ x: 0, y: 0 }, { x: img.w, y: 0 }, { x: 0, y: img.h }, { x: img.w, y: img.h }];
    return Math.max(...corners.map((c) => Math.hypot(c.x - center.x, c.y - center.y))) * 1.04;
  }, [img, center, unit]);
  const Rout = extR * compassSize;
  // extension lines always run past the plan edge and beyond the label ring
  const Rline = Math.max(extR, Rout) * 1.3;
  // shrink labels when the compass is small so they don't crowd each other
  const mtFont = unit * 0.05 * Math.min(1, compassSize * 1.1);
  const tgFont = unit * 0.055 * Math.min(1, compassSize * 1.1);

  const toSvg = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY);
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const nearestPin = (pt) => {
    let best = -1, bestD = HIT_R;
    pins.forEach((p, i) => {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  // 點是否喺多邊形內（射線法）—— 微調房間用
  const pointInPoly = (pt, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  // 搵到邊間房（區域房＝點喺多邊形內；單點房＝近個點）；由後往前（後畫嘅喺上）
  const roomHit = (pt) => {
    for (let i = rooms.length - 1; i >= 0; i--) {
      const r = rooms[i];
      if (r.pts && r.pts.length >= 2) { if (pointInPoly(pt, r.pts)) return i; }
      else if (Math.hypot((r.x ?? 0) - pt.x, (r.y ?? 0) - pt.y) < HIT_R) return i;
    }
    return -1;
  };
  // 搵選中嘅區域房嘅最近頂點（微調用）
  const nearestRoomVertex = (pt, roomIdx) => {
    const r = rooms[roomIdx];
    if (!r || !r.pts) return -1;
    let best = -1, bestD = HIT_R * 1.2;
    r.pts.forEach((p, k) => {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  };
  // 搵最近嘅區域草稿點（標房細調：描緊嗰陣可以拖返啲點）
  const nearestDraftPoint = (pt) => {
    let best = -1, bestD = HIT_R * 1.2;
    areaDraft.forEach((p, k) => {
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  };
  // 搵最近嘅家具/門標記（微調位置用）
  const nearestFeature = (pt) => {
    let best = -1, bestD = HIT_R;
    features.forEach((f, i) => {
      const d = Math.hypot(f.x - pt.x, f.y - pt.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  // 選中嘅床/門嘅旋轉手柄（箭嘴尖）位置
  const featureRotateTip = (f) => {
    if (!f || f.dir == null) return null;
    const rad = (f.dir * Math.PI) / 180;
    return { x: f.x + Math.sin(rad) * unit * 0.055, y: f.y - Math.cos(rad) * unit * 0.055 };
  };
  // 搵選中嘅區域房嘅最近邊中點（加頂點用）
  const nearestEdgeMidpoint = (pt, roomIdx) => {
    const r = rooms[roomIdx];
    if (!r || !r.pts) return -1;
    let best = -1, bestD = HIT_R * 1.1;
    r.pts.forEach((p, k) => {
      const q = r.pts[(k + 1) % r.pts.length];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const d = Math.hypot(mid.x - pt.x, mid.y - pt.y);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  };

  const onPointerDown = (e) => {
    if (!img || mode === 'view') return;
    const pt = toSvg(e);
    drag.current = { idx: null, downPt: pt, moved: false, roomIdx: null, vertexIdx: null, origPts: null, origXY: null, featureIdx: null, rotating: false, origFeatureXY: null, draftIdx: null };
    if (mode === 'pin') {
      const i = nearestPin(pt);
      if (i >= 0) {
        drag.current.idx = i;
        try { e.target.setPointerCapture(e.pointerId); } catch {}
      }
    } else if ((mode === 'room' && roomSubMode === 'point') || mode === 'tune') {
      // 微調：揀中嘅區域房可拖頂點／加頂點／刪頂點；點到房就拖成間
      const vi = selRoom != null ? nearestRoomVertex(pt, selRoom) : -1;
      if (vi >= 0 && delVertexMode) {
        // 刪頂點（至少保留 3 點）
        setRooms((rs) => rs.map((r, j) => (j === selRoom && r.pts && r.pts.length > 3 ? { ...r, pts: r.pts.filter((_, k) => k !== vi) } : r)));
        return;
      }
      if (vi >= 0) {
        drag.current.roomIdx = selRoom; drag.current.vertexIdx = vi;
        try { e.target.setPointerCapture(e.pointerId); } catch {}
      } else {
        // 加頂點：點邊中點
        const mi = selRoom != null && !delVertexMode ? nearestEdgeMidpoint(pt, selRoom) : -1;
        if (mi >= 0) {
          setRooms((rs) => rs.map((r, j) => {
            if (j !== selRoom || !r.pts) return r;
            const p = r.pts[mi], q = r.pts[(mi + 1) % r.pts.length];
            const mid = { x: Math.round((p.x + q.x) / 2), y: Math.round((p.y + q.y) / 2) };
            const np = [...r.pts]; np.splice(mi + 1, 0, mid);
            return { ...r, pts: np };
          }));
          return;
        }
        const ri = roomHit(pt);
        if (ri >= 0) {
          drag.current.roomIdx = ri;
          drag.current.origPts = rooms[ri].pts ? rooms[ri].pts.map((p) => ({ ...p })) : null;
          drag.current.origXY = rooms[ri].pts ? null : { x: rooms[ri].x, y: rooms[ri].y };
          try { e.target.setPointerCapture(e.pointerId); } catch {}
        }
      }
    } else if (mode === 'feature') {
      // 標家具模式：拖旋轉手柄（選中嘅床/門）或拖成件（移動）
      if (selFeature != null && features[selFeature] && features[selFeature].dir != null) {
        const tip = featureRotateTip(features[selFeature]);
        if (tip && Math.hypot(tip.x - pt.x, tip.y - pt.y) < HIT_R * 1.3) {
          drag.current.featureIdx = selFeature; drag.current.rotating = true;
          try { e.target.setPointerCapture(e.pointerId); } catch {}
          return;
        }
      }
      const fi = nearestFeature(pt);
      if (fi >= 0) {
        drag.current.featureIdx = fi; drag.current.rotating = false;
        drag.current.origFeatureXY = { x: features[fi].x, y: features[fi].y };
        try { e.target.setPointerCapture(e.pointerId); } catch {}
      }
    } else if (mode === 'room' && roomSubMode === 'area') {
      // 標房細調：描緊區域嗰陣，撳到草稿點就拖佢（唔使完成先改）
      const di = nearestDraftPoint(pt);
      if (di >= 0) {
        drag.current.draftIdx = di;
        try { e.target.setPointerCapture(e.pointerId); } catch {}
      }
    } else if (mode === 'manual') {
      setManualCenter(pt);
      setCenterMethod('manual');
    } else if (mode === 'ref') {
      if (!refStart) {
        setRefStart(pt);
        setRefLine({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      } else {
        setRefLine({ x1: refStart.x, y1: refStart.y, x2: pt.x, y2: pt.y });
        setRefStart(null);
      }
    }
  };

  const onPointerMove = (e) => {
    if (!img) return;
    const pt = toSvg(e);
    const d = drag.current;
    if (d.downPt && Math.hypot(pt.x - d.downPt.x, pt.y - d.downPt.y) > HIT_R * 0.4) d.moved = true;
    if (d.idx != null) {
      setPins((ps) => ps.map((p, i) => (i === d.idx ? pt : p)));
    } else if (d.draftIdx != null) {
      // 標房細調：拖草稿點
      setAreaDraft((dr) => dr.map((p, k) => (k === d.draftIdx ? { x: Math.round(pt.x), y: Math.round(pt.y) } : p)));
    } else if (d.featureIdx != null) {
      if (d.rotating) {
        // 拖旋轉手柄 → 精密改方向（圖像角）
        const f = features[d.featureIdx];
        if (f) {
          const newDir = Math.round(norm360(screenAngle({ x: f.x, y: f.y }, pt)) * 10) / 10;
          setFeatures((fs) => fs.map((x, j) => (j === d.featureIdx ? { ...x, dir: newDir } : x)));
        }
      } else {
        // 拖成件家具/門（移動位置）
        const dx = pt.x - d.downPt.x, dy = pt.y - d.downPt.y;
        setFeatures((fs) => fs.map((x, j) => (j === d.featureIdx && d.origFeatureXY ? { ...x, x: Math.round(d.origFeatureXY.x + dx), y: Math.round(d.origFeatureXY.y + dy) } : x)));
      }
    } else if (d.roomIdx != null) {
      if (d.vertexIdx != null) {
        // 微調：拖區域房嘅頂點
        setRooms((rs) => rs.map((r, j) => (j === d.roomIdx && r.pts ? { ...r, pts: r.pts.map((p, k) => (k === d.vertexIdx ? { x: Math.round(pt.x), y: Math.round(pt.y) } : p)) } : r)));
      } else {
        // 微調：拖成間房（平移）
        const dx = pt.x - d.downPt.x, dy = pt.y - d.downPt.y;
        setRooms((rs) => rs.map((r, j) => {
          if (j !== d.roomIdx) return r;
          if (r.pts && d.origPts) return { ...r, pts: d.origPts.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) })) };
          if (d.origXY) return { ...r, x: Math.round(d.origXY.x + dx), y: Math.round(d.origXY.y + dy) };
          return r;
        }));
      }
    } else if (mode === 'ref' && refStart) {
      setRefLine((l) => (l ? { ...l, x2: pt.x, y2: pt.y } : l));
    }
  };

  const onPointerUp = (e) => {
    if (!img) return;
    const pt = toSvg(e);
    const d = drag.current;
    // 檢視模式：撳區域房 → 直接選中＋切去標房模式進入微調
    if (mode === 'view') {
      const ri = roomHit(pt);
      if (ri >= 0 && rooms[ri].pts && rooms[ri].pts.length >= 2) { setSelRoom(ri); setMode('room'); setRoomSubMode('point'); }
      return;
    }
    if (d.idx != null) {
      if (!d.moved) setSelectedPin((s) => (s === d.idx ? null : d.idx));
    } else if (sunMode && d.downPt && !d.moved && center) {
      // ☀ 點光位優先（唔會再落加點／標房標記）：由中心指向所點位置嘅方向＝日照最強方向（天星向首）
      setStarFaceDeg(Math.round(norm360(screenAngle(center, pt) - rot) * 10) / 10);
      setSunMode(false);
    } else if (mode === 'pin' && d.downPt && !d.moved) {
      setPins((ps) => { const np = [...ps, pt]; setSelectedPin(np.length - 1); return np; });
    } else if (mode === 'tune' && d.downPt) {
      // 微調模式：拖完頂點/房；冇郁就揀房（點房選中，點空白取消）
      if (!d.moved && d.vertexIdx == null) {
        const ri = d.roomIdx != null ? d.roomIdx : roomHit(pt);
        setSelRoom(ri >= 0 ? ri : null);
      }
    } else if (mode === 'feature' && d.downPt) {
      if (d.featureIdx != null) {
        // 拖完/撿完一件家具；冇郁就選中佢（方便設方向）
        if (!d.moved) setSelFeature(d.featureIdx);
      } else if (!d.moved) {
        // 點空白 → 放一件家具/門（床/門預設向 0°，之後精密調）
        const hasDir = featureType === '床' || featureType === '門';
        const f = { type: featureType, x: Math.round(pt.x), y: Math.round(pt.y), dir: hasDir ? 0 : null };
        setFeatures((fs) => { const nf = [...fs, f]; setSelFeature(nf.length - 1); return nf; });
      }
    } else if (mode === 'room' && d.downPt) {
      if (d.roomIdx != null) {
        // 微調完（拖房／拖頂點）；冇郁就當係選中
        if (!d.moved) setSelRoom((s) => (s === d.roomIdx ? null : d.roomIdx));
      } else if (!d.moved) {
        if (roomSubMode === 'area') {
          // 區域模式：逐點描房間範圍（拖緊草稿點就唔加新點）
          if (d.draftIdx == null) setAreaDraft((dr) => [...dr, { x: Math.round(pt.x), y: Math.round(pt.y) }]);
        } else {
          // 單點模式：點空白位新增房間（點到既有房會喺 pointerdown 設咗 roomIdx）
          setRooms((rs) => [...rs, { x: Math.round(pt.x), y: Math.round(pt.y), type: '睡房', furniture: [] }]);
          setSelRoom(rooms.length);
        }
      }
    }
    drag.current = { idx: null, downPt: null, moved: false, roomIdx: null, vertexIdx: null, origPts: null, origXY: null, featureIdx: null, rotating: false, origFeatureXY: null, draftIdx: null };
  };

  const applyRefDegree = () => {
    const deg = parseFloat(refDegree);
    if (!refLine || isNaN(deg)) return;
    const sa = screenAngle({ x: refLine.x1, y: refLine.y1 }, { x: refLine.x2, y: refLine.y2 });
    const eff = norm360(deg + (parseFloat(decl) || 0));
    setRot(norm360(sa - eff));
  };

  const facingDeg = refDegree !== '' && !isNaN(parseFloat(refDegree))
    ? norm360(parseFloat(refDegree) + (parseFloat(decl) || 0)) : null;
  const sittingDeg = facingDeg != null ? norm360(facingDeg + 180) : null;
  const faceM = facingDeg != null ? mountainAt(facingDeg) : null;
  const sitM = sittingDeg != null ? mountainAt(sittingDeg) : null;
  // 24 天星盤：天星隨「日照最強方向」（納光口）取向，唔係跟羅盤向首。天星坐山＝天星向首之對山。
  const star24Method = useStar24Method(); // 排盤法：玄道（講堂）／八宅遊年
  const starSitC = starFaceDeg != null ? mountainAt(norm360(starFaceDeg + 180)).c : (sitM ? sitM.c : null);
  const starFaceC = starFaceDeg != null ? mountainAt(norm360(starFaceDeg)).c : (faceM ? faceM.c : null);
  const star24 = starSitC ? star24MapBy(star24Method, starSitC) : null;
  // 設咗天星向首自動顯示天星環
  useEffect(() => { if (starFaceDeg != null) setLayers((s) => (s.stars24 ? s : { ...s, stars24: true })); }, [starFaceDeg]);
  // 天星向首同步到全域（玄空分頁＋風水 AI 分頁嘅二十四天星都跟佢，保證一致）
  useEffect(() => { setStarFace(starFaceDeg); }, [starFaceDeg]);
  // 玄空盤（9運）＋流年，用於房間吉凶
  const flowYearNow = new Date().getFullYear();
  const xkChart = useMemo(() => (sitM ? xuanKongChart(9, sitM.c, faceM.c) : null), [sitM, faceM]);
  const xkFlow = useMemo(() => annualChart(flowYearNow), [flowYearNow]);
  // 計算某點（圖像座標）所在的宮位＋吉凶
  // 單山的宮位＋玄空＋天星資訊
  const mountainInfo = useCallback((mc) => {
    const palace = MOUNTAIN_TO_PALACE[mc];
    const star = star24 ? star24[mc] : null;
    const starInfo = star ? (STAR24_INFO[star] || {}) : null;
    let xk = null;
    if (xkChart && palace) {
      const combo = starPair(xkChart.sG[palace], xkChart.fG[palace]);
      xk = { shan: xkChart.sG[palace], xiang: xkChart.fG[palace], flow: xkFlow[palace], combo };
    }
    return { mountain: mc, palace, palaceName: PALACE_GUA[palace], dir: PALACE_DIR[palace], star, starInfo, xk };
  }, [star24, xkChart, xkFlow]);
  // 一個點 → 所在山
  const pointMountain = useCallback((pt) => {
    if (!center) return null;
    return mountainAt(norm360(screenAngle(center, pt) - rot)).c;
  }, [center, rot]);
  // 家具／門嘅方位資訊：位置所在山＋（床/門）朝向山（圖像角 dir → 羅盤方位）
  const featureInfo = useCallback((f) => {
    const posM = center ? mountainAt(norm360(screenAngle(center, f) - rot)).c : null;
    const faceDeg = f.dir != null ? Math.round(norm360(f.dir - rot)) : null;
    const faceM = f.dir != null ? mountainAt(norm360(f.dir - rot)).c : null;
    return { posM: posM ? mountainInfo(posM) : null, faceM: faceM ? mountainInfo(faceM) : null, faceDeg };
  }, [center, rot, mountainInfo]);
  // 房間 → 涵蓋的山＋各山佔比（面積加權）。若用家手動指定咗山（manualMountains）就用佢。
  const roomMountainDetail = useCallback((room) => {
    if (!center) return [];
    if (Array.isArray(room.manualMountains) && room.manualMountains.length) {
      const n = room.manualMountains.length;
      return room.manualMountains.map((mc) => ({ mountain: mc, pct: Math.round((1000 / n) / 10), manual: true }));
    }
    const pts = room.pts && room.pts.length ? room.pts : [{ x: room.x, y: room.y }];
    return coveredMountainsDetailed(pts, center, rot);
  }, [center, rot]);
  // 房間（單點或區域）→ 涵蓋的山列表的資訊（連佔比）
  const roomAnalysis = useCallback((room) => {
    return roomMountainDetail(room).map((d) => ({ ...mountainInfo(d.mountain), pct: d.pct, manual: !!d.manual }));
  }, [roomMountainDetail, mountainInfo]);
  // 房間主吉凶（取最凶者）
  const roomJi = (infos) => {
    if (!infos.length) return null;
    const order = { '大凶': 4, '凶': 3, '半凶': 2, '平': 1, '半吉': 0.5, '吉': 0 };
    let worst = infos[0];
    infos.forEach((i) => { const ji = i.xk ? i.xk.combo.t : (i.starInfo ? i.starInfo.ji : '平'); if ((order[ji] ?? 1) > (order[worst.xk ? worst.xk.combo.t : (worst.starInfo ? worst.starInfo.ji : '平')] ?? 1)) worst = i; });
    return worst.xk ? worst.xk.combo.t : (worst.starInfo ? worst.starInfo.ji : '平');
  };

  // ── AI 讀平面圖（vision）：自動搵房間＋位置，用家確認後一鍵標好 ──
  const [fpAi, setFpAi] = useState({ loading: false, rooms: null, error: '' });
  const runFpAi = async () => {
    if (!img || fpAi.loading) return;
    setFpAi({ loading: true, rooms: null, features: null, error: '' });
    try {
      const { json } = await aiInterpret({ task: 'readFloorplan', image: img.url, imgW: img.w, imgH: img.h });
      const rooms = (json && json.rooms) || [];
      const feats = (json && json.features) || [];
      if (!rooms.length && !feats.length) { setFpAi({ loading: false, rooms: null, features: null, error: 'AI 搵唔到房間，請試下清晰啲嘅平面圖，或手動標。' }); return; }
      setFpAi({ loading: false, rooms, features: feats, error: '' });
    } catch (e) { setFpAi({ loading: false, rooms: null, features: null, error: String((e && e.message) || e) }); }
  };
  // 確認加入：AI 搵到嘅房間（normalized 0–1）→ 區域房（四邊形）；家具/門 → feature 標記
  const confirmFpAi = () => {
    const detected = (fpAi.rooms || []).map((r) => {
      const x1 = Math.round(Math.min(r.x1, r.x2) * img.w), y1 = Math.round(Math.min(r.y1, r.y2) * img.h);
      const x2 = Math.round(Math.max(r.x1, r.x2) * img.w), y2 = Math.round(Math.max(r.y1, r.y2) * img.h);
      return { pts: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }], type: r.type, furniture: [] };
    });
    const feats = (fpAi.features || []).map((f) => ({
      type: f.type, x: Math.round(f.cx * img.w), y: Math.round(f.cy * img.h), dir: f.dir != null ? f.dir : null,
    }));
    if (detected.length) setRooms((rs) => [...rs, ...detected]);
    if (feats.length) setFeatures((fs) => [...fs, ...feats]);
    setFpAi({ loading: false, rooms: null, features: null, error: '' });
  };

  // persist computed centre + facing so the 玄空 quick-view can render without re-detecting
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...obj, center, facingDeg }));
    } catch {}
  }, [center, facingDeg]);

  const applyToXuanKong = () => {
    if (facingDeg == null) return;
    try {
      localStorage.setItem('mo_xk_apply', JSON.stringify({ degree: Math.round(facingDeg * 10) / 10, mode: '向' }));
      window.dispatchEvent(new Event('mo-xk-apply'));
    } catch {}
    if (onGotoXuanKong) onGotoXuanKong();
  };

  const undoPin = () => { setPins((ps) => ps.slice(0, -1)); setSelectedPin(null); };
  const deleteSelected = () => {
    if (selectedPin == null) return;
    setPins((ps) => ps.filter((_, i) => i !== selectedPin));
    setSelectedPin(null);
  };
  const clearPins = () => { setPins([]); setSelectedPin(null); setManualCenter(null); };

  const onUpload = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    compressImage(f, (res) => {
      if (res) { setImg(res); setPins([]); setManualCenter(null); setRefLine(null); setSelectedPin(null); setMode('pin'); }
    });
    e.target.value = '';
  };

  const instruction = !img ? '' :
    sunMode ? '☀ 喺平面圖點一下日照最強嘅位置（大窗／露台），中心指向該點即天星向首。' :
    mode === 'view' ? '檢視模式：可捲動 / 縮放。切換到「加點」開始描外牆。' :
    mode === 'manual' ? '👆 在平面圖上點一下，設定中心點。' :
    mode === 'ref' ? (refStart
      ? '第二步：點 B（門外方向）。箭咀由 A 指向 B，B 的方向即大門朝向。'
      : '🧭 第一步：點 A（固定點，室內近門位置）。') :
    pins.length < 3 ? `🔴 沿外牆點角位，形成多邊形（已 ${pins.length} 點，至少 3 點）。可直接拖動調整。` :
    `✅ 多邊形完成（${pins.length} 點）。可繼續加點、拖動調整，或點選後刪除。`;

  const polyPath = pins.length >= 2
    ? pins.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + (pins.length >= 3 ? ' Z' : '')
    : null;

  return (
    <div className="indoor">
      <div className="indoor-toolbar">
        <label className="indoor-upload">
          📤 {img ? '更換平面圖' : '上傳平面圖'}
          <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
        </label>
        {img && (
          <div className="indoor-modes">
            {[['view', '👁 檢視'], ['pin', '🔴 加點'], ['manual', '🎯 中心'], ['ref', '🧭 坐向'], ['room', '🏠 標房']].map(([v, l]) => (
              <button key={v} className={`indoor-mode ${mode === v ? 'active' : ''}`} onClick={() => setMode(v)}>{l}</button>
            ))}
            {/* 快速加區域房：唔使拉到下面撳「區域」，一掣直接開始描 */}
            <button type="button" className={`indoor-mode indoor-quick-area${mode === 'room' && roomSubMode === 'area' ? ' active' : ''}`}
              onClick={() => { setMode('room'); setRoomSubMode('area'); setAreaDraft([]); }}
              title="直接開始描一間房嘅範圍（跨多山）">＋ 加區域房</button>
            {/* 微調：一撿入編輯模式，撳平面圖上嘅房就可以拖頂點（唔使拉到下面） */}
            <button type="button" className={`indoor-mode${mode === 'tune' ? ' active' : ''}`}
              onClick={() => { setMode('tune'); setRoomSubMode('point'); }}
              title="微調模式：撳平面圖上嘅房間，就可以拖頂點改範圍">✋ 微調</button>
            {/* 標家具/風水物：手動放床（連床頭向）、灶頭、廁所、門、窗 */}
            <button type="button" className={`indoor-mode${mode === 'feature' ? ' active' : ''}`}
              onClick={() => setMode('feature')}
              title="手動標重要家具／風水物（床、灶頭、廁所、門、窗）">🛏 標家具</button>
          </div>
        )}
        {/* 標家具模式：揀類型＋點平面圖放置 */}
        {img && mode === 'feature' && (
          <div className="indoor-feature-bar">
            <span className="indoor-feature-bar-label">放：</span>
            <div className="indoor-feature-bar-chips">
              {FEATURE_TYPES.map((t) => (
                <button key={t} type="button" className={`furn-chip${featureType === t ? ' on' : ''}`} onClick={() => setFeatureType(t)}>{FEATURE_ICON[t]} {t}</button>
              ))}
            </div>
            <span className="indoor-feature-bar-hint">點平面圖放置；床／門放完再設方向</span>
          </div>
        )}
        {img && mode === 'room' && roomSubMode === 'area' && (
          <div className="indoor-quick-area-hint">🖊 區域模式：喺平面圖逐點描出房間範圍，然後喺下面撳「✓ 完成」。{areaDraft.length > 0 ? `已描 ${areaDraft.length} 點。` : ''}</div>
        )}
        {img && chartLib && (
          <button type="button" className="save-chart-btn" onClick={() => {
            const def = `室內平面圖${sitM ? `（坐${sitM.c}向${faceM.c}）` : ''}`;
            const name = window.prompt('為這個平面圖命名：', def);
            if (name == null) return;
            chartLib.save({
              type: 'indoor', name: name.trim() || '未命名平面圖',
              desc: sitM ? `坐${sitM.c}山 向${faceM.c}` : '未校準坐向',
              state: { img, pins, centerMethod, manualCenter, refLine, refDegree, rot, decl, showCompass, opacity, compassSize, layers, center, facingDeg },
            });
          }}>💾 存盤</button>
        )}
      </div>

      {!img && (
        <div className="indoor-empty">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏠</div>
          <div>上傳單位平面圖，系統會自動偵測牆壁找出中心點（立極點），</div>
          <div>亦可沿外牆加點更準確；再標定大門坐向，套上 24 山羅盤。</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>建議用 iPhone / iPad：可直接拖動調整角點。</div>
        </div>
      )}

      {img && (
        <div className="indoor-canvas-outer">
          {/* 放大控制 */}
          <div className="indoor-zoom-bar">
            <button type="button" className="indoor-zoom-btn" onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))} disabled={zoom <= 1}>−</button>
            <input type="range" min="1" max="4" step="0.25" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="indoor-zoom-slider" />
            <button type="button" className="indoor-zoom-btn" onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))} disabled={zoom >= 4}>＋</button>
            <span className="indoor-zoom-val">{Math.round(zoom * 100)}%</span>
            {zoom > 1 && <button type="button" className="indoor-zoom-btn" onClick={() => setZoom(1)}>重設</button>}
            <span className="indoor-zoom-hint">{zoom > 1 ? '放大咗可以拖捲平面圖，精準標房' : '放大可以睇清楚先標'}</span>
          </div>
          {/* 微調模式提示（選中咗區域房） */}
          {selRoom != null && rooms[selRoom] && rooms[selRoom].pts && mode === 'room' && roomSubMode === 'point' && (
            <div className="indoor-editing-banner">
              ✋ 微調「{rooms[selRoom].type}」：拖白色頂點改形狀｜點邊上虛線 ○ 加頂點
              <button type="button" onClick={() => { setSelRoom(null); setDelVertexMode(false); }}>✓ 完成</button>
            </div>
          )}
          <div className="indoor-canvas-wrap" style={{ overflow: zoom > 1 ? 'auto' : 'visible' }}>
            <div className="indoor-canvas-scale" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
            <img src={img.url} alt="floorplan" draggable={false} />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${img.w} ${img.h}`}
              style={{ touchAction: mode === 'view' ? 'auto' : 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {polyPath && (
                <path d={polyPath} fill="none" stroke="rgba(60,120,255,0.95)" strokeWidth={unit * 0.007} />
              )}

              {showCompass && (
                <CompassOverlay center={center} rot={rot} facingDeg={facingDeg} layers={layers}
                  unit={unit} Rout={Rout} Rline={Rline} mtFont={mtFont} tgFont={tgFont} star24={star24} opacity={opacity}
                  starFaceDeg={starFaceDeg} />
              )}

              {/* A→B reference line (only while setting 坐向) */}
              {refLine && mode === 'ref' && (() => {
                const ang = Math.atan2(refLine.y2 - refLine.y1, refLine.x2 - refLine.x1);
                const ah = unit * 0.055;
                const bx = refLine.x2, by = refLine.y2;
                const w1 = ang + Math.PI * 0.82, w2 = ang - Math.PI * 0.82;
                const p1 = { x: bx + ah * Math.cos(w1), y: by + ah * Math.sin(w1) };
                const p2 = { x: bx + ah * Math.cos(w2), y: by + ah * Math.sin(w2) };
                return (
                  <g>
                    <line x1={refLine.x1} y1={refLine.y1} x2={bx} y2={by} stroke="#ff8800" strokeWidth={unit * 0.008} />
                    <polygon points={`${bx},${by} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill="#ff8800" />
                    <circle cx={refLine.x1} cy={refLine.y1} r={unit * 0.016} fill="#ff8800" stroke="#fff" strokeWidth={unit * 0.005} />
                    <HaloText x={refLine.x1} y={refLine.y1 - unit * 0.05} size={unit * 0.05} fill="#c60">A</HaloText>
                    <HaloText x={bx} y={by + unit * 0.07} size={unit * 0.05} fill="#c60">B</HaloText>
                  </g>
                );
              })()}

              {pins.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={HIT_R} fill="transparent" />
                  <circle cx={p.x} cy={p.y} r={PIN_R * (selectedPin === i ? 1.5 : 1)}
                    fill={selectedPin === i ? '#ff4444' : '#ff8800'} stroke="#fff" strokeWidth={unit * 0.005} />
                  <HaloText x={p.x} y={p.y - PIN_R * 2.4} size={unit * 0.03} fill="#c60">{i + 1}</HaloText>
                </g>
              ))}

              {/* 房間標注（單點＝方塊；區域＝多邊形），按所在宮位吉凶著色 */}
              {rooms.map((r, i) => {
                const infos = roomAnalysis(r);
                const ji = roomJi(infos);
                const col = ji === '吉' || ji === '半吉' ? '#16a34a' : ji === '大凶' ? '#7f1d1d' : (ji === '凶' || ji === '半凶') ? '#dc2626' : '#b8860b';
                const pts = r.pts && r.pts.length ? r.pts : [{ x: r.x, y: r.y }];
                const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
                const isArea = pts.length >= 2;
                return (
                  <g key={'room' + i}>
                    {isArea ? (
                      <>
                      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={unit * 0.006} />
                      {/* 微調：選中嘅區域房顯示可拖頂點＋邊中點（加頂點） */}
                      {selRoom === i && pts.map((p, k) => (
                        <circle key={'vh' + k} cx={p.x} cy={p.y} r={PIN_R * 0.95} fill={delVertexMode ? '#dc2626' : '#fff'} stroke={col} strokeWidth={unit * 0.006} style={{ cursor: delVertexMode ? 'not-allowed' : 'grab' }} />
                      ))}
                      {selRoom === i && !delVertexMode && pts.map((p, k) => {
                        const q = pts[(k + 1) % pts.length];
                        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
                        return <circle key={'mid' + k} cx={mx} cy={my} r={PIN_R * 0.6} fill="rgba(255,255,255,0.55)" stroke={col} strokeWidth={unit * 0.004} strokeDasharray={`${unit * 0.008} ${unit * 0.008}`} style={{ cursor: 'copy' }} />;
                      })}
                      </>
                    ) : (
                      <>
                        <circle cx={r.x} cy={r.y} r={HIT_R} fill="transparent" />
                        <rect x={r.x - PIN_R * 1.2} y={r.y - PIN_R * 1.2} width={PIN_R * 2.4} height={PIN_R * 2.4} rx={PIN_R * 0.5}
                          fill={col} stroke="#fff" strokeWidth={unit * 0.005} opacity={selRoom === i ? 1 : 0.9} />
                      </>
                    )}
                    <HaloText x={cx} y={cy - PIN_R * 2.8} size={unit * 0.032} fill={col}>{r.type}{isArea ? `（${infos.length}山）` : ''}</HaloText>
                  </g>
                );
              })}
              {/* 家具／門標記（AI 讀圖）；床同門顯示方向箭嘴；選中嘅有旋轉手柄 */}
              {features.map((f, i) => {
                const rad = (((f.dir ?? 0)) * Math.PI) / 180;
                const ax = f.x + Math.sin(rad) * unit * 0.055, ay = f.y - Math.cos(rad) * unit * 0.055;
                const sel = selFeature === i;
                return (
                  <g key={'feat' + i}>
                    <circle cx={f.x} cy={f.y} r={HIT_R} fill="transparent" />
                    <circle cx={f.x} cy={f.y} r={PIN_R * 1.15} fill={sel ? '#fdf0d5' : '#fff'} stroke={sel ? '#d21f8f' : '#8a5a2b'} strokeWidth={unit * (sel ? 0.008 : 0.005)} />
                    <HaloText x={f.x} y={f.y} size={unit * 0.042} fill="#5a4a2f">{FEATURE_ICON[f.type] || '◆'}</HaloText>
                    {f.dir != null && (
                      <>
                        <line x1={f.x} y1={f.y} x2={ax} y2={ay} stroke={sel ? '#d21f8f' : '#8a5a2b'} strokeWidth={unit * 0.007} />
                        <circle cx={ax} cy={ay} r={PIN_R * (sel ? 0.7 : 0.4)} fill={sel ? '#d21f8f' : '#8a5a2b'} style={{ cursor: 'grab' }} />
                      </>
                    )}
                  </g>
                );
              })}
              {/* 區域描點中（多邊形草稿） */}
              {areaDraft.length > 0 && (
                <polygon points={areaDraft.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(60,120,255,0.12)" stroke="#3c78ff" strokeWidth={unit * 0.005} strokeDasharray={`${unit * 0.02} ${unit * 0.012}`} />
              )}
              {areaDraft.map((p, i) => <circle key={'ad' + i} cx={p.x} cy={p.y} r={PIN_R * 0.8} fill="#3c78ff" stroke="#fff" strokeWidth={unit * 0.004} />)}

              {center && !showCompass && (
                <g>
                  <circle cx={center.x} cy={center.y} r={unit * 0.02} fill="none" stroke="#d21f1f" strokeWidth={unit * 0.006} />
                  <circle cx={center.x} cy={center.y} r={unit * 0.008} fill="#d21f1f" />
                </g>
              )}
            </svg>
            </div>{/* /indoor-canvas-scale */}

            {/* floating compass settings */}
            <button type="button" className={`indoor-gear ${panelOpen ? 'open' : ''}`} onClick={() => setPanelOpen((o) => !o)}>⚙ 羅盤</button>
            {panelOpen && (
              <div className="indoor-gear-panel">
                <label className="indoor-check">
                  <input type="checkbox" checked={showCompass} onChange={(e) => setShowCompass(e.target.checked)} /> 顯示羅盤
                </label>
                <div className="gp-row"><span>大小</span>
                  <input type="range" min="0.3" max="1.6" step="0.05" value={compassSize} onChange={(e) => setCompassSize(parseFloat(e.target.value))} />
                </div>
                <div className="gp-row"><span>透明</span>
                  <input type="range" min="0.2" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} />
                </div>
                <div className="gp-layers">
                  {[['mountains', '24山'], ['trigrams', '八卦'], ['stars24', '天星'], ['degrees', '度數'], ['extend', '延伸線']].map(([k, l]) => (
                    <label key={k} className="indoor-check">
                      <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((s) => ({ ...s, [k]: e.target.checked }))} /> {l}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {img && <div className="indoor-status">{instruction}</div>}

      {img && (
        <div className="indoor-controls">
          <div className="indoor-panel">
            <div className="indoor-panel-title">① 中心點（立極點）</div>
            <div className="indoor-method-grid">
              {CENTER_METHODS.map((m) => (
                <button key={m.v} className={`indoor-method ${centerMethod === m.v ? 'active' : ''}`}
                  onClick={() => { setCenterMethod(m.v); if (m.v === 'manual') setMode('manual'); }}
                  title={m.hint}>{m.l}</button>
              ))}
            </div>
            <div className="indoor-method-hint">{CENTER_METHODS.find((m) => m.v === centerMethod)?.hint}</div>
            {centerSource && <div className="indoor-center-note">中心點已標示（紅色十字）。來源：{centerSource}。</div>}
            <div className="indoor-pin-tools">
              <button onClick={undoPin} disabled={!pins.length}>↩ 撤銷上一點</button>
              <button onClick={deleteSelected} disabled={selectedPin == null}>✕ 刪除選中點</button>
              <button onClick={clearPins} disabled={!pins.length}>🗑 清除加點</button>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
              未加點時會自動偵測牆壁計算；沿外牆加 3 點以上成多邊形會更準確。
            </div>
          </div>

          <div className="indoor-panel">
            <div className="indoor-panel-title">② 設定坐向</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
              按「🧭 坐向」後，先點 <b>A</b>（固定點，室內近門）再點 <b>B</b>（門外方向），箭咀由 A 指向 B；
              然後輸入 B 方向的現場實測度數。
            </div>
            <div className="indoor-row">
              <label>實測度數</label>
              <input type="number" inputMode="decimal" min="0" max="359.9" step="0.1" value={refDegree}
                onChange={(e) => setRefDegree(e.target.value)} placeholder="0–359.9" />
              <button className="indoor-apply" onClick={applyRefDegree} disabled={!refLine || refDegree === ''}>套用</button>
            </div>
            <div className="indoor-row">
              <label>磁偏角</label>
              <input type="number" inputMode="decimal" step="0.1" value={decl}
                onChange={(e) => setDecl(e.target.value)} placeholder="0" />
              <span style={{ fontSize: 11, opacity: 0.7 }}>手機指南針為磁北才需填</span>
            </div>
            <div className="indoor-row">
              <label>微調旋轉</label>
              <input type="range" min="0" max="359.9" step="0.5" value={rot}
                onChange={(e) => setRot(parseFloat(e.target.value))} style={{ flex: 1 }} />
              <input type="number" inputMode="decimal" step="0.5" value={Math.round(rot * 10) / 10}
                onChange={(e) => setRot(norm360(parseFloat(e.target.value) || 0))} style={{ width: 64 }} />
            </div>
            {faceM && sitM && (
              <div className="indoor-result">
                <div className="indoor-sf">坐 <b>{sitM.c}</b>（{Math.round(sittingDeg)}°） 向 <b>{faceM.c}</b>（{Math.round(facingDeg)}°）</div>
                <button className="indoor-xk" onClick={applyToXuanKong}>⭐ 套用到玄空飛星</button>
              </div>
            )}
            {/* 天星向首（日照最強方向）：天星唔跟羅盤向首，跟納光口 */}
            <div className="indoor-starface">
              <div className="indoor-row" style={{ marginTop: 8 }}>
                <label>天星向首</label>
                <input type="number" inputMode="decimal" min="0" max="359.9" step="0.1" value={starFaceDeg ?? ''}
                  onChange={(e) => setStarFaceDeg(e.target.value === '' ? null : norm360(parseFloat(e.target.value) || 0))} placeholder="日照最強°" />
                <button type="button" className={`indoor-apply${sunMode ? ' sun-on' : ''}`} onClick={() => setSunMode((v) => !v)}>☀ 點光位</button>
                {starFaceDeg != null && <button type="button" className="indoor-area-cancel" onClick={() => setStarFaceDeg(null)}>清除</button>}
              </div>
              {sunMode && <div className="indoor-method-hint">☀ 喺平面圖點一下日照最強嘅位置（如大窗／露台），中心指向該點即天星向首。</div>}
              <div className="indoor-row">
                <label>排盤法</label>
                <div className="seg">
                  {STAR24_METHODS.map((m) => (
                    <button key={m.id} type="button" className={star24Method === m.id ? 'on' : ''}
                      title={m.id === 'xuandao' ? '講堂立極尺版本：甲乙兩盤' : '傳統八宅遊年：坐山起伏位，每個坐山出一個唔同嘅盤'}
                      onClick={() => setStar24Method(m.id)}>{m.label}</button>
                  ))}
                </div>
              </div>
              {starFaceDeg != null && (
                <div className="indoor-method-hint">天星向首 <b>{starFaceC}</b>（{starFaceDeg}°）・天星坐山 <b>{starSitC}</b>　— 天星盤依光向重排，逐山對返羅盤（唔係旋轉個環）。</div>
              )}
            </div>
          </div>

          <div className="indoor-panel">
            <div className="indoor-panel-title">③ 房間標注（按宮位吉凶）</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
              {sitM ? '按「🏠 標房」：「單點」直接點房間；「區域」逐點描房間範圍再按完成（跨多個山會一拼分析）。' : '請先完成②設定坐向，才能計算各房間的吉凶。'}
            </div>
            <div className="indoor-room-submode">
              <button type="button" className={roomSubMode === 'point' ? 'on' : ''} onClick={() => { setRoomSubMode('point'); setAreaDraft([]); }}>單點</button>
              <button type="button" className={roomSubMode === 'area' ? 'on' : ''} onClick={() => setRoomSubMode('area')}>區域（跨多山）</button>
              {roomSubMode === 'area' && areaDraft.length > 0 && (
                <>
                  <button type="button" className="indoor-area-done" onClick={() => { setRooms((rs) => [...rs, { pts: areaDraft, type: '睡房', furniture: [] }]); setSelRoom(rooms.length); setAreaDraft([]); }}>✓ 完成（{areaDraft.length}點）</button>
                  <button type="button" className="indoor-area-cancel" onClick={() => setAreaDraft((dr) => dr.slice(0, -1))}>− 刪最後點</button>
                  <button type="button" className="indoor-area-cancel" onClick={() => setAreaDraft([])}>✕ 取消</button>
                </>
              )}
            </div>
            {roomSubMode === 'area' && <div className="indoor-method-hint">在平面圖逐點描出房間範圍；<b>描緊嗰陣可以直接拖啲藍點調整</b>，撳錯咗可以「− 刪最後點」。完成後會分析涵蓋的所有山。</div>}

            {/* AI 讀平面圖：自動搵房間＋位置，確認後一鍵標好 */}
            <div className="indoor-fpai">
              <button type="button" className="ai-btn indoor-fpai-btn" onClick={runFpAi} disabled={fpAi.loading}>
                {fpAi.loading ? 'AI 讀平面圖中…' : '✨ AI 讀平面圖搵房間'}
              </button>
              {fpAi.error && <div className="ai-error">{fpAi.error}</div>}
              {fpAi.rooms && (
                <div className="indoor-fpai-review">
                  {fpAi.rooms.length > 0 && <div className="indoor-fpai-head">空間（{fpAi.rooms.length}）— 可改類型／刪除；加入後可拖頂點微調：</div>}
                  {fpAi.rooms.map((r, i) => (
                    <div key={i} className="indoor-fpai-row">
                      <select value={r.type} onChange={(e) => setFpAi((s) => ({ ...s, rooms: s.rooms.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) }))}>
                        {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="indoor-fpai-pos">{Math.round(r.cx * 100)}%, {Math.round(r.cy * 100)}%</span>
                      <button type="button" className="indoor-room-del" onClick={() => setFpAi((s) => ({ ...s, rooms: s.rooms.filter((_, j) => j !== i) }))}>✕</button>
                    </div>
                  ))}
                  {(fpAi.features || []).length > 0 && <div className="indoor-fpai-head" style={{ marginTop: 8 }}>家具／門（{fpAi.features.length}）— 床同門會連方向：</div>}
                  {(fpAi.features || []).map((f, i) => (
                    <div key={'f' + i} className="indoor-fpai-row">
                      <span className="indoor-fpai-ficon">{FEATURE_ICON[f.type] || '◆'}</span>
                      <span className="indoor-fpai-fname">{f.type}{f.dir != null ? `（向 ${Math.round(f.dir)}°）` : ''}</span>
                      <span className="indoor-fpai-pos">{Math.round(f.cx * 100)}%, {Math.round(f.cy * 100)}%</span>
                      <button type="button" className="indoor-room-del" onClick={() => setFpAi((s) => ({ ...s, features: s.features.filter((_, j) => j !== i) }))}>✕</button>
                    </div>
                  ))}
                  <div className="indoor-fpai-actions">
                    <button type="button" className="indoor-area-done" onClick={confirmFpAi} disabled={!(fpAi.rooms.length + (fpAi.features || []).length)}>✓ 加入全部（{fpAi.rooms.length + (fpAi.features || []).length}）</button>
                    <button type="button" className="indoor-area-cancel" onClick={() => setFpAi({ loading: false, rooms: null, features: null, error: '' })}>✕ 取消</button>
                  </div>
                </div>
              )}
              <div className="indoor-method-hint">AI 讀圖會用 vision 模型；搵到嘅房間以區域標出，床／灶頭／廁所／門／窗會標埋位置同方向，你可以再微調。</div>
            </div>

            {rooms.length === 0 && <div className="indoor-method-hint">尚未標注房間。</div>}
            {rooms.map((r, i) => {
              const infos = roomAnalysis(r);
              const ji = roomJi(infos);
              const col = ji === '吉' || ji === '半吉' ? '#16a34a' : ji === '大凶' ? '#7f1d1d' : (ji === '凶' || ji === '半凶') ? '#dc2626' : '#b8860b';
              const isArea = r.pts && r.pts.length >= 2;
              return (
                <div key={i} className={`indoor-room${selRoom === i ? ' sel' : ''}`} onClick={() => setSelRoom(selRoom === i ? null : i)}>
                  <div className="indoor-room-top">
                    <select value={r.type} onClick={(e) => e.stopPropagation()} onChange={(e) => setRooms((rs) => rs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                      {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="indoor-room-pal">{isArea ? `區域・跨 ${infos.length} 山` : (infos[0] ? `${infos[0].palaceName}宮・${infos[0].dir}・${infos[0].mountain}山` : '')}</span>
                    <span className="indoor-room-ji" style={{ background: col }}>{ji || '—'}</span>
                    {isArea && (
                      <button type="button" className={`indoor-room-mtn-btn${selRoom === i ? ' on' : ''}`} title="微調呢間房嘅範圍（拖頂點改形狀）"
                        onClick={(e) => { e.stopPropagation(); setMode('room'); setRoomSubMode('point'); setSelRoom(i); setMtnPickerIdx(null); document.querySelector('.indoor-canvas-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>✋微調</button>
                    )}
                    <button type="button" className={`indoor-room-mtn-btn${(r.manualMountains && r.manualMountains.length) ? ' on' : ''}`} title="手動指定呢間房喺邊啲山"
                      onClick={(e) => { e.stopPropagation(); setMtnPickerIdx(mtnPickerIdx === i ? null : i); }}>✋山</button>
                    <button type="button" className="indoor-room-del" onClick={(e) => { e.stopPropagation(); setRooms((rs) => rs.filter((_, j) => j !== i)); setSelRoom(null); }}>✕</button>
                  </div>
                  {/* 各山佔比（面積加權）；手動指定就平均 */}
                  {infos.length > 0 && (
                    <div className="indoor-room-pct">
                      佔比：{infos.map((info) => `${info.mountain}${Math.round(info.pct)}%`).join('　')}{infos[0] && infos[0].manual ? '（手動平均）' : ''}
                    </div>
                  )}
                  {/* 微調工具（選中嘅區域房）：拖頂點／加頂點／刪頂點 */}
                  {selRoom === i && isArea && (
                    <div className="indoor-room-tune" onClick={(e) => e.stopPropagation()}>
                      <span className="indoor-room-tune-hint">微調：拖白色頂點改形狀；點邊上嘅虛線 ○ 加頂點</span>
                      <button type="button" className={`indoor-room-mtn-btn${delVertexMode ? ' on' : ''}`}
                        onClick={() => setDelVertexMode((v) => !v)}>{delVertexMode ? '✓ 完成刪除' : '− 刪頂點'}</button>
                      {delVertexMode && <span className="indoor-room-tune-hint" style={{ color: '#c62828' }}>點紅色頂點刪除（至少留 3 點）</span>}
                    </div>
                  )}
                  {/* 手動指定山 picker（24 山 chips） */}
                  {mtnPickerIdx === i && (
                    <div className="indoor-mtn-picker" onClick={(e) => e.stopPropagation()}>
                      <div className="indoor-mtn-picker-head">
                        揀呢間房喺邊啲山（可多揀）：
                        {(r.manualMountains && r.manualMountains.length) > 0 && (
                          <button type="button" className="indoor-area-cancel" onClick={() => setRooms((rs) => rs.map((x, j) => (j === i ? { ...x, manualMountains: [] } : x)))}>清除（用返自動）</button>
                        )}
                      </div>
                      <div className="indoor-mtn-picker-chips">
                        {MOUNTAINS24.map((m) => {
                          const on = (r.manualMountains || []).includes(m.c);
                          return (
                            <button key={m.c} type="button" className={`furn-chip${on ? ' on' : ''}`}
                              onClick={() => setRooms((rs) => rs.map((x, j) => {
                                if (j !== i) return x;
                                const cur = x.manualMountains || [];
                                const next = on ? cur.filter((y) => y !== m.c) : [...cur, m.c].sort((a, b) => MOUNTAINS24.findIndex((z) => z.c === a) - MOUNTAINS24.findIndex((z) => z.c === b));
                                return { ...x, manualMountains: next };
                              }))}>{m.c}</button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {infos.map((info, k) => {
                    const adv = roomAdvice(info, r.type);
                    return (
                      <div key={k} className="indoor-room-adv">
                        {isArea && <div className="indoor-room-mtn">▸ {info.palaceName}宮・{info.dir}・{info.mountain}山（{adv.ji}）</div>}
                        <div className="indoor-room-facts">{adv.facts.join('；')}</div>
                        <div>{adv.advice}</div>
                      </div>
                    );
                  })}
                  <div className="indoor-room-furn">
                    <span className="indoor-room-furn-label">家具：</span>
                    <div className="indoor-room-furn-chips">
                      {COMMON_FURNITURE.map((f) => (
                        <button key={f.n} type="button" className={`furn-chip${(r.furniture || []).includes(f.n) ? ' on' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setRooms((rs) => rs.map((x, j) => (j === i ? { ...x, furniture: (x.furniture || []).includes(f.n) ? (x.furniture || []).filter((y) => y !== f.n) : [...(x.furniture || []), f.n] } : x))); }}>{f.n}</button>
                      ))}
                    </div>
                  </div>
                  {(r.furniture || []).length > 0 && <div className="indoor-room-furn-note">{furnitureNote(r, infos)}</div>}
                </div>
              );
            })}

            {/* ④ 家具／門風水（AI 讀圖標出嘅床、灶頭、廁所、門、窗） */}
            {features.length > 0 && sitM && (
              <div className="indoor-features">
                <div className="indoor-panel-title">④ 家具／門風水</div>
                {/* 門向分析 summary */}
                {features.filter((f) => f.type === '門').length > 0 && (() => {
                  const doors = features.filter((f) => f.type === '門');
                  return (
                    <div className="indoor-door-summary">
                      <b>全宅 {doors.length} 道門：</b>
                      {doors.map((f, k) => {
                        const info = featureInfo(f);
                        const ji = info.faceM && info.faceM.xk ? info.faceM.xk.combo.t : (info.faceM && info.faceM.starInfo ? info.faceM.starInfo.ji : '平');
                        const jiCol = ji === '吉' || ji === '半吉' ? '#16a34a' : (ji === '凶' || ji === '半凶' || ji === '大凶') ? '#dc2626' : '#b8860b';
                        return <span key={k} className="indoor-door-chip">門{k + 1} 向 <b>{info.faceM ? info.faceM.mountain : '—'}山</b>（{info.faceDeg}°・{info.faceM ? info.faceM.dir : ''}）<b style={{ color: jiCol }}>{ji}</b></span>;
                      })}
                    </div>
                  );
                })()}
                {features.map((f, i) => {
                  const info = featureInfo(f);
                  const posJi = info.posM && info.posM.xk ? info.posM.xk.combo.t : (info.posM && info.posM.starInfo ? info.posM.starInfo.ji : '平');
                  const faceJi = info.faceM && info.faceM.xk ? info.faceM.xk.combo.t : (info.faceM && info.faceM.starInfo ? info.faceM.starInfo.ji : null);
                  return (
                    <div key={i} className={`indoor-feature${selFeature === i ? ' sel' : ''}`}>
                      <div className="indoor-feature-top" onClick={() => setSelFeature(selFeature === i ? null : i)} style={{ cursor: 'pointer' }}>
                        <span className="indoor-fpai-ficon">{FEATURE_ICON[f.type] || '◆'}</span>
                        <span className="indoor-feature-name">{f.type}</span>
                        <span className="indoor-feature-pos">喺 {info.posM ? `${info.posM.mountain}山（${info.posM.palaceName}宮・${info.posM.dir}）` : '—'}{info.posM && info.posM.star ? `・天星${info.posM.star}（${posJi}）` : ''}</span>
                        <button type="button" className="indoor-room-del" onClick={(e) => { e.stopPropagation(); setFeatures((fs) => fs.filter((_, j) => j !== i)); }}>✕</button>
                      </div>
                      {info.faceM && (
                        <div className="indoor-feature-face">
                          向 <b>{info.faceM.mountain}山</b>（{info.faceDeg}°・{info.faceM.dir}）
                          {info.faceM.star && <>・天星「{info.faceM.star}」（{info.faceM.starInfo.ji}{info.faceM.starInfo.governs ? `，${info.faceM.starInfo.governs}` : ''}）</>}
                          {faceJi && <>・<b style={{ color: faceJi === '吉' || faceJi === '半吉' ? '#16a34a' : '#dc2626' }}>{faceJi}</b></>}
                        </div>
                      )}
                      {/* 精密角度調整（揀中嘅床/門）：改羅盤度數，平面圖箭嘴跟住轉 */}
                      {selFeature === i && f.dir != null && (
                        <div className="indoor-angle-editor" onClick={(e) => e.stopPropagation()}>
                          <span className="indoor-angle-label">精密角度：</span>
                          <input type="number" className="indoor-angle-input" min="0" max="359.9" step="0.1"
                            value={Math.round(norm360(f.dir - rot) * 10) / 10}
                            onChange={(e) => { const c = parseFloat(e.target.value); if (!isNaN(c)) setFeatures((fs) => fs.map((x, j) => (j === i ? { ...x, dir: norm360(c + rot) } : x))); }} />
                          <span className="indoor-angle-mt">°＝<b>{info.faceM ? `${info.faceM.mountain}山 ${info.faceM.dir}` : ''}</b></span>
                          <input type="range" className="indoor-angle-slider" min="0" max="359.9" step="0.1"
                            value={norm360(f.dir - rot)}
                            onChange={(e) => { const c = parseFloat(e.target.value); setFeatures((fs) => fs.map((x, j) => (j === i ? { ...x, dir: norm360(c + rot) } : x))); }} />
                          <span className="indoor-angle-hint">拖平面圖上嘅箭嘴都得</span>
                        </div>
                      )}
                      {/* 床頭命卦：輸入使用者年份＋性別 */}
                      {f.type === '床' && (
                        <div className="indoor-bedhead">
                          <span className="indoor-bedhead-label">邊個瞓？</span>
                          <input type="number" className="indoor-bedhead-year" placeholder="出生年" min="1920" max="2026"
                            value={f.occupant?.year || ''} onChange={(e) => setFeatures((fs) => fs.map((x, j) => (j === i ? { ...x, occupant: { ...(x.occupant || {}), year: e.target.value } } : x)))} />
                          <div className="seg">
                            {['男', '女'].map((g) => (
                              <button key={g} type="button" className={(f.occupant?.gender) === g ? 'on' : ''}
                                onClick={() => setFeatures((fs) => fs.map((x, j) => (j === i ? { ...x, occupant: { ...(x.occupant || {}), gender: g } } : x)))}>{g}</button>
                            ))}
                          </div>
                          {(() => {
                            const yr = parseInt(f.occupant?.year, 10);
                            const g = f.occupant?.gender;
                            if (!yr || !g || yr < 1920 || yr > 2026) return null;
                            const gua = lifeGua(yr, g);
                            const bz = bazhai(gua);
                            const east4 = EAST4.includes(gua);
                            const headPalace = info.faceM ? info.faceM.palace : null;
                            const headStar = headPalace && bz[headPalace] ? bz[headPalace] : null;
                            const good = headStar && headStar.ji === '吉';
                            const goodDirs = Object.entries(bz).filter(([, v]) => v.ji === '吉').map(([p, v]) => `${PALACE_DIR[p]}（${v.star}）`).join('、');
                            return (
                              <div className="indoor-bedhead-result">
                                <div>{yr}年{g}命 → <b>{GUA_NAME[gua]}命</b>（{east4 ? '東四命' : '西四命'}）。床頭向 <b>{info.faceM ? info.faceM.mountain : '—'}山（{info.faceM ? info.faceM.dir : ''}）</b>
                                  {headStar ? <>：屬 <b style={{ color: good ? '#16a34a' : '#dc2626' }}>{headStar.star}（{headStar.ji}）</b>{good ? '，啱佢 ✓' : '，唔啱佢 ✗'}</> : '。'}</div>
                                <div className="indoor-bedhead-best">{east4 ? '東四命宜東四方' : '西四命宜西四方'}；佢嘅四吉方：{goodDirs}。{!good && headStar ? '建議床頭改向四吉方之一。' : ''}</div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="indoor-method-hint">門向＝門口朝向嘅羅盤方位；床頭向＝床頭板指向。吉凶按玄空組合＋二十四天星＋（床）命卦八宅。AI 讀圖嘅方向未必百分百準，可喺下面微調。</div>
              </div>
            )}

            {/* AI 分析已集中到「風水 AI」分頁（嗰度睇到玄空全盤＋二十四天星＋你標注嘅房間逐山，可直接對話） */}
            {sitM && (
              <div className="indoor-method-hint" style={{ marginTop: 10 }}>
                💬 想 AI 分析呢個佈局／問顏色擺位？去「<b>風水 AI</b>」分頁 —— 佢睇到你標好嘅房間逐山，可以直接對話。
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
