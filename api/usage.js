// Vercel Serverless Function：查詢 AI 服務商帳戶餘額（供前端用量條顯示，判斷是否需要充值）
// 呼叫 DeepSeek 的 GET /user/balance（OpenAI 相容服務若無此端點則回 supported:false，前端只顯示本機 token 統計）。
// API key 只存在伺服器端，不下行；此端點為唯讀查詢，不產生費用。
//
// 回應：{ supported, currency, total, granted, toppedUp }
//   supported=false 表示服務商不支援餘額查詢（前端隱藏餘額條）
//   total/granted/toppedUp 為數字（DeepSeek 回字串，這裡轉好）

export default async function handler(req, res) {
  const apiKeyRaw = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.Qimen;
  const apiKey = apiKeyRaw ? String(apiKeyRaw).trim() : '';
  if (!apiKey) { res.status(503).json({ supported: false, error: '尚未設定 API key' }); return; }
  const base = (process.env.AI_API_BASE || 'https://api.deepseek.com').replace(/\/$/, '');

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${base}/user/balance`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) { res.status(200).json({ supported: false }); return; }
    const d = await r.json().catch(() => null);
    const info = d && Array.isArray(d.balance_infos) && d.balance_infos[0];
    if (!info) { res.status(200).json({ supported: false }); return; }
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    res.status(200).json({
      supported: true,
      currency: info.currency || 'CNY',
      total: num(info.total_balance),       // 剩餘總額（贈送＋充值）
      granted: num(info.granted_balance),   // 贈送餘額
      toppedUp: num(info.topped_up_balance) // 充值餘額
    });
  } catch {
    res.status(200).json({ supported: false });
  }
}
