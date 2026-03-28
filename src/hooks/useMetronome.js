import { useState, useEffect, useRef, useCallback } from "react";
import { BEAT_LEVELS, BEAT_LEVEL_VOL, clamp } from "../lib/constants.js";

/* ─── Default beat grid ─── */
export function makeGrid(timeNum, ppb = 1) {
  return Array.from({ length: timeNum * ppb }, (_, i) => ({
    level: i === 0 ? "accent" : i % ppb === 0 ? "beat" : "ghost",
    sound: null,
  }));
}

/* ════════════════════════════════════════════
   WEB AUDIO SOUND ENGINE
   (no Tone.js — works on all browsers/iOS)
════════════════════════════════════════════ */
const SOUND_DEF = {
  click:   { type:"square", freq:1000,  decay:0.035, gain:0.80 },
  wood:    { type:"square", freq:700,   decay:0.060, gain:0.75 },
  rim:     { type:"square", freq:1500,  decay:0.025, gain:0.70 },
  kick:    { type:"sine",   freq:60,    decay:0.180, gain:1.00, sweep:true },
  beep:    { type:"sine",   freq:880,   decay:0.075, gain:0.70 },
  cowbell: { type:"square", freq:540,   decay:0.250, gain:0.60 },
  hat:     { noise:true,               decay:0.040, gain:0.55 },
};

function playSound(ac, noiseBuf, soundId, vol, time) {
  if (!ac || vol <= 0) return;
  const def = SOUND_DEF[soundId] || SOUND_DEF.click;
  const peak = def.gain * vol;
  try {
    const g = ac.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + def.decay);
    g.connect(ac.destination);

    if (def.noise) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const hpf = ac.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 8000;
      src.connect(hpf);
      hpf.connect(g);
      src.start(time);
      src.stop(time + def.decay + 0.01);
    } else {
      const osc = ac.createOscillator();
      osc.type = def.type;
      if (def.sweep) {
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + def.decay);
      } else {
        osc.frequency.value = def.freq;
      }
      osc.connect(g);
      osc.start(time);
      osc.stop(time + def.decay + 0.01);
    }
  } catch {}
}

/* ════════════════════════════════════════════
   MAIN HOOK
════════════════════════════════════════════ */
export function useMetronome() {
  /* ── Audio engine ── */
  const acRef        = useRef(null);
  const noiseBufRef  = useRef(null);
  const timerRef     = useRef(null);
  const isRunningRef = useRef(false);

  /* ── Timing refs (mutated directly, never trigger re-render) ── */
  const nextTimeRef  = useRef(0);
  const pulseRef     = useRef(0);   // absolute pulse count
  const barRef       = useRef(0);
  const gapCycleRef  = useRef(0);
  const bpmRampRef   = useRef(100);

  /* ── React state ── */
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat,      setBeat]      = useState(0);
  const [currentBar,setCurrentBar]= useState(0);
  const [isMuted,   setIsMuted]   = useState(false);

  /* ── Config ── */
  const [cfg, setCfg] = useState({
    bpm:100, timeNum:4, timeDen:4, subId:"quarter", ppb:1, swing:50,
    sound:"click", accentSound:"click", ghostSound:"click",
    polyEnabled:false, polyNum:3, polySound:"wood", polyVol:0.7,
    gapEnabled:false, gapPlay:4, gapSilence:4, gapMode:"full",
    randomMute:0,
    trainerEnabled:false, trainerTarget:140, trainerType:"ramp",
    trainerStairBars:8, trainerStairStep:2,
    voiceCount:false, countIn:false,
    grid: makeGrid(4, 1),
  });

  const cfgRef = useRef(cfg);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  const pulsesPerBar = cfg.timeNum * cfg.ppb;

  /* ── Speech synthesis ── */
  const sayBeat = useCallback((n) => {
    try {
      const u = new SpeechSynthesisUtterance(String(n));
      u.rate = 2.2; u.volume = 0.9; u.lang = "es-ES";
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch {}
  }, []);

  /* ════════════════════════════════════
     LOOKAHEAD SCHEDULER
     (Chris Wilson "Tale of Two Clocks")
  ════════════════════════════════════ */
  const scheduleRef = useRef(null);
  /* Reassigned on every render so it always reads fresh cfg via cfgRef */
  scheduleRef.current = function scheduler() {
    try {
    const ac = acRef.current;
    if (!ac || !isRunningRef.current) return;

    const cc = cfgRef.current;
    const totalPulses = Math.max(1, (cc.timeNum || 4) * (cc.ppb || 1));

    /* Schedule all notes that fall within the next 120 ms — max 32 iterations guard */
    let safetyGuard = 0;
    while (nextTimeRef.current < ac.currentTime + 0.12 && safetyGuard++ < 32) {
      const pulse = pulseRef.current % totalPulses;
      const bar   = barRef.current;
      const time  = nextTimeRef.current;

      /* ── Speed trainer ── */
      if (cc.trainerEnabled) {
        if (cc.trainerType === "ramp") {
          const step = (cc.trainerTarget - cc.bpm) / (totalPulses * 32);
          bpmRampRef.current = clamp(
            bpmRampRef.current + step,
            Math.min(cc.bpm, cc.trainerTarget),
            Math.max(cc.bpm, cc.trainerTarget),
          );
        } else if (cc.trainerType === "stairs" && pulse === 0 && bar > 0 && bar % cc.trainerStairBars === 0) {
          bpmRampRef.current = clamp(bpmRampRef.current + cc.trainerStairStep, 20, 400);
        }
      }

      /* ── Gap click ── */
      const inGap = cc.gapEnabled && gapCycleRef.current >= cc.gapPlay;
      let silent  = inGap;
      if (inGap && cc.gapMode === "beat1")    silent = pulse !== 0;
      if (inGap && cc.gapMode === "offbeat") {
        const half = Math.floor(cc.ppb / 2);
        silent = half > 0 ? (pulse % cc.ppb !== half) : true;
      }

      /* ── Random mute ── */
      if (!silent && cc.randomMute > 0 && Math.random() * 100 < cc.randomMute) silent = true;

      /* ── Main click ── */
      if (!silent) {
        const cell  = cc.grid[pulse] || { level:"beat", sound:null };
        const level = cell.level || "beat";
        const vol   = BEAT_LEVEL_VOL[level] || 0;
        if (vol > 0) {
          const snd = cell.sound || (level === "accent" ? cc.accentSound : level === "ghost" ? cc.ghostSound : cc.sound);
          playSound(ac, noiseBufRef.current, snd, vol, time);
        }
      }

      /* ── Polyrhythm layer ── */
      if (cc.polyEnabled && !silent) {
        const polyStep = totalPulses / cc.polyNum;
        if (pulse % polyStep < 0.01 || Math.abs(pulse % polyStep - polyStep) < 0.01) {
          playSound(ac, noiseBufRef.current, cc.polySound, cc.polyVol * 0.85, time);
        }
      }

      /* ── Voice count ── */
      if (cc.voiceCount && pulse % cc.ppb === 0) {
        const beatNum = Math.floor(pulse / cc.ppb) + 1;
        const d = Math.max(0, (time - ac.currentTime) * 1000);
        setTimeout(() => sayBeat(beatNum), d);
      }

      /* ── UI update (fire when audio actually plays) ── */
      const uiDelay = Math.max(0, (time - ac.currentTime) * 1000);
      const sp = pulse, sb = bar, ss = silent;
      setTimeout(() => {
        if (isRunningRef.current) { setBeat(sp); setCurrentBar(sb); setIsMuted(ss); }
      }, uiDelay);

      /* ── Advance time pointer ── */
      const liveBpm = cc.trainerEnabled ? bpmRampRef.current : cc.bpm;
      const spp = (60 / liveBpm) / cc.ppb;  // seconds per pulse

      let dur = spp;
      if (cc.swing > 50 && cc.ppb >= 2) {
        const r = cc.swing / 50;  // 1.0 – 1.5
        dur = (pulseRef.current % 2 === 0)
          ? spp * (2 * r) / (r + 1)
          : spp * 2       / (r + 1);
      }
      if (!dur || dur <= 0 || !isFinite(dur)) dur = 0.5; // safety: never zero/NaN/Inf
      nextTimeRef.current += dur;

      /* ── Advance counters ── */
      pulseRef.current++;
      if (pulseRef.current % totalPulses === 0) {
        barRef.current++;
        if (cc.gapEnabled) {
          const gapTotal = cc.gapPlay + cc.gapSilence;
          gapCycleRef.current = (gapCycleRef.current + 1) % gapTotal;
        }
      }
    }

    /* Re-run in 25 ms */
    timerRef.current = setTimeout(() => scheduleRef.current?.(), 25);
    } catch(e) { console.error("Scheduler error:", e); }
  };

  /* ── Public: start (synchronous — keeps user gesture for AudioContext) ── */
  const start = useCallback(() => {
    try {
      /* Create AudioContext on first user gesture */
      if (!acRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { console.error("Web Audio API not supported"); return; }
        acRef.current = new AC();
      }
      /* Resume if suspended — fire and forget, don't await */
      if (acRef.current.state === "suspended") {
        acRef.current.resume().catch(() => {});
      }

      /* iOS Safari unlock: play a silent buffer synchronously within user gesture */
      try {
        const unlock = acRef.current.createBufferSource();
        unlock.buffer = acRef.current.createBuffer(1, 1, 22050);
        unlock.connect(acRef.current.destination);
        unlock.start(0);
      } catch(e) {}

      /* Create hi-hat noise buffer (once) */
      if (!noiseBufRef.current) {
        const ac = acRef.current;
        const frames = Math.ceil(ac.sampleRate * 0.05);
        const buf = ac.createBuffer(1, frames, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
        noiseBufRef.current = buf;
      }

      bpmRampRef.current   = cfgRef.current.bpm;
      nextTimeRef.current  = acRef.current.currentTime + 0.05;
      pulseRef.current     = 0;
      barRef.current       = 0;
      gapCycleRef.current  = 0;

      if (timerRef.current) clearTimeout(timerRef.current);
      isRunningRef.current = true;
      scheduleRef.current();   // kick off

      setIsPlaying(true); setBeat(0); setCurrentBar(0); setIsMuted(false);
    } catch(e) {
      console.error("start() error:", e);
    }
  }, []);

  /* ── Public: stop ── */
  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setIsPlaying(false); setBeat(0); setCurrentBar(0); setIsMuted(false);
    pulseRef.current = 0; barRef.current = 0;
  }, []);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      try { acRef.current?.close(); } catch {}
    };
  }, []);

  /* ── Public: update config (object or updater fn) ── */
  const update = useCallback((patch) => {
    setCfg(c => {
      const resolved = typeof patch === "function" ? patch(c) : patch;
      const next = { ...c, ...resolved };
      if (resolved.subId) {
        const ppbMap = { quarter:1, eighth:2, triplet:3, sixteenth:4, quintuplet:5, sextuplet:6 };
        next.ppb = ppbMap[resolved.subId] || 1;
      }
      if (resolved.timeNum || resolved.subId || resolved.ppb) {
        const tNum = resolved.timeNum || next.timeNum;
        next.grid = makeGrid(tNum, next.ppb);
      }
      return next;
    });
  }, []);

  /* ── Reset pulse when time sig / ppb changes while playing ── */
  const prevKeyRef = useRef("");
  useEffect(() => {
    const key = `${cfg.timeNum}-${cfg.ppb}`;
    if (isPlaying && key !== prevKeyRef.current) {
      pulseRef.current = 0;
      barRef.current   = 0;
    }
    prevKeyRef.current = key;
  }, [cfg.timeNum, cfg.ppb, isPlaying]);

  /* ── Tap tempo ── */
  const tapTimestamps = useRef([]);
  const tapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    if (taps.length > 8) taps.splice(0, taps.length - 8);
    if (taps.length < 2) return;
    const recent = taps.filter(t => now - t < 3000);
    tapTimestamps.current = recent;
    if (recent.length < 2) return;
    const intervals = recent.slice(1).map((t, i) => t - recent[i]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    update({ bpm: clamp(Math.round(60000 / avg), 20, 400) });
  }, [update]);

  /* ── Grid cell toggle ── */
  const toggleGridCell = useCallback((idx) => {
    setCfg(c => {
      const grid = c.grid.map((cell, i) => {
        if (i !== idx) return cell;
        const nxt = BEAT_LEVELS[(BEAT_LEVELS.indexOf(cell.level) + 1) % BEAT_LEVELS.length];
        return { ...cell, level: nxt };
      });
      return { ...c, grid };
    });
  }, []);

  const setGridCellSound = useCallback((idx, sound) => {
    setCfg(c => ({
      ...c,
      grid: c.grid.map((cell, i) => i === idx ? { ...cell, sound } : cell),
    }));
  }, []);

  /* ── Current ramp BPM (for display during trainer) ── */
  const getCurrentBpm = useCallback(() => {
    return cfg.trainerEnabled && isPlaying ? Math.round(bpmRampRef.current) : cfg.bpm;
  }, [cfg.bpm, cfg.trainerEnabled, isPlaying]);

  return {
    isPlaying, beat, currentBar, isMuted,
    cfg, update, start, stop,
    tapTempo, toggleGridCell, setGridCellSound, getCurrentBpm,
    pulsesPerBar,
  };
}
