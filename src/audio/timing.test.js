import { describe, it, expect } from 'vitest'
import { beatStructure, defaultGrid, pulseDurations } from './timing.js'

const meter = (num, den) => ({ num, den })
const total = (a) => a.reduce((s, x) => s + x, 0)
const levels = (grid) => grid.map((c) => c.level)

describe('beatStructure', () => {
  it('4/4 counts four quarter beats; subdivision is pulses per beat', () => {
    expect(beatStructure(meter(4, 4), 'simple', 1)).toEqual({ beatsPerBar: 4, pulsesPerBeat: 1, beatUnit: 'quarter' })
    expect(beatStructure(meter(4, 4), 'simple', 4)).toEqual({ beatsPerBar: 4, pulsesPerBeat: 4, beatUnit: 'quarter' })
  })

  it('6/8 compound counts two dotted-quarter beats', () => {
    expect(beatStructure(meter(6, 8), 'compound', 3)).toEqual({ beatsPerBar: 2, pulsesPerBeat: 3, beatUnit: 'dotted-quarter' })
  })

  it('9/8 and 12/8 compound count three and four beats', () => {
    expect(beatStructure(meter(9, 8), 'compound', 1).beatsPerBar).toBe(3)
    expect(beatStructure(meter(12, 8), 'compound', 1).beatsPerBar).toBe(4)
  })

  it('5/8 is simple and counts eighths, even when compound feel is asked', () => {
    expect(beatStructure(meter(5, 8), 'compound', 1)).toEqual({ beatsPerBar: 5, pulsesPerBeat: 1, beatUnit: 'eighth' })
    expect(beatStructure(meter(5, 8), 'simple', 1)).toEqual({ beatsPerBar: 5, pulsesPerBeat: 1, beatUnit: 'eighth' })
  })

  it('compound needs den 8 and num >= 6: 3/8 and 6/4 stay simple', () => {
    expect(beatStructure(meter(3, 8), 'compound', 1)).toEqual({ beatsPerBar: 3, pulsesPerBeat: 1, beatUnit: 'eighth' })
    expect(beatStructure(meter(6, 4), 'compound', 1)).toEqual({ beatsPerBar: 6, pulsesPerBeat: 1, beatUnit: 'quarter' })
  })

  it('6/8 with simple feel ("contar en corcheas") counts six eighth beats', () => {
    expect(beatStructure(meter(6, 8), 'simple', 1)).toEqual({ beatsPerBar: 6, pulsesPerBeat: 1, beatUnit: 'eighth' })
  })

  it('compound pulses per beat snap to 1, 3 or 6', () => {
    const ppb = (sub) => beatStructure(meter(6, 8), 'compound', sub).pulsesPerBeat
    expect([1, 2, 3, 4, 5, 6].map(ppb)).toEqual([1, 3, 3, 6, 6, 6])
  })

  it('simple beat unit follows the denominator', () => {
    const unit = (den) => beatStructure(meter(3, den), 'simple', 1).beatUnit
    expect([2, 4, 8, 16].map(unit)).toEqual(['half', 'quarter', 'eighth', 'sixteenth'])
  })

  it('malformed input falls back to safe values', () => {
    expect(beatStructure(undefined, undefined, undefined)).toEqual({ beatsPerBar: 4, pulsesPerBeat: 1, beatUnit: 'quarter' })
    expect(beatStructure(meter(0, 7), 'simple', NaN)).toEqual({ beatsPerBar: 1, pulsesPerBeat: 1, beatUnit: 'quarter' })
    expect(beatStructure(meter(40, 4), 'simple', 99)).toEqual({ beatsPerBar: 16, pulsesPerBeat: 6, beatUnit: 'quarter' })
  })
})

describe('pulseDurations', () => {
  const quarters = () => beatStructure(meter(4, 4), 'simple', 1)
  const eighths = () => beatStructure(meter(4, 4), 'simple', 2)

  it('4/4 sub 1 at 120 -> four pulses of 0.5 s', () => {
    expect(pulseDurations(120, quarters(), 50)).toEqual([0.5, 0.5, 0.5, 0.5])
  })

  it('6/8 compound sub 3 at 60 -> six pulses of 1/3 s in two beats', () => {
    const s = beatStructure(meter(6, 8), 'compound', 3)
    expect(s.beatsPerBar).toBe(2)
    const d = pulseDurations(60, s, 50)
    expect(d).toHaveLength(6)
    d.forEach((x) => expect(x).toBeCloseTo(1 / 3, 12))
  })

  it('swing 75 with eighths at 60 alternates 0.75 / 0.25 and the bar lasts 4 s', () => {
    const d = pulseDurations(60, eighths(), 75)
    expect(d).toEqual([0.75, 0.25, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25])
    expect(total(d)).toBe(4)
  })

  it('swing with sixteenths swings each pair inside the beat', () => {
    // p = 0.25 s at 60 BPM; swing 60 -> pairs of 2p*0.6 = 0.3 and 2p*0.4 = 0.2
    const d = pulseDurations(60, beatStructure(meter(2, 4), 'simple', 4), 60)
    expect(d).toHaveLength(8)
    d.forEach((x, i) => expect(x).toBeCloseTo(i % 2 === 0 ? 0.3 : 0.2, 12))
  })

  it('swing is ignored for quarters, triplets and sextuplets', () => {
    expect(pulseDurations(60, quarters(), 75)).toEqual([1, 1, 1, 1])
    const triplets = pulseDurations(60, beatStructure(meter(4, 4), 'simple', 3), 75)
    expect(triplets).toHaveLength(12)
    triplets.forEach((x) => expect(x).toBeCloseTo(1 / 3, 12))
    const sextuplets = pulseDurations(60, beatStructure(meter(4, 4), 'simple', 6), 75)
    expect(sextuplets).toHaveLength(24)
    sextuplets.forEach((x) => expect(x).toBeCloseTo(1 / 6, 12))
  })

  it('swing outside 50-75 is clamped', () => {
    expect(pulseDurations(60, eighths(), 90)).toEqual([0.75, 0.25, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25])
    expect(pulseDurations(60, eighths(), 30)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
    expect(pulseDurations(60, eighths(), undefined)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
  })

  it('extreme tempos: 300 BPM sextuplets stay finite and positive, 20 BPM quarters last 3 s', () => {
    const d = pulseDurations(300, beatStructure(meter(4, 4), 'simple', 6), 50)
    expect(d).toHaveLength(24)
    d.forEach((x) => {
      expect(Number.isFinite(x)).toBe(true)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeCloseTo(1 / 30, 12)
    })
    expect(pulseDurations(20, quarters(), 50)).toEqual([3, 3, 3, 3])
  })

  it('BPM outside 20-400 or not a number never yields zero, infinite or NaN durations', () => {
    expect(pulseDurations(0, quarters(), 50)).toEqual([3, 3, 3, 3])
    expect(pulseDurations(1000, quarters(), 50)).toEqual([0.15, 0.15, 0.15, 0.15])
    expect(pulseDurations(NaN, quarters(), 50)).toEqual([0.6, 0.6, 0.6, 0.6])
  })
})

describe('defaultGrid', () => {
  it('6/8 compound in eighths: accent on 1, normal on 4, the rest soft, no sound override', () => {
    const g = defaultGrid(meter(6, 8), 'compound', 3)
    expect(levels(g)).toEqual(['accent', 'soft', 'soft', 'normal', 'soft', 'soft'])
    expect(g.every((c) => c.sound === null)).toBe(true)
  })

  it('4/4 eighths: beats normal, offbeats soft', () => {
    expect(levels(defaultGrid(meter(4, 4), 'simple', 2))).toEqual(['accent', 'soft', 'normal', 'soft', 'normal', 'soft', 'normal', 'soft'])
  })

  it('12/8 compound in dotted quarters: accent then three normal beats', () => {
    expect(levels(defaultGrid(meter(12, 8), 'compound', 1))).toEqual(['accent', 'normal', 'normal', 'normal'])
  })

  it('returns fresh cells on every call', () => {
    const a = defaultGrid(meter(4, 4), 'simple', 1)
    a[0].level = 'mute'
    expect(defaultGrid(meter(4, 4), 'simple', 1)[0].level).toBe('accent')
  })
})
