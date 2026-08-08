import fs from 'fs';

const [,, y, m, d, h, mi] = process.argv;
const body = new URLSearchParams({
  name: '', sex: 'male', type: 'gongli',
  year: y, month: m, day: d, hours: h, minute: mi,
  pan_model: '0', ke_sect: '1', ju_model: '0', lang: 'zh-cn',
});
const res = await fetch('https://yuanfenju.com/index/yinpanqimen_result.html', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
  body: body.toString(),
  redirect: 'follow',
});
const html = await res.text();
const fn = `C:/Users/User/Documents/yfj_result_${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}_${String(h).padStart(2,'0')}${String(mi).padStart(2,'0')}.html`;
fs.writeFileSync(fn, html);
console.log('saved', fn, 'len', html.length);
