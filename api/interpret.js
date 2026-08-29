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
    const per = c.palaces.map((p) => `${p.name}宮（${p.dir}）：山${p.shan} 向${p.xiang} 運${p.yun}${p.flow ? ` 流年${p.flow}` : ''}｜${p.combo}（${p.ji}）`).join('\n');
    return `${head}\n【各宮山星／向星／運星${c.flowYear ? '／流年星' : ''}及星曜組合】\n${per}`;
  }
  return `${head}\n${xkPalaceFacts(c, scope).text}`;
}

// 玄空：綜合（原有解讀方向）
const xkOverallInstr = (c) => `請以玄空風水大師角度，給出整體分析，條理清楚：
1. 全局旺衰：此坐向在${c.period}運的整體吉凶（結合格局），財運與人丁何者較旺。
2. 重點宮位：坐山、向首、中宮、以及最吉與最凶的宮位，各主何事。
3. 流年影響：今年流年星飛臨何宮、與山向星的生剋，需注意什麼。
4. 化解與催旺：針對凶宮給出具體化解（五行物品、顏色、擺設、方位），吉宮給出催旺方法。
整體 450 字內，分點清楚。`;

const xkPalaceInstr = () => `請給出：
1. 本宮吉凶：山向二星在此宮的組合意義（結合當運、失運、五行生剋），主財、丁、健康、官非、桃花等何事。
2. 實際影響：此方位若為大門／臥室／廚房／書房等，會如何。
3. 化解或催旺：具體方法（五行物品、顏色、材質、數量、擺放位置）。
整體 300 字內，分點清楚。`;

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

// 玄空：組主題 prompt（scope 為「整體」或宮名；theme 空或「綜合」走原有解讀）
function xkPrompt(c, scope, theme, custom, context) {
  const isOverall = !scope || scope === '整體';
  const at = isOverall
    ? '本宅全盤（逐個重點宮位分別說明，並指出各宮方位）'
    : (() => { const { p } = xkPalaceFacts(c, scope); return `${p.name}宮（${p.dir}）這個方位`; })();

  let instr;
  if (theme === '自訂') {
    instr = `使用者的問題是：「${custom}」

請以玄空風水大師角度，針對${at}回答這個問題。要求：
1. 先扣住盤面事實作判斷（山星、向星、運星、流年星的五行生剋與旺衰，以及卦象所主的人事物）。
2. 答案要具體、可執行：涉及擺設就給物品、材質、顏色、形狀、數量、位置；涉及人事就給明確傾向與應對。
3. 明確指出是哪些星曜或卦象支持你的結論。
4. 若問題與此盤無關或資料不足，直接說明並給出最接近的判斷。
整體 340 字內，分點清楚。`;
  } else if (XK_THEMES[theme]) {
    instr = XK_THEMES[theme].replace(/\$\{AT\}/g, at);
  } else {
    instr = isOverall ? xkOverallInstr(c) : xkPalaceInstr();
  }

  const extra = context && String(context).trim()
    ? `\n【使用者補充的實際情況】${String(context).trim()}\n（請把這些條件納入判斷，建議要配合現場實況。）`
    : '';
  const needRef = theme && theme !== '綜合';
  return `${xkHead(c, scope)}${extra}\n\n${needRef ? `${XK_WX_REF}\n\n` : ''}${instr}`;
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
  感情婚姻: '本類別取用規則（已按此定位，請依此解讀）：對方由事主的天干五合合干而定（甲己、乙庚、丙辛、丁壬、戊癸相合），不固定看乙庚；值符為甲，甲己相合，故事主宮或對方宮見值符時，己亦為另一伴或情人，需兼看己所落之宮（有則已附於用神列表）；宮中見乙、丙、丁主易有桃花，見己主有「好聽話」式的桃花（已標註於各宮狀態）。請分析事主宮與對方宮的旺衰、兩宮五行生剋比和、是否相合相生、有無門迫擊刑入墓空亡，以及有無第三者（情人）之象。',
  尋物: '尋物斷法：時干所落之宮代表遺失物品，日干所落之宮代表事主（尋物者）。事主宮剋物品宮→容易找到；物品宮剋事主宮→較難找；物品宮生事主宮→物品會回來、易尋；事主宮生物品宮→要費力去尋；同宮→物品就在事主附近；相鄰→不遠；相隔越遠越費時；伏吟主慢、反吟主快（已算好的生克、快慢、距離見「推算依據」，請直接引用）。物品宮內的符號組合，用來推斷物品可能在哪裡、被什麼遮蓋或伴隨（高處／低處、金屬容器內、木器旁、被布遮蓋…），指出哪些符號提供了哪些線索。回答重點：能否找到（易／難、快／慢）、最可能在哪（方位＋具體環境）、往哪個方位與什麼類型的地方找。',
  自選用神: '使用者自行指定了用神及其代表的人事物。請圍繞各用神所落之宮分析：該宮五行與宮內符號組合（象意疊加）如何呼應其代表之事；宮與宮之間的五行生剋與四害強弱（見「宮位關係」）；用神宮空亡時以先天轉宮論（見「空亡轉先天」）。指出哪些符號支持哪些判斷，並給出明確的吉凶傾向與建議。',
};
// 奇門：問事全盤解讀（用神取用＋應期＋宮宮關係四害＋空亡轉先天）
// ask payload: { qtype, custom, chart{...}, yongshen[...], timing[], relations[], kong[{who,from,to,double,toSymbols[]}], facts[] }
function qimenAskPrompt(d) {
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
  const isCustom = d.qtype === '自訂';
  const guide = ASK_GUIDE[d.qtype] ? `\n【類別指引】${ASK_GUIDE[d.qtype]}\n` : '';
  return `以下是奇門遁甲陰盤時盤的「問事」全盤推算。問事類別：「${d.qtype}」${isCustom && d.custom ? `，使用者所問：「${d.custom}」` : ''}。
${guide}

【盤面事實】
四柱：${(c.pillars || []).join('　')}（${c.dun}遁${c.ju}局）　旬首：${c.xunShou || ''}
時柱旬空：${c.kong || ''}${c.kongPalaces ? `（落${c.kongPalaces}）` : ''}
值符 ${c.zhiFu || ''}；值使 ${c.zhiShi || ''}　馬星：${c.horse || ''}
${c.fuFan ? `九星${c.fuFan}。` : ''}事主（日干）落 ${c.shiZhu || '未定'}；時干（所問之事）落 ${c.shiGan || ''}。

【用神取用與落宮】（各宮符號的象意屬性已附）
${ysLines || '（自訂問題：請依問題自行取用用神，並先說明取用理由）'}
${factLines ? `\n【推算依據】（已按規則算好，請直接引用）\n${factLines}\n` : ''}
【宮位關係】（五行生剋 × 四害強弱，已按規則算好。四害＝門迫、擊刑、入墓、空亡：主動方無四害而受方有四害，則生剋更強、單向作用；主動方帶四害則力不從心；兩宮四害狀態不一，如同各處一方世界，關係不實）
${relLines || '（各宮無直接生剋或同宮）'}

【空亡轉先天】（用神宮空亡時，八成信息轉至其先天位之宮；轉宮亦空亡為雙空亡）
${kongLines || '（無空亡轉宮）'}

【應期線索】（已按規則算好，請直接引用，勿自行發明地支）
${timingLines || '（無特別線索）'}

請以奇門遁甲大師角度，給出全盤問事解讀，條理清楚：
1. 吉凶總斷：此事整體成敗吉凶，一句話定調（依用神旺衰、宮宮生剋與四害強弱、空亡轉宮等綜合判斷）。
2. 現狀成因：從用神宮符號組合看事情的目前狀態與成因，指出哪些符號提供了哪些判斷；用神宮空亡者，兼讀其先天轉宮的符號。
3. 發展走向：接下來的變化與關鍵轉折（結合值符值使、馬星、伏吟反吟）。
4. 應期判斷：結合上述應期線索，給出最可能的應期尺度（快／慢）與地支月份或日期傾向，並說明依據。
5. 建議趨避：具體可行的建議（方位、時機、行為風水：哪些方位宜動宜靜、可移可拆之物）。
整體 520 字內，分點清楚。`;
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
  return `以下是陽宅「${d.sit}山${d.face}向」的二十四天星盤（玄道風水，二十四星配二十四山，吉星十二、凶星十二，各司其職）：
坐山星：${d.sitStar}；向首星：${d.faceStar}。
各山星位：
${lines}

請以天星風水大師角度分析。${instr}`;
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
  const { task, theme, custom, context, palace, symbols, chart, find, compare, ask, question, followups } = payload || {};

  // 模型選擇：前端可選 flash（快速）/ pro（深度），白名單驗證，預設 flash
  const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
  const reqModel = payload && payload.model;
  const model = (reqModel && ALLOWED_MODELS.has(reqModel)) ? reqModel : (process.env.AI_MODEL || 'deepseek-v4-flash');

  let prompt;
  if (task === 'star24') {
    if (!chart || !Array.isArray(chart.stars) || !chart.stars.length) { res.status(400).json({ error: '缺少二十四天星資料' }); return; }
    if (theme === '自訂' && !(custom && String(custom).trim())) { res.status(400).json({ error: '請輸入想問的問題' }); return; }
    prompt = star24Prompt(chart, theme || '整體佈局', custom || '');
  } else if (task === 'qimenAsk') {
    if (!ask || !ask.qtype || !ask.chart) { res.status(400).json({ error: '缺少問事資料' }); return; }
    if (ask.qtype === '自訂' && !(ask.custom && String(ask.custom).trim())) { res.status(400).json({ error: '請輸入想問的問題' }); return; }
    prompt = qimenAskPrompt(ask);
  } else if (task === 'xkCompare') {
    if (!compare || !compare.chartA || !compare.chartB) { res.status(400).json({ error: '缺少換運對比資料' }); return; }
    prompt = xkComparePrompt(compare);
  } else if (task === 'qimenFind') {
    if (!find || !find.item || !find.querent) { res.status(400).json({ error: '缺少尋物資料' }); return; }
    prompt = qimenFindPrompt(find);
  } else if (task === 'xkOverall' || task === 'xkPalace') {
    if (!chart || !Array.isArray(chart.palaces)) { res.status(400).json({ error: '缺少玄空盤資料' }); return; }
    if (task === 'xkPalace' && !palace) { res.status(400).json({ error: '缺少玄空宮位資料' }); return; }
    if (theme === '自訂' && !(custom && String(custom).trim())) { res.status(400).json({ error: '請輸入想問的問題' }); return; }
    prompt = xkPrompt(chart, task === 'xkOverall' ? '整體' : palace, theme, custom, context);
  } else {
    if (!palace || !Array.isArray(symbols) || symbols.length === 0) { res.status(400).json({ error: '缺少宮位符號資料' }); return; }
    prompt = qimenPrompt(palace, symbols, theme || '物品', custom || '');
  }

  // 追問模式（多輪）：盤面 prompt 作首條 user 訊息，接歷史問答，最後是本次追問。
  // followups 由前端隨原 payload 一併送回，伺服器端重建上下文，避免 client 竄改 system/盤面資料。
  const followQ = question && String(question).trim() ? String(question).trim().slice(0, 500) : '';
  const history = (Array.isArray(followups) ? followups : [])
    .filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string')
    .slice(-12)
    .flatMap((f) => [{ role: 'user', content: f.q.slice(0, 2000) }, { role: 'assistant', content: f.a.slice(0, 3000) }]);
  const messages = [{ role: 'system', content: SYS }, { role: 'user', content: prompt }, ...history];
  if (followQ) messages.push({ role: 'user', content: `以上是本盤先前的問答。使用者追問：「${followQ}」。請承接上文直接回答，不必重複盤面資料；答案具體簡潔，260 字內。` });

  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        max_tokens: 1800,
        thinking: { type: 'disabled' },
      }),
    });
    if (!r.ok) { const txt = await r.text(); res.status(502).json({ error: `AI 服務回應錯誤（${r.status}）`, detail: txt.slice(0, 300) }); return; }
    const data = await r.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    const text = ((msg && msg.content) || '').trim();
    const u = data && data.usage;
    const usage = u ? { pt: u.prompt_tokens || 0, ct: u.completion_tokens || 0 } : null;
    res.status(200).json({ text: text || '（AI 未回傳內容）', model, usage });
  } catch (e) {
    res.status(500).json({ error: 'AI 呼叫失敗', detail: String(e && e.message || e) });
  }
}
