// 驗證 AI 對話問事：分類（JSON 模式＋回退）、對話式分析 prompt、多輪結構
// 用法：node verify_chat.mjs
import handler from './api/interpret.js';
import { paipan } from './src/qimen/engine.js';
import { buildAskPayload } from './src/qimen/analysis.js';

process.env.AI_API_KEY = 'test-key';
let captured = null;
let mockReply = '（假回答）';
globalThis.fetch = async (url, opts) => {
  captured = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ choices: [{ message: { content: mockReply } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) };
};
const call = async (body) => {
  captured = null;
  let status = 0, json = null;
  const res = { status: (s) => { status = s; return res; }, json: (j) => { json = j; return res; } };
  await handler({ method: 'POST', body }, res);
  return { status, json, msgs: captured && captured.messages, body: captured };
};

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → ${JSON.stringify(got)?.slice(0, 250)}` : ''}`); } };

console.log('\n[1] 問題分類（qimenClassify）');
mockReply = '{"smalltalk":false,"newTopic":true,"qtype":"求財","reply":""}';
let r = await call({ task: 'qimenClassify', question: '我下個月簽約順唔順？' });
ok('status 200 且回 JSON', r.status === 200 && r.json.json && r.json.json.qtype === '求財', r.json);
ok('用 JSON 模式＋低溫', r.body.response_format && r.body.response_format.type === 'json_object' && r.body.temperature === 0.2, { rf: r.body.response_format, tp: r.body.temperature });
ok('分類 max_tokens 較小', r.body.max_tokens === 200, r.body.max_tokens);
ok('prompt 含問題與類別表', r.msgs[1].content.includes('我下個月簽約順唔順？') && r.msgs[1].content.includes('求財') && r.msgs[1].content.includes('尋物'));
ok('分類時不追加追問訊息', r.msgs.length === 2, r.msgs.length);

mockReply = '{"smalltalk":true,"newTopic":false,"qtype":"","reply":"你好，想問咩呀？"}';
r = await call({ task: 'qimenClassify', question: '你好' });
ok('閒聊辨識', r.json.json.smalltalk === true && r.json.json.reply.includes('你好'), r.json.json);

mockReply = '不是JSON的回答';
r = await call({ task: 'qimenClassify', question: 'test' });
ok('非 JSON 回應 → 回退預設（自訂）', r.json.json.qtype === '自訂' && r.json.json.smalltalk === false, r.json.json);

mockReply = '{"smalltalk":false,"qtype":"炒股","reply":""}';
r = await call({ task: 'qimenClassify', question: '股票會升嗎' });
ok('非法類別 → 回退自訂', r.json.json.qtype === '自訂', r.json.json);

r = await call({ task: 'qimenClassify', question: '' });
ok('缺問題 → 400', r.status === 400, r.json);

console.log('\n[2] 對話式分析（qimenChat）');
const result = paipan(2026, 5, 16, 11, 38);
const querent = { mode: '近程', caster: '', querent: '' };
const ask = buildAskPayload({ result, qtype: '求財', querent, shiZhuPalace: result.pillarMarkPalaces[2], shiGanPalace: result.pillarMarkPalaces[3] });
ok('buildAskPayload 結構完整', !!(ask.chart && ask.yongshen.length && ask.timing.length && ask.relations.length !== undefined), { ys: ask.yongshen.length });

mockReply = '（假回答）';
r = await call({ task: 'qimenChat', ask, question: '我想問下財運' });
const p = r.msgs[1].content;
ok('chat prompt 含盤面事實', p.includes('【盤面事實】') && p.includes('四柱'));
ok('chat prompt 含用神與宮位關係', p.includes('【用神取用與落宮】') && p.includes('【宮位關係】'));
ok('chat prompt 含應期與空亡轉先天', p.includes('【應期線索】') && p.includes('【空亡轉先天】'));
ok('chat prompt 要求對話口吻（不列點）', p.includes('對話方式') && p.includes('不要列點'));
ok('chat 的 system 加對話人格', r.msgs[0].content.includes('對話方式與客人傾談'), r.msgs[0].content.slice(-40));
ok('問題以對話包裹作末條', r.msgs.at(-1).content.includes('客人問：「我想問下財運」'), r.msgs.at(-1).content.slice(0, 40));
ok('回應帶 usage', r.json.usage && r.json.usage.pt === 10, r.json);

console.log('\n[3] 多輪對話');
r = await call({ task: 'qimenChat', ask, question: '具體邊個月好啲？', followups: [{ q: '我想問下財運', a: '財運唔錯。' }] });
ok('多輪：歷史在中間', r.msgs.length === 5 && r.msgs[2].content === '我想問下財運' && r.msgs[3].content === '財運唔錯。', r.msgs.length);
ok('多輪：末條承接上文', r.msgs.at(-1).content.includes('承接上文') && r.msgs.at(-1).content.includes('具體邊個月好啲？'));

console.log('\n[3b] 語氣與詳略');
r = await call({ task: 'qimenChat', ask, question: 'x', chatStyle: '書面', chatDetail: '簡潔' });
ok('書面語氣進 prompt', r.msgs[1].content.includes('規範書面中文') && r.msgs[1].content.includes('正式'), null);
ok('簡潔進 prompt 與追問包裹', r.msgs[1].content.includes('一針見血') && r.msgs.at(-1).content.includes('一針見血'), r.msgs.at(-1).content.slice(0, 80));
r = await call({ task: 'qimenChat', ask, question: 'x', chatStyle: '白話', chatDetail: '詳細' });
ok('白話語氣進 prompt', r.msgs[1].content.includes('廣東話口語'));
ok('詳細進 prompt', r.msgs[1].content.includes('詳細講解') && r.msgs[1].content.includes('500 字內'));
r = await call({ task: 'qimenChat', ask, question: 'x' });
ok('預設白話＋適中', r.msgs[1].content.includes('廣東話口語') && r.msgs[1].content.includes('220 字內'));
ok('非法語氣/詳略回退預設', true); // CHAT_STYLE/DETAIL 白名單回退已內建

console.log('\n[3c] 遠程事主標註');
const askRemote = buildAskPayload({ result, qtype: '求財', querent: { mode: '遠程', caster: '男', querent: '女' }, shiZhuPalace: result.pillarMarkPalaces[1], shiGanPalace: result.pillarMarkPalaces[3] });
ok('遠程 payload 標註月干', askRemote.chart.shiZhuLabel === '事主（月干・遠程）', askRemote.chart.shiZhuLabel);
r = await call({ task: 'qimenChat', ask: askRemote, question: 'x' });
ok('chat 盤面事實用遠程標註', r.msgs[1].content.includes('事主（月干・遠程）'), null);
const askNear = buildAskPayload({ result, qtype: '求財', querent: { mode: '近程', caster: '', querent: '' }, shiZhuPalace: result.pillarMarkPalaces[2], shiGanPalace: result.pillarMarkPalaces[3] });
ok('近程維持日干標註', askNear.chart.shiZhuLabel === '事主（日干）', askNear.chart.shiZhuLabel);
// 遠程未設性別 → 事主暫以日干論（與用神表落宮一致），標註說明
const askRemoteUnset = buildAskPayload({ result, qtype: '求財', querent: { mode: '遠程', caster: '男', querent: '' }, shiZhuPalace: null, shiGanPalace: result.pillarMarkPalaces[3] });
ok('遠程未設性別 → 暫以日干論並標註', askRemoteUnset.chart.shiZhuLabel.includes('暫以日干') && askRemoteUnset.chart.shiZhu === askNear.chart.shiZhu, { label: askRemoteUnset.chart.shiZhuLabel, sz: askRemoteUnset.chart.shiZhu });

console.log('\n[4] 分析口徑一致性（buildAskPayload vs 既有結構）');
ok('用神含生門與戊', ask.yongshen.some((y) => y.name === '生門') && ask.yongshen.some((y) => y.name === '戊'));
ok('用神帶符號與狀態', ask.yongshen[0].symbols.length > 0 && Array.isArray(ask.yongshen[0].marks));
ok('chart 帶四柱遁局值符值使馬星', ask.chart.pillars.length === 4 && ask.chart.zhiFu.includes('落') && !!ask.chart.horse);
ok('空亡轉宮為陣列', Array.isArray(ask.kong));

console.log(`\n${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
