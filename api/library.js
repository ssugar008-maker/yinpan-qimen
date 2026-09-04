// Vercel Serverless Function：AI 分析結果雲端儲存（跨裝置）
// 後端二擇一（自動偵測環境變數）：
//   1. Vercel KV（Upstash Redis）：KV_REST_API_URL / KV_REST_API_TOKEN（或 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）
//   2. Vercel Blob：BLOB_READ_WRITE_TOKEN 或 VERCEL_OIDC_TOKEN（連接 Blob store 後 Vercel 自動注入；每個 namespace 存為一個 JSON blob）
// 兩者都未設定則回 503，前端自動回退 localStorage（本機仍可用）。
//
//   GET  /api/library?ns=<namespace>        → { updatedAt, data }
//   POST /api/library  { ns, updatedAt, data } → 覆寫該 namespace（last-write-wins）

const ALLOWED_NS = new Set(['qimen_palace', 'qimen_find', 'qimen_ask', 'xuankong', 'star24', 'qimen_chat', 'indoor']);

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
// Token：BLOB_READ_WRITE_TOKEN（靜態長期）或 VERCEL_OIDC_TOKEN（連接 store 後 Vercel 自動喺 runtime 注入，短期輪轉）。
// 注意：連接 store 時自訂 prefix（如 yinpan_AI_STORE_ID）只係識別用，授權靠上述 token，無需讀 prefix 變數。
function blobConfig() {
  let token = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    // 自訂 prefix 嘅 Blob read-write token（如 yinpan_AI_READ_WRITE_TOKEN）
    const k = Object.keys(process.env).find((key) => /_READ_WRITE_TOKEN$/i.test(key));
    if (k) token = process.env[k];
  }
  return token ? { type: 'blob', token: String(token).trim() } : null;
}
const BLOB_API = 'https://vercel.com/api/blob';
const blobPathFor = (ns) => `mo-yixue/lib/${ns}.json`;
async function blobGet(cfg, ns) {
  // 先以 list 按 pathname 搵 URL，再讀內容（public blob 可直接 GET；private 加 Authorization）
  const lr = await fetch(`${BLOB_API}/?prefix=${encodeURIComponent(blobPathFor(ns))}&limit=5`, {
    headers: { Authorization: `Bearer ${cfg.token}`, 'x-api-version': '12' },
  });
  if (!lr.ok) return null;
  const ld = await lr.json().catch(() => null);
  const blob = ld && Array.isArray(ld.blobs) ? (ld.blobs.find((b) => b.pathname === blobPathFor(ns)) || ld.blobs[0]) : null;
  if (!blob || !blob.url) return null;
  let r = await fetch(blob.url, { cache: 'no-store' });
  if (!r.ok) r = await fetch(blob.url, { cache: 'no-store', headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!r.ok) return null;
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return null; }
}
async function blobSet(cfg, ns, payload) {
  const put = (access) => fetch(`${BLOB_API}/?pathname=${encodeURIComponent(blobPathFor(ns))}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'x-api-version': '12',
      'x-vercel-blob-access': access,
      'x-allow-overwrite': '1',
      'x-content-type': 'application/json',
    },
    body: payload,
  });
  let r = await put('public');
  if (!r.ok) r = await put('private'); // store 設為 private 時改用 private 寫入
}

// 統一讀寫（KV 或 Blob）
async function storeRead(cfg, ns) {
  if (cfg.type === 'kv') {
    const d = await kvCmd(cfg, ['GET', kvKeyFor(ns)]);
    let val = null;
    try { val = d && d.result ? JSON.parse(d.result) : null; } catch { val = null; }
    return val && typeof val === 'object' ? val : null;
  }
  return blobGet(cfg, ns);
}
async function storeWrite(cfg, ns, payload) {
  if (cfg.type === 'kv') await kvCmd(cfg, ['SET', kvKeyFor(ns), payload]);
  else await blobSet(cfg, ns, payload);
}

// 需要擁有者密碼先可以讀嘅 namespace（其他人嘅問事記錄）；OWNER_KEY 未設定則唔鎖（向後相容）
const PROTECTED_READ_NS = new Set(['qimen_chat']);
const OWNER_KEY = process.env.OWNER_KEY ? String(process.env.OWNER_KEY).trim() : '';
const MAX_ENTRIES = 300; // upsert 列表上限

export default async function handler(req, res) {
  // 診斷（只回變數名是否存在，永不回值）：/api/library?debug=1
  if (req.method === 'GET' && req.query && req.query.debug === '1') {
    const names = Object.keys(process.env);
    res.status(200).json({
      kv: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
      blobRW: !!process.env.BLOB_READ_WRITE_TOKEN || names.some((k) => /_READ_WRITE_TOKEN$/i.test(k)),
      oidc: !!process.env.VERCEL_OIDC_TOKEN,
      ownerSet: !!OWNER_KEY,
      storeLike: names.filter((k) => /STORE|BLOB|KV_|REDIS|UPSTASH|OIDC|READ_WRITE/i.test(k)),
    });
    return;
  }
  const cfg = kvConfig() || blobConfig();
  if (!cfg) { res.status(503).json({ error: '雲端未設定（請於 Vercel 連接 KV 資料庫或 Blob store）' }); return; }

  if (req.method === 'GET') {
    const ns = req.query && req.query.ns;
    if (!ALLOWED_NS.has(ns)) { res.status(400).json({ error: 'namespace 不正確' }); return; }
    // 受保護 namespace：需要擁有者密碼（?key= 或 x-owner-key header）
    if (PROTECTED_READ_NS.has(ns) && OWNER_KEY) {
      const key = String((req.query && req.query.key) || req.headers['x-owner-key'] || '').trim();
      if (key !== OWNER_KEY) { res.status(403).json({ error: '需要擁有者密碼' }); return; }
    }
    try {
      const val = await storeRead(cfg, ns);
      res.status(200).json(val && typeof val === 'object' ? val : { updatedAt: 0, data: null });
    } catch (e) { res.status(500).json({ error: '讀取失敗', detail: String(e && e.message || e) }); }
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    const { ns, updatedAt, data, upsert } = body || {};
    if (!ALLOWED_NS.has(ns)) { res.status(400).json({ error: 'namespace 不正確' }); return; }
    try {
      // upsert：按 id 更新或加入（多人問事唔會互相覆蓋）；開放寫入（訪客問事都同步上云）
      if (upsert && typeof upsert === 'object' && upsert.id) {
        const cur = await storeRead(cfg, ns);
        const entries = Array.isArray(cur && cur.entries) ? cur.entries : [];
        const i = entries.findIndex((e) => e && e.id === upsert.id);
        if (i >= 0) entries[i] = { ...entries[i], ...upsert };
        else entries.push(upsert);
        await storeWrite(cfg, ns, JSON.stringify({ updatedAt: Date.now(), entries: entries.slice(-MAX_ENTRIES) }));
        res.status(200).json({ ok: true });
        return;
      }
      const payload = JSON.stringify({ updatedAt: updatedAt || Date.now(), data: data == null ? null : data });
      await storeWrite(cfg, ns, payload);
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: '寫入失敗', detail: String(e && e.message || e) }); }
    return;
  }

  res.status(405).json({ error: 'Method Not Allowed' });
}
