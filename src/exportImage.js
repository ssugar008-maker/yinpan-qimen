import { toPng } from 'html-to-image';

// iOS Safari 對 canvas 面積有限制（過大會產生空白圖）；此為安全上限
const MAX_PIXELS = 5_000_000;
function safeRatio(w, h, want = 3) {
  const area = Math.max(1, w * h);
  return Math.max(1, Math.min(want, Math.sqrt(MAX_PIXELS / area)));
}

export const isIOS = () => (typeof navigator !== 'undefined') && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// 下載 dataURL 為 PNG（桌面用；iOS 由呼叫端改用預覽長按儲存）
export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// 複製節點後，展開會截斷內容的元素（.ai-result 限高、收合的 details），並把平面圖高度依圖片比例調好
function expandForCapture(root, contentWidth) {
  root.querySelectorAll('.ai-result').forEach((el) => { el.style.maxHeight = 'none'; el.style.overflow = 'visible'; });
  root.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
  root.querySelectorAll('.indoor-canvas-wrap').forEach((el) => {
    const img = el.querySelector('img');
    if (img && img.naturalWidth) {
      const w = contentWidth || el.clientWidth || 720;
      el.style.height = `${Math.round(w * (img.naturalHeight / img.naturalWidth))}px`;
    }
  });
}

// 擷取單一 DOM 節點，回傳 dataURL（複製到離屏容器並展開，確保完整）
export async function captureNodeData(node) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:780px;background:#fbf8f1;padding:14px 16px;z-index:-1;pointer-events:none;';
  const clone = node.cloneNode(true);
  host.appendChild(clone);
  document.body.appendChild(host);
  expandForCapture(host, 748);
  try {
    const w = host.offsetWidth, h = host.offsetHeight;
    return await toPng(host, { backgroundColor: '#fbf8f1', pixelRatio: safeRatio(w, h), cacheBust: true });
  } finally {
    host.remove();
  }
}

// 擷取多個節點「合併」為一張直向長圖，回傳 dataURL
export async function captureCombinedData(sections, meta = {}) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:780px;background:#fbf8f1;padding:20px 22px;font-family:inherit;z-index:-1;pointer-events:none;';
  const head = document.createElement('div');
  head.style.cssText = 'font-size:20px;font-weight:800;color:#6b4f2a;margin-bottom:4px;letter-spacing:1px;';
  head.textContent = meta.title || 'MO易學';
  host.appendChild(head);
  if (meta.subtitle) {
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:13px;color:#8a7a5a;margin-bottom:14px;';
    sub.textContent = meta.subtitle;
    host.appendChild(sub);
  }
  sections.forEach((sec) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:16px;background:#fff;border:1px solid #eee5d5;border-radius:10px;padding:12px 14px;overflow:hidden;';
    if (sec.label) {
      const lh = document.createElement('div');
      lh.style.cssText = 'font-size:14px;font-weight:800;color:#8b5a2b;margin-bottom:8px;border-left:4px solid #b8860b;padding-left:8px;';
      lh.textContent = sec.label;
      wrap.appendChild(lh);
    }
    wrap.appendChild(sec.node.cloneNode(true));
    host.appendChild(wrap);
  });
  const foot = document.createElement('div');
  foot.style.cssText = 'text-align:center;font-size:11px;color:#b3a488;margin-top:4px;letter-spacing:2px;';
  foot.textContent = 'MO易學 · 玄空飛星 · 陰盤奇門';
  host.appendChild(foot);
  document.body.appendChild(host);
  expandForCapture(host, 708);
  try {
    const w = host.offsetWidth, h = host.offsetHeight;
    return await toPng(host, { backgroundColor: '#fbf8f1', pixelRatio: safeRatio(w, h), cacheBust: true });
  } finally {
    host.remove();
  }
}
