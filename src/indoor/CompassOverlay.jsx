import React from 'react';
import { MOUNTAINS24, TRIGRAMS8, norm360, polar } from './geometry.js';
import { STAR24_INFO } from '../tianxing/stars24.js';

// 白邊光暈文字，蓋在平面圖上仍清晰
export function HaloText({ x, y, size, fill, weight = 700, children }) {
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={weight} fill={fill}
      style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: Math.max(1.5, size * 0.18), strokeLinejoin: 'round' }}>
      {children}
    </text>
  );
}

const star24Color = (ji) => (ji === '吉' ? '#16a34a' : ji === '大凶' ? '#7f1d1d' : '#dc2626');

// 24 山羅盤覆疊層（室內分頁與玄空速覽共用）。
// 延伸線畫在每山的「界線」（山度 ±7.5°），山名/天星/度數標在每山的「中心」（兩條延伸線之間），不再壓在線上。
export default function CompassOverlay({ center, rot = 0, facingDeg = null, layers, unit, Rout, Rline, mtFont, tgFont, star24 = null, opacity = 1, starFaceDeg = null }) {
  if (!center) return null;
  const L = { mountains: true, trigrams: true, stars24: false, degrees: false, extend: true, ...(layers || {}) };
  return (
    <g opacity={opacity}>
      <defs>
        <marker id="indArrow" markerWidth="12" markerHeight="12" refX="7" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#d21f1f" />
        </marker>
      </defs>

      {/* 延伸線：畫在每山的界線（中心度 + 7.5°），兩線之間即為該山範圍 */}
      {L.extend && MOUNTAINS24.map((m) => {
        const sa = norm360(m.deg + 7.5 + rot);
        const b = polar(center.x, center.y, Rline, sa);
        return <line key={'ex' + m.c} x1={center.x} y1={center.y} x2={b.x} y2={b.y}
          stroke="rgba(40,80,200,0.3)" strokeWidth={unit * 0.0028} />;
      })}
      {/* 外圈 */}
      <circle cx={center.x} cy={center.y} r={Rout} fill="none" stroke="rgba(30,60,180,0.4)" strokeWidth={unit * 0.004} />

      {/* 24 山名：標在每山中心（兩條延伸線之間） */}
      {L.mountains && MOUNTAINS24.map((m) => {
        const sa = norm360(m.deg + rot);
        const p = polar(center.x, center.y, Rout, sa);
        return <HaloText key={'mt' + m.c} x={p.x} y={p.y} size={mtFont} fill="#12245e">{m.c}</HaloText>;
      })}
      {/* 八卦（文字），內圈 */}
      {L.trigrams && TRIGRAMS8.map((t) => {
        const sa = norm360(t.deg + rot);
        const p = polar(center.x, center.y, Rout * 0.6, sa);
        return <HaloText key={'tg' + t.c} x={p.x} y={p.y} size={tgFont} fill="#7a2a8f">{t.c}</HaloText>;
      })}
      {/* 24 天星（依天星坐山起盤，吉凶著色），逐山對返羅盤位置（唔係旋轉個環） */}
      {L.stars24 && star24 && MOUNTAINS24.map((m) => {
        const star = star24[m.c];
        const info = STAR24_INFO[star] || {};
        const sa = norm360(m.deg + rot);
        const p = polar(center.x, center.y, Rout * 0.8, sa);
        return <HaloText key={'s24' + m.c} x={p.x} y={p.y} size={mtFont * 0.78} fill={star24Color(info.ji)}>{star}</HaloText>;
      })}
      {/* 天星向首（日照最強方向）☀ 標記 */}
      {starFaceDeg != null && (() => {
        const sa = norm360(starFaceDeg + rot);
        const tip = polar(center.x, center.y, Rline * 0.92, sa);
        return (
          <g>
            <line x1={center.x} y1={center.y} x2={tip.x} y2={tip.y} stroke="#e6a700" strokeWidth={unit * 0.007} strokeDasharray={`${unit * 0.02} ${unit * 0.012}`} />
            <HaloText x={tip.x} y={tip.y} size={unit * 0.05} fill="#c89000">☀</HaloText>
          </g>
        );
      })()}
      {/* 度數（每山中心度），貼近山名內側 */}
      {L.degrees && MOUNTAINS24.map((m) => {
        const sa = norm360(m.deg + rot);
        const p = polar(center.x, center.y, Rout * 0.88, sa);
        return <HaloText key={'dg' + m.c} x={p.x} y={p.y} size={unit * 0.028} fill="#555" weight={400}>{m.deg}°</HaloText>;
      })}

      {/* 向首箭頭（紅）＋坐山（綠虛線） */}
      {facingDeg != null && (() => {
        const fa = norm360(facingDeg + rot);
        const tip = polar(center.x, center.y, Rline, fa);
        const bk = polar(center.x, center.y, Rout * 0.6, norm360(fa + 180));
        return (
          <g>
            <line x1={center.x} y1={center.y} x2={tip.x} y2={tip.y} stroke="#d21f1f" strokeWidth={unit * 0.011} markerEnd="url(#indArrow)" />
            <line x1={center.x} y1={center.y} x2={bk.x} y2={bk.y} stroke="#1a7a1a" strokeWidth={unit * 0.007} strokeDasharray={`${unit * 0.02} ${unit * 0.015}`} />
          </g>
        );
      })()}
      {/* 立極點十字 */}
      <line x1={center.x - unit * 0.04} y1={center.y} x2={center.x + unit * 0.04} y2={center.y} stroke="#d21f1f" strokeWidth={unit * 0.006} />
      <line x1={center.x} y1={center.y - unit * 0.04} x2={center.x} y2={center.y + unit * 0.04} stroke="#d21f1f" strokeWidth={unit * 0.006} />
      <circle cx={center.x} cy={center.y} r={unit * 0.012} fill="#d21f1f" />
    </g>
  );
}
