import { describe, it, expect } from 'vitest'
import { suggestNextBpm, bestCleanBpm } from './progression.js'

const T = '2026-11-21'

describe('suggestNextBpm fixed', () => {
  it('clean 100 -> 103', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 100, rating: 'clean', lastPracticedDay: '2026-11-20', todayKey: T })
    expect(r).toEqual({ mode: 'fixed', bpm: 103, reason: 'Limpio: +3 BPM' })
  })
  it('clean 30 -> 31 (at least +1)', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 30, rating: 'clean', lastPracticedDay: null, todayKey: T })
    expect(r.bpm).toBe(31)
    expect(r.reason).toBe('Limpio: +1 BPM')
  })
  it('hard 100 -> 93', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 100, rating: 'hard', lastPracticedDay: '2026-11-20', todayKey: T })
    expect(r).toEqual({ mode: 'fixed', bpm: 93, reason: 'Costó: −7 BPM' })
  })
  it('almost keeps bpm', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 100, rating: 'almost', lastPracticedDay: '2026-11-20', todayKey: T })
    expect(r).toEqual({ mode: 'fixed', bpm: 100, reason: 'Casi: mismo BPM' })
  })
  it('20 days idle + almost at 100 -> 95 with combined reason', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 100, rating: 'almost', lastPracticedDay: '2026-11-01', todayKey: T })
    expect(r.bpm).toBe(95)
    expect(r.reason).toBe('14+ días sin practicar: −5 % · Casi: mismo BPM')
  })
  it('exactly 14 days is not idle; 15 is', () => {
    const base = { mode: 'fixed', bpm: 100, rating: 'almost', todayKey: T }
    expect(suggestNextBpm({ ...base, lastPracticedDay: '2026-11-07' }).bpm).toBe(100)
    expect(suggestNextBpm({ ...base, lastPracticedDay: '2026-11-06' }).bpm).toBe(95)
  })
  it('idle + clean applies rating to penalized value', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 100, rating: 'clean', lastPracticedDay: '2026-10-01', todayKey: T })
    expect(r.bpm).toBe(98) // 95 -> round(97.85)=98
    expect(r.reason).toBe('14+ días sin practicar: −5 % · Limpio: −2 BPM')
  })
  it('clamps at 400 and 20', () => {
    expect(suggestNextBpm({ mode: 'fixed', bpm: 400, rating: 'clean', lastPracticedDay: null, todayKey: T }).bpm).toBe(400)
    expect(suggestNextBpm({ mode: 'fixed', bpm: 20, rating: 'hard', lastPracticedDay: null, todayKey: T }).bpm).toBe(20)
  })
  it('null rating, no idle -> Sin calificación', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 100, rating: null, lastPracticedDay: '2026-11-20', todayKey: T })
    expect(r).toEqual({ mode: 'fixed', bpm: 100, reason: 'Sin calificación: mismo BPM' })
  })
  it('unknown rating with idle -> idle reason only', () => {
    const r = suggestNextBpm({ mode: 'fixed', bpm: 100, rating: 'wat', lastPracticedDay: '2026-10-01', todayKey: T })
    expect(r.bpm).toBe(95)
    expect(r.reason).toBe('14+ días sin practicar: −5 %')
  })
})

describe('suggestNextBpm ramp/steps', () => {
  it('ramp 60->100 clean -> 63->103', () => {
    const r = suggestNextBpm({ mode: 'ramp', bpmStart: 60, bpmEnd: 100, rating: 'clean', lastPracticedDay: null, todayKey: T })
    expect(r).toEqual({ mode: 'ramp', bpmStart: 63, bpmEnd: 103, reason: 'Limpio: +3 BPM' })
    expect(r).not.toHaveProperty('bpm')
  })
  it('steps hard shifts both down', () => {
    const r = suggestNextBpm({ mode: 'steps', bpmStart: 60, bpmEnd: 100, rating: 'hard', lastPracticedDay: null, todayKey: T })
    expect(r).toMatchObject({ mode: 'steps', bpmStart: 53, bpmEnd: 93 })
  })
  it('clamps start', () => {
    const r = suggestNextBpm({ mode: 'ramp', bpmStart: 22, bpmEnd: 100, rating: 'hard', lastPracticedDay: null, todayKey: T })
    expect(r.bpmStart).toBe(20)
  })
})

describe('bestCleanBpm', () => {
  it('ignores non-clean', () => {
    expect(bestCleanBpm([
      { rating: 'clean', endBpm: 90 },
      { rating: 'hard', endBpm: 140 },
      { rating: 'clean', endBpm: 110 },
      { rating: 'almost', endBpm: 120 },
    ])).toBe(110)
  })
  it('null when none', () => {
    expect(bestCleanBpm([])).toBeNull()
    expect(bestCleanBpm([{ rating: 'hard', endBpm: 100 }])).toBeNull()
    expect(bestCleanBpm(undefined)).toBeNull()
  })
})
