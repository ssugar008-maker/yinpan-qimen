import React, { useMemo } from 'react';
import { norm360, mountainAt, resolveCenter } from './geometry.js';
import { star24Map } from '../tianxing/stars24.js';
import CompassOverlay from './CompassOverlay.jsx';

const STORE_KEY = 'mo_indoor_v1';

// 玄空飛星內的「室內平面圖＋羅盤」速覽（唯讀）。讀取室內分頁已儲存的平面圖、立極點與坐向。
export default function IndoorQuickView() {
  const saved = useMemo(() => {
    try { const raw = localStorage.getItem(STORE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }, []);

  if (!saved || !saved.img) {
    return <div className="xk-note">尚未設定室內平面圖。請先到「室內」分頁上載平面圖、定立極點並校準坐向；之後此處會顯示平面圖＋24山／24天星羅盤，方便你邊看邊問。</div>;
  }

  const { img, facingDeg = null, rot = 0, opacity = 1, compassSize = 1 } = saved;
  const center = saved.center || (saved.pins && saved.pins.length >= 3 ? resolveCenter(saved.centerMethod, saved.pins, saved.manualCenter) : null);
  if (!center) {
    return <div className="xk-note">平面圖已載入，但尚未定立極點。請到「室內」分頁設定中心點（重心／加點／手動等）。</div>;
  }

  const unit = Math.min(img.w, img.h);
  const sittingDeg = facingDeg != null ? norm360(facingDeg + 180) : null;
  const sitM = sittingDeg != null ? mountainAt(sittingDeg) : null;
  const star24 = sitM ? star24Map(sitM.c) : null;

  const corners = [{ x: 0, y: 0 }, { x: img.w, y: 0 }, { x: 0, y: img.h }, { x: img.w, y: img.h }];
  const extR = Math.max(...corners.map((c) => Math.hypot(c.x - center.x, c.y - center.y))) * 1.04;
  const Rout = extR * compassSize;
  const Rline = Math.max(extR, Rout) * 1.3;
  const mtFont = unit * 0.05 * Math.min(1, compassSize * 1.1);
  const tgFont = unit * 0.055 * Math.min(1, compassSize * 1.1);
  // 速覽預設顯示 24山＋天星＋延伸線
  const layers = { mountains: true, trigrams: true, degrees: false, extend: true, ...(saved.layers || {}), stars24: true };

  return (
    <div className="indoor-quickview">
      <div className="indoor-canvas-wrap qv">
        <img src={img.url} alt="floorplan" draggable={false} />
        <svg viewBox={`0 0 ${img.w} ${img.h}`}>
          <CompassOverlay center={center} rot={rot} facingDeg={facingDeg} layers={layers}
            unit={unit} Rout={Rout} Rline={Rline} mtFont={mtFont} tgFont={tgFont} star24={star24} opacity={opacity} />
        </svg>
      </div>
      <div className="xk-note" style={{ marginTop: 6 }}>
        {sitM ? <>坐{sitM.c}山・向{mountainAt(facingDeg).c}（{Math.round(facingDeg)}°）。綠＝吉星、紅＝凶星。要修改平面圖或坐向，請到「室內」分頁。</> : '尚未校準坐向——請到「室內」分頁用「坐向」設定。'}
      </div>
    </div>
  );
}
