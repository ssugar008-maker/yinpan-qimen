// 驗證問事解讀／多輪追問／用量回傳／感情婚姻合干取用：攔截 fetch，檢查送給 AI 的訊息結構與回應
// 用法：node verify_ask.mjs
import handler from './api/interpret.js';
import { paipan } from './src/qimen/engine.js';
import { shiZhuStem, loveYongShen, stemPalace, kongShift, XIANTIAN_SHIFT, palaceRelation, palaceHarms, findFacts, detectFuFan } from './src/qimen/ask.js';

process.env.AI_API_KEY = 'test-key';

let captured = null;
globalThis.fetch = async (url, opts) => {
  captured = JSON.parse(opts.body);
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '（假回答）此事可成，應在丑月。' } }],
      usage: { prompt_tokens: 1234, completion_tokens: 56, total_tokens: 1290 },
    }),
  };
};

const call = async (body) => {
  captured = null;
  let status = 0, json = null;
  const res = { status: (s) => { status = s; return res; }, json: (j) => { json = j; return res; } };
  await handler({ method: 'POST', body }, res);
  return { status, json, msgs: captured && captured.messages };
};

// 用真實引擎起盤（2026-05-16 11:38，與 repo 參考盤相同）
const result = paipan(2026, 5, 16, 11, 38);
const PALACE_NAME = { 1: '坎一宮', 2: '坤二宮', 3: '震三宮', 4: '巽四宮', 5: '中五宮', 6: '乾六宮', 7: '兌七宮', 8: '艮八宮', 9: '離九宮' };
const findDoor = (d) => [1, 2, 3, 4, 6, 7, 8, 9].find((p) => result.palaces[p].door === d);
const findStem = (s) => [1, 2, 3, 4, 6, 7, 8, 9].find((p) => (result.palaces[p].tianGan || []).includes(s));

const shengMen = findDoor('生门'), wu = findStem('戊');
const askPayload = {
  task: 'qimenAsk',
  ask: {
    qtype: '求財', custom: '',
    chart: {
      pillars: result.pillars, dun: result.dun, ju: result.ju, xunShou: result.xunShou,
      kong: result.xunKong[3].join(''), kongPalaces: result.kongPalaces.map((p) => PALACE_NAME[p]).join('、'),
      zhiFu: `${result.zhiFu.star} 落${PALACE_NAME[result.zhiFu.palace]}`,
      zhiShi: `${result.zhiShi.door} 落${PALACE_NAME[result.zhiShi.palace]}`,
      horse: `${result.horse.zhi}（落${PALACE_NAME[result.horse.palace]}）`,
      fuFan: '',
      shiZhu: PALACE_NAME[result.pillarMarkPalaces[2]], shiGan: PALACE_NAME[result.pillarMarkPalaces[3]],
    },
    yongshen: [
      { name: '生門', role: '財利、利潤', palace: PALACE_NAME[shengMen], wx: '土', branches: '丑寅', marks: ['門迫'], symbols: [{ label: '八門', name: '生門', meaning: '生機勃勃、求財置產', attrs: ['土', '生長', '財利'] }] },
      { name: '戊', role: '資本、錢財', palace: PALACE_NAME[wu], wx: '金', branches: '戌亥', marks: [], symbols: [{ label: '天盤干', name: '戊', meaning: '資本錢財', attrs: ['土', '資本'] }] },
    ],
    timing: ['主用神「生門」落艮八宮，宮支丑寅 → 應期多應在丑、寅之月或日', '九星反吟 → 應期快速但多反覆'],
  },
};

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → ${JSON.stringify(got)?.slice(0, 300)}` : ''}`); } };

// ── 感情婚姻：合干取用（使用者指定規則，用其實例驗證）──
console.log('\n[0] 感情婚姻用神（合干／值符甲己／桃花）');
const noMarks = () => [];
// 使用者實例：2026-05-28 01:22，日柱壬寅、月柱癸巳
const loveChart = paipan(2026, 5, 28, 1, 22);
ok('實例四柱正確（壬寅日、癸巳月）', loveChart.pillars[2] === '壬寅' && loveChart.pillars[1] === '癸巳', loveChart.pillars);
// 遠程：開盤人男、問事人女（不同性別不換陰陽）→ 月干癸落震三宮
const szRemote = shiZhuStem(loveChart, { mode: '遠程', caster: '男', querent: '女' });
ok('遠程（男開女問）事主=癸 落震三宮', szRemote && szRemote.stem === '癸' && szRemote.palace === 3, szRemote);
let rows = loveYongShen(loveChart, szRemote, loveChart.pillarMarkPalaces[3], noMarks);
ok('遠程對方=戊（戊癸合）落兌七宮', rows[1] && rows[1].disp === '對方 戊' && rows[1].palace === 7, rows[1]);
ok('遠程含六合與時干', rows.some((r) => r.disp === '六合') && rows.some((r) => r.disp.startsWith('時干')), rows.map((r) => r.disp));
ok('值符不在事主/對方宮 → 無己情人列', !rows.some((r) => r.disp === '己'), rows.map((r) => r.disp));
// 近程：日干壬落坤二宮，對方=丁（丁壬合）落巽四宮
const szNear = shiZhuStem(loveChart, { mode: '近程', caster: '', querent: '' });
ok('近程事主=壬 落坤二宮', szNear && szNear.stem === '壬' && szNear.palace === 2, szNear);
rows = loveYongShen(loveChart, szNear, loveChart.pillarMarkPalaces[3], noMarks);
ok('近程對方=丁（丁壬合）落巽四宮', rows[1] && rows[1].disp === '對方 丁' && rows[1].palace === 4, rows[1]);
ok('事主宮見丙 → 桃花標註', rows[0].marks.some((m) => m.includes('見丙')), rows[0].marks);
ok('對方宮見丁 → 桃花標註', rows[1].marks.some((m) => m.includes('見丁')), rows[1].marks);
// 遠程同性別（女開女問）→ 月干癸換陰陽為壬 → 事主壬落坤二宮、對方丁
const szSame = shiZhuStem(loveChart, { mode: '遠程', caster: '女', querent: '女' });
ok('遠程同性別換陰陽：事主=壬 落坤二宮', szSame && szSame.stem === '壬' && szSame.palace === 2, szSame);
// 遠程未設定性別 → 無事主，給提示列
rows = loveYongShen(loveChart, shiZhuStem(loveChart, { mode: '遠程', caster: '', querent: '' }), null, noMarks);
ok('遠程未設性別 → 提示列且無落宮', rows.length === 1 && rows[0].palace === null && rows[0].role.includes('性別'), rows[0]);
// 值符為甲→甲己合：找一個對方宮見值符的盤，應出現己（情人）列
let found = null;
for (let d = 1; d <= 28 && !found; d++) for (const h of [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]) {
  const r0 = paipan(2026, 6, d, h, 0);
  const sz = shiZhuStem(r0, { mode: '近程', caster: '', querent: '' });
  if (!sz) continue;
  const he = { 甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊' }[sz.stem];
  const heP = he === '甲' ? r0.zhiFu.palace : stemPalace(r0, he);
  if (heP && heP === r0.zhiFu.palace && he !== '己' && sz.stem !== '己') { found = { r0, sz, he, heP, when: `6/${d} ${h}:00` }; break; }
}
ok('找到對方宮見值符的測試盤', !!found, null);
if (found) {
  const loveRows = loveYongShen(found.r0, found.sz, found.r0.pillarMarkPalaces[3], noMarks);
  const jiRow = loveRows.find((r) => r.disp === '己');
  ok(`對方宮見值符（${found.when}，事主${found.sz.stem}、對方${found.he}）→ 己情人列出現`, !!jiRow && jiRow.role.includes('甲己相合'), loveRows.map((r) => r.disp));
  ok('己列落宮=己實際落宮', jiRow && jiRow.palace === stemPalace(found.r0, '己'), jiRow);
}
// 合干為甲 → 對方以值符論
let jiaCase = null;
for (let d = 1; d <= 28 && !jiaCase; d++) for (const h of [1, 7, 13, 19]) {
  const r0 = paipan(2026, 7, d, h, 0);
  const sz = shiZhuStem(r0, { mode: '近程', caster: '', querent: '' });
  if (sz && sz.stem === '己') { jiaCase = { r0, sz }; break; }
}
if (jiaCase) {
  const loveRows = loveYongShen(jiaCase.r0, jiaCase.sz, jiaCase.r0.pillarMarkPalaces[3], noMarks);
  ok('事主為己 → 對方=甲（值符宮）', loveRows[1] && loveRows[1].disp === '對方 甲（值符）' && loveRows[1].palace === jiaCase.r0.zhiFu.palace, loveRows[1]);
  ok('事主為己時不再重複列己', !loveRows.some((r) => r.disp === '己'), loveRows.map((r) => r.disp));
}

// ── 空亡轉先天＋四害關係＋尋物推算 ──
console.log('\n[0b] 空亡轉先天／四害關係／尋物推算');
const PN = { 1: '坎一宮', 2: '坤二宮', 3: '震三宮', 4: '巽四宮', 5: '中五宮', 6: '乾六宮', 7: '兌七宮', 8: '艮八宮', 9: '離九宮' };
const pf = (p) => PN[p];
// 使用者例：坤的先天在坎、震的先天在艮
ok('先天轉宮表：坤→坎、震→艮', XIANTIAN_SHIFT[2] === 1 && XIANTIAN_SHIFT[3] === 8, { 2: XIANTIAN_SHIFT[2], 3: XIANTIAN_SHIFT[3] });
ok('先天轉宮表完整（離→震、坎→兌、兌→巽、巽→坤、乾→離、艮→乾）',
  XIANTIAN_SHIFT[9] === 3 && XIANTIAN_SHIFT[1] === 7 && XIANTIAN_SHIFT[7] === 4 && XIANTIAN_SHIFT[4] === 2 && XIANTIAN_SHIFT[6] === 9 && XIANTIAN_SHIFT[8] === 6);
// 預設盤（2026-05-16 11:38）：申酉空 → 坤二、兌七空亡
const r0 = paipan(2026, 5, 16, 11, 38);
ok('預設盤空亡宮＝坤二、兌七', JSON.stringify([...r0.kongPalaces].sort()) === JSON.stringify([2, 7]), r0.kongPalaces);
const ks2 = kongShift(r0, 2);
ok('坤二空亡 → 轉坎一（非雙空亡）', ks2 && ks2.to === 1 && ks2.double === false, ks2);
const ks7 = kongShift(r0, 7);
ok('兌七空亡 → 轉巽四', ks7 && ks7.to === 4 && ks7.double === false, ks7);
ok('坎一不空亡 → 無轉宮', kongShift(r0, 1) === null);
// 找一個寅卯空的盤 → 震三空亡轉艮八，艮八亦空 → 雙空亡（使用者例）
let dbl = null;
for (let d = 1; d <= 28 && !dbl; d++) for (let h = 0; h < 24 && !dbl; h += 2) {
  const rr = paipan(2026, 6, d, h, 0);
  if (rr.xunKong[3].join('') === '寅卯') { dbl = rr; }
}
ok('找到寅卯空的盤', !!dbl);
if (dbl) {
  const ks3 = kongShift(dbl, 3);
  ok('震三空亡 → 轉艮八且雙空亡', ks3 && ks3.to === 8 && ks3.double === true, ks3);
}
// 四害關係強弱
const harms = {};
[1, 2, 3, 4, 6, 7, 8, 9].forEach((p) => { harms[p] = palaceHarms(r0, p); });
ok('坤二宮四害含空亡', harms[2].includes('空亡'), harms[2]);
ok('坎一宮四害含門迫', harms[1].includes('門迫'), harms[1]);
// 坤（土，空亡）剋 坎（水，門迫）→ 兩宮皆害 → 如隔世界
let rel = palaceRelation(r0, 2, 1, '用神', '事主', pf);
ok('坤剋坎＋兩宮皆害 → 如隔世界', rel.includes('剋') && rel.includes('如隔世界'), rel);
// 找「主動方無害、受方有害」的生剋對 → 關係更強
let strongCase = null, weakCase = null, biheCase = null;
const palaces = [1, 2, 3, 4, 6, 7, 8, 9];
const wxOf = (p) => ({ 1: '水', 2: '土', 3: '木', 4: '木', 6: '金', 7: '金', 8: '土', 9: '火' })[p];
const KE5 = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const SHENG5 = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
for (const a of palaces) for (const b of palaces) {
  if (a === b) continue;
  const acts = KE5[wxOf(a)] === wxOf(b) || SHENG5[wxOf(a)] === wxOf(b);
  if (!acts) continue;
  if (!harms[a].length && harms[b].length && !strongCase) strongCase = [a, b];
  if (harms[a].length && !harms[b].length && !weakCase) weakCase = [a, b];
}
for (const a of palaces) for (const b of palaces) {
  if (a !== b && wxOf(a) === wxOf(b) && !biheCase) biheCase = [a, b];
}
ok('存在「主動方無害、受方有害」之例', !!strongCase);
if (strongCase) {
  rel = palaceRelation(r0, strongCase[0], strongCase[1], '甲宮', '乙宮', pf);
  ok('主動方無害＋受方有害 → 關係更強', rel.includes('更強'), rel);
}
ok('存在「主動方有害、受方無害」之例', !!weakCase);
if (weakCase) {
  rel = palaceRelation(r0, weakCase[0], weakCase[1], '甲宮', '乙宮', pf);
  ok('主動方有害 → 力不從心', rel.includes('力不從心'), rel);
}
if (biheCase) {
  rel = palaceRelation(r0, biheCase[0], biheCase[1], '甲宮', '乙宮', pf);
  ok('同五行 → 比和', rel.includes('比和'), rel);
}
ok('同宮 → null', palaceRelation(r0, 2, 2, 'A', 'B', pf) === null);
// 尋物推算：預設盤時干壬落離九、日干庚落坎一
const ff = findFacts(r0, r0.pillarMarkPalaces[3], r0.pillarMarkPalaces[2]);
ok('尋物：事主宮（水）剋物品宮（火）→ 容易找到', ff.relation.includes('剋') && ff.ease === '容易找到', ff);
ok('尋物：離九與坎一對宮 → 相隔最遠', ff.distance.includes('對宮'), ff.distance);
ok('尋物：快慢有伏吟/反吟/平常判定', /伏吟|反吟|平常/.test(ff.speed), ff.speed);

console.log('\n[1] 問事全盤解讀 prompt');
let r = await call(askPayload);
const prompt = r.msgs[1].content;
ok('status 200', r.status === 200, r.status);
ok('含問事類別', prompt.includes('問事類別：「求財」'));
ok('含四柱與局數', /[阴陰陽阳]遁\d局/.test(prompt), prompt.slice(0, 120));
ok('含值符值使', prompt.includes('值符') && prompt.includes('值使'));
ok('含用神落宮', prompt.includes(`生門（財利、利潤）落 ${PALACE_NAME[shengMen]}`));
ok('含用神狀態標記', prompt.includes('狀態：門迫'));
ok('含應期線索', prompt.includes('應期多應在丑、寅之月或日'));
ok('含應期判斷指引', prompt.includes('應期判斷'));
ok('只有 system+user 兩條（無追問時）', r.msgs.length === 2, r.msgs.length);
ok('回應帶 model', r.json.model === 'deepseek-v4-flash', r.json.model);
ok('回應帶 usage', r.json.usage && r.json.usage.pt === 1234 && r.json.usage.ct === 56, r.json.usage);

console.log('\n[2] 多輪追問訊息結構');
r = await call({
  ...askPayload,
  question: '具體是哪一年？',
  followups: [
    { q: '財從哪來？', a: '從房地產而來。' },
    { q: '金額大嗎？', a: '中等。' },
  ],
});
ok('status 200', r.status === 200, r.status);
// [0]system [1]盤面 [2]問1 [3]答1 [4]問2 [5]答2 [6]本次追問
ok('訊息數 = system + 盤面 + 2輪歷史 + 本次追問 = 7', r.msgs.length === 7, r.msgs.length);
ok('首輪歷史角色正確', r.msgs[2].role === 'user' && r.msgs[2].content === '財從哪來？' && r.msgs[3].role === 'assistant' && r.msgs[3].content === '從房地產而來。');
ok('第二輪歷史正確', r.msgs[4].role === 'user' && r.msgs[4].content === '金額大嗎？' && r.msgs[5].role === 'assistant' && r.msgs[5].content === '中等。');
ok('末條為追問且帶承接指引', r.msgs[6].role === 'user' && r.msgs[6].content.includes('追問：「具體是哪一年？」') && r.msgs[6].content.includes('承接上文'));

console.log('\n[3] 追問防護');
r = await call({ ...askPayload, question: 'x', followups: [{ q: 'bad', a: null }, { q: 1, a: 'bad' }, { q: '好問題', a: '好回答' }] });
ok('非法歷史被過濾（只留 1 輪 → 5 條）', r.msgs.length === 5, r.msgs.length);
const longQ = '長'.repeat(600);
r = await call({ ...askPayload, question: longQ });
ok('追問截斷至 500 字', r.msgs.at(-1).content.length < 700, r.msgs.at(-1).content.length);

console.log('\n[4] 問事錯誤處理＋感情婚姻類別指引');
r = await call({ task: 'qimenAsk', ask: { qtype: '自訂', custom: '', chart: {} } });
ok('自訂無問題 → 400', r.status === 400 && r.json.error.includes('請輸入'), r.json);
r = await call({ task: 'qimenAsk', ask: {} });
ok('缺問事資料 → 400', r.status === 400, r.json);
r = await call({
  task: 'qimenAsk',
  ask: { qtype: '感情婚姻', custom: '', chart: { pillars: [], dun: '陰', ju: 1 }, yongshen: [{ name: '對方 戊', role: '另一半（癸戊相合）', palace: '兌七宮', wx: '金', branches: '酉', marks: [], symbols: [] }], timing: [] },
});
ok('感情婚姻 prompt 含類別指引', r.msgs[1].content.includes('【類別指引】') && r.msgs[1].content.includes('天干五合') && r.msgs[1].content.includes('值符為甲'));
ok('感情婚姻 prompt 含桃花規則', r.msgs[1].content.includes('見乙、丙、丁主易有桃花'));
r = await call(askPayload);
ok('求財不帶類別指引', !r.msgs[1].content.includes('【類別指引】'));
// 尋物與自選用神指引＋新區塊
r = await call({
  task: 'qimenAsk',
  ask: {
    qtype: '尋物', custom: '', chart: { pillars: [], dun: '陽', ju: 2 },
    yongshen: [{ name: '時干 壬', role: '遺失物品', palace: '離九宮', wx: '火', branches: '午', marks: [], symbols: [] }],
    timing: [], facts: ['兩宮生克：事主宮（水）剋物品宮（火） → 容易找到', '距離：對宮（相隔最遠）'],
    relations: ['時干 壬（離九宮，屬火，無四害） 剋 日干 庚（坎一宮，屬水，門迫）。主動方帶四害（門迫）→ 剋而力不從心，作用大打折扣'],
    kong: [{ who: '日干 庚', from: '坤二宮', to: '坎一宮', double: false, toSymbols: [{ label: '宮位', name: '坎一宮', meaning: '北方', attrs: ['水'] }] }],
  },
});
ok('尋物 prompt 含尋物斷法指引', r.msgs[1].content.includes('尋物斷法') && r.msgs[1].content.includes('時干所落之宮代表遺失物品'));
ok('prompt 含推算依據區塊', r.msgs[1].content.includes('【推算依據】') && r.msgs[1].content.includes('容易找到'));
ok('prompt 含宮位關係區塊與四害規則', r.msgs[1].content.includes('【宮位關係】') && r.msgs[1].content.includes('力不從心'));
ok('prompt 含空亡轉先天區塊', r.msgs[1].content.includes('【空亡轉先天】') && r.msgs[1].content.includes('八成信息轉至其先天位（坎一宮）'));
r = await call({ task: 'qimenAsk', ask: { qtype: '自選用神', custom: '', chart: { pillars: [], dun: '陽', ju: 2 }, yongshen: [{ name: '生門（這間房子）', role: '這間房子', palace: '艮八宮', wx: '土', branches: '丑寅', marks: [], symbols: [] }], timing: [] } });
ok('自選用神 prompt 含指引', r.msgs[1].content.includes('使用者自行指定了用神'));
r = await call({ task: 'qimenAsk', ask: { qtype: '求財', chart: { pillars: [], dun: '陽', ju: 2 }, yongshen: [], timing: [] } });
ok('無新資料時區塊顯示空註', r.msgs[1].content.includes('（無空亡轉宮）') && r.msgs[1].content.includes('（各宮無直接生剋或同宮）'));

console.log('\n[5] 玄空替卦 payload 進 prompt');
r = await call({
  task: 'xkOverall',
  chart: {
    sit: '壬', face: '丙', period: 8, flowYear: 2026, flowStar: 1, qiXing: '替卦',
    tiGuaNote: '山星原4入中，兼向替為6入中（經辰山，逆飛）；向星原3入中，替為1入中（經甲山，順飛）',
    types: [], palaces: [{ name: '坎', dir: '正北', shan: 1, xiang: 2, yun: 3, flow: 4, combo: '測試', ji: '平' }],
  },
});
ok('標題為替卦', r.msgs[1].content.includes('玄空飛星（替卦）陽宅盤'));
ok('含替卦起星說明', r.msgs[1].content.includes('山星原4入中，兼向替為6入中'));
r = await call({ task: 'xkOverall', chart: { sit: '子', face: '午', period: 9, types: [], palaces: [{ name: '坎', dir: '正北', shan: 1, xiang: 2, yun: 3, combo: 'x', ji: '平' }] } });
ok('下卦時不帶替卦字樣', r.msgs[1].content.includes('（下卦）') && !r.msgs[1].content.includes('替卦起星'));

console.log(`\n${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
