import React from 'react';
import { M24_ORDER, STAR24_INFO, mountainDeg24 } from './stars24.js';

// 二十四天星圓環（SVG）。
// mode="display"：坐山置頂（分析檢視用）；mode="overlay"：絕對方位（子=正北向上），由父層旋轉（平面圖疊加用）。
const jiColor24 = (ji) => (ji === '吉' ? '#16a34a' : ji === '大凶' ? '#7f1d1d' : '#dc2626');

export default function StarRing({ map, sitM, faceM, size = 400, mode = 'display', showCenter = true }) {
  const C = 200; // 中心
  const sitDeg = mountainDeg24(sitM);
  // display 模式：整環旋轉使坐山置頂
  const ringRot = mode === 'display' ? -sitDeg : 0;
  const sectors = M24_ORDER.map((m, i) => {
    const star = map[m];
    const info = STAR24_INFO[star] || {};
    return { m, deg: i * 15, star, ji: info.ji || '', wx: info.wx || '' };
  });
  const polar = (deg, r) => {
    const a = ((deg - 90) * Math.PI) / 180; // 0°=正北（上方）
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  return (
    <svg viewBox="0 0 400 400" width={size} height={size} className="star-ring" style={{ transform: ringRot ? `rotate(${ringRot}deg)` : undefined }}>
      <circle cx={C} cy={C} r={196} fill="#fdfbf6" stroke="#d8cbb2" strokeWidth="2" />
      <circle cx={C} cy={C} r={150} fill="none" stroke="#e4d9c3" strokeWidth="1" />
      <circle cx={C} cy={C} r={118} fill="none" stroke="#e4d9c3" strokeWidth="1" />
      {sectors.map((s) => {
        const [x1, y1] = polar(s.deg - 7.5, 118);
        const [x2, y2] = polar(s.deg - 7.5, 196);
        const [mx, my] = polar(s.deg, 182);   // 山名（外環）
        const [sx, sy] = polar(s.deg, 134);   // 星名（中環）
        const [wx, wy] = polar(s.deg, 164);   // 五行（小字）
        const isSit = s.m === sitM, isFace = s.m === faceM;
        // 文字沿半徑方向旋轉；左半邊翻轉 180° 保持可讀
        const textRot = s.deg > 90 && s.deg < 270 ? s.deg - 180 : s.deg;
        return (
          <g key={s.m}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e4d9c3" strokeWidth="1" />
            {(isSit || isFace) && (() => {
              const [tx, ty] = polar(s.deg, 108);
              return <circle cx={tx} cy={ty} r={9} fill={isSit ? '#8b5a2b' : '#2563eb'} />;
            })()}
            <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="700" fill="#6a5f4f"
              transform={`rotate(${textRot} ${mx} ${my})`}>{s.m}</text>
            <text x={wx} y={wy} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#a89a86"
              transform={`rotate(${textRot} ${wx} ${wy})`}>{s.wx || ''}</text>
            <text x={sx} y={sy} textAnchor="middle" dominantBaseline="middle" fontSize="12.5" fontWeight="700"
              fill={jiColor24(s.ji)} transform={`rotate(${textRot} ${sx} ${sy})`}>{s.star}</text>
            {(isSit || isFace) && (() => {
              const [tx, ty] = polar(s.deg, 108);
              return (
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="800" fill="#fff"
                  transform={`rotate(${textRot} ${tx} ${ty})`}>{isSit ? '坐' : '向'}</text>
              );
            })()}
          </g>
        );
      })}
      {showCenter && (
        <g style={ringRot ? { transform: `rotate(${-ringRot}deg)`, transformOrigin: '200px 200px' } : undefined}>
          <text x={C} y={C - 12} textAnchor="middle" fontSize="15" fontWeight="800" fill="#6a5f4f">坐{sitM}山</text>
          <text x={C} y={C + 12} textAnchor="middle" fontSize="15" fontWeight="800" fill="#6a5f4f">向{faceM}</text>
        </g>
      )}
    </svg>
  );
}
