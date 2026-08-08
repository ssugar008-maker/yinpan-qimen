import fs from 'fs';
import path from 'path';
import { paipan } from './src/qimen/engine.js';

const DATA_DIR = 'C:/Users/User/Documents';
const YIQI = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];
const N2PAL = { n1: 4, n2: 2, n3: 8, n4: 6, n5: 3, n6: 7, n7: 9, n8: 1 };
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const grab = (c, re) => { const m = c.match(re); return m ? strip(m[1]) : ''; };

function parseFile(f) {
  const c = fs.readFileSync(f, 'utf8');
  const gongli = grab(c, /公历：([\s\S]{0,40}?)\n/) || grab(c, /公历：(.{0,40})/);
  const dm = gongli.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  const ju = grab(c, /定局：(.{0,60})/).match(/([阳阴])遁(\d+)局/);
  const waigan = {};
  for (const m of c.matchAll(/<div class="corner-number (n\d)">([\s\S]*?)<\/div>/g)) {
    waigan[N2PAL[m[1]]] = (strip(m[2]).match(/[戊己庚辛壬癸丁丙乙]/g)) || [];
  }
  return {
    input: dm ? { y: +dm[1], m: +dm[2], d: +dm[3], h: +dm[4], mi: +dm[5] } : null,
    dun: ju ? ju[1] : '', ju: ju ? +ju[2] : 0, waigan,
  };
}
function flightFrom(anchorPalace, anchorStem, dir) {
  const res = {}; let si = YIQI.indexOf(anchorStem); let p = anchorPalace;
  for (let i = 0; i < 9; i++) { res[p] = YIQI[si]; si = (si + 1) % 9; p = ((p - 1 + dir + 9) % 9) + 1; }
  return res;
}
function matches(res, waigan) {
  for (const p of [1,2,3,4,6,7,8,9]) {
    const w = waigan[p] ? waigan[p][0] : undefined;
    if (w !== undefined && res[p] !== w) return false;
  }
  return true;
}

const files = fs.readdirSync(DATA_DIR).filter(f => /^yfj_.*\.html$/.test(f) && !f.includes('form'));
const rows = [];
for (const f of files.sort()) {
  let web; try { web = parseFile(path.join(DATA_DIR, f)); } catch (e) { continue; }
  if (!web.input || !web.ju) continue;
  const { y, m, d, h, mi } = web.input;
  let eng; try { eng = paipan(y, m, d, h, mi); } catch (e) { continue; }
  const hourGan = eng.pillars[3][0];
  const xsy = eng.xunShou.slice(-1);
  const anchorStem = hourGan === '甲' ? xsy : hourGan;
  // find anchor palace(s) where web 外干 == anchorStem
  const cand = [];
  for (const p of [1,2,3,4,5,6,7,8,9]) {
    const arr = web.waigan[p] || [];
    if (arr.includes(anchorStem)) cand.push(p);
  }
  // also 中5 stem might be 寄到某宫 (second stem)
  let found = null;
  for (const ap of cand) for (const dir of [1, -1]) {
    const res = flightFrom(ap, anchorStem, dir);
    // 中5 寄宫: web 把中5干放到 host 宫作第二干
    if (matches(res, web.waigan)) {
      // verify 中5 stem 寄宫位置
      const z5 = res[5];
      const host = Object.keys(web.waigan).find(k => (web.waigan[k]||[]).length > 1 && web.waigan[k][1] === z5);
      found = { ap, dir, z5, host: host ? +host : null };
      break;
    }
  }
  rows.push({ f, dun: web.dun, ju: web.ju, hourGan, anchorStem, cand, zf: eng.zhiFu.palace, zs: eng.zhiShi.palace, found });
}
console.log('total parsed:', rows.length);
const withFound = rows.filter(r => r.found);
console.log('matched some anchor+dir:', withFound.length);
// 统计 anchor 与 值使宫 的关系 / dir 与 阴阳 的关系
let anchorIsZS = 0, dirByDun = { Y1:0,'Y-1':0,N1:0,'N-1':0 };
for (const r of withFound) {
  if (r.found.ap === r.zs) anchorIsZS++;
  const key = (r.dun === '阳' ? 'Y' : 'N') + r.found.dir;
  dirByDun[key]++;
}
console.log('anchor==值使宫:', anchorIsZS, '/', withFound.length);
console.log('dir by dun:', JSON.stringify(dirByDun));
console.log('\nsample rows:');
rows.slice(0, 12).forEach(r => console.log(
  `${r.dun}${r.ju} 时干${r.hourGan} 锚宫${r.found?r.found.ap:'?'} dir${r.found?r.found.dir:'?'} 值符${r.zf} 值使${r.zs} 中5寄${r.found?r.found.host:'?'}  ${r.f}`
));
