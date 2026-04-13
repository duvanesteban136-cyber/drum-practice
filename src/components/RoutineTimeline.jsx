import { useState, useRef, useCallback } from "react";
import { saveData } from "../lib/storage.js";
import { uid, fmtDur, clamp } from "../lib/constants.js";

/* ─── helpers ─── */
function MI({ children, style }) {
  return (
    <span className="msym" style={{ fontSize: 20, lineHeight: 1, userSelect: "none", ...style }}>
      {children}
    </span>
  );
}

function IBtn({ onClick, children, style, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 6,
        borderRadius: 8,
        color: "var(--on-sv)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.15s",
        ...style,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      {children}
    </button>
  );
}

function Badge({ children, color = "var(--outline)", bg }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.1em",
        padding: "2px 5px",
        borderRadius: 4,
        border: `1px solid ${color}`,
        color: color,
        background: bg || "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Stepper({ value, min, max, step = 1, onChange, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => onChange(clamp(value - step, min, max))}
        style={{
          width: 24, height: 24, borderRadius: 6,
          border: "1px solid var(--outline-v)",
          background: "var(--s-mid)", color: "var(--on-s)",
          cursor: "pointer", fontSize: 14, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >−</button>
      <span className="mono" style={{ fontSize: 13, color: "var(--amber)", minWidth: 48, textAlign: "center" }}>
        {value} {label}
      </span>
      <button
        onClick={() => onChange(clamp(value + step, min, max))}
        style={{
          width: 24, height: 24, borderRadius: 6,
          border: "1px solid var(--outline-v)",
          background: "var(--s-mid)", color: "var(--on-s)",
          cursor: "pointer", fontSize: 14, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >+</button>
    </div>
  );
}

/* ─── global BPM confirm button ─── */
function BpmGlobalBtn({ label, delta, onApply }) {
  const [state, setState] = useState("idle"); // idle | confirm | done
  const timerRef = useRef(null);

  const handleClick = () => {
    if (state === "idle") {
      setState("confirm");
      timerRef.current = setTimeout(() => setState("idle"), 3000);
    } else if (state === "confirm") {
      clearTimeout(timerRef.current);
      setState("done");
      onApply(delta);
      setTimeout(() => setState("idle"), 1200);
    }
  };

  const bg =
    state === "confirm" ? "rgba(255,191,0,0.18)" :
    state === "done"    ? "rgba(34,197,94,0.18)" :
    "var(--glass)";
  const color =
    state === "confirm" ? "var(--amber)" :
    state === "done"    ? "var(--green)" :
    "var(--on-sv)";
  const text =
    state === "confirm" ? "¿Confirmar?" :
    state === "done"    ? "SÍ ✓" :
    label;

  return (
    <button
      className="hl"
      onClick={handleClick}
      style={{
        padding: "6px 12px", borderRadius: 8,
        border: "1px solid var(--glass-border)",
        background: bg, color, fontSize: 11, fontWeight: 700,
        cursor: "pointer", transition: "all 0.15s",
        letterSpacing: "0.06em",
      }}
    >
      {text}
    </button>
  );
}

/* ─── inline add-block menu ─── */
function AddMenu({ exercises, onAdd, onClose }) {
  const [step, setStep] = useState("type"); // "type" | "exercise"

  const addType = (type) => {
    if (type === "exercise") { setStep("exercise"); return; }
    onAdd({ id: uid(), type, bars: 4, seconds: 10 });
    onClose();
  };

  if (step === "type") {
    return (
      <div style={{
        background: "rgba(30,30,40,0.95)", border: "1px solid var(--glass-border)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderRadius: 10, padding: "6px 0", minWidth: 140,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 100,
      }}>
        {[
          { label: "Ejercicio", icon: "fitness_center", type: "exercise" },
          { label: "Warm-up",   icon: "directions_run", type: "warmup" },
          { label: "Descanso",  icon: "hourglass_empty", type: "rest" },
        ].map(opt => (
          <button
            key={opt.type}
            onClick={() => addType(opt.type)}
            style={{
              width: "100%", textAlign: "left", padding: "8px 14px",
              background: "none", border: "none", cursor: "pointer",
              color: "var(--on-s)", display: "flex", alignItems: "center", gap: 8,
              fontSize: 13,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <MI style={{ fontSize: 16 }}>{opt.icon}</MI>
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  // exercise picker
  const cats = {};
  exercises.forEach(ex => {
    const cat = ex.categoryId || "sin-cat";
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(ex);
  });

  return (
    <div style={{
      background: "rgba(30,30,40,0.95)", border: "1px solid var(--glass-border)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      borderRadius: 10, padding: 8, minWidth: 220, maxHeight: 260,
      overflowY: "auto", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    }}>
      <button
        onClick={() => setStep("type")}
        style={{ background: "none", border: "none", color: "var(--amber)", cursor: "pointer", fontSize: 11, marginBottom: 6, padding: "0 4px" }}
      >
        ← volver
      </button>
      {exercises.length === 0 && (
        <div style={{ color: "var(--outline)", fontSize: 12, padding: "8px 4px" }}>Sin ejercicios</div>
      )}
      {Object.entries(cats).map(([catId, exs]) => (
        <div key={catId}>
          {exs.map(ex => (
            <button
              key={ex.id}
              onClick={() => { onAdd({ id: uid(), type: "exercise", exerciseId: ex.id }); onClose(); }}
              style={{
                width: "100%", textAlign: "left", padding: "7px 10px",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--on-s)", fontSize: 13, borderRadius: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              {ex.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── main component ─── */
export default function RoutineTimeline({ data, setData, logs, showToast, onStartRoutine }) {
  const [blocks, setBlocksState] = useState(() => data.routineBlocks || []);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [addMenuIdx, setAddMenuIdx] = useState(null); // index of gap where + was clicked, -1 = top
  const pointerStartY = useRef(0);
  const rowRefs = useRef([]);
  const draggingIdxRef = useRef(null);

  const saveBlocks = useCallback((nb) => {
    setBlocksState(nb);
    const nd = { ...data, routineBlocks: nb };
    setData(nd);
    saveData(nd);
  }, [data, setData]);

  /* ─── drag & drop ─── */
  const onHandlePointerDown = (e, idx) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerStartY.current = e.clientY;
    draggingIdxRef.current = idx;
    setDragIdx(idx);
    setDragOverIdx(idx);
  };

  const onHandlePointerMove = (e) => {
    if (draggingIdxRef.current === null) return;
    const { clientY } = e;
    // find new index based on row positions
    let best = draggingIdxRef.current;
    rowRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid && i < best) best = i;
      else if (clientY > mid && i > best) best = i;
    });
    setDragOverIdx(best);
  };

  const onHandlePointerUp = (e) => {
    const from = draggingIdxRef.current;
    const to = dragOverIdx;
    if (from !== null && to !== null && from !== to) {
      const nb = [...blocks];
      const [item] = nb.splice(from, 1);
      nb.splice(to, 0, item);
      saveBlocks(nb);
    }
    draggingIdxRef.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  };

  /* ─── BPM global apply ─── */
  const applyGlobalBpm = (delta) => {
    const exs = (data.exercises || []).map(ex => ({
      ...ex,
      currentBPM: clamp((ex.currentBPM || ex.bpm || 80) + delta, 20, 300),
      bpm: ex.velocityMode === "fixed" ? clamp((ex.bpm || 80) + delta, 20, 300) : ex.bpm,
      bpmStart: ex.velocityMode === "ramp" ? clamp((ex.bpmStart || 60) + delta, 20, 300) : ex.bpmStart,
      bpmEnd:   ex.velocityMode === "ramp" ? clamp((ex.bpmEnd   || 100) + delta, 20, 300) : ex.bpmEnd,
    }));
    const nd = { ...data, exercises: exs };
    setData(nd);
    saveData(nd);
    showToast && showToast(`BPM global ${delta > 0 ? "+" : ""}${delta} aplicado`, "success");
  };

  /* ─── block mutations ─── */
  const deleteBlock = (idx) => {
    saveBlocks(blocks.filter((_, i) => i !== idx));
  };

  const updateBlock = (idx, patch) => {
    const nb = blocks.map((b, i) => i === idx ? { ...b, ...patch } : b);
    saveBlocks(nb);
  };

  const insertBlock = (afterIdx, block) => {
    const nb = [...blocks];
    nb.splice(afterIdx + 1, 0, block);
    saveBlocks(nb);
    setAddMenuIdx(null);
  };

  const insertAtTop = (block) => {
    saveBlocks([block, ...blocks]);
    setAddMenuIdx(null);
  };

  /* ─── duration calc ─── */
  const estimatedSeconds = blocks.reduce((acc, b) => {
    if (b.type === "rest") return acc + (b.seconds || 10);
    if (b.type === "warmup") {
      const ex0 = data.exercises?.[0];
      const bpm = ex0?.currentBPM || ex0?.bpm || 80;
      return acc + (b.bars || 4) * 4 * (60 / bpm);
    }
    if (b.type === "exercise") {
      const ex = (data.exercises || []).find(e => e.id === b.exerciseId);
      return acc + (ex?.durationSeconds || 60);
    }
    return acc;
  }, 0);

  const hasWarmup = blocks.some(b => b.type === "warmup");
  const exList = data.exercises || [];

  /* ─── render block content ─── */
  const renderBlockContent = (block, idx) => {
    if (block.type === "exercise") {
      const ex = exList.find(e => e.id === block.exerciseId);
      const exIdx = exList.filter((_, i) => blocks.slice(0, idx + 1).filter(b => b.type === "exercise" && (b.exerciseId ? exList.findIndex(e => e.id === b.exerciseId) <= i : false)).length > 0).indexOf(ex);
      const orderNum = blocks.slice(0, idx + 1).filter(b => b.type === "exercise").length;
      return (
        <div style={{ flex: 1, overflow: "hidden" }}>
          {ex ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--amber)", fontWeight: 700 }}>
                  #{orderNum}
                </span>
                <span className="hl" style={{ fontSize: 14, fontWeight: 700, color: "var(--on-s)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {block.label || ex.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {ex.velocityMode === "ramp" ? (
                  <Badge color="var(--amber)">{ex.bpmStart || 60}→{ex.bpmEnd || 100} BPM</Badge>
                ) : (
                  <Badge color="var(--amber)">{ex.currentBPM || ex.bpm || 80} BPM</Badge>
                )}
                {ex.durationSeconds && <Badge color="var(--outline)">{fmtDur(ex.durationSeconds)}</Badge>}
                <Badge color={ex.velocityMode === "ramp" ? "var(--cyan)" : "var(--purple)"}>
                  {ex.velocityMode === "ramp" ? "RAMPA" : "FIJO"}
                </Badge>
              </div>
            </>
          ) : (
            <span style={{ color: "var(--outline)", fontSize: 13, fontStyle: "italic" }}>Sin ejercicio</span>
          )}
        </div>
      );
    }

    if (block.type === "warmup") {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <span className="hl" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--cyan)", minWidth: 60 }}>
            WARM-UP
          </span>
          <Stepper
            value={block.bars || 4}
            min={1} max={32}
            onChange={v => updateBlock(idx, { bars: v })}
            label="compases"
          />
        </div>
      );
    }

    if (block.type === "rest") {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <span className="hl" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--amber)", minWidth: 60 }}>
            REST
          </span>
          <Stepper
            value={block.seconds || 10}
            min={5} max={300} step={5}
            onChange={v => updateBlock(idx, { seconds: v })}
            label="seg"
          />
        </div>
      );
    }
    return null;
  };

  /* ─── add gap button ─── */
  const GapBtn = ({ gapIdx }) => (
    <div style={{ position: "relative", display: "flex", justifyContent: "center", zIndex: 10 }}>
      <button
        onClick={() => setAddMenuIdx(gapIdx === addMenuIdx ? null : gapIdx)}
        style={{
          padding: "2px 16px", borderRadius: 20,
          border: "1px dashed var(--outline-v)",
          background: "var(--s-deep)", color: "var(--outline)",
          fontSize: 10, fontWeight: 700, cursor: "pointer",
          letterSpacing: "0.1em", transition: "all 0.15s",
          opacity: 0.7,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.borderColor = "var(--amber)"; e.currentTarget.style.color = "var(--amber)"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.borderColor = "var(--outline-v)"; e.currentTarget.style.color = "var(--outline)"; }}
      >
        + ADD
      </button>
      {addMenuIdx === gapIdx && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", zIndex: 200 }}>
          <AddMenu
            exercises={exList}
            onAdd={block => insertBlock(gapIdx, block)}
            onClose={() => setAddMenuIdx(null)}
          />
        </div>
      )}
    </div>
  );

  /* ─── render ─── */
  return (
    <div
      className="no-sb"
      style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--bg)", display: "flex", flexDirection: "column" }}
      onClick={e => {
        if (addMenuIdx !== null && !e.target.closest("[data-addmenu]")) setAddMenuIdx(null);
      }}
    >
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(8,8,12,0.92)", padding: "24px 20px 16px",
        borderBottom: "1px solid var(--glass-border)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 className="hl" style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: "-0.03em", background: "linear-gradient(135deg, var(--accent-routine), #0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              THE ROUTINE
            </h1>
            <p style={{ margin: "4px 0 12px", color: "var(--outline)", fontSize: 12 }}>
              {blocks.filter(b => b.type === "exercise").length} ejercicios ·{" "}
              {Math.ceil(estimatedSeconds / 60)} minutos
            </p>
          </div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setAddMenuIdx(addMenuIdx === -1 ? null : -1)}
              className="hl"
              style={{
                padding: "8px 14px", borderRadius: 12, border: "1px solid rgba(6,182,212,0.35)",
                background: "rgba(6,182,212,0.1)", color: "var(--accent-routine)",
                fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span className="msym" style={{ fontSize: 16 }}>add</span>
              Agregar
            </button>
            {addMenuIdx === -1 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200 }}>
                <AddMenu
                  exercises={exList}
                  onAdd={block => insertBlock(-1, block)}
                  onClose={() => setAddMenuIdx(null)}
                />
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "−1 BPM", delta: -1 },
            { label: "+1 BPM", delta: 1 },
            { label: "+5 BPM", delta: 5 },
          ].map(({ label, delta }) => (
            <BpmGlobalBtn key={label} label={label} delta={delta} onApply={applyGlobalBpm} />
          ))}
        </div>
      </div>

      {/* Timeline body */}
      <div style={{ padding: "0 16px 0", paddingBottom: "calc(var(--nav-h) + 16px)", flex: 1 }}>
        {/* Top: add warmup */}
        {!hasWarmup && (
          <div style={{ paddingTop: 16, paddingBottom: 8 }}>
            <button
              onClick={() => insertAtTop({ id: uid(), type: "warmup", bars: 4 })}
              style={{
                width: "100%", padding: "10px", borderRadius: 10,
                border: "1px dashed var(--cyan)", background: "rgba(6,182,212,0.04)",
                color: "var(--cyan)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                letterSpacing: "0.1em",
              }}
            >
              + ADD WARMUP
            </button>
          </div>
        )}

        {/* Gap at top (above first block) */}
        {blocks.length > 0 && (
          <div style={{ paddingTop: hasWarmup ? 16 : 4, paddingBottom: 4 }}>
            <GapBtn gapIdx={-1} />
          </div>
        )}

        {blocks.map((block, idx) => {
          const isDragging = dragIdx === idx;
          const isTarget   = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;

          const blockBg =
            block.type === "warmup" ? "rgba(6,182,212,0.08)" :
            block.type === "rest"   ? "rgba(255,191,0,0.06)" :
            "var(--s-low)";
          const blockBorderL =
            block.type === "warmup" ? "var(--cyan)" :
            block.type === "rest"   ? "var(--amber)" :
            "var(--outline-v)";
          const blockH =
            block.type === "exercise" ? 80 : 60;

          return (
            <div key={block.id}>
              {/* Drop indicator */}
              {isTarget && dragOverIdx < (dragIdx ?? 0) && (
                <div style={{ height: 2, background: "var(--amber)", borderRadius: 2, margin: "2px 0" }} />
              )}

              {/* Block row */}
              <div
                ref={el => (rowRefs.current[idx] = el)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  height: blockH, padding: "0 10px 0 0",
                  background: blockBg,
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: `1px solid ${blockBorderL}40`,
                  borderLeft: `3px solid ${blockBorderL}`,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
                  borderRadius: 10, marginBottom: 2,
                  opacity: isDragging ? 0.4 : 1,
                  transition: "opacity 0.12s",
                  animation: "fadeUp 0.2s ease",
                }}
              >
                {/* Drag handle */}
                <div
                  onPointerDown={e => onHandlePointerDown(e, idx)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  style={{ cursor: "grab", padding: "0 4px 0 8px", color: "var(--outline)", display: "flex", alignItems: "center" }}
                >
                  <MI style={{ fontSize: 18 }}>drag_indicator</MI>
                </div>

                {/* Content */}
                {renderBlockContent(block, idx)}

                {/* Delete */}
                <IBtn onClick={() => deleteBlock(idx)} title="Eliminar" style={{ color: "var(--red)", flexShrink: 0 }}>
                  <MI style={{ fontSize: 18, color: "var(--red)" }}>delete</MI>
                </IBtn>
              </div>

              {/* Drop indicator after */}
              {isTarget && dragOverIdx > (dragIdx ?? 0) && (
                <div style={{ height: 2, background: "var(--amber)", borderRadius: 2, margin: "2px 0" }} />
              )}

              {/* Gap between blocks */}
              <div style={{ paddingBottom: 4, paddingTop: 4 }}>
                <GapBtn gapIdx={idx} />
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {blocks.length === 0 && (
          <div style={{ textAlign: "center", paddingTop: 60, color: "var(--outline)" }}>
            <MI style={{ fontSize: 56, display: "block", marginBottom: 12 }}>playlist_add</MI>
            <p className="hl" style={{ fontSize: 14, margin: 0 }}>Sin bloques. Agrega ejercicios.</p>
            <div style={{ marginTop: 16, position: "relative", display: "inline-block" }}>
              <button
                onClick={() => setAddMenuIdx(-99)}
                style={{
                  padding: "10px 24px", borderRadius: 12,
                  border: "1px solid var(--amber)", background: "rgba(255,191,0,0.1)",
                  color: "var(--amber)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                + AGREGAR BLOQUE
              </button>
              {addMenuIdx === -99 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 200 }}>
                  <AddMenu
                    exercises={exList}
                    onAdd={block => { saveBlocks([block]); setAddMenuIdx(null); }}
                    onClose={() => setAddMenuIdx(null)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer — INICIAR RUTINA */}
      {blocks.length > 0 && (
        <div style={{
          position: "sticky", bottom: 0,
          background: "rgba(8,8,12,0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid var(--glass-border)",
          padding: "12px 20px",
          paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
        }}>
          <button
            className="hl"
            onClick={onStartRoutine}
            style={{
              width: "100%", padding: "16px", borderRadius: 14,
              background: "linear-gradient(135deg, #06b6d4, #0ea5e9)",
              border: "none", color: "#fff",
              fontSize: 14, fontWeight: 800, cursor: "pointer",
              letterSpacing: "0.06em",
              boxShadow: "0 4px 20px rgba(6,182,212,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <span className="msym" style={{ fontSize: 20 }}>play_arrow</span>
            INICIAR RUTINA
          </button>
        </div>
      )}
    </div>
  );
}
