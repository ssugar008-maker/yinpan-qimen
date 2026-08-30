import { toPng } from 'html-to-image';

// 下載 dataURL 為 PNG
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

// 擷取單一 DOM 節點為 PNG（先複製到離屏容器並展開，確保完整＋高解析）
export async function captureNode(node, filename) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:780px;background:#fbf8f1;padding:14px 16px;z-index:-1;';
  const clone = node.cloneNode(true);
  host.appendChild(clone);
  document.body.appendChild(host);
  expandForCapture(host, 748);
  try {
    const dataUrl = await toPng(host, { backgroundColor: '#fbf8f1', pixelRatio: 3, cacheBust: true });
    downloadDataUrl(dataUrl, filename);
  } finally {
    host.remove();
  }
}

// 擷取多個節點「合併」為一張直向長圖：複製節點到離屏容器，加標題與品牌，再一次擷取
export async function captureCombined(sections, filename, meta = {}) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:780px;background:#fbf8f1;padding:20px 22px;font-family:inherit;z-index:-1;';
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
    const clone = sec.node.cloneNode(true);
    wrap.appendChild(clone);
    host.appendChild(wrap);
  });
  const foot = document.createElement('div');
  foot.style.cssText = 'text-align:center;font-size:11px;color:#b3a488;margin-top:4px;letter-spacing:2px;';
  foot.textContent = 'MO易學 · 玄空飛星 · 陰盤奇門';
  host.appendChild(foot);
  document.body.appendChild(host);
  expandForCapture(host, 708);
  try {
    const dataUrl = await toPng(host, { backgroundColor: '#fbf8f1', pixelRatio: 3, cacheBust: true });
    downloadDataUrl(dataUrl, filename);
  } finally {
    host.remove();
  }
}
