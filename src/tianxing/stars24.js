// 二十四天星（玄道風水／太乙九天玄女派版本）—— 資料與排盤引擎
// 星曜解說原文：華玉講堂（app.daohk.com/24star），已獲講堂同意使用。
//
// 排盤規則（從講堂立極尺 24 張座向圖逐星還原並交叉驗證）：
//   24 星順時針固定循環：天錢→天節→…→屍氣（前 12 吉、後 12 凶）。
//   甲盤：天錢起子山 —— 用於坐山 壬子癸丑艮寅甲卯乙辰巽巳丙（坎艮震巽四宮＋丙）。
//   乙盤：天錢起癸山（整環順移一山）—— 用於坐山 午丁未坤申庚酉辛戌乾亥（離坤兌乾四宮）。

// 山序（順時針，子=0）
export const M24_ORDER = ['子', '癸', '丑', '艮', '寅', '甲', '卯', '乙', '辰', '巽', '巳', '丙', '午', '丁', '未', '坤', '申', '庚', '酉', '辛', '戌', '乾', '亥', '壬'];

// 24 星循環（順時針）
export const STAR24_CYCLE = ['天錢', '天節', '天田', '天璇', '司祿', '天樞', '從官', '文昌', '開陽', '進賢', '輔翼', '天孫',
  '天權', '玉衡', '天烽', '天賊', '天機', '搖光', '貫索', '捲舌', '咸池', '司怪', '敗傷', '屍氣'];

// 星曜資料：ji 吉凶 / group 八宅主星組 / wx 五行（〇＝無）/ governs 司職（講堂原文）
export const STAR24_INFO = {
  司祿: { ji: '吉', group: '伏位', wx: '金', governs: '易發蹟於事業財勢' },
  輔翼: { ji: '吉', group: '伏位', wx: '', governs: '謀事多貴人多助' },
  進賢: { ji: '吉', group: '伏位', wx: '', governs: '進品格成賢士' },
  天田: { ji: '吉', group: '天醫', wx: '土', governs: '大興田土，買宅進舍' },
  天璇: { ji: '吉', group: '天醫', wx: '', governs: '天福加恩始璇宮之美' },
  天孫: { ji: '吉', group: '天醫', wx: '', governs: '生產宮，得佳兒佳媳' },
  文昌: { ji: '吉', group: '生氣', wx: '木', governs: '發讀書文榜功名' },
  天樞: { ji: '吉', group: '生氣', wx: '金', governs: '規矩節度，行止優美' },
  天節: { ji: '吉', group: '生氣', wx: '金', governs: '凡危可渡，凡節可通', hot: true },
  天錢: { ji: '吉', group: '延年', wx: '金', governs: '財位，天賜有財', hot: true },
  開陽: { ji: '吉', group: '延年', wx: '火', governs: '前程廣大，陰小無忌', hot: true },
  從官: { ji: '吉', group: '延年', wx: '', governs: '升職加官，事業大利' },
  貫索: { ji: '凶', group: '五鬼', wx: '木', governs: '自殺、惡事纏綿，如騰蛇逢玄武' },
  玉衡: { ji: '凶', group: '五鬼', wx: '水', governs: '耽貪於戲樂，所耗不良習慣', hot: true },
  司怪: { ji: '凶', group: '五鬼', wx: '水', governs: '招幽、遇妄法傷自之人' },
  敗傷: { ji: '凶', group: '六煞', wx: '水', governs: '破傷折事損丁，傷畜死敗稼禾' },
  天權: { ji: '凶', group: '六煞', wx: '', governs: '剝權失勢為權姦小人所害（小人位）' },
  咸池: { ji: '凶', group: '六煞', wx: '', governs: '倒捶桃花、出淫人蕩禍' },
  天烽: { ji: '凶', group: '絕命', wx: '火', governs: '大災回祿、天災' },
  搖光: { ji: '凶', group: '絕命', wx: '水', governs: '耗散破敗一切' },
  屍氣: { ji: '大凶', group: '絕命', wx: '水', governs: '病符及死亡喪命人畜（大凶）', hot: true },
  捲舌: { ji: '凶', group: '禍害', wx: '', governs: '外內諸人口舌是非致破敗' },
  天機: { ji: '凶', group: '禍害', wx: '火', governs: '出壞人於宅內而遇敗' },
  天賊: { ji: '凶', group: '禍害', wx: '金', governs: '居處／出門遇賊盜或受人欺凌' },
};

// 坐山 → 用乙盤（順移一位）？坐山在午…亥（index 12–22）用乙盤，其餘（子…丙及壬）用甲盤
export const useShiftMap = (sitIdx) => sitIdx >= 12 && sitIdx <= 22;

// 二十四天星盤：給坐山名，回傳 { 山名: 星名 }（全部 24 山）
export function star24Map(sitMountain) {
  const sitIdx = M24_ORDER.indexOf(sitMountain);
  const shift = useShiftMap(sitIdx) ? 1 : 0;
  const map = {};
  M24_ORDER.forEach((m, i) => { map[m] = STAR24_CYCLE[(i - shift + 24) % 24]; });
  return map;
}

// ── 八宅遊年排法（傳統：坐山起伏位，大遊年配八宮，每宮三山配三小星）──
// 每個坐山卦出一個唔同嘅盤（八宅真訣）。坐山卦 → 各宮遊年星。
const PALACE_GUA24 = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 6: '乾', 7: '兌', 8: '艮', 9: '離' };
const ZHAI_YOUNIAN = {
  乾: { 6: '伏位', 1: '六煞', 8: '天醫', 3: '五鬼', 4: '禍害', 9: '絕命', 2: '延年', 7: '生氣' },
  坎: { 1: '伏位', 8: '五鬼', 3: '天醫', 4: '生氣', 9: '延年', 2: '絕命', 7: '禍害', 6: '六煞' },
  艮: { 8: '伏位', 3: '六煞', 4: '絕命', 9: '禍害', 2: '生氣', 7: '延年', 6: '天醫', 1: '五鬼' },
  震: { 3: '伏位', 4: '延年', 9: '生氣', 2: '禍害', 7: '絕命', 6: '五鬼', 1: '天醫', 8: '六煞' },
  巽: { 4: '伏位', 9: '天醫', 2: '五鬼', 7: '六煞', 6: '禍害', 1: '生氣', 8: '絕命', 3: '延年' },
  離: { 9: '伏位', 2: '六煞', 7: '五鬼', 6: '絕命', 1: '延年', 8: '禍害', 3: '生氣', 4: '天醫' },
  坤: { 2: '伏位', 7: '天醫', 6: '延年', 1: '絕命', 8: '生氣', 3: '禍害', 4: '五鬼', 9: '六煞' },
  兌: { 7: '伏位', 6: '生氣', 1: '禍害', 8: '延年', 3: '絕命', 4: '六煞', 9: '五鬼', 2: '天醫' },
};
// 每遊年星轄三小星（順時針配該宮三山）
const GROUP_STARS24 = {
  伏位: ['司祿', '輔翼', '進賢'], 生氣: ['文昌', '天樞', '天節'], 天醫: ['天田', '天璇', '天孫'], 延年: ['天錢', '開陽', '從官'],
  絕命: ['天烽', '搖光', '屍氣'], 五鬼: ['貫索', '玉衡', '司怪'], 禍害: ['捲舌', '天機', '天賊'], 六煞: ['敗傷', '天權', '咸池'],
};
// 八宅遊年排盤：給坐山名，回傳 { 山名: 星名 }
export function star24MapBazhai(sitMountain) {
  const sitPalace = Object.keys(PALACE_MOUNTAINS24).find((p) => PALACE_MOUNTAINS24[p].includes(sitMountain));
  const yn = ZHAI_YOUNIAN[PALACE_GUA24[sitPalace]];
  const map = {};
  Object.entries(PALACE_MOUNTAINS24).forEach(([p, ms]) => {
    const group = GROUP_STARS24[yn[p]];
    ms.forEach((m, i) => { map[m] = group[i]; });
  });
  return map;
}

// 排盤法：'bazhai'（八宅遊年，坐山起伏位，每坐山一盤——預設）或 'xuandao'（玄道／講堂立極尺，甲乙兩盤）
export const STAR24_METHODS = [
  { id: 'bazhai', label: '八宅遊年' },
  { id: 'xuandao', label: '玄道（講堂立極尺）' },
];
export function star24MapBy(method, sitMountain) {
  return method === 'bazhai' ? star24MapBazhai(sitMountain) : star24Map(sitMountain);
}

// 排盤法全域設定（localStorage＋事件同步各分頁）
const METHOD_KEY = 'mo_star24_method';
export const getStar24Method = () => { try { const v = localStorage.getItem(METHOD_KEY); return v === 'xuandao' ? 'xuandao' : 'bazhai'; } catch { return 'bazhai'; } };
export const setStar24Method = (m) => { try { localStorage.setItem(METHOD_KEY, m); } catch { } try { window.dispatchEvent(new Event('mo-star24-method')); } catch { } };

// 各山中心度數（子=0，順時針每山 15°）
export const mountainDeg24 = (m) => M24_ORDER.indexOf(m) * 15;

// 宮位（後天八卦）→ 三山
export const PALACE_MOUNTAINS24 = { 1: ['壬', '子', '癸'], 2: ['未', '坤', '申'], 3: ['甲', '卯', '乙'], 4: ['辰', '巽', '巳'], 6: ['戌', '乾', '亥'], 7: ['庚', '酉', '辛'], 8: ['丑', '艮', '寅'], 9: ['丙', '午', '丁'] };
export const PALACE_DIR24 = { 1: '正北', 2: '西南', 3: '正東', 4: '東南', 6: '西北', 7: '正西', 8: '東北', 9: '正南' };
export const PALACE_WX24 = { 1: '水', 2: '土', 3: '木', 4: '木', 6: '金', 7: '金', 8: '土', 9: '火' };

// 自動分析：坐向星、各司其職方位、吉凶分佈、星宮五行生剋
const SHENG24 = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const KE24 = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
export function analyze24(sitM, faceM, method = 'bazhai') {
  const map = star24MapBy(method, sitM);
  const palaceOf = (m) => Object.keys(PALACE_MOUNTAINS24).find((p) => PALACE_MOUNTAINS24[p].includes(m));
  const rows = M24_ORDER.map((m) => {
    const star = map[m];
    const info = STAR24_INFO[star];
    const p = palaceOf(m);
    return { mountain: m, deg: mountainDeg24(m), star, ...info, palace: +p, dir: PALACE_DIR24[p], palaceWx: PALACE_WX24[p] };
  });
  const sitStar = map[sitM], faceStar = map[faceM];
  // 各司其職（重點星方位）
  const duties = [
    { key: '財位', star: '天錢', note: '求財看天錢' },
    { key: '子嗣', star: '天孫', note: '求子看天孫' },
    { key: '功名', star: '文昌', note: '讀書考試看文昌' },
    { key: '規矩', star: '天樞', note: '求官看天樞、文昌' },
    { key: '貴人', star: '輔翼', note: '謀事貴人看輔翼' },
    { key: '升職', star: '從官', note: '升職事業看從官' },
    { key: '田宅', star: '天田', note: '買宅置產看天田' },
    { key: '健康', star: '天璇', note: '健康廚食看天璇（天醫）' },
  ].map((d) => ({ ...d, at: rows.find((r) => r.star === d.star) }));
  const warnings = ['屍氣', '天烽', '貫索', '天賊', '咸池', '捲舌', '玉衡', '搖光']
    .map((s) => rows.find((r) => r.star === s));
  // 星宮五行生剋（只計有五行的星）
  const relations = rows.filter((r) => r.wx).map((r) => {
    let rel;
    if (r.wx === r.palaceWx) rel = '比和';
    else if (SHENG24[r.wx] === r.palaceWx) rel = '星生宮（吉力外洩）';
    else if (SHENG24[r.palaceWx] === r.wx) rel = '宮生星（得力）';
    else if (KE24[r.wx] === r.palaceWx) rel = '星剋宮（相戰）';
    else rel = '宮剋星（受制）';
    return { ...r, rel };
  });
  return { map, rows, sitStar, faceStar, duties, warnings, relations };
}
