import React, { useMemo } from 'react';
import { STAR24_INFO, star24Map, analyze24 } from './stars24.js';
import StarRing from './StarRing.jsx';

const jiColor24 = (ji) => (ji === '吉' ? '#16a34a' : ji === '大凶' ? '#7f1d1d' : '#dc2626');

// 二十四天星：天星環＋自動分析。給坐山/向首即可，可嵌入「玄空飛星」或「二十四天星」分頁。
export default function TianXingAnalysis({ sitM, faceM, ringSize = 380 }) {
  const map = useMemo(() => star24Map(sitM), [sitM]);
  const ana = useMemo(() => analyze24(sitM, faceM), [sitM, faceM]);
  return (
    <>
      <div className="tx-ring-wrap">
        <StarRing map={map} sitM={sitM} faceM={faceM} size={ringSize} />
      </div>
      <div className="xk-legend">
        <span><b style={{ color: '#16a34a' }}>綠</b>＝吉星　<b style={{ color: '#dc2626' }}>紅</b>＝凶星　<b style={{ color: '#7f1d1d' }}>暗紅</b>＝大凶</span>
        <span>坐山置頂，環上小字為星曜五行</span>
      </div>

      <div className="xk-ana-row">坐山星：<b style={{ color: jiColor24(STAR24_INFO[ana.sitStar].ji) }}>{ana.sitStar}</b>（{STAR24_INFO[ana.sitStar].governs}）　｜　向首星：<b style={{ color: jiColor24(STAR24_INFO[ana.faceStar].ji) }}>{ana.faceStar}</b>（{STAR24_INFO[ana.faceStar].governs}）</div>

      <div className="xk-sec-head">各司其職（重點吉星方位）</div>
      <div className="tx-duty-grid">
        {ana.duties.map((d) => (
          <div key={d.key} className="tx-duty">
            <span className="tx-duty-key">{d.key}</span>
            <span className="tx-duty-star">{d.star}</span>
            <span className="tx-duty-at">{d.at.mountain}山・{d.at.dir}</span>
          </div>
        ))}
      </div>

      <div className="xk-sec-head">凶位警示</div>
      {ana.warnings.map((w) => (
        <div key={w.star} className="xk-cure-row">
          <b>{w.mountain}山（{w.dir}）</b>　<span style={{ color: jiColor24(w.ji) }}>{w.star}{w.ji === '大凶' ? '（大凶）' : ''}</span>　— {w.governs}
        </div>
      ))}

      <div className="xk-sec-head">星宮五行生剋（有五行之星）</div>
      <div className="tx-rel-list">
        {ana.relations.map((r) => (
          <div key={r.mountain} className="tx-rel-row">
            <span className="tx-rel-star" style={{ color: jiColor24(r.ji) }}>{r.star}{r.wx ? `（${r.wx}）` : ''}</span>
            <span className="tx-rel-pal">{r.mountain}山・{r.dir}（宮屬{r.palaceWx}）</span>
            <span className={`tx-rel-tag${r.rel.includes('相戰') || r.rel.includes('受制') ? ' bad' : r.rel.includes('得力') || r.rel.includes('比和') ? ' good' : ''}`}>{r.rel}</span>
          </div>
        ))}
      </div>
      <div className="xk-note">吉位宜高、宜明、宜動（宜開門、安床、作灶、書桌）；凶位宜低、宜暗、宜靜（宜廁所、儲物、通道）。星與宮相生比和為吉、相剋為凶。</div>
    </>
  );
}
