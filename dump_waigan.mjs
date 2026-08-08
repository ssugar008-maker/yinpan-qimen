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
  for (const m of c.matchAll(/<div class="corner-number (n\d)">([\s\S]*?)<\/div>/g)) waigan[N2PAL[m[1]]] = (strip(m[2]).match(/[戊己庚辛壬癸丁丙乙]/g)) || [];
  return { input: dm?{y:+dm[1],m:+dm[2],d:+dm[3],h:+dm[4],mi:+dm[5]}:null, dun: ju?ju[1]:'', ju: ju?+ju[2]:0, waigan };
}
// canonical rotation: rotate so smallest palace number first
function canon(seq) { const a = seq.split('').map(Number); let best = null; for (let i = 0; i < 9; i++) { const r = a.slice(i).concat(a.slice(0, i)).join(''); if (best === null || r < best) best = r; } return best; }
function pathFor(eng, waigan, zhongStem) {
  const hourGan = eng.pillars[3][0];
  const anchorStem = hourGan === '甲' ? eng.xunShou.slice(-1) : hourGan;
  const anchorPalace = eng.zhiShi.palace;
  const map = {};
  for (const p of [1,2,3,4,6,7,8,9]) { const arr = waigan[p] || []; if (arr.length === 2) map[arr[0] === zhongStem ? arr[1] : arr[0]] = p; else if (arr.length === 1) map[arr[0]] = p; }
  if (zhongStem) map[zhongStem] = 5;
  if (map[anchorStem] !== anchorPalace) return null;
  const seq = [anchorPalace]; let stem = anchorStem;
  for (let i = 0; i < 8; i++) { stem = YIQI[(YIQI.indexOf(stem) + 1) % 9]; const p = map[stem]; if (p === undefined) return null; seq.push(p); }
  return seq.join('');
}
const files = fs.readdirSync(DATA_DIR).filter(f => /^yfj_.*\.html$/.test(f) && !f.includes('form'));
const groups = {};
for (const f of files.sort()) {
  let web; try { web = parseFile(path.join(DATA_DIR, f)); } catch (e) { continue; }
  if (!web.input || !web.ju) continue;
  const { y,m,d,h,mi } = web.input;
  let eng; try { eng = paipan(y,m,d,h,mi); } catch (e) { continue; }
  const dp = [1,2,3,4,6,7,8,9].find(p => (web.waigan[p]||[]).length === 2);
  const cands = [];
  if (dp !== undefined) for (const zs of web.waigan[dp]) { const s = pathFor(eng, web.waigan, zs); if (s) cands.push(s); }
  else { const s = pathFor(eng, web.waigan, null); if (s) cands.push(s); }
  const key = `${web.dun}${web.ju}`;
  (groups[key] = groups[key] || []).push({ f, cands, zsPalace: eng.zhiShi.palace });
}
for (const k of Object.keys(groups).sort()) {
  const canonCount = {};
  for (const g of groups[k]) for (const c of g.cands) { const cc = canon(c); canonCount[cc] = (canonCount[cc] || 0) + 1; }
  const top = Object.entries(canonCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`${k} (${groups[k].length} charts): ${top.map(([c, n]) => `${c}×${n}`).join('  ')}`);
}
