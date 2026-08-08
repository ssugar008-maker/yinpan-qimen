// 共用 AI 設定與呼叫：模型選擇（快速 flash / 深度 pro）＋統一解讀請求
export const AI_MODELS = [
  { id: 'deepseek-v4-flash', label: '快速', sub: 'Flash' },
  { id: 'deepseek-v4-pro', label: '深度', sub: 'Pro' },
];
const MODEL_KEY = 'qimen_ai_model';
export const getAiModelId = () => {
  try { const v = localStorage.getItem(MODEL_KEY); return AI_MODELS.some((m) => m.id === v) ? v : 'deepseek-v4-flash'; } catch { return 'deepseek-v4-flash'; }
};
export const setAiModelId = (id) => { try { localStorage.setItem(MODEL_KEY, id); } catch { } };

// 統一 AI 解讀呼叫（自動帶入目前所選模型）
export async function aiInterpret(payload) {
  const r = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, model: getAiModelId() }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `AI 失敗（${r.status}）`);
  return (data.text || '').trim();
}
