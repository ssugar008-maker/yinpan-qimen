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
  const [chatLib, setChatLib, chatCloudOn] = useCloudStore('qimen_chat', CHAT_KEY, {});
  const [convId, setConvId] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  // 對話設定：界面（簡易＝給唔識嘅人：只揀語氣同詳略，固定近程此刻起盤；專業＝全部選項）、
  // 語氣（白話＝港式口語／書面＝內地規範書面中文）、詳略、遠程取用神（開盤人／問事人性別）
  // 預設：簡易界面（分享出去嘅人用得）；專業界面預設遠程＋開盤人男（用家本人為男性開盤者）
  const QC_SET_KEY = 'mo_qchat_settings_v2';
  const [qcSet, setQcSet] = useState(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(QC_SET_KEY) || '{}'); } catch { }
    return { ui: 'simple', style: '白話', detail: '適中', mode: '遠程', caster: '男', querent: '', ...saved };
  });
  useEffect(() => { try { localStorage.setItem(QC_SET_KEY, JSON.stringify(qcSet)); } catch { } }, [qcSet]);
  const toggleGender = (key, val) => setQcSet((s) => ({ ...s, [key]: s[key] === val ? '' : val }));
  const isPro = qcSet.ui === 'pro';
  // 起盤時間：預設此刻；自訂＝對方問問題的原始時辰（上一個時辰問、而家先開盤）。不存本機，屬當次操作
  const [castMode, setCastMode] = useState('now'); // now | custom
  const [castCustom, setCastCustom] = useState('');
  // 取數起局（梅花報數）：同一時辰多人問事，以對方所報之數定局（1-9 循環）；空＝正規時盤
  const [castNum, setCastNum] = useState('');
  const [chartJu, setChartJu] = useState(null); // 起盤時取定的局數覆蓋（null＝正規）
  const castTime = () => {
    if (isPro && castMode === 'custom' && castCustom) { // 簡易界面固定此刻起盤
      const d = new Date(castCustom);
      if (!isNaN(d)) return d;
    }
    return new Date();
  };
  const castJuNow = () => {
    if (!isPro) return null; // 簡易界面固定正規時盤
    const n = parseInt(castNum, 10);
    if (isNaN(n) || n < 1) return null;
    return ((n - 1) % 9) + 1; // 報數 1-9 對應 1-9 局，大於 9 循環
  };

  // 由起盤時間重排盤面（paipan 對同一時間決定性一致）；chartJu 為起盤時的取數起局
  const result = useMemo(() => {
    if (!chartTime) return null;
    try {
      return paipan(chartTime.getFullYear(), chartTime.getMonth() + 1, chartTime.getDate(), chartTime.getHours(), chartTime.getMinutes(), chartJu ?? undefined);
    } catch { return null; }
  }, [chartTime, chartJu]);
  const chartKey = chartTime
    ? `${chartTime.getFullYear()}-${chartTime.getMonth() + 1}-${chartTime.getDate()} ${String(chartTime.getHours()).padStart(2, '0')}:${String(chartTime.getMinutes()).padStart(2, '0')}`
    : '';
  // 事主取宮：近程＝日干落宮；遠程＝月干（開盤人與問事人同性別換陰陽），甲以值符論 —— 與主盤自動標記同一邏輯
  // 簡易界面固定近程（問事者本人問）；專業界面跟設定
  const querent = { mode: isPro ? qcSet.mode : '近程', caster: qcSet.caster, querent: qcSet.querent };
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
    // 第一句問題 → 起盤（預設此刻；自訂起盤時間則用對方問問題的原始時辰；有報數則取數起局）
    if (!time) {
      time = castTime();
      list = [...list, { role: 'chart', time: time.toISOString(), ju: castJuNow() }];
      setChartTime(time);
      setChartJu(castJuNow());
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

  // 新盤：保留對話，下一條問題起新盤（時間／取數以當時設定為準）
  const newChart = () => {
    setChartTime(null); setChartJu(null); setQtype(''); setErr('');
    setMsgs((m) => [...m, { role: 'ai', text: '好，而家幫你起個新盤。想問什麼？' }]);
  };
  // 全新對話
  const newConv = () => {
    setMsgs([]); setChartTime(null); setChartJu(null); setQtype(''); setConvId(null); setErr('');
  };
  // 載入歷史對話
  const loadConv = (id) => {
    const e = entry(chatLib[id]);
    if (!e || !e.messages) return;
    const time = new Date(id.replace(/(\d{4})-(\d{1,2})-(\d{1,2}) (\d{2}):(\d{2})/, '$1-$2-$3T$4:$5'));
    setMsgs(e.messages); setQtype(e.qtype || ''); setConvId(id);
    setChartTime(isNaN(time) ? null : time);
    const chartMsg = e.messages.find((m) => m.role === 'chart');
    setChartJu(chartMsg && chartMsg.ju != null ? chartMsg.ju : null);
    setErr('');
  };
  const convList = Object.entries(chatLib)
    .map(([id, v]) => ({ id, ...(entry(v) || {}) }))
    .filter((x) => x.messages && x.messages.length)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 20);

  const ysPalaces = askAnalysis ? askAnalysis.rows.filter((r) => r.palace).map((r) => r.palace) : [];

  // 語音輸入（Web Speech API；Android Chrome 支援，iOS 未必）——辨識結果附加到輸入框
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);
  const speechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const toggleListen = () => {
    if (listening) { try { recogRef.current && recogRef.current.stop(); } catch { } return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'yue-Hant-HK'; // 粵語（香港）；瀏覽器不支援會自行回退預設語言
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const txt = (e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
      if (txt) setInput((v) => (v ? `${v} ${txt}` : txt));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  // 白話 → 規範書面中文（內地可讀）：轉換結果存入訊息並隨對話存檔
  const [translating, setTranslating] = useState(-1);
  const translateMsg = async (i) => {
    const m = msgs[i];
    if (!m || m.role !== 'ai') return;
    if (m.std) { // 已有譯文 → 切換原文／書面
      setMsgs((list) => list.map((x, j) => (j === i ? { ...x, showStd: !x.showStd } : x)));
      return;
    }
    setTranslating(i);
    try {
      const { text } = await aiInterpret({ task: 'toStdChinese', text: m.text });
      setMsgs((list) => {
        const next = list.map((x, j) => (j === i ? { ...x, std: text, showStd: true } : x));
        saveConv(next, qtype, chartTime);
        return next;
      });
    } catch (e) { setErr(String((e && e.message) || e)); }
    setTranslating(-1);
  };

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
          <span className={`cloud-dot ${chatCloudOn ? 'on' : 'off'}`} title={chatCloudOn ? '雲端同步中：其他設備都睇到' : '只存本機：其他設備睇唔到（請喺 Vercel 連接 KV 資料庫）'}>{chatCloudOn ? '雲端同步' : '本機'}</span>
        </div>

        {/* 對話設定：界面（簡易／專業）＋語氣／詳略；遠程取用神等進階選項只喺專業界面顯示 */}
        <div className="qc-settings">
          <div className="q-group">
            <span className="q-label">界面</span>
            <div className="seg">
              <button type="button" className={!isPro ? 'on' : ''} onClick={() => setQcSet((s) => ({ ...s, ui: 'simple' }))} title="簡易：只揀語氣同詳略，固定近程此刻起盤">簡易</button>
              <button type="button" className={isPro ? 'on' : ''} onClick={() => setQcSet((s) => ({ ...s, ui: 'pro' }))} title="專業：遠程取用神、起盤時間、取數起局等全部選項">專業</button>
            </div>
          </div>
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
          {isPro && (
            <div className="q-group">
              <span className="q-label">問事</span>
              <div className="seg">
                {['近程', '遠程'].map((v) => (
                  <button key={v} type="button" className={qcSet.mode === v ? 'on' : ''} onClick={() => setQcSet((s) => ({ ...s, mode: v }))}
                    title={v === '近程' ? '問事人本人在場：日干為事主' : '分享給別人問事：月干取事主（同性別換陰陽）'}>{v}</button>
                ))}
              </div>
            </div>
          )}
          {isPro && qcSet.mode === '遠程' && (
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
          {isPro && chartTime && shiZhuPalace && (
            <span className="q-result">事主落 {PALACE_SHORT[shiZhuPalace]}宮（{qcSet.mode}）</span>
          )}
        </div>

        {/* 起盤時間＋取數起局（只限專業界面） */}
        {isPro && (
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
            <div className="q-group">
              <span className="q-label">取數起局</span>
              <input
                type="number"
                min="1"
                className="qc-num-input"
                value={castNum}
                placeholder="報數"
                title="同一時辰多人問事：對方隨口報一個數，以數定局（1-9 循環，陰陽遁仍依節氣）；留空＝正規時盤"
                onChange={(e) => setCastNum(e.target.value)}
              />
            </div>
            {castNum && parseInt(castNum, 10) >= 1 && (
              <span className="qc-cast-note">取數 {castNum} → {((parseInt(castNum, 10) - 1) % 9) + 1} 局{chartTime ? '（下一只盤生效）' : ''}</span>
            )}
          </div>
        )}
        {isPro && qcSet.mode === '遠程' && (!qcSet.caster || !qcSet.querent) && (
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
              const r = (() => { try { return paipan(ct.getFullYear(), ct.getMonth() + 1, ct.getDate(), ct.getHours(), ct.getMinutes(), m.ju ?? undefined); } catch { return null; } })();
              return (
                <div key={i} className="qc-chart-card">
                  <div className="qc-chart-head">
                    🀄 已起盤：{ct.getFullYear()}-{String(ct.getMonth() + 1).padStart(2, '0')}-{String(ct.getDate()).padStart(2, '0')} {String(ct.getHours()).padStart(2, '0')}:{String(ct.getMinutes()).padStart(2, '0')}
                    {r ? `　${t(r.dun)}遁${r.ju}局` : ''}{m.ju != null ? `（取數起局）` : ''}{qtype ? `　問事類別：${qtype}` : ''}
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
                <div className="qc-bubble">
                  {m.role === 'ai' ? <AiText text={m.showStd && m.std ? m.std : m.text} /> : m.text}
                  {m.role === 'ai' && (
                    <button
                      type="button"
                      className={`qc-std-btn${m.showStd ? ' on' : ''}`}
                      onClick={() => translateMsg(i)}
                      disabled={translating === i}
                      title="白話 ↔ 規範書面中文（內地可讀）"
                    >
                      {translating === i ? '轉換中…' : m.showStd ? '原文' : m.std ? '書面' : '譯書面'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {busy && <div className="qc-msg ai"><div className="qc-bubble qc-thinking">師傅思考中…</div></div>}
          <div ref={bottomRef} />
        </div>

        {err && <div className="ai-error">{err}</div>}
        <div className="qc-input-row">
          <textarea
            ref={inputRef}
            className="qc-input qc-textarea"
            value={input}
            placeholder="講出你想問的事…"
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; // 自動長高，最長 140px
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} // Enter 送出，Shift+Enter 換行
            disabled={busy}
          />
          {speechSupported && (
            <button
              type="button"
              className={`qc-mic${listening ? ' on' : ''}`}
              onClick={toggleListen}
              title={listening ? '聽緊…再撳停止' : '語音輸入（粵語）'}
            >{listening ? '⏹' : '🎤'}</button>
          )}
          <button type="button" className="fu-send" onClick={send} disabled={busy || !input.trim()}>送出</button>
        </div>
        <div className="sym-combo-note">（第一句問題即以此刻時間起盤；其後追問沿用同一盤，換話題會自動重新取用用神；「起新盤」則以新時刻再排。語氣可選白話／書面，詳略可選簡潔／適中／詳細；遠程問事以月干取事主，與主盤自動標記同一邏輯。分析口徑與「AI 問事解讀」一致）</div>
      </div>
    </div>
  );
}
