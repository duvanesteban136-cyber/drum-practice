// Pure musical timing: how a bar is counted, how long each pulse lasts, default accents.

export const MIN_BPM = 20
export const MAX_BPM = 400
const MIN_SWING = 50
const MAX_SWING = 75
const DENOMINATORS = [2, 4, 8, 16]
const UNIT_BY_DEN = { 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth' }

const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const toInt = (v, lo, hi, fallback) => clamp(Math.round(finite(v, fallback)), lo, hi)

/**
 * @typedef {{ num: number, den: number }} Meter
 * @typedef {'half'|'quarter'|'dotted-quarter'|'eighth'|'sixteenth'} BeatUnit
 * @typedef {{ beatsPerBar: number, pulsesPerBeat: number, beatUnit: BeatUnit }} BeatStructure
 */

/** BPM clamped to 20–400; anything that is not a finite number becomes `fallback` (default 100). */
export function clampBpm(bpm, fallback = 100) {
  return clamp(finite(bpm, finite(fallback, 100)), MIN_BPM, MAX_BPM)
}

/**
 * How one bar is counted. The BPM always refers to `beatUnit`, so a beat lasts 60/bpm s.
 * Compound (dotted-quarter beats, num/3 of them) only when feel is 'compound', den is 8 and
 * num is a multiple of 3 that is >= 6; its pulses per beat snap to 1, 3 or 6 (2–3 → 3, 4–6 → 6).
 * Otherwise simple: num beats of the denominator's value, `subdivision` pulses each.
 * Malformed input falls back to safe values: num 1–16, den 2/4/8/16 (else 4), subdivision 1–6.
 * @param {Meter} meter
 * @param {'simple'|'compound'} feel
 * @param {number} subdivision
 * @returns {BeatStructure}
 */
export function beatStructure(meter, feel, subdivision) {
  const num = toInt(meter?.num, 1, 16, 4)
  const den = DENOMINATORS.includes(meter?.den) ? meter.den : 4
  const sub = toInt(subdivision, 1, 6, 1)
  if (feel === 'compound' && den === 8 && num % 3 === 0 && num >= 6) {
    return { beatsPerBar: num / 3, pulsesPerBeat: sub === 1 ? 1 : sub <= 3 ? 3 : 6, beatUnit: 'dotted-quarter' }
  }
  return { beatsPerBar: num, pulsesPerBeat: sub, beatUnit: UNIT_BY_DEN[den] }
}

/**
 * Default accents: pulse 0 accent, every other beat start normal, in-between pulses soft.
 * @returns {{ level: 'accent'|'normal'|'soft', sound: null }[]}
 */
export function defaultGrid(meter, feel, subdivision) {
  const { beatsPerBar, pulsesPerBeat } = beatStructure(meter, feel, subdivision)
  return Array.from({ length: beatsPerBar * pulsesPerBeat }, (_, i) => ({
    level: i === 0 ? 'accent' : i % pulsesPerBeat === 0 ? 'normal' : 'soft',
    sound: null,
  }))
}

/**
 * Seconds of each pulse of one bar (`structure` comes from beatStructure). p = 60 / bpm / pulsesPerBeat.
 * Swing S (clamped to 50–75 %) applies only with 2 or 4 pulses per beat: in each pair the first
 * pulse lasts 2·p·S/100 and the second 2·p·(100−S)/100, so beats keep their length.
 * @param {number} bpm  clamped to 20–400
 * @param {BeatStructure} structure
 * @param {number} swing
 * @returns {number[]}
 */
export function pulseDurations(bpm, structure, swing) {
  const { beatsPerBar, pulsesPerBeat } = structure
  const p = 60 / clampBpm(bpm) / pulsesPerBeat
  const s = pulsesPerBeat === 2 || pulsesPerBeat === 4 ? clamp(finite(swing, MIN_SWING), MIN_SWING, MAX_SWING) : MIN_SWING
  const pair = s === MIN_SWING ? [p, p] : [(2 * p * s) / 100, (2 * p * (100 - s)) / 100]
  return Array.from({ length: beatsPerBar * pulsesPerBeat }, (_, i) => pair[i % 2])
}
