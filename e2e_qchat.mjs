// AI 對話問事 E2E：自動起盤、分類、對話式分析、多輪、起新盤、歷史對話
// 用法：npm i --no-save puppeteer-core && npm run dev（另開 terminal）&& node e2e_qchat.mjs
import puppeteer from 'puppeteer-core';

const URL = process.env.E2E_URL || 'http://localhost:5173/';
let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → 實際：${JSON.stringify(got)?.slice(0, 250)}` : ''}`); } };

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1100 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

let chatCalls = 0;
let lastChatBody = null;
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/api/interpret')) {
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { }
    if (body.task === 'qimenChat') lastChatBody = body;
    if (body.task === 'qimenClassify') {
      const q = body.question || '';
      const smalltalk = /你好|早晨|hi/i.test(q);
      const qt = /銀包|唔見|遺失/.test(q) ? '尋物' : /感情|佢對我|桃花/.test(q) ? '感情婚姻' : '求財';
      req.respond({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ json: { smalltalk, newTopic: true, qtype: smalltalk ? '' : qt, reply: smalltalk ? '你好，想問咩呀？' : '' }, model: 'deepseek-v4-flash', usage: { pt: 50, ct: 10 } }),
      });
    } else {
      chatCalls++;
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: `【回答${chatCalls}】此事大吉，放心。`, model: 'deepseek-v4-flash', usage: { pt: 800, ct: 100 } }) });
    }
  } else req.continue();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const type = async (text) => { await page.evaluate(() => { document.querySelector('.qc-input').value = ''; }); await page.type('.qc-input', text); };
const sendAndWait = async () => { await page.evaluate(() => document.querySelector('.qc-input-row .fu-send').click()); await sleep(600); };
const state = () => page.evaluate(() => ({
  msgs: [...document.querySelectorAll('.qc-msg')].map((m) => ({ user: m.classList.contains('user'), text: m.querySelector('.qc-bubble')?.innerText.trim() })),
  charts: document.querySelectorAll('.qc-chart-card').length,
  chartHead: document.querySelector('.qc-chart-card .qc-chart-head')?.textContent.trim() || null,
  gridCells: document.querySelectorAll('.qc-grid .qc-cell').length,
  ysChips: [...document.querySelectorAll('.qc-ys-chip')].map((x) => x.textContent.trim()),
  empty: !!document.querySelector('.qc-empty'),
  busy: !!document.querySelector('.qc-thinking'),
}));

await page.goto(URL, { waitUntil: 'networkidle2' });
await page.waitForSelector('.tabs');

console.log('\n[1] 分頁與空狀態');
const tab = await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'AI 對話')]");
ok('AI 對話分頁存在', tab.length > 0);
await tab[0].click();
await page.waitForSelector('.qc');
let s = await state();
ok('空狀態提示顯示', s.empty);

console.log('\n[2] 第一句問題 → 自動起盤＋分析');
await type('我下個月簽約順唔順？');
await sendAndWait();
s = await state();
ok('用家訊息顯示', s.msgs.some((m) => m.user && m.text.includes('簽約')), s.msgs);
ok('已起盤（盤面卡片出現）', s.charts === 1 && !!s.chartHead, s.chartHead);
ok('盤面卡片含遁局與類別', s.chartHead.includes('遁') && s.chartHead.includes('問事類別：求財'), s.chartHead);
ok('迷你九宮格 9 宮', s.gridCells === 9, s.gridCells);
ok('用神 chips 顯示', s.ysChips.length >= 3 && s.ysChips.some((x) => x.includes('生門')), s.ysChips);
ok('AI 對話回答顯示', s.msgs.some((m) => !m.user && m.text && m.text.includes('【回答1】')), s.msgs.map((m) => m.text));

console.log('\n[3] 閒聊不起分析');
await type('你好');
await sendAndWait();
s = await state();
ok('閒聊回應（師傅口吻）', s.msgs.some((m) => !m.user && m.text && m.text.includes('你好，想問咩呀')), s.msgs.map((m) => m.text));
ok('閒聊不新增盤', s.charts === 1, s.charts);

console.log('\n[4] 追問沿用同一盤');
await type('具體邊個月好啲？');
await sendAndWait();
s = await state();
ok('追問回答顯示', s.msgs.some((m) => !m.user && m.text && m.text.includes('【回答2】')), s.msgs.map((m) => m.text));
ok('仍為同一盤（無新盤卡）', s.charts === 1, s.charts);

console.log('\n[5] 換話題 → 重新取用用神（尋物）');
await type('我個銀包唔見咗，喺邊？');
await sendAndWait();
s = await state();
ok('尋物回答顯示', s.msgs.some((m) => !m.user && m.text && m.text.includes('【回答3】')), s.msgs.map((m) => m.text));
ok('用神 chips 換成尋物（時干/日干/馬星）', s.ysChips.some((x) => x.includes('時干')) && s.ysChips.some((x) => x.includes('馬星')), s.ysChips);
ok('盤卡標題類別更新為尋物', s.chartHead.includes('尋物'), s.chartHead);

console.log('\n[6] 起新盤');
await page.evaluate(() => [...document.querySelectorAll('.qc-tool-btn')].find((b) => b.textContent.includes('起新盤')).click());
await sleep(200);
await type('今日簽約好嗎？');
await sendAndWait();
s = await state();
ok('新盤卡出現（共 2 張）', s.charts === 2, s.charts);

console.log('\n[7] 存檔與歷史對話');
s = await state();
const libSize = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('qimen_chat_v1') || '{}')).length);
ok('對話已存檔', libSize >= 1, libSize);
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.tabs');
await (await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'AI 對話')]"))[0].click();
await page.waitForSelector('.qc');
s = await state();
ok('重整後為空狀態（新對話）', s.empty);
const hasHist = await page.evaluate(() => !!document.querySelector('.qc-hist'));
ok('歷史對話下拉出現', hasHist);
await page.select('.qc-hist', await page.evaluate(() => document.querySelector('.qc-hist option:nth-child(2)').value));
await sleep(400);
s = await state();
ok('載入歷史對話（訊息與盤面還原）', s.charts >= 1 && s.msgs.some((m) => m.user && m.text.includes('簽約')), { charts: s.charts, msgs: s.msgs.length });

console.log('\n[7b] 對話設定：語氣／詳略／遠程取用神');
// 預設值
let set = await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  if (!bar) return null;
  const groups = [...bar.querySelectorAll('.q-group')].map((g) => ({
    label: g.querySelector('.q-label')?.textContent.trim(),
    on: g.querySelector('.seg button.on')?.textContent.trim() || null,
    opts: [...g.querySelectorAll('.seg button')].map((b) => b.textContent.trim()),
  }));
  return groups;
});
ok('設定列存在（語氣/詳略/問事）', set && set.length >= 3, set);
ok('預設 白話／適中／近程', set && set[0].on === '白話' && set[1].on === '適中' && set[2].on === '近程', set);
ok('近程時無性別選擇', set && !set.some((g) => g.label === '開盤人'), set.map((g) => g.label));
// 切 書面＋簡潔 → 下一個回答的請求帶 chatStyle/chatDetail
await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  const pick = (label, v) => {
    const g = [...bar.querySelectorAll('.q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === label);
    [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === v).click();
  };
  pick('語氣', '書面'); pick('詳略', '簡潔');
});
await sleep(200);
await type('咁我幾時簽最好？');
await sendAndWait();
ok('請求帶 書面＋簡潔', lastChatBody && lastChatBody.chatStyle === '書面' && lastChatBody.chatDetail === '簡潔', lastChatBody && { s: lastChatBody.chatStyle, d: lastChatBody.chatDetail });
// 切遠程 → 性別選擇出現
await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  const g = [...bar.querySelectorAll('.q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === '問事');
  [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '遠程').click();
});
await sleep(200);
set = await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  return {
    groups: [...bar.querySelectorAll('.q-group')].map((g) => g.querySelector('.q-label')?.textContent.trim()),
    hint: !!document.querySelector('.qc-remote-hint'),
  };
});
ok('遠程出現開盤人/問事人性別', set.groups.includes('開盤人') && set.groups.includes('問事人'), set.groups);
ok('未設性別有提示', set.hint);
// 設定 開盤人男、問事人女 → 顯示事主落宮（遠程）
await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  const pick = (label, v) => {
    const g = [...bar.querySelectorAll('.q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === label);
    [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === v).click();
  };
  pick('開盤人', '男'); pick('問事人', '女');
});
await sleep(200);
set = await page.evaluate(() => ({
  result: document.querySelector('.qc-settings .q-result')?.textContent.trim() || null,
  hint: !!document.querySelector('.qc-remote-hint'),
}));
ok('顯示事主落宮（遠程）', set.result && set.result.includes('事主落') && set.result.includes('遠程'), set.result);
ok('設好性別後提示消失', !set.hint);
// 遠程下問事 → payload 的 shiZhuLabel 為遠程月干
await type('佢對我有無意思？');
await sendAndWait();
ok('遠程 payload 標註月干事主', lastChatBody && lastChatBody.ask && lastChatBody.ask.chart.shiZhuLabel === '事主（月干・遠程）', lastChatBody && lastChatBody.ask.chart.shiZhuLabel);
// 設定存本機
const savedSet = await page.evaluate(() => JSON.parse(localStorage.getItem('mo_qchat_settings_v1') || '{}'));
ok('設定已存本機', savedSet.style === '書面' && savedSet.detail === '簡潔' && savedSet.mode === '遠程' && savedSet.caster === '男' && savedSet.querent === '女', savedSet);
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.tabs');
await (await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'AI 對話')]"))[0].click();
await page.waitForSelector('.qc');
set = await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  return [...bar.querySelectorAll('.q-group')].map((g) => ({ label: g.querySelector('.q-label')?.textContent.trim(), on: g.querySelector('.seg button.on')?.textContent.trim() || null }));
});
ok('重整後設定保留（書面/簡潔/遠程/男/女）', set.some((g) => g.label === '語氣' && g.on === '書面') && set.some((g) => g.label === '詳略' && g.on === '簡潔') && set.some((g) => g.label === '問事' && g.on === '遠程') && set.some((g) => g.label === '開盤人' && g.on === '男') && set.some((g) => g.label === '問事人' && g.on === '女'), set);

console.log('\n[7c] 起盤時間自訂（上一個時辰問的，而家先開盤）');
await page.evaluate(() => [...document.querySelectorAll('.qc-tool-btn')].find((b) => b.textContent.includes('新對話')).click());
await sleep(200);
// 還原近程（上一節測試遠程會存本機）
await page.evaluate(() => {
  const g = [...document.querySelectorAll('.qc-settings .q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === '問事');
  [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '近程').click();
});
await sleep(150);
// 預設此刻
let cast = await page.evaluate(() => {
  const row = document.querySelector('.qc-cast-row');
  return { on: row.querySelector('.seg button.on')?.textContent.trim(), hasInput: !!row.querySelector('.qc-cast-input') };
});
ok('起盤時間預設此刻、無輸入框', cast.on === '此刻' && !cast.hasInput, cast);
// 切自訂 → 輸入框出現
await page.evaluate(() => [...document.querySelectorAll('.qc-cast-row .seg button')].find((b) => b.textContent.trim() === '自訂').click());
await sleep(150);
cast = await page.evaluate(() => ({ hasInput: !!document.querySelector('.qc-cast-input'), note: document.querySelector('.qc-cast-note')?.textContent.trim() || null }));
ok('自訂出現時間輸入框＋提示', cast.hasInput && !!cast.note, cast);
// 設 2026-05-16 11:38（固定參考盤）
await page.evaluate(() => {
  const i = document.querySelector('.qc-cast-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(i, '2026-05-16T11:38'); i.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
await type('佢會唔會返嚟？');
await sendAndWait();
cast = await state();
ok('按自訂時間起盤（2026-5-16 11:38）', cast.chartHead && cast.chartHead.includes('2026-05-16 11:38'), cast.chartHead);

console.log('\n[7d] 盤面 color coding（與主盤一致）');
const cellOf = async (name) => page.evaluate((n) => {
  const cell = [...document.querySelectorAll('.qc-chart-card .qc-cell')].find((c) => c.querySelector('.qc-pal')?.textContent.trim() === n);
  if (!cell) return null;
  return {
    html: cell.className,
    badges: [...cell.querySelectorAll('.mk-badge')].map((b) => b.textContent.trim()),
    void: !!cell.querySelector('.qc-void'),
    horse: !!cell.querySelector('.qc-horse'),
    redStems: [...cell.querySelectorAll('.qc-stem.mk-red')].map((s) => s.textContent.trim()),
    greyStems: [...cell.querySelectorAll('.qc-stem.mk-grey')].map((s) => s.textContent.trim()),
    marks: [...cell.querySelectorAll('.mark')].map((m) => ({ t: m.textContent.trim(), cls: m.className })),
    doorGreen: !!cell.querySelector('.qc-door.mk-green'),
  };
}, name);
const kan = await cellOf('坎一');
ok('坎一宮：事主紅徽章', kan && kan.badges.includes('事主'), kan);
const li = await cellOf('離九');
ok('離九宮：時干藍徽章', li && li.badges.includes('時干'), li);
const kun = await cellOf('坤二');
ok('坤二宮：空亡小圈＋馬星', kun && kun.void && kun.horse, kun);
const dui = await cellOf('兌七');
ok('兌七宮：空亡小圈', dui && dui.void, dui);
const zhen = await cellOf('震三');
ok('震三宮：戊擊刑干標紅', zhen && zhen.redStems.includes('戊'), zhen && zhen.redStems);
ok('震三宮：刑標記紅色', zhen && zhen.marks.some((m) => m.t === '刑' && m.cls.includes('mk-red')), zhen && zhen.marks);
ok('震三宮：門迫標記（破）綠色', zhen && zhen.marks.some((m) => m.t === '破' && m.cls.includes('mk-green')), zhen && zhen.marks);
ok('門迫宮門字標綠', (await cellOf('坎一')).doorGreen || zhen.doorGreen, { kan: (await cellOf('坎一')).doorGreen, zhen: zhen.doorGreen });

console.log('\n[8] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
