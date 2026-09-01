// 共用 AI 設定與呼叫：模型選擇（快速 flash / 深度 pro）＋統一解讀請求＋本機用量累計
export const AI_MODELS = [
  { id: 'deepseek-v4-flash', label: '快速', sub: 'Flash' },
  { id: 'deepseek-v4-pro', label: '深度', sub: 'Pro' },
];
const MODEL_KEY = 'qimen_ai_model';
export const getAiModelId = () => {
  try { const v = localStorage.getItem(MODEL_KEY); return AI_MODELS.some((m) => m.id === v) ? v : 'deepseek-v4-flash'; } catch { return 'deepseek-v4-flash'; }
};
export const setAiModelId = (id) => { try { localStorage.setItem(MODEL_KEY, id); } catch { } };

// ── AI 用量累計（只存本機，按月＋模型聚合；不上雲、不影響存檔）──
const USAGE_KEY = 'mo_ai_usage_v1';
export function recordUsage(model, usage) {
  if (!usage || (!usage.pt && !usage.ct)) return;
  try {
    const all = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const m = all[month] = all[month] || {};
    const e = m[model] = m[model] || { calls: 0, pt: 0, ct: 0 };
    e.calls += 1; e.pt += usage.pt || 0; e.ct += usage.ct || 0;
    // 只保留最近 12 個月
    const keys = Object.keys(all).sort().slice(-12);
    const trimmed = {}; keys.forEach((k) => { trimmed[k] = all[k]; });
    localStorage.setItem(USAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new Event('ai-usage')); // 通知用量徽章即時更新
  } catch { }
}
export function getUsage() {
  try { return JSON.parse(localStorage.getItem(USAGE_KEY) || '{}'); } catch { return {}; }
}

// 統一 AI 解讀呼叫（自動帶入目前所選模型）
// 回傳 { text, model, usage }；usage = { pt: prompt tokens, ct: completion tokens }（可能為 null）
export async function aiInterpret(payload) {
  const r = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, model: getAiModelId() }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `AI 失敗（${r.status}）`);
  const out = { text: (data.text || '').trim(), model: data.model || getAiModelId(), usage: data.usage || null, json: data.json || null };
  recordUsage(out.model, out.usage);
  return out;
}
