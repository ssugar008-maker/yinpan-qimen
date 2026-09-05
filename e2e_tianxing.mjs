// 二十四天星 E2E（現已併入玄空飛星分頁，共用坐向）：天星環、自動分析、AI 分析（模擬）
// 用法：npm i --no-save puppeteer-core && npm run dev（另開 terminal）&& node e2e_tianxing.mjs
import puppeteer from 'puppeteer-core';

const URL = process.env.E2E_URL || 'http://localhost:5173/';
let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → 實際：${JSON.stringify(got)?.slice(0, 250)}` : ''}`); } };

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
let aiCalls = 0;
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/api/interpret')) {
    aiCalls++;
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: `【天星回答${aiCalls}】財位在子山。`, model: 'deepseek-v4-flash', usage: { pt: 100, ct: 50 } }) });
  } else req.continue();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'networkidle2' });
await page.waitForSelector('.tabs');
await (await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'玄空飛星')]"))[0].click();
await page.waitForSelector('.xk-grid');
await sleep(300);

console.log('\n[1] 二十四天星區塊（玄空分頁內）');
let st = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  if (!det) return null;
  const texts = [...det.querySelectorAll('.star-ring text')].map((x) => x.textContent);
  return {
    head: det.querySelector('.panel-head').textContent.trim(),
    hasQian: texts.includes('天錢'), hasShiqi: texts.includes('屍氣'),
    mountains: texts.filter((x) => x.length === 1 && '子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥壬'.includes(x)).length,
    duties: det.querySelectorAll('.tx-duty').length,
    warns: [...det.querySelectorAll('.xk-cure-row')].map((r) => r.innerText.replace(/\s+/g, ' ')),
    rels: det.querySelectorAll('.tx-rel-row').length,
    sumCards: [...det.querySelectorAll('.tx-sum-card')].map((c) => c.innerText.replace(/\s+/g, ' ')),
  };
});
ok('二十四天星區塊存在（坐子山午向）', !!st && st.head.includes('子山') && st.head.includes('午向'), st && st.head);
ok('天星環含天錢與屍氣', st && st.hasQian && st.hasShiqi);
ok('24 山名全在環上', st && st.mountains === 24, st && st.mountains);
ok('坐向星卡：坐子輔翼（吉）／向午開陽（吉）【八宅遊年坎宅】', st && st.sumCards.some((c) => c.includes('子山') && c.includes('輔翼')) && st.sumCards.some((c) => c.includes('向首') && c.includes('開陽')), st && st.sumCards);
ok('各司其職 8 項', st && st.duties === 8, st && st.duties);
ok('凶位警示含屍氣大凶在申山【坎宅絕命在坤】', st && st.warns.some((w) => w.includes('屍氣') && w.includes('大凶') && w.includes('申山')), st && st.warns[0]);
ok('星宮生剋 16 行', st && st.rels === 16, st && st.rels);

console.log('\n[1b] 天星坐向獨立設定（坐山 dropdown ＋ 向首角度輸入）');
// 坐山 dropdown：揀「坐辛山向乙」（八宅遊年兌宅：辛＝進賢伏位、乙＝屍氣絕命）
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  const sel = det.querySelector('.tx-sit-select');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, '辛'); sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(400);
let stO = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  return { cards: [...det.querySelectorAll('.tx-sum-card')].map((c) => c.innerText.replace(/\s+/g, ' ')) };
});
ok('坐山 dropdown：坐辛山向乙 → 坐辛進賢（伏位）／向乙屍氣（絕命）', stO.cards.some((c) => c.includes('辛') && c.includes('進賢')) && stO.cards.some((c) => c.includes('乙') && c.includes('屍氣')), stO.cards);
// 跟返玄空
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  [...det.querySelectorAll('button')].find((b) => b.textContent.includes('跟返玄空'))?.click();
});
await sleep(300);
stO = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  return { cards: [...det.querySelectorAll('.tx-sum-card')].map((c) => c.innerText.replace(/\s+/g, ' ')) };
});
ok('跟返玄空 → 返回坐子向午（坐子輔翼）', stO.cards.some((c) => c.includes('子山') && c.includes('輔翼')), stO.cards);
// 向首角度輸入：105°（乙）→ 坐辛
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  const inp = det.querySelector('.tx-deg-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, '105'); inp.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  [...det.querySelectorAll('button')].find((b) => b.textContent.trim() === '排盤')?.click();
});
await sleep(400);
stO = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  return { cards: [...det.querySelectorAll('.tx-sum-card')].map((c) => c.innerText.replace(/\s+/g, ' ')) };
});
ok('向首角度 105° → 坐辛山向乙（向乙屍氣）', stO.cards.some((c) => c.includes('乙') && c.includes('屍氣')), stO.cards);
// 還原
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  [...det.querySelectorAll('button')].find((b) => b.textContent.includes('跟返玄空'))?.click();
});
await sleep(300);

console.log('\n[2] 換坐山（午）→ 天星盤同步（共用坐向）');
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.includes('午山')));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, '午'); sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(400);
st = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  const cards = [...det.querySelectorAll('.tx-sum-card')].map((c) => c.innerText.replace(/\s+/g, ' '));
  const dutyQian = [...det.querySelectorAll('.tx-duty')].map((d) => d.innerText.replace(/\s+/g, ' ')).find((d) => d.includes('天錢'));
  return { head: det.querySelector('.panel-head').textContent.trim(), cards, dutyQian };
});
ok('標題同步為午山子向', st.head.includes('午山') && st.head.includes('子向'), st.head);
ok('離宅：坐午輔翼／向子開陽', st.cards.some((c) => c.includes('午山') && c.includes('輔翼')) && st.cards.some((c) => c.includes('向首') && c.includes('開陽')), st.cards);
ok('離宅：天錢在壬山（坎宮延年）', st.dutyQian && st.dutyQian.includes('壬山'), st.dutyQian);
// 還原坐子
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.includes('午山')));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, '子'); sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(300);

console.log('\n[3] AI 天星分析（模擬）＋追問＋存檔');
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  det.querySelector('.ai-btn').click();
});
await sleep(400);
st = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  return {
    result: det.querySelector('.ai-result')?.innerText.trim() || null,
    hasFu: !!det.querySelector('.fu-input'),
    saved: !!det.querySelector('.ai-saved'),
  };
});
ok('AI 分析顯示', st.result && st.result.includes('天星回答1'), st.result);
ok('已存檔＋追問框', st.saved && st.hasFu);
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  const input = det.querySelector('.fu-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '大門開坤方好嗎'); input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  det.querySelector('.fu-send').click();
});
await sleep(400);
st = await page.evaluate(() => {
  const det = [...document.querySelectorAll('details.panel')].find((d) => d.querySelector('.panel-head')?.textContent.includes('二十四天星'));
  return {
    a: det.querySelector('.fu-a')?.innerText.trim(),
    lib: JSON.parse(localStorage.getItem('star24_ai_v1') || '{}'),
  };
});
ok('追問回答顯示', st.a && st.a.includes('天星回答2'), st.a);
ok('對話串存檔', Object.values(st.lib).some((v) => v && Array.isArray(v.thread) && v.thread.length === 1 && v.thread[0].q === '大門開坤方好嗎'), Object.keys(st.lib));

console.log('\n[3c] 玄空分頁：直接對話已集中到「風水 AI」分頁');
const xkChat0 = await page.evaluate(() => ({
  chatHere: !!document.querySelector('.fschat-section'),
  pointer: [...document.querySelectorAll('.xk-note')].some((x) => x.textContent.includes('風水 AI')),
}));
ok('玄空分頁唔再有對話（已集中）', !xkChat0.chatHere, xkChat0);
ok('玄空分頁有「去風水 AI 分頁」提示', xkChat0.pointer, xkChat0);

console.log('\n[4] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
