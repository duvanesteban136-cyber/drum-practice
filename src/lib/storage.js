import { DEFAULT_DATA } from "./constants.js";

const KEYS = {
  data: "dp-data-v3",
  logs: "dp-logs-v2",
};

export function loadData() {
  try {
    const raw = localStorage.getItem(KEYS.data);
    if (raw) {
      const d = JSON.parse(raw);
      // Merge missing top-level keys from DEFAULT_DATA
      return {
        ...DEFAULT_DATA,
        ...d,
        settings: { ...DEFAULT_DATA.settings, ...(d.settings||{}) },
        stats:    { ...DEFAULT_DATA.stats,    ...(d.stats||{}) },
      };
    }
    // migrate v2 → v3
    const old = localStorage.getItem("drum-practice-data-v2");
    if (old) {
      const d = JSON.parse(old);
      const migrated = { ...DEFAULT_DATA, ...d, settings:{...DEFAULT_DATA.settings,...(d.settings||{})}, songs:[], routineBlocks:[], metroPresets:[], stats:{bestStreak:0} };
      saveData(migrated);
      return migrated;
    }
  } catch(e) {
    console.warn("loadData failed:", e);
  }
  return structuredClone(DEFAULT_DATA);
}

export function saveData(d) {
  try { localStorage.setItem(KEYS.data, JSON.stringify(d)); } catch(e) { console.warn("saveData failed:", e); }
}

export function loadLogs() {
  try { return JSON.parse(localStorage.getItem(KEYS.logs)||"[]"); } catch { return []; }
}

export function saveLogs(l) {
  try { localStorage.setItem(KEYS.logs, JSON.stringify(l.slice(-500))); } catch(e) { console.warn("saveLogs failed:", e); }
}
