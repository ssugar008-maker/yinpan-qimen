import fs from 'fs';
import path from 'path';
import { paipan } from './src/qimen/engine.js';

const DATA_DIR = 'C:/Users/User/Documents';
const N2PAL = { n1: 4, n2: 2, n3: 8, n4: 6, n5: 3, n6: 7, n7: 9, n8: 1 };
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const grab = (c, re) => { const m = c.match(re); return m ? strip(m[1]) : ''; };
function parseFile(f) {
  const c = fs.readFileSync(f, 'utf8');
  const gongli = grab(c, /公历：([\s\S]{0,40}?)\n/) || grab(c, /公历：(.{0,40})/);
  const dm = gongli.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  const ju = grab(c, /定局：(.{0,60})/).match(/([阳阴])遁(\d+)局/);
  const waigan = {};
  for (const m of c.matchAll(/<div class="corner-number (n\d)">([\s\S]*?)<\/div>/g)) waigan[N2PAL[m[1]]] = (strip(m[2]).match(/[戊己庚辛壬癸丁丙乙]/g)) || [];
  return { input: dm?{y:+dm[1],m:+dm[2],d:+dm[3],h:+dm[4],mi:+dm[5]}:null, dun: ju?ju[1]:'', ju: ju?+ju[2]:0, waigan };
}
const OUTER = [1,2,3,4,6,7,8,9];
const files = fs.readdirSync(DATA_DIR).filter(f => /^yfj_.*\.html$/.test(f) && !f.includes('form'));
let pass = 0, total = 0; const fails = [];
for (const f of files.sort()) {
  let web; try { web = parseFile(path.join(DATA_DIR, f)); } catch (e) { continue; }
  if (!web.input || !web.ju) continue;
  const { y,m,d,h,mi } = web.input;
  let eng; try { eng = paipan(y,m,d,h,mi); } catch (e) { continue; }
  total++;
  // build engine display: outer own stem; jiGong gets + center
  const disp = {};
  for (const p of OUTER) disp[p] = [eng.waigan[p]];
  if (eng.waiganJiGong && disp[eng.waiganJiGong]) disp[eng.waiganJiGong] = [eng.waigan[eng.waiganJiGong], eng.waiganCenter];
  let ok = true;
  for (const p of OUTER) {
    const w = web.waigan[p] || []; if (!w.length) continue;
    if ([...w].sort().join('') !== [...disp[p]].sort().join('')) { ok = false; break; }
  }
  if (ok) pass++; else fails.push(`${f.replace('yfj_','').replace('.html','')}(${web.dun}${web.ju},${eng.pillars[3][0]})`);
}
console.log(`ENGINE 外干 full match: ${pass}/${total}`);
console.log('Fails:', fails.join(', '));

const ref = paipan(2026, 5, 16, 11, 38);
console.log(`\nReference 2026-05-16 11:38 (${ref.dun}${ref.ju}局): 離9=${ref.waigan[9]} 坤2=${ref.waigan[2]} 乾6=${ref.waigan[6]} 寄宮=${ref.waiganJiGong} 中5=${ref.waiganCenter}`);
