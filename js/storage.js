/* 손맛 — localStorage 저장/로딩 */

const STORAGE_KEY = 'sonmat.state.v1';

function defaultState() {
  return {
    settings: { lastDuration: 25, selectedBait: 'dduckbap' },
    stats: { totalFocusMinutes: 0, totalCatches: 0 },
    collection: {},
    sessionLog: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      settings: Object.assign(base.settings, parsed.settings),
      stats: Object.assign(base.stats, parsed.stats),
      collection: parsed.collection || {},
      sessionLog: Array.isArray(parsed.sessionLog) ? parsed.sessionLog : []
    };
  } catch (e) {
    return defaultState();
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* localStorage 사용 불가 환경 — 조용히 무시 */
  }
}
