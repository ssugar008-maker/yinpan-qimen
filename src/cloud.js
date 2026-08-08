// 雲端同步儲存：AI 分析結果跨裝置保存。
// 後端為 Vercel KV（Upstash Redis REST）；未設定環境變數時自動回退 localStorage（本機仍可用）。
// 策略：localStorage 為即時快取，雲端為共享儲存；掛載時拉取較新者，保存時同時寫本地＋背景推送雲端。
import { useState, useEffect, useRef, useCallback } from 'react';

const tsKey = (k) => `${k}__ts`;
const isEmptyVal = (v) => v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);

export async function cloudPull(ns) {
  try {
    const r = await fetch(`/api/library?ns=${encodeURIComponent(ns)}`);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d && typeof d === 'object' ? d : null; // { updatedAt, data }
  } catch { return null; }
}
export async function cloudPush(ns, data, updatedAt) {
  try {
    await fetch('/api/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ns, updatedAt: updatedAt || Date.now(), data }),
    });
  } catch { /* 離線或未設定則略過，本地仍保存 */ }
}

// useCloudStore(ns, localKey, defaultValue) → [value, setValue, cloudOn]
export function useCloudStore(ns, localKey, defaultValue) {
  const [value, setValue] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(localKey)); return v == null ? defaultValue : v; } catch { return defaultValue; }
  });
  const [cloudOn, setCloudOn] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let alive = true;
    (async () => {
      const cloud = await cloudPull(ns);
      if (!alive) return;
      if (!cloud) { setCloudOn(false); return; } // 未設定雲端 → 純本機
      setCloudOn(true);
      const localTs = +(localStorage.getItem(tsKey(localKey)) || 0);
      const cloudTs = cloud.updatedAt || 0;
      if (cloud.data != null && cloudTs > localTs) {
        // 雲端較新 → 採用雲端（跨裝置同步下來）
        setValue(cloud.data);
        try { localStorage.setItem(localKey, JSON.stringify(cloud.data)); localStorage.setItem(tsKey(localKey), String(cloudTs)); } catch { }
      } else if (!isEmptyVal(valueRef.current) && localTs > cloudTs) {
        // 本地較新（含雲端尚空）→ 推送本地到雲端（初始遷移／離線補傳）
        cloudPush(ns, valueRef.current, localTs);
      }
    })();
    return () => { alive = false; };
  }, [ns, localKey]);

  const set = useCallback((updater) => {
    setValue((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const now = Date.now();
      try { localStorage.setItem(localKey, JSON.stringify(next)); localStorage.setItem(tsKey(localKey), String(now)); } catch { }
      cloudPush(ns, next, now); // 背景推送，不阻塞 UI
      return next;
    });
  }, [ns, localKey]);

  return [value, set, cloudOn];
}
