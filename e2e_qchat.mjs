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
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/api/interpret')) {
    let body = {};
    try { body = JSON.parse(req.postData() || '{}'); } catch { }
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

console.log('\n[8] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
