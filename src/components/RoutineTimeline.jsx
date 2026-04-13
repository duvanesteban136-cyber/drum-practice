import { useState, useRef, useCallback } from "react";
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
  const [state, setState] = useState("idle");
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

  const bg    = state === "confirm" ? "rgba(255,191,0,0.18)" : state === "done" ? "rgba(34,197,94,0.18)" : "var(--glass)";
  const color = state === "confirm" ? "var(--amber)" : state === "done" ? "var(--green)" : "var(--on-sv)";
  const text  = state === "confirm" ? "¿Confirmar?" : state === "done" ? "SÍ ✓" : label;

  return (
    <button className="hl" onClick={handleClick}
      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--glass-border)", background: bg, color, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.06em" }}>
      {text}
    </button>
  );
}

/* ─── AddMenu (inline dropdown) ─── */
function AddMenu({ exercises, fills, songs, onAdd, onClose }) {
  const [step, setStep] = useState("type"); // "type" | "exercise" | "fill" | "song"

  const addType = (type) => {
    if (type === "exercise" || type === "fill" || type === "song") {
      setStep(type);
      return;
    }
    onAdd({ id: uid(), type, bars: 4, seconds: 10 });
    onClose();
  };

  /* ── type picker ── */
  if (step === "type") {
    return (
      <div style={{
        background: "rgba(30,30,40,0.97)", border: "1px solid var(--glass-border)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderRadius: 10, padding: "6px 0", minWidth: 160,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)", zIndex: 100,
      }}>
        {[
          { label: "Ejercicio",    icon: "fitness_center",  type: "exercise" },
          { label: "Fill / Groove",icon: "queue_music",     type: "fill"     },
          { label: "Canción",      icon: "library_music",   type: "song"     },
          { label: "Warm-up",      icon: "directions_run",  type: "warmup"   },
          { label: "Descanso",     icon: "hourglass_empty", type: "rest"     },
        ].map(opt => (
          <button key={opt.type} onClick={() => addType(opt.type)}
            style={{ width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--on-s)", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
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

  /* ── exercise / fill / song pickers ── */
  const pickerItems =
    step === "exercise" ? exercises :
    step === "fill"     ? fills :
    songs;

  const emptyMsg =
    step === "exercise" ? "Sin ejercicios en el Vault" :
    step === "fill"     ? "Sin fills en el Vault" :
    "Sin canciones en el Vault";

  return (
    <div style={{
      background: "rgba(30,30,40,0.97)", border: "1px solid var(--glass-border)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      borderRadius: 10, padding: 8, minWidth: 230, maxHeight: 280,
      overflowY: "auto", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    }}>
      <button onClick={() => setStep("type")}
        style={{ background: "none", border: "none", color: "var(--amber)", cursor: "pointer", fontSize: 11, marginBottom: 6, padding: "0 4px" }}>
        ← volver
      </button>
      {pickerItems.length === 0 && (
        <div style={{ color: "var(--outline)", fontSize: 12, padding: "8px 4px" }}>{emptyMsg}</div>
      )}
      {pickerItems.map(item => (
        <button key={item.id}
          onClick={() => {
            onAdd({ id: uid(), type: step, refId: item.id });
            onClose();
          }}
          style={{ width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", cursor: "pointer", color: "var(--on-s)", fontSize: 13, borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <span style={{ fontWeight: 700 }}>{item.name}</span>
          {item.artist && <span style={{ fontSize: 11, color: "var(--outline)", marginLeft: 6 }}>{item.artist}</span>}
          {item.type   && <span style={{ fontSize: 10, color: "var(--outline)", marginLeft: 6, textTransform: "uppercase" }}>{item.type}</span>}
        </button>
      ))}
    </div>
  );
}

/* ─── Routine picker header ─── */
function RoutinePicker({ routines, activeId, onSelect, onCreate, onRename, onDelete }) {
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  const startRename = (r) => {
    setRenaming(r.id);
    setRenameVal(r.name);
  };

  const commitRename = () => {
    if (renameVal.trim()) onRename(renaming, renameVal.trim());
    setRenaming(null);
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {routines.map(r => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {renaming === r.id ? (
            <input
              autoFocus
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid var(--amber)",
                borderRadius: 8, color: "var(--amber)", fontSize: 11, fontWeight: 700,
                padding: "5px 10px", outline: "none", maxWidth: 120,
              }}
            />
          ) : (
            <button
              onClick={() => onSelect(r.id)}
              onDoubleClick={() => startRename(r)}
              title="Toca para seleccionar · doble toque para renombrar"
              className="hl"
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                border: activeId === r.id ? "1px solid rgba(6,182,212,0.6)" : "1px solid var(--outline-v)",
                background: activeId === r.id ? "rgba(6,182,212,0.15)" : "var(--glass)",
                color: activeId === r.id ? "var(--cyan)" : "var(--on-sv)",
                transition: "all 0.12s",
              }}
            >
              {r.name}
            </button>
          )}
          {activeId === r.id && routines.length > 1 && (
            <IBtn onClick={() => onDelete(r.id)} title="Eliminar esta rutina" style={{ padding: 3, color: "var(--red)" }}>
              <MI style={{ fontSize: 14, color: "var(--red)" }}>close</MI>
            </IBtn>
          )}
        </div>
      ))}
      <IBtn onClick={onCreate} title="Nueva rutina" style={{ padding: 4, color: "var(--cyan)" }}>
        <MI style={{ fontSize: 18, color: "var(--cyan)" }}>add_circle_outline</MI>
      </IBtn>
    </div>
  );
}

/* ─── main component ─── */
export default function RoutineTimeline({ data, setData, logs, showToast, onStartRoutine }) {

  /* ── Derive routines directly from data — NO internal state for routines ──
     This ensures that when exercises are added/modified in Vault, they appear here immediately.
     We only keep UI state (which routine is selected, drag state, add menu) locally. */

  const getRoutines = () => {
    // If data has routines array with entries, use it
    if (data.routines && data.routines.length > 0) return data.routines;
    // Migrate legacy routineBlocks → single routine
    return [{ id: "default-routine", name: "Mi rutina", blocks: data.routineBlocks || [] }];
  };

  const routines = getRoutines();

  /* ── Active routine ID — persisted in data so it survives re-renders ── */
  const activeRoutineId = data._activeRoutineId || routines[0]?.id || "default-routine";

  const setActiveRoutineId = (id) => {
    setData({ ...data, _activeRoutineId: id });
  };

  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [addMenuIdx, setAddMenuIdx] = useState(null);
  const pointerStartY = useRef(0);
  const rowRefs = useRef([]);
  const draggingIdxRef = useRef(null);

  const activeRoutine = routines.find(r => r.id === activeRoutineId) || routines[0] || { id: "default-routine", name: "Mi rutina", blocks: [] };
  const blocks = activeRoutine?.blocks || [];

  /* ── Save helpers — always write through to data ── */
  const saveRoutines = useCallback((newRoutines) => {
    setData({ ...data, routines: newRoutines, routineBlocks: undefined });
  }, [data, setData]);

  const saveBlocks = useCallback((nb) => {
    // Find the active routine; if it came from migration (no data.routines), create the routines array now
    const currentRoutines = (data.routines && data.routines.length > 0)
      ? data.routines
      : [{ id: activeRoutine.id, name: activeRoutine.name, blocks: [] }];

    const exists = currentRoutines.some(r => r.id === activeRoutine.id);
    const newRoutines = exists
      ? currentRoutines.map(r => r.id === activeRoutine.id ? { ...r, blocks: nb } : r)
      : [...currentRoutines, { ...activeRoutine, blocks: nb }];

    setData({ ...data, routines: newRoutines, routineBlocks: undefined });
  }, [data, setData, activeRoutine]);

  /* ── Routine CRUD ── */
  const createRoutine = () => {
    const r = { id: uid(), name: `Rutina ${routines.length + 1}`, blocks: [] };
    const newRoutines = [...routines, r];
    setData({ ...data, routines: newRoutines, routineBlocks: undefined, _activeRoutineId: r.id });
    showToast && showToast("Rutina creada");
  };

  const renameRoutine = (id, name) => {
    saveRoutines(routines.map(r => r.id === id ? { ...r, name } : r));
  };

  const deleteRoutine = (id) => {
    if (routines.length <= 1) { showToast && showToast("No puedes borrar la única rutina", "info"); return; }
    const newRoutines = routines.filter(r => r.id !== id);
    setData({ ...data, routines: newRoutines, routineBlocks: undefined, _activeRoutineId: newRoutines[0].id });
    showToast && showToast("Rutina eliminada", "info");
  };

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
    let best = draggingIdxRef.current;
    rowRefs.current.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mid  = rect.top + rect.height / 2;
      if (clientY < mid && i < best) best = i;
      else if (clientY > mid && i > best) best = i;
    });
    setDragOverIdx(best);
  };

  const onHandlePointerUp = () => {
    const from = draggingIdxRef.current;
    const to   = dragOverIdx;
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
      bpm:     ex.velocityMode === "fixed" ? clamp((ex.bpm     || 80)  + delta, 20, 300) : ex.bpm,
      bpmStart:ex.velocityMode === "ramp"  ? clamp((ex.bpmStart|| 60)  + delta, 20, 300) : ex.bpmStart,
      bpmEnd:  ex.velocityMode === "ramp"  ? clamp((ex.bpmEnd  || 100) + delta, 20, 300) : ex.bpmEnd,
    }));
    setData({ ...data, exercises: exs });
    showToast && showToast(`BPM global ${delta > 0 ? "+" : ""}${delta} aplicado`, "success");
  };

  /* ─── block mutations ─── */
  const deleteBlock  = (idx) => saveBlocks(blocks.filter((_, i) => i !== idx));
  const updateBlock  = (idx, patch) => saveBlocks(blocks.map((b, i) => i === idx ? { ...b, ...patch } : b));

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
  const exList   = data.exercises || [];
  const fillList = data.fills     || [];
  const songList = data.songs     || [];

  const estimatedSeconds = blocks.reduce((acc, b) => {
    if (b.type === "rest")     return acc + (b.seconds || 10);
    if (b.type === "warmup") {
      const ex0 = exList[0];
      const bpm = ex0?.currentBPM || ex0?.bpm || 80;
      return acc + (b.bars || 4) * 4 * (60 / bpm);
    }
    if (b.type === "exercise") {
      const ex = exList.find(e => e.id === (b.refId || b.exerciseId));
      return acc + (ex?.durationSeconds || 60);
    }
    return acc;
  }, 0);

  const hasWarmup = blocks.some(b => b.type === "warmup");

  /* ─── render block content ─── */
  const renderBlockContent = (block, idx) => {

    if (block.type === "exercise") {
      const ex = exList.find(e => e.id === (block.refId || block.exerciseId));
      const orderNum = blocks.slice(0, idx + 1).filter(b => b.type === "exercise").length;
      return (
        <div style={{ flex: 1, overflow: "hidden" }}>
          {ex ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--amber)", fontWeight: 700 }}>#{orderNum}</span>
                <span className="hl" style={{ fontSize: 14, fontWeight: 700, color: "var(--on-s)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {block.label || ex.name}
                </span>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {ex.velocityMode === "ramp"
                  ? <Badge color="var(--amber)">{ex.bpmStart || 60}→{ex.bpmEnd || 100} BPM</Badge>
                  : <Badge color="var(--amber)">{ex.currentBPM || ex.bpm || 80} BPM</Badge>}
                {ex.durationSeconds && <Badge color="var(--outline)">{fmtDur(ex.durationSeconds)}</Badge>}
                <Badge color={ex.velocityMode === "ramp" ? "var(--cyan)" : "var(--purple)"}>
                  {ex.velocityMode === "ramp" ? "RAMPA" : "FIJO"}
                </Badge>
              </div>
            </>
          ) : (
            <span style={{ color: "var(--outline)", fontSize: 13, fontStyle: "italic" }}>Ejercicio eliminado</span>
          )}
        </div>
      );
    }

    if (block.type === "fill") {
      const fill = fillList.find(f => f.id === block.refId);
      return (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span className="hl" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--amber)", minWidth: 32 }}>FILL</span>
            <span className="hl" style={{ fontSize: 14, fontWeight: 700, color: "var(--on-s)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {fill ? (block.label || fill.name) : <span style={{ color: "var(--outline)", fontStyle: "italic" }}>Fill eliminado</span>}
            </span>
          </div>
          {fill && <Badge color="var(--amber)">{fill.type?.toUpperCase() || "FILL"}</Badge>}
        </div>
      );
    }

    if (block.type === "song") {
      const song = songList.find(s => s.id === block.refId);
      return (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span className="hl" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--green)", minWidth: 36 }}>SONG</span>
            <span className="hl" style={{ fontSize: 14, fontWeight: 700, color: "var(--on-s)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {song ? (block.label || song.name) : <span style={{ color: "var(--outline)", fontStyle: "italic" }}>Canción eliminada</span>}
            </span>
          </div>
          {song?.artist && <Badge color="var(--outline)">{song.artist}</Badge>}
          {song?.bpm    && <Badge color="var(--amber)">{song.bpm} BPM</Badge>}
        </div>
      );
    }

    if (block.type === "warmup") {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <span className="hl" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--cyan)", minWidth: 60 }}>WARM-UP</span>
          <Stepper value={block.bars || 4} min={1} max={32} onChange={v => updateBlock(idx, { bars: v })} label="compases" />
        </div>
      );
    }

    if (block.type === "rest") {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
          <span className="hl" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--amber)", minWidth: 60 }}>REST</span>
          <Stepper value={block.seconds || 10} min={5} max={300} step={5} onChange={v => updateBlock(idx, { seconds: v })} label="seg" />
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
          letterSpacing: "0.1em", transition: "all 0.15s", opacity: 0.7,
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
            fills={fillList}
            songs={songList}
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
        background: "rgba(8,8,12,0.92)", padding: "20px 20px 14px",
        borderBottom: "1px solid var(--glass-border)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <h1 className="hl" style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.03em", background: "linear-gradient(135deg, var(--accent-routine), #0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            THE ROUTINE
          </h1>
          <span style={{ fontSize: 11, color: "var(--outline)", paddingTop: 4 }}>
            {blocks.filter(b => b.type === "exercise").length} ej · {Math.ceil(estimatedSeconds / 60)} min
          </span>
        </div>

        {/* Routine picker */}
        <RoutinePicker
          routines={routines}
          activeId={activeRoutineId}
          onSelect={id => { setActiveRoutineId(id); setAddMenuIdx(null); }}
          onCreate={createRoutine}
          onRename={renameRoutine}
          onDelete={deleteRoutine}
        />

        {/* BPM global */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {[{ label: "−1 BPM", delta: -1 }, { label: "+1 BPM", delta: 1 }, { label: "+5 BPM", delta: 5 }].map(({ label, delta }) => (
            <BpmGlobalBtn key={label} label={label} delta={delta} onApply={applyGlobalBpm} />
          ))}
        </div>
      </div>

      {/* Timeline body */}
      <div style={{ padding: "0 16px", paddingBottom: "calc(var(--nav-h) + 16px)", flex: 1 }}>

        {/* Add warmup */}
        {!hasWarmup && (
          <div style={{ paddingTop: 16, paddingBottom: 8 }}>
            <button
              onClick={() => insertAtTop({ id: uid(), type: "warmup", bars: 4 })}
              style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px dashed var(--cyan)", background: "rgba(6,182,212,0.04)", color: "var(--cyan)", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: "0.1em" }}>
              + ADD WARMUP
            </button>
          </div>
        )}

        {/* Gap at top */}
        {blocks.length > 0 && (
          <div style={{ paddingTop: hasWarmup ? 16 : 4, paddingBottom: 4 }}>
            <GapBtn gapIdx={-1} />
          </div>
        )}

        {blocks.map((block, idx) => {
          const isDragging = dragIdx === idx;
          const isTarget   = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;

          const blockBg = block.type === "warmup" ? "rgba(6,182,212,0.08)" : block.type === "rest" ? "rgba(255,191,0,0.06)" : block.type === "fill" ? "rgba(168,85,247,0.07)" : block.type === "song" ? "rgba(34,197,94,0.07)" : "var(--s-low)";
          const blockBorderL = block.type === "warmup" ? "var(--cyan)" : block.type === "rest" ? "var(--amber)" : block.type === "fill" ? "var(--purple)" : block.type === "song" ? "var(--green)" : "var(--outline-v)";
          const blockH = (block.type === "exercise" || block.type === "fill" || block.type === "song") ? 80 : 60;

          return (
            <div key={block.id}>
              {isTarget && dragOverIdx < (dragIdx ?? 0) && (
                <div style={{ height: 2, background: "var(--amber)", borderRadius: 2, margin: "2px 0" }} />
              )}
              <div
                ref={el => (rowRefs.current[idx] = el)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  height: blockH, padding: "0 10px 0 0",
                  background: blockBg, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                  border: `1px solid ${blockBorderL}40`, borderLeft: `3px solid ${blockBorderL}`,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
                  borderRadius: 10, marginBottom: 2,
                  opacity: isDragging ? 0.4 : 1, transition: "opacity 0.12s",
                  animation: "fadeUp 0.2s ease",
                }}
              >
                <div
                  onPointerDown={e => onHandlePointerDown(e, idx)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  style={{ cursor: "grab", padding: "0 4px 0 8px", color: "var(--outline)", display: "flex", alignItems: "center" }}
                >
                  <MI style={{ fontSize: 18 }}>drag_indicator</MI>
                </div>
                {renderBlockContent(block, idx)}
                <IBtn onClick={() => deleteBlock(idx)} title="Eliminar" style={{ color: "var(--red)", flexShrink: 0 }}>
                  <MI style={{ fontSize: 18, color: "var(--red)" }}>delete</MI>
                </IBtn>
              </div>
              {isTarget && dragOverIdx > (dragIdx ?? 0) && (
                <div style={{ height: 2, background: "var(--amber)", borderRadius: 2, margin: "2px 0" }} />
              )}
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
            <p className="hl" style={{ fontSize: 14, margin: 0 }}>Rutina vacía. Agrega bloques.</p>
            <div style={{ marginTop: 16, position: "relative", display: "inline-block" }}>
              <button
                onClick={() => setAddMenuIdx(-99)}
                style={{ padding: "10px 24px", borderRadius: 12, border: "1px solid var(--amber)", background: "rgba(255,191,0,0.1)", color: "var(--amber)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                + AGREGAR BLOQUE
              </button>
              {addMenuIdx === -99 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 200 }}>
                  <AddMenu
                    exercises={exList}
                    fills={fillList}
                    songs={songList}
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
          background: "rgba(8,8,12,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid var(--glass-border)", padding: "12px 20px",
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
