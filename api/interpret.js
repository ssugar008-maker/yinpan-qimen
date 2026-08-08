// Vercel Serverless Function：宮位符號 AI 組合解讀（風水物／物品）
// 前端 POST 本宮所有符號（名稱、象意、屬性、類象），此函式組 prompt 呼叫 OpenAI 相容 API。
// API key 只存在伺服器端（Vercel 環境變數），不下行到前端。
//
// 需在 Vercel 專案設定環境變數（key 可用 AI_API_KEY／DEEPSEEK_API_KEY／Qimen 任一命名）：
//   AI_API_KEY   必填（OpenAI／DeepSeek 等 OpenAI 相容介面的 key）
//   AI_API_BASE  選填，預設 https://api.deepseek.com（OpenAI 則填 https://api.openai.com/v1）
//   AI_MODEL     選填，預設 deepseek-v4-flash（OpenAI 則填 gpt-4o-mini）

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  // 讀取 key：支援 AI_API_KEY／DEEPSEEK_API_KEY／Qimen 等命名
  const apiKeyRaw = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.Qimen;
  const apiKey = apiKeyRaw ? String(apiKeyRaw).trim() : '';
  if (!apiKey) {
    res.status(503).json({ error: '尚未設定 API key（請於 Vercel 環境變數加入 AI_API_KEY 後重新部署）' });
    return;
  }
  // 預設用 DeepSeek（中文最貼、最平）；可用 AI_API_BASE／AI_MODEL 覆寫
  const base = (process.env.AI_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'deepseek-v4-flash';

  let payload = req.body;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch { payload = null; } }
  const { palace, symbols } = payload || {};
  if (!palace || !Array.isArray(symbols) || symbols.length === 0) {
    res.status(400).json({ error: '缺少宮位符號資料' });
    return;
  }

  // 組給模型看的符號清單（名稱＋核心象意＋屬性＋代表物）
  const lines = symbols.map((s) => {
    const attrs = (s.attrs || []).join('、');
    const items = (s.items || []).slice(0, 12).join('、');
    return `【${s.label}・${s.name}】象意：${s.meaning || ''}｜屬性：${attrs}｜類象：${items}`;
  }).join('\n');

  const system = '你是資深的奇門遁甲與風水擺設專家，擅長把一個宮位裡的多個符號「創意疊加」，推斷出它們共同指向的具體物品（風水物、擺設、隨身物等）。回答一律使用繁體中文。';
  const prompt = `以下是奇門遁甲陰盤「${palace}」這一宮的所有符號及其象意、屬性、萬物類象：

${lines}

請發揮創意，把這些符號的屬性「疊加組合」，推斷出 2 到 4 個最貼切的具體物品（風水物／擺設／物品）。要求：
1. 先提煉各符號的關鍵屬性（例如：高大、隱藏、金屬、貴重、柔軟、會發光…），找出它們的交集或互補。
2. 每個物品用一句話說明它如何同時符合多個符號（標出哪些符號貢獻了哪些特徵）。
3. 物品要具體、可想像（例如「外面鑲金飾、看起來低調但其實是保險箱」），不要空泛。
4. 格式：先一行「組合主軸：…」，再列點「1. 物品名 —— 說明」。整體 200 字內，條理清楚。`;

  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1400,
        thinking: { type: 'disabled' }, // 關閉思考模式，直接輸出答案（避免 reasoning 佔盡 token 致 content 空）
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      res.status(502).json({ error: `AI 服務回應錯誤（${r.status}）`, detail: txt.slice(0, 300) });
      return;
    }
    const data = await r.json();
    const msg = data && data.choices && data.choices[0] && data.choices[0].message;
    // 部分模型把答案放在 content，思考放在 reasoning_content；優先取 content
    const text = ((msg && msg.content) || '').trim();
    res.status(200).json({
      text: text || '（AI 未回傳內容）',
      debug: { finish: data && data.choices && data.choices[0] && data.choices[0].finish_reason, hasContent: !!(msg && msg.content), hasReasoning: !!(msg && msg.reasoning_content) },
    });
  } catch (e) {
    res.status(500).json({ error: 'AI 呼叫失敗', detail: String(e && e.message || e) });
  }
}
