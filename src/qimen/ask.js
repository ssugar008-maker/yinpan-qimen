// 奇門問事：用神取用的純邏輯（可獨立測試；內部值沿用引擎簡體）
// 感情婚姻規則（依使用者指定）：
//   對方＝事主的天干五合合干（甲己、乙庚、丙辛、丁壬、戊癸），不固定看乙庚；
//   事主：近程看日干落宮；遠程看月干（開盤人與問事人同性別則換陰陽），甲以值符論；
//   值符為甲，甲己相合 → 事主宮或對方宮見值符時，己亦為另一伴／情人，需兼看己落宮；
//   宮中見乙、丙、丁 → 易有桃花；見己 → 「好聽話」式的桃花。
import { PALACE_INFO } from './symbols.js';

export const STEM_HE = { 甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊' };
export const YINYANG_SWAP = { 甲: '乙', 乙: '甲', 丙: '丁', 丁: '丙', 戊: '己', 己: '戊', 庚: '辛', 辛: '庚', 壬: '癸', 癸: '壬' };
const OUTER = [1, 2, 3, 4, 6, 7, 8, 9];
const TAOHUA_STEMS = ['乙', '丙', '丁'];

// 九星本宮（簡體，與引擎一致）、對宮、後天八卦環（坎艮震巽離坤兌乾）——伏吟反吟與距離推算用
export const STAR_HOME_S = { 1: '天蓬', 8: '天任', 3: '天冲', 4: '天辅', 9: '天英', 2: '天芮', 7: '天柱', 6: '天心' };
export const OPP_PALACE = { 1: 9, 9: 1, 2: 8, 8: 2, 3: 7, 7: 3, 4: 6, 6: 4 };
export const RING8 = [1, 8, 3, 4, 9, 2, 7, 6];

// 九星伏吟（全盤星歸本宮）／反吟（全落對宮）
export function detectFuFan(result) {
  if (OUTER.every((p) => (result.palaces[p].stars || [])[0] === STAR_HOME_S[p])) return '伏吟';
  if (OUTER.every((p) => (result.palaces[p].stars || [])[0] === STAR_HOME_S[OPP_PALACE[p]])) return '反吟';
  return '';
}

// ── 四害（門迫／擊刑／入墓／空亡）─────────────────────────
export function palaceHarms(result, p) {
  const d = result.palaces[p];
  if (!d) return [];
  const harms = [];
  (d.marks || []).forEach((m) => {
    if (m === '破') harms.push('門迫');
    else if (m === '刑') harms.push('擊刑');
    else if (m === '墓') harms.push('入墓');
    else if (m === '墓刑') harms.push('入墓擊刑');
  });
  if (d.isKong) harms.push('空亡');
  return harms;
}

// 後天宮 → 該宮卦的先天位所在之後天宮（空亡轉宮用）：
// 坤（西南）先天在北→坎1；震（東）先天在東北→艮8；離（南）先天在東→震3；坎（北）先天在西→兌7；
// 兌（西）先天在東南→巽4；巽（東南）先天在西南→坤2；乾（西北）先天在南→離9；艮（東北）先天在西北→乾6
export const XIANTIAN_SHIFT = { 1: 7, 2: 1, 3: 8, 4: 2, 6: 9, 7: 4, 8: 6, 9: 3 };
// 用神宮空亡 → 八成信息轉至先天位之宮；轉宮亦空亡 → 雙空亡（事情更虛）
export function kongShift(result, p) {
  const d = result.palaces[p];
  if (!d || !d.isKong || p === 5) return null;
  const to = XIANTIAN_SHIFT[p];
  const double = !!(result.palaces[to] && result.palaces[to].isKong);
  return { from: p, to, double };
}

// ── 宮宮關係：五行生剋 × 四害強弱 ─────────────────────────
// 使用者規則：主動方無四害、受方有四害 → 生剋更強（單向作用）；主動方帶四害 → 力不從心；
// 兩宮四害狀態不一 → 如同各處一方世界，關係不實。
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const harmText = (h) => (h.length ? h.join('、') : '無四害');
export function palaceRelation(result, pA, pB, nameA, nameB, pf) {
  if (!pA || !pB || pA === pB) return null;
  const wxA = PALACE_INFO[pA].wx, wxB = PALACE_INFO[pB].wx;
  const hA = palaceHarms(result, pA), hB = palaceHarms(result, pB);
  const A = `${nameA}（${pf(pA)}，屬${wxA}，${harmText(hA)}）`;
  const B = `${nameB}（${pf(pB)}，屬${wxB}，${harmText(hB)}）`;
  let rel, actor; // actor: 'A' 表示 A 主動（生/剋 B）
  if (wxA === wxB) rel = '比和';
  else if (SHENG[wxA] === wxB) { rel = '生'; actor = 'A'; }
  else if (SHENG[wxB] === wxA) { rel = '生'; actor = 'B'; }
  else if (KE[wxA] === wxB) { rel = '剋'; actor = 'A'; }
  else { rel = '剋'; actor = 'B'; }
  const verb = rel === '比和' ? '與' : rel === '生' ? ' 生 ' : ' 剋 ';
  const head = rel === '比和' ? `${A} 與 ${B} 比和同氣` : (actor === 'A' ? `${A}${verb}${B}` : `${B}${verb}${A}`);
  const hActor = actor === 'A' ? hA : hB;
  const hTarget = actor === 'A' ? hB : hA;
  let note = '';
  if (rel === '比和') {
    if (hA.length && hB.length) note = '兩宮皆帶四害，比和而不相通，如同各處一方世界';
    else if (hA.length || hB.length) note = '其中一宮帶四害，比和之力不實，如同各處一方世界';
  } else if (!hActor.length && hTarget.length) {
    note = `主動方無四害、受方帶四害（${harmText(hTarget)}）→ 此${rel}的關係更強，單向作用明顯，受方無力抵擋／承受`;
  } else if (hActor.length && !hTarget.length) {
    note = `主動方帶四害（${harmText(hActor)}）→ ${rel}而力不從心，作用大打折扣`;
  } else if (hActor.length && hTarget.length) {
    note = '兩宮皆帶四害，關係如隔世界，難以實際作用';
  }
  return note ? `${head}。${note}` : `${head}。`;
}

// ── 尋物推算（時干為物、日干為事主）───────────────────────
export function findFacts(result, itemP, querentP) {
  const itemWx = PALACE_INFO[itemP].wx, qWx = PALACE_INFO[querentP].wx;
  let relation, ease;
  if (itemP === querentP) { relation = '兩宮同宮'; ease = '物品就在事主附近'; }
  else if (KE[qWx] === itemWx) { relation = `事主宮（${qWx}）剋物品宮（${itemWx}）`; ease = '容易找到'; }
  else if (KE[itemWx] === qWx) { relation = `物品宮（${itemWx}）剋事主宮（${qWx}）`; ease = '較難找到'; }
  else if (SHENG[itemWx] === qWx) { relation = `物品宮（${itemWx}）生事主宮（${qWx}）`; ease = '物品易尋回'; }
  else if (SHENG[qWx] === itemWx) { relation = `事主宮（${qWx}）生物品宮（${itemWx}）`; ease = '需費力尋找'; }
  else { relation = `兩宮同屬${qWx}`; ease = '吉凶不明顯（平）'; }
  const fuFan = detectFuFan(result);
  const speed = fuFan === '伏吟' ? '伏吟：主慢，需時較久' : fuFan === '反吟' ? '反吟：主快，較快找到' : '星已轉動：速度平常';
  const di = RING8.indexOf(itemP), dq = RING8.indexOf(querentP);
  const rd = Math.min(Math.abs(di - dq), 8 - Math.abs(di - dq));
  const distance = itemP === querentP ? '同宮（物品在事主所在地）' : rd === 1 ? '相鄰（物品不遠）' : rd === 4 ? '對宮（相隔最遠）' : `相隔 ${rd} 位`;
  return { relation, ease, speed, distance, itemWx, qWx, fuFan };
}

// 自選用神的符號類別目錄（kind 對應 locateYongShen 的取用方式）
export const CUSTOM_CATS = [
  { id: 'door', label: '八門', kind: 'door', options: ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门'] },
  { id: 'star', label: '九星', kind: 'star', options: ['天蓬', '天任', '天冲', '天辅', '天英', '天芮', '天柱', '天心'] },
  { id: 'god', label: '八神', kind: 'god', options: ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'] },
  { id: 'stem', label: '天干', kind: 'stem', options: ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '甲（值符）'] },
  { id: 'zhiFu', label: '值符', kind: 'zhiFu' },
  { id: 'zhiShi', label: '值使', kind: 'zhiShi' },
  { id: 'horse', label: '馬星', kind: 'horse' },
  { id: 'dayStem', label: '日干', kind: 'dayStem' },
  { id: 'hourStem', label: '時干', kind: 'hourStem' },
];

// 事主（問事人）天干與落宮：近程→日干；遠程→月干（同性別換陰陽）；甲遁旬首儀、以值符所落之宮論
export function shiZhuStem(result, querent) {
  if (!result) return null;
  if (querent.mode === '近程') return { stem: result.pillarStems[2], palace: result.pillarMarkPalaces[2] };
  if (!querent.caster || !querent.querent) return null; // 遠程需先設定開盤人與問事人性別
  let stem = result.pillarStems[1];
  if (querent.caster === querent.querent) stem = YINYANG_SWAP[stem];
  if (stem === '甲') return { stem, palace: result.zhiFu.palace };
  const palace = stemPalace(result, stem);
  return palace ? { stem, palace } : null;
}

// 天干落天盤之宮（甲不落盤，需另以值符論）
export function stemPalace(result, stem) {
  return OUTER.find((p) => (result.palaces[p].tianGan || []).includes(stem)) ?? null;
}

// 宮內桃花標註：見乙丙丁→易有桃花；見己→好聽話的桃花
export function peachNotes(result, p) {
  const d = result.palaces[p];
  if (!d) return [];
  const stems = [...(d.tianGan || []), d.diGan, d.diGanExtra].filter(Boolean);
  const notes = [];
  TAOHUA_STEMS.forEach((s) => { if (stems.includes(s)) notes.push(`見${s}：易有桃花`); });
  if (stems.includes('己')) notes.push('見己：好聽話的桃花');
  return notes;
}

// 感情婚姻用神：事主＋合干對方＋六合＋（值符甲己→己為情人）＋時干；各宮附桃花標註
// marksOf(p) 由呼叫方提供（宮位狀態標籤：門迫/擊刑/入墓/空亡/馬星/值符值使/事主/時干）
export function loveYongShen(result, shiZhu, shiGanPalace, marksOf) {
  const rows = [];
  const push = (disp, role, palace) => {
    rows.push({ disp, role, palace, marks: palace ? [...marksOf(palace), ...peachNotes(result, palace)] : [] });
  };
  if (!shiZhu || !shiZhu.palace) {
    rows.push({ disp: '事主（問事人）', role: '遠程請先設定開盤人與問事人性別', palace: null, marks: [] });
    return rows;
  }
  const qStem = shiZhu.stem;
  push(qStem === '甲' ? '事主 甲（值符）' : `事主 ${qStem}`, '問事人（事主）', shiZhu.palace);
  // 對方＝事主合干；合干為甲 → 值符所落之宮
  const he = STEM_HE[qStem];
  const hePalace = he === '甲' ? result.zhiFu.palace : stemPalace(result, he);
  push(he === '甲' ? '對方 甲（值符）' : `對方 ${he}`, `另一半（${qStem}${he}相合）`, hePalace);
  // 六合：婚姻、媒合
  push('六合', '婚姻、媒合、感情關係', OUTER.find((p) => result.palaces[p].god === '六合') ?? null);
  // 值符為甲：事主宮或對方宮見值符 → 甲己合，己為另一伴／情人
  const zf = result.zhiFu.palace;
  if ([shiZhu.palace, hePalace].includes(zf) && qStem !== '己' && he !== '己') {
    push('己', '值符為甲，甲己相合 → 另一伴／情人', stemPalace(result, '己'));
  }
  push(`時干 ${result.pillarStems[3]}`, '這段感情／所問之事', shiGanPalace);
  return rows;
}
