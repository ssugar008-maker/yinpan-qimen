// 阴盘奇门（时盘）排盘引擎 —— 复刻 yuanfenju.com 阴盘奇门排盘逻辑
// 定局：年支数 + 农历月 + 农历日 + 时支数，之和 ÷ 9 取余（余 0 为 9 局）
// 阴阳遁：冬至后夏至前为阳遁，夏至后冬至前为阴遁
// 排盘：转盘奇门（值符随时干、值使随时宫、小值符随大值符，阳顺阴逆）
import { Solar } from 'lunar-javascript';

export const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 顺时针外盘八宫（洛书方位顺行）：坎1 艮8 震3 巽4 离9 坤2 兑7 乾6
export const RING = [1, 8, 3, 4, 9, 2, 7, 6];
export const PALACE_NAME = { 1: '坎一宫', 2: '坤二宫', 3: '震三宫', 4: '巽四宫', 5: '中五宫', 6: '乾六宫', 7: '兑七宫', 8: '艮八宫', 9: '离九宫' };
export const PALACE_GUA = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 5: '中', 6: '乾', 7: '兑', 8: '艮', 9: '离' };

// 三奇六仪固定顺序
const YIQI = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'];

// 九星（外盘八星顺时针）+ 天禽居中寄坤二宫
const STAR_HOME = { 1: '天蓬', 8: '天任', 3: '天冲', 4: '天辅', 9: '天英', 2: '天芮', 7: '天柱', 6: '天心', 5: '天禽' };
// 八门固定宫
const DOOR_HOME = { 1: '休门', 8: '生门', 3: '伤门', 4: '杜门', 9: '景门', 2: '死门', 7: '惊门', 6: '开门' };
const DOOR_PALACE = { 休门: 1, 生门: 8, 伤门: 3, 杜门: 4, 景门: 9, 死门: 2, 惊门: 7, 开门: 6 };
// 八神固定顺序
const GOD_ORDER = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'];

// 五行
const PALACE_WUXING = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
const DOOR_WUXING = { 休门: '水', 生门: '土', 伤门: '木', 杜门: '木', 景门: '火', 死门: '土', 惊门: '金', 开门: '金' };
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // 我克者

// 入墓宫（十二长生墓位）：乙丙戊→戌(乾6)，丁己庚→丑(艮8)，辛壬→辰(巽4)，癸→未(坤2)
const MU_PALACE = { 乙: 6, 丙: 6, 丁: 8, 戊: 6, 己: 8, 庚: 8, 辛: 4, 壬: 4, 癸: 2 };
// 六仪击刑宫：戊→震3(子卯刑) 己→坤2(戌未刑) 庚→艮8(申寅刑) 辛→离9(午午) 壬→巽4(辰辰) 癸→巽4(寅巳)
const JIXING_PALACE = { 戊: 3, 己: 2, 庚: 8, 辛: 9, 壬: 4, 癸: 4 };

// 旬首六仪
const XUNSHOU_YI = { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' };

// 驿马（时支三合）：申子辰马在寅，寅午戌马在申，巳酉丑马在亥，亥卯未马在巳
const HORSE = { 申: '寅', 子: '寅', 辰: '寅', 寅: '申', 午: '申', 戌: '申', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳' };

// 月将（中气太阳过宫）
const YUEJIANG = { 雨水: '亥', 春分: '戌', 谷雨: '酉', 小满: '申', 夏至: '未', 大暑: '午', 处暑: '巳', 秋分: '辰', 霜降: '卯', 小雪: '寅', 冬至: '丑', 大寒: '子' };

// 阳遁节气（冬至→芒种），其余（夏至→大雪）为阴遁
const YANG_TERMS = new Set(['冬至', '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种']);

// 地支→宫位
const ZHI_PALACE = { 子: 1, 丑: 8, 寅: 8, 卯: 3, 辰: 4, 巳: 4, 午: 9, 未: 2, 申: 2, 酉: 7, 戌: 6, 亥: 6 };

const ringIndex = (p) => RING.indexOf(p);
const mod = (n, m) => ((n % m) + m) % m;

// 计算某干支的旬首与旬空
function xunOf(ganZhi) {
  const g = GAN.indexOf(ganZhi[0]);
  const z = ZHI.indexOf(ganZhi[1]);
  // 60 甲子序号
  let idx = -1;
  for (let i = 0; i < 60; i++) if (i % 10 === g && i % 12 === z) { idx = i; break; }
  const xunStart = idx - (idx % 10); // 旬首在60甲子中的序号
  const xunShou = GAN[xunStart % 10] + ZHI[xunStart % 12]; // 旬首干支（甲X）
  // 旬空：该旬缺少的两个地支
  const kong = [];
  for (let k = 0; k < 2; k++) kong.push(ZHI[(xunStart % 12 + 10 + k) % 12]);
  return { xunShou, kong };
}

export function paipan(year, month, day, hour, minute) {
  const inputSolar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  // 晚子时（23:00–23:59）按次日排盘（日柱、时柱、农历日均取次日）
  const solar = hour >= 23 ? Solar.fromYmdHms(year, month, day, 0, minute, 0).next(1) : inputSolar;
  const lunar = solar.getLunar();

  // 四柱（年柱以立春为界）
  const yearGZ = lunar.getYearInGanZhiByLiChun();
  const monthGZ = lunar.getMonthInGanZhi();
  const dayGZ = lunar.getDayInGanZhi();
  const timeGZ = lunar.getTimeInGanZhi();
  const pillars = [yearGZ, monthGZ, dayGZ, timeGZ];

  // 旬空（年月日时）
  const xuns = pillars.map(xunOf);
  const xunKong = xuns.map(x => x.kong); // [[年空2支],[月空],[日空],[时空]]
  const hourXun = xuns[3];

  // 阴阳遁：取当前所处节气
  const prevJieQi = lunar.getPrevJieQi(true).getName();
  const isYang = YANG_TERMS.has(prevJieQi);
  const dun = isYang ? '阳' : '阴';

  // 局数 = 年支 + 农历月 + 农历日 + 时支，mod 9（0→9）
  const yearZhiNum = ZHI.indexOf(yearGZ[1]) + 1;
  const lunarMonth = Math.abs(lunar.getMonth());
  const lunarDay = lunar.getDay();
  const hourZhiNum = ZHI.indexOf(timeGZ[1]) + 1;
  let ju = (yearZhiNum + lunarMonth + lunarDay + hourZhiNum) % 9;
  if (ju === 0) ju = 9;

  // 地盘：戊从局数宫起飞，阳顺（宫数递增）阴逆（宫数递减）
  const dipan = {}; // palace -> stem
  for (let i = 0; i < 9; i++) {
    const p = isYang ? mod(ju - 1 + i, 9) + 1 : mod(ju - 1 - i, 9) + 1;
    dipan[p] = YIQI[i];
  }

  // 旬首仪与其地盘宫
  const xunShouYi = XUNSHOU_YI[hourXun.xunShou];
  const xunShouPalace = parseInt(Object.keys(dipan).find(p => dipan[p] === xunShouYi), 10);

  // 值符（旬首仪宫位的九星）；若旬首仪落中宫则值符为天禽
  const zhiFuStar = STAR_HOME[xunShouPalace];
  // 值使（旬首仪宫位的八门）；若落中宫寄坤二宫→死门
  const zhiShiDoor = xunShouPalace === 5 ? '死门' : DOOR_HOME[xunShouPalace];

  // 时干落宫（地盘时干所在宫；若在中宫寄坤二宫）
  const hourGan = timeGZ[0];
  let hourGanPalace = parseInt(Object.keys(dipan).find(p => dipan[p] === hourGan));
  if (hourGan === '甲') hourGanPalace = xunShouPalace; // 甲遁于旬首仪下
  if (hourGanPalace === 5) hourGanPalace = 2; // 寄坤二宫

  // ===== 天盘九星 =====
  // 外盘 8 槽位（ring 顺序），坤二宫槽位含天芮+天禽
  // 值符槽位：天禽/天芮→坤二槽(索引5)，其余各归本宫槽
  const zhiFuSlot = (zhiFuStar === '天禽' || zhiFuStar === '天芮') ? ringIndex(2) : ringIndex(xunShouPalace);
  const targetRing = ringIndex(hourGanPalace);
  const starShift = mod(targetRing - zhiFuSlot, 8);
  const tianpanStar = {}; // palace -> [stars]
  const tianpanGan = {};  // palace -> [stems]（天盘干，星随身带本宫地盘干）
  for (let i = 0; i < 8; i++) {
    const homePalace = RING[i];
    const destPalace = RING[mod(i + starShift, 8)];
    const stars = [STAR_HOME[homePalace]];
    const stems = [dipan[homePalace]];
    if (homePalace === 2) { stars.push('天禽'); stems.push(dipan[5]); } // 天禽寄坤二，带中宫干
    tianpanStar[destPalace] = stars;
    tianpanGan[destPalace] = stems;
  }

  // ===== 人盘八门 =====
  // 值使随时宫：从旬首仪本宫（含中宫）起飞，按旬首支数到用时支，阳顺（宫数+1）阴逆（宫数-1），途经中宫照数
  const flightStart = xunShouPalace;               // 起飞宫（旬首仪所在，可为中5）
  const doorHomePalace = DOOR_PALACE[zhiShiDoor];  // 值使门的本宫（死门→坤2，不会是中5）
  const xunShouZhi = hourXun.xunShou[1];
  const steps = mod(ZHI.indexOf(timeGZ[1]) - ZHI.indexOf(xunShouZhi), 12);
  let zhiShiPalace = flightStart;
  for (let s = 0; s < steps; s++) {
    zhiShiPalace = isYang ? (zhiShiPalace % 9) + 1 : ((zhiShiPalace - 2 + 9) % 9) + 1;
  }
  if (zhiShiPalace === 5) zhiShiPalace = 2; // 值使落中宫寄坤二
  const doorShift = mod(ringIndex(zhiShiPalace) - ringIndex(doorHomePalace), 8);
  const renpanDoor = {}; // palace -> door
  for (let i = 0; i < 8; i++) {
    const homePalace = RING[i];
    const destPalace = RING[mod(i + doorShift, 8)];
    renpanDoor[destPalace] = DOOR_HOME[homePalace];
  }

  // ===== 神盘八神 =====
  // 小值符随大值符：值符神落于值符星所落宫（时干落宫），阳顺阴逆
  const godStart = ringIndex(hourGanPalace);
  const shenpan = {}; // palace -> god
  for (let j = 0; j < 8; j++) {
    const idx = isYang ? mod(godStart + j, 8) : mod(godStart - j, 8);
    shenpan[RING[idx]] = GOD_ORDER[j];
  }

  // ===== 空亡（时柱）落宫 =====
  const kongPalaces = hourXun.kong.map(z => ZHI_PALACE[z]);
  // 年月日時各柱旬空落宫
  const kongByPillar = xunKong.map(kongArr => kongArr.map(z => ZHI_PALACE[z]));

  // ===== 马星 =====
  const horseZhi = HORSE[timeGZ[1]];
  const horsePalace = ZHI_PALACE[horseZhi];

  // ===== 四柱天干落天盤之宮（宮位左上角標記 年/月/日/時）=====
  // 各柱天干（甲則遁其旬首儀）
  const pillarStems = pillars.map((gz, i) => (gz[0] === '甲' ? XUNSHOU_YI[xuns[i].xunShou] : gz[0]));
  // 各柱天干在天盤所落之宮
  const pillarMarkPalaces = pillarStems.map((stem) => {
    for (const p of [1, 2, 3, 4, 6, 7, 8, 9]) {
      if ((tianpanGan[p] || []).includes(stem)) return p;
    }
    return null;
  });

  // ===== 月将（最近中气） =====
  const yueJiang = computeYueJiang(lunar);

  // ===== 外干（隐干）=====
  // 经对 yuanfenju.com 92 个盘逆向验证（90% 完全吻合，含参考盘 2026-05-16 11:38）：
  // 主规则（时干非甲且不在地盘中5）：地盘整体沿九星转盘循环(RING)旋转 k 步，
  //   使时干恰好落到值使门宫；中五宫干随盘寄于「坤二宫旋转 -k 步」之宫（显示为双干）。
  // 时干为甲（六甲）：以旬首仪加中五宫，按宫数阳顺阴逆飞布，中五寄坤二。
  // 时干在地盘中五：时干寄艮八(阳)/坤二(阴)起飞，按宫数阳顺阴逆飞布，中五寄坤二。
  const waigan = {};        // palace -> 该宫外干（含中5）
  let waiganJiGong = 2;     // 中五外干寄宫（该宫显示双干）
  {
    const diGanPalace = (stem) => parseInt(Object.keys(dipan).find(p => dipan[p] === stem), 10);
    const numStep = (p) => isYang ? (p % 9) + 1 : ((p - 2 + 9) % 9) + 1;
    const numericFlight = (startPalace, startStem) => {
      const res = {}; let si = YIQI.indexOf(startStem); let p = startPalace;
      for (let i = 0; i < 9; i++) { res[p] = YIQI[si]; si = (si + 1) % 9; p = numStep(p); }
      return res;
    };
    const hourGanDiPalace = diGanPalace(hourGan);
    if (hourGan === '甲') {
      Object.assign(waigan, numericFlight(5, xunShouYi));
      waiganJiGong = 2;
    } else if (hourGanDiPalace === 5) {
      Object.assign(waigan, numericFlight(isYang ? 8 : 2, hourGan));
      waiganJiGong = 2;
    } else {
      let k = 0;
      for (let kk = 0; kk < 8; kk++) if (RING[mod(ringIndex(zhiShiPalace) + kk, 8)] === hourGanDiPalace) { k = kk; break; }
      for (const p of [1, 2, 3, 4, 6, 7, 8, 9]) waigan[p] = dipan[RING[mod(ringIndex(p) + k, 8)]];
      waigan[5] = dipan[5];
      waiganJiGong = RING[mod(ringIndex(2) - k, 8)];
    }
  }
  const waiganCenter = waigan[5]; // 中五宫外干（寄 waiganJiGong 显示）

  // ===== 组装各宫 =====
  const palaces = {};
  for (const p of [1, 2, 3, 4, 6, 7, 8, 9]) {
    const tStars = tianpanStar[p] || [];
    const tGans = tianpanGan[p] || [];
    const dGan = dipan[p];
    // 坤二宫地盘：本宫干 + 中宫寄宫干
    const dipanExtra = (p === 2) ? dipan[5] : null;
    const door = renpanDoor[p];
    const god = shenpan[p];

    // 逐干标记：击刑(#d135d5) / 入墓(#d6b900) / 刑+墓(#4dadff)
    const allStemsHere = [...tGans, dGan, ...(dipanExtra ? [dipanExtra] : [])];
    const stemMarks = allStemsHere.map(s => {
      const ji = JIXING_PALACE[s] === p;
      const mu = MU_PALACE[s] === p;
      if (ji && mu) return { stem: s, type: '刑墓' };
      if (ji) return { stem: s, type: '刑' };
      if (mu) return { stem: s, type: '墓' };
      return { stem: s, type: null };
    });
    const hasJi = stemMarks.some(x => x.type === '刑' || x.type === '刑墓');
    const hasMu = stemMarks.some(x => x.type === '墓' || x.type === '刑墓');
    const menpo = !!(door && DOOR_WUXING[door] && KE[DOOR_WUXING[door]] === PALACE_WUXING[p]); // 门迫（破）

    // 宫级标记（供 UI 着色）：破 / 墓 / 刑 / 墓刑
    const marks = [];
    if (menpo) marks.push('破');
    if (hasJi && hasMu) marks.push('墓刑');
    else if (hasJi) marks.push('刑');
    else if (hasMu) marks.push('墓');
    const isKong = kongPalaces.includes(p);

    palaces[p] = {
      palace: p,
      god, door,
      stars: tStars,
      tianGan: tGans,      // 天盘干（与星对应）
      diGan: dGan,         // 地盘干
      diGanExtra: dipanExtra, // 中宫寄坤二之干
      stemMarks, menpo,
      marks, isKong,
    };
  }
  // 中五宫
  palaces[5] = { palace: 5, god: null, door: '中门', stars: [], tianGan: [], diGan: dipan[5], diGanExtra: null, stemMarks: [{ stem: dipan[5], type: null }], menpo: false, marks: [], isKong: false };

  return {
    solar, lunar, inputSolar,
    solarText: inputSolar.toYmdHms(),
    pillars, xunKong,
    xunShou: hourXun.xunShou + xunShouYi,
    dun, ju, prevJieQi,
    zhiFu: { star: zhiFuStar, palace: hourGanPalace },
    zhiShi: { door: zhiShiDoor, palace: zhiShiPalace },
    dipan, palaces, waigan, waiganJiGong, waiganCenter,
    kongPalaces, kongByPillar,
    pillarMarkPalaces, pillarStems,
    horse: { zhi: horseZhi, palace: horsePalace },
    yueJiang,
    lunarMonth, lunarDay,
  };
}

// 依据中气计算月将：从当前时刻往前找最近的中气
const ZHONGQI = new Set(['冬至', '大寒', '雨水', '春分', '谷雨', '小满', '夏至', '大暑', '处暑', '秋分', '霜降', '小雪']);
function computeYueJiang(lunar) {
  let jq = lunar.getPrevJieQi(true); // 最近的一个节气（含中气）
  let guard = 0;
  while (!ZHONGQI.has(jq.getName()) && guard++ < 4) {
    const s = jq.getSolar();
    // 退回到该节气之前，再取上一个节气
    const before = s.next(-2); // 往前 2 天
    jq = before.getLunar().getPrevJieQi(true);
  }
  return YUEJIANG[jq.getName()] || '酉';
}
