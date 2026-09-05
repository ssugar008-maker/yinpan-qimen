import { useState, useEffect } from 'react';

// 天星向首（日照最強方向／納光口）全域設定：二十四天星跟佢起盤（唔跟羅盤坐向）。
// 喺「室內」分頁設定；玄空分頁＋風水 AI 分頁嘅二十四天星都用佢，保證一致。
const KEY = 'mo_star_face';
export const getStarFace = () => {
  try {
    const v = localStorage.getItem(KEY);
    if (v == null || v === '') return null;
    const d = parseFloat(v);
    return isNaN(d) ? null : d;
  } catch { return null; }
};
export const setStarFace = (deg) => {
  try { if (deg == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(deg)); } catch { }
  try { window.dispatchEvent(new Event('mo-star-face')); } catch { }
};
export function useStarFace() {
  const [d, setD] = useState(getStarFace);
  useEffect(() => {
    const on = () => setD(getStarFace());
    window.addEventListener('mo-star-face', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('mo-star-face', on); window.removeEventListener('storage', on); };
  }, []);
  return d;
}
