import React, { useMemo, useState } from 'react';
import { paipan } from './qimen/engine.js';
import { DOOR_INFO, STAR_INFO, GOD_INFO, STEM_INFO, PALACE_INFO } from './qimen/symbols.js';

// ---- 简体→繁体（本盘用到的字） ----
const S2T = {
  '门': '門', '冲': '衝', '辅': '輔', '阴': '陰', '阳': '陽', '时': '時', '盘': '盤', '历': '曆',
  '马': '馬', '将': '將', '节': '節', '气': '氣', '农': '農', '别': '別', '当': '當', '间': '間',
  '伤': '傷', '惊': '驚', '开': '開', '龙': '龍', '岁': '歲', '满': '滿', '贵': '貴', '选': '選',
};
const t = (s) => (s == null ? '' : String(s).split('').map((c) => S2T[c] || c).join(''));

const PALACE_NAME = {
  1: '坎一宮', 2: '坤二宮', 3: '震三宮', 4: '巽四宮', 5: '中五宮',
  6: '乾六宮', 7: '兌七宮', 8: '艮八宮', 9: '離九宮',
};
const PALACE_SHORT = {
  1: '坎一', 2: '坤二', 3: '震三', 4: '巽四', 5: '中五',
  6: '乾六', 7: '兌七', 8: '艮八', 9: '離九',
};
// 洛书九宫布局：巽4 离9 坤2 / 震3 中5 兑7 / 艮8 坎1 乾6
const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const PILLAR_LABELS = ['年', '月', '日', '時']; // 各柱天干落天盤之宮 → 標於該宮左上

// 外干（隐干）在九宮格外的方位（依各宮洛书方位贴边）
const WAIGAN_POS = {
  4: { edge: 'top', style: { top: 0, left: '16.6%' } },     // 巽四宮：上
  9: { edge: 'top', style: { top: 0, left: '50%' } },       // 離九宮：上
  2: { edge: 'top', style: { top: 0, left: '83.3%' } },     // 坤二宮：上
  3: { edge: 'left', style: { top: '50%', left: 0 } },      // 震三宮：左
  7: { edge: 'right', style: { top: '50%', right: 0 } },    // 兌七宮：右
  8: { edge: 'bottom', style: { bottom: 0, left: '16.6%' } }, // 艮八宮：下（左下）
  1: { edge: 'bottom', style: { bottom: 0, left: '50%' } },  // 坎一宮：下
  6: { edge: 'bottom', style: { bottom: 0, left: '83.3%' } }, // 乾六宮：下（右下）
};

// 颜色：破=绿 刑=红 墓=灰 墓刑=紫；其余一律黑色
function stemMarkClass(type) {
  if (type === '刑') return 'mk-red';
  if (type === '墓') return 'mk-grey';
  if (type === '刑墓') return 'mk-purple';
  return '';
}
function palaceMarkClass(m) {
  if (m === '破') return 'mk-green';
  if (m === '刑') return 'mk-red';
  if (m === '墓') return 'mk-grey';
  if (m === '墓刑') return 'mk-purple';
  return '';
}

function Stem({ text, type }) {
  return <div className={`stem ${stemMarkClass(type)}`}>{t(text)}</div>;
}

// 換陰陽：同五行異陰陽（癸↔壬、庚↔辛、丙↔丁、戊↔己、乙↔甲）
const YINYANG_SWAP = { 甲: '乙', 乙: '甲', 丙: '丁', 丁: '丙', 戊: '己', 己: '戊', 庚: '辛', 辛: '庚', 壬: '癸', 癸: '壬' };

// 遠程事主：開盤人看日干、問事人看月干。
// 開盤人與問事人「不同性別」→ 月干直接落天盤之宮；「同性別」→ 月干換陰陽後落天盤之宮。
// 近程不標事主。回傳事主宮位（或 null）。
function computeShiZhu(result, querent) {
  if (!result || querent.mode !== '遠程') return null;
  if (!querent.caster || !querent.querent) return null; // 需先設定開盤人與問事人性別
  let stem = result.pillarStems[1]; // 月干（甲遁旬首儀）
  if (querent.caster === querent.querent) stem = YINYANG_SWAP[stem]; // 同性別 → 換陰陽
  if (stem === '甲') return result.zhiFu.palace; // 甲為旬首，以值符所落之宮論
  for (const p of [1, 2, 3, 4, 6, 7, 8, 9]) {
    if ((result.palaces[p].tianGan || []).includes(stem)) return p;
  }
  return null;
}

// 四柱八字直式排列：年 / 月 / 日 / 時 各為一柱（上干下支），末柱為時柱空亡
function BaZiStrip({ result }) {
  const heads = ['年', '月', '日', '時'];
  const hourKong = result.xunKong[3]; // 時柱空亡（盤中空亡宮所據）
  return (
    <div className="bazi-strip">
      {result.pillars.map((gz, i) => (
        <div className="bazi-col" key={i}>
          <div className="bazi-head">{heads[i]}柱</div>
          <div className="bazi-char">{t(gz[0])}</div>
          <div className="bazi-char">{t(gz[1])}</div>
        </div>
      ))}
      <div className="bazi-col bazi-kong">
        <div className="bazi-head">空亡</div>
        <div className="bazi-char">{t(hourKong[0])}</div>
        <div className="bazi-char">{t(hourKong[1])}</div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: '#dc2626', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          頁面渲染出錯：{String(this.state.error && this.state.error.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

function PalaceCell({ data, result, shiZhu, onSelect }) {
  const p = data.palace;
  // 四柱天干（甲遁旬首儀）落天盤之宮 → 標 年/月/日/時
  const pillarMarks = [0, 1, 2, 3].map((i) => result.pillarMarkPalaces[i] === p);
  const isHorse = result.horse.palace === p;
  const isVoid = result.kongPalaces.includes(p); // 時柱空亡落宮 → 標小圈

  // 左側竖排：天盤干（可多个）在上，地盤干（+寄宫干）在下
  const tianStems = (data.tianGan || []).map((s, i) => ({ s, type: data.stemMarks?.[i]?.type }));
  const diStart = (data.tianGan || []).length;
  const diStems = [data.diGan, ...(data.diGanExtra ? [data.diGanExtra] : [])]
    .filter(Boolean)
    .map((s, i) => ({ s, type: data.stemMarks?.[diStart + i]?.type }));

  return (
    <div className={`cell clickable${p === 5 ? ' center' : ''}${shiZhu ? ' shizhu-cell' : ''}`} onClick={onSelect} title="點擊查看本宮符號象意">
      {/* 年月日時：左上，竖排（各柱天干落天盤之宮） */}
      <div className="kong-panel">
        {PILLAR_LABELS.map((lab, i) => (pillarMarks[i] ? <span key={lab} className="kong-box on">{lab}</span> : null))}
      </div>
      {/* 右上：事主標記 + 空亡小圈 */}
      <div className="tr-panel">
        {shiZhu && <span className="shizhu-badge">事主</span>}
        {isVoid && <div className="void-circle" title="空亡" />}
      </div>

      <div className="cell-mid">
        <div className="stems">
          {tianStems.length > 0 && (
            <div className="stem-row">
              {tianStems.map((x, i) => <Stem key={'t' + i} text={x.s} type={x.type} />)}
            </div>
          )}
          {diStems.length > 0 && tianStems.length > 0 && <div className="stem-sep" />}
          {diStems.length > 0 && (
            <div className="stem-row">
              {diStems.map((x, i) => <Stem key={'d' + i} text={x.s} type={x.type} />)}
            </div>
          )}
        </div>
        <div className="center-info">
          <div className="god">{t(data.god || '')}</div>
          <div className="star">{t(data.stars.join(''))}</div>
          <div className={`door${data.menpo ? ' mk-green' : ''}`}>{t(data.door)}</div>
        </div>
        <div className="horse-slot">{isHorse && <span className="horse-badge">馬</span>}</div>
      </div>

      <div className="cell-bottom">
        <div className="marks">
          {data.marks.map((m) => (
            <span key={m} className={`mark ${palaceMarkClass(m)}`}>{t(m)}</span>
          ))}
        </div>
        <div className="palace-name">{PALACE_NAME[p]}</div>
      </div>
    </div>
  );
}

// 單個符號的象意列（八門/九星/八神/天干/宮位通用）
function SymbolRow({ label, name, info, tagExtra }) {
  if (!info) return null;
  return (
    <div className="sym-row">
      <div className="sym-head">
        <span className="sym-label">{label}</span>
        <span className="sym-name">{name}</span>
        <span className="sym-tags">
          {info.wx && <span className="sym-tag">{t(info.wx)}</span>}
          {info.yy && <span className="sym-tag">{info.yy}</span>}
          {info.ji && <span className={`sym-tag ji-${info.ji === '凶' || info.ji === '大凶' ? 'xiong' : 'ji'}`}>{info.ji}</span>}
          {tagExtra}
        </span>
      </div>
      <div className="sym-meaning">{info.meaning}</div>
      {info.items && info.items.length > 0 && (
        <div className="sym-items">
          {info.items.map((it) => <span key={it} className="sym-item">{it}</span>)}
        </div>
      )}
    </div>
  );
}

// 宮位詳情彈窗：列出該宮所有符號的象意與代表人事物
function PalaceModal({ p, result, shiZhuPalace, onClose }) {
  const data = result.palaces[p];
  if (!data) return null;
  const diStems = [data.diGan, data.diGanExtra].filter(Boolean);
  // 本宮標記
  const tags = [];
  PILLAR_LABELS.forEach((lab, i) => { if (result.pillarMarkPalaces[i] === p) tags.push(lab + '柱'); });
  if (result.horse.palace === p) tags.push('馬星');
  if (result.kongPalaces.includes(p)) tags.push('空亡');
  if (shiZhuPalace === p) tags.push('事主');
  if (data.menpo) tags.push('門迫');
  (data.marks || []).forEach((m) => tags.push(t(m)));
  // 組合類象：彙整本宮所有符號的代表物（供日後 AI 組合）
  const allItems = [];
  const pushItems = (info) => { if (info && info.items) allItems.push(...info.items); };
  pushItems(PALACE_INFO[p]);
  pushItems(GOD_INFO[data.god]);
  (data.stars || []).forEach((s) => pushItems(STAR_INFO[s]));
  pushItems(DOOR_INFO[data.door]);
  (data.tianGan || []).forEach((s) => pushItems(STEM_INFO[s]));
  diStems.forEach((s) => pushItems(STEM_INFO[s]));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{PALACE_NAME[p]}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="關閉">✕</button>
        </div>
        <div className="modal-body">
          {tags.length > 0 && (
            <div className="modal-tags">
              {tags.map((x, i) => <span key={i} className="modal-tag">{x}</span>)}
            </div>
          )}
          <SymbolRow label="宮位" name={PALACE_NAME[p]} info={PALACE_INFO[p]} />
          <SymbolRow label="八神" name={t(data.god)} info={GOD_INFO[data.god]} />
          {(data.stars || []).map((s, i) => <SymbolRow key={'star' + i} label="九星" name={t(s)} info={STAR_INFO[s]} />)}
          <SymbolRow label="八門" name={t(data.door)} info={DOOR_INFO[data.door]} tagExtra={data.menpo ? <span className="sym-tag ji-xiong">門迫</span> : null} />
          {(data.tianGan || []).map((s, i) => <SymbolRow key={'tg' + i} label="天盤干" name={t(s)} info={STEM_INFO[s]} />)}
          {diStems.map((s, i) => <SymbolRow key={'dg' + i} label="地盤干" name={t(s)} info={STEM_INFO[s]} />)}

          <div className="sym-combo">
            <div className="sym-combo-head">本宮符號組合類象（{allItems.length} 項）</div>
            <div className="sym-items">
              {allItems.map((it, i) => <span key={i} className="sym-item combo">{it}</span>)}
            </div>
            <div className="sym-combo-note">（日後可接 AI 模型，依多數屬性自動推斷本宮所代表的人事物）</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [form, setForm] = useState({ year: 2026, month: 5, day: 16, hour: 11, minute: 38, name: '', sex: '乾造' });
  const [submitted, setSubmitted] = useState({ ...form });

  const result = useMemo(() => {
    try {
      return paipan(+submitted.year, +submitted.month, +submitted.day, +submitted.hour, +submitted.minute);
    } catch (e) {
      return null;
    }
  }, [submitted]);

  // 問事設定：遠/近程 + 開盤人/問事人性別（皆可留空，開盤後隨時可補）
  const [querent, setQuerent] = useState({ mode: '近程', caster: '', querent: '' });
  const shiZhuPalace = useMemo(() => computeShiZhu(result, querent), [result, querent]);
  const toggleGender = (key, val) => setQuerent((q) => ({ ...q, [key]: q[key] === val ? '' : val }));
  // 點擊宮位查看各符號象意
  const [selected, setSelected] = useState(null);

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const onChange = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const onSubmit = (e) => { e.preventDefault(); setSubmitted({ ...form }); };
  const setNow = () => {
    const n = new Date();
    const f = { ...form, year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate(), hour: n.getHours(), minute: n.getMinutes() };
    setForm(f); setSubmitted(f);
  };

  const years = []; for (let y = 1900; y <= 2100; y++) years.push(y);
  const hours = []; for (let h = 0; h <= 23; h++) hours.push(h);
  const minutes = []; for (let m = 0; m <= 59; m++) minutes.push(m);

  return (
    <div className="page">
      <h1 className="title">陰盤奇門排盤（時盤）</h1>

      <details className="panel collapsible" open={!isMobile}>
        <summary className="panel-head">排盤輸入</summary>
        <div className="panel-body">
      <form className="form" onSubmit={onSubmit}>
        <label>姓名
          <input value={form.name} onChange={onChange('name')} placeholder="選填" />
        </label>
        <label>性別
          <select value={form.sex} onChange={onChange('sex')}>
            <option value="乾造">乾造（男）</option>
            <option value="坤造">坤造（女）</option>
          </select>
        </label>
        <label>年
          <select value={form.year} onChange={onChange('year')}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
        <label>月
          <select value={form.month} onChange={onChange('month')}>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </label>
        <label>日
          <select value={form.day} onChange={onChange('day')}>{Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</select>
        </label>
        <label>時
          <select value={form.hour} onChange={onChange('hour')}>{hours.map((h) => <option key={h} value={h}>{h}</option>)}</select>
        </label>
        <label>分
          <select value={form.minute} onChange={onChange('minute')}>{minutes.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </label>
        <button type="submit" className="btn primary">排盤</button>
        <button type="button" className="btn" onClick={setNow}>當前時間</button>
          </form>
        </div>
      </details>

      {result && (
        <ErrorBoundary>
          <details className="panel collapsible" open={!isMobile}>
            <summary className="panel-head">基本信息</summary>
            <div className="panel-body info-grid">
              <div>
                <InfoRow label="姓名" value={`${submitted.name || '（未填）'}（${t(submitted.sex)}）`} />
                <InfoRow label="公曆" value={result.solarText} />
                <InfoRow label="農曆" value={t(`${result.lunar.toString()}日 ${result.pillars[3][1]}時`)} />
                <InfoRow label="上一節氣" value={t(`${result.prevJieQi} ${result.lunar.getPrevJieQi(true).getSolar().toYmdHms()}`)} />
                <InfoRow label="下一節氣" value={t(`${result.lunar.getNextJieQi(true).getName()} ${result.lunar.getNextJieQi(true).getSolar().toYmdHms()}`)} />
                <InfoRow label="馬星" value={`馬星${result.horse.zhi} 落${PALACE_SHORT[result.horse.palace]}宮`} valueClass="hd-green" />
                <InfoRow label="月將" value={t(result.yueJiang)} valueClass="hd-red" />
              </div>
              <div>
                <InfoRow label="旬空" value={result.xunKong.map((k) => k.join('') + '空').join(' ')} valueClass="hd-blue" />
                <InfoRow label="旬首" value={t(result.xunShou)} valueClass="hd-green" />
                <InfoRow label="定局" value={t(`${result.dun}遁${result.ju}局（時盤）`)} valueClass="hd-red" />
                <InfoRow label="值符" value={`${t(result.zhiFu.star)} 落${PALACE_SHORT[result.zhiFu.palace]}宮`} valueClass="hd-red" />
                <InfoRow label="值使" value={`${t(result.zhiShi.door)} 落${PALACE_SHORT[result.zhiShi.palace]}宮`} valueClass="hd-red" />
                <InfoRow label="空亡" value={`${result.xunKong[3].join('')}空 落${result.kongPalaces.map((p) => PALACE_SHORT[p]).join('、')}宮`} valueClass="hd-green" />
              </div>
            </div>
          </details>

          <div className="panel">
            <div className="panel-head">四柱八字（直式）</div>
            <div className="panel-body">
              <BaZiStrip result={result} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">陰盤奇門盤</div>
            <div className="panel-body">
              {/* 問事設定：遠程＋開盤人/問事人性別 → 標事主（可留空，隨時補） */}
              <div className="querent-bar">
                <div className="q-group">
                  <span className="q-label">遠近程</span>
                  <div className="seg">
                    <button type="button" className={querent.mode === '近程' ? 'on' : ''} onClick={() => setQuerent({ ...querent, mode: '近程' })}>近程</button>
                    <button type="button" className={querent.mode === '遠程' ? 'on' : ''} onClick={() => setQuerent({ ...querent, mode: '遠程' })}>遠程</button>
                  </div>
                </div>
                <div className="q-group">
                  <span className="q-label">開盤人</span>
                  <div className="seg">
                    <button type="button" className={querent.caster === '男' ? 'on' : ''} onClick={() => toggleGender('caster', '男')}>男</button>
                    <button type="button" className={querent.caster === '女' ? 'on' : ''} onClick={() => toggleGender('caster', '女')}>女</button>
                  </div>
                </div>
                <div className="q-group">
                  <span className="q-label">問事人</span>
                  <div className="seg">
                    <button type="button" className={querent.querent === '男' ? 'on' : ''} onClick={() => toggleGender('querent', '男')}>男</button>
                    <button type="button" className={querent.querent === '女' ? 'on' : ''} onClick={() => toggleGender('querent', '女')}>女</button>
                  </div>
                </div>
                {querent.mode === '遠程' && (
                  <span className="q-result">
                    {shiZhuPalace ? `事主落 ${PALACE_SHORT[shiZhuPalace]}宮` : '設定開盤人與問事人性別後顯示事主'}
                  </span>
                )}
              </div>
              <div className="grid-wrap">
                <div className="grid">
                  {GRID.map((p) => <PalaceCell key={p} data={result.palaces[p]} result={result} shiZhu={p === shiZhuPalace} onSelect={() => setSelected(p)} />)}
                </div>
                {/* 外干（隐干）：贴各宮外側方位；中五宮外干寄 waiganJiGong 宮並列 */}
                {[4, 9, 2, 3, 7, 8, 1, 6].map((p) => (
                  <span key={p} className={`waigan wg-${WAIGAN_POS[p].edge}`} style={WAIGAN_POS[p].style}>
                    {t(result.waigan[p])}
                    {p === result.waiganJiGong && <span className="waigan-ji">{t(result.waiganCenter)}</span>}
                  </span>
                ))}
              </div>
              <div className="legend">
                <span><span className="sw mk-green">破</span>＝門迫（綠）</span>
                <span><span className="sw mk-red">刑</span>＝擊刑（紅）</span>
                <span><span className="sw mk-grey">墓</span>＝入墓（灰）</span>
                <span><span className="sw mk-purple">墓刑</span>＝入墓+擊刑（紫）</span>
                <span><span className="sw horse-badge">馬</span> 馬星（落{PALACE_SHORT[result.horse.palace]}宮）</span>
                <span>外圈干＝外干（隐干）</span>
                <span className="legend-tip">點擊宮位可查看各符號象意</span>
              </div>
            </div>
          </div>

          {selected != null && (
            <PalaceModal p={selected} result={result} shiZhuPalace={shiZhuPalace} onClose={() => setSelected(null)} />
          )}
        </ErrorBoundary>
      )}
    </div>
  );
}

function InfoRow({ label, value, valueClass = '' }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}：</span>
      <span className={`info-value ${valueClass}`}>{value}</span>
    </div>
  );
}
