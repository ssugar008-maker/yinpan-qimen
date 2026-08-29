// Vercel Serverless Function：AI 分析結果雲端儲存（跨裝置）
// 使用 Vercel KV（Upstash Redis）REST API。環境變數（於 Vercel 連接 KV 後自動設定）：
//   KV_REST_API_URL / KV_REST_API_TOKEN   （或 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）
// 未設定則回 503，前端自動回退 localStorage。
//
//   GET  /api/library?ns=<namespace>        → { updatedAt, data }
//   POST /api/library  { ns, updatedAt, data } → 覆寫該 namespace（last-write-wins）

const ALLOWED_NS = new Set(['qimen_palace', 'qimen_find', 'qimen_ask', 'xuankong', 'star24']);

function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { base: String(url).replace(/\/$/, ''), token: String(token).trim() } : null;
}

async function kvCmd(cfg, args) {
  const r = await fetch(`${cfg.base}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return r.json().catch(() => ({}));
}

const keyFor = (ns) => `mo-yixue:lib:${ns}`;

export default async function handler(req, res) {
  const cfg = kvConfig();
  if (!cfg) { res.status(503).json({ error: '雲端未設定（請於 Vercel 連接 KV 資料庫）' }); return; }

  if (req.method === 'GET') {
    const ns = req.query && req.query.ns;
    if (!ALLOWED_NS.has(ns)) { res.status(400).json({ error: 'namespace 不正確' }); return; }
    try {
      const d = await kvCmd(cfg, ['GET', keyFor(ns)]);
      let val = null;
      try { val = d && d.result ? JSON.parse(d.result) : null; } catch { val = null; }
      res.status(200).json(val && typeof val === 'object' ? val : { updatedAt: 0, data: null });
    } catch (e) { res.status(500).json({ error: '讀取失敗', detail: String(e && e.message || e) }); }
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    const { ns, updatedAt, data } = body || {};
    if (!ALLOWED_NS.has(ns)) { res.status(400).json({ error: 'namespace 不正確' }); return; }
    try {
      const payload = JSON.stringify({ updatedAt: updatedAt || Date.now(), data: data == null ? null : data });
      await kvCmd(cfg, ['SET', keyFor(ns), payload]);
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: '寫入失敗', detail: String(e && e.message || e) }); }
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
