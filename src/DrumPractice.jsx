import { useState, useEffect, useRef, Component } from "react";
import { loadData, saveData, loadLogs, saveLogs } from "./lib/storage.js";
import { supabase, cloudSaveData, cloudLoadData, cloudSaveLogs, cloudLoadLogs } from "./lib/supabase.js";
import {
  getToday, getTodayIdx, calcStreak, uid, clamp,
  DAYS_FULL, DAYS, calcWeekCompletion, fmtDur,
  DEFAULT_CATEGORIES,
} from "./lib/constants.js";
import { useMetronome } from "./hooks/useMetronome.js";
import FreeMetronome from "./components/FreeMetronome.jsx";
import PracticeSession from "./components/PracticeSession.jsx";
import RoutineTimeline from "./components/RoutineTimeline.jsx";
import Vault from "./components/Vault.jsx";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ═══════════════════════════════════════════════
   ErrorBoundary
═══════════════════════════════════════════════ */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: "" };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, errorMsg: String(err?.message || err) };
  }
  componentDidCatch(err, info) {
    console.error("ErrorBoundary:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 12, background: "#1a0505" }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p style={{ color: "#ff6b6b", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
            ERROR — copia este texto:
          </p>
          <p style={{ color: "#ffbf00", fontSize: 11, textAlign: "center", wordBreak: "break-all", maxWidth: 300, background: "rgba(0,0,0,0.5)", padding: 10, borderRadius: 8 }}>
            {this.state.errorMsg}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, errorMsg: "" })}
            style={{ padding: "10px 20px", borderRadius: 999, background: "#ffbf00", border: "none", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Material Icon helper ─── */
function MI({ children, style }) {
  return (
    <span className="msym" style={{ fontSize: 20, lineHeight: 1, userSelect: "none", ...style }}>
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   Aurora background component
═══════════════════════════════════════════════ */
function Aurora({ color1, color2 }) {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      <div
        className="aurora-a"
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: color1,
          filter: "blur(90px)",
          opacity: 0.07,
          top: -150,
          right: -100,
        }}
      />
      <div
        className="aurora-b"
        style={{
          position: "absolute",
          width: 350,
          height: 350,
          borderRadius: "50%",
          background: color2,
          filter: "blur(80px)",
          opacity: 0.05,
          bottom: "5%",
          left: -80,
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Aurora config per tab
═══════════════════════════════════════════════ */
const AURORA_MAP = {
  home:     { color1: "#ffbf00", color2: "#ff8c00" },
  practice: { color1: "#ffbf00", color2: "#ff8c00" },
  routine:  { color1: "#06b6d4", color2: "#0ea5e9" },
  vault:    { color1: "#a855f7", color2: "#7c3aed" },
  progress: { color1: "#22c55e", color2: "#16a34a" },
};

/* ═══════════════════════════════════════════════
   useToast hook
═══════════════════════════════════════════════ */
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = (msg, type = "success") => {
    clearTimeout(timerRef.current);
    setToast({ msg, type, id: Date.now() });
    timerRef.current = setTimeout(() => setToast(null), 2400);
  };
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { toast, show };
}

/* ═══════════════════════════════════════════════
   Toast component
═══════════════════════════════════════════════ */
function Toast({ toast }) {
  if (!toast) return null;
  const bg =
    toast.type === "error" ? "#f43f5e" :
    toast.type === "info"  ? "#ffbf00" :
    "#22c55e";
  const icon =
    toast.type === "error" ? "close" :
    toast.type === "info"  ? "info" :
    "check_circle";
  return (
    <div
      key={toast.id}
      style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(15,15,20,0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${bg}40`,
        color: "#F0EDE8",
        padding: "12px 20px",
        borderRadius: 14,
        display: "flex", alignItems: "center", gap: 10,
        fontSize: 13, fontWeight: 600,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${bg}20`,
        maxWidth: "calc(100vw - 32px)",
        animation: "slideDown 0.2s ease",
        whiteSpace: "nowrap",
      }}
    >
      <MI style={{ fontSize: 18, color: bg }}>{icon}</MI>
      {toast.msg}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   NavBar
═══════════════════════════════════════════════ */
const NAV = [
  { id: "home",     label: "Inicio",   icon: "home",                 accent: "#ffbf00" },
  { id: "practice", label: "Práctica", icon: "timer",                accent: "#ffbf00" },
  { id: "routine",  label: "Rutina",   icon: "format_list_bulleted", accent: "#06b6d4" },
  { id: "vault",    label: "Vault",    icon: "shelves",              accent: "#a855f7" },
  { id: "progress", label: "Progreso", icon: "insights",             accent: "#22c55e" },
];

function NavBar({ tab, setTab }) {
  return (
    <nav style={{
      flexShrink: 0,
      height: 64,
      background: "rgba(8,8,12,0.92)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderTop: "1px solid rgba(255,255,255,0.04)",
      display: "flex",
      zIndex: 150,
    }}>
      {NAV.map(n => {
        const active = tab === n.id;
        return (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "none",
              padding: "6px 0",
            }}
          >
            <span
              className="msym"
              style={{
                fontSize: 22,
                lineHeight: 1,
                color: active ? n.accent : "rgba(240,237,232,0.28)",
                transition: "color 0.2s, filter 0.2s",
                filter: active ? `drop-shadow(0 0 6px ${n.accent}60)` : "none",
              }}
            >
              {n.icon}
            </span>
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.03em",
              color: active ? n.accent : "rgba(240,237,232,0.25)",
              transition: "color 0.2s",
              lineHeight: 1,
            }}>
              {n.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ═══════════════════════════════════════════════
   Progress component (inline)
═══════════════════════════════════════════════ */
function Progress({ data, logs }) {
  const streak    = calcStreak(logs);
  const total     = logs.length;
  const totalSecs = logs.reduce((a, l) => a + (l.duration || 0), 0);
  const avgMin    = total > 0 ? Math.round(totalSecs / 60 / total) : 0;
  const totalHrs  = Math.round(totalSecs / 3600);
  const today     = new Date().toISOString().split("T")[0];

  const dayNames7 = ["L", "M", "X", "J", "V", "S", "D"];
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().split("T")[0];
    const secs = logs.filter(l => l.date === ds).reduce((a, l) => a + (l.duration || 0), 0);
    return { day: dayNames7[(d.getDay() + 6) % 7], secs, date: ds };
  });
  const maxSecs = Math.max(...last7.map(d => d.secs), 1);

  return (
    <div style={{ padding: "32px 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Header ── */}
      <h1 className="hl" style={{
        fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em",
        background: "linear-gradient(135deg, #22c55e, #16a34a)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>
        PROGRESO
      </h1>

      {/* ── Streak card ── */}
      <div style={{
        background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)",
        borderRadius: 16, padding: "20px 20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(34,197,94,0.6)", marginBottom: 10 }}>
          RACHA ACTUAL
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="hl mono" style={{ fontSize: 64, fontWeight: 900, color: "#22c55e", lineHeight: 1, textShadow: "0 0 30px rgba(34,197,94,0.4)" }}>
            {streak}
          </span>
          <div>
            <div className="hl" style={{ fontSize: 20, fontWeight: 800, color: "#F0EDE8", letterSpacing: "-0.02em" }}>días</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
              <span className="msym" style={{ fontSize: 16, color: "#22c55e" }}>local_fire_department</span>
              <span style={{ fontSize: 11, color: "rgba(34,197,94,0.8)", fontWeight: 600 }}>¡Sigue así!</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3-column bento ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { val: `${totalHrs}h`, label: "TOTAL" },
          { val: `${avgMin}m`, label: "PROMEDIO" },
          { val: total, label: "SESIONES" },
        ].map((s, i) => (
          <div key={i} className="glass" style={{ padding: "16px 12px", textAlign: "center", animation: `staggerIn 0.3s ${i * 0.06}s both` }}>
            <div className="hl mono" style={{ fontSize: 24, fontWeight: 900, color: "#22c55e", lineHeight: 1, textShadow: "0 0 16px rgba(34,197,94,0.35)" }}>
              {s.val}
            </div>
            <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(240,237,232,0.35)", marginTop: 6 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Weekly bar chart ── */}
      <div className="glass" style={{ padding: "18px 16px" }}>
        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,237,232,0.35)", marginBottom: 16 }}>
          SESIONES POR SEMANA
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {last7.map((d, i) => {
            const sessionCount = logs.filter(l => l.date === d.date).length;
            const maxCount = Math.max(...last7.map(x => logs.filter(l => l.date === x.date).length), 1);
            const pct = sessionCount / maxCount;
            const isToday = d.date === today;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
                <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                  <div style={{
                    width: "100%",
                    height: `${Math.max(pct * 100, sessionCount > 0 ? 12 : 4)}%`,
                    background: sessionCount > 0
                      ? "linear-gradient(180deg, #22c55e, #16a34a)"
                      : "rgba(255,255,255,0.06)",
                    borderRadius: 4,
                    boxShadow: sessionCount > 0 ? "0 0 8px rgba(34,197,94,0.3)" : "none",
                    transition: "height 0.4s ease",
                  }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, color: isToday ? "#22c55e" : "rgba(240,237,232,0.35)" }}>
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {logs.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#5C5650" }}>
          <MI style={{ fontSize: 48, display: "block", marginBottom: 12, color: "rgba(34,197,94,0.25)" }}>bar_chart</MI>
          <p style={{ margin: 0, fontSize: 13, color: "#5C5650" }}>Sin sesiones registradas aún</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Home component (inline)
═══════════════════════════════════════════════ */
function Home({ data, logs, onGoRoutine, onGoVault, onGoPractice, metro }) {
  const streak    = calcStreak(logs);
  const weekComp  = calcWeekCompletion(data, logs);
  const todayIdx  = getTodayIdx();
  const todayCats = data.schedule?.[todayIdx] || [];
  const todayLogs = logs.filter(l => l.date === getToday());
  const doneCats  = todayLogs.map(l => l.categoryId);

  const todayExCount = todayCats.reduce((sum, catId) => {
    return sum + (data.exercises || []).filter(e => e.categoryId === catId).length;
  }, 0);
  const routineProgress = todayCats.length > 0 ? doneCats.length / todayCats.length : 0;
  const estMin = todayExCount * 8;
  const recentSessions = [...logs].reverse().slice(0, 3);
  const dayNames = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div style={{ padding: "32px 20px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 10, color: "rgba(240,237,232,0.4)", letterSpacing: "0.08em", marginBottom: 6 }}>
            {DAYS_FULL[todayIdx]} · {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long" })}
          </p>
          <h1 className="hl" style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
            <span style={{ color: "#ffbf00" }}>Práctica</span><br />
            <span style={{ color: "#F0EDE8" }}>libre</span>
          </h1>
          <p style={{ fontSize: 12, color: "rgba(240,237,232,0.4)", marginTop: 6 }}>Listo para tocar</p>
        </div>
        <div style={{ background: "rgba(255,191,0,0.08)", border: "1px solid rgba(255,191,0,0.2)", borderRadius: 12, padding: "8px 14px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="msym" style={{ fontSize: 16, color: "#ffbf00" }}>local_fire_department</span>
            <span className="hl mono" style={{ fontSize: 20, fontWeight: 900, color: "#ffbf00" }}>{streak}</span>
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(240,237,232,0.4)", textTransform: "uppercase" }}>días</div>
        </div>
      </div>

      {/* ── Week dots ── */}
      <div>
        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,237,232,0.35)", marginBottom: 10 }}>ESTA SEMANA</p>
        <div style={{ display: "flex", gap: 6 }}>
          {weekComp.map((s, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: 1 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: s === "done" ? "#ffbf00" : s === "partial" ? "rgba(255,191,0,0.25)" : "rgba(255,255,255,0.06)",
                border: i === todayIdx ? "2px solid rgba(255,191,0,0.5)" : "2px solid transparent",
                boxShadow: s === "done" ? "0 0 10px rgba(255,191,0,0.4)" : "none",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {s === "done" && <span className="msym" style={{ fontSize: 14, color: "#08080C" }}>check</span>}
              </div>
              <span style={{ fontSize: 8, color: i === todayIdx ? "#ffbf00" : "rgba(240,237,232,0.3)", fontWeight: 600 }}>{dayNames[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Metronome CTA card ── */}
      <div
        onClick={onGoPractice}
        style={{
          background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16,
          padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <div>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,237,232,0.35)", marginBottom: 8 }}>METRÓNOMO</p>
          <p className="hl" style={{ fontSize: 24, fontWeight: 900, color: "#F0EDE8", letterSpacing: "-0.03em" }}>{metro.cfg.bpm} BPM</p>
          <p style={{ fontSize: 11, color: "rgba(240,237,232,0.4)", marginTop: 3 }}>{metro.cfg.timeNum}/{metro.cfg.timeDen}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {metro.isPlaying && (
            <div style={{ background: "rgba(255,191,0,0.15)", border: "1px solid rgba(255,191,0,0.35)", borderRadius: 999, padding: "3px 10px", display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffbf00", animation: "pulse 1.5s ease-in-out infinite" }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#ffbf00" }}>EN VIVO</span>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); metro.isPlaying ? metro.stop() : metro.start(); }}
            style={{
              width: 52, height: 52, borderRadius: "50%",
              background: metro.isPlaying ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#ffbf00,#ff8c00)",
              border: metro.isPlaying ? "1px solid rgba(255,255,255,0.12)" : "none",
              boxShadow: metro.isPlaying ? "none" : "0 0 0 6px rgba(255,191,0,0.08),0 6px 24px rgba(255,191,0,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              animation: metro.isPlaying ? "playPulse 2s ease-in-out infinite" : "none",
            }}
          >
            <span className="msym" style={{ fontSize: 26, color: metro.isPlaying ? "#F0EDE8" : "#08080C" }}>
              {metro.isPlaying ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Rutina de hoy card ── */}
      <div style={{
        background: "rgba(255,255,255,0.03)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "18px 20px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(6,182,212,0.7)", marginBottom: 8 }}>RUTINA DE HOY</p>
        {todayCats.length === 0 ? (
          <p className="hl" style={{ fontSize: 18, fontWeight: 800, color: "rgba(240,237,232,0.4)" }}>Día libre</p>
        ) : (
          <>
            <p className="hl" style={{ fontSize: 20, fontWeight: 900, color: "#F0EDE8", letterSpacing: "-0.02em", marginBottom: 14 }}>
              {todayExCount} ejercicios · {estMin} min
            </p>
            <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${routineProgress * 100}%`,
                background: "linear-gradient(90deg,#06b6d4,#0ea5e9)", borderRadius: 999,
                boxShadow: routineProgress > 0 ? "0 0 8px rgba(6,182,212,0.4)" : "none",
                transition: "width 0.5s ease",
              }} />
            </div>
            <button onClick={onGoRoutine} style={{ background: "none", border: "none", color: "#06b6d4", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", marginTop: 10, padding: 0 }}>
              VER RUTINA →
            </button>
          </>
        )}
      </div>

      {/* ── Recientes ── */}
      {recentSessions.length > 0 && (
        <div>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(240,237,232,0.35)", marginBottom: 12 }}>RECIENTES</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recentSessions.map((l, idx) => {
              const cat = (data.categories || DEFAULT_CATEGORIES).find(c => c.id === l.categoryId);
              const today = new Date().toISOString().split("T")[0];
              const yest  = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; })();
              const label = l.date === today ? "Hoy" : l.date === yest ? "Ayer" : l.date;
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: idx < recentSessions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,191,0,0.08)", border: "1px solid rgba(255,191,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="msym" style={{ fontSize: 18, color: "#ffbf00" }}>music_note</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#F0EDE8" }}>{cat?.name || "Práctica libre"}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(240,237,232,0.4)" }}>{l.duration ? fmtDur(l.duration) : "—"}</p>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(240,237,232,0.35)", flexShrink: 0 }}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DrumPracticeApp — main export
═══════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════
   Login screen
═══════════════════════════════════════════════ */
function LoginScreen({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode]         = useState("login"); // "login" | "register"
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const handle = async () => {
    if (!email || !password) return;
    setLoading(true); setError(null);
    try {
      let res;
      if (mode === "register") {
        res = await supabase.auth.signUp({ email, password });
      } else {
        res = await supabase.auth.signInWithPassword({ email, password });
      }
      if (res.error) throw res.error;
      onLogin(res.data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#08080C",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 32, maxWidth: 480, left: "50%", transform: "translateX(-50%)", width: "100%",
    }}>
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,191,0,0.07) 0%,transparent 70%)", top: -100, right: -80, pointerEvents: "none" }} />

      <h1 className="hl" style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 6 }}>
        <span style={{ color: "#ffbf00" }}>Drum</span>
        <span style={{ color: "#F0EDE8" }}> Practice</span>
      </h1>
      <p style={{ color: "rgba(240,237,232,0.4)", fontSize: 13, marginBottom: 40 }}>
        {mode === "login" ? "Entra para sincronizar tus datos" : "Crea tu cuenta"}
      </p>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email" placeholder="tu@email.com" value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handle()}
          style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "#F0EDE8", fontSize: 15, outline: "none" }}
        />
        <input
          type="password" placeholder="Contraseña" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handle()}
          style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "#F0EDE8", fontSize: 15, outline: "none" }}
        />
        {error && <p style={{ color: "#f43f5e", fontSize: 12, margin: 0 }}>{error}</p>}
        <button
          onClick={handle} disabled={loading} className="hl"
          style={{ padding: 16, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#ffbf00,#ff8c00)", color: "#08080C", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "..." : mode === "login" ? "ENTRAR" : "CREAR CUENTA"}
        </button>
        <button
          onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(null); }}
          style={{ background: "none", border: "none", color: "rgba(240,237,232,0.4)", fontSize: 13, cursor: "pointer", padding: 4 }}
        >
          {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
        </button>
      </div>
    </div>
  );
}

export default function DrumPracticeApp() {
  const [user, setUser]         = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData]         = useState(() => loadData());
  const [logs, setLogs]         = useState(() => loadLogs());
  const [tab, setTab]           = useState("home");
  const [practiceMode, setPracticeMode] = useState("session");
  const [practiceSession, setPractice]  = useState(null);
  const { toast, show: showToast } = useToast();

  /* ── Auth listener + cloud sync on login ── */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
      if (session?.user) syncFromCloud();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) syncFromCloud();
    });
    return () => subscription.unsubscribe();
  }, []);

  const syncFromCloud = async () => {
    const [cloudData, cloudLogs] = await Promise.all([cloudLoadData(), cloudLoadLogs()]);
    if (cloudData) {
      setData(cloudData);
      saveData(cloudData);
    }
    if (cloudLogs && cloudLogs.length > 0) {
      setLogs(cloudLogs);
      saveLogs(cloudLogs);
    }
  };

  const metro = useMetronome();

  /* ─── complete practice session ─── */
  // PracticeSession calls onComplete({ categoryId, elapsed, bpmOverrides, exercisesCompleted })
  const completePractice = ({ categoryId: catId, elapsed, bpmOverrides = {}, exercisesCompleted } = {}) => {
    // Build log entry
    const logEntry = {
      id: uid(),
      date: getToday(),
      categoryId: catId || practiceSession,
      exercises: [],
      completedAt: new Date().toISOString(),
      duration: elapsed || 0,
    };
    const nl = [...logs, logEntry];

    // Apply BPM overrides to exercises
    const newExercises = (data.exercises || []).map(e =>
      bpmOverrides[e.id] ? { ...e, currentBPM: bpmOverrides[e.id] } : e
    );

    // Streak & stats
    const newStreak = calcStreak(nl);
    const newBest   = Math.max(data.stats?.bestStreak || 0, newStreak);

    // Auto weekly BPM increment
    let finalExercises = newExercises;
    const settings = { ...data.settings };
    const lastInc = settings.lastBpmIncrementDate ? new Date(settings.lastBpmIncrementDate) : null;
    const daysSince = lastInc ? (Date.now() - lastInc.getTime()) / (1000 * 60 * 60 * 24) : Infinity;
    if (daysSince > 6) {
      finalExercises = newExercises.map(e => {
        const inc = e.weeklyBPMIncrement || 0;
        if (inc <= 0) return e;
        return {
          ...e,
          currentBPM: clamp((e.currentBPM || e.bpm || 80) + inc, 20, 300),
        };
      });
      settings.lastBpmIncrementDate = getToday();
    }

    const nd = {
      ...data,
      exercises: finalExercises,
      settings,
      stats: { ...data.stats, bestStreak: newBest },
    };

    setData(nd);
    saveData(nd);
    cloudSaveData(nd);
    setLogs(nl);
    saveLogs(nl);
    cloudSaveLogs(nl);
    showToast("¡Sesión completada! 🎯");
    setPractice(null);
  };

  /* ─── setData wrapper that also syncs to cloud ─── */
  const setDataAndSync = (nd) => {
    setData(nd);
    saveData(nd);
    cloudSaveData(nd);
  };

  const aurora = AURORA_MAP[tab] || AURORA_MAP.home;

  /* ─── render ─── */
  if (!authReady) return null;
  // Auth is optional — app works without login (cloud sync disabled when no user)

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#08080C",
      display: "flex", flexDirection: "column",
      maxWidth: window.innerWidth >= 768 ? 600 : 480,
      left: "50%", transform: "translateX(-50%)", width: "100%",
      overflow: "hidden",
    }}>
      {/* Aurora background — changes per tab */}
      <Aurora color1={aurora.color1} color2={aurora.color2} />

      {/* Toast */}
      <Toast toast={toast} />

      {/* Tab content */}
      <ErrorBoundary key={tab}>
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: tab === "practice" ? "hidden" : "auto",
        overflowX: "hidden",
        position: "relative", zIndex: 1,
        WebkitOverflowScrolling: "touch",
        display: "flex", flexDirection: "column",
      }}>
        {tab === "home" && (
          <Home
            data={data}
            logs={logs}
            onGoRoutine={() => setTab("routine")}
            onGoVault={() => setTab("vault")}
            onGoPractice={() => setTab("practice")}
            metro={metro}
          />
        )}
        {tab === "practice" && (
          <FreeMetronome metro={metro} />
        )}
        {tab === "routine" && (
          <RoutineTimeline
            data={data}
            setData={setDataAndSync}
            logs={logs}
            showToast={showToast}
          />
        )}
        {tab === "vault" && (
          <Vault
            data={data}
            setData={setDataAndSync}
            showToast={showToast}
          />
        )}
        {tab === "progress" && (
          <Progress data={data} logs={logs} />
        )}
      </div>
      </ErrorBoundary>

      {/* NavBar */}
      <NavBar tab={tab} setTab={setTab} />

      {/* PracticeSession overlay */}
      {practiceSession && (
        <div style={{ position: "absolute", inset: 0, zIndex: 200 }}>
          <PracticeSession
            data={data}
            categoryId={practiceSession}
            metro={metro}
            onComplete={completePractice}
            onExit={() => setPractice(null)}
          />
        </div>
      )}
    </div>
  );
}
