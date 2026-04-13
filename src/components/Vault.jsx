import { useState, useRef } from "react";
import { saveData } from "../lib/storage.js";
import { uid, fmtDur, clamp, getToday, SOUNDS, BEAT_LEVELS, DEFAULT_CATEGORIES, SUBDIVISIONS } from "../lib/constants.js";
import { uploadExerciseImage, uploadFillMedia, uploadSongMedia } from "../lib/supabase.js";
import SongPlayer from "./SongPlayer.jsx";

/* ─── Module-level song file cache (object URLs for large files) ─── */
export const songFileCache = new Map(); // songId → { url: objectURL }

/* ─── helpers ─── */
function MI({ children, style }) {
  return (
    <span className="msym" style={{ fontSize: 20, lineHeight: 1, userSelect: "none", ...style }}>
      {children}
    </span>
  );
}

function IBtn({ onClick, children, style, title, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: "none", border: "none", cursor: disabled ? "default" : "pointer",
        padding: 6, borderRadius: 8, color: "var(--on-sv)",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.4 : 1, transition: "background 0.15s",
        ...style,
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
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
        fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
        padding: "2px 6px", borderRadius: 4,
        border: `1px solid ${color}`, color, background: bg || "transparent",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Modal({ onClose, children }) {
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        bottom: "var(--nav-h)",
        zIndex: 400,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 820, maxHeight: "100%",
          background: "rgba(15,15,20,0.95)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid var(--glass-border)",
          borderBottom: "none",
          borderRadius: "20px 20px 0 0",
          overflowY: "auto", animation: "slideUp 0.22s ease",
        }}
        className="no-sb"
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "var(--outline)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", min, max, style }) {
  return (
    <input
      type={type} value={value} onChange={onChange}
      placeholder={placeholder} min={min} max={max}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 10,
        border: "1px solid var(--outline-v)", background: "var(--s-mid)",
        color: "var(--on-s)", fontSize: 14, outline: "none",
        boxSizing: "border-box", ...style,
      }}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 10,
        border: "1px solid var(--outline-v)", background: "var(--s-mid)",
        color: "var(--on-s)", fontSize: 14, outline: "none", resize: "vertical",
        boxSizing: "border-box", fontFamily: "inherit",
      }}
    />
  );
}

const EMPTY_EX = {
  name: "", categoryId: "cat-1", velocityMode: "fixed",
  bpm: 80, bpmStart: 60, bpmEnd: 100,
  rampType: "gradual", rampStepBars: 4, rampStepBpm: 2,
  durationSeconds: 60, image: null, notes: "",
  // Metronome config
  metroTimeNum: 4, metroTimeDen: 4, metroSubId: "quarter",
  metroGapEnabled: false, metroGapPlay: 4, metroGapSilence: 4,
  metroPolyEnabled: false, metroPolyNum: 3,
};

/* ─── Exercise Form ─── */
function ExForm({ initial, categories, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_EX, ...initial });
  const [imgWarn, setImgWarn]       = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const fileRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setImgWarn(true); return; }
    setImgWarn(false);
    // Read as base64 for preview — upload to Storage on submit
    const reader = new FileReader();
    reader.onload = ev => set("image", ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    let finalForm = { ...form };

    if (form.image && form.image.startsWith("data:")) {
      setImgUploading(true);
      const exId = form.id || uid();
      const url = await uploadExerciseImage(exId, form.image);
      setImgUploading(false);
      if (url) {
        finalForm = { ...finalForm, id: exId, image: url };
      }
      // if upload failed, keep base64 as local fallback
    }

    onSave(finalForm);
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: "20px 20px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="hl" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {initial?.id ? "Editar ejercicio" : "Nuevo ejercicio"}
          </h3>
          <IBtn onClick={onClose}><MI>close</MI></IBtn>
        </div>

        <Field label="CATEGORÍA">
          <select
            value={form.categoryId}
            onChange={e => set("categoryId", e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10,
              border: "1px solid var(--outline-v)", background: "var(--s-mid)",
              color: "var(--on-s)", fontSize: 14, outline: "none",
            }}
          >
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <Field label="NOMBRE *">
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Paradiddle invertido" />
        </Field>

        <Field label="VELOCIDAD">
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {["fixed", "ramp"].map(mode => (
              <button
                key={mode}
                onClick={() => set("velocityMode", mode)}
                className="hl"
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 10,
                  border: form.velocityMode === mode ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
                  background: form.velocityMode === mode ? "rgba(255,191,0,0.12)" : "var(--glass)",
                  color: form.velocityMode === mode ? "var(--amber)" : "var(--on-sv)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                {mode === "fixed" ? "FIJO" : "RAMPA"}
              </button>
            ))}
          </div>

          {form.velocityMode === "fixed" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Input type="number" value={form.bpm} onChange={e => set("bpm", +e.target.value)} min={20} max={300} style={{ width: 90 }} />
              <span style={{ color: "var(--outline)", fontSize: 13 }}>BPM</span>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: "var(--outline)", display: "block", marginBottom: 4 }}>BPM INICIO</label>
                  <Input type="number" value={form.bpmStart} onChange={e => set("bpmStart", +e.target.value)} min={20} max={300} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: "var(--outline)", display: "block", marginBottom: 4 }}>BPM OBJETIVO</label>
                  <Input type="number" value={form.bpmEnd} onChange={e => set("bpmEnd", +e.target.value)} min={20} max={300} />
                </div>
              </div>

              <label style={{ fontSize: 10, color: "var(--outline)", display: "block", marginBottom: 6 }}>TIPO</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {["gradual", "escalones"].map(rt => (
                  <button
                    key={rt}
                    onClick={() => set("rampType", rt)}
                    className="hl"
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: 8,
                      border: form.rampType === rt ? "1px solid var(--cyan)" : "1px solid var(--outline-v)",
                      background: form.rampType === rt ? "rgba(6,182,212,0.1)" : "var(--glass)",
                      color: form.rampType === rt ? "var(--cyan)" : "var(--on-sv)",
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {rt === "gradual" ? "GRADUAL" : "ESCALONES"}
                  </button>
                ))}
              </div>

              {form.rampType === "escalones" && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: "var(--outline)", display: "block", marginBottom: 4 }}>CADA N COMPASES</label>
                    <Input type="number" value={form.rampStepBars} onChange={e => set("rampStepBars", +e.target.value)} min={1} max={64} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: "var(--outline)", display: "block", marginBottom: 4 }}>+X BPM</label>
                    <Input type="number" value={form.rampStepBpm} onChange={e => set("rampStepBpm", +e.target.value)} min={1} max={20} />
                  </div>
                </div>
              )}
            </div>
          )}
        </Field>

        <Field label="DURACIÓN">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Input type="number" value={form.durationSeconds} onChange={e => set("durationSeconds", +e.target.value)} min={10} max={3600} style={{ width: 90 }} />
            <span style={{ color: "var(--outline)", fontSize: 13 }}>segundos</span>
          </div>
        </Field>

        {/* ── Metronome config ── */}
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => set("_metroOpen", !form._metroOpen)}
            className="hl"
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10, display: "flex",
              alignItems: "center", justifyContent: "space-between",
              border: form._metroOpen ? "1px solid rgba(6,182,212,0.4)" : "1px solid var(--outline-v)",
              background: form._metroOpen ? "rgba(6,182,212,0.06)" : "var(--glass)",
              color: form._metroOpen ? "var(--cyan)" : "var(--on-sv)",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <MI style={{ fontSize: 16 }}>metronome</MI>
              CONFIG METRÓNOMO
            </span>
            <MI style={{ fontSize: 16 }}>{form._metroOpen ? "expand_less" : "expand_more"}</MI>
          </button>
          {form._metroOpen && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14, padding: "12px 14px", background: "rgba(6,182,212,0.03)", borderRadius: 10, border: "1px solid rgba(6,182,212,0.12)" }}>
              {/* Time signature */}
              <div>
                <label style={{ fontSize: 10, color: "var(--outline)", display: "block", marginBottom: 6 }}>MÉTRICA</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select value={form.metroTimeNum} onChange={e => set("metroTimeNum", +e.target.value)}
                    style={{ width: 64, padding: "8px 8px", borderRadius: 8, border: "1px solid var(--outline-v)", background: "var(--s-mid)", color: "var(--on-s)", fontSize: 15, fontWeight: 700, textAlign: "center" }}>
                    {[2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <span style={{ color: "var(--outline)", fontSize: 22, fontWeight: 300 }}>/</span>
                  <select value={form.metroTimeDen} onChange={e => set("metroTimeDen", +e.target.value)}
                    style={{ width: 64, padding: "8px 8px", borderRadius: 8, border: "1px solid var(--outline-v)", background: "var(--s-mid)", color: "var(--on-s)", fontSize: 15, fontWeight: 700, textAlign: "center" }}>
                    {[2,4,8,16].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              {/* Subdivision */}
              <div>
                <label style={{ fontSize: 10, color: "var(--outline)", display: "block", marginBottom: 6 }}>SUBDIVISIÓN</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {SUBDIVISIONS.map(s => (
                    <button key={s.id} onClick={() => set("metroSubId", s.id)} className="hl"
                      title={s.name}
                      style={{
                        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: form.metroSubId === s.id ? "1px solid var(--cyan)" : "1px solid var(--outline-v)",
                        background: form.metroSubId === s.id ? "rgba(6,182,212,0.15)" : "var(--glass)",
                        color: form.metroSubId === s.id ? "var(--cyan)" : "var(--on-sv)",
                      }}>{s.label} <span style={{ fontSize: 9, opacity: 0.7 }}>{s.name}</span></button>
                  ))}
                </div>
              </div>
              {/* Polyrhythm */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <button onClick={() => set("metroPolyEnabled", !form.metroPolyEnabled)} className="hl"
                    style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer",
                      border: form.metroPolyEnabled ? "1px solid var(--purple)" : "1px solid var(--outline-v)",
                      background: form.metroPolyEnabled ? "rgba(168,85,247,0.15)" : "var(--glass)",
                      color: form.metroPolyEnabled ? "var(--purple)" : "var(--on-sv)",
                    }}>POLIRRITMO {form.metroPolyEnabled ? "ON" : "OFF"}</button>
                </div>
                {form.metroPolyEnabled && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "var(--outline)" }}>Capa 2:</span>
                    {[2,3,4,5,6,7].map(n => (
                      <button key={n} onClick={() => set("metroPolyNum", n)} className="hl"
                        style={{
                          width: 34, height: 34, borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer",
                          border: form.metroPolyNum === n ? "1px solid var(--purple)" : "1px solid var(--outline-v)",
                          background: form.metroPolyNum === n ? "rgba(168,85,247,0.2)" : "var(--glass)",
                          color: form.metroPolyNum === n ? "var(--purple)" : "var(--on-sv)",
                        }}>{n}</button>
                    ))}
                  </div>
                )}
              </div>
              {/* Gap */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <button onClick={() => set("metroGapEnabled", !form.metroGapEnabled)} className="hl"
                    style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: "pointer",
                      border: form.metroGapEnabled ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
                      background: form.metroGapEnabled ? "rgba(255,191,0,0.12)" : "var(--glass)",
                      color: form.metroGapEnabled ? "var(--amber)" : "var(--on-sv)",
                    }}>GAP CLICK {form.metroGapEnabled ? "ON" : "OFF"}</button>
                </div>
                {form.metroGapEnabled && (
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--outline)" }}>PLAY</span>
                      <Input type="number" value={form.metroGapPlay} onChange={e => set("metroGapPlay", clamp(+e.target.value, 1, 8))} min={1} max={8} style={{ width: 56 }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "var(--outline)" }}>MUTE</span>
                      <Input type="number" value={form.metroGapSilence} onChange={e => set("metroGapSilence", clamp(+e.target.value, 1, 8))} min={1} max={8} style={{ width: 56 }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <Field label="IMAGEN / PARTITURA (max 2MB)">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {form.image && (
              <img src={form.image} alt="partitura" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid var(--outline-v)" }} />
            )}
            <label style={{
              padding: "8px 16px", borderRadius: 10,
              border: "1px dashed var(--outline-v)", cursor: "pointer",
              color: "var(--outline)", fontSize: 12,
            }}>
              {form.image ? "Cambiar" : "Seleccionar"}
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: "none" }} />
            </label>
            {form.image && (
              <button onClick={() => set("image", null)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 11 }}>Quitar</button>
            )}
          </div>
          {imgWarn && <p style={{ color: "var(--red)", fontSize: 11, margin: "6px 0 0" }}>Imagen muy grande (máx 2MB)</p>}
        </Field>

        <Field label="NOTAS">
          <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Descripción, tips técnicos..." />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={imgUploading}
          className="hl"
          style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: "var(--amber)", color: "var(--on-amber)",
            border: "none", fontSize: 14, fontWeight: 700, cursor: imgUploading ? "default" : "pointer",
            marginTop: 8, opacity: imgUploading ? 0.7 : 1,
          }}
        >
          {imgUploading ? "Subiendo imagen..." : initial?.id ? "GUARDAR CAMBIOS" : "CREAR EJERCICIO"}
        </button>
      </div>
    </Modal>
  );
}

/* ─── Exercise Card ─── */
const EX_ICON_COLORS = ["#a855f7", "#06b6d4", "#22c55e", "#ffbf00", "#f43f5e", "#3b82f6"];

function ExCard({ ex, category, onEdit, onDelete, index }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const iconColor = EX_ICON_COLORS[index % EX_ICON_COLORS.length];

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: "1px solid var(--glass-border)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      borderRadius: 12, padding: "14px",
      marginBottom: 8, animation: "fadeUp 0.2s ease",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      {/* Colored icon */}
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${iconColor}15`, border: `1px solid ${iconColor}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MI style={{ fontSize: 20, color: iconColor }}>music_note</MI>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            {ex.image && (
              <img src={ex.image} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, float: "right", marginLeft: 10 }} />
            )}
            <p className="hl" style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "var(--on-s)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {ex.name}
            </p>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {ex.velocityMode === "ramp" ? (
                <Badge color="var(--amber)">{ex.bpmStart || 60}→{ex.bpmEnd || 100} BPM</Badge>
              ) : (
                <Badge color="var(--amber)">{ex.currentBPM || ex.bpm || 80} BPM</Badge>
              )}
              {ex.durationSeconds && <Badge color="var(--outline)">{fmtDur(ex.durationSeconds)}</Badge>}
              {category && <Badge color={category.color || "var(--outline)"}>{category.name}</Badge>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
            <IBtn onClick={onEdit} title="Editar"><MI style={{ fontSize: 18 }}>edit</MI></IBtn>
            {!confirmDel ? (
              <IBtn onClick={() => setConfirmDel(true)} title="Eliminar" style={{ color: "var(--red)" }}>
                <MI style={{ fontSize: 18, color: "var(--red)" }}>delete</MI>
              </IBtn>
            ) : (
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={onDelete} style={{ padding: "4px 8px", background: "var(--red)", color: "#fff", border: "none", borderRadius: 6, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                  SÍ
                </button>
                <button onClick={() => setConfirmDel(false)} style={{ padding: "4px 8px", background: "var(--s-high)", color: "var(--on-sv)", border: "none", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>NO</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Fill Card ─── */
function FillCard({ fill, onEdit, onDelete, onPracticed }) {
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: "1px solid var(--glass-border)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      borderRadius: 12, padding: "12px",
      animation: "fadeUp 0.2s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="hl" style={{ fontSize: 13, fontWeight: 700, color: "var(--on-s)" }}>{fill.name}</span>
        <div style={{ display: "flex", gap: 2 }}>
          <IBtn onClick={onEdit} title="Editar"><MI style={{ fontSize: 16 }}>edit</MI></IBtn>
          {!confirmDel ? (
            <IBtn onClick={() => setConfirmDel(true)} style={{ color: "var(--red)" }}>
              <MI style={{ fontSize: 16, color: "var(--red)" }}>delete</MI>
            </IBtn>
          ) : (
            <div style={{ display: "flex", gap: 3 }}>
              <button onClick={onDelete} style={{ padding: "3px 7px", background: "var(--red)", color: "#fff", border: "none", borderRadius: 5, fontSize: 9, cursor: "pointer", fontWeight: 700 }}>SÍ</button>
              <button onClick={() => setConfirmDel(false)} style={{ padding: "3px 7px", background: "var(--s-high)", color: "var(--on-sv)", border: "none", borderRadius: 5, fontSize: 9, cursor: "pointer" }}>NO</button>
            </div>
          )}
        </div>
      </div>
      {fill.notes && <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--outline)" }}>{fill.notes}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--outline)" }}>
          {fill.lastPracticed ? `Últ: ${fill.lastPracticed}` : "Sin practicar"}
        </span>
        <button
          onClick={onPracticed}
          style={{
            padding: "4px 10px", borderRadius: 8,
            border: "1px solid var(--green)", background: "rgba(34,197,94,0.08)",
            color: "var(--green)", fontSize: 10, fontWeight: 700, cursor: "pointer",
          }}
        >
          ✓ PRACTICADO
        </button>
      </div>
    </div>
  );
}

/* ─── Fill Form ─── */
function FillForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ name: "", notes: "", type: "fill", mediaUrl: null, mediaMime: null, ...initial });
  const [fileStatus, setFileStatus] = useState(null); // null | "uploading" | "done" | "error"
  const [pendingFile, setPendingFile] = useState(null); // File object to upload on save
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setFileStatus("pending");
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    let mediaUrl = form.mediaUrl;
    let mediaMime = form.mediaMime;

    if (pendingFile) {
      setFileStatus("uploading");
      // Use a temp id if new, or existing id
      const fillId = form.id || uid();
      const result = await uploadFillMedia(fillId, pendingFile);
      if (result) {
        mediaUrl = result.publicUrl;
        mediaMime = result.mimeType;
        setFileStatus("done");
      } else {
        setFileStatus("error");
        // continue with save even if upload failed
      }
      onSave({ ...form, id: fillId, mediaUrl, mediaMime });
    } else {
      onSave(form);
    }
    onClose();
  };

  const mediaIsImage = form.mediaUrl && (form.mediaMime || "").startsWith("image/");
  const mediaIsVideo = form.mediaUrl && (form.mediaMime || "").startsWith("video/");
  const mediaIsAudio = form.mediaUrl && (form.mediaMime || "").startsWith("audio/");

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: "20px 20px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="hl" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {initial?.id ? "Editar" : "Nuevo Fill/Groove"}
          </h3>
          <IBtn onClick={onClose}><MI>close</MI></IBtn>
        </div>
        <Field label="TIPO">
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            {["fill", "groove"].map(t => (
              <button
                key={t}
                onClick={() => set("type", t)}
                className="hl"
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 10,
                  border: form.type === t ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
                  background: form.type === t ? "rgba(255,191,0,0.12)" : "var(--glass)",
                  color: form.type === t ? "var(--amber)" : "var(--on-sv)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>
        <Field label="NOMBRE *">
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Fill de 2 compases" />
        </Field>
        <Field label="NOTAS">
          <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Descripción, ritmo, tips..." />
        </Field>

        {/* Media upload */}
        <Field label="MEDIA (IMAGEN / AUDIO / VIDEO)">
          {/* Preview existing */}
          {form.mediaUrl && !pendingFile && (
            <div style={{ marginBottom: 10, position: "relative" }}>
              {mediaIsImage && <img src={form.mediaUrl} alt="media" style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, border: "1px solid var(--outline-v)" }} />}
              {mediaIsAudio && <audio controls src={form.mediaUrl} style={{ width: "100%", borderRadius: 8 }} />}
              {mediaIsVideo && <video controls src={form.mediaUrl} style={{ width: "100%", maxHeight: 140, borderRadius: 8 }} />}
              <button onClick={() => { set("mediaUrl", null); set("mediaMime", null); }}
                style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>
                ✕
              </button>
            </div>
          )}
          {pendingFile && (
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--amber)" }}>
              {pendingFile.name} — se subirá al guardar
            </p>
          )}
          <label style={{
            display: "block", padding: "10px 14px", borderRadius: 10,
            border: "1px dashed var(--outline-v)", cursor: "pointer",
            background: "var(--s-high)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <MI style={{ color: "var(--outline)" }}>perm_media</MI>
              <span style={{ fontSize: 12, color: "var(--on-sv)" }}>
                {form.mediaUrl || pendingFile ? "Cambiar archivo" : "Seleccionar archivo"}
              </span>
            </div>
            <input type="file" accept="image/*,audio/*,video/*" onChange={handleFile} style={{ display: "none" }} />
          </label>
          {fileStatus === "uploading" && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--outline)" }}>Subiendo...</p>}
          {fileStatus === "done"      && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--green)" }}>✓ Subido a la nube</p>}
          {fileStatus === "error"     && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--red)" }}>Error al subir (verifica el bucket fill-media)</p>}
        </Field>

        <button onClick={handleSubmit} disabled={fileStatus === "uploading"} className="hl" style={{ width: "100%", padding: 14, borderRadius: 12, background: "var(--amber)", color: "var(--on-amber)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: fileStatus === "uploading" ? 0.6 : 1 }}>
          {fileStatus === "uploading" ? "SUBIENDO..." : initial?.id ? "GUARDAR" : "CREAR"}
        </button>
      </div>
    </Modal>
  );
}

/* ─── Song Form ─── */
function SongForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ name: "", artist: "", bpm: "", notes: "", mediaUrl: null, mediaMime: null, hasFile: false, ...initial });
  const [fileStatus, setFileStatus] = useState(null); // null | "pending" | "uploading" | "done" | "error"
  const [pendingFile, setPendingFile] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setFileStatus("pending");
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    let mediaUrl = form.mediaUrl;
    let mediaMime = form.mediaMime;

    if (pendingFile) {
      setFileStatus("uploading");
      const songId = form.id || uid();
      const result = await uploadSongMedia(songId, pendingFile);
      if (result) {
        mediaUrl = result.publicUrl;
        mediaMime = result.mimeType;
        setFileStatus("done");
      } else {
        setFileStatus("error");
      }
      onSave({
        ...form,
        id: songId,
        mediaUrl,
        mediaMime,
        hasFile: !!(mediaUrl),
        // strip any old local data
        fileData: null,
        _tempCacheId: undefined,
        bpm: form.bpm ? parseInt(form.bpm) : null,
      });
    } else {
      onSave({
        ...form,
        bpm: form.bpm ? parseInt(form.bpm) : null,
      });
    }
    onClose();
  };

  const mediaIsAudio = (form.mediaMime || "").startsWith("audio/") || (!form.mediaMime && form.mediaUrl);
  const mediaIsVideo = (form.mediaMime || "").startsWith("video/");

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: "20px 20px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="hl" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {initial?.id ? "Editar canción" : "Nueva canción"}
          </h3>
          <IBtn onClick={onClose}><MI>close</MI></IBtn>
        </div>
        <Field label="NOMBRE *">
          <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Enter Sandman" />
        </Field>
        <Field label="ARTISTA">
          <Input value={form.artist} onChange={e => set("artist", e.target.value)} placeholder="Ej: Metallica" />
        </Field>
        <Field label="BPM DE REFERENCIA">
          <Input type="number" value={form.bpm} onChange={e => set("bpm", e.target.value)} placeholder="Ej: 123" min={20} max={300} />
        </Field>
        <Field label="NOTAS">
          <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Letra, estructura, secciones difíciles..." />
        </Field>
        <Field label="ARCHIVO (AUDIO/VIDEO)">
          {/* Preview existing cloud media */}
          {form.mediaUrl && !pendingFile && (
            <div style={{ marginBottom: 10, position: "relative" }}>
              {mediaIsVideo
                ? <video controls src={form.mediaUrl} style={{ width: "100%", maxHeight: 120, borderRadius: 8 }} />
                : <audio controls src={form.mediaUrl} style={{ width: "100%", borderRadius: 8 }} />}
              <button onClick={() => { set("mediaUrl", null); set("mediaMime", null); set("hasFile", false); }}
                style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", padding: "2px 6px", fontSize: 11 }}>
                ✕
              </button>
            </div>
          )}
          {pendingFile && (
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--amber)" }}>
              {pendingFile.name} — se subirá a la nube al guardar
            </p>
          )}
          <label style={{
            display: "block", padding: "12px 16px", borderRadius: 10,
            border: "1px dashed var(--outline-v)", cursor: "pointer",
            background: "var(--s-high)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <MI style={{ color: "var(--outline)" }}>audio_file</MI>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--on-sv)" }}>
                  {form.hasFile && !pendingFile ? "Archivo en la nube ✓" : pendingFile ? "Nuevo archivo seleccionado" : "Seleccionar archivo"}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--outline)" }}>
                  Sube audio o video directamente a Supabase Storage
                </p>
              </div>
            </div>
            <input type="file" accept="audio/*,video/*" onChange={handleFile} style={{ display: "none" }} />
          </label>
          {fileStatus === "uploading" && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--outline)" }}>Subiendo...</p>}
          {fileStatus === "done"      && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--green)" }}>✓ Guardado en la nube</p>}
          {fileStatus === "error"     && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--red)" }}>Error al subir (verifica el bucket song-media)</p>}
        </Field>
        <button onClick={handleSubmit} disabled={fileStatus === "uploading"} className="hl" style={{ width: "100%", padding: 14, borderRadius: 12, background: "var(--amber)", color: "var(--on-amber)", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: fileStatus === "uploading" ? 0.6 : 1 }}>
          {fileStatus === "uploading" ? "SUBIENDO..." : initial?.id ? "GUARDAR CAMBIOS" : "CREAR CANCIÓN"}
        </button>
      </div>
    </Modal>
  );
}

/* ─── Song Card ─── */
function SongCard({ song, onPlay, onEdit, onDelete }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const hasFile = !!(song.mediaUrl || song.fileData || songFileCache.has(song.id) || song.hasFile);

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: "1px solid var(--glass-border)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      borderRadius: 12, padding: "14px",
      marginBottom: 8, animation: "fadeUp 0.2s ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={onPlay}>
          <p className="hl" style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "var(--on-s)" }}>{song.name}</p>
          {song.artist && <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--outline)" }}>{song.artist}</p>}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {song.bpm && <Badge color="var(--amber)">{song.bpm} BPM</Badge>}
            <Badge color={hasFile ? "var(--green)" : "var(--outline)"}>
              {hasFile ? "ARCHIVO OK" : "SIN ARCHIVO"}
            </Badge>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <IBtn onClick={onPlay} title="Reproducir" style={{ color: "var(--amber)" }}>
            <MI style={{ fontSize: 20, color: "var(--amber)" }}>play_circle</MI>
          </IBtn>
          <IBtn onClick={onEdit} title="Editar"><MI style={{ fontSize: 18 }}>edit</MI></IBtn>
          {!confirmDel ? (
            <IBtn onClick={() => setConfirmDel(true)} style={{ color: "var(--red)" }}>
              <MI style={{ fontSize: 18, color: "var(--red)" }}>delete</MI>
            </IBtn>
          ) : (
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <button onClick={onDelete} style={{ padding: "4px 8px", background: "var(--red)", color: "#fff", border: "none", borderRadius: 6, fontSize: 10, cursor: "pointer", fontWeight: 700 }}>SÍ</button>
              <button onClick={() => setConfirmDel(false)} style={{ padding: "4px 8px", background: "var(--s-high)", color: "var(--on-sv)", border: "none", borderRadius: 6, fontSize: 10, cursor: "pointer" }}>NO</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── FAB ─── */
function FAB({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="hl"
      style={{
      position: "fixed", bottom: "calc(var(--nav-h) + 8px)", right: "max(16px, calc(50vw - 224px))",
        zIndex: 100, padding: "14px 20px", borderRadius: 20,
        background: "linear-gradient(135deg, var(--accent-practice), #ff8c00)",
        color: "#402d00",
        border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
        boxShadow: "0 4px 20px rgba(255,191,0,0.3)",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      <MI style={{ fontSize: 18, color: "var(--on-amber)" }}>add</MI>
      {label}
    </button>
  );
}

/* ─── main Vault ─── */
export default function Vault({ data, setData, showToast }) {
  const [subTab, setSubTab] = useState("exercises");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [exForm, setExForm] = useState(null);       // null | {} | existing ex
  const [fillForm, setFillForm] = useState(null);
  const [songForm, setSongForm] = useState(null);
  const [activeSong, setActiveSong] = useState(null);   // song for SongPlayer
  const [songPlayerOpen, setSongPlayerOpen] = useState(false);

  const cats = data.categories || DEFAULT_CATEGORIES;
  const exercises = data.exercises || [];
  const fills = data.fills || [];
  const songs = data.songs || [];

  const save = (nd) => { setData(nd); saveData(nd); };

  /* ─── exercises ─── */
  const filteredExs = exercises.filter(ex => {
    const matchCat = catFilter === "all" || ex.categoryId === catFilter;
    const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const saveEx = (form) => {
    const existing = exercises.find(e => e.id === form.id);
    let newExs;
    if (existing) {
      newExs = exercises.map(e => e.id === form.id ? { ...e, ...form } : e);
    } else {
      newExs = [...exercises, { ...form, id: uid(), currentBPM: form.bpm || 80 }];
    }
    save({ ...data, exercises: newExs });
    showToast && showToast(existing ? "Ejercicio actualizado" : "Ejercicio creado");
  };

  const deleteEx = (id) => {
    save({ ...data, exercises: exercises.filter(e => e.id !== id) });
    showToast && showToast("Ejercicio eliminado", "info");
  };

  const bumpCatBpm = (catId) => {
    const newExs = exercises.map(e =>
      e.categoryId === catId
        ? { ...e, bpm: clamp((e.bpm || 80) + 1, 20, 300), currentBPM: clamp((e.currentBPM || e.bpm || 80) + 1, 20, 300) }
        : e
    );
    save({ ...data, exercises: newExs });
    showToast && showToast(`+1 BPM a ${cats.find(c => c.id === catId)?.name || catId}`);
  };

  /* ─── fills ─── */
  const filteredFills = fills.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  const saveFill = (form) => {
    const existing = fills.find(f => f.id === form.id);
    let newFills;
    if (existing) {
      newFills = fills.map(f => f.id === form.id ? { ...f, ...form } : f);
    } else {
      newFills = [...fills, { ...form, id: uid(), lastPracticed: null }];
    }
    save({ ...data, fills: newFills });
    showToast && showToast(existing ? "Actualizado" : "Fill/Groove creado");
  };

  const deleteFill = (id) => {
    save({ ...data, fills: fills.filter(f => f.id !== id) });
    showToast && showToast("Eliminado", "info");
  };

  const markFillPracticed = (id) => {
    const newFills = fills.map(f => f.id === id ? { ...f, lastPracticed: getToday() } : f);
    save({ ...data, fills: newFills });
    showToast && showToast("¡Practicado!");
  };

  /* ─── songs ─── */
  const filteredSongs = songs.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.artist || "").toLowerCase().includes(search.toLowerCase())
  );

  const saveSong = (form) => {
    const existing = songs.find(s => s.id === form.id);
    let newSongs;
    if (existing) {
      newSongs = songs.map(s => s.id === form.id ? { ...s, ...form, _tempCacheId: undefined } : s);
    } else {
      const newId = form.id || uid();
      newSongs = [...songs, { ...form, id: newId, _tempCacheId: undefined }];
    }
    save({ ...data, songs: newSongs });
    showToast && showToast(existing ? "Canción actualizada" : "Canción creada");
  };

  const deleteSong = (id) => {
    songFileCache.delete(id);
    save({ ...data, songs: songs.filter(s => s.id !== id) });
    showToast && showToast("Canción eliminada", "info");
  };

  const openSongPlayer = (song) => {
    // Prefer cloud mediaUrl, then local fileData, then in-memory cache
    let playUrl = song.mediaUrl || song.fileData || null;
    if (!playUrl) {
      const cached = songFileCache.get(song.id);
      if (cached) playUrl = cached.url;
    }
    setActiveSong({ ...song, playUrl });
    setSongPlayerOpen(true);
  };

  const handleSongSpeedChange = (songId, rate) => {
    if (!songId) return;
    const newSongs = songs.map(s => s.id === songId ? { ...s, lastSpeed: rate } : s);
    save({ ...data, songs: newSongs });
  };

  /* ─── sub tab bar ─── */
  const SUBTABS = [
    { id: "exercises", label: "Ejercicios" },
    { id: "fills",     label: "Fills" },
    { id: "songs",     label: "Songs" },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ padding: "24px 20px 16px", background: "rgba(8,8,12,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", flexShrink: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 className="hl" style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #a855f7, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            THE VAULT
          </h1>
        </div>

        {/* Sub-tabs as pills */}
        <div style={{ display: "flex", gap: 8 }}>
          {SUBTABS.map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className="hl"
              style={{
                padding: "7px 16px", borderRadius: 999,
                border: subTab === t.id ? "1px solid rgba(255,191,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
                background: subTab === t.id ? "rgba(255,191,0,0.15)" : "rgba(255,255,255,0.04)",
                color: subTab === t.id ? "var(--amber)" : "var(--text3)",
                fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                letterSpacing: "0.04em",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "16px 16px 0", paddingBottom: "calc(var(--nav-h) + 16px)" }}>

        {/* ── EXERCISES ── */}
        {subTab === "exercises" && (
          <>
            {/* Category filter pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", marginBottom: 12, paddingBottom: 4 }} className="no-sb">
              <button
                onClick={() => setCatFilter("all")}
                className="hl"
                style={{
                  padding: "5px 12px", borderRadius: 20, flexShrink: 0,
                  border: catFilter === "all" ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
                  background: catFilter === "all" ? "rgba(255,191,0,0.12)" : "transparent",
                  color: catFilter === "all" ? "var(--amber)" : "var(--outline)",
                  fontSize: 10, fontWeight: 700, cursor: "pointer",
                }}
              >
                TODOS
              </button>
              {cats.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCatFilter(catFilter === c.id ? "all" : c.id)}
                  className="hl"
                  style={{
                    padding: "5px 12px", borderRadius: 20, flexShrink: 0,
                    border: catFilter === c.id ? `1px solid ${c.color}` : "1px solid var(--outline-v)",
                    background: catFilter === c.id ? `${c.color}20` : "transparent",
                    color: catFilter === c.id ? c.color : "var(--outline)",
                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* +1 BPM for selected category */}
            {catFilter !== "all" && (
              <button
                onClick={() => bumpCatBpm(catFilter)}
                className="hl"
                style={{
                  width: "100%", padding: "8px", borderRadius: 10, marginBottom: 10,
                  border: "1px solid var(--amber)", background: "rgba(255,191,0,0.06)",
                  color: "var(--amber)", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}
              >
                SUBIR BPM +1 ({cats.find(c => c.id === catFilter)?.name})
              </button>
            )}

            {filteredExs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--outline)" }}>
                <MI style={{ fontSize: 40, display: "block", marginBottom: 10 }}>fitness_center</MI>
                <p style={{ margin: 0, fontSize: 13 }}>Sin ejercicios</p>
              </div>
            ) : (
              filteredExs.map((ex, idx) => (
                <ExCard
                  key={ex.id}
                  ex={ex}
                  index={idx}
                  category={cats.find(c => c.id === ex.categoryId)}
                  onEdit={() => setExForm(ex)}
                  onDelete={() => deleteEx(ex.id)}
                />
              ))
            )}
          </>
        )}

        {/* ── FILLS & GROOVES ── */}
        {subTab === "fills" && (
          <>
            {filteredFills.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--outline)" }}>
                <MI style={{ fontSize: 40, display: "block", marginBottom: 10 }}>music_note</MI>
                <p style={{ margin: 0, fontSize: 13 }}>Sin fills ni grooves</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {filteredFills.map(f => (
                  <FillCard
                    key={f.id}
                    fill={f}
                    onEdit={() => setFillForm(f)}
                    onDelete={() => deleteFill(f.id)}
                    onPracticed={() => markFillPracticed(f.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SONGS ── */}
        {subTab === "songs" && (
          <>
            {filteredSongs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--outline)" }}>
                <MI style={{ fontSize: 40, display: "block", marginBottom: 10 }}>library_music</MI>
                <p style={{ margin: 0, fontSize: 13 }}>Sin canciones</p>
              </div>
            ) : (
              filteredSongs.map(s => (
                <SongCard
                  key={s.id}
                  song={s}
                  onPlay={() => openSongPlayer(s)}
                  onEdit={() => setSongForm(s)}
                  onDelete={() => deleteSong(s.id)}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Sub-tab contextual add buttons */}
      {subTab === "exercises" && <FAB onClick={() => setExForm({})} label="EJERCICIO" />}
      {subTab === "fills"     && <FAB onClick={() => setFillForm({})} label="FILL / GROOVE" />}
      {subTab === "songs"     && <FAB onClick={() => setSongForm({})} label="CANCIÓN" />}

      {/* Modals */}
      {exForm !== null && (
        <ExForm
          initial={exForm}
          categories={cats}
          onSave={saveEx}
          onClose={() => setExForm(null)}
        />
      )}
      {fillForm !== null && (
        <FillForm
          initial={fillForm}
          onSave={saveFill}
          onClose={() => setFillForm(null)}
        />
      )}
      {songForm !== null && (
        <SongForm
          initial={songForm}
          onSave={saveSong}
          onClose={() => setSongForm(null)}
        />
      )}

      {/* Song Player Overlay */}
      {songPlayerOpen && activeSong && (
        <SongPlayer
          song={activeSong}
          onClose={() => { setSongPlayerOpen(false); setActiveSong(null); }}
          onSpeedChange={handleSongSpeedChange}
        />
      )}
    </div>
  );
}
