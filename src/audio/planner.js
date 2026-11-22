// planBar(): every sound of the next bar (count-in, accent grid, gap, random mute, poly, speed
// trainer). Pure — no Web Audio, no React, randomness injected — so the engine only schedules
// what this returns and every musical rule is testable without audio.
import { beatStructure, clampBpm, defaultGrid, pulseDurations } from './timing.js'

const LEVELS = ['accent', 'normal', 'soft', 'mute']
const LEVEL_GAIN = { accent: 1, normal: 0.75, soft: 0.4, mute: 0 }
const DEFAULT_SOUND = 'click'

const finite = (v, fallback) => (Number.isFinite(v) ? v : fallback)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const whole = (v, fallback, min = 0) => Math.max(min, Math.round(finite(v, fallback)))
const sum = (a) => a.reduce((s, x) => s + x, 0)

/**
 * @typedef {'accent'|'normal'|'soft'|'mute'} Level
 *
 * @typedef {Object} MetroConfig
 * @property {number} bpm  BPM of the beat unit (20–400); also where the trainer starts.
 * @property {{num: number, den: number}} meter
 * @property {'simple'|'compound'} feel  compound = dotted-quarter beats in 6/8, 9/8, 12/8…
 * @property {number} subdivision  pulses per beat (1–6; compound snaps to 1, 3 or 6)
 * @property {{level: Level, sound: string|null}[]|null} grid  one cell per pulse; null or a wrong length → defaultGrid
 * @property {{accent: string, normal: string, soft: string}} sounds  sound per level when the cell has none
 * @property {{master: number, subdivision: number}} volume  master is applied by the engine; subdivision scales pulses that are not beat starts
 * @property {number} swing  50–75 %, only with 2 or 4 pulses per beat
 * @property {number} countInBars
 * @property {{enabled: boolean, introBars: number, playBars: number, muteBars: number, mode: 'full'|'one'|'offbeat', hideVisual: boolean}} gap
 * @property {{enabled: boolean, percent: number, protectOne: boolean}} randomMute
 * @property {{enabled: boolean, n: number, sound: string, volume: number}} poly  n hits spread evenly over each bar
 * @property {{enabled: boolean, type: 'ramp'|'steps', targetBpm: number, rampSeconds: number, stepBars: number, stepBpm: number, onReach: 'hold'|'stop'|'restart'}} trainer
 *
 * @typedef {Object} PlayState
 * @property {number} barIndex  bars planned so far, count-in included
 * @property {number} countInLeft  count-in bars still to play
 * @property {number} gapBar  bars played in the gap cycle (count-in excluded; stays 0 while the gap is off)
 * @property {number} trainerBpm  trainer BPM at the current position, i.e. of the next beat
 * @property {number} trainerElapsed  trainer progress, count-in excluded: played seconds (ramp) or played bars (steps)
 * @property {boolean} trainerPaused  owned by the engine; freezes trainerBpm and trainerElapsed
 * @property {boolean} reached  the target BPM has sounded
 *
 * @typedef {Object} BarEvent
 * @property {number} at  seconds from the bar start
 * @property {'main'|'poly'|'countin'} kind
 * @property {'accent'|'normal'|'soft'} level  picks the sample variant
 * @property {string} sound
 * @property {number} gain  0–1, before the master volume
 *
 * @typedef {Object} BarPlan
 * @property {boolean} stop  true: the trainer reached its target with onReach 'stop'; nothing to play
 * @property {'countin'|'play'} phase
 * @property {BarEvent[]} events  sorted by `at`; every `at` is finite, >= 0 and < duration
 * @property {number} duration  seconds
 * @property {{pulseAt: number[], silent: boolean[], bpm: number[]}} visual  per pulse (per beat during the count-in): onset, not sounding, BPM in effect
 * @property {{section: 'intro'|'play'|'mute', barInSection: number, sectionLength: number}|null} gap  this bar's place in the gap cycle
 * @property {PlayState} nextState
 */

/** @returns {MetroConfig} */
export function defaultMetroConfig() {
  return {
    bpm: 100,
    meter: { num: 4, den: 4 },
    feel: 'simple',
    subdivision: 1,
    grid: null,
    sounds: { accent: 'click', normal: 'click', soft: 'click' },
    volume: { master: 0.9, subdivision: 0.6 },
    swing: 50,
    countInBars: 1,
    gap: { enabled: false, introBars: 1, playBars: 2, muteBars: 2, mode: 'full', hideVisual: true },
    randomMute: { enabled: false, percent: 25, protectOne: true },
    poly: { enabled: false, n: 3, sound: 'wood', volume: 0.7 },
    trainer: { enabled: false, type: 'ramp', targetBpm: 140, rampSeconds: 120, stepBars: 4, stepBpm: 2, onReach: 'hold' },
  }
}

/**
 * @param {MetroConfig} config
 * @returns {PlayState}
 */
export function initialPlayState(config) {
  return {
    barIndex: 0,
    countInLeft: whole(config?.countInBars, 0),
    gapBar: 0,
    trainerBpm: clampBpm(config?.bpm),
    trainerElapsed: 0,
    trainerPaused: false,
    reached: false,
  }
}

// A sanitized view of the config: every number finite and in range, every object present.
function settings(config) {
  const c = config ?? {}
  const bpm = clampBpm(c.bpm)
  const sounds = c.sounds ?? {}
  const rm = c.randomMute ?? {}
  const poly = c.poly ?? {}
  const t = c.trainer ?? {}
  const chance = clamp(finite(rm.percent, 0), 0, 100) / 100
  return {
    bpm,
    meter: c.meter,
    feel: c.feel,
    subdivision: c.subdivision,
    grid: c.grid,
    swing: c.swing,
    structure: beatStructure(c.meter, c.feel, c.subdivision),
    sounds: {
      accent: sounds.accent ?? DEFAULT_SOUND,
      normal: sounds.normal ?? DEFAULT_SOUND,
      soft: sounds.soft ?? DEFAULT_SOUND,
    },
    subVolume: clamp(finite(c.volume?.subdivision, 0.6), 0, 1),
    gap: { ...c.gap, enabled: !!c.gap?.enabled },
    randomMute: { enabled: !!rm.enabled && chance > 0, chance, protectOne: rm.protectOne !== false },
    poly: {
      enabled: !!poly.enabled,
      n: whole(poly.n, 3, 1),
      sound: poly.sound ?? 'wood',
      gain: clamp(finite(poly.volume, 0.7), 0, 1),
    },
    trainer: {
      enabled: !!t.enabled,
      steps: t.type === 'steps',
      start: bpm,
      target: clampBpm(t.targetBpm, bpm),
      rampSeconds: Math.max(0, finite(t.rampSeconds, 0)),
      stepBars: whole(t.stepBars, 4, 1),
      stepBpm: Math.abs(finite(t.stepBpm, 0)) || 2,
      onReach: t.onReach === 'stop' || t.onReach === 'restart' ? t.onReach : 'hold',
    },
  }
}

// introBars sounding bars, then cycles of playBars sounding + muteBars muted.
function gapSection(gap, gapBar) {
  const intro = whole(gap.introBars, 1)
  const play = whole(gap.playBars, 2, 1)
  const mute = whole(gap.muteBars, 2, 1)
  if (gapBar < intro) return { section: 'intro', barInSection: gapBar + 1, sectionLength: intro }
  const pos = (gapBar - intro) % (play + mute)
  return pos < play
    ? { section: 'play', barInSection: pos + 1, sectionLength: play }
    : { section: 'mute', barInSection: pos - play + 1, sectionLength: mute }
}

// Trainer BPM after `elapsed` (seconds for a ramp, bars for steps); never passes the target.
function trainerBpmAt(tr, elapsed) {
  const span = tr.target - tr.start
  if (tr.steps) {
    const climbed = Math.floor(elapsed / tr.stepBars) * tr.stepBpm
    return climbed >= Math.abs(span) ? tr.target : tr.start + Math.sign(span) * climbed
  }
  return elapsed >= tr.rampSeconds ? tr.target : tr.start + (span * elapsed) / tr.rampSeconds
}

function countInBar(s, state, bpm) {
  const beat = 60 / bpm
  const pulseAt = Array.from({ length: s.structure.beatsPerBar }, (_, i) => i * beat)
  return {
    stop: false,
    phase: 'countin',
    events: pulseAt.map((at, i) => ({
      at,
      kind: 'countin',
      level: i === 0 ? 'accent' : 'normal',
      sound: 'countin',
      gain: i === 0 ? 1 : 0.75,
    })),
    duration: pulseAt.length * beat,
    visual: { pulseAt, silent: pulseAt.map(() => false), bpm: pulseAt.map(() => bpm) },
    gap: null,
    nextState: { ...state, barIndex: whole(state.barIndex, 0) + 1, countInLeft: whole(state.countInLeft, 0) - 1 },
  }
}

function stoppedBar(s, state) {
  const bpm = clampBpm(state.trainerBpm, s.trainer.target)
  return {
    stop: true,
    phase: 'play',
    events: [],
    // A silent bar's length, so a caller that ignores `stop` still moves forward instead of spinning.
    duration: sum(pulseDurations(bpm, s.structure, s.swing)),
    visual: { pulseAt: [], silent: [], bpm: [] },
    gap: null,
    nextState: { ...state },
  }
}

// Pulse onsets of one bar. A ramp is re-evaluated at every beat start (from the seconds played
// so far), steps only at the bar line; all pulses of a beat share its BPM, so swing pairs hold.
function tempoMap(s, bpmAt, elapsed) {
  const oneBeat = { ...s.structure, beatsPerBar: 1 }
  const beatBpm = []
  const pulseAt = []
  let duration = 0
  for (let b = 0; b < s.structure.beatsPerBar; b++) {
    const bpm = bpmAt(s.trainer.steps ? elapsed : elapsed + duration)
    beatBpm.push(bpm)
    for (const d of pulseDurations(bpm, oneBeat, s.swing)) {
      pulseAt.push(duration)
      duration += d
    }
  }
  return { beatBpm, pulseAt, duration }
}

// Grid pulses: level gain (scaled by volume.subdivision off the beat), gap mute, random mute.
function gridEvents(s, pulseAt, muted, rng) {
  const ppb = s.structure.pulsesPerBeat
  const grid = Array.isArray(s.grid) && s.grid.length === pulseAt.length ? s.grid : defaultGrid(s.meter, s.feel, s.subdivision)
  const rm = s.randomMute
  const events = []
  const silent = []
  pulseAt.forEach((at, i) => {
    const cell = grid[i] ?? {}
    const level = LEVELS.includes(cell.level) ? cell.level : 'normal'
    const gain = LEVEL_GAIN[level] * (i % ppb === 0 ? 1 : s.subVolume)
    let sounds = gain > 0 && (!muted || (s.gap.mode === 'one' && i === 0))
    if (sounds && rm.enabled && !(i === 0 && rm.protectOne)) sounds = rng() >= rm.chance
    silent.push(!sounds)
    if (sounds) events.push({ at, kind: 'main', level, sound: cell.sound ?? s.sounds[level], gain })
  })
  return { events, silent }
}

// Offbeat gap: a click on every "and", whatever the subdivision. With an even pulse count the
// "and" is pulse ppb/2 of the beat (the swung one with swung eighths); otherwise halfway.
function offbeatClicks(s, pulseAt, duration) {
  const { beatsPerBar, pulsesPerBeat: ppb } = s.structure
  return Array.from({ length: beatsPerBar }, (_, b) => {
    const first = b * ppb
    const end = b + 1 < beatsPerBar ? pulseAt[first + ppb] : duration
    const at = ppb % 2 === 0 ? pulseAt[first + ppb / 2] : (pulseAt[first] + end) / 2
    return { at, kind: 'main', level: 'normal', sound: s.sounds.normal, gain: LEVEL_GAIN.normal }
  })
}

// n hits at exact fractions of the bar's actual (swung/ramped) duration.
function polyHits(s, duration) {
  const { n, sound, gain } = s.poly
  return Array.from({ length: n }, (_, k) => ({ at: (k * duration) / n, kind: 'poly', level: 'normal', sound, gain }))
}

/**
 * Plans the next bar. Times are seconds from the bar start; master volume is left to the engine.
 * `rng` is called once per main pulse that would otherwise sound (in order, skipping a protected
 * pulse 0), and only when random mute is on.
 * @param {MetroConfig} config
 * @param {PlayState} state
 * @param {() => number} [rng]
 * @returns {BarPlan}
 */
export function planBar(config, state, rng = Math.random) {
  const s = settings(config)
  const tr = s.trainer
  const paused = !!state.trainerPaused
  const live = tr.enabled && !paused // the trainer advances during this bar

  if (live && state.reached && tr.onReach === 'stop') return stoppedBar(s, state)

  let elapsed = Math.max(0, finite(state.trainerElapsed, 0))
  let reached = !!state.reached
  if (live && reached && tr.onReach === 'restart') {
    elapsed = 0
    reached = false
  }
  const frozenBpm = clampBpm(state.trainerBpm, s.bpm)
  const bpmAt = (e) => (!tr.enabled ? s.bpm : paused ? frozenBpm : trainerBpmAt(tr, e))

  // Count-in: gap and trainer stay frozen; it counts at the tempo the bar after it starts with.
  if (whole(state.countInLeft, 0) > 0) return countInBar(s, state, bpmAt(elapsed))

  const { beatBpm, pulseAt, duration } = tempoMap(s, bpmAt, elapsed)

  let trainer
  if (!tr.enabled) trainer = { trainerBpm: s.bpm, trainerElapsed: 0, reached: false }
  else if (paused) trainer = { trainerBpm: frozenBpm, trainerElapsed: elapsed, reached }
  else {
    const doneElapsed = elapsed + (tr.steps ? 1 : duration)
    const hit = reached || beatBpm.includes(tr.target)
    trainer = hit && tr.onReach === 'restart'
      ? { trainerBpm: tr.start, trainerElapsed: 0, reached: false }
      : { trainerBpm: trainerBpmAt(tr, doneElapsed), trainerElapsed: doneElapsed, reached: hit }
  }

  const gapBar = whole(state.gapBar, 0)
  const gap = s.gap.enabled ? gapSection(s.gap, gapBar) : null
  const muted = gap?.section === 'mute'

  const { events, silent } = gridEvents(s, pulseAt, muted, rng)
  if (muted && s.gap.mode === 'offbeat') events.push(...offbeatClicks(s, pulseAt, duration))
  if (s.poly.enabled && !muted && s.poly.gain > 0) events.push(...polyHits(s, duration))
  events.sort((a, b) => a.at - b.at)

  const ppb = s.structure.pulsesPerBeat
  return {
    stop: false,
    phase: 'play',
    events,
    duration,
    visual: { pulseAt, silent, bpm: pulseAt.map((_, i) => beatBpm[Math.floor(i / ppb)]) },
    gap,
    nextState: {
      ...state,
      barIndex: whole(state.barIndex, 0) + 1,
      countInLeft: 0,
      gapBar: s.gap.enabled ? gapBar + 1 : 0,
      trainerPaused: paused,
      ...trainer,
    },
  }
}
