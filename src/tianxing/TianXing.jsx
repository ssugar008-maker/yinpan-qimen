import React, { useMemo, useState, useEffect } from 'react';
import { MOUNTAINS24, oppositeMountain, mountainFromDegree, mountainCenter, degreeOffset } from '../xuankong/engine.js';
import { star24Map, analyze24 } from './stars24.js';
import TianXingAnalysis from './TianXingAnalysis.jsx';
import FloorPlan from './FloorPlan.jsx';
import { useCloudStore } from '../cloud.js';
import { aiInterpret } from '../ai.js';
import FollowUpChat from '../FollowUp.jsx';

const S24_THEMES = ['整體佈局', '財運', '感情桃花', '健康', '事業功名', '自訂'];

// 二十四天星（玄道風水）分頁：天星環＋自動分析＋AI 分析＋平面圖立極尺
export default function TianXing() {
  const [sitM, setSitM] = useState('子');
  const [degree, setDegree] = useState('0');
  const faceM = oppositeMountain(sitM);
  const map = useMemo(() => star24Map(sitM), [sitM]);
  const ana = useMemo(() => analyze24(sitM, faceM), [sitM, faceM]);
  const degNum = parseFloat(degree);
  const outOfGua = !isNaN(degNum) && Math.abs(degreeOffset(degNum)) >= 4.5;

  const applyDegree = (val) => {
    setDegree(val);
    const d = parseFloat(val);
    if (isNaN(d)) return;
    setSitM(mountainFromDegree(d)); // 度數為坐山
  };
  const onSitChange = (m) => { setSitM(m); setDegree(String(mountainCenter(m))); };

  // ── AI 分析（主題 × 追問，雲端存檔）──
  const S24_KEY = 'star24_ai_v1';
  const [s24Lib, setS24Lib] = useCloudStore('star24', S24_KEY, {});
  const [theme, setTheme] = useState('整體佈局');
  const [custom, setCustom] = useState('');
  const [ai, setAi] = useState({ loading: false, text: '', error: '' });
  const aiKey = `${sitM}${faceM}|${theme}|${theme === '自訂' ? custom.trim() : ''}`;
  const entry = (v) => (typeof v === 'string' ? { text: v, thread: [] } : (v || null));
  useEffect(() => { setAi({ loading: false, text: (entry(s24Lib[aiKey]) || {}).text || '', error: '' }); }, [aiKey, s24Lib]);

  const s24Payload = {
    task: 'star24',
    chart: {
      sit: sitM, face: faceM, sitStar: ana.sitStar, faceStar: ana.faceStar,
      stars: ana.rows.map((r) => ({
        mountain: r.mountain, dir: r.dir, palace: r.palace, palaceWx: r.palaceWx,
        star: r.star, ji: r.ji, wx: r.wx, group: r.group, governs: r.governs,
        rel: (ana.relations.find((x) => x.mountain === r.mountain) || {}).rel || '',
      })),
    },
    theme, custom: theme === '自訂' ? custom.trim() : '',
  };
  const runAi = async () => {
    setAi({ loading: true, text: '', error: '' });
    try {
      const { text } = await aiInterpret(s24Payload);
      setAi({ loading: false, text, error: '' });
      if (text) setS24Lib((lib) => ({ ...lib, [aiKey]: { text, theme, custom: s24Payload.custom, thread: (entry(lib[aiKey]) || {}).thread || [], ts: Date.now() } }));
    } catch (e) { setAi({ loading: false, text: '', error: String((e && e.message) || e) }); }
  };

  const goodRows = ana.rows.filter((r) => r.ji === '吉');
  const badRows = ana.rows.filter((r) => r.ji !== '吉');

  return (
    <div className="tx">
      {/* 座向輸入 */}
      <div className="panel">
        <div className="panel-head">二十四天星（玄道風水）</div>
        <div className="panel-body">
          <div className="xk-form">
            <label>羅盤度數（坐山）
              <input type="number" step="0.1" min="0" max="360" value={degree} onChange={(e) => applyDegree(e.target.value)} />
            </label>
            <label>坐山
              <select value={sitM} onChange={(e) => onSitChange(e.target.value)}>
                {MOUNTAINS24.map((m) => <option key={m.n} value={m.n}>{m.n}山（向{oppositeMountain(m.n)}）</option>)}
              </select>
            </label>
            <label>向首
              <input value={`${faceM}向`} readOnly />
            </label>
          </div>
          <div className="xk-sub">坐{sitM}山（{mountainCenter(sitM)}°）　向{faceM}（{mountainCenter(faceM)}°）　｜　{outOfGua ? '⚠ 度數接近兩山交界（出卦），星位以鄰山參看' : '二十四星隨坐向起盤'}</div>
        </div>
      </div>

      {/* 天星環＋自動分析（共用元件） */}
      <div className="panel">
        <div className="panel-head">天星環＋自動分析（{sitM}山{faceM}向）</div>
        <div className="panel-body">
          <TianXingAnalysis sitM={sitM} faceM={faceM} />
        </div>
      </div>

      {/* AI 分析 */}
      <div className="panel">
        <div className="panel-head">AI 天星分析</div>
        <div className="panel-body">
          <div className="ai-theme-row">
            <span className="ai-theme-label">分析主題</span>
            <div className="ai-theme-chips">
              {S24_THEMES.map((th) => (
                <button key={th} type="button" className={`ai-theme-chip${theme === th ? ' active' : ''}`} onClick={() => setTheme(th)}>{th}</button>
              ))}
            </div>
          </div>
          {theme === '自訂' && (
            <input className="ai-custom-input" value={custom} placeholder="例：大門開在坤方好嗎／主人房放哪個方位…" onChange={(e) => setCustom(e.target.value)} />
          )}
          <button type="button" className="ai-btn" onClick={runAi} disabled={ai.loading || (theme === '自訂' && !custom.trim())}>
            {ai.loading ? 'AI 分析中…' : (ai.text ? `↻ 重新分析（${theme}，已存檔）` : `✨ AI 天星分析：${theme === '自訂' ? (custom.trim() || '自訂問題') : theme}`)}
          </button>
          {ai.error && <div className="ai-error">{ai.error}</div>}
          {ai.text && <div className="ai-result">{ai.text}</div>}
          {ai.text && <div className="ai-saved">✓ 已按「{theme}」存檔（本坐向），重整頁面亦保留</div>}
          {ai.text && (
            <FollowUpChat
              basePayload={s24Payload}
              thread={(entry(s24Lib[aiKey]) || {}).thread || []}
              onAppend={(qa) => setS24Lib((lib) => { const e0 = entry(lib[aiKey]) || { text: ai.text }; return { ...lib, [aiKey]: { ...e0, text: e0.text || ai.text, thread: [...(e0.thread || []), qa] } }; })}
              placeholder="追問：就這個坐向的天星再問…"
            />
          )}
          <div className="sym-combo-note">（二十四天星解說原文：華玉講堂授權使用。AI 以各星司職、吉凶、五行與星宮生剋，結合坐向給出佈局建議）</div>
        </div>
      </div>

      {/* 平面圖立極尺 */}
      <FloorPlan map={map} sitM={sitM} faceM={faceM} />
    </div>
  );
}
