import React, { useState, useRef, useEffect } from 'react';
import { aiInterpret } from './ai.js';
import AiText from './AiText.jsx';

// 風水 AI 顧問（多輪對話）：玄空飛星＋二十四天星＋室內佈局。
// basePayload＝xkChat 完整上下文（chart/star24/indoor，伺服器端用它重建盤面）；
// thread＝[{q,a}] 歷史問答（父層隨坐向/佈局存檔）；onAppend({q,a}) 由父層保存。
export default function FengshuiChat({ basePayload, thread = [], onAppend, onClear, examples = [], placeholder = '問顏色、材質、傢俬電器擺位、房間用途…' }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const listRef = useRef(null);
  const taRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [thread.length, busy]);
  // textarea 自動增高
  useEffect(() => { const t = taRef.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; } }, [q]);

  const ask = async (text) => {
    const question = String(text != null ? text : q).trim();
    if (!question || busy || !basePayload) return;
    setBusy(true); setErr('');
    try {
      const { text: ans } = await aiInterpret({ ...basePayload, question, followups: thread });
      onAppend({ q: question, a: ans });
      setQ('');
    } catch (e) { setErr(String((e && e.message) || e)); }
    setBusy(false);
  };

  return (
    <div className="fschat">
      <div className="qc-msgs fschat-msgs" ref={listRef}>
        {thread.length === 0 && !busy && (
          <div className="qc-empty">
            <div>直接同 AI 顧問對話 —— 佢已經睇到呢間屋嘅玄空盤、二十四天星同你標注嘅房間。</div>
            {examples.length > 0 && (
              <div className="fschat-examples">
                {examples.map((ex) => (
                  <button key={ex} type="button" className="fschat-ex-chip" onClick={() => ask(ex)}>{ex}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {thread.map((m, i) => (
          <React.Fragment key={i}>
            <div className="qc-msg user"><div className="qc-bubble">{m.q}</div></div>
            <div className="qc-msg ai"><div className="qc-bubble"><AiText text={m.a} /></div></div>
          </React.Fragment>
        ))}
        {busy && <div className="qc-msg ai"><div className="qc-bubble qc-thinking">顧問分析中…</div></div>}
      </div>
      <div className="qc-input-row">
        <textarea
          ref={taRef}
          className="qc-input fschat-input"
          rows={1}
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
        />
        <button type="button" className="fu-send" onClick={() => ask()} disabled={busy || !q.trim() || !basePayload}>
          {busy ? '…' : '送出'}
        </button>
        {thread.length > 0 && onClear && (
          <button type="button" className="qc-tool-btn" onClick={onClear} title="清空呢個對話">🗑</button>
        )}
      </div>
      {err && <div className="ai-error">{err}</div>}
    </div>
  );
}
