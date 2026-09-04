import { useState, useEffect } from 'react';
import { getStar24Method } from './stars24.js';

// 排盤法全域設定的 React hook（跨分頁同步）
export function useStar24Method() {
  const [m, setM] = useState(getStar24Method);
  useEffect(() => {
    const on = () => setM(getStar24Method());
    window.addEventListener('mo-star24-method', on);
    return () => window.removeEventListener('mo-star24-method', on);
  }, []);
  return m;
}
