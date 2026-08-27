// 奇門問事：用神取用的純邏輯（可獨立測試；內部值沿用引擎簡體）
// 感情婚姻規則（依使用者指定）：
//   對方＝事主的天干五合合干（甲己、乙庚、丙辛、丁壬、戊癸），不固定看乙庚；
//   事主：近程看日干落宮；遠程看月干（開盤人與問事人同性別則換陰陽），甲以值符論；
//   值符為甲，甲己相合 → 事主宮或對方宮見值符時，己亦為另一伴／情人，需兼看己落宮；
//   宮中見乙、丙、丁 → 易有桃花；見己 → 「好聽話」式的桃花。

export const STEM_HE = { 甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊' };
export const YINYANG_SWAP = { 甲: '乙', 乙: '甲', 丙: '丁', 丁: '丙', 戊: '己', 己: '戊', 庚: '辛', 辛: '庚', 壬: '癸', 癸: '壬' };
const OUTER = [1, 2, 3, 4, 6, 7, 8, 9];
const TAOHUA_STEMS = ['乙', '丙', '丁'];

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
