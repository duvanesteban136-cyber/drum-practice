import { describe, it, expect, vi } from 'vitest'
import { planBar, initialPlayState, defaultMetroConfig } from './planner.js'

// defaultMetroConfig() with nested objects merged one level deep; no count-in unless asked.
function config(patch = {}) {
  const base = { ...defaultMetroConfig(), countInBars: 0 }
  const out = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const b = base[key]
    const mergeable = b && typeof b === 'object' && !Array.isArray(b) && value && typeof value === 'object' && !Array.isArray(value)
    out[key] = mergeable ? { ...b, ...value } : value
  }
  return out
}

// Plans `n` consecutive bars, feeding each nextState into the next call.
function run(cfg, n, { state = initialPlayState(cfg), rng } = {}) {
  const bars = []
  for (let i = 0; i < n; i++) {
    const bar = planBar(cfg, state, rng)
    bars.push(bar)
    state = bar.nextState
  }
  return bars
}

const mains = (bar) => bar.events.filter((e) => e.kind === 'main')
const polys = (bar) => bar.events.filter((e) => e.kind === 'poly')
const expectCloseList = (actual, expected, digits = 9) => {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((x, i) => expect(actual[i]).toBeCloseTo(x, digits))
}

// Deterministic rng for the invariant sweeps.
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze)
    Object.freeze(o)
  }
  return o
}

describe('defaults', () => {
  it('defaultMetroConfig has the documented values and returns fresh objects', () => {
    expect(defaultMetroConfig()).toEqual({
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
    })
    const a = defaultMetroConfig()
    a.gap.enabled = true
    a.meter.num = 7
    expect(defaultMetroConfig().gap.enabled).toBe(false)
    expect(defaultMetroConfig().meter.num).toBe(4)
  })

  it('initialPlayState starts at bar 0 with the configured count-in and BPM', () => {
    expect(initialPlayState({ ...defaultMetroConfig(), bpm: 87, countInBars: 2 })).toEqual({
      barIndex: 0,
      countInLeft: 2,
      gapBar: 0,
      trainerBpm: 87,
      trainerElapsed: 0,
      trainerPaused: false,
      reached: false,
    })
  })
})

describe('planBar: a plain bar', () => {
  it('4/4 at 120: four main clicks, accent first, bar of 2 s', () => {
    const c = config({ bpm: 120 })
    const bar = planBar(c, initialPlayState(c))
    expect(bar.stop).toBe(false)
    expect(bar.phase).toBe('play')
    expect(bar.duration).toBe(2)
    expect(bar.events).toEqual([
      { at: 0, kind: 'main', level: 'accent', sound: 'click', gain: 1 },
      { at: 0.5, kind: 'main', level: 'normal', sound: 'click', gain: 0.75 },
      { at: 1, kind: 'main', level: 'normal', sound: 'click', gain: 0.75 },
      { at: 1.5, kind: 'main', level: 'normal', sound: 'click', gain: 0.75 },
    ])
    expect(bar.visual).toEqual({ pulseAt: [0, 0.5, 1, 1.5], silent: [false, false, false, false], bpm: [120, 120, 120, 120] })
    expect(bar.gap).toBeNull()
    expect(bar.nextState).toEqual({
      barIndex: 1,
      countInLeft: 0,
      gapBar: 0,
      trainerBpm: 120,
      trainerElapsed: 0,
      trainerPaused: false,
      reached: false,
    })
  })

  it('volume.subdivision scales pulses that are not beat starts; master volume is left to the engine', () => {
    const grid = [
      { level: 'accent', sound: null },
      { level: 'accent', sound: null },
      { level: 'normal', sound: null },
      { level: 'soft', sound: null },
    ]
    const c = config({ bpm: 60, meter: { num: 2, den: 4 }, subdivision: 2, grid, volume: { master: 0.2, subdivision: 0.5 } })
    const bar = planBar(c, initialPlayState(c))
    expect(bar.events.map((e) => [e.at, e.level, e.gain])).toEqual([
      [0, 'accent', 1],
      [0.5, 'accent', 0.5],
      [1, 'normal', 0.75],
      [1.5, 'soft', 0.2],
    ])
  })

  it('takes level and sound from the grid, falling back to sounds[level]; mute cells are silent', () => {
    const grid = [
      { level: 'soft', sound: 'rim' },
      { level: 'mute', sound: null },
      { level: 'accent', sound: null },
      { level: 'normal', sound: 'kick' },
    ]
    const c = config({ bpm: 120, grid, sounds: { accent: 'hat', normal: 'beep', soft: 'wood' } })
    const bar = planBar(c, initialPlayState(c))
    expect(bar.events.map((e) => [e.at, e.level, e.sound, e.gain])).toEqual([
      [0, 'soft', 'rim', 0.4],
      [1, 'accent', 'hat', 1],
      [1.5, 'normal', 'kick', 0.75],
    ])
    expect(bar.visual.silent).toEqual([false, true, false, false])
  })

  it('a grid whose length does not match the bar falls back to the default grid', () => {
    const grid = [0, 1, 2, 3].map(() => ({ level: 'mute', sound: null }))
    const c = config({ bpm: 120, subdivision: 2, grid })
    const bar = planBar(c, initialPlayState(c))
    expect(bar.events.map((e) => e.level)).toEqual(['accent', 'soft', 'normal', 'soft', 'normal', 'soft', 'normal', 'soft'])
  })

  it('tolerates an empty or partial config', () => {
    const bar = planBar({}, initialPlayState({}))
    expect(bar.duration).toBeCloseTo(2.4, 12)
    expectCloseList(bar.visual.pulseAt, [0, 0.6, 1.2, 1.8])
    const odd = { bpm: 'fast', gap: { enabled: true }, poly: { enabled: true }, trainer: { enabled: true, type: 'steps' } }
    for (const b of run(odd, 8)) {
      expect(Number.isFinite(b.duration)).toBe(true)
      expect(b.duration).toBeGreaterThan(0)
      b.events.forEach((e) => expect(Number.isFinite(e.at) && Number.isFinite(e.gain)).toBe(true))
    }
  })

  it('does not mutate the config or the state', () => {
    const c = deepFreeze(config({
      countInBars: 1,
      subdivision: 2,
      gap: { enabled: true, mode: 'offbeat' },
      poly: { enabled: true },
      randomMute: { enabled: true },
      trainer: { enabled: true },
    }))
    let state = deepFreeze(initialPlayState(c))
    for (let i = 0; i < 6; i++) state = deepFreeze(planBar(c, state, () => 0.5).nextState)
    expect(state.barIndex).toBe(6)
  })
})

describe('planBar: count-in', () => {
  it('plays one countin click per beat; gap and trainer state are left as they were', () => {
    const c = config({
      bpm: 120,
      countInBars: 1,
      subdivision: 4,
      gap: { enabled: true },
      poly: { enabled: true },
      randomMute: { enabled: true, percent: 100, protectOne: false },
      trainer: { enabled: true, targetBpm: 160, rampSeconds: 30 },
    })
    const s0 = initialPlayState(c)
    const bar = planBar(c, s0, () => 0)
    expect(bar.phase).toBe('countin')
    expect(bar.events).toEqual([
      { at: 0, kind: 'countin', level: 'accent', sound: 'countin', gain: 1 },
      { at: 0.5, kind: 'countin', level: 'normal', sound: 'countin', gain: 0.75 },
      { at: 1, kind: 'countin', level: 'normal', sound: 'countin', gain: 0.75 },
      { at: 1.5, kind: 'countin', level: 'normal', sound: 'countin', gain: 0.75 },
    ])
    expect(bar.duration).toBe(2)
    expect(bar.visual).toEqual({ pulseAt: [0, 0.5, 1, 1.5], silent: [false, false, false, false], bpm: [120, 120, 120, 120] })
    expect(bar.gap).toBeNull()
    expect(bar.nextState).toEqual({ ...s0, barIndex: 1, countInLeft: 0 })
    const first = planBar(c, bar.nextState, () => 0.99)
    expect(first.phase).toBe('play')
    expect(first.visual.bpm[0]).toBe(120)
    expect(first.nextState.trainerElapsed).toBeGreaterThan(0)
    expect(first.nextState.gapBar).toBe(1)
  })

  it('counts countInBars bars down before playing', () => {
    const bars = run(config({ countInBars: 2 }), 3)
    expect(bars.map((b) => b.phase)).toEqual(['countin', 'countin', 'play'])
    expect(bars.map((b) => b.nextState.countInLeft)).toEqual([1, 0, 0])
    expect(bars.map((b) => b.nextState.barIndex)).toEqual([1, 2, 3])
  })

  it('counts the beats of the meter: 6/8 compound counts two dotted quarters', () => {
    const c = config({ bpm: 60, countInBars: 1, meter: { num: 6, den: 8 }, feel: 'compound', subdivision: 3 })
    const bar = planBar(c, initialPlayState(c))
    expect(bar.events.map((e) => [e.at, e.kind])).toEqual([[0, 'countin'], [1, 'countin']])
    expect(bar.duration).toBe(2)
  })

  it('no count-in when countInBars is 0', () => {
    expect(planBar(config({ countInBars: 0 }), initialPlayState(config())).phase).toBe('play')
  })
})

describe('planBar: gap', () => {
  const gapCfg = (mode, patch = {}) =>
    config({ bpm: 120, countInBars: 1, gap: { enabled: true, introBars: 1, playBars: 2, muteBars: 2, mode }, ...patch })
  const sounding = (bar) => (mains(bar).length > 0 ? 'S' : 'M')

  it("full: intro 1, play 2, mute 2 -> the 8 bars after the count-in are S S S M M S S M", () => {
    const bars = run(gapCfg('full'), 9)
    expect(bars[0].phase).toBe('countin')
    const played = bars.slice(1)
    expect(played.map(sounding)).toEqual(['S', 'S', 'S', 'M', 'M', 'S', 'S', 'M'])
    expect(played.map((b) => `${b.gap.section} ${b.gap.barInSection}/${b.gap.sectionLength}`)).toEqual([
      'intro 1/1', 'play 1/2', 'play 2/2', 'mute 1/2', 'mute 2/2', 'play 1/2', 'play 2/2', 'mute 1/2',
    ])
    expect(played.map((b) => b.nextState.gapBar)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const muted = played[3]
    expect(muted.events).toEqual([])
    expect(muted.visual.silent).toEqual([true, true, true, true])
    expect(muted.duration).toBe(2)
  })

  it('unequal lengths: intro 2, play 1, mute 3 -> S S S M M M S M M M', () => {
    const c = config({ bpm: 120, gap: { enabled: true, introBars: 2, playBars: 1, muteBars: 3, mode: 'full' } })
    const bars = run(c, 10)
    expect(bars.map(sounding)).toEqual(['S', 'S', 'S', 'M', 'M', 'M', 'S', 'M', 'M', 'M'])
    expect(bars.map((b) => `${b.gap.section} ${b.gap.barInSection}/${b.gap.sectionLength}`)).toEqual([
      'intro 1/2', 'intro 2/2', 'play 1/1', 'mute 1/3', 'mute 2/3', 'mute 3/3', 'play 1/1', 'mute 1/3', 'mute 2/3', 'mute 3/3',
    ])
  })

  it('one: muted bars keep only pulse 0', () => {
    const muted = run(gapCfg('one', { subdivision: 2 }), 5)[4]
    expect(muted.gap.section).toBe('mute')
    expect(muted.events).toEqual([{ at: 0, kind: 'main', level: 'accent', sound: 'click', gain: 1 }])
    expect(muted.visual.silent).toEqual([false, true, true, true, true, true, true, true])
  })

  it('offbeat with quarter notes clicks halfway through every beat at normal level (never fully silent)', () => {
    const c = gapCfg('offbeat', { sounds: { accent: 'hat', normal: 'rim', soft: 'wood' } })
    const bars = run(c, 6)
    for (const muted of [bars[4], bars[5]]) {
      expect(muted.gap.section).toBe('mute')
      expect(muted.events).toEqual([0.25, 0.75, 1.25, 1.75].map((at) => ({ at, kind: 'main', level: 'normal', sound: 'rim', gain: 0.75 })))
      expect(muted.visual.silent).toEqual([true, true, true, true])
    }
  })

  it('offbeat is time-based: with triplets the click is halfway through the beat, not on the triplet grid', () => {
    const muted = run(gapCfg('offbeat', { bpm: 60, subdivision: 3 }), 5)[4]
    expectCloseList(muted.events.map((e) => e.at), [0.5, 1.5, 2.5, 3.5])
  })

  it('offbeat clicks ignore volume.subdivision: they are the only sound of a muted bar', () => {
    const c = gapCfg('offbeat', { subdivision: 2, volume: { subdivision: 0 } })
    const bars = run(c, 5)
    // sounding bar: the grid's in-between pulses vanish at subdivision volume 0
    expect(mains(bars[1]).map((e) => [e.at, e.gain])).toEqual([[0, 1], [0.5, 0.75], [1, 0.75], [1.5, 0.75]])
    // muted bar: the gap's offbeat clicks keep the normal gain
    expect(mains(bars[4]).map((e) => [e.at, e.gain])).toEqual([[0.25, 0.75], [0.75, 0.75], [1.25, 0.75], [1.75, 0.75]])
  })

  it('offbeat follows eighth-note swing: the click lands on the swung "and"', () => {
    const muted = run(gapCfg('offbeat', { bpm: 60, subdivision: 2, swing: 75 }), 5)[4]
    expect(muted.events.map((e) => e.at)).toEqual([0.75, 1.75, 2.75, 3.75])
  })

  it('poly plays in sounding bars and is silent in muted bars, in every mode', () => {
    for (const mode of ['full', 'one', 'offbeat']) {
      const bars = run(gapCfg(mode, { poly: { enabled: true, n: 3 } }), 5)
      expect(polys(bars[1])).toHaveLength(3)
      expect(polys(bars[3])).toHaveLength(3)
      expect(polys(bars[4])).toEqual([])
    }
  })

  it('muted bars keep the trainer clock running', () => {
    const c = gapCfg('full', { trainer: { enabled: true, targetBpm: 200, rampSeconds: 600 } })
    const bars = run(c, 5)
    expect(bars[4].gap.section).toBe('mute')
    expect(bars[4].nextState.trainerElapsed).toBeGreaterThan(bars[3].nextState.trainerElapsed)
  })

  it('gapBar stays 0 while the gap is off, so switching it on starts with the intro', () => {
    const off = config({ bpm: 120 })
    const state = run(off, 5).at(-1).nextState
    expect(state.gapBar).toBe(0)
    const on = config({ bpm: 120, gap: { enabled: true, introBars: 1, playBars: 2, muteBars: 2, mode: 'full' } })
    expect(planBar(on, state).gap).toEqual({ section: 'intro', barInSection: 1, sectionLength: 1 })
  })
})

describe('planBar: random mute', () => {
  const rmCfg = (patch = {}) =>
    config({ bpm: 120, subdivision: 2, randomMute: { enabled: true, percent: 25, protectOne: true }, ...patch })

  it('rng 0 mutes every beat except beat 1 when protectOne, all pulses of each muted beat; poly is not affected', () => {
    const c = rmCfg({ poly: { enabled: true, n: 3 } })
    const bar = planBar(c, initialPlayState(c), () => 0)
    expect(mains(bar)).toEqual([
      { at: 0, kind: 'main', level: 'accent', sound: 'click', gain: 1 },
      { at: 0.25, kind: 'main', level: 'soft', sound: 'click', gain: 0.24 },
    ])
    expect(bar.visual.silent).toEqual([false, false, true, true, true, true, true, true])
    expectCloseList(polys(bar).map((e) => e.at), [0, 2 / 3, 4 / 3])
  })

  it('without protectOne beat 1 can be muted too', () => {
    const c = rmCfg({ randomMute: { enabled: true, percent: 25, protectOne: false } })
    const bar = planBar(c, initialPlayState(c), () => 0)
    expect(bar.events).toEqual([])
    expect(bar.visual.silent.every(Boolean)).toBe(true)
  })

  it('mutes a beat when rng() < percent / 100', () => {
    const c = rmCfg()
    expect(mains(planBar(c, initialPlayState(c), () => 0.2499))).toHaveLength(2)
    expect(mains(planBar(c, initialPlayState(c), () => 0.25))).toHaveLength(8)
  })

  it('draws rng() once per beat, in beat order; a protected beat 1 ignores its draw', () => {
    const c = rmCfg()
    const draws = [0, 0.24, 0.25, 0.1] // beat 1 (protected), beat 2 muted, beat 3 sounds, beat 4 muted
    const rng = vi.fn(() => draws[rng.mock.calls.length - 1])
    const bar = planBar(c, initialPlayState(c), rng)
    expect(rng).toHaveBeenCalledTimes(4)
    expect(bar.visual.silent).toEqual([false, false, true, true, false, false, true, true])
  })

  it('never silences the offbeat clicks of a muted gap bar', () => {
    const c = rmCfg({
      subdivision: 1,
      randomMute: { enabled: true, percent: 100, protectOne: false },
      gap: { enabled: true, introBars: 0, playBars: 1, muteBars: 1, mode: 'offbeat' },
    })
    const rng = vi.fn(() => 0)
    const [sounding, muted] = run(c, 2, { rng })
    expect(sounding.events).toEqual([])
    expect(muted.events.map((e) => e.at)).toEqual([0.25, 0.75, 1.25, 1.75])
    expect(rng).toHaveBeenCalledTimes(8) // one draw per beat in every played bar, muted ones included
  })

  it('uses only the injected rng, and only when random mute is on', () => {
    const rng = vi.fn(() => 0.5)
    const mathRandom = vi.spyOn(Math, 'random')
    const plain = config({ subdivision: 4, poly: { enabled: true } })
    planBar(plain, initialPlayState(plain), rng)
    expect(rng).not.toHaveBeenCalled()
    const muted = rmCfg()
    planBar(muted, initialPlayState(muted), rng)
    expect(rng).toHaveBeenCalled()
    expect(mathRandom).not.toHaveBeenCalled()
    mathRandom.mockRestore()
  })
})

describe('planBar: poly', () => {
  it('3 over 4/4 at 100 BPM hits at exactly 0, 0.8 and 1.6 s', () => {
    const c = config({ bpm: 100, poly: { enabled: true, n: 3, sound: 'wood', volume: 0.7 } })
    const bar = planBar(c, initialPlayState(c))
    const hits = polys(bar)
    expect(hits.map((e) => [e.kind, e.level, e.sound, e.gain])).toEqual([
      ['poly', 'normal', 'wood', 0.7],
      ['poly', 'normal', 'wood', 0.7],
      ['poly', 'normal', 'wood', 0.7],
    ])
    expectCloseList(hits.map((e) => e.at), [0, 0.8, 1.6], 12)
    expect(bar.duration).toBeCloseTo(2.4, 12)
  })

  it('7 at 20 BPM: seven evenly spaced hits, all inside the bar', () => {
    const c = config({ bpm: 20, poly: { enabled: true, n: 7 } })
    const bar = planBar(c, initialPlayState(c))
    const at = polys(bar).map((e) => e.at)
    expect(bar.duration).toBe(12)
    expectCloseList(at, [0, 1, 2, 3, 4, 5, 6].map((k) => (12 * k) / 7), 12)
    expect(Math.max(...at)).toBeLessThan(bar.duration)
  })

  it("spreads over the bar's actual duration when the trainer ramps inside the bar", () => {
    // 60 -> 120 over 2 s: beats at 60, 90, 110, 120 BPM -> 1 + 2/3 + 6/11 + 1/2 = 179/66 s
    const c = config({ bpm: 60, poly: { enabled: true, n: 2 }, trainer: { enabled: true, type: 'ramp', targetBpm: 120, rampSeconds: 2 } })
    const bar = planBar(c, initialPlayState(c))
    expect(bar.duration).toBeCloseTo(179 / 66, 12)
    expectCloseList(polys(bar).map((e) => e.at), [0, 179 / 132], 12)
  })
})

describe('planBar: trainer ramp', () => {
  const ramp = (patch = {}, bpm = 100) =>
    config({ bpm, trainer: { enabled: true, type: 'ramp', targetBpm: 140, rampSeconds: 60, onReach: 'hold', ...patch } })

  it('recomputes the BPM at each beat start, linear in played seconds', () => {
    const c = config({ bpm: 60, subdivision: 2, trainer: { enabled: true, type: 'ramp', targetBpm: 120, rampSeconds: 2 } })
    const bar = planBar(c, initialPlayState(c))
    // beats at e = 0, 1, 5/3, 73/33 s -> 60, 90, 110, 120 BPM; both pulses of a beat share its BPM
    expectCloseList(bar.visual.bpm, [60, 60, 90, 90, 110, 110, 120, 120])
    expectCloseList(bar.visual.pulseAt, [0, 0.5, 1, 1 + 1 / 3, 5 / 3, 5 / 3 + 3 / 11, 73 / 33, 73 / 33 + 0.25])
    expect(bar.nextState.trainerElapsed).toBeCloseTo(179 / 66, 12)
    expect(bar.nextState.trainerBpm).toBe(120)
  })

  it('100 -> 140 over 60 s: every beat follows the line, then the target holds', () => {
    const c = ramp()
    let state = initialPlayState(c)
    let guard = 0
    while (state.trainerElapsed < 60) {
      const bar = planBar(c, state)
      bar.visual.bpm.forEach((bpm, j) => {
        const e = state.trainerElapsed + bar.visual.pulseAt[j]
        expect(bpm).toBeCloseTo(100 + (40 * Math.min(e, 60)) / 60, 9)
      })
      expect(bar.nextState.trainerBpm).toBeCloseTo(100 + (40 * Math.min(bar.nextState.trainerElapsed, 60)) / 60, 9)
      state = bar.nextState
      expect(++guard).toBeLessThan(100)
    }
    expect(state.trainerBpm).toBe(140)
    for (const bar of run(c, 5, { state })) {
      expect(bar.visual.bpm).toEqual([140, 140, 140, 140])
      expect(bar.duration).toBeCloseTo(240 / 140, 12)
      expect(bar.nextState.trainerBpm).toBe(140)
      expect(bar.nextState.reached).toBe(true)
      expect(bar.stop).toBe(false)
    }
  })

  it('slows down too: 140 -> 100 never undershoots and ends exactly at 100', () => {
    const c = ramp({ targetBpm: 100, rampSeconds: 30 }, 140)
    const all = run(c, 30).flatMap((b) => b.visual.bpm)
    expect(all[0]).toBe(140)
    all.forEach((bpm, i) => {
      expect(bpm).toBeGreaterThanOrEqual(100)
      if (i > 0) expect(bpm).toBeLessThanOrEqual(all[i - 1])
    })
    expect(all.at(-1)).toBe(100)
  })

  it('does not advance during the count-in', () => {
    const c = { ...ramp(), countInBars: 1 }
    const [countIn, first] = run(c, 2)
    expect(countIn.nextState.trainerElapsed).toBe(0)
    expect(countIn.nextState.trainerBpm).toBe(100)
    expect(first.visual.bpm[0]).toBe(100)
  })

  it('restart: once the target has sounded the next bar starts again from config.bpm with elapsed 0', () => {
    const c = config({ bpm: 60, trainer: { enabled: true, type: 'ramp', targetBpm: 120, rampSeconds: 2, onReach: 'restart' } })
    const [first, second] = run(c, 2)
    expectCloseList(first.visual.bpm, [60, 90, 110, 120])
    expect(first.nextState).toMatchObject({ trainerElapsed: 0, trainerBpm: 60, reached: false })
    expectCloseList(second.visual.bpm, [60, 90, 110, 120])
  })

  it('stop: the bar after the target has sounded returns stop with no events, and stays stopped', () => {
    const c = config({ bpm: 60, trainer: { enabled: true, type: 'ramp', targetBpm: 120, rampSeconds: 2, onReach: 'stop' } })
    const first = planBar(c, initialPlayState(c))
    expect(first.stop).toBe(false)
    expect(first.events.length).toBeGreaterThan(0)
    expect(first.nextState.reached).toBe(true)
    const second = planBar(c, first.nextState)
    expect(second.stop).toBe(true)
    expect(second.events).toEqual([])
    expect(Number.isFinite(second.duration) && second.duration > 0).toBe(true)
    expect(planBar(c, second.nextState).stop).toBe(true)
  })

  it('paused: plays the frozen trainerBpm and does not advance', () => {
    const c = ramp()
    const state = { ...initialPlayState(c), trainerBpm: 123, trainerElapsed: 25.5, trainerPaused: true }
    const bar = planBar(c, state)
    expect(bar.visual.bpm).toEqual([123, 123, 123, 123])
    expect(bar.nextState).toMatchObject({ trainerBpm: 123, trainerElapsed: 25.5, trainerPaused: true, reached: false })
  })

  it('disabled: plays config.bpm and resets the trainer progress', () => {
    const c = config({ bpm: 90 })
    const bar = planBar(c, { ...initialPlayState(c), trainerBpm: 133, trainerElapsed: 40, reached: true })
    expect(bar.visual.bpm).toEqual([90, 90, 90, 90])
    expect(bar.nextState).toMatchObject({ trainerBpm: 90, trainerElapsed: 0, reached: false })
  })
})

describe('planBar: trainer steps', () => {
  const steps = (patch = {}, bpm = 100) =>
    config({ bpm, countInBars: 1, trainer: { enabled: true, type: 'steps', targetBpm: 104, stepBars: 4, stepBpm: 2, onReach: 'hold', ...patch } })
  const barBpm = (bar) => bar.visual.bpm[0]

  it('+2 every 4 bars capped at 104: 100 x4, 102 x4, then 104, never 106', () => {
    const bars = run(steps(), 21)
    expect(bars[0].phase).toBe('countin')
    const played = bars.slice(1)
    expect(played.map(barBpm)).toEqual([100, 100, 100, 100, 102, 102, 102, 102, ...Array(12).fill(104)])
    played.forEach((b) => {
      expect(new Set(b.visual.bpm).size).toBe(1)
      expect(b.duration).toBeCloseTo(240 / barBpm(b), 12)
    })
    // reached flips as soon as the target sounds
    expect(played[7].nextState.reached).toBe(false)
    expect(played[8].nextState.reached).toBe(true)
  })

  it('never passes a target that is not a whole number of steps away', () => {
    const played = run(steps({ targetBpm: 105 }), 17).slice(1)
    expect(played.map(barBpm)).toEqual([100, 100, 100, 100, 102, 102, 102, 102, 104, 104, 104, 104, 105, 105, 105, 105])
  })

  it('steps down toward a lower target', () => {
    const played = run(steps({ targetBpm: 110, stepBpm: 5, stepBars: 2 }, 120), 8).slice(1)
    expect(played.map(barBpm)).toEqual([120, 120, 115, 115, 110, 110, 110])
  })

  it('stop: the full final step plays at the target (104 x4), then the next bar returns stop', () => {
    const bars = run(steps({ onReach: 'stop' }), 15)
    const played = bars.slice(1, 13)
    expect(played.map(barBpm)).toEqual([100, 100, 100, 100, 102, 102, 102, 102, 104, 104, 104, 104])
    played.forEach((b) => {
      expect(b.stop).toBe(false)
      expect(mains(b).length).toBeGreaterThan(0)
    })
    expect(bars[9].nextState.reached).toBe(true) // the target has sounded…
    expect(bars[13].stop).toBe(true) // …but stop waits for the end of its step
    expect(bars[13].events).toEqual([])
    expect(bars[14].stop).toBe(true)
  })

  it('stop: a capped final step also plays in full', () => {
    const bars = run(steps({ targetBpm: 105, onReach: 'stop' }), 18)
    expect(bars.slice(1, 17).map(barBpm)).toEqual([100, 100, 100, 100, 102, 102, 102, 102, 104, 104, 104, 104, 105, 105, 105, 105])
    expect(bars[16].stop).toBe(false)
    expect(bars[17].stop).toBe(true)
  })

  it('restart: after the full step at the target the stairs start over from config.bpm', () => {
    const played = run(steps({ onReach: 'restart' }), 21).slice(1)
    expect(played.map(barBpm)).toEqual([
      100, 100, 100, 100, 102, 102, 102, 102, 104, 104, 104, 104, 100, 100, 100, 100, 102, 102, 102, 102,
    ])
    expect(played[11].nextState).toMatchObject({ trainerBpm: 100, trainerElapsed: 0, reached: false })
  })

  it('paused: the stair counter does not move; resuming continues where it was', () => {
    const c = steps()
    const state = { ...initialPlayState(c), countInLeft: 0, trainerBpm: 102, trainerElapsed: 7, trainerPaused: true }
    const paused = planBar(c, state)
    expect(barBpm(paused)).toBe(102)
    expect(paused.nextState).toMatchObject({ trainerBpm: 102, trainerElapsed: 7 })
    const [last, next] = run(c, 2, { state: { ...paused.nextState, trainerPaused: false } })
    expect(barBpm(last)).toBe(102)
    expect(barBpm(next)).toBe(104)
  })
})

describe('planBar: extreme tempos', () => {
  it('extreme tempos', () => {
    // 300 BPM sextuplets: 24 pulses of 1/30 s
    const fast = config({ bpm: 300, subdivision: 6, poly: { enabled: true, n: 7 } })
    const fastBar = planBar(fast, initialPlayState(fast))
    expect(fastBar.visual.pulseAt).toHaveLength(24)
    expect(fastBar.duration).toBeCloseTo(0.8, 12)
    const onsets = [...fastBar.visual.pulseAt, fastBar.duration]
    for (let i = 1; i < onsets.length; i++) {
      const gap = onsets[i] - onsets[i - 1]
      expect(Number.isFinite(gap)).toBe(true)
      expect(gap).toBeCloseTo(1 / 30, 12)
    }
    expect(new Set(polys(fastBar).map((e) => e.at)).size).toBe(7)

    // 20 BPM quarters with poly 7: 3 s per beat, 7 distinct hits inside the 12 s bar
    const slow = config({ bpm: 20, poly: { enabled: true, n: 7 } })
    const slowBars = run(slow, 3)
    for (const bar of slowBars) {
      expect(bar.visual.pulseAt).toEqual([0, 3, 6, 9])
      expect(bar.duration).toBe(12)
      const hits = polys(bar).map((e) => e.at)
      expect(new Set(hits).size).toBe(7)
      hits.forEach((t) => expect(t >= 0 && t < bar.duration).toBe(true))
    }
  })
})

describe('planBar: invariants', () => {
  const sweep = () => [
    config({
      bpm: 90, countInBars: 1, subdivision: 4, swing: 66,
      poly: { enabled: true, n: 5 },
      gap: { enabled: true, introBars: 0, playBars: 1, muteBars: 1, mode: 'offbeat' },
      randomMute: { enabled: true, percent: 40, protectOne: true },
      trainer: { enabled: true, type: 'ramp', targetBpm: 180, rampSeconds: 20 },
    }),
    config({
      bpm: 60, countInBars: 2, meter: { num: 7, den: 8 }, subdivision: 3,
      poly: { enabled: true, n: 7 },
      gap: { enabled: true, introBars: 2, playBars: 3, muteBars: 1, mode: 'one' },
      trainer: { enabled: true, type: 'steps', targetBpm: 90, stepBars: 2, stepBpm: 5, onReach: 'restart' },
    }),
    config({
      bpm: 70, meter: { num: 12, den: 8 }, feel: 'compound', subdivision: 6,
      poly: { enabled: true, n: 4 },
      gap: { enabled: true, mode: 'full' },
      randomMute: { enabled: true, percent: 100, protectOne: true },
      trainer: { enabled: true, type: 'ramp', targetBpm: 75, rampSeconds: 10, onReach: 'stop' },
    }),
    config({
      bpm: 300, subdivision: 6, poly: { enabled: true, n: 7 },
      trainer: { enabled: true, type: 'ramp', targetBpm: 200, rampSeconds: 5 },
    }),
    config({
      bpm: 20, meter: { num: 2, den: 2 }, subdivision: 5, poly: { enabled: true, n: 7 },
      gap: { enabled: true, introBars: 0, playBars: 1, muteBars: 2, mode: 'offbeat' },
    }),
    config({
      bpm: 132, meter: { num: 6, den: 8 }, feel: 'simple', subdivision: 2, swing: 75,
      gap: { enabled: true, introBars: 1, playBars: 1, muteBars: 1, mode: 'offbeat' },
      randomMute: { enabled: true, percent: 50, protectOne: false },
    }),
  ]

  it('events are sorted, finite and inside [0, duration); visual arrays line up', () => {
    sweep().forEach((c, n) => {
      for (const bar of run(c, 40, { rng: lcg(n + 1) })) {
        expect(Number.isFinite(bar.duration) && bar.duration > 0).toBe(true)
        bar.events.forEach((e, i) => {
          expect(Number.isFinite(e.at) && e.at >= 0 && e.at < bar.duration).toBe(true)
          if (i > 0) expect(e.at).toBeGreaterThanOrEqual(bar.events[i - 1].at)
          expect(['main', 'poly', 'countin']).toContain(e.kind)
          expect(['accent', 'normal', 'soft']).toContain(e.level)
          expect(e.gain > 0 && e.gain <= 1).toBe(true)
          expect(typeof e.sound === 'string' && e.sound.length > 0).toBe(true)
        })
        for (const kind of ['main', 'poly', 'countin']) {
          const at = bar.events.filter((e) => e.kind === kind).map((e) => e.at)
          expect(new Set(at).size).toBe(at.length)
        }
        const { pulseAt, silent, bpm } = bar.visual
        expect(silent).toHaveLength(pulseAt.length)
        expect(bpm).toHaveLength(pulseAt.length)
        pulseAt.forEach((t, i) => {
          expect(t).toBeLessThan(bar.duration)
          if (i > 0) expect(t).toBeGreaterThan(pulseAt[i - 1])
        })
        bpm.forEach((b) => expect(b >= 20 && b <= 400).toBe(true))
      }
    })
  })
})
