import { useState, useEffect, useRef, useCallback } from "react";
import { BEAT_LEVELS, BEAT_LEVEL_VOL, clamp } from "../lib/constants.js";

/* Tiny silent MP3 — forces iOS audio session to "playback" mode (bypasses mute switch) */
const SILENT_MP3 = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqAAAAAAAAAAAAAAAAAAAAAAAAAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAQAAAAAAAAAAbDRuGAAAAAAAAAAAAAAAAAAAAD/4xjEAALAAf+AAACAAJQAP/+MYxA8AAAP/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

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

function playSound(ac, noiseBuf, soundId, vol, time, pitchMult = 1.0) {
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
      hpf.frequency.value = 8000 * pitchMult;
      src.connect(hpf);
      hpf.connect(g);
      src.start(time);
      src.stop(time + def.decay + 0.01);
    } else {
      const osc = ac.createOscillator();
      osc.type = def.type;
      if (def.sweep) {
        osc.frequency.setValueAtTime(150 * pitchMult, time);
        osc.frequency.exponentialRampToValueAtTime(40 * pitchMult, time + def.decay);
      } else {
        osc.frequency.value = def.freq * pitchMult;
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
  const acRef          = useRef(null);
  const noiseBufRef    = useRef(null);
  const timerRef       = useRef(null);
  const isRunningRef   = useRef(false);
  const audioElRef     = useRef(null);  // iOS mute-switch bypass
  const barStartTimeRef = useRef(0);    // exact audio time when current bar started

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
  const [gapCycle,  setGapCycle]  = useState(0);
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
    trainerRampBars:4, trainerRampStep:2,
    countIn:false,
    grid: makeGrid(4, 1),
  });

  const cfgRef = useRef(cfg);
  // Note: cfgRef is updated synchronously inside every setCfg call — no useEffect needed

  const pulsesPerBar = cfg.timeNum * cfg.ppb;


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
          // Step-ramp: bump by trainerRampStep every trainerRampBars bars (at bar start)
          if (pulse === 0 && bar > 0 && bar % (cc.trainerRampBars || 4) === 0) {
            const step = cc.trainerRampStep || 2;
            const dir  = cc.trainerTarget >= cc.bpm ? 1 : -1;
            bpmRampRef.current = clamp(
              bpmRampRef.current + dir * step,
              Math.min(cc.bpm, cc.trainerTarget),
              Math.max(cc.bpm, cc.trainerTarget),
            );
          }
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

      /* ── Compute pulse duration FIRST (needed by polyrhythm) ── */
      const liveBpm = cc.trainerEnabled ? bpmRampRef.current : cc.bpm;
      const spp = (60 / liveBpm) / cc.ppb;  // seconds per pulse (no swing)
      let dur = spp;
      if (cc.swing > 50 && cc.ppb >= 2) {
        const r = cc.swing / 50;
        dur = (pulseRef.current % 2 === 0)
          ? spp * (2 * r) / (r + 1)
          : spp * 2       / (r + 1);
      }
      if (!dur || dur <= 0 || !isFinite(dur)) dur = 0.5;

      /* ── Track bar start time ── */
      if (pulse === 0) barStartTimeRef.current = time;

      /* ── Main click ── */
      if (!silent) {
        const cell  = cc.grid[pulse] || { level:"beat", sound:null };
        const level = cell.level || "beat";
        const vol   = BEAT_LEVEL_VOL[level] || 0;
        if (vol > 0) {
          const snd = cell.sound || (level === "accent" ? cc.accentSound : level === "ghost" ? cc.ghostSound : cc.sound);
          /* Pitch multiplier makes accent/ghost clearly distinguishable beyond just volume */
          const pitch = level === "accent" ? 1.6 : level === "ghost" ? 0.7 : 1.0;
          playSound(ac, noiseBufRef.current, snd, vol, time, pitch);
        }
      }

      /* ── Polyrhythm — time-based, not pulse-counting ── */
      if (cc.polyEnabled && !silent) {
        const barDur = spp * totalPulses;  // full bar in seconds (nominal, no swing)
        for (let p = 0; p < cc.polyNum; p++) {
          const polyTime = barStartTimeRef.current + (p / cc.polyNum) * barDur;
          if (polyTime >= time - 0.001 && polyTime < time + dur - 0.001) {
            playSound(ac, noiseBufRef.current, cc.polySound, cc.polyVol * 0.85, polyTime);
          }
        }
      }

      /* ── UI update (fire when audio actually plays) ── */
      const uiDelay = Math.max(0, (time - ac.currentTime) * 1000);
      const sp = pulse, sb = bar, ss = silent, sg = gapCycleRef.current;
      setTimeout(() => {
        if (isRunningRef.current) { setBeat(sp); setCurrentBar(sb); setIsMuted(ss); setGapCycle(sg); }
      }, uiDelay);

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

    /* If safety guard triggered, resync nextTime to now so we don't stay stuck */
    if (safetyGuard >= 32) nextTimeRef.current = ac.currentTime + 0.05;

    /* Re-run in 25 ms */
    timerRef.current = setTimeout(() => scheduleRef.current?.(), 25);
    } catch(e) { console.error("Scheduler error:", e); }
  };

  /* ── Public: start ── */
  const start = useCallback(() => {
    try {
      /* iOS mute-switch bypass: <audio> element forces playback audio session */
      try {
        if (!audioElRef.current) {
          audioElRef.current = new Audio(SILENT_MP3);
          audioElRef.current.loop = true;
          audioElRef.current.volume = 0.01;
        }
        audioElRef.current.play().catch(() => {});
      } catch(e) {}

      /* Create AudioContext on first user gesture */
      if (!acRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { console.error("Web Audio API not supported"); return; }
        acRef.current = new AC();
      }
      const ac = acRef.current;

      /* iOS Safari unlock: silent buffer SYNCHRONOUSLY within user gesture */
      try {
        const unlock = ac.createBufferSource();
        unlock.buffer = ac.createBuffer(1, 1, 22050);
        unlock.connect(ac.destination);
        unlock.start(0);
      } catch(e) {}

      /* Create hi-hat noise buffer (once) */
      if (!noiseBufRef.current) {
        const frames = Math.ceil(ac.sampleRate * 0.05);
        const buf = ac.createBuffer(1, frames, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1;
        noiseBufRef.current = buf;
      }

      setIsPlaying(true); setBeat(0); setCurrentBar(0); setGapCycle(0); setIsMuted(false);

      /* Kick off scheduler — wait for context to be running first (critical on iOS) */
      const kickOff = () => {
        bpmRampRef.current    = cfgRef.current.bpm;
        nextTimeRef.current   = ac.currentTime + 0.1;
        barStartTimeRef.current = ac.currentTime + 0.1;
        pulseRef.current      = 0;
        barRef.current        = 0;
        gapCycleRef.current   = 0;
        if (timerRef.current) clearTimeout(timerRef.current);
        isRunningRef.current  = true;
        scheduleRef.current();
      };

      if (ac.state === "suspended") {
        ac.resume().then(kickOff).catch(kickOff);
      } else {
        kickOff();
      }
    } catch(e) {
      console.error("start() error:", e);
    }
  }, []);

  /* ── Public: stop ── */
  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    try { if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.currentTime = 0; } } catch(e) {}
    setIsPlaying(false); setBeat(0); setCurrentBar(0); setGapCycle(0); setIsMuted(false);
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
      cfgRef.current = next;  // sync — scheduler sees changes immediately
      return next;
    });
  }, []);

  /* ── Reset pulse + resync clock when time sig / ppb changes while playing ── */
  const prevKeyRef = useRef("");
  useEffect(() => {
    const key = `${cfg.timeNum}-${cfg.ppb}`;
    if (isPlaying && key !== prevKeyRef.current && prevKeyRef.current !== "") {
      pulseRef.current        = 0;
      barRef.current          = 0;
      gapCycleRef.current     = 0;
      if (acRef.current) {
        const t = acRef.current.currentTime + 0.05;
        nextTimeRef.current      = t;
        barStartTimeRef.current  = t;
      }
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
      const next = { ...c, grid };
      cfgRef.current = next;
      return next;
    });
  }, []);

  const setGridCellSound = useCallback((idx, sound) => {
    setCfg(c => {
      const next = { ...c, grid: c.grid.map((cell, i) => i === idx ? { ...cell, sound } : cell) };
      cfgRef.current = next;
      return next;
    });
  }, []);

  /* ── Current ramp BPM (for display during trainer) ── */
  const getCurrentBpm = useCallback(() => {
    return cfg.trainerEnabled && isPlaying ? Math.round(bpmRampRef.current) : cfg.bpm;
  }, [cfg.bpm, cfg.trainerEnabled, isPlaying]);

  return {
    isPlaying, beat, currentBar, gapCycle, isMuted,
    cfg, update, start, stop,
    tapTempo, toggleGridCell, setGridCellSound, getCurrentBpm,
    pulsesPerBar,
  };
}
