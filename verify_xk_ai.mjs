// 驗證玄空 AI 主題 prompt：攔截 fetch，印出實際送給 AI 的 prompt
import handler from './api/interpret.js';
import { GRID, PALACE_DIR, PALACE_GUA, PALACE_WX, STAR_NAME, STAR_WX, xuanKongChart, chartTypes, starPair, remedyText, annualChart, annualStar, oppositeMountain } from './src/xuankong/engine.js';

process.env.AI_API_KEY = 'test-key';

let captured = null;
globalThis.fetch = async (url, opts) => {
  captured = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
};

const sitM = '子', faceM = oppositeMountain(sitM), period = 9, flowYear = 2026;
const chart = xuanKongChart(period, sitM, faceM);
const flow = annualChart(flowYear);
const chartPayload = {
  sit: sitM, face: faceM, period, flowYear, flowStar: annualStar(flowYear),
  types: chartTypes(chart).map((t) => ({ n: t.n, t: t.t })),
  palaces: GRID.map((p) => {
    const c = starPair(chart.sG[p], chart.fG[p]);
    const s = chart.sG[p], f = chart.fG[p];
    return {
      name: PALACE_GUA[p], dir: PALACE_DIR[p], wx: PALACE_WX[p],
      role: p === chart.sitPalace ? '坐山' : p === chart.facePalace ? '向首' : p === 5 ? '中宮' : '',
      shan: s, shanName: STAR_NAME[s], shanWx: STAR_WX[s],
      xiang: f, xiangName: STAR_NAME[f], xiangWx: STAR_WX[f],
      yun: chart.pG[p], yunName: STAR_NAME[chart.pG[p]],
      flow: flow[p], flowName: STAR_NAME[flow[p]],
      combo: c.n, ji: c.t, comboDesc: c.d, remedy: remedyText(c.r),
    };
  }),
};

const call = async (body) => {
  captured = null;
  let status = 0, json = null;
  const res = { status: (s) => { status = s; return res; }, json: (j) => { json = j; return res; } };
  await handler({ method: 'POST', body }, res);
  return { status, json, prompt: captured && captured.messages[1].content };
};

const cases = [
  ['整體・綜合（回歸測試）', { task: 'xkOverall', chart: chartPayload }],
  ['離宮・綜合（回歸測試）', { task: 'xkPalace', chart: chartPayload, palace: '離' }],
  ['離宮・傢俬擺設', { task: 'xkPalace', chart: chartPayload, palace: '離', theme: '傢俬擺設' }],
  ['離宮・顏色', { task: 'xkPalace', chart: chartPayload, palace: '離', theme: '顏色' }],
  ['離宮・形狀材質＋情境', { task: 'xkPalace', chart: chartPayload, palace: '離', theme: '形狀材質', context: '此處為主人房，已放大鏡' }],
  ['離宮・自訂', { task: 'xkPalace', chart: chartPayload, palace: '離', theme: '自訂', custom: '離宮這組合可以放魚缸嗎？' }],
  ['整體・房間用途', { task: 'xkOverall', chart: chartPayload, theme: '房間用途' }],
];

for (const [name, body] of cases) {
  const r = await call(body);
  console.log(`\n${'='.repeat(70)}\n### ${name} → status ${r.status}\n${'='.repeat(70)}`);
  console.log(r.prompt || JSON.stringify(r.json));
}

// 錯誤處理
console.log('\n--- 錯誤處理 ---');
console.log('自訂但無問題:', JSON.stringify((await call({ task: 'xkPalace', chart: chartPayload, palace: '離', theme: '自訂' })).json));
console.log('無宮位:', JSON.stringify((await call({ task: 'xkPalace', chart: chartPayload, theme: '顏色' })).json));
console.log('無盤:', JSON.stringify((await call({ task: 'xkPalace', palace: '離' })).json));
