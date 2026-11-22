// Pure selectors over the entity store state. All day math uses local day keys.
import { addDays, weekdayIndex, weekStart } from '../dates.js'

const alive = (map) => Object.values(map || {}).filter((e) => e && !e.deletedAt)
const round1 = (n) => Math.round(n * 10) / 10

export function routineForDay(state, key) {
  const idx = weekdayIndex(key)
  return alive(state.routine).find((r) => (r.days || []).includes(idx)) || null
}

function secByDay(state) {
  const map = new Map()
  for (const l of alive(state.log)) map.set(l.date, (map.get(l.date) || 0) + (l.activeSec || 0))
  return map
}

export function minutesByDay(state, dayKeys) {
  const sec = secByDay(state)
  return dayKeys.map((k) => round1((sec.get(k) || 0) / 60))
}

export function weekSummary(state, todayKey, goalMin) {
  const start = weekStart(todayKey)
  const keys = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const mins = minutesByDay(state, keys)
  const days = keys.map((key, i) => ({
    key,
    minutes: mins[i],
    planned: routineForDay(state, key) !== null,
  }))
  return {
    days,
    totalMin: round1(mins.reduce((a, b) => a + b, 0)),
    goalMin,
    practicedDays: mins.filter((m) => m > 0).length,
  }
}

export function streak(state, todayKey, thresholdMin) {
  const sec = secByDay(state)
  const ok = (k) => (sec.get(k) || 0) / 60 >= thresholdMin
  // Current: an unpracticed today does not break the run.
  let cursor = ok(todayKey) ? todayKey : addDays(todayKey, -1)
  let current = 0
  while (ok(cursor)) {
    current++
    cursor = addDays(cursor, -1)
  }
  // Best: longest run of consecutive qualifying days anywhere.
  const days = [...sec.keys()].filter(ok).sort()
  let best = 0
  let run = 0
  let prev = null
  for (const k of days) {
    run = prev !== null && addDays(prev, 1) === k ? run + 1 : 1
    if (run > best) best = run
    prev = k
  }
  return { current, best: Math.max(best, current) }
}

export function heatmap(state, todayKey, weeks = 12) {
  const start = addDays(weekStart(todayKey), -(weeks - 1) * 7)
  const keys = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const sec = secByDay(state)
  return keys.map((key) => ({
    key,
    minutes: key > todayKey ? null : round1((sec.get(key) || 0) / 60),
  }))
}

export function exerciseHistory(state, exerciseId) {
  const out = []
  for (const l of alive(state.log)) {
    for (const it of l.items || []) {
      if (it.type !== 'exercise' || it.refId !== exerciseId) continue
      if (it.status !== 'done' && it.status !== 'partial') continue
      out.push({
        date: l.date,
        startBpm: it.startBpm,
        endBpm: it.endBpm,
        rating: it.rating,
        seconds: it.seconds,
        _t: l.startedAt || 0,
      })
    }
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._t - b._t))
  return out.map(({ _t, ...rest }) => rest) // eslint-disable-line no-unused-vars
}

export function totals(state) {
  const logs = alive(state.log).filter((l) => (l.activeSec || 0) >= 60)
  const totalSec = logs.reduce((a, l) => a + l.activeSec, 0)
  return {
    hours: Math.round(totalSec / 360) / 10,
    sessions: logs.length,
    avgMin: logs.length ? Math.round(totalSec / 60 / logs.length) : 0,
  }
}

