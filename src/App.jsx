import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Solar } from 'lunar-javascript';
import { paipan } from './qimen/engine.js';
import XuanKong from './xuankong/XuanKong.jsx';
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
// 尋物用：九星本宮（简体，與 engine 一致）、對宮、後天八卦環（坎艮震巽離坤兌乾）
const STAR_HOME_S = { 1: '天蓬', 8: '天任', 3: '天冲', 4: '天辅', 9: '天英', 2: '天芮', 7: '天柱', 6: '天心' };
const OPP_PALACE = { 1: 9, 9: 1, 2: 8, 8: 2, 3: 7, 7: 3, 4: 6, 6: 4 };
const RING8 = [1, 8, 3, 4, 9, 2, 7, 6];

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

// AI 解讀記錄（localStorage）：以「日期時間|宮位」為 key 存檔，重開宮位可直接顯示上次結果
const AI_LIB_KEY = 'qimen_ai_library_v1';
function loadAiLib() {
  try { const v = JSON.parse(localStorage.getItem(AI_LIB_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
function persistAiLib(lib) {
  try { localStorage.setItem(AI_LIB_KEY, JSON.stringify(lib.slice(0, 200))); } catch { /* 容量滿則略過 */ }
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

// ── 九宮飛星 ─────────────────────────────────────────────
// 飛行路徑（中5→乾6→兌7→艮8→離9→坎1→坤2→震3→巽4）
const STAR_FLIGHT = [5, 6, 7, 8, 9, 1, 2, 3, 4];
// 各宮方位（風水佈局用）
const PALACE_DIR = { 1: '正北', 2: '西南', 3: '正東', 4: '東南', 5: '中宮', 6: '西北', 7: '正西', 8: '東北', 9: '正南' };
// 年飛星入中：以 2026=1 為錨，每年退一（1→9 循環），適用任意年份
function yearCenterStar(year) {
  return (((2026 - year) % 9) + 9) % 9 + 1;
}
// 回傳 { 宮位: 飛星(1-9) }
function annualStars(year) {
  const center = yearCenterStar(year);
  const map = {};
  for (let i = 0; i < 9; i++) map[STAR_FLIGHT[i]] = ((center - 1 + i) % 9) + 1;
  return map;
}
// 九星資料：五行、吉凶、掌管、催旺（吉星）/化解（凶星）
const FLYING_STAR_INFO = {
  1: { short: '一白', name: '一白貪狼星', wx: '水', ji: '吉', governs: '桃花、人緣、官貴、財運、智慧、遠行', enhance: '宜放水種植物、小魚缸、流水擺設（水），或金屬物品（金生水）催旺；忌土色過重。' },
  2: { short: '二黑', name: '二黑巨門星', wx: '土', ji: '凶', governs: '疾病、傷痛、婦女健康（病符星）', cure: '宜放六帝錢、銅葫蘆、金屬風鈴（金泄土氣）化病；忌紅色、黃色、動土、此位久坐久臥。' },
  3: { short: '三碧', name: '三碧祿存星', wx: '木', ji: '凶', governs: '是非、口舌、官非、爭執、盜竊', cure: '宜放紅色物品、燈飾（火泄木氣）化是非；忌綠色、植物過多、此位爭吵。' },
  4: { short: '四綠', name: '四綠文昌星', wx: '木', ji: '吉', governs: '文昌、學業、考試、名聲、創作、桃花', enhance: '宜放文昌塔、毛筆、四支富貴竹、水種植物（水生木）催文昌；宜作書房、書桌位。' },
  5: { short: '五黃', name: '五黃廉貞星', wx: '土', ji: '大凶', governs: '災禍、疾病、意外、破財、官非（最凶之星）', cure: '宜放六帝錢、銅鈴、銅葫蘆、金屬擺設（金泄土氣）化解；極忌紅色、黃色、動土、裝修、此位動火。宜靜不宜動。' },
  6: { short: '六白', name: '六白武曲星', wx: '金', ji: '吉', governs: '權力、地位、偏財、貴人、升遷、武職', enhance: '宜放金屬物品、白色/金色擺設、八粒白石（土生金）催旺；宜作辦公、收銀位。' },
  7: { short: '七赤', name: '七赤破軍星', wx: '金', ji: '凶', governs: '破財、盜賊、口舌、刀劍傷、是非', cure: '宜放藍色物品、一杯水、水種植物（水泄金氣）化解；忌金屬過多、白色、尖銳物。' },
  8: { short: '八白', name: '八白左輔星', wx: '土', ji: '吉', governs: '正財、置業、田產、穩定之財（當運財星）', enhance: '宜放紅色/紫色物品、燈飾、紫水晶、陶瓷（火生土）催財；保持明亮整潔，宜作財位、大門。' },
  9: { short: '九紫', name: '九紫右弼星', wx: '火', ji: '吉', governs: '喜慶、婚姻、桃花、添丁、名氣（未來當運星）', enhance: '宜放植物、紅色/紫色物品、燈飾（木生火）催喜慶；保持光亮，宜作客廳、喜位。' },
};
// 宮星五行互動 → 吉凶判斷 + 化解/催旺
function analyzeFlyingStar(palace, star) {
  const info = FLYING_STAR_INFO[star];
  const pw = PALACE_INFO[palace].wx, sw = info.wx;
  const good = info.ji === '吉';
  const pn = `${PALACE_SHORT[palace]}宮（${PALACE_DIR[palace]}，屬${pw}）`;
  let rel = '', effect = '', level = info.ji;
  if (pw === sw) {
    rel = `${pn}，與${info.name}（屬${sw}）比和同氣`;
    effect = good ? '宮星同氣，吉力增強，順遂。' : '宮星同氣，凶力增強，宜及早化解。';
  } else if (WUXING_SHENG[pw] === sw) {
    rel = `${pn}，${pw}生${sw}（宮生星）`;
    effect = good ? '宮位生扶吉星，吉上加吉，力量更盛。' : '宮位生扶凶星，凶力倍增（病上更病），務必化解。';
    if (!good) level = '大凶';
  } else if (WUXING_SHENG[sw] === pw) {
    rel = `${info.name}屬${sw}，${sw}生${pw}（星生宮）`;
    effect = good ? '星氣生宮而外泄，吉力稍減，仍屬吉。' : '凶氣生宮而外泄，凶力稍減，仍宜化解。';
  } else if (WUXING_KE[pw] === sw) {
    rel = `${pn}，${pw}剋${sw}（宮剋星）`;
    effect = good ? '吉星受宮位剋制，吉力大減，宜催旺補救。' : '凶星受宮位剋制，凶力受制減輕。';
    if (good) level = '平'; else level = '凶減';
  } else if (WUXING_KE[sw] === pw) {
    rel = `${info.name}屬${sw}，${sw}剋${pw}（星剋宮）`;
    effect = good ? '星剋宮位，星宮相戰，吉中藏憂。' : '星剋宮位，凶氣直攻，相戰更凶，務必化解。';
    if (!good) level = '大凶';
  }
  return { rel, effect, level, info };
}

// ── 月份時間（節氣月）─────────────────────────────────────
// 十二地支月以「節」為界：寅月立春起、卯月驚蟄起……子月大雪起、丑月小寒起
function branchMonths(year) {
  const tY = Solar.fromYmdHms(year, 7, 1, 12, 0, 0).getLunar().getJieQiTable();
  const tN = Solar.fromYmdHms(year + 1, 7, 1, 12, 0, 0).getLunar().getJieQiTable();
  const rows = [
    { branch: '寅', jie: '立春', start: tY['立春'], end: tY['惊蛰'] },
    { branch: '卯', jie: '驚蟄', start: tY['惊蛰'], end: tY['清明'] },
    { branch: '辰', jie: '清明', start: tY['清明'], end: tY['立夏'] },
    { branch: '巳', jie: '立夏', start: tY['立夏'], end: tY['芒种'] },
    { branch: '午', jie: '芒種', start: tY['芒种'], end: tY['小暑'] },
    { branch: '未', jie: '小暑', start: tY['小暑'], end: tY['立秋'] },
    { branch: '申', jie: '立秋', start: tY['立秋'], end: tY['白露'] },
    { branch: '酉', jie: '白露', start: tY['白露'], end: tY['寒露'] },
    { branch: '戌', jie: '寒露', start: tY['寒露'], end: tY['立冬'] },
    { branch: '亥', jie: '立冬', start: tY['立冬'], end: tY['大雪'] },
    { branch: '子', jie: '大雪', start: tY['大雪'], end: tN['小寒'] },
    { branch: '丑', jie: '小寒', start: tY['小寒'], end: tY['立春'] },
  ];
  rows.sort((a, b) => (a.start.toYmdHms() < b.start.toYmdHms() ? -1 : 1)); // 按國曆先後排序
  const fmt = (s) => s.toYmdHms().slice(5, 16); // "MM-DD HH:mm"
  return rows.map((r) => ({ branch: r.branch, jie: r.jie, start: fmt(r.start), end: fmt(r.end), startFull: r.start.toYmdHms(), endFull: r.end.toYmdHms() }));
}

// 月份時間分頁
function MonthsPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const rows = useMemo(() => branchMonths(year), [year]);
  const pad = (n) => String(n).padStart(2, '0');
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
  return (
    <div className="panel">
      <div className="panel-head">月份時間（節氣月）</div>
      <div className="panel-body">
        <div className="year-picker">
          <button type="button" onClick={() => setYear(year - 1)}>‹</button>
          <span className="year-label">{year} 年</span>
          <button type="button" onClick={() => setYear(year + 1)}>›</button>
        </div>
        <table className="month-table">
          <thead><tr><th>月份</th><th>起節</th><th>開始（國曆）</th><th>結束（國曆）</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const cur = nowStr >= r.startFull && nowStr < r.endFull;
              return (
                <tr key={r.branch} className={cur ? 'cur-month' : ''}>
                  <td className="m-branch">{r.branch}月{cur ? '（今）' : ''}</td>
                  <td>{r.jie}</td><td>{r.start}</td><td>{r.end}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="month-note">說明：命理月份以「節」為界（非農曆初一、亦非國曆初一）。如寅月由立春起、卯月由驚蟄起、子月由大雪起、丑月由小寒起。跨年的子月／丑月已標示其國曆起訖。</div>
      </div>
    </div>
  );
}

// 九宮飛星分頁
function StarsPanel() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const stars = useMemo(() => annualStars(year), [year]);
  const center = yearCenterStar(year);
  const gz = useMemo(() => Solar.fromYmdHms(year, 6, 1, 12, 0, 0).getLunar().getYearInGanZhi(), [year]);
  return (
    <div className="panel">
      <div className="panel-head">九宮飛星（{year} 年）</div>
      <div className="panel-body">
        <div className="year-picker">
          <button type="button" onClick={() => setYear(year - 1)}>‹</button>
          <span className="year-label">{year} 年（{t(gz)}年）</span>
          <button type="button" onClick={() => setYear(year + 1)}>›</button>
        </div>
        <div className="fly-summary">{year} 年立春後入{center}宮（{FLYING_STAR_INFO[center].name}入中）。下圖為各宮年飛星：</div>
        <div className="fly-grid">
          {GRID.map((p) => {
            const star = stars[p];
            const info = FLYING_STAR_INFO[star];
            const ji = info.ji === '吉' ? 'ji' : (info.ji === '大凶' ? 'daxiong' : 'xiong');
            return (
              <div key={p} className={`fly-cell ${ji}${p === 5 ? ' center' : ''}`}>
                <div className="fly-star">{star}</div>
                <div className="fly-starname">{info.short}</div>
                <div className="fly-palace">{PALACE_SHORT[p]}·{PALACE_INFO[p].wx}</div>
                <div className="fly-dir">{PALACE_DIR[p]}</div>
              </div>
            );
          })}
        </div>
        <div className="fly-legend">
          <span><span className="sw fly-ji">吉</span>吉星</span>
          <span><span className="sw fly-xiong">凶</span>凶星</span>
          <span><span className="sw fly-daxiong">大凶</span>五黃等最凶</span>
        </div>
        <div className="fly-analysis">
          {GRID.map((p) => {
            const star = stars[p];
            const a = analyzeFlyingStar(p, star);
            const good = a.info.ji === '吉';
            return (
              <div key={p} className={`fly-row ${good ? 'good' : 'bad'}`}>
                <div className="fly-row-head">
                  <span className="fly-row-title">{PALACE_SHORT[p]}宮（{PALACE_DIR[p]}）— {star} {a.info.name}</span>
                  <span className={`fly-level lv-${a.level}`}>{a.level}</span>
                </div>
                <div className="fly-row-rel">{a.rel}。{a.effect}</div>
                <div className="fly-row-gov">掌管：{a.info.governs}</div>
                <div className="fly-row-cure">{good ? '催旺：' : '化解：'}{good ? a.info.enhance : a.info.cure}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
      {/* 中宮：MO 品牌水印 */}
      {p === 5 && (
        <div className="mo-logo" aria-hidden="true">
          <img src="/mo-logo.png" alt="" className="mo-logo-img" />
        </div>
      )}
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
const AI_THEMES = ['物品', '人物', '地方', '事情', '自訂'];
function PalaceModal({ p, result, shiZhuPalace, shiGanPalace, customLabel, onSetCustom, onClose, savedAiFor, onSaveAi }) {
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

  // AI 組合解讀（呼叫 /api/interpret，key 在伺服器端）；主題：物品/人物/地方/事情/自訂
  const [theme, setTheme] = useState('物品');
  const [customTheme, setCustomTheme] = useState('');
  const [ai, setAi] = useState({ loading: false, text: (savedAiFor && savedAiFor('物品')) || '', error: '' });
  const pickTheme = (th) => { setTheme(th); setAi({ loading: false, text: (savedAiFor && savedAiFor(th)) || '', error: '' }); };
  const runAi = async () => {
    setAi({ loading: true, text: '', error: '' });
    try {
      const payload = {
        task: 'qimen',
        palace: PALACE_NAME[p],
        theme,
        custom: theme === '自訂' ? customTheme : '',
        symbols: symbols.map((s) => ({ label: s.label, name: s.name, meaning: s.info.meaning, attrs: s.info.attrs, items: s.info.items })),
      };
      const r = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `AI 解讀失敗（${r.status}）`);
      const text = (data.text || '').trim();
      setAi({ loading: false, text, error: '' });
      if (text && onSaveAi) onSaveAi(theme, text); // 存檔到記錄（按主題）
    } catch (e) {
      setAi({ loading: false, text: '', error: String((e && e.message) || e) });
    }
  };

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
            <div className="ai-block">
              <div className="ai-theme-row">
                <span className="ai-theme-label">解讀主題</span>
                <div className="ai-theme-chips">
                  {AI_THEMES.map((th) => (
                    <button key={th} type="button" className={`ai-theme-chip${theme === th ? ' active' : ''}`} onClick={() => pickTheme(th)}>{th}</button>
                  ))}
                </div>
              </div>
              {theme === '自訂' && (
                <input
                  className="ai-custom-input"
                  value={customTheme}
                  placeholder="輸入想問的主題，例：這人是誰／這地方在哪／適合什麼物品…"
                  onChange={(e) => setCustomTheme(e.target.value)}
                />
              )}
              <button type="button" className="ai-btn" onClick={runAi} disabled={ai.loading || (theme === '自訂' && !customTheme.trim())}>
                {ai.loading ? 'AI 解讀中…' : (ai.text ? `↻ 重新解讀（${theme}，已存檔）` : `✨ AI 解讀：${theme === '自訂' ? (customTheme || '自訂主題') : `組合推斷${theme}`}`)}
              </button>
              {ai.error && <div className="ai-error">{ai.error}</div>}
              {ai.text && <div className="ai-result">{ai.text}</div>}
              {ai.text && <div className="ai-saved">✓ 已按「{theme}」主題存入「AI 解讀記錄」，重開本宮會直接顯示</div>}
            </div>
            <div className="sym-combo-note">（AI 依主導屬性與各符號代表物，按所選主題創意組合，推斷本宮所指的人／事／物／地方）</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 自動尋物：時干為物、日干為事主，綜合生克/伏吟反吟/距離/符號，AI 給出判斷
const FIND_KEY = 'qimen_find_v1';
function FindItemPanel({ result, chartKey }) {
  const itemP = result.pillarMarkPalaces[3];   // 時干宮（物品）
  const querentP = result.pillarMarkPalaces[2]; // 日干宮（事主）
  const [ai, setAi] = useState({ loading: false, text: '', error: '' });
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(FIND_KEY)) || {}; setAi({ loading: false, text: v[chartKey] || '', error: '' }); } catch { setAi({ loading: false, text: '', error: '' }); }
  }, [chartKey]);

  const info = useMemo(() => {
    if (!itemP || !querentP) return null;
    const itemWx = PALACE_INFO[itemP].wx, qWx = PALACE_INFO[querentP].wx;
    let relation, ease;
    if (itemP === querentP) { relation = '兩宮同宮'; ease = '物品就在事主附近'; }
    else if (WUXING_KE[qWx] === itemWx) { relation = `事主宮(${qWx}) 剋 物品宮(${itemWx})`; ease = '容易找到'; }
    else if (WUXING_KE[itemWx] === qWx) { relation = `物品宮(${itemWx}) 剋 事主宮(${qWx})`; ease = '較難找到'; }
    else if (WUXING_SHENG[itemWx] === qWx) { relation = `物品宮(${itemWx}) 生 事主宮(${qWx})`; ease = '物品易尋回'; }
    else if (WUXING_SHENG[qWx] === itemWx) { relation = `事主宮(${qWx}) 生 物品宮(${itemWx})`; ease = '需費力尋找'; }
    else { relation = `兩宮同屬${qWx}`; ease = '吉凶不明顯（平）'; }
    const outer = [1, 2, 3, 4, 6, 7, 8, 9];
    const fuYin = outer.every((p) => (result.palaces[p].stars || [])[0] === STAR_HOME_S[p]);
    const fanYin = !fuYin && outer.every((p) => (result.palaces[p].stars || [])[0] === STAR_HOME_S[OPP_PALACE[p]]);
    const speed = fuYin ? '伏吟：主慢，需時較久' : fanYin ? '反吟：主快，較快找到' : '星已轉動：速度平常';
    const di = RING8.indexOf(itemP), dq = RING8.indexOf(querentP);
    const rd = Math.min(Math.abs(di - dq), 8 - Math.abs(di - dq));
    const distance = itemP === querentP ? '同宮（物品在事主所在地）' : rd === 1 ? '相鄰（物品不遠）' : rd === 4 ? '對宮（相隔最遠）' : `相隔 ${rd} 位`;
    const data = result.palaces[itemP];
    const symbols = [];
    const addSym = (label, name, inf) => { if (inf) symbols.push({ label, name, info: inf }); };
    addSym('宮位', PALACE_NAME[itemP], PALACE_INFO[itemP]);
    addSym('八神', t(data.god), GOD_INFO[data.god]);
    (data.stars || []).forEach((s) => addSym('九星', t(s), STAR_INFO[s]));
    addSym('八門', t(data.door), DOOR_INFO[data.door]);
    (data.tianGan || []).forEach((s) => addSym('天盤干', t(s), STEM_INFO[s]));
    [data.diGan, data.diGanExtra].filter(Boolean).forEach((s) => addSym('地盤干', t(s), STEM_INFO[s]));
    return { itemWx, qWx, relation, ease, speed, distance, symbols, fuYin, fanYin };
  }, [result, itemP, querentP]);

  if (!info) return null;
  const runAi = async () => {
    setAi({ loading: true, text: '', error: '' });
    try {
      const payload = {
        task: 'qimenFind',
        find: {
          hourGan: t(result.pillarStems[3]), dayGan: t(result.pillarStems[2]),
          item: { palace: PALACE_NAME[itemP], wx: info.itemWx, symbols: info.symbols.map((s) => ({ label: s.label, name: s.name, meaning: s.info.meaning, attrs: s.info.attrs, items: s.info.items })) },
          querent: { palace: PALACE_NAME[querentP], wx: info.qWx },
          relation: info.relation, ease: info.ease, speed: info.speed, distance: info.distance,
        },
      };
      const r = await fetch('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `AI 分析失敗（${r.status}）`);
      const text = (data.text || '').trim();
      setAi({ loading: false, text, error: '' });
      if (text) { try { const v = JSON.parse(localStorage.getItem(FIND_KEY)) || {}; v[chartKey] = text; localStorage.setItem(FIND_KEY, JSON.stringify(v)); } catch { } }
    } catch (e) { setAi({ loading: false, text: '', error: String((e && e.message) || e) }); }
  };

  const dirOf = (p) => PALACE_INFO[p].meaning.split('、')[0];
  return (
    <details className="panel collapsible find-panel" open>
      <summary className="panel-head">自動尋物（時干為物・日干為事主）</summary>
      <div className="panel-body">
        <div className="find-grid">
          <div className="find-row"><span className="find-k">物品（時干 {t(result.pillarStems[3])}）</span><span className="find-v">{PALACE_NAME[itemP]}・{dirOf(itemP)}・屬{info.itemWx}</span></div>
          <div className="find-row"><span className="find-k">事主（日干 {t(result.pillarStems[2])}）</span><span className="find-v">{PALACE_NAME[querentP]}・{dirOf(querentP)}・屬{info.qWx}</span></div>
          <div className="find-row"><span className="find-k">生克</span><span className="find-v">{info.relation} → <b className="find-ease">{info.ease}</b></span></div>
          <div className="find-row"><span className="find-k">快慢</span><span className="find-v">{info.speed}</span></div>
          <div className="find-row"><span className="find-k">距離</span><span className="find-v">{info.distance}</span></div>
        </div>
        <button type="button" className="ai-btn" onClick={runAi} disabled={ai.loading}>
          {ai.loading ? 'AI 分析中…' : (ai.text ? '↻ 重新分析（已存檔）' : '✨ AI 尋物分析（方位＋可能地點）')}
        </button>
        {ai.error && <div className="ai-error">{ai.error}</div>}
        {ai.text && <div className="ai-result">{ai.text}</div>}
        {ai.text && <div className="ai-saved">✓ 已存檔（本盤），重整頁面亦保留</div>}
      </div>
    </details>
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
  // AI 解讀記錄（library）：localStorage 持久化，重開宮位/重整頁面都保留
  const [aiLib, setAiLib] = useState(loadAiLib);
  // 目前盤的識別（用日期時間）；同一盤同一宮的解讀會覆蓋更新
  const chartKey = submitted ? `${submitted.year}-${submitted.month}-${submitted.day} ${String(submitted.hour).padStart(2, '0')}:${String(submitted.minute).padStart(2, '0')}` : '';
  const savedAiFor = (p, theme) => { const r = aiLib.find((x) => x.key === `${chartKey}|${p}|${theme}`); return r ? r.text : null; };
  const saveAiReading = (p, theme, text) => {
    const key = `${chartKey}|${p}|${theme}`;
    setAiLib((lib) => {
      const next = lib.filter((x) => x.key !== key);
      next.unshift({ key, datetime: chartKey, palace: p, palaceName: PALACE_NAME[p], theme, text, ts: Date.now() });
      persistAiLib(next);
      return next;
    });
  };
  const deleteAiReading = (key) => setAiLib((lib) => { const next = lib.filter((x) => x.key !== key); persistAiLib(next); return next; });
  const clearAiLib = () => { persistAiLib([]); setAiLib([]); };
  // 分頁：排盤 / 月份時間 / 九宮飛星
  const [tab, setTab] = useState('chart');
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
    const raf = requestAnimationFrame(recompute);
    const tm = setTimeout(recompute, 250); // 手機上等佈局穩定後再量一次，避免五行生克箭頭位移
    window.addEventListener('resize', recompute);
    return () => { cancelAnimationFrame(raf); clearTimeout(tm); window.removeEventListener('resize', recompute); };
  }, [recompute, result, showWuxing, shiZhuPalace, shiGanPalace, customMarks]);

  // 需標生克的關鍵宮位（事主、時干、自訂標記）
  const keyPalaces = useMemo(() => {
    const set = new Set();
    if (shiZhuPalace) set.add(shiZhuPalace);
    if (shiGanPalace) set.add(shiGanPalace);
    Object.keys(customMarks).forEach((p) => set.add(+p));
    return [...set];
  }, [shiZhuPalace, shiGanPalace, customMarks]);

  // 生克配對數（用於動態加大外圈 padding，讓每條箭頭有獨立環道）
  const wxPairCount = useMemo(() => {
    let n = 0;
    for (let i = 0; i < keyPalaces.length; i++)
      for (let j = i + 1; j < keyPalaces.length; j++)
        if (wxRelation(PALACE_INFO[keyPalaces[i]].wx, PALACE_INFO[keyPalaces[j]].wx)) n++;
    return n;
  }, [keyPalaces]);

  // 五行生克：每宮一個五行點 + 兩兩之間的生克箭頭。
  // 箭頭走「直角周邊路線」，且每條箭頭用「獨立同心環道」（不同半徑），同宮多線再橫向錯開，避免互相重疊。
  const wxData = useMemo(() => {
    const empty = { dots: [], arrows: [] };
    if (!showWuxing || !measure.grid) return empty;
    const g = measure.grid;
    const AO = 14;   // 五行點距格線
    const DR = 14;   // 箭頭停在五行點邊緣
    const R0 = 26;   // 最內環半徑
    const SP = 12;   // 環道間距
    const OFF = 12;  // 同宮多線的橫向錯開
    const eps = 1e-6;

    const edgeOf = (p) => (p === 4 || p === 9 || p === 2) ? 'top' : (p === 8 || p === 1 || p === 6) ? 'bottom' : (p === 3) ? 'left' : (p === 7) ? 'right' : null;

    // 建立所有生克箭頭（from=作用方，to=被作用方）
    const raw = [];
    for (let i = 0; i < keyPalaces.length; i++) {
      for (let j = i + 1; j < keyPalaces.length; j++) {
        const A = keyPalaces[i], B = keyPalaces[j];
        const rel = wxRelation(PALACE_INFO[A].wx, PALACE_INFO[B].wx);
        if (!rel) continue;
        raw.push({
          from: rel.swap ? B : A, to: rel.swap ? A : B,
          fromWx: rel.swap ? PALACE_INFO[B].wx : PALACE_INFO[A].wx,
          toWx: rel.swap ? PALACE_INFO[A].wx : PALACE_INFO[B].wx,
          type: rel.type,
        });
      }
    }
    // 路徑長者排外環（用宮位中心曼哈頓距估算），每條一個獨立半徑
    const arrows = raw.map((a) => {
      const cf = measure.centers[a.from], ct = measure.centers[a.to];
      const dist = (cf && ct) ? Math.abs(cf.x - ct.x) + Math.abs(cf.y - ct.y) : 0;
      return { ...a, dist };
    }).sort((x, y) => y.dist - x.dist).map((a, k) => ({ ...a, ring: R0 + k * SP }));

    // 五行點（每宮一點，位於宮位正外緣，不錯開）
    const dots = keyPalaces.map((p) => {
      const c = measure.centers[p];
      if (!c) return null;
      const e = edgeOf(p);
      let x, y;
      if (e === 'top') { x = c.x; y = g.t - AO; } else if (e === 'bottom') { x = c.x; y = g.b + AO; }
      else if (e === 'left') { x = g.l - AO; y = c.y; } else { x = g.r + AO; y = c.y; }
      return { p, x, y, wx: PALACE_INFO[p].wx };
    }).filter(Boolean);

    // 同宮多線的錯開計數
    const connCount = {};
    arrows.forEach((a) => { connCount[a.from] = (connCount[a.from] || 0) + 1; connCount[a.to] = (connCount[a.to] || 0) + 1; });
    const connSeen = {};
    // 連接點（含錯開）：回傳該宮在此環道上的 外緣點(ax,ay) 與 環點(rx,ry)
    const conn = (p, rr) => {
      const c = measure.centers[p];
      if (!c) return null;
      const e = edgeOf(p);
      const idx = connSeen[p] || 0;
      const n = connCount[p] || 1;
      const delta = (idx - (n - 1) / 2) * OFF;
      connSeen[p] = idx + 1;
      if (e === 'top') { const x = c.x + delta; return { ax: x, ay: g.t - AO, rx: x, ry: g.t - rr, ix: 0, iy: 1, edge: e }; }
      if (e === 'bottom') { const x = c.x + delta; return { ax: x, ay: g.b + AO, rx: x, ry: g.b + rr, ix: 0, iy: -1, edge: e }; }
      if (e === 'left') { const y = c.y + delta; return { ax: g.l - AO, ay: y, rx: g.l - rr, ry: y, ix: 1, iy: 0, edge: e }; }
      const y = c.y + delta; return { ax: g.r + AO, ay: y, rx: g.r + rr, ry: y, ix: -1, iy: 0, edge: e };
    };

    const out = [];
    arrows.forEach((a) => {
      const rr = a.ring;
      const ring = { l: g.l - rr, r: g.r + rr, t: g.t - rr, b: g.b + rr };
      const W = ring.r - ring.l, H = ring.b - ring.t, total = 2 * (W + H);
      const corners = [{ x: ring.l, y: ring.t }, { x: ring.r, y: ring.t }, { x: ring.r, y: ring.b }, { x: ring.l, y: ring.b }];
      const sCorner = [0, W, W + H, 2 * W + H];
      const from = conn(a.from, rr);
      const to = conn(a.to, rr);
      if (!from || !to) return;
      const sOf = (L) => (L.edge === 'top' ? L.rx - ring.l : L.edge === 'right' ? W + (L.ry - ring.t) : L.edge === 'bottom' ? W + H + (ring.r - L.rx) : W + H + W + (ring.b - L.ry));
      const sA = sOf(from), sB = sOf(to);
      const cw = (sB - sA + total) % total;
      const dir = cw < total - cw ? 'cw' : 'ccw';
      const dist = dir === 'cw' ? cw : total - cw;
      const via = [];
      for (let m = 0; m < 4; m++) {
        const dc = dir === 'cw' ? (sCorner[m] - sA + total) % total : (sA - sCorner[m] + total) % total;
        if (dc > eps && dc < dist - eps) via.push({ d: dc, pt: corners[m] });
      }
      via.sort((x, y) => x.d - y.d);

      const start = { x: from.ax - from.ix * DR, y: from.ay - from.iy * DR };
      const end = { x: to.ax - to.ix * DR, y: to.ay - to.iy * DR };
      const pts = [start, { x: from.rx, y: from.ry }, ...via.map((v) => v.pt), { x: to.rx, y: to.ry }, end];
      const d = pts.map((pt, k) => (k === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`)).join(' ');

      // 標籤：外環旅程的弧長中點
      const ringPts = [{ x: from.rx, y: from.ry }, ...via.map((v) => v.pt), { x: to.rx, y: to.ry }];
      const lens = [0];
      for (let k = 1; k < ringPts.length; k++) lens.push(lens[k - 1] + Math.hypot(ringPts[k].x - ringPts[k - 1].x, ringPts[k].y - ringPts[k - 1].y));
      const half = lens[lens.length - 1] / 2;
      let lx = ringPts[0].x, ly = ringPts[0].y;
      for (let k = 1; k < ringPts.length; k++) {
        if (lens[k] >= half) {
          const tt = (half - lens[k - 1]) / ((lens[k] - lens[k - 1]) || 1);
          lx = ringPts[k - 1].x + (ringPts[k].x - ringPts[k - 1].x) * tt;
          ly = ringPts[k - 1].y + (ringPts[k].y - ringPts[k - 1].y) * tt;
          break;
        }
      }
      out.push({ d, lx, ly, type: a.type, label: `${a.fromWx}${a.type}${a.toWx}` });
    });
    return { dots, arrows: out };
  }, [showWuxing, keyPalaces, measure]);

  // 動態外圈 padding：環道越多，外圈越大，讓箭頭不進九宮格也不壓外干
  const wxPadding = Math.max(46, 26 + Math.max(0, wxPairCount - 1) * 12 + 20);

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
      <h1 className="title">MO易學</h1>
      <div className="subtitle">陰盤奇門 · 九宮飛星 · 玄空飛星</div>

      <div className="tabs">
        <button type="button" className={`tab${tab === 'chart' ? ' active' : ''}`} onClick={() => setTab('chart')}>陰盤奇門</button>
        <button type="button" className={`tab${tab === 'months' ? ' active' : ''}`} onClick={() => setTab('months')}>月份時間</button>
        <button type="button" className={`tab${tab === 'stars' ? ' active' : ''}`} onClick={() => setTab('stars')}>九宮飛星</button>
        <button type="button" className={`tab${tab === 'xuankong' ? ' active' : ''}`} onClick={() => setTab('xuankong')}>玄空飛星</button>
      </div>

      {tab === 'months' && <MonthsPanel />}
      {tab === 'stars' && <StarsPanel />}
      {tab === 'xuankong' && <XuanKong />}

      {tab === 'chart' && (<>
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
              <div className={`grid-wrap${showWuxing ? ' wx-on' : ''}`} ref={wrapRef} style={showWuxing ? { padding: `${wxPadding}px` } : undefined}>
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
                      <marker id="wxSheng" markerUnits="userSpaceOnUse" markerWidth="15" markerHeight="15" refX="11" refY="7.5" orient="auto"><path d="M1,1 L13,7.5 L1,14 Z" fill="#2e7d32" stroke="#fff" strokeWidth="1.2" /></marker>
                      <marker id="wxKe" markerUnits="userSpaceOnUse" markerWidth="15" markerHeight="15" refX="11" refY="7.5" orient="auto"><path d="M1,1 L13,7.5 L1,14 Z" fill="#c62828" stroke="#fff" strokeWidth="1.2" /></marker>
                    </defs>
                    {wxData.arrows.map((a, i) => (
                      <g key={i} className={`wx-arrow ${a.type === '生' ? 'sheng' : 'ke'}`}>
                        <path d={a.d} fill="none" markerEnd={`url(#${a.type === '生' ? 'wxSheng' : 'wxKe'})`} />
                        <text x={a.lx} y={a.ly} className="wx-label">{a.label}</text>
                      </g>
                    ))}
                    {wxData.dots.map((dt) => (
                      <g key={'wx' + dt.p} className={`wx-dot wxx-${dt.wx}`}>
                        <circle cx={dt.x} cy={dt.y} r="11" />
                        <text x={dt.x} y={dt.y}>{dt.wx}</text>
                      </g>
                    ))}
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

          <FindItemPanel result={result} chartKey={chartKey} />

          <details className="panel collapsible ai-hist-panel">
            <summary className="panel-head">AI 解讀記錄{aiLib.length ? `（${aiLib.length}）` : ''}</summary>
            <div className="panel-body">
              {aiLib.length === 0 && (
                <div className="ai-hist-empty">暫無記錄。點入宮位 → 按「AI 解讀」後會自動存檔；重開同一宮會直接顯示上次結果，重整頁面亦保留。</div>
              )}
              {aiLib.map((r) => (
                <details key={r.key} className="ai-hist-item">
                  <summary className="ai-hist-head">
                    <span className="ai-hist-palace">{r.palaceName}</span>
                    {r.theme && <span className="ai-hist-theme">{r.theme}</span>}
                    <span className="ai-hist-date">{r.datetime}</span>
                  </summary>
                  <div className="ai-hist-body">
                    <div className="ai-hist-text">{r.text}</div>
                    <button type="button" className="ai-hist-del" onClick={() => deleteAiReading(r.key)}>刪除此則</button>
                  </div>
                </details>
              ))}
              {aiLib.length > 0 && (
                <button type="button" className="ai-hist-clear" onClick={clearAiLib}>清空全部記錄</button>
              )}
            </div>
          </details>

          {selected != null && (
            <PalaceModal
              key={selected}
              p={selected}
              result={result}
              shiZhuPalace={shiZhuPalace}
              shiGanPalace={shiGanPalace}
              customLabel={customMarks[selected]}
              onSetCustom={setCustom}
              onClose={() => setSelected(null)}
              savedAiFor={(theme) => savedAiFor(selected, theme)}
              onSaveAi={(theme, text) => saveAiReading(selected, theme, text)}
            />
          )}
        </ErrorBoundary>
      )}
      </>)}
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
