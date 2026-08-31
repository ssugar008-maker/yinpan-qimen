import React, { useState } from 'react';
import { captureNodeData, captureCombinedData, downloadDataUrl, isIOS } from './exportImage.js';

// 通用「匯出圖片」對話框：勾選內容 → 合併成一張長圖或每項各一張 → 預覽＋下載（iOS 長按圖片儲存）。
export default function ExportDialog({ items, title, subtitle, fileBase = 'moyixue', buttonLabel = '📷 匯出圖片' }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(() => new Set(items.map((i) => i.id)));
  const [mode, setMode] = useState('combined');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // [{ label, dataUrl, filename }]
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = items.filter((i) => sel.has(i.id));
  const close = () => { setOpen(false); setResults(null); };

  const doExport = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      const ts = new Date().toISOString().slice(0, 10);
      const out = [];
      if (mode === 'separate') {
        for (const it of chosen) { // eslint-disable-line no-restricted-syntax
          const node = it.node();
          if (node) out.push({ label: it.label, dataUrl: await captureNodeData(node), filename: `${fileBase}-${it.id}-${ts}.png` }); // eslint-disable-line no-await-in-loop
        }
      } else {
        const sections = chosen.map((it) => ({ label: it.label, node: it.node() })).filter((s) => s.node);
        if (sections.length) out.push({ label: '合併長圖', dataUrl: await captureCombinedData(sections, { title, subtitle }), filename: `${fileBase}-${ts}.png` });
      }
      setResults(out);
      if (!isIOS()) out.forEach((r) => downloadDataUrl(r.dataUrl, r.filename)); // 桌面自動下載；iOS 用預覽長按儲存
    } catch (e) {
      alert('匯出失敗：' + String((e && e.message) || e));
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className="exp-btn" onClick={() => { setSel(new Set(items.map((i) => i.id))); setOpen(true); }}>{buttonLabel}</button>
      {open && !results && (
        <div className="exp-overlay" onClick={close}>
          <div className="exp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="exp-head">匯出圖片</div>
            <div className="exp-sub">選擇要包含的內容，再決定合併或分開：</div>
            <div className="exp-items">
              {items.map((it) => (
                <label key={it.id} className="exp-item">
                  <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggle(it.id)} /> {it.label}
                </label>
              ))}
            </div>
            <div className="exp-mode">
              <label className="exp-item"><input type="radio" name={`exp-mode-${fileBase}`} checked={mode === 'combined'} onChange={() => setMode('combined')} /> 合併成一張長圖</label>
              <label className="exp-item"><input type="radio" name={`exp-mode-${fileBase}`} checked={mode === 'separate'} onChange={() => setMode('separate')} /> 每項各一張</label>
            </div>
            <div className="exp-actions">
              <button type="button" className="ai-btn" onClick={doExport} disabled={busy || !chosen.length}>{busy ? '產生中…' : `產生圖片（${chosen.length} 項）`}</button>
              <button type="button" className="exp-cancel" onClick={close}>取消</button>
            </div>
          </div>
        </div>
      )}
      {open && results && (
        <div className="exp-overlay" onClick={close}>
          <div className="exp-modal exp-result" onClick={(e) => e.stopPropagation()}>
            <div className="exp-head">已產生 {results.length} 張圖片</div>
            <div className="exp-sub">{isIOS() ? '📱 iPhone/iPad：請長按圖片 →「儲存到相片」。' : '已自動下載；也可點下方按鈕重新下載。'}</div>
            <div className="exp-result-list">
              {results.map((r, i) => (
                <div key={i} className="exp-result-item">
                  <div className="exp-result-label">{r.label}</div>
                  <img src={r.dataUrl} alt={r.label} className="exp-result-img" />
                  <button type="button" className="exp-btn" onClick={() => downloadDataUrl(r.dataUrl, r.filename)}>下載 {r.label}</button>
                </div>
              ))}
            </div>
            <div className="exp-actions" style={{ marginTop: 10 }}>
              <button type="button" className="exp-cancel" onClick={() => setResults(null)}>← 重新選擇</button>
              <button type="button" className="exp-cancel" onClick={close}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
