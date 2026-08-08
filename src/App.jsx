import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { paipan } from './qimen/engine.js';
import { DOOR_INFO, STAR_INFO, GOD_INFO, STEM_INFO, PALACE_INFO, WUXING_SHENG, WUXING_KE } from './qimen/symbols.js';

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

// 事主宮位：
// 近程（求測人在現場）→ 直接以「日干」落天盤之宮為事主（不需性別）。
// 遠程 → 開盤人看日干、問事人看月干；開盤人與問事人「不同性別」用月干直接落宮，
//         「同性別」則月干換陰陽（同五行異陰陽，如癸→壬）後落宮。
function computeShiZhu(result, querent) {
  if (!result) return null;
  if (querent.mode === '近程') return result.pillarMarkPalaces[2]; // 日干（甲遁旬首儀）落天盤之宮
  if (!querent.caster || !querent.querent) return null; // 遠程需先設定開盤人與問事人性別
  let stem = result.pillarStems[1]; // 月干（甲遁旬首儀）
  if (querent.caster === querent.querent) stem = YINYANG_SWAP[stem]; // 同性別 → 換陰陽
  if (stem === '甲') return result.zhiFu.palace; // 甲為旬首，以值符所落之宮論
  for (const p of [1, 2, 3, 4, 6, 7, 8, 9]) {
    if ((result.palaces[p].tianGan || []).includes(stem)) return p;
  }
  return null;
}

// 兩五行的生克關係：回傳 { from, to, type:'生'|'克' }；相同五行（比和）回傳 null
function wxRelation(wxA, wxB) {
  if (!wxA || !wxB || wxA === wxB) return null;
  if (WUXING_SHENG[wxA] === wxB) return { type: '生' }; // A生B
  if (WUXING_SHENG[wxB] === wxA) return { type: '生', swap: true }; // B生A
  if (WUXING_KE[wxA] === wxB) return { type: '克' }; // A克B
  if (WUXING_KE[wxB] === wxA) return { type: '克', swap: true }; // B克A
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

function PalaceCell({ data, result, shiZhu, shiGan, customLabel, onSelect }) {
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
    <div data-palace={p} className={`cell clickable${p === 5 ? ' center' : ''}${shiZhu ? ' shizhu-cell' : ''}`} onClick={onSelect} title="點擊查看本宮符號象意">
      {/* 年月日時：左上，竖排（各柱天干落天盤之宮） */}
      <div className="kong-panel">
        {PILLAR_LABELS.map((lab, i) => (pillarMarks[i] ? <span key={lab} className="kong-box on">{lab}</span> : null))}
      </div>
      {/* 右上：事主 / 時干 / 自訂標記 + 空亡小圈（直排堆疊） */}
      <div className="tr-panel">
        {shiZhu && <span className="mk-badge mk-shizhu">事主</span>}
        {shiGan && <span className="mk-badge mk-shigan">時干</span>}
        {customLabel && <span className="mk-badge mk-custom">{customLabel}</span>}
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
function PalaceModal({ p, result, shiZhuPalace, shiGanPalace, customLabel, onSetCustom, onClose }) {
  const data = result.palaces[p];
  if (!data) return null;
  const diStems = [data.diGan, data.diGanExtra].filter(Boolean);
  // 本宮標記
  const tags = [];
  PILLAR_LABELS.forEach((lab, i) => { if (result.pillarMarkPalaces[i] === p) tags.push(lab + '柱'); });
  if (result.horse.palace === p) tags.push('馬星');
  if (result.kongPalaces.includes(p)) tags.push('空亡');
  if (shiZhuPalace === p) tags.push('事主');
  if (shiGanPalace === p) tags.push('時干');
  if (customLabel) tags.push('自訂：' + customLabel);
  if (data.menpo) tags.push('門迫');
  (data.marks || []).forEach((m) => tags.push(t(m)));

  // 本宮所有符號（含來源），供組合類象分組顯示
  const symbols = [];
  const addSym = (label, name, info) => { if (info) symbols.push({ label, name, info }); };
  addSym('宮位', PALACE_NAME[p], PALACE_INFO[p]);
  addSym('八神', t(data.god), GOD_INFO[data.god]);
  (data.stars || []).forEach((s) => addSym('九星', t(s), STAR_INFO[s]));
  addSym('八門', t(data.door), DOOR_INFO[data.door]);
  (data.tianGan || []).forEach((s) => addSym('天盤干', t(s), STEM_INFO[s]));
  diStems.forEach((s) => addSym('地盤干', t(s), STEM_INFO[s]));

  // 屬性頻率：某屬性被越多符號共有，越是本宮組合的主軸（多數屬性）
  const attrCount = {};
  symbols.forEach((sym) => (sym.info.attrs || []).forEach((a) => { attrCount[a] = (attrCount[a] || 0) + 1; }));
  const attrList = Object.entries(attrCount).sort((a, b) => b[1] - a[1]);

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
          {/* 自訂標記：為本宮加上自己的註解（截圖分享解盤用） */}
          <div className="custom-mark">
            <span className="custom-mark-label">自訂標記</span>
            <input
              className="custom-mark-input"
              value={customLabel || ''}
              placeholder="例：問財運、對方、房子…"
              onChange={(e) => onSetCustom(p, e.target.value)}
            />
            {customLabel ? <button type="button" className="custom-mark-clear" onClick={() => onSetCustom(p, '')}>清除</button> : null}
          </div>

          <SymbolRow label="宮位" name={PALACE_NAME[p]} info={PALACE_INFO[p]} />
          <SymbolRow label="八神" name={t(data.god)} info={GOD_INFO[data.god]} />
          {(data.stars || []).map((s, i) => <SymbolRow key={'star' + i} label="九星" name={t(s)} info={STAR_INFO[s]} />)}
          <SymbolRow label="八門" name={t(data.door)} info={DOOR_INFO[data.door]} tagExtra={data.menpo ? <span className="sym-tag ji-xiong">門迫</span> : null} />
          {(data.tianGan || []).map((s, i) => <SymbolRow key={'tg' + i} label="天盤干" name={t(s)} info={STEM_INFO[s]} />)}
          {diStems.map((s, i) => <SymbolRow key={'dg' + i} label="地盤干" name={t(s)} info={STEM_INFO[s]} />)}

          <div className="sym-combo">
            <div className="sym-combo-head">本宮符號組合類象</div>
            {attrList.length > 0 && (
              <div className="attr-block">
                <div className="attr-head">主導屬性（×2 以上為多個符號共有，是組合主軸）</div>
                <div className="attr-list">
                  {attrList.map(([a, c]) => (
                    <span key={a} className={`attr-chip${c >= 2 ? ' hot' : ''}`}>{a}{c >= 2 ? ` ×${c}` : ''}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="combo-groups">
              {symbols.map((sym, i) => (
                <div key={i} className="combo-group">
                  <div className="combo-group-head">
                    <span className="combo-group-label">{sym.label}</span>
                    <span className="combo-group-name">{sym.name}</span>
                  </div>
                  <div className="sym-items">
                    {(sym.info.items || []).map((it, j) => <span key={j} className="sym-item combo">{it}</span>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="sym-combo-note">（日後可接 AI 模型，依主導屬性與各符號代表物，自動組合推斷本宮所指的人事物）</div>
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
  // 時干（時柱天干）落天盤之宮 → 標「時干」
  const shiGanPalace = result ? result.pillarMarkPalaces[3] : null;
  // 點擊宮位查看各符號象意
  const [selected, setSelected] = useState(null);
  // 自訂宮位標記 { 宮位: 文字 }（截圖分享解盤用）
  const [customMarks, setCustomMarks] = useState({});
  const setCustom = (p, text) => setCustomMarks((m) => {
    const next = { ...m };
    if (text && text.trim()) next[p] = text.trim(); else delete next[p];
    return next;
  });
  // 五行生克外圈顯示開關
  const [showWuxing, setShowWuxing] = useState(false);

  // 量測各宮中心與九宮格範圍（供外圈生克箭頭定位）
  const wrapRef = useRef(null);
  const [measure, setMeasure] = useState({ centers: {}, grid: null, w: 0, h: 0 });
  const recompute = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wb = wrap.getBoundingClientRect();
    const centers = {};
    wrap.querySelectorAll('.cell[data-palace]').forEach((el) => {
      const b = el.getBoundingClientRect();
      centers[+el.dataset.palace] = { x: b.left + b.width / 2 - wb.left, y: b.top + b.height / 2 - wb.top };
    });
    const gridEl = wrap.querySelector('.grid');
    let grid = null;
    if (gridEl) {
      const gb = gridEl.getBoundingClientRect();
      grid = { l: gb.left - wb.left, t: gb.top - wb.top, r: gb.right - wb.left, b: gb.bottom - wb.top, cx: gb.left + gb.width / 2 - wb.left, cy: gb.top + gb.height / 2 - wb.top };
    }
    setMeasure({ centers, grid, w: wb.width, h: wb.height });
  }, []);
  useEffect(() => {
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute, result, showWuxing, shiZhuPalace, shiGanPalace, customMarks]);

  // 需標生克的關鍵宮位（事主、時干、自訂標記）
  const keyPalaces = useMemo(() => {
    const set = new Set();
    if (shiZhuPalace) set.add(shiZhuPalace);
    if (shiGanPalace) set.add(shiGanPalace);
    Object.keys(customMarks).forEach((p) => set.add(+p));
    return [...set];
  }, [shiZhuPalace, shiGanPalace, customMarks]);

  // 各關鍵宮位在格外圈的錨點 + 兩兩之間的生克箭頭（弧形繞外圈，不進九宮格內）
  const wxData = useMemo(() => {
    const empty = { anchors: {}, arrows: [] };
    if (!showWuxing || !measure.grid) return empty;
    const g = measure.grid;
    const anchorFor = (p) => {
      const c = measure.centers[p];
      if (!c) return null;
      let dx = c.x - g.cx, dy = c.y - g.cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const m = 12; // 外推至格外圈
      const l = g.l - m, r = g.r + m, tp = g.t - m, bt = g.b + m;
      let tt = Infinity;
      if (dx > 1e-6) tt = Math.min(tt, (r - g.cx) / dx);
      if (dx < -1e-6) tt = Math.min(tt, (l - g.cx) / dx);
      if (dy > 1e-6) tt = Math.min(tt, (bt - g.cy) / dy);
      if (dy < -1e-6) tt = Math.min(tt, (tp - g.cy) / dy);
      if (!isFinite(tt)) tt = 0;
      return { x: g.cx + dx * tt, y: g.cy + dy * tt };
    };
    const anchors = {};
    keyPalaces.forEach((p) => { const a = anchorFor(p); if (a) anchors[p] = a; });
    const arrows = [];
    for (let i = 0; i < keyPalaces.length; i++) {
      for (let j = i + 1; j < keyPalaces.length; j++) {
        const A = keyPalaces[i], B = keyPalaces[j];
        const a = anchors[A], b = anchors[B];
        if (!a || !b) continue;
        const rel = wxRelation(PALACE_INFO[A].wx, PALACE_INFO[B].wx);
        if (!rel) continue; // 比和不畫
        const from = rel.swap ? b : a;
        const to = rel.swap ? a : b;
        const fromWx = rel.swap ? PALACE_INFO[B].wx : PALACE_INFO[A].wx;
        const toWx = rel.swap ? PALACE_INFO[A].wx : PALACE_INFO[B].wx;
        // 控制點：推到格線外的 padding 環（弧線繞外圈，不進九宮格、不超出 wrap）
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const ox = mid.x - g.cx, oy = mid.y - g.cy;
        const olen = Math.hypot(ox, oy);
        const ring = 22; // 推出格線外的距離
        let ctrl;
        if (olen > 1) { // 相鄰/斜對：沿「遠離盤心」方向推出格線外
          const ux = ox / olen, uy = oy / olen;
          let tEdge = Infinity;
          if (ux > 1e-6) tEdge = Math.min(tEdge, (g.r - mid.x) / ux);
          if (ux < -1e-6) tEdge = Math.min(tEdge, (g.l - mid.x) / ux);
          if (uy > 1e-6) tEdge = Math.min(tEdge, (g.b - mid.y) / uy);
          if (uy < -1e-6) tEdge = Math.min(tEdge, (g.t - mid.y) / uy);
          if (!isFinite(tEdge) || tEdge < 0) tEdge = 0;
          ctrl = { x: mid.x + ux * (tEdge + ring), y: mid.y + uy * (tEdge + ring) };
        } else { // 對宮（中點≈盤心）：繞側邊格外
          const px = -(to.y - from.y), py = (to.x - from.x);
          const plen = Math.hypot(px, py) || 1;
          const ux = px / plen, uy = py / plen;
          const tEdge = (Math.abs(ux) > Math.abs(uy) ? (g.cx - g.l) : (g.cy - g.t)) + ring;
          ctrl = { x: mid.x + ux * tEdge, y: mid.y + uy * tEdge };
        }
        arrows.push({
          from, to, ctrl, type: rel.type,
          lx: (from.x + 2 * ctrl.x + to.x) / 4,
          ly: (from.y + 2 * ctrl.y + to.y) / 4,
          label: `${fromWx}${rel.type}${toWx}`,
        });
      }
    }
    return { anchors, arrows };
  }, [showWuxing, keyPalaces, measure]);

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
                <span className="q-result">
                  {shiZhuPalace
                    ? `事主落 ${PALACE_SHORT[shiZhuPalace]}宮（${querent.mode}）`
                    : (querent.mode === '遠程' ? '設定開盤人與問事人性別後顯示事主' : '')}
                </span>
                <button type="button" className={`wx-toggle${showWuxing ? ' on' : ''}`} onClick={() => setShowWuxing((v) => !v)}>
                  五行生克{showWuxing ? '·顯示' : '·隱藏'}
                </button>
              </div>
              <div className={`grid-wrap${showWuxing ? ' wx-on' : ''}`} ref={wrapRef}>
                <div className="grid">
                  {GRID.map((p) => (
                    <PalaceCell
                      key={p}
                      data={result.palaces[p]}
                      result={result}
                      shiZhu={p === shiZhuPalace}
                      shiGan={p === shiGanPalace}
                      customLabel={customMarks[p]}
                      onSelect={() => setSelected(p)}
                    />
                  ))}
                </div>
                {/* 外干（隐干）：贴各宮外側方位；中五宮外干寄 waiganJiGong 宮並列 */}
                {[4, 9, 2, 3, 7, 8, 1, 6].map((p) => (
                  <span key={p} className={`waigan wg-${WAIGAN_POS[p].edge}`} style={WAIGAN_POS[p].style}>
                    {t(result.waigan[p])}
                    {p === result.waiganJiGong && <span className="waigan-ji">{t(result.waiganCenter)}</span>}
                  </span>
                ))}
                {/* 五行生克：外圈弧形箭頭（事主／時干／自訂標記之間），不進九宮格內 */}
                {showWuxing && measure.grid && (
                  <svg className="wx-overlay" width={measure.w} height={measure.h} viewBox={`0 0 ${measure.w} ${measure.h}`}>
                    <defs>
                      <marker id="wxSheng" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L8,4.5 L0,9 Z" fill="#2e7d32" /></marker>
                      <marker id="wxKe" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L8,4.5 L0,9 Z" fill="#c62828" /></marker>
                    </defs>
                    {wxData.arrows.map((a, i) => (
                      <g key={i} className={`wx-arrow ${a.type === '生' ? 'sheng' : 'ke'}`}>
                        <path d={`M ${a.from.x} ${a.from.y} Q ${a.ctrl.x} ${a.ctrl.y} ${a.to.x} ${a.to.y}`} fill="none" markerEnd={`url(#${a.type === '生' ? 'wxSheng' : 'wxKe'})`} />
                        <text x={a.lx} y={a.ly} className="wx-label">{a.label}</text>
                      </g>
                    ))}
                    {keyPalaces.map((p) => {
                      const a = wxData.anchors[p];
                      if (!a) return null;
                      const wx = PALACE_INFO[p].wx;
                      return (
                        <g key={'wx' + p} className={`wx-dot wxx-${wx}`}>
                          <circle cx={a.x} cy={a.y} r="11" />
                          <text x={a.x} y={a.y}>{wx}</text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
              <div className="legend">
                <span><span className="sw mk-green">破</span>＝門迫（綠）</span>
                <span><span className="sw mk-red">刑</span>＝擊刑（紅）</span>
                <span><span className="sw mk-grey">墓</span>＝入墓（灰）</span>
                <span><span className="sw mk-purple">墓刑</span>＝入墓+擊刑（紫）</span>
                <span><span className="sw horse-badge">馬</span> 馬星（落{PALACE_SHORT[result.horse.palace]}宮）</span>
                <span>外圈干＝外干（隐干）</span>
                <span><span className="sw mk-badge mk-shizhu">事主</span>（紅）</span>
                <span><span className="sw mk-badge mk-shigan">時干</span>（藍）</span>
                <span><span className="sw mk-badge mk-custom">註</span>自訂（綠）</span>
                <span className="legend-tip">點擊宮位看象意＋自訂標記</span>
              </div>
            </div>
          </div>

          {selected != null && (
            <PalaceModal
              p={selected}
              result={result}
              shiZhuPalace={shiZhuPalace}
              shiGanPalace={shiGanPalace}
              customLabel={customMarks[selected]}
              onSetCustom={setCustom}
              onClose={() => setSelected(null)}
            />
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
