import React, { useMemo, useState, useEffect } from 'react';
import { MOUNTAINS24, oppositeMountain, mountainFromDegree, mountainCenter, degreeOffset } from '../xuankong/engine.js';
import { M24_ORDER, STAR24_INFO, star24Map, analyze24, PALACE_MOUNTAINS24, PALACE_DIR24 } from './stars24.js';
import StarRing from './StarRing.jsx';
import FloorPlan from './FloorPlan.jsx';
import { useCloudStore } from '../cloud.js';
import { aiInterpret } from '../ai.js';
import FollowUpChat from '../FollowUp.jsx';

const jiColor24 = (ji) => (ji === '吉' ? '#16a34a' : ji === '大凶' ? '#7f1d1d' : '#dc2626');
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

          <div className="tx-ring-wrap">
            <StarRing map={map} sitM={sitM} faceM={faceM} size={380} />
          </div>
          <div className="xk-legend">
            <span><b style={{ color: '#16a34a' }}>綠</b>＝吉星　<b style={{ color: '#dc2626' }}>紅</b>＝凶星　<b style={{ color: '#7f1d1d' }}>暗紅</b>＝大凶</span>
            <span>坐山置頂，環上小字為星曜五行</span>
          </div>
        </div>
      </div>

      {/* 自動分析 */}
      <div className="panel">
        <div className="panel-head">自動分析（{sitM}山{faceM}向）</div>
        <div className="panel-body">
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
