import { useState, useRef, useEffect, useCallback } from "react";

export function useAudioPlayer() {
  const mediaRef    = useRef(null);  // HTMLAudioElement or HTMLVideoElement
  const analyserRef = useRef(null);
  const ctxRef      = useRef(null);
  const sourceRef   = useRef(null);
  const rafRef      = useRef(null);

  const [fileInfo,     setFileInfo]     = useState(null);  // {name, type, url, isVideo}
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [duration,     setDuration]     = useState(0);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopA,        setLoopA]        = useState(null);
  const [loopB,        setLoopB]        = useState(null);
  const [abLoopActive, setAbLoopActive] = useState(false);
  const [waveformData, setWaveformData] = useState(new Float32Array(64));

  /* Waveform animation */
  const tickWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const buf = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buf);
    // Downsample to 64 points
    const out = new Float32Array(64);
    const step = Math.floor(buf.length / 64);
    for (let i = 0; i < 64; i++) out[i] = Math.abs(buf[i * step]);
    setWaveformData(out);
    rafRef.current = requestAnimationFrame(tickWaveform);
  }, []);

  /* Load a File object */
  const loadFile = useCallback((file) => {
    if (!file) return;
    // Revoke previous URL
    if (fileInfo?.url) URL.revokeObjectURL(fileInfo.url);
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    setFileInfo({ name: file.name, type: file.type, url, isVideo });
    setIsPlaying(false);
    setCurrentTime(0);
    setLoopA(null); setLoopB(null); setAbLoopActive(false);
  }, [fileInfo]);

  /* Connect Web Audio analyser to media element */
  const connectAnalyser = useCallback((el) => {
    if (!el || analyserRef.current) return;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      sourceRef.current = src;
      analyserRef.current = analyser;
    } catch {}
  }, []);

  /* When fileInfo changes, wire up media element events */
  useEffect(() => {
    if (!fileInfo || !mediaRef.current) return;
    const el = mediaRef.current;
    el.src = fileInfo.url;
    el.preservesPitch = true;
    el.playbackRate   = playbackRate;
    el.load();

    const onLoaded  = () => { setDuration(el.duration || 0); connectAnalyser(el); };
    const onTime    = () => {
      setCurrentTime(el.currentTime);
      if (abLoopActive && loopB !== null && el.currentTime >= loopB) {
        el.currentTime = loopA || 0;
      }
    };
    const onEnded   = () => setIsPlaying(false);
    const onPlay    = () => { setIsPlaying(true); rafRef.current = requestAnimationFrame(tickWaveform); };
    const onPause   = () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); };

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate",     onTime);
    el.addEventListener("ended",          onEnded);
    el.addEventListener("play",           onPlay);
    el.addEventListener("pause",          onPause);

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate",     onTime);
      el.removeEventListener("ended",          onEnded);
      el.removeEventListener("play",           onPlay);
      el.removeEventListener("pause",          onPause);
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileInfo]);

  /* Keep playbackRate in sync */
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate   = playbackRate;
      mediaRef.current.preservesPitch = true;
    }
  }, [playbackRate]);

  /* Keep A-B loop reactive */
  useEffect(() => {
    // re-register timeupdate when loopA/loopB/abLoopActive change
    if (!mediaRef.current || !fileInfo) return;
    const el = mediaRef.current;
    const onTime = () => {
      setCurrentTime(el.currentTime);
      if (abLoopActive && loopB !== null && el.currentTime >= loopB) {
        el.currentTime = loopA || 0;
      }
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [abLoopActive, loopA, loopB, fileInfo]);

  const togglePlay = useCallback(() => {
    if (!mediaRef.current || !fileInfo) return;
    if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
    isPlaying ? mediaRef.current.pause() : mediaRef.current.play();
  }, [isPlaying, fileInfo]);

  const seek = useCallback((t) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = clampTime(t, 0, duration);
  }, [duration]);

  const skip = useCallback((delta) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = clampTime(mediaRef.current.currentTime + delta, 0, duration);
  }, [duration]);

  const setRate = useCallback((r) => {
    setPlaybackRate(clampTime(r, 0.25, 2));
  }, []);

  const setLoopPoint = useCallback((which) => {
    if (!mediaRef.current) return;
    const t = mediaRef.current.currentTime;
    if (which === "A") { setLoopA(t); setLoopB(null); setAbLoopActive(false); }
    else if (which === "B" && loopA !== null && t > loopA) { setLoopB(t); setAbLoopActive(true); }
  }, [loopA]);

  const clearLoop = useCallback(() => {
    setLoopA(null); setLoopB(null); setAbLoopActive(false);
  }, []);

  const unload = useCallback(() => {
    if (mediaRef.current) { mediaRef.current.pause(); mediaRef.current.src = ""; }
    if (fileInfo?.url) URL.revokeObjectURL(fileInfo.url);
    setFileInfo(null); setIsPlaying(false); setCurrentTime(0); setDuration(0);
    setLoopA(null); setLoopB(null); setAbLoopActive(false);
    cancelAnimationFrame(rafRef.current);
  }, [fileInfo]);

  return {
    mediaRef, fileInfo, isPlaying, duration, currentTime,
    playbackRate, loopA, loopB, abLoopActive, waveformData,
    loadFile, togglePlay, seek, skip, setRate, setLoopPoint, clearLoop, unload,
  };
}

const clampTime = (v, lo, hi) => Math.max(lo, Math.min(isFinite(hi) ? hi : lo + 1, v));
