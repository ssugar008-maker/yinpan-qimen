// 驗證室內佈局 AI：layoutData 房間→宮位對照、indoorLayout prompt、玄空 prompt 嘅室內區塊
// 用法：node verify_indoor.mjs
import handler from './api/interpret.js';
import { buildIndoorRooms, loadIndoorLayout } from './src/indoor/layoutData.js';
import { xuanKongChart, annualChart, starPair, PALACE_GUA } from './src/xuankong/engine.js';

process.env.AI_API_KEY = 'test-key';
let captured = null;
globalThis.fetch = async (u, o) => { captured = JSON.parse(o.body); return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) }; };
const call = async (body) => { captured = null; let status, json; const res = { status: (s) => { status = s; return res; }, json: (j) => { json = j; return res; } }; await handler({ method: 'POST', body }, res); return { status, json, prompt: captured && captured.messages[1].content }; };

let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → ${JSON.stringify(got)?.slice(0, 250)}` : ''}`); } };

// localStorage polyfill（node 無）
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };

console.log('\n[1] buildIndoorRooms：房間→宮位對照');
// 圖 1000x1000，中心 (500,500)，rot=0。正北（子上）嘅房 → 坎宮
const chart = xuanKongChart(9, '子', '午');
const flow = annualChart(2026);
const layout = {
  sitM: '子', center: { x: 500, y: 500 }, rot: 0,
  rooms: [
    { type: '睡房', x: 500, y: 100, furniture: ['床', '衣櫃'] },   // 正北 → 坎宮
    { type: '廚房', x: 500, y: 900, furniture: [] },              // 正南 → 離宮
    { type: '大門', pts: [{ x: 100, y: 100 }, { x: 100, y: 300 }], furniture: [] }, // 西北一帶
  ],
};
const rooms = buildIndoorRooms(layout, chart, flow);
ok('三間房都有宮位', rooms.length === 3 && rooms.every((r) => r.palaces.length > 0), rooms.map((r) => r.palaces.length));
ok('正北睡房 → 坎宮', rooms[0].palaces[0].palaceName === '坎' && rooms[0].palaces[0].dir === '正北', rooms[0].palaces[0]);
ok('正南廚房 → 離宮', rooms[1].palaces[0].palaceName === '離' && rooms[1].palaces[0].dir === '正南', rooms[1].palaces[0]);
ok('宮位帶玄空組合（山向星＋組合名＋吉凶）', rooms[0].palaces[0].shan != null && !!rooms[0].palaces[0].combo && !!rooms[0].palaces[0].ji, rooms[0].palaces[0]);
ok('宮位帶天星', !!rooms[0].palaces[0].star, rooms[0].palaces[0].star);
ok('房間帶家具', rooms[0].furniture.join(',') === '床,衣櫃', rooms[0].furniture);
ok('組合同直接 starPair 一致', rooms[0].palaces[0].combo === starPair(chart.sG[1], chart.fG[1]).n, rooms[0].palaces[0].combo);

console.log('\n[2] loadIndoorLayout');
ok('無存檔 → null', loadIndoorLayout() === null);
store['mo_indoor_v1'] = JSON.stringify({ img: { url: 'x' }, center: { x: 1, y: 1 }, facingDeg: 180, rot: 0, rooms: [{ type: '睡房', x: 1, y: 1 }] });
ok('有存檔（有圖＋中心＋坐向＋房）→ 返回', !!loadIndoorLayout());
store['mo_indoor_v1'] = JSON.stringify({ img: { url: 'x' }, center: { x: 1, y: 1 }, facingDeg: 180, rot: 0, rooms: [] });
ok('無房間 → null', loadIndoorLayout() === null);

console.log('\n[3] indoorLayout task prompt');
const ind = { sit: '子', face: '午', period: 9, flowYear: 2026, rooms };
let r = await call({ task: 'indoorLayout', indoor: ind });
ok('status 200', r.status === 200, r.status);
ok('prompt 含坐向與房間', r.prompt.includes('子山午向') && r.prompt.includes('睡房') && r.prompt.includes('廚房'), r.prompt.slice(0, 150));
ok('prompt 含宮位組合與天星', r.prompt.includes('坎宮') && r.prompt.includes('天星'), null);
ok('prompt 要求現狀評估＋理想佈局＋化解', r.prompt.includes('現狀評估') && r.prompt.includes('理想佈局') && r.prompt.includes('化解之法'));
ok('prompt 講明廁所宜壓凶位', r.prompt.includes('廁所宜壓凶位'), null);
r = await call({ task: 'indoorLayout', indoor: { sit: '子', rooms: [] } });
ok('無房間 → 400', r.status === 400, r.status);

console.log('\n[4] 玄空 prompt 嘅室內區塊');
const chartPayload = {
  sit: '子', face: '午', period: 9, flowYear: 2026, flowStar: 1, qiXing: '下卦', tiGuaNote: '',
  types: [],
  palaces: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => ({ name: PALACE_GUA[p], dir: '', wx: '', role: '', shan: chart.sG[p], xiang: chart.fG[p], yun: chart.pG[p], flow: flow[p], combo: 'x', ji: '平' })),
};
r = await call({ task: 'xkOverall', chart: chartPayload, indoor: { sit: '子', face: '午', period: 9, flowYear: 2026, rooms } });
ok('玄空 AI 含室內佈局區塊', r.prompt.includes('【室內佈局'), null);
ok('室內區塊要求評估＋化解', r.prompt.includes('邊間房啱位') && r.prompt.includes('化解'), null);
r = await call({ task: 'xkOverall', chart: chartPayload });
ok('無室內資料 → 唔顯示區塊', !r.prompt.includes('【室內佈局'), null);

console.log(`\n${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
