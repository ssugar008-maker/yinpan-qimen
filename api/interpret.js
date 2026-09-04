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
//   qimenAsk   奇門問事全盤（用神取用＋應期），payload: { ask: { qtype, custom, chart, yongshen[], timing[], relations[], kong[], facts[] } }
//   star24     二十四天星，payload: { chart: { sit, face, sitStar, faceStar, stars[] }, theme, custom }
//              theme 為 整體佈局／財運／感情桃花／健康／事業功名／自訂
//   xkOverall  玄空整體，payload: { chart, theme?, custom?, context? }
//   xkPalace   玄空單宮，payload: { chart, palace, theme?, custom?, context? }
//              theme 為 綜合（預設）／傢俬擺設／顏色／形狀材質／風水擺設／房間用途／財運／健康／
//              感情桃花／事業文昌／化解催旺／自訂（自訂時 custom 為使用者問題）；context 為現場情況補充
//
// 所有 task 皆可附帶：question（追問）＋ followups[{q,a}]（歷史問答）→ 多輪對話；
// 回應一律為 { text, model, usage:{pt,ct} }（usage 供前端累計用量）。

const SYS = '你是資深的奇門遁甲與玄空風水大師，精通符號象意、萬物類象、五行生剋、九星吉凶、八門八神與化解催旺之道。解讀要「創意疊加」多個符號、找出交集與互補，給出具體、可想像、實用的答案。一律使用繁體中文，條理清楚。排版格式：用「一、二、三…」分段（段標題獨立一行），用「- 」列點；重點詞（宮位如「震宮」「巽宮」、星曜如「雙9」「五黃」「一白」、吉凶如「吉」「凶」「大凶」、關鍵結論）用 **粗體** 標出，方便前端上色排版。';

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

// 玄空：五行對應（顏色／形狀／材質／常見物品），供 AI 給具體佈局建議時參照
const XK_WX_REF = `【五行對應參考（顏色／形狀／材質／常見物品）】
木：青、綠色；長條形、圓柱形、直紋；木材、藤竹、棉麻布、紙；植物盆栽、木櫃、書架、木屏風。
火：紅、紫、橙色；尖角形、三角形、放射狀；皮革、電器；燈光、蠟燭、電視、紅地毯、駿馬圖。
土：黃、褐、米、咖啡色；正方形、厚實低平；陶瓷、石材、磚、水晶、玉石；瓷瓶、石雕、鹽燈、玉擺件。
金：白、金、銀、灰白色；圓形、球形、拱形；金屬、銅、鋼、鏡框；六帝錢、銅葫蘆、銅鈴、鐘錶、金屬雕塑。
水：黑、藍、灰色；波浪形、不規則曲線；水、玻璃、鏡；魚缸、流水擺設、水景畫、加濕器。`;

// 玄空：宮位事實（各主題共用的資料鋪陳）
function xkPalaceFacts(c, palaceName) {
  const p = c.palaces.find((x) => x.name === palaceName) || c.palaces[0];
  const L = [];
  L.push(`本宮：${p.name}宮（${p.dir}${p.wx ? `，宮位本身五行屬${p.wx}` : ''}）${p.role ? `，本宮為${p.role}` : ''}`);
  L.push(`山星（主人丁、健康、後靠）：${p.shan}${p.shanName ? ` ${p.shanName}` : ''}${p.shanWx ? `，五行屬${p.shanWx}` : ''}`);
  L.push(`向星（主財運、氣口）：${p.xiang}${p.xiangName ? ` ${p.xiangName}` : ''}${p.xiangWx ? `，五行屬${p.xiangWx}` : ''}`);
  L.push(`運星：${p.yun}${p.yunName ? ` ${p.yunName}` : ''}`);
  if (p.flow) L.push(`流年星：${p.flow}${p.flowName ? ` ${p.flowName}` : ''}`);
  L.push(`星曜組合：「${p.combo}」（${p.ji}）${p.comboDesc ? `　${p.comboDesc}` : ''}`);
  if (p.remedy) L.push(`傳統化解法：${p.remedy}`);
  return { p, text: L.join('\n') };
}

// 玄空：盤面標題（全盤資訊 + 依範圍附上宮位明細）
function xkHead(c, scope) {
  const types = (c.types || []).map((t) => `${t.n}（${t.t}）`).join('、') || '無特殊格局';
  const head = `【全盤】玄空飛星（${c.qiXing === '替卦' ? '替卦' : '下卦'}）陽宅盤：${c.sit}山${c.face}向，${c.period}運${c.flowYear ? `，${c.flowYear}年流年（${c.flowStar}入中）` : ''}${c.qiXing === '替卦' && c.tiGuaNote ? `\n替卦起星：${c.tiGuaNote}` : ''}
格局：${types}`;
  if (!scope || scope === '整體') {
    const per = c.palaces.map((p) => `${p.name}宮（${p.dir}）：山${p.shan} 向${p.xiang} 運${p.yun}${p.flow ? ` 流年${p.flow}` : ''}｜${p.combo}（${p.ji}）${p.stars24 ? `｜天星 ${p.stars24}` : ''}`).join('\n');
    return `${head}\n【各宮山星／向星／運星${c.flowYear ? '／流年星' : ''}及星曜組合${c.palaces.some((p) => p.stars24) ? '＋二十四天星' : ''}】\n${per}`;
  }
  return `${head}\n${xkPalaceFacts(c, scope).text}`;
}

// 玄空＋天星：綜合整體解讀（總合參考，納入大門納氣、八宅床頭）
const xkOverallInstr = (c, ex = {}) => {
  const { door, bazhai, useXk = true, useS24 = true } = ex;
  const pts = [
    `全局旺衰：此坐向在${c.period}運的整體吉凶（${[useXk && '玄空格局', useS24 && '天星吉凶分佈'].filter(Boolean).join('＋')}），財運與人丁何者較旺。`,
    `重點宮位：坐山、向首、中宮、最吉與最凶宮位，各主何事（${[useXk && '玄空組合', useS24 && '天星司職'].filter(Boolean).join('＋')}並論）。`,
  ];
  if (door) pts.push(`大門納氣：大門在${door.mountain}山（${door.dir}），所納為${door.yang}氣；分析該處星曜與天星吉凶如何影響入宅之氣，宜如何處理（宜明宜淨、催旺或化解）。`);
  if (bazhai && bazhai.guaName) pts.push(`床頭／睡房建議：結合八宅命卦（${bazhai.guaName}命，${bazhai.east4 ? '東四命' : '西四命'}）吉方、玄空旺星與天星吉星，指出最宜的床頭／睡房方位（說明為何），以及要避開的凶方。`);
  pts.push('流年影響與化解催旺：今年流年星飛臨何宮需注意，凶宮給出具體化解（五行物品、顏色、擺設、方位），吉宮給出催旺。');
  return `請以玄空風水${useS24 ? '＋二十四天星' : ''}大師角度，給出整體綜合分析（總合參考），條理清楚：\n${pts.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n整體 520 字內，分點清楚。`;
};

const xkPalaceInstr = (ex = {}) => {
  const { door, bazhai } = ex;
  return `請給出本宮位的綜合分析：
1. 本宮吉凶：山向二星與天星在此宮的組合意義（結合當運、失運、五行生剋、天星司職），主財、丁、健康、官非、桃花等何事。
2. 實際影響：此方位若為大門／臥室／廚房／書房／床頭等，會如何${door ? '（並參考大門納氣）' : ''}${bazhai ? '（並結合八宅吉凶）' : ''}。
3. 化解或催旺：具體方法（五行物品、顏色、材質、數量、擺放位置）。
整體 320 字內，分點清楚。`;
};

// 玄空：可選主題（${AT} 會替換為「本宅全盤」或「某宮這個方位」）
const XK_THEMES = {
  傢俬擺設: `請針對${'${AT}'}，具體說明傢俬與擺設的安排：
1. 宜放什麼：列 3 至 5 件具體傢俬或擺設（例：實木書櫃、圓形金屬茶几、米色布沙發、陶瓷大花瓶…），每件說明它的五行如何配合本方位的星曜（指出是生助、洩耗、通關還是剋制哪一顆星）。
2. 忌放什麼：列 2 至 4 件應避免的傢俬或物件（例：魚缸、大鏡、紅色皮沙發、尖角櫃…），並說明會引發什麼問題。
3. 擺放細節：靠牆或近窗、高或矮、數量、朝向、與床／門／爐灶的相對位置等可直接執行的做法。
整體 340 字內，分點清楚，避免空泛。`,
  顏色: `請針對${'${AT}'}，給出配色方案：
1. 主色：2 至 3 個主色（可用於牆面、地板、窗簾、床品），逐一說明其五行與為何有利本方位的星曜組合。
2. 點綴色與比例：可少量使用的顏色，以及大致的用色比例。
3. 忌用色：應避免的顏色，說明它會助長哪顆凶星或剋制當旺之星。
4. 落地做法：具體用在什麼物件上（牆、窗簾、抱枕、地毯、門、燈罩、畫框）。
整體 320 字內，分點清楚。`,
  形狀材質: `請針對${'${AT}'}，給出形狀與材質建議：
1. 宜用形狀：具體形狀（方形、圓形、長條形、波浪形、尖角）與其五行，說明宜用在什麼物件上。
2. 宜用材質：具體材質（實木、石材、陶瓷、金屬、玻璃、布藝、皮革、藤竹）及其作用原理。
3. 忌用的形狀與材質：逐項說明原因。
4. 搭配示例：給 2 至 3 個「形狀＋材質＋顏色」的完整組合示例。
整體 320 字內，分點清楚。`,
  風水擺設: `請針對${'${AT}'}，推薦具體風水擺設物：
1. 化煞或催旺物：列 3 至 5 件具體物件（六帝錢、銅葫蘆、魚缸、水晶、鹽燈、植物、金屬鈴、麒麟…），每件寫明數量、材質、顏色與擺放的確切位置（例：貼近牆角、門後、窗台）。
2. 作用原理：每件如何作用於本方位星曜（洩、剋、通關、生助），並說明為何選這個數量。
3. 忌用之物：2 至 3 件會加重凶性或洩掉旺氣的物件。
整體 340 字內，分點清楚。`,
  房間用途: `請針對${'${AT}'}，判斷最適合的房間用途：
1. 最宜：排序列出 2 至 3 種用途（主人房、小孩房、書房、客廳、飯廳、廚房、廁所、儲物房、神位、大門、玄關），逐一說明理由。
2. 最忌：不宜作什麼用途，以及會招致什麼後果。
3. 若已是既定用途：分別說明作臥室、廚房、廁所、書房、大門時各要注意什麼、如何補救。
整體 340 字內，分點清楚。`,
  財運: `請針對${'${AT}'}，專論財運：
1. 財星狀況：向星在此的旺衰與正財、偏財傾向，是進財、聚財、漏財還是破財，機制為何。
2. 催財佈局：具體做法（是否宜見水、水的形式與位置、可用的顏色材質物品數量、宜開窗或宜實牆）。
3. 忌諱：會漏財或破財的擺設與行為。
整體 320 字內，分點清楚。`,
  健康: `請針對${'${AT}'}，專論健康：
1. 身體對應：依卦象與星曜，指出容易受影響的身體部位與疾病傾向。
2. 家中何人受影響：依卦象所主的人物（老父、老母、長男、少女…）判斷。
3. 化解方法：具體物品、顏色、材質、位置，以及睡床或坐位的調整建議與生活注意事項。
整體 320 字內，分點清楚。`,
  感情桃花: `請針對${'${AT}'}，專論感情與桃花：
1. 桃花性質：是正桃花（利姻緣人際）還是桃花劫（爛桃花、外遇、口舌），機制為何。
2. 影響何人：家中哪位成員最受影響。
3. 佈局：想催旺姻緣該怎麼做（具體物品、成對數量、顏色、位置），想化解桃花劫該怎麼做。
整體 320 字內，分點清楚。`,
  事業文昌: `請針對${'${AT}'}，專論事業、考試與文昌：
1. 助力或阻力：對事業、升遷、考試、文書、貴人的影響，以及是否適合作書房或工作位。
2. 文昌佈局：具體做法（書桌朝向與位置、四綠文昌位相關物品、植物或水的用法、顏色與數量）。
3. 忌諱：會影響專注、考運或引發官非文書之爭的擺設。
整體 320 字內，分點清楚。`,
  化解催旺: `請針對${'${AT}'}，只談化解與催旺，做到可以直接執行：
1. 先判斷：本方位目前是需要化解（凶）還是可以催旺（吉），或兩者兼有。
2. 化解方案：用洩、剋還是通關，具體物品、五行、顏色、材質、數量、擺放位置，並說明為何這樣選。
3. 催旺方案：如何加強旺氣（動靜、開闊或靠實、見水或見山、宜作何用途）。
4. 一定要避免：列出 2 至 3 項絕對不要做的事。
整體 340 字內，分點清楚。`,
};

// 室內佈局區塊（用家喺平面圖標注嘅房間）：玄空 AI 與室內 AI 共用
function indoorBlock(indoor) {
  if (!indoor || !Array.isArray(indoor.rooms) || !indoor.rooms.length) return '';
  const lines = indoor.rooms.map((r) => {
    const ps = (r.palaces || []).map((p) => `${p.palaceName}宮（${p.dir}）：山${p.shan} 向${p.xiang}${p.flow ? ` 流年${p.flow}` : ''}「${p.combo}」${p.ji}${p.remedy ? `（化解：${p.remedy}）` : ''}${p.star ? `；天星「${p.star}」（${p.starJi}${p.starGoverns ? `，${p.starGoverns}` : ''}）` : ''}`).join('；');
    const furn = (r.furniture || []).length ? `；家具：${r.furniture.join('、')}` : '';
    return `◆ ${r.type}（${(r.mountains || []).join('、')}山）${furn}\n  ${ps}`;
  });
  return `【室內佈局（用家已喺平面圖標注嘅實際房間）】\n${lines.join('\n')}`;
}

// 室內佈局（對話用）：逐山列出每間房所跨山嘅佔比＋玄空組合＋天星（方便答「邊個山好」「邊間房佔邊山多」）
function indoorChatBlock(indoor) {
  if (!indoor || !Array.isArray(indoor.rooms) || !indoor.rooms.length) return '';
  const lines = indoor.rooms.map((r) => {
    const pctStr = (r.byMountain || []).map((m) => `${m.mountain}${m.pct != null ? Math.round(m.pct) + '%' : ''}`).join('・');
    const ms = (r.byMountain || []).map((m) => `${m.mountain}山（${m.pct != null ? `佔${Math.round(m.pct)}%・` : ''}${m.palaceName}宮・${m.dir}）：玄空「${m.combo}」${m.ji}；天星「${m.star}」（${m.starJi}${m.starWx ? `・屬${m.starWx}` : ''}${m.starGoverns ? `，${m.starGoverns}` : ''}）`).join('\n  ');
    const furn = (r.furniture || []).length ? `；現有家具：${r.furniture.join('、')}` : '';
    return `◆ ${r.type}（跨 ${(r.mountains || []).join('、')} 山；佔比 ${pctStr}）${furn}\n  ${ms}`;
  });
  return `【室內實際佈局】（用家喺平面圖標注嘅房間，逐山列出佔比＋玄空組合＋天星五行吉凶。佔比＝該房喺各山嘅面積比例）\n${lines.join('\n')}`;
}

// 玄空＋二十四天星＋室內：AI 顧問對話（多輪）。d = { chart, star24, indoor }
function xkChatPrompt(d, opts = {}) {
  const { chart, star24, indoor } = d;
  const style = CHAT_STYLE[opts.style] || CHAT_STYLE['白話'];
  const detail = CHAT_DETAIL[opts.detail] || CHAT_DETAIL['適中'];
  let head = xkHead(chart, '整體'); // 玄空全盤（九宮山向運星＋組合吉凶）
  if (star24 && Array.isArray(star24.stars) && star24.stars.length) {
    const s24lines = star24.stars.map((s) => `${s.mountain}山（${s.dir}・${s.palace}宮屬${s.palaceWx}）：${s.star}（${s.ji}${s.wx ? `・屬${s.wx}` : ''}・${s.group}組）— ${s.governs}`).join('\n');
    head += `\n\n【二十四天星盤】（${star24.sit}山${star24.face}向・${star24.method === 'bazhai' ? '八宅遊年排法' : '玄道排法'}；吉星十二、凶星十二，各司其職）\n${s24lines}`;
  }
  const indoorB = indoorChatBlock(indoor);
  return `你係一位玄空飛星＋二十四天星嘅陽宅風水顧問，而家同客人一對一對話。以下係呢間屋嘅完整盤面資料（玄空九宮、二十四天星、室內房間逐山佈局），以及五行對應參考。客人會問顏色、材質、傢俬、電器擺位（如雪櫃、洗衣機）、房間用途、化解催旺等問題。

${head}

${indoorB ? `${indoorB}\n\n` : ''}${XK_WX_REF}

【對話方式要求】
- 語氣：${style}
- 詳略：${detail}
- 像真人師傅同客人面談：先直接答重點（用邊個山、用咩色、點樣擺），再講依據（邊個星曜、五行生剋旺衰、吉凶）。
- 客人問「邊個山好／放邊度」，要具體指出山名（如「卯山」「乙山」）同埋該山嘅星曜點解啱；問「用咩色／咩料」，按五行對應（生旺、洩煞、通關、剋制）推薦具體顏色同材質。
- 若房間跨幾個山，要比較嗰幾個山嘅星曜吉凶五行同佔比，話邊個山最啱放乜（例如雪櫃屬水、電器屬火，要配合該山星曜五行）；佔比大嘅山影響最大。
- 流年飛星嘅運用：本盤已附今年流年星。**按客人條問題決定使唔使流年**——客人問到時間性問題（今年運勢、邊年好、幾時應事、流年點樣、最近點樣）先重點加入流年飛星分析；一般佈局、顏色、材質、擺位、房間用途、化解催旺等問題，就以本命盤（山向運星）＋二十四天星為主，流年只輕輕帶過或唔提，唔好吓吓都講流年。
- 不要列「1.2.3.」報告式分點；像對話一樣自然分段，可用「- 」列重點。
- 若客人問題同呢間屋嘅風水無關，親切回應並引導返正題。`;
}

// 玄空＋天星：組主題 prompt（scope 為「整體」或宮名；extras 含 system/door/bazhai/star24/indoor）
function xkPrompt(c, scope, theme, custom, context, extras = {}) {
  const { system = 'both', door = null, bazhai = null, star24 = null, indoor = null } = extras;
  const isOverall = !scope || scope === '整體';
  const useXk = system !== 's24';
  const useS24 = system !== 'xk';
  const at = isOverall
    ? '本宅全盤（逐個重點宮位分別說明，並指出各宮方位）'
    : (() => { const { p } = xkPalaceFacts(c, scope); return `${p.name}宮（${p.dir}）這個方位`; })();

  // 盤面資料（依體系）
  let head = useXk ? xkHead(c, scope) : '';
  if (useS24 && star24 && Array.isArray(star24.stars) && star24.stars.length) {
    const s24lines = star24.stars.map((s) => `${s.mountain}山（${s.dir}・${s.palace}宮屬${s.palaceWx}）：${s.star}（${s.ji}${s.wx ? `・屬${s.wx}` : ''}・${s.group}組）— ${s.governs}`).join('\n');
    head += `${head ? '\n\n' : ''}【二十四天星盤】（${star24.sit}山${star24.face}向・${star24.method === 'bazhai' ? '八宅遊年排法' : '玄道排法'}；坐山星 ${star24.sitStar}、向首星 ${star24.faceStar}，吉星十二、凶星十二，各司其職）\n${s24lines}`;
  }

  // 大門納氣 ＋ 八宅命卦
  const extraLines = [];
  if (door) extraLines.push(`大門（納氣口）開在 ${door.mountain}山・${door.palace}宮（${door.dir}），屬${door.yang}氣${door.star24 ? `，該山天星為「${door.star24}」（${door.star24ji}${door.star24governs ? `，${door.star24governs}` : ''}）` : ''}。大門為納氣之口，其方位吉凶與所納陰陽之氣直接影響全宅。`);
  if (bazhai && bazhai.guaName) {
    const good = (bazhai.dirs || []).filter((d) => d.ji === '吉').map((d) => `${d.name}宮${d.dir}（${d.star}）`).join('、');
    const bad = (bazhai.dirs || []).filter((d) => d.ji !== '吉').map((d) => `${d.name}宮${d.dir}（${d.star}）`).join('、');
    extraLines.push(`宅主命卦：${bazhai.guaName}命（${bazhai.east4 ? '東四命' : '西四命'}）。八宅吉方：${good}；凶方：${bad}。`);
  }
  const extraBlock = extraLines.length ? `\n\n【大門與八宅命卦】\n${extraLines.join('\n')}` : '';
  const indoorB = indoorBlock(indoor);
  const indoorSection = indoorB ? `\n\n${indoorB}\n（請評估呢個實際佈局：邊間房啱位、邊間唔啱位，唔啱位嘅應該點調或點化解。）` : '';

  const sysNote = useXk && useS24 ? '玄空飛星與二十四天星並參' : useXk ? '以玄空飛星為據' : '以二十四天星為據';
  let instr;
  if (theme === '自訂') {
    instr = `使用者的問題是：「${custom}」

請以玄空風水大師角度（${sysNote}），針對${at}回答這個問題。要求：
1. 先扣住盤面事實作判斷（星曜五行生剋與旺衰、卦象所主、天星司職、大門納氣、八宅吉凶）。
2. 答案要具體、可執行：涉及擺設就給物品、材質、顏色、形狀、數量、位置；涉及人事就給明確傾向與應對。
3. 明確指出是哪些星曜、卦象或天星支持你的結論。
4. 若問題與此盤無關或資料不足，直接說明並給出最接近的判斷。
整體 340 字內，分點清楚。`;
  } else if (XK_THEMES[theme]) {
    instr = XK_THEMES[theme].replace(/\$\{AT\}/g, at);
  } else {
    instr = isOverall ? xkOverallInstr(c, { door, bazhai, useXk, useS24 }) : xkPalaceInstr({ door, bazhai });
  }

  const extra = context && String(context).trim()
    ? `\n【使用者補充的實際情況】${String(context).trim()}\n（請把這些條件納入判斷，建議要配合現場實況。）`
    : '';
  const needRef = theme && theme !== '綜合';
  return `${head}${extraBlock}${indoorSection}${extra}\n\n${needRef ? `${XK_WX_REF}\n\n` : ''}${instr}`;
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

// 奇門問事：類別專用解讀指引（用神已由前端按規則定位，這裡告訴 AI 該類別的斷法）
const ASK_GUIDE = {
  終身局: '終身局／命盤斷法：此為出生時間所排的本命盤，代表命主一生的性格與命運傾向。請以命主（日干）所落之宮為核心，綜合解讀：1. 性格特質（外在形象與內在脾性，依宮內星門神干的象意疊加）。2. 天賦與事業財運傾向（依值符值使、旺相之星門）。3. 感情婚姻與六親緣份。4. 健康弱點（依衰死之星、門迫擊刑入墓之宮）。5. 一生大運走向與關鍵建議（哪些方位／行業／行為宜多取用）。請指出哪些宮位符號支持哪些判斷。',
  感情婚姻: '本類別取用規則（已按此定位，請依此解讀）：對方由事主的天干五合合干而定（甲己、乙庚、丙辛、丁壬、戊癸相合），不固定看乙庚；值符為甲，甲己相合，故事主宮或對方宮見值符時，己亦為另一伴或情人，需兼看己所落之宮（有則已附於用神列表）；宮中見乙、丙、丁主易有桃花，見己主有「好聽話」式的桃花（已標註於各宮狀態）。請分析事主宮與對方宮的旺衰、兩宮五行生剋比和、是否相合相生、有無門迫擊刑入墓空亡，以及有無第三者（情人）之象。',
  尋物: '尋物斷法：時干所落之宮代表遺失物品，日干所落之宮代表事主（尋物者）。事主宮剋物品宮→容易找到；物品宮剋事主宮→較難找；物品宮生事主宮→物品會回來、易尋；事主宮生物品宮→要費力去尋；同宮→物品就在事主附近；相鄰→不遠；相隔越遠越費時；伏吟主慢、反吟主快（已算好的生克、快慢、距離見「推算依據」，請直接引用）。物品宮內的符號組合，用來推斷物品可能在哪裡、被什麼遮蓋或伴隨（高處／低處、金屬容器內、木器旁、被布遮蓋…），指出哪些符號提供了哪些線索。回答重點：能否找到（易／難、快／慢）、最可能在哪（方位＋具體環境）、往哪個方位與什麼類型的地方找。',
  自選用神: '使用者自行指定了用神及其代表的人事物。請圍繞各用神所落之宮分析：該宮五行與宮內符號組合（象意疊加）如何呼應其代表之事；宮與宮之間的五行生剋與四害強弱（見「宮位關係」）；用神宮空亡時以先天轉宮論（見「空亡轉先天」）。指出哪些符號支持哪些判斷，並給出明確的吉凶傾向與建議。',
};
// 奇門問事：盤面事實與分析資料區塊（問事解讀與 AI 對話共用，保證分析口徑一致）
function qimenAskFacts(d) {
  const c = d.chart || {};
  const symLines = (symbols) => (symbols || []).map((s) => `【${s.label}・${s.name}】象意：${s.meaning || ''}｜屬性：${(s.attrs || []).join('、')}`).join('　');
  const ysLines = (d.yongshen || []).map((y) => {
    const marks = (y.marks && y.marks.length) ? `｜狀態：${y.marks.join('、')}` : '';
    return `◆ ${y.name}（${y.role}）落 ${y.palace}（宮屬${y.wx}${y.branches ? `，宮支${y.branches}` : ''}）${marks}\n${symLines(y.symbols)}`;
  }).join('\n');
  const timingLines = (d.timing || []).map((x) => `- ${x}`).join('\n');
  const factLines = (d.facts || []).map((x) => `- ${x}`).join('\n');
  const relLines = (d.relations || []).map((x) => `- ${x}`).join('\n');
  const kongLines = (d.kong || []).map((k) => `- ${k.who}落${k.from}逢空亡 → 八成信息轉至其先天位（${k.to}）${k.double ? '；該宮亦逢空亡，為「雙空亡」，事情更虛、更難捉摸，須待雙重出空' : ''}。轉宮（${k.to}）符號：${symLines(k.toSymbols)}`).join('\n');
  return `【盤面事實】
四柱：${(c.pillars || []).join('　')}（${c.dun}遁${c.ju}局）　旬首：${c.xunShou || ''}
時柱旬空：${c.kong || ''}${c.kongPalaces ? `（落${c.kongPalaces}）` : ''}
值符 ${c.zhiFu || ''}；值使 ${c.zhiShi || ''}　馬星：${c.horse || ''}
${c.fuFan ? `九星${c.fuFan}。` : ''}${c.shiZhuLabel || '事主（日干）'}落 ${c.shiZhu || '未定'}；時干（所問之事）落 ${c.shiGan || ''}。

【用神取用與落宮】（各宮符號的象意屬性已附）
${ysLines || '（自訂問題：請依問題自行取用用神，並先說明取用理由）'}
${factLines ? `\n【推算依據】（已按規則算好，請直接引用）\n${factLines}\n` : ''}
【宮位關係】（五行生剋 × 四害強弱，已按規則算好。四害＝門迫、擊刑、入墓、空亡：主動方無四害而受方有四害，則生剋更強、單向作用；主動方帶四害則力不從心；兩宮四害狀態不一，如同各處一方世界，關係不實）
${relLines || '（各宮無直接生剋或同宮）'}

【空亡轉先天】（用神宮空亡時，八成信息轉至其先天位之宮；轉宮亦空亡為雙空亡）
${kongLines || '（無空亡轉宮）'}

【應期線索】（已按規則算好，請直接引用，勿自行發明地支）
${timingLines || '（無特別線索）'}`;
}

// 奇門：問事全盤解讀（用神取用＋應期＋宮宮關係四害＋空亡轉先天）
// ask payload: { qtype, custom, chart{...}, yongshen[...], timing[], relations[], kong[{who,from,to,double,toSymbols[]}], facts[] }
function qimenAskPrompt(d) {
  const isCustom = d.qtype === '自訂';
  const guide = ASK_GUIDE[d.qtype] ? `\n【類別指引】${ASK_GUIDE[d.qtype]}\n` : '';
  return `以下是奇門遁甲陰盤時盤的「問事」全盤推算。問事類別：「${d.qtype}」${isCustom && d.custom ? `，使用者所問：「${d.custom}」` : ''}。
${guide}
${qimenAskFacts(d)}

請以奇門遁甲大師角度，給出全盤問事解讀，條理清楚：
1. 吉凶總斷：此事整體成敗吉凶，一句話定調（依用神旺衰、宮宮生剋與四害強弱、空亡轉宮等綜合判斷）。
2. 現狀成因：從用神宮符號組合看事情的目前狀態與成因，指出哪些符號提供了哪些判斷；用神宮空亡者，兼讀其先天轉宮的符號。
3. 發展走向：接下來的變化與關鍵轉折（結合值符值使、馬星、伏吟反吟）。
4. 應期判斷：結合上述應期線索，給出最可能的應期尺度（快／慢）與地支月份或日期傾向，並說明依據。
5. 建議趨避：具體可行的建議（方位、時機、行為風水：哪些方位宜動宜靜、可移可拆之物）。
整體 520 字內，分點清楚。`;
}

// 奇門 AI 對話：語氣（白話＝港式口語／書面＝內地規範書面中文）與詳略（簡潔／適中／詳細）
const CHAT_STYLE = {
  白話: '用自然廣東話口語（如「係」「唔」「嘅」「咁」「啲」），親切隨和，像師傅同客人面對面傾談。',
  書面: '用規範書面中文（內地通用的書面普通話），選字正式準確、語氣莊重專業，避免口語與方言用字。',
};
const CHAT_DETAIL = {
  簡潔: '一針見血：只講結論與最關鍵的一句依據，不多解釋，80 字內。',
  適中: '先講結論，再簡潔講依據，自然分段，220 字內。',
  詳細: '詳細講解：結論、用神落宮、宮宮生剋與四害強弱、空亡轉宮、應期逐層講清楚，可分段，500 字內。',
};
// 奇門：AI 對話（問事時間起盤，對話口吻；分析資料與問事解讀同一口徑）
function qimenChatPrompt(d, opts = {}) {
  const style = CHAT_STYLE[opts.style] || CHAT_STYLE['白話'];
  const detail = CHAT_DETAIL[opts.detail] || CHAT_DETAIL['適中'];
  const guide = ASK_GUIDE[d.qtype] ? `\n【類別指引】${ASK_GUIDE[d.qtype]}\n` : '';
  return `你正在以奇門遁甲師傅身分與客人對話。以下是於問事時刻所起的陰盤奇門時盤，以及已按規則算好的分析資料（用神取用、宮宮關係、空亡轉宮、應期等，請直接引用，勿自行發明）：
${guide}
${qimenAskFacts(d)}

【對話方式要求】
- 語氣：${style}
- 詳略：${detail}
- 像真人師傅與客人面談：先直接回答重點（吉凶／可否／如何），再說明依據（用神落宮、生剋四害、空亡轉宮、應期）。
- 不要列點、不要分「1.2.3.」、不要重複盤面資料；像對話一樣自然分段。
- 若客人的問題與問事無關，親切回應並引導回正題。`;
}

// 白話（廣東話口語）→ 規範書面中文（內地可讀）；術語保留、不增刪內容
function stdChinesePrompt(text) {
  return `請把以下廣東話口語文字改寫為規範書面中文（內地通用的書面普通話），要求：
- 保留全部原意；奇門遁甲與風水專有名詞（如用神、值符、空亡、門迫、擊刑、入墓、應期等）保持不變；
- 只改寫語氣與用字（如「係」→「是」、「唔」→「不」、「嘅」→「的」、「咁」→「那麼」），不增刪內容、不加評論；
- 直接輸出改寫後的文字，不要任何前後綴或引號。

原文：
${text}`;
}

// 奇門：AI 對話的問題分類（判斷問事類別／是否閒聊／是否新話題），只回 JSON
const CHAT_TYPES = ['終身局', '求財', '事業工作', '感情婚姻', '疾病健康', '官司是非', '考試學業', '出行遠行', '行人尋人', '置業房產', '尋物', '自訂'];
function qimenClassifyPrompt(question, history) {
  const hist = (history || []).slice(-3).map((h) => `問：${h.q}／答：${String(h.a).slice(0, 60)}`).join('；');
  return `使用者正在與奇門遁甲師傅對話。請判斷使用者最新這句話：
「${question}」
${hist ? `（上文：${hist}）` : ''}

只回 JSON 物件（不要任何其他文字或代碼框）：
{
  "smalltalk": true 或 false,
  "newTopic": true 或 false,
  "qtype": "最貼近的問事類別",
  "reply": "若純閒聊：以師傅口吻寫一句親切回應並引導對方問事（30 字內）；否則填空字串"
}
規則：
- smalltalk＝純打招呼、閒聊、與問事無關（此時 qtype 填空字串）。
- newTopic＝這句話開啟了與上文不同的事情（無上文時為 true；純追問細節為 false）。
- qtype 只能是：${CHAT_TYPES.join('、')}。問性格／命運／一生 → 終身局；問遺失物品 → 尋物；問感情對象 → 感情婚姻；拿不定主意 → 自訂。`;
}

// 二十四天星（玄道風水）：d = { sit, face, sitStar, faceStar, stars[{mountain,dir,palace,star,ji,wx,group,governs,rel}] }
const S24_THEMES = {
  整體佈局: `請給出整體佈局建議：
1. 吉凶方位總覽：哪些方位是吉位（財、丁、貴人、文昌）、哪些是凶位（特別是屍氣大凶位、天賊、天烽）。
2. 坐山與向首星：坐山星與向首星各主何事，此宅最需注意什麼。
3. 門床灶書桌：大門、睡床、書桌、廚灶、廁所各宜放在哪些星位方位，忌放哪些。
4. 凶位化解：對最凶的兩三個方位給出具體化解（宜低宜靜、五行物品、顏色）。
整體 420 字內，分點清楚。`,
  財運: `請專論財運：
1. 財位分析：天錢（財位）落在哪個山向方位，該方位宜如何佈置（宜高大明亮整潔、可放什麼）。
2. 輔助財星：從官、司祿、開陽等對事業財勢的方位提示。
3. 破財位：天賊、搖光、敗傷等落在何處，該處忌什麼（忌高、忌動、忌放財物）。
4. 星宮五行：財位星與宮位的生剋（得力或受制）與補救。
整體 360 字內，分點清楚。`,
  感情桃花: `請專論感情桃花：
1. 天孫位（生產、佳兒佳媳）與咸池位（倒捶桃花、淫蕩之禍）各在何方，如何催吉避凶。
2. 桃花佈局：想旺姻緣該在哪個方位下功夫（具體物品、顏色、成對數量），哪個方位萬萬不可催。
3. 夫妻房與桃花位的配合建議。
整體 340 字內，分點清楚。`,
  健康: `請專論健康：
1. 屍氣（大凶，病符死亡）落在何方，該方位忌作什麼（忌臥床、忌久坐、忌灶），如何化解。
2. 天醫組（天田、天璇、天孫）方位如何利用以助健康。
3. 敗傷、天烽等凶星位的注意事項（防跌打損傷、火災）。
整體 340 字內，分點清楚。`,
  事業功名: `請專論事業與功名：
1. 文昌位（讀書文榜功名）與天樞位（規矩節度）在何方，書桌、書房、文昌塔如何擺。
2. 從官（升職）、司祿（事業財勢）方位的催旺方法。
3. 天權（小人位）在何方，如何防小人。
整體 340 字內，分點清楚。`,
};
function star24Prompt(d, theme, custom) {
  const lines = (d.stars || []).map((s) => `${s.mountain}山（${s.dir}・${s.palace}宮屬${s.palaceWx}）：${s.star}（${s.ji}${s.wx ? `・屬${s.wx}` : ''}・${s.group}組）— ${s.governs}${s.rel ? `｜星宮關係：${s.rel}` : ''}`).join('\n');
  const instr = theme === '自訂'
    ? `使用者的問題是：「${custom}」。請以二十四天星為據回答，扣住相關星位的方位與司職，具體可執行；若問題與此無關，直接說明並給最接近的判斷。整體 340 字內。`
    : (S24_THEMES[theme] || S24_THEMES['整體佈局']);
  const methodNote = d.method === 'bazhai'
    ? '八宅遊年排法（坐山起伏位，大遊年配八宮，每宮三山配三小星）'
    : '玄道風水（講堂立極尺版本）';
  return `以下是陽宅「${d.sit}山${d.face}向」的二十四天星盤（${methodNote}，二十四星配二十四山，吉星十二、凶星十二，各司其職）：
坐山星：${d.sitStar}；向首星：${d.faceStar}。
各山星位：
${lines}

請以天星風水大師角度分析。${instr}`;
}

// 室內佈局 AI：對照玄空盤評估用家已標注嘅房間，給出理想調動＋化解
// indoor payload: { sit, face, period, flowYear, rooms[] }
function indoorLayoutPrompt(d) {
  const roomLines = (d.rooms || []).map((r) => {
    const pctStr = (r.byMountain || []).length ? `；各山佔比 ${r.byMountain.map((m) => `${m.mountain}${m.pct != null ? Math.round(m.pct) + '%' : ''}`).join('・')}` : '';
    const ps = (r.palaces || []).map((p) => `${p.palaceName}宮（${p.dir}）：山${p.shan} 向${p.xiang}${p.flow ? ` 流年${p.flow}` : ''}「${p.combo}」${p.ji}${p.remedy ? `（傳統化解：${p.remedy}）` : ''}${p.star ? `；天星「${p.star}」（${p.starJi}${p.starGoverns ? `，${p.starGoverns}` : ''}）` : ''}`).join('；');
    const furn = (r.furniture || []).length ? `；家具：${r.furniture.join('、')}` : '';
    return `◆ ${r.type}（${(r.mountains || []).join('、')}山${pctStr}）${furn}\n  ${ps}`;
  }).join('\n');
  const starNote = d.starFace ? `\n注意：二十四天星唔跟羅盤坐向，而係跟「日照最強方向」（納光口）起盤——天星向首喺 ${d.starFace}（${d.starFaceDeg}°），天星坐山 ${d.starSit}；排盤法：${d.method === 'bazhai' ? '八宅遊年' : '玄道'}。` : '';
  return `以下是一個陽宅的玄空飛星盤（${d.sit}山${d.face}向，${d.period}運${d.flowYear ? `，${d.flowYear}年流年` : ''}），以及用家在平面圖上標注的實際房間佈局（每間房列出所跨宮位的山向星、星曜組合吉凶、傳統化解與天星）：${starNote}

【各房間現狀】
${roomLines}

請以玄空風水大師角度，對照星盤評估這個實際佈局，條理清楚：
1. 現狀評估：逐間房講好定唔好（邊間啱位、邊間唔啱位），並講明邊個星曜組合支持。
2. 理想佈局：如果重新編排，邊種房（主人房／睡房／廚房／廁所／大門／書房／神位…）應該喺邊個宮位最啱（睡房宜吉位、廁所宜壓凶位、大門宜旺、書房宜文昌位等），指出最關鍵嘅一至兩個調動。
3. 化解之法：對唔郁得嘅房，給出具體化解（五行物品、顏色、材質、擺放位置、數量）。
整體 450 字內，分點清楚。`;
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

// 玄空：兩盤對比（換宅前後／兩個坐向）
function xkCompareTwoPrompt(d) {
  const chartStr = (c) => c.palaces.map((p) => `${p.name}(${p.dir})山${p.shan}向${p.xiang}運${p.yun}`).join('；');
  const typesStr = (typs) => (typs || []).map((t) => `${t.n}(${t.t})`).join('、') || '無特殊格局';
  const one = (c, tag) => `【${tag}】坐${c.sit}山${c.face}向，${c.period}運${c.flowYear ? `，${c.flowYear}年流年` : ''}\n格局：${typesStr(c.types)}\n各宮：${chartStr(c)}`;
  return `以下是兩個陽宅的玄空飛星盤（${d.note || '兩盤對比'}），請以玄空風水大師角度比較分析：

${one(d.chartA, d.labelA || '甲盤')}

${one(d.chartB, d.labelB || '乙盤')}

請給出對比分析，條理清楚：
1. 整體旺衰對比：兩盤在各自運的整體吉凶，哪一宅（或哪一運）較旺，財運與人丁消長。
2. 關鍵差異：坐山、向首、最吉最凶宮位的差異，各主何事。
3. 取捨建議：若為換宅／兩宅選擇，建議哪一個較佳、為什麼；各有什麼需要化解或注意之處。
整體 420 字內，分點清楚。`;
}

// 奇門：多盤對比（兩個時間）
function qimenComparePrompt(d) {
  const one = (c, tag) => `【${tag}】${c.time}：四柱 ${c.pillars}（${c.dun}遁${c.ju}局）；值符 ${c.zhiFu}、值使 ${c.zhiShi}、馬星 ${c.horse}；事主（日干）落 ${c.shiZhu}、時干落 ${c.shiGan}；空亡 ${c.kong}；主要格局：${c.geju || '無'}`;
  return `以下是奇門遁甲陰盤的兩個時盤（兩個時間點），請以奇門大師角度比較分析：

${one(d.chartA, d.labelA || '甲盤')}

${one(d.chartB, d.labelB || '乙盤')}

請給出對比分析，條理清楚：
1. 兩盤整體格局強弱與氣勢（值符值使旺衰、空亡、伏吟反吟）。
2. 同一事項在兩盤的吉凶差異（若有用神主題則圍繞之；否則綜合而論）。
3. 擇時建議：若要行事，哪個時間較佳、為什麼；各需注意什麼。
整體 380 字內，分點清楚。`;
}

// AI 讀平面圖（vision）：搵出圖入面嘅房間／空間＋位置（0–1 比例），回 JSON
const FP_ROOM_TYPES = ['大門', '玄關', '客廳', '飯廳', '廚房', '睡房', '主人房', '書房', '廁所', '浴室', '露台', '走廊', '儲物房', '神位', '樓梯'];
// 可辨認嘅重要家具／固定裝置（風水關鍵位）
const FP_FEATURE_TYPES = ['床', '灶頭', '廁所', '門', '窗'];
function readFloorplanPrompt() {
  return `你係平面圖分析員。呢張係一個住宅平面圖（俯視圖）。請搵出圖入面嘅房間、重要家具同埋門，並估計佢哋嘅位置（同方向）。
只回 JSON 物件（唔好任何其他文字、唔好代碼框）：
{"rooms":[{"type":"房間類型","cx":0.0,"cy":0.0,"x1":0.0,"y1":0.0,"x2":0.0,"y2":0.0}],
 "features":[{"type":"床／灶頭／廁所／門／窗","cx":0.0,"cy":0.0,"dir":0}]}
規則：
- rooms.type 只可以用：${FP_ROOM_TYPES.join('、')}。cx、cy＝房間中心（0–1 比例，左上角係 0,0）；x1,y1,x2,y2＝房間範圍左上同右下（0–1）。儘量覆蓋所有可辨認空間，順序由大到細。
- features 用嚟標重要家具同固定裝置：
  - 「床」：睡房入面嘅床。dir＝床頭方向（床頭板／枕頭嗰邊指向邊），用 0–359 度（0＝圖嘅正上方，順時針計）。
  - 「灶頭」：廚房嘅爐灶位置（唔使 dir）。
  - 「廁所」：廁所入面嘅座廁位置（唔使 dir）。
  - 「門」：每道門嘅位置。dir＝門口朝向／打開方向（0–359 度，0＝圖嘅正上方，順時針）。**要數晒所有門**。
  - 「窗」：窗嘅位置（唔使 dir）。
- 唔肯定方向就畀個最合理嘅估計。冇嘅項目就唔好出喺 features。`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }
  const apiKeyRaw = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.Qimen;
  const apiKey = apiKeyRaw ? String(apiKeyRaw).trim() : '';
  if (!apiKey) { res.status(503).json({ error: '尚未設定 API key（請於 Vercel 環境變數加入 AI_API_KEY 後重新部署）' }); return; }
  const base = (process.env.AI_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');

  let payload = req.body;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = null; } }
  const { task, theme, custom, context, palace, symbols, chart, find, compare, ask, question, followups, system, door, bazhai, star24, chatStyle, chatDetail, indoor } = payload || {};

  // 模型選擇：前端可選 flash（快速）/ pro（深度），白名單驗證，預設 flash
  const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
  const reqModel = payload && payload.model;
  const model = (reqModel && ALLOWED_MODELS.has(reqModel)) ? reqModel : (process.env.AI_MODEL || 'deepseek-v4-flash');

  // AI 讀平面圖（vision）：獨立路徑（圖像訊息＋JSON 回應）。需要 vision-capable 模型（AI_VISION_MODEL 可另設）。
  if (task === 'readFloorplan') {
    const img = payload && payload.image;
    if (!img || typeof img !== 'string' || !img.startsWith('data:image')) { res.status(400).json({ error: '缺少平面圖資料' }); return; }
    // vision 模型：DeepSeek 端點預設用佢嘅視覺模型 deepseek-v4-flash-vision-exp（同一 API key／base）；
    // 其他端點就用返主模型；可用 AI_VISION_MODEL 覆蓋。
    const visionModel = process.env.AI_VISION_MODEL || (base.includes('deepseek') ? 'deepseek-v4-flash-vision-exp' : model);
    try {
      const vbody = {
        model: visionModel,
        messages: [
          { role: 'system', content: '你係平面圖分析員，只回 JSON。' },
          { role: 'user', content: [{ type: 'text', text: readFloorplanPrompt() }, { type: 'image_url', image_url: { url: img } }] },
        ],
        temperature: 0.2, max_tokens: 2000,
      };
      const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(vbody) });
      if (!r.ok) { const txt = await r.text(); res.status(502).json({ error: `AI 讀圖回應錯誤（${r.status}）—— 呢個功能需要 vision-capable 嘅 AI 模型`, detail: txt.slice(0, 200) }); return; }
      const data = await r.json();
      const text = ((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
      let parsed = null;
      try { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null; } catch { parsed = null; }
      const rooms = (parsed && Array.isArray(parsed.rooms) ? parsed.rooms : [])
        .map((rm) => ({ type: FP_ROOM_TYPES.includes(rm && rm.type) ? rm.type : '睡房', cx: +rm.cx, cy: +rm.cy, x1: +rm.x1, y1: +rm.y1, x2: +rm.x2, y2: +rm.y2 }))
        .filter((rm) => [rm.cx, rm.cy, rm.x1, rm.y1, rm.x2, rm.y2].every((v) => isFinite(v)));
      const features = (parsed && Array.isArray(parsed.features) ? parsed.features : [])
        .map((f) => ({ type: FP_FEATURE_TYPES.includes(f && f.type) ? f.type : '門', cx: +f.cx, cy: +f.cy, dir: (f.dir != null && isFinite(+f.dir)) ? ((+f.dir) % 360 + 360) % 360 : null }))
        .filter((f) => isFinite(f.cx) && isFinite(f.cy));
      const u = data && data.usage;
      res.status(200).json({ json: { rooms, features }, model: visionModel, usage: u ? { pt: u.prompt_tokens || 0, ct: u.completion_tokens || 0 } : null });
    } catch (e) { res.status(500).json({ error: 'AI 讀圖失敗', detail: String(e && e.message || e) }); }
    return;
  }

  let prompt;
  if (task === 'indoorLayout') {
    const ind = payload && payload.indoor;
    if (!ind || !Array.isArray(ind.rooms) || !ind.rooms.length) { res.status(400).json({ error: '缺少室內佈局資料' }); return; }
    prompt = indoorLayoutPrompt(ind);
  } else if (task === 'toStdChinese') {
    const txt = (chart && chart.text) || (payload && payload.text) || '';
    if (!String(txt).trim()) { res.status(400).json({ error: '缺少文字' }); return; }
    prompt = stdChinesePrompt(String(txt).slice(0, 3000));
  } else if (task === 'qimenClassify') {
    if (!question || !String(question).trim()) { res.status(400).json({ error: '缺少問題' }); return; }
    prompt = qimenClassifyPrompt(String(question).slice(0, 500), followups);
  } else if (task === 'qimenChat') {
    if (!ask || !ask.qtype || !ask.chart) { res.status(400).json({ error: '缺少問事資料' }); return; }
    prompt = qimenChatPrompt(ask, { style: chatStyle, detail: chatDetail });
  } else if (task === 'star24') {
    if (!chart || !Array.isArray(chart.stars) || !chart.stars.length) { res.status(400).json({ error: '缺少二十四天星資料' }); return; }
    if (theme === '自訂' && !(custom && String(custom).trim())) { res.status(400).json({ error: '請輸入想問的問題' }); return; }
    prompt = star24Prompt({ ...chart, method: (payload && payload.method) || chart.method }, theme || '整體佈局', custom || '');
  } else if (task === 'qimenAsk') {
    if (!ask || !ask.qtype || !ask.chart) { res.status(400).json({ error: '缺少問事資料' }); return; }
    if (ask.qtype === '自訂' && !(ask.custom && String(ask.custom).trim())) { res.status(400).json({ error: '請輸入想問的問題' }); return; }
    prompt = qimenAskPrompt(ask);
  } else if (task === 'xkCompare') {
    if (!compare || !compare.chartA || !compare.chartB) { res.status(400).json({ error: '缺少換運對比資料' }); return; }
    prompt = xkComparePrompt(compare);
  } else if (task === 'xkCompareTwo') {
    if (!compare || !compare.chartA || !compare.chartB) { res.status(400).json({ error: '缺少兩盤對比資料' }); return; }
    prompt = xkCompareTwoPrompt(compare);
  } else if (task === 'qimenCompare') {
    if (!compare || !compare.chartA || !compare.chartB) { res.status(400).json({ error: '缺少奇門對比資料' }); return; }
    prompt = qimenComparePrompt(compare);
  } else if (task === 'qimenFind') {
    if (!find || !find.item || !find.querent) { res.status(400).json({ error: '缺少尋物資料' }); return; }
    prompt = qimenFindPrompt(find);
  } else if (task === 'xkChat') {
    if (!chart || !Array.isArray(chart.palaces)) { res.status(400).json({ error: '缺少玄空盤資料' }); return; }
    prompt = xkChatPrompt({ chart, star24, indoor }, { style: chatStyle, detail: chatDetail });
  } else if (task === 'xkOverall' || task === 'xkPalace') {
    if (!chart || !Array.isArray(chart.palaces)) { res.status(400).json({ error: '缺少玄空盤資料' }); return; }
    if (task === 'xkPalace' && !palace) { res.status(400).json({ error: '缺少玄空宮位資料' }); return; }
    if (theme === '自訂' && !(custom && String(custom).trim())) { res.status(400).json({ error: '請輸入想問的問題' }); return; }
    prompt = xkPrompt(chart, task === 'xkOverall' ? '整體' : palace, theme, custom, context, { system, door, bazhai, star24, indoor });
  } else {
    if (!palace || !Array.isArray(symbols) || symbols.length === 0) { res.status(400).json({ error: '缺少宮位符號資料' }); return; }
    prompt = qimenPrompt(palace, symbols, theme || '物品', custom || '');
  }

  // 追問模式（多輪）：盤面 prompt 作首條 user 訊息，接歷史問答，最後是本次追問。
  // followups 由前端隨原 payload 一併送回，伺服器端重建上下文，避免 client 竄改 system/盤面資料。
  const isChat = task === 'qimenChat' || task === 'xkChat';
  const isClassify = task === 'qimenClassify';
  const isTranslate = task === 'toStdChinese';
  const followQ = question && String(question).trim() ? String(question).trim().slice(0, 500) : '';
  const history = (Array.isArray(followups) ? followups : [])
    .filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string')
    .slice(-12)
    .flatMap((f) => [{ role: 'user', content: f.q.slice(0, 2000) }, { role: 'assistant', content: f.a.slice(0, 3000) }]);
  const sysContent = isChat
    ? `${SYS}你現在正以對話方式與客人傾談（不是寫報告），回答要自然、親切、口語。`
    : SYS;
  const messages = [{ role: 'system', content: sysContent }, { role: 'user', content: prompt }, ...history];
  if (followQ && !isClassify) {
    const detailRule = CHAT_DETAIL[chatDetail] || CHAT_DETAIL['適中'];
    messages.push({
      role: 'user',
      content: isChat
        ? `客人問：「${followQ}」。請承接上文直接回答（語氣與詳略照上方要求：${detailRule}不必重複盤面資料）。`
        : `以上是本盤先前的問答。使用者追問：「${followQ}」。請承接上文直接回答，不必重複盤面資料；答案具體簡潔，260 字內。`,
    });
  }

  try {
    const body = {
      model,
      messages,
      temperature: isClassify ? 0.2 : isTranslate ? 0.3 : 0.8,
      max_tokens: isClassify ? 200 : 1800,
      thinking: { type: 'disabled' },
    };
    if (isClassify) body.response_format = { type: 'json_object' }; // DeepSeek JSON 模式
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const txt = await r.text(); res.status(502).json({ error: `AI 服務回應錯誤（${r.status}）`, detail: txt.slice(0, 300) }); return; }
    const data = await r.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const text = ((msg && msg.content) || '').trim();
    const u = data && data.usage;
    const usage = u ? { pt: u.prompt_tokens || 0, ct: u.completion_tokens || 0 } : null;
    if (isClassify) {
      // 寬容解析 JSON（容許代碼框包裹），失敗則回退預設分類
      let parsed = null;
      try {
        const m = text.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      } catch { parsed = null; }
      const out = {
        smalltalk: !!(parsed && parsed.smalltalk),
        newTopic: !parsed || parsed.newTopic !== false,
        qtype: parsed && CHAT_TYPES.includes(parsed.qtype) ? parsed.qtype : '自訂',
        reply: parsed && typeof parsed.reply === 'string' ? parsed.reply.slice(0, 120) : '',
      };
      res.status(200).json({ json: out, model, usage });
      return;
    }
    res.status(200).json({ text: text || '（AI 未回傳內容）', model, usage });
  } catch (e) {
    res.status(500).json({ error: 'AI 呼叫失敗', detail: String(e && e.message || e) });
  }
}
