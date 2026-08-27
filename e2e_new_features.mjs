// 新功能 E2E：問事解讀（用神＋應期）、多輪追問、玄空替卦、AI 用量徽章
// AI 呼叫以 request interception 模擬（不耗真 API）。
// 用法：npm i --no-save puppeteer-core && npm run dev（另開 terminal）&& node e2e_new_features.mjs
import puppeteer from 'puppeteer-core';

const URL = process.env.E2E_URL || 'http://localhost:5173/';
let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → 實際：${JSON.stringify(got)?.slice(0, 200)}` : ''}`); } };

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

// 模擬 AI 回應
await page.setRequestInterception(true);
let aiCalls = 0;
page.on('request', (req) => {
  if (req.url().includes('/api/interpret')) {
    aiCalls++;
    // 模擬「伺服器端」回應（usage 已正規化為 pt/ct，與 api/interpret.js 輸出一致）
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: `【測試回答${aiCalls}】此事可成，應在丑月。`, model: 'deepseek-v4-flash', usage: { pt: 100 * aiCalls, ct: 50 } }) });
  } else req.continue();
});

const xp = async (expr) => (await page.$$(`xpath/${expr}`))[0] || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'networkidle2' });
await page.waitForSelector('.grid');

// ── 問事解讀面板 ──
console.log('\n[1] 問事解讀面板（陰盤奇門）');
const askHead = await xp(`//summary[contains(text(),'AI 問事解讀')]`);
ok('問事面板存在', !!askHead);
const askChips = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.ask-panel')][0];
  return [...p.querySelectorAll('.ai-theme-chip')].map((b) => b.textContent.trim());
});
ok('10 個問事類別', askChips.length === 10 && askChips[0] === '求財' && askChips.at(-1) === '自訂', askChips);
const ysRows = await page.evaluate(() => [...document.querySelectorAll('.ask-ys-row')].map((r) => ({
  name: r.querySelector('.ask-ys-name').textContent.trim(),
  palace: r.querySelector('.ask-ys-palace').textContent.trim(),
  marks: [...r.querySelectorAll('.ask-mark')].map((m) => m.textContent.trim()),
})));
ok('求財用神 4 項（生門/戊/日干/時干）', ysRows.length === 4 && ysRows[0].name === '生門' && ysRows[1].name === '戊', ysRows);
ok('用神皆有落宮', ysRows.every((r) => /^落 .+宮$/.test(r.palace)), ysRows);
const timingRows = await page.evaluate(() => [...document.querySelectorAll('.ask-timing-row')].map((r) => r.textContent.trim()));
ok('應期線索至少 3 條', timingRows.length >= 3, timingRows);
ok('應期含宮支推算', timingRows.some((x) => x.includes('宮支') && x.includes('應期多應在')), timingRows);
ok('應期含馬星', timingRows.some((x) => x.includes('馬星')), timingRows);

// 自訂類別
console.log('\n[2] 自訂問事');
await page.evaluate(() => [...document.querySelectorAll('.ask-panel .ai-theme-chip')].find((b) => b.textContent === '自訂').click());
await sleep(150);
let askState = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return { hasInput: !!p.querySelector('.ai-custom-input'), btnDisabled: p.querySelector('.ai-btn').disabled };
});
ok('自訂出現輸入框且按鈕停用', askState.hasInput && askState.btnDisabled, askState);
await page.type('.ask-panel .ai-custom-input', '這筆生意談得成嗎');
await sleep(150);
askState = await page.evaluate(() => ({ btnDisabled: document.querySelector('.ask-panel .ai-btn').disabled, btnText: document.querySelector('.ask-panel .ai-btn').textContent.trim() }));
ok('輸入後按鈕啟用且帶問題', !askState.btnDisabled && askState.btnText.includes('這筆生意談得成嗎'), askState);
await page.evaluate(() => [...document.querySelectorAll('.ask-panel .ai-theme-chip')].find((b) => b.textContent === '求財').click());
await sleep(150);

// 跑 AI 解讀（模擬）＋追問
console.log('\n[3] 問事 AI 解讀＋多輪追問');
await page.evaluate(() => document.querySelector('.ask-panel .ai-btn').click());
await sleep(400);
askState = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return {
    result: p.querySelector('.ai-result')?.textContent.trim() || null,
    saved: !!p.querySelector('.ai-saved'),
    hasFu: !!p.querySelector('.fu-input'),
  };
});
ok('AI 解讀顯示（模擬回應）', askState.result === '【測試回答1】此事可成，應在丑月。', askState.result);
ok('已存檔提示', askState.saved);
ok('追問框出現', askState.hasFu);
await page.type('.ask-panel .fu-input', '具體哪一年？');
await page.evaluate(() => document.querySelector('.ask-panel .fu-send').click());
await sleep(400);
askState = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return {
    q: p.querySelector('.fu-q')?.textContent.trim(),
    a: p.querySelector('.fu-a')?.textContent.trim(),
    lib: JSON.parse(localStorage.getItem('qimen_ask_v1') || '{}'),
  };
});
ok('追問問答顯示', askState.q?.includes('具體哪一年？') && askState.a?.includes('【測試回答2】'), askState);
const askLibEntry = Object.values(askState.lib)[0] || {};
ok('對話串已存檔（thread 1 輪）', Array.isArray(askLibEntry.thread) && askLibEntry.thread.length === 1 && askLibEntry.thread[0].q === '具體哪一年？', askLibEntry);

// 重整後保留
console.log('\n[4] 重整後問事存檔與對話串保留');
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.grid');
await sleep(300);
askState = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return { result: p?.querySelector('.ai-result')?.textContent.trim(), threadQ: p?.querySelector('.fu-q')?.textContent.trim() };
});
ok('重整後解讀與追問仍在', askState.result?.includes('測試回答1') && askState.threadQ?.includes('具體哪一年？'), askState);

// 宮位 modal 追問
console.log('\n[5] 宮位詳情 AI 解讀＋追問');
await page.evaluate(() => { document.querySelectorAll('.grid .cell')[0].click(); });
await sleep(300);
await page.evaluate(() => document.querySelector('.modal .ai-btn').click());
await sleep(400);
let modalState = await page.evaluate(() => ({
  result: document.querySelector('.modal .ai-result')?.textContent.trim() || null,
  hasFu: !!document.querySelector('.modal .fu-input'),
}));
ok('宮位解讀顯示', modalState.result?.includes('測試回答'), modalState.result);
ok('宮位追問框出現', modalState.hasFu);
await page.type('.modal .fu-input', '這物品多少錢？');
await page.evaluate(() => document.querySelector('.modal .fu-send').click());
await sleep(400);
modalState = await page.evaluate(() => ({
  a: document.querySelector('.modal .fu-a')?.textContent.trim(),
  lib: JSON.parse(localStorage.getItem('qimen_ai_library_v1') || '[]'),
}));
ok('宮位追問回答顯示', modalState.a?.includes('測試回答'), modalState.a);
ok('宮位對話串存入 AI 解讀記錄', Array.isArray(modalState.lib[0]?.thread) && modalState.lib[0].thread.length === 1, modalState.lib[0] && { theme: modalState.lib[0].theme, thread: modalState.lib[0].thread });
await page.evaluate(() => document.querySelector('.modal-close').click());
await sleep(200);

// 玄空替卦
console.log('\n[6] 玄空替卦排盤');
await (await xp(`//button[contains(text(),'玄空飛星')]`)).click();
await page.waitForSelector('.xk-grid');
await sleep(200);
const before = await page.evaluate(() => ({
  head: [...document.querySelectorAll('.panel-head')][0].textContent.trim(),
  stars: (() => { const g = document.querySelector('.xk-grid'); return [...g.querySelectorAll('.xk-cell')].map((c) => c.querySelector('.xk-stars')?.textContent.trim() || '').join('|'); })(),
}));
await page.evaluate(() => [...document.querySelectorAll('.xk-qixing .seg button')].find((b) => b.textContent.includes('替卦')).click());
await sleep(300);
const after = await page.evaluate(() => ({
  head: [...document.querySelectorAll('.panel-head')][0].textContent.trim(),
  stars: (() => { const g = document.querySelector('.xk-grid'); return [...g.querySelectorAll('.xk-cell')].map((c) => c.querySelector('.xk-stars')?.textContent.trim() || '').join('|'); })(),
  note: document.querySelector('.xk-tigua-note')?.textContent.trim() || null,
}));
ok('標題變替卦', after.head === '玄空飛星排盤（替卦）', after.head);
ok('替卦盤星曜與下卦不同', before.stars !== after.stars);
ok('替星說明顯示（含經X山）', !!after.note && after.note.includes('替卦起星') && /經.山/.test(after.note), after.note);
// 兼向提示：輸入接近交界度數（子山 0°，兼向界 4.5°）→ 下卦時出現「改用替卦」按鈕
await page.evaluate(() => [...document.querySelectorAll('.xk-qixing .seg button')].find((b) => b.textContent === '下卦').click());
await sleep(200);
await page.evaluate(() => { const i = document.querySelector('.xk-form input[type=number]'); i.value = ''; });
await page.type('.xk-form input[type=number]', '7.4');
await sleep(300);
const jxState = await page.evaluate(() => ({
  warn: document.querySelector('.xk-jx')?.textContent.trim() || null,
  suggest: !!document.querySelector('.xk-tigua-suggest'),
}));
ok('兼向警告出現', !!jxState.warn && jxState.warn.includes('兼向'), jxState);
ok('「改用替卦」按鈕出現', jxState.suggest);
await page.evaluate(() => document.querySelector('.xk-tigua-suggest').click());
await sleep(300);
const afterSuggest = await page.evaluate(() => ({
  head: [...document.querySelectorAll('.panel-head')][0].textContent.trim(),
  note: document.querySelector('.xk-tigua-note')?.textContent.trim() || null,
}));
ok('一鍵改用替卦生效', afterSuggest.head.includes('替卦') && !!afterSuggest.note, afterSuggest.head);

// 玄空 AI＋追問（替卦盤）
console.log('\n[7] 玄空 AI 分析（替卦）＋追問');
await page.evaluate(() => document.querySelector('.panel .ai-btn')?.scrollIntoView());
const xkAiBtn = await xp(`//div[contains(@class,'panel')][.//div[contains(@class,'panel-head') and contains(text(),'AI 風水分析')]]//button[contains(@class,'ai-btn')]`);
await xkAiBtn.click();
await sleep(400);
let xkState = await page.evaluate(() => ({
  result: [...document.querySelectorAll('.panel')].find((x) => x.querySelector('.panel-head')?.textContent.includes('AI 風水分析'))?.querySelector('.ai-result')?.textContent.trim() || null,
}));
ok('玄空 AI 分析顯示', xkState.result?.includes('測試回答'), xkState.result);
const xkPanel = `[...document.querySelectorAll('.panel')].find((x) => x.querySelector('.panel-head')?.textContent.includes('AI 風水分析'))`;
await page.evaluate((sel) => { const p = eval(sel); p.querySelector('.fu-input').value = ''; }, xkPanel);
await page.evaluate(() => {
  const p = [...document.querySelectorAll('.panel')].find((x) => x.querySelector('.panel-head')?.textContent.includes('AI 風水分析'));
  const input = p.querySelector('.fu-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '離宮可以放魚缸嗎');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
await page.evaluate(() => {
  const p = [...document.querySelectorAll('.panel')].find((x) => x.querySelector('.panel-head')?.textContent.includes('AI 風水分析'));
  p.querySelector('.fu-send').click();
});
await sleep(400);
xkState = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.panel')].find((x) => x.querySelector('.panel-head')?.textContent.includes('AI 風水分析'));
  const lib = JSON.parse(localStorage.getItem('xuankong_ai_v1') || '{}');
  const entry = Object.values(lib).find((v) => v && typeof v === 'object' && Array.isArray(v.thread) && v.thread.length > 0);
  return { a: p.querySelector('.fu-a')?.textContent.trim(), thread: entry?.thread || null, qx: entry?.qx || null };
});
ok('玄空追問回答顯示', xkState.a?.includes('測試回答'), xkState.a);
ok('玄空對話串存檔且記起星方式', Array.isArray(xkState.thread) && xkState.thread[0].q === '離宮可以放魚缸嗎' && xkState.qx === '替卦', { thread: xkState.thread, qx: xkState.qx });

// 用量徽章
console.log('\n[8] AI 用量徽章');
const badge = await page.evaluate(() => document.querySelector('.usage-badge')?.textContent.trim() || null);
ok('用量徽章顯示次數', !!badge && /本月 AI：\d+ 次/.test(badge), badge);
ok('次數與模擬呼叫一致', badge && badge.includes(`本月 AI：${aiCalls} 次`), { badge, aiCalls });

console.log('\n[9] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
