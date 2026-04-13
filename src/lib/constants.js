/* ─── TIME ─── */
export const getToday = () => new Date().toISOString().split("T")[0];
export const getTodayIdx = () => (new Date().getDay() + 6) % 7; // Mon=0

export const DAYS       = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
export const DAYS_FULL  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

/* ─── METRONOME ─── */
export const SUBDIVISIONS = [
  { id:"quarter",   label:"♩",  name:"Negras",         toneInterval:"4n",  ppb:1 },
  { id:"eighth",    label:"♫",  name:"Corcheas",        toneInterval:"8n",  ppb:2 },
  { id:"triplet",   label:"³",  name:"Tresillos",       toneInterval:"8t",  ppb:3 },
  { id:"sixteenth", label:"𝅘𝅥𝅯",name:"Semicorcheas",   toneInterval:"16n", ppb:4 },
  { id:"quintuplet",label:"⁵",  name:"Quintillos",      toneInterval:"4n",  ppb:5 },
  { id:"sextuplet", label:"⁶",  name:"Seisillo",        toneInterval:"4n",  ppb:6 },
];

export const BEAT_LEVELS = ["accent","beat","ghost","mute"];
export const BEAT_LEVEL_VOL = { accent:1.0, beat:0.55, ghost:0.18, mute:0 };

export const SOUNDS = [
  { id:"click",   label:"Click",    desc:"Clásico" },
  { id:"wood",    label:"Wood",     desc:"Madera" },
  { id:"hat",     label:"Hi-Hat",   desc:"Platillo" },
  { id:"rim",     label:"Rim",      desc:"Aro" },
  { id:"kick",    label:"Kick",     desc:"Bombo" },
  { id:"beep",    label:"Beep",     desc:"Digital" },
  { id:"cowbell", label:"Cowbell",  desc:"Cencerro" },
];

export const GAP_MODES = [
  { id:"full",    label:"Silencio total",        desc:"Click → silencio completo" },
  { id:"beat1",   label:"Solo beat 1",           desc:"Click → solo el primer tiempo" },
  { id:"offbeat", label:"Contratiempo",          desc:"Click se mueve al contratiempo" },
];

/* ─── DEFAULTS ─── */
export const DEFAULT_CATEGORIES = [
  { id:"cat-1", name:"Movilidad Manos",   color:"#f59e0b" },
  { id:"cat-2", name:"Pies / Bombo",      color:"#3b82f6" },
  { id:"cat-3", name:"Movilidad Batería", color:"#8b5cf6" },
  { id:"cat-4", name:"Fills",             color:"#ef4444" },
  { id:"cat-5", name:"Grooves",           color:"#22c55e" },
  { id:"cat-6", name:"Canciones",         color:"#ec4899" },
];

export const DEFAULT_DATA = {
  categories:    DEFAULT_CATEGORIES,
  exercises:     [],
  fills:         [],
  songs:         [],
  schedule:      { 0:["cat-1"],1:["cat-3"],2:["cat-2"],3:["cat-1"],4:["cat-4","cat-5"],5:["cat-6"],6:[] },
  routines:      [],             // [{id, name, blocks:[{id,type,refId?,bars?,seconds?,label?}]}]
  routineBlocks: [],             // legacy — migrado automáticamente al abrir
  metroPresets:  [],
  settings: {
    restBetweenExercises: 10,
    warmUpBars: 4,
    lastBpmIncrementDate: null,
  },
  stats: { bestStreak: 0 },
};

/* ─── HELPERS ─── */
export const uid   = () => Math.random().toString(36).slice(2,10);
export const clamp = (v,lo,hi) => Math.max(lo, Math.min(hi, v));

export const fmtDur = (s) => {
  s = Math.round(s);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s/60), sec = s%60;
  if (m < 60) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  return `${Math.floor(m/60)}h ${m%60}m`;
};

export const calcStreak = (logs) => {
  const dates = [...new Set(logs.map(l=>l.date))].sort().reverse();
  if (!dates.length) return 0;
  let streak = 0;
  const check = new Date(); check.setHours(0,0,0,0);
  const todayStr = getToday();
  if (!dates.includes(todayStr)) check.setDate(check.getDate()-1);
  for (let i=0; i<365; i++) {
    if (dates.includes(check.toISOString().split("T")[0])) {
      streak++; check.setDate(check.getDate()-1);
    } else break;
  }
  return streak;
};

export const calcWeekCompletion = (data, logs) => {
  const r = []; const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - getTodayIdx()); mon.setHours(0,0,0,0);
  for (let i=0; i<7; i++) {
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    const ds = d.toISOString().split("T")[0];
    const cats = data.schedule[i]||[];
    if (!cats.length) { r.push("rest"); continue; }
    const done = logs.filter(l=>l.date===ds).map(l=>l.categoryId);
    r.push(cats.every(c=>done.includes(c))?"done":cats.some(c=>done.includes(c))?"partial":"pending");
  }
  return r;
};
