// 驗證問事解讀／多輪追問／用量回傳：攔截 fetch，檢查送給 AI 的訊息結構與回應
// 用法：node verify_ask.mjs
import handler from './api/interpret.js';
import { paipan } from './src/qimen/engine.js';

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

console.log('\n[4] 問事錯誤處理');
r = await call({ task: 'qimenAsk', ask: { qtype: '自訂', custom: '', chart: {} } });
ok('自訂無問題 → 400', r.status === 400 && r.json.error.includes('請輸入'), r.json);
r = await call({ task: 'qimenAsk', ask: {} });
ok('缺問事資料 → 400', r.status === 400, r.json);

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
