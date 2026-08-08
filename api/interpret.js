// Vercel Serverless Function：奇門遁甲 / 玄空飛星 AI 解讀
// 前端 POST 結構化資料，此函式依 task 組 prompt 呼叫 OpenAI 相容 API（預設 DeepSeek）。
// API key 只存在伺服器端（Vercel 環境變數），不下行到前端。
//
// 環境變數（key 可用 AI_API_KEY／DEEPSEEK_API_KEY／Qimen 任一命名）：
//   AI_API_KEY   必填
//   AI_API_BASE  選填，預設 https://api.deepseek.com
//   AI_MODEL     選填，預設 deepseek-v4-flash
//
// task：
//   qimen      奇門單宮，theme 主題（物品/人物/地方/事情/自訂），payload: { palace, symbols[], theme, custom }
//   xkOverall  玄空整體，payload: { chart }
//   xkPalace   玄空單宮，payload: { chart, palace }

const SYS = '你是資深的奇門遁甲與玄空風水大師，精通符號象意、萬物類象、五行生剋、九星吉凶、八門八神與化解催旺之道。解讀要「創意疊加」多個符號、找出交集與互補，給出具體、可想像、實用的答案。一律使用繁體中文，條理清楚。';

// 奇門：依主題給不同解讀方向
function qimenPrompt(palace, symbols, theme, custom) {
  const lines = symbols.map((s) => {
    const attrs = (s.attrs || []).join('、');
    const items = (s.items || []).slice(0, 14).join('、');
    return `【${s.label}・${s.name}】象意：${s.meaning || ''}｜屬性：${attrs}｜類象：${items}`;
  }).join('\n');

  const head = `以下是奇門遁甲陰盤「${palace}」這一宮的所有符號及其象意、屬性、萬物類象：\n\n${lines}\n`;
  const themeMap = {
    物品: `請把這些符號的屬性「疊加組合」，推斷出 2 到 4 個最貼切的具體物品（風水物／擺設／隨身物）。要求：
1. 先提煉各符號關鍵屬性的交集或互補。
2. 每個物品用一句話說明它如何同時符合多個符號（標出哪些符號貢獻了哪些特徵）。
3. 物品要具體可想像，不要空泛。
4. 格式：先一行「組合主軸：…」，再列點「1. 物品名 —— 說明」。整體 220 字內。`,
    人物: `請把這些符號「疊加組合」，描繪出這宮所指的一位具體人物。要求分三方面，並標出哪些符號貢獻了哪些特徵：
1. 外在：身形高矮胖瘦、長相特徵、膚色、穿著打扮與氣質給人的第一印象。
2. 內在：性格、脾性、心思、優缺點、做事作風。
3. 身分傾向：可能的職業、社會角色或地位。
格式：先一行「人物主軸：…」，再分「外在／內在／身分」三點。整體 260 字內。`,
    地方: `請把這些符號「疊加組合」，描繪出這宮所指的一個具體場所／地點。要求：
1. 地形地勢：高低、燥濕、是否臨水臨山、開闊或隱蔽（例如坎為低窪臨水）。
2. 環境氛圍與景象：熱鬧或冷清、新舊、光線、動靜。
3. 建築或用途：最可能的場所類型（例如天芮主醫院、廟宇、學校；值符主政府、豪宅、高樓），可給 1-3 個具體地點。
標出哪些符號貢獻了哪些特徵。格式：先一行「地點主軸：…」，再列點。整體 260 字內。`,
    事情: `請把這些符號「疊加組合」，推斷這宮所指的事情／狀況。要求：
1. 事情性質：是吉是凶、是財是官是感情是健康等。
2. 發展走向：目前的狀態、接下來的變化、關鍵轉折。
3. 關鍵人事物：牽涉的人物、物件、地方。
標出哪些符號貢獻了哪些判斷。整體 240 字內。`,
  };
  const instr = theme === '自訂' && custom
    ? `請針對「${custom}」這個主題，把以上符號「疊加組合」，推斷出最貼切的對應（人、事、物、地方皆可，視主題而定）。要具體、標出哪些符號貢獻了哪些特徵。整體 260 字內。`
    : (themeMap[theme] || themeMap['物品']);
  return `${head}\n${instr}`;
}

// 玄空：整體
function xkOverallPrompt(c) {
  const per = c.palaces.map((p) => `${p.name}（${p.dir}）：山${p.shan} 向${p.xiang} 運${p.yun}${p.flow ? ` 流年${p.flow}` : ''}｜${p.combo}（${p.ji}）`).join('\n');
  const types = (c.types || []).map((t) => `${t.n}（${t.t}）`).join('、') || '無特殊格局';
  return `以下是一個玄空飛星（下卦）陽宅盤：
坐向：${c.sit}山${c.face}向　運：${c.period}運${c.flowYear ? `　流年：${c.flowYear}年（${c.flowStar}入中）` : ''}
格局：${types}
各宮山星／向星／運星${c.flowYear ? '／流年星' : ''}及星曜組合：
${per}

請以玄空風水大師角度，給出整體分析，條理清楚：
1. 全局旺衰：此坐向在${c.period}運的整體吉凶（結合格局），財運與人丁何者較旺。
2. 重點宮位：坐山、向首、中宮、以及最吉與最凶的宮位，各主何事。
3. 流年影響：今年流年星飛臨何宮、與山向星的生剋，需注意什麼。
4. 化解與催旺：針對凶宮給出具體化解（五行物品、顏色、擺設、方位），吉宮給出催旺方法。
整體 450 字內，分點清楚。`;
}

// 玄空：單宮
function xkPalacePrompt(c, palaceName) {
  const p = c.palaces.find((x) => x.name === palaceName) || c.palaces[0];
  return `以下是一個玄空飛星（下卦）陽宅盤的其中一宮，請深入解讀：
全盤：${c.sit}山${c.face}向，${c.period}運${c.flowYear ? `，${c.flowYear}年流年（${c.flowStar}入中）` : ''}。
本宮：${p.name}（${p.dir}），山星${p.shan}、向星${p.xiang}、運星${p.yun}${p.flow ? `、流年星${p.flow}` : ''}，星曜組合「${p.combo}」（${p.ji}）。

請給出：
1. 本宮吉凶：山向二星在此宮的組合意義（結合當運、失運、五行生剋），主財、丁、健康、官非、桃花等何事。
2. 實際影響：此方位若為大門／臥室／廚房／書房等，會如何。
3. 化解或催旺：具體方法（五行物品、顏色、材質、數量、擺放位置）。
整體 300 字內，分點清楚。`;
}

// 奇門：自動尋物（時干為物、日干為事主）
function qimenFindPrompt(d) {
  const symLines = d.item.symbols.map((s) => `【${s.label}・${s.name}】象意：${s.meaning || ''}｜屬性：${(s.attrs || []).join('、')}｜類象：${(s.items || []).slice(0, 12).join('、')}`).join('\n');
  return `以下是奇門遁甲陰盤的「尋物」推算。時干所落之宮代表遺失物品，日干所落之宮代表事主（尋物者）。已算好的事實與規則如下，請綜合給出尋物判斷。

【尋物規則】
- 事主宮五行剋物品宮 → 容易找到；物品宮剋事主宮 → 較難找；物品宮生事主宮 → 物品會回來、易尋；事主宮生物品宮 → 要費力去尋；兩宮同五行 → 吉凶不明顯（平）。
- 伏吟主慢、反吟主快。
- 兩宮同宮 → 物品就在事主附近／所在地；相鄰 → 不遠；相隔越遠越費時。
- 物品宮內的符號組合，用來推斷物品「可能在哪裡、被什麼遮蓋或伴隨」。

【本盤事實】
- 時干 ${d.hourGan}（物品）落 ${d.item.palace}（五行屬${d.item.wx}）。
- 日干 ${d.dayGan}（事主）落 ${d.querent.palace}（五行屬${d.querent.wx}）。
- 兩宮生克：${d.relation} → 判定：${d.ease}。
- 伏吟／反吟：${d.speed}。
- 兩宮距離：${d.distance}。
- 物品宮（${d.item.palace}）符號：
${symLines}

請給出尋物分析，條理清楚：
1. 能否找到：綜合難易與快慢，給出明確判斷（易／難、快／慢）。
2. 物品可能在哪：結合物品宮的八卦方位與宮內符號組合，推斷具體地點或環境（高處／低處、金屬容器內、木器旁、被布遮蓋…），指出哪些符號提供了哪些線索。
3. 尋找建議：往哪個方位、什麼類型的地方找，以及時機快慢。
整體 320 字內，分點清楚。`;
}

// 玄空：換運對比
function xkComparePrompt(d) {
  const chartStr = (c) => c.palaces.map((p) => `${p.name}(${p.dir})山${p.shan}向${p.xiang}運${p.yun}`).join('；');
  const typesStr = (typs) => (typs || []).map((t) => `${t.n}(${t.t})`).join('、') || '無特殊格局';
  return `以下是同一陽宅「${d.sit}山${d.face}向」（坐${d.sitGua}、向${d.faceGua}）在兩個運的玄空飛星下卦盤，請比較分析：

【換前 ${d.perA}運】格局：${typesStr(d.typesA)}
各宮：${chartStr(d.chartA)}

【換後 ${d.perB}運】格局：${typesStr(d.typesB)}
各宮：${chartStr(d.chartB)}

請以玄空風水大師角度給出換運分析，條理清楚：
1. 格局轉變：換入${d.perB}運後整體轉旺還是轉弱（結合兩運格局與當令星），財運與人丁的消長。
2. 關鍵宮位變化：坐山、向首在換運後的吉凶轉變，哪些宮位由吉轉凶、哪些由凶轉吉。
3. 應對建議：換運後需要重新佈局之處（哪些方位要加強化解、哪些可催旺），以及是否宜在此運裝修動土以接新運。
整體 380 字內，分點清楚。`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
  const apiKeyRaw = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.Qimen;
  const apiKey = apiKeyRaw ? String(apiKeyRaw).trim() : '';
  if (!apiKey) { res.status(503).json({ error: '尚未設定 API key（請於 Vercel 環境變數加入 AI_API_KEY 後重新部署）' }); return; }
  const base = (process.env.AI_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');

  let payload = req.body;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = null; } }
  const { task, theme, custom, palace, symbols, chart, find, compare } = payload || {};

  // 模型選擇：前端可選 flash（快速）/ pro（深度），白名單驗證，預設 flash
  const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
  const reqModel = payload && payload.model;
  const model = (reqModel && ALLOWED_MODELS.has(reqModel)) ? reqModel : (process.env.AI_MODEL || 'deepseek-v4-flash');

  let prompt;
  if (task === 'xkCompare') {
    if (!compare || !compare.chartA || !compare.chartB) { res.status(400).json({ error: '缺少換運對比資料' }); return; }
    prompt = xkComparePrompt(compare);
  } else if (task === 'qimenFind') {
    if (!find || !find.item || !find.querent) { res.status(400).json({ error: '缺少尋物資料' }); return; }
    prompt = qimenFindPrompt(find);
  } else if (task === 'xkOverall') {
    if (!chart || !Array.isArray(chart.palaces)) { res.status(400).json({ error: '缺少玄空盤資料' }); return; }
    prompt = xkOverallPrompt(chart);
  } else if (task === 'xkPalace') {
    if (!chart || !Array.isArray(chart.palaces) || !palace) { res.status(400).json({ error: '缺少玄空宮位資料' }); return; }
    prompt = xkPalacePrompt(chart, palace);
  } else {
    if (!palace || !Array.isArray(symbols) || symbols.length === 0) { res.status(400).json({ error: '缺少宮位符號資料' }); return; }
    prompt = qimenPrompt(palace, symbols, theme || '物品', custom || '');
  }

  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYS }, { role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1800,
        thinking: { type: 'disabled' },
      }),
    });
    if (!r.ok) { const txt = await r.text(); res.status(502).json({ error: `AI 服務回應錯誤（${r.status}）`, detail: txt.slice(0, 300) }); return; }
    const data = await r.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const text = ((msg && msg.content) || '').trim();
    res.status(200).json({ text: text || '（AI 未回傳內容）' });
  } catch (e) {
    res.status(500).json({ error: 'AI 呼叫失敗', detail: String(e && e.message || e) });
  }
}
