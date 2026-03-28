import { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import { BEAT_LEVELS, BEAT_LEVEL_VOL, clamp, uid } from "../lib/constants.js";

/* ─── Default beat grid for a given numerator ─── */
export function makeGrid(timeNum, ppb = 1) {
  return Array.from({ length: timeNum * ppb }, (_, i) => ({
    level: i === 0 ? "accent" : i % ppb === 0 ? "beat" : "ghost",
    sound: null, // null = inherit global sound
  }));
}

/* ─── Build all Tone.js sound nodes ─── */
function buildSounds() {
  const dest = Tone.getDestination();
  return {
    click:   new Tone.MembraneSynth({ pitchDecay:.008, octaves:2,   envelope:{attack:.001,decay:.14,sustain:0,release:.04}}).connect(dest),
    wood:    new Tone.MembraneSynth({ pitchDecay:.012, octaves:1.2, envelope:{attack:.001,decay:.07,sustain:0,release:.02}}).connect(dest),
    hat:     new Tone.NoiseSynth({   noise:{type:"white"},          envelope:{attack:.001,decay:.038,sustain:0,release:.01}}).connect(new Tone.Filter(7000,"highpass").connect(dest)),
    rim:     new Tone.MembraneSynth({ pitchDecay:.003, octaves:0.8, envelope:{attack:.001,decay:.045,sustain:0,release:.01}}).connect(dest),
    kick:    new Tone.MembraneSynth({ pitchDecay:.05,  octaves:8,   envelope:{attack:.001,decay:.28, sustain:0,release:.08}}).connect(dest),
    beep:    new Tone.Synth({         oscillator:{type:"sine"},     envelope:{attack:.001,decay:.09, sustain:0,release:.04}}).connect(dest),
    cowbell: new Tone.MetalSynth({    frequency:540, harmonicity:5.1, modulationIndex:32, resonance:4000, octaves:1.5, envelope:{attack:.001,decay:.38,release:.08}}).connect(dest),
  };
}

/* ─── pitch/freq per sound ─── */
const SOUND_NOTE = { click:"C2", wood:"E3", hat:"noise", rim:"G3", kick:"C1", beep:"A4", cowbell:"metal" };

function triggerSound(sounds, soundId, vol, time) {
  if (vol <= 0) return;
  const s = sounds[soundId] || sounds.click;
  const isNoise = soundId === "hat";
  const isMetal = soundId === "cowbell";
  try {
    if (isNoise) s.triggerAttackRelease("16n", time, vol);
    else if (isMetal) s.triggerAttackRelease("16n", time, vol);
    else s.triggerAttackRelease(SOUND_NOTE[soundId]||"C2", "32n", time, vol);
  } catch {}
}

/* ─── Main hook ─── */
export function useMetronome() {
  /* ── Audio nodes ── */
  const soundsRef     = useRef(null);
  const loopRef       = useRef(null);
  const pulseRef      = useRef(0);  // absolute pulse index
  const barRef        = useRef(0);  // absolute bar index
  const gapCycleRef   = useRef(0);  // bar index within gap cycle
  const bpmRampRef    = useRef(0);  // current ramp BPM (float)

  /* ── Playback state ── */
  const [isPlaying, setIsPlaying] = useState(false);
  const [beat,      setBeat]      = useState(0);  // pulse within measure (0-based)
  const [currentBar,setCurrentBar]= useState(0);
  const [isMuted,   setIsMuted]   = useState(false);

  /* ── Config (all in one object for easy preset save/load) ── */
  const [cfg, setCfg] = useState({
    bpm:        100,
    timeNum:    4,   // beats per bar
    timeDen:    4,   // note value (2/4/8/16)
    subId:      "quarter", // ppb from SUBDIVISIONS
    ppb:        1,         // pulses per beat (derived from subId)
    swing:      50,        // 50–75 (%)
    sound:      "click",
    accentSound:"click",
    ghostSound: "click",
    polyEnabled:false,
    polyNum:    3,
    polySound:  "wood",
    polyVol:    0.7,
    gapEnabled: false,
    gapPlay:    4,
    gapSilence: 4,
    gapMode:    "full",   // "full"|"beat1"|"offbeat"
    randomMute: 0,         // 0–100
    trainerEnabled:false,
    trainerTarget:140,
    trainerType:"ramp",    // "ramp"|"stairs"
    trainerStairBars:8,
    trainerStairStep:2,
    voiceCount: false,
    countIn:    false,
    grid:       makeGrid(4, 1),
  });

  const cfgRef = useRef(cfg);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  /* ── Derived ── */
  const pulsesPerBar = cfg.timeNum * cfg.ppb;

  /* ── Speech synthesis for voice count ── */
  const sayBeat = useCallback((n) => {
    try {
      const u = new SpeechSynthesisUtterance(String(n));
      u.rate = 2.2; u.volume = 0.9; u.lang = "es-ES";
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch {}
  }, []);

  /* ── Build/destroy audio nodes once ── */
  useEffect(() => {
    soundsRef.current = buildSounds();
    // set initial volumes
    const v = { click:-4, wood:-2, hat:-10, rim:-6, kick:-2, beep:0, cowbell:-8 };
    Object.entries(v).forEach(([k,db]) => { try { soundsRef.current[k].volume.value = db; } catch {} });
    return () => {
      loopRef.current?.dispose();
      Tone.getTransport().stop(); Tone.getTransport().cancel();
      Object.values(soundsRef.current||{}).forEach(s => { try { s.dispose(); } catch {} });
    };
  }, []);

  /* ── Core loop builder ── */
  const rebuildLoop = useCallback(() => {
    if (loopRef.current) { loopRef.current.stop(); loopRef.current.dispose(); }
    pulseRef.current = 0; barRef.current = 0; gapCycleRef.current = 0;

    const c = cfgRef.current;
    bpmRampRef.current = c.bpm;

    // Compute Tone interval string for one pulse
    // ppb=1→"4n", ppb=2→"8n", ppb=3→"8t", ppb=4→"16n", ppb=5→use "4n" subdivided manually, ppb=6→"8t" ×2
    const ppbIntervals = { 1:"4n", 2:"8n", 3:"8t", 4:"16n", 5:"4n", 6:"8t" };
    const interval = ppbIntervals[c.ppb] || "8n";

    loopRef.current = new Tone.Loop((time) => {
      const cc = cfgRef.current;
      const totalPulses = cc.timeNum * cc.ppb;
      const pulse = pulseRef.current % totalPulses;
      const bar   = barRef.current;

      // ── Speed trainer ──
      if (cc.trainerEnabled) {
        if (cc.trainerType === "ramp") {
          const stepPerPulse = (cc.trainerTarget - cc.bpm) / (totalPulses * 32);
          bpmRampRef.current = clamp(bpmRampRef.current + stepPerPulse, Math.min(cc.bpm, cc.trainerTarget), Math.max(cc.bpm, cc.trainerTarget));
          Tone.getTransport().bpm.value = bpmRampRef.current;
        } else if (cc.trainerType === "stairs" && pulse === 0 && bar > 0 && bar % cc.trainerStairBars === 0) {
          bpmRampRef.current = clamp(bpmRampRef.current + cc.trainerStairStep, 20, 400);
          Tone.getTransport().bpm.value = bpmRampRef.current;
        }
      }

      // ── Gap click ──
      const gapTotal = cc.gapPlay + cc.gapSilence;
      const inGap    = cc.gapEnabled && (gapCycleRef.current >= cc.gapPlay);
      let silent = inGap;

      if (inGap && cc.gapMode === "beat1") {
        // play only pulse 0 in gap
        silent = pulse !== 0;
      } else if (inGap && cc.gapMode === "offbeat") {
        // shift: play only the off-pulses (halfway through each beat)
        const halfPpb = Math.floor(cc.ppb / 2);
        silent = halfPpb > 0 ? (pulse % cc.ppb !== halfPpb) : true;
      }

      // ── Random mute ──
      if (!silent && cc.randomMute > 0 && Math.random() * 100 < cc.randomMute) {
        silent = true;
      }

      // ── Play main click ──
      if (!silent) {
        const cell  = cc.grid[pulse] || { level:"beat", sound:null };
        const level = cell.level || "beat";
        const vol   = BEAT_LEVEL_VOL[level] || 0;
        if (vol > 0) {
          const snd = cell.sound || (level === "accent" ? cc.accentSound : level === "ghost" ? cc.ghostSound : cc.sound);
          triggerSound(soundsRef.current, snd, vol, time);
        }
      }

      // ── Polyrhythm layer ──
      if (cc.polyEnabled && !silent) {
        // LCM-based: fire poly click every totalPulses/polyNum pulses
        const polyStep = totalPulses / cc.polyNum;
        if (pulse % polyStep < 0.01 || Math.abs(pulse % polyStep - polyStep) < 0.01) {
          triggerSound(soundsRef.current, cc.polySound, cc.polyVol * 0.85, time);
        }
      }

      // ── Voice count ──
      if (cc.voiceCount && pulse % cc.ppb === 0) {
        const beatNum = Math.floor(pulse / cc.ppb) + 1;
        Tone.getDraw().schedule(() => sayBeat(beatNum), time);
      }

      // ── UI update ──
      Tone.getDraw().schedule(() => {
        try {
          setBeat(pulse);
          setCurrentBar(barRef.current);
          setIsMuted(!!silent);
        } catch {}
      }, time);

      // ── Advance counters ──
      pulseRef.current++;
      if (pulse === totalPulses - 1) {
        barRef.current++;
        if (cc.gapEnabled) {
          gapCycleRef.current = (gapCycleRef.current + 1) % gapTotal;
        }
      }
    }, interval);

    loopRef.current.start(0);
  }, [sayBeat]);

  /* ── Public: start ── */
  const start = useCallback(async (overrideBpm, overrideSub) => {
    await Tone.start();
    await Tone.getContext().resume();
    if (overrideBpm) setCfg(c => ({ ...c, bpm: overrideBpm }));
    if (overrideSub) setCfg(c => ({ ...c, subId: overrideSub }));
    Tone.getTransport().bpm.value = overrideBpm || cfgRef.current.bpm;
    bpmRampRef.current = overrideBpm || cfgRef.current.bpm;
    pulseRef.current = 0; barRef.current = 0; gapCycleRef.current = 0;
    Tone.getTransport().cancel();
    rebuildLoop();
    Tone.getTransport().start();
    setIsPlaying(true); setBeat(0); setCurrentBar(0);
  }, [rebuildLoop]);

  /* ── Public: stop ── */
  const stop = useCallback(() => {
    Tone.getTransport().stop(); Tone.getTransport().cancel();
    loopRef.current?.stop();
    setIsPlaying(false); setBeat(0); setCurrentBar(0); setIsMuted(false);
    pulseRef.current = 0; barRef.current = 0;
  }, []);

  /* ── Public: update config live — accepts object OR updater function ── */
  const update = useCallback((patch) => {
    setCfg(c => {
      const resolved = typeof patch === "function" ? patch(c) : patch;
      const next = { ...c, ...resolved };
      // recalc ppb if subId changed
      if (patch.subId) {
        const ppbMap = { quarter:1, eighth:2, triplet:3, sixteenth:4, quintuplet:5, sextuplet:6 };
        next.ppb = ppbMap[patch.subId] || 1;
      }
      // rebuild grid if timeNum or ppb changed
      if (patch.timeNum || patch.subId || patch.ppb) {
        const tNum = patch.timeNum || next.timeNum;
        const ppb  = next.ppb;
        next.grid  = makeGrid(tNum, ppb);
      }
      return next;
    });
  }, []);

  /* ── Update Tone BPM live when bpm changes ── */
  useEffect(() => {
    if (isPlaying) {
      Tone.getTransport().bpm.value = cfg.bpm;
      bpmRampRef.current = cfg.bpm;
    }
  }, [cfg.bpm, isPlaying]);

  /* ── Rebuild loop when key params change while playing ── */
  const prevKeyRef = useRef("");
  useEffect(() => {
    const key = `${cfg.timeNum}-${cfg.ppb}-${cfg.gapEnabled}-${cfg.gapPlay}-${cfg.gapSilence}-${cfg.gapMode}-${cfg.polyEnabled}-${cfg.polyNum}`;
    if (isPlaying && key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      Tone.getTransport().cancel();
      rebuildLoop();
    }
    prevKeyRef.current = key;
  }, [cfg.timeNum, cfg.ppb, cfg.gapEnabled, cfg.gapPlay, cfg.gapSilence, cfg.gapMode, cfg.polyEnabled, cfg.polyNum, isPlaying, rebuildLoop]);

  /* ── Tap tempo ── */
  const tapTimestamps = useRef([]);
  const tapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    // keep last 8 taps
    if (taps.length > 8) taps.splice(0, taps.length - 8);
    // need at least 2 taps
    if (taps.length < 2) return;
    // drop taps older than 3 seconds from the last tap
    const recent = taps.filter(t => now - t < 3000);
    tapTimestamps.current = recent;
    if (recent.length < 2) return;
    const intervals = recent.slice(1).map((t,i) => t - recent[i]);
    const avg = intervals.reduce((a,b)=>a+b,0) / intervals.length;
    const newBpm = clamp(Math.round(60000 / avg), 20, 400);
    update({ bpm: newBpm });
  }, [update]);

  /* ── Grid cell toggle ── */
  const toggleGridCell = useCallback((idx) => {
    setCfg(c => {
      const grid = c.grid.map((cell, i) => {
        if (i !== idx) return cell;
        const levels = BEAT_LEVELS;
        const next = levels[(levels.indexOf(cell.level) + 1) % levels.length];
        return { ...cell, level: next };
      });
      return { ...c, grid };
    });
  }, []);

  const setGridCellSound = useCallback((idx, sound) => {
    setCfg(c => {
      const grid = c.grid.map((cell, i) => i === idx ? { ...cell, sound } : cell);
      return { ...c, grid };
    });
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
