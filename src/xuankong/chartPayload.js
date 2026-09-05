// 由坐向起玄空飛星盤＋組 AI 用嘅 chartPayload（xkHead「整體」格式）。玄空分頁同風水 AI 分頁共用。
import {
  GRID, PALACE_GUA, PALACE_DIR, PALACE_WX, STAR_NAME, STAR_WX, starPair, remedyText,
  xuanKongChart, annualChart, annualStar, chartTypes,
} from './engine.js';
import { PALACE_MOUNTAINS24, STAR24_INFO, star24MapBy } from '../tianxing/stars24.js';

// sitM/faceM＝坐山/向首（山名）；method＝24天星排盤法（bazhai/xuandao）
export function buildXkPayload(sitM, faceM, { period = 9, flowYear = new Date().getFullYear(), method = 'bazhai' } = {}) {
  const chart = xuanKongChart(period, sitM, faceM);
  const flow = annualChart(flowYear);
  const flowStar = annualStar(flowYear);
  const types = chartTypes(chart);
  const starMap = star24MapBy(method, sitM);
  return {
    sit: sitM, face: faceM, period, flowYear, flowStar, qiXing: '下卦', tiGuaNote: '',
    types: types.map((t) => ({ n: t.n, t: t.t })),
    palaces: GRID.map((p) => {
      const c = starPair(chart.sG[p], chart.fG[p]);
      const s = chart.sG[p], f = chart.fG[p];
      const pStars = (PALACE_MOUNTAINS24[p] || []).map((m) => ({ mountain: m, star: starMap[m], ...(STAR24_INFO[starMap[m]] || {}) }));
      return {
        name: PALACE_GUA[p], dir: PALACE_DIR[p], wx: PALACE_WX[p],
        role: p === chart.sitPalace ? '坐山' : p === chart.facePalace ? '向首' : p === 5 ? '中宮' : '',
        shan: s, shanName: STAR_NAME[s], shanWx: STAR_WX[s],
        xiang: f, xiangName: STAR_NAME[f], xiangWx: STAR_WX[f],
        yun: chart.pG[p], yunName: STAR_NAME[chart.pG[p]],
        flow: flow[p], flowName: STAR_NAME[flow[p]],
        combo: c.n, ji: c.t, comboDesc: c.d, remedy: remedyText(c.r),
        stars24: pStars.map((x) => `${x.mountain}山${x.star}（${x.ji}）`).join('、'),
      };
    }),
  };
}
