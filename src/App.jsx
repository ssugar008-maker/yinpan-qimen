import React, { useMemo, useState } from 'react';
import { paipan } from './qimen/engine.js';

const PALACE_NAME = {
  1: '坎一宫', 2: '坤二宫', 3: '震三宫', 4: '巽四宫', 5: '中五宫',
  6: '乾六宫', 7: '兑七宫', 8: '艮八宫', 9: '离九宫',
};
const PALACE_SHORT = {
  1: '坎一', 2: '坤二', 3: '震三', 4: '巽四', 5: '中五',
  6: '乾六', 7: '兑七', 8: '艮八', 9: '离九',
};
// 洛书九宫布局：巽4 离9 坤2 / 震3 中5 兑7 / 艮8 坎1 乾6
const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const KONG_LABELS = ['年', '月', '日', '時', '空'];

function markClass(type) {
  if (type === '刑') return 'st-red';
  if (type === '墓' || type === '刑墓') return 'st-green';
  return '';
}
function palaceMarkClass(m) {
  return m === '刑' ? 'st-red' : 'st-green'; // 破/墓/墓刑 → 绿，刑 → 红
}

function Stem({ text, type }) {
  return <div className={`stem ${markClass(type)}`}>{text}</div>;
}

function PalaceCell({ data, result }) {
  const p = data.palace;
  // 年月日時空标记
  const kongActive = [
    result.kongByPillar[0].includes(p),
    result.kongByPillar[1].includes(p),
    result.kongByPillar[2].includes(p),
    result.kongByPillar[3].includes(p),
    data.isKong,
  ];
  const isHorse = result.horse.palace === p;

  // 左側竖排：天盤干（可多个）在上，地盤干（+寄宫干）在下
  const tianStems = data.tianGan.map((s, i) => ({ s, type: data.stemMarks[i]?.type }));
  const diStart = data.tianGan.length;
  const diStems = [data.diGan, ...(data.diGanExtra ? [data.diGanExtra] : [])]
    .filter(Boolean)
    .map((s, i) => ({ s, type: data.stemMarks[diStart + i]?.type }));

  return (
    <div className={`cell${p === 5 ? ' center' : ''}`}>
      <div className="cell-top">
        <div className="kong-panel">
          {KONG_LABELS.map((lab, i) => (
            <span key={lab} className={`kong-box${kongActive[i] ? ' on' : ''}`}>{lab}</span>
          ))}
        </div>
        <div className="god">{data.god || ''}</div>
      </div>

      <div className="cell-mid">
        <div className="stems">
          {tianStems.map((x, i) => <Stem key={'t' + i} text={x.s} type={x.type} />)}
          {diStems.length > 0 && <div className="stem-sep" />}
          {diStems.map((x, i) => <Stem key={'d' + i} text={x.s} type={x.type} />)}
        </div>
        <div className="center-info">
          <div className="star">{data.stars.join('')}</div>
          <div className={`door${data.menpo ? ' menpo' : ''}`}>{data.door}</div>
        </div>
        <div className="horse-slot">{isHorse && <span className="horse-badge">馬</span>}</div>
      </div>

      <div className="cell-bottom">
        <div className="marks">
          {data.marks.map((m) => (
            <span key={m} className={`mark ${palaceMarkClass(m)}`}>{m}</span>
          ))}
        </div>
        <div className="palace-name">{PALACE_NAME[p]}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [form, setForm] = useState({ year: 2026, month: 5, day: 20, hour: 21, minute: 37, name: '', sex: '乾造' });
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
      <h1 className="title">阴盘奇门排盘（时盘）</h1>

      <form className="form" onSubmit={onSubmit}>
        <label>姓名
          <input value={form.name} onChange={onChange('name')} placeholder="选填" />
        </label>
        <label>性别
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
        <label>时
          <select value={form.hour} onChange={onChange('hour')}>{hours.map((h) => <option key={h} value={h}>{h}</option>)}</select>
        </label>
        <label>分
          <select value={form.minute} onChange={onChange('minute')}>{minutes.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </label>
        <button type="submit" className="btn primary">排盘</button>
        <button type="button" className="btn" onClick={setNow}>当前时间</button>
      </form>

      {result && (
        <>
          <div className="panel">
            <div className="panel-head">基本信息</div>
            <div className="panel-body info-grid">
              <div>
                <InfoRow label="姓名" value={`${submitted.name || '（未填）'}（${submitted.sex}）`} />
                <InfoRow label="公历" value={result.solarText} />
                <InfoRow label="农历" value={`${result.lunar.toString()} ${result.lunar.getTimeInChinese()}时`} />
                <InfoRow label="上一节气" value={`${result.prevJieQi} ${result.lunar.getPrevJieQi(true).getSolar().toYmdHms()}`} />
                <InfoRow label="下一节气" value={`${result.lunar.getNextJieQi(true).getName()} ${result.lunar.getNextJieQi(true).getSolar().toYmdHms()}`} />
                <InfoRow label="马星" value={`马星${result.horse.zhi} 落${PALACE_SHORT[result.horse.palace]}宫`} valueClass="st-green" />
                <InfoRow label="月将" value={result.yueJiang} valueClass="st-red" />
              </div>
              <div>
                <InfoRow label="四柱" value={result.pillars.map((g, i) => g + '年月日时'[i]).join(' ')} valueClass="st-red" />
                <InfoRow label="旬空" value={result.xunKong.map((k) => k.join('') + '空').join(' ')} valueClass="st-blue" />
                <InfoRow label="旬首" value={result.xunShou} valueClass="st-green" />
                <InfoRow label="定局" value={`${result.dun}遁${result.ju}局（时盘）`} valueClass="st-red" />
                <InfoRow label="值符" value={`${result.zhiFu.star} 落${PALACE_SHORT[result.zhiFu.palace]}宫`} valueClass="st-red" />
                <InfoRow label="值使" value={`${result.zhiShi.door} 落${PALACE_SHORT[result.zhiShi.palace]}宫`} valueClass="st-red" />
                <InfoRow label="空亡" value={`${result.xunKong[3].join('')}空 落${result.kongPalaces.map((p) => PALACE_SHORT[p]).join('、')}宫`} valueClass="st-green" />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">阴盘奇门盘</div>
            <div className="panel-body">
              <div className="grid">
                {GRID.map((p) => <PalaceCell key={p} data={result.palaces[p]} result={result} />)}
              </div>
              <div className="legend">
                <span><span className="sw st-green">破 / 墓 / 墓刑</span> 绿色</span>
                <span><span className="sw st-red">刑</span> 红色</span>
                <span><span className="sw horse-badge">馬</span> 马星（落{PALACE_SHORT[result.horse.palace]}宫）</span>
                <span>年月日時空：该柱旬空落此宫则点亮</span>
              </div>
            </div>
          </div>
        </>
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
