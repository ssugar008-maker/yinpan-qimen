import React from 'react';

// 五行配色（一致的主題）：水藍、木綠、火紅、土褐、金金
const WX_COLOR = { 水: '#1565c0', 木: '#15803d', 火: '#c62828', 土: '#a16207', 金: '#b8860b' };
const PALACE_WX = { 坎: '水', 坤: '土', 震: '木', 巽: '木', 乾: '金', 兌: '金', 艮: '土', 離: '火', 中: '土' };
const STAR_WX = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' };
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const DIR_WX = { 正北: '水', 正南: '火', 正東: '木', 正西: '金', 東北: '土', 東南: '木', 西北: '金', 西南: '土' };
const BZ_GOOD = ['生氣', '天醫', '延年', '伏位'];

// 依序比對：粗體 > 宮位 > 雙星 > 九星 > 八宅 > 吉凶 > 方位
const TERM_RE_SRC = /(\*\*[^*]+\*\*)|([坎坤震巽乾兌艮離中]宮)|(雙[一二三四五六七八九1-9])|([一二三四五六七八九1-9][白黑碧綠黃紫赤])|(生氣|天醫|延年|伏位|絕命|五鬼|六煞|禍害)|(大凶|病符|凶|吉|旺|衰|死|煞)|(正東|正南|正西|正北|東南|東北|西南|西北)/g;

function inline(text, kp) {
  const re = new RegExp(TERM_RE_SRC.source, 'g'); // 每次呼叫用新 regex，避免遞迴時共用 lastIndex 出錯
  const out = []; let last = 0, k = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [full, bold, pal, sh, star, bz, ji, dir] = m;
    if (bold) out.push(<strong key={kp + k++}>{inline(bold.slice(2, -2), kp + 'b' + k + '-')}</strong>);
    else if (pal) out.push(<span key={kp + k++} className="fwx" style={{ color: WX_COLOR[PALACE_WX[pal[0]]] }}>{pal}</span>);
    else if (sh) { const n = CN_NUM[sh.slice(1)] || +sh.slice(1); out.push(<span key={kp + k++} className="fwx" style={{ color: WX_COLOR[STAR_WX[n]] }}>{sh}</span>); }
    else if (star) { const n = CN_NUM[star[0]] || +star[0]; out.push(<span key={kp + k++} className="fwx" style={{ color: WX_COLOR[STAR_WX[n]] }}>{star}</span>); }
    else if (bz) out.push(<span key={kp + k++} className="fwx" style={{ color: BZ_GOOD.includes(bz) ? '#15803d' : '#c62828' }}>{bz}</span>);
    else if (ji) out.push(<span key={kp + k++} className="fwx" style={{ color: ['吉', '旺'].includes(ji) ? '#15803d' : '#c62828' }}>{ji}</span>);
    else if (dir) out.push(<span key={kp + k++} className="fwx" style={{ color: WX_COLOR[DIR_WX[dir]] }}>{dir}</span>);
    last = m.index + full.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// AI 回覆的富文字渲染：**粗體**、分段標題、列點、宮位/星曜/八宅/吉凶/方位配色
export default function AiText({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <div className="ai-text">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        const bullet = /^[-•*]\s+/.test(t);
        const header = /^(?:\*\*)?[一二三四五六七八九十]+[、.]/.test(t);
        const content = t.replace(/^[-•*]\s+/, '');
        return (
          <div key={i} className={`ai-line${bullet ? ' bullet' : ''}${header ? ' header' : ''}`}>{inline(content, `l${i}-`)}</div>
        );
      })}
    </div>
  );
}
