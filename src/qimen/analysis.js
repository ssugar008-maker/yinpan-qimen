// 奇門問事分析的共用邏輯（從 App.jsx 抽出，AskPanel 與 AI 對話分頁共用，保證分析口徑一致）
// 純函數，可獨立測試。內部值沿用引擎簡體，顯示用 t() 轉繁體。
import { DOOR_INFO, STAR_INFO, GOD_INFO, STEM_INFO, PALACE_INFO } from './symbols.js';
import { shiZhuStem, loveYongShen, detectFuFan, kongShift, palaceRelation, findFacts, CUSTOM_CATS } from './ask.js';

// ---- 简体→繁体（本盘用到的字） ----
const S2T = {
  '门': '門', '冲': '衝', '辅': '輔', '阴': '陰', '阳': '陽', '时': '時', '盘': '盤', '历': '曆',
  '马': '馬', '将': '將', '节': '節', '气': '氣', '农': '農', '别': '別', '当': '當', '间': '間',
  '伤': '傷', '惊': '驚', '开': '開', '龙': '龍', '岁': '歲', '满': '滿', '贵': '貴', '选': '選',
};
export const t = (s) => (s == null ? '' : String(s).split('').map((c) => S2T[c] || c).join(''));

export const PALACE_NAME = {
  1: '坎一宮', 2: '坤二宮', 3: '震三宮', 4: '巽四宮', 5: '中五宮',
  6: '乾六宮', 7: '兌七宮', 8: '艮八宮', 9: '離九宮',
};
export const PALACE_SHORT = {
  1: '坎一', 2: '坤二', 3: '震三', 4: '巽四', 5: '中五',
  6: '乾六', 7: '兌七', 8: '艮八', 9: '離九',
};

// 標記配色（與主盤一致）：破=綠 刑=紅 墓=灰 墓刑=紫；其餘黑色
export function stemMarkClass(type) {
  if (type === '刑') return 'mk-red';
  if (type === '墓') return 'mk-grey';
  if (type === '刑墓') return 'mk-purple';
  return '';
}
export function palaceMarkClass(m) {
  if (m === '破') return 'mk-green';
  if (m === '刑') return 'mk-red';
  if (m === '墓') return 'mk-grey';
  if (m === '墓刑') return 'mk-purple';
  return '';
}

// 本宮所有符號（含來源），供組合類象分組顯示與 AI 取用
export function buildPalaceSymbols(p, result) {
  const data = result.palaces[p];
  if (!data) return [];
  const symbols = [];
  const addSym = (label, name, info) => { if (info) symbols.push({ label, name, info }); };
  addSym('宮位', PALACE_NAME[p], PALACE_INFO[p]);
  addSym('八神', t(data.god), GOD_INFO[data.god]);
  (data.stars || []).forEach((s) => addSym('九星', t(s), STAR_INFO[s]));
  addSym('八門', t(data.door), DOOR_INFO[data.door]);
  (data.tianGan || []).forEach((s) => addSym('天盤干', t(s), STEM_INFO[s]));
  [data.diGan, data.diGanExtra].filter(Boolean).forEach((s) => addSym('地盤干', t(s), STEM_INFO[s]));
  return symbols;
}

// 宮位狀態標籤（門迫／擊刑／入墓／空亡／馬星／值符值使／事主／時干）
export function palaceMarkLabels(p, result, shiZhuPalace, shiGanPalace) {
  const data = result.palaces[p];
  if (!data) return [];
  const marks = [];
  (data.marks || []).forEach((m) => marks.push({ 破: '門迫', 刑: '擊刑', 墓: '入墓', 墓刑: '入墓擊刑' }[m] || m));
  if (data.isKong) marks.push('空亡');
  if (result.horse.palace === p) marks.push('馬星');
  if (result.zhiFu.palace === p) marks.push('值符');
  if (result.zhiShi.palace === p) marks.push('值使');
  if (shiZhuPalace === p) marks.push('事主');
  if (shiGanPalace === p) marks.push('時干');
  return marks;
}

// ── 問事類別用神取用表 ────────────────────────────────────
// kind 為定位方式（door/star/god/stem 落宮、zhiFu/zhiShi、dayStem 事主、hourStem 時干、horse 馬星）
export const ASK_TYPES = [
  // 終身局／命盤：以出生時間排本命盤，解讀性格、命運傾向、六親、大運走向
  { id: '終身局', natal: true, ys: [
    { kind: 'dayStem', role: '命主（本人）' },
    { kind: 'zhiFu', role: '值符（命格大勢、貴人）' },
    { kind: 'zhiShi', role: '值使（一生行事作風）' },
  ] },
  { id: '求財', ys: [
    { kind: 'door', name: '生门', role: '財利、利潤' },
    { kind: 'stem', name: '戊', role: '資本、錢財' },
    { kind: 'dayStem', role: '求財之人（事主）' },
    { kind: 'hourStem', role: '所求之財事' },
  ] },
  { id: '事業工作', ys: [
    { kind: 'door', name: '开门', role: '事業、工作、職位' },
    { kind: 'zhiFu', role: '上司、貴人、官方' },
    { kind: 'dayStem', role: '本人（事主）' },
    { kind: 'hourStem', role: '所問之事' },
  ] },
  // 感情婚姻：對方＝事主合干（天干五合），值符為甲→甲己合則己為另一伴/情人；邏輯見 qimen/ask.js
  { id: '感情婚姻', love: true, ys: [] },
  { id: '疾病健康', ys: [
    { kind: 'star', name: '天芮', role: '疾病、病症' },
    { kind: 'stem', name: '乙', role: '醫藥、醫生' },
    { kind: 'star', name: '天心', role: '醫術、良醫' },
    { kind: 'dayStem', role: '病人（事主）' },
  ] },
  { id: '官司是非', ys: [
    { kind: 'door', name: '惊门', role: '官司、口舌' },
    { kind: 'zhiFu', role: '官方、原告' },
    { kind: 'stem', name: '庚', role: '對方、被告、阻隔' },
    { kind: 'dayStem', role: '本人（事主）' },
  ] },
  { id: '考試學業', ys: [
    { kind: 'door', name: '景门', role: '試卷、名聲' },
    { kind: 'stem', name: '丁', role: '文章、功名' },
    { kind: 'star', name: '天辅', role: '文昌、學業' },
    { kind: 'dayStem', role: '考生（事主）' },
    { kind: 'zhiFu', role: '主考、錄取方' },
  ] },
  { id: '出行遠行', ys: [
    { kind: 'god', name: '九天', role: '遠行、高升' },
    { kind: 'door', name: '开门', role: '道路通達、啟程' },
    { kind: 'horse', role: '行程、動靜快慢' },
    { kind: 'dayStem', role: '出行人（事主）' },
    { kind: 'hourStem', role: '目的地、所辦之事' },
  ] },
  { id: '行人尋人', ys: [
    { kind: 'hourStem', role: '行人、所尋之人' },
    { kind: 'horse', role: '歸期、動靜' },
    { kind: 'god', name: '六合', role: '音信、聯絡' },
    { kind: 'dayStem', role: '問事人（事主）' },
  ] },
  { id: '置業房產', ys: [
    { kind: 'door', name: '生门', role: '房屋、田產' },
    { kind: 'door', name: '死门', role: '地皮、舊宅' },
    { kind: 'stem', name: '戊', role: '資金、價錢' },
    { kind: 'dayStem', role: '置業人（事主）' },
  ] },
  // 尋物：時干為物、日干為事主（原「自動尋物」面板併入此類別）
  { id: '尋物', find: true, ys: [] },
  // 自選用神：用家自選符號並填寫代表的人事物
  { id: '自選用神', custom2: true, ys: [] },
  { id: '自訂', ys: [
    { kind: 'dayStem', role: '事主' },
    { kind: 'hourStem', role: '所問之事' },
    { kind: 'zhiFu', role: '值符（大勢、貴人）' },
    { kind: 'zhiShi', role: '值使（事情執行）' },
  ] },
];
const ASK_OUTER = [1, 2, 3, 4, 6, 7, 8, 9];
// 各宮所轄地支（應期用）：坎子、艮丑寅、震卯、巽辰巳、離午、坤未申、兌酉、乾戌亥
export const PALACE_BRANCHES = { 1: '子', 2: '未申', 3: '卯', 4: '辰巳', 5: '', 6: '戌亥', 7: '酉', 8: '丑寅', 9: '午' };

// 依取用方式找用神落宮
export function locateYongShen(spec, result, shiZhuPalace) {
  const P = result.palaces;
  if (spec.kind === 'door') return ASK_OUTER.find((x) => P[x].door === spec.name) ?? null;
  if (spec.kind === 'star') return ASK_OUTER.find((x) => (P[x].stars || []).includes(spec.name)) ?? null;
  if (spec.kind === 'god') return ASK_OUTER.find((x) => P[x].god === spec.name) ?? null;
  if (spec.kind === 'stem') return ASK_OUTER.find((x) => (P[x].tianGan || []).includes(spec.name)) ?? null;
  if (spec.kind === 'zhiFu') return result.zhiFu.palace;
  if (spec.kind === 'zhiShi') return result.zhiShi.palace;
  if (spec.kind === 'dayStem') return shiZhuPalace || result.pillarMarkPalaces[2];
  if (spec.kind === 'hourStem') return result.pillarMarkPalaces[3];
  if (spec.kind === 'horse') return result.horse.palace;
  return null;
}
// 用神顯示名（繁體；值符值使帶星門、日時干帶天干、馬星帶支）
export function yongShenDisp(spec, result) {
  if (spec.kind === 'zhiFu') return `值符·${t(result.zhiFu.star)}`;
  if (spec.kind === 'zhiShi') return `值使·${t(result.zhiShi.door)}`;
  if (spec.kind === 'dayStem') return `日干 ${t(result.pillarStems[2])}`;
  if (spec.kind === 'hourStem') return `時干 ${t(result.pillarStems[3])}`;
  if (spec.kind === 'horse') return `馬星 ${result.horse.zhi}`;
  return t(spec.name);
}

// 問事分析全鏈：用神落宮（含空亡轉宮標註）＋應期線索＋宮宮關係＋空亡轉宮明細＋尋物依據
// input: { result, qtype, customYs?, querent, shiZhuPalace, shiGanPalace }
export function resolveAsk({ result, qtype, customYs = [], querent, shiZhuPalace, shiGanPalace }) {
  const fuFan = detectFuFan(result);
  const shiZhu = shiZhuStem(result, querent);
  const spec = ASK_TYPES.find((x) => x.id === qtype);
  const marksOf = (pp) => palaceMarkLabels(pp, result, shiZhuPalace, shiGanPalace);

  // 用神落宮解析
  let resolved;
  if (spec && spec.love) {
    resolved = loveYongShen(result, shiZhu, shiGanPalace, marksOf);
  } else if (spec && spec.find) { // 尋物：時干為物、日干為事主（固定日干，不隨遠程設定）
    const rows = [
      { disp: `時干 ${t(result.pillarStems[3])}`, role: '遺失物品', palace: result.pillarMarkPalaces[3] },
      { disp: `日干 ${t(result.pillarStems[2])}`, role: '事主（尋物者）', palace: result.pillarMarkPalaces[2] },
      { disp: `馬星 ${result.horse.zhi}`, role: '快慢、動靜', palace: result.horse.palace },
    ];
    resolved = rows.map((r) => ({ ...r, marks: r.palace ? marksOf(r.palace) : [] }));
  } else if (spec && spec.custom2) { // 自選用神：自選符號＋代表意義；自動補時干/日干參照宮
    const rows = customYs.map((c) => {
      const cat = CUSTOM_CATS.find((x) => x.id === c.cat) || CUSTOM_CATS[0];
      let palace, dispSym;
      if (cat.kind === 'stem' && c.sym === '甲') { palace = result.zhiFu.palace; dispSym = '甲（值符）'; }
      else {
        palace = locateYongShen({ kind: cat.kind, name: c.sym }, result, shiZhuPalace);
        dispSym = yongShenDisp({ kind: cat.kind, name: c.sym }, result);
      }
      return { disp: c.label.trim() ? `${dispSym}（${c.label.trim()}）` : dispSym, role: c.label.trim() || '自選用神', palace, marks: palace ? marksOf(palace) : [] };
    });
    [{ kind: 'hourStem', role: '所問之事（參照）' }, { kind: 'dayStem', role: '事主（參照）' }].forEach((rf) => {
      if (!customYs.some((c) => (CUSTOM_CATS.find((x) => x.id === c.cat) || {}).kind === rf.kind)) {
        const palace = locateYongShen({ kind: rf.kind }, result, shiZhuPalace);
        rows.push({ disp: yongShenDisp({ kind: rf.kind }, result), role: rf.role, palace, marks: palace ? marksOf(palace) : [] });
      }
    });
    resolved = rows;
  } else {
    resolved = spec ? spec.ys.map((s) => {
      const palace = locateYongShen(s, result, shiZhuPalace);
      return { disp: yongShenDisp(s, result), role: s.role, palace, marks: palace ? marksOf(palace) : [] };
    }) : [];
  }

  // 空亡轉先天：空亡宮改標「空亡→轉X宮」／「雙空亡→轉X宮」
  const rows = resolved.map((r) => {
    if (!r.palace) return r;
    const ks = kongShift(result, r.palace);
    const marks = r.marks.filter((m) => m !== '空亡');
    if (ks) marks.push(ks.double ? `雙空亡→轉${PALACE_NAME[ks.to]}` : `空亡→轉${PALACE_NAME[ks.to]}`);
    else if (r.marks.includes('空亡')) marks.push('空亡');
    return { ...r, marks };
  });

  // 宮宮關係（五行生剋 × 四害強弱）：對所有用神落宮兩兩推算
  const relations = (() => {
    const pts = [];
    const seen = new Set();
    rows.forEach((r) => { if (r.palace && !seen.has(r.palace)) { seen.add(r.palace); pts.push({ p: r.palace, name: r.disp }); } });
    const out = [];
    for (let i = 0; i < pts.length && out.length < 8; i++) {
      for (let j = i + 1; j < pts.length && out.length < 8; j++) {
        const line = palaceRelation(result, pts[i].p, pts[j].p, pts[i].name, pts[j].name, (p) => PALACE_NAME[p]);
        if (line) out.push(line);
      }
    }
    return out;
  })();

  // 空亡轉宮明細（含轉宮符號，送 AI 參讀）
  const kongNotes = (() => {
    const out = [];
    const seen = new Set();
    rows.forEach((r) => {
      if (!r.palace || seen.has(r.palace)) return;
      seen.add(r.palace);
      const ks = kongShift(result, r.palace);
      if (ks) out.push({ who: r.disp, from: PALACE_NAME[ks.from], to: PALACE_NAME[ks.to], double: ks.double, toSymbols: buildPalaceSymbols(ks.to, result).map((s) => ({ label: s.label, name: s.name, meaning: s.info.meaning, attrs: s.info.attrs })) });
    });
    return out;
  })();

  // 尋物推算依據（生克／快慢／距離）
  const facts = (() => {
    if (!spec || !spec.find) return [];
    const itemP = result.pillarMarkPalaces[3], qp = result.pillarMarkPalaces[2];
    if (!itemP || !qp) return [];
    const f = findFacts(result, itemP, qp);
    return [
      `物品（時干 ${t(result.pillarStems[3])}）落${PALACE_NAME[itemP]}（屬${f.itemWx}）；事主（日干 ${t(result.pillarStems[2])}）落${PALACE_NAME[qp]}（屬${f.qWx}）`,
      `兩宮生克：${f.relation} → ${f.ease}`,
      `快慢：${f.speed}`,
      `距離：${f.distance}`,
    ];
  })();

  // 應期線索（規則推算）
  const timing = (() => {
    const lines = [];
    const main = rows.find((r) => r.palace);
    if (main) {
      const br = PALACE_BRANCHES[main.palace];
      if (br) lines.push(`主用神「${main.disp}」落${PALACE_NAME[main.palace]}，宮支${br} → 應期多應在${br.split('').join('、')}之月或日`);
      if (result.palaces[main.palace].isKong) lines.push(`主用神宮逢空亡（${result.xunKong[3].map(t).join('')}空）→ 待出空填實（${result.xunKong[3].map(t).join('、')}之月／日）方應`);
      if (result.horse.palace === main.palace) lines.push('馬星臨主用神宮 → 事應快速、主動有變');
      const d0 = result.palaces[main.palace];
      if (d0.menpo) lines.push('主用神宮門迫 → 應期有阻，事多反覆');
      if ((d0.marks || []).some((m) => m.includes('刑') || m.includes('墓'))) lines.push('主用神宮見擊刑／入墓 → 應期延遲或過程波折');
    }
    if (shiGanPalace && PALACE_BRANCHES[shiGanPalace]) lines.push(`時干（所問之事）落${PALACE_NAME[shiGanPalace]}，宮支${PALACE_BRANCHES[shiGanPalace]} → 亦可參考${PALACE_BRANCHES[shiGanPalace].split('').join('、')}之期`);
    if (fuFan === '伏吟') lines.push('九星伏吟 → 應期遲緩，宜守不宜急');
    else if (fuFan === '反吟') lines.push('九星反吟 → 應期快速但多反覆');
    lines.push(`馬星在${result.horse.zhi}（落${PALACE_NAME[result.horse.palace]}）→ 逢${result.horse.zhi}之月／日事有動象`);
    return lines;
  })();

  return { spec, fuFan, shiZhu, rows, relations, kongNotes, facts, timing };
}

// 組裝送 API 的 ask payload（與 AskPanel 一致）
export function buildAskPayload(input) {
  const { result, qtype, custom = '', shiZhuPalace, shiGanPalace } = input;
  const a = resolveAsk(input);
  return {
    qtype, custom: qtype === '自訂' ? custom.trim() : '',
    chart: {
      pillars: result.pillars.map((gz) => t(gz)), dun: t(result.dun), ju: result.ju, xunShou: t(result.xunShou),
      kong: result.xunKong[3].map(t).join(''), kongPalaces: result.kongPalaces.map((p) => PALACE_NAME[p]).join('、'),
      zhiFu: `${t(result.zhiFu.star)} 落${PALACE_NAME[result.zhiFu.palace]}`,
      zhiShi: `${t(result.zhiShi.door)} 落${PALACE_NAME[result.zhiShi.palace]}`,
      horse: `${result.horse.zhi}（落${PALACE_NAME[result.horse.palace]}）`,
      fuFan: a.fuFan,
      shiZhu: shiZhuPalace ? PALACE_NAME[shiZhuPalace] : '', shiGan: shiGanPalace ? PALACE_NAME[shiGanPalace] : '',
      shiZhuLabel: input.querent && input.querent.mode === '遠程' ? '事主（月干・遠程）' : '事主（日干）',
    },
    yongshen: a.rows.filter((r) => r.palace).map((r) => ({
      name: r.disp, role: r.role, palace: PALACE_NAME[r.palace], wx: PALACE_INFO[r.palace].wx,
      branches: PALACE_BRANCHES[r.palace] || '', marks: r.marks,
      symbols: buildPalaceSymbols(r.palace, result).map((s) => ({ label: s.label, name: s.name, meaning: s.info.meaning, attrs: s.info.attrs })),
    })),
    timing: a.timing,
    relations: a.relations,
    kong: a.kongNotes,
    facts: a.facts,
  };
}
