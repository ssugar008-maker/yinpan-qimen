import React, { useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import StarRing from './StarRing.jsx';

// 平面圖立極尺：上載／貼上室內平面圖，疊加二十四天星環（拖曳移動、旋轉、縮放、透明度），可下載合成圖。
// 天星環為絕對方位（子＝正北向上）；先旋轉使向首對準平面圖的實際朝向，再拖曳對準宅心。
export default function FloorPlan({ map, sitM, faceM }) {
  const [img, setImg] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // 環中心相對容器中心的偏移
  const [rot, setRot] = useState(0);   // 旋轉角度（順時針）
  const [scale, setScale] = useState(80); // 百分比
  const [opacity, setOpacity] = useState(85);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);
  const dragRef = useRef(null);
  const fileRef = useRef(null);

  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => { setImg(e.target.result); setPos({ x: 0, y: 0 }); };
    reader.readAsDataURL(file);
  };
  // 貼上圖片
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (item) loadFile(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // 拖曳移動天星環
  const onPointerDown = (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { x0: e.clientX, y0: e.clientY, px: pos.x, py: pos.y };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setPos({ x: dragRef.current.px + (e.clientX - dragRef.current.x0), y: dragRef.current.py + (e.clientY - dragRef.current.y0) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const download = async () => {
    if (!boxRef.current || saving) return;
    setSaving(true);
    try {
      const canvas = await html2canvas(boxRef.current, { useCORS: true, backgroundColor: '#ffffff' });
      const a = document.createElement('a');
      a.download = `天星平面圖_${sitM}山${faceM}向.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch { /* 截圖失敗則略過 */ }
    setSaving(false);
  };

  return (
    <div className="panel">
      <div className="panel-head">平面圖立極尺（二十四天星疊加）</div>
      <div className="panel-body">
        {!img ? (
          <div className="fp-upload" onClick={() => fileRef.current && fileRef.current.click()}>
            <div className="fp-upload-text">點此上載平面圖，或直接貼上圖片（Ctrl+V）</div>
            <div className="fp-upload-sub">上載後：拖曳天星環對準宅心 → 旋轉使「向{faceM}」對準平面圖實際朝向 → 調整大小與透明度</div>
          </div>
        ) : (
          <>
            <div className="fp-stage" ref={boxRef}>
              <img src={img} alt="平面圖" className="fp-img" draggable="false" />
              <div
                className="fp-ring"
                style={{
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) rotate(${rot}deg) scale(${scale / 100})`,
                  opacity: opacity / 100,
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                title="拖曳移動天星環"
              >
                <StarRing map={map} sitM={sitM} faceM={faceM} size={420} mode="overlay" showCenter={false} />
              </div>
            </div>
            <div className="fp-controls">
              <label>旋轉 {rot}°
                <input type="range" min="0" max="359" value={rot} onChange={(e) => setRot(+e.target.value)} />
              </label>
              <label>大小 {scale}%
                <input type="range" min="30" max="200" value={scale} onChange={(e) => setScale(+e.target.value)} />
              </label>
              <label>透明度 {opacity}%
                <input type="range" min="20" max="100" value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
              </label>
            </div>
            <div className="fp-actions">
              <button type="button" className="btn" onClick={() => fileRef.current && fileRef.current.click()}>更換圖片</button>
              <button type="button" className="btn" onClick={() => { setPos({ x: 0, y: 0 }); setRot(0); setScale(80); setOpacity(85); }}>重設位置</button>
              <button type="button" className="btn primary" onClick={download} disabled={saving}>{saving ? '合成中…' : '下載合成圖'}</button>
            </div>
            <div className="sym-combo-note">（天星環為絕對方位：子＝正北。旋轉至向首對準平面圖朝向後，各山星位即對應實際方位；坐{sitM}山{faceM}向）</div>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => loadFile(e.target.files && e.target.files[0])} />
      </div>
    </div>
  );
}
