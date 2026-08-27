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
ok('12 個問事類別（含尋物、自選用神）', askChips.length === 12 && askChips[0] === '求財' && askChips.includes('尋物') && askChips.includes('自選用神') && askChips.at(-1) === '自訂', askChips);
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

// 感情婚姻：合干取用（預設盤 2026-05-16 11:38 近程，日干庚）
console.log('\n[2b] 感情婚姻：對方＝事主合干');
await page.evaluate(() => [...document.querySelectorAll('.ask-panel .ai-theme-chip')].find((b) => b.textContent === '感情婚姻').click());
await sleep(200);
const loveRows = async () => page.evaluate(() => [...document.querySelectorAll('.ask-ys-row')].map((r) => ({
  name: r.querySelector('.ask-ys-name').textContent.trim(),
  role: r.querySelector('.ask-ys-role').textContent.trim(),
  palace: r.querySelector('.ask-ys-palace').textContent.trim(),
  marks: [...r.querySelectorAll('.ask-mark')].map((m) => m.textContent.trim()),
})));
let rows = await loveRows();
ok('近程事主=日干庚', rows[0].name === '事主 庚' && rows[0].palace.startsWith('落 '), rows[0]);
ok('對方=乙（乙庚合），非固定乙庚取用', rows[1].name === '對方 乙' && rows[1].role.includes('庚乙相合') && rows[1].palace.startsWith('落 '), rows[1]);
ok('含六合與時干列', rows.some((r) => r.name === '六合') && rows.some((r) => r.name.startsWith('時干')), rows.map((r) => r.name));
// 切遠程（未設性別）→ 提示列
await page.evaluate(() => [...document.querySelectorAll('.querent-bar .seg')][0].querySelectorAll('button')[1].click()); // 遠程
await sleep(250);
rows = await loveRows();
ok('遠程未設性別 → 提示未落盤', rows.length === 1 && rows[0].palace === '未落盤' && rows[0].role.includes('性別'), rows);
// 設定 開盤人男／問事人女（不同性別不換陰陽）→ 月干癸為事主、對方戊
await page.evaluate(() => [...document.querySelectorAll('.querent-bar .seg')][1].querySelectorAll('button')[0].click()); // 開盤人 男
await page.evaluate(() => [...document.querySelectorAll('.querent-bar .seg')][2].querySelectorAll('button')[1].click()); // 問事人 女
await sleep(250);
rows = await loveRows();
ok('遠程男開女問 → 事主=癸', rows[0].name === '事主 癸' && rows[0].palace.startsWith('落 '), rows[0]);
ok('對方=戊（戊癸合）', rows[1].name === '對方 戊' && rows[1].role.includes('癸戊相合'), rows[1]);
// 同性別（女開女問）→ 癸換陰陽為壬、對方丁
await page.evaluate(() => [...document.querySelectorAll('.querent-bar .seg')][1].querySelectorAll('button')[1].click()); // 開盤人 女
await sleep(250);
rows = await loveRows();
ok('遠程同性別換陰陽 → 事主=壬、對方=丁', rows[0].name === '事主 壬' && rows[1].name === '對方 丁', rows.map((r) => r.name));
// 還原：近程
await page.evaluate(() => [...document.querySelectorAll('.querent-bar .seg')][0].querySelectorAll('button')[0].click());
await sleep(200);
await page.evaluate(() => [...document.querySelectorAll('.ask-panel .ai-theme-chip')].find((b) => b.textContent === '求財').click());
await sleep(150);

// 尋物類別（併入問事）＋宮位關係＋空亡轉宮
console.log('\n[2c] 尋物類別（併入問事面板）');
ok('獨立尋物面板已移除', await page.evaluate(() => !document.querySelector('.find-panel')));
await page.evaluate(() => [...document.querySelectorAll('.ask-panel .ai-theme-chip')].find((b) => b.textContent === '尋物').click());
await sleep(200);
let findState = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  const heads = [...p.querySelectorAll('.xk-sec-head')].map((h) => h.textContent.trim());
  const rows = [...p.querySelectorAll('.ask-ys-row')].map((r) => r.querySelector('.ask-ys-name').textContent.trim());
  const factRows = [...p.querySelectorAll('.ask-timing-row')].map((r) => r.textContent.trim());
  return { heads, rows, factRows, btn: p.querySelector('.ai-btn').textContent.trim() };
});
ok('尋物用神＝時干（物品）＋日干（事主）＋馬星', findState.rows.some((x) => x.startsWith('時干')) && findState.rows.some((x) => x.startsWith('日干')) && findState.rows.some((x) => x.startsWith('馬星')), findState.rows);
ok('尋物顯示推算依據（生克/快慢/距離）', findState.heads.some((h) => h.includes('推算依據')) && findState.factRows.some((x) => x.includes('容易找到') || x.includes('較難找到') || x.includes('費力')), findState.factRows);
ok('按鈕為尋物解讀', findState.btn.includes('尋物'), findState.btn);

console.log('\n[2d] 宮位關係（五行×四害）與空亡轉宮標註');
// 預設盤申酉空 → 坤二、兌七空亡；求財用神戊落宮等會帶標註。先看求財
await page.evaluate(() => [...document.querySelectorAll('.ask-panel .ai-theme-chip')].find((b) => b.textContent === '求財').click());
await sleep(200);
let relState = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  const heads = [...p.querySelectorAll('.xk-sec-head')].map((h) => h.textContent.trim());
  const relRows = [...p.querySelectorAll('.ask-timing-row')].map((r) => r.textContent.trim());
  const marks = [...p.querySelectorAll('.ask-mark')].map((m) => m.textContent.trim());
  return { heads, relRows, marks };
});
ok('顯示宮位關係區塊', relState.heads.some((h) => h.includes('宮位關係')), relState.heads);
ok('宮位關係含五行與四害狀態', relState.relRows.some((x) => x.includes('屬') && (x.includes('四害') || x.includes('無四害'))), relState.relRows.slice(0, 2));
// 預設盤空亡宮為坤二、兌七：求財用神戊落震三（門迫擊刑），生門落離九…檢查是否有任一用神空亡標註（依盤而定）
console.log('    （求財用神標記：', relState.marks.join('、') || '無', '）');

console.log('\n[2e] 自選用神');
await page.evaluate(() => [...document.querySelectorAll('.ask-panel .ai-theme-chip')].find((b) => b.textContent === '自選用神').click());
await sleep(200);
let c2 = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return {
    rows: p.querySelectorAll('.ask-c2-row').length,
    btnDisabled: p.querySelector('.ai-btn').disabled,
    hasAdd: !!p.querySelector('.ask-c2-add'),
  };
});
ok('自選用神預設一列＋可加', c2.rows === 1 && c2.hasAdd, c2);
ok('未填代表意義時按鈕停用', c2.btnDisabled === true, c2);
// 填代表意義 → 啟用；用神表出現該用神＋參照宮
await page.evaluate(() => {
  const input = document.querySelector('.ask-c2-row input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '這間房子');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
c2 = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return {
    btnDisabled: p.querySelector('.ai-btn').disabled,
    ysNames: [...p.querySelectorAll('.ask-ys-name')].map((x) => x.textContent.trim()),
    ysRoles: [...p.querySelectorAll('.ask-ys-role')].map((x) => x.textContent.trim()),
  };
});
ok('填寫後按鈕啟用', c2.btnDisabled === false, c2);
ok('用神表顯示「生門（這間房子）」', c2.ysNames.some((x) => x.includes('生門') && x.includes('這間房子')), c2.ysNames);
ok('自動補參照宮（時干/日干）', c2.ysRoles.some((x) => x.includes('參照')), c2.ysRoles);
// 加第二個用神（天干戊＝資金）
await page.evaluate(() => document.querySelector('.ask-c2-add').click());
await sleep(150);
await page.evaluate(() => {
  const row = document.querySelectorAll('.ask-c2-row')[1];
  const catSel = row.querySelectorAll('select')[0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(catSel, 'stem'); catSel.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(150);
await page.evaluate(() => {
  const row = document.querySelectorAll('.ask-c2-row')[1];
  const symSel = row.querySelectorAll('select')[1];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(symSel, '戊'); symSel.dispatchEvent(new Event('change', { bubbles: true }));
  const input = row.querySelector('input');
  const isetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  isetter.call(input, '資金');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
c2 = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return {
    rows: p.querySelectorAll('.ask-c2-row').length,
    ysNames: [...p.querySelectorAll('.ask-ys-name')].map((x) => x.textContent.trim()),
    relHeads: [...p.querySelectorAll('.xk-sec-head')].map((h) => h.textContent.trim()),
  };
});
ok('第二用神列已加（戊·資金）', c2.rows === 2 && c2.ysNames.some((x) => x.includes('戊') && x.includes('資金')), c2.ysNames);
// 跑自選用神 AI（模擬）
await page.evaluate(() => document.querySelector('.ask-panel .ai-btn').click());
await sleep(400);
const c2Ai = await page.evaluate(() => document.querySelector('.ask-panel .ai-result')?.textContent.trim() || null);
ok('自選用神 AI 解讀顯示', !!c2Ai && c2Ai.includes('測試回答'), c2Ai);
// 還原類別
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
ok('AI 解讀顯示（模擬回應）', !!askState.result && askState.result.includes('測試回答'), askState.result);
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
ok('追問問答顯示', askState.q?.includes('具體哪一年？') && askState.a?.includes('測試回答'), askState);
const askLibEntry = Object.entries(askState.lib).find(([k]) => k.includes('|求財|'))?.[1] || {};
ok('對話串已存檔（求財 key，thread 1 輪）', Array.isArray(askLibEntry.thread) && askLibEntry.thread.length === 1 && askLibEntry.thread[0].q === '具體哪一年？', askLibEntry);

// 重整後保留
console.log('\n[4] 重整後問事存檔與對話串保留');
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.grid');
await sleep(300);
askState = await page.evaluate(() => {
  const p = document.querySelector('.ask-panel');
  return { result: p?.querySelector('.ai-result')?.textContent.trim(), threadQ: p?.querySelector('.fu-q')?.textContent.trim() };
});
ok('重整後解讀與追問仍在', askState.result?.includes('測試回答') && askState.threadQ?.includes('具體哪一年？'), askState);

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
