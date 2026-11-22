import { describe, it, expect } from 'vitest'
import { newLog, newRoutine } from './schema.js'
import { addDays, weekdayIndex } from '../dates.js'
import {
  routineForDay, minutesByDay, weekSummary, streak, heatmap, exerciseHistory, totals,
} from './selectors.js'

const TODAY = '2026-11-21' // Saturday
const mk = (arr) => Object.fromEntries(arr.map((e) => [e.id, e]))
const stateOf = ({ logs = [], routines = [] } = {}) => ({
  exercise: {}, fill: {}, song: {}, preset: {}, prefs: {},
  routine: mk(routines), log: mk(logs),
})
const logOn = (date, min, extra = {}) =>
  newLog({ date, activeSec: Math.round(min * 60), startedAt: new Date(`${date}T20:30:00`).getTime(), ...extra })

describe('routineForDay', () => {
  it('finds a routine by weekday and ignores deleted ones', () => {
    const del = newRoutine({ days: [5], deletedAt: 1 })
    const ok = newRoutine({ days: [5] })
    expect(routineForDay(stateOf({ routines: [del, ok] }), TODAY).id).toBe(ok.id)
    expect(routineForDay(stateOf({ routines: [del] }), TODAY)).toBeNull()
    expect(routineForDay(stateOf({ routines: [ok] }), '2026-11-20')).toBeNull()
  })
})

describe('minutesByDay', () => {
  it('sums per day, rounds to 1 decimal, ignores deleted logs', () => {
    const s = stateOf({ logs: [
      logOn(TODAY, 10), logOn(TODAY, 5.04), logOn(TODAY, 7, { deletedAt: 5 }),
    ] })
    expect(minutesByDay(s, [TODAY, '2026-11-20'])).toEqual([15, 0])
  })
})

describe('weekSummary', () => {
  it('marks planned days and totals the week', () => {
    const r = newRoutine({ days: [0, 5] })
    const s = stateOf({ routines: [r], logs: [logOn('2026-11-16', 20), logOn(TODAY, 3), logOn('2026-11-10', 99)] })
    const w = weekSummary(s, TODAY, 150)
    expect(w.days).toHaveLength(7)
    expect(w.days[0].key).toBe('2026-11-16')
    expect(w.days.map((d) => d.planned)).toEqual([true, false, false, false, false, true, false])
    expect(w.totalMin).toBe(23)
    expect(w.goalMin).toBe(150)
    expect(w.practicedDays).toBe(2)
  })
})

describe('streak', () => {
  it('counts evening sessions on 5 local days', () => {
    const logs = [0, 1, 2, 3, 4].map((i) => logOn(addDays(TODAY, -i), 10))
    expect(streak(stateOf({ logs }), TODAY, 5)).toEqual({ current: 5, best: 5 })
  })
  it('breaks on a day under threshold', () => {
    const logs = [logOn(TODAY, 10), logOn(addDays(TODAY, -1), 3), logOn(addDays(TODAY, -2), 10)]
    expect(streak(stateOf({ logs }), TODAY, 5)).toEqual({ current: 1, best: 1 })
  })
  it('empty today does not break the streak', () => {
    const logs = [1, 2, 3].map((i) => logOn(addDays(TODAY, -i), 10))
    expect(streak(stateOf({ logs }), TODAY, 5).current).toBe(3)
  })
  it('empty today and yesterday gives 0; best is longest run in history', () => {
    const logs = [10, 11, 12, 13].map((i) => logOn(addDays(TODAY, -i), 10))
    expect(streak(stateOf({ logs }), TODAY, 5)).toEqual({ current: 0, best: 4 })
  })
  it('sums multiple logs in one day against threshold', () => {
    const logs = [logOn(TODAY, 3), logOn(TODAY, 3)]
    expect(streak(stateOf({ logs }), TODAY, 5).current).toBe(1)
  })
})

describe('streak guards', () => {
  it('threshold 0 terminates and counts only days with practice', () => {
    const logs = [logOn(TODAY, 1), logOn(addDays(TODAY, -1), 1)]
    expect(streak(stateOf({ logs }), TODAY, 0)).toEqual({ current: 2, best: 2 })
    expect(streak(stateOf(), TODAY, 0)).toEqual({ current: 0, best: 0 })
    expect(streak(stateOf(), TODAY, undefined)).toEqual({ current: 0, best: 0 })
  })
  it('4.96 min counts against threshold 5 (matches displayed rounding)', () => {
    expect(streak(stateOf({ logs: [logOn(TODAY, 4.96)] }), TODAY, 5).current).toBe(1)
  })
})

describe('heatmap', () => {
  it('is 84 Monday-aligned entries, today filled, future null', () => {
    const h = heatmap(stateOf({ logs: [logOn(TODAY, 12)] }), TODAY)
    expect(h).toHaveLength(84)
    expect(weekdayIndex(h[0].key)).toBe(0)
    expect(h[0].key).toBe('2026-08-31')
    const t = h.find((e) => e.key === TODAY)
    expect(t.minutes).toBe(12)
    expect(h[h.length - 1].key).toBe('2026-11-22')
    expect(h[h.length - 1].minutes).toBeNull()
    expect(h[h.length - 2].minutes).toBe(12)
  })
})

describe('exerciseHistory', () => {
  it('returns done/partial items for the exercise, oldest first', () => {
    const item = (st, extra) => ({ type: 'exercise', refId: 'e1', name: 'x', status: st, seconds: 60, startBpm: 60, endBpm: 70, rating: 3, ...extra })
    const a = logOn('2026-11-20', 10, { items: [item('done', { endBpm: 80 }), item('skipped'), { ...item('done'), refId: 'e2' }] })
    const b = logOn('2026-11-18', 10, { items: [item('partial', { endBpm: 75 })] })
    const c = logOn('2026-11-19', 10, { deletedAt: 1, items: [item('done')] })
    const h = exerciseHistory(stateOf({ logs: [a, b, c] }), 'e1')
    expect(h).toEqual([
      { date: '2026-11-18', startBpm: 60, endBpm: 75, rating: 3, seconds: 60 },
      { date: '2026-11-20', startBpm: 60, endBpm: 80, rating: 3, seconds: 60 },
    ])
  })
})

describe('totals', () => {
  it('ignores sub-minute and deleted logs', () => {
    const s = stateOf({ logs: [logOn(TODAY, 30), logOn('2026-11-20', 15), logOn('2026-11-19', 0), logOn('2026-11-18', 60, { deletedAt: 1 })] })
    expect(totals(s)).toEqual({ hours: 0.8, sessions: 2, avgMin: 23 })
  })
  it('handles empty', () => {
    expect(totals(stateOf())).toEqual({ hours: 0, sessions: 0, avgMin: 0 })
  })
})
