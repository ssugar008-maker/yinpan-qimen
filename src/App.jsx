import React, { useMemo, useState } from 'react';
import { paipan } from './qimen/engine.js';

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
const KONG_LABELS = ['年', '月', '日', '時', '空'];

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

function PalaceCell({ data, result }) {
  const p = data.palace;
  const kongActive = [
    result.kongByPillar[0].includes(p),
    result.kongByPillar[1].includes(p),
    result.kongByPillar[2].includes(p),
    result.kongByPillar[3].includes(p),
    data.isKong,
  ];
  const isHorse = result.horse.palace === p;
  const isVoid = result.kongPalaces.includes(p); // 時柱空亡落宮 → 標小圈

  // 左側竖排：天盤干（可多个）在上，地盤干（+寄宫干）在下
  const tianStems = (data.tianGan || []).map((s, i) => ({ s, type: data.stemMarks?.[i]?.type }));
  const diStart = (data.tianGan || []).length;
  const diStems = [data.diGan, ...(data.diGanExtra ? [data.diGanExtra] : [])]
    .filter(Boolean)
    .map((s, i) => ({ s, type: data.stemMarks?.[diStart + i]?.type }));

  return (
    <div className={`cell${p === 5 ? ' center' : ''}`}>
      {/* 年月日時空：左上，竖排（仅点亮该柱空亡落此宫者） */}
      <div className="kong-panel">
        {KONG_LABELS.map((lab, i) => (kongActive[i] ? <span key={lab} className="kong-box on">{lab}</span> : null))}
      </div>
      {/* 空亡小圈：右上 */}
      {isVoid && <div className="void-circle" title="空亡" />}

      <div className="cell-mid">
        <div className="stems">
          {tianStems.map((x, i) => <Stem key={'t' + i} text={x.s} type={x.type} />)}
          {diStems.length > 0 && tianStems.length > 0 && <div className="stem-sep" />}
          {diStems.map((x, i) => <Stem key={'d' + i} text={x.s} type={x.type} />)}
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

      {result && (
        <ErrorBoundary>
          <div className="panel">
            <div className="panel-head">基本信息</div>
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
          </div>

          <div className="panel">
            <div className="panel-head">四柱八字（直式）</div>
            <div className="panel-body">
              <BaZiStrip result={result} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">陰盤奇門盤</div>
            <div className="panel-body">
              <div className="grid-wrap">
                <div className="grid">
                  {GRID.map((p) => <PalaceCell key={p} data={result.palaces[p]} result={result} />)}
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
              </div>
            </div>
          </div>
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
