import { useCloudStore } from './cloud.js';

// 我的命盤庫：跨裝置（雲端）＋本機保存多個盤。
// 每個盤：{ id, name, type: 'qimen'|'xuankong'|'indoor', state, ts }
export function useChartLibrary() {
  const [charts, setCharts, cloudOn] = useCloudStore('charts', 'mo_charts_v1', []);
  const save = (entry) => setCharts((list) => [{ ...entry, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now() }, ...list]);
  const remove = (id) => setCharts((list) => list.filter((c) => c.id !== id));
  const rename = (id, name) => setCharts((list) => list.map((c) => (c.id === id ? { ...c, name } : c)));
  return { charts, save, remove, rename, cloudOn };
}

// 觸發載入某盤：切換分頁 + 把 state 傳給該分頁還原
export function loadChart(chart) {
  try { localStorage.setItem('mo_load_chart', JSON.stringify(chart)); } catch {}
  window.dispatchEvent(new CustomEvent('mo-load-chart', { detail: chart }));
}
