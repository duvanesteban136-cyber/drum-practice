import { useState, useRef, useEffect, useCallback } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer.js";

/* ─── helpers ─── */
function MI({ children, style }) {
  return (
    <span className="msym" style={{ fontSize: 20, lineHeight: 1, userSelect: "none", ...style }}>
      {children}
    </span>
  );
}

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

/* ─── Waveform canvas ─── */
function WaveformCanvas({ waveformData, currentTime, duration, loopA, loopB }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const barW = Math.floor(W / 64);
    const gap = 1;

    for (let i = 0; i < 64; i++) {
      const val = waveformData[i] || 0;
      const barH = Math.max(2, val * H * 0.9);
      const x = i * (barW + gap);
      const y = (H - barH) / 2;
      ctx.fillStyle = "rgba(255,191,0,0.7)";
      ctx.fillRect(x, y, barW, barH);
    }

    // progress overlay
    if (duration > 0) {
      const pct = currentTime / duration;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(Math.floor(pct * W), 0, W, H);

      // A-B loop region
      if (loopA !== null && loopB !== null) {
        const ax = (loopA / duration) * W;
        const bx = (loopB / duration) * W;
        ctx.fillStyle = "rgba(255,191,0,0.15)";
        ctx.fillRect(ax, 0, bx - ax, H);
        ctx.fillStyle = "var(--amber)";
        ctx.fillRect(ax, 0, 2, H);
        ctx.fillRect(bx - 2, 0, 2, H);
      } else if (loopA !== null) {
        const ax = (loopA / duration) * W;
        ctx.fillStyle = "rgba(255,191,0,0.8)";
        ctx.fillRect(ax, 0, 2, H);
      }
    }
  }, [waveformData, currentTime, duration, loopA, loopB]);

  return (
    <canvas
      ref={canvasRef}
      width={440}
      height={64}
      style={{ width: "100%", height: 64, borderRadius: 8, background: "rgba(255,255,255,0.04)" }}
    />
  );
}

/* ─── main component ─── */
export default function SongPlayer({ song, onClose, metro }) {
  const {
    mediaRef, fileInfo, isPlaying, duration, currentTime,
    playbackRate, loopA, loopB, abLoopActive, waveformData,
    loadFile, togglePlay, seek, skip, setRate, setLoopPoint, clearLoop, unload,
  } = useAudioPlayer();

  const [localUrl, setLocalUrl] = useState(song?.playUrl || null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  // Determine if it's a video
  const isVideo = fileInfo?.isVideo || (song?.fileType || "").startsWith("video/");

  // Wire mediaRef to the actual DOM element
  const setMediaEl = useCallback((el) => {
    mediaRef.current = el;
  }, [mediaRef]);

  // If song.playUrl is a data URL or object URL, load it directly
  useEffect(() => {
    if (song?.playUrl && !fileInfo) {
      // We can't call loadFile with a URL string directly (it needs a File),
      // so manually set fileInfo via the media element
      const el = isVideo ? videoRef.current : audioRef.current;
      if (el) {
        el.src = song.playUrl;
        el.load();
        mediaRef.current = el;
      }
      setLocalUrl(song.playUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.playUrl]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
      setLocalUrl(null);
    }
  };

  const playUrl = fileInfo?.url || localUrl;
  const hasFile = !!playUrl;
  const isVideoFile = isVideo || (fileInfo?.isVideo);

  const speedPct = Math.round(playbackRate * 100);

  /* ─── seek bar change ─── */
  const handleSeek = (e) => {
    seek(parseFloat(e.target.value));
  };

  /* ─── close ─── */
  const handleClose = () => {
    unload();
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "var(--bg)", display: "flex", flexDirection: "column",
      maxWidth: 480, margin: "0 auto",
      animation: "slideUp 0.25s ease",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "20px 20px 12px",
        background: "rgba(8,8,12,0.95)",
        borderBottom: "1px solid var(--glass-border)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <h2 className="hl" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--on-s)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {song?.name || "Sin título"}
          </h2>
          {song?.artist && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--outline)" }}>{song.artist}</p>
          )}
        </div>
        <button
          onClick={handleClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--on-sv)" }}
        >
          <MI style={{ fontSize: 24 }}>close</MI>
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="no-sb" style={{ flex: 1, overflowY: "auto", padding: "16px 20px 120px" }}>

        {/* No file state */}
        {!hasFile && (
          <div style={{
            textAlign: "center", padding: "32px 0",
            background: "var(--surface2)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(10px)",
            borderRadius: 12, marginBottom: 16,
          }}>
            <MI style={{ fontSize: 40, color: "var(--outline)", display: "block", marginBottom: 10 }}>audio_file</MI>
            <p style={{ color: "var(--outline)", fontSize: 13, margin: "0 0 16px" }}>
              No hay archivo — vuelve a seleccionar
            </p>
            <label style={{
              display: "inline-block", padding: "10px 20px",
              background: "var(--amber)", color: "var(--on-amber)",
              borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700,
            }}>
              SELECCIONAR ARCHIVO
              <input type="file" accept="audio/*,video/*" onChange={handleFileSelect} style={{ display: "none" }} />
            </label>
          </div>
        )}

        {/* Video element */}
        {hasFile && isVideoFile && (
          <video
            ref={el => { videoRef.current = el; setMediaEl(el); }}
            src={playUrl}
            style={{
              width: "100%", maxHeight: 240, objectFit: "contain",
              background: "#000", borderRadius: 10, marginBottom: 12,
            }}
            preload="metadata"
          />
        )}

        {/* Audio element (hidden) */}
        {hasFile && !isVideoFile && (
          <audio
            ref={el => { audioRef.current = el; setMediaEl(el); }}
            src={playUrl}
            preload="metadata"
            style={{ display: "none" }}
          />
        )}

        {/* Waveform */}
        {hasFile && (
          <div style={{ marginBottom: 12 }}>
            <WaveformCanvas
              waveformData={waveformData}
              currentTime={currentTime}
              duration={duration}
              loopA={loopA}
              loopB={loopB}
            />
          </div>
        )}

        {/* Seek bar */}
        {hasFile && (
          <div style={{ marginBottom: 12 }}>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.5}
              value={currentTime}
              onChange={handleSeek}
              style={{ width: "100%", accentColor: "var(--amber)", height: 4, cursor: "pointer" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--outline)" }}>{fmtTime(currentTime)}</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--outline)" }}>{fmtTime(duration)}</span>
            </div>
          </div>
        )}

        {/* Transport */}
        {hasFile && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 20 }}>
            <button
              onClick={() => skip(-10)}
              style={{
                width: 44, height: 44, borderRadius: 12,
                border: "1px solid var(--outline-v)", background: "var(--glass)",
                backdropFilter: "blur(8px)",
                color: "var(--on-sv)", cursor: "pointer", fontSize: 11, fontWeight: 700,
              }}
            >
              −10s
            </button>

            <button
              onClick={togglePlay}
              style={{
                width: 64, height: 64, borderRadius: "50%",
                border: "none",
                background: isPlaying
                  ? "linear-gradient(135deg, var(--accent-practice), #ff8c00)"
                  : "var(--glass)",
                color: isPlaying ? "#402d00" : "var(--text2)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: isPlaying
                  ? "0 0 0 8px rgba(255,191,0,0.12), 0 0 32px rgba(255,191,0,0.35)"
                  : "none",
                transition: "all 0.2s cubic-bezier(.34,1.56,.64,1)",
                border: isPlaying ? "none" : "1px solid var(--glass-border)",
              }}
            >
              <MI style={{ fontSize: 28, color: "inherit" }}>
                {isPlaying ? "pause" : "play_arrow"}
              </MI>
            </button>

            <button
              onClick={() => skip(10)}
              style={{
                width: 44, height: 44, borderRadius: 12,
                border: "1px solid var(--outline-v)", background: "var(--glass)",
                backdropFilter: "blur(8px)",
                color: "var(--on-sv)", cursor: "pointer", fontSize: 11, fontWeight: 700,
              }}
            >
              +10s
            </button>
          </div>
        )}

        {/* Speed control */}
        {hasFile && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            borderRadius: 12, padding: "16px",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span className="hl" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--outline)" }}>
                VELOCIDAD
              </span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="hl" style={{ fontSize: 28, fontWeight: 700, color: "var(--amber)", lineHeight: 1 }}>
                  {speedPct}%
                </span>
                {playbackRate < 1 && (
                  <span style={{ fontSize: 10, color: "var(--green)" }}>sin cambio de tono</span>
                )}
              </div>
            </div>

            <input
              type="range"
              min={0.25}
              max={1.5}
              step={0.05}
              value={playbackRate}
              onChange={e => setRate(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--amber)", marginBottom: 10 }}
            />

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {[25, 50, 75, 100, 125].map(p => {
                const r = p / 100;
                const active = Math.abs(playbackRate - r) < 0.01;
                return (
                  <button
                    key={p}
                    onClick={() => setRate(r)}
                    className="mono"
                    style={{
                      padding: "5px 12px", borderRadius: 8,
                      border: active ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
                      background: active ? "var(--amber)" : "var(--s-high)",
                      color: active ? "var(--on-amber)" : "var(--on-sv)",
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                      transition: "all 0.12s",
                    }}
                  >
                    {p}%
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* A-B Loop */}
        {hasFile && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            borderRadius: 12, padding: "14px 16px",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span className="hl" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--outline)" }}>
                LOOP A-B
              </span>
              {(loopA !== null || loopB !== null) && (
                <span className="mono" style={{ fontSize: 11, color: "var(--amber)" }}>
                  {loopA !== null ? `A: ${fmtTime(loopA)}` : ""}
                  {loopB !== null ? ` → B: ${fmtTime(loopB)}` : ""}
                  {abLoopActive && " ●"}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setLoopPoint("A")}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8,
                  border: loopA !== null ? "1px solid var(--amber)" : "1px solid var(--outline-v)",
                  background: loopA !== null ? "rgba(255,191,0,0.12)" : "var(--s-high)",
                  color: loopA !== null ? "var(--amber)" : "var(--on-sv)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                [A]
              </button>
              <button
                onClick={() => setLoopPoint("B")}
                disabled={loopA === null}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 8,
                  border: loopB !== null ? "1px solid var(--cyan)" : "1px solid var(--outline-v)",
                  background: loopB !== null ? "rgba(6,182,212,0.12)" : "var(--s-high)",
                  color: loopA === null ? "var(--outline)" : loopB !== null ? "var(--cyan)" : "var(--on-sv)",
                  fontSize: 12, fontWeight: 700, cursor: loopA === null ? "default" : "pointer",
                  opacity: loopA === null ? 0.5 : 1,
                }}
              >
                [B]
              </button>
              <button
                onClick={clearLoop}
                style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: "1px solid var(--outline-v)", background: "var(--s-high)",
                  color: "var(--red)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                [×]
              </button>
            </div>
          </div>
        )}

        {/* Reference BPM */}
        {song?.bpm && (
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--amber)", letterSpacing: "0.1em" }}>
              REFERENCIA: {song.bpm} BPM
            </span>
          </div>
        )}

        {/* Notes */}
        {song?.notes && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            borderRadius: 10, padding: 12, marginBottom: 12,
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--on-sv)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {song.notes}
            </p>
          </div>
        )}

        {/* Re-select file when playing */}
        {hasFile && (
          <div style={{ textAlign: "center" }}>
            <label style={{ color: "var(--outline)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
              Cambiar archivo
              <input type="file" accept="audio/*,video/*" onChange={handleFileSelect} style={{ display: "none" }} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
