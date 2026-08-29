import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  GRID, PALACE_DIR, PALACE_GUA, PALACE_WX, STAR_JI, STAR_NAME, STAR_WX, PERIODS, MOUNTAINS24,
  oppositeMountain, xuanKongChart, xuanKongChartTiGua, chartTypes, castleGate, starPair, remedyText,
  annualStar, annualChart, lifeGua, bazhai, GUA_NAME, EAST4,
  mountainFromDegree, mountainCenter, degreeOffset,
} from './engine.js';
import { useCloudStore } from '../cloud.js';
import { aiInterpret } from '../ai.js';
import FollowUpChat from '../FollowUp.jsx';
import TianXingAnalysis from '../tianxing/TianXingAnalysis.jsx';
import IndoorQuickView from '../indoor/IndoorQuickView.jsx';
import { star24Map, STAR24_INFO, PALACE_MOUNTAINS24, analyze24 } from '../tianxing/stars24.js';

// AI 分析主題（與 api/interpret.js 的 XK_THEMES 對應；「綜合」＝原有整體解讀，「自訂」＝自由提問）
const XK_AI_THEMES = ['綜合', '傢俬擺設', '顏色', '形狀材質', '風水擺設', '房間用途', '財運', '健康', '感情桃花', '事業文昌', '化解催旺', '自訂'];

const jiColor = (ji) => (ji === '吉' ? '#16a34a' : ji === '大凶' ? '#dc2626' : ji === '凶' ? '#d97706' : '#6b7280');
const pairColor = (t) => (t === '吉' ? '#16a34a' : t === '大凶' ? '#dc2626' : t === '凶' || t === '半凶' ? '#d97706' : t === '半吉' ? '#65a30d' : '#6b7280');

// 可重用九宮玄空盤（傳 onPick 則各宮可點選，用於指定 AI 分析範圍）
function XkGrid({ chart, flow = null, compact = false, onPick = null, picked = null }) {
  return (
    <div className={`xk-grid${compact ? ' compact' : ''}`}>
      {GRID.map((p) => {
        const isSit = p === chart.sitPalace, isFace = p === chart.facePalace;
        const combo = starPair(chart.sG[p], chart.fG[p]);
        const pick = onPick ? { role: 'button', tabIndex: 0, onClick: () => onPick(PALACE_GUA[p]), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(PALACE_GUA[p]); } }, title: `AI 分析 ${PALACE_GUA[p]}宮` } : {};
        return (
          <div key={p} {...pick} className={`xk-cell${p === 5 ? ' center' : ''}${isSit ? ' sit' : ''}${isFace ? ' face' : ''}${onPick ? ' pickable' : ''}${picked === PALACE_GUA[p] ? ' picked' : ''}`}>
            <div className="xk-stars">
              <span className="xk-s" style={{ color: jiColor(STAR_JI[chart.sG[p]]) }}>{chart.sG[p]}</span>
              <span className="xk-f" style={{ color: jiColor(STAR_JI[chart.fG[p]]) }}>{chart.fG[p]}</span>
            </div>
            <div className="xk-pal">{PALACE_GUA[p]}{p === 5 ? '' : `·${PALACE_DIR[p]}`}</div>
            <div className="xk-base">運{chart.pG[p]}{flow ? `　流${flow[p]}` : ''}</div>
            {isSit && <span className="xk-tag sit-tag">坐</span>}
            {isFace && <span className="xk-tag face-tag">向</span>}
            {(combo.t === '凶' || combo.t === '大凶' || combo.t === '半凶') && <span className="xk-combo-dot" style={{ background: pairColor(combo.t) }} title={combo.n} />}
          </div>
        );
      })}
    </div>
  );
}

// 玄空飛星盤（下卦）
export default function XuanKong() {
  const now = new Date();
  const [sitM, setSitM] = useState('子');
  const [period, setPeriod] = useState(9);
  const [flowYear, setFlowYear] = useState(now.getFullYear());
  const [degree, setDegree] = useState('0');
  const [degMode, setDegMode] = useState('向'); // 度數為 坐山 或 向首
  const [qiXing, setQiXing] = useState('下卦'); // 起星方式：下卦 / 替卦（兼向用）
  const [perA, setPerA] = useState(8);
  const [perB, setPerB] = useState(9);
  const [birthYear, setBirthYear] = useState(1990);
  const [gender, setGender] = useState('男');

  // 接收「室內」分頁套用的坐向度數（同時更新坐山／向首）
  useEffect(() => {
    const apply = () => {
      try {
        const raw = localStorage.getItem('mo_xk_apply');
        if (!raw) return;
        const { degree: d, mode } = JSON.parse(raw);
        const dd = parseFloat(d);
        if (isNaN(dd)) return;
        const m = mountainFromDegree(dd);
        setDegMode(mode || '向');
        setDegree(String(d));
        setSitM(mode === '坐' ? m : oppositeMountain(m));
      } catch {}
    };
    apply();
    window.addEventListener('mo-xk-apply', apply);
    return () => window.removeEventListener('mo-xk-apply', apply);
  }, []);

  const faceM = oppositeMountain(sitM);
  const chart = useMemo(
    () => (qiXing === '替卦' ? xuanKongChartTiGua(period, sitM, faceM) : xuanKongChart(period, sitM, faceM)),
    [period, sitM, faceM, qiXing],
  );
  const types = useMemo(() => chartTypes(chart), [chart]);
  const castle = useMemo(() => castleGate(chart), [chart]);
  const flow = useMemo(() => annualChart(flowYear), [flowYear]);
  const flowStar = annualStar(flowYear);
  const chartA = useMemo(() => xuanKongChart(perA, sitM, faceM), [perA, sitM, faceM]);
  const chartB = useMemo(() => xuanKongChart(perB, sitM, faceM), [perB, sitM, faceM]);
  const typesA = useMemo(() => chartTypes(chartA), [chartA]);
  const typesB = useMemo(() => chartTypes(chartB), [chartB]);
  const gua = useMemo(() => lifeGua(+birthYear, gender), [birthYear, gender]);
  const bz = useMemo(() => bazhai(gua), [gua]);

  // 24 天星盤（依坐山起盤），並整理出每宮三山的天星
  const starMap = useMemo(() => star24Map(sitM), [sitM]);
  const s24 = useMemo(() => analyze24(sitM, faceM), [sitM, faceM]);
  const palaceStars24 = useMemo(() => {
    const out = {};
    GRID.forEach((p) => {
      out[p] = (PALACE_MOUNTAINS24[p] || []).map((m) => ({ mountain: m, star: starMap[m], ...(STAR24_INFO[starMap[m]] || {}) }));
    });
    return out;
  }, [starMap]);

  const years = []; for (let y = 1900; y <= 2099; y++) years.push(y);

  // 度數輸入 → 自動定山向
  const applyDegree = (val, mode = degMode) => {
    setDegree(val);
    const d = parseFloat(val);
    if (isNaN(d)) return;
    const m = mountainFromDegree(d);
    setSitM(mode === '坐' ? m : oppositeMountain(m));
  };
  const onSitChange = (m) => {
    setSitM(m);
    setDegree(String(degMode === '坐' ? mountainCenter(m) : mountainCenter(oppositeMountain(m))));
  };
  const onModeChange = (mode) => {
    setDegMode(mode);
    setDegree(String(mode === '坐' ? mountainCenter(sitM) : mountainCenter(faceM)));
  };
  const degNum = parseFloat(degree);
  const jianXiang = !isNaN(degNum) && Math.abs(degreeOffset(degNum)) >= 4.5;

  // ── AI 風水分析（整體 / 各宮 × 主題）── 雲端同步（Vercel KV）＋ localStorage 快取
  const XK_AI_KEY = 'xuankong_ai_v1';
  const [xkAiLib, setXkAiLib] = useCloudStore('xuankong', XK_AI_KEY, {});
  const [aiScope, setAiScope] = useState('整體');
  const [aiTheme, setAiTheme] = useState('綜合');
  const [aiCustom, setAiCustom] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [aiSystem, setAiSystem] = useState('both'); // 分析體系：both 玄空+天星 / xk 單玄空 / s24 單天星
  const [doorM, setDoorM] = useState(''); // 大門所在山（納氣口）
  const [showPlan, setShowPlan] = useState(false); // 室內平面圖浮層
  const aiPanelRef = useRef(null);
  // 替卦起星說明（兼向時顯示並送入 AI）
  const tiGuaNote = chart.tiGua
    ? `山星原${chart.tiGua.sit.orig}入中，兼向替為${chart.tiGua.sit.star}入中（${chart.tiGua.sit.via ? `經${chart.tiGua.sit.via}山` : '五黃無替'}，${chart.tiGua.sit.forward ? '順' : '逆'}飛）；向星原${chart.tiGua.face.orig}入中，替為${chart.tiGua.face.star}入中（${chart.tiGua.face.via ? `經${chart.tiGua.face.via}山` : '五黃無替'}，${chart.tiGua.face.forward ? '順' : '逆'}飛）`
    : '';
  const chartPayload = useMemo(() => ({
    sit: sitM, face: faceM, period, flowYear, flowStar, qiXing, tiGuaNote,
    types: types.map((t) => ({ n: t.n, t: t.t })),
    palaces: GRID.map((p) => {
      const c = starPair(chart.sG[p], chart.fG[p]);
      const s = chart.sG[p], f = chart.fG[p];
      return {
        name: PALACE_GUA[p], dir: PALACE_DIR[p], wx: PALACE_WX[p],
        role: p === chart.sitPalace ? '坐山' : p === chart.facePalace ? '向首' : p === 5 ? '中宮' : '',
        shan: s, shanName: STAR_NAME[s], shanWx: STAR_WX[s],
        xiang: f, xiangName: STAR_NAME[f], xiangWx: STAR_WX[f],
        yun: chart.pG[p], yunName: STAR_NAME[chart.pG[p]],
        flow: flow[p], flowName: STAR_NAME[flow[p]],
        combo: c.n, ji: c.t, comboDesc: c.d, remedy: remedyText(c.r),
        stars24: (palaceStars24[p] || []).map((x) => `${x.mountain}山${x.star}（${x.ji}）`).join('、'),
      };
    }),
  }), [sitM, faceM, period, flowYear, flowStar, qiXing, tiGuaNote, types, chart, flow, palaceStars24]);

  // 存檔 key 含起星方式＋範圍＋主題＋自訂問題＋情境，問法不同各自存一份
  const chartKey = `${sitM}${faceM}|${period}|${flowYear}`;
  const customQ = aiCustom.trim(), ctxQ = aiContext.trim();
  const aiKey = `${chartKey}|${qiXing}|${aiSystem}|${doorM}|${aiScope}|${aiTheme}|${aiTheme === '自訂' ? customQ : ''}|${ctxQ}`;
  const libEntry = (v) => (typeof v === 'string' ? { text: v } : (v || null));
  const [xkAi, setXkAi] = useState({ loading: false, text: '', error: '' });
  useEffect(() => {
    const hit = libEntry(xkAiLib[aiKey]);
    // 舊版存檔只有 坐向|運|流年|範圍（等同「綜合」且無補充），沿用避免使用者記錄消失
    const legacy = aiTheme === '綜合' && !ctxQ ? libEntry(xkAiLib[`${chartKey}|${aiScope}`]) : null;
    const text = (hit && hit.text) || (legacy && legacy.text) || '';
    setXkAi((prev) => (prev.loading ? prev : { loading: false, text, error: '' })); // 分析中不被雲端同步打斷
  }, [aiKey, xkAiLib]);
  const isOverall = aiScope === '整體';
  // 八宅命卦各方吉凶（AI 用）
  const bazhaiDirs = useMemo(() => GRID.filter((p) => p !== 5).map((p) => ({ name: PALACE_GUA[p], dir: PALACE_DIR[p], star: bz[p] && bz[p].star, ji: bz[p] && bz[p].ji })), [bz]);
  // 大門（納氣口）資訊：所在山 → 陰陽氣、宮位、天星
  const doorInfo = useMemo(() => {
    if (!doorM) return null;
    const dm = MOUNTAINS24.find((m) => m.n === doorM);
    if (!dm) return null;
    const star = starMap[doorM];
    const sinfo = STAR24_INFO[star] || {};
    return { mountain: doorM, yang: dm.yang ? '陽' : '陰', palace: PALACE_GUA[dm.palace], dir: PALACE_DIR[dm.palace], star24: star, star24ji: sinfo.ji, star24governs: sinfo.governs };
  }, [doorM, starMap]);
  const xkBasePayload = {
    task: isOverall ? 'xkOverall' : 'xkPalace',
    chart: chartPayload,
    palace: isOverall ? undefined : aiScope,
    theme: aiTheme,
    custom: aiTheme === '自訂' ? customQ : '',
    context: ctxQ,
    system: aiSystem,
    door: doorInfo,
    bazhai: { gua, guaName: GUA_NAME[gua], east4: EAST4.includes(gua), dirs: bazhaiDirs },
    star24: { sit: sitM, face: faceM, sitStar: s24.sitStar, faceStar: s24.faceStar, stars: s24.rows.map((r) => ({ mountain: r.mountain, dir: r.dir, palace: r.palace, palaceWx: r.palaceWx, star: r.star, ji: r.ji, wx: r.wx, group: r.group, governs: r.governs })) },
  };
  const runXkAi = async () => {
    setXkAi({ loading: true, text: '', error: '' });
    try {
      const { text } = await aiInterpret(xkBasePayload);
      setXkAi({ loading: false, text, error: '' });
      if (text) setXkAiLib((lib) => ({ ...lib, [aiKey]: { text, scope: aiScope, theme: aiTheme, custom: aiTheme === '自訂' ? customQ : '', context: ctxQ, qx: qiXing, thread: (libEntry(lib[aiKey]) || {}).thread || [], ts: Date.now() } }));
    } catch (e) { setXkAi({ loading: false, text: '', error: String((e && e.message) || e) }); }
  };
  const AI_SCOPES = ['整體', ...GRID.map((p) => PALACE_GUA[p])];
  const pickAiPalace = (name) => {
    setAiScope(name);
    if (aiPanelRef.current) aiPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // 本盤已存的分析（可點回看，不需重新呼叫 AI）
  const savedList = useMemo(() => Object.entries(xkAiLib)
    .filter(([k]) => k.startsWith(`${chartKey}|`))
    .map(([k, v]) => { const e = libEntry(v); const f = k.split('|'); return e && e.text ? { k, text: e.text, scope: e.scope || f[3] || '整體', theme: e.theme || f[4] || '綜合', custom: e.custom || f[5] || '', context: e.context || f[6] || '', qx: e.qx || '', ts: e.ts || 0 } : null; })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts), [xkAiLib, chartKey]);
  const restoreSaved = (s) => {
    setAiScope(s.scope); setAiTheme(s.theme);
    setAiCustom(s.theme === '自訂' ? s.custom : ''); setAiContext(s.context);
    if (s.qx) setQiXing(s.qx);
    setXkAi({ loading: false, text: s.text, error: '' });
  };
  // AI 面板所選宮位的盤面事實（讓使用者清楚問的是哪一宮）
  const scopeFacts = aiScope === '整體' ? null : chartPayload.palaces.find((x) => x.name === aiScope);

  // ── 換運對比 AI（存同一 xkAiLib，按 坐向|前運|後運 快取）──
  const periodPayload = (chrt, typs) => ({
    types: typs.map((t) => ({ n: t.n, t: t.t })),
    palaces: GRID.map((p) => ({ name: PALACE_GUA[p], dir: PALACE_DIR[p], shan: chrt.sG[p], xiang: chrt.fG[p], yun: chrt.pG[p] })),
  });
  const cmpKey = `${sitM}${faceM}|cmp|${perA}|${perB}`;
  const [cmpAi, setCmpAi] = useState({ loading: false, text: '', error: '' });
  useEffect(() => { setCmpAi((prev) => (prev.loading ? prev : { loading: false, text: (libEntry(xkAiLib[cmpKey]) || {}).text || '', error: '' })); }, [cmpKey, xkAiLib]);
  const cmpBasePayload = {
    task: 'xkCompare',
    compare: {
      sit: sitM, face: faceM, sitGua: PALACE_GUA[chartA.sitPalace], faceGua: PALACE_GUA[chartA.facePalace],
      perA, perB, typesA, typesB, chartA: periodPayload(chartA, typesA), chartB: periodPayload(chartB, typesB),
    },
  };
  const runCmpAi = async () => {
    setCmpAi({ loading: true, text: '', error: '' });
    try {
      const { text } = await aiInterpret(cmpBasePayload);
      setCmpAi({ loading: false, text, error: '' });
      if (text) setXkAiLib((lib) => ({ ...lib, [cmpKey]: { text, thread: (libEntry(lib[cmpKey]) || {}).thread || [] } }));
    } catch (e) { setCmpAi({ loading: false, text: '', error: String((e && e.message) || e) }); }
  };

  // 星曜組合（九宮格用）
  const combos = GRID.map((p) => ({ p, combo: starPair(chart.sG[p], chart.fG[p]) }));
  const badCombos = combos.filter((c) => c.combo.r);

  return (
    <div className="xk">
      {/* 工作區：排盤 ＋ 室內平面圖 ＋ AI（寬屏三欄同時顯示，手機直排） */}
      <div className="xk-workspace">
      {/* 排盤輸入 */}
      <div className="panel">
        <div className="panel-head">玄空飛星排盤（{qiXing}）</div>
        <div className="panel-body">
          <div className="xk-form">
            <label>羅盤度數
              <input type="number" step="0.1" min="0" max="360" value={degree} onChange={(e) => applyDegree(e.target.value)} />
            </label>
            <label>度數為
              <select value={degMode} onChange={(e) => onModeChange(e.target.value)}>
                <option value="向">向首</option>
                <option value="坐">坐山</option>
              </select>
            </label>
            <label>坐山
              <select value={sitM} onChange={(e) => onSitChange(e.target.value)}>
                {MOUNTAINS24.map((m) => <option key={m.n} value={m.n}>{m.n}山（{PALACE_GUA[m.palace]}·{PALACE_DIR[m.palace]}）</option>)}
              </select>
            </label>
            <label>向首
              <input value={`${faceM}向（${PALACE_GUA[chart.facePalace]}·${PALACE_DIR[chart.facePalace]}）`} readOnly />
            </label>
            <label>運
              <select value={period} onChange={(e) => setPeriod(+e.target.value)}>
                {PERIODS.map((r, i) => <option key={i + 1} value={i + 1}>{i + 1}運（{r[0]}-{r[1]}）</option>)}
              </select>
            </label>
            <label>流年
              <select value={flowYear} onChange={(e) => setFlowYear(+e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <div className="xk-sub">
            {period}運　坐{sitM}山（{mountainCenter(sitM)}°）　向{faceM}（{mountainCenter(faceM)}°）　｜　{flowYear}年流年 {flowStar}入中
          </div>
          <div className="xk-qixing">
            <span className="q-label">起星</span>
            <div className="seg">
              <button type="button" className={qiXing === '下卦' ? 'on' : ''} onClick={() => setQiXing('下卦')}>下卦</button>
              <button type="button" className={qiXing === '替卦' ? 'on' : ''} onClick={() => setQiXing('替卦')}>替卦（兼向）</button>
            </div>
            {jianXiang && qiXing === '下卦' && (
              <button type="button" className="xk-tigua-suggest" onClick={() => setQiXing('替卦')}>兼向 → 改用替卦</button>
            )}
          </div>
          {jianXiang && qiXing === '下卦' && <div className="xk-jx">⚠ 度數 {degree}° 接近兩山交界（兼向），下卦排盤或需改用替卦起星。</div>}
          {qiXing === '替卦' && <div className="xk-tigua-note">替卦起星：{tiGuaNote}。</div>}

          <XkGrid chart={chart} flow={flow} onPick={pickAiPalace} picked={aiScope} />
          <div className="xk-legend">
            <span><b style={{ color: '#8b5a2b' }}>左</b>山星　<b style={{ color: '#8b5a2b' }}>右</b>向星　下：運星/流年星</span>
            <span>綠=吉　橙=凶　紅=大凶　右下點=凶組合</span>
            <span className="xk-legend-tip">點任一宮 → 跳到 AI 分析並鎖定該宮</span>
          </div>

          {/* 格局 */}
          {types.length > 0 && (
            <div className="xk-types">
              {types.map((t, i) => (
                <div key={i} className="xk-type" style={{ borderColor: t.c }}>
                  <span className="xk-type-n" style={{ color: t.c }}>{t.n}（{t.t}）</span>
                  <span className="xk-type-d">{t.d}</span>
                </div>
              ))}
            </div>
          )}

          {/* 城門訣 */}
          <div className="xk-castle">
            <div className="xk-sec-head">城門訣</div>
            {castle.length === 0 && <div className="xk-none">本局向首兩旁未見當運或生氣星，城門不現。</div>}
            {castle.map((c, i) => (
              <div key={i} className="xk-castle-row" style={{ borderLeftColor: c.c }}>
                <b style={{ color: c.c }}>{c.type}</b>　{PALACE_GUA[c.palace]}宮（{PALACE_DIR[c.palace]}）向星 {c.star}　— {c.d}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI 風水分析：範圍（整體／任一宮）× 主題（傢俬、顏色、形狀材質…／自訂問題） */}
      <div className="panel" ref={aiPanelRef}>
        <div className="panel-head">AI 風水分析（任一宮位 × 任何主題）</div>
        <div className="panel-body">
          <div className="ai-theme-row">
            <span className="ai-theme-label">分析體系</span>
            <div className="ai-theme-chips">
              {[['both', '玄空＋天星'], ['xk', '單玄空'], ['s24', '單天星']].map(([v, l]) => (
                <button key={v} type="button" className={`ai-theme-chip${aiSystem === v ? ' active' : ''}`} onClick={() => setAiSystem(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="ai-theme-row">
            <span className="ai-theme-label">大門方向</span>
            <div className="ai-theme-chips">
              <select value={doorM} onChange={(e) => setDoorM(e.target.value)} className="xk-door-select">
                <option value="">未設定（不納入分析）</option>
                {MOUNTAINS24.map((m) => <option key={m.n} value={m.n}>{m.n}山（{m.yang ? '陽' : '陰'}）</option>)}
              </select>
              {doorInfo && <span className="xk-door-info">大門在{doorInfo.mountain}山・{doorInfo.dir}，納{doorInfo.yang}氣{doorInfo.star24 ? `，天星「${doorInfo.star24}」（${doorInfo.star24ji}）` : ''}</span>}
            </div>
          </div>
          <div className="ai-theme-row">
            <span className="ai-theme-label">分析範圍</span>
            <div className="ai-theme-chips">
              {AI_SCOPES.map((s) => (
                <button key={s} type="button" className={`ai-theme-chip${aiScope === s ? ' active' : ''}`} onClick={() => setAiScope(s)}>
                  {s === '整體' ? '整體' : s === '中' ? '中宮' : `${s}·${PALACE_DIR[GRID.find((p) => PALACE_GUA[p] === s)]}`}
                </button>
              ))}
            </div>
          </div>
          {scopeFacts && (
            <div className="xk-ai-facts">
              <b>{scopeFacts.name}宮（{scopeFacts.dir}）</b>
              {scopeFacts.role ? <span className="xk-ai-role">{scopeFacts.role}</span> : null}
              <span>山星{scopeFacts.shan}（{scopeFacts.shanWx}）</span>
              <span>向星{scopeFacts.xiang}（{scopeFacts.xiangWx}）</span>
              <span>運星{scopeFacts.yun}</span>
              <span>流年{scopeFacts.flow}</span>
              <span style={{ color: pairColor(scopeFacts.ji) }}>{scopeFacts.combo}（{scopeFacts.ji}）</span>
            </div>
          )}
          <div className="ai-theme-row">
            <span className="ai-theme-label">分析主題</span>
            <div className="ai-theme-chips">
              {XK_AI_THEMES.map((th) => (
                <button key={th} type="button" className={`ai-theme-chip${aiTheme === th ? ' active' : ''}`} onClick={() => setAiTheme(th)}>{th}</button>
              ))}
            </div>
          </div>
          {aiTheme === '自訂' && (
            <input
              className="ai-custom-input"
              value={aiCustom}
              placeholder={`想問什麼都可以，例：${aiScope === '整體' ? '全屋哪個方位最適合做嬰兒房' : `${aiScope}宮這組合可以放什麼傢俬／用什麼顏色／擺魚缸好唔好`}`}
              onChange={(e) => setAiCustom(e.target.value)}
            />
          )}
          <input
            className="ai-custom-input"
            value={aiContext}
            placeholder="情境補充（可留空）：例 此處為主人房、已放咗大鏡、想催財、家中有小朋友…"
            onChange={(e) => setAiContext(e.target.value)}
          />
          <button type="button" className="ai-btn" onClick={runXkAi} disabled={xkAi.loading || (aiTheme === '自訂' && !customQ)}>
            {xkAi.loading ? 'AI 分析中…'
              : `${xkAi.text ? '↻ 重新分析' : '✨ AI 分析'}：${aiScope === '整體' ? '整體' : `${aiScope}宮`}・${aiTheme === '自訂' ? (customQ || '自訂問題') : aiTheme}${xkAi.text ? '（已存檔）' : ''}`}
          </button>
          {xkAi.error && <div className="ai-error">{xkAi.error}</div>}
          {xkAi.text && <div className="ai-result">{xkAi.text}</div>}
          {xkAi.text && <div className="ai-saved">✓ 已按「{aiScope === '整體' ? '整體' : `${aiScope}宮`}・{aiTheme}」存檔（本坐向／運／流年{qiXing === '替卦' ? '／替卦' : ''}），重整頁面亦保留</div>}
          {xkAi.text && (
            <FollowUpChat
              basePayload={xkBasePayload}
              thread={(libEntry(xkAiLib[aiKey]) || {}).thread || []}
              onAppend={(qa) => setXkAiLib((lib) => { const e0 = libEntry(lib[aiKey]) || { text: xkAi.text }; return { ...lib, [aiKey]: { ...e0, text: e0.text || xkAi.text, thread: [...(e0.thread || []), qa] } }; })}
              placeholder={`追問：就${aiScope === '整體' ? '整體' : `${aiScope}宮`}「${aiTheme}」解讀再問…`}
            />
          )}
          {savedList.length > 0 && (
            <div className="xk-ai-hist">
              <div className="xk-sec-head">本盤已存分析（點擊回看）</div>
              {savedList.map((s) => (
                <button key={s.k} type="button" className={`xk-ai-hist-row${s.k === aiKey ? ' on' : ''}`} onClick={() => restoreSaved(s)}>
                  <span className="xk-ai-hist-scope">{s.scope === '整體' ? '整體' : `${s.scope}宮`}</span>
                  {s.qx === '替卦' && <span className="xk-ai-hist-qx">替</span>}
                  <span className="xk-ai-hist-theme">{s.theme === '自訂' ? (s.custom || '自訂') : s.theme}</span>
                  <span className="xk-ai-hist-text">{s.text.slice(0, 40)}…</span>
                </button>
              ))}
            </div>
          )}
          <div className="sym-combo-note">（可先點上方九宮格任一宮，再選主題；主題涵蓋傢俬擺設、顏色、形狀材質、風水擺設、房間用途、財運、健康、感情桃花、事業文昌、化解催旺，或用「自訂」直接問。AI 會結合格局、山向星、五行生剋與流年作答）</div>
        </div>
      </div>
      </div>{/* /xk-workspace */}

      {/* 星曜組合：九宮格排盤 */}
      <details className="panel collapsible" open>
        <summary className="panel-head">星曜組合（山星＋向星）＋流年</summary>
        <div className="panel-body">
          <div className="xk-grid combo-grid">
            {combos.map(({ p, combo }) => (
              <div
                key={p}
                role="button"
                tabIndex={0}
                title={`AI 分析 ${PALACE_GUA[p]}宮`}
                onClick={() => pickAiPalace(PALACE_GUA[p])}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickAiPalace(PALACE_GUA[p]); } }}
                className={`xk-cell combo-cell pickable${p === 5 ? ' center' : ''}${aiScope === PALACE_GUA[p] ? ' picked' : ''}`}
              >
                <div className="xk-pal top">{PALACE_GUA[p]}{p === 5 ? '' : `·${PALACE_DIR[p]}`}{p === chart.sitPalace ? '（坐）' : p === chart.facePalace ? '（向）' : ''}</div>
                <div className="xk-combo-stars2">山{chart.sG[p]} 向{chart.fG[p]} 流{flow[p]}</div>
                <div className="xk-combo-name" style={{ color: pairColor(combo.t) }}>{combo.n}</div>
                <div className="xk-combo-t" style={{ color: pairColor(combo.t) }}>{combo.t}</div>
                {p !== 5 && palaceStars24[p] && palaceStars24[p].length > 0 && (
                  <div className="xk-combo-s24" title="二十四天星（此宮三山）">
                    {palaceStars24[p].map((x) => (
                      <span key={x.mountain} style={{ color: x.ji === '吉' ? '#16a34a' : x.ji === '大凶' ? '#7f1d1d' : '#dc2626' }}>{x.star}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {badCombos.length > 0 && (
            <div className="xk-curelist">
              <div className="xk-sec-head">需化解之宮位</div>
              {badCombos.map(({ p, combo }) => (
                <div key={p} className="xk-cure-row">
                  <b>{PALACE_GUA[p]}宮（{PALACE_DIR[p]}）</b>　<span style={{ color: pairColor(combo.t) }}>{combo.n}</span>　— {combo.d}　<span className="xk-cure">化解：{remedyText(combo.r)}</span>
                  <button type="button" className="xk-ask-btn" onClick={() => { setAiTheme('化解催旺'); pickAiPalace(PALACE_GUA[p]); }}>問 AI 化解</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {/* 換運對比：前後兩盤 + 分析 */}
      <details className="panel collapsible">
        <summary className="panel-head">換運對比（{sitM}山{faceM}向）</summary>
        <div className="panel-body">
          <div className="xk-form">
            <label>換前（運）
              <select value={perA} onChange={(e) => setPerA(+e.target.value)}>
                {PERIODS.map((r, i) => <option key={i + 1} value={i + 1}>{i + 1}運（{r[0]}-{r[1]}）</option>)}
              </select>
            </label>
            <label>換後（運）
              <select value={perB} onChange={(e) => setPerB(+e.target.value)}>
                {PERIODS.map((r, i) => <option key={i + 1} value={i + 1}>{i + 1}運（{r[0]}-{r[1]}）</option>)}
              </select>
            </label>
          </div>
          <div className="xk-compare">
            <div className="xk-compare-col">
              <div className="xk-compare-title">{perA}運（換前）</div>
              <XkGrid chart={chartA} compact />
              <div className="xk-compare-types">
                {typesA.length ? typesA.map((t, i) => <span key={i} className="xk-mini-type" style={{ color: t.c }}>{t.n}</span>) : <span className="xk-none">無特殊格局</span>}
              </div>
            </div>
            <div className="xk-compare-arrow">→</div>
            <div className="xk-compare-col">
              <div className="xk-compare-title">{perB}運（換後）</div>
              <XkGrid chart={chartB} compact />
              <div className="xk-compare-types">
                {typesB.length ? typesB.map((t, i) => <span key={i} className="xk-mini-type" style={{ color: t.c }}>{t.n}</span>) : <span className="xk-none">無特殊格局</span>}
              </div>
            </div>
          </div>
          <CompareAnalysis chartA={chartA} chartB={chartB} typesA={typesA} typesB={typesB} perA={perA} perB={perB} />
          <div className="ai-block" style={{ marginTop: 10 }}>
            <button type="button" className="ai-btn" onClick={runCmpAi} disabled={cmpAi.loading}>
              {cmpAi.loading ? 'AI 分析中…' : (cmpAi.text ? `↻ 重新分析（${perA}→${perB}運，已存檔）` : `✨ AI 換運分析（${perA}運 → ${perB}運）`)}
            </button>
            {cmpAi.error && <div className="ai-error">{cmpAi.error}</div>}
            {cmpAi.text && <div className="ai-result">{cmpAi.text}</div>}
            {cmpAi.text && <div className="ai-saved">✓ 已存檔（本坐向＋{perA}→{perB}運），重整頁面亦保留</div>}
            {cmpAi.text && (
              <FollowUpChat
                basePayload={cmpBasePayload}
                thread={(libEntry(xkAiLib[cmpKey]) || {}).thread || []}
                onAppend={(qa) => setXkAiLib((lib) => { const e0 = libEntry(lib[cmpKey]) || { text: cmpAi.text }; return { ...lib, [cmpKey]: { ...e0, text: e0.text || cmpAi.text, thread: [...(e0.thread || []), qa] } }; })}
                placeholder="追問：就這次換運再問（例：哪個宮位要先處理）…"
              />
            )}
          </div>
        </div>
      </details>

      {/* 八宅命卦：九宮格 */}
      <details className="panel collapsible">
        <summary className="panel-head">八宅命卦</summary>
        <div className="panel-body">
          <div className="xk-form">
            <label>出生年
              <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label>性別
              <select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </label>
          </div>
          <div className="xk-grid bazhai-grid">
            {GRID.map((p) => {
              if (p === 5) {
                return (
                  <div key={p} className="xk-cell center bazhai-center">
                    <div className="xk-gua-name">{GUA_NAME[gua]}命</div>
                    <div className={`xk-gua-grp ${EAST4.includes(gua) ? 'east' : 'west'}`}>{EAST4.includes(gua) ? '東四命' : '西四命'}</div>
                  </div>
                );
              }
              const cell = bz[p];
              const good = cell.ji === '吉';
              return (
                <div key={p} className={`xk-cell bazhai-cell ${good ? 'good' : 'bad'}`}>
                  <div className="xk-pal top">{PALACE_GUA[p]}·{PALACE_DIR[p]}</div>
                  <div className="xk-bz-star" style={{ color: good ? '#16a34a' : '#dc2626' }}>{cell.star}</div>
                  <div className="xk-bz-eff">{ { 生氣: '財運事業', 天醫: '健康貴人', 延年: '感情和人', 伏位: '平穩安定', 絕命: '大凶忌臥', 五鬼: '是非意外', 六煞: '桃花口舌', 禍害: '小病破財' }[cell.star] }</div>
                </div>
              );
            })}
          </div>
          <div className="xk-note">四吉方（生氣、天醫、延年、伏位）宜作大門、臥室、書房；四凶方（絕命、五鬼、六煞、禍害）宜作廚廁、儲物，忌臥室大門。</div>
        </div>
      </details>

      {/* 二十四天星（與玄空飛星共用同一坐向） */}
      <details className="panel collapsible" open>
        <summary className="panel-head">二十四天星（{sitM}山{faceM}向）</summary>
        <div className="panel-body">
          <div className="xk-note" style={{ marginBottom: 8 }}>本區與上方玄空飛星<strong>共用同一坐向</strong>（坐{sitM}山・向{faceM}，羅盤度數 {degree}°），無需重複輸入；改坐向此處會同步更新。二十四天星隨坐向起盤，輔助判斷各方吉凶宜忌。</div>
          <TianXingAnalysis sitM={sitM} faceM={faceM} />
        </div>
      </details>

      {/* 室內平面圖浮層（按需查看，不佔版面） */}
      <button type="button" className="xk-plan-fab" onClick={() => setShowPlan(true)} title="查看室內平面圖＋羅盤">🗺 平面圖</button>
      {showPlan && (
        <div className="xk-plan-overlay" onClick={() => setShowPlan(false)}>
          <div className="xk-plan-modal" onClick={(e) => e.stopPropagation()}>
            <div className="xk-plan-head">
              <span>室內平面圖＋羅盤{sitM ? `（坐${sitM}山・向${faceM}）` : ''}</span>
              <button type="button" className="xk-plan-close" onClick={() => setShowPlan(false)}>✕</button>
            </div>
            <div className="xk-plan-body"><IndoorQuickView /></div>
          </div>
        </div>
      )}
    </div>
  );
}

// 換運分析
function CompareAnalysis({ chartA, chartB, typesA, typesB, perA, perB }) {
  const score = (types) => types.reduce((s, t) => s + (t.t === '大吉' ? 3 : t.t === '旺財' || t.t === '旺丁' ? 2 : t.t === '大凶' ? -3 : t.t === '凶' ? -1 : 0), 0);
  const sa = score(typesA), sb = score(typesB);
  const verdict = sb > sa ? `換入${perB}運後格局轉佳，較${perA}運為旺。` : sb < sa ? `換入${perB}運後格局轉弱，不及${perA}運，宜及早佈局化解。` : `換運前後格局相若。`;
  const atSit = (c, per) => c.sG[c.sitPalace];
  const atFace = (c, per) => c.fG[c.facePalace];
  return (
    <div className="xk-analysis">
      <div className="xk-sec-head">換運分析</div>
      <div className="xk-ana-row">坐方山星：{perA}運 {atSit(chartA)} → {perB}運 {atSit(chartB)}　｜　向方向星：{perA}運 {atFace(chartA)} → {perB}運 {atFace(chartB)}</div>
      <div className="xk-ana-row">當運星 {perA}→{perB}：{perB}運當令星為 {perB}，{perB}運中山星{perB}在{PALACE_GUA[Object.keys(chartB.sG).find((k) => chartB.sG[k] === perB)] || '—'}宮、向星{perB}在{PALACE_GUA[Object.keys(chartB.fG).find((k) => chartB.fG[k] === perB)] || '—'}宮。</div>
      <div className="xk-ana-row verdict">{verdict}</div>
    </div>
  );
}
