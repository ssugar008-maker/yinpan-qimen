import React, { useMemo, useState } from 'react';
import {
  GRID, PALACE_DIR, PALACE_GUA, STAR_NAME, STAR_JI, PERIODS, MOUNTAINS24,
  oppositeMountain, xuanKongChart, chartTypes, castleGate, starPair, remedyText,
  periodComparison, annualStar, annualChart, lifeGua, bazhai, GUA_NAME, EAST4,
} from './engine.js';

const jiColor = (ji) => (ji === '吉' ? '#16a34a' : ji === '大凶' ? '#dc2626' : ji === '凶' ? '#d97706' : '#6b7280');

// 玄空飛星盤（下卦）
export default function XuanKong() {
  const now = new Date();
  const [sitM, setSitM] = useState('子');
  const [period, setPeriod] = useState(9);
  const [flowYear, setFlowYear] = useState(now.getFullYear());
  const [showCompare, setShowCompare] = useState(false);
  const [birthYear, setBirthYear] = useState(1990);
  const [gender, setGender] = useState('男');

  const faceM = oppositeMountain(sitM);
  const chart = useMemo(() => xuanKongChart(period, sitM, faceM), [period, sitM, faceM]);
  const types = useMemo(() => chartTypes(chart), [chart]);
  const castle = useMemo(() => castleGate(chart), [chart]);
  const flow = useMemo(() => annualChart(flowYear), [flowYear]);
  const flowStar = annualStar(flowYear);
  const compare = useMemo(() => periodComparison(sitM, faceM), [sitM, faceM]);
  const gua = useMemo(() => lifeGua(+birthYear, gender), [birthYear, gender]);
  const bz = useMemo(() => bazhai(gua), [gua]);

  const years = []; for (let y = 1900; y <= 2099; y++) years.push(y);

  return (
    <div className="xk">
      {/* 排盤輸入 */}
      <div className="panel">
        <div className="panel-head">玄空飛星排盤（下卦）</div>
        <div className="panel-body">
          <div className="xk-form">
            <label>坐山
              <select value={sitM} onChange={(e) => setSitM(e.target.value)}>
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
          <div className="xk-sub">{period}運 {sitM}山{faceM}向　｜　{flowYear}年流年 {flowStar}入中</div>

          {/* 九宮飛星盤 */}
          <div className="xk-grid">
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
                  <div className="xk-base">運{chart.pG[p]}　流{flow[p]}</div>
                  {isSit && <span className="xk-tag sit-tag">坐</span>}
                  {isFace && <span className="xk-tag face-tag">向</span>}
                  {combo.t !== '平' && combo.t !== '半吉' && <span className="xk-combo-dot" style={{ background: jiColor(combo.t) === '#16a34a' ? '#16a34a' : jiColor(combo.t) }} title={combo.n} />}
                </div>
              );
            })}
          </div>
          <div className="xk-legend">
            <span><b style={{ color: '#8b5a2b' }}>左</b>山星　<b style={{ color: '#8b5a2b' }}>右</b>向星　下：運星/流年星</span>
            <span>綠=吉　橙=凶　紅=大凶</span>
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

      {/* 星曜組合 */}
      <div className="panel">
        <div className="panel-head">星曜組合（山星＋向星）＋流年</div>
        <div className="panel-body">
          <div className="xk-combos">
            {GRID.map((p) => {
              const combo = starPair(chart.sG[p], chart.fG[p]);
              const mark = p === chart.sitPalace ? '（坐）' : p === chart.facePalace ? '（向）' : '';
              return (
                <div key={p} className="xk-combo-row">
                  <div className="xk-combo-head">
                    <span className="xk-combo-pal">{PALACE_GUA[p]}宮{mark}</span>
                    <span className="xk-combo-stars">山{chart.sG[p]} 向{chart.fG[p]} 運{chart.pG[p]} 流{flow[p]}</span>
                    <span className="xk-combo-n" style={{ color: jiColor(combo.t) }}>{combo.n}·{combo.t}</span>
                  </div>
                  <div className="xk-combo-d">{combo.d}{combo.r ? `　化解：${remedyText(combo.r)}` : ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 換運對比 */}
      <div className="panel">
        <div className="panel-head xk-toggle" onClick={() => setShowCompare(!showCompare)}>
          換運對比（{sitM}山{faceM}向 一至九運）<span className="xk-caret">{showCompare ? '▾' : '▸'}</span>
        </div>
        {showCompare && (
          <div className="panel-body">
            <table className="xk-table">
              <thead><tr><th>運</th><th>年份</th><th>山星到坐</th><th>向星到向</th><th>格局</th></tr></thead>
              <tbody>
                {compare.map((r) => {
                  const cur = r.period === period;
                  const wang = r.main && r.main.n === '旺山旺向';
                  return (
                    <tr key={r.period} className={cur ? 'cur' : ''}>
                      <td>{r.period}運{cur ? '（今）' : ''}</td>
                      <td>{r.years[0]}-{r.years[1]}</td>
                      <td>{r.chart.sG[r.chart.sitPalace]}</td>
                      <td>{r.chart.fG[r.chart.facePalace]}</td>
                      <td style={{ color: wang ? '#c0392b' : (r.main ? r.main.c : '#999'), fontWeight: wang || cur ? 700 : 400 }}>
                        {r.all.length ? r.all.map((t) => t.n).join('、') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="xk-note">同一坐向，換運後山向星位置改變，格局吉凶亦隨之改變；可對比哪一運最旺（旺山旺向最佳）。</div>
          </div>
        )}
      </div>

      {/* 八宅命卦 */}
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
          <div className="xk-gua-result">
            <span className="xk-gua-name">{GUA_NAME[gua]}命</span>
            <span className={`xk-gua-grp ${EAST4.includes(gua) ? 'east' : 'west'}`}>{EAST4.includes(gua) ? '東四命' : '西四命'}</span>
            <span className="xk-gua-tip">{EAST4.includes(gua) ? '宜：北、東、東南、南' : '宜：西北、西、西南、東北'}</span>
          </div>
          <div className="xk-bz">
            <div className="xk-bz-col good">
              <div className="xk-bz-head">四吉方</div>
              {['生氣', '天醫', '延年', '伏位'].map((s) => {
                const p = Object.keys(bz).find((k) => bz[k].star === s);
                return <div key={s} className="xk-bz-row"><b>{s}</b>　{PALACE_GUA[p]}（{PALACE_DIR[p]}）<span className="xk-bz-d">{ { 生氣: '財運事業', 天醫: '健康貴人', 延年: '感情和人', 伏位: '平穩安定' }[s] }</span></div>;
              })}
            </div>
            <div className="xk-bz-col bad">
              <div className="xk-bz-head">四凶方</div>
              {['絕命', '五鬼', '六煞', '禍害'].map((s) => {
                const p = Object.keys(bz).find((k) => bz[k].star === s);
                return <div key={s} className="xk-bz-row"><b>{s}</b>　{PALACE_GUA[p]}（{PALACE_DIR[p]}）<span className="xk-bz-d">{ { 絕命: '大凶忌臥', 五鬼: '是非意外', 六煞: '桃花口舌', 禍害: '小病破財' }[s] }</span></div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
