import React, { useMemo, useState } from 'react';
import { buildXkPayload } from '../xuankong/chartPayload.js';
import { analyze24, M24_ORDER } from '../tianxing/stars24.js';
import { useStar24Method } from '../tianxing/useStar24Method.js';
import { useStarFace } from '../tianxing/useStarFace.js';
import { loadIndoorLayout, buildIndoorRooms } from '../indoor/layoutData.js';
import { xuanKongChart, annualChart } from '../xuankong/engine.js';
import { useCloudStore } from '../cloud.js';
import FengshuiChat from '../FengshuiChat.jsx';

const opp24 = (m) => M24_ORDER[(M24_ORDER.indexOf(m) + 12) % 24];
const mountainFromDeg = (d) => M24_ORDER[((Math.round((((d % 360) + 360) % 360) / 15)) % 24 + 24) % 24];

// 風水 AI 顧問（獨立分頁）：玄空飛星＋二十四天星＋室內佈局，直接對話。
// 坐向預設跟「室內」分頁已校準嘅；可改。室內佈局喺坐向一致時自動帶入。
export default function FengshuiChatTab() {
  const method = useStar24Method();
  const layout = useMemo(() => loadIndoorLayout(), []);
  const [sitM, setSitM] = useState(layout?.sitM || '子');
  const faceM = opp24(sitM);
  const [chatStyle, setChatStyle] = useState('白話');
  const [chatDetail, setChatDetail] = useState('適中');

  const chart = useMemo(() => xuanKongChart(9, sitM, faceM), [sitM, faceM]);
  const flow = useMemo(() => annualChart(new Date().getFullYear()), []);
  const chartPayload = useMemo(() => buildXkPayload(sitM, faceM, { method }), [sitM, faceM, method]);
  // 二十四天星：跟全域「天星向首」（室內設定嘅日照最強方向）；冇就跟玄空坐向。同室內分頁一致。
  const globalStarFace = useStarFace();
  const s24Sit = globalStarFace != null ? mountainFromDeg(globalStarFace + 180) : sitM;
  const s24Face = globalStarFace != null ? mountainFromDeg(globalStarFace) : faceM;
  const s24 = useMemo(() => analyze24(s24Sit, s24Face, method), [s24Sit, s24Face, method]);
  const star24 = useMemo(() => ({
    sit: s24Sit, face: s24Face, method, sitStar: s24.sitStar, faceStar: s24.faceStar,
    stars: s24.rows.map((r) => ({ mountain: r.mountain, dir: r.dir, palace: r.palace, palaceWx: r.palaceWx, star: r.star, ji: r.ji, wx: r.wx, group: r.group, governs: r.governs })),
  }), [s24, s24Sit, s24Face, method]);
  // 室內佈局：坐向一致先帶入（唔一致會錯配星曜）
  const indoor = useMemo(() => {
    if (!layout || layout.sitM !== sitM) return null;
    const rooms = buildIndoorRooms(layout, chart, flow);
    return rooms.length ? { rooms } : null;
  }, [layout, sitM, chart, flow]);

  const payload = { task: 'xkChat', chart: chartPayload, star24, indoor, chatStyle, chatDetail };
  const [lib, setLib] = useCloudStore('fengshui', 'fs_chat_tab_v1', {});
  const key = `${sitM}${faceM}|${method}`;
  const thread = (lib[key] && lib[key].thread) || [];
  const append = (qa) => setLib((l) => ({ ...l, [key]: { thread: [...((l[key] || {}).thread || []), qa], ts: Date.now() } }));
  const clear = () => setLib((l) => ({ ...l, [key]: { thread: [], ts: Date.now() } }));

  return (
    <div className="panel">
      <div className="panel-head">💬 風水 AI 顧問（玄空飛星＋二十四天星{indoor ? '＋室內佈局' : ''}）</div>
      <div className="panel-body">
        <div className="ai-theme-row" style={{ marginBottom: 6 }}>
          <span className="ai-theme-label">坐向</span>
          <div className="ai-theme-chips" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="tx-sit-select" value={sitM} onChange={(e) => setSitM(e.target.value)}>
              {M24_ORDER.map((m) => <option key={m} value={m}>坐{m}山向{opp24(m)}</option>)}
            </select>
            {layout && layout.sitM !== sitM && (
              <button type="button" className="ai-theme-chip" onClick={() => setSitM(layout.sitM)}>跟室內（{layout.sitM}山{layout.faceM}向）</button>
            )}
            {indoor
              ? <span className="fs-tab-note">✓ 已帶入室內佈局（{indoor.rooms.length} 間房逐山）</span>
              : <span className="fs-tab-note">{layout ? '室內坐向同呢度唔同，未帶入佈局（撳「跟室內」）' : '未有室內佈局（去「室內」分頁標房就會帶入）'}</span>}
          </div>
        </div>
        <div className="ai-theme-row" style={{ marginBottom: 6 }}>
          <span className="ai-theme-label">語氣</span>
          <div className="ai-theme-chips">
            {['白話', '書面'].map((s) => <button key={s} type="button" className={`ai-theme-chip${chatStyle === s ? ' active' : ''}`} onClick={() => setChatStyle(s)}>{s}</button>)}
          </div>
          <span className="ai-theme-label">詳略</span>
          <div className="ai-theme-chips">
            {['簡潔', '適中', '詳細'].map((s) => <button key={s} type="button" className={`ai-theme-chip${chatDetail === s ? ' active' : ''}`} onClick={() => setChatDetail(s)}>{s}</button>)}
          </div>
        </div>
        <FengshuiChat
          basePayload={payload}
          thread={thread}
          onAppend={append}
          onClear={clear}
          examples={['呢個坐向整體用咩色系好？', '廚房跨幾個山，整體用咩色？雪櫃放邊個山好？', '主人房床頭宜向邊個方向？', '邊個方位做書房最好？', '今年流年邊個方位要注意？']}
        />
        <div className="sym-combo-note">（顧問睇到玄空全盤＋二十四天星（{method === 'bazhai' ? '八宅遊年' : '玄道'}）{indoor ? '＋你標注嘅房間逐山' : ''}；問顏色、材質、傢俬電器擺位、房間用途、化解催旺、流年都得。對話按坐向存檔。）</div>
      </div>
    </div>
  );
}
