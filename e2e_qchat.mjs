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
let lastTranslateBody = null;
const libEntries = []; // 模擬雲端對話記錄（upsert）
const OWNER_KEY_TEST = 'test123';
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/api/library')) {
    const u = new globalThis.URL(req.url());
    if (req.method() === 'POST') {
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch { }
      if (b.upsert && b.upsert.id) {
        const i = libEntries.findIndex((e) => e.id === b.upsert.id);
        if (i >= 0) libEntries[i] = { ...libEntries[i], ...b.upsert }; else libEntries.push(b.upsert);
      }
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else {
      const ns = u.searchParams.get('ns');
      if (ns === 'qimen_chat') {
        const key = u.searchParams.get('key') || '';
        if (key !== OWNER_KEY_TEST) { req.respond({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: '需要擁有者密碼' }) }); return; }
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ updatedAt: Date.now(), entries: libEntries }) });
        return;
      }
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ updatedAt: 0, data: null }) });
    }
    return;
  }
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
    } else if (body.task === 'toStdChinese') {
      lastTranslateBody = body;
      req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '從盤上看，此事宜緩不宜急。（書面）', model: 'deepseek-v4-flash', usage: { pt: 100, ct: 50 } }) });
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

console.log('\n[7a] 簡易／專業界面');
let ui = await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  return {
    groups: [...bar.querySelectorAll('.q-group')].map((g) => g.querySelector('.q-label')?.textContent.trim()),
    castRow: !!document.querySelector('.qc-cast-row'),
  };
});
ok('預設簡易界面：只有 界面/語氣/詳略', ui.groups.length === 3 && ui.groups[0] === '界面' && ui.groups[1] === '語氣' && ui.groups[2] === '詳略', ui.groups);
ok('簡易界面無起盤時間/取數列', !ui.castRow);
// 簡易界面問事 → 近程（日干為事主）
await type('我件事成唔成？');
await sendAndWait();
ok('簡易界面 payload 為近程日干事主', lastChatBody && lastChatBody.ask.chart.shiZhuLabel === '事主（日干）', lastChatBody && lastChatBody.ask.chart.shiZhuLabel);
// 切專業
await page.evaluate(() => {
  const g = [...document.querySelectorAll('.qc-settings .q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === '界面');
  [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '專業').click();
});
await sleep(200);
ui = await page.evaluate(() => ({
  groups: [...document.querySelectorAll('.qc-settings .q-group')].map((g) => g.querySelector('.q-label')?.textContent.trim()),
  castRow: !!document.querySelector('.qc-cast-row'),
}));
ok('專業界面顯示 問事/開盤人/問事人＋起盤時間列', ui.groups.includes('問事') && ui.groups.includes('開盤人') && ui.groups.includes('問事人') && ui.castRow, ui);

console.log('\n[7a2] 輸入框改 textarea（長文自動長高）');
const ta = await page.evaluate(() => {
  const el = document.querySelector('.qc-input');
  return { tag: el.tagName, h1: el.style.height || el.offsetHeight };
});
ok('輸入框為 textarea', ta.tag === 'TEXTAREA', ta.tag);
await page.type('.qc-input', '呢個係一段好長好長好長好長好長好長好長好長好長好長好長好長好長好長好長好長好長好長好長好長嘅問題，要試下會唔會仲伸出右邊去睇唔到。');
await sleep(300);
const ta2 = await page.evaluate(() => {
  const el = document.querySelector('.qc-input');
  return { h: el.offsetHeight, sh: el.scrollHeight, sw: el.scrollWidth, cw: el.clientWidth };
});
ok('長文自動長高（高度增加）', ta2.h > 42, ta2);
ok('長文唔再伸出右邊（無橫向溢出）', ta2.sw <= ta2.cw + 2, ta2);
// Enter 送出（Shift+Enter 換行）
await page.evaluate(() => { const el = document.querySelector('.qc-input'); el.focus(); });
await page.keyboard.press('Enter');
await sleep(600);
ok('Enter 直接送出', await page.evaluate(() => [...document.querySelectorAll('.qc-msg.user')].some((m) => m.innerText.includes('好長'))));

console.log('\n[7a3] 語音輸入按鈕');
// headless Chrome 自帶 webkitSpeechRecognition；注入 mock（evaluateOnNewDocument 先於頁面腳本，重整後仍生效）
await page.evaluateOnNewDocument(() => {
  window.SpeechRecognition = class {
    start() { if (this.onresult) this.onresult({ results: [[{ transcript: '語音測試問題' }]] }); if (this.onend) this.onend(); }
    stop() { }
  };
});
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.tabs');
await (await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'AI 對話')]"))[0].click();
await page.waitForSelector('.qc-input');
let mic = await page.evaluate(() => !!document.querySelector('.qc-mic'));
ok('支援語音時咪高峰出現', mic);
await page.evaluate(() => document.querySelector('.qc-mic').click());
await sleep(300);
mic = await page.evaluate(() => document.querySelector('.qc-input').value);
ok('語音辨識結果入到輸入框', mic.includes('語音測試問題'), mic);
// 清走輸入框，避免影響之後測試
await page.evaluate(() => { document.querySelector('.qc-input').value = ''; document.querySelector('.qc-input').dispatchEvent(new Event('input', { bubbles: true })); });

console.log('\n[7b] 對話設定：語氣／詳略／遠程取用神');
// 上一節重整後回到簡易界面？——qcSet 存本機，界面保留專業；若唔係則切過去
await page.evaluate(() => {
  const g = [...document.querySelectorAll('.qc-settings .q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === '界面');
  const proBtn = [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '專業');
  if (!proBtn.classList.contains('on')) proBtn.click();
});
await sleep(200);
// 預設值（遠程＋開盤人男：用家本人為男性開盤者，別人多數遠程問事）
let set = await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  if (!bar) return null;
  const groups = [...bar.querySelectorAll('.q-group')].map((g) => ({
    label: g.querySelector('.q-label')?.textContent.trim(),
    on: g.querySelector('.seg button.on')?.textContent.trim() || null,
    opts: [...g.querySelectorAll('.seg button')].map((b) => b.textContent.trim()),
  }));
  return { groups, hint: !!document.querySelector('.qc-remote-hint') };
});
ok('設定列存在（語氣/詳略/問事）', set && set.groups.length >= 3, set);
const onOf = (label) => set.groups.find((g) => g.label === label)?.on;
ok('預設 白話／適中／遠程', onOf('語氣') === '白話' && onOf('詳略') === '適中' && onOf('問事') === '遠程', set.groups);
ok('遠程預設 → 性別選擇預設顯示', set && set.groups.some((g) => g.label === '開盤人') && set.groups.some((g) => g.label === '問事人'), set.groups.map((g) => g.label));
ok('開盤人預設男、問事人未設', onOf('開盤人') === '男' && !onOf('問事人'), set.groups);
ok('問事人未設 → 提示顯示', set.hint);
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
// 近程 ↔ 遠程切換：近程收起性別；切回遠程再顯示
await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  const g = [...bar.querySelectorAll('.q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === '問事');
  [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '近程').click();
});
await sleep(200);
set = await page.evaluate(() => ({
  groups: [...document.querySelectorAll('.qc-settings .q-group')].map((g) => g.querySelector('.q-label')?.textContent.trim()),
}));
ok('近程時收起性別選擇', !set.groups.includes('開盤人') && !set.groups.includes('問事人'), set.groups);
await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  const g = [...bar.querySelectorAll('.q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === '問事');
  [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '遠程').click();
});
await sleep(200);
set = await page.evaluate(() => ({
  groups: [...document.querySelectorAll('.qc-settings .q-group')].map((g) => g.querySelector('.q-label')?.textContent.trim()),
  hint: !!document.querySelector('.qc-remote-hint'),
}));
ok('切回遠程再顯示性別', set.groups.includes('開盤人') && set.groups.includes('問事人'), set.groups);
ok('問事人未設 → 提示顯示', set.hint);
// 開盤人預設男（不用再點）；只設問事人女 → 顯示事主落宮（遠程）
await page.evaluate(() => {
  const bar = document.querySelector('.qc-settings');
  const g = [...bar.querySelectorAll('.q-group')].find((x) => x.querySelector('.q-label')?.textContent.trim() === '問事人');
  [...g.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === '女').click();
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
const savedSet = await page.evaluate(() => JSON.parse(localStorage.getItem('mo_qchat_settings_v2') || '{}'));
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

console.log('\n[7e] 取數起局（同一時辰多人問事）');
await page.evaluate(() => [...document.querySelectorAll('.qc-tool-btn')].find((b) => b.textContent.includes('新對話')).click());
await sleep(200);
// 還原此刻起盤
await page.evaluate(() => [...document.querySelectorAll('.qc-cast-row .seg button')].find((b) => b.textContent.trim() === '此刻').click());
await sleep(150);
// 輸入報數 3
await page.evaluate(() => {
  const i = document.querySelector('.qc-num-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(i, '3'); i.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
let ju = await page.evaluate(() => document.querySelector('.qc-cast-note')?.textContent.trim() || null);
ok('輸入報數即顯示對應局數（3 → 3 局）', ju && ju.includes('3 局'), ju);
await type('我想問財運');
await sendAndWait();
ju = await state();
ok('按取數起局（遁3局＋取數起局標記）', ju.chartHead && ju.chartHead.includes('遁3局') && ju.chartHead.includes('取數起局'), ju.chartHead);
// 報數 12 → 前端取模為 3 局
await page.evaluate(() => [...document.querySelectorAll('.qc-tool-btn')].find((b) => b.textContent.includes('起新盤')).click());
await sleep(150);
await page.evaluate(() => {
  const i = document.querySelector('.qc-num-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(i, '12'); i.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
ju = await page.evaluate(() => document.querySelector('.qc-cast-note')?.textContent.trim() || null);
ok('報數 12 → 循環 3 局', ju && ju.includes('3 局'), ju);
await type('事業點睇');
await sendAndWait();
ju = await state();
ok('起新盤後按新報數起局（遁3局）', ju.chartHead && ju.chartHead.includes('遁3局') && ju.chartHead.includes('取數起局'), ju.chartHead);
// 取數屬當次操作不存本機：重整頁面後 → 正規時盤
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('.tabs');
await (await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'AI 對話')]"))[0].click();
await page.waitForSelector('.qc-input');
ju = await page.evaluate(() => document.querySelector('.qc-num-input')?.value ?? 'missing');
ok('重整後報數清空（不存本機）', ju === '', ju);
await type('再問財運');
await sendAndWait();
ju = await state();
ok('無報數 → 正規時盤（無取數標記）', ju.chartHead && !ju.chartHead.includes('取數起局'), ju.chartHead);

console.log('\n[7f] 白話 → 書面轉換');
// 重整後為空對話，先問一句取得 AI 回答
await type('我件事成唔成？');
await sendAndWait();
let tr = await page.evaluate(() => {
  const bubbles = [...document.querySelectorAll('.qc-msg.ai .qc-bubble')];
  const last = bubbles[bubbles.length - 1];
  const btn = last.querySelector('.qc-std-btn');
  return { hasBtn: !!btn, label: btn?.textContent.trim(), text: last.innerText.trim() };
});
ok('AI 回答有「譯書面」按鈕', tr.hasBtn && tr.label === '譯書面', tr);
await page.evaluate(() => {
  const bubbles = [...document.querySelectorAll('.qc-msg.ai .qc-bubble')];
  bubbles[bubbles.length - 1].querySelector('.qc-std-btn').click();
});
await sleep(500);
tr = await page.evaluate(() => {
  const bubbles = [...document.querySelectorAll('.qc-msg.ai .qc-bubble')];
  const last = bubbles[bubbles.length - 1];
  return { text: last.innerText.trim(), label: last.querySelector('.qc-std-btn')?.textContent.trim() };
});
ok('轉換請求帶原文', lastTranslateBody && lastTranslateBody.task === 'toStdChinese' && lastTranslateBody.text.includes('此事大吉'), lastTranslateBody && lastTranslateBody.text);
ok('顯示書面譯文＋按鈕變「原文」', tr.text.includes('（書面）') && tr.label === '原文', tr);
// 切回原文
await page.evaluate(() => {
  const bubbles = [...document.querySelectorAll('.qc-msg.ai .qc-bubble')];
  bubbles[bubbles.length - 1].querySelector('.qc-std-btn').click();
});
await sleep(200);
tr = await page.evaluate(() => {
  const bubbles = [...document.querySelectorAll('.qc-msg.ai .qc-bubble')];
  const last = bubbles[bubbles.length - 1];
  return { text: last.innerText.trim(), label: last.querySelector('.qc-std-btn')?.textContent.trim() };
});
ok('切回原文（不再呼叫）', !tr.text.includes('（書面）') && tr.label === '書面', tr);

console.log('\n[7g] 擁有者密碼保護（雲端記錄）');
// 訪客（未解鎖）：問一條 → 本機存＋雲端 upsert；歷史顯示「本機記錄」
await page.evaluate(() => [...document.querySelectorAll('.qc-tool-btn')].find((b) => b.textContent.includes('新對話')).click());
await sleep(200);
await type('測試同步問題甲');
await sendAndWait();
let own = await page.evaluate(() => ({
  lockBtn: !!document.querySelector('.qc-owner'),
  histLabel: document.querySelector('.qc-hist')?.querySelector('option')?.textContent.trim() || null,
}));
ok('擁有者鎖按鈕存在', own.lockBtn);
ok('訪客問事已 upsert 上雲（模擬）', libEntries.some((e) => e.firstQ === '測試同步問題甲'), libEntries.map((e) => e.firstQ));
ok('未解鎖歷史＝本機記錄', own.histLabel === '本機記錄…', own.histLabel);
// 擁有者解鎖（mock prompt 輸入密碼）
await page.evaluate(() => { window.prompt = () => 'test123'; });
await page.evaluate(() => document.querySelector('.qc-owner').click());
await sleep(500);
own = await page.evaluate(() => ({
  unlocked: document.querySelector('.qc-owner')?.textContent.includes('擁有者'),
  histLabel: document.querySelector('.qc-hist')?.querySelector('option')?.textContent.trim() || null,
  err: !!document.querySelector('.qc-body .ai-error'),
}));
ok('解鎖後顯示擁有者', own.unlocked);
ok('解鎖後歷史＝全部問事記錄', own.histLabel === '全部問事記錄…', own.histLabel);
ok('啱密碼無錯誤提示', !own.err);
// 雲端記錄包含訪客問題
ok('雲端記錄拉到訪客問題', await page.evaluate(() => {
  const sel = document.querySelector('.qc-hist');
  return sel && [...sel.options].some((o) => o.textContent.includes('測試同步問題甲'));
}));
// 錯密碼 → 403 → 錯誤提示
await page.evaluate(() => { window.prompt = () => 'wrong'; });
await page.evaluate(() => document.querySelector('.qc-owner').click()); // 鎖返
await sleep(200);
await page.evaluate(() => document.querySelector('.qc-owner').click()); // 再開（錯密碼）
await sleep(500);
own = await page.evaluate(() => ({ err: document.querySelector('.qc-body .ai-error')?.textContent.trim() || null }));
ok('錯密碼顯示錯誤', own.err && own.err.includes('密碼唔啱'), own.err);
// 還原：鎖返
await page.evaluate(() => document.querySelector('.qc-owner').click());
await sleep(200);

console.log('\n[8] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
