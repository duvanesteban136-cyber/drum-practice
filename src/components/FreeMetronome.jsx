import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { SUBDIVISIONS, SOUNDS, GAP_MODES, clamp } from "../lib/constants.js";
import { makeGrid } from "../hooks/useMetronome.js";

const BPM_PRESETS = [60, 80, 100, 120, 140, 160];
const POLY_NUMS   = [2, 3, 5, 7];
const TIME_NUMS   = [2, 3, 4, 5, 6, 7, 9, 12];
const TIME_DENS   = [2, 4, 8];

const T = {
  bg:    "#08080C",
  amber: "#ffbf00",
  text1: "#F0EDE8",
  text2: "#9B9590",
  text3: "#5C5650",
};

function pillStyle(active, extra = {}) {
  return {
    height: 32, padding: "0 12px", borderRadius: 999,
    border: active ? "1px solid rgba(255,191,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(255,191,0,0.15)" : "rgba(255,255,255,0.05)",
    color: active ? T.amber : T.text3,
    fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
    ...extra,
  };
}

const sheetLabel = {
  fontSize: 9, fontWeight: 600, letterSpacing: "0.15em",
  textTransform: "uppercase", color: T.text3, marginBottom: 10,
};

function SoundPicker({ value, onChange, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {label && <span style={{ color: T.text3, fontSize: 10, letterSpacing: "0.12em", width: 52, flexShrink: 0 }}>{label}</span>}
      {SOUNDS.map((s) => {
        const active = value === s.id;
        return (
          <button key={s.id} className="hl" onClick={() => onChange(s.id)}
            style={{
              padding: "0 10px", height: 28, borderRadius: 999,
              border: active ? "1px solid rgba(255,191,0,0.5)" : "1px solid rgba(255,255,255,0.06)",
              background: active ? "linear-gradient(135deg,#ffbf00,#ff8c00)" : "rgba(255,255,255,0.05)",
              color: active ? "#08080C" : "rgba(240,237,232,0.4)",
              fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
            }}
          >{s.label}</button>
        );
      })}
    </div>
  );
}


function Stepper({ value, onChange, min, max }) {
  const btn = { width: 32, height: 32, borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: T.text1, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={() => onChange(clamp(value - 1, min, max))} style={btn}>−</button>
      <span className="mono" style={{ color: T.amber, fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: "center" }}>{value}</span>
      <button onClick={() => onChange(clamp(value + 1, min, max))} style={btn}>+</button>
    </div>
  );
}

function Sheet({ title, icon, onClose, children }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "relative", background: "rgba(15,15,20,0.97)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px 20px 0 0",
        padding: "20px 20px 80px", animation: "slideUp 0.25s cubic-bezier(0.4,0,0.2,1)",
        maxHeight: "80vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="msym" style={{ fontSize: 20, color: T.amber }}>{icon}</span>
            <span className="hl" style={{ fontSize: 15, fontWeight: 800, color: T.text1 }}>{title}</span>
          </div>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.text2 }}
          ><span className="msym" style={{ fontSize: 18 }}>close</span></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default function FreeMetronome({ metro }) {
  const { isPlaying, beat, currentBar, cfg, update, start, stop,
    tapTempo, toggleGridCell, setGridCellSound, getCurrentBpm, pulsesPerBar } = metro;

  const [tapFlash, setTapFlash]         = useState(false);
  const [panel, setPanel]               = useState(null);
  const [cellPopover, setCellPopover]   = useState(null);
  const [longPressTimer, setLongPress]  = useState(null);
  const [flashBeat, setFlashBeat]       = useState(false);
  const [playError, setPlayError]       = useState(null);
  const [arcDiameter, setArcDiameter]   = useState(() => Math.min(Math.round(window.innerWidth * 0.58), 200));

  const bpmHoldRef  = useRef(null);
  const dragRef     = useRef({ active: false, startY: 0, startBpm: 0 });
  const prevBeatRef = useRef(null);

  useEffect(() => {
    const onResize = () => setArcDiameter(Math.min(Math.round(window.innerWidth * 0.58), 200));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isPlaying && beat === 0 && beat !== prevBeatRef.current) {
      setFlashBeat(true);
      const t = setTimeout(() => setFlashBeat(false), 120);
      prevBeatRef.current = beat;
      return () => clearTimeout(t);
    }
    prevBeatRef.current = beat;
  }, [beat, isPlaying]);

  const startBpmHold = useCallback((dir) => {
    if (bpmHoldRef.current) clearInterval(bpmHoldRef.current);
    bpmHoldRef.current = setInterval(() => update(c => ({ bpm: clamp(c.bpm + dir, 20, 400) })), 120);
  }, [update]);

  const stopBpmHold = useCallback(() => {
    if (bpmHoldRef.current) { clearInterval(bpmHoldRef.current); bpmHoldRef.current = null; }
  }, []);

  const onBpmPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, startY: e.clientY, startBpm: cfg.bpm };
  }, [cfg.bpm]);

  const onBpmPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const dy = dragRef.current.startY - e.clientY;
    update({ bpm: clamp(dragRef.current.startBpm + Math.round(dy / 3), 20, 400) });
  }, [update]);

  const onBpmPointerUp = useCallback(() => { dragRef.current.active = false; }, []);

  const handleTap = useCallback(() => {
    tapTempo();
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 140);
  }, [tapTempo]);

  const arcRadius = arcDiameter / 2 - 12;
  const arcCirc   = 2 * Math.PI * arcRadius;
  const arcDash   = ((cfg.bpm - 20) / 380) * arcCirc;
  const cellSize  = cfg.ppb <= 3 ? 44 : 34;
  const bpmFontSize = Math.round(arcDiameter * 0.38);
  const arcCenter = arcDiameter / 2;

  const currentTrainerBpm = getCurrentBpm();
  const trainerProgress   = cfg.trainerEnabled && isPlaying
    ? clamp((currentTrainerBpm - cfg.bpm) / Math.max(1, cfg.trainerTarget - cfg.bpm), 0, 1) : 0;
  const trainerColor = trainerProgress > 0.8 ? "#22c55e" : trainerProgress > 0.4 ? "#84cc16" : T.amber;

  const gapTotal   = cfg.gapPlay + cfg.gapSilence;
  const barInCycle = currentBar % gapTotal;
  const displayBpm = cfg.trainerEnabled && isPlaying ? currentTrainerBpm : cfg.bpm;

  const FEATURE_PILLS = [
    { id: "sound",   icon: "music_note",  label: "SONIDO", active: true },
    { id: "poly",    icon: "blur_on",     label: "POLY",   active: cfg.polyEnabled },
    { id: "gap",     icon: "pause_circle",label: "GAP",    active: cfg.gapEnabled },
    { id: "trainer", icon: "speed",       label: "SPEED",  active: cfg.trainerEnabled },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: T.bg, overflow: "hidden", position: "relative" }}>

      {/* Aurora blobs */}
      <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,191,0,0.08) 0%,transparent 70%)", top: -100, right: -80, pointerEvents: "none", animation: "auroraA 14s ease-in-out infinite" }} />
      <div style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,140,0,0.05) 0%,transparent 70%)", bottom: "25%", left: -60, pointerEvents: "none", animation: "auroraB 18s ease-in-out infinite" }} />

      {/* Beat edge flash */}
      {flashBeat && <div style={{ position: "absolute", left: 0, top: 0, width: 3, height: "100%", background: T.amber, zIndex: 10, pointerEvents: "none" }} />}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 0", flexShrink: 0, position: "relative", zIndex: 1 }}>
        <span className="hl" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", color: T.text3 }}>PRÁCTICA</span>
        <button onClick={() => setPanel(p => p === "extras" ? null : "extras")}
          style={{ background: "none", border: "none", cursor: "pointer", color: panel === "extras" ? T.amber : T.text3, display: "flex", padding: 4, transition: "color 0.15s" }}
        ><span className="msym" style={{ fontSize: 20 }}>tune</span></button>
      </div>

      {/* ── BPM Hero ── */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center", paddingTop: 12, paddingBottom: 4, position: "relative", zIndex: 1 }}>
        <div style={{ position: "relative", width: arcDiameter, height: arcDiameter, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={arcDiameter} height={arcDiameter} viewBox={`0 0 ${arcDiameter} ${arcDiameter}`} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <circle cx={arcCenter} cy={arcCenter} r={arcRadius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
            <circle cx={arcCenter} cy={arcCenter} r={arcRadius} fill="none" stroke={T.amber} strokeWidth="3"
              strokeDasharray={`${arcDash} ${arcCirc}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.15s" }} />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "ns-resize", userSelect: "none", zIndex: 1 }}
            onPointerDown={onBpmPointerDown} onPointerMove={onBpmPointerMove} onPointerUp={onBpmPointerUp}
          >
            <span className="hl" style={{ fontSize: bpmFontSize, fontWeight: 900, color: T.text1, lineHeight: 1, letterSpacing: "-0.05em" }}>
              {displayBpm}
            </span>
            <span className="hl" style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.2em", color: T.amber, opacity: 0.7, marginTop: 4 }}>BPM</span>
          </div>
        </div>
      </div>

      {/* ── [−] TAP [+] ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 20px 0", flexShrink: 0, position: "relative", zIndex: 1 }}>
        <button
          onPointerDown={() => { update({ bpm: clamp(cfg.bpm - 1, 20, 400) }); startBpmHold(-1); }}
          onPointerUp={stopBpmHold} onPointerLeave={stopBpmHold}
          style={{ width: 46, height: 34, borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: T.text2, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >−</button>
        <button className="hl" onClick={handleTap}
          style={{ height: 34, padding: "0 20px", borderRadius: 999,
            border: tapFlash ? "1px solid rgba(255,191,0,0.5)" : "1px solid rgba(255,255,255,0.1)",
            background: tapFlash ? "rgba(255,191,0,0.12)" : "rgba(255,255,255,0.05)",
            color: tapFlash ? T.amber : T.text2, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.1s" }}
        >
          <span className="msym" style={{ fontSize: 14 }}>touch_app</span>TAP
        </button>
        <button
          onPointerDown={() => { update({ bpm: clamp(cfg.bpm + 1, 20, 400) }); startBpmHold(1); }}
          onPointerUp={stopBpmHold} onPointerLeave={stopBpmHold}
          style={{ width: 46, height: 34, borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: T.text2, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >+</button>
      </div>

      {/* ── Time sig: tappable numerator / denominator ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, padding: "10px 20px 0", flexShrink: 0, position: "relative", zIndex: 1 }}>
        <button className="hl" onClick={() => {
          const idx = TIME_NUMS.indexOf(cfg.timeNum);
          update({ timeNum: TIME_NUMS[(idx + 1) % TIME_NUMS.length] });
        }} style={{ width: 56, height: 52, borderRadius: 12, border: "1px solid rgba(255,191,0,0.3)", background: "rgba(255,191,0,0.08)", color: T.amber, fontSize: 28, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-0.02em" }}>
          {cfg.timeNum}
        </button>
        <span className="hl" style={{ color: "rgba(240,237,232,0.25)", fontSize: 28, fontWeight: 300, padding: "0 6px", userSelect: "none" }}>/</span>
        <button className="hl" onClick={() => {
          const idx = TIME_DENS.indexOf(cfg.timeDen);
          update({ timeDen: TIME_DENS[(idx + 1) % TIME_DENS.length] });
        }} style={{ width: 56, height: 52, borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: T.text2, fontSize: 28, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: "-0.02em" }}>
          {cfg.timeDen}
        </button>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.08)", margin: "0 12px" }} />
        {SUBDIVISIONS.map(s => {
          const a = cfg.subId === s.id;
          return <button key={s.id} title={s.name} onClick={() => update({ subId: s.id })} style={{ width: 30, height: 30, borderRadius: 6, border: a ? "1px solid rgba(255,191,0,0.4)" : "1px solid rgba(255,255,255,0.08)", background: a ? "rgba(255,191,0,0.15)" : "rgba(255,255,255,0.04)", color: a ? T.amber : T.text3, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>{s.label}</button>;
        })}
      </div>

      {/* ── Beat Grid ── */}
      <div style={{ padding: "10px 20px 0", flexShrink: 0, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap" }}>
          {Array.from({ length: cfg.timeNum }, (_, beatIdx) => (
            <div key={beatIdx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", gap: 5 }}>
                {Array.from({ length: cfg.ppb }, (_, subIdx) => {
                  const i    = beatIdx * cfg.ppb + subIdx;
                  const cell = cfg.grid[i];
                  if (!cell) return null;
                  const isActive = isPlaying && beat === i;
                  const level = cell.level;
                  let bg, border, shadow;
                  if (level === "accent") {
                    bg = "linear-gradient(135deg,#ffbf00,#ff8c00)"; border = "none";
                    shadow = isActive ? "0 0 0 3px rgba(255,191,0,0.3),0 4px 20px rgba(255,191,0,0.5)" : "0 0 0 2px rgba(255,191,0,0.15),0 4px 12px rgba(255,191,0,0.25)";
                  } else if (level === "beat") {
                    bg = "rgba(255,191,0,0.2)"; border = "1px solid rgba(255,191,0,0.35)";
                    shadow = isActive ? "0 0 12px rgba(255,191,0,0.35)" : "none";
                  } else if (level === "ghost") {
                    bg = "transparent"; border = "1px solid rgba(255,255,255,0.12)";
                    shadow = isActive ? "0 0 8px rgba(255,255,255,0.15)" : "none";
                  } else {
                    bg = "rgba(255,255,255,0.03)"; border = "1px solid rgba(255,255,255,0.05)"; shadow = "none";
                  }
                  return (
                    <button key={i}
                      onClick={() => toggleGridCell(i)}
                      onPointerDown={() => {
                        const t = setTimeout(() => { setCellPopover({ cellIndex: i }); setPanel("sound"); }, 500);
                        setLongPress(t);
                      }}
                      onPointerUp={() => { if (longPressTimer) { clearTimeout(longPressTimer); setLongPress(null); } }}
                      onPointerLeave={() => { if (longPressTimer) { clearTimeout(longPressTimer); setLongPress(null); } }}
                      style={{
                        width: cellSize, height: cellSize, borderRadius: 10,
                        border, background: bg, boxShadow: shadow, cursor: "pointer",
                        transform: isActive ? "scale(1.2)" : "scale(1)",
                        transition: "transform 0.1s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.15s,background 0.1s",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {level === "ghost" && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.4)" }} />}
                      {level === "mute" && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>×</span>}
                    </button>
                  );
                })}
              </div>
              <span className="mono" style={{ fontSize: 8, color: T.amber, opacity: 0.5 }}>{beatIdx + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Spacer — pushes feature pills + play to bottom ── */}
      <div style={{ flex: 1, minHeight: 12 }} />

      {/* ── Swing inline ── */}
      {cfg.ppb >= 2 && cfg.ppb <= 4 && (
        <div style={{ margin: "8px 20px 0", display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 34, background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, position: "relative", zIndex: 1 }}>
          <span className="hl" style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", color: T.text3 }}>SWING</span>
          <input type="range" min={50} max={75} value={cfg.swing}
            onChange={(e) => update({ swing: Number(e.target.value) })}
            style={{ flex: 1, accentColor: T.amber }} />
          <span className="mono" style={{ fontSize: 11, color: cfg.swing > 50 ? T.amber : T.text3, minWidth: 30 }}>{cfg.swing}%</span>
        </div>
      )}

      {/* ── Feature pills ── */}
      <div style={{ display: "flex", gap: 8, padding: "0 20px", flexShrink: 0, position: "relative", zIndex: 1 }}>
        {FEATURE_PILLS.map(({ id, icon, label, active }) => (
          <button key={id} onClick={() => {
            const isOpen = panel === id;
            setPanel(p => p === id ? null : id);
            if (!isOpen) {
              if (id === "poly")    update({ polyEnabled: true });
              if (id === "gap")     update({ gapEnabled: true });
              if (id === "trainer") update({ trainerEnabled: true });
            } else {
              if (id === "poly")    update({ polyEnabled: false });
              if (id === "gap")     update({ gapEnabled: false });
              if (id === "trainer") update({ trainerEnabled: false });
            }
          }}
            style={{
              flex: 1, height: 44, borderRadius: 14,
              border: panel === id ? "1px solid rgba(255,191,0,0.35)" : active ? "1px solid rgba(255,191,0,0.2)" : "1px solid rgba(255,255,255,0.07)",
              background: panel === id ? "rgba(255,191,0,0.1)" : active ? "rgba(255,191,0,0.05)" : "rgba(255,255,255,0.04)",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 4, transition: "all 0.15s",
            }}
          >
            <span className="msym" style={{ fontSize: 18, color: (panel === id || active) ? T.amber : T.text3 }}>{icon}</span>
            <span className="hl" style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", color: (panel === id || active) ? T.amber : T.text3 }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Play / Pause ── */}
      <div style={{ flexShrink: 0, padding: "16px 20px 28px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, gap: 8 }}>
        {playError && (
          <span style={{ fontSize: 10, color: "#f43f5e", textAlign: "center", maxWidth: 220 }}>{playError}</span>
        )}
        <button onClick={() => {
          if (isPlaying) { stop(); setPlayError(null); return; }
          setPlayError(null);
          start();
        }}
          style={{
            width: 72, height: 72, borderRadius: "50%",
            background: isPlaying ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#ffbf00,#ff8c00)",
            border: isPlaying ? "1px solid rgba(255,255,255,0.12)" : "none",
            boxShadow: isPlaying ? "0 4px 16px rgba(0,0,0,0.3)" : "0 0 0 8px rgba(255,191,0,0.08),0 8px 32px rgba(255,191,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            animation: isPlaying ? "playPulse 2s ease-in-out infinite" : "none",
            transition: "background 0.2s,box-shadow 0.2s",
          }}
        >
          <span className="msym" style={{ fontSize: 32, color: isPlaying ? T.text1 : "#08080C" }}>{isPlaying ? "pause" : "play_arrow"}</span>
        </button>
      </div>

      {/* ════ SOUND SHEET ════ */}
      {panel === "sound" && (
        <Sheet title="Sonidos" icon="music_note" onClose={() => { setPanel(null); setCellPopover(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {cellPopover ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: -4 }}>
                  <span style={sheetLabel}>CELDA {cellPopover.cellIndex + 1}</span>
                  <button onClick={() => setCellPopover(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>← VOLVER</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button className="hl" onClick={() => { setGridCellSound(cellPopover.cellIndex, null); setCellPopover(null); }} style={pillStyle(cfg.grid[cellPopover.cellIndex]?.sound === null)}>DEFAULT</button>
                  {SOUNDS.map(s => (
                    <button key={s.id} className="hl" onClick={() => { setGridCellSound(cellPopover.cellIndex, s.id); setCellPopover(null); }} style={pillStyle(cfg.grid[cellPopover.cellIndex]?.sound === s.id)}>{s.label}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div><div style={sheetLabel}>ACENTO</div><SoundPicker value={cfg.accentSound} onChange={(id) => update({ accentSound: id })} /></div>
                <div><div style={sheetLabel}>BEAT</div><SoundPicker value={cfg.sound} onChange={(id) => update({ sound: id })} /></div>
                <div><div style={sheetLabel}>GHOST</div><SoundPicker value={cfg.ghostSound} onChange={(id) => update({ ghostSound: id })} /></div>
              </>
            )}
          </div>
        </Sheet>
      )}

      {/* ════ POLY SHEET ════ */}
      {panel === "poly" && (
        <Sheet title="Polyrhythm" icon="blur_on" onClose={() => { setPanel(null); update({ polyEnabled: false }); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "center", paddingBottom: 4 }}>
              <span className="hl" style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em" }}>
                <span style={{ color: T.amber }}>{cfg.timeNum}</span>
                <span style={{ color: "rgba(240,237,232,0.18)", margin: "0 10px" }}>:</span>
                <span style={{ color: "#06b6d4" }}>{cfg.polyNum}</span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ ...sheetLabel, marginBottom: 0, minWidth: 52 }}>CAPA 2</span>
              {POLY_NUMS.map(n => <button key={n} className="hl" onClick={() => update({ polyNum: n })} style={{ ...pillStyle(cfg.polyNum === n), width: 40, height: 36 }}>{n}</button>)}
            </div>
            <div><div style={sheetLabel}>SONIDO</div><SoundPicker value={cfg.polySound} onChange={(id) => update({ polySound: id })} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...sheetLabel, marginBottom: 0, minWidth: 40 }}>VOL</span>
              <input type="range" min={0} max={100} value={Math.round(cfg.polyVol * 100)} onChange={(e) => update({ polyVol: Number(e.target.value) / 100 })} style={{ flex: 1, accentColor: T.amber }} />
              <span className="mono" style={{ color: T.amber, fontSize: 12, minWidth: 32 }}>{Math.round(cfg.polyVol * 100)}%</span>
            </div>
          </div>
        </Sheet>
      )}

      {/* ════ GAP SHEET ════ */}
      {panel === "gap" && (
        <Sheet title="Gap Click" icon="pause_circle" onClose={() => { setPanel(null); update({ gapEnabled: false }); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isPlaying && (
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: gapTotal }, (_, i) => {
                  const isCurr = i === barInCycle;
                  const isMute = i >= cfg.gapPlay;
                  return <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: isCurr ? T.amber : isMute ? "rgba(255,255,255,0.06)" : "rgba(255,191,0,0.25)", boxShadow: isCurr ? "0 0 8px rgba(255,191,0,0.5)" : "none", transition: "all 0.1s" }} />;
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...sheetLabel, marginBottom: 0 }}>PLAY</span>
                <Stepper value={cfg.gapPlay} onChange={(v) => update({ gapPlay: v })} min={1} max={8} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...sheetLabel, marginBottom: 0 }}>MUTE</span>
                <Stepper value={cfg.gapSilence} onChange={(v) => update({ gapSilence: v })} min={1} max={8} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {GAP_MODES.map(m => <button key={m.id} className="hl" onClick={() => update({ gapMode: m.id })} title={m.desc} style={pillStyle(cfg.gapMode === m.id)}>{m.label}</button>)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...sheetLabel, marginBottom: 0, minWidth: 84 }}>RANDOM MUTE</span>
              <input type="range" min={0} max={100} value={cfg.randomMute} onChange={(e) => update({ randomMute: Number(e.target.value) })} style={{ flex: 1, accentColor: T.amber }} />
              <span className="mono" style={{ color: cfg.randomMute > 0 ? T.amber : T.text3, fontSize: 12, minWidth: 32 }}>{cfg.randomMute}%</span>
            </div>
          </div>
        </Sheet>
      )}

      {/* ════ TRAINER SHEET ════ */}
      {panel === "trainer" && (
        <Sheet title="Speed Trainer" icon="speed" onClose={() => { setPanel(null); update({ trainerEnabled: false }); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ ...sheetLabel, marginBottom: 2 }}>DESDE</span>
                <span className="hl" style={{ color: T.amber, fontSize: "1.5rem", fontWeight: 900 }}>{cfg.bpm}</span>
              </div>
              <span style={{ color: T.text3, fontSize: 18 }}>→</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ ...sheetLabel, marginBottom: 2 }}>HASTA</span>
                <input type="number" min={20} max={400} value={cfg.trainerTarget}
                  onChange={(e) => update({ trainerTarget: clamp(Number(e.target.value), 20, 400) })}
                  style={{ width: 72, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: T.amber, fontSize: "1.5rem", fontWeight: 900, textAlign: "center", padding: "2px 4px", fontFamily: "inherit" }}
                />
              </div>
              {isPlaying && (
                <div style={{ marginLeft: "auto", position: "relative", width: 80, height: 80 }}>
                  <svg width={80} height={80} viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                    <circle cx="40" cy="40" r="35" fill="none" stroke={trainerColor} strokeWidth="2.5"
                      strokeDasharray={`${trainerProgress * 2 * Math.PI * 35} ${2 * Math.PI * 35}`}
                      strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s,stroke 0.5s" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ ...sheetLabel, marginBottom: 0 }}>AHORA</span>
                    <span className="mono" style={{ color: trainerColor, fontSize: "0.9rem", fontWeight: 900 }}>{currentTrainerBpm}</span>
                  </div>
                </div>
              )}
            </div>
            {isPlaying && (
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${trainerProgress * 100}%`, height: "100%", background: trainerColor, borderRadius: 2, transition: "width 0.5s,background 0.5s" }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {["ramp", "stairs"].map(t => <button key={t} className="hl" onClick={() => update({ trainerType: t })} style={{ ...pillStyle(cfg.trainerType === t), flex: 1, height: 34 }}>{t === "ramp" ? "RAMPA" : "ESCALERA"}</button>)}
            </div>
            {cfg.trainerType === "stairs" && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...sheetLabel, marginBottom: 0 }}>CADA</span>
                  <Stepper value={cfg.trainerStairBars} onChange={(v) => update({ trainerStairBars: v })} min={1} max={32} />
                  <span style={{ ...sheetLabel, marginBottom: 0 }}>compases</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ ...sheetLabel, marginBottom: 0 }}>+BPM</span>
                  <Stepper value={cfg.trainerStairStep} onChange={(v) => update({ trainerStairStep: v })} min={1} max={20} />
                </div>
              </div>
            )}
          </div>
        </Sheet>
      )}

      {/* ════ EXTRAS SHEET ════ */}
      {panel === "extras" && (
        <Sheet title="Ajustes" icon="tune" onClose={() => setPanel(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={sheetLabel}>BPM RÁPIDOS</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {BPM_PRESETS.map(b => <button key={b} className="hl" onClick={() => { update({ bpm: b }); setPanel(null); }} style={pillStyle(cfg.bpm === b)}>{b}</button>)}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button className="hl" onClick={() => { try { document.documentElement.requestFullscreen(); } catch {} setPanel(null); }} style={{ ...pillStyle(false), display: "flex", alignItems: "center", gap: 6 }}>
                <span className="msym" style={{ fontSize: 14 }}>fullscreen</span>PANTALLA COMPLETA
              </button>
              <button className="hl" onClick={() => { update({ grid: makeGrid(cfg.timeNum, cfg.ppb) }); setPanel(null); }} style={{ ...pillStyle(false), display: "flex", alignItems: "center", gap: 6 }}>
                <span className="msym" style={{ fontSize: 14 }}>restart_alt</span>RESETEAR GRID
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
