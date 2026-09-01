import React, { useMemo, useState, useEffect, useRef } from 'react';
import { paipan } from '../qimen/engine.js';
import { t, PALACE_NAME, PALACE_SHORT, buildAskPayload, resolveAsk, stemMarkClass, palaceMarkClass } from '../qimen/analysis.js';
import { shiZhuStem } from '../qimen/ask.js';
import { useCloudStore } from '../cloud.js';
import { aiInterpret } from '../ai.js';
import AiText from '../AiText.jsx';

// ── AI 對話問事：用家自然對話提問，於提問時刻起奇門時盤，AI 以對話口吻分析 ──
// 分析口徑與「AI 問事解讀」完全一致（共用 qimen/analysis.js 全鏈：用神／四害／空亡轉宮／應期）。
const GRID5 = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const CHAT_KEY = 'qimen_chat_v1';
const entry = (v) => (typeof v === 'string' ? { messages: [] } : (v || null));

// 迷你九宮格（對話內盤面卡片用）：與主盤同一 color coding ——
// 干：刑紅／墓灰／墓刑紫；門迫綠；宮位標記 破綠／刑紅／墓灰／墓刑紫；事主紅／時干藍／馬星綠圈／空亡小圈；用神宮紫框
function MiniGrid({ result, ysPalaces, shiZhuPalace, shiGanPalace }) {
  return (
    <div className="qc-grid">
      {GRID5.map((p) => {
        const d = result.palaces[p];
        if (!d) return null;
        const isYs = ysPalaces && ysPalaces.includes(p);
        const isVoid = result.kongPalaces.includes(p);
        const isHorse = result.horse.palace === p;
        const tianStems = (d.tianGan || []).map((s, i) => ({ s, type: d.stemMarks?.[i]?.type }));
        const diStart = (d.tianGan || []).length;
        const diStems = [d.diGan, ...(d.diGanExtra ? [d.diGanExtra] : [])].filter(Boolean)
          .map((s, i) => ({ s, type: d.stemMarks?.[diStart + i]?.type }));
        return (
          <div key={p} className={`qc-cell${p === 5 ? ' center' : ''}${isYs ? ' ys' : ''}`}>
            <div className="qc-badges">
              {shiZhuPalace === p && <span className="mk-badge mk-shizhu">事主</span>}
              {shiGanPalace === p && <span className="mk-badge mk-shigan">時干</span>}
              {isHorse && <span className="horse-badge qc-horse">馬</span>}
              {isVoid && <span className="void-circle qc-void" title="空亡" />}
            </div>
            <div className="qc-pal">{PALACE_SHORT[p]}</div>
            {p !== 5 ? (
              <>
                <div className="qc-sym">{t(d.god)}</div>
                <div className="qc-sym">{(d.stars || []).map(t).join('')}</div>
                <div className={`qc-sym qc-door${d.menpo ? ' mk-green' : ''}`}>{t(d.door)}</div>
                <div className="qc-gan">
                  {tianStems.map((x, i) => <span key={'t' + i} className={`qc-stem ${stemMarkClass(x.type)}`}>{t(x.s)}</span>)}
                  <span className="qc-gan-sep">／</span>
                  {diStems.map((x, i) => <span key={'d' + i} className={`qc-stem ${stemMarkClass(x.type)}`}>{t(x.s)}</span>)}
                </div>
                {(d.marks || []).length > 0 && (
                  <div className="qc-marks">{(d.marks || []).map((m) => <span key={m} className={`mark ${palaceMarkClass(m)}`}>{t(m)}</span>)}</div>
                )}
              </>
            ) : <div className="qc-sym">中宮</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function QChat() {
  const [msgs, setMsgs] = useState([]); // { role:'user'|'ai'|'chart', text?, time? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [chartTime, setChartTime] = useState(null); // Date of current chart
  const [qtype, setQtype] = useState('');
  const [chatLib, setChatLib] = useCloudStore('qimen_chat', CHAT_KEY, {});
  const [convId, setConvId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  // 對話設定：語氣（白話＝港式口語／書面＝內地規範書面中文）、詳略、遠程取用神（開盤人／問事人性別）
  // 預設：遠程＋開盤人男（開盤人固定為男性用家本人；別人多數透過遠程問事）。問事人性別按問事者逐次選。
  const QC_SET_KEY = 'mo_qchat_settings_v2';
  const [qcSet, setQcSet] = useState(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(QC_SET_KEY) || '{}'); } catch { }
    return { style: '白話', detail: '適中', mode: '遠程', caster: '男', querent: '', ...saved };
  });
  useEffect(() => { try { localStorage.setItem(QC_SET_KEY, JSON.stringify(qcSet)); } catch { } }, [qcSet]);
  const toggleGender = (key, val) => setQcSet((s) => ({ ...s, [key]: s[key] === val ? '' : val }));
  // 起盤時間：預設此刻；自訂＝對方問問題的原始時辰（上一個時辰問、而家先開盤）。不存本機，屬當次操作
  const [castMode, setCastMode] = useState('now'); // now | custom
  const [castCustom, setCastCustom] = useState('');
  const castTime = () => {
    if (castMode === 'custom' && castCustom) {
      const d = new Date(castCustom);
      if (!isNaN(d)) return d;
    }
    return new Date();
  };

  // 由起盤時間重排盤面（paipan 對同一時間決定性一致）
  const result = useMemo(() => {
    if (!chartTime) return null;
    try {
      return paipan(chartTime.getFullYear(), chartTime.getMonth() + 1, chartTime.getDate(), chartTime.getHours(), chartTime.getMinutes());
    } catch { return null; }
  }, [chartTime]);
  const chartKey = chartTime
    ? `${chartTime.getFullYear()}-${chartTime.getMonth() + 1}-${chartTime.getDate()} ${String(chartTime.getHours()).padStart(2, '0')}:${String(chartTime.getMinutes()).padStart(2, '0')}`
    : '';
  // 事主取宮：近程＝日干落宮；遠程＝月干（開盤人與問事人同性別換陰陽），甲以值符論 —— 與主盤自動標記同一邏輯
  const querent = { mode: qcSet.mode, caster: qcSet.caster, querent: qcSet.querent };
  const shiZhuPalace = result ? ((shiZhuStem(result, querent) || {}).palace ?? null) : null;
  const shiGanPalace = result ? result.pillarMarkPalaces[3] : null;
  const askAnalysis = useMemo(
    () => (result && qtype ? resolveAsk({ result, qtype, querent, shiZhuPalace, shiGanPalace }) : null),
    [result, qtype],
  );

  useEffect(() => { if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  // 存檔（按起盤時間）
  const saveConv = (list, qt, time) => {
    if (!time) return;
    const id = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
    setChatLib((lib) => ({ ...lib, [id]: { messages: list, qtype: qt, ts: Date.now() } }));
  };

  // 對話歷史 → followups 格式（圖表卡片除外）
  const historyOf = (list) => {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].role === 'user') {
        const next = list.slice(i + 1).find((m) => m.role === 'ai');
        if (next) out.push({ q: list[i].text, a: next.text });
      }
    }
    return out.slice(-12);
  };

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setInput(''); setErr(''); setBusy(true);
    let time = chartTime;
    let list = [...msgs, { role: 'user', text: question }];
    // 第一句問題 → 起盤（預設此刻；自訂起盤時間則用對方問問題的原始時辰）
    if (!time) {
      time = castTime();
      list = [...list, { role: 'chart', time: time.toISOString() }];
      setChartTime(time);
      setConvId(`${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
    }
    setMsgs(list);
    try {
      const r0 = result || paipan(time.getFullYear(), time.getMonth() + 1, time.getDate(), time.getHours(), time.getMinutes());
      // 1) 分類（問事類別／閒聊／新話題）
      const cls = await aiInterpret({ task: 'qimenClassify', question, followups: historyOf(list) });
      const c = cls.json || { smalltalk: false, newTopic: true, qtype: '自訂', reply: '' };
      if (c.smalltalk) {
        list = [...list, { role: 'ai', text: c.reply || '你好，想問什麼事？講出來，我起個盤幫你看。' }];
        setMsgs(list); saveConv(list, qtype, time);
        setBusy(false);
        return;
      }
      // 2) 新話題或未分類 → 重新取用神
      const qt = c.qtype || '自訂';
      if (c.newTopic || !qtype) setQtype(qt);
      const useQt = (c.newTopic || !qtype) ? qt : qtype;
      const szp = (shiZhuStem(r0, querent) || {}).palace ?? null;
      const sgp = r0.pillarMarkPalaces[3];
      const ask = buildAskPayload({ result: r0, qtype: useQt, custom: useQt === '自訂' ? question : '', querent, shiZhuPalace: szp, shiGanPalace: sgp });
      // 3) 對話式分析（帶語氣與詳略設定）
      const { text } = await aiInterpret({ task: 'qimenChat', ask, question, followups: historyOf(list), chatStyle: qcSet.style, chatDetail: qcSet.detail });
      list = [...list, { role: 'ai', text }];
      setMsgs(list); saveConv(list, useQt, time);
    } catch (e) {
      setErr(String((e && e.message) || e));
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.focus();
  };

  // 新盤：保留對話，下一條問題起新盤
  const newChart = () => {
    setChartTime(null); setQtype(''); setErr('');
    setMsgs((m) => [...m, { role: 'ai', text: '好，而家幫你起個新盤。想問什麼？' }]);
  };
  // 全新對話
  const newConv = () => {
    setMsgs([]); setChartTime(null); setQtype(''); setConvId(null); setErr('');
  };
  // 載入歷史對話
  const loadConv = (id) => {
    const e = entry(chatLib[id]);
    if (!e || !e.messages) return;
    const time = new Date(id.replace(/(\d{4})-(\d{1,2})-(\d{1,2}) (\d{2}):(\d{2})/, '$1-$2-$3T$4:$5'));
    setMsgs(e.messages); setQtype(e.qtype || ''); setConvId(id);
    setChartTime(isNaN(time) ? null : time);
    setErr('');
  };
  const convList = Object.entries(chatLib)
    .map(([id, v]) => ({ id, ...(entry(v) || {}) }))
    .filter((x) => x.messages && x.messages.length)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 20);

  const ysPalaces = askAnalysis ? askAnalysis.rows.filter((r) => r.palace).map((r) => r.palace) : [];

  return (
    <div className="panel qc">
      <div className="panel-head">AI 對話問事（講出問題，自動起盤）</div>
      <div className="panel-body qc-body">
        <div className="qc-toolbar">
          <button type="button" className="qc-tool-btn" onClick={newChart} disabled={!chartTime}>🔄 起新盤</button>
          <button type="button" className="qc-tool-btn" onClick={newConv} disabled={!msgs.length}>✨ 新對話</button>
          {convList.length > 0 && (
            <select className="qc-hist" value="" onChange={(e) => { if (e.target.value) loadConv(e.target.value); }}>
              <option value="">歷史對話…</option>
              {convList.map((c) => {
                const firstQ = (c.messages.find((m) => m.role === 'user') || {}).text || '';
                return <option key={c.id} value={c.id}>{c.id}｜{firstQ.slice(0, 12)}</option>;
              })}
            </select>
          )}
        </div>

        {/* 對話設定：語氣／詳略／遠程取用神 */}
        <div className="qc-settings">
          <div className="q-group">
            <span className="q-label">語氣</span>
            <div className="seg">
              {['白話', '書面'].map((v) => (
                <button key={v} type="button" className={qcSet.style === v ? 'on' : ''} onClick={() => setQcSet((s) => ({ ...s, style: v }))}
                  title={v === '白話' ? '港式口語，親切隨和' : '內地規範書面中文，正式莊重'}>{v}</button>
              ))}
            </div>
          </div>
          <div className="q-group">
            <span className="q-label">詳略</span>
            <div className="seg">
              {['簡潔', '適中', '詳細'].map((v) => (
                <button key={v} type="button" className={qcSet.detail === v ? 'on' : ''} onClick={() => setQcSet((s) => ({ ...s, detail: v }))}
                  title={v === '簡潔' ? '一針見血，只講結論' : v === '適中' ? '結論＋簡潔依據' : '逐層詳細講解'}>{v}</button>
              ))}
            </div>
          </div>
          <div className="q-group">
            <span className="q-label">問事</span>
            <div className="seg">
              {['近程', '遠程'].map((v) => (
                <button key={v} type="button" className={qcSet.mode === v ? 'on' : ''} onClick={() => setQcSet((s) => ({ ...s, mode: v }))}
                  title={v === '近程' ? '問事人本人在場：日干為事主' : '分享給別人問事：月干取事主（同性別換陰陽）'}>{v}</button>
              ))}
            </div>
          </div>
          {qcSet.mode === '遠程' && (
            <>
              <div className="q-group">
                <span className="q-label">開盤人</span>
                <div className="seg">
                  {['男', '女'].map((v) => <button key={v} type="button" className={qcSet.caster === v ? 'on' : ''} onClick={() => toggleGender('caster', v)}>{v}</button>)}
                </div>
              </div>
              <div className="q-group">
                <span className="q-label">問事人</span>
                <div className="seg">
                  {['男', '女'].map((v) => <button key={v} type="button" className={qcSet.querent === v ? 'on' : ''} onClick={() => toggleGender('querent', v)}>{v}</button>)}
                </div>
              </div>
            </>
          )}
          {chartTime && shiZhuPalace && (
            <span className="q-result">事主落 {PALACE_SHORT[shiZhuPalace]}宮（{qcSet.mode}）</span>
          )}
        </div>

        {/* 起盤時間：預設此刻；自訂＝對方原本問問題的時辰（適用於下一只盤） */}
        <div className="qc-settings qc-cast-row">
          <div className="q-group">
            <span className="q-label">起盤時間</span>
            <div className="seg">
              <button type="button" className={castMode === 'now' ? 'on' : ''} onClick={() => setCastMode('now')} title="以提問當刻起盤">此刻</button>
              <button type="button" className={castMode === 'custom' ? 'on' : ''} onClick={() => setCastMode('custom')} title="對方上一個時辰問的，而家先開盤">自訂</button>
            </div>
          </div>
          {castMode === 'custom' && (
            <input
              type="datetime-local"
              className="qc-cast-input"
              value={castCustom}
              onChange={(e) => setCastCustom(e.target.value)}
              title="對方問問題的原始時間（下一只盤生效）"
            />
          )}
          {castMode === 'custom' && (
            <span className="qc-cast-note">{chartTime ? '下一只盤生效（先「起新盤」再問）' : '第一句問題即按此時間起盤'}</span>
          )}
        </div>
        {qcSet.mode === '遠程' && (!qcSet.caster || !qcSet.querent) && (
          <div className="qc-remote-hint">遠程問事：請先設定開盤人與問事人性別，先至好以月干取事主（未設則暫以日干論）。</div>
        )}

        <div className="qc-msgs">
          {msgs.length === 0 && (
            <div className="qc-empty">
              直接用口語問事，會即時以問事時刻起奇門時盤分析。<br />
              例：「我下個月簽約順唔順？」「佢對我有無意思？」「我個銀包唔見咗，喺邊？」
            </div>
          )}
          {msgs.map((m, i) => {
            if (m.role === 'chart') {
              const ct = new Date(m.time);
              const r = (() => { try { return paipan(ct.getFullYear(), ct.getMonth() + 1, ct.getDate(), ct.getHours(), ct.getMinutes()); } catch { return null; } })();
              return (
                <div key={i} className="qc-chart-card">
                  <div className="qc-chart-head">
                    🀄 已起盤：{ct.getFullYear()}-{String(ct.getMonth() + 1).padStart(2, '0')}-{String(ct.getDate()).padStart(2, '0')} {String(ct.getHours()).padStart(2, '0')}:{String(ct.getMinutes()).padStart(2, '0')}
                    {r ? `　${t(r.dun)}遁${r.ju}局` : ''}{qtype ? `　問事類別：${qtype}` : ''}
                  </div>
                  {r && <MiniGrid result={r} ysPalaces={ysPalaces} shiZhuPalace={shiZhuPalace} shiGanPalace={shiGanPalace} />}
                  {askAnalysis && (
                    <div className="qc-ys">
                      {askAnalysis.rows.filter((x) => x.palace).map((x, j) => (
                        <span key={j} className="qc-ys-chip">{x.disp}→{PALACE_SHORT[x.palace]}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={i} className={`qc-msg ${m.role}`}>
                <div className="qc-bubble">{m.role === 'ai' ? <AiText text={m.text} /> : m.text}</div>
              </div>
            );
          })}
          {busy && <div className="qc-msg ai"><div className="qc-bubble qc-thinking">師傅思考中…</div></div>}
          <div ref={bottomRef} />
        </div>

        {err && <div className="ai-error">{err}</div>}
        <div className="qc-input-row">
          <input
            ref={inputRef}
            className="qc-input"
            value={input}
            placeholder="講出你想問的事…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            disabled={busy}
          />
          <button type="button" className="fu-send" onClick={send} disabled={busy || !input.trim()}>送出</button>
        </div>
        <div className="sym-combo-note">（第一句問題即以此刻時間起盤；其後追問沿用同一盤，換話題會自動重新取用用神；「起新盤」則以新時刻再排。語氣可選白話／書面，詳略可選簡潔／適中／詳細；遠程問事以月干取事主，與主盤自動標記同一邏輯。分析口徑與「AI 問事解讀」一致）</div>
      </div>
    </div>
  );
}
