import fs from 'fs';
import path from 'path';
import { paipan } from './src/qimen/engine.js';

const DATA_DIR = 'C:/Users/User/Documents';
const GRID = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const YIQI = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];
const HLCOLOR = { '#d6b900': '墓', '#d135d5': '刑', '#4dadff': '刑墓', 'indianred': '门迫' };

const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const grab = (c, re) => { const m = c.match(re); return m ? strip(m[1]) : ''; };

function parseCell(cell) {
  const parts = cell.split(/<br\s*\/?>/i);
  const god = (parts[0].match(/<font color="red">([^<]*)<\/font>/) || [])[1] || '';
  const hasO = /<font color="blue">\s*O\s*<\/font>/.test(parts[0]);
  const star = ((parts[1] || '').match(/<font color="purple">([^<]*)<\/font>/) || [])[1] || '';
  // 天盘干：part1 去掉星后的天干
  const part1NoStar = (parts[1] || '').replace(/<font color="purple">[^<]*<\/font>/, ' ');
  const tianGan = (strip(part1NoStar).match(/[戊己庚辛壬癸丁丙乙]/g) || []);
  // 门 + 地盘干
  const part2 = parts.slice(2).join(' ');
  const doorM = part2.match(/[休生伤杜景死惊开中]门/);
  const door = doorM ? doorM[0] : '';
  const diganText = strip(part2.replace(/[休生伤杜景死惊开中]门/, ' '));
  const diGans = (diganText.match(/[戊己庚辛壬癸丁丙乙]/g) || []);
  // 高亮
  const hl = [...cell.matchAll(/background:\s*(#[0-9a-fA-F]+|indianred)"?>([^<]+)</g)]
    .map(m => ({ color: m[1].toLowerCase(), txt: m[2].trim() }))
    .filter(h => HLCOLOR[h.color]);
  return { god, hasO, star, tianGan, door, diGans, hl };
}

function parseFile(f) {
  const c = fs.readFileSync(f, 'utf8');
  const gongli = grab(c, /公历：([\s\S]{0,40}?)\n/) || grab(c, /公历：(.{0,40})/);
  const dm = gongli.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  const ju = grab(c, /定局：(.{0,60})/).match(/([阳阴])遁(\d+)局/);
  const zf = grab(c, /值符：(.{0,40})/);
  const zs = grab(c, /值使：(.{0,40})/);
  const horse = grab(c, /马星：(.{0,40})/);
  const yj = grab(c, /月将：(.{0,20})/);
  const tm = c.match(/<table class="qimen-table">([\s\S]*?)<\/table>/);
  const cells = [...tm[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => parseCell(m[1]));
  const palaces = {};
  cells.forEach((x, i) => palaces[GRID[i]] = x);
  return {
    input: dm ? { y: +dm[1], m: +dm[2], d: +dm[3], h: +dm[4], mi: +dm[5] } : null,
    dun: ju ? ju[1] : '', ju: ju ? +ju[2] : 0,
    zhiFu: zf, zhiShi: zs, horse, yuejiang: yj,
    palaces,
  };
}

function engineMarkSet(p) {
  const s = new Set();
  for (const sm of p.stemMarks) if (sm.type) s.add(sm.type === '刑墓' ? '刑墓' : sm.type);
  if (p.menpo) s.add('门迫');
  return s;
}
function webMarkSet(cell) {
  const s = new Set();
  for (const h of cell.hl) s.add(HLCOLOR[h.color]);
  return s;
}

const files = fs.readdirSync(DATA_DIR).filter(f => /^yfj_.*\.html$/.test(f) && !f.includes('form'));
let totalCells = 0, badCells = 0, totalFiles = 0, badFiles = 0;
const problems = [];
for (const f of files.sort()) {
  const full = path.join(DATA_DIR, f);
  let web;
  try { web = parseFile(full); } catch (e) { continue; }
  if (!web.input || !web.ju) continue;
  totalFiles++;
  const { y, m, d, h, mi } = web.input;
  let eng;
  try { eng = paipan(y, m, d, h, mi); } catch (e) { problems.push(`${f}: ENGINE ERROR ${e.message}`); badFiles++; continue; }
  const fileProb = [];
  // 局数 & 阴阳遁
  if (eng.dun !== web.dun || eng.ju !== web.ju) fileProb.push(`局: 引擎${eng.dun}${eng.ju} vs 网${web.dun}${web.ju}`);
  // 值符值使
  const zfStar = (web.zhiFu.match(/天[蓬任冲辅英芮柱心禽]/) || [''])[0];
  const zfPal = (web.zhiFu.match(/落([一二三四五六七八九])宫/) || [])[1];
  const zsDoor = (web.zhiShi.match(/[休生伤杜景死惊开]门/) || [''])[0];
  const CN2N = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (eng.zhiFu.star !== zfStar) fileProb.push(`值符星: 引擎${eng.zhiFu.star} vs 网${zfStar}`);
  if (zfPal && eng.zhiFu.palace !== CN2N[zfPal]) fileProb.push(`值符宫: 引擎${eng.zhiFu.palace} vs 网${zfPal}`);
  if (eng.zhiShi.door !== zsDoor) fileProb.push(`值使门: 引擎${eng.zhiShi.door} vs 网${zsDoor}`);
  // 马星
  const horseZ = (web.horse.match(/马星([子丑寅卯辰巳午未申酉戌亥])/) || [])[1];
  if (horseZ && eng.horse.zhi !== horseZ) fileProb.push(`马星: 引擎${eng.horse.zhi} vs 网${horseZ}`);
  // 月将
  const yjZ = (web.yuejiang.match(/([子丑寅卯辰巳午未申酉戌亥])/) || [])[1];
  if (yjZ && eng.yueJiang !== yjZ) fileProb.push(`月将: 引擎${eng.yueJiang} vs 网${yjZ}`);
  // 各宫
  for (const p of [1, 2, 3, 4, 6, 7, 8, 9]) {
    totalCells++;
    const w = web.palaces[p], e = eng.palaces[p];
    const cp = [];
    if ((w.god || '') !== (e.god || '')) cp.push(`神(${e.god}≠${w.god})`);
    const wStars = w.star ? (w.star.match(/天[蓬任冲辅英芮柱心禽]/g) || []) : [];
    if (JSON.stringify(wStars) !== JSON.stringify(e.stars)) cp.push(`星(${e.stars.join('')}≠${wStars.join('')})`);
    if (JSON.stringify(w.tianGan) !== JSON.stringify(e.tianGan)) cp.push(`天盘干(${e.tianGan.join('')}≠${w.tianGan.join('')})`);
    if ((w.door || '') !== (e.door || '')) cp.push(`门(${e.door}≠${w.door})`);
    const wDi = w.diGans; const eDi = [e.diGan, ...(e.diGanExtra ? [e.diGanExtra] : [])];
    // 网站 quirk：天芮天禽落巽四时，网页不显示该宫地盘干（引擎计算正确，跳过此项比对）
    const webOmitsDi = wDi.length === 0 && e.stars.includes('天禽');
    if (!webOmitsDi && JSON.stringify(wDi) !== JSON.stringify(eDi)) cp.push(`地盘干(${eDi.join('')}≠${wDi.join('')})`);
    if (w.hasO !== e.isKong) cp.push(`空亡(${e.isKong}≠${w.hasO})`);
    // markers（若网站省略地盘干，则其对应标记也会缺，跳过）
    if (!webOmitsDi) {
      const wm = webMarkSet(w), em = engineMarkSet(e);
      if (JSON.stringify([...wm].sort()) !== JSON.stringify([...em].sort())) cp.push(`标记(引${[...em].join('/')}≠网${[...wm].join('/')})`);
    }
    if (cp.length) { badCells++; fileProb.push(`宫${p}: ${cp.join(' ')}`); }
  }
  if (fileProb.length) { badFiles++; problems.push(`\n### ${f} (${y}-${m}-${d} ${h}:${mi})`); problems.push(...fileProb); }
}
console.log(`\n===== 文件: ${totalFiles}, 有差异: ${badFiles} =====`);
console.log(`===== 宫外格: ${totalCells}, 有差异: ${badCells} =====`);
if (problems.length) { console.log('\n差异明细:'); problems.slice(0, 60).forEach(p => console.log(p)); }
else console.log('\n全部一致 ✓');
