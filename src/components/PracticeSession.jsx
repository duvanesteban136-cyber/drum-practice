import { useState, useRef, useEffect, useCallback } from "react";
import { SUBDIVISIONS, SOUNDS, clamp, fmtDur } from "../lib/constants.js";

/* ─── helpers ─── */
const BPM_PRESETS = [60, 80, 100, 120, 140, 160];

function SoundPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
      {SOUNDS.map((s) => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            className="hl"
            onClick={() => onChange(s.id)}
            style={{
              width: 52, height: 32,
              border: active ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
              borderRadius: 6,
              background: active ? "var(--amber)" : "var(--s-mid)",
              color: active ? "var(--on-amber)" : "var(--on-sv)",
              fontSize: 10, fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── SVG Arc Progress (countdown timer ring) ─── */
function CountdownRing({ total, remaining, size = 140, color = "var(--amber)" }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? remaining / total : 0;
  const dash = pct * circ;
  return (
    <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--s-top)" strokeWidth="3" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s linear" }}
      />
    </svg>
  );
}

/* ─── BPM Arc (small) ─── */
function BpmArc({ bpm }) {
  const r = 48;
  const circ = 2 * Math.PI * r;
  const fill = (bpm - 20) / (400 - 20);
  const dash = fill * circ;
  return (
    <svg width="120" height="120" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--outline-v)" strokeWidth="3" />
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke="var(--amber)" strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.15s" }}
      />
    </svg>
  );
}

/* ─── Animated checkmark ─── */
function CheckmarkAnim() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle
        cx="32" cy="32" r="28"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="3"
        style={{ animation: "fadeIn 0.3s ease forwards" }}
      />
      <path
        d="M18 32 L28 42 L46 22"
        fill="none"
        stroke="var(--amber)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="40"
        strokeDashoffset="40"
        style={{ animation: "checkDraw .6s .2s ease forwards" }}
      />
    </svg>
  );
}

/* ─── Phase constants ─── */
const PHASES = ["ready", "warmup", "exercise", "rest", "done"];

export default function PracticeSession({ data, categoryId, routineExercises, metro, onComplete, onExit }) {
  const {
    isPlaying, beat, cfg, update,
    start, stop, tapTempo, pulsesPerBar,
  } = metro;

  /* ── filter + sort exercises ── */
  const exercises = routineExercises
    ? routineExercises
    : (data?.exercises || [])
        .filter((ex) => ex.categoryId === categoryId)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const category = categoryId === "routine"
    ? { name: "Rutina" }
    : (data?.categories || []).find((c) => c.id === categoryId);
  const settings = data?.settings || { restBetweenExercises: 10, warmUpBars: 4 };

  /* ── session state ── */
  const [exIdx, setExIdx] = useState(0);
  const [phase, setPhase] = useState("ready"); // ready|warmup|exercise|rest|done
  const [phaseCountdown, setPhaseCountdown] = useState(0); // bars or seconds remaining
  const [doneCountdown, setDoneCountdown] = useState(3);

  /* ── elapsed time ── */
  const elapsedRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const elapsedTimerRef = useRef(null);

  /* ── BPM overrides per exercise ── */
  const bpmOverridesRef = useRef({});

  /* ── hold-press for BPM +/- ── */
  const bpmHoldRef = useRef(null);

  /* ── warmup bar counter ── */
  const warmupBarsRef = useRef(0);
  const lastBarRef = useRef(-1);

  /* ── current exercise ── */
  const ex = exercises[exIdx] || null;
  const totalExercises = exercises.length;

  /* ── start elapsed timer ── */
  const startElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      elapsedRef.current++;
      setElapsed(elapsedRef.current);
    }, 1000);
  }, []);

  useEffect(() => {
    startElapsedTimer();
    return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current); };
  }, [startElapsedTimer]);

  /* ── configure metro when exercise / phase changes ── */
  const configureMetroForExercise = useCallback((exercise) => {
    if (!exercise) return;
    const patch = {
      bpm: exercise.bpm || 100,
      timeNum: exercise.timeNum || 4,
      subId: exercise.subId || "quarter",
    };
    if (exercise.velocityMode === "ramp") {
      patch.trainerEnabled = true;
      patch.trainerTarget = exercise.targetBpm || exercise.bpm + 20;
      patch.trainerType = "ramp";
    } else {
      patch.trainerEnabled = false;
    }
    update(patch);
  }, [update]);

  /* ── phase: warmup bar counting ── */
  useEffect(() => {
    if (phase !== "warmup" || !isPlaying) return;
    const warmupBars = settings.warmUpBars || 4;
    if (metro.currentBar !== lastBarRef.current) {
      lastBarRef.current = metro.currentBar;
      warmupBarsRef.current++;
      const remaining = warmupBars - warmupBarsRef.current;
      setPhaseCountdown(remaining > 0 ? remaining : 0);
      if (warmupBarsRef.current >= warmupBars) {
        setPhase("exercise");
        const exDuration = ex?.duration || 60;
        setPhaseCountdown(exDuration);
      }
    }
  }, [metro.currentBar, phase, isPlaying, settings.warmUpBars, ex]);

  /* ── phase: exercise countdown ── */
  const exerciseTimerRef = useRef(null);
  useEffect(() => {
    if (phase !== "exercise" || !isPlaying) return;
    const exDuration = ex?.duration || 60;
    let remaining = exDuration;
    setPhaseCountdown(remaining);
    if (exerciseTimerRef.current) clearInterval(exerciseTimerRef.current);
    exerciseTimerRef.current = setInterval(() => {
      remaining--;
      setPhaseCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(exerciseTimerRef.current);
        stop();
        setPhase("rest");
        setPhaseCountdown(settings.restBetweenExercises || 10);
      }
    }, 1000);
    return () => { if (exerciseTimerRef.current) clearInterval(exerciseTimerRef.current); };
  }, [phase, isPlaying, ex, settings.restBetweenExercises, stop]);

  /* ── phase: rest countdown ── */
  const restTimerRef = useRef(null);
  useEffect(() => {
    if (phase !== "rest") return;
    const restDuration = settings.restBetweenExercises || 10;
    let remaining = restDuration;
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restTimerRef.current = setInterval(() => {
      remaining--;
      setPhaseCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(restTimerRef.current);
        const nextIdx = exIdx + 1;
        if (nextIdx >= totalExercises) {
          setPhase("done");
        } else {
          setExIdx(nextIdx);
          setPhase("ready");
        }
      }
    }, 1000);
    return () => { if (restTimerRef.current) clearInterval(restTimerRef.current); };
  }, [phase, exIdx, totalExercises, settings.restBetweenExercises]);

  /* ── phase: done auto-dismiss ── */
  useEffect(() => {
    if (phase !== "done") return;
    setDoneCountdown(3);
    const t = setInterval(() => {
      setDoneCountdown((v) => {
        if (v <= 1) {
          clearInterval(t);
          onExit && onExit();
          onComplete && onComplete({
            categoryId,
            elapsed: elapsedRef.current,
            bpmOverrides: bpmOverridesRef.current,
            exercisesCompleted: totalExercises,
          });
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, onExit, onComplete, categoryId, totalExercises]);

  /* ── Actions ── */
  const handleStart = useCallback(() => {
    if (!ex) return;
    configureMetroForExercise(ex);
    const warmupBars = settings.warmUpBars || 4;
    warmupBarsRef.current = 0;
    lastBarRef.current = -1;
    setPhaseCountdown(warmupBars);
    setPhase("warmup");
    start(ex.bpm || cfg.bpm);
  }, [ex, configureMetroForExercise, settings.warmUpBars, start, cfg.bpm]);

  const handleSkip = useCallback(() => {
    if (exerciseTimerRef.current) clearInterval(exerciseTimerRef.current);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    stop();
    const nextIdx = exIdx + 1;
    if (nextIdx >= totalExercises) {
      setPhase("done");
    } else {
      setExIdx(nextIdx);
      setPhase("ready");
    }
  }, [exIdx, totalExercises, stop]);

  const handlePrev = useCallback(() => {
    if (exerciseTimerRef.current) clearInterval(exerciseTimerRef.current);
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    stop();
    const prevIdx = Math.max(0, exIdx - 1);
    setExIdx(prevIdx);
    setPhase("ready");
  }, [exIdx, stop]);

  const bpmAdjust = useCallback((dir) => {
    const newBpm = clamp(cfg.bpm + dir, 20, 400);
    update({ bpm: newBpm });
    if (ex) bpmOverridesRef.current[ex.id] = newBpm;
  }, [cfg.bpm, update, ex]);

  const startBpmHold = useCallback((dir) => {
    if (bpmHoldRef.current) clearInterval(bpmHoldRef.current);
    bpmHoldRef.current = setInterval(() => {
      bpmAdjust(dir);
    }, 120);
  }, [bpmAdjust]);

  const stopBpmHold = useCallback(() => {
    if (bpmHoldRef.current) { clearInterval(bpmHoldRef.current); bpmHoldRef.current = null; }
  }, []);

  /* ── overall session progress ── */
  const sessionProgress = totalExercises > 0 ? (exIdx + (phase === "done" ? 1 : 0)) / totalExercises : 0;

  /* ── beat dots ── */
  const beatDots = Array.from({ length: pulsesPerBar }, (_, i) => i);

  /* ── No exercises ── */
  if (!exercises.length) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <span className="msym" style={{ fontSize: 48, color: "var(--outline)" }}>inbox</span>
        <span className="hl" style={{ color: "var(--on-sv)", fontSize: 16, fontWeight: 700 }}>No hay ejercicios en esta categoría</span>
        <button
          className="hl"
          onClick={onExit}
          style={{
            padding: "10px 24px", borderRadius: 10,
            border: "1px solid var(--outline-v)",
            background: "var(--s-mid)",
            color: "var(--on-s)", fontSize: 13, fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  /* ── Render phase content ── */
  const renderPhaseContent = () => {
    /* ── READY ── */
    if (phase === "ready") {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, animation: "fadeUp 0.3s ease" }}>
          <span className="hl" style={{ color: "var(--outline)", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>
            EJERCICIO {exIdx + 1} / {totalExercises}
          </span>
          <span className="hl" style={{ color: "var(--on-s)", fontSize: 22, fontWeight: 800, textAlign: "center" }}>
            {ex?.name || "Sin nombre"}
          </span>
          {ex?.description && (
            <span style={{ color: "var(--outline)", fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.5 }}>
              {ex.description}
            </span>
          )}

          {/* BPM big */}
          <div style={{ position: "relative", width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BpmArc bpm={ex?.bpm || 100} />
            <span className="hl" style={{ fontSize: "2.5rem", fontWeight: 900, color: "var(--amber)", zIndex: 1 }}>
              {ex?.bpm || 100}
            </span>
          </div>
          <span className="hl" style={{ color: "var(--amber)", fontSize: 11, letterSpacing: "0.2em", marginTop: -18 }}>BPM</span>

          {/* Subdivision */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {SUBDIVISIONS.map((s) => {
              const active = cfg.subId === s.id;
              return (
                <button
                  key={s.id}
                  title={s.name}
                  onClick={() => update({ subId: s.id })}
                  style={{
                    width: 36, height: 32, borderRadius: 6,
                    border: active ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
                    background: active ? "var(--amber)" : "var(--s-mid)",
                    color: active ? "var(--on-amber)" : "var(--on-sv)",
                    fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Duration info */}
          <span style={{ color: "var(--outline)", fontSize: 12 }}>
            {fmtDur(ex?.duration || 60)} · {settings.warmUpBars || 4} compases calentamiento
          </span>

          <button
            className="hl"
            onClick={handleStart}
            style={{
              padding: "16px 48px", borderRadius: "var(--radius-full)",
              border: "none",
              background: "linear-gradient(135deg, var(--accent-practice) 0%, #ff8c00 100%)",
              color: "#402d00",
              fontSize: 14, fontWeight: 800, letterSpacing: "0.15em",
              cursor: "pointer",
              boxShadow: "0 0 0 6px rgba(255,191,0,0.12), 0 8px 32px rgba(255,191,0,0.3)",
              transition: "all 0.2s cubic-bezier(.34,1.56,.64,1)",
            }}
          >
            INICIAR
          </button>
        </div>
      );
    }

    /* ── WARMUP ── */
    if (phase === "warmup") {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, animation: "fadeUp 0.25s ease" }}>
          <span className="hl" style={{ color: "var(--cyan, #22d3ee)", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>
            CALENTAMIENTO
          </span>
          <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CountdownRing total={settings.warmUpBars || 4} remaining={phaseCountdown} size={160} color="var(--cyan, #22d3ee)" />
            <span className="hl" style={{ fontSize: "4rem", fontWeight: 900, color: "var(--cyan, #22d3ee)", zIndex: 1 }}>
              {phaseCountdown}
            </span>
          </div>
          <span style={{ color: "var(--outline)", fontSize: 13 }}>compases restantes</span>

          {/* Beat dots */}
          <div style={{ display: "flex", gap: 6 }}>
            {beatDots.map((i) => (
              <div
                key={i}
                style={{
                  width: isPlaying && beat === i ? 12 : 8,
                  height: isPlaying && beat === i ? 12 : 8,
                  borderRadius: "50%",
                  background: isPlaying && beat === i ? "var(--cyan, #22d3ee)" : "var(--s-top)",
                  transition: "all 0.06s",
                }}
              />
            ))}
          </div>

          <span className="hl" style={{ color: "var(--on-sv)", fontSize: 14, fontWeight: 700 }}>
            {ex?.name}
          </span>
          <span className="mono" style={{ color: "var(--amber)", fontSize: "1.4rem", fontWeight: 900 }}>
            {cfg.bpm} BPM
          </span>
        </div>
      );
    }

    /* ── EXERCISE ── */
    if (phase === "exercise") {
      const exDuration = ex?.duration || 60;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, animation: "fadeUp 0.2s ease" }}>
          <span className="hl" style={{ color: "var(--outline)", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>
            EJERCICIO {exIdx + 1} / {totalExercises}
          </span>
          <span className="hl" style={{ color: "var(--on-s)", fontSize: 18, fontWeight: 800, textAlign: "center" }}>
            {ex?.name}
          </span>

          {/* BPM + countdown ring combo */}
          <div style={{ position: "relative", width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CountdownRing total={exDuration} remaining={phaseCountdown} size={180} />
            <div style={{ position: "relative", width: 130, height: 130, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
              <BpmArc bpm={cfg.bpm} />
              <span
                className="hl"
                style={{ fontSize: "2.2rem", fontWeight: 900, color: "var(--amber)", zIndex: 2 }}
              >
                {cfg.bpm}
              </span>
            </div>
          </div>
          <span className="hl" style={{ color: "var(--amber)", fontSize: 11, letterSpacing: "0.2em", marginTop: -10 }}>BPM</span>

          {/* BPM +/- */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onPointerDown={() => { bpmAdjust(-1); startBpmHold(-1); }}
              onPointerUp={stopBpmHold}
              onPointerLeave={stopBpmHold}
              style={{
                width: 44, height: 44, borderRadius: 10,
                border: "1px solid var(--outline-v)",
                background: "var(--s-mid)",
                color: "var(--on-s)",
                fontSize: 22, fontWeight: 300,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              −
            </button>
            <span className="mono" style={{ color: "var(--outline)", fontSize: 18, minWidth: 60, textAlign: "center" }}>
              {fmtDur(phaseCountdown)}
            </span>
            <button
              onPointerDown={() => { bpmAdjust(1); startBpmHold(1); }}
              onPointerUp={stopBpmHold}
              onPointerLeave={stopBpmHold}
              style={{
                width: 44, height: 44, borderRadius: 10,
                border: "1px solid var(--outline-v)",
                background: "var(--s-mid)",
                color: "var(--on-s)",
                fontSize: 22, fontWeight: 300,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              +
            </button>
          </div>

          {/* Beat dots */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", maxWidth: 280 }}>
            {beatDots.map((i) => {
              const isAct = isPlaying && beat === i;
              const isAcc = i === 0;
              return (
                <div
                  key={i}
                  style={{
                    width: isAct ? 13 : isAcc ? 10 : 7,
                    height: isAct ? 13 : isAcc ? 10 : 7,
                    borderRadius: "50%",
                    background: isAct ? "var(--amber)" : isAcc ? "rgba(255,191,0,0.35)" : "var(--s-top)",
                    transition: "all 0.06s",
                    boxShadow: isAct ? "0 0 10px var(--amber-glow)" : "none",
                  }}
                />
              );
            })}
          </div>
        </div>
      );
    }

    /* ── REST ── */
    if (phase === "rest") {
      const restDuration = settings.restBetweenExercises || 10;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, animation: "fadeUp 0.25s ease" }}>
          <span className="hl" style={{ color: "var(--green, #22c55e)", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>
            DESCANSO
          </span>
          <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CountdownRing total={restDuration} remaining={phaseCountdown} size={160} color="var(--green, #22c55e)" />
            <span className="hl" style={{ fontSize: "4rem", fontWeight: 900, color: "var(--green, #22c55e)", zIndex: 1 }}>
              {phaseCountdown}
            </span>
          </div>
          <span style={{ color: "var(--outline)", fontSize: 13 }}>segundos</span>
          {exIdx + 1 < totalExercises && (
            <div style={{ textAlign: "center" }}>
              <span style={{ color: "var(--outline)", fontSize: 12 }}>Siguiente:</span>
              <br />
              <span className="hl" style={{ color: "var(--on-sv)", fontSize: 15, fontWeight: 700 }}>
                {exercises[exIdx + 1]?.name}
              </span>
            </div>
          )}
        </div>
      );
    }

    /* ── DONE ── */
    if (phase === "done") {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, animation: "scaleIn 0.4s ease" }}>
          <CheckmarkAnim />
          <span className="hl" style={{ color: "var(--amber)", fontSize: 22, fontWeight: 900, letterSpacing: "0.08em" }}>
            ¡BIEN HECHO!
          </span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--on-sv)", fontSize: 14 }}>
              {totalExercises} ejercicio{totalExercises !== 1 ? "s" : ""} completado{totalExercises !== 1 ? "s" : ""}
            </span>
            <span style={{ color: "var(--outline)", fontSize: 13 }}>
              Tiempo total: <span className="mono" style={{ color: "var(--amber)" }}>{fmtDur(elapsed)}</span>
            </span>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 20px",
            backdropFilter: "blur(10px)",
            border: "1px solid var(--glass-border)",
          }}>
            <span style={{ color: "var(--outline)", fontSize: 12 }}>
              Cerrando en <span className="mono" style={{ color: "var(--amber)" }}>{doneCountdown}s</span>
            </span>
          </div>
          <button
            className="hl"
            onClick={() => { onComplete && onComplete({ categoryId, elapsed: elapsedRef.current, bpmOverrides: bpmOverridesRef.current, exercisesCompleted: totalExercises }); onExit && onExit(); }}
            style={{
              padding: "10px 28px", borderRadius: 10,
              border: "none",
              background: "var(--amber)",
              color: "var(--on-amber)",
              fontSize: 13, fontWeight: 800, letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            FINALIZAR
          </button>
        </div>
      );
    }

    return null;
  };

  /* ── phase segments bar ── */
  const renderPhaseSegments = () => {
    return exercises.map((e, i) => {
      const isDone = i < exIdx || phase === "done";
      const isCurrent = i === exIdx && phase !== "done";
      return (
        <div
          key={e.id || i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: isDone
              ? "var(--amber)"
              : isCurrent
              ? "rgba(255,191,0,0.5)"
              : "var(--s-top)",
            transition: "background 0.3s",
          }}
        />
      );
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* ── Top bar ── */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "12px 16px",
        background: "rgba(8,8,12,0.9)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--outline-v)",
        flexShrink: 0,
      }}>
        <button
          className="hl"
          onClick={() => { stop(); onExit && onExit(); }}
          style={{
            background: "none",
            border: "1px solid var(--outline-v)",
            borderRadius: 8,
            color: "var(--outline)",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          SALIR
        </button>
        <span
          className="hl"
          style={{
            flex: 1, textAlign: "center",
            color: "var(--on-s)", fontSize: 13, fontWeight: 700,
          }}
        >
          {category?.name || "Sesión"}
        </span>
        <span className="mono" style={{ color: "var(--amber)", fontSize: 13, fontWeight: 700, minWidth: 52, textAlign: "right" }}>
          {fmtDur(elapsed)}
        </span>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height: 3, background: "var(--s-top)", flexShrink: 0 }}>
        <div style={{
          width: `${sessionProgress * 100}%`, height: "100%",
          background: "var(--amber)",
          transition: "width 0.4s ease",
        }} />
      </div>

      {/* ── Main content area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", overflow: "auto" }}>
        {renderPhaseContent()}
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        background: "var(--s-deep)",
        borderTop: "1px solid var(--outline-v)",
        padding: "12px 16px",
        flexShrink: 0,
      }}>
        {/* Phase segments */}
        <div style={{ display: "flex", gap: 3, marginBottom: 12 }}>
          {renderPhaseSegments()}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Prev */}
          <button
            onClick={handlePrev}
            disabled={exIdx === 0 && phase !== "exercise"}
            style={{
              width: 44, height: 44, borderRadius: 10,
              border: "1px solid var(--outline-v)",
              background: "var(--s-mid)",
              color: exIdx === 0 ? "var(--outline-v)" : "var(--outline)",
              fontSize: 18,
              cursor: exIdx === 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ‹
          </button>

          {/* Main play/stop button */}
          <button
            className="hl"
            onClick={() => {
              if (phase === "exercise" || phase === "warmup") {
                if (isPlaying) stop(); else start(cfg.bpm);
              } else if (phase === "ready") {
                handleStart();
              }
            }}
            style={{
              flex: 1, height: 56, borderRadius: 12,
              border: "none",
              background: isPlaying
                ? "var(--s-high)"
                : phase === "rest" || phase === "done"
                ? "var(--s-high)"
                : "linear-gradient(135deg, var(--amber) 0%, var(--amber-dim) 100%)",
              color: isPlaying ? "var(--on-s)" : phase === "rest" || phase === "done" ? "var(--outline)" : "var(--on-amber)",
              fontSize: 14, fontWeight: 800, letterSpacing: "0.1em",
              cursor: phase === "rest" || phase === "done" ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: isPlaying || phase === "rest" || phase === "done" ? "none" : "0 4px 20px var(--amber-glow)",
              transition: "all 0.2s",
            }}
          >
            <span className="msym" style={{ fontSize: 24 }}>
              {isPlaying
                ? "pause_circle"
                : phase === "rest"
                ? "hourglass_empty"
                : phase === "done"
                ? "check_circle"
                : "play_circle"}
            </span>
            {isPlaying
              ? "PAUSAR"
              : phase === "rest"
              ? "DESCANSO"
              : phase === "done"
              ? "LISTO"
              : "INICIAR"}
          </button>

          {/* Skip / Next */}
          <button
            onClick={handleSkip}
            style={{
              width: 44, height: 44, borderRadius: 10,
              border: "1px solid var(--outline-v)",
              background: "var(--s-mid)",
              color: "var(--outline)",
              fontSize: 18,
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ›
          </button>

          {/* Skip exercise label (shown in exercise phase) */}
          {(phase === "exercise" || phase === "warmup") && (
            <button
              className="hl"
              onClick={handleSkip}
              style={{
                padding: "6px 10px", borderRadius: 8,
                border: "1px solid var(--outline-v)",
                background: "var(--s-mid)",
                color: "var(--outline)",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              SALTAR →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
