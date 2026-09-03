// Vercel Serverless Function：AI 分析結果雲端儲存（跨裝置）
// 後端二擇一（自動偵測環境變數）：
//   1. Vercel KV（Upstash Redis）：KV_REST_API_URL / KV_REST_API_TOKEN（或 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）
//   2. Vercel Blob：BLOB_READ_WRITE_TOKEN（連接 Blob store 後自動注入；每個 namespace 存為一個 JSON blob）
// 兩者都未設定則回 503，前端自動回退 localStorage（本機仍可用）。
//
//   GET  /api/library?ns=<namespace>        → { updatedAt, data }
//   POST /api/library  { ns, updatedAt, data } → 覆寫該 namespace（last-write-wins）

const ALLOWED_NS = new Set(['qimen_palace', 'qimen_find', 'qimen_ask', 'xuankong', 'star24', 'qimen_chat']);

// ── KV（Upstash Redis REST）──
function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { type: 'kv', base: String(url).replace(/\/$/, ''), token: String(token).trim() } : null;
}
async function kvCmd(cfg, args) {
  const r = await fetch(`${cfg.base}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return r.json().catch(() => ({}));
}
const kvKeyFor = (ns) => `mo-yixue:lib:${ns}`;

// ── Vercel Blob（REST，無 SDK）──
function blobConfig() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { type: 'blob', token: String(token).trim() } : null;
}
const BLOB_API = 'https://blob.vercel-storage.com';
const blobPathFor = (ns) => `mo-yixue/lib/${ns}.json`;
async function blobGet(cfg, ns) {
  // 先以 list 按 pathname 搵 URL，再讀內容（public blob 可直接 GET）
  const lr = await fetch(`${BLOB_API}/?prefix=${encodeURIComponent(blobPathFor(ns))}&limit=5`, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'x-api-version': '12' },
  });
  if (!lr.ok) return null;
  const ld = await lr.json().catch(() => null);
  const blob = ld && Array.isArray(ld.blobs) ? (ld.blobs.find((b) => b.pathname === blobPathFor(ns)) || ld.blobs[0]) : null;
  if (!blob || !blob.url) return null;
  const r = await fetch(blob.url, { cache: 'no-store' });
  if (!r.ok) return null;
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return null; }
}
async function blobSet(cfg, ns, payload) {
  await fetch(`${BLOB_API}/?pathname=${encodeURIComponent(blobPathFor(ns))}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'x-api-version': '12',
      'x-vercel-blob-access': 'public',
      'x-allow-overwrite': '1',
      'x-content-type': 'application/json',
    },
    body: payload,
  });
}

export default async function handler(req, res) {
  const cfg = kvConfig() || blobConfig();
  if (!cfg) { res.status(503).json({ error: '雲端未設定（請於 Vercel 連接 KV 資料庫或 Blob store）' }); return; }

  if (req.method === 'GET') {
    const ns = req.query && req.query.ns;
    if (!ALLOWED_NS.has(ns)) { res.status(400).json({ error: 'namespace 不正確' }); return; }
    try {
      if (cfg.type === 'kv') {
        const d = await kvCmd(cfg, ['GET', kvKeyFor(ns)]);
        let val = null;
        try { val = d && d.result ? JSON.parse(d.result) : null; } catch { val = null; }
        res.status(200).json(val && typeof val === 'object' ? val : { updatedAt: 0, data: null });
      } else {
        const val = await blobGet(cfg, ns);
        res.status(200).json(val && typeof val === 'object' ? val : { updatedAt: 0, data: null });
      }
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
      if (cfg.type === 'kv') await kvCmd(cfg, ['SET', kvKeyFor(ns), payload]);
      else await blobSet(cfg, ns, payload);
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: '寫入失敗', detail: String(e && e.message || e) }); }
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
