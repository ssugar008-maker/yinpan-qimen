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
let lastIndoor = null, lastXk = null, lastChat = null;
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/api/interpret')) {
    let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch { }
    if (b.task === 'indoorLayout') lastIndoor = b;
    if (b.task === 'xkChat') lastChat = b;
    if (b.task === 'xkOverall' || b.task === 'xkPalace') lastXk = b;
    if (b.task === 'readFloorplan') {
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: { rooms: [{ type: '廚房', cx: 0.7, cy: 0.3, x1: 0.6, y1: 0.2, x2: 0.8, y2: 0.4 }, { type: '廁所', cx: 0.2, cy: 0.7, x1: 0.15, y1: 0.65, x2: 0.25, y2: 0.75 }], features: [{ type: '床', cx: 0.5, cy: 0.2, dir: 0 }, { type: '門', cx: 0.5, cy: 0.9, dir: 180 }, { type: '灶頭', cx: 0.7, cy: 0.3 }] }, model: 'test-vision', usage: { pt: 500, ct: 80 } }) });
      return;
    }
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

console.log('\n[1] 室內分頁：房間載入＋AI 已集中到「風水 AI」分頁');
await (await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'室內')]"))[0].click();
await page.waitForSelector('.indoor');
await sleep(600);
let st = await page.evaluate(() => ({
  rooms: document.querySelectorAll('.indoor-room').length,
  aiBtn: !!document.querySelector('.indoor-ai .ai-btn'),
  fsPointer: [...document.querySelectorAll('.indoor-method-hint')].some((x) => x.textContent.includes('風水 AI')),
}));
ok('兩間房載入', st.rooms === 2, st.rooms);
ok('室內唔再有 AI 佈局分析按鈕（已集中）', !st.aiBtn, st.aiBtn);
ok('室內有「去風水 AI 分頁」提示', st.fsPointer, st.fsPointer);

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

console.log('\n[4] 天星向首（日照最強方向）');
// 先返回室內分頁（上一節去咗玄空）
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('室內')).click());
await sleep(800);
// 預設：無 ☀ 標記，天星跟羅盤坐子
let sf = await page.evaluate(() => ({
  sun: !!document.querySelector('.indoor-starface'),
  marker: !!document.querySelector('.indoor-canvas-wrap svg .qc-sun, .indoor-canvas-wrap svg text'),
  hint: document.querySelector('.indoor-starface .indoor-method-hint')?.textContent.trim() || null,
}));
ok('天星向首控制列存在', sf.sun);
// 輸入天星向首 90°（卯・正東）
await page.evaluate(() => {
  const i = document.querySelector('.indoor-starface input[type=number]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(i, '90'); i.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(400);
sf = await page.evaluate(() => ({
  hint: document.querySelector('.indoor-starface .indoor-method-hint')?.textContent.trim() || null,
  sunMarker: [...document.querySelectorAll('.indoor-canvas-wrap svg text')].some((x) => x.textContent === '☀'),
}));
ok('顯示天星向首卯・坐山酉', sf.hint && sf.hint.includes('天星向首') && sf.hint.includes('卯') && sf.hint.includes('酉'), sf.hint);
ok('☀ 光位標記出現', sf.sunMarker);
// 天星盤重排：坐酉起盤 → 某天星位置改變。對照：坐子時子山＝天錢；坐酉時子山＝屍氣
const starAtZi = await page.evaluate(() => {
  const texts = [...document.querySelectorAll('.indoor-canvas-wrap svg text')];
  return texts.map((x) => x.textContent).join('|');
});
ok('天星環重排（坐酉後子山唔再係天錢）', starAtZi.includes('屍氣'), starAtZi.slice(0, 120));
// ☀ 點光位模式：點平面圖中心正東 → 天星向首≈90°
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('點光位')).click());
await sleep(150);
const svgBox = await page.evaluate(() => { const r = document.querySelector('.indoor-canvas-wrap svg').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
// 圖 1000x1000 中心 (500,500)；正東＝中心右方。svg 寬度對應 1000 圖像素
await page.mouse.click(svgBox.x + svgBox.w * 0.5 + svgBox.w * 0.3, svgBox.y + svgBox.h * 0.5);
await sleep(300);
sf = await page.evaluate(() => document.querySelector('.indoor-starface input[type=number]')?.value);
ok('☀ 點光位：點正東 → 天星向首≈90°', sf !== null && Math.abs(parseFloat(sf) - 90) < 8, sf);
// 清除
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '清除' && b.closest('.indoor-starface'))?.click());
await sleep(200);
sf = await page.evaluate(() => ({ marker: [...document.querySelectorAll('.indoor-canvas-wrap svg text')].some((x) => x.textContent === '☀'), val: document.querySelector('.indoor-starface input[type=number]')?.value }));
ok('清除後 ☀ 標記消失', !sf.marker && (sf.val === '' || sf.val == null), sf);

console.log('\n[4b] 風水 AI 分頁：對話＋排盤法');
await page.evaluate(() => { localStorage.setItem('mo_star24_method', 'bazhai'); window.dispatchEvent(new Event('mo-star24-method')); });
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('風水 AI')).click());
await sleep(800);
const sendFs = async (q) => {
  await page.evaluate((qq) => {
    const ta = document.querySelector('.fschat-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, qq); ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '送出')?.click());
  await sleep(500);
};
// 八宅遊年（預設）：第一條
await sendFs('整體點樣？');
const ziB = lastChat && lastChat.star24 && lastChat.star24.stars.find((s) => s.mountain === '子');
ok('八宅遊年（預設）：子山＝輔翼（坎宅伏位）', ziB && ziB.star === '輔翼' && lastChat.star24.method === 'bazhai', ziB && ziB.star);
ok('xkChat 帶室內佈局（坐向一致，2 間房）', !!(lastChat && lastChat.indoor && lastChat.indoor.rooms && lastChat.indoor.rooms.length === 2), lastChat && lastChat.indoor && lastChat.indoor.rooms && lastChat.indoor.rooms.length);
// 第二條（同排盤法）→ 多輪
await sendFs('雪櫃放邊個山好？');
const fsTabSt = await page.evaluate(() => ({
  user: document.querySelectorAll('.fschat .qc-msg.user').length,
  ai: document.querySelectorAll('.fschat .qc-msg.ai').length,
  saved: JSON.parse(localStorage.getItem('fs_chat_tab_v1') || '{}'),
}));
ok('風水 AI 分頁：多輪對話（兩問兩答）', fsTabSt.user === 2 && fsTabSt.ai === 2, { user: fsTabSt.user, ai: fsTabSt.ai });
ok('風水 AI 分頁：對話存檔（localStorage）', Object.values(fsTabSt.saved).some((v) => v && Array.isArray(v.thread) && v.thread.length === 2), Object.keys(fsTabSt.saved));
ok('xkChat payload 有玄空盤＋天星＋室內逐山', !!(lastChat && lastChat.task === 'xkChat' && Array.isArray(lastChat.chart?.palaces) && lastChat.chart.palaces.length === 9 && Array.isArray(lastChat.star24?.stars) && lastChat.star24.stars.length === 24 && Array.isArray(lastChat.indoor?.rooms) && lastChat.indoor.rooms[0]?.byMountain?.length > 0), lastChat && { task: lastChat.task });
ok('xkChat 多輪帶 followups', !!(lastChat && Array.isArray(lastChat.followups) && lastChat.followups.length === 1 && lastChat.question === '雪櫃放邊個山好？'), lastChat && { q: lastChat.question, fu: lastChat.followups?.length });
// 切玄道 → 子山＝天錢
await page.evaluate(() => { localStorage.setItem('mo_star24_method', 'xuandao'); window.dispatchEvent(new Event('mo-star24-method')); });
await sleep(300);
await sendFs('玄道排法點樣？');
const ziX = lastChat && lastChat.star24 && lastChat.star24.stars.find((s) => s.mountain === '子');
ok('玄道：子山＝天錢（唔同咗）', ziX && ziX.star === '天錢' && lastChat.star24.method === 'xuandao', ziX && ziX.star);
// 還原八宅遊年＋返室內
await page.evaluate(() => { localStorage.setItem('mo_star24_method', 'bazhai'); window.dispatchEvent(new Event('mo-star24-method')); });
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('室內')).click());
await sleep(400);

console.log('\n[4c] 玄空分頁天星區都有排盤法選擇');
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('玄空飛星')).click());
await sleep(1000);
const txMethod = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  if (!det) return null;
  return { has: [...det.querySelectorAll('.ai-theme-chip')].map((b) => b.textContent.trim()) };
});
ok('玄空天星區有排盤法選擇', txMethod && txMethod.has.some((x) => x.includes('玄道')) && txMethod.has.includes('八宅遊年'), txMethod && txMethod.has);
// 還原室內分頁
await page.evaluate(() => [...document.querySelectorAll('.tab')].find((b) => b.textContent.includes('室內')).click());
await sleep(500);

console.log('\n[4d] ☀點光位唔會再落加點（重疊修正）');
const pinsBefore = await page.evaluate(() => document.querySelectorAll('.indoor-canvas-wrap svg circle[fill="#ff8800"]').length);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('點光位')).click()); // 開 ☀（仲喺 pin 模式）
await sleep(150);
const box2 = await page.evaluate(() => { const r = document.querySelector('.indoor-canvas-wrap svg').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.mouse.click(box2.x + box2.w * 0.5 + box2.w * 0.3, box2.y + box2.h * 0.5); // 點中心正東
await sleep(300);
const after = await page.evaluate(() => ({
  pins: document.querySelectorAll('.indoor-canvas-wrap svg circle[fill="#ff8800"]').length,
  starFace: document.querySelector('.indoor-starface input[type=number]')?.value,
}));
ok('☀點光位：設到天星向首（≈90°）', after.starFace !== '' && Math.abs(parseFloat(after.starFace) - 90) < 8, after.starFace);
ok('☀點光位：唔會落加點（重疊修正）', after.pins === pinsBefore, { before: pinsBefore, after: after.pins });

console.log('\n[4f] 房間各山佔比＋手動指定山');
// 第一間房（主人房，單點正北子）→ 佔比 子100%
let pctTxt = await page.evaluate(() => document.querySelector('.indoor-room .indoor-room-pct')?.innerText || '');
ok('單點房佔比顯示（子 100%）', pctTxt.includes('子') && pctTxt.includes('100%'), pctTxt);
// 手動指定：開第一間房嘅 ✋山 picker，揀 乾亥壬
await page.evaluate(() => document.querySelectorAll('.indoor-room .indoor-room-mtn-btn')[0].click());
await sleep(200);
const pickerThere = await page.evaluate(() => !!document.querySelector('.indoor-mtn-picker'));
ok('✋山 picker 打開（24 山）', pickerThere, pickerThere);
await page.evaluate(() => {
  const picker = document.querySelector('.indoor-mtn-picker');
  ['乾', '亥', '壬'].forEach((m) => {
    const chip = [...picker.querySelectorAll('.furn-chip')].find((b) => b.textContent.trim() === m);
    if (chip) chip.click();
  });
});
await sleep(300);
pctTxt = await page.evaluate(() => document.querySelector('.indoor-room .indoor-room-pct')?.innerText || '');
ok('手動指定乾亥壬 → 佔比平均（33%）', pctTxt.includes('乾') && pctTxt.includes('亥') && pctTxt.includes('壬') && pctTxt.includes('33%'), pctTxt);
// 手動指定山會存入平面圖佈局（風水 AI 分頁會用到）
const savedMtns = await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('mo_indoor_v1')); return l.rooms[0].manualMountains; });
ok('手動指定山存入佈局（乾亥壬）', savedMtns && savedMtns.join('') === '乾亥壬', savedMtns);
// 還原：清除手動（用返自動）
await page.evaluate(() => {
  const picker = document.querySelector('.indoor-mtn-picker');
  [...picker.querySelectorAll('button')].find((b) => b.textContent.includes('清除'))?.click();
});
await sleep(200);
pctTxt = await page.evaluate(() => document.querySelector('.indoor-room .indoor-room-pct')?.innerText || '');
ok('清除手動 → 用返自動（子 100%）', pctTxt.includes('子') && pctTxt.includes('100%'), pctTxt);

console.log('\n[4g] 放大標房（zoom）');
const zoom0 = await page.evaluate(() => ({ bar: !!document.querySelector('.indoor-zoom-bar'), scaleW: document.querySelector('.indoor-canvas-scale')?.style.width }));
ok('放大控制列出現', zoom0.bar, zoom0);
await page.evaluate(() => [...document.querySelectorAll('.indoor-zoom-btn')].find((b) => b.textContent.trim() === '＋').click());
await sleep(200);
const zoom1 = await page.evaluate(() => ({ scaleW: document.querySelector('.indoor-canvas-scale')?.style.width, val: document.querySelector('.indoor-zoom-val')?.textContent }));
ok('撳＋ → 放大到 125%', zoom1.scaleW === '125%' && zoom1.val === '125%', zoom1);
await page.evaluate(() => [...document.querySelectorAll('.indoor-zoom-btn')].find((b) => b.textContent.trim() === '重設')?.click());
await sleep(150);

console.log('\n[4h] 微調房間（拖成間房）');
// 先切去「🏠 標房」模式（拖房只喺標房模式生效）
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('標房'))?.click());
await sleep(200);
// 拖第二間房（廚房，單點正南 500,900）向上郁 100px
const roomPosBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('mo_indoor_v1')).rooms.map((r) => (r.pts ? r.pts[0] : { x: r.x, y: r.y })));
const roomPosAfter = await page.evaluate(async () => {
  const svg = document.querySelector('.indoor-canvas-wrap svg');
  const r = svg.getBoundingClientRect();
  const toClient = (x, y) => { const pt = new DOMPoint(x, y); const ctm = svg.getScreenCTM(); const p = pt.matrixTransform(ctm); return { x: p.x, y: p.y }; };
  const from = toClient(500, 900), to = toClient(500, 800);
  const opts = { bubbles: true, pointerId: 1, isPrimary: true };
  svg.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: from.x, clientY: from.y }));
  svg.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: to.x, clientY: to.y }));
  svg.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: to.x, clientY: to.y }));
  await new Promise((r2) => setTimeout(r2, 100));
  return JSON.parse(localStorage.getItem('mo_indoor_v1')).rooms.map((r2) => (r2.pts ? r2.pts[0] : { x: r2.x, y: r2.y }));
});
ok('拖房微調：廚房由 y≈900 移到 y≈800', roomPosAfter[1] && roomPosAfter[1].y < roomPosBefore[1].y - 50, { before: roomPosBefore[1], after: roomPosAfter[1] });

console.log('\n[4i] AI 讀平面圖搵房間');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('AI 讀平面圖'))?.click());
await sleep(500);
const fpReview = await page.evaluate(() => ({
  review: !!document.querySelector('.indoor-fpai-review'),
  roomSelects: [...document.querySelectorAll('.indoor-fpai-row select')].map((s) => s.value),
  featureNames: [...document.querySelectorAll('.indoor-fpai-row .indoor-fpai-fname')].map((x) => x.textContent),
}));
ok('AI 讀圖：review 出現＋搵到 2 空間＋3 家具/門', fpReview.review && fpReview.roomSelects.length === 2 && fpReview.featureNames.length === 3, fpReview);
ok('AI 讀圖：空間類型（廚房、廁所）', fpReview.roomSelects.includes('廚房') && fpReview.roomSelects.includes('廁所'), fpReview.roomSelects);
ok('AI 讀圖：家具/門（床、門、灶頭）', fpReview.featureNames.some((x) => x.includes('床')) && fpReview.featureNames.some((x) => x.includes('門')) && fpReview.featureNames.some((x) => x.includes('灶頭')), fpReview.featureNames);
const roomsBeforeFp = await page.evaluate(() => document.querySelectorAll('.indoor-room').length);
await page.evaluate(() => [...document.querySelectorAll('.indoor-fpai-actions button')].find((b) => b.textContent.includes('加入全部'))?.click());
await sleep(400);
const roomsAfterFp = await page.evaluate(() => document.querySelectorAll('.indoor-room').length);
ok('確認加入 → 多咗 2 間房', roomsAfterFp === roomsBeforeFp + 2, { before: roomsBeforeFp, after: roomsAfterFp });

console.log('\n[4j] 家具／門風水（門向分析＋床頭命卦）');
const featPanel = await page.evaluate(() => ({
  panel: !!document.querySelector('.indoor-features'),
  doorSummary: document.querySelector('.indoor-door-summary')?.innerText || '',
  features: document.querySelectorAll('.indoor-feature').length,
  bedhead: !!document.querySelector('.indoor-bedhead'),
}));
ok('家具/門風水 panel 出現（3 個 feature）', featPanel.panel && featPanel.features === 3, featPanel);
ok('門向分析：全宅 1 道門＋方向', featPanel.doorSummary.includes('1 道門') && featPanel.doorSummary.includes('向'), featPanel.doorSummary);
ok('床有命卦輸入（年份＋性別）', featPanel.bedhead, featPanel);
// 床頭命卦：輸入 1990 男 → 坎命（東四命）；mock 床向 0°（子山坎宮）＝坎命伏位（吉）
await page.evaluate(() => {
  const bed = [...document.querySelectorAll('.indoor-feature')].find((x) => x.querySelector('.indoor-feature-name')?.textContent === '床');
  const inp = bed.querySelector('.indoor-bedhead-year');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '1990'); inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
await page.evaluate(() => {
  const bed = [...document.querySelectorAll('.indoor-feature')].find((x) => x.querySelector('.indoor-feature-name')?.textContent === '床');
  [...bed.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '男')?.click();
});
await sleep(300);
const bedResult = await page.evaluate(() => {
  const bed = [...document.querySelectorAll('.indoor-feature')].find((x) => x.querySelector('.indoor-feature-name')?.textContent === '床');
  return bed.querySelector('.indoor-bedhead-result')?.innerText || '';
});
ok('床頭命卦：1990男 → 坎命（東四命）＋四吉方', bedResult.includes('坎') && bedResult.includes('東四命') && bedResult.includes('伏位'), bedResult.slice(0, 100));

console.log('\n[4k] 快速加區域房＋微調頂點');
// 快速加區域房掣
const quickArea = await page.evaluate(() => !!document.querySelector('.indoor-quick-area'));
ok('有「＋ 加區域房」快速掣', quickArea, quickArea);
// 微調：揀中一間區域房 → 頂點手柄＋邊中點（加頂點）
await page.evaluate(() => { window.scrollTo(0, 0); });
// 搵一間區域房（AI 加嘅廚房係四邊形）並選中佢
await page.evaluate(() => {
  const rooms = JSON.parse(localStorage.getItem('mo_indoor_v1')).rooms;
  const areaIdx = rooms.findIndex((r) => r.pts && r.pts.length >= 2);
  // 直接喺房list 撳嗰間房
  document.querySelectorAll('.indoor-room')[areaIdx]?.click();
});
await sleep(300);
const tune = await page.evaluate(() => ({
  vertexHandles: document.querySelectorAll('.indoor-canvas-wrap svg circle[style*="grab"]').length,
  midHandles: document.querySelectorAll('.indoor-canvas-wrap svg circle[style*="copy"]').length,
  tuneBar: !!document.querySelector('.indoor-room-tune'),
}));
ok('選中區域房 → 顯示可拖頂點＋邊中點（加頂點）＋微調列', tune.vertexHandles >= 4 && tune.midHandles >= 4 && tune.tuneBar, tune);

console.log('\n[4l] 微調模式掣＋手動標家具＋精密角度');
// 頂部工具列有「✋ 微調」＋「🛏 標家具」掣
const topBtns = await page.evaluate(() => [...document.querySelectorAll('.indoor-modes .indoor-mode')].map((b) => b.textContent.trim()));
ok('頂部有「✋ 微調」＋「🛏 標家具」掣', topBtns.some((x) => x.includes('微調')) && topBtns.some((x) => x.includes('標家具')), topBtns);
// 標家具模式：撳「🛏 標家具」→ 類型選擇出現
await page.evaluate(() => [...document.querySelectorAll('.indoor-modes .indoor-mode')].find((b) => b.textContent.includes('標家具'))?.click());
await sleep(200);
const featBar = await page.evaluate(() => ({ bar: !!document.querySelector('.indoor-feature-bar'), types: document.querySelectorAll('.indoor-feature-bar .furn-chip').length }));
ok('標家具模式：類型選擇出現（床/灶頭/廁所/門/窗）', featBar.bar && featBar.types === 5, featBar);
// 揀灶頭，點平面圖放一件
await page.evaluate(() => [...document.querySelectorAll('.indoor-feature-bar .furn-chip')].find((b) => b.textContent.includes('灶頭'))?.click());
await sleep(150);
const featsBefore = await page.evaluate(() => document.querySelectorAll('.indoor-feature').length);
await page.evaluate(() => {
  const svg = document.querySelector('.indoor-canvas-wrap svg');
  const p = new DOMPoint(600, 600).matrixTransform(svg.getScreenCTM());
  const o = { bubbles: true, pointerId: 1, isPrimary: true };
  svg.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: p.x, clientY: p.y }));
  svg.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: p.x, clientY: p.y }));
});
await sleep(300);
const featsAfter = await page.evaluate(() => document.querySelectorAll('.indoor-feature').length);
ok('手動標家具：點平面圖放咗件灶頭', featsAfter === featsBefore + 1, { before: featsBefore, after: featsAfter });
// 精密角度：揀中道門，改角度 0° → 向子山（正北）
await page.evaluate(() => {
  const door = [...document.querySelectorAll('.indoor-feature')].find((x) => x.querySelector('.indoor-feature-name')?.textContent === '門');
  door?.querySelector('.indoor-feature-top')?.click();
});
await sleep(200);
const angleThere = await page.evaluate(() => !!document.querySelector('.indoor-angle-editor'));
ok('揀中門 → 精密角度編輯器出現', angleThere, angleThere);
await page.evaluate(() => {
  const inp = document.querySelector('.indoor-angle-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '0'); inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(300);
const angleRes = await page.evaluate(() => document.querySelector('.indoor-angle-mt')?.innerText || '');
ok('改角度 0° → 向子山（正北）', angleRes.includes('子'), angleRes);

console.log('\n[5] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
