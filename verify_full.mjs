// 全面對比引擎 vs yuanfenju 九宮每一項（八神/九星/八門/天盤/地盤）
import fs from 'fs';
import { paipan } from './src/qimen/engine.js';

const file = process.argv[2] || 'C:/Users/User/Documents/yfj_result_20260516_1138.html';
const dt = process.argv[3] || '2026-05-16 11:38:00';
const c = fs.readFileSync(file, 'utf8');

const gridPos = c.indexOf('天冲', 40000);
const tStart = c.lastIndexOf('<table', gridPos);
const tEnd = c.indexOf('</table>', gridPos) + 8;
const tbl = c.slice(tStart, tEnd);
const cells = [...tbl.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => m[1]);

const strip = s => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// grid order: 巽4 離9 坤2 / 震3 中5 兌7 / 艮8 坎1 乾6
const order = [4, 9, 2, 3, 5, 7, 8, 1, 6];

const yfj = {};
cells.forEach((cell, i) => {
  const p = order[i];
  const god = (cell.match(/color="red">([^<]+)</) || [])[1] || '';
  const star = (cell.match(/color="purple">([^<]+)</) || [])[1] || '';
  // door = the blue-font segment containing 门 (skip the blue "O" void marker)
  let door = '', doorIdx = -1;
  for (const m of cell.matchAll(/color="blue">([\s\S]*?)<\/font>/g)) {
    const s = strip(m[1]);
    if (s.includes('门')) { door = s; doorIdx = m.index; break; }
  }
  // 天盘干在门前，地盘干在门后
  const before = strip(cell.slice(0, doorIdx)).replace(god.trim(), ' ').replace(star.trim(), ' ');
  const after = strip(cell.slice(doorIdx));
  const tianStems = before.split(' ').filter(x => /^[甲乙丙丁戊己庚辛壬癸]$/.test(x)).join('');
  const diStems = after.split(' ').filter(x => /^[甲乙丙丁戊己庚辛壬癸]$/.test(x)).join('');
  yfj[p] = { god: god.trim(), star: star.trim(), door, tian: tianStems, di: diStems };
});

const m = dt.match(/(\d+)-(\d+)-(\d+) (\d+):(\d+)/);
const eng = paipan(+m[1], +m[2], +m[3], +m[4], +m[5]);
const GOD2TR = { '值符':'值符','螣蛇':'螣蛇','太阴':'太陰','六合':'六合','白虎':'白虎','玄武':'玄武','九地':'九地','九天':'九天' };
console.log('宮 | 八神 星 門 天 地 (yuanfenju)  vs  (engine)');
let allOk = true;
for (const p of [4,9,2,3,7,8,1,6]) {
  const y = yfj[p], e = eng.palaces[p];
  const eGod = e.god, eStar = e.stars.join(''), eDoor = e.door, eTian = e.tianGan.join('');
  const eDi = e.diGan + (e.diGanExtra || ''); // 地盘（含中五寄坤二）
  const godOk = (GOD2TR[y.god]||y.god) === eGod || y.god === eGod;
  const ok = godOk && y.star===eStar && y.door===eDoor && y.tian===eTian && y.di===eDi;
  if (!ok) allOk = false;
  console.log(`${p} | ${y.god}/${y.star}/${y.door}/${y.tian}/${y.di}  vs  ${eGod}/${eStar}/${eDoor}/${eTian}/${eDi}  ${ok?'✓':'✗'}`);
}
console.log(allOk ? '\n全部九宮完全吻合 ✓' : '\n有差異 ✗');
