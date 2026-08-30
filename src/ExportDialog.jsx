import React, { useState } from 'react';
import { captureNode, captureCombined } from './exportImage.js';

// 通用「匯出圖片」對話框。
// items: [{ id, label, node: () => HTMLElement|null }]（node() 回傳要擷取的 DOM 元素）
// 可選每項各一張，或合併成一張直向長圖。
export default function ExportDialog({ items, title, subtitle, fileBase = 'moyixue', buttonLabel = '📷 匯出圖片' }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(() => new Set(items.map((i) => i.id)));
  const [mode, setMode] = useState('combined');
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = items.filter((i) => sel.has(i.id));

  const doExport = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      const ts = new Date().toISOString().slice(0, 10);
      if (mode === 'separate') {
        for (const it of chosen) {
          const node = it.node();
          if (node) await captureNode(node, `${fileBase}-${it.id}-${ts}.png`); // eslint-disable-line no-await-in-loop
        }
      } else {
        const sections = chosen.map((it) => ({ label: it.label, node: it.node() })).filter((s) => s.node);
        if (sections.length) await captureCombined(sections, `${fileBase}-${ts}.png`, { title, subtitle });
      }
      setOpen(false);
    } catch (e) {
      alert('匯出失敗：' + String((e && e.message) || e));
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className="exp-btn" onClick={() => { setSel(new Set(items.map((i) => i.id))); setOpen(true); }}>{buttonLabel}</button>
      {open && (
        <div className="exp-overlay" onClick={() => setOpen(false)}>
          <div className="exp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="exp-head">匯出圖片</div>
            <div className="exp-sub">選擇要包含的內容，再決定合併或分開下載：</div>
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
              <button type="button" className="ai-btn" onClick={doExport} disabled={busy || !chosen.length}>{busy ? '產生中…' : `下載圖片（${chosen.length} 項）`}</button>
              <button type="button" className="exp-cancel" onClick={() => setOpen(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
