import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  MOUNTAINS24, TRIGRAMS8, mountainAt, norm360, screenAngle, polar, resolveCenter,
} from './geometry.js';
import { analyzeFloorplan } from './analyze.js';
import { star24Map, STAR24_INFO, PALACE_MOUNTAINS24 } from '../tianxing/stars24.js';
import { xuanKongChart, annualChart, starPair, PALACE_GUA, PALACE_DIR, PALACE_WX } from '../xuankong/engine.js';

// 山 → 宮位（後天八卦）反查
const MOUNTAIN_TO_PALACE = {};
Object.entries(PALACE_MOUNTAINS24).forEach(([p, ms]) => ms.forEach((m) => { MOUNTAIN_TO_PALACE[m] = +p; }));
import CompassOverlay, { HaloText } from './CompassOverlay.jsx';

const STORE_KEY = 'mo_indoor_v1';

const CENTER_METHODS = [
  { v: 'centroid', l: '⊕ 重心', hint: '面積加權重心，不規則 / L 形最準' },
  { v: 'bbox', l: '⬜ 邊界', hint: '外接矩形中心，接近方形適用' },
  { v: 'diagonal', l: '✕ 對角', hint: '四角形兩對角線交點（取四個極端角）' },
  { v: 'pole', l: '◉ 內切', hint: '最大內切圓心，離所有牆最遠的點' },
  { v: 'manual', l: '👆 手動', hint: '直接在圖上點一下定中心' },
];

const ROOM_TYPES = ['睡房', '主人房', '小孩房', '書房', '客廳', '廚房', '廁所', '大門', '神位', '通道', '其他'];
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
  const [rooms, setRooms] = useState(saved?.rooms || []); // 房間標注 [{x,y,type}]
  const [selRoom, setSelRoom] = useState(null);

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
        showCompass, opacity, compassSize, layers, rooms,
      }));
    } catch {}
  }, [img, pins, centerMethod, manualCenter, refLine, refDegree, rot, decl, showCompass, opacity, compassSize, layers, rooms]);

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

  const onPointerDown = (e) => {
    if (!img || mode === 'view') return;
    const pt = toSvg(e);
    drag.current = { idx: null, downPt: pt, moved: false };
    if (mode === 'pin') {
      const i = nearestPin(pt);
      if (i >= 0) {
        drag.current.idx = i;
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
    } else if (mode === 'ref' && refStart) {
      setRefLine((l) => (l ? { ...l, x2: pt.x, y2: pt.y } : l));
    }
  };

  const onPointerUp = (e) => {
    if (!img) return;
    const pt = toSvg(e);
    const d = drag.current;
    if (d.idx != null) {
      if (!d.moved) setSelectedPin((s) => (s === d.idx ? null : d.idx));
    } else if (mode === 'pin' && d.downPt && !d.moved) {
      setPins((ps) => { const np = [...ps, pt]; setSelectedPin(np.length - 1); return np; });
    } else if (mode === 'room' && d.downPt && !d.moved) {
      // 點一下：若點到既有房間則選中，否則新增房間
      const hit = rooms.findIndex((r) => Math.hypot(r.x - pt.x, r.y - pt.y) < HIT_R);
      if (hit >= 0) setSelRoom((s) => (s === hit ? null : hit));
      else {
        setRooms((rs) => [...rs, { x: Math.round(pt.x), y: Math.round(pt.y), type: '睡房' }]);
        setSelRoom(rooms.length);
      }
    }
    drag.current = { idx: null, downPt: null, moved: false };
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
  // 24 天星盤（依校準後的坐山起盤）
  const star24 = sitM ? star24Map(sitM.c) : null;
  // 玄空盤（9運）＋流年，用於房間吉凶
  const flowYearNow = new Date().getFullYear();
  const xkChart = useMemo(() => (sitM ? xuanKongChart(9, sitM.c, faceM.c) : null), [sitM, faceM]);
  const xkFlow = useMemo(() => annualChart(flowYearNow), [flowYearNow]);
  // 計算某點（圖像座標）所在的宮位＋吉凶
  const roomInfo = useCallback((pt) => {
    if (!center) return null;
    const sa = screenAngle(center, pt); // 螢幕方位
    const trueBearing = norm360(sa - rot); // 扣回羅盤旋轉 → 真方位
    const m = mountainAt(trueBearing);
    const palace = MOUNTAIN_TO_PALACE[m.c];
    const star = star24 ? star24[m.c] : null;
    const starInfo = star ? (STAR24_INFO[star] || {}) : null;
    let xk = null;
    if (xkChart && palace) {
      const combo = starPair(xkChart.sG[palace], xkChart.fG[palace]);
      xk = { shan: xkChart.sG[palace], xiang: xkChart.fG[palace], flow: xkFlow[palace], combo };
    }
    return { mountain: m.c, palace, palaceName: PALACE_GUA[palace], dir: PALACE_DIR[palace], star, starInfo, xk };
  }, [center, rot, star24, xkChart, xkFlow]);

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
          </div>
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
          <div className="indoor-canvas-wrap">
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
                  unit={unit} Rout={Rout} Rline={Rline} mtFont={mtFont} tgFont={tgFont} star24={star24} opacity={opacity} />
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

              {/* 房間標注（按所在宮位吉凶著色） */}
              {rooms.map((r, i) => {
                const info = roomInfo(r);
                const ji = info && info.xk ? info.xk.combo.t : (info && info.starInfo ? info.starInfo.ji : null);
                const col = ji === '吉' || ji === '半吉' ? '#16a34a' : ji === '大凶' ? '#7f1d1d' : (ji === '凶' || ji === '半凶') ? '#dc2626' : '#b8860b';
                return (
                  <g key={'room' + i}>
                    <circle cx={r.x} cy={r.y} r={HIT_R} fill="transparent" />
                    <rect x={r.x - PIN_R * 1.2} y={r.y - PIN_R * 1.2} width={PIN_R * 2.4} height={PIN_R * 2.4} rx={PIN_R * 0.5}
                      fill={col} stroke="#fff" strokeWidth={unit * 0.005} opacity={selRoom === i ? 1 : 0.9} />
                    <HaloText x={r.x} y={r.y - PIN_R * 2.8} size={unit * 0.032} fill={col}>{r.type}</HaloText>
                  </g>
                );
              })}

              {center && !showCompass && (
                <g>
                  <circle cx={center.x} cy={center.y} r={unit * 0.02} fill="none" stroke="#d21f1f" strokeWidth={unit * 0.006} />
                  <circle cx={center.x} cy={center.y} r={unit * 0.008} fill="#d21f1f" />
                </g>
              )}
            </svg>

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
          </div>

          <div className="indoor-panel">
            <div className="indoor-panel-title">③ 房間標注（按宮位吉凶）</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
              {sitM ? '按「🏠 標房」後在平面圖點房間位置，會依其所在宮位自動顯示吉凶與建議。' : '請先完成②設定坐向，才能計算各房間的吉凶。'}
            </div>
            {rooms.length === 0 && <div className="indoor-method-hint">尚未標注房間。</div>}
            {rooms.map((r, i) => {
              const info = roomInfo(r);
              const adv = roomAdvice(info, r.type);
              const col = adv ? (adv.isGood ? '#16a34a' : adv.isBad ? '#c62828' : '#b8860b') : '#b8860b';
              return (
                <div key={i} className={`indoor-room${selRoom === i ? ' sel' : ''}`} onClick={() => setSelRoom(selRoom === i ? null : i)}>
                  <div className="indoor-room-top">
                    <select value={r.type} onClick={(e) => e.stopPropagation()} onChange={(e) => setRooms((rs) => rs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                      {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {info && <span className="indoor-room-pal">{info.palaceName}宮・{info.dir}・{info.mountain}山</span>}
                    {adv && <span className="indoor-room-ji" style={{ background: col }}>{adv.ji}</span>}
                    <button type="button" className="indoor-room-del" onClick={(e) => { e.stopPropagation(); setRooms((rs) => rs.filter((_, j) => j !== i)); setSelRoom(null); }}>✕</button>
                  </div>
                  {adv && (
                    <div className="indoor-room-adv">
                      <div className="indoor-room-facts">{adv.facts.join('；')}</div>
                      <div>{adv.advice}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
