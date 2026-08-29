// 二十四天星分頁 E2E：天星環、自動分析、AI 分析（模擬）、平面圖疊加
// 用法：npm i --no-save puppeteer-core && npm run dev（另開 terminal）&& node e2e_tianxing.mjs
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';

const URL = process.env.E2E_URL || 'http://localhost:5173/';
let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → 實際：${JSON.stringify(got)?.slice(0, 250)}` : ''}`); } };

// 1x1 白色 PNG 作測試平面圖
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
writeFileSync('/tmp/test_plan.png', PNG_1PX);

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

console.log('\n[1] 分頁與天星環');
const tabBtn = await page.$$("xpath///button[contains(@class,'tab') and contains(text(),'二十四天星')]");
ok('二十四天星分頁存在', tabBtn.length > 0);
await tabBtn[0].click();
await page.waitForSelector('.star-ring');
await sleep(300);
let st = await page.evaluate(() => {
  const texts = [...document.querySelectorAll('.star-ring text')].map((x) => x.textContent);
  return {
    head: [...document.querySelectorAll('.panel-head')][0].textContent.trim(),
    count: texts.length,
    hasQian: texts.includes('天錢'), hasShiqi: texts.includes('屍氣'),
    center: texts.filter((x) => x.includes('坐') || x.includes('向')).join(' '),
    mountains: texts.filter((x) => x.length === 1 && '子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥壬'.includes(x)).length,
  };
});
ok('面板標題', st.head === '二十四天星（玄道風水）', st.head);
ok('天星環含天錢與屍氣', st.hasQian && st.hasShiqi);
ok('24 山名全在環上', st.mountains === 24, st.mountains);
ok('中心顯示坐子山向午', st.center.includes('坐子山') && st.center.includes('向午'), st.center);

console.log('\n[2] 自動分析（坐子向午）');
st = await page.evaluate(() => {
  const txt = document.querySelector('.tx').innerText;
  return {
    sitFace: txt.includes('坐山星：') && txt.includes('天錢') && txt.includes('天權'),
    duties: document.querySelectorAll('.tx-duty').length,
    dutyText: [...document.querySelectorAll('.tx-duty')].map((d) => d.innerText.replace(/\s+/g, ' ')).join(' | '),
    warns: [...document.querySelectorAll('.xk-cure-row')].map((r) => r.innerText.replace(/\s+/g, ' ')),
    rels: document.querySelectorAll('.tx-rel-row').length,
  };
});
ok('坐向星分析（天錢/天權）', st.sitFace);
ok('各司其職 8 項', st.duties === 8, st.duties);
ok('財位天錢在子山正北', st.dutyText.includes('財位') && st.dutyText.includes('天錢') && st.dutyText.includes('子山・正北'), st.dutyText.slice(0, 150));
ok('凶位警示含屍氣大凶', st.warns.some((w) => w.includes('屍氣') && w.includes('大凶') && w.includes('壬山')), st.warns[0]);
ok('星宮生剋 16 行（有五行之星）', st.rels === 16, st.rels);

console.log('\n[3] 換坐向（坐午向子）→ 全盤更新');
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('.xk-form select')][0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, '午'); sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(300);
st = await page.evaluate(() => {
  const txt = document.querySelector('.tx').innerText;
  const texts = [...document.querySelectorAll('.star-ring text')].map((x) => x.textContent);
  return { sitFace: txt.match(/坐山星：\s*(\S+)/)?.[0] || '', face: txt.includes('屍氣'), center: texts.filter((x) => x.includes('坐') || x.includes('向')).join(' '), dutyQian: [...document.querySelectorAll('.tx-duty')].map((d) => d.innerText.replace(/\s+/g, ' ')).find((d) => d.includes('天錢')) };
});
ok('坐午向子：坐星天孫、向星屍氣', st.sitFace.includes('天孫') && st.face, st.sitFace);
ok('中心顯示坐午山向子', st.center.includes('坐午山') && st.center.includes('向子'), st.center);
ok('乙盤：天錢在癸山', st.dutyQian && st.dutyQian.includes('癸山'), st.dutyQian);
// 還原坐子
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('.xk-form select')][0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, '子'); sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(200);

console.log('\n[4] AI 天星分析（模擬）＋追問＋存檔');
await page.evaluate(() => document.querySelector('.tx .ai-btn').click());
await sleep(400);
st = await page.evaluate(() => ({
  result: document.querySelector('.tx .ai-result')?.textContent.trim() || null,
  hasFu: !!document.querySelector('.tx .fu-input'),
  saved: !!document.querySelector('.tx .ai-saved'),
}));
ok('AI 分析顯示', st.result === '【天星回答1】財位在子山。', st.result);
ok('已存檔＋追問框', st.saved && st.hasFu);
await page.type('.tx .fu-input', '大門開坤方好嗎');
await page.evaluate(() => document.querySelector('.tx .fu-send').click());
await sleep(400);
st = await page.evaluate(() => ({
  a: document.querySelector('.tx .fu-a')?.textContent.trim(),
  lib: JSON.parse(localStorage.getItem('star24_ai_v1') || '{}'),
}));
ok('追問回答顯示', st.a?.includes('天星回答2'), st.a);
ok('對話串存檔', Object.values(st.lib).some((v) => v && Array.isArray(v.thread) && v.thread.length === 1 && v.thread[0].q === '大門開坤方好嗎'), Object.keys(st.lib));

console.log('\n[5] 平面圖立極尺');
st = await page.evaluate(() => ({ upload: !!document.querySelector('.fp-upload'), text: document.querySelector('.fp-upload-text')?.textContent || '' }));
ok('上載區顯示', st.upload && st.text.includes('上載平面圖'), st);
const fileInput = await page.$('input[type=file]');
await fileInput.uploadFile('/tmp/test_plan.png');
await sleep(500);
st = await page.evaluate(() => ({
  stage: !!document.querySelector('.fp-stage'),
  ring: !!document.querySelector('.fp-ring .star-ring'),
  controls: document.querySelectorAll('.fp-controls input[type=range]').length,
}));
ok('上載後顯示圖片＋天星環', st.stage && st.ring);
ok('旋轉/大小/透明度三控制', st.controls === 3, st.controls);
// 旋轉控制
await page.evaluate(() => {
  const r = document.querySelectorAll('.fp-controls input[type=range]')[0];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(r, '90'); r.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(200);
st = await page.evaluate(() => ({
  transform: document.querySelector('.fp-ring').style.transform,
  opacity: document.querySelector('.fp-ring').style.opacity,
}));
ok('旋轉 90° 生效', st.transform.includes('rotate(90deg)'), st.transform);
ok('預設透明度 0.85', st.opacity === '0.85', st.opacity);
// 拖曳（先捲入視窗範圍）
const ring = await page.$('.fp-ring');
await ring.scrollIntoView();
await sleep(200);
const box = await ring.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 });
await page.mouse.up();
await sleep(200);
st = await page.evaluate(() => document.querySelector('.fp-ring').style.transform);
ok('拖曳移動生效（translate 偏移）', /translate\(calc\(-50% \+ 40px\), calc\(-50% \+ 30px\)\)/.test(st), st);
st = await page.evaluate(() => ({ actions: document.querySelectorAll('.fp-actions .btn').length, note: document.querySelector('.fp-stage') !== null }));
ok('操作按鈕（更換/重設/下載）', st.actions === 3, st.actions);

console.log('\n[6] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
