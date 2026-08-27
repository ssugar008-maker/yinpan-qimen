// 餘額進度條 E2E：模擬 /api/usage 各種回應，驗證進度條比例、顏色、充值自動抬高、不支援時隱藏
// 用法：npm i --no-save puppeteer-core && npm run dev（另開 terminal）&& node e2e_usage_badge.mjs
import puppeteer from 'puppeteer-core';

const URL = process.env.E2E_URL || 'http://localhost:5173/';
let pass = 0, fail = 0;
const ok = (name, cond, got) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${got !== undefined ? ` → 實際：${JSON.stringify(got)?.slice(0, 200)}` : ''}`); } };

const browser = await puppeteer.launch({ executablePath: '/usr/local/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));

let balanceResp = { supported: true, currency: 'CNY', total: 12.34, granted: 0.34, toppedUp: 12 };
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.url().includes('/api/usage')) {
    req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(balanceResp) });
  } else req.continue();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const balState = () => page.evaluate(() => {
  const row = document.querySelector('.usage-bal');
  if (!row) return null;
  const fill = row.querySelector('.usage-bar-fill');
  return {
    label: row.querySelector('.usage-bal-label').textContent.trim(),
    ref: row.querySelector('.usage-bal-ref').textContent.trim(),
    width: fill.style.width,
    color: fill.style.background,
    low: row.classList.contains('low'),
  };
});

console.log('\n[1] 正常餘額（預設參考總額 50）');
await page.evaluateOnNewDocument(() => { localStorage.setItem('mo_ai_balance_ref', '50'); });
await page.goto(URL, { waitUntil: 'networkidle2' });
await sleep(500);
let s = await balState();
ok('餘額列顯示', !!s);
ok('標籤 ¥12.34', s && s.label === 'API 餘額 ¥12.34', s);
ok('參考總額 / ¥50.00', s && s.ref === '/ ¥50.00', s);
ok('進度條寬度 ≈24.7%', s && Math.abs(parseFloat(s.width) - 24.68) < 0.5, s && s.width);
ok('24.7% → 橙色（中段）', s && /d97706|rgb\(217, 119, 6\)/.test(s.color), s && s.color);
ok('非低量無 low 類', s && s.low === false);

console.log('\n[2] 低餘額 → 紅色警示');
balanceResp = { supported: true, currency: 'CNY', total: 3.5, granted: 0, toppedUp: 3.5 };
await page.reload({ waitUntil: 'networkidle2' });
await sleep(500);
s = await balState();
ok('3.5/50 = 7% → 紅色', s && /dc2626|rgb\(220, 38, 38\)/.test(s.color), s);
ok('低量加 low 類（粗體紅字）', s && s.low === true);
ok('提示該充值', await page.evaluate(() => document.querySelector('.usage-bal').title.includes('該充值')));

console.log('\n[3] 充值後自動抬高參考總額');
balanceResp = { supported: true, currency: 'CNY', total: 100, granted: 0, toppedUp: 100 };
await page.reload({ waitUntil: 'networkidle2' });
await sleep(500);
s = await balState();
ok('餘額 100 > 參考 50 → 參考自動抬高為 100', s && s.ref === '/ ¥100.00', s);
ok('進度條 100% 紫色', s && parseFloat(s.width) === 100 && /7c5cbf|rgb\(124, 92, 191\)/.test(s.color), s);
ok('本機參考已寫回', await page.evaluate(() => localStorage.getItem('mo_ai_balance_ref')) === '100');

console.log('\n[4] 服務商不支援 → 隱藏餘額列');
balanceResp = { supported: false };
await page.reload({ waitUntil: 'networkidle2' });
await sleep(500);
s = await balState();
ok('不支援時無餘額列', s === null, s);

console.log('\n[5] USD 符號');
balanceResp = { supported: true, currency: 'USD', total: 8, granted: 0, toppedUp: 8 };
await page.reload({ waitUntil: 'networkidle2' });
await sleep(500);
s = await balState();
ok('USD 顯示 $ 符號', s && s.label.includes('$8.00'), s);

console.log('\n[6] Console／頁面錯誤');
ok('無 JS 錯誤', errors.length === 0, errors);

await browser.close();
console.log(`\n結果：${pass} 通過，${fail} 失敗`);
process.exit(fail ? 1 : 0);
