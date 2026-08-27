import React, { useState } from 'react';
import { aiInterpret } from './ai.js';

// 追問對話（多輪）：附在任何 AI 解讀之後。
// basePayload＝原解讀的完整 task payload（伺服器端會用它重建盤面上下文）；
// thread＝[{q,a}] 歷史問答（由父層隨解讀一併存檔）；onAppend({q,a}) 由父層負責保存。
export default function FollowUpChat({ basePayload, thread = [], onAppend, placeholder = '追問：就這個解讀再問下去…' }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true); setErr('');
    try {
      const { text } = await aiInterpret({ ...basePayload, question, followups: thread });
      onAppend({ q: question, a: text });
      setQ('');
    } catch (e) { setErr(String((e && e.message) || e)); }
    setBusy(false);
  };
  return (
    <div className="fu">
      {thread.length > 0 && (
        <div className="fu-thread">
          {thread.map((m, i) => (
            <div key={i} className="fu-pair">
              <div className="fu-q"><span className="fu-tag">問</span>{m.q}</div>
              <div className="fu-a"><span className="fu-tag">答</span>{m.a}</div>
            </div>
          ))}
        </div>
      )}
      <div className="fu-input-row">
        <input
          className="fu-input"
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
        />
        <button type="button" className="fu-send" onClick={ask} disabled={busy || !q.trim()}>
          {busy ? '…' : '追問'}
        </button>
      </div>
      {err && <div className="ai-error">{err}</div>}
    </div>
  );
}
