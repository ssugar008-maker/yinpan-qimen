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
const files = fs.readdirSync(DATA_DIR).filter(f => /^yfj_.*\.html$/.test(f) && !f.includes('form'));
const rows = [];
for (const f of files.sort()) {
  let web; try { web = parseFile(path.join(DATA_DIR, f)); } catch (e) { continue; }
  if (!web.input || !web.ju) continue;
  const { y,m,d,h,mi } = web.input;
  let eng; try { eng = paipan(y,m,d,h,mi); } catch (e) { continue; }
  // find double-stem palace (寄宫)
  let jiGong = null;
  for (const p of Object.keys(web.waigan)) if (web.waigan[p].length === 2) jiGong = +p;
  rows.push({ dun: web.dun, ju: web.ju, jiGong, zhiFu: eng.zhiFu.palace, zhiShi: eng.zhiShi.palace, hourGan: eng.pillars[3][0] });
}
// Correlate 寄宫 with 值符/值使
const byRel = {};
for (const r of rows) {
  if (r.jiGong == null) continue;
  const rel = r.jiGong === r.zhiFu ? '值符' : r.jiGong === r.zhiShi ? '值使' : r.jiGong === 2 ? '坤2' : r.jiGong === 8 ? '艮8' : 'other';
  byRel[rel] = (byRel[rel] || 0) + 1;
}
console.log('寄宫 distribution vs 值符/值使/坤2/艮8:', JSON.stringify(byRel));
console.log('total with double:', rows.filter(r => r.jiGong != null).length, '/', rows.length);
console.log('\nsample (dun ju 寄宫 值符 值使):');
for (const r of rows.slice(0, 30)) console.log(`  ${r.dun}${r.ju} 寄${r.jiGong} 值符${r.zhiFu} 值使${r.zhiShi} 时干${r.hourGan}`);
