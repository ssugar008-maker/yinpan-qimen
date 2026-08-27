// 玄空飛星（下卦）排盤引擎
// 宮位以洛書數表示：坎1 坤2 震3 巽4 中5 乾6 兌7 艮8 離9

export const PALACE_DIR = { 1: '正北', 2: '西南', 3: '正東', 4: '東南', 5: '中宮', 6: '西北', 7: '正西', 8: '東北', 9: '正南' };
export const PALACE_WX = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
export const PALACE_GUA = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 5: '中', 6: '乾', 7: '兌', 8: '艮', 9: '離' };
// 洛書九宮佈局（顯示用）：巽4 離9 坤2 / 震3 中5 兌7 / 艮8 坎1 乾6
export const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6];
// 飛星路徑：中5→乾6→兌7→艮8→離9→坎1→坤2→震3→巽4
const STAR_FLIGHT = [5, 6, 7, 8, 9, 1, 2, 3, 4];

export const STAR_NAME = { 1: '一白貪狼', 2: '二黑巨門', 3: '三碧祿存', 4: '四綠文昌', 5: '五黃廉貞', 6: '六白武曲', 7: '七赤破軍', 8: '八白左輔', 9: '九紫右弼' };
export const STAR_WX = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
export const STAR_JI = { 1: '吉', 2: '凶', 3: '凶', 4: '吉', 5: '大凶', 6: '吉', 7: '凶', 8: '吉', 9: '吉' };

// 九運年份
export const PERIODS = [[1864, 1883], [1884, 1903], [1904, 1923], [1924, 1943], [1944, 1963], [1964, 1983], [1984, 2003], [2004, 2023], [2024, 2043]];
export const periodOfYear = (y) => { for (let i = 0; i < 9; i++) if (y >= PERIODS[i][0] && y <= PERIODS[i][1]) return i + 1; return 9; };

// 二十四山：名 / 元龍(天地人) / 陰陽(1陽0陰) / 所屬宮
export const MOUNTAINS24 = [
  { n: '壬', yuan: '地', yang: 1, palace: 1 }, { n: '子', yuan: '天', yang: 0, palace: 1 }, { n: '癸', yuan: '人', yang: 0, palace: 1 },
  { n: '丑', yuan: '地', yang: 0, palace: 8 }, { n: '艮', yuan: '天', yang: 1, palace: 8 }, { n: '寅', yuan: '人', yang: 1, palace: 8 },
  { n: '甲', yuan: '地', yang: 1, palace: 3 }, { n: '卯', yuan: '天', yang: 0, palace: 3 }, { n: '乙', yuan: '人', yang: 0, palace: 3 },
  { n: '辰', yuan: '地', yang: 0, palace: 4 }, { n: '巽', yuan: '天', yang: 1, palace: 4 }, { n: '巳', yuan: '人', yang: 1, palace: 4 },
  { n: '丙', yuan: '地', yang: 1, palace: 9 }, { n: '午', yuan: '天', yang: 0, palace: 9 }, { n: '丁', yuan: '人', yang: 0, palace: 9 },
  { n: '未', yuan: '地', yang: 0, palace: 2 }, { n: '坤', yuan: '天', yang: 1, palace: 2 }, { n: '申', yuan: '人', yang: 1, palace: 2 },
  { n: '庚', yuan: '地', yang: 1, palace: 7 }, { n: '酉', yuan: '天', yang: 0, palace: 7 }, { n: '辛', yuan: '人', yang: 0, palace: 7 },
  { n: '戌', yuan: '地', yang: 0, palace: 6 }, { n: '乾', yuan: '天', yang: 1, palace: 6 }, { n: '亥', yuan: '人', yang: 1, palace: 6 },
];
const MOUNTAIN = Object.fromEntries(MOUNTAINS24.map((m) => [m.n, m]));
// 坐山的對向（向首）：同宮相隔12位（+12 mod 24）
export const oppositeMountain = (n) => { const i = MOUNTAINS24.findIndex((m) => m.n === n); return MOUNTAINS24[(i + 12) % 24].n; };

// 24山度數：每山15度，子山=0度起（順時針）
export const DEGREE_MOUNTAINS = ['子', '癸', '丑', '艮', '寅', '甲', '卯', '乙', '辰', '巽', '巳', '丙', '午', '丁', '未', '坤', '申', '庚', '酉', '辛', '戌', '乾', '亥', '壬'];
// 度數 → 山名（取所在15度山）
export const mountainFromDegree = (deg) => { const d = ((deg % 360) + 360) % 360; return DEGREE_MOUNTAINS[Math.round(d / 15) % 24]; };
// 山名 → 中心度數
export const mountainCenter = (name) => DEGREE_MOUNTAINS.indexOf(name) * 15;
// 度數距所屬山中心的角度（用於兼向判斷）；|偏移|>=4.5度屬兼向範圍
export const degreeOffset = (deg) => { const d = ((deg % 360) + 360) % 360; const c = mountainCenter(mountainFromDegree(d)); let off = d - c; if (off > 180) off -= 360; if (off < -180) off += 360; return off; };

// 飛星：centerStar 入中，順(true)/逆(false) 飛 → { 宮: 星 }
export function fly(centerStar, forward) {
  const map = {};
  for (let i = 0; i < 9; i++) {
    const p = STAR_FLIGHT[i];
    map[p] = forward ? ((centerStar - 1 + i) % 9) + 1 : (((centerStar - 1 - i) % 9) + 9) % 9 + 1;
  }
  return map;
}
// 運盤（該運星入中，順飛）
export const periodChart = (period) => fly(period, true);
// 年飛星入中（以 2026=1 為錨，每年退一）
export const annualStar = (year) => (((2026 - year) % 9) + 9) % 9 + 1;
export const annualChart = (year) => fly(annualStar(year), true);

// 山星/向星入中後的順逆：星5 看坐/向山本身陰陽；其餘看入中星奇偶 + 坐/向山元龍
function flyDirection(star, mountain) {
  if (star === 5) return MOUNTAIN[mountain].yang === 1; // 陽順陰逆
  return (star % 2 === 0) !== (MOUNTAIN[mountain].yuan === '地');
}

// 玄空飛星盤：period 運、坐山 sitM、向首 faceM
export function xuanKongChart(period, sitM, faceM) {
  const pG = periodChart(period);
  const sitPalace = MOUNTAIN[sitM].palace;
  const facePalace = MOUNTAIN[faceM].palace;
  const sitCenter = pG[sitPalace];   // 山星入中數
  const faceCenter = pG[facePalace]; // 向星入中數
  const sG = fly(sitCenter, flyDirection(sitCenter, sitM)); // 山星盤
  const fG = fly(faceCenter, flyDirection(faceCenter, faceM)); // 向星盤
  return { period, sitM, faceM, pG, sG, fG, sitPalace, facePalace, sitCenter, faceCenter };
}

// ── 替卦（兼向起星）──────────────────────────────────────
// 替星歌訣：子癸並甲申貪狼（1），壬卯乙未坤巨門（2），乾亥辰巽巳戌武曲（6），
//           酉辛丑艮丙破軍（7），寅午庚丁右弼（9）。（3、4、5、8 不作替星）
export const TI_GUA_STAR = {
  子: 1, 癸: 1, 甲: 1, 申: 1,
  壬: 2, 卯: 2, 乙: 2, 未: 2, 坤: 2,
  乾: 6, 亥: 6, 辰: 6, 巽: 6, 巳: 6, 戌: 6,
  酉: 7, 辛: 7, 丑: 7, 艮: 7, 丙: 7,
  寅: 9, 午: 9, 庚: 9, 丁: 9,
};
// 各宮按元龍（天/地/人）索引山名
const PALACE_YUAN_MOUNTAIN = {};
MOUNTAINS24.forEach((m) => { (PALACE_YUAN_MOUNTAIN[m.palace] = PALACE_YUAN_MOUNTAIN[m.palace] || {})[m.yuan] = m; });
// 兼向替星：入中星 star 之本宮，取與坐/向山同元龍之山，以該山替星入中，順逆看該山陰陽。
// 五黃入中無山可替，仍以 5 入中，順逆看坐/向山本身陰陽（同下卦）。
function tiGuaCenter(star, mountain) {
  if (star === 5) return { star: 5, forward: MOUNTAIN[mountain].yang === 1, orig: 5, via: null };
  const via = PALACE_YUAN_MOUNTAIN[star][MOUNTAIN[mountain].yuan]; // 星之本宮 = 洛書宮數
  return { star: TI_GUA_STAR[via.n], forward: via.yang === 1, orig: star, via: via.n };
}
// 玄空飛星替卦盤：兼向時用（度數近兩山交界）
export function xuanKongChartTiGua(period, sitM, faceM) {
  const pG = periodChart(period);
  const sitPalace = MOUNTAIN[sitM].palace;
  const facePalace = MOUNTAIN[faceM].palace;
  const sit = tiGuaCenter(pG[sitPalace], sitM);
  const face = tiGuaCenter(pG[facePalace], faceM);
  const sG = fly(sit.star, sit.forward);
  const fG = fly(face.star, face.forward);
  return { period, sitM, faceM, pG, sG, fG, sitPalace, facePalace, sitCenter: sit.star, faceCenter: face.star, tiGua: { sit, face } };
}

const OUTER = [1, 2, 3, 4, 6, 7, 8, 9];
// 格局判定
export function chartTypes(chart) {
  const { sG, fG, pG, sitPalace, facePalace, period: s } = chart;
  const types = [];
  const wangShan = sG[sitPalace] === s, wangXiang = fG[facePalace] === s;
  const shanDaoXiang = sG[facePalace] === s, xiangDaoShan = fG[sitPalace] === s;
  if (wangShan && wangXiang) types.push({ n: '旺山旺向', t: '大吉', d: '當運山星到坐、向星到向，丁財兩旺，最佳格局。', c: '#c0392b' });
  else if (shanDaoXiang && xiangDaoShan) types.push({ n: '上山下水', t: '大凶', d: '當運山星到向、向星到坐，損丁破財，需特別化解。', c: '#555' });
  else if (shanDaoXiang && wangXiang) types.push({ n: '雙星到向', t: '旺財', d: '當運山向二星同到向方，利財運，向方宜見水、開闊。', c: '#27ae60' });
  else if (wangShan && xiangDaoShan) types.push({ n: '雙星到山', t: '旺丁', d: '當運山向二星同到坐方，利人丁，坐方宜見山、靠實。', c: '#27ae60' });
  if (OUTER.every((p) => sG[p] + fG[p] === 10)) types.push({ n: '合十', t: '大吉', d: '山向二星各宮合十，全局和諧。', c: '#c0392b' });
  if (OUTER.every((p) => new Set([sG[p] % 3, fG[p] % 3, pG[p] % 3]).size === 1 && new Set([sG[p], fG[p], pG[p]]).size === 3)) types.push({ n: '父母三般卦', t: '大吉', d: '147/258/369 同宮，三般卦氣。', c: '#c0392b' });
  if (OUTER.every((p) => { const a = [sG[p], fG[p], pG[p]].sort((x, y) => x - y); return (a[2] - a[1] === 1 && a[1] - a[0] === 1) || (a[0] === 1 && a[1] === 8 && a[2] === 9) || (a[0] === 1 && a[1] === 2 && a[2] === 9); })) types.push({ n: '連珠三般卦', t: '大吉', d: '連續三數同宮。', c: '#c0392b' });
  if (sG[5] === s) types.push({ n: '山星伏吟', t: '凶', d: `山星${sG[5]}入中為當運星，丁星呆滯不動。`, c: '#c76644' });
  else if (sG[5] + s === 10) types.push({ n: '山星反吟', t: '凶', d: '山星入中與運星合十反覆，人丁不安。', c: '#c76644' });
  if (fG[5] === s) types.push({ n: '向星伏吟', t: '凶', d: `向星${fG[5]}入中為當運星，財運受困不出。`, c: '#c76644' });
  else if (fG[5] + s === 10) types.push({ n: '向星反吟', t: '凶', d: '向星入中與運星合十反覆，財運動盪。', c: '#c76644' });
  if (OUTER.every((p) => sG[p] === p)) types.push({ n: '山星全盤伏吟', t: '大凶', d: '全盤山星歸位，人丁極度呆滯。', c: '#888' });
  if (OUTER.every((p) => fG[p] === p)) types.push({ n: '向星全盤伏吟', t: '大凶', d: '全盤向星歸位，財運完全停滯。', c: '#888' });
  if (OUTER.every((p) => sG[p] + p === 10)) types.push({ n: '山星全盤反吟', t: '大凶', d: '全盤山星反位，人丁反覆大凶。', c: '#888' });
  if (OUTER.every((p) => fG[p] + p === 10)) types.push({ n: '向星全盤反吟', t: '大凶', d: '全盤向星反位，財運反覆大凶。', c: '#888' });
  return types;
}

// 城門訣：向首兩旁宮，向星為當運（正城門）或生氣星/次運（副城門）
const CASTLE_NEIGHBOR = { 6: [1, 7], 1: [6, 8], 8: [1, 3], 7: [6, 2], 3: [8, 4], 2: [7, 9], 9: [2, 4], 4: [3, 9] };
export function castleGate(chart) {
  const { fG, facePalace, period } = chart;
  const next = (period % 9) + 1;
  const res = [];
  (CASTLE_NEIGHBOR[facePalace] || []).forEach((p) => {
    const star = fG[p];
    if (star === period) res.push({ palace: p, star, type: '正城門', d: '城門方見當運旺星，最利，可作納氣口。', c: '#c0392b' });
    else if (star === next) res.push({ palace: p, star, type: '副城門', d: '城門方見生氣星，可用。', c: '#ca4' });
  });
  return res;
}

// 星曜組合（山星+向星）：六十組
const PAIR = {
  67: ['交劍煞', '凶', '金星交戰主官非血光', '水洩金'], 76: ['交劍煞', '凶', '金星交戰', '水洩金'],
  25: ['二五交加', '大凶', '病符廉貞主重病損丁', '六帝錢洩土'], 52: ['二五交加', '大凶', '主重病損丁', '六帝錢'],
  95: ['紫黃毒藥', '大凶', '火生土助煞', '銅器洩土'], 59: ['紫黃毒藥', '大凶', '火生土助煞', '銅器'],
  57: ['紫黃毒藥', '大凶', '毒藥煞主口舌惡疾', '金洩土'], 75: ['紫黃毒藥', '大凶', '毒藥煞', '金洩土'],
  23: ['鬥牛煞', '凶', '是非官災', '火通關'], 32: ['鬥牛煞', '凶', '是非官災', '火通關'],
  97: ['回祿', '凶', '火剋金主火災', '土通關'], 79: ['回祿', '凶', '火剋金', '土通關'],
  14: ['文昌', '吉', '利讀書科名', ''], 41: ['文昌', '吉', '利讀書', ''],
  68: ['旺財', '吉', '土生金大旺', ''], 86: ['旺財', '吉', '土生金', ''],
  16: ['武曲', '吉', '金水利官', ''], 61: ['武曲', '吉', '金水利官', ''],
  35: ['碧黃', '凶', '木剋土損丁', '火通關'], 53: ['碧黃', '凶', '木剋土', '火通關'],
  69: ['火燒天門', '凶', '火剋乾金', '土通關'], 96: ['火燒天門', '凶', '火剋乾金', '土通關'],
  37: ['穿心煞', '凶', '金剋木主劫盜', '水通關'], 73: ['穿心煞', '凶', '金剋木', '水通關'],
  17: ['桃花', '半吉', '旺桃花可致劫', ''], 71: ['桃花', '半吉', '旺桃花', ''],
  19: ['水火既濟', '吉', '水火交融利聰慧', ''], 91: ['水火既濟', '吉', '水火交融', ''],
  49: ['木火通明', '吉', '利文學藝術才華', ''], 94: ['木火通明', '吉', '利文學才華', ''],
  18: ['耳聰目明', '吉', '土金相生利武職地產', ''], 81: ['耳聰目明', '吉', '土金相生', ''],
  29: ['天乙神火', '半吉', '火生土旺財(失運主病)', ''], 92: ['天乙神火', '半吉', '火生土', ''],
  34: ['碧綠風魔', '半凶', '是非桃花盜賊', '金洩木'], 43: ['碧綠風魔', '半凶', '桃花劫', '金洩木'],
  13: ['蚤蟲入耳', '半凶', '暗病口舌失眠', '火通關'], 31: ['蚤蟲入耳', '半凶', '暗病口舌', '火通關'],
  46: ['金木交戰', '凶', '金剋木主官非傷足', '水通關'], 64: ['金木交戰', '凶', '金剋木', '水通關'],
  48: ['木剋土煞', '凶', '肝胃不和筋骨傷', '火通關'], 84: ['木剋土煞', '凶', '木剋土', '火通關'],
  15: ['土剋水煞', '凶', '中男受損泌尿病', '金通關'], 51: ['土剋水煞', '凶', '土剋水', '金通關'],
  36: ['金剋木煞', '凶', '官非足傷肝損', '水通關'], 63: ['金剋木煞', '凶', '足傷肝損', '水通關'],
  38: ['傷丁煞', '凶', '土木交戰少男傷', '火通關'], 83: ['傷丁煞', '凶', '土木交戰', '火通關'],
  27: ['火生土合', '半吉', '先天合火利財(失運主目疾)', ''], 72: ['火生土合', '半吉', '先天合火', ''],
  28: ['巨艮合德', '半吉', '土比和利田產(當運為佳)', ''], 82: ['巨艮合德', '半吉', '土比和', ''],
  39: ['木火翻燃', '半吉', '木生火旺文(失運主官非)', ''], 93: ['木火翻燃', '半吉', '木生火', ''],
  47: ['金木桃花', '半凶', '金剋木損妻多情', '水通關'], 74: ['金木桃花', '半凶', '金剋木', '水通關'],
  58: ['土比和', '半吉', '五黃逢八白大利(失運則凶)', ''], 85: ['土比和', '半吉', '土比和', ''],
  89: ['紫輔合局', '吉', '火生土旺丁財', ''], 98: ['紫輔合局', '吉', '火生土', ''],
};
const WXS = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const WXK = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
// 查星曜組合：a=山星 b=向星 → { n,t,d,r }
export function starPair(a, b) {
  const hit = PAIR[`${a}${b}`];
  if (hit) return { n: hit[0], t: hit[1], d: hit[2], r: hit[3] };
  const wa = STAR_WX[a], wb = STAR_WX[b];
  if (wa === wb) return { n: `${wa}比和`, t: '平', d: `二星同屬${wa}`, r: '' };
  if (WXS[wa] === wb) return { n: `${wa}生${wb}`, t: '半吉', d: `${a}生${b}，相生`, r: '' };
  if (WXS[wb] === wa) return { n: `${wb}生${wa}`, t: '半吉', d: `${b}生${a}，相生`, r: '' };
  if (WXK[wa] === wb) return { n: `${wa}剋${wb}`, t: '凶', d: `${a}剋${b}，相剋`, r: '' };
  return { n: `${wb}剋${wa}`, t: '凶', d: `${b}剋${a}，相剋`, r: '' };
}
// 化解建議展開
const REMEDY = {
  '水洩金': '以水洩金：魚缸、流水擺設、黑/藍色物品。', '火通關': '以火通關：紅色物品、燈光、長明燈。',
  '土通關': '以土通關：陶瓷、黃色物品、石材。', '金通關': '以金通關：六帝錢、銅器、金屬風鈴。',
  '木通關': '以木通關：植物、綠色物品。', '金洩土': '以金洩土：六帝錢、銅器、金屬物品。',
  '金洩木': '以金洩木：金屬物品、白/金色。', '六帝錢': '六帝錢、銅葫蘆、金屬物品。',
  '六帝錢洩土': '六帝錢、銅器，以金洩土。', '銅器': '銅器、金屬擺設。', '銅器洩土': '銅器、金屬，以金洩土。',
};
export const remedyText = (r) => (r ? (REMEDY[r] || r) : '');

// 換運對比：同一坐向，一至九運各排一次，取主要格局
export function periodComparison(sitM, faceM) {
  const rows = [];
  for (let p = 1; p <= 9; p++) {
    const chart = xuanKongChart(p, sitM, faceM);
    const types = chartTypes(chart);
    const main = types[0] || null;
    rows.push({ period: p, years: PERIODS[p - 1], chart, main, all: types });
  }
  return rows;
}

// ── 八宅命卦 ─────────────────────────────────────────────
export const GUA_NAME = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 6: '乾', 7: '兌', 8: '艮', 9: '離' };
export const EAST4 = [1, 3, 4, 9]; // 東四命；其餘西四命
// 出生年+性別 → 命卦數（1900-2099）
export function lifeGua(year, gender) {
  const n = year % 100;
  let g;
  if (year >= 2000) {
    if (gender === '男') { g = 9 - ((year - 2000) % 9); if (g === 0) g = 9; if (g === 5) g = 2; return g; }
    g = ((year - 2000) % 9) + 6; if (g > 9) g -= 9; if (g === 5) g = 8; return g;
  }
  if (gender === '男') { g = (100 - n) % 9; if (g === 0) g = 9; if (g === 5) g = 2; return g; }
  g = (n - 4) % 9; if (g <= 0) g += 9; if (g === 5) g = 8; return g;
}
// 八宅遊年：命卦 → { 宮: 星名 }
const BAZHAI_IDX = {
  6: { 0: '伏位', 1: '六煞', 2: '天醫', 3: '生氣', 5: '五鬼', 6: '延年', 7: '絕命', 8: '禍害' },
  1: { 0: '六煞', 1: '伏位', 2: '五鬼', 3: '禍害', 5: '天醫', 6: '絕命', 7: '延年', 8: '生氣' },
  8: { 0: '天醫', 1: '五鬼', 2: '伏位', 3: '延年', 5: '六煞', 6: '生氣', 7: '禍害', 8: '絕命' },
  3: { 0: '五鬼', 1: '天醫', 2: '六煞', 3: '絕命', 5: '伏位', 6: '禍害', 7: '生氣', 8: '延年' },
  4: { 0: '禍害', 1: '生氣', 2: '絕命', 3: '六煞', 5: '延年', 6: '五鬼', 7: '天醫', 8: '伏位' },
  9: { 0: '絕命', 1: '延年', 2: '禍害', 3: '五鬼', 5: '生氣', 6: '六煞', 7: '伏位', 8: '天醫' },
  2: { 0: '延年', 1: '絕命', 2: '生氣', 3: '天醫', 5: '禍害', 6: '伏位', 7: '六煞', 8: '五鬼' },
  7: { 0: '生氣', 1: '禍害', 2: '延年', 3: '伏位', 5: '絕命', 6: '天醫', 7: '五鬼', 8: '六煞' },
};
const IDX_TO_PALACE = { 0: 6, 1: 1, 2: 8, 3: 7, 5: 3, 6: 2, 7: 9, 8: 4 };
// 命卦 → { 宮: { star, ji } }（四吉四凶）
const BAZHAI_JI = { 生氣: '吉', 天醫: '吉', 延年: '吉', 伏位: '吉', 絕命: '凶', 五鬼: '凶', 六煞: '凶', 禍害: '凶' };
export const BAZHAI_GOOD = ['生氣', '天醫', '延年', '伏位'];
export function bazhai(gua) {
  const idx = BAZHAI_IDX[gua];
  const out = {};
  for (const i of Object.keys(idx)) out[IDX_TO_PALACE[i]] = { star: idx[i], ji: BAZHAI_JI[idx[i]] };
  return out;
}
