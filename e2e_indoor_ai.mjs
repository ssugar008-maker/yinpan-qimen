// 室內佈局 AI E2E：室內分頁「AI 佈局分析＋化解」＋玄空 AI 自動帶入已標注房間
// 用法：npm i --no-save puppeteer-core && npm run dev（另開 terminal）&& node e2e_indoor_ai.mjs
import puppeteer from 'puppeteer-core';

const URL = process.env.E2E_URL || 'http://localhost:5173/';
let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → 實際：${JSON.stringify(got)?.slice(0, 250)}` : ''}`); } };

// 1x1 白 PNG
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// 預設已校準佈局：坐子向午（facingDeg 180），中心手動 (500,500)，兩間房
const SEED = {
  img: { url: PNG_1PX, w: 1000, h: 1000 },
  pins: [], centerMethod: 'manual', manualCenter: { x: 500, y: 500 },
  refLine: { x1: 500, y1: 500, x2: 500, y2: 900 }, refDegree: '180', rot: 0, decl: 0,
  showCompass: true, opacity: 0.9, compassSize: 1, layers: { mountains: true, trigrams: true, degrees: false, extend: true, stars24: false },
  rooms: [
    { x: 500, y: 100, type: '主人房', furniture: ['床', '衣櫃'] },  // 正北 → 坎宮
    { x: 500, y: 900, type: '廚房', furniture: [] },               // 正南 → 離宮
  ],
  center: { x: 500, y: 500 }, facingDeg: 180,
};

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
let lastIndoor = null, lastXk = null;
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/api/interpret')) {
    let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch { }
    if (b.task === 'indoorLayout') lastIndoor = b;
    if (b.task === 'xkOverall' || b.task === 'xkPalace') lastXk = b;
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '【佈局分析】主人房喺坎宮得地…', model: 'deepseek-v4-flash', usage: { pt: 100, ct: 50 } }) });
  } else if (req.url().includes('/api/library')) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  } else req.continue();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 注入種子（用字串模板代入）
await page.evaluateOnNewDocument(`localStorage.setItem('mo_indoor_v1', '${JSON.stringify(SEED).replace(/'/g, "\\'")}');`);

await page.goto(URL, { waitUntil: 'networkidle2' });
await page.waitForSelector('.tabs');

console.log('\n[1] 室內分頁：AI 佈局分析按鈕');
await (await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'室內')]"))[0].click();
await page.waitForSelector('.indoor');
await sleep(600);
let st = await page.evaluate(() => ({
  rooms: document.querySelectorAll('.indoor-room').length,
  aiBtn: !!document.querySelector('.indoor-ai .ai-btn'),
  aiBtnText: document.querySelector('.indoor-ai .ai-btn')?.textContent.trim() || null,
}));
ok('兩間房載入', st.rooms === 2, st.rooms);
ok('AI 佈局分析按鈕出現', st.aiBtn && st.aiBtnText.includes('AI 佈局分析'), st.aiBtnText);

console.log('\n[2] 跑 AI 佈局分析（模擬）');
await page.evaluate(() => document.querySelector('.indoor-ai .ai-btn').click());
await sleep(500);
st = await page.evaluate(() => ({
  result: document.querySelector('.indoor-ai .ai-result')?.innerText.trim() || null,
  saved: !!document.querySelector('.indoor-ai .ai-saved'),
  hasFu: !!document.querySelector('.indoor-ai .fu-input'),
}));
ok('分析結果顯示', st.result && st.result.includes('佈局分析'), st.result);
ok('已存檔＋可追問', st.saved && st.hasFu);
ok('payload 係 indoorLayout 且有兩間房', lastIndoor && lastIndoor.task === 'indoorLayout' && lastIndoor.indoor.rooms.length === 2, lastIndoor && lastIndoor.task);
ok('房間帶宮位組合（坎宮/離宮）', lastIndoor && lastIndoor.indoor.rooms[0].palaces.some((p) => p.palaceName === '坎') && lastIndoor.indoor.rooms[1].palaces.some((p) => p.palaceName === '離'), lastIndoor && lastIndoor.indoor.rooms.map((r) => r.palaces.map((p) => p.palaceName)));
ok('房間帶家具', lastIndoor && lastIndoor.indoor.rooms[0].furniture.join(',') === '床,衣櫃', lastIndoor && lastIndoor.indoor.rooms[0].furniture);

console.log('\n[3] 玄空 AI 自動帶入已標注房間（坐向一致）');
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('玄空飛星')).click());
await sleep(1200);
ok('玄空分頁載入', await page.evaluate(() => !!document.querySelector('.xk-grid')));
// 玄空預設坐子山（與室內坐向一致）→ 跑整體 AI
await page.evaluate(() => {
  const det = [...document.querySelectorAll('.panel')].find((x) => x.querySelector('.panel-head')?.textContent.includes('AI 風水分析'));
  det.querySelector('.ai-btn').click();
});
await sleep(500);
ok('玄空 AI 請求帶 indoor 佈局', lastXk && lastXk.indoor && Array.isArray(lastXk.indoor.rooms) && lastXk.indoor.rooms.length === 2, lastXk && { hasIndoor: !!lastXk.indoor, rooms: lastXk.indoor && lastXk.indoor.rooms && lastXk.indoor.rooms.length });
ok('indoor 房間帶宮位組合', lastXk && lastXk.indoor.rooms[0].palaces[0].combo !== undefined, lastXk && lastXk.indoor.rooms[0].palaces[0]);

console.log('\n[4] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
