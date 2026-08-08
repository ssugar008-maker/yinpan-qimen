import React, { useMemo, useState, useEffect } from 'react';
import {
  GRID, PALACE_DIR, PALACE_GUA, STAR_JI, PERIODS, MOUNTAINS24,
  oppositeMountain, xuanKongChart, chartTypes, castleGate, starPair, remedyText,
  annualStar, annualChart, lifeGua, bazhai, GUA_NAME, EAST4,
  mountainFromDegree, mountainCenter, degreeOffset,
} from './engine.js';

const jiColor = (ji) => (ji === '吉' ? '#16a34a' : ji === '大凶' ? '#dc2626' : ji === '凶' ? '#d97706' : '#6b7280');
const pairColor = (t) => (t === '吉' ? '#16a34a' : t === '大凶' ? '#dc2626' : t === '凶' || t === '半凶' ? '#d97706' : t === '半吉' ? '#65a30d' : '#6b7280');

// 可重用九宮玄空盤
function XkGrid({ chart, flow = null, compact = false }) {
  return (
    <div className={`xk-grid${compact ? ' compact' : ''}`}>
      {GRID.map((p) => {
        const isSit = p === chart.sitPalace, isFace = p === chart.facePalace;
        const combo = starPair(chart.sG[p], chart.fG[p]);
        return (
          <div key={p} className={`xk-cell${p === 5 ? ' center' : ''}${isSit ? ' sit' : ''}${isFace ? ' face' : ''}`}>
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
  const [perA, setPerA] = useState(8);
  const [perB, setPerB] = useState(9);
  const [birthYear, setBirthYear] = useState(1990);
  const [gender, setGender] = useState('男');

  const faceM = oppositeMountain(sitM);
  const chart = useMemo(() => xuanKongChart(period, sitM, faceM), [period, sitM, faceM]);
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

  // ── AI 風水分析（整體 / 各宮）──
  const XK_AI_KEY = 'xuankong_ai_v1';
  const loadXkAi = () => { try { const v = JSON.parse(localStorage.getItem(XK_AI_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  const [xkAiLib, setXkAiLib] = useState(loadXkAi);
  const [aiScope, setAiScope] = useState('整體');
  const chartPayload = useMemo(() => ({
    sit: sitM, face: faceM, period, flowYear, flowStar,
    types: types.map((t) => ({ n: t.n, t: t.t })),
    palaces: GRID.map((p) => {
      const c = starPair(chart.sG[p], chart.fG[p]);
      return { name: PALACE_GUA[p], dir: PALACE_DIR[p], shan: chart.sG[p], xiang: chart.fG[p], yun: chart.pG[p], flow: flow[p], combo: c.n, ji: c.t };
    }),
  }), [sitM, faceM, period, flowYear, flowStar, types, chart, flow]);
  const aiKey = `${sitM}${faceM}|${period}|${flowYear}|${aiScope}`;
  const [xkAi, setXkAi] = useState({ loading: false, text: '', error: '' });
  useEffect(() => { setXkAi({ loading: false, text: xkAiLib[aiKey] || '', error: '' }); }, [aiKey]);
  const runXkAi = async () => {
    setXkAi({ loading: true, text: '', error: '' });
    try {
      const isOverall = aiScope === '整體';
      const r = await fetch('/api/interpret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: isOverall ? 'xkOverall' : 'xkPalace', chart: chartPayload, palace: isOverall ? undefined : aiScope }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `AI 分析失敗（${r.status}）`);
      const text = (data.text || '').trim();
      setXkAi({ loading: false, text, error: '' });
      if (text) setXkAiLib((lib) => { const next = { ...lib, [aiKey]: text }; try { localStorage.setItem(XK_AI_KEY, JSON.stringify(next)); } catch {} return next; });
    } catch (e) { setXkAi({ loading: false, text: '', error: String((e && e.message) || e) }); }
  };
  const AI_SCOPES = ['整體', ...GRID.map((p) => PALACE_GUA[p])];

  // ── 換運對比 AI（存同一 xkAiLib，按 坐向|前運|後運 快取）──
  const periodPayload = (chrt, typs) => ({
    types: typs.map((t) => ({ n: t.n, t: t.t })),
    palaces: GRID.map((p) => ({ name: PALACE_GUA[p], dir: PALACE_DIR[p], shan: chrt.sG[p], xiang: chrt.fG[p], yun: chrt.pG[p] })),
  });
  const cmpKey = `${sitM}${faceM}|cmp|${perA}|${perB}`;
  const [cmpAi, setCmpAi] = useState({ loading: false, text: '', error: '' });
  useEffect(() => { setCmpAi({ loading: false, text: xkAiLib[cmpKey] || '', error: '' }); }, [cmpKey]);
  const runCmpAi = async () => {
    setCmpAi({ loading: true, text: '', error: '' });
    try {
      const r = await fetch('/api/interpret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'xkCompare',
          compare: {
            sit: sitM, face: faceM, sitGua: PALACE_GUA[chartA.sitPalace], faceGua: PALACE_GUA[chartA.facePalace],
            perA, perB, typesA, typesB, chartA: periodPayload(chartA, typesA), chartB: periodPayload(chartB, typesB),
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `AI 分析失敗（${r.status}）`);
      const text = (data.text || '').trim();
      setCmpAi({ loading: false, text, error: '' });
      if (text) setXkAiLib((lib) => { const next = { ...lib, [cmpKey]: text }; try { localStorage.setItem(XK_AI_KEY, JSON.stringify(next)); } catch {} return next; });
    } catch (e) { setCmpAi({ loading: false, text: '', error: String((e && e.message) || e) }); }
  };

  // 星曜組合（九宮格用）
  const combos = GRID.map((p) => ({ p, combo: starPair(chart.sG[p], chart.fG[p]) }));
  const badCombos = combos.filter((c) => c.combo.r);

  return (
    <div className="xk">
      {/* 排盤輸入 */}
      <div className="panel">
        <div className="panel-head">玄空飛星排盤（下卦）</div>
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
          {jianXiang && <div className="xk-jx">⚠ 度數 {degree}° 接近兩山交界（兼向），下卦排盤或需改用替卦起星。</div>}

          <XkGrid chart={chart} flow={flow} />
          <div className="xk-legend">
            <span><b style={{ color: '#8b5a2b' }}>左</b>山星　<b style={{ color: '#8b5a2b' }}>右</b>向星　下：運星/流年星</span>
            <span>綠=吉　橙=凶　紅=大凶　右下點=凶組合</span>
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

      {/* AI 風水分析 */}
      <div className="panel">
        <div className="panel-head">AI 風水分析（整體／各宮）</div>
        <div className="panel-body">
          <div className="ai-theme-row">
            <span className="ai-theme-label">分析範圍</span>
            <div className="ai-theme-chips">
              {AI_SCOPES.map((s) => (
                <button key={s} type="button" className={`ai-theme-chip${aiScope === s ? ' active' : ''}`} onClick={() => setAiScope(s)}>{s}</button>
              ))}
            </div>
          </div>
          <button type="button" className="ai-btn" onClick={runXkAi} disabled={xkAi.loading}>
            {xkAi.loading ? 'AI 分析中…' : (xkAi.text ? `↻ 重新分析（${aiScope}，已存檔）` : `✨ AI 分析：${aiScope === '整體' ? '整體格局＋化解' : `${aiScope}宮組合＋化解`}`)}
          </button>
          {xkAi.error && <div className="ai-error">{xkAi.error}</div>}
          {xkAi.text && <div className="ai-result">{xkAi.text}</div>}
          {xkAi.text && <div className="ai-saved">✓ 已存檔（本坐向／運／流年／範圍），重整頁面亦保留</div>}
          <div className="sym-combo-note">（AI 以玄空大師角度，結合格局、山向星、五行生剋與流年，給出吉凶判斷與化解催旺方案）</div>
        </div>
      </div>

      {/* 星曜組合：九宮格排盤 */}
      <div className="panel">
        <div className="panel-head">星曜組合（山星＋向星）＋流年</div>
        <div className="panel-body">
          <div className="xk-grid combo-grid">
            {combos.map(({ p, combo }) => (
              <div key={p} className={`xk-cell combo-cell${p === 5 ? ' center' : ''}`}>
                <div className="xk-pal top">{PALACE_GUA[p]}{p === 5 ? '' : `·${PALACE_DIR[p]}`}{p === chart.sitPalace ? '（坐）' : p === chart.facePalace ? '（向）' : ''}</div>
                <div className="xk-combo-stars2">山{chart.sG[p]} 向{chart.fG[p]} 流{flow[p]}</div>
                <div className="xk-combo-name" style={{ color: pairColor(combo.t) }}>{combo.n}</div>
                <div className="xk-combo-t" style={{ color: pairColor(combo.t) }}>{combo.t}</div>
              </div>
            ))}
          </div>
          {badCombos.length > 0 && (
            <div className="xk-curelist">
              <div className="xk-sec-head">需化解之宮位</div>
              {badCombos.map(({ p, combo }) => (
                <div key={p} className="xk-cure-row">
                  <b>{PALACE_GUA[p]}宮（{PALACE_DIR[p]}）</b>　<span style={{ color: pairColor(combo.t) }}>{combo.n}</span>　— {combo.d}　<span className="xk-cure">化解：{remedyText(combo.r)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 換運對比：前後兩盤 + 分析 */}
      <div className="panel">
        <div className="panel-head">換運對比（{sitM}山{faceM}向）</div>
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
          </div>
        </div>
      </div>

      {/* 八宅命卦：九宮格 */}
      <div className="panel">
        <div className="panel-head">八宅命卦</div>
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
      </div>
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
