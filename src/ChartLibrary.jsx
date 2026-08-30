import React from 'react';
import { loadChart } from './library.js';

const TYPE_LABEL = { qimen: '奇門', xuankong: '玄空', indoor: '室內' };

// 我的命盤庫（彈窗）：列出已存盤，可載入／刪除。存盤由各分頁的「💾 存盤」按鈕觸發。
export default function ChartLibrary({ charts, onRemove, onClose, cloudOn }) {
  return (
    <div className="lib-overlay" onClick={onClose}>
      <div className="lib-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lib-head">
          <span>我的命盤庫（{charts.length}）</span>
          <span className={`cloud-dot ${cloudOn ? 'on' : 'off'}`}>{cloudOn ? '雲端' : '本機'}</span>
          <button type="button" className="lib-close" onClick={onClose}>✕</button>
        </div>
        {charts.length === 0 && (
          <div className="lib-empty">尚未儲存任何盤。<br />在各分頁點「💾 存盤」，即可把目前的盤（含坐向／時間／平面圖）存到這裡，跨裝置保留。</div>
        )}
        <div className="lib-list">
          {charts.map((c) => (
            <div key={c.id} className="lib-row">
              <div className="lib-row-main">
                <span className={`lib-type lib-type-${c.type}`}>{TYPE_LABEL[c.type] || c.type}</span>
                <div className="lib-name-wrap">
                  <div className="lib-name">{c.name}</div>
                  {c.desc ? <div className="lib-desc">{c.desc}</div> : null}
                </div>
              </div>
              <div className="lib-row-actions">
                <button type="button" className="lib-load" onClick={() => { loadChart(c); onClose(); }}>載入</button>
                <button type="button" className="lib-del" onClick={() => { if (window.confirm(`刪除「${c.name}」？`)) onRemove(c.id); }}>刪</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
